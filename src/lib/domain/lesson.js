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
 * What to call the Sunday a card is about.
 *
 * Three screens head the same Sunday — the member feed banner, the presidency
 * home card and the weekly email — and they'd all drifted apart: the email had
 * been renamed and the other two still said "This Sunday". One function so the
 * next rename lands everywhere at once.
 *
 * "LESSON" comes off when there isn't one. A fifth Sunday or stake conference
 * card headed "Next Sunday Lesson" over "no quorum lesson" contradicts itself.
 *
 * Title case. The feed uppercases it in code, the presidency home in CSS.
 */
export function sundayLabel(sundayIso, todayIso, hasLesson) {
  if (sundayIso && sundayIso === todayIso) return "Today";
  return hasLesson ? "Next Sunday Lesson" : "Next Sunday";
}
