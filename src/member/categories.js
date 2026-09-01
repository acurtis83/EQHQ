// The home-screen tiles and the post categories are the same list, so the feed
// and the shortcuts can never drift apart. Order here is tile order, and it
// matches the planner: what you file as an assignment arrives as an assignment.
//
// "lesson" is deliberately not a category — this Sunday's lesson comes from the
// teaching schedule via the hero card, not from a post someone has to remember
// to write.

export const CATEGORIES = [
  {
    key: "announcement",
    label: "Announcements",
    short: "Announcements",
    icon: "bell",
    accent: "var(--primary-deep)",
    soft: "var(--primary-soft)",
  },
  {
    key: "activity",
    label: "Activities",
    short: "Activities",
    icon: "calendar",
    accent: "var(--green)",
    soft: "var(--green-soft)",
  },
  {
    key: "assignment",
    label: "Assignments",
    short: "Assignments",
    icon: "clipboard",
    accent: "var(--red)",
    soft: "var(--red-soft)",
  },
  {
    key: "temple",
    label: "Temple Trips",
    short: "Temple Trips",
    icon: "temple",
    accent: "var(--gold)",
    soft: "var(--gold-soft)",
  },
];

export function categoryMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];
}

/**
 * Feed order.
 *
 * Chronological, but "chronological" has to mean something for posts that
 * have no date at all. The order is:
 *
 *   1. pinned, always first
 *   2. anything still to come, soonest first — the useful end of a feed
 *   3. undated announcements, newest first
 *   4. anything already past, most recent first
 *
 * Sorting purely by created_at buried next week's temple trip under a notice
 * posted an hour ago; sorting purely by event_date threw away every post that
 * doesn't have one.
 */
/**
 * How long an undated announcement stays current.
 *
 * A dated post says when it's over. An announcement doesn't, so without a rule
 * it sits on the feed until somebody deletes it — and nobody deletes anything.
 * A month is long enough that a slow-moving notice gets seen and short enough
 * that the feed is about now.
 */
export const STALE_DAYS = 30;
const DAY = 86400000;

/**
 * Is this post behind us?
 *
 * Three cases, and the order matters:
 *
 *   pinned    — never. Pinning is a deliberate "keep this up", and a pin that
 *               quietly stopped working would be worse than no pin at all.
 *   dated     — once the day itself has gone by. The day of the activity still
 *               counts as current; people check the feed on the way there.
 *   undated   — once it's older than STALE_DAYS.
 *
 * Pure, and takes today rather than reading the clock, so the boundaries can
 * be tested without waiting for midnight.
 */
export function isPast(post, todayIso, nowMs) {
  if (!post || post.pinned) return false;

  const date = String(post.event_date || "").trim();
  if (date) return date < String(todayIso || "");

  const created = String(post.created_at || "").trim();
  if (!created) return false;              // nothing to measure against
  const at = Date.parse(created);
  if (Number.isNaN(at)) return false;      // unparseable — leave it showing

  const now = Number.isFinite(nowMs) ? nowMs : Date.parse(`${todayIso}T00:00:00`);
  if (Number.isNaN(now)) return false;
  return now - at > STALE_DAYS * DAY;
}

/** Split a feed into what's current and what's behind us. */
export function splitByPast(posts = [], todayIso, nowMs) {
  const current = [];
  const past = [];
  for (const p of posts) (isPast(p, todayIso, nowMs) ? past : current).push(p);
  return { current, past };
}

export function sortForFeed(posts, todayIso, nowMs) {
  const today = todayIso;

  const rank = (p) => {
    if (p.pinned) return 0;
    // Asked of isPast rather than of event_date, so a notice that has gone
    // stale sinks with the rest of the past. Ranking it as merely "undated"
    // floated a two-month-old announcement above an activity from last week
    // once the past was on screen — which only became visible when there was
    // a way to show the past at all.
    if (isPast(p, today, nowMs)) return 3;
    if (!p.event_date) return 2;
    return 1;
  };

  // What a post is dated by, for sorting the past: its own date if it has one,
  // otherwise the day it was written. Mixing the two is the point — the past
  // is one list, and it should read newest-first however each row got there.
  const when = (p) =>
    String(p.event_date || "").trim() || String(p.created_at || "").slice(0, 10);

  return [...(posts || [])].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;

    // Upcoming: soonest first.
    if (ra === 1) return a.event_date.localeCompare(b.event_date);
    // Past: most recent first.
    if (ra === 3) return when(b).localeCompare(when(a));
    // Pinned and undated: newest first.
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}
