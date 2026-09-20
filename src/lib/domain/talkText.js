/**
 * A conference talk page, reduced to the talk.
 *
 * The page a talk lives on is mostly not the talk: every session and every
 * other talk in the conference is in the navigation, and the footnotes run to
 * half the length again. Sending all of it to a model costs tokens and, worse,
 * gives it forty other talk titles to confuse with the one it was asked about.
 *
 * Deliberately not an HTML parser. The markup on these pages changes without
 * warning and a selector that silently stops matching would hand the model a
 * navigation menu and get back a confident summary of nothing. So the tags are
 * stripped first and the trimming happens on the text, using two features that
 * have been stable for years: the byline that opens a talk, and the "Notes"
 * heading that closes it. Neither found means no trim — the whole page goes,
 * which is wasteful but never wrong.
 */

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  mdash: "—", ndash: "–", hellip: "…",
};

function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Tags out, paragraph breaks kept — they're what makes the text readable. */
export function stripTags(html) {
  return decode(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Block ends become line breaks so sentences don't run together.
      .replace(/<\/(p|div|h[1-6]|li|section|article|br)\s*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.trim()).join("\n")
    .trim();
}

/** Where the talk starts: the byline under the title. */
const BYLINE = /^By\s+(Elder|President|Sister|Brother|Bishop)\b.*$/im;

/** ...and where it stops: the footnotes. */
const NOTES = /^\s*Notes\s*$/im;

export function talkBody(html, { max = 24000 } = {}) {
  let text = stripTags(html);

  const by = BYLINE.exec(text);
  if (by) text = text.slice(by.index);

  // Only a Notes heading that comes after some actual talk. The word turns up
  // in the navigation of some pages, and cutting there would leave nothing.
  const rest = text.slice(400);
  const notes = NOTES.exec(rest);
  if (notes) text = text.slice(0, 400 + notes.index);

  text = text.trim();
  // A cap, because a runaway page shouldn't turn into a runaway bill. Cut at a
  // paragraph break rather than mid-sentence where there's one to hand.
  if (text.length > max) {
    const cut = text.lastIndexOf("\n\n", max);
    text = text.slice(0, cut > max * 0.6 ? cut : max);
  }
  return text;
}

/** Enough of a talk to be worth summarising, or not. */
export function looksLikeTalk(text) {
  return String(text || "").trim().length >= 600;
}
