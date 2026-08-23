import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Chip, Select } from "./ui";
import { AGENDA_CATEGORIES, agendaCategory, openCallings } from "../lib/domain/agendaCategories";
import { CALLING_STAGE_COLOR } from "../lib/domain/constants";

/** The item's subject, as a chip. Nothing at all when it hasn't been set. */
export function CategoryChip({ value }) {
  const cat = agendaCategory(value);
  if (!cat) return null;
  return <Chip color={cat.accent} bg={cat.soft}>{cat.label}</Chip>;
}

/** Choosing the subject. "—" clears it, so a category isn't a one-way door. */
export function CategoryPicker({ value, onChange }) {
  return (
    <Select value={value || ""} onChange={(v) => onChange(v || null)}>
      <option value="">No category</option>
      {AGENDA_CATEGORIES.map((c) => (
        <option key={c.key} value={c.key}>{c.label}</option>
      ))}
    </Select>
  );
}

/**
 * What the tracker says is still open, under a Callings item.
 *
 * The point of tagging an item "Callings/Releasings" is that the presidency is
 * about to work through them — so rather than retyping the list into the
 * agenda every week, where it goes stale the moment a stage changes, the item
 * shows the tracker's current state and links back to it.
 *
 * Sustained and later stages are left out: by then it's a set-apart to
 * schedule, not a decision to make in this meeting.
 */
export function OpenCallings({ onGo }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("callings").select("id,position,candidate_name,stage");
      if (alive) setRows(openCallings(data));
    })();
    return () => { alive = false; };
  }, []);

  if (rows === null) return null;

  return (
    <div
      style={{
        marginTop: 8,
        background: T.inset,
        border: `1px solid ${T.lineSoft}`,
        borderRadius: 10,
        padding: "9px 11px",
      }}
    >
      <div style={{
        fontSize: 12, fontWeight: 800, color: T.sub, letterSpacing: "0.06em",
        textTransform: "uppercase", marginBottom: rows.length ? 7 : 0,
      }}>
        From the Callings Tracker
      </div>

      {!rows.length ? (
        <div style={{ fontSize: 13.5, color: T.faint, fontStyle: "italic" }}>
          Nothing open right now.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={(e) => { e.stopPropagation(); onGo?.(c.id); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: T.panel, border: `1px solid ${T.lineSoft}`, borderRadius: 8,
                padding: "7px 9px", cursor: onGo ? "pointer" : "default", textAlign: "left",
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, minWidth: 0, flex: 1 }}>
                {c.position}
                {c.candidate_name && (
                  <span style={{ color: T.sub, fontWeight: 500 }}> · {c.candidate_name}</span>
                )}
              </span>
              {/* The tracker's own colours, so a stage reads the same in both
                  places rather than being re-invented here. */}
              <Chip
                color={(CALLING_STAGE_COLOR[c.stage] || [T.sub, T.inset])[0]}
                bg={(CALLING_STAGE_COLOR[c.stage] || [T.sub, T.inset])[1]}
              >
                {c.stage}
              </Chip>
              {onGo && <ChevronRight size={14} style={{ color: T.faint, flex: "0 0 auto" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
