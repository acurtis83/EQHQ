import { scheduleBetween } from "./dates.js";
// The UTC-safe one, borrowed rather than rewritten. A third implementation of
// "add days to an ISO date" is how the second one came to be off by a day in
// Utah; see the note on addDays itself.
import { addDays } from "./upcomingAction.js";

/**
 * Which Sundays the presidency can open.
 *
 * "i need to be able to see the previous Sunday Agendas so I can edit the
 *  Announcements"
 *
 * Both the Sunday agenda and the Secretary hub used to build their list from
 * today forward, so last Sunday's agenda existed in the database and had no
 * way in. That mattered more once the feed started showing the last meeting's
 * announcements: the card members read was the one page nobody could edit.
 *
 * Pure — `todayIso` is a parameter, so a year of picker behaviour can be
 * checked without waiting a year.
 */

/**
 * How far back to offer.
 *
 * Eight weeks. Long enough to fix a typo somebody noticed a fortnight later or
 * to fill in the Sunday you were away for, short enough that the dropdown
 * stays a list you can read. Nothing is deleted at the far end — an older
 * agenda still exists, it just isn't offered here.
 */
export const LOOKBACK_DAYS = 56;

/** ...and how many past Sundays to actually show, newest of them last. */
export const PAST_SHOWN = 6;

/**
 * The options for the picker, oldest first.
 *
 * Past Sundays come first so the list reads forwards in time and the next
 * meeting sits where it always did — roughly where the selection starts.
 * Reversing it would put "last Sunday" above "next Sunday", which reads as a
 * different kind of list.
 *
 * Each option carries `past` so the screens can mark them without doing date
 * arithmetic of their own.
 */
export function sundayOptions(todayIso, stakeConf, { ahead = 8 } = {}) {
  const today = String(todayIso || "").slice(0, 10);
  if (!today) return [];

  const from = addDays(today, -LOOKBACK_DAYS);
  const to = addDays(today, 120);
  const all = scheduleBetween(from, to, stakeConf)
    .map((s) => ({ ...s, past: s.date < today }));

  const before = all.filter((s) => s.past);
  const after = all.filter((s) => !s.past);

  // Sliced from the correct end of each half. Taking the first N of the whole
  // list would have spent the entire allowance on old meetings and cut off
  // the ones being planned.
  return [...before.slice(-PAST_SHOWN), ...after.slice(0, ahead)];
}

/**
 * Which one to land on.
 *
 * The next meeting that has a lesson, exactly as before — being able to reach
 * last month must not change where these screens open. This is the part that
 * would have broken quietly: the old code took the first teaching Sunday in
 * the list, and once past Sundays joined the front of that list, "first" became
 * one in August. The screen would still have worked, so nothing would have
 * complained; it would just have opened on the wrong week every time.
 */
export function defaultSunday(options = [], todayIso = "") {
  const today = String(todayIso || "").slice(0, 10);
  const ahead = (options || []).filter((s) => s.date >= today);
  return ahead.find((s) => s.teaches)?.date || ahead[0]?.date
    || (options || [])[options.length - 1]?.date || "";
}
