import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Printer, Mail, Copy, ArrowDownToLine, ExternalLink,
  Check, RefreshCw,
} from "lucide-react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import Sheet from "../components/Sheet";
import EmailSheet from "../components/EmailSheet";
import SecretaryEmail from "./SecretaryEmail";
import { upcomingForSunday } from "../lib/domain/upcoming";
import PersonPick from "../components/PersonPick";
import { useAuth } from "../lib/useAuth";
import { T, card, Btn, Input, Area, Select, Chip, SectionTitle } from "../components/ui";
import {
  fmtDate, fmtShort, toIso, scheduleBetween, noLessonReason, NO_LESSON, DOW, MON, isoParts,
} from "../lib/domain/dates";
import { buildEmailText, buildEmailHtml, textToHtml, emailSubject } from "../lib/domain/weeklyEmail";
import { carryable, carriedRow } from "../lib/domain/carryOver";
import UpcomingList from "../components/UpcomingList";
import { nextOccurrence, repeats, describeRepeat } from "../lib/domain/repeat";

// The agenda lists the next few things rather than everything inside an
// arbitrary window — a date cut-off hides items with nothing to explain why.
const UPCOMING_SHOWN = 6;
const SECTION = "announcements";

// Reason text the email can use as-is.
const readableReason = (r) =>
  r === NO_LESSON.FIFTH_SUNDAY
    ? "Fifth Sunday — bishopric directed, so no quorum lesson."
    : r || "";

