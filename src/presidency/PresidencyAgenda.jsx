import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Copy, ChevronLeft, ChevronUp, ChevronDown, CalendarPlus, ArrowDownToLine, Printer, Paperclip, Link2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import PersonPick from "../components/PersonPick";
import { CategoryQuickPick, CategoryPicker, OpenCallings } from "../components/AgendaCategory";
import { AGENDA_CATEGORIES } from "../lib/domain/agendaCategories";
import { useAgendaCategories } from "../lib/useAgendaCategories";
import { T, card, Btn, Input, Area, Chip, Empty } from "../components/ui";
import { fmtDate, fmtShort, toIso } from "../lib/domain/dates";
import { BUCKETS, overdueDays } from "./RunningList";
import AttachSheet from "../components/AttachSheet";
import AssigneePicker from "../components/AssigneePicker";
import CategoryHub from "../components/CategoryHub";
import ViewToggle from "../components/ViewToggle";
import { useViewMode, VIEWS } from "../lib/useViewMode";
import AgendaPrint from "../components/AgendaPrint";
import { choosePrintPlan, groupByCategory } from "../lib/domain/printPlan";
import { upcomingForSunday } from "../lib/domain/upcoming";

// One section. There used to be a second, "Ministering Checks", which was a
// third name for something the categories already covered — a `ministering`
// category called "Ministering" and a `need` category now called "Brothers in
// Need". Items sat in the section untagged, so nothing ever separated, and
// the section's name shadowed the category's in the grouped view.
const SECTIONS = [
  { key: "items", label: "Agenda Items" },
];

// Rows written when there was a Ministering Checks section still say so. They
// belong in the one section that's left rather than in a bucket no screen
// renders, which is how they'd otherwise disappear.
const RETIRED_SECTIONS = { ministering: "items" };
const sectionOf = (it) => RETIRED_SECTIONS[it.section] || it.section || "items";

const blankItem = { text: "", who: "", notes: "", due_date: "", category: "", section: "items" };

// Files live in a public Supabase Storage bucket named agenda-files.
// See README — create it once, marked public, before attaching anything.
// BUCKET now lives with the shared AttachSheet so the Planner uses the same one.

