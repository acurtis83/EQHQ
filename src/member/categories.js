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
    icon: "star",
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
export function sortForFeed(posts, todayIso) {
  const today = todayIso;

  const rank = (p) => {
    if (p.pinned) return 0;
    if (!p.event_date) return 2;
    return p.event_date >= today ? 1 : 3;
  };

  return [...(posts || [])].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;

    // Upcoming: soonest first.
    if (ra === 1) return a.event_date.localeCompare(b.event_date);
    // Past: most recent first.
    if (ra === 3) return b.event_date.localeCompare(a.event_date);
    // Pinned and undated: newest first.
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}
