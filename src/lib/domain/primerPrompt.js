import { parsePrimer, isEmptyPrimer, countHeadings } from "./primer.js";

/**
 * What to ask for, and what counts as an answer.
 *
 * Kept apart from the function that does the asking so both halves can be
 * checked without a network or a key: the prompt is a string built from a row,
 * and the reply is text run through the same parser the paste box uses. The
 * scheduled function is then only plumbing.
 */

/**
 * Who this is for, in the prompt, because it decides everything about the
 * output — length, tone, and what gets left out.
 *
 * The reading level and the "no new doctrine" line are not politeness. This
 * text is published to the whole quorum under the ward's name with nobody
 * reading it first, so the one failure that matters is a summary that puts
 * words in a general authority's mouth. Asking for it to stay inside the talk
 * is cheap; catching it afterwards is not.
 */
export const SYSTEM = [
  "You write a short primer on a General Conference talk for members of an",
  "elders quorum who are about to discuss it on Sunday. Many will not have",
  "read the talk; some are reading your summary in the thirty seconds after",
  "sitting down.",
  "",
  "Rules:",
  "- Everything you write must come from the talk itself. Add no doctrine,",
  "  no cross-references and no application the speaker did not make.",
  "- Write in your own words. Quote at most one phrase, under ten words.",
  "- Plain, warm, unfussy English. No throat-clearing and no exhortation.",
  "- BE SHORT. The big idea is two sentences at most. Each takeaway is ONE",
  "  line — about fifteen words, never more than twenty-five. A bullet that",
  "  wraps to three lines on a phone is a paragraph with a dot in front of",
  "  it, and a screen of those is the wall of text this exists to replace.",
  "- Three or four takeaways. Not five, not six.",
  "- If the talk does not support one of the sections, leave it out entirely",
  "  rather than padding it.",
].join("\n");

/**
 * The shape asked for is exactly the shape parsePrimer reads, headings and
 * all. Asking for JSON was the obvious alternative and is worse here: the
 * headed text is the same thing a human pastes in, so one parser serves both
 * and there is no second format to keep in step.
 */
export function primerPrompt({ title, speaker, text }) {
  return [
    `Talk: ${title || "(untitled)"}`,
    speaker ? `Speaker: ${speaker}` : "",
    "",
    "Write the primer in exactly this format, with these headings:",
    "",
    "THE BIG IDEA",
    "One or two sentences. The thing to keep if you keep nothing else.",
    "",
    "TAKEAWAYS",
    "• three or four bullets, one line each",
    "",
    "SCRIPTURE",
    "The passage the talk turns on, as a reference with a few words of context.",
    "",
    "WORTH THINKING ABOUT",
    "One question a brother could sit with. Not rhetorical.",
    "",
    "---- the talk ----",
    text,
  ].filter((l) => l !== "").join("\n");
}

/**
 * What came back, or null.
 *
 * A model reply that parses to nothing — an apology, a refusal, a wall of
 * prose with no headings — must not be written to the database, because
 * nothing downstream would ever show it as broken: the feed would simply have
 * a Quick Summary button leading to an empty sheet. Better to save nothing and
 * leave the button absent, which is the state everyone already understands.
 */
export function readReply(text) {
  // Headings first, and this is the check that matters. parsePrimer takes
  // unheaded opening text as the big idea — right for a person pasting a
  // draft, wrong here, because it means "I'm sorry, I can't help with that"
  // parses beautifully into a primer that would then be published to the
  // whole quorum.
  if (countHeadings(text) < 2) return null;

  const p = parsePrimer(text);
  if (isEmptyPrimer(p)) return null;
  // The sheet leads with the big idea. A reply that produced only a question
  // is not a primer.
  if (!p.idea && !p.takeaways.length) return null;
  return p;
}