export default function SundayAgenda({ onGo }) {
  const { presidency } = useAuth();
  const [sundays, setSundays] = useState([]);
  const [date, setDate] = useState("");
  const [agenda, setAgenda] = useState(null);
  const [items, setItems] = useState([]);
  const [lesson, setLesson] = useState(null);
  const [events, setEvents] = useState([]);
  const [sustainings, setSustainings] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pullOpen, setPullOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Which Sundays actually have a quorum meeting. Conference and stake
  // conference are already excluded by the shared cadence rules, so this list
  // can't offer a Sunday that doesn't exist.
  const loadShell = useCallback(async () => {
    const today = toIso(new Date());
    const horizon = toIso(new Date(Date.now() + 120 * 86400000));
    const [ex, m] = await Promise.all([
      supabase.from("calendar_exceptions").select("date"),
      supabase.from("members").select("id,name,active").order("name"),
    ]);
    const stake = new Set((ex.data || []).map((e) => e.date));
    const sched = scheduleBetween(today, horizon, stake).slice(0, 10);
    setSundays(sched);
    if (!m.error) setMembers(m.data || []);
    setDate((d) => d || sched.find((s) => s.teaches)?.date || sched[0]?.date || "");
    setLoading(false);
  }, []);

  useEffect(() => { loadShell(); }, [loadShell]);

  // One agenda per Sunday, created on first visit so there's no "new agenda"
  // step to forget.
  const loadDay = useCallback(async () => {
    if (!date) return;
    setErr("");
    const found = await supabase
      .from("agendas").select("*").eq("kind", "sunday").eq("meeting_date", date).maybeSingle();
    if (found.error) { setErr(found.error.message); return; }

    let row = found.data;
    if (!row) {
      const made = await supabase.from("agendas")
        .insert({ kind: "sunday", meeting_date: date, title: "Sunday Quorum Meeting" })
        .select().single();
      if (made.error) { setErr(made.error.message); return; }
      row = made.data;
    }
    // An insert can succeed and still hand nothing back — that's what happens
    // when a policy allows the write but not the RETURNING, which this project
    // has already been bitten by once. Everything below reads row.id, so stop
    // here with something readable rather than throwing "cannot read id".
    if (!row) {
      setErr("Couldn't open this Sunday's agenda. Run supabase/catch-up.sql, then try again.");
      return;
    }
    setAgenda(row);

    const [its, tl, ev, su, ed] = await Promise.all([
      supabase.from("agenda_items").select("*").eq("agenda_id", row.id).order("sort_order"),
      supabase.from("teaching_assignments").select("*").eq("date", date).maybeSingle(),
      // No date filter here on purpose: a repeating activity's stored date is
      // the first one it ever had, which may be months back even though the
      // series is running. The filtering happens below against the Sunday
      // being planned.
      supabase.from("events").select("*")
        .in("kind", ["activity", "temple", "assignment"])
        .order("event_date"),
      // Anything extended but not yet sustained, and anything waiting to be
      // released. Read straight from the tracker so nobody has to remember to
      // copy names onto the agenda.
      supabase.from("callings").select("*")
        .in("stage", ["Called", "Need to Release"])
        .order("sort_order"),
      // Explicit dates for events that have several — temple cleaning across
      // the autumn isn't a pattern a repeat rule can express.
      supabase.from("event_dates").select("*").order("event_date"),
    ]);
    let loaded = its.data || [];

    // Roll last Sunday's announcements forward, once. `carried_over` is what
    // stops a deliberately deleted announcement reappearing every visit.
    if (!row.carried_over) {
      const carried = await carryForward(row, date);
      if (carried) loaded = carried;
    }

    setItems(loaded);
    setLesson(tl.data || null);

    // Shared with the secretary's email builder, so the two can't disagree
    // about what counts as upcoming.
    const upcoming = upcomingForSunday({
      events: ev.data || [],
      eventDates: ed.data || [],
      sundayIso: date,
      limit: UPCOMING_SHOWN,
    });
    setEvents(upcoming);
    setSustainings(su.data || []);
  }, [date]);

  /**
   * Copy forward the previous Sunday's announcements that are still worth
   * repeating, then mark this agenda as carried so it only happens once.
   * Returns the refreshed item list, or null if nothing was carried.
   */
  const carryForward = async (row, forDate) => {
    const prev = await supabase
      .from("agendas").select("id")
      .eq("kind", "sunday").lt("meeting_date", forDate)
      .order("meeting_date", { ascending: false }).limit(1).maybeSingle();

    const markDone = async () => {
      await supabase.from("agendas").update({ carried_over: true }).eq("id", row.id);
      setAgenda((a) => (a ? { ...a, carried_over: true } : a));
    };

    if (!prev.data) { await markDone(); return null; }

    const old = await supabase.from("agenda_items").select("*")
      .eq("agenda_id", prev.data.id).eq("section", SECTION).order("sort_order");
    const candidates = old.data || [];
    if (!candidates.length) { await markDone(); return null; }

    // Which presidency items are still open. Anything a carried announcement
    // points at that isn't in here was finished or deleted.
    const sourceIds = candidates.map((c) => c.source_item_id).filter(Boolean);
    let liveSourceIds = new Set();
    if (sourceIds.length) {
      const live = await supabase.from("agenda_items")
        .select("id").in("id", sourceIds).eq("done", false);
      liveSourceIds = new Set((live.data || []).map((r) => r.id));
    }

    const keep = carryable(candidates, forDate, { liveSourceIds });
    if (keep.length) {
      const { error } = await supabase.from("agenda_items")
        .insert(keep.map((r, n) => carriedRow(r, row.id, n)));
      if (error) { setErr(error.message); return null; }
    }
    await markDone();

    const fresh = await supabase.from("agenda_items")
      .select("*").eq("agenda_id", row.id).order("sort_order");
    return fresh.data || [];
  };

  useEffect(() => { loadDay(); }, [loadDay]);

  const chosen = sundays.find((s) => s.date === date);
  const reason = chosen && !chosen.teaches
    ? readableReason(chosen.reason)
    : readableReason(date ? noLessonReason(date, new Set()) : "");

  const announcements = useMemo(
    () => items.filter((i) => i.section === SECTION),
    [items]
  );

  const patchAgenda = async (fields) => {
    setAgenda((a) => ({ ...a, ...fields }));
    const { error } = await supabase.from("agendas").update(fields).eq("id", agenda.id);
    if (error) setErr(error.message);
  };

  const addAnnouncement = async (text) => {
    const t = (text || "").trim();
    if (!t) return;
    const { error } = await supabase.from("agenda_items").insert({
      agenda_id: agenda.id, section: SECTION, text: t,
      sort_order: announcements.length,
    });
    if (error) setErr(error.message);
    else { setDraft(""); setAdding(false); loadDay(); }
  };

  const removeItem = async (id) => {
    await supabase.from("agenda_items").delete().eq("id", id);
    loadDay();
  };

  const patchItem = async (id, fields) => {
    await supabase.from("agenda_items").update(fields).eq("id", id);
    loadDay();
  };

  const printAgenda = () => {
    setPrinting(true);
    setTimeout(() => { window.print(); setPrinting(false); }, 60);
  };

  const copyPlain = async () => {
    const lines = [
      `Sunday Quorum Meeting — ${fmtDate(date)}`,
      agenda?.conducting ? `Conducting: ${agenda.conducting}` : "",
      agenda?.opening_prayer ? `Opening prayer: ${agenda.opening_prayer}` : "",
      reason
        ? `No lesson — ${reason}`
        : `Lesson: ${lesson?.teacher_name || "unassigned"}${lesson?.talk_title ? ` — "${lesson.talk_title}"` : ""}`,
      lesson?.talk_link || "",
      sustainings.length ? "Callings & Sustainings:" : "",
      ...sustainings.map((c) =>
        `  - ${c.stage === "Need to Release" ? "Release" : "Sustain"}: ${c.candidate_name || "—"}, ${c.position}`),
      announcements.length ? "Announcements:" : "",
      ...announcements.map((a) => `  - ${a.text}`),
      agenda?.closing_prayer ? `Closing prayer: ${agenda.closing_prayer}` : "",
    ].filter(Boolean);
    try { await navigator.clipboard.writeText(lines.join("\n")); } catch { /* clipboard blocked */ }
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading…</div>;
  }

  return (
    <div>
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <SectionTitle sub="Prayers, the lesson, announcements and what's coming up.">
              Sunday Quorum Meeting
            </SectionTitle>
          </div>
        </div>

        {err && (
          <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>{err}</div>
        )}

        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <Lbl label="Sunday">
            <Select value={date} onChange={setDate}>
              {sundays.map((s) => (
                <option key={s.date} value={s.date}>
                  {fmtDate(s.date)}{s.teaches ? "" : " — no lesson"}
                </option>
              ))}
            </Select>
          </Lbl>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <Btn kind="primary" onClick={() => setEmailOpen(true)}>
            <Mail size={15} />Weekly Email
          </Btn>
          <Btn kind="plain" onClick={printAgenda}><Printer size={14} />PDF</Btn>
          <Btn kind="plain" onClick={copyPlain}><Copy size={14} />Copy</Btn>
        </div>

        {!agenda ? (
          <div style={{ color: T.sub, fontSize: 15, padding: 20, textAlign: "center" }}>Loading agenda…</div>
        ) : (
          <div className="eq-agenda">

            {/* ---------- who's doing what ----------
                Conducting and the two prayers share one block with their
                labels in a single column, so the controls line up instead of
                each sitting under its own heading at a different width. */}
            <Section>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <AgendaRow label="Conducting">
                  <PersonPick members={members} value={agenda.conducting || ""}
                    onChange={(v) => patchAgenda({ conducting: v || null })} />
                </AgendaRow>
                <AgendaRow label="Opening Prayer">
                  <PersonPick members={members} value={agenda.opening_prayer || ""}
                    onChange={(v) => patchAgenda({ opening_prayer: v || null })} />
                </AgendaRow>
                <AgendaRow label="Closing Prayer">
                  <PersonPick members={members} value={agenda.closing_prayer || ""}
                    onChange={(v) => patchAgenda({ closing_prayer: v || null })} />
                </AgendaRow>
              </div>
            </Section>

            {/* ---------- lesson ---------- */}
            <Section title="Lesson" onGo={onGo ? () => onGo("plan") : null} goLabel="Teaching">
              {reason ? (
                <Chip color={T.gold} bg={T.goldSoft}>{reason}</Chip>
              ) : lesson && (lesson.teacher_name || lesson.talk_title) ? (
                <div className="eq-agenda-row">
                  <span style={{ fontSize: 13.5, color: T.faint }}>Teacher</span>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>
                    {lesson.teacher_name || "—"}
                  </span>
                  {(lesson.talk_title || lesson.topic) && (
                    <>
                      <span style={{ fontSize: 13.5, color: T.faint }}>Talk</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 15.5, color: T.ink }}>
                          {lesson.talk_title ? `\u201C${lesson.talk_title}\u201D` : lesson.topic}
                        </span>
                        {lesson.speaker && (
                          <span style={{ fontSize: 14, color: T.sub }}> — {lesson.speaker}</span>
                        )}
                        {lesson.talk_link && (
                          <a href={lesson.talk_link} target="_blank" rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 9,
                              fontSize: 13.5, fontWeight: 700, color: T.primaryDeep, textDecoration: "none" }}>
                            <ExternalLink size={12} />Read
                          </a>
                        )}
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <Empty2>Nothing assigned yet — set it on Plan → Teaching.</Empty2>
              )}
            </Section>

            {/* ---------- callings and sustainings ----------
                Pulled live from the tracker: anything at "Called" is waiting to
                be sustained, anything at "Need to Release" is waiting to be
                released. Nobody has to remember to copy them across. */}
            <Section
              title="Callings & Sustainings"
              count={sustainings.length}
              onGo={onGo ? () => onGo("callings") : null}
              goLabel="Tracker"
            >
              {!sustainings.length ? (
                <Empty2>Nothing to present this week.</Empty2>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {sustainings.map((c) => {
                    const release = c.stage === "Need to Release";
                    return (
                      <button
                        key={c.id}
                        data-sustain={c.id}
                        onClick={onGo ? () => onGo("callings", { callingId: c.id }) : undefined}
                        style={{
                          display: "flex", alignItems: "baseline", gap: 9, width: "100%",
                          textAlign: "left", background: "transparent", border: "none",
                          padding: 0, cursor: onGo ? "pointer" : "default",
                        }}
                      >
                        <Chip color={release ? T.red : T.green} bg={release ? T.redSoft : T.greenSoft}>
                          {release ? "Release" : "Sustain"}
                        </Chip>
                        <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, minWidth: 0 }}>
                          {c.candidate_name || "—"}
                        </span>
                        <span style={{ fontSize: 14, color: T.sub, minWidth: 0 }}>{c.position}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ---------- announcements ---------- */}
            <Section
              title="Announcements"
              count={announcements.length}
              right={
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn size="sm" kind="plain" onClick={() => setPullOpen(true)}>
                    <ArrowDownToLine size={14} />Pull
                  </Btn>
                  <Btn size="sm" kind="plain" onClick={() => setAdding((v) => !v)}>
                    <Plus size={14} />Add
                  </Btn>
                </div>
              }
            >
              {adding && (
                <div style={{ background: T.inset, borderRadius: 10, padding: 10, marginBottom: 9, display: "flex", flexDirection: "column", gap: 8 }}>
                  <Input value={draft} onChange={setDraft} placeholder="Ministering interviews this week" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn kind="primary" size="sm" onClick={() => addAnnouncement(draft)} disabled={!draft.trim()}>Add</Btn>
                    <Btn kind="plain" size="sm" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</Btn>
                  </div>
                </div>
              )}

              {!announcements.length ? (
                <Empty2>Nothing yet. Pull from a presidency meeting, or add one.</Empty2>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {announcements.map((a) => (
                    <div key={a.id} data-announcement={a.id}
                      style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span style={{ color: T.faint, fontSize: 15, lineHeight: 1.5 }}>•</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Input value={a.text} onChange={(v) => patchItem(a.id, { text: v })} />
                        </div>
                        <Btn size="sm" kind="plain" onClick={() => removeItem(a.id)}><Trash2 size={13} /></Btn>
                      </div>
                      {/* Carries to following Sundays until this date passes,
                          or it's removed, or the presidency item behind it is
                          finished. Blank means it keeps going until removed. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12.5, color: T.faint, flex: "0 0 auto" }}>Repeat until</span>
                        <Input
                          type="date" value={a.expires_on || ""}
                          onChange={(v) => patchItem(a.id, { expires_on: v || null })}
                          style={{ width: 152, flex: "0 0 auto" }}
                        />
                        {a.source_item_id && <Chip color={T.sub} bg={T.inset}>From a meeting</Chip>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ---------- what's coming ---------- */}
            {/* The same secretary card as the Presidency Home. Either place works;
                they write the same rows. */}
            <div style={{ marginBottom: 12 }}><SecretaryEmail compact /></div>

            <Section title="Upcoming Events" count={events.length}
              onGo={onGo ? () => onGo("plan") : null} goLabel="Plan">
              {/* Shared with the Presidency Home and the feed, so the same
                  information looks the same wherever it appears. */}
              <UpcomingList
                empty="Nothing coming up."
                items={events.map((e) => ({
                  id: e.id,
                  when: e.when,
                  title: e.title,
                  meta: [
                    e.event_time,
                    e.location,
                    repeats(e) ? describeRepeat(e) : null,
                    e.remaining > 1 ? `${e.remaining} dates` : null,
                  ].filter(Boolean).join(" · "),
                  signUpHref: e.form_id ? `?f=${e.form_id}` : null,
                }))}
              />
            </Section>
          </div>
        )}
      </div>

      {printing && agenda && (
        <PrintDoc
          date={date} agenda={agenda} lesson={lesson} reason={reason}
          announcements={announcements} events={events} sustainings={sustainings}
        />
      )}

      {pullOpen && agenda && (
        <PullSheet
          agendaId={agenda.id}
          startOrder={announcements.length}
          onClose={() => setPullOpen(false)}
          onPulled={() => { setPullOpen(false); loadDay(); }}
          setErr={setErr}
        />
      )}

      {emailOpen && agenda && (
        <EmailSheet
          agenda={agenda}
          sundayIso={date}
          lesson={lesson}
          noLessonReason={reason}
          // The whole row, so a link or attachment on an announcement
          // reaches the email rather than being dropped on the way.
          announcements={announcements}
          events={events}
          senderName={presidency?.name || ""}
          onSave={(body) => patchAgenda({ email_body: body })}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------- the email ------------------------------- */


function PrintRow({ label, value }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
      <strong>{label}:</strong> {value}
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */

// One agenda section: same padding, same header weight for every one, so the
// page reads as a running order rather than a scatter of differently sized
// cards.
function Section({ title, count, right, onGo, goLabel, children }) {
  // A section with no title, count or controls skips the header row entirely
  // rather than leaving an empty strip above its content.
  const hasHeader = !!(title || count > 0 || right || onGo);
  return (
    <div style={{ ...card, padding: "13px 14px" }}>
      {hasHeader && (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {title && (
          <span style={{
            fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
            textTransform: "uppercase", color: T.sub,
          }}>
            {title}
          </span>
        )}
        {count > 0 && <Chip color={T.sub} bg={T.inset}>{count}</Chip>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {right}
          {onGo && <Btn size="sm" kind="plain" onClick={onGo}>{goLabel || "Open"}</Btn>}
        </div>
      </div>
      )}
      {children}
    </div>
  );
}

// Label in a fixed column, control in the rest — this is what lines the three
// selects up with each other and with the rows below.
function AgendaRow({ label, children }) {
  return (
    <div className="eq-agenda-row">
      <span style={{ fontSize: 13.5, color: T.sub, fontWeight: 600 }}>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Empty2({ children }) {
  return <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>{children}</div>;
}

function Card({ title, right, children }) {
  return (
    <div style={{ ...card, padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{title}</span>
        {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
      </div>
      {children}
    </div>
  );
}

function Line({ label, value, strong }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 14.5, lineHeight: 1.5, marginBottom: 2 }}>
      <span style={{ color: T.faint, flex: "0 0 auto", minWidth: 58 }}>{label}</span>
      <span style={{ color: T.ink, fontWeight: strong ? 700 : 500, minWidth: 0 }}>{value}</span>
    </div>
  );
}

// Pick from the roster, or type a name for someone who isn't on it.
function PullSheet({ agendaId, startOrder, onClose, onPulled, setErr }) {
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Recent presidency meetings, newest first, with their items.
      const ags = await supabase.from("agendas").select("id,meeting_date,title")
        .eq("kind", "presidency").order("meeting_date", { ascending: false }).limit(6);
      const ids = (ags.data || []).map((a) => a.id);
      if (!ids.length) { setRows([]); setLoading(false); return; }
      const its = await supabase.from("agenda_items").select("*").in("agenda_id", ids).order("sort_order");
      const byId = Object.fromEntries((ags.data || []).map((a) => [a.id, a]));
      setRows((its.data || [])
        .filter((i) => (i.text || "").trim())
        .map((i) => ({ ...i, meeting: byId[i.agenda_id] })));
      setLoading(false);
    })();
  }, []);

  const commit = async () => {
    const chosen = rows.filter((r) => picked[r.id]);
    if (!chosen.length) { onClose(); return; }
    const { error } = await supabase.from("agenda_items").insert(
      chosen.map((r, n) => ({
        agenda_id: agendaId,
        section: SECTION,
        // Copied, not moved — the presidency item stays where it is, because
        // announcing something doesn't mean it's finished.
        text: r.text,
        // Remembering the source is what lets this stop carrying forward once
        // the presidency ticks that item off or deletes it.
        source_item_id: r.id,
        sort_order: startOrder + n,
      }))
    );
    if (error) setErr(error.message);
    else onPulled();
  };

  return (
    <Sheet title="Pull From Presidency Meetings" onClose={onClose}>
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        Tick anything the quorum should hear about. Items are copied, so they stay
        on the presidency agenda too.
      </div>

      {loading ? (
        <div style={{ fontSize: 14.5, color: T.sub }}>Loading…</div>
      ) : !rows.length ? (
        <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>
          No presidency meeting items yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "46vh", overflowY: "auto" }}>
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))}
              style={{
                display: "flex", alignItems: "flex-start", gap: 9, textAlign: "left",
                background: picked[r.id] ? T.primarySoft : T.panel,
                border: `1px solid ${picked[r.id] ? T.primary : T.lineSoft}`,
                borderRadius: 10, padding: "9px 10px", cursor: "pointer",
              }}
            >
              <span style={{
                flex: "0 0 auto", width: 18, height: 18, marginTop: 1, borderRadius: 5,
                border: `1.5px solid ${picked[r.id] ? T.primary : T.line}`,
                background: picked[r.id] ? T.primary : "transparent",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {picked[r.id] && <Check size={12} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5, color: T.ink }}>{r.text}</span>
                <span style={{ display: "block", fontSize: 12.5, color: T.faint, marginTop: 2 }}>
                  {r.meeting?.meeting_date ? fmtShort(r.meeting.meeting_date) : "Presidency meeting"}
                  {r.who ? ` · ${r.who}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Btn kind="primary" size="lg" style={{ justifyContent: "center" }} onClick={commit}>
        Add {Object.values(picked).filter(Boolean).length || ""} To Announcements
      </Btn>
    </Sheet>
  );
}

/* --------------------------------- print --------------------------------- */

function PrintDoc({ date, agenda, lesson, reason, announcements, events, sustainings = [] }) {
  const sheet = (
    <div className="eq-print-root">
      {/* Same mechanism as the presidency agenda, and for the same reason:
          mounted onto <body> rather than positioned inside the app's shell,
          whose max-width was clipping the right edge off the sheet. The CSS is
          set as raw markup because React escapes ">" inside a <style> text
          child when rendering on the server. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          html, body {
            margin: 0 !important; padding: 0 !important;
            width: auto !important; background: #fff !important;
          }
          body > * { display: none !important; }
          body > .eq-print-root { display: block !important; }
          .eq-print-root {
            width: auto !important; max-width: 100% !important;
            box-sizing: border-box; color: #111 !important;
          }
          @page { size: letter; margin: 0.5in 0.6in; }
        }
        .eq-print-root { display: none; }
      ` }} />
      <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "#666", fontWeight: 700 }}>
        HOLBROOK FARMS 8TH WARD
      </div>
      {/* 24 to match the presidency agenda's printed heading — print sizes are
          chosen for paper and are deliberately not on the screen scale. */}
      <h1 style={{ fontSize: 24, margin: "2px 0" }}>Sunday Quorum Meeting</h1>
      <div style={{ fontSize: 13, color: "#444", marginBottom: 14 }}>
        {fmtDate(date)}
        {agenda.conducting ? ` · Conducting: ${agenda.conducting}` : ""}
      </div>

      <PrintRow label="Opening Prayer" value={agenda.opening_prayer || "—"} />

      <h2 style={{ fontSize: 14, margin: "14px 0 4px" }}>Lesson</h2>
      {reason ? (
        <div style={{ fontSize: 13 }}>{reason}</div>
      ) : (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div>Teacher: {lesson?.teacher_name || "—"}</div>
          {lesson?.talk_title && <div>Talk: “{lesson.talk_title}”{lesson.speaker ? ` — ${lesson.speaker}` : ""}</div>}
          {lesson?.talk_link && <div style={{ wordBreak: "break-all" }}>{lesson.talk_link}</div>}
        </div>
      )}

      {sustainings.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, margin: "14px 0 4px" }}>Callings &amp; Sustainings</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
            {sustainings.map((c) => (
              <li key={c.id}>
                {c.stage === "Need to Release" ? "Release" : "Sustain"} — {c.candidate_name || "—"}, {c.position}
              </li>
            ))}
          </ul>
        </>
      )}

      {announcements.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, margin: "14px 0 4px" }}>Announcements</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
            {announcements.map((a) => <li key={a.id}>{a.text}</li>)}
          </ul>
        </>
      )}

      {events.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, margin: "14px 0 4px" }}>Upcoming</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
            {events.map((e) => (
              <li key={e.id}>
                {e.title} — {[e.when ? fmtShort(e.when) : "TBC", e.event_time, e.location].filter(Boolean).join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <PrintRow label="Closing Prayer" value={agenda.closing_prayer || "—"} />
      </div>
    </div>
  );

  // Onto <body>, so nothing in the app's layout constrains the page width.
  // In a server render there's no document; the tree is returned as-is.
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
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
