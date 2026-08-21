// Date + meeting-cadence logic, carried over from the legacy EQ Planner.
// This encodes how the quorum actually meets — worth preserving exactly.

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isoParts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIso(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = isoParts(iso);
  return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtShort(iso) {
  if (!iso) return "";
  const d = isoParts(iso);
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}

export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return "";
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function timeAgo(isoTs) {
  if (!isoTs) return "";
  const then = new Date(isoTs);
  const sec = Math.floor((Date.now() - then.getTime()) / 1000);
  if (sec < 45) return "just now";
  if (sec < 90) return "a minute ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  let h = then.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${MON[then.getMonth()]} ${then.getDate()}, ${h}:${String(then.getMinutes()).padStart(2, "0")} ${ap}`;
}

export function sundayOccurrence(dt) {
  return Math.floor((dt.getDate() - 1) / 7) + 1; // 1..5
}

export function firstSundayOf(year, m0) {
  const d = new Date(year, m0, 1);
  const off = (7 - d.getDay()) % 7;
  return new Date(year, m0, 1 + off);
}

export function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isGeneralConf(dt) {
  const y = dt.getFullYear();
  return sameDay(dt, firstSundayOf(y, 3)) || sameDay(dt, firstSundayOf(y, 9));
}

// The quorum meets 2nd & 4th Sundays until Sep 6, 2026; every Sunday after.
export const WEEKLY_CHANGE = "2026-09-06";

// Sundays with no EQ-taught lesson fall into three kinds. They are NOT the same
// thing: a 5th Sunday still has a meeting, it's just directed by the bishopric,
// so no teacher gets assigned but the date isn't blank either.
export const NO_LESSON = {
  GENERAL_CONF: "General Conference",
  STAKE_CONF: "Stake Conference",
  FIFTH_SUNDAY: "5th Sunday — Bishopric Directed",
};

// True when the quorum gathers as a quorum with its own lesson and teacher.
// stakeConf: array or Set of ISO dates.
export function isQuorumSunday(iso, stakeConf) {
  return !noLessonReason(iso, stakeConf) && isScheduledSunday(iso);
}

// Does the cadence put a quorum meeting on this Sunday at all, ignoring exceptions?
export function isScheduledSunday(iso) {
  const occ = sundayOccurrence(isoParts(iso));
  if (iso < WEEKLY_CHANGE) return occ === 2 || occ === 4;
  return true;
}

function asSet(stakeConf) {
  if (!stakeConf) return new Set();
  return stakeConf instanceof Set ? stakeConf : new Set(stakeConf);
}

// Why this Sunday has no EQ lesson, or "" if it's a normal teaching Sunday.
// Stake conference wins over everything — it replaces the whole block.
export function noLessonReason(iso, stakeConf) {
  const dt = isoParts(iso);
  if (asSet(stakeConf).has(iso)) return NO_LESSON.STAKE_CONF;
  if (isGeneralConf(dt)) return NO_LESSON.GENERAL_CONF;
  if (sundayOccurrence(dt) === 5) return NO_LESSON.FIFTH_SUNDAY;
  return "";
}

// A 5th Sunday still meets — it just isn't the quorum's lesson to plan.
export function isBishopricDirected(iso, stakeConf) {
  return noLessonReason(iso, stakeConf) === NO_LESSON.FIFTH_SUNDAY;
}

export function sundaysBetween(startIso, endIso) {
  const out = [];
  let d = isoParts(startIso);
  const end = isoParts(endIso);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d <= end) {
    out.push(toIso(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  }
  return out;
}

export function nextQuorumSunday(fromIso, stakeConf) {
  const start = fromIso || toIso(new Date());
  const horizon = new Date(isoParts(start).getTime() + 400 * 86400000);
  for (const iso of sundaysBetween(start, toIso(horizon))) {
    if (isQuorumSunday(iso, stakeConf)) return iso;
  }
  return "";
}

// Every Sunday in a range, tagged with what happens on it.
// This is what the teaching schedule renders from.
export function scheduleBetween(startIso, endIso, stakeConf) {
  return sundaysBetween(startIso, endIso)
    .filter(isScheduledSunday)
    .map((iso) => {
      const reason = noLessonReason(iso, stakeConf);
      return { date: iso, teaches: !reason, reason };
    });
}

export function quarterOf(d) {
  const dt = d ? new Date(d) : new Date();
  return { y: dt.getFullYear(), q: Math.floor(dt.getMonth() / 3) + 1 };
}

export function qKey(y, q) {
  return `${y}-Q${q}`;
}

export function shiftQuarter(y, q, delta) {
  const idx = y * 4 + (q - 1) + delta;
  return { y: Math.floor(idx / 4), q: (idx % 4) + 1 };
}
