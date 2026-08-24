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

/**
 * Retag an item without opening it.
 *
 * Sorting a pile of untagged ministering items into Ministering and Brothers
 * in Need meant opening each card, changing a dropdown, and saving — three
 * taps and a re-render per item, for something that is one decision. This is
 * the chip itself as the control: tap it, pick, done.
 */
export function CategoryQuickPick({ value, onChange, label = "Set category" }) {
  const { extra } = useAgendaCategories();
  const [open, setOpen] = useState(false);
  const cat = agendaCategory(value, extra);
  const options = [...AGENDA_CATEGORIES, ...extra];

  if (open) {
    return (
      <Select
        value={value || ""}
        onChange={(v) => { onChange(v || null); setOpen(false); }}
        style={{ fontSize: 14, padding: "5px 8px", width: "auto", minWidth: 160 }}
      >
        <option value="">No category</option>
        {options.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </Select>
    );
  }

  return (
    <button
      type="button"
      aria-label={cat ? `Change category from ${cat.label}` : label}
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
    >
      {cat
        ? <Chip color={cat.accent} bg={cat.soft}>{cat.label}</Chip>
        : <Chip color={T.faint} bg={T.inset}>{label}</Chip>}
    </button>
  );
}

// A new category gets the same dark grey as every built-in one. There used to
// be a colour picker here; the colours came off the agenda entirely, so
// choosing one was a decision with no outcome.
const NEW_CATEGORY_TONE = { accent: "var(--sub)", soft: "var(--inset)" };

export function CategoryPicker({ value, onChange }) {
  const { extra, reload } = useAgendaCategories();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
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
      accent: NEW_CATEGORY_TONE.accent, soft: NEW_CATEGORY_TONE.soft,
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
