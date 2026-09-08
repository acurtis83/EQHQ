import { addDays } from "./upcomingAction.js";

/**
 * What one weekly email is about.
 *
 * "if an announcement is added to the Sunday Meeting Agenda for 9/6....it
 *  should carry through the announcements that get emailed out the next day
 *  on monday...but that is labeled as the next week of 9/13...so is there a
 *  better way to keep that organized"
 *
 * There are three different dates in play and the screen used to use one for
 * all of them, which is where the confusion came from:
 *
 *   - the MEETING whose announcements are being repeated — the Sunday just
 *     gone, because that's when they were said out loud
 *   - the LESSON being announced — the Sunday coming, because that's the one
 *     nobody has sat through yet
 *   - the WEEK the email belongs to — starting the Monday it goes out, which
 *     is what the subject line should say to somebody reading it that morning
 *
 * For Karl on Monday 7 September: meeting 6 Sep, lesson 13 Sep, week of 7 Sep.
 *
 * Pure — every date is a parameter, so a year of Mondays can be checked
 * without waiting a year.
 */

/**
 * The meeting an email written today would report on.
 *
 * The most recent quorum Sunday that has already happened. On a Sunday it is
 * that Sunday: the meeting is over by the time anybody writes the email, and
 * a Sunday-evening send should carry that morning's announcements rather than
 * last week's.
 *
 * `options` is the list from sundayPicker.sundayOptions — oldest first, each
 * with `date` and `teaches`.
 */
export function defaultMeeting(options = [], todayIso = "") {
  const today = String(todayIso || "").slice(0, 10);
  const past = (options || []).filter((s) => s?.date && s.date <= today);
  if (past.length) return past[past.length - 1].date;
  // Nothing has happened yet — a brand-new database, or a picker that only
  // reaches forward. Fall back to the earliest thing offered rather than
  // returning nothing and leaving the screen blank.
  return (options || [])[0]?.date || "";
}

/**
 * The Sunday whose lesson this email announces: the next one with a lesson on
 * it, after the meeting.
 *
 * "With a lesson on it" matters. If the Sunday after the meeting is general
 * conference or a fifth Sunday, the email should name the next Sunday that
 * actually has a teacher — announcing a lesson that isn't happening is worse
 * than announcing one a fortnight out.
 */
export function lessonAfter(meetingIso, options = []) {
  const meeting = String(meetingIso || "").slice(0, 10);
  if (!meeting) return "";
  return (options || []).find((s) => s?.date > meeting && s?.teaches)?.date || "";
}

/**
 * The Monday after the meeting — when the email goes out, and the week it
 * names.
 *
 * Derived from the meeting rather than from today, so the subject line of an
 * email Karl writes on Tuesday still says the Monday. Two people sending the
 * same week's email on different days shouldn't produce two different
 * subjects.
 */
export function weekStart(meetingIso) {
  const meeting = String(meetingIso || "").slice(0, 10);
  if (!meeting) return "";
  return addDays(meeting, 1);
}

/**
 * All three at once, which is what the screen actually wants.
 */
export function emailPlan(todayIso, options = []) {
  const meeting = defaultMeeting(options, todayIso);
  return {
    meeting,
    lesson: lessonAfter(meeting, options),
    week: weekStart(meeting),
  };
}

/**
 * The same three, for a meeting somebody picked by hand rather than today's.
 */
export function planFor(meetingIso, options = []) {
  const meeting = String(meetingIso || "").slice(0, 10);
  return {
    meeting,
    lesson: lessonAfter(meeting, options),
    week: weekStart(meeting),
  };
}
