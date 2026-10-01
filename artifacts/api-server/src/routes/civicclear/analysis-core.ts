import type {
  CivicReportAnalysis,
  CivicReportAnalysisInput,
} from "@workspace/api-zod";

export const ANALYSIS_FIELDS = [
  "urgency",
  "location",
  "date",
  "issue",
  "department",
  "danger",
] as const;

export const ANALYSIS_KEYS = [
  "analysisVersion",
  "assessments",
  "draft",
  "missingInformation",
  "routingBlocked",
  "safetyConcern",
] as const;

const DRAFT_KEYS = [
  "issue",
  "location",
  "issueType",
  "urgency",
  "description",
  "observedAt",
  "department",
  "danger",
] as const;

const ASSESSMENT_KEYS = [
  "field",
  "state",
  "evidence",
  "explanation",
  "question",
] as const;
const SAFETY_CONCERN_KEYS = [
  "possibleHazard",
  "recommendedUrgency",
  "evidence",
  "explanation",
] as const;

const MISSING_MARKER = "Missing — clarification required";
const UNCERTAIN_MARKER = "Uncertain — clarification required";
const ROUTING_HELD = "Routing held — clarification required";
const HUMAN_REVIEW_NOTE =
  "Human review is required; the AI cannot make the final safety or routing decision.";

export class InvalidProviderAnalysisError extends Error {
  readonly reason:
    | "response_shape"
    | "assessment_fields"
    | "evidence_provenance"
    | "clarification_question"
    | "empty_provider_content"
    | "invalid_json"
    | "response_schema"
    | "response_validation";

  constructor(reason: InvalidProviderAnalysisError["reason"]) {
    super("AI provider returned an invalid analysis.");
    this.name = "InvalidProviderAnalysisError";
    this.reason = reason;
  }
}

export type ProviderFailureCategory =
  | "configuration"
  | "timeout"
  | "rate_limit"
  | "authentication"
  | "provider_http_error"
  | "connection_reset"
  | "dns_temporary"
  | "connection_refused"
  | "provider_error";

export class ProviderUnavailableError extends Error {
  readonly category: ProviderFailureCategory;

  constructor(category: ProviderFailureCategory = "provider_error") {
    super("AI analysis is temporarily unavailable.");
    this.name = "ProviderUnavailableError";
    this.category = category;
  }
}

