/**
 * The Quick Summary: Sunday's talk in fifteen seconds.
 *
 * "a Cliff Notes style summary or Talk Primer for those who want the executive
 *  summary. Great for those first sitting down in EQ to get up to speed."
 *
 * Four parts, the same four every week — the big idea, a few takeaways, a
 * scripture, something to think about. The sameness is the feature: once
 * you've read one you know where to look, which is what makes it useful to
 * somebody who has just sat down and has about a minute.
 *
 * Pure: text in, fields out. No clock, no database, no DOM.
 */

/** Blank when there's nothing in any of the four. */
export function isEmptyPrimer(p) {
  if (!p) return true;
  return !String(p.idea || "").trim()
    && !(p.takeaways || []).some((t) => String(t || "").trim())
    && !String(p.scripture || "").trim()
    && !String(p.question || "").trim();
}

/**
 * The headings a pasted draft might use, and which field each one means.
 *
 * Generous on purpose. The paste comes from a chat window, so it arrives with
 * markdown hashes, bold asterisks, trailing colons, and whichever synonym the
 * writer reached for that day. Refusing to recognise "Key Takeaways" because
 * the list says "Takeaways" would send somebody back to re-type the whole
 * thing by hand, which is the job this is meant to remove.
 */
const HEADINGS = [
  ["idea", /^(the\s+)?(big\s+idea|main\s+idea|core\s+idea|in\s+one\s+line|summary|overview|the\s+point)$/i],
  ["takeaways", /^((three|3|four|4|five|5|key|main)\s+)?(things|takeaways|take\s*-?\s*aways|points|highlights)(\s+to\s+remember)?$/i],
  ["scripture", /^(scripture|scriptures|verse|reference|references|scripture\s+reference)$/i],
  ["question", /^(worth\s+thinking\s+about|question|questions|to\s+think\s+about|think\s+about|discussion|discussion\s+question|ponder)$/i],
];

/** Strip markdown decoration, numbering and trailing punctuation from a line. */
function bare(line) {
  return String(line || "")
    .replace(/^\s*#{1,6}\s*/, "")           // markdown heading
    .replace(/\*\*/g, "")                    // bold
    .replace(/^\s*[-*•·]\s*/, "")           // bullet
    .replace(/^\s*\d+[.)]\s*/, "")          // "1." or "1)"
    .replace(/\s*:\s*$/, "")                // trailing colon
    .trim();
}

/** Whether a line is a bullet in the source, before bare() eats the marker. */
function isBullet(line) {
  return /^\s*([-*•·]|\d+[.)])\s+/.test(String(line || ""));
}