export default function PresidencyAgenda({ onGo }) {
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  // Tapping an open calling lands on its card in the tracker, the same route
  // the Home Hub uses.
  const goCalling = (callingId) => onGo?.("callings", { callingId });
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

    // The roster, for the prayer pickers.
    const r = await supabase.from("members").select("id,name,active").order("name");
    setMembers(r.data || []);

    // What's coming up, for the printed copy. Resolved the same way the Sunday
    // agenda resolves it, so a repeating activity and a multi-date assignment
    // both land on their next real date.
    const [ev, ed] = await Promise.all([
      supabase.from("events").select("*")
        .in("kind", ["activity", "temple", "assignment"]).order("event_date"),
      supabase.from("event_dates").select("*").order("event_date"),
    ]);
    setEvents(upcomingForSunday({
      events: ev.data || [], eventDates: ed.data || [],
      sundayIso: toIso(new Date()), limit: 10,
    }));
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
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading agendas…</div>;
  }

  if (selected) {
    return (
      <AgendaDetail
        agenda={selected}
        items={items}
        agendas={agendas}
        onBack={() => { setSelected(null); loadAgendas(); }}
        onReloadItems={() => loadItems(selected.id)}
        members={members}
        events={events}
        onGoCalling={goCalling}
        onPatchAgenda={async (fields) => {
          const { error } = await supabase.from("agendas").update(fields).eq("id", selected.id);
          if (error) {
            // Reordering writes a column added after the first release. On a
            // database that hasn't caught up, Postgres says "column ... does
            // not exist", which tells the presidency nothing they can act on.
            setErr(/column .* does not exist|schema cache/i.test(error.message)
              ? "The database needs updating before the order can be saved — run supabase/catch-up.sql."
              : error.message);
          } else {
            setSelected({ ...selected, ...fields });
          }
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
          <div style={{ fontSize: 20.5, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
            Presidency Meetings
          </div>
          <div style={{ fontSize: 14.5, color: T.sub, marginTop: 3 }}>
            Agendas build from the Planner and carry unfinished items forward.
          </div>
        </div>
        <Btn kind="primary" style={{ marginLeft: "auto", flex: "0 0 auto" }} onClick={createAgenda}>
          <CalendarPlus size={15} />New
        </Btn>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>
          {err}
        </div>
      )}

      {!agendas.length ? (
        <Empty
          title="No Presidency Meetings Yet"
          hint="Start one and it will pull in whatever is open on the Planner."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {agendas.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              style={{ ...card, padding: 14, textAlign: "left", cursor: "pointer", width: "100%" }}
            >
              <div style={{ fontSize: 16.5, fontWeight: 700, color: T.ink }}>
                {a.meeting_date ? fmtDate(a.meeting_date) : "Undated Meeting"}
              </div>
              <div style={{ fontSize: 14, color: T.sub, marginTop: 3 }}>
                {[a.meeting_time, a.location].filter(Boolean).join(" · ") || "Tap to open"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Swap an item with its neighbour.
 *
 * The order items are discussed matters — prayers and time-sensitive business
 * first, standing topics after — and until now it was whatever order they were
 * added in. Only the two rows involved are written, so reordering a long
 * agenda doesn't rewrite every row.
 */
async function swapOrder(a, b) {
  await Promise.all([
    supabase.from("agenda_items").update({ sort_order: b.sort_order }).eq("id", a.id),
    supabase.from("agenda_items").update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);
}

// Exported so the tests can mount it directly. Reaching it through the list
// means clicking a row, which makes a test about the grouped view mostly a
// test of the list — and this is the component the blank-screen bugs landed in.
export function AgendaDetail({ agenda, items, agendas, members, events = [], onBack, onReloadItems, onPatchAgenda, onDelete, flash, toast, err, onGoCalling }) {
  const [adding, setAdding] = useState(null); // section key
  const [draft, setDraft] = useState(blankItem);
  const [editing, setEditing] = useState(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [attachFor, setAttachFor] = useState(null);
  // Built-in categories plus any the presidency added, for the printed copy.
  const { extra: customCategories } = useAgendaCategories();
  const printCategories = [...AGENDA_CATEGORIES, ...customCategories];


  const moveItem = async (it, list, dir) => {
    const i = list.indexOf(it);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    // Items added before ordering existed can all share sort_order 0, and
    // swapping two identical values does nothing. Renumber the section first
    // so the swap has something to trade.
    if (it.sort_order === other.sort_order) {
      await Promise.all(list.map((row, k) =>
        supabase.from("agenda_items").update({ sort_order: k }).eq("id", row.id)));
      const fixed = list.map((row, k) => ({ ...row, sort_order: k }));
      await swapOrder(fixed[i], fixed[j]);
    } else {
      await swapOrder(it, other);
    }
    onReloadItems();
  };

  const [view, setView] = useViewMode();
  const grouped = view === VIEWS.CATEGORY;

  const bySection = useMemo(() => {
    const out = {};
    for (const s of SECTIONS) out[s.key] = [];
    for (const it of items) (out[sectionOf(it)] ||= []).push(it);
    return out;
  }, [items]);

  // The sections that actually have something in them, and the same items
  // gathered by subject. Both arrangements are derived here so the screen, the
  // fit warning and the printed copy can never disagree about what's on the
  // agenda.
  const withItems = useMemo(
    () => SECTIONS.map((sec) => ({ ...sec, items: bySection[sec.key] || [] }))
      .filter((sec) => sec.items.length),
    [bySection]
  );
  // The order the presidency chose for this meeting, if they've moved anything.
  const categoryOrder = useMemo(
    () => (Array.isArray(agenda.category_order) ? agenda.category_order : []),
    [agenda.category_order]
  );
  const groups = useMemo(
    () => groupByCategory(withItems, printCategories, categoryOrder),
    // printCategories is rebuilt every render; the custom list is what changes.
    [withItems, customCategories, categoryOrder]
  );

  /**
   * Move a category up or down the meeting.
   *
   * The whole visible order is written, not just the pair that swapped, so a
   * category that had never been moved gets a place of its own rather than
   * staying implicit and sliding around the next time something else moves.
   */
  const moveCategory = (index, dir) => {
    const next = groups.map((g) => g.key);
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onPatchAgenda({ category_order: next });
  };

  // Whether the printed copy will hold. Notes are never dropped to make room,
  // so a very long agenda runs to a second page — better to say so here than
  // to let the printer be the one to break the news. Measured against whichever
  // arrangement is on screen, because that's the one that will print.
  const printFits = choosePrintPlan({
    sections: grouped ? groups : withItems,
    events,
    grouped,
  }).fits;

  const addItem = async (section) => {
    if (!draft.text.trim()) return;
    const { error } = await supabase.from("agenda_items").insert({
      agenda_id: agenda.id,
      section,
      text: draft.text.trim(),
      who: draft.who.trim() || null,
      notes: draft.notes.trim() || null,
      due_date: draft.due_date || null,
      category: draft.category || null,
      sort_order: items.filter((i) => i.section === section).length,
    });
    if (!error) { setDraft(blankItem); setAdding(null); onReloadItems(); }
  };

  /**
   * The form for a new item.
   *
   * One form for both arrangements. In the grouped view the category is
   * already decided — it's the hub the plus was tapped on — so the picker is
   * hidden rather than asking again for something already answered.
   */
  const addForm = (section, fixedCategory) => (
    <div style={{ background: T.inset, borderRadius: 12, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <Input value={draft.text} onChange={(v) => setDraft({ ...draft, text: v })} placeholder="What needs discussing?" />
      <div style={{ display: "flex", gap: 8 }}>
        <AssigneePicker value={draft.who} onChange={(v) => setDraft({ ...draft, who: v })} />
        <Input type="date" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v })} />
      </div>
      {!fixedCategory && (
        <CategoryPicker value={draft.category} onChange={(v) => setDraft({ ...draft, category: v || "" })} />
      )}
      <Area value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="Notes (optional)" rows={2} />
      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="primary" onClick={() => addItem(section)} disabled={!draft.text.trim()}>Add</Btn>
        <Btn kind="plain" onClick={() => setAdding(null)}>Cancel</Btn>
      </div>
    </div>
  );

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

  // Print rather than generate a PDF file: every browser can "Save as PDF"
  // from the print dialog, including iOS, and the layout stays a real document
  // rather than a screenshot.
  const printAgenda = () => {
    setPrinting(true);
    // Let the print-only markup mount before the dialog opens.
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 60);
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
        <Btn kind="plain" size="sm" style={{ marginLeft: "auto" }} onClick={printAgenda}><Printer size={14} />PDF</Btn>
        <Btn kind="plain" size="sm" onClick={copy}><Copy size={14} />Copy</Btn>
        <Btn kind="plain" size="sm" onClick={onDelete}><Trash2 size={14} /></Btn>
      </div>

      {!printFits && (
        <div style={{
          background: T.goldSoft, border: `1px solid ${T.gold}`, color: T.gold,
          borderRadius: 10, padding: "9px 12px", fontSize: 13.5,
          marginBottom: 12, lineHeight: 1.5, fontWeight: 600,
        }}>
          This agenda is long enough to run onto a second page. Nothing is left
          out — shorten a note or move an item to next week to bring it back to one.
        </div>
      )}

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>
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
        {/* The same two columns the Sunday agenda uses, on the same table —
            a presidency meeting opens and closes with prayer too. */}
        <div className="eq-row" style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <Lbl label="Opening Prayer">
            <PersonPick members={members} value={agenda.opening_prayer || ""}
              onChange={(v) => onPatchAgenda({ opening_prayer: v || null })} />
          </Lbl>
          <Lbl label="Closing Prayer">
            <PersonPick members={members} value={agenda.closing_prayer || ""}
              onChange={(v) => onPatchAgenda({ closing_prayer: v || null })} />
          </Lbl>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn kind="soft" onClick={() => setPullOpen(true)}><ArrowDownToLine size={15} />Pull From Planner</Btn>
        <Btn kind="ghost" onClick={carryOver}>Carry Over Open Items</Btn>
      </div>

      {toast && (
        <div style={{
          ...card, background: T.greenSoft, borderColor: T.green, color: T.green,
          marginBottom: 12, fontSize: 14.5, padding: "10px 14px",
        }}>
          {toast}
        </div>
      )}

      {/* Which arrangement the meeting runs in. Sits above the items rather
          than in a settings screen: it gets flipped mid-meeting, when the
          presidency decides to work through a subject rather than a list. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {grouped ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!groups.length ? (
            <div style={{ ...card }}>
              <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>
                Nothing on the agenda yet.
              </div>
            </div>
          ) : groups.map((g, i) => {
            // A hub built from a section rather than a category adds into that
            // section; a real category adds to the main list, tagged.
            const section = g.section || "items";
            const token = `hub:${g.key}`;
            return (
              <CategoryHub
                key={g.key}
                label={g.label}
                accent={g.accent}
                count={g.items.length}
                open={g.items.filter((i) => !i.done).length}
                adding={adding === token}
                addForm={addForm(section, !g.section)}
                onMove={(dir) => moveCategory(i, dir)}
                first={i === 0}
                last={i === groups.length - 1}
                onAdd={() => {
                  setAdding(adding === token ? null : token);
                  setDraft({ ...blankItem, section, category: g.section ? "" : g.key });
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {g.items.map((it) => (
                    <ItemRow
                      key={it.id} it={it}
                      editing={editing === it.id}
                      onEdit={() => setEditing(editing === it.id ? null : it.id)}
                      onPatch={patchItem} onRemove={removeItem}
                      onAttach={() => setAttachFor(it)}
                      onGoCalling={onGoCalling}
                      showCategory={false}
                    />
                  ))}
                </div>
              </CategoryHub>
            );
          })}

          {/* Only categories that have something show a hub, or the screen
              would be ten mostly-empty cards. This is how something gets into
              one that isn't there yet. */}
          <div>
            <Btn
              kind="soft"
              onClick={() => {
                setAdding(adding === "hub:new" ? null : "hub:new");
                setDraft(blankItem);
              }}
            >
              <Plus size={15} />Add To Another Category
            </Btn>
            {adding === "hub:new" && (
              <div style={{ marginTop: 10 }}>{addForm("items")}</div>
            )}
          </div>
        </div>
      ) : SECTIONS.map((s) => {
        const list = bySection[s.key] || [];
        return (
          <div key={s.key} style={{ ...card, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16.5, fontWeight: 700, color: T.ink }}>{s.label}</span>
              {list.length > 0 && <Chip>{list.filter((i) => !i.done).length} open</Chip>}
              <Btn
                size="sm" kind="plain" style={{ marginLeft: "auto" }}
                onClick={() => { setAdding(adding === s.key ? null : s.key); setDraft(blankItem); }}
              >
                <Plus size={15} />Add
              </Btn>
            </div>

            {adding === s.key && addForm(s.key)}

            {!list.length ? (
              <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>
                Nothing on the agenda yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {list.map((it) => (
                  <ItemRow
                    key={it.id} it={it}
                    editing={editing === it.id}
                    onEdit={() => setEditing(editing === it.id ? null : it.id)}
                    onPatch={patchItem} onRemove={removeItem}
                    onAttach={() => setAttachFor(it)}
                    onGoCalling={onGoCalling}
                    onMove={(dir) => moveItem(it, list, dir)}
                    first={list.indexOf(it) === 0}
                    last={list.indexOf(it) === list.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {printing && (
        <AgendaPrint
          agenda={agenda} sections={SECTIONS} bySection={bySection}
          events={events} categories={printCategories} grouped={grouped}
          categoryOrder={categoryOrder}
        />
      )}

      {attachFor && (
        <AttachSheet
          item={attachFor}
          table="agenda_items"
          folder={attachFor.agenda_id}
          onClose={() => setAttachFor(null)}
          onSaved={() => { setAttachFor(null); onReloadItems(); }}
        />
      )}

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

/**
 * A planner bucket, as an agenda category.
 *
 * Only a fallback: an item that was given a category on the Planner keeps it.
 * This is for older rows written before categories existed, so they arrive
 * tagged with something sensible rather than nothing.
 */
function bucketCategory(bucket) {
  return {
    watch: "ministering",
    moves: "moves",
    service: "service",
    missionary: "missionary",
  }[bucket] || null;
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
      section: "items",
      text: r.text, who: r.who, notes: r.notes, due_date: r.due_date,
      // The item's own category, not its planner bucket. Buckets are a
      // different vocabulary — "topics", "actions", "watch" aren't categories,
      // so pulling one across used to leave an item tagged with a key nothing
      // recognises, showing no chip at all.
      category: r.category || bucketCategory(r.bucket),
      // A link or a file attached on the Planner belongs to the item, so it
      // travels with it. Re-finding and re-attaching it on the agenda was
      // work the app had already been given once.
      link_url: r.link_url || null,
      attachment_url: r.attachment_url || null,
      attachment_name: r.attachment_name || null,
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
        <div style={{ fontSize: 19.5, fontWeight: 700, color: T.ink }}>Pull From Planner</div>
        <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6 }}>
          Open items only. Everything lands on the agenda tagged with its category.
        </div>

        {loading ? (
          <div style={{ color: T.sub, fontSize: 15, padding: 16, textAlign: "center" }}>Loading…</div>
        ) : !rows.length ? (
          <div style={{ color: T.sub, fontSize: 15, padding: 16, textAlign: "center" }}>
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
                    <div style={{ fontSize: 15.5, color: T.ink, fontWeight: 500 }}>{r.text}</div>
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

function ItemRow({ it, editing, onEdit, onPatch, onRemove, onAttach, onGoCalling, onMove, first, last, showCategory = true }) {
  const [text, setText] = useState(it.text);
  const [who, setWho] = useState(it.who || "");
  const [notes, setNotes] = useState(it.notes || "");
  const [due, setDue] = useState(it.due_date || "");
  const [cat, setCat] = useState(it.category || "");
  const late = overdueDays(it.due_date);
  // The category tints the card's edge, so the agenda can be scanned by
  // subject without reading every line.
  const meta = it.category ? AGENDA_CATEGORIES.find((c) => c.key === it.category) : null;
  const accent = it.done ? T.lineSoft : (meta ? meta.accent : T.lineSoft);

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
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="primary" size="sm" onClick={() => {
            onPatch(it.id, {
              text: text.trim() || it.text, who: who.trim() || null,
              notes: notes.trim() || null, due_date: due || null,
              category: cat || null,
            });
            onEdit();
          }}>Save</Btn>
          <Btn kind="plain" size="sm" onClick={onEdit}>Cancel</Btn>
          {onAttach && (
            <Btn kind="plain" size="sm" onClick={onAttach}><Paperclip size={14} /></Btn>
          )}
          <Btn kind="plain" size="sm" style={{ marginLeft: "auto" }} onClick={() => onRemove(it)}>
            <Trash2 size={14} />
          </Btn>
        </div>
      </div>
    );
  }

  return (
    // An outlined card rather than rows separated by nothing — a long agenda
    // ran together, and it was hard to tell where one item's notes ended and
    // the next item began.
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
          background: it.done ? T.green : "transparent", color: "#fff",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        {it.done && <Check size={13} />}
      </button>
      {/* Reordering lives on the card rather than in edit mode: setting the
          order of a meeting means moving several items in a row, and opening
          an editor for each one would make that tedious. */}
      {onMove && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "0 0 auto", order: 2 }}>
          <Btn size="sm" kind="plain" disabled={first} aria-label="Move up"
            onClick={(e) => { e.stopPropagation(); onMove(-1); }}>
            <ChevronUp size={14} />
          </Btn>
          <Btn size="sm" kind="plain" disabled={last} aria-label="Move down"
            onClick={(e) => { e.stopPropagation(); onMove(1); }}>
            <ChevronDown size={14} />
          </Btn>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onEdit}>
        <div style={{
          fontSize: 15.5, color: it.done ? T.faint : T.ink, fontWeight: 500,
          textDecoration: it.done ? "line-through" : "none",
        }}>
          {it.text}
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
          {/* Tappable, in both views. Grouped, the hub's heading already
              says what this is — but that's exactly where you need to move an
              item out of the wrong pile, so the control has to be there. */}
          <CategoryQuickPick
            value={it.category}
            onChange={(v) => onPatch(it.id, { category: v })}
          />
          {it.who && <Chip color={T.sub} bg={T.inset}>{it.who}</Chip>}
          {it.due_date && (
            <Chip color={late ? T.red : T.sub} bg={late ? T.redSoft : T.inset}>
              {late ? `overdue by ${late} day${late === 1 ? "" : "s"}` : fmtShort(it.due_date)}
            </Chip>
          )}
        </div>
        {it.notes && <div style={{ fontSize: 14, color: T.sub, marginTop: 5, lineHeight: 1.5 }}>{it.notes}</div>}

        {/* A callings item shows what the tracker says is still open, rather
            than a copy that goes stale the moment a stage changes. */}
        {it.category === "callings" && <OpenCallings onGo={onGoCalling} />}
        {/* Nothing attached yet — offer it here rather than only inside edit
            mode, where it was effectively invisible. */}
        {!it.link_url && !it.attachment_url && onAttach && (
          <button
            onClick={(e) => { e.stopPropagation(); onAttach(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 13, fontWeight: 700, color: T.faint,
            }}
          >
            <Paperclip size={12} />Add Link Or File
          </button>
        )}
        {(it.link_url || it.attachment_url) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            {it.link_url && (
              <a href={it.link_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
                <Link2 size={12} />Link
              </a>
            )}
            {it.attachment_url && (
              <a href={it.attachment_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
                <Paperclip size={12} />{it.attachment_name || "Attachment"}
              </a>
            )}
            {onAttach && (
              <button
                onClick={(e) => { e.stopPropagation(); onAttach(); }}
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

// Print-only rendering. Hidden on screen; the print stylesheet hides everything
// else and shows this, so "Save as PDF" produces a clean one-page document.
function Lbl({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
        {label}
      </span>
      {children}
    </label>
  );
}
