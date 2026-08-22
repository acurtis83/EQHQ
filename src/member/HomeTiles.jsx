import { Bell, Star, Calendar, ClipboardList } from "lucide-react";
import { T } from "../components/ui";
import { CATEGORIES } from "./categories";

const ICONS = { bell: Bell, star: Star, calendar: Calendar, clipboard: ClipboardList };

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
        marginBottom: 16,
        alignItems: "stretch",
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
              padding: "11px 4px 9px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 4,
              minWidth: 0,
              boxShadow: on ? "none" : "var(--card-shadow)",
            }}
          >
            <Icon size={19} style={{ color: t.accent, flex: "0 0 auto" }} />
            <span
              style={{
                // "Announcements" is long for a quarter-width tile — small and
                // allowed to wrap so it can never spill outside the tile.
                fontSize: 10.5,
                fontWeight: 700,
                color: on ? t.accent : T.ink,
                textAlign: "center",
                lineHeight: 1.15,
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
            >
              {t.short}
            </span>
            {count > 0 && (
              <span style={{ fontSize: 10.5, color: T.faint, fontWeight: 600 }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
