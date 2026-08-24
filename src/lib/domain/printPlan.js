/**
 * Fitting a presidency agenda onto one page.
 *
 * A meeting agenda that runs to two pages is worse than useless — the second
 * sheet gets left on the printer, and nobody notices the last three items.
 * Rather than pick font sizes and hope, this measures: it estimates the height
 * the page would take at a given density, and steps down through tiers until
 * it fits.
 *
 * Everything here is arithmetic on counts and character lengths, so it can be
 * checked without a browser. It is only the opening bid, though: the component
 * measures the sheet once it's in the DOM and adjusts from there.
 *
 * The printed agenda is a one-line-per-item summary — name, date, category —
 * and nothing else. Notes, owners, links and attachments stay in the app. That
 * was a deliberate trade: carrying them meant three or four lines an item, and
 * a page that had to shrink to 9pt to hold a normal week. A sheet somebody can
 * read across a table beats a sheet that repeats what's already on the phone.
 */

// US Letter at 96dpi, less the print margins. Letter is shorter than A4, so
// sizing to Letter fits both.
const PAGE_H = 11 * 96;
const PAGE_W = 8.5 * 96;
const MARGIN_Y = 0.5 * 96;
const MARGIN_X = 0.6 * 96;

export const PRINTABLE_H = PAGE_H - MARGIN_Y * 2;   // 960px
export const PRINTABLE_W = PAGE_W - MARGIN_X * 2;   // 701px (700.8)

/**
 * Density tiers, loosest first.
 *
 * Only spacing and type size change between them; nothing is ever dropped.
 * The page carries a name, a date and a category per item, and there is no
 * arrangement in which it carries less.
 */
export const TIERS = [
  // A short agenda used to print at 11.5pt and leave the bottom third of the
  // sheet empty — it read as unfinished rather than spacious. These two steps
  // above it let a light week fill the page properly.
  { name: "large",    body: 13.5, note: 11.5, rowGap: 13,  sectionGap: 24, headGap: 11 },
  { name: "full",     body: 12.4, note: 10.8, rowGap: 11,  sectionGap: 20, headGap: 9 },
  { name: "roomy",    body: 11.5, note: 10,   rowGap: 9,   sectionGap: 17, headGap: 8 },
  { name: "normal",   body: 10.8, note: 9.4,  rowGap: 7,   sectionGap: 14, headGap: 7 },
  { name: "compact",  body: 10.2, note: 8.8,  rowGap: 5,   sectionGap: 11, headGap: 6 },
  { name: "tight",    body: 9.6,  note: 8.4,  rowGap: 3.5, sectionGap: 9,  headGap: 5 },
  // Two steps below what used to be the floor, for the week that runs long.
  { name: "tighter",  body: 9.1,  note: 8.2,  rowGap: 2.5, sectionGap: 8,  headGap: 4 },
  // Spacing only at the floor — the type stays at 8.6pt, which is the
  // smallest worth handing to someone across a table.
  { name: "smallest", body: 8.6,  note: 8,    rowGap: 1.5, sectionGap: 6,  headGap: 3 },
];

// Roughly how many characters fit on a line at a given point size. An item's
// name has the page less the indent and less the right-hand column its date
// and category sit in.
const GUTTER = 14;
const META_COL = 120;
function linesFor(text, size, width = PRINTABLE_W - GUTTER) {
  if (!text) return 0;
  const perLine = Math.max(20, Math.floor(width / (size * 0.52)));
  return Math.max(1, Math.ceil(String(text).length / perLine));
}

/**
 * How tall the page would be, in px, at this tier.
 *
 * @param {object}   tier      one of TIERS
 * @param {object}   opts
 * @param {object[]} opts.sections  [{ label, items }]
 * @param {object[]} opts.events    upcoming activities, assignments, temple trips
 * @param {boolean}  opts.grouped   a heading per category, or one flat run
 */
