/**
 * Announcements: what members see, and what to warn the secretary about.
 *
 * Two features share this file because they share one question — "are these
 * two announcements the same announcement?" — and that question is easy to
 * answer two slightly different ways in two places.
 *
 * Pure. Dates come in as ISO text, never from a clock, so a year of Sundays
 * can be checked without waiting a year.
 */

/* ------------------------------ the feed hub ------------------------------ */

/**
 * How many to show before "See all".
 *
 * Unlike Upcoming there's no time horizon to work with — every announcement on
 * the list was made on the same day, so nothing distinguishes them by urgency.
 * Four is about a phone-screen's worth next to the other hubs; a long Sunday
 * goes behind the toggle rather than pushing Recent Activity off the screen.
 */
export const MAX_SHOWN = 4;

/**
 * The announcements from one Sunday, in the order they were read out.
 *
 * Blank rows are dropped. The agenda's add-row leaves an empty item behind
 * more often than you'd think, and on the presidency's own screen that reads
 * as an obvious gap to type into — on the feed it would be a mystery bullet.
 */
export function sundayAnnouncements(rows = []) {
  return (rows || [])
    .map((r) => ({
      text: String(r?.text || "").trim(),
      link: String(r?.link_url || "").trim(),
      sort: Number(r?.sort_order ?? 0),
    }))
    .filter((r) => r.text)
    .sort((a, b) => a.sort - b.sort);
}

/* --------------------------- is this the same thing? ---------------------- */

/**
 * Words too common to count as agreement.
 *
 * Two announcements both saying "please remember to bring your families to the
 * activity on Saturday" share a lot of words and no content. Stripping these
 * first means the comparison runs on the words that actually name the thing.
 */
const FILLER = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "brethren", "brother",
  "but", "by", "can", "come", "for", "from", "has", "have", "if", "in", "is",
  "it", "its", "just", "of", "on", "one", "or", "our", "out", "please", "so",
  "that", "the", "their", "them", "there", "they", "this", "to", "up", "us",
  "we", "will", "with", "you", "your",
]);

/** Lowercase, punctuation gone, single spaces. */
export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words that carry the meaning, deduped. */
export function keyWords(s) {
  return new Set(norm(s).split(" ").filter((w) => w && w.length > 2 && !FILLER.has(w)));
}

/**
 * How much two texts overlap, 0 to 1.
 *
 * Jaccard: shared words over total distinct words. Symmetric, so it can't
 * matter which of a pair is checked against which — a rule that said "a
 * contains b" would flag a pair once when read in one direction and not the
 * other, and the warning would appear or vanish depending on sort order.
 */
export function overlap(a, b) {
  const A = keyWords(a);
  const B = keyWords(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / (A.size + B.size - shared);
}

/**
 * The line between "worded differently" and "said twice".
 *
 * Set against real announcements rather than picked: 0.7 catches "Ward temple
 * night is Thursday at 7pm" against "Temple night Thursday 7pm" (0.8) while
 * clearing "bring your families on Saturday" against "bring a chair on
 * Saturday" (0.6) — two different notices that share only the verbs every
 * announcement uses. That second pair is what moved this up from 0.6, where
 * it was flagged.
 *
 * It errs toward silence. A missed duplicate costs Karl a re-read; a false one
 * teaches him to click past the warnings, and then the real one goes unread
 * too.
 */
export const SIMILAR_AT = 0.7;

/**
 * Enough substance to compare at all.
 *
 * "Temple night" against "Temple recommends" would score well on two words
 * apiece, and short announcements are exactly where a false positive is most
 * annoying — they're the ones that really are separate items.
 */
const MIN_WORDS = 3;

export function saysTheSameAs(a, b) {
  const A = keyWords(a);
  const B = keyWords(b);
  if (A.size < MIN_WORDS || B.size < MIN_WORDS) return norm(a) === norm(b) && !!norm(a);
  return overlap(a, b) >= SIMILAR_AT;
}

/**
 * Does this text talk about the thing that title names?
 *
 * A different question from saysTheSameAs, and it needs a different answer.
 * "Come to the stake blood drive on Friday" against the event "Stake Blood
 * Drive" scores 0.6 on overlap — the announcement is longer, and every extra
 * word it adds counts against it — so a similarity threshold high enough to
 * be useful between two announcements would never match a short title at all.
 *
 * What's actually being asked is containment: is the whole title in there?
 * All of its words have to appear, so "Stake Blood Drive" doesn't match an
 * announcement that merely mentions the stake.
 */
export function mentions(text, title) {
  const T = keyWords(title);
  if (!T.size) return false;
  // A one-word title is too weak to match on — an event called "Basketball"
  // would claim every announcement with the word in it. Fall back to the
  // phrase appearing literally.
  if (T.size < 2) return norm(text).includes(norm(title));
  const words = keyWords(text);
  for (const w of T) if (!words.has(w)) return false;
  return true;
}

/* ---------------------------- the secretary's checks ---------------------- */

/**
 * Announcements on the feed that never made it onto the Sunday agenda.
 *
 * This is the one that loses information. The agenda is what the email is
 * built from, so a notice posted straight to the feed — which is the quick
 * way, and therefore the common way — is read by whoever opens the app and by
 * nobody else. Karl finds out when someone says they never heard.
 *
 * A feed post matches an agenda item if either its title or its body says the
 * same thing: people write "Temple night" as the title and the detail in the
 * body, and the agenda item is usually one sentence combining both.
 */
export function missingFromAgenda(feedPosts = [], agendaItems = []) {
  const agenda = (agendaItems || []).map((i) => String(i?.text || "")).filter(Boolean);
  return (feedPosts || []).filter((p) => {
    const title = String(p?.title || "").trim();
    const body = String(p?.body || "").trim();
    if (!title && !body) return false;
    return !agenda.some((t) => saysTheSameAs(t, title) || (body && saysTheSameAs(t, body)));
  });
}

/**
 * Pairs of agenda announcements that say the same thing.
 *
 * Usually one carried forward from last Sunday and one retyped this week,
 * which is how the roll-forward is *supposed* to behave — it can't know that
 * the sentence somebody typed fresh is the one it already has.
 *
 * Each pair is reported once, by index order.
 */
export function nearDuplicates(items = []) {
  const list = (items || []).map((i) => ({ item: i, text: String(i?.text || "").trim() }));
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (!list[i].text || !list[j].text) continue;
      if (saysTheSameAs(list[i].text, list[j].text)) {
        out.push({ a: list[i].item, b: list[j].item });
      }
    }
  }
  return out;
}

