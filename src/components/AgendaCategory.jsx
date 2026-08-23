import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Btn, Chip, Input, Select } from "./ui";
import { AGENDA_CATEGORIES, agendaCategory, categoryKey, openCallings } from "../lib/domain/agendaCategories";
import { useAgendaCategories } from "../lib/useAgendaCategories";
import { CALLING_STAGE_COLOR } from "../lib/domain/constants";

/** The item's subject, as a chip. Nothing at all when it hasn't been set. */
export function CategoryChip({ value }) {
  const { extra } = useAgendaCategories();
  const cat = agendaCategory(value, extra);
  if (!cat) return null;
  return <Chip color={cat.accent} bg={cat.soft}>{cat.label}</Chip>;
}

// Colours offered to a new category. Deliberately the palette already in use
// rather than a free colour picker: the point is that a chip reads as part of
// the app, not that every category can be any colour.
const PALETTE = [
  { label: "Blue", accent: "var(--primary-deep)", soft: "var(--primary-soft)" },
  { label: "Green", accent: "var(--green)", soft: "var(--green-soft)" },
  { label: "Gold", accent: "var(--gold)", soft: "var(--gold-soft)" },
  { label: "Red", accent: "var(--red)", soft: "var(--red-soft)" },
  { label: "Grey", accent: "var(--sub)", soft: "var(--inset)" },
];

/**
 * Choosing the subject, or inventing one.
 *
 * "No category" clears it, so a category is never a one-way door, and
 * "+ Add a new category" opens a small inline form rather than sending you to
 * a settings screen mid-thought.
 */
export function CategoryPicker({ value, onChange }) {
  const { extra, reload } = useAgendaCategories();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [colour, setColour] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const options = [...AGENDA_CATEGORIES, ...extra];

  const create = async () => {
    const name = label.trim();
    if (!name) return;
    if (options.some((c) => c.label.toLowerCase() === name.toLowerCase())) {
      setErr("There's already a category with that name.");
      return;
    }
    setBusy(true); setErr("");
    const key = categoryKey(name, extra.map((c) => c.key));
    const { error } = await supabase.from("agenda_categories").insert({
      key, label: name,
      accent: PALETTE[colour].accent, soft: PALETTE[colour].soft,
      sort_order: extra.length,
    });
    setBusy(false);
    if (error) {
      setErr(/does not exist|schema cache/i.test(error.message)
        ? "Custom categories need the database updating — run supabase/catch-up.sql."
        : error.message);
      return;
    }
    await reload();
    // Selected straight away: you added it in order to use it.
    onChange(key);
    setAdding(false);
    setLabel("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <Select
        value={value || ""}
        onChange={(v) => {
          if (v === "__new") { setAdding(true); return; }
          onChange(v || null);
        }}
      >
        <option value="">No category</option>
        {options.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
        <option value="__new">+ Add a new category…</option>
      </Select>

      {adding && (
        <div style={{
          background: T.inset, border: `1px solid ${T.lineSoft}`, borderRadius: 10,
          padding: 10, display: "flex", flexDirection: "column", gap: 8,
        }}>
          <Input value={label} onChange={setLabel} placeholder="Category name" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PALETTE.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setColour(i)}
                aria-label={p.label}
                aria-pressed={colour === i}
                style={{
                  width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                  background: p.soft,
                  border: `2px solid ${colour === i ? p.accent : "transparent"}`,
                }}
              >
                <span style={{
                  display: "block", width: 10, height: 10, borderRadius: 3,
                  background: p.accent, margin: "0 auto",
                }} />
              </button>
            ))}
          </div>
          {err && <div style={{ fontSize: 13, color: T.red, lineHeight: 1.45 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" kind="primary" disabled={busy || !label.trim()} onClick={create}>
              {busy ? "Adding…" : "Add"}
            </Btn>
            <Btn size="sm" kind="plain" onClick={() => { setAdding(false); setErr(""); }}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
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
