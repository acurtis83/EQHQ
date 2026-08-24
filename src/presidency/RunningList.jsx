import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, X, Paperclip, Link2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { CategoryQuickPick, CategoryPicker, OpenCallings } from "../components/AgendaCategory";
import { AGENDA_CATEGORIES } from "../lib/domain/agendaCategories";
import { T, card, Btn, Input, Area, Chip, Empty } from "../components/ui";
import AttachSheet from "../components/AttachSheet";
import AssigneePicker from "../components/AssigneePicker";
import CategoryHub from "../components/CategoryHub";
import ViewToggle from "../components/ViewToggle";
import { useViewMode, VIEWS } from "../lib/useViewMode";
import { groupByCategory } from "../lib/domain/printPlan";
import { fmtShort, toIso } from "../lib/domain/dates";

export const BUCKETS = [
  { key: "topics", label: "Topics", hint: "Things to talk through together" },
  { key: "actions", label: "Action Items", hint: "Someone owes something" },
  { key: "watch", label: "Ministering Checks", hint: "Brethren to check on" },
  { key: "moves", label: "Move-Ins / Outs", hint: "New faces and departures" },
  { key: "service", label: "Service", hint: "Needs and opportunities" },
  { key: "missionary", label: "Missionary", hint: "Referrals and returning members" },
];

export function overdueDays(due) {
  if (!due) return 0;
  const today = toIso(new Date());
  if (due >= today) return 0;
  return Math.round((new Date(today) - new Date(due)) / 86400000);
}

