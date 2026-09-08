import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Plus, Trash2, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Chip, Select } from "../components/ui";
import EmailSheet from "../components/EmailSheet";
import BringForward from "../components/BringForward";
import { moveAndSave } from "../lib/announcementActions";
import { toIso, fmtDate, noLessonReason } from "../lib/domain/dates";
import { sundayOptions, defaultSunday } from "../lib/domain/sundayPicker";
import { upcomingForSunday, emailWindowStart } from "../lib/domain/upcoming";
import { announcementWarnings } from "../lib/domain/announcements";
import { useAuth } from "../lib/useAuth";

const SECTION = "announcements";
const UPCOMING_SHOWN = 6;

function readableReason(reason) {
  return {
    "general-conference": "general conference",
    "stake-conference": "stake conference",
    "fast-sunday": "fast Sunday",
    "bishopric": "a bishopric-directed meeting",
  }[reason] || (reason || "");
}

/**
 * The secretary's corner: announcements in, weekly email out.
 *
 * Karl only ever needs two things from the Sunday agenda — the list of
 * announcements and the email that goes out on Monday. Making him walk through
 * a meeting agenda to reach them put the wrong thing in front of him, so this
 * does the same job on its own and writes to exactly the same rows: an
 * announcement added here is on the Sunday agenda, and the reverse.
 */
