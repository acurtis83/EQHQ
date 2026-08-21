// Shared primitives, styled with the same CSS variables as the legacy app.

export const T = {
  ink: "var(--ink)", sub: "var(--sub)", faint: "var(--faint)",
  bg: "var(--bg)", panel: "var(--panel)", inset: "var(--inset)",
  line: "var(--line)", lineSoft: "var(--line-soft)",
  primary: "var(--primary)", primaryDeep: "var(--primary-deep)", primarySoft: "var(--primary-soft)",
  gold: "var(--gold)", goldSoft: "var(--gold-soft)",
  green: "var(--green)", greenSoft: "var(--green-soft)",
  red: "var(--red)", redSoft: "var(--red-soft)",
};

export const card = {
  background: T.panel,
  border: `1px solid ${T.lineSoft}`,
  borderRadius: 14,
  boxShadow: "var(--card-shadow)",
  padding: 16,
};

export function Btn({ children, onClick, kind = "ghost", size = "md", style, disabled, type = "button", title }) {
  const pad = size === "sm" ? "6px 10px" : size === "lg" ? "12px 18px" : "9px 14px";
  const font = size === "sm" ? 14 : 15.5;
  const kinds = {
    primary: { background: T.primary, color: "var(--on-primary)", border: `1px solid ${T.primary}` },
    soft: { background: T.primarySoft, color: T.primaryDeep, border: `1px solid ${T.primarySoft}` },
    ghost: { background: "transparent", color: T.ink, border: `1px solid ${T.line}` },
    plain: { background: "transparent", color: T.sub, border: "1px solid transparent" },
    danger: { background: "transparent", color: T.red, border: `1px solid ${T.red}` },
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...kinds[kind], padding: pad, fontSize: font, fontWeight: 600,
        borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center",
        gap: 7, lineHeight: 1.2, ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Input({ value, onChange, placeholder, type = "text", style, ...rest }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10,
        padding: "9px 11px", fontSize: 16, color: T.ink, width: "100%",
        minWidth: 0, fontFamily: "inherit", ...style,
      }}
      {...rest}
    />
  );
}

export function Area({ value, onChange, placeholder, rows = 3, style }) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10,
        padding: "9px 11px", fontSize: 16, color: T.ink, width: "100%",
        minWidth: 0, fontFamily: "inherit", resize: "vertical", ...style,
      }}
    />
  );
}

export function Select({ value, onChange, children, style }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10,
        padding: "9px 11px", fontSize: 16, color: T.ink, width: "100%",
        minWidth: 0, fontFamily: "inherit", ...style,
      }}
    >
      {children}
    </select>
  );
}

export function Chip({ children, color = T.primaryDeep, bg = T.primarySoft }) {
  return (
    <span style={{
      background: bg, color, fontSize: 13, fontWeight: 700, padding: "3px 9px",
      borderRadius: 999, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 20.5, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>{children}</div>
      {sub && <div style={{ fontSize: 14.5, color: T.sub, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function Empty({ title, hint }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: "34px 18px" }}>
      <div style={{ fontSize: 16.5, fontWeight: 600, color: T.ink }}>{title}</div>
      {hint && <div style={{ fontSize: 14.5, color: T.sub, marginTop: 6, lineHeight: 1.55 }}>{hint}</div>}
    </div>
  );
}

export function Stub({ title, note }) {
  return (
    <div style={{ ...card, borderStyle: "dashed" }}>
      <div style={{ fontSize: 17.5, fontWeight: 700, color: T.ink }}>{title}</div>
      <div style={{ fontSize: 14.5, color: T.sub, marginTop: 6, lineHeight: 1.6 }}>{note}</div>
      <div style={{ marginTop: 10 }}><Chip color={T.gold} bg={T.goldSoft}>Coming in a later phase</Chip></div>
    </div>
  );
}
