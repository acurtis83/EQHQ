import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Star, GraduationCap, LayoutGrid, Users, HeartHandshake, ChevronRight, ClipboardCheck, Bell } from "lucide-react";
import { supabase } from "../lib/supabase";
import SecretaryEmail from "./SecretaryEmail";
import { useAuth } from "../lib/useAuth";
import { T, card, Chip, Btn, SectionTitle } from "../components/ui";
import { BANDS, bandCounts } from "../lib/domain/roster";
import { CALLING_STAGES } from "../lib/domain/constants";
import { fmtDate, fmtShort, toIso, scheduleBetween, NO_LESSON } from "../lib/domain/dates";
import { sundayLabel } from "../lib/domain/lesson";
import { overdueDays } from "./RunningList";
import UpcomingList from "../components/UpcomingList";

// How many upcoming items the Upcoming panel lists. Capping by count rather
// than by a date window: a 45-day horizon silently hid an assignment five days
// past the edge, and there was nothing on screen to explain the absence.
const UPCOMING_SHOWN = 5;

// Date · time · where · who — whichever of those exist.
const eventMeta = (e) =>
  [e.event_date ? fmtShort(e.event_date) : "No date yet", e.event_time, e.location, e.assigned_to]
    .filter(Boolean).join(" · ");

// Activities and temple trips can be announced; showing which ones haven't been
// is the point of planning them here rather than posting straight to the feed.
const postFlag = (e) => (e.post_id ? null : "Not posted");

