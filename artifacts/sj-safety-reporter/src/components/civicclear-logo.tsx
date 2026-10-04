import "./civicclear-logo.css";

type CivicClearLogoProps = {
  size?: number;
  iconOnly?: boolean;
  className?: string;
};

export function CivicClearLogo({ size = 34, iconOnly = false, className = "" }: CivicClearLogoProps) {
  const src = `${import.meta.env.BASE_URL}civicclear-logo.svg`;
  return (
    <span className={`civicclear-logo ${className}`.trim()}>
      <img
        src={src}
        width={size}
        height={size}
        alt={iconOnly ? "CivicClear" : ""}
        className="civicclear-logo__mark"
        draggable={false}
      />
      {!iconOnly && (
        <span className="civicclear-logo__word" style={{ fontSize: Math.round(size * 0.58) }}>
          CivicClear
        </span>
      )}
    </span>
  );
}

export default CivicClearLogo;
