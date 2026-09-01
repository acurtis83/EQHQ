/**
 * Who teaches on which Sunday of the month, by default.
 *
 * The quorum's teaching pattern isn't "rotate everybody evenly" — that's the
 * Generate button, and it answers a different question. It's a standing
 * arrangement: the first Sunday is the presidency's or an invited speaker, the
 * second is one brother, the fourth is another. Writing it down means the
 * schedule fills itself in and the gaps are the interesting part.
 *
 * A *suggestion*, not an assignment. Nothing here reaches the weekly email or
 * the members' feed, because those say who is teaching and the quorum should
 * not be told a man is teaching before anybody has asked him. The Teaching
 * screen shows the suggestion greyed out and one button turns it into a real
 * assignment.
 *
 * Pure — dates in, names out. No clock, no database.
 */

import { isoParts, sundayOccurrence } from "./dates.js";

/**
 * Four slots, not five.
 *
 * A fifth Sunday is bishopric-directed and has no quorum lesson, so a fifth
 * slot could never be used. `slotForDate` returns 5 for those days and every
 * lookup misses, which is the behaviour we want without a special case.
 */
export const SLOTS = [1, 2, 3, 4];

const ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" };

export function slotLabel(slot) {
  return ORDINALS[slot] ? `${ORDINALS[slot]} Sunday` : "";
}

/**
 * Which Sunday of the month a date is — 1 for the 1st, and so on.
 *
 * Built from the ISO text through isoParts, which parses as *local* time.
 * `new Date("2026-09-06")` is UTC midnight, which in Utah is the 5th of
 * September — a Saturday — and the arithmetic below would then be answering
 * for the wrong day entirely.
 */
export function slotForDate(iso) {
  const s = String(iso || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0;
  return sundayOccurrence(isoParts(s));
}

/** Rows as the table stores them into a plain { 1: "Cameron Butler" } lookup. */
export function rotationFromRows(rows = []) {
  const out = {};
  for (const r of rows) {
    const slot = Number(r?.slot);
    if (SLOTS.includes(slot)) out[slot] = String(r.name || "").trim();
  }
  return out;
}

/**
 * Who the rotation says should teach on a given Sunday.
 *
 * "" when the slot is empty or the date is a fifth Sunday — which the caller
 * treats as "no suggestion", so an unset rotation leaves the screen exactly as
 * it behaved before this existed.
 */
export function rotationFor(rotation, iso) {
  const slot = slotForDate(iso);
  if (!SLOTS.includes(slot)) return "";
  return String(rotation?.[slot] || "").trim();
}

/**
 * What the Teaching screen should show for a Sunday, and where it came from.
 *
 * A real assignment always wins. The rotation only speaks for Sundays nobody
 * has answered for, which is what keeps "suggested" and "assigned" two
 * different things on screen rather than one hopeful one.
 */
export function teacherFor(row, rotation, iso) {
  const assigned = String(row?.teacher_name || "").trim();
  if (assigned) return { name: assigned, from: "assigned", slot: slotForDate(iso) };

  const suggested = rotationFor(rotation, iso);
  if (suggested) return { name: suggested, from: "rotation", slot: slotForDate(iso) };

  return { name: "", from: "none", slot: slotForDate(iso) };
}

/**
 * The Sundays that Apply would actually change.
 *
 * Only ones with a suggestion and no teacher: applying must never overwrite a
 * decision somebody already made, and a button that says "Apply rotation to 5"
 * has to mean five.
 *
 * @param {object[]} sundays  [{ date, teaches }] from the teaching schedule
 * @param {object}   byDate   existing assignment rows keyed by date
 * @param {object}   rotation slot -> name
 */
export function pendingRotation(sundays = [], byDate = {}, rotation = {}) {
  const out = [];
  for (const s of sundays) {
    if (!s?.teaches) continue;                       // conference, 5th Sunday
    if (String(byDate[s.date]?.teacher_name || "").trim()) continue;
    const name = rotationFor(rotation, s.date);
    if (name) out.push({ date: s.date, name, slot: slotForDate(s.date) });
  }
  return out;
}

/**
 * Match a rotation name to somebody on the roster.
 *
 * A slot can hold a real brother or a standing arrangement — "Invite/
 * Presidency" is not a person. When it does name somebody, the assignment
 * should carry their id as well as their name, so the schedule links up with
 * the roster the same way a hand-made assignment does.
 */
export function memberFor(name, members = []) {
  const want = String(name || "").trim().toLowerCase();
  if (!want) return null;
  return (members || []).find((m) => String(m?.name || "").trim().toLowerCase() === want) || null;
}

/** How many of the four slots have nobody in them yet. */
export function emptySlots(rotation = {}) {
  return SLOTS.filter((s) => !String(rotation[s] || "").trim()).length;
}
