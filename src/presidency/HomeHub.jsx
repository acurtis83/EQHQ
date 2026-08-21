import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Star, GraduationCap, LayoutGrid, Users, HeartHandshake } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/useAuth";
import { T, card, Chip, Btn, SectionTitle } from "../components/ui";
import { BANDS, bandCounts } from "../lib/domain/roster";
import { CALLING_STAGES } from "../lib/domain/constants";
import { fmtDate, fmtShort, toIso, scheduleBetween, NO_LESSON } from "../lib/domain/dates";
import { overdueDays } from "./RunningList";

const HORIZON_DAYS = 45;

export default function HomeHub({ onGo }) {
  const { presidency } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const today = toIso(new Date());
    const horizon = toIso(new Date(Date.now() + HORIZON_DAYS * 86400000));

    const [posts, members, callings, groups, running, agendaItems, teaching, exceptions, pres] =
      await Promise.all([
        supabase.from("posts").select("*").gte("event_date", today).lte("event_date", horizon).order("event_date"),
        supabase.from("members").select("id,name,age,active"),
        supabase.from("callings").select("*"),
        supabase.from("calling_groups").select("*").order("sort_order"),
        supabase.from("running_items").select("*").eq("done", false),
        supabase.from("agenda_items").select("*").eq("done", false),
        supabase.from("teaching_assignments").select("*").gte("date", today).lte("date", horizon).order("date"),
        supabase.from("calendar_exceptions").select("date"),
        supabase.from("presidency_members").select("name,role"),
      ]);

    const firstError = [posts, members, callings, running].find((r) => r.error);
    if (firstError) setErr(firstError.error.message);

    setD({
      posts: posts.data || [],
      members: (members.data || []).filter((m) => m.active !== false),
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
    return <div style={{ color: T.sub, fontSize: 14, padding: 24, textAlign: "center" }}>Loading…</div>;
  }

  const events = d.posts.filter((p) => p.category === "activity");
  const temple = d.posts.filter((p) => p.category === "temple");
  const openCallings = d.callings.filter((c) => !["Set Apart", "Released"].includes(c.stage));

  return (
    <div>
      <SectionTitle sub={presidency?.name ? `Signed in as ${presidency.name}` : undefined}>
        Presidency Home
      </SectionTitle>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 13.5 }}>{err}</div>
      )}

      <div className="eq-cols-2" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        <Panel icon={GraduationCap} title="This Sunday" onGo={() => onGo?.("teaching")}>
          {!nextSunday ? (
            <Muted>Nothing scheduled.</Muted>
          ) : (
            <>
              <Row label={fmtDate(nextSunday.date)} strong />
              {nextSunday.teaches ? (
                nextSunday.row?.teacher_name ? (
                  <Muted>{nextSunday.row.teacher_name}{nextSunday.row.talk_title ? ` — ${nextSunday.row.talk_title}` : ""}</Muted>
                ) : (
                  <Chip color={T.gold} bg={T.goldSoft}>No teacher assigned</Chip>
                )
              ) : (
                <Chip color={T.sub} bg={T.inset}>
                  {nextSunday.reason === NO_LESSON.FIFTH_SUNDAY ? "5th Sunday — Bishopric Directed" : nextSunday.reason}
                </Chip>
              )}
            </>
          )}
        </Panel>

        <Panel icon={CalendarDays} title="Upcoming Activities" count={events.length} onGo={() => onGo?.("feed")}>
          {events.length ? events.slice(0, 4).map((e) => (
            <Row key={e.id} label={e.title} meta={[fmtShort(e.event_date), e.event_time].filter(Boolean).join(" · ")} />
          )) : <Muted>Nothing in the next {HORIZON_DAYS} days.</Muted>}
        </Panel>

        <Panel icon={Star} title="Temple Trips" count={temple.length} onGo={() => onGo?.("feed")}>
          {temple.length ? temple.slice(0, 4).map((e) => (
            <Row key={e.id} label={e.title} meta={[fmtShort(e.event_date), e.event_time].filter(Boolean).join(" · ")} />
          )) : <Muted>None scheduled.</Muted>}
        </Panel>

        <Panel icon={LayoutGrid} title="Callings" count={openCallings.length} onGo={() => onGo?.("callings")}>
          {openCallings.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {CALLING_STAGES.filter((s) => openCallings.some((c) => c.stage === s)).map((s) => {
                const n = openCallings.filter((c) => c.stage === s).length;
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, color: T.ink, flex: 1, minWidth: 0 }}>{s}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: T.sub }}>{n}</span>
                  </div>
                );
              })}
            </div>
          ) : <Muted>Nothing in progress.</Muted>}
        </Panel>

        <Panel icon={Users} title="Quorum Stats" onGo={() => onGo?.("roster")}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.ink, lineHeight: 1.1 }}>
            {stats.total}
            <span style={{ fontSize: 13, fontWeight: 700, color: T.sub, marginLeft: 7 }}>members</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
            {BANDS.filter((b) => stats.bands[b] > 0).map((b) => {
              const n = stats.bands[b];
              const pct = stats.total ? Math.round((n / stats.total) * 100) : 0;
              return (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, color: T.ink, width: 62, flex: "0 0 auto" }}>{b}</span>
                  <div style={{ flex: 1, height: 7, background: T.inset, borderRadius: 999, minWidth: 0, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: T.primary, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.sub, width: 26, textAlign: "right" }}>{n}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel icon={HeartHandshake} title="Ministering">
          <Muted>Reporting stats land here once Ministering is built.</Muted>
        </Panel>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
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
                    fontSize: 12, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
                  }}>
                    {owner.unassigned ? "?" : owner.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}>{owner.name}</span>
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
                          <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.4 }}>{i.text}</div>
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
    <div style={{ ...card, padding: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={16} style={{ color: T.sub, flex: "0 0 auto" }} />
        <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}>{title}</span>
        {count > 0 && <Chip color={T.sub} bg={T.inset}>{count}</Chip>}
        {onGo && <Btn size="sm" kind="plain" onClick={onGo}>Open</Btn>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, meta, strong }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 14, fontWeight: strong ? 800 : 600, color: T.ink, lineHeight: 1.35 }}>{label}</div>
      {meta && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{meta}</div>}
    </div>
  );
}

function Muted({ children }) {
  return <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55 }}>{children}</div>;
}
