import { T } from "./ui";

/**
 * The pill row used to switch between sections inside a tab.
 *
 * Scrolls sideways rather than shrinking when there are more segments than
 * fit — five labels squeezed onto a phone would be unreadable, and a row that
 * scrolls is obvious once you touch it.
 */
export default function Segmented({ value, onChange, options, idAttr = "data-seg" }) {
  return (
    <div
      role="tablist"
      className="eq-seg"
      style={{
        display: "flex", gap: 4, background: T.inset, borderRadius: 12,
        padding: 4, marginBottom: 14, overflowX: "auto",
      }}
    >
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={on}
            {...{ [idAttr]: o.key }}
            onClick={() => onChange(o.key)}
            style={{
              flex: "1 0 auto", whiteSpace: "nowrap",
              padding: "9px 12px", borderRadius: 9, border: "none",
              background: on ? T.panel : "transparent",
              color: on ? T.ink : T.sub,
              fontSize: 14.5, fontWeight: 700, cursor: "pointer",
              boxShadow: on ? "var(--card-shadow)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {o.label}
            {o.count > 0 && (
              <span style={{ fontSize: 11.5, fontWeight: 800, color: on ? T.primaryDeep : T.faint }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
