import { Bell, Star, Calendar, Users } from "lucide-react";
import { T } from "../components/ui";
import { CATEGORIES, GROUPS_TILE } from "./categories";

const ICONS = { bell: Bell, star: Star, calendar: Calendar, users: Users };

// Four shortcuts under the hero. Tapping one filters the feed below rather
// than navigating away — the point of the home screen is that everything is
// still visible without leaving it.
export default function HomeTiles({ counts, active, onPick, onGroups }) {
  const tiles = [...CATEGORIES, GROUPS_TILE];

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
        const isGroups = t.key === "groups";
        const on = !isGroups && active === t.key;
        const count = isGroups ? null : counts?.[t.key] || 0;

        return (
          <button
            key={t.key}
            onClick={() => (isGroups ? onGroups?.() : onPick(on ? "all" : t.key))}
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
                fontSize: 9.5,
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
              <span style={{ fontSize: 9.5, color: T.faint, fontWeight: 600 }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
