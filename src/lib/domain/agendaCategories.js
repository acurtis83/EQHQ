/**
 * What a presidency agenda item is about.
 *
 * These are the recurring subjects of a quorum presidency meeting, so an
 * agenda can be scanned by topic rather than read top to bottom. Kept as data
 * in one place because the meeting agenda, the planner, and the preview all
 * render the same set and would otherwise drift.
 *
 * The key is what's stored, so renaming a label is safe but changing a key
 * would orphan existing rows.
 */
export const AGENDA_CATEGORIES = [
  { key: "sunday",     label: "Sunday",                  accent: "var(--primary-deep)", soft: "var(--primary-soft)" },
  { key: "ministering", label: "Ministering",            accent: "var(--green)",        soft: "var(--green-soft)" },
  { key: "missionary", label: "Missionary Work",         accent: "var(--primary)",      soft: "var(--primary-soft)" },
  { key: "temple",     label: "Temple & Family History", accent: "var(--gold)",         soft: "var(--gold-soft)" },
  { key: "callings",   label: "Callings/Releasings",     accent: "var(--red)",          soft: "var(--red-soft)" },
  { key: "service",    label: "Service",                 accent: "var(--green)",        soft: "var(--green-soft)" },
  { key: "moves",      label: "Move In/Out",             accent: "var(--sub)",          soft: "var(--inset)" },
  { key: "need",       label: "Member in Need",          accent: "var(--red)",          soft: "var(--red-soft)" },
];

export function agendaCategory(key, extra) {
  if (!key) return null;
  return [...AGENDA_CATEGORIES, ...(extra || [])].find((c) => c.key === key) || null;
}

/**
 * A key for a category the presidency typed.
 *
 * Slugged rather than stored verbatim because the key is what lands on every
 * item that uses it — renaming the label later must not orphan them. A name
 * with nothing sluggable in it (say, only punctuation) still gets a key, so
 * adding one can't silently do nothing.
 */
export function categoryKey(label, taken) {
  const base = String(label || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "category";
  const used = new Set(
    [...AGENDA_CATEGORIES.map((c) => c.key), ...(taken || [])]
  );
  if (!used.has(base)) return base;
  for (let i = 2; i < 500; i++) {
    if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/** Built-in first, then whatever was added, in the order they were added. */
export function allCategories(extra) {
  return [...AGENDA_CATEGORIES, ...(extra || [])];
}

/**
 * The calling stages that still need presidency attention.
 *
 * A calling stops being agenda business once it's been sustained — after that
 * it's a set-apart to schedule, not a decision to make. "Need to Release" is
 * deliberately out: it belongs to the release conversation, which the tracker
 * handles on its own.
 */
export const OPEN_CALLING_STAGES = ["Need", "Proposed", "Approved", "Called"];

export function openCallings(callings) {
  return (callings || [])
    .filter((c) => OPEN_CALLING_STAGES.includes(c.stage))
    // Tracker order, so the list reads the same way the board does.
    .sort((a, b) =>
      OPEN_CALLING_STAGES.indexOf(a.stage) - OPEN_CALLING_STAGES.indexOf(b.stage) ||
      String(a.position || "").localeCompare(String(b.position || "")));
}
