import { Bell, Calendar, ClipboardList } from "lucide-react";
import TempleIcon from "../components/TempleIcon";
import { T } from "../components/ui";
import { CATEGORIES } from "./categories";

// The temple is drawn to match the ward mark; lucide has no equivalent.
const ICONS = { bell: Bell, temple: TempleIcon, calendar: Calendar, clipboard: ClipboardList };

// Four shortcuts under the hero. Tapping one filters the feed below rather
// than navigating away — the point of the home screen is that everything is
// still visible without leaving it.
// Four shortcuts, one per category — Groups is out for now, and Assignments
// takes its place so every tile filters the feed rather than one of them being
// a door to somewhere else.
export default function HomeTiles({ counts, active, onPick }) {
  const tiles = CATEGORIES;

  return (
    <div
      className="eq-tiles"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 8,
        alignItems: "stretch",
        height: "100%",
      }}
    >
      {tiles.map((t) => {
        const Icon = ICONS[t.icon];
        const on = active === t.key;
        const count = counts?.[t.key] || 0;

        return (
          <button
            key={t.key}
            onClick={() => onPick(on ? "all" : t.key)}
            aria-pressed={on}
            style={{
              background: on ? t.soft : T.panel,
              border: `1px solid ${on ? t.accent : T.lineSoft}`,
              borderRadius: 14,
              // Centred both ways: the tiles stretch to fill the row beside
              // Upcoming Events, and content pinned to the top left a lot of
              // empty space underneath.
              padding: "16px 8px",
              minHeight: 104,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              minWidth: 0,
              boxShadow: on ? "none" : "var(--card-shadow)",
            }}
          >
            <Icon size={26} style={{ color: t.accent, flex: "0 0 auto" }} />
            <span
              style={{
                // Two per row now, so there's room for a readable label; it
                // still wraps rather than spilling out of the tile.
                fontSize: 13.5,
                fontWeight: 700,
                color: on ? t.accent : T.ink,
                textAlign: "center",
                lineHeight: 1.2,
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
            >
              {t.short}
            </span>
            {count > 0 && (
              <span style={{ fontSize: 15.5, color: T.sub, fontWeight: 800, lineHeight: 1 }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