/**
 * Announcements that restate an event the email already lists.
 *
 * The email prints events as their own section with dates and links, so an
 * announcement that just says the activity is on Thursday is the same
 * information twice, a few lines apart.
 *
 * Matched on the event's TITLE only. Comparing against a location or a date
 * would catch every announcement that happens to mention the church.
 */
export function restatingEvents(items = [], events = []) {
  const out = [];
  for (const item of items || []) {
    const text = String(item?.text || "").trim();
    if (!text) continue;
    const hit = (events || []).find((e) => {
      const title = String(e?.title || "").trim();
      return title && mentions(text, title);
    });
    if (hit) out.push({ item, event: hit });
  }
  return out;
}

/**
 * Everything worth mentioning before the email goes out, as a flat list.
 *
 * Returned rather than rendered so the wording can be checked without a
 * browser, and so the screen doesn't decide what counts as a problem.
 *
 * Ordered by how much it costs to get wrong: something missing entirely comes
 * before something said twice.
 */
export function announcementWarnings({ agendaItems = [], feedPosts = [], events = [] } = {}) {
  const out = [];

  for (const p of missingFromAgenda(feedPosts, agendaItems)) {
    out.push({
      kind: "missing",
      id: `missing-${p.id}`,
      text: String(p.title || p.body || "").trim(),
      detail: "On the feed but not on the Sunday agenda, so it won't be in the email.",
    });
  }

  for (const { a, b } of nearDuplicates(agendaItems)) {
    out.push({
      kind: "duplicate",
      id: `dup-${a.id}-${b.id}`,
      text: String(a.text || "").trim(),
      other: String(b.text || "").trim(),
      detail: "Says much the same as another announcement.",
    });
  }

  for (const { item, event } of restatingEvents(agendaItems, events)) {
    out.push({
      kind: "event",
      id: `event-${item.id}`,
      text: String(item.text || "").trim(),
      other: String(event.title || "").trim(),
      detail: "Already listed under what's coming up, with its date and link.",
    });
  }

  return out;
}

/* --------------------------- bringing them forward ------------------------ */

/**
 * Last Sunday's announcements that aren't on this Sunday's agenda yet.
 *
 * The automatic carry runs once per agenda and can miss: an agenda opened
 * before the previous week's announcements were written up marks itself
 * carried and never looks again. That's how notices about the 11th and the
 * 12th stayed on the 6th's agenda while the 13th's sat empty.
 *
 * So this is the manual way back — offered rather than applied, because by
 * the time anybody presses it the week has moved on and some of those notices
 * really are finished.
 *
 * Matching is by wording, not by id. A carried row is a new row with its own
 * id, and the same announcement is often retyped rather than carried, so
 * comparing ids would offer to add things that are plainly already there.
 * saysTheSameAs is the same comparison the secretary's duplicate warning
 * uses, which is what stops the two disagreeing about whether a pair matches.
 */
export function notYetCarried(previous = [], current = [], toDate = "") {
  const here = (current || []).map((r) => String(r?.text || "")).filter(Boolean);
  return (previous || []).filter((row) => {
    const text = String(row?.text || "").trim();
    if (!text) return false;
    // Pinned to its own week by whoever wrote it.
    if (row.carry_over === false) return false;
    // Already over by the Sunday it would appear on.
    if (toDate && row.expires_on && String(row.expires_on) < String(toDate)) return false;
    return !here.some((t) => saysTheSameAs(t, text));
  });
}

/* -------------------------------- reordering ------------------------------ */

/**
 * Move one announcement up or down, returning the rows in their new order.
 *
 * Pure, and returns the whole list rather than a pair of rows to swap. The
 * caller writes every sort_order back, which is what makes this safe on data
 * that arrived crooked: agendas carry rows whose sort_order collided or left
 * gaps (a carried batch starts at the count of what was already there, and a
 * deleted row leaves a hole), and a swap-two-values approach silently does
 * nothing when both rows claim the same number.
 *
 * Out-of-range moves return the list unchanged rather than wrapping. Wrapping
 * from the top to the bottom is never what somebody tapping "up" wanted.
 */
export function moveAnnouncement(rows = [], id, delta) {
  const list = [...(rows || [])];
  const from = list.findIndex((r) => r?.id === id);
  if (from < 0) return list;
  const to = from + Number(delta || 0);
  if (to < 0 || to >= list.length) return list;
  const [row] = list.splice(from, 1);
  list.splice(to, 0, row);
  return list;
}

/**
 * The writes needed to store an order: one {id, sort_order} per row that moved.
 *
 * Only the rows whose position actually changed, so reordering a list of
 * fifteen after one tap is two updates rather than fifteen.
 */
export function orderWrites(rows = []) {
  return (rows || [])
    .map((r, i) => ({ id: r?.id, sort_order: i, changed: r?.sort_order !== i }))
    .filter((r) => r.id && r.changed)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}
