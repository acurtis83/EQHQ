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

export function agendaCategory(key) {
  return AGENDA_CATEGORIES.find((c) => c.key === key) || null;
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