export function estimateHeight(tier, { sections = [], events = [], grouped = false }) {
  // Every term below mirrors a real rule in AgendaPrint. An earlier version
  // padded each one "to be safe", and the padding compounded: a page it called
  // 96% full printed at about 74%. The margin for error is one number at the
  // end now, where it can be seen.
  const LINE = 1.35;
  const line = (size) => size * LINE;

  // Masthead: eyebrow, title, rule.
  let h = 10 + 25 + 1 + 5 + 2;
  // The details row — date, time, location, prayers.
  h += 8 + line(8) + 1 + line(10) + 9 + 1;

  // An item is a single row: the name on the left, the date (and, when the
  // page isn't grouped, the category) right-aligned in a fixed column.
  const textW = PRINTABLE_W - GUTTER - META_COL;
  const items = sections.flatMap((s) => s.items || []);

  // The "Agenda Items" band.
  if (items.length) h += tier.sectionGap + line(tier.note) + 4 + 2;

  // Grouped, each group costs a heading.
  if (grouped) {
    const withItems = sections.filter((s) => (s.items || []).length);
    h += withItems.length * (tier.sectionGap + line(tier.note) + 4);
  }

  for (const it of items) {
    h += tier.rowGap + linesFor(it.text, tier.body, textW) * tier.body * 1.3;
  }

  // Upcoming: a tinted panel, two columns.
  const withDates = (events || []).filter((e) => e.when || e.event_date);
  if (withDates.length) {
    const kinds = EVENT_KIND_LABELS
      .map(([kind]) => withDates.filter((e) => (e.kind || "activity") === kind))
      .filter((list) => list.length);

    const blocks = kinds.map((list) =>
      line(tier.note - 0.5) + 2 +
      list.length * (tier.body * 1.25 + tier.note * 1.3 + 3) + 4);

    // A two-column grid is as tall as the taller column of each row, not the
    // sum of every block. Charging the sum was the biggest single over-count.
    let grid = 0;
    for (let i = 0; i < blocks.length; i += 2) {
      grid += Math.max(blocks[i], blocks[i + 1] || 0) + (i ? 2 : 0);
    }

    h += tier.sectionGap + 2 + 2 + 8 + line(tier.note) + 4 + 1 + 7 + grid + 9;
  }

  // Footer.
  h += 5 + 1 + line(8);

  // One explicit margin for error, rather than a thumb on every scale above.
  return Math.round(h + 10);
}

/** A comfortable hand-writing line, and what the "Decisions" heading costs. */
export const RULE_H = 22;
export const WRITE_MIN_LINES = 3;
export const WRITE_MAX_LINES = 16;

export function writeBlockHeight(tier, lines) {
  return tier.sectionGap + 4 + tier.note * 1.35 + 4 + 2 + lines * RULE_H;
}

/**
 * How many ruled lines the leftover space is worth.
 *
 * The writing area used to be `flex: 1` over a repeating-gradient background,
 * which meant the page had to know its own height to stretch into — and the
 * printed sheet is not reliably 960px tall. Browsers apply their own margins,
 * add a header and footer, and scale the whole thing down to make it fit; a
 * column pinned to a hard pixel height came out shrunk, with the bottom
 * quarter blank.
 *
 * Counting the lines instead makes the page a definite length. Nothing has to
 * stretch, nothing gets scaled, and the rules are real borders rather than a
 * background — which matters because browsers do not print background images
 * unless the person ticks a box.
 */
export function writeLinesFor(tier, contentHeight) {
  const heading = tier.sectionGap + 4 + tier.note * 1.35 + 4 + 2;
  const spare = PRINTABLE_H - contentHeight - heading;
  return Math.max(WRITE_MIN_LINES, Math.min(WRITE_MAX_LINES, Math.floor(spare / RULE_H)));
}

/**
 * The loosest type size that still fits on one page.
 *
 * There is nothing left to shed — the page carries a name, a date and a
 * category per item and that is all — so the only lever is density. It steps
 * down through the tiers until the content plus a few lines to write on fits,
 * then, failing that, until the content alone fits, and only then admits it
 * won't hold and lets the screen warn before anyone hits print.
 */
export function choosePrintPlan({ sections = [], events = [], grouped = false } = {}) {
  for (const tier of TIERS) {
    const height = estimateHeight(tier, { sections, events, grouped });
    if (height + writeBlockHeight(tier, WRITE_MIN_LINES) <= PRINTABLE_H) {
      return { ...tier, grouped, height, fits: true, writeLines: writeLinesFor(tier, height) };
    }
  }

  // Nothing left room to write on. A packed agenda that fills the sheet
  // exactly still fits — it just prints with no ruled area, which is a better
  // answer than warning about a second page that isn't coming.
  for (const tier of TIERS) {
    const height = estimateHeight(tier, { sections, events, grouped });
    if (height <= PRINTABLE_H) {
      return { ...tier, grouped, height, fits: true, writeLines: 0 };
    }
  }

  const tier = TIERS[TIERS.length - 1];
  return {
    ...tier, grouped, fits: false, writeLines: 0,
    height: estimateHeight(tier, { sections, events, grouped }),
  };
}

/** How many items are on the agenda, for a "won't fit" message worth reading. */
export function itemCount(sections = []) {
  return sections.reduce((n, s) => n + (s.items || []).length, 0);
}