export default function HomeHub({ onGo }) {
  const { presidency } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  // Which calling stage is expanded in place. Only one at a time.
  const [openStage, setOpenStage] = useState(null);

  const load = useCallback(async () => {
    const today = toIso(new Date());

    const [events, members, announcements, callings, groups, running, agendaItems, teaching, exceptions, pres] =
      await Promise.all([
        // Planned items, not feed posts — so the hub shows things that haven't
        // been announced yet, which is exactly what the presidency needs to
        // see. Undated rows count as upcoming: they're still being planned.
        // Everything still ahead, with no upper bound — temple cleaning is
        // scheduled months out and belongs in the count.
        supabase.from("events").select("*")
          .or(`event_date.is.null,event_date.gte.${today}`)
          .order("event_date", { ascending: true, nullsFirst: false }),
        supabase.from("members").select("id,name,age,active"),
        // Announcements live on posts, not the planning table — they're
        // written straight to the feed.
        supabase.from("posts").select("*").eq("category", "announcement")
          .order("created_at", { ascending: false }),
        supabase.from("callings").select("*"),
        supabase.from("calling_groups").select("*").order("sort_order"),
        supabase.from("running_items").select("*").eq("done", false),
        supabase.from("agenda_items").select("*").eq("done", false),
        supabase.from("teaching_assignments").select("*").gte("date", today).order("date"),
        supabase.from("calendar_exceptions").select("date"),
        supabase.from("presidency_members").select("name,role"),
      ]);

    const firstError = [events, members, callings, running].find((r) => r.error);
    if (firstError) setErr(firstError.error.message);

    setD({
      events: events.data || [],
      members: (members.data || []).filter((m) => m.active !== false),
      announcements: announcements.data || [],
      callings: callings.data || [],
      groups: groups.data || [],
      running: running.data || [],
      agendaItems: agendaItems.data || [],
      teaching: teaching.data || [],
      exceptions: new Set((exceptions.data || []).map((e) => e.date)),
      presidency: pres.data || [],
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    if (!d) return null;
    return { total: d.members.length, bands: bandCounts(d.members) };
  }, [d]);

  // Open items from both the Planner and any agenda, grouped by owner.
  const byOwner = useMemo(() => {
    if (!d) return [];
    const names = d.presidency.length
      ? d.presidency.map((p) => p.name)
      : [...new Set([...d.running, ...d.agendaItems].map((i) => i.who).filter(Boolean))];

    const all = [
      ...d.running.map((i) => ({ ...i, source: "Planner" })),
      ...d.agendaItems.map((i) => ({ ...i, source: "Agenda" })),
    ];

    const rows = names.map((n) => ({
      name: n,
      items: all.filter((i) => (i.who || "").trim().toLowerCase() === n.trim().toLowerCase()),
    }));

    const claimed = new Set(rows.flatMap((r) => r.items.map((i) => i.id)));
    const unassigned = all.filter((i) => !claimed.has(i.id));
    if (unassigned.length) rows.push({ name: "Unassigned", items: unassigned, unassigned: true });
    return rows.filter((r) => r.items.length);
  }, [d]);

  const nextSunday = useMemo(() => {
    if (!d) return null;
    const today = toIso(new Date());
    const horizon = toIso(new Date(Date.now() + 60 * 86400000));
    const sched = scheduleBetween(today, horizon, d.exceptions);
    const s = sched[0];
    if (!s) return null;
    return { ...s, row: d.teaching.find((t) => t.date === s.date) || null };
  }, [d]);

  if (!d) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading…</div>;
  }

  const activities = d.events.filter((e) => e.kind === "activity");
  const temple = d.events.filter((e) => e.kind === "temple");
  const assignments = d.events.filter((e) => e.kind === "assignment" && !e.done);
  // An announcement counts as current until its date passes; undated ones
  // stand until they're deleted.
  // Activities and temple trips together, soonest first — one list, because
  // "what's coming up" isn't two questions.
  const upcoming = [...activities, ...temple]
    .filter((e) => e.event_date)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  const notices = d.announcements.filter(
    (p) => !p.event_date || p.event_date >= toIso(new Date())
  );
  const openCallings = d.callings.filter((c) => !["Set Apart", "Released"].includes(c.stage));

  return (
    <div>
      <SectionTitle sub={presidency?.name ? `Signed in as ${presidency.name}` : undefined}>
        Presidency Home
      </SectionTitle>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>{err}</div>
      )}

      <div className="eq-hub-grid">

        {/* ---------- the coming Sunday, front and centre ----------
            It's the one thing everyone opens the app to check, so it gets the
            full width and the biggest type rather than competing with a stats
            card for attention.

            The heading comes from the same function as the member feed banner
            and the weekly email — this card said "This Sunday" for a while
            after the other two were renamed. */}
        <button
          onClick={() => onGo?.("meetings")}
          className="eq-hub-wide"
          style={{
            ...card, padding: "18px 18px 20px", textAlign: "left", cursor: "pointer",
            width: "100%", display: "flex", flexDirection: "column", gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <GraduationCap size={15} style={{ color: T.primary, flex: "0 0 auto" }} />
            <span style={{
              fontSize: 12, fontWeight: 800, letterSpacing: "0.1em",
              textTransform: "uppercase", color: T.primary,
            }}>
              {sundayLabel(nextSunday?.date, toIso(new Date()), !!nextSunday?.teaches)}
            </span>
          </div>

          {!nextSunday ? (
            <div style={{ fontSize: 20.5, fontWeight: 800, color: T.sub, marginTop: 4 }}>
              Nothing scheduled
            </div>
          ) : (
            <>
              <div style={{
                fontSize: 28, fontWeight: 800, color: T.ink,
                letterSpacing: "-0.02em", lineHeight: 1.15, marginTop: 4,
              }}>
                {fmtDate(nextSunday.date)}
              </div>

              {nextSunday.teaches ? (
                nextSunday.row?.teacher_name ? (
                  <div style={{ marginTop: 7 }}>
                    <div style={{ fontSize: 17.5, fontWeight: 700, color: T.ink, lineHeight: 1.35 }}>
                      {nextSunday.row.talk_title || nextSunday.row.topic || "Lesson"}
                    </div>
                    <div style={{ fontSize: 14.5, color: T.sub, marginTop: 3 }}>
                      {nextSunday.row.teacher_name}
                      {nextSunday.row.speaker ? ` · ${nextSunday.row.speaker}` : ""}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <Chip color={T.gold} bg={T.goldSoft}>No Teacher Assigned</Chip>
                  </div>
                )
              ) : (
                <div style={{ marginTop: 8 }}>
                  <Chip color={T.sub} bg={T.inset}>
                    {nextSunday.reason === NO_LESSON.FIFTH_SUNDAY
                      ? "5th Sunday — Bishopric Directed"
                      : nextSunday.reason}
                  </Chip>
                </div>
              )}
            </>
          )}
        </button>

        {/* ---------- three counts, one row ----------
            These were three tall cards each saying "nothing scheduled", which
            is a lot of screen for an absence. As tiles they read at a glance
            and stay the same height whether empty or full. */}
        <div className="eq-hub-wide eq-hub-tiles">
          <CountTile icon={Bell} label="Announcements" n={notices.length}
            onGo={() => onGo?.("feed", { postId: notices[0]?.id })} />
          <CountTile icon={CalendarDays} label="Activities" n={activities.length}
            flag={activities.filter((e) => !e.post_id).length}
            onGo={() => onGo?.("plan", { eventId: activities[0]?.id })} />
          <CountTile icon={ClipboardCheck} label="Assignments" n={assignments.length}
            onGo={() => onGo?.("plan", { eventId: assignments[0]?.id })} />
          <CountTile icon={Star} label="Temple Trips" n={temple.length}
            flag={temple.filter((e) => !e.post_id).length}
            onGo={() => onGo?.("plan", { eventId: temple[0]?.id })} />
        </div>

        {/* ---------- what's actually on the calendar ---------- */}
        {/* Same list component as the Sunday agenda and the feed — it used to
            be its own thing here and looked unrelated. */}
        <Panel icon={CalendarDays} title="Upcoming Events" count={upcoming.length}
          onGo={() => onGo?.("plan")}>
          <UpcomingList
            empty="Nothing on the calendar yet."
            items={upcoming.slice(0, UPCOMING_SHOWN).map((e) => ({
              id: e.id,
              when: e.event_date,
              title: e.title,
              meta: [e.event_time, e.location, e.assigned_to].filter(Boolean).join(" · "),
              onClick: () => onGo?.("plan", { eventId: e.id }),
            }))}
          />
        </Panel>

        <Panel icon={ClipboardCheck} title="Assignments" count={assignments.length}
          onGo={() => onGo?.("plan")}>
          {assignments.length ? assignments.slice(0, 5).map((e) => (
            <Row key={e.id} label={e.title} meta={eventMeta(e)}
              onClick={() => onGo?.("plan", { eventId: e.id })} />
          )) : <Muted>Nothing outstanding.</Muted>}
        </Panel>

        {/* Each stage expands in place to show which callings it's counting,
            and each of those jumps to that card on the tracker. The count on
            its own was a dead end — you knew two were Proposed but not which. */}
        <Panel icon={LayoutGrid} title="Callings" count={openCallings.length} onGo={() => onGo?.("callings")}>
          {openCallings.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {CALLING_STAGES.filter((s) => openCallings.some((c) => c.stage === s)).map((s) => {
                const list = openCallings.filter((c) => c.stage === s);
                const isOpen = openStage === s;
                return (
                  <div key={s}>
                    <button
                      onClick={() => setOpenStage(isOpen ? null : s)}
                      aria-expanded={isOpen}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        background: isOpen ? T.inset : "transparent", border: "none",
                        borderRadius: 8, padding: "5px 7px", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <ChevronRight
                        size={14}
                        style={{
                          flex: "0 0 auto", color: T.faint,
                          transform: isOpen ? "rotate(90deg)" : "none",
                          transition: "transform 150ms ease",
                        }}
                      />
                      <span style={{ fontSize: 14.5, color: T.ink, flex: 1, minWidth: 0 }}>{s}</span>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: T.sub }}>{list.length}</span>
                    </button>

                    {isOpen && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, margin: "2px 0 6px 21px" }}>
                        {list.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => onGo?.("callings", { callingId: c.id })}
                            style={{
                              display: "flex", alignItems: "baseline", gap: 7, width: "100%",
                              background: "transparent", border: "none", borderRadius: 7,
                              padding: "4px 7px", cursor: "pointer", textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 14, fontWeight: 600, color: T.primaryDeep, minWidth: 0,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.position}
                            </span>
                            {c.candidate_name && (
                              <span style={{ fontSize: 13, color: T.sub, minWidth: 0,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.candidate_name}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <Muted>Nothing in progress.</Muted>}
        </Panel>

        <Panel icon={Users} title="Quorum Stats" onGo={() => onGo?.("settings")}>
          <div style={{ fontSize: 30, fontWeight: 800, color: T.ink, lineHeight: 1.1 }}>
            {stats.total}
            <span style={{ fontSize: 14, fontWeight: 700, color: T.sub, marginLeft: 7 }}>members</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
            {BANDS.filter((b) => stats.bands[b] > 0).map((b) => {
              const n = stats.bands[b];
              const pct = stats.total ? Math.round((n / stats.total) * 100) : 0;
              return (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14.5, color: T.ink, width: 62, flex: "0 0 auto" }}>{b}</span>
                  <div style={{ flex: 1, height: 7, background: T.inset, borderRadius: 999, minWidth: 0, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: T.primary, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.sub, width: 26, textAlign: "right" }}>{n}</span>
                  {/* The share was already being worked out to size the bar; it
                      just wasn't being said. A bar answers "which band is
                      biggest" but not "is that a third of the quorum or a
                      tenth", which is the question the numbers get quoted for.

                      Rounding can land a real person on 0%, so a band with
                      anybody in it never reads as none. The column is fixed
                      width so the figures line up rather than drifting with
                      the length of the number beside them. */}
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: T.faint,
                    width: 34, textAlign: "right", flex: "0 0 auto",
                  }}>
                    {pct === 0 && n > 0 ? "<1%" : `${pct}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* The secretary's corner, full width: announcements in, weekly email
            out, without going through the Sunday meeting agenda for it. The
            same card is on that screen too — it writes the same rows either
            way, so it doesn't matter which one Karl opens. */}
        <div className="eq-hub-wide">
          <SecretaryEmail onGo={onGo} />
        </div>

        {/* A placeholder shouldn't take a whole card. One quiet line, full
            width, so it doesn't leave a hole in the grid. */}
        <div className="eq-hub-wide" style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10,
          background: T.inset, border: `1px dashed ${T.lineSoft}`,
        }}>
          <HeartHandshake size={14} style={{ color: T.faint, flex: "0 0 auto" }} />
          <span style={{ fontSize: 13.5, color: T.faint }}>
            Ministering — reporting stats land here once it's built.
          </span>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 17.5, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
          Open Action Items
        </div>
        {!byOwner.length ? (
          <div style={{ ...card, padding: 16 }}>
            <Muted>Nothing outstanding — everything on the Planner and agendas is done.</Muted>
          </div>
        ) : (
          <div className="eq-cols-2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {byOwner.map((owner) => (
              <div key={owner.name} style={{ ...card, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: owner.unassigned ? T.goldSoft : T.primarySoft,
                    color: owner.unassigned ? T.gold : T.primaryDeep,
                    fontSize: 13, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
                  }}>
                    {owner.unassigned ? "?" : owner.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}>{owner.name}</span>
                  <Chip color={T.sub} bg={T.inset}>{owner.items.length}</Chip>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {owner.items.slice(0, 6).map((i) => {
                    const late = overdueDays(i.due_date);
                    return (
                      <div key={i.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%", marginTop: 6, flex: "0 0 auto",
                          background: late ? T.red : T.line,
                        }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14.5, color: T.ink, lineHeight: 1.4 }}>{i.text}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                            <Chip color={T.faint} bg={T.inset}>{i.source}</Chip>
                            {i.due_date && (
                              <Chip color={late ? T.red : T.faint} bg={late ? T.redSoft : T.inset}>
                                {late ? `overdue by ${late}d` : fmtShort(i.due_date)}
                              </Chip>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {owner.items.length > 6 && (
                    <Muted>+{owner.items.length - 6} more</Muted>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ icon: Icon, title, count, onGo, children }) {
  return (
    // height:100% + column flex is what makes two cards in a row end level
    // with each other even when one has far more inside.
    <div style={{ ...card, padding: 14, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={15} style={{ color: T.sub, flex: "0 0 auto" }} />
        <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}>{title}</span>
        {count > 0 && <Chip color={T.sub} bg={T.inset}>{count}</Chip>}
        {onGo && <Btn size="sm" kind="plain" onClick={onGo}>Open</Btn>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

// A number and a label. Used for the row of three so an empty section takes a
// tile rather than a whole card saying "nothing scheduled".
function CountTile({ icon: Icon, label, n, flag, onGo }) {
  const empty = !n;
  return (
    <button
      onClick={onGo}
      disabled={empty}
      style={{
        ...card, padding: "12px 12px 13px", textAlign: "left",
        cursor: empty ? "default" : "pointer", opacity: empty ? 0.65 : 1,
        display: "flex", flexDirection: "column", gap: 2, height: "100%", width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={13} style={{ color: T.faint, flex: "0 0 auto" }} />
        <span style={{
          fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em",
          textTransform: "uppercase", color: T.faint,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: empty ? T.faint : T.ink, lineHeight: 1.1 }}>
        {n}
      </div>
      {flag > 0 && (
        <div style={{ fontSize: 11.5, fontWeight: 800, color: T.gold }}>
          {flag} not posted
        </div>
      )}
    </button>
  );
}

// A line in a panel. With onClick it becomes a button that jumps to the record
// it's summarising; without one it stays a plain div, so a date heading doesn't
// look tappable when it isn't.
function Row({ label, meta, strong, onClick, flag }) {
  const body = (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{
          fontSize: 15, fontWeight: strong ? 800 : 600, lineHeight: 1.35,
          color: onClick ? T.primaryDeep : T.ink, minWidth: 0,
        }}>
          {label}
        </span>
        {flag && (
          <span style={{
            flex: "0 0 auto", fontSize: 11, fontWeight: 800, color: T.gold,
            background: T.goldSoft, padding: "1px 6px", borderRadius: 999,
          }}>
            {flag}
          </span>
        )}
      </div>
      {meta && <div style={{ fontSize: 13.5, color: T.sub, marginTop: 2 }}>{meta}</div>}
    </>
  );

  if (!onClick) return <div style={{ marginBottom: 6 }}>{body}</div>;

  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left", marginBottom: 6,
        background: "transparent", border: "none", borderRadius: 8,
        padding: "3px 6px", marginLeft: -6, cursor: "pointer",
      }}
    >
      {body}
    </button>
  );
}

function Muted({ children }) {
  return <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.55 }}>{children}</div>;
}
