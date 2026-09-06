/**
 * What a row in Upcoming lets you do.
 *
 * Three kinds of thing end up on that list and each takes a different action,
 * which is exactly the sort of decision that ends up written three times in
 * three components and drifts. It lives here instead, and the weekly email's
 * eventLink() makes the same distinction for the same reasons — a sign-up form
 * beats an RSVP, and something with neither is just an announcement.
 *
 * Pure: a post in, a decision out. No clock, no database, no DOM.
 */

export const ACTION = {
  SIGNUP: "signup",   // a form to fill in — takes you off to it
  RSVP: "rsvp",       // an "I'm In" that works in place
  NONE: "none",       // nothing to do but read it
};

/** A sign-up link is one that opens a form: /?f=<id>. */
export function signUpHref(post) {
  const url = String(post?.link_url || "").trim();
  return /[?&]f=/.test(url) ? url : "";
}

/**
 * The action for one upcoming item.
 *
 * A form wins over an RSVP when a post somehow has both: the form is the one
 * that collects something — a dish, a time slot, a car seat — and an RSVP
 * alongside it would be asking the same people the same question twice.
 *
 * `allow_signup` is the quorum's own sign-up sheet, which lives on the post
 * itself rather than behind a link. It counts as a sign-up too, but there's
 * nowhere to send anybody, so it's the post that has to be opened.
 */
export function actionFor(post) {
  const href = signUpHref(post);
  if (href) return { kind: ACTION.SIGNUP, label: "Sign Up", href };
  if (post?.allow_signup) return { kind: ACTION.SIGNUP, label: "Sign Up", href: "" };
  if (post?.rsvp) return { kind: ACTION.RSVP, label: "I’m In", href: "" };
  return { kind: ACTION.NONE, label: "", href: "" };
}

/**
 * Everything still ahead, soonest first.
 *
 * Dated posts only. An undated announcement has nothing to sort by and no
 * date to show, and putting it in a list headed by dates would be claiming
 * something the post never said.
 *
 * Today counts as ahead — people check on the way to the thing, which is the
 * same rule the feed uses for hiding what's past.
 */
export function upcomingFrom(posts = [], todayIso = "") {
  return (posts || [])
    .filter((p) => p?.event_date && String(p.event_date) >= String(todayIso))
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
}

/* ------------------------- how many to show up front ---------------------- */

/**
 * The next fortnight. Anything inside it is close enough that somebody needs
 * to know about it now, whether that's two things or nine.
 */
export const HORIZON_DAYS = 14;

/**
 * ...and a floor, so a quiet fortnight doesn't leave an almost-empty card.
 * Three is enough to look like a list rather than an oversight.
 */
export const MIN_SHOWN = 3;

/**
 * Add days to an ISO date and get an ISO date back.
 *
 * Every step is UTC: parsed with an explicit Z, advanced in milliseconds, and
 * sliced back out with toISOString. The machine's timezone never enters, so
 * this returns the same answer in Utah as it does anywhere else.
 *
 * That matters because the tempting version doesn't. `new Date("2026-09-06")`
 * followed by getDate()/setDate() reads and writes in *local* time off a value
 * parsed as UTC midnight — which in Utah is already the 5th — and the cutoff
 * comes out a day early. An event on the fourteenth day would then drop off
 * the list on the morning it became relevant, and it would only misbehave for
 * people west of Greenwich, which is everyone in the ward and nobody in a
 * test that runs in UTC. tests/upcoming.mjs runs this under two extreme
 * timezones for exactly that reason.
 */
export function addDays(iso, days) {
  const s = String(iso || "").slice(0, 10);
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return "";
  return new Date(t + Number(days || 0) * 86400000).toISOString().slice(0, 10);
}

/**
 * How many of the upcoming list to show before "See all".
 *
 * "i would would be nice if the list showed (at a minimum) anything that is
 *  in the next 14 days"
 *
 * A count is the wrong unit and a fortnight is the right one: five is either
 * too many in a quiet month or too few in the week of a temple trip, and
 * which of those you get is luck. So the rule is everything inside the
 * horizon, floored at MIN_SHOWN and never more than there is.
 *
 * `posts` must already be soonest-first — upcomingFrom() sorts it — because
 * this returns a count that the caller slices from the front. If it weren't
 * sorted, the count would be right and the rows would be the wrong ones,
 * which is the kind of bug that looks like a display glitch for months.
 */
export function shownCount(posts = [], todayIso = "", opts = {}) {
  const days = opts.days ?? HORIZON_DAYS;
  const floor = opts.floor ?? MIN_SHOWN;
  const list = posts || [];
  const cutoff = addDays(todayIso, days);
  const soon = cutoff
    ? list.filter((p) => p?.event_date && String(p.event_date) <= cutoff).length
    : 0;
  // Never claim to show more than exists, or "See all 4" appears next to a
  // list of four.
  return Math.min(list.length, Math.max(soon, floor));
}
