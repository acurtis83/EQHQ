/**
 * What the app is allowed to record about being used.
 *
 * "can we add a tracker in the settings to view how many people are using the
 *  app or clicking on links weekly?"
 *
 * Eighty brothers is a small enough population that a device id, a timestamp
 * and a roster get most of the way to a name. So the interesting part of this
 * module is not what it sends — it's that the shape of what it sends is fixed
 * here, in one pure function, where it can be read and tested.
 *
 * A label is chosen from the list below and nothing else is ever attached. No
 * post id, no title, no URL, no name. That isn't only policy: usageEvent()
 * discards anything it doesn't recognise, so a future caller that passes
 * `label: post.title` meaning well sends "other" rather than a sentence about
 * somebody's family.
 */

/** Every label the app may record. Anything else becomes OTHER. */
export const LABELS = [
  "signup",    // a sign-up form or an outside sign-up link
  "rsvp",      // the I'm In button
  "talk",      // Read the talk
  "summary",   // Quick Summary
  "schedule",  // Upcoming Lessons
  "groupme",   // the GroupMe invitation
  "link",      // any other link attached to a post
];

export const OTHER = "other";

export const KIND = { OPEN: "open", LINK: "link" };

/** How long a device keeps the same id before making a new one. */
export const DEVICE_KEY = "eq_device";
export const DEVICE_YEAR_KEY = "eq_device_year";

/**
 * One event, in the only shape the database accepts.
 *
 * Returns null for anything that isn't a recognised kind, so a typo at a call
 * site records nothing rather than a row nobody can interpret later.
 */
export function usageEvent(kind, label, device) {
  if (kind !== KIND.OPEN && kind !== KIND.LINK) return null;
  const row = { kind, device: device || null };
  if (kind === KIND.LINK) {
    row.label = LABELS.includes(label) ? label : OTHER;
  }
  return row;
}

/**
 * The device's id for this year, made up by the browser.
 *
 * Rotated annually. Not for anonymity — a year is long enough that it isn't —
 * but so that an id can't follow somebody indefinitely through a database
 * that outlives the presidency that set it up.
 *
 * Takes its storage as an argument so the rule can be checked without a
 * browser, and so a browser with storage disabled gets a fresh id each time
 * rather than an exception: a member with cookies off should still be able to
 * use the app, and counting him twice is a far better failure than not
 * loading.
 */
export function deviceId(store, year, uuid) {
  const now = String(year ?? new Date().getUTCFullYear());
  try {
    const was = store?.getItem?.(DEVICE_YEAR_KEY);
    const id = store?.getItem?.(DEVICE_KEY);
    if (id && was === now) return id;
    const next = uuid ? uuid() : crypto.randomUUID();
    store?.setItem?.(DEVICE_KEY, next);
    store?.setItem?.(DEVICE_YEAR_KEY, now);
    return next;
  } catch {
    // Storage blocked. Still countable, just not across page loads.
    return uuid ? uuid() : crypto.randomUUID();
  }
}

/* ------------------------------ reading it back --------------------------- */

/** The Monday of a week, as an ISO date. Weeks match the Monday email. */
export function weekOf(iso) {
  const s = String(iso || "").slice(0, 10);
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  // getUTCDay: 0 is Sunday, so Sunday belongs to the week that started six
  // days earlier rather than starting a new one.
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(t - back * 86400000).toISOString().slice(0, 10);
}

/**
 * This week and last, from the weekly rollup.
 *
 * `people` is distinct devices, which makes it a lower bound — a brother with
 * a phone and an iPad counts twice over, a shared family tablet counts once
 * for a household. Named "people" anyway because that's what it's for, and
 * said plainly on the screen rather than only here.
 */
export function usageSummary(rows = [], todayIso = "") {
  const thisWeek = weekOf(todayIso);
  const lastWeek = weekOf(new Date(Date.parse(`${thisWeek}T00:00:00Z`) - 86400000)
    .toISOString().slice(0, 10));

  const pick = (week) => (rows || []).filter((r) => String(r?.week || "").slice(0, 10) === week);
  const sum = (list, kind, label) => list
    .filter((r) => r.kind === kind && (label === undefined || r.label === label))
    .reduce((n, r) => n + Number(r.events || 0), 0);
  // People can't be added across rows — the same device appears under several
  // labels — so the open rows carry the honest figure.
  const people = (list) => Math.max(0, ...list
    .filter((r) => r.kind === KIND.OPEN)
    .map((r) => Number(r.people || 0)), 0);

  const now = pick(thisWeek);
  const before = pick(lastWeek);

  const taps = LABELS
    .map((label) => ({ label, count: sum(now, KIND.LINK, label) }))
    .concat([{ label: OTHER, count: sum(now, KIND.LINK, OTHER) }])
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    week: thisWeek,
    people: people(now),
    peopleWas: people(before),
    opens: sum(now, KIND.OPEN),
    opensWas: sum(before, KIND.OPEN),
    taps,
    tapsTotal: sum(now, KIND.LINK),
    tapsWas: sum(before, KIND.LINK),
    // Nothing has been recorded at all — a database without usage.sql run, or
    // a week nobody opened the app. The screen says which.
    empty: !rows?.length,
  };
}
