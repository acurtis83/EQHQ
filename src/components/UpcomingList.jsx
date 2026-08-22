import { T } from "./ui";
import { DOW, MON, isoParts } from "../lib/domain/dates";

/**
 * The dated list used on the Sunday agenda, the Presidency Home and the feed.
 *
 * Each screen built its own version and they drifted — different date
 * treatments for the same information. Callers hand over already-normalised
 * items so the component never has to know whether it's looking at a planning
 * row or a feed post:
 *
 *   { id, when, title, meta, signUpHref, onClick }
 */
export default function UpcomingList({ items, empty = "Nothing coming up." }) {
  if (!items?.length) {
    return <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>{empty}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it) => (
        <Row key={it.id} item={it} />
      ))}
    </div>
  );
}

function Row({ item }) {
  const clickable = !!item.onClick;
  const inner = (
    <>
      <DateBlock iso={item.when} />
      <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink, lineHeight: 1.3 }}>
          {item.title}
        </div>
        {item.meta && (
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 2 }}>{item.meta}</div>
        )}
        {item.signUpHref && (
          <a
            href={item.signUpHref}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-block", marginTop: 4, fontSize: 13.5,
              fontWeight: 700, color: T.primaryDeep, textDecoration: "none",
            }}
          >
            Sign up
          </a>
        )}
      </div>
    </>
  );

  const style = { display: "flex", alignItems: "flex-start", gap: 12, width: "100%", textAlign: "left" };

  if (!clickable) return <div style={style}>{inner}</div>;
  return (
    <button
      onClick={item.onClick}
      data-upcoming={item.id}
      style={{ ...style, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
    >
      {inner}
    </button>
  );
}

// Weekday over day-number over month. The day is what's being scanned for, so
// it gets the size; the rest is there to place it.
function DateBlock({ iso }) {
  const d = iso ? isoParts(iso) : null;
  return (
    <div style={{
      flex: "0 0 auto", width: 52, textAlign: "center",
      background: T.inset, borderRadius: 9, padding: "5px 0 6px",
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em",
        textTransform: "uppercase", color: T.faint, lineHeight: 1.2,
      }}>
        {d ? DOW[d.getDay()] : "TBC"}
      </div>
      <div style={{ fontSize: 19.5, fontWeight: 800, color: T.ink, lineHeight: 1.15 }}>
        {d ? d.getDate() : "—"}
      </div>
      <div style={{
        fontSize: 10.5, fontWeight: 700, textTransform: "uppercase",
        color: T.faint, lineHeight: 1.2,
      }}>
        {d ? MON[d.getMonth()] : ""}
      </div>
    </div>
  );
}