function providerFailureCategory(error: unknown): ProviderFailureCategory {
  if (error instanceof Error && /timeout/i.test(error.name)) return "timeout";
  if (typeof error !== "object" || error === null) return "provider_error";

  const candidate = error as { status?: unknown; code?: unknown };
  if (typeof candidate.status === "number") {
    if (candidate.status === 429) return "rate_limit";
    if (candidate.status === 401 || candidate.status === 403) {
      return "authentication";
    }
    return "provider_http_error";
  }

  switch (candidate.code) {
    case "ETIMEDOUT":
      return "timeout";
    case "ECONNRESET":
      return "connection_reset";
    case "EAI_AGAIN":
      return "dns_temporary";
    case "ECONNREFUSED":
      return "connection_refused";
    default:
      return "provider_error";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Strictly checks the complete wire shape before passing it to the generated
 * OpenAPI/Zod response schema. This also rejects unknown keys rather than
 * allowing Zod's default object stripping behavior.
 */
export function assertAnalysisWireShape(
  value: unknown,
): asserts value is CivicReportAnalysis {
  if (!isRecord(value) || !hasExactKeys(value, ANALYSIS_KEYS)) {
    throw new InvalidProviderAnalysisError("response_shape");
  }
  const draft = value.draft;
  const safetyConcern = value.safetyConcern;
  if (
    value.analysisVersion !== 1 ||
    !Array.isArray(value.assessments) ||
    value.assessments.length !== 6 ||
    !isRecord(draft) ||
    !hasExactKeys(draft, DRAFT_KEYS) ||
    !DRAFT_KEYS.every((key) => typeof draft[key] === "string") ||
    !isStringArray(value.missingInformation) ||
    typeof value.routingBlocked !== "boolean" ||
    !isRecord(safetyConcern) ||
    !hasExactKeys(safetyConcern, SAFETY_CONCERN_KEYS) ||
    typeof safetyConcern.possibleHazard !== "boolean" ||
    !["None", "Medium", "High"].includes(
      String(safetyConcern.recommendedUrgency),
    ) ||
    !isStringArray(safetyConcern.evidence) ||
    typeof safetyConcern.explanation !== "string" ||
    (!safetyConcern.possibleHazard &&
      safetyConcern.recommendedUrgency !== "None") ||
    (safetyConcern.possibleHazard &&
      safetyConcern.recommendedUrgency === "None")
  ) {
    throw new InvalidProviderAnalysisError("response_shape");
  }

  for (const assessment of value.assessments) {
    if (
      !isRecord(assessment) ||
      !hasExactKeys(assessment, ASSESSMENT_KEYS) ||
      !ANALYSIS_FIELDS.includes(
        assessment.field as (typeof ANALYSIS_FIELDS)[number],
      ) ||
      !["consistent", "uncertain", "missing"].includes(
        String(assessment.state),
      ) ||
      !isStringArray(assessment.evidence) ||
      typeof assessment.explanation !== "string" ||
      typeof assessment.question !== "string"
    ) {
      throw new InvalidProviderAnalysisError("response_shape");
    }
  }
}

export function assertExactInputKeys(
  value: unknown,
): asserts value is CivicReportAnalysisInput {
  const keys = [
    "description",
    "location",
    "issueType",
    "urgency",
    "observedAt",
    "requestedDepartment",
    "danger",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new TypeError("Request body must contain exactly the report fields.");
  }
}

function isExplicitlyMissing(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "" || normalized === "not sure" || normalized === "unknown";
}

function isAreaOnlyLocation(value: string): boolean {
  return /^(?:downtown(?:\s+san\s+jos[eé])?|san\s+jos[eé])[.!]?$/iu.test(
    value.trim().replace(/\s+/g, " "),
  );
}

function inputForAssessment(
  field: (typeof ANALYSIS_FIELDS)[number],
  input: CivicReportAnalysisInput,
): string {
  switch (field) {
    case "urgency":
      return input.urgency;
    case "location":
      return input.location;
    case "date":
      return input.observedAt;
    case "issue":
      return input.issueType;
    case "department":
      return input.requestedDepartment;
    case "danger":
      return input.danger;
  }
}

function missingQuestion(
  field: (typeof ANALYSIS_FIELDS)[number],
): string {
  switch (field) {
    case "urgency":
      return "What urgency best describes the current situation?";
    case "location":
      return "Where exactly is the reported issue?";
    case "date":
      return "When did you observe this issue?";
    case "issue":
      return "Which issue type best describes the report?";
    case "department":
      return "Which department, if any, do you believe should receive this report?";
    case "danger":
      return "Is anyone currently in danger, or is there another immediate safety risk?";
  }
}

function markerFor(state: "uncertain" | "missing"): string {
  return state === "missing" ? MISSING_MARKER : UNCERTAIN_MARKER;
}

function appendOriginalAndMarker(original: string, marker: string): string {
  return `${original}${original ? "\n\n" : ""}[${marker}]`;
}

function canonicalPunctuation(character: string): string {
  if (/[‘’‛′]/u.test(character)) return "'";
  if (/[“”„‟«»]/u.test(character)) return '"';
  if (/[‐‑‒–—―−]/u.test(character)) return "-";
  if (character === "…") return "...";
  return character;
}

function normalizedTextWithOffsets(value: string): {
  text: string;
  starts: number[];
  ends: number[];
} {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingWhitespace: { start: number; end: number } | undefined;

  for (let offset = 0; offset < value.length; ) {
    const character = String.fromCodePoint(value.codePointAt(offset)!);
    const end = offset + character.length;
    const normalized = canonicalPunctuation(character)
      .normalize("NFKC")
      .toLowerCase();

    for (let index = 0; index < normalized.length; index += 1) {
      const unit = normalized[index]!;
      if (/\s/u.test(unit)) {
        pendingWhitespace ??= { start: offset, end };
        pendingWhitespace.end = end;
      } else {
        const currentIsPunctuation = /\p{P}/u.test(unit);
        const previousIsPunctuation =
          text.length > 0 && /\p{P}$/u.test(text);
        if (
          pendingWhitespace &&
          !currentIsPunctuation &&
          !previousIsPunctuation
        ) {
          text += " ";
          starts.push(pendingWhitespace.start);
          ends.push(pendingWhitespace.end);
        }
        pendingWhitespace = undefined;
        text += unit;
        starts.push(offset);
        ends.push(end);
      }
    }
    offset = end;
  }

  return { text, starts, ends };
}

/**
 * Returns an exact source slice for a quote, allowing only case, repeated
 * whitespace, and canonical Unicode punctuation differences. It never turns
 * paraphrases into evidence: every accepted normalized character maps to a
 * contiguous original substring, which is returned verbatim.
 */
export function alignEvidenceToSource(
  quote: string,
  input: CivicReportAnalysisInput,
  sources: readonly string[] = Object.values(input),
): string | undefined {
  if (!quote.trim()) return undefined;
  for (const source of sources) {
    if (source.includes(quote)) return quote;

    const normalizedQuote = normalizedTextWithOffsets(quote).text.trim();
    if (!normalizedQuote) continue;
    const normalizedSource = normalizedTextWithOffsets(source);
    const matchStart = normalizedSource.text.indexOf(normalizedQuote);
    if (matchStart < 0) continue;
    const matchEnd = matchStart + normalizedQuote.length - 1;
    const originalStart = normalizedSource.starts[matchStart];
    const originalEnd = normalizedSource.ends[matchEnd];
    if (originalStart === undefined || originalEnd === undefined) continue;
    return source.slice(originalStart, originalEnd);
  }
  return undefined;
}

/**
 * Enforces provenance and routing safety after model output has been
 * structurally validated. A model can never waive a gate or invent evidence.
 */
export function sanitizeAnalysis(
  analysis: CivicReportAnalysis,
  input: CivicReportAnalysisInput,
): CivicReportAnalysis {
  const safetyConcernEvidence = analysis.safetyConcern.evidence.map((quote) => {
    const aligned = alignEvidenceToSource(quote, input, [
      input.description,
      input.danger,
    ]);
    if (!aligned) {
      throw new InvalidProviderAnalysisError("evidence_provenance");
    }
    return aligned;
  });
  if (
    analysis.safetyConcern.possibleHazard &&
    safetyConcernEvidence.length === 0
  ) {
    throw new InvalidProviderAnalysisError("evidence_provenance");
  }

  const withAlignedEvidence = analysis.assessments.map((assessment) => ({
    ...assessment,
    evidence: assessment.evidence.map((quote) => {
      const aligned = alignEvidenceToSource(quote, input);
      if (!aligned) {
        throw new InvalidProviderAnalysisError("evidence_provenance");
      }
      return aligned;
    }),
  }));

  const seen = new Set<string>();
  for (const assessment of withAlignedEvidence) {
    if (seen.has(assessment.field)) {
      throw new InvalidProviderAnalysisError("assessment_fields");
    }
    seen.add(assessment.field);
    if (
      assessment.state !== "consistent" &&
      assessment.question.trim().length === 0 &&
      (assessment.state === "uncertain" ||
        !isExplicitlyMissing(inputForAssessment(assessment.field, input)))
    ) {
      throw new InvalidProviderAnalysisError("clarification_question");
    }
  }
  if (seen.size !== ANALYSIS_FIELDS.length) {
    throw new InvalidProviderAnalysisError("assessment_fields");
  }

  const assessmentsWithMissing = withAlignedEvidence.map((assessment) => {
    const submittedValue = inputForAssessment(assessment.field, input);
    if (assessment.field === "location" && isAreaOnlyLocation(submittedValue)) {
      const locationQuestion =
        "What is the street address, nearest intersection, cross street, landmark, or bus stop for this issue?";
      return {
        ...assessment,
        state: "uncertain" as const,
        evidence: [...new Set([...assessment.evidence, submittedValue])],
        explanation: `${assessment.explanation} The submitted location identifies only an area, not a precise location. No exact address has been established.`,
        question: assessment.question.includes(locationQuestion)
          ? assessment.question
          : [assessment.question, locationQuestion].filter(Boolean).join(" "),
      };
    }
    if (
      assessment.state === "uncertain" ||
      !isExplicitlyMissing(submittedValue)
    ) {
      return assessment;
    }

    const evidence = assessment.evidence.includes(submittedValue)
      ? assessment.evidence
      : submittedValue
        ? [...assessment.evidence, submittedValue]
        : assessment.evidence;
    return {
      ...assessment,
      state: "missing" as const,
      evidence,
      explanation:
        "The labeled form value is empty or explicitly marked unknown, so this field cannot be confirmed from the form.",
      question: missingQuestion(assessment.field),
    };
  });
  const assessments = assessmentsWithMissing.map((assessment) => ({
    ...assessment,
    explanation: assessment.explanation.includes(HUMAN_REVIEW_NOTE)
      ? assessment.explanation
      : `${assessment.explanation} ${HUMAN_REVIEW_NOTE}`,
  }));

  const assessmentByField = new Map(
    assessments.map((assessment) => [assessment.field, assessment]),
  );
  if (analysis.safetyConcern.possibleHazard) {
    const dangerAssessment = assessmentByField.get("danger");
    if (!dangerAssessment) {
      throw new InvalidProviderAnalysisError("assessment_fields");
    }
    const safetyQuestion =
      "Can a human reviewer verify whether the reported material, leak, fumes, or exposure is present and whether anyone is at risk?";
    const existingQuestion = dangerAssessment.question.trim();
    const question = existingQuestion.includes(safetyQuestion)
      ? existingQuestion
      : [existingQuestion, safetyQuestion].filter(Boolean).join(" ");
    const explanation =
      `${dangerAssessment.explanation} A possible hazardous-material concern is unconfirmed; verify it with a human reviewer. ${HUMAN_REVIEW_NOTE}`;
    const updatedDanger = {
      ...dangerAssessment,
      state: "uncertain" as const,
      evidence: [...new Set([...dangerAssessment.evidence, ...safetyConcernEvidence])],
      explanation,
      question,
    };
    assessmentByField.set("danger", updatedDanger);
    const dangerIndex = assessments.findIndex(
      (assessment) => assessment.field === "danger",
    );
    assessments[dangerIndex] = updatedDanger;
  }

  const draft = { ...analysis.draft };
  for (const field of ANALYSIS_FIELDS) {
    const assessment = assessmentByField.get(field);
    if (!assessment) continue;
    if (assessment.state === "consistent") {
      switch (field) {
        case "urgency":
          draft.urgency = input.urgency;
          break;
        case "location":
          draft.location = input.location;
          break;
        case "date":
          draft.observedAt = input.observedAt;
          break;
        case "issue":
          draft.issueType = input.issueType;
          break;
        case "department":
          draft.department = input.requestedDepartment;
          break;
        case "danger":
          draft.danger = input.danger;
          break;
      }
      continue;
    }
    const marker = markerFor(assessment.state);
    switch (field) {
      case "urgency":
        draft.urgency = marker;
        break;
      case "location":
        draft.location = marker;
        break;
      case "date":
        draft.observedAt = marker;
        break;
      case "issue":
        draft.issue = marker;
        draft.issueType = appendOriginalAndMarker(input.issueType, marker);
        draft.description = appendOriginalAndMarker(input.description, marker);
        break;
      case "department":
        draft.department = ROUTING_HELD;
        break;
      case "danger":
        draft.danger = marker;
        break;
    }
  }

  const routingBlocked = assessments.some(
    (assessment) => assessment.state !== "consistent",
  );
  if (analysis.safetyConcern.possibleHazard) {
    const urgencyAssessment = assessmentByField.get("urgency");
    if (urgencyAssessment) {
      const urgencyRank: Record<string, number> = {
        low: 0,
        medium: 1,
        high: 2,
      };
      const submittedUrgency = input.urgency.trim().toLocaleLowerCase();
      const requestedRank = urgencyRank[submittedUrgency];
      const recommendedRank =
        analysis.safetyConcern.recommendedUrgency === "High" ? 2 : 1;
      const needsUrgencyConfirmation =
        urgencyAssessment.state !== "consistent" ||
        requestedRank === undefined ||
        requestedRank < recommendedRank;
      if (needsUrgencyConfirmation) {
        const urgencyQuestion =
          `The possible safety concern recommends ${analysis.safetyConcern.recommendedUrgency} urgency. Please confirm the appropriate urgency after human review.`;
        const existingUrgencyQuestion = urgencyAssessment.question.trim();
        const updatedUrgency = {
          ...urgencyAssessment,
          state:
            urgencyAssessment.state !== "consistent"
              ? urgencyAssessment.state
              : isExplicitlyMissing(input.urgency)
                ? ("missing" as const)
                : ("uncertain" as const),
          evidence: [
            ...new Set([
              ...urgencyAssessment.evidence,
              ...safetyConcernEvidence,
            ]),
          ],
          explanation:
            `${urgencyAssessment.explanation} The selected urgency is below or does not establish the AI-recommended possible-hazard response; do not treat this recommendation as a confirmed hazard. ${HUMAN_REVIEW_NOTE}`,
          question: existingUrgencyQuestion.includes(urgencyQuestion)
            ? existingUrgencyQuestion
            : [existingUrgencyQuestion, urgencyQuestion]
                .filter(Boolean)
                .join(" "),
        };
        assessmentByField.set("urgency", updatedUrgency);
        const urgencyIndex = assessments.findIndex(
          (assessment) => assessment.field === "urgency",
        );
        assessments[urgencyIndex] = updatedUrgency;
      }
    }
    draft.issue = "Possible hazardous-material / chemical safety concern";
    draft.issueType =
      "Possible hazardous-material / chemical safety concern (unconfirmed; human review required)";
    draft.urgency = analysis.safetyConcern.recommendedUrgency;
    draft.danger =
      `Possible hazardous-material / chemical concern reported: ${safetyConcernEvidence.map((quote) => `“${quote}”`).join("; ")}. Unverified; human review is required.`;
    const issueAssessment = assessmentByField.get("issue");
    const issueContext = [
      input.issueType ? `Original selected issue type: ${input.issueType}` : "",
      issueAssessment && issueAssessment.state !== "consistent"
        ? `Issue clarification: ${input.issueType || "Not provided"}${issueAssessment.question ? ` — ${issueAssessment.question}` : ""}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const quoteContext = safetyConcernEvidence
      .map((quote) => `“${quote}”`)
      .join("; ");
    draft.description =
      `Possible hazardous-material / chemical safety concern (possible, unconfirmed; human review required).\nReported indicator quotes: ${quoteContext}\n\nOriginal report: ${input.description}${issueContext ? `\n\n${issueContext}` : ""}`;
  }
  if (routingBlocked) {
    draft.department = ROUTING_HELD;
    if (
      !analysis.safetyConcern.possibleHazard &&
      assessmentByField.get("issue")?.state === "consistent"
    ) {
      draft.description = input.description;
    }
  }

  const missingInformation = [
    ...new Set(
      assessments
        .filter((assessment) => assessment.state !== "consistent")
        .map((assessment) => assessment.question),
    ),
  ];

  return {
    analysisVersion: 1,
    assessments,
    draft,
    missingInformation,
    routingBlocked,
    safetyConcern: {
      ...analysis.safetyConcern,
      evidence: safetyConcernEvidence,
    },
  };
}

export async function callAndValidateAnalysis<T>(
  callProvider: () => Promise<unknown>,
  validate: (raw: unknown) => T,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await callProvider();
  } catch (error) {
    throw new ProviderUnavailableError(providerFailureCategory(error));
  }

  try {
    return validate(raw);
  } catch (error) {
    if (error instanceof InvalidProviderAnalysisError) throw error;
    throw new InvalidProviderAnalysisError("response_validation");
  }
}

export async function callAndValidateWithOneRepair<T>(
  callProvider: (
    repair?: {
      candidate: unknown;
      reason: InvalidProviderAnalysisError["reason"];
    },
  ) => Promise<unknown>,
  validate: (raw: unknown) => T,
): Promise<T> {
  let initial: unknown;
  try {
    initial = await callProvider();
  } catch (error) {
    throw new ProviderUnavailableError(providerFailureCategory(error));
  }

  try {
    return validate(initial);
  } catch (error) {
    const initialFailure =
      error instanceof InvalidProviderAnalysisError
        ? error
        : new InvalidProviderAnalysisError("response_validation");
    let repaired: unknown;
    try {
      repaired = await callProvider({
        candidate: initial,
        reason: initialFailure.reason,
      });
    } catch (providerError) {
      throw new ProviderUnavailableError(
        providerFailureCategory(providerError),
      );
    }

    try {
      return validate(repaired);
    } catch (repairError) {
      if (repairError instanceof InvalidProviderAnalysisError) {
        throw repairError;
      }
      throw new InvalidProviderAnalysisError("response_validation");
    }
  }
}