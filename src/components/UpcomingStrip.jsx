import { useState } from "react";
import { ChevronDown, Calendar } from "lucide-react";
import { T, card, Chip } from "./ui";
import UpcomingList from "./UpcomingList";
import { DOW, MON, isoParts } from "../lib/domain/dates";

// Derived here rather than asked of the caller: the whole reason UpcomingList
// exists is that three screens each formatted the same date differently.
function shortDate(iso) {
  if (!iso) return "";
  const d = isoParts(iso);
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
}

/**
 * What's next, on one line, with the rest a tap away.
 *
 * The full card sat above the feed and pushed the posts off the screen. Nearly
 * all of its value is in the first row — the next thing happening — so that's
 * what stays visible, and the remainder expands in place rather than living on
 * a different screen.
 */
export default function UpcomingStrip({ items, empty = "Nothing on the calendar yet." }) {
  const [open, setOpen] = useState(false);
  const next = items[0];
  const rest = items.length - 1;

  if (!next) {
    return (
      <div style={{ ...card, padding: "10px 13px", fontSize: 14, color: T.faint }}>
        {empty}
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%", background: "transparent", border: "none",
          padding: "10px 13px", cursor: rest > 0 ? "pointer" : "default",
          display: "flex", alignItems: "center", gap: 9, textAlign: "left", minWidth: 0,
        }}
      >
        <Calendar size={15} style={{ color: T.sub, flex: "0 0 auto" }} />

        {/* The date is the reason this row exists, so it leads. */}
        <span style={{
          fontSize: 12.5, fontWeight: 800, color: T.sub, letterSpacing: "0.04em",
          textTransform: "uppercase", flex: "0 0 auto",
        }}>
          {shortDate(next.when)}
        </span>

        <span style={{
          fontSize: 14.5, fontWeight: 700, color: T.ink, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {next.title}
        </span>

        {rest > 0 && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
            <Chip color={T.sub} bg={T.inset}>{open ? "Hide" : `+${rest} more`}</Chip>
            <ChevronDown
              size={15}
              style={{
                color: T.faint,
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform 140ms ease",
              }}
            />
          </span>
        )}
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${T.lineSoft}`, padding: "11px 13px" }}>
          <UpcomingList items={items} empty={empty} />
        </div>
      )}
    </div>
  );
}