/** Markdown emphasis, gone. Everything else about the line is left alone. */
function unbold(line) {
  return String(line || "").replace(/\*\*/g, "").replace(/^\s*#{1,6}\s*/, "").trim();
}

/**
 * Which field this line is a heading for, or null.
 *
 * There is deliberately no "too long to be a heading" check. One was written —
 * it looked like the thing keeping prose out — and removing it changed no
 * case, because every pattern above is anchored to a short fixed phrase and a
 * sentence cannot match one however short it is. A guard that can never fire
 * reads as protection and gives none.
 */
function headingFor(line) {
  const text = bare(line);
  if (!text) return null;
  for (const [field, re] of HEADINGS) {
    if (re.test(text)) return field;
  }
  return null;
}

/**
 * A heading, and anything that came after it on the same line.
 *
 * "**Scripture:** Alma 32:21" is one of the commonest shapes a paste arrives
 * in, and reading it as a heading with nothing after it drops the reference
 * into whichever section happened to be open — silently, because the heading
 * itself was recognised and the field simply stayed empty.
 *
 * The {1,40} is how far it will look for the colon, not a claim about what a
 * heading is — headingFor decides that. It stops the inline form scanning a
 * whole paragraph for a colon that turns up in the middle of a sentence.
 */
function splitHeading(line) {
  const whole = headingFor(line);
  if (whole) return { field: whole, rest: "" };

  const m = /^(.{1,40}?):\s*(\S.*)$/.exec(unbold(line));
  if (!m) return null;
  const field = headingFor(m[1]);
  return field ? { field, rest: m[2].trim() } : null;
}

/**
 * Read a pasted draft into the four fields.
 *
 * Headings decide which field each block belongs to. Anything before the first
 * heading is taken as the big idea, because a draft that opens with a sentence
 * and no heading is opening with its point — and dropping it would silently
 * lose the most important line in the paste.
 *
 * A line ending in a colon that matches no known heading is left alone rather
 * than guessed at. Guessing which field an unrecognised heading meant is how
 * somebody's scripture reference ends up filed as a discussion question.
 */
export function parsePrimer(text) {
  const out = { idea: "", takeaways: [], scripture: "", question: "" };
  const lines = String(text || "").split(/\r?\n/);

  let field = "idea";
  const buf = { idea: [], takeaways: [], scripture: [], question: [] };

  const put = (where, text) => {
    if (!text) return;
    if (where === "takeaways") buf.takeaways.push(text);
    else buf[where].push(text);
  };

  for (const line of lines) {
    const head = splitHeading(line);
    if (head) { field = head.field; put(field, head.rest); continue; }
    if (!line.trim()) continue;

    // A bulleted line keeps only its text; everything else keeps its
    // punctuation, because a trailing colon mid-sentence is part of the
    // sentence. Bold markers go either way — they're an artefact of where
    // the draft was written, not something anybody meant to read.
    put(field, isBullet(line) ? bare(line) : unbold(line));
  }

  out.idea = buf.idea.join(" ").trim();
  out.takeaways = buf.takeaways.filter(Boolean);
  out.scripture = buf.scripture.join(" ").trim();
  out.question = buf.question.join(" ").trim();
  return out;
}

/**
 * How many of the four headings a piece of text actually uses.
 *
 * Exists because "did this parse" is not the same question for a person and
 * for a model. A human pasting a draft may reasonably open with a sentence
 * and no heading at all, and parsePrimer takes that as the big idea on
 * purpose. A model that was handed the exact format and replied with prose
 * has not written a primer — it has most likely declined, or explained
 * itself, and "I'm sorry, I can't help with that" makes a perfectly good big
 * idea as far as the parser is concerned.
 *
 * So the automated path asks this as well, and wants more than one: a stray
 * "Scripture:" inside a paragraph of prose shouldn't qualify.
 */
export function countHeadings(text) {
  let n = 0;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (splitHeading(line)) n += 1;
  }
  return n;
}

/**
 * The fields as the database stores them.
 *
 * Empty strings become null rather than "", so "has a primer" is one check
 * against null everywhere instead of a check against null in some places and
 * against "" in others — which is exactly the split that made an empty
 * announcement render as a bullet with nothing after it.
 */
export function primerColumns(p) {
  const clean = (s) => {
    const t = String(s || "").trim();
    return t || null;
  };
  const list = (p?.takeaways || []).map((t) => String(t || "").trim()).filter(Boolean);
  return {
    primer_idea: clean(p?.idea),
    primer_takeaways: list.length ? list : null,
    primer_scripture: clean(p?.scripture),
    primer_question: clean(p?.question),
  };
}

/** ...and back, for a row out of the database. */
export function primerFromRow(row) {
  return {
    idea: row?.primer_idea || "",
    takeaways: Array.isArray(row?.primer_takeaways) ? row.primer_takeaways : [],
    scripture: row?.primer_scripture || "",
    question: row?.primer_question || "",
  };
}

/** Whether a lesson row has a summary worth offering a button for. */
export function hasPrimer(row) {
  return !isEmptyPrimer(primerFromRow(row));
}

/**
 * The primer as plain text — what the paste box shows back, and what somebody
 * copying it into a message gets. Headings match the ones parsePrimer reads,
 * so a round trip through the box doesn't lose anything.
 */
export function primerToText(p) {
  const out = [];
  if (p?.idea) out.push("THE BIG IDEA", p.idea, "");
  const list = (p?.takeaways || []).filter((t) => String(t || "").trim());
  if (list.length) out.push("TAKEAWAYS", ...list.map((t) => `• ${t}`), "");
  if (p?.scripture) out.push("SCRIPTURE", p.scripture, "");
  if (p?.question) out.push("WORTH THINKING ABOUT", p.question, "");
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}
