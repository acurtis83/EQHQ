import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Paperclip, Link2, Send, Check, MapPin, Clock, User,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Area, Select, Chip, Empty, SectionTitle } from "../components/ui";
import AttachSheet from "../components/AttachSheet";
import { fmtShort, toIso } from "../lib/domain/dates";

// The three things the presidency plans. Assignments are deliberately last and
// deliberately unpublishable — they're coordination, not announcements.
export const EVENT_KINDS = [
  {
    key: "activity", label: "Activities", one: "Activity",
    hint: "Pickleball, basketball, the quorum BBQ.",
    publishes: true,
  },
  {
    key: "temple", label: "Temple Trips", one: "Temple Trip",
    hint: "Sessions the quorum is going to together.",
    publishes: true,
  },
  {
    key: "assignment", label: "Assignments", one: "Assignment",
    hint: "Temple cleaning, youth camp, the rodeo — jobs the quorum takes on.",
    publishes: false,
  },
];

export const kindMeta = (k) => EVENT_KINDS.find((x) => x.key === k) || EVENT_KINDS[0];

const blank = (kind) => ({
  kind,
  title: "",
  event_date: "",
  event_time: "",
  location: "",
  assigned_to: "",
  notes: "",
});

// `kind` and `onKindChange` let the Plan tab own which section is showing.
// When they're passed, Planning drops its own tab row so there aren't two
// segmented controls stacked on top of each other.
export default function Planning({ focus, onFocusHandled, kind: kindProp, onKindChange }) {
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ownKind, setOwnKind] = useState("activity");
  const kind = kindProp || ownKind;
  const setKind = onKindChange || setOwnKind;
  const [editing, setEditing] = useState(null);
  const [attachFor, setAttachFor] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const [e, m] = await Promise.all([
      supabase.from("events").select("*").order("event_date", { ascending: true, nullsFirst: false }),
      supabase.from("members").select("id,name,active").order("name"),
    ]);
    if (e.error) setErr(e.error.message);
    else setRows(e.data || []);
    if (!m.error) setMembers(m.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Arriving from a Home Hub card: switch to the right tab, scroll to the row
  // and ring it. Same contract as Callings and the Feed.
  useEffect(() => {
    const id = focus?.eventId;
    if (!id || loading) return;
    const row = rows.find((r) => r.id === id);
    if (!row) { onFocusHandled?.(); return; }

    setKind(row.kind);
    setFocusId(id);
    const t = setTimeout(() => {
      document.getElementById(`event-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 60);
    const clear = setTimeout(() => setFocusId(null), 2600);
    onFocusHandled?.();
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [focus, loading, rows, onFocusHandled]);

  const meta = kindMeta(kind);

  const { upcoming, past } = useMemo(() => {
    const today = toIso(new Date());
    const mine = rows.filter((r) => r.kind === kind);
    // Undated items are still being planned, so they belong at the top with
    // the upcoming ones rather than being filed away as past.
    const up = mine.filter((r) => !r.event_date || r.event_date >= today);
    const old = mine.filter((r) => r.event_date && r.event_date < today).reverse();
    return { upcoming: up, past: old };
  }, [rows, kind]);

  const counts = useMemo(() => {
    const today = toIso(new Date());
    const out = {};
    for (const k of EVENT_KINDS) {
      out[k.key] = rows.filter(
        (r) => r.kind === k.key && (!r.event_date || r.event_date >= today)
      ).length;
    }
    return out;
  }, [rows]);

  const addNew = async () => {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...blank(kind), title: `New ${meta.one.toLowerCase()}`, sort_order: rows.length })
      .select().single();
    if (error) { setErr(error.message); return; }
    await load();
    setEditing(data);
  };

  /**
   * Publish to the member feed, or update the announcement already there.
   *
   * Only the public-facing fields are copied. assigned_to and notes stay in
   * this table — that's the whole point of planning being separate.
   */
  const publish = async (row) => {
    setBusyId(row.id);
    setErr("");
    const payload = {
      category: row.kind === "temple" ? "temple" : "activity",
      title: row.title,
      body: null,
      link_url: row.link_url || null,
      link_label: row.link_url ? "Details" : null,
      event_date: row.event_date || null,
      event_time: row.event_time || null,
      event_location: row.location || null,
    };

    if (row.post_id) {
      const { error } = await supabase.from("posts").update(payload).eq("id", row.post_id);
      setBusyId(null);
      if (error) setErr(error.message); else load();
      return;
    }

    const { data, error } = await supabase.from("posts").insert(payload).select().single();
    if (error) { setBusyId(null); setErr(error.message); return; }
    const link = await supabase.from("events").update({ post_id: data.id }).eq("id", row.id);
    setBusyId(null);
    if (link.error) setErr(link.error.message);
    else load();
  };

  // Removes the announcement but keeps the plan.
  const unpublish = async (row) => {
    if (!row.post_id) return;
    setBusyId(row.id);
    await supabase.from("posts").delete().eq("id", row.post_id);
    // post_id nulls itself via the foreign key, but clearing it here means the
    // UI doesn't wait for a round trip to notice.
    await supabase.from("events").update({ post_id: null }).eq("id", row.id);
    setBusyId(null);
    load();
  };

  const remove = async (row) => {
    if (!confirm(`Remove "${row.title}"?`)) return;
    if (row.post_id && confirm("Also remove the announcement from the feed?")) {
      await supabase.from("posts").delete().eq("id", row.post_id);
    }
    await supabase.from("events").delete().eq("id", row.id);
    setEditing(null);
    load();
  };

  const toggleDone = async (row) => {
    await supabase.from("events").update({ done: !row.done }).eq("id", row.id);
    load();
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading Planning…</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <SectionTitle sub="Dates, assignments and notes — private until you post it.">
            {kindProp ? meta.label : "Planning"}
          </SectionTitle>
        </div>
        <Btn kind="primary" style={{ marginLeft: "auto", flex: "0 0 auto" }} onClick={addNew}>
          <Plus size={15} />New
        </Btn>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>{err}</div>
      )}

      {!kindProp && (
        <div role="tablist" style={{ display: "flex", gap: 4, background: T.inset, borderRadius: 12, padding: 4, marginBottom: 12 }}>
          {EVENT_KINDS.map((k) => (
            <button
              key={k.key} role="tab" aria-selected={kind === k.key}
              data-kind={k.key}
              onClick={() => setKind(k.key)}
              style={{
                flex: 1, padding: "9px 8px", borderRadius: 9, border: "none",
                background: kind === k.key ? T.panel : "transparent",
                color: kind === k.key ? T.ink : T.sub,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                boxShadow: kind === k.key ? "var(--card-shadow)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {k.label}
              {counts[k.key] > 0 && (
                <span style={{
                  fontSize: 11.5, fontWeight: 800,
                  color: kind === k.key ? T.primaryDeep : T.faint,
                }}>
                  {counts[k.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13.5, color: T.faint, marginBottom: 12 }}>{meta.hint}</div>

      {!upcoming.length && !past.length ? (
        <Empty
          title={`No ${meta.label} Yet`}
          hint={`Tap New to plan the first one. ${meta.publishes
            ? "It stays private until you post it to the feed."
            : "Assignments stay in the presidency area."}`}
        />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {upcoming.map((r) => (
              <EventRow
                key={r.id} row={r} meta={meta}
                highlight={focusId === r.id}
                busy={busyId === r.id}
                onOpen={() => setEditing(r)}
                onPublish={() => publish(r)}
                onUnpublish={() => unpublish(r)}
                onToggleDone={() => toggleDone(r)}
              />
            ))}
            {!upcoming.length && (
              <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>Nothing upcoming.</div>
            )}
          </div>

          {past.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.faint, marginBottom: 8 }}>
                Past
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, opacity: 0.72 }}>
                {past.map((r) => (
                  <EventRow
                    key={r.id} row={r} meta={meta} past
                    highlight={focusId === r.id}
                    busy={busyId === r.id}
                    onOpen={() => setEditing(r)}
                    onPublish={() => publish(r)}
                    onUnpublish={() => unpublish(r)}
                    onToggleDone={() => toggleDone(r)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditSheet
          row={rows.find((r) => r.id === editing.id) || editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={load}
          onRemove={remove}
          onAttach={setAttachFor}
          setErr={setErr}
        />
      )}

      {attachFor && (
        <AttachSheet
          item={{ ...attachFor, text: attachFor.title }}
          table="events"
          folder="planning"
          onClose={() => setAttachFor(null)}
          onSaved={() => { setAttachFor(null); load(); }}
        />
      )}
    </div>
  );
}

function EventRow({ row, meta, past, highlight, busy, onOpen, onPublish, onUnpublish, onToggleDone }) {
  const posted = !!row.post_id;

  return (
    <div
      id={`event-${row.id}`}
      data-event-id={row.id}
      style={{
        ...card, padding: "11px 12px",
        borderColor: highlight ? T.primary : card.borderColor,
        boxShadow: highlight ? `0 0 0 3px ${T.primarySoft}` : card.boxShadow,
        transition: "box-shadow 200ms ease, border-color 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {!meta.publishes && (
          <button
            onClick={onToggleDone}
            aria-label={row.done ? "Mark not done" : "Mark done"}
            style={{
              flex: "0 0 auto", width: 21, height: 21, marginTop: 2, borderRadius: 7,
              border: `1.5px solid ${row.done ? T.green : T.line}`,
              background: row.done ? T.green : "transparent",
              color: "#fff", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", padding: 0,
            }}
          >
            {row.done && <Check size={13} />}
          </button>
        )}

        <button
          onClick={onOpen}
          style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
        >
          <div style={{
            fontSize: 15.5, fontWeight: 700, color: T.ink, lineHeight: 1.3,
            textDecoration: row.done ? "line-through" : "none",
          }}>
            {row.title}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
            {row.event_date && (
              <Chip color={T.ink} bg={T.inset}>
                {fmtShort(row.event_date)}{row.event_time ? ` · ${row.event_time}` : ""}
              </Chip>
            )}
            {!row.event_date && <Chip color={T.gold} bg={T.goldSoft}>No date yet</Chip>}
            {row.location && (
              <Chip color={T.sub} bg={T.inset}><MapPin size={11} /> {row.location}</Chip>
            )}
            {row.assigned_to && (
              <Chip color={T.primaryDeep} bg={T.primarySoft}><User size={11} /> {row.assigned_to}</Chip>
            )}
            {meta.publishes && (
              posted
                ? <Chip color={T.green} bg={T.greenSoft}>Posted</Chip>
                : <Chip color={T.faint} bg={T.inset}>Not posted</Chip>
            )}
          </div>

          {row.notes && (
            <div style={{ fontSize: 14, color: T.sub, marginTop: 6, lineHeight: 1.5 }}>{row.notes}</div>
          )}
        </button>
      </div>

      {(row.link_url || row.attachment_url || meta.publishes) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          {row.link_url && (
            <a href={row.link_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
              <Link2 size={12} />Link
            </a>
          )}
          {row.attachment_url && (
            <a href={row.attachment_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
              <Paperclip size={12} />{row.attachment_name || "Attachment"}
            </a>
          )}
          {meta.publishes && !past && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {posted && (
                <Btn size="sm" kind="plain" onClick={onUnpublish} disabled={busy}>Remove From Feed</Btn>
              )}
              <Btn size="sm" kind={posted ? "ghost" : "soft"} onClick={onPublish} disabled={busy}>
                <Send size={13} />{posted ? "Update Post" : "Post To Feed"}
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditSheet({ row, members, onClose, onSaved, onRemove, onAttach, setErr }) {
  const [d, setD] = useState({
    kind: row.kind,
    title: row.title || "",
    event_date: row.event_date || "",
    event_time: row.event_time || "",
    location: row.location || "",
    assigned_to: row.assigned_to || "",
    notes: row.notes || "",
  });
  const meta = kindMeta(d.kind);

  const save = async () => {
    const { error } = await supabase.from("events").update({
      kind: d.kind,
      title: d.title.trim() || "Untitled",
      event_date: d.event_date || null,
      event_time: d.event_time.trim() || null,
      location: d.location.trim() || null,
      assigned_to: d.assigned_to.trim() || null,
      notes: d.notes.trim() || null,
    }).eq("id", row.id);
    if (error) { setErr(error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Sheet title={meta.one} onClose={onClose}>
      <Lbl label="What">
        <Input value={d.title} onChange={(v) => setD({ ...d, title: v })} placeholder="Quorum BBQ" />
      </Lbl>

      <Lbl label="Type">
        <Select value={d.kind} onChange={(v) => setD({ ...d, kind: v })}>
          {EVENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.one}</option>)}
        </Select>
      </Lbl>

      <div style={{ display: "flex", gap: 9 }}>
        <Lbl label="Date">
          <Input type="date" value={d.event_date} onChange={(v) => setD({ ...d, event_date: v })} />
        </Lbl>
        <Lbl label="Time">
          <Input value={d.event_time} onChange={(v) => setD({ ...d, event_time: v })} placeholder="6:00 PM" />
        </Lbl>
      </div>

      <Lbl label="Location">
        <Input value={d.location} onChange={(v) => setD({ ...d, location: v })} placeholder="Holbrook Park pavilion" />
      </Lbl>

      <Lbl label="Assigned to">
        <Select value={d.assigned_to} onChange={(v) => setD({ ...d, assigned_to: v })}>
          <option value="">— nobody yet —</option>
          {members.filter((m) => m.active !== false).map((m) => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
          {/* Whoever is on the row already but no longer on the roster still
              needs to show, or saving would silently drop them. */}
          {d.assigned_to && !members.some((m) => m.name === d.assigned_to) && (
            <option value={d.assigned_to}>{d.assigned_to}</option>
          )}
        </Select>
      </Lbl>

      <Lbl label={meta.publishes ? "Notes (never posted to the feed)" : "Notes"}>
        <Area value={d.notes} onChange={(v) => setD({ ...d, notes: v })} rows={3} />
      </Lbl>

      <Btn kind="ghost" onClick={() => { onAttach(row); onClose(); }}>
        <Paperclip size={14} />Link Or File
      </Btn>

      <Btn kind="primary" size="lg" style={{ justifyContent: "center" }} onClick={save}>Save</Btn>
      <Btn kind="plain" onClick={() => onRemove(row)}><Trash2 size={14} />Remove</Btn>
    </Sheet>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, borderRadius: "18px 18px 0 0",
          padding: 18, display: "flex", flexDirection: "column", gap: 11,
          maxHeight: "88vh", overflowY: "auto",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink }}>{title}</div>
          <Btn kind="plain" size="sm" onClick={onClose}>Close</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

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
