import { Bell, Calendar, ClipboardList } from "lucide-react";
import TempleIcon from "../components/TempleIcon";
import { T } from "../components/ui";
import { CATEGORIES } from "./categories";

// The temple is drawn to match the ward mark; lucide has no equivalent.
const ICONS = { bell: Bell, temple: TempleIcon, calendar: Calendar, clipboard: ClipboardList };

/**
 * One category, as a square tile.
 *
 * Four across in a single row rather than stacked 2x2 — the stack was what
 * pushed the posts below the fold. At four columns a phone gives each tile
 * about 83px, so the label hyphenates instead of breaking mid-syllable, and
 * every tile reserves two lines of label height so the row stays level.
 */
function Tile({ tile, count, on, onPick }) {
  const Icon = ICONS[tile.icon];
  const empty = count === 0;

  // A zero shouldn't shout. Muted icon, muted number — it reads as "nothing
  // here" at a glance instead of competing with the categories that have
  // something in them.
  const iconColor = on ? tile.accent : (empty ? T.faint : tile.accent);
  const countColor = on ? tile.accent : (empty ? T.faint : T.sub);

  return (
    <button
      onClick={() => onPick(on ? "all" : tile.key)}
      aria-pressed={on}
      aria-label={`${tile.label}: ${count}`}
      style={{
        background: on ? tile.soft : T.panel,
        border: `1px solid ${on ? tile.accent : T.lineSoft}`,
        borderRadius: 14,
        // Shorter without shrinking anything: the height came from padding and
        // gaps, not from the icon or the type, so those are what came off.
        padding: "9px 6px 8px",
        minHeight: 96,
        height: "100%",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        minWidth: 0,
        boxShadow: on ? "none" : "var(--card-shadow)",
      }}
    >
      <Icon size={30} style={{ color: iconColor, flex: "0 0 auto" }} />

      {/* Two lines' worth of height always, so the four tiles sit level
          whether the label wraps or not. */}
      <span
        className="eq-tile-label"
        style={{
          // "Announce-" — the widest piece after hyphenation — costs about 6px
          // of width for every 1px of font size, and a tile has roughly 68px of
          // room at 375px. So 14px only fits from about 430px up; the
          // stylesheet steps it down below that rather than letting the word
          // break onto a third line.
          fontSize: 14,
          fontWeight: 700,
          color: on ? tile.accent : (empty ? T.faint : T.ink),
          textAlign: "center",
          lineHeight: 1.1,
          minHeight: 31,
          minWidth: 0,
          hyphens: "auto",
          WebkitHyphens: "auto",
        }}
      >
        {tile.short}
      </span>

      <span style={{ fontSize: 18, fontWeight: 800, color: countColor, lineHeight: 1 }}>
        {count}
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
        gap: 7,
        alignItems: "stretch",
      }}
    >
      {CATEGORIES.map((t) => (
        <Tile
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
