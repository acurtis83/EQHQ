import { qKey, MON } from "./dates.js";
import { quarterOf } from "./ministering.js";
import { bandForAge, BANDS, normalizeName } from "./roster.js";
import { normalizeNameKey } from "./rosterMerge.js";

/**
 * Ministering interviews, quarterly.
 *
 * "Ministering Interviews are done quarterly and can be completed any month
 *  within the quarter."
 *
 * Two levels, and they answer different questions — which is exactly the
 * hybrid Drew asked for:
 *
 *   - a BROTHER is interviewed, in one of the quarter's three months. That's
 *     the record: who reported, and when.
 *   - a COMPANIONSHIP's quarter is complete once ANY of its brothers has
 *     reported. One of a pair usually reports for both, and marking the
 *     companionship incomplete because the other hasn't been caught separately
 *     would put ninety companionships on a follow-up list that only has forty
 *     real gaps in it.
 *
 * The per-brother record is still kept, so "Grant reported, Ben hasn't" is
 * answerable — it just isn't what decides whether the companionship is done.
 *
 * Pure. Quarters and dates are ISO text in, never a clock.
 */

/* -------------------------------- quarters -------------------------------- */

/** The three months of a quarter, as {key, label} — "2026-07", "Jul". */
export function quarterMonths(quarter) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(quarter || ""));
  if (!m) return [];
  const year = Number(m[1]);
  const first = (Number(m[2]) - 1) * 3;
  return [0, 1, 2].map((n) => ({
    key: `${year}-${String(first + n + 1).padStart(2, "0")}`,
    label: MON[first + n],
  }));
}

/** The quarter containing a date, and the one before it. */
export function previousQuarter(quarter) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(quarter || ""));
  if (!m) return "";
  const year = Number(m[1]);
  const q = Number(m[2]);
  return q === 1 ? qKey(year - 1, 4) : qKey(year, q - 1);
}

/* ------------------------------ who reported ------------------------------ */

