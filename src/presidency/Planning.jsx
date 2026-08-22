import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Paperclip, Link2, Send, Check, MapPin, Clock, User, ClipboardList, Repeat,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Area, Select, Chip, Empty, SectionTitle } from "../components/ui";
import AttachSheet from "../components/AttachSheet";
import { fmtShort, toIso } from "../lib/domain/dates";
import { REPEAT_RULES, repeats, nextOccurrence, describeRepeat, slotLabel } from "../lib/domain/repeat";

// The three things the presidency plans. Assignments are deliberately last and
// deliberately unpublishable — they're coordination, not announcements.
export const EVENT_KINDS = [
  {
    key: "activity", label: "Activities", one: "Activity",
    hint: "Pickleball, basketball, the quorum BBQ.",
    publishes: true,
    category: "activity",
  },
  {
    key: "temple", label: "Temple Trips", one: "Temple Trip",
    hint: "Sessions the quorum is going to together.",
    publishes: true,
    category: "temple",
  },
  {
    key: "assignment", label: "Assignments", one: "Assignment",
    hint: "Temple cleaning, youth camp, the rodeo — jobs the quorum takes on.",
    // Carries through as an assignment, matching the tile on the feed — what
    // you file as an assignment arrives as one. Private notes stay behind.
    publishes: true,
    category: "assignment",
  },
];

export const kindMeta = (k) => EVENT_KINDS.find((x) => x.key === k) || EVENT_KINDS[0];

// Empty strings are fine for text columns but Postgres rejects "" for a date,
// which is what "invalid input syntax for type date" was. A new row now sends
// only what it actually has and lets the column defaults cover the rest.
const newRow = (kind, title, sortOrder) => ({ kind, title, sort_order: sortOrder });

