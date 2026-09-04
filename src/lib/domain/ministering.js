/**
 * How a companionship and the households it covers are actually doing.
 *
 * Four warning signs, chosen because they're the four the presidency can do
 * something about:
 *
 *   1. nobody has logged contact with the household in a while
 *   2. the quarterly interview hasn't been held
 *   3. the companionship is short a companion, or has none at all
 *   4. the companions' own check-in answers are trending low
 *
 * A flag is a fact, not a judgement. "No contact logged in nine weeks" might
 * mean a family is being neglected or might mean the companionship is doing
 * fine and not writing it down, and the screen says the former while meaning
 * the latter unless the wording is careful. Everything here is named for what
 * was measured — `noContact`, not `neglected`.
 *
 * Nothing in this file touches a database or reads a clock it wasn't handed.
 * `todayIso` is always a parameter, so a year of ministering can be tested
 * without waiting a year and the tests don't change behaviour in October.
 */

// Extension included, like every other module in here: Vite would resolve it
// without one, but the arithmetic suites run under plain Node, which won't.
import { qKey } from "./dates.js";

/* ------------------------------- thresholds ------------------------------- */

/**
 * Days without a logged contact before a household is flagged.
 *
 * Ministering is a monthly expectation, so 30 days is "due" rather than
 * "wrong" and flagging at 30 would light up half the ward on the 31st of
 * every month — a warning that's always on is one nobody reads. 60 days is
 * two missed months, which is a real gap and few enough to act on.
 */
export const CONTACT_DUE_DAYS = 30;
export const CONTACT_OVERDUE_DAYS = 60;

/**
 * A 1–5 scale answer at or below this is treated as low.
 *
 * 3 is the mid-point and reads as "fine, nothing to report", so the threshold
 * has to sit below it or every neutral answer becomes a concern.
 */
export const LOW_SCORE = 2.5;

/** How many answers before an average means anything. One bad day isn't a trend. */
export const MIN_RESPONSES = 2;

export const FLAG = {
  NO_CONTACT: "noContact",
  NO_INTERVIEW: "noInterview",
  INCOMPLETE: "incomplete",
  LOW_PULSE: "lowPulse",
};

/** What each flag says on screen. Kept here so the map and the list agree. */
export const FLAG_LABEL = {
  [FLAG.NO_CONTACT]: "No contact logged",
  [FLAG.NO_INTERVIEW]: "Interview not held",
  [FLAG.INCOMPLETE]: "Companionship incomplete",
  [FLAG.LOW_PULSE]: "Check-in scores low",
};

/* --------------------------------- dates ---------------------------------- */

const DAY = 86400000;

/**
 * Days between two ISO dates.
 *
 * Both are parsed as UTC, which is wrong by up to a day in Utah — but both
 * are wrong by the same amount and this only ever takes the difference, so
 * the offsets cancel. Parsing one as local and one as UTC is what would
 * introduce an error, which is why neither goes near `new Date(iso)` alone.
 */
export function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${String(fromIso || "").slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toIso || "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY);
}

/**
 * "2026-Q3" — the quarter an ISO date falls in.
 *
 * The key is built by dates.qKey rather than by a template string here. That
 * string is what ministering_interviews.quarter holds, it's what the legacy
 * importer wrote, and it's what the interviews screen queries by: two places
 * formatting it independently would agree right up until one of them was
 * changed, and then a whole quarter of interviews would silently stop
 * counting.
 *
 * The month is sliced out of the ISO text rather than parsed. `new Date(iso)`
 * reads as UTC midnight, which in Utah is the previous day — so the 1st of
 * October would land in Q3 and every companionship would look overdue for an
 * interview on the day the quarter turned.
 */
export function quarterOf(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  return qKey(Number(m[1]), Math.floor((Number(m[2]) - 1) / 3) + 1);
}

/* ------------------------------ the log ----------------------------------- */

/** The most recent contact date for a household, or "" if there's never been one. */
export function lastContact(contacts = [], householdId) {
  let best = "";
  for (const c of contacts || []) {
    if (!c || c.household_id !== householdId) continue;
    const d = String(c.contacted_on || "").slice(0, 10);
    if (d && d > best) best = d;
  }
  return best;
}

/* ---------------------------- the check-in pulse -------------------------- */

/**
 * Average of the scale answers the two companions gave on a check-in survey.
 *
 * Responses arrive as `{ name, score }` already flattened out of the forms
 * tables — this module doesn't know what a form_answer looks like, and
 * shouldn't. Matching is by name because that's all an anonymous-capable
 * survey has; names are compared case- and space-insensitively for the same
 * reason the roster importer does it.
 *
 * Returns null rather than a number when there isn't enough to go on, and
 * null is not low — a companionship that never filled in the survey has not
 * told us anything, and treating silence as a bad score would flag exactly
 * the companionships nobody has managed to reach.
 */
