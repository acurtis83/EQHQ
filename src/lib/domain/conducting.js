/**
 * Who conducts the Sunday quorum meeting, month by month.
 *
 * Conducting rotates monthly, so the Sunday agenda was asking the same
 * question four or five times a month and getting the same answer. This holds
 * a year of it in one place: set it once in the autumn, and every Sunday
 * agenda opens with the right name already in the box.
 *
 * A month, not a Sunday, is the unit. That's how the presidency actually
 * divides it up, and a schedule with fifty-two rows is one nobody fills in.
 *
 * Nothing here touches a database or a clock it isn't handed. `todayIso` is
 * always a parameter so a year of scheduling can be tested without waiting a
 * year, and so the tests don't change behaviour on the 1st of the month.
 */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** How many months a schedule covers. A year is the horizon people plan on. */
export const HORIZON = 12;

/**
 * "2026-09" — the key a month is stored under.
 *
 * Built from the string rather than from a Date. `new Date("2026-09-06")`
 * parses as UTC midnight, which in any timezone behind UTC is the 5th of
 * September — so a date in the first hours of a month lands in the month
 * before, and one Sunday a month gets the wrong conductor. Slicing the ISO
 * text has no timezone to get wrong.
 */
export function monthKey(iso) {
  const s = String(iso || "");
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : "";
}

/** "September 2026", for a heading. */
export function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!m) return "";
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${m[1]}` : "";
}

/** The month after this one, rolling the year over in December. */
export function nextMonth(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!m) return "";
  let y = Number(m[1]);
  let mo = Number(m[2]) + 1;
  if (mo > 12) { mo = 1; y += 1; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/**
 * The next `count` months starting from the one `fromIso` falls in.
 *
 * Starts at the current month rather than the next one: it's the 20th of
 * August and nobody has said who conducts *this* month is a real situation,
 * and a schedule that begins in September can't fix it.
 */
export function monthsFrom(fromIso, count = HORIZON) {
  let key = monthKey(fromIso);
  if (!key) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ key, label: monthLabel(key) });
    key = nextMonth(key);
  }
  return out;
}

/**
 * Deal a list of names round-robin across a list of months.
 *
 * Returns a plain { "2026-09": "Drew Curtis" } map rather than writing
 * anything, so the screen can show what the button would do and the
 * presidency can adjust a month before saving.
 *
 * `startWith` is the name to begin on — the button offers "carry on from
 * whoever has the last assigned month" so re-rotating a part-filled year
 * doesn't hand the same person two months in a row across the join.
 */
export function rotate(months = [], names = [], startWith = "") {
  const list = (names || []).map((n) => String(n || "").trim()).filter(Boolean);
  if (!list.length) return {};
  const from = list.indexOf(String(startWith || "").trim());
  const offset = from >= 0 ? from + 1 : 0;
  const out = {};
  months.forEach((m, i) => {
    out[m.key || m] = list[(i + offset) % list.length];
  });
  return out;
}

/**
 * Who conducts on a given Sunday, according to the schedule.
 *
 * "" when the month hasn't been filled in, which the agenda treats as "no
 * suggestion" rather than "nobody" — an empty schedule must leave the field
 * exactly as it behaved before this existed.
 */
export function conductorFor(schedule, iso) {
  const key = monthKey(iso);
  if (!key) return "";
  return String(schedule?.[key] || "").trim();
}

/**
 * What the Conducting box should show for a Sunday.
 *
 * The agenda's own value wins when it has one — that's a deliberate override
 * for one week, and it must survive the schedule changing underneath it.
 * Otherwise the month's conductor shows through.
 *
 * Returns the source as well as the name, because a name that arrived from the
 * schedule should say so on screen. Somebody looking at a filled-in box needs
 * to know whether they're seeing a decision or a default.
 */
export function conductingFor(agenda, schedule) {
  const own = String(agenda?.conducting || "").trim();
  if (own) return { name: own, from: "agenda" };
  const name = conductorFor(schedule, agenda?.meeting_date || agenda?.date);
  return name ? { name, from: "schedule" } : { name: "", from: "none" };
}

/** Rows keyed by month, as the table stores them, into a plain lookup. */
export function scheduleFromRows(rows = []) {
  const out = {};
  for (const r of rows) {
    const key = String(r?.month || "").trim();
    if (key) out[key] = String(r.name || "").trim();
  }
  return out;
}

/** How many of the months on screen still have nobody against them. */
export function unassignedCount(months = [], schedule = {}) {
  return months.filter((m) => !String(schedule[m.key] || "").trim()).length;
}