export default function RunningList({ onCountChange, onGo }) {
  const goCalling = (callingId) => onGo?.("callings", { callingId });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draftFor, setDraftFor] = useState(null);
  const [draft, setDraft] = useState({ text: "", who: "", notes: "", due_date: "", category: "" });
  const [editing, setEditing] = useState(null);
  const [attachFor, setAttachFor] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("running_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) setErr(error.message);
    else setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    onCountChange?.(items.filter((i) => !i.done).length);
  }, [items, onCountChange]);

  const [view, setView] = useViewMode();
  const grouped = view === VIEWS.CATEGORY;

  const byBucket = useMemo(() => {
    const out = {};
    for (const b of BUCKETS) out[b.key] = [];
    for (const it of items) (out[it.bucket] ||= []).push(it);
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => {
        if (!!a.done !== !!b.done) return a.done ? 1 : -1;
        const da = a.due_date || "", db = b.due_date || "";
        if (!da && !db) return a.sort_order - b.sort_order;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      });
    }
    return out;
  }, [items]);

  // The same items gathered by subject rather than by bucket, so the planner
  // and the agenda group the same way. A planner item with no category falls
  // back to its bucket's name, which is already a subject — "Ministering
  // Checks", "Service" — so nothing lands in an "Other" pile.
  const groups = useMemo(() => groupByCategory(
    BUCKETS.map((b) => ({
      key: b.key, label: b.label,
      items: (byBucket[b.key] || []).filter((i) => showDone || !i.done),
    })).filter((b) => b.items.length),
    AGENDA_CATEGORIES
  ), [byBucket, showDone]);


  /**
   * The form for a new planner item.
   *
   * One form for both arrangements. Grouped, the category is already decided —
   * it's the hub the plus was tapped on — so the picker is hidden rather than
   * asking again for something already answered.
   */
  const addForm = (bucket, b, fixedCategory) => (
    <div style={{ background: T.inset, borderRadius: 12, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <Input
        value={draft.text} onChange={(v) => setDraft({ ...draft, text: v })}
        placeholder={b && b.key === "watch" ? "Who are we checking on?" : "What is it?"}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <AssigneePicker value={draft.who} onChange={(v) => setDraft({ ...draft, who: v })} />
        <Input type="date" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v })} />
      </div>
      {!fixedCategory && (
        <CategoryPicker value={draft.category} onChange={(v) => setDraft({ ...draft, category: v || "" })} />
      )}
      <Area value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="Notes (optional)" rows={2} />
      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="primary" onClick={() => add(bucket)} disabled={!draft.text.trim()}>Add</Btn>
        <Btn kind="plain" onClick={() => setDraftFor(null)}>Cancel</Btn>
      </div>
    </div>
  );

  const add = async (bucket) => {
    if (!draft.text.trim()) return;
    const { error } = await supabase.from("running_items").insert({
      bucket,
      text: draft.text.trim(),
      who: draft.who.trim() || null,
      notes: draft.notes.trim() || null,
      due_date: draft.due_date || null,
      category: draft.category || null,
      sort_order: items.filter((i) => i.bucket === bucket).length,
    });
    if (error) setErr(error.message);
    else {
      setDraft({ text: "", who: "", notes: "", due_date: "", category: "" });
      setDraftFor(null);
      load();
    }
  };

  const patch = async (id, fields) => {
    const { error } = await supabase.from("running_items").update(fields).eq("id", id);
    if (error) setErr(error.message);
    else load();
  };

  const remove = async (it) => {
    if (!confirm(`Remove "${it.text}"?`)) return;
    const { error } = await supabase.from("running_items").delete().eq("id", it.id);
    if (error) setErr(error.message);
    else load();
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading Planner…</div>;
  }

  return (
    <div>
      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 14.5, color: T.sub }}>
          {items.filter((i) => !i.done).length} open
        </div>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: T.sub, fontWeight: 600 }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show completed
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <ViewToggle value={view} onChange={setView} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {grouped ? groups.map((g) => {
          // A hub built from a bucket adds into that bucket; a real category
          // adds to Topics, tagged, which is where a subject with no obvious
          // bucket belongs.
          const bucket = g.section || "topics";
          const token = `hub:${g.key}`;
          return (
            <CategoryHub
              key={g.key}
              label={g.label}
              accent={g.accent}
              count={g.items.length}
              open={g.items.filter((i) => !i.done).length}
              adding={draftFor === token}
              addForm={addForm(bucket, null, !g.section)}
              onAdd={() => {
                setDraftFor(draftFor === token ? null : token);
                setDraft({ text: "", who: "", notes: "", due_date: "", category: g.section ? "" : g.key });
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {g.items.map((it) => (
                  <Row
                    key={it.id} it={it}
                    editing={editing === it.id}
                    onEdit={() => setEditing(editing === it.id ? null : it.id)}
                    onPatch={patch} onRemove={remove}
                    onAttach={setAttachFor}
                    onGoCalling={goCalling}
                    showCategory={false}
                  />
                ))}
              </div>
            </CategoryHub>
          );
        }) : BUCKETS.map((b) => {
          const list = byBucket[b.key].filter((i) => showDone || !i.done);
          const open = byBucket[b.key].filter((i) => !i.done).length;
          return (
            <div key={b.key} style={{ ...card, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16.5, fontWeight: 700, color: T.ink }}>{b.label}</span>
                {open > 0 && <Chip>{open}</Chip>}
                <Btn
                  size="sm" kind="plain" style={{ marginLeft: "auto" }}
                  onClick={() => { setDraftFor(draftFor === b.key ? null : b.key); setDraft({ text: "", who: "", notes: "", due_date: "", category: "" }); }}
                >
                  <Plus size={15} />Add
                </Btn>
              </div>
              <div style={{ fontSize: 13.5, color: T.faint, marginBottom: 10 }}>{b.hint}</div>

              {draftFor === b.key && addForm(b.key, b)}

              {!list.length ? (
                <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>Nothing here.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {list.map((it) => (
                    <Row
                      key={it.id} it={it}
                      editing={editing === it.id}
                      onEdit={() => setEditing(editing === it.id ? null : it.id)}
                      onPatch={patch} onRemove={remove}
                      onAttach={setAttachFor}
                      onGoCalling={goCalling}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {grouped && (
          <div>
            <Btn
              kind="soft"
              onClick={() => {
                setDraftFor(draftFor === "hub:new" ? null : "hub:new");
                setDraft({ text: "", who: "", notes: "", due_date: "", category: "" });
              }}
            >
              <Plus size={15} />Add To Another Category
            </Btn>
            {draftFor === "hub:new" && (
              <div style={{ marginTop: 10 }}>{addForm("topics", null)}</div>
            )}
          </div>
        )}
      </div>

      {attachFor && (
        <AttachSheet
          item={attachFor}
          table="running_items"
          folder="planner"
          onClose={() => setAttachFor(null)}
          onSaved={() => { setAttachFor(null); load(); }}
        />
      )}

      {!items.length && (
        <div style={{ marginTop: 12 }}>
          <Empty
            title="The Planner Is Empty"
            hint="Add anything that should come up at the next Presidency Meeting. Items here can be pulled straight onto an agenda."
          />
        </div>
      )}
    </div>
  );
}

function Row({ it, editing, onEdit, onPatch, onRemove, onAttach, onGoCalling, showCategory = true }) {
  const [text, setText] = useState(it.text);
  const [who, setWho] = useState(it.who || "");
  const [notes, setNotes] = useState(it.notes || "");
  const [due, setDue] = useState(it.due_date || "");
  const [cat, setCat] = useState(it.category || "");
  const late = overdueDays(it.due_date);
  // The category tints the card's edge, so the list can be scanned by subject.
  const meta = it.category ? AGENDA_CATEGORIES.find((c) => c.key === it.category) : null;
  const accent = it.done ? T.lineSoft : (meta ? meta.accent : T.lineSoft);

  const save = () => {
    onPatch(it.id, {
      text: text.trim() || it.text,
      who: who.trim() || null,
      notes: notes.trim() || null,
      due_date: due || null,
      category: cat || null,
    });
    onEdit();
  };

  if (editing) {
    return (
      <div style={{ background: T.inset, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Input value={text} onChange={setText} />
        <div style={{ display: "flex", gap: 8 }}>
          <AssigneePicker value={who} onChange={setWho} />
          <Input type="date" value={due} onChange={setDue} />
        </div>
        <CategoryPicker value={cat} onChange={setCat} />
        <Area value={notes} onChange={setNotes} placeholder="Notes" rows={2} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="primary" size="sm" onClick={save}>Save</Btn>
          <Btn kind="plain" size="sm" onClick={onEdit}>Cancel</Btn>
          <Btn kind="plain" size="sm" onClick={() => onAttach?.(it)}>
            <Paperclip size={14} />Link Or File
          </Btn>
          <Btn kind="plain" size="sm" style={{ marginLeft: "auto" }} onClick={() => onRemove(it)}>
            <Trash2 size={14} />
          </Btn>
        </div>
      </div>
    );
  }

  return (
    // An outlined card, matching the meeting agenda — a long list ran together
    // and it was hard to see where one item's notes ended.
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        background: T.panel,
        border: `1px solid ${T.lineSoft}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <button
        onClick={() => onPatch(it.id, { done: !it.done })}
        aria-label={it.done ? "Mark not done" : "Mark done"}
        style={{
          flex: "0 0 auto", width: 21, height: 21, marginTop: 1, borderRadius: 7,
          border: `1.5px solid ${it.done ? T.green : T.line}`,
          background: it.done ? T.green : "transparent",
          color: "#fff", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        {it.done && <Check size={13} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }} onClick={onEdit}>
        <div style={{
          fontSize: 15.5, color: it.done ? T.faint : T.ink, fontWeight: 500,
          textDecoration: it.done ? "line-through" : "none", cursor: "pointer",
        }}>
          {it.text}
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
          {/* Tappable, in both views — the grouped view is where you most
              need to move something out of the wrong pile. */}
          <CategoryQuickPick
            value={it.category}
            onChange={(v) => onPatch(it.id, { category: v })}
          />
          {it.who && <Chip color={T.sub} bg={T.inset}>{it.who}</Chip>}
          {it.due_date && (
            <Chip
              color={late ? T.red : T.sub}
              bg={late ? T.redSoft : T.inset}
            >
              {late ? `overdue by ${late} day${late === 1 ? "" : "s"}` : fmtShort(it.due_date)}
            </Chip>
          )}
        </div>
        {it.notes && (
          <div style={{ fontSize: 14, color: T.sub, marginTop: 5, lineHeight: 1.5 }}>{it.notes}</div>
        )}

        {/* Live from the tracker, not a copy that goes stale. */}
        {it.category === "callings" && <OpenCallings onGo={onGoCalling} />}

        {/* Offered on the row itself. It used to live only inside edit mode,
            which made it look like the Planner didn't support attachments. */}
        {!it.link_url && !it.attachment_url && onAttach && (
          <button
            onClick={(e) => { e.stopPropagation(); onAttach(it); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 13, fontWeight: 700, color: T.faint,
            }}
          >
            <Paperclip size={12} />Add Link Or File
          </button>
        )}

        {/* Links and files open straight from the row. stopPropagation keeps a
            tap on the link from also opening the row for editing. */}
        {(it.link_url || it.attachment_url) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            {it.link_url && (
              <a href={it.link_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
                <Link2 size={12} />Link
              </a>
            )}
            {it.attachment_url && (
              <a href={it.attachment_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
                <Paperclip size={12} />{it.attachment_name || "Attachment"}
              </a>
            )}
            {onAttach && (
              <button
                onClick={(e) => { e.stopPropagation(); onAttach(it); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: T.faint }}
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
