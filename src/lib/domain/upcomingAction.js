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
