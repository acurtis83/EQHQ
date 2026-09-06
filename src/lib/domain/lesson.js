/**
 * Is there a talk a member could actually go and read?
 *
 * Not "did somebody type something in the talk field". talkUrl() falls back to
 * a Church search when there's no pasted link, so a link always existed and
 * "Read the talk" always rendered — over a lesson called "2nd Hour Changes"
 * it opened a general-conference search for that phrase, which finds nothing.
 *
 * The rule is therefore about whether we can point somewhere real:
 *
 *   talk_link                 — an address was pasted. Nothing to infer.
 *   talk_title AND speaker    — a conference talk, identified well enough that
 *                               searching the title with the surname finds it.
 *   anything else             — a subject somebody typed. The card still shows
 *                               it as the headline; it just isn't a link.
 *
 * The speaker is what separates the two. Picking a talk out of the library
 * fills the title, the speaker and the URL together, so a title standing on
 * its own with no speaker is a lesson subject in the wrong box — which is how
 * it gets used in practice, and no amount of wishing makes a search for it
 * return a talk.
 *
 * One rule in one place because two things ask the question — the feed banner
 * and the weekly email, which must not disagree about whether to say "please
 * read the talk before Sunday". Kept out of talks.js so the email doesn't drag
 * the whole conference library in behind a one-line check.
 */
export function hasTalk(row) {
  if (!row) return false;
  const s = (v) => String(v || "").trim();
  if (s(row.talk_link)) return true;
  return !!(s(row.talk_title) && s(row.speaker));
}

/**
 * How near a Sunday has to be before "this week" is honest.
 *
 * Seven days. Within that the Sunday is the one coming at the end of the week
 * you're standing in; beyond it, it isn't.
 */
export const THIS_WEEK_DAYS = 7;

/**
 * What to call the Sunday a card is about.
 *
 * Two screens head the same Sunday through this function: the member feed
 * banner and the presidency home card. They'd drifted apart once already and
 * this is what keeps them together.
 *
 * The weekly email is deliberately NOT one of them — it writes its own
 * heading in weeklyEmail.js. An earlier version of this comment claimed all
 * three shared this function, which was simply untrue and would have told the
 * next person a rename here was enough. It reads "Next Sunday Lesson" because
 * an email arrives before the Sunday and is read whenever it's read; the two
 * screens are looked at on the day and can say "this week". If they should
 * match, that's a decision to make on purpose rather than by assuming.
 *
 * Two things get qualified rather than assumed:
 *
 * "LESSON" comes off when there isn't one. A fifth Sunday or stake conference
 * card headed "This Week's Lesson" over "no quorum lesson" contradicts itself.
 *
 * "THIS WEEK'S" comes off when the Sunday isn't this week's. The card shows
 * the next *quorum* Sunday, and after general conference or a fifth Sunday
 * that can be a fortnight out — heading a lesson thirteen days away "This
 * Week's Lesson" is wrong in the same quiet way "Read the talk" was wrong
 * with no talk attached. Past the horizon it falls back to "Next".
 *
 * Title case. The feed uppercases it in code, the presidency home in CSS.
 */
export function sundayLabel(sundayIso, todayIso, hasLesson) {
  const s = String(sundayIso || "").slice(0, 10);
  const t = String(todayIso || "").slice(0, 10);
  if (s && s === t) return "Today";

  // Both parsed as UTC, so the offsets cancel and only the difference is used.
  const a = Date.parse(`${t}T00:00:00Z`);
  const b = Date.parse(`${s}T00:00:00Z`);
  const away = Number.isNaN(a) || Number.isNaN(b)
    ? null
    : Math.round((b - a) / 86400000);

  // No usable dates: say the safe thing rather than guessing at "this week".
  const thisWeek = away !== null && away > 0 && away <= THIS_WEEK_DAYS;

  if (thisWeek) return hasLesson ? "This Week's Lesson" : "This Week";
  return hasLesson ? "Next Lesson" : "Next Sunday";
}
