import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Shuffle, CalendarClock } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Select, SectionTitle } from "../components/ui";
import { toIso } from "../lib/domain/dates";
import {
  HORIZON, conductingNames, monthsFrom, rotate, scheduleFromRows, unassignedCount,
} from "../lib/domain/conducting";

/**
 * A year of who conducts, set once.
 *
 * It lives in Settings rather than on the agenda because that's what it is —
 * something the presidency decides in one sitting and then reads for months.
 * The Sunday agenda picks it up on its own; nobody has to come back here on a
 * Saturday night.
 *
 * Twelve months from the current one, not from next month. "It's the 20th and
 * nobody has said who conducts this month" is a real situation, and a schedule
 * that starts in September can't fix it.
 */
export default function ConductingSchedule() {
  const [schedule, setSchedule] = useState({});
  const [presidency, setPresidency] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");

  const months = useMemo(() => monthsFrom(toIso(new Date()), HORIZON), []);

  const load = useCallback(async () => {
    const [sched, pres] = await Promise.all([
      supabase.from("conducting_schedule").select("month,name"),
      supabase.from("presidency_members").select("name,role"),
    ]);
    // A database that hasn't run the migration behaves like an empty schedule
    // rather than an error nobody can act on from this screen.
    if (!sched.error) setSchedule(scheduleFromRows(sched.data || []));
    // The rotation, not the whole presidency — the secretary doesn't conduct.
    // Ordered President, First, Second by conductingNames rather than by SQL.
    if (!pres.error) setPresidency(conductingNames(pres.data || []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = () => { setSaved("saved"); setTimeout(() => setSaved(""), 1600); };

  /**
   * Write one month.
   *
   * Upsert, because most months have no row until somebody picks a name — an
   * update that matches nothing succeeds silently, which looks exactly like
   * saving and then losing it. Clearing a month deletes the row rather than
   * storing an empty string, so "no schedule" is one state and not two.
   */
  const setMonth = async (key, name) => {
    const next = { ...schedule };
    if (name) next[key] = name; else delete next[key];
    setSchedule(next);

    const { error } = name
      ? await supabase.from("conducting_schedule")
          .upsert({ month: key, name, updated_at: new Date().toISOString() }, { onConflict: "month" })
      : await supabase.from("conducting_schedule").delete().eq("month", key);

    if (error) {
      setErr(/does not exist|schema cache/i.test(error.message)
        ? "The database needs updating before this can be saved — run supabase/catch-up.sql."
        : error.message);
      return;
    }
    setErr("");
    flash();
  };

  /**
   * Deal the presidency through the remaining year.
   *
   * Carries on from whoever has the last month already filled in, so running
   * this on a part-filled year doesn't hand the same man December and January.
   * It writes every month — it's a starting point to adjust, not a final
   * answer, and a rotation that skipped the filled ones would be neither.
   */
  const rotateAll = async () => {
    if (!presidency.length) return;
    const filled = [...months].reverse().find((m) => schedule[m.key]);
    const next = rotate(months, presidency, filled ? schedule[filled.key] : "");
    setSchedule(next);

    const rows = Object.entries(next).map(([month, name]) => ({
      month, name, updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("conducting_schedule")
      .upsert(rows, { onConflict: "month" });
    if (error) { setErr(error.message); return; }
    setErr("");
    flash();
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 20, textAlign: "center" }}>Loading…</div>;
  }

  const blank = unassignedCount(months, schedule);

  return (
    <div style={{ ...card }}>
      <SectionTitle sub="Fills in the Conducting line on every Sunday agenda in the month.">
        Conducting
      </SectionTitle>

      {err && (
        <div style={{
          background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
          borderRadius: 10, padding: "9px 12px", fontSize: 13.5, marginBottom: 11, lineHeight: 1.5,
        }}>
          {err}
        </div>
      )}

      {!presidency.length ? (
        <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6 }}>
          Nobody in the presidency has a role that conducts. Conducting rotates
          between the President and his two counselors — the secretary doesn't
          conduct — so check the roles in <code>presidency_members</code>.
        </div>
      ) : (
        <>
          <div style={{
            display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12,
          }}>
            <Btn size="sm" kind="soft" onClick={rotateAll}>
              <Shuffle size={14} />Rotate presidency
            </Btn>
            <span style={{ fontSize: 13.5, color: saved ? T.green : T.sub }}>
              {saved
                ? <><Check size={13} style={{ verticalAlign: "-2px" }} /> Saved</>
                : blank === 0
                  ? "The next twelve months are covered."
                  : `${blank} of ${months.length} months still open.`}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {months.map((m, i) => (
              <div
                key={m.key}
                data-conducting-month={m.key}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  // A hairline every third row, so the eye can find a month
                  // without counting from the top of a twelve-row list.
                  paddingTop: i > 0 && i % 3 === 0 ? 6 : 0,
                  borderTop: i > 0 && i % 3 === 0 ? `1px solid ${T.lineSoft}` : "none",
                }}
              >
                <span style={{
                  flex: "0 0 118px", fontSize: 14.5, fontWeight: 600,
                  color: schedule[m.key] ? T.ink : T.faint,
                }}>
                  {m.label}
                </span>
                <Select
                  value={schedule[m.key] || ""}
                  onChange={(v) => setMonth(m.key, v)}
                  aria-label={`Conducting in ${m.label}`}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">— nobody yet —</option>
                  {presidency.map((n) => <option key={n} value={n}>{n}</option>)}
                  {/* Somebody assigned before they left the presidency still
                      has to appear, or opening this screen silently reassigns
                      their month to "nobody yet". */}
                  {schedule[m.key] && !presidency.includes(schedule[m.key]) && (
                    <option value={schedule[m.key]}>
                      {schedule[m.key]} — no longer in the rotation
                    </option>
                  )}
                </Select>
              </div>
            ))}
          </div>

          <div style={{
            display: "flex", gap: 7, alignItems: "flex-start", marginTop: 13,
            fontSize: 13, color: T.faint, lineHeight: 1.55,
          }}>
            <CalendarClock size={14} style={{ flex: "0 0 auto", marginTop: 2 }} />
            <span>
              Rotates between the President and his two counselors. Any Sunday
              can be changed on its own agenda without touching this — a
              one-off swap doesn't rewrite the month.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
