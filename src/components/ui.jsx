// Shared primitives, styled with the same CSS variables as the legacy app.

import { useEffect, useLayoutEffect, useRef } from "react";
import { rowsFor, MAX_ROWS } from "../lib/domain/textRows";

// useLayoutEffect warns when React renders on the server, where there is no
// layout to read anyway. The print sample does exactly that.
const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

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

// `rest` is forwarded so aria-label reaches the button. It didn't, and every
// icon-only Btn in the app — remove, move up, move down — was passing one that
// went nowhere, leaving those buttons with no accessible name at all.
export function Btn({ children, onClick, kind = "ghost", size = "md", style, disabled, type = "button", title, ...rest }) {
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
      {...rest}
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

export function Area({ value, onChange, placeholder, rows = 3, style, ...rest }) {
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
      {...rest}
    />
  );
}

/**
 * A text box that grows to fit what's in it.
 *
 * "I need to see the full text box so i can read the announcement."
 *
 * Estimate first, measure second — the same arrangement the printed agenda
 * uses. rowsFor() gets the box close before anything is laid out, which is
 * what makes the height right on the first paint and checkable without a
 * browser; the effect below then asks the element how tall its content really
 * is and takes over. Where there's no layout engine — jsdom, server render —
 * scrollHeight is 0 and the estimate simply stands.
 *
 * Still resizable by hand, and still capped: past MAX_ROWS the box scrolls
 * rather than swallowing the screen.
 */
export function AutoArea({ value, onChange, placeholder, style, ...rest }) {
  const ref = useRef(null);

  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse before measuring: scrollHeight can only report content taller
    // than the box, so without this the box can grow but never shrink back.
    el.style.height = "auto";
    const want = el.scrollHeight;
    if (!want) return;                       // no layout engine — keep the estimate
    const line = parseFloat(getComputedStyle(el).lineHeight) || 21;
    el.style.height = `${Math.min(want, MAX_ROWS * line + 20)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={rowsFor(value)}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10,
        padding: "9px 11px", fontSize: 16, color: T.ink, width: "100%",
        minWidth: 0, fontFamily: "inherit", lineHeight: 1.45,
        resize: "vertical", overflowY: "auto", ...style,
      }}
      {...rest}
    />
  );
}

// `...rest` so aria-label, id, disabled and the like reach the element. Without
// it they were silently dropped, and every dropdown in the app that isn't next
// to a <label> — the age filter, the category picker, a month of conducting —
// was an unnamed control to a screen reader. Btn had the same hole.
export function Select({ value, onChange, children, style, ...rest }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10,
        padding: "9px 11px", fontSize: 16, color: T.ink, width: "100%",
        minWidth: 0, fontFamily: "inherit", ...style,
      }}
      {...rest}
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
      // inline-flex so a chip holding an icon plus text lines up on the
      // baseline instead of the icon sitting low.
      display: "inline-flex", alignItems: "center", gap: 4,
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