/** The month a brother's interview was held in, or "" — "2026-07". */
export function heldMonth(row) {
  const d = String(row?.held_on || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(d) ? d : "";
}

/**
 * One brother's interview for a quarter, if there is one.
 *
 * Matched on the stored quarter rather than by re-deriving it from held_on:
 * an interview can be recorded before the date is filled in, and a row with a
 * quarter and no date still means somebody was interviewed.
 */
export function interviewFor(interviews = [], memberId, quarter) {
  if (!memberId || !quarter) return null;
  return (interviews || []).find(
    (i) => i.member_id === memberId
      && (i.quarter === quarter || quarterOf(i.held_on) === quarter)
  ) || null;
}

/** The brothers in a companionship, as ids, in order. */
export function companionsOf(comp) {
  return [comp?.companion_a_id, comp?.companion_b_id].filter(Boolean);
}

/**
 * Is this companionship's quarter complete?
 *
 * Any one brother reporting completes it — see the note at the top. A
 * companionship with nobody assigned to it can't be complete; it's a gap in
 * the assignments, not an interview that's owed.
 */
export function companionshipDone(comp, interviews, quarter) {
  const ids = companionsOf(comp);
  if (!ids.length) return false;
  return ids.some((id) => !!interviewFor(interviews, id, quarter));
}

/**
 * The follow-up list: brothers with families assigned who haven't reported.
 *
 * Deliberately per BROTHER even though a companionship completes on one
 * report. The district leader chasing people needs names, and "this
 * companionship is done" doesn't tell him whether he's spoken to Ben or to
 * Grant.
 */
export function notReporting({ comps = [], interviews = [], quarter, membersById = {} }) {
  const out = [];
  for (const comp of comps) {
    for (const id of companionsOf(comp)) {
      if (interviewFor(interviews, id, quarter)) continue;
      out.push({
        id,
        name: membersById[id]?.name || "Unknown",
        companionshipId: comp.id,
        districtId: comp.district_id,
        // True when nobody in the companionship has reported at all — the
        // ones actually worth chasing first.
        wholeCompanionship: !companionshipDone(comp, interviews, quarter),
      });
    }
  }
  return out;
}

/** Brothers on the roster who aren't in any companionship. */
export function unassignedBrothers({ comps = [], members = [] }) {
  const assigned = new Set(comps.flatMap(companionsOf));
  return (members || []).filter((m) => m.active !== false && !assigned.has(m.id));
}

/* -------------------------------- metrics --------------------------------- */

/**
 * The name of whoever heads a household, for matching against the roster.
 *
 * Households are stored the way LCR writes them — "Lee, Michael & Madeline" —
 * and the roster holds people. The head is the first given name, so this
 * becomes "Michael Lee". It's how a household gets an age at all: there is no
 * age on the household row itself.
 *
 * A household nobody on the roster matches is counted as Unknown rather than
 * dropped. Half the households in a ward are families whose head isn't in the
 * elders quorum, and silently leaving them out would make coverage look
 * better than it is.
 */
export function headOfHousehold(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const [surname, rest] = raw.split(",");
  if (!rest) return raw;
  const firstGiven = rest.split("&")[0].trim();
  return normalizeName(`${surname.trim()}, ${firstGiven}`);
}

/** The age band of a household, via whoever heads it. */
export function bandOfHousehold(house, members = []) {
  const key = normalizeNameKey(headOfHousehold(house?.name));
  if (!key) return "Unknown";
  const match = (members || []).find((m) => normalizeNameKey(m.name) === key);
  return bandForAge(match?.age);
}

/**
 * Is this household covered this quarter?
 *
 * Covered means somebody is assigned AND that companionship has reported.
 * Assigned-but-not-reported is the interesting middle case and is counted
 * separately: it's a different problem from nobody being assigned, and it
 * needs a different conversation.
 */
export function householdStatus(house, comps, interviews, quarter) {
  if (!house?.companionship_id) return "unassigned";
  const comp = (comps || []).find((c) => c.id === house.companionship_id);
  if (!comp) return "unassigned";
  return companionshipDone(comp, interviews, quarter) ? "covered" : "no-report";
}

/**
 * Households by age band, split by how they're doing.
 *
 * Returns every band in the roster's own order, including empty ones, so the
 * table doesn't reshuffle itself as the quarter fills in.
 */
export function householdsByBand({ households = [], comps = [], interviews = [], quarter, members = [] }) {
  const rows = BANDS.map((band) => ({
    band, covered: 0, noReport: 0, unassigned: 0, total: 0,
  }));
  const byBand = new Map(rows.map((r) => [r.band, r]));

  for (const h of households) {
    if (h.active === false) continue;
    const row = byBand.get(bandOfHousehold(h, members)) || byBand.get("Unknown");
    const status = householdStatus(h, comps, interviews, quarter);
    row.total += 1;
    if (status === "covered") row.covered += 1;
    else if (status === "no-report") row.noReport += 1;
    else row.unassigned += 1;
  }
  return rows;
}

/** The same, for the brothers doing the ministering. */
export function brothersByBand({ comps = [], interviews = [], quarter, members = [] }) {
  const byId = new Map((members || []).map((m) => [m.id, m]));
  const rows = BANDS.map((band) => ({ band, reported: 0, missing: 0, total: 0 }));
  const byBand = new Map(rows.map((r) => [r.band, r]));

  for (const comp of comps) {
    for (const id of companionsOf(comp)) {
      const row = byBand.get(bandForAge(byId.get(id)?.age)) || byBand.get("Unknown");
      row.total += 1;
      if (interviewFor(interviews, id, quarter)) row.reported += 1;
      else row.missing += 1;
    }
  }
  return rows;
}

/**
 * Households with a location, tagged with how they're doing, for the map.
 *
 * Only the ones that geocoded. A household with no coordinates isn't a gap in
 * coverage, it's a gap in the address — so it's counted separately rather than
 * quietly dropped, which would make the map look more complete than the ward
 * is.
 */
export function coveragePoints({ households = [], comps = [], interviews = [], quarter }) {
  const points = [];
  let missingLocation = 0;
  for (const h of households) {
    if (h.active === false) continue;
    if (typeof h.lat !== "number" || typeof h.lng !== "number") { missingLocation += 1; continue; }
    points.push({
      id: h.id,
      name: h.name,
      lat: h.lat,
      lng: h.lng,
      status: householdStatus(h, comps, interviews, quarter),
    });
  }
  return { points, missingLocation };
}

/** One line for the top of the screen. */
export function quarterSummary({ comps = [], interviews = [], quarter }) {
  const done = comps.filter((c) => companionshipDone(c, interviews, quarter)).length;
  return { done, total: comps.length, left: comps.length - done };
}
