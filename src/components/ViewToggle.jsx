import { List, LayoutGrid } from "lucide-react";
import { T } from "./ui";
import { VIEWS } from "../lib/useViewMode";

const OPTIONS = [
  { value: VIEWS.ORDER, label: "In Order", Icon: List },
  { value: VIEWS.CATEGORY, label: "By Category", Icon: LayoutGrid },
];

/**
 * Switches between the two arrangements.
 *
 * A segmented control rather than a dropdown: there are two choices, both
 * worth seeing, and this gets tapped mid-meeting on a phone where a select
 * that opens a wheel picker is two gestures instead of one.
 */
export default function ViewToggle({ value, onChange, style }) {
  return (
    <div
      role="group"
      aria-label="Arrange items"
      style={{
        display: "inline-flex", gap: 2, padding: 2,
        background: T.inset, border: `1px solid ${T.line}`, borderRadius: 11,
        ...style,
      }}
    >
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={on}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 9, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
              background: on ? T.panel : "transparent",
              color: on ? T.ink : T.sub,
              boxShadow: on ? "var(--card-shadow)" : "none",
            }}
          >
            <Icon size={14} />{label}
          </button>
        );
      })}
    </div>
  );
}
