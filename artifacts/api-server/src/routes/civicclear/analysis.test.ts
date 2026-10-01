import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnalyzeCivicReportResponse } from "../../../../../lib/api-zod/src/generated/api.ts";
import type {
  CivicReportAnalysis,
  CivicReportAnalysisInput,
} from "@workspace/api-zod";
import {
  alignEvidenceToSource,
  assertAnalysisWireShape,
  callAndValidateAnalysis,
  callAndValidateWithOneRepair,
  InvalidProviderAnalysisError,
  ProviderUnavailableError,
  sanitizeAnalysis,
} from "./analysis-core.ts";

const input: CivicReportAnalysisInput = {
  description:
    "The streetlight is out at 4th and Pine. It was working yesterday.",
  location: "4th and Pine",
  issueType: "Streetlight outage",
  urgency: "Routine",
  observedAt: "Today",
  requestedDepartment: "Public Works",
  danger: "No immediate danger",
};

function makeAnalysis(): CivicReportAnalysis {
  return {
    analysisVersion: 1,
    safetyConcern: {
      possibleHazard: false,
      recommendedUrgency: "None",
      evidence: [],
      explanation: "No possible hazardous-material concern was identified.",
    },
    assessments: [
      {
        field: "urgency",
        state: "consistent",
        evidence: ["Routine"],
        explanation: "The narrative does not describe an urgent threat.",
        question: "",
      },
      {
        field: "location",
        state: "consistent",
        evidence: ["4th and Pine"],
        explanation: "The narrative and location input identify the same place.",
        question: "",
      },
      {
        field: "date",
        state: "consistent",
        evidence: ["yesterday"],
        explanation: "The relative date is understandable with submission time context.",
        question: "",
      },
      {
        field: "issue",
        state: "consistent",
        evidence: ["streetlight is out"],
        explanation: "The narrative supports the selected issue type.",
        question: "",
      },
      {
        field: "department",
        state: "consistent",
        evidence: ["Public Works"],
        explanation: "The requested department is present.",
        question: "",
      },
      {
        field: "danger",
        state: "consistent",
        evidence: ["No immediate danger"],
        explanation: "No conflicting safety statement appears in the report.",
        question: "",
      },
    ],
    draft: {
      issue: "Streetlight outage",
      location: "4th and Pine",
      issueType: "Streetlight outage",
      urgency: "Routine",
      description: input.description,
      observedAt: "Today",
      department: "Public Works",
      danger: "No immediate danger",
    },
    missingInformation: [],
    routingBlocked: false,
  };
}

function makeAnalysisForReport(
  report: CivicReportAnalysisInput,
  safetyConcern: CivicReportAnalysis["safetyConcern"],
): CivicReportAnalysis {
  const analysis = makeAnalysis();
  analysis.safetyConcern = safetyConcern;
  analysis.assessments = analysis.assessments.map((assessment) => {
    const source = {
      urgency: report.urgency,
      location: report.location,
      date: report.observedAt,
      issue: report.description,
      department: report.requestedDepartment,
      danger: report.danger,
    }[assessment.field];
    return {
      ...assessment,
      evidence: source ? [source] : [],
    };
  });
  return analysis;
}

