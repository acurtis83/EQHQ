import { useEffect, useMemo, useState } from "react";
import { X, BookOpen, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn } from "../components/ui";
import { DOW, MON, isoParts, toIso } from "../lib/domain/dates";
import {
  HORIZON_MONTHS, scheduleView, byMonth, isPlanned, nextUp, unassignedCount,
} from "../lib/domain/teachingSchedule";

/**
 * Who's teaching, for the next six months. Read-only, no account needed.
 *
 * "can we add the ability for someone that is called as a Teacher to see the
 *  Teaching Schedule?"
 *
 * Read from two database VIEWS rather than the tables. teaching_assignments
 * carries a private `notes` column the presidency writes into, and RLS is
 * row-level — a public policy on the table would have published every column
 * of every row. The views name the safe columns explicitly; see
 * supabase/teaching-public.sql.
 *
 * Nothing here writes. There is no code path from this screen to an update,
 * and the database hasn't granted one either.
 */

function longDate(iso) {
  const d = isoParts(iso);
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
}

function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || "");
  if (!m) return "";
  return `${["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"][Number(m[2]) - 1]} ${m[1]}`;
}

export default function TeachingSchedule({ onClose }) {
  const [rows, setRows] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const today = toIso(new Date());
      const [a, e] = await Promise.all([
        supabase.from("teaching_public").select("*").gte("date", today).order("date"),
        supabase.from("calendar_exceptions_public").select("*").gte("date", today),
      ]);
      // A database that hasn't run teaching-public.sql has no views to read.
      // Say which file to run rather than showing an empty schedule, which
      // would read as "nothing is planned".
      if (a.error) {
        setErr(/does not exist|schema cache/i.test(a.error.message || "")
          ? "missing" : a.error.message);
      } else {
        setRows(a.data || []);
        setExceptions((e.data || []).map((x) => x.date));
      }
      setLoading(false);
    })();
  }, []);

  const today = toIso(new Date());
  const schedule = useMemo(
    () => scheduleView(today, rows, exceptions),
    [today, rows, exceptions]
  );
  const months = useMemo(() => byMonth(schedule), [schedule]);
  const next = useMemo(() => nextUp(schedule), [schedule]);
  const open = unassignedCount(schedule);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 70, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, maxHeight: "90vh",
          overflowY: "auto", borderRadius: "18px 18px 0 0", padding: 16,
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <BookOpen size={17} style={{ color: T.sub, flex: "0 0 auto" }} />
          <div style={{ flex: 1, fontSize: 17.5, fontWeight: 800, color: T.ink }}>
            Teaching Schedule
          </div>
          <Btn size="sm" kind="ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Btn>
        </div>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 14 }}>
          The next {HORIZON_MONTHS} months.
          {next ? ` Next up: ${next.teacher || "to be assigned"}, ${longDate(next.date)}.` : ""}
        </div>

        {err === "missing" ? (
          <div style={{ ...card, padding: 14, fontSize: 14, color: T.sub, lineHeight: 1.5 }}>
            The schedule isn't shared yet. A member of the presidency needs to run{" "}
            <strong>supabase/teaching-public.sql</strong> in Supabase once.
          </div>
        ) : err ? (
          <div style={{ ...card, padding: 14, fontSize: 14, color: "var(--red, #c0392b)" }}>
            {err}
          </div>
        ) : loading ? (
          <div style={{ fontSize: 14, color: T.faint }}>Loading…</div>
        ) : !schedule.length ? (
          <div style={{ ...card, padding: 14, fontSize: 14, color: T.sub }}>
            No quorum Sundays scheduled in the next {HORIZON_MONTHS} months.
          </div>
        ) : (
          <>
            {months.map((m) => (
              <div key={m.key} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: T.sub, marginBottom: 7,
                }}>
                  {monthLabel(m.key)}
                </div>
                <div style={{ ...card, padding: "2px 13px 6px" }}>
                  {m.rows.map((r) => <Row key={r.date} row={r} today={today} />)}
                </div>
              </div>
            ))}

            {/* Said plainly rather than left as a row of blanks. A teacher
                scanning for their name needs to know an empty Sunday means
                "not decided yet", not "you've missed something". */}
            {open > 0 && (
              <div style={{ fontSize: 12.5, color: T.faint, marginTop: -4, lineHeight: 1.5 }}>
                {open} Sunday{open === 1 ? "" : "s"} in this window {open === 1 ? "hasn't" : "haven't"} been
                assigned yet. The presidency fills these in as they go.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ row, today }) {
  const isToday = row.date === today;
  const planned = isPlanned(row);

  return (
    <div
      data-sunday={row.date}
      style={{
        display: "flex", alignItems: "flex-start", gap: 11,
        padding: "10px 0", borderTop: `1px solid ${T.lineSoft}`,
      }}
    >
      <div style={{
        flex: "0 0 auto", width: 62, fontSize: 13, fontWeight: 700,
        color: isToday ? T.primary : T.sub, paddingTop: 1,
      }}>
        {longDate(row.date).replace(/^\w+ /, "")}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!row.teaches ? (
          // Conference and fifth Sundays stay on the list carrying their
          // reason. Leaving them out would show a gap, and a gap looks like
          // an oversight rather than the calendar.
          <div style={{ fontSize: 14.5, color: T.faint, fontStyle: "italic" }}>
            {row.reason || "No quorum lesson"}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: planned ? T.ink : T.faint }}>
              {row.teacher || "Not assigned yet"}
            </div>
            {(row.topic || row.talkTitle) && (
              <div style={{ fontSize: 13.5, color: T.sub, marginTop: 2, lineHeight: 1.45 }}>
                {row.talkTitle || row.topic}
                {row.speaker ? `  ·  ${row.speaker}` : ""}
              </div>
            )}
            {row.talkLink && (
              <a
                href={row.talkLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5,
                  fontSize: 13.5, fontWeight: 600, color: T.primary, textDecoration: "none",
                }}
              >
                Read the talk <ExternalLink size={13} />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
