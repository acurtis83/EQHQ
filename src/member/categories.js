// The home-screen tiles and the post categories are the same list, so the
// feed and the shortcuts can never drift apart. Order here is tile order.
//
// "lesson" is deliberately not a category — this Sunday's lesson comes from the
// teaching schedule via the hero card, not from a post someone has to remember
// to write. "groups" is a destination, not a post category.

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
    key: "temple",
    label: "Temple Trips",
    short: "Temple Trips",
    icon: "star",
    accent: "var(--gold)",
    soft: "var(--gold-soft)",
  },
];

export const GROUPS_TILE = {
  key: "groups",
  label: "Groups",
  short: "Groups",
  icon: "users",
  accent: "var(--red)",
  soft: "var(--red-soft)",
};

export function categoryMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];
}
