import { useCallback, useEffect, useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Chip, Select } from "../components/ui";
import EmailSheet from "../components/EmailSheet";
import { toIso, fmtDate, scheduleBetween, noLessonReason } from "../lib/domain/dates";
import { upcomingForSunday } from "../lib/domain/upcoming";
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

  const loadShell = useCallback(async () => {
    const today = toIso(new Date());
    const horizon = toIso(new Date(Date.now() + 120 * 86400000));
    const ex = await supabase.from("calendar_exceptions").select("date");
    const stake = new Set((ex.data || []).map((e) => e.date));
    const sched = scheduleBetween(today, horizon, stake).slice(0, 8);
    setSundays(sched);
    setDate((d) => d || sched.find((s) => s.teaches)?.date || sched[0]?.date || "");
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

    const [its, tl, ev, ed] = await Promise.all([
      found.data
        ? supabase.from("agenda_items").select("*").eq("agenda_id", found.data.id).order("sort_order")
        : Promise.resolve({ data: [] }),
      supabase.from("teaching_assignments").select("*").eq("date", date).maybeSingle(),
      supabase.from("events").select("*").in("kind", ["activity", "temple", "assignment"]).order("event_date"),
      supabase.from("event_dates").select("*").order("event_date"),
    ]);

    setItems(its.data || []);
    setLesson(tl.data || null);
    setEvents(upcomingForSunday({
      events: ev.data || [], eventDates: ed.data || [],
      sundayIso: date, limit: UPCOMING_SHOWN,
    }));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const announcements = items.filter((i) => i.section === SECTION);
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
            {fmtDate(s.date)}{s.teaches ? "" : " — no quorum lesson"}
          </option>
        ))}
      </Select>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 11 }}>
        {!announcements.length ? (
          <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>
            Nothing to announce yet.
          </div>
        ) : (
          announcements.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                background: T.inset, border: `1px solid ${T.lineSoft}`,
                borderRadius: 10, padding: "8px 10px",
              }}
            >
              <span style={{ fontSize: 14.5, color: T.ink, flex: 1, minWidth: 0, lineHeight: 1.45 }}>
                {a.text}
              </span>
              <Btn size="sm" kind="plain" aria-label="Remove" onClick={() => remove(a.id)}>
                <Trash2 size={13} />
              </Btn>
            </div>
          ))
        )}
      </div>

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
