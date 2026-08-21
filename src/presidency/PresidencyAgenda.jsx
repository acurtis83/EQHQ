import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Copy, ChevronLeft, CalendarPlus, ArrowDownToLine } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Area, Chip, Empty } from "../components/ui";
import { fmtDate, fmtShort, toIso } from "../lib/domain/dates";
import { BUCKETS, overdueDays } from "./RunningList";

const SECTIONS = [
  { key: "items", label: "Agenda items" },
  { key: "ministering", label: "Ministering checks" },
];

const blankItem = { text: "", who: "", notes: "", due_date: "", section: "items" };

export default function PresidencyAgenda() {
  const [agendas, setAgendas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const loadAgendas = useCallback(async () => {
    const { data, error } = await supabase
      .from("agendas")
      .select("*")
      .eq("kind", "presidency")
      .order("meeting_date", { ascending: false, nullsFirst: false });
    if (error) setErr(error.message);
    else setAgendas(data || []);
    setLoading(false);
  }, []);

  const loadItems = useCallback(async (agendaId) => {
    if (!agendaId) { setItems([]); return; }
    const { data, error } = await supabase
      .from("agenda_items")
      .select("*")
      .eq("agenda_id", agendaId)
      .order("sort_order", { ascending: true });
    if (error) setErr(error.message);
    else setItems(data || []);
  }, []);

  useEffect(() => { loadAgendas(); }, [loadAgendas]);
  useEffect(() => { loadItems(selected?.id); }, [selected, loadItems]);

  const createAgenda = async () => {
    const { data, error } = await supabase
      .from("agendas")
      .insert({ kind: "presidency", meeting_date: toIso(new Date()), meeting_time: "", location: "" })
      .select()
      .single();
    if (error) { setErr(error.message); return; }
    await loadAgendas();
    setSelected(data);
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 14, padding: 24, textAlign: "center" }}>Loading agendas…</div>;
  }

  if (selected) {
    return (
      <AgendaDetail
        agenda={selected}
        items={items}
        agendas={agendas}
        onBack={() => { setSelected(null); loadAgendas(); }}
        onReloadItems={() => loadItems(selected.id)}
        onPatchAgenda={async (fields) => {
          const { error } = await supabase.from("agendas").update(fields).eq("id", selected.id);
          if (error) setErr(error.message);
          else setSelected({ ...selected, ...fields });
        }}
        onDelete={async () => {
          if (!confirm("Delete this agenda and all its items?")) return;
          await supabase.from("agendas").delete().eq("id", selected.id);
          setSelected(null);
          loadAgendas();
        }}
        flash={flash}
        toast={toast}
        err={err}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
            Presidency meetings
          </div>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 3 }}>
            Agendas build from the running list and carry unfinished items forward.
          </div>
        </div>
        <Btn kind="primary" style={{ marginLeft: "auto", flex: "0 0 auto" }} onClick={createAgenda}>
          <CalendarPlus size={15} />New
        </Btn>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 13.5 }}>
          {err}
        </div>
      )}

      {!agendas.length ? (
        <Empty
          title="No presidency agendas yet"
          hint="Start one and it will pull in whatever is open on the running list."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {agendas.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              style={{ ...card, padding: 14, textAlign: "left", cursor: "pointer", width: "100%" }}
            >
              <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>
                {a.meeting_date ? fmtDate(a.meeting_date) : "Undated meeting"}
              </div>
              <div style={{ fontSize: 13, color: T.sub, marginTop: 3 }}>
                {[a.meeting_time, a.location].filter(Boolean).join(" · ") || "Tap to open"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaDetail({ agenda, items, agendas, onBack, onReloadItems, onPatchAgenda, onDelete, flash, toast, err }) {
  const [adding, setAdding] = useState(null); // section key
  const [draft, setDraft] = useState(blankItem);
  const [editing, setEditing] = useState(null);
  const [pullOpen, setPullOpen] = useState(false);

  const bySection = useMemo(() => {
    const out = {};
    for (const s of SECTIONS) out[s.key] = [];
    for (const it of items) (out[it.section] ||= []).push(it);
    return out;
  }, [items]);

  const addItem = async (section) => {
    if (!draft.text.trim()) return;
    const { error } = await supabase.from("agenda_items").insert({
      agenda_id: agenda.id,
      section,
      text: draft.text.trim(),
      who: draft.who.trim() || null,
      notes: draft.notes.trim() || null,
      due_date: draft.due_date || null,
      sort_order: items.filter((i) => i.section === section).length,
    });
    if (!error) { setDraft(blankItem); setAdding(null); onReloadItems(); }
  };

  const patchItem = async (id, fields) => {
    await supabase.from("agenda_items").update(fields).eq("id", id);
    onReloadItems();
  };

  const removeItem = async (it) => {
    await supabase.from("agenda_items").delete().eq("id", it.id);
    onReloadItems();
  };

  // Carry forward anything still open from the previous meeting.
  const carryOver = async () => {
    const prior = agendas
      .filter((a) => a.id !== agenda.id && (a.meeting_date || "") < (agenda.meeting_date || "￿"))
      .sort((a, b) => (b.meeting_date || "").localeCompare(a.meeting_date || ""))[0];
    if (!prior) { flash("No earlier meeting to carry from"); return; }

    const { data: prev } = await supabase
      .from("agenda_items").select("*").eq("agenda_id", prior.id).eq("done", false);
    if (!prev?.length) { flash("Nothing open on the last agenda"); return; }

    const have = new Set(items.map((i) => i.text.toLowerCase()));
    const rows = prev
      .filter((p) => !have.has(p.text.toLowerCase()))
      .map((p, i) => ({
        agenda_id: agenda.id, section: p.section, text: p.text,
        who: p.who, notes: p.notes, due_date: p.due_date,
        sort_order: items.length + i,
      }));
    if (!rows.length) { flash("Already carried over"); return; }
    await supabase.from("agenda_items").insert(rows);
    onReloadItems();
    flash(`Carried over ${rows.length} item${rows.length === 1 ? "" : "s"}`);
  };

  const agendaText = () => {
    const lines = [];
    lines.push(`Elders Quorum Presidency Meeting`);
    if (agenda.meeting_date) lines.push(fmtDate(agenda.meeting_date));
    const meta = [agenda.meeting_time, agenda.location].filter(Boolean).join(" · ");
    if (meta) lines.push(meta);
    for (const s of SECTIONS) {
      const list = bySection[s.key] || [];
      if (!list.length) continue;
      lines.push("", s.label.toUpperCase());
      list.forEach((it) => {
        const bits = [it.done ? "[x]" : "[ ]", it.text];
        if (it.who) bits.push(`— ${it.who}`);
        if (it.due_date) bits.push(`(${fmtShort(it.due_date)})`);
        lines.push(bits.join(" "));
        if (it.notes) lines.push(`    ${it.notes}`);
      });
    }
    return lines.join("\n");
  };

  const copy = async () => {
    const text = agendaText();
    try {
      await navigator.clipboard.writeText(text);
      flash("Agenda copied");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      flash("Agenda copied");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Btn kind="plain" size="sm" onClick={onBack}><ChevronLeft size={16} />All meetings</Btn>
        <Btn kind="plain" size="sm" style={{ marginLeft: "auto" }} onClick={copy}><Copy size={14} />Copy</Btn>
        <Btn kind="plain" size="sm" onClick={onDelete}><Trash2 size={14} /></Btn>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 13.5 }}>
          {err}
        </div>
      )}

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Lbl label="Date">
            <Input type="date" value={agenda.meeting_date || ""} onChange={(v) => onPatchAgenda({ meeting_date: v || null })} />
          </Lbl>
          <Lbl label="Time">
            <Input value={agenda.meeting_time || ""} onChange={(v) => onPatchAgenda({ meeting_time: v })} placeholder="7:00 PM" />
          </Lbl>
        </div>
        <div style={{ marginTop: 10 }}>
          <Lbl label="Location">
            <Input value={agenda.location || ""} onChange={(v) => onPatchAgenda({ location: v })} placeholder="Bishop's office" />
          </Lbl>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn kind="soft" onClick={() => setPullOpen(true)}><ArrowDownToLine size={15} />Pull from running list</Btn>
        <Btn kind="ghost" onClick={carryOver}>Carry over open items</Btn>
      </div>

      {toast && (
        <div style={{
          ...card, background: T.greenSoft, borderColor: T.green, color: T.green,
          marginBottom: 12, fontSize: 13.5, padding: "10px 14px",
        }}>
          {toast}
        </div>
      )}

      {SECTIONS.map((s) => {
        const list = bySection[s.key] || [];
        return (
          <div key={s.key} style={{ ...card, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{s.label}</span>
              {list.length > 0 && <Chip>{list.filter((i) => !i.done).length} open</Chip>}
              <Btn
                size="sm" kind="plain" style={{ marginLeft: "auto" }}
                onClick={() => { setAdding(adding === s.key ? null : s.key); setDraft(blankItem); }}
              >
                <Plus size={15} />Add
              </Btn>
            </div>

            {adding === s.key && (
              <div style={{ background: T.inset, borderRadius: 12, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <Input value={draft.text} onChange={(v) => setDraft({ ...draft, text: v })} placeholder="What needs discussing?" />
                <div style={{ display: "flex", gap: 8 }}>
                  <Input value={draft.who} onChange={(v) => setDraft({ ...draft, who: v })} placeholder="Who" />
                  <Input type="date" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v })} />
                </div>
                <Area value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="Notes (optional)" rows={2} />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn kind="primary" onClick={() => addItem(s.key)} disabled={!draft.text.trim()}>Add</Btn>
                  <Btn kind="plain" onClick={() => setAdding(null)}>Cancel</Btn>
                </div>
              </div>
            )}

            {!list.length ? (
              <div style={{ fontSize: 13, color: T.faint, fontStyle: "italic" }}>
                {s.key === "ministering" ? "No ministering checks yet." : "Nothing on the agenda yet."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {list.map((it) => (
                  <ItemRow
                    key={it.id} it={it}
                    editing={editing === it.id}
                    onEdit={() => setEditing(editing === it.id ? null : it.id)}
                    onPatch={patchItem} onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {pullOpen && (
        <PullSheet
          agenda={agenda}
          existing={items}
          onClose={() => setPullOpen(false)}
          onPulled={(n) => { setPullOpen(false); onReloadItems(); flash(`Added ${n} item${n === 1 ? "" : "s"}`); }}
        />
      )}
    </div>
  );
}

function PullSheet({ agenda, existing, onClose, onPulled }) {
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("running_items").select("*").eq("done", false)
        .order("bucket", { ascending: true });
      const have = new Set(existing.map((i) => i.text.toLowerCase()));
      setRows((data || []).filter((r) => !have.has(r.text.toLowerCase())));
      setLoading(false);
    })();
  }, [existing]);

  const commit = async () => {
    const chosen = rows.filter((r) => picked[r.id]);
    if (!chosen.length) return;
    const insert = chosen.map((r, i) => ({
      agenda_id: agenda.id,
      section: r.bucket === "watch" ? "ministering" : "items",
      text: r.text, who: r.who, notes: r.notes, due_date: r.due_date,
      category: r.bucket,
      sort_order: existing.length + i,
    }));
    await supabase.from("agenda_items").insert(insert);
    onPulled(insert.length);
  };

  const count = Object.values(picked).filter(Boolean).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto",
          borderRadius: "18px 18px 0 0", padding: 18, display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>Pull from running list</div>
        <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>
          Open items only. Watch-list entries land under Ministering checks.
        </div>

        {loading ? (
          <div style={{ color: T.sub, fontSize: 14, padding: 16, textAlign: "center" }}>Loading…</div>
        ) : !rows.length ? (
          <div style={{ color: T.sub, fontSize: 14, padding: 16, textAlign: "center" }}>
            Nothing left to pull — it's all on the agenda already.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r) => {
              const b = BUCKETS.find((x) => x.key === r.bucket);
              const late = overdueDays(r.due_date);
              return (
                <label
                  key={r.id}
                  style={{
                    display: "flex", gap: 10, alignItems: "flex-start", padding: 11,
                    background: picked[r.id] ? T.primarySoft : T.panel,
                    border: `1px solid ${picked[r.id] ? T.primary : T.lineSoft}`,
                    borderRadius: 12, cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox" checked={!!picked[r.id]} style={{ width: "auto", marginTop: 3 }}
                    onChange={(e) => setPicked({ ...picked, [r.id]: e.target.checked })}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14.5, color: T.ink, fontWeight: 500 }}>{r.text}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      <Chip color={T.sub} bg={T.inset}>{b?.label || r.bucket}</Chip>
                      {r.who && <Chip color={T.sub} bg={T.inset}>{r.who}</Chip>}
                      {late > 0 && <Chip color={T.red} bg={T.redSoft}>overdue by {late}d</Chip>}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="plain" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={commit} disabled={!count} style={{ flex: 1, justifyContent: "center" }}>
            Add {count || ""} to agenda
          </Btn>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ it, editing, onEdit, onPatch, onRemove }) {
  const [text, setText] = useState(it.text);
  const [who, setWho] = useState(it.who || "");
  const [notes, setNotes] = useState(it.notes || "");
  const [due, setDue] = useState(it.due_date || "");
  const late = overdueDays(it.due_date);

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
          <Btn kind="primary" size="sm" onClick={() => {
            onPatch(it.id, {
              text: text.trim() || it.text, who: who.trim() || null,
              notes: notes.trim() || null, due_date: due || null,
            });
            onEdit();
          }}>Save</Btn>
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
          background: it.done ? T.green : "transparent", color: "#fff",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        {it.done && <Check size={13} />}
      </button>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onEdit}>
        <div style={{
          fontSize: 14.5, color: it.done ? T.faint : T.ink, fontWeight: 500,
          textDecoration: it.done ? "line-through" : "none",
        }}>
          {it.text}
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
          {it.who && <Chip color={T.sub} bg={T.inset}>{it.who}</Chip>}
          {it.due_date && (
            <Chip color={late ? T.red : T.sub} bg={late ? T.redSoft : T.inset}>
              {late ? `overdue by ${late} day${late === 1 ? "" : "s"}` : fmtShort(it.due_date)}
            </Chip>
          )}
        </div>
        {it.notes && <div style={{ fontSize: 13, color: T.sub, marginTop: 5, lineHeight: 1.5 }}>{it.notes}</div>}
      </div>
    </div>
  );
}

function Lbl({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
        {label}
      </span>
      {children}
    </label>
  );
}
