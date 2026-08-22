// Repeating events.
//
// Basketball every Thursday is one row with a rule, not fifty rows. That keeps
// "change the time" a single edit, and means a repeat with no end date doesn't
// have to invent a horizon to generate up to.
//
// The anchor is the row's own event_date — its weekday (or day of month) is
// what repeats. `repeat_until` is inclusive; null means it carries on.

import { DOW, MON, isoParts, toIso } from "./dates.js";

export const REPEAT_RULES = [
  { key: "", label: "Does not repeat" },
  { key: "weekly", label: "Every week" },
  { key: "biweekly", label: "Every other week" },
  { key: "monthly", label: "Monthly, same date" },
];

const DAY = 86400000;

// Parse an ISO date as local midnight. `new Date("2026-09-03")` is parsed as
// UTC, which lands on the previous evening in Utah and shifts the weekday.
function at(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function repeats(row) {
  return !!(row && row.repeat_rule && row.event_date);
}

/**
 * The first occurrence on or after `fromIso`.
 *
 * @returns {string|null} ISO date, or null when the series has finished (or
 *   the row is a one-off already in the past).
 */
export function nextOccurrence(row, fromIso) {
  if (!row || !row.event_date) return null;
  const from = String(fromIso);

  if (!repeats(row)) return row.event_date >= from ? row.event_date : null;

  const start = at(row.event_date);
  const target = at(from);
  const until = row.repeat_until ? at(row.repeat_until) : null;

  // Already in the future — the series hasn't started yet.
  let next = start;

  if (target > start) {
    if (row.repeat_rule === "monthly") {
      // Same day of the month. Months are uneven and JavaScript rolls an
      // impossible date forward — new Date(2026, 1, 31) is 3 March — which
      // would silently move a "31st of the month" event to the 3rd. Months
      // that don't have the day are skipped instead, which is what calendars
      // do and what someone picking the 31st means.
      const day = start.getDate();
      next = null;
      for (let i = 1; i <= 120; i++) {
        const candidate = new Date(start.getFullYear(), start.getMonth() + i, day);
        if (candidate.getDate() !== day) continue;   // month too short
        if (candidate >= target) { next = candidate; break; }
      }
      if (!next) return null;
    } else {
      const step = row.repeat_rule === "biweekly" ? 14 : 7;
      const gap = Math.ceil((target - start) / (DAY * step));
      next = new Date(start.getTime() + gap * step * DAY);
      // Guard against a daylight-saving shift leaving it a day short.
      while (next < target) next = new Date(next.getTime() + step * DAY);
    }
  }

  if (until && next > until) return null;
  return toIso(next);
}

/**
 * Every occurrence in a window, for building sign-up slots.
 * Capped so a rule with no end date can't run away.
 */
export function occurrencesBetween(row, startIso, endIso, cap = 60) {
  const out = [];
  let cursor = startIso;
  for (let i = 0; i < cap; i++) {
    const next = nextOccurrence(row, cursor);
    if (!next || next > endIso) break;
    out.push(next);
    cursor = toIso(new Date(at(next).getTime() + DAY));
  }
  return out;
}

/** "Every Thursday", "Every other Thursday until 18 Dec" — for a chip. */
export function describeRepeat(row) {
  if (!repeats(row)) return "";
  const d = at(row.event_date);
  const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  const base =
    row.repeat_rule === "weekly" ? `Every ${day}`
      : row.repeat_rule === "biweekly" ? `Every other ${day}`
        : `Monthly on the ${ordinal(d.getDate())}`;
  if (!row.repeat_until) return base;
  // isoParts returns a Date, not parts — read it with Date methods.
  const u = isoParts(row.repeat_until);
  return `${base} until ${MON[u.getMonth()]} ${u.getDate()}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Short label for a generated slot: "Thu, Sep 3". */
export function slotLabel(iso) {
  const d = isoParts(iso);
  return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}
