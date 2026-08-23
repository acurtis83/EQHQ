import { Bell, Calendar, ClipboardList } from "lucide-react";
import TempleIcon from "../components/TempleIcon";
import { T } from "../components/ui";
import { CATEGORIES } from "./categories";

// The temple is drawn to match the ward mark; lucide has no equivalent.
const ICONS = { bell: Bell, temple: TempleIcon, calendar: Calendar, clipboard: ClipboardList };

const RING = 54;      // outer diameter
const STROKE = 3.5;

/**
 * One category, as a ring with its count inside.
 *
 * Stacked 2x2 these pushed the actual posts below the fold, which is the whole
 * complaint. Four across in a single row is half the height, and the ring
 * carries the count without needing a separate line for it.
 */
function Ring({ tile, count, on, onPick }) {
  const Icon = ICONS[tile.icon];
  const empty = count === 0;

  // A zero shouldn't shout. Muted ring, muted number — it reads as "nothing
  // here" at a glance instead of competing with the categories that have
  // something in them.
  const ringColor = on ? tile.accent : (empty ? T.lineSoft : tile.accent);
  const numColor = empty ? T.faint : T.ink;

  return (
    <button
      onClick={() => onPick(on ? "all" : tile.key)}
      aria-pressed={on}
      aria-label={`${tile.label}: ${count}`}
      style={{
        background: on ? tile.soft : "transparent",
        border: `1px solid ${on ? tile.accent : "transparent"}`,
        borderRadius: 14,
        padding: "6px 2px 8px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        minWidth: 0,
      }}
    >
      <span style={{ position: "relative", width: RING, height: RING, flex: "0 0 auto" }}>
        <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true">
          <circle
            cx={RING / 2} cy={RING / 2} r={(RING - STROKE) / 2}
            fill="none" stroke={ringColor} strokeWidth={STROKE}
          />
        </svg>

        {/* The icon lives inside the ring rather than beside the label. Four
            across on a phone leaves roughly 83px a column, and "Announcements"
            alone is 109px — the icon next to it forced the word to break
            mid-syllable. Inside, the label gets the full column. */}
        <span
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 1,
          }}
        >
          <Icon size={12} style={{ color: empty && !on ? T.faint : tile.accent, flex: "0 0 auto" }} />
          <span style={{ fontSize: 17.5, fontWeight: 800, color: numColor, lineHeight: 1 }}>
            {count}
          </span>
        </span>
      </span>

      {/* Two lines' worth of height always, so the four rings sit on one
          baseline whether the label wraps or not. */}
      <span
        className="eq-ring-label"
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: on ? tile.accent : (empty ? T.faint : T.sub),
          textAlign: "center",
          lineHeight: 1.15,
          minHeight: 27,
          minWidth: 0,
          hyphens: "auto",
          WebkitHyphens: "auto",
        }}
      >
        {tile.short}
      </span>

    </button>
  );
}

// Four shortcuts, one per category. Tapping one filters the feed below rather
// than navigating away — the point of the home screen is that everything is
// still visible without leaving it.
export default function HomeTiles({ counts, active, onPick }) {
  return (
    <div
      className="eq-tiles"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 4,
        alignItems: "start",
      }}
    >
      {CATEGORIES.map((t) => (
        <Ring
          key={t.key}
          tile={t}
          count={counts?.[t.key] || 0}
          on={active === t.key}
          onPick={onPick}
        />
      ))}
    </div>
  );
}