describe("CivicClear analysis validation and safety gates", () => {
  it("accepts the exact response schema and rejects malformed or extra fields", () => {
    assert.doesNotThrow(() => assertAnalysisWireShape(makeAnalysis()));
    assert.equal(AnalyzeCivicReportResponse.safeParse(makeAnalysis()).success, true);

    const malformed = {
      ...makeAnalysis(),
      providerMetadata: "must not escape the response contract",
    };
    assert.throws(
      () => assertAnalysisWireShape(malformed),
      InvalidProviderAnalysisError,
    );
    const missingRequiredField = {
      ...makeAnalysis(),
      draft: { ...makeAnalysis().draft, observedAt: undefined },
    };
    assert.equal(
      AnalyzeCivicReportResponse.safeParse(missingRequiredField).success,
      false,
    );
    const wrongCount = makeAnalysis();
    wrongCount.assessments.pop();
    assert.throws(
      () => assertAnalysisWireShape(wrongCount),
      InvalidProviderAnalysisError,
    );
  });

  it("holds routing and preserves conflicting issue narrative", () => {
    const analysis = makeAnalysis();
    analysis.routingBlocked = false;
    analysis.assessments[0] = {
      ...analysis.assessments[0]!,
      state: "uncertain",
      evidence: ["Routine"],
      explanation: "The narrative conflicts with the urgency input.",
      question: "Is this routine, or is there an immediate hazard?",
    };
    analysis.assessments[3] = {
      ...analysis.assessments[3]!,
      state: "uncertain",
      evidence: ["streetlight is out"],
      explanation: "The report contains an unresolved issue description.",
      question: "Is the streetlight completely out or flickering?",
    };

    const sanitized = sanitizeAnalysis(analysis, input);
    assert.equal(sanitized.routingBlocked, true);
    assert.ok(
      sanitized.assessments.every((assessment) =>
        assessment.explanation.includes("Human review is required"),
      ),
    );
    assert.equal(sanitized.draft.urgency, "Uncertain — clarification required");
    assert.equal(
      sanitized.draft.department,
      "Routing held — clarification required",
    );
    assert.equal(sanitized.draft.issue, "Uncertain — clarification required");
    assert.ok(sanitized.draft.description.includes(input.description));
    assert.ok(
      sanitized.draft.description.includes(
        "[Uncertain — clarification required]",
      ),
    );
    assert.ok(sanitized.draft.issueType.includes(input.issueType));
    assert.equal(sanitized.missingInformation.length, 2);
  });

  it("preserves the exact submitted values for consistent structured draft fields", () => {
    const analysis = makeAnalysis();
    analysis.draft = {
      ...analysis.draft,
      issueType: "Different issue classification",
      location: "A fabricated location",
      urgency: "Emergency",
      observedAt: "A guessed date",
      department: "A different department",
      danger: "There is danger",
    };

    const sanitized = sanitizeAnalysis(analysis, input);
    assert.equal(sanitized.draft.issueType, input.issueType);
    assert.equal(sanitized.draft.location, input.location);
    assert.equal(sanitized.draft.urgency, input.urgency);
    assert.equal(sanitized.draft.observedAt, input.observedAt);
    assert.equal(sanitized.draft.department, input.requestedDepartment);
    assert.equal(sanitized.draft.danger, input.danger);
  });

  it("allows vague locations but holds routing until a precise location is clarified", () => {
    const vagueInput = {
      ...input, location: "Downtown San José",
      description: "There is sidewalk litter somewhere in Downtown San José.",
    };
    const analysis = makeAnalysis();
    analysis.assessments = analysis.assessments.map(a => ({ ...a, evidence: [] }));
    const sanitized = sanitizeAnalysis(analysis, vagueInput);
    const location = sanitized.assessments.find(a => a.field === "location");
    assert.equal(location?.state, "uncertain");
    assert.ok(location?.evidence.includes(vagueInput.location));
    assert.match(location?.question ?? "", /street address.*intersection.*landmark.*bus stop/);
    assert.equal(sanitized.routingBlocked, true);
    assert.match(sanitized.draft.location, /Uncertain/);
    assert.ok(sanitized.missingInformation.includes(location!.question));
    assert.equal(vagueInput.location, "Downtown San José");
  });

  it("treats explicit Unknown as missing even if the model calls it consistent", () => {
    const unknownInput = { ...input, urgency: "Unknown" };
    const analysis = makeAnalysis();
    analysis.assessments[0] = {
      ...analysis.assessments[0]!,
      state: "consistent",
      evidence: [],
      question: "",
    };

    const sanitized = sanitizeAnalysis(analysis, unknownInput);
    assert.equal(sanitized.assessments[0]?.state, "missing");
    assert.equal(sanitized.draft.urgency, "Missing — clarification required");
    assert.equal(
      sanitized.draft.department,
      "Routing held — clarification required",
    );
    assert.equal(sanitized.missingInformation.length, 1);
  });

  it("preserves narrative conflicts when the matching form values are missing", () => {
    const conflictInput: CivicReportAnalysisInput = {
      ...input,
      description:
        `${input.description} A live wire is exposed. The power is off and there is no danger. ` +
        "It happened on Monday. It did not happen Monday; it was Tuesday.",
      danger: "Not sure",
      observedAt: "",
    };
    const analysis = makeAnalysis();
    analysis.assessments[2] = {
      ...analysis.assessments[2]!,
      state: "uncertain",
      evidence: ["It happened on Monday", "it was Tuesday"],
      explanation: "The narrative gives conflicting event dates.",
      question: "Did the event happen Monday or Tuesday?",
    };
    analysis.assessments[5] = {
      ...analysis.assessments[5]!,
      state: "uncertain",
      evidence: ["live wire is exposed", "there is no danger"],
      explanation: "The narrative conflicts about immediate danger.",
      question: "Is a live wire currently exposed, or is the area confirmed safe?",
    };

    const sanitized = sanitizeAnalysis(analysis, conflictInput);
    const dateAssessment = sanitized.assessments.find(
      (assessment) => assessment.field === "date",
    );
    const dangerAssessment = sanitized.assessments.find(
      (assessment) => assessment.field === "danger",
    );

    assert.equal(dateAssessment?.state, "uncertain");
    assert.deepEqual(dateAssessment?.evidence, [
      "It happened on Monday",
      "it was Tuesday",
    ]);
    assert.equal(dateAssessment?.question, "Did the event happen Monday or Tuesday?");
    assert.equal(dangerAssessment?.state, "uncertain");
    assert.deepEqual(dangerAssessment?.evidence, [
      "live wire is exposed",
      "there is no danger",
    ]);
    assert.equal(
      dangerAssessment?.question,
      "Is a live wire currently exposed, or is the area confirmed safe?",
    );
    assert.equal(sanitized.draft.observedAt, "Uncertain — clarification required");
    assert.equal(sanitized.draft.danger, "Uncertain — clarification required");
    assert.equal(sanitized.routingBlocked, true);
    assert.ok(
      sanitized.missingInformation.includes(
        "Did the event happen Monday or Tuesday?",
      ),
    );
    assert.ok(
      sanitized.missingInformation.includes(
        "Is a live wire currently exposed, or is the area confirmed safe?",
      ),
    );
  });

  it("raises an active chemical leak with strong smell despite Low/no-danger and unknown address", () => {
    const report: CivicReportAnalysisInput = {
      ...input,
      description:
        "There is a chemical leak behind the building and a strong chemical smell. The exact address is unknown.",
      location: "Unknown",
      issueType: "Trash / debris",
      urgency: "Low",
      danger: "No danger",
    };
    const analysis = makeAnalysisForReport(report, {
      possibleHazard: true,
      recommendedUrgency: "High",
      evidence: ["chemical leak behind the building", "strong chemical smell"],
      explanation: "Reported indicators may indicate an active chemical safety concern.",
    });
    analysis.assessments[3] = {
      ...analysis.assessments[3]!,
      state: "uncertain",
      question: "Is the selected debris issue type accurate?",
    };
    const sanitized = sanitizeAnalysis(analysis, report);
    const dangerAssessment = sanitized.assessments.find(
      (assessment) => assessment.field === "danger",
    );
    const urgencyAssessment = sanitized.assessments.find(
      (assessment) => assessment.field === "urgency",
    );

    assert.equal(sanitized.safetyConcern.recommendedUrgency, "High");
    assert.deepEqual(sanitized.safetyConcern.evidence, [
      "chemical leak behind the building",
      "strong chemical smell",
    ]);
    assert.equal(sanitized.draft.issue, "Possible hazardous-material / chemical safety concern");
    assert.ok(sanitized.draft.issueType.includes("unconfirmed; human review required"));
    assert.equal(sanitized.draft.urgency, "High");
    assert.ok(sanitized.draft.description.includes(report.description));
    assert.ok(sanitized.draft.description.includes("Original selected issue type: Trash / debris"));
    assert.ok(sanitized.draft.description.includes("Is the selected debris issue type accurate?"));
    assert.ok(sanitized.draft.description.includes("“chemical leak behind the building”"));
    assert.ok(sanitized.draft.description.includes("“strong chemical smell”"));
    assert.ok(sanitized.draft.description.includes("Possible hazardous-material"));
    assert.ok(sanitized.draft.danger.includes("Unverified; human review is required"));
    assert.equal(dangerAssessment?.state, "uncertain");
    assert.ok(dangerAssessment?.question.includes("human reviewer"));
    assert.ok(dangerAssessment?.explanation.includes("human remains responsible") ||
      dangerAssessment?.explanation.includes("Human review is required"));
    assert.equal(urgencyAssessment?.state, "uncertain");
    assert.equal(sanitized.routingBlocked, true);
    assert.equal(sanitized.draft.department, "Routing held — clarification required");
    assert.ok(sanitized.missingInformation.some((question) => question.includes("human reviewer")));
    assert.equal(sanitized.assessments.find((assessment) => assessment.field === "location")?.state, "missing");
  });

  it("elevates reported fuel leaks and leaking unidentified containers", () => {
    for (const [description, quote] of [
      ["A fuel leak is spreading beside the parked truck.", "fuel leak is spreading"],
      ["An unidentified container is leaking onto the pavement.", "unidentified container is leaking"],
    ]) {
      const report = { ...input, description };
      const analysis = makeAnalysisForReport(report, {
        possibleHazard: true,
        recommendedUrgency: "High",
        evidence: [quote],
        explanation: "A reported active leak needs verification.",
      });
      const sanitized = sanitizeAnalysis(analysis, report);
      assert.equal(sanitized.draft.urgency, "High");
      assert.equal(sanitized.safetyConcern.possibleHazard, true);
      assert.ok(sanitized.draft.description.includes(`“${quote}”`));
      assert.equal(sanitized.routingBlocked, true);
    }
  });

  it("keeps a possible but inactive material concern at Medium", () => {
    const report = {
      ...input,
      description:
        "A sealed, unidentified drum is stored near the lot; it is not leaking and no fumes are present.",
      urgency: "Medium",
    };
    const analysis = makeAnalysisForReport(report, {
      possibleHazard: true,
      recommendedUrgency: "Medium",
      evidence: ["sealed, unidentified drum"],
      explanation: "The material is unidentified, but no active leak or fumes are reported.",
    });
    const sanitized = sanitizeAnalysis(analysis, report);
    assert.equal(sanitized.draft.urgency, "Medium");
    assert.equal(sanitized.draft.issue, "Possible hazardous-material / chemical safety concern");
    assert.equal(sanitized.safetyConcern.recommendedUrgency, "Medium");
    assert.equal(sanitized.routingBlocked, true);
  });

  it("keeps unknown selected urgency missing while retaining an elevated draft recommendation", () => {
    const report = {
      ...input,
      description: "A chemical odor is present near the work area.",
      urgency: "Not sure",
    };
    const analysis = makeAnalysisForReport(report, {
      possibleHazard: true,
      recommendedUrgency: "Medium",
      evidence: ["chemical odor is present"],
      explanation: "An odor may indicate a material concern.",
    });
    const sanitized = sanitizeAnalysis(analysis, report);
    const urgencyAssessment = sanitized.assessments.find(
      (assessment) => assessment.field === "urgency",
    );
    assert.equal(urgencyAssessment?.state, "missing");
    assert.ok(urgencyAssessment?.evidence.includes("chemical odor is present"));
    assert.ok(urgencyAssessment?.question.includes("Please confirm the appropriate urgency"));
    assert.equal(sanitized.draft.urgency, "Medium");
    assert.equal(sanitized.safetyConcern.recommendedUrgency, "Medium");
  });

  it("does not elevate absent or negated hazard indicators", () => {
    const report = {
      ...input,
      description: "The container is not leaking; there are no fumes or chemical smells.",
    };
    const analysis = makeAnalysisForReport(report, {
      possibleHazard: false,
      recommendedUrgency: "None",
      evidence: [],
      explanation: "The narrative explicitly negates the possible indicators.",
    });
    const sanitized = sanitizeAnalysis(analysis, report);
    assert.equal(sanitized.safetyConcern.possibleHazard, false);
    assert.equal(sanitized.safetyConcern.recommendedUrgency, "None");
    assert.equal(sanitized.draft.urgency, report.urgency);
    assert.notEqual(sanitized.draft.issue, "Possible hazardous-material / chemical safety concern");
  });

  it("rejects fabricated and empty evidence for a detected concern", () => {
    for (const evidence of [
      ["a fabricated leaking chemical"],
      [input.issueType],
      [],
    ]) {
      const analysis = makeAnalysis();
      analysis.safetyConcern = {
        possibleHazard: true,
        recommendedUrgency: "High",
        evidence,
        explanation: "Possible hazard.",
      };
      assert.throws(() => sanitizeAnalysis(analysis, input), (error) => {
        assert.ok(error instanceof InvalidProviderAnalysisError);
        assert.equal(error.reason, "evidence_provenance");
        return true;
      });
    }
  });

  it("rejects fabricated evidence and distinguishes provider failures", async () => {
    const analysis = makeAnalysis();
    analysis.assessments[1] = {
      ...analysis.assessments[1]!,
      evidence: ["a made-up address"],
    };
    assert.throws(() => sanitizeAnalysis(analysis, input), (error) => {
      assert.ok(error instanceof InvalidProviderAnalysisError);
      assert.equal(error.reason, "evidence_provenance");
      return true;
    });

    const punctuationInput = {
      ...input,
      description: "Resident says it’s safe—no immediate danger.",
    };
    assert.equal(
      alignEvidenceToSource(
        "RESIDENT says it's safe — no   immediate danger.",
        punctuationInput,
      ),
      "Resident says it’s safe—no immediate danger.",
    );
    assert.equal(
      alignEvidenceToSource("Resident confirms there is no risk.", punctuationInput),
      undefined,
    );
    const caseVariantAnalysis = makeAnalysis();
    caseVariantAnalysis.assessments[3] = {
      ...caseVariantAnalysis.assessments[3]!,
      evidence: ["THE STREETLIGHT    IS OUT"],
    };
    const alignedAnalysis = sanitizeAnalysis(caseVariantAnalysis, input);
    assert.deepEqual(alignedAnalysis.assessments[3]?.evidence, [
      "The streetlight is out",
    ]);

    await assert.rejects(
      callAndValidateAnalysis(
        async () => {
          const error = new Error("provider transport details stay private");
          error.name = "APIConnectionTimeoutError";
          throw error;
        },
        (raw) => raw,
      ),
      (error) => {
        assert.ok(error instanceof ProviderUnavailableError);
        assert.equal(error.category, "timeout");
        return true;
      },
    );
    await assert.rejects(
      callAndValidateAnalysis(async () => ({ malformed: true }), (raw) => {
        assertAnalysisWireShape(raw);
        return raw;
      }),
      InvalidProviderAnalysisError,
    );
  });

  it("uses at most one schema repair call and still rejects invalid repair output", async () => {
    let calls = 0;
    const repaired = await callAndValidateWithOneRepair(
      async (repair) => {
        calls += 1;
        if (!repair) return { invalid: true };
        assert.equal(repair.reason, "response_shape");
        assert.deepEqual(repair.candidate, { invalid: true });
        return { valid: true };
      },
      (raw) => {
        if (
          typeof raw !== "object" ||
          raw === null ||
          !("valid" in raw) ||
          raw.valid !== true
        ) {
          throw new InvalidProviderAnalysisError("response_shape");
        }
        return true;
      },
    );
    assert.equal(repaired, true);
    assert.equal(calls, 2);

    calls = 0;
    await assert.rejects(
      callAndValidateWithOneRepair(
        async () => {
          calls += 1;
          return { invalid: true };
        },
        () => {
          throw new InvalidProviderAnalysisError("response_shape");
        },
      ),
      InvalidProviderAnalysisError,
    );
    assert.equal(calls, 2);

    calls = 0;
    await assert.rejects(
      callAndValidateWithOneRepair(
        async () => {
          calls += 1;
          const error = new Error("provider request failure");
          error.name = "APIConnectionTimeoutError";
          throw error;
        },
        (raw) => raw,
      ),
      (error) => {
        assert.ok(error instanceof ProviderUnavailableError);
        assert.equal(error.category, "timeout");
        return true;
      },
    );
    assert.equal(calls, 1);
  });
});