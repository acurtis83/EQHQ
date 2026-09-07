import { scheduleBetween, toIso } from "./dates.js";

/**
 * The teaching schedule as a member sees it.
 *
 * "can we add the ability for someone that is called as a Teacher to see the
 *  Teaching Schedule?" — read-only, no account, "up to 6 months. General
 *  Conference talks are rotated the first Sunday of April and October."
 *
 * Six months is the right horizon precisely because of that second sentence.
 * Conference is the first Sunday of April and of October, so a six-month
 * window always contains exactly one of them wherever you start: a teacher
 * can always see which conference their material comes from, and never has to
 * wonder whether the far end of the list is using talks that have been
 * superseded.
 *
 * Pure. `todayIso` is a parameter so a year of scheduling can be checked
 * without waiting a year.
 */

export const HORIZON_MONTHS = 6;

/**
 * Six months on from an ISO date, clamped to a real day.
 *
 * The clamp is the fiddly bit. 31 August plus six months is 31 February,
 * which JavaScript rolls forward into March — so the window would quietly
 * gain a few days, and on the 29th to 31st of a long month it would include
 * Sundays it shouldn't. Building the target month explicitly and taking the
 * last valid day of it keeps the horizon exactly six months wide.
 *
 * All UTC, so the answer doesn't depend on where the phone is.
 */
export function monthsOn(iso, months = HORIZON_MONTHS) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const target = new Date(Date.UTC(y, mo + Number(months || 0), 1));
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(Date.UTC(
    target.getUTCFullYear(), target.getUTCMonth() + 1, 0
  )).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Every quorum Sunday in the window, with whatever is scheduled for it.
 *
 * Sundays with no lesson stay in the list carrying their reason. Dropping
 * them would leave an unexplained gap, and a gap reads as "nobody has sorted
 * this out yet" rather than "that's conference weekend" — which is the
 * opposite of reassuring for somebody checking when their turn is.
 *
 * `assignments` is whatever the public view returned; rows are matched by
 * date. An assignment for a Sunday that isn't a quorum Sunday is ignored
 * rather than shown, because the schedule is a list of meetings.
 */
export function scheduleView(todayIso, assignments = [], stakeConf = []) {
  const start = String(todayIso || "").slice(0, 10);
  if (!start) return [];
  const byDate = new Map();
  for (const a of assignments || []) {
    const d = String(a?.date || "").slice(0, 10);
    if (d) byDate.set(d, a);
  }

  return scheduleBetween(start, monthsOn(start), stakeConf).map((s) => {
    const a = byDate.get(s.date) || null;
    return {
      date: s.date,
      teaches: s.teaches,
      // The stored reason wins over the computed one: stake conference is
      // recorded by hand and the calendar can't know about it.
      reason: a?.no_lesson_reason || s.reason || "",
      teacher: String(a?.teacher_name || "").trim(),
      topic: String(a?.topic || "").trim(),
      talkTitle: String(a?.talk_title || "").trim(),
      speaker: String(a?.speaker || "").trim(),
      talkLink: String(a?.talk_link || "").trim(),
    };
  });
}

/**
 * Is anything actually filled in for this Sunday?
 *
 * A row exists for every quorum Sunday whether or not the presidency has got
 * to it, so "has a row" means nothing. This is what tells "Nick Crump,
 * Ministering" from a blank waiting to be assigned.
 */
export function isPlanned(row) {
  return !!(row && (row.teacher || row.topic || row.talkTitle));
}

/** The next Sunday with something on it, for the summary line at the top. */
export function nextUp(rows = []) {
  return (rows || []).find((r) => r.teaches && isPlanned(r)) || null;
}

/** How many Sundays in the window still have nobody against them. */
export function unassignedCount(rows = []) {
  return (rows || []).filter((r) => r.teaches && !r.teacher).length;
}

/**
 * Grouped by month, in order, for a list with headings.
 *
 * Six months of Sundays is twenty-odd rows; without headings you lose your
 * place scrolling, and the whole point is finding your own name quickly.
 */
export function byMonth(rows = []) {
  const out = [];
  for (const r of rows || []) {
    const key = String(r.date || "").slice(0, 7);
    if (!key) continue;
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else out.push({ key, rows: [r] });
  }
  return out;
}