export default function SecretaryEmail({ compact, onGo }) {
  const { presidency } = useAuth();
  const [sundays, setSundays] = useState([]);
  const [date, setDate] = useState("");
  const [agenda, setAgenda] = useState(null);
  const [items, setItems] = useState([]);
  const [lesson, setLesson] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [feedNotices, setFeedNotices] = useState([]);

  const loadShell = useCallback(async () => {
    const today = toIso(new Date());
    const ex = await supabase.from("calendar_exceptions").select("date");
    const stake = new Set((ex.data || []).map((e) => e.date));
    // Recent Sundays as well as coming ones, so an announcement can be fixed
    // after the fact — the feed shows the last meeting's announcements to the
    // whole quorum, and that page was previously unreachable.
    const sched = sundayOptions(today, stake, { ahead: 8 });
    setSundays(sched);
    setDate((d) => d || defaultSunday(sched, today));
    setLoading(false);
  }, []);

  useEffect(() => { loadShell(); }, [loadShell]);

  const load = useCallback(async () => {
    if (!date) return;
    setErr("");

    // Read-only about whether the agenda exists. The Sunday screen creates it
    // on first visit; making this screen create one too would leave an empty
    // agenda behind every time the secretary looked at a week nobody has
    // planned yet.
    const found = await supabase
      .from("agendas").select("*").eq("kind", "sunday").eq("meeting_date", date).maybeSingle();
    if (found.error) { setErr(found.error.message); return; }
    setAgenda(found.data || null);

    const [its, tl, ev, ed, notices] = await Promise.all([
      found.data
        ? supabase.from("agenda_items").select("*").eq("agenda_id", found.data.id).order("sort_order")
        : Promise.resolve({ data: [] }),
      supabase.from("teaching_assignments").select("*").eq("date", date).maybeSingle(),
      // No kind filter — see the note in SundayAgenda: a hardcoded list here
      // silently dropped custom categories from the weekly email.
      supabase.from("events").select("*").order("event_date"),
      supabase.from("event_dates").select("*").order("event_date"),
      // Announcements posted straight to the feed. Not used to BUILD the
      // email — the agenda is the source for that — but needed to notice one
      // that never reached the agenda and so would go out to nobody.
      supabase.from("posts").select("id,title,body,event_date,created_at")
        .eq("category", "announcement").order("created_at", { ascending: false }),
    ]);

    setItems(its.data || []);
    // Still current on the Sunday in question: a notice whose date has passed
    // isn't missing from the agenda, it's over.
    setFeedNotices((notices.data || []).filter(
      (p) => !p.event_date || String(p.event_date) >= String(date)
    ));
    setLesson(tl.data || null);
    setEvents(upcomingForSunday({
      events: ev.data || [], eventDates: ed.data || [],
      sundayIso: date, limit: UPCOMING_SHOWN,
      // From today when the Sunday is still ahead, so the things happening
      // between writing the email and that Sunday are in it. The blood drive
      // on the Friday was being dropped for being "past" the Sunday it was
      // announcing itself to.
      fromIso: emailWindowStart(toIso(new Date()), date),
    }));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const announcements = items.filter((i) => i.section === SECTION);

  // "theres a few spots for announcements and dont want duplicates or to be
  //  missing anything on the email."
  //
  // Worth being precise about what this can and can't catch. This screen and
  // the Sunday agenda read the SAME rows — both are agenda_items in the
  // announcements section for this date — so those two can never disagree,
  // and no check is needed between them. What can go wrong is a notice posted
  // straight to the feed that nobody added to the agenda, and the same thing
  // said twice once a carried-forward announcement is retyped.
  //
  // Advisory only. Nothing here blocks sending: the secretary can see the
  // whole email and is a better judge than a word-overlap score.
  const warnings = useMemo(
    () => announcementWarnings({
      agendaItems: announcements, feedPosts: feedNotices, events,
    }),
    [announcements, feedNotices, events]
  );
  const chosen = sundays.find((s) => s.date === date);
  const reason = chosen && !chosen.teaches
    ? readableReason(chosen.reason)
    : readableReason(date ? noLessonReason(date, new Set()) : "");

  // Adding the first announcement is what creates the agenda, so a week nobody
  // has planned doesn't get an empty row just for being looked at.
  const ensureAgenda = async () => {
    if (agenda) return agenda;
    const made = await supabase.from("agendas")
      .insert({ kind: "sunday", meeting_date: date, title: "Sunday Quorum Meeting" })
      .select().single();
    if (made.error) { setErr(made.error.message); return null; }
    setAgenda(made.data);
    return made.data;
  };

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    const row = await ensureAgenda();
    if (!row) return;
    const { error } = await supabase.from("agenda_items").insert({
      agenda_id: row.id, section: SECTION, text: t, sort_order: announcements.length,
    });
    if (error) setErr(error.message);
    else { setDraft(""); setAdding(false); load(); }
  };

  const remove = async (id) => {
    await supabase.from("agenda_items").delete().eq("id", id);
    load();
  };

  // Typed straight through to the row. The list is short and the field is
  // small, so there's no save button — the same way the Sunday agenda has
  // always worked, and having one screen ask you to save while the other
  // doesn't is its own kind of confusing.
  const patchItem = async (id, fields) => {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...fields } : i)));
    const { error } = await supabase.from("agenda_items").update(fields).eq("id", id);
    if (error) setErr(error.message);
  };

  const move = async (id, delta) => {
    const problem = await moveAndSave(announcements, id, delta);
    if (problem) setErr(problem);
    else load();
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 18, textAlign: "center" }}>Loading…</div>;
  }

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
      <Mail size={16} style={{ color: T.primaryDeep }} />
      <span style={{ fontSize: 16.5, fontWeight: 700, color: T.ink }}>Secretary</span>
      <Chip color={T.sub} bg={T.inset}>
        {announcements.length} announcement{announcements.length === 1 ? "" : "s"}
      </Chip>
    </div>
  );

  return (
    <div style={{ ...card }}>
      {header}

      <Select value={date} onChange={setDate}>
        {sundays.map((s) => (
          <option key={s.date} value={s.date}>
            {fmtDate(s.date)}
            {s.past ? " — past" : ""}
            {s.teaches ? "" : " — no quorum lesson"}
          </option>
        ))}
      </Select>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 11 }}>
        {!announcements.length ? (
          <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>
            Nothing to announce yet.
          </div>
        ) : (
          announcements.map((a, i) => (
            <div
              key={a.id}
              data-announcement={a.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                background: T.inset, border: `1px solid ${T.lineSoft}`,
                borderRadius: 10, padding: "8px 10px",
              }}
            >
              {/* Editable here, not just on the Sunday agenda. This card is
                  the one place the announcements are managed now, and having
                  to open another screen to fix a typo is what sent people
                  looking for another way to do it. */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input value={a.text} onChange={(v) => patchItem(a.id, { text: v })} />
              </div>

              {/* The order they're read out in on Sunday, and the order they
                  appear in the email and on the feed. Arrows rather than
                  drag: this is a phone, the list is short, and a drag handle
                  next to an editable field fights with selecting text. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "0 0 auto" }}>
                <Btn size="sm" kind="plain" aria-label="Move up"
                  disabled={i === 0} onClick={() => move(a.id, -1)}>
                  <ChevronUp size={13} />
                </Btn>
                <Btn size="sm" kind="plain" aria-label="Move down"
                  disabled={i === announcements.length - 1} onClick={() => move(a.id, 1)}>
                  <ChevronDown size={13} />
                </Btn>
              </div>

              <Btn size="sm" kind="plain" aria-label="Remove" onClick={() => remove(a.id)}>
                <Trash2 size={13} />
              </Btn>
            </div>
          ))
        )}
      </div>

      <BringForward
        agendaId={agenda?.id}
        forDate={date}
        current={announcements}
        onAdded={load}
        setErr={setErr}
      />

      {adding ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 9 }}>
          <Input value={draft} onChange={setDraft} placeholder="What needs announcing?" />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" kind="primary" disabled={!draft.trim()} onClick={add}>Add</Btn>
            <Btn size="sm" kind="plain" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <Btn size="sm" kind="soft" style={{ marginTop: 9 }} onClick={() => setAdding(true)}>
          <Plus size={14} />Add an announcement
        </Btn>
      )}

      {err && (
        <div style={{ fontSize: 13.5, color: T.red, marginTop: 9, lineHeight: 1.5 }}>{err}</div>
      )}

      {/* Shown before the Weekly Email button, not after it — the whole value
          is catching this while it's still a two-second fix rather than after
          the email has gone to the quorum. Amber, not red: none of these is an
          error, and a red block over a working screen teaches you to click
          past it. */}
      {warnings.length > 0 && (
        <div
          data-announcement-warnings={warnings.length}
          style={{
            marginTop: 11, padding: "10px 11px", borderRadius: 10,
            background: T.inset, border: `1px solid ${T.gold}`,
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", gap: 7, marginBottom: 7,
            fontSize: 13.5, fontWeight: 700, color: T.ink,
          }}>
            <AlertTriangle size={14} style={{ color: T.gold }} />
            Worth a look before you send
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {warnings.map((w) => (
              <div key={w.id} data-warning={w.kind} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <span style={{ color: T.ink, fontWeight: 600 }}>
                  {/* Quoted so it's obvious which words came from the
                      announcement and which are ours. */}
                  &ldquo;{w.text}&rdquo;
                </span>
                <span style={{ color: T.sub }}> — {w.detail}</span>
                {w.other && (
                  <div style={{ color: T.faint, marginTop: 2 }}>
                    Compare: &ldquo;{w.other}&rdquo;
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        marginTop: 12, paddingTop: 11, borderTop: `1px solid ${T.lineSoft}`,
      }}>
        <Btn kind="primary" onClick={() => setEmailOpen(true)}>
          <Mail size={15} />Weekly Email
        </Btn>
        {!compact && onGo && (
          <Btn kind="plain" onClick={() => onGo("meetings", { section: "sunday" })}>
            Open the Sunday agenda
          </Btn>
        )}
      </div>

      {emailOpen && (
        <EmailSheet
          // A week with no agenda row yet still has a lesson and events to
          // write about, so the email doesn't wait on the meeting being planned.
          agenda={agenda || {}}
          sundayIso={date}
          lesson={lesson}
          noLessonReason={reason}
          // The whole row, so a link or attachment on an announcement
          // reaches the email rather than being dropped on the way.
          announcements={announcements}
          events={events}
          senderName={presidency?.name || ""}
          onSave={async (body) => {
            const row = await ensureAgenda();
            if (!row) return;
            const { error } = await supabase.from("agendas")
              .update({ email_body: body }).eq("id", row.id);
            if (error) setErr(error.message);
            else setAgenda({ ...row, email_body: body });
          }}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </div>
  );
}
