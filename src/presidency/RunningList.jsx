import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Area, Chip, Empty } from "../components/ui";
import { fmtShort, toIso } from "../lib/domain/dates";

export const BUCKETS = [
  { key: "topics", label: "Topics", hint: "Things to talk through together" },
  { key: "actions", label: "Action items", hint: "Someone owes something" },
  { key: "watch", label: "Watch list", hint: "Brethren to check on" },
  { key: "moves", label: "Move-ins / outs", hint: "New faces and departures" },
  { key: "service", label: "Service", hint: "Needs and opportunities" },
  { key: "missionary", label: "Missionary", hint: "Referrals and returning members" },
];

export function overdueDays(due) {
  if (!due) return 0;
  const today = toIso(new Date());
  if (due >= today) return 0;
  return Math.round((new Date(today) - new Date(due)) / 86400000);
}

export default function RunningList({ onCountChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draftFor, setDraftFor] = useState(null);
  const [draft, setDraft] = useState({ text: "", who: "", notes: "", due_date: "" });
  const [editing, setEditing] = useState(null);
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

  const add = async (bucket) => {
    if (!draft.text.trim()) return;
    const { error } = await supabase.from("running_items").insert({
      bucket,
      text: draft.text.trim(),
      who: draft.who.trim() || null,
      notes: draft.notes.trim() || null,
      due_date: draft.due_date || null,
      sort_order: items.filter((i) => i.bucket === bucket).length,
    });
    if (error) setErr(error.message);
    else {
      setDraft({ text: "", who: "", notes: "", due_date: "" });
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
    return <div style={{ color: T.sub, fontSize: 14, padding: 24, textAlign: "center" }}>Loading Planner…</div>;
  }

  return (
    <div>
      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 13.5 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, color: T.sub }}>
          {items.filter((i) => !i.done).length} open
        </div>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: T.sub, fontWeight: 600 }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show completed
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {BUCKETS.map((b) => {
          const list = byBucket[b.key].filter((i) => showDone || !i.done);
          const open = byBucket[b.key].filter((i) => !i.done).length;
          return (
            <div key={b.key} style={{ ...card, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{b.label}</span>
                {open > 0 && <Chip>{open}</Chip>}
                <Btn
                  size="sm" kind="plain" style={{ marginLeft: "auto" }}
                  onClick={() => { setDraftFor(draftFor === b.key ? null : b.key); setDraft({ text: "", who: "", notes: "", due_date: "" }); }}
                >
                  <Plus size={15} />Add
                </Btn>
              </div>
              <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 10 }}>{b.hint}</div>

              {draftFor === b.key && (
                <div style={{ background: T.inset, borderRadius: 12, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <Input
                    value={draft.text} onChange={(v) => setDraft({ ...draft, text: v })}
                    placeholder={b.key === "watch" ? "Who are we checking on?" : "What is it?"}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input value={draft.who} onChange={(v) => setDraft({ ...draft, who: v })} placeholder="Who" />
                    <Input type="date" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v })} />
                  </div>
                  <Area value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="Notes (optional)" rows={2} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn kind="primary" onClick={() => add(b.key)} disabled={!draft.text.trim()}>Add</Btn>
                    <Btn kind="plain" onClick={() => setDraftFor(null)}>Cancel</Btn>
                  </div>
                </div>
              )}

              {!list.length ? (
                <div style={{ fontSize: 13, color: T.faint, fontStyle: "italic" }}>Nothing here.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {list.map((it) => (
                    <Row
                      key={it.id} it={it}
                      editing={editing === it.id}
                      onEdit={() => setEditing(editing === it.id ? null : it.id)}
                      onPatch={patch} onRemove={remove}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!items.length && (
        <div style={{ marginTop: 12 }}>
          <Empty
            title="The Planner is empty"
            hint="Add anything that should come up at the next Presidency Meeting. Items here can be pulled straight onto an agenda."
          />
        </div>
      )}
    </div>
  );
}

function Row({ it, editing, onEdit, onPatch, onRemove }) {
  const [text, setText] = useState(it.text);
  const [who, setWho] = useState(it.who || "");
  const [notes, setNotes] = useState(it.notes || "");
  const [due, setDue] = useState(it.due_date || "");
  const late = overdueDays(it.due_date);

  const save = () => {
    onPatch(it.id, {
      text: text.trim() || it.text,
      who: who.trim() || null,
      notes: notes.trim() || null,
      due_date: due || null,
    });
    onEdit();
  };

  if (editing) {
    return (
      <div style={{ background: T.inset, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Input value={text} onChange={setText} />
        <div style={{ display: "flex", gap: 8 }}>
          <Input value={who} onChange={setWho} placeholder="Who" />
          <Input type="date" value={due} onChange={setDue} />
        </div>
        <Area value={notes} onChange={setNotes} placeholder="Notes" rows={2} />
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="primary" size="sm" onClick={save}>Save</Btn>
          <Btn kind="plain" size="sm" onClick={onEdit}>Cancel</Btn>
          <Btn kind="plain" size="sm" style={{ marginLeft: "auto" }} onClick={() => onRemove(it)}>
            <Trash2 size={14} />
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0" }}>
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
          fontSize: 14.5, color: it.done ? T.faint : T.ink, fontWeight: 500,
          textDecoration: it.done ? "line-through" : "none", cursor: "pointer",
        }}>
          {it.text}
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
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
          <div style={{ fontSize: 13, color: T.sub, marginTop: 5, lineHeight: 1.5 }}>{it.notes}</div>
        )}
      </div>
    </div>
  );
}