/**
 * Agenda items in the order the meeting runs them, each carrying its own
 * category.
 *
 * The printed page used to group items under category headings. That reads
 * well when several items share a subject and badly when they don't — a
 * heading over a single item is a heading that earns nothing, and a week with
 * six items in six categories printed as six headings with one line each.
 *
 * So the item's own name is the heading now and its category rides underneath
 * it, which is how the cards on the agenda screen already work. Same order,
 * same information, one less level of nesting.
 *
 * @param {object[]} sections    [{ key, label, items }]
 * @param {object[]} categories  [{ key, label }] — built-in plus any added
 */
export function flattenItems(sections = [], categories = []) {
  const label = (key) => (categories || []).find((c) => c.key === key)?.label;
  const out = [];
  for (const s of sections) {
    for (const it of s.items || []) {
      out.push({
        ...it,
        // An item with no category falls back to the list it was typed into —
        // "Ministering Checks" says more than an empty line does.
        catLabel: label(it.category) || s.label || "",
        accent: PRINT_ACCENTS[it.category] || PRINT_ACCENT_DEFAULT,
      });
    }
  }
  return out;
}

/**
 * Agenda items grouped by what they're about.
 *
 * A presidency meeting runs by subject, not by which list an item happened to
 * be typed into, so the printed copy groups by category. An item with no
 * category falls back to the section it came from rather than being dumped in
 * a bucket called "Other" — "Ministering Checks" is a better heading than
 * nothing, and that's where those items already live.
 *
 * @param {object[]} sections  [{ key, label, items }]
 * @param {object[]} categories  [{ key, label }] — built-in plus any added
 */
export function groupByCategory(sections = [], categories = []) {
  const label = (key) => categories.find((c) => c.key === key)?.label;
  const groups = new Map();

  for (const s of sections) {
    for (const it of s.items || []) {
      const name = label(it.category) || s.label || "Agenda Items";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(it);
    }
  }

  // Category order first, so the page reads the same way every week; anything
  // falling back to a section name goes after, in section order.
  //
  // Keying by label rather than by category key is what merges a section and a
  // category that share a name — "Ministering Checks" is both — into one hub
  // instead of two identical-looking headings next to each other.
  const ordered = [];
  for (const c of categories) {
    if (groups.has(c.label)) {
      ordered.push({ key: c.key, label: c.label, accent: c.accent, items: groups.get(c.label) });
      groups.delete(c.label);
    }
  }
  for (const s of sections) {
    if (groups.has(s.label)) {
      ordered.push({ key: `section:${s.key}`, label: s.label, section: s.key, items: groups.get(s.label) });
      groups.delete(s.label);
    }
  }
  for (const [name, items] of groups) ordered.push({ key: `label:${name}`, label: name, items });
  return ordered;
}

/**
 * Category tones for paper.
 *
 * Greys, not colours. The presidency prints this on a ward machine that is
 * usually black and white, and the colours either came out as muddy halftones
 * or ate the toner. Three steps of grey carry the same "a new subject starts
 * here" signal and cost nothing to print.
 *
 * True neutrals rather than the slate tones the screen uses: those carry a
 * blue cast that a colour printer renders as faintly blue text, which is the
 * colour the presidency asked to be rid of.
 *
 * Kept keyed by category so the tone is stable week to week — Sunday is always
 * the darkest, and the eye learns the shape of the page.
 */
export const PRINT_ACCENTS = {
  sunday: "#1a1a1a",
  activities: "#3d3d3d",
  assignments: "#565656",
  ministering: "#1a1a1a",
  missionary: "#3d3d3d",
  temple: "#565656",
  callings: "#1a1a1a",
  service: "#3d3d3d",
  moves: "#565656",
  need: "#1a1a1a",
};
export const PRINT_ACCENT_DEFAULT = "#757575";

export function printAccent(categories, label) {
  const cat = (categories || []).find((c) => c.label === label);
  return (cat && PRINT_ACCENTS[cat.key]) || PRINT_ACCENT_DEFAULT;
}

/** Upcoming events, split into the three kinds, in a fixed order. */
export const EVENT_KIND_LABELS = [
  ["activity", "Activities"],
  ["assignment", "Assignments"],
  ["temple", "Temple Trips"],
];

export function groupEvents(events = []) {
  return EVENT_KIND_LABELS
    .map(([kind, label]) => ({
      label,
      items: (events || []).filter((e) => (e.kind || "activity") === kind && (e.when || e.event_date)),
    }))
    .filter((g) => g.items.length);
}
