/**
 * What counts as "there's a talk this week".
 *
 * A teaching row can carry a `topic` — "Ministering", "Temple worship" — with
 * no talk behind it. That's a subject for the teacher to build a lesson
 * around, not something a member can go and read. Treating it as a talk is
 * what put a "Read the talk" link on the feed over a week with no talk
 * assigned: talkUrl() falls back to a Church search for the topic, so the
 * link existed and pointed at a page of search results.
 *
 * `topic` is deliberately not in the rule. A title or a link means somebody
 * chose a specific talk; a topic on its own means nobody has yet.
 *
 * One rule in one place because two things ask the question — the feed banner
 * and the weekly email — and they must not disagree about whether the week
 * has a talk in it. Kept out of talks.js so the email doesn't drag the whole
 * conference library in behind a one-line check.
 */
export function hasTalk(row) {
  if (!row) return false;
  const s = (v) => String(v || "").trim();
  return !!(s(row.talk_link) || s(row.talk_title));
}