export function pulseFor(responses = [], names = []) {
  const want = new Set(
    (names || []).map((n) => String(n || "").trim().toLowerCase()).filter(Boolean)
  );
  if (!want.size) return null;
  const scores = [];
  for (const r of responses || []) {
    const who = String(r?.name || "").trim().toLowerCase();
    if (!want.has(who)) continue;
    const v = Number(r?.score);
    if (Number.isFinite(v)) scores.push(v);
  }
  if (scores.length < MIN_RESPONSES) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/* ------------------------------ companionships ---------------------------- */

/** The names on a companionship, in order, blanks dropped. */
export function companionNames(comp, byId = {}) {
  return [comp?.companion_a_id, comp?.companion_b_id]
    .map((id) => (id ? byId[id]?.name : null))
    .map((n) => String(n || "").trim())
    .filter(Boolean);
}

/**
 * Is the companionship short-handed?
 *
 * Both a missing companion and a companion who's no longer on the roster or
 * has gone inactive count: a companionship whose second name left the ward in
 * March is a solo companionship, however it looks in the database.
 */
export function isIncomplete(comp, byId = {}) {
  const ids = [comp?.companion_a_id, comp?.companion_b_id];
  let live = 0;
  for (const id of ids) {
    if (!id) continue;
    const m = byId[id];
    if (m && m.active !== false) live++;
  }
  return live < 2;
}

/* -------------------------------- the rules ------------------------------- */

/**
 * Score one household.
 *
 * `ctx` carries everything the rules need, already looked up:
 *   todayIso, contacts, comps (by id), members (by id), interviews, responses
 *
 * Returns the flags that fired and a level derived from how many. The level
 * is deliberately coarse — three buckets, because a map with nine shades of
 * amber tells you nothing you can act on.
 */
export function scoreHousehold(household, ctx = {}) {
  const {
    todayIso = "", contacts = [], compsById = {}, membersById = {},
    interviews = [], responses = [],
  } = ctx;

  const flags = [];
  const comp = household?.companionship_id ? compsById[household.companionship_id] : null;

  // 1. contact
  const last = lastContact(contacts, household?.id);
  const since = last ? daysBetween(last, todayIso) : null;
  // Never contacted counts as overdue, but only once the household has been
  // on the books long enough to have been visited — a family added yesterday
  // isn't behind on anything.
  const added = household?.created_at ? String(household.created_at).slice(0, 10) : "";
  const age = added ? daysBetween(added, todayIso) : null;
  const neverButOld = !last && (age === null || age >= CONTACT_OVERDUE_DAYS);
  if (neverButOld || (since !== null && since >= CONTACT_OVERDUE_DAYS)) {
    flags.push(FLAG.NO_CONTACT);
  }

  // 2. interview, for the quarter we're in now
  const q = quarterOf(todayIso);
  if (comp) {
    const held = (interviews || []).some(
      (i) => i && i.companionship_id === comp.id && i.quarter === q && i.held_on
    );
    if (!held) flags.push(FLAG.NO_INTERVIEW);
  }

  // 3. the companionship itself. No companionship at all is the worst version
  //    of incomplete, not a separate flag — it's the same problem, and the
  //    household detail says which it is.
  if (!comp || isIncomplete(comp, membersById)) flags.push(FLAG.INCOMPLETE);

  // 4. how the companions say they're doing
  const pulse = comp ? pulseFor(responses, companionNames(comp, membersById)) : null;
  if (pulse !== null && pulse <= LOW_SCORE) flags.push(FLAG.LOW_PULSE);

  return {
    id: household?.id,
    flags,
    level: levelFor(flags.length),
    lastContact: last,
    daysSinceContact: since,
    pulse,
    struggling: flags.length >= 2,
  };
}

/**
 * Flags to a level.
 *
 * Two is the line for "struggling" rather than one, and that's the judgement
 * call in this file. Almost every companionship trips one flag at some point
 * in a quarter — the interview one alone lights up the whole ward in the first
 * week of January — so at one flag the map would be entirely red in week one
 * and entirely green in week twelve, which is a calendar, not a diagnosis.
 * Two independent signals at once is the point where it's worth a look.
 */
export function levelFor(count) {
  if (count >= 2) return "concern";
  if (count === 1) return "watch";
  return "ok";
}

export const LEVELS = ["ok", "watch", "concern"];

/** Score every household in one pass. */
export function scoreAll(households = [], ctx = {}) {
  return (households || [])
    .filter((h) => h && h.active !== false)
    .map((h) => scoreHousehold(h, ctx));
}

/**
 * Roll household scores up to whatever they hang off — a companionship, or a
 * district. `keyOf` says which.
 *
 * A group's level is its worst household's, not its average: a district of
 * twenty families where one has been out of contact all quarter is a district
 * with a problem, and averaging hides exactly the household that needs
 * finding.
 */
export function rollUp(scores = [], households = [], keyOf = () => null) {
  const byId = {};
  for (const h of households || []) if (h?.id) byId[h.id] = h;

  const groups = new Map();
  for (const s of scores || []) {
    const key = keyOf(byId[s.id], s);
    if (key === null || key === undefined) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, total: 0, struggling: 0, level: "ok", flags: {}, worst: 0 });
    }
    const g = groups.get(key);
    g.total++;
    if (s.struggling) g.struggling++;
    if (s.flags.length > g.worst) { g.worst = s.flags.length; g.level = s.level; }
    for (const f of s.flags) g.flags[f] = (g.flags[f] || 0) + 1;
  }
  return [...groups.values()];
}

/** How many households sit at each level. For the summary strip. */
export function tally(scores = []) {
  const out = { ok: 0, watch: 0, concern: 0 };
  for (const s of scores || []) if (out[s?.level] !== undefined) out[s.level]++;
  return out;
}