// `kind` and `onKindChange` let the Plan tab own which section is showing.
// When they're passed, Planning drops its own tab row so there aren't two
// segmented controls stacked on top of each other.
export default function Planning({ focus, onFocusHandled, kind: kindProp, onKindChange }) {
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [forms, setForms] = useState([]);
  const [dates, setDates] = useState([]);
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
    const [e, m, f, ed] = await Promise.all([
      supabase.from("events").select("*").order("event_date", { ascending: true, nullsFirst: false }),
      supabase.from("members").select("id,name,active").order("name"),
      supabase.from("forms").select("id,title,kind,published").order("created_at", { ascending: false }),
      supabase.from("event_dates").select("*").order("event_date"),
    ]);
    if (e.error) setErr(e.error.message);
    else setRows(e.data || []);
    if (!ed.error) setDates(ed.data || []);
    if (!m.error) setMembers(m.data || []);
    if (!f.error) setForms(f.data || []);
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

  // Explicit dates win; otherwise fall back to the row's own date and rule.
  // Everything downstream asks this rather than reading event_date directly.
  const datesFor = useCallback(
    (row) => dates.filter((d) => d.event_id === row.id).sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [dates]
  );
  const nextFor = useCallback((row, fromIso) => {
    const own = datesFor(row).filter((d) => !d.done && d.event_date >= fromIso);
    if (own.length) return own[0].event_date;
    if (datesFor(row).length) return null;   // has explicit dates, all past
    return nextOccurrence(row, fromIso);
  }, [datesFor]);

  const meta = kindMeta(kind);

  const { upcoming, past } = useMemo(() => {
    const today = toIso(new Date());
    const mine = rows.filter((r) => r.kind === kind);
    // Undated items are still being planned, so they belong at the top with
    // the upcoming ones rather than being filed away as past. A repeating
    // event is upcoming as long as its series still has a date to come — the
    // first Thursday is in the past almost immediately, and it shouldn't drop
    // off the list because of that.
    const up = mine.filter((r) => (!r.event_date && !datesFor(r).length) || !!nextFor(r, today));
    const old = mine.filter((r) => (r.event_date || datesFor(r).length) && !nextFor(r, today)).reverse();
    return { upcoming: up, past: old };
  }, [rows, kind, datesFor, nextFor]);

  const counts = useMemo(() => {
    const today = toIso(new Date());
    const out = {};
    for (const k of EVENT_KINDS) {
      out[k.key] = rows.filter(
        (r) => r.kind === k.key && ((!r.event_date && !datesFor(r).length) || !!nextFor(r, today))
      ).length;
    }
    return out;
  }, [rows, datesFor, nextFor]);

  const addNew = async () => {
    const { data, error } = await supabase
      .from("events")
      .insert(newRow(kind, `New ${meta.one.toLowerCase()}`, rows.length))
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
    const today = toIso(new Date());
    const own = datesFor(row).filter((d) => !d.done && d.event_date >= today);

    // The date to advertise: the first upcoming explicit date, or the next
    // occurrence of a repeat, or just the one date it has. A repeating
    // activity must not announce the Thursday it started on.
    const when = own.length ? own[0].event_date : nextOccurrence(row, today) || row.event_date || null;
    const time = own.length ? (own[0].event_time || row.event_time) : row.event_time;

    const origin = window.location.origin;

    // One sign-up link for the whole thing. A form on the event covers every
    // date; a per-date form only applies when there's a single date left.
    const formId = row.form_id || (own.length === 1 ? own[0].form_id : null);
    const signUp = formId ? `${origin}/?f=${formId}` : null;

    // Body: what's needed, then the dates as a plain list. No URLs in here —
    // a wall of links is unreadable, and the post already carries one Sign Up
    // button that covers them all. `notes` is deliberately absent: that's the
    // presidency's own and never goes to the feed.
    const lines = [];
    if (row.details) lines.push(row.details.trim());
    if (repeats(row) && !own.length) lines.push(describeRepeat(row));
    if (own.length > 1) {
      if (lines.length) lines.push("");
      lines.push("Dates:");
      for (const d of own) {
        lines.push(`  • ${[fmtShort(d.event_date), d.event_time].filter(Boolean).join(" · ")}`);
      }
    }

    const payload = {
      category: kindMeta(row.kind).category || "activity",
      title: row.title,
      body: lines.length ? lines.join("\n") : null,
      link_url: signUp || row.link_url || null,
      link_label: signUp ? "Sign Up" : row.link_url ? "Details" : null,
      event_date: when,
      event_time: time || null,
      event_location: row.location || null,
      // "I'm in" instead of a form. Only meaningful for activities, and only
      // when no form is attached — two ways to respond is one too many.
      rsvp: !!row.rsvp && !signUp,
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
          forms={forms}
          eventDates={datesFor(editing)}
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
                {fmtShort(nextOccurrence(row, toIso(new Date())) || row.event_date)}
                {row.event_time ? ` · ${row.event_time}` : ""}
              </Chip>
            )}
            {repeats(row) && <Chip color={T.primaryDeep} bg={T.primarySoft}>{describeRepeat(row)}</Chip>}
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

      {(row.link_url || row.attachment_url || row.form_id || meta.publishes) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          {row.link_url && (
            <a href={row.link_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
              <Link2 size={12} />Link
            </a>
          )}
          {row.form_id && (
            <a href={`?f=${row.form_id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
              <ClipboardList size={12} />Sign-Up Form
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

function EditSheet({ row, members, forms, eventDates, onClose, onSaved, onRemove, onAttach, setErr }) {
  const [d, setD] = useState({
    kind: row.kind,
    title: row.title || "",
    event_date: row.event_date || "",
    event_time: row.event_time || "",
    location: row.location || "",
    assigned_to: row.assigned_to || "",
    notes: row.notes || "",
    repeat_rule: row.repeat_rule || "",
    repeat_until: row.repeat_until || "",
    form_id: row.form_id || "",
    details: row.details || "",
    rsvp: !!row.rsvp,
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
      repeat_rule: d.repeat_rule || null,
      // An end date without a rule would be meaningless, so it's cleared with it.
      repeat_until: d.repeat_rule ? (d.repeat_until || null) : null,
      form_id: d.form_id || null,
      details: d.details.trim() || null,
      rsvp: !!d.rsvp,
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

      {/* Repeats. The weekday comes from the date above, so "every Thursday"
          is just that date plus a rule — no second field to keep in step. */}
      <Lbl label="Repeats">
        <Select value={d.repeat_rule} onChange={(v) => setD({ ...d, repeat_rule: v })}>
          {REPEAT_RULES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </Select>
      </Lbl>
      {d.repeat_rule && (
        <>
          <Lbl label="Repeat until (optional)">
            <Input type="date" value={d.repeat_until}
              onChange={(v) => setD({ ...d, repeat_until: v })} />
          </Lbl>
          <div style={{ fontSize: 13, color: T.sub, marginTop: -4 }}>
            {d.event_date
              ? `${describeRepeat({ ...d })}. Next: ${
                  fmtShort(nextOccurrence({ ...d }, toIso(new Date())) || d.event_date)}`
              : "Set a date above and this repeats from it."}
          </div>
        </>
      )}

      {/* Sign-ups. A form attached here becomes the link on the feed post. */}
      <Lbl label="Sign-up form">
        <Select value={d.form_id} onChange={(v) => setD({ ...d, form_id: v })}>
          <option value="">— none —</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}{f.published ? "" : " (draft)"}
            </option>
          ))}
        </Select>
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

      <Lbl label="What's needed (shown on the feed)">
        <Area value={d.details} onChange={(v) => setD({ ...d, details: v })} rows={2}
          placeholder="Eight brethren, 8:00 AM start, bring work gloves." />
      </Lbl>

      <Lbl label="Notes (never posted to the feed)">
        <Area value={d.notes} onChange={(v) => setD({ ...d, notes: v })} rows={2} />
      </Lbl>

      {/* Basketball doesn't need a sign-up sheet — one tap is enough. */}
      {d.kind === "activity" && (
        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 15, fontWeight: 600, color: T.ink }}>
          <input type="checkbox" checked={d.rsvp}
            onChange={(e) => setD({ ...d, rsvp: e.target.checked })} />
          Ask for “I’m In” instead of a form
        </label>
      )}

      {/* Several dates that aren't a pattern — temple cleaning across the
          autumn. Each carries its own time and its own sign-up sheet. When
          there are none, the single date above is used instead. */}
      <EventDates event={row} rows={eventDates} forms={forms} onChanged={onSaved} setErr={setErr} />

      <Btn kind="ghost" onClick={() => { onAttach(row); onClose(); }}>
        <Paperclip size={14} />Link Or File
      </Btn>

      <Btn kind="primary" size="lg" style={{ justifyContent: "center" }} onClick={save}>Save</Btn>
      <Btn kind="plain" onClick={() => onRemove(row)}><Trash2 size={14} />Remove</Btn>
    </Sheet>
  );
}

/**
 * The list of dates belonging to one event.
 *
 * Rows are added one at a time on purpose: temple cleaning runs on a handful
 * of Saturdays that aren't a weekly pattern, so there's nothing to generate
 * from. Each date can point at its own form, which is what makes "a different
 * sign-up sheet per shift" work.
 */
function EventDates({ event, rows, forms, onChanged, setErr }) {
  const eventId = event.id;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ event_date: "", event_time: "", form_id: "" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [perDate, setPerDate] = useState(2);
  const [busy, setBusy] = useState(false);

  /**
   * One sign-up sheet for the whole assignment: a single capacity question
   * whose slots are these dates, each with the same number of spots.
   *
   * One form rather than one per date, because members should see every date
   * in one place and pick the one that suits — and the presidency should see
   * who's covering what on a single page. The form is attached to the event,
   * so publishing gives the post one Sign Up link.
   */
  const buildSheet = async () => {
    const usable = rows.filter((r) => !r.done);
    if (!usable.length) return;
    setBusy(true);
    setErr("");

    const spots = Math.max(1, Number(perDate) || 1);
    const options = usable.map((r) => ({
      label: [slotLabel(r.event_date), r.event_time].filter(Boolean).join(" "),
      limit: spots,
    }));

    const { data: form, error } = await supabase.from("forms").insert({
      title: `${event.title} — Sign-Up`,
      description: event.details || null,
      kind: "signup",
      published: true,
    }).select().single();
    if (error) { setBusy(false); setErr(error.message); return; }

    const q = await supabase.from("form_questions").insert({
      form_id: form.id,
      type: "capacity",
      label: "Which date can you take?",
      required: true,
      options,
      sort_order: 0,
    });
    if (q.error) { setBusy(false); setErr(q.error.message); return; }

    // Attach it to the event, and clear any per-date forms so there's one
    // obvious place to sign up rather than several competing links.
    await supabase.from("events").update({ form_id: form.id }).eq("id", eventId);
    await supabase.from("event_dates").update({ form_id: null }).eq("event_id", eventId);

    setBusy(false);
    setSheetOpen(false);
    onChanged();
  };

  const add = async () => {
    if (!draft.event_date) return;
    const { error } = await supabase.from("event_dates").insert({
      event_id: eventId,
      event_date: draft.event_date,
      event_time: draft.event_time.trim() || null,
      form_id: draft.form_id || null,
      sort_order: rows.length,
    });
    if (error) { setErr(error.message); return; }
    setDraft({ event_date: "", event_time: "", form_id: "" });
    setAdding(false);
    onChanged();
  };

  const patch = async (id, fields) => {
    const { error } = await supabase.from("event_dates").update(fields).eq("id", id);
    if (error) setErr(error.message); else onChanged();
  };

  const remove = async (id) => {
    await supabase.from("event_dates").delete().eq("id", id);
    onChanged();
  };

  return (
    <div style={{ ...card, background: T.inset, borderColor: "transparent", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: rows.length ? 9 : 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
          Dates
        </span>
        {rows.length > 0 && <Chip color={T.sub} bg={T.panel}>{rows.length}</Chip>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {rows.some((r) => !r.done) && (
            <Btn size="sm" kind="plain" onClick={() => setSheetOpen((v) => !v)}>
              <ClipboardList size={14} />Sign-Up Sheet
            </Btn>
          )}
          <Btn size="sm" kind="plain" onClick={() => setAdding((v) => !v)}>
            <Plus size={14} />Add Date
          </Btn>
        </div>
      </div>

      {sheetOpen && (
        <div style={{ background: T.panel, borderRadius: 10, padding: 11, marginBottom: 9, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.5 }}>
            Builds one form with a slot for each date, so members see every date
            and pick one. Replaces any per-date forms with this single sheet.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Lbl label="People needed per date">
              <Input type="number" value={perDate} onChange={setPerDate} />
            </Lbl>
            <Btn kind="primary" size="sm" onClick={buildSheet} disabled={busy}>
              Create Sheet
            </Btn>
            <Btn kind="plain" size="sm" onClick={() => setSheetOpen(false)}>Cancel</Btn>
          </div>
          <div style={{ fontSize: 12.5, color: T.faint, fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }}>
            {rows.filter((r) => !r.done).slice(0, 3).map((r) => (
              <div key={r.id}>
                {[slotLabel(r.event_date), r.event_time].filter(Boolean).join(" ")} ×{Math.max(1, Number(perDate) || 1)}
              </div>
            ))}
            {rows.filter((r) => !r.done).length > 3 && (
              <div>…and {rows.filter((r) => !r.done).length - 3} more</div>
            )}
          </div>
        </div>
      )}

      {!rows.length && !adding && (
        <div style={{ fontSize: 13, color: T.faint, fontStyle: "italic", marginTop: 7 }}>
          None yet — the single date above is used. Add dates here when there are
          several that don't follow a pattern.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} data-event-date={r.id}
              style={{ background: T.panel, borderRadius: 10, padding: "9px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => patch(r.id, { done: !r.done })}
                  aria-label={r.done ? "Mark not done" : "Mark done"}
                  style={{
                    flex: "0 0 auto", width: 19, height: 19, borderRadius: 6,
                    border: `1.5px solid ${r.done ? T.green : T.line}`,
                    background: r.done ? T.green : "transparent", color: "#fff",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  }}
                >
                  {r.done && <Check size={11} />}
                </button>
                <span style={{
                  fontSize: 14.5, fontWeight: 700, color: r.done ? T.faint : T.ink,
                  textDecoration: r.done ? "line-through" : "none",
                }}>
                  {fmtShort(r.event_date)}
                </span>
                {r.event_time && <span style={{ fontSize: 13.5, color: T.sub }}>{r.event_time}</span>}
                <Btn size="sm" kind="plain" style={{ marginLeft: "auto" }} onClick={() => remove(r.id)}>
                  <Trash2 size={13} />
                </Btn>
              </div>
              <Select value={r.form_id || ""} onChange={(v) => patch(r.id, { form_id: v || null })}>
                <option value="">— no sign-up form —</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>{f.title}{f.published ? "" : " (draft)"}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ background: T.panel, borderRadius: 10, padding: 10, marginTop: 9, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Lbl label="Date">
              <Input type="date" value={draft.event_date}
                onChange={(v) => setDraft({ ...draft, event_date: v })} />
            </Lbl>
            <Lbl label="Time">
              <Input value={draft.event_time} placeholder="8:00 AM"
                onChange={(v) => setDraft({ ...draft, event_time: v })} />
            </Lbl>
          </div>
          <Lbl label="Sign-up form for this date">
            <Select value={draft.form_id} onChange={(v) => setDraft({ ...draft, form_id: v })}>
              <option value="">— none —</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>{f.title}{f.published ? "" : " (draft)"}</option>
              ))}
            </Select>
          </Lbl>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind="primary" size="sm" onClick={add} disabled={!draft.event_date}>Add</Btn>
            <Btn kind="plain" size="sm" onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
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
