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
 * Twelve point when it can be, ten point at worst, and never smaller.
 *
 * This has been round the houses. It first picked from eight densities and
 * came out at 13.5pt one week and 9.6pt the next, so nobody could tell this
 * week's sheet from last week's. It was then pinned to a flat 12pt, which is
 * legible and predictable and simply refuses to hold a busy week.
 *
 * The ladder below is the middle: five steps over two points. Twelve to ten is
 * a difference you have to look for, so the page keeps its shape week to week,
 * and two points is worth roughly six extra items — which covers the weeks
 * that were overflowing. Below ten it stops shrinking and prints two pages;
 * type small enough to squint at is not a page anybody reads either.
 *
 * CSS lengths here are pixels, and print is 96 pixels to the inch against 72
 * points, so a point is 4/3 of a pixel. Setting `body: 12` directly would have
 * printed at nine point.
 */
export const PT = 96 / 72;
export const BODY_PT = 12;
export const FLOOR_PT = 10;
export const pt = (n) => Math.round(n * PT * 100) / 100;

// The note line scales with the body but not proportionally — at 10pt a
// proportional 7.9pt category line stops being readable, so it closes on the
// body as the body shrinks.
function tierAt(bodyPt) {
  return {
    name: `${bodyPt}pt`,
    bodyPt,
    body: pt(bodyPt),
    note: pt(Math.max(8.5, bodyPt - 2.5)),
    rowGap: bodyPt >= 11.5 ? 9 : 7,
    sectionGap: bodyPt >= 11.5 ? 18 : 14,
    headGap: 9,
  };
}

export const TIERS = [12, 11.5, 11, 10.5, 10].map(tierAt);

/** The one everything starts at, and the one a short agenda keeps. */
export const TIER = TIERS[0];

/**
 * The item row: what it says on the left, room to write on the right.
 *
 * The whole right half of the sheet used to be blank — items ran down a narrow
 * strip and the presidency wrote on the back or on their phones. Now the row
 * is two cells: the name and its category on the left, ruled lines on the
 * right, so the notes land next to the thing they're about.
 *
 * The split is a fraction rather than a fixed width so it holds at every tier.
 * 54% leaves the longest realistic item name on two lines at 10pt while giving
 * the notes a usable 3.2 inches.
 */
export const NAME_FRAC = 0.54;
export const COL_GAP = 14;
export const ITEM_RULES = 2;

export const nameW = () => Math.floor(PRINTABLE_W * NAME_FRAC);
export const noteW = () => PRINTABLE_W - nameW() - COL_GAP;

/**
 * How tall one writing rule is inside an item row.
 *
 * Sized so that two of them come out level with the two lines of text beside
 * them — a name and its category — because a row where the rules finish above
 * or below the text reads as a mistake. The +1 is the border, the same way
 * RULE_TOTAL works for the block at the bottom.
 */
export const itemRuleH = (tier) => Math.round(tier.body * 1.15);
export const itemRulesH = (tier) => ITEM_RULES * (itemRuleH(tier) + 1);

/**
 * How many lines a name takes in the column beside its notes.
 *
 * Items wrap inside the name column now rather than across the page, which is
 * the single biggest change to the estimate — the same text takes about twice
 * the lines, and getting the width per character wrong is immediately a whole
 * line out.
 *
 * CHAR_W is measured, not guessed. It was 0.52 by eye, which is 17% too wide
 * for the serif this prints in: Georgia at 600 weight averages 0.446 of its
 * font size per character over a sample of real agenda items, and holds that
 * ratio at every tier. The wrong figure cost a phantom line on any item long
 * enough to wrap, which the browser check caught as a 21px over-estimate.
 *
 * There is deliberately no extra allowance for ragged line breaks on top of
 * that. One was tried — five per cent, to cover text breaking at the last word
 * that fits rather than filling the line — and setting it back to zero changed
 * no case in the browser check, which makes it padding that isn't earning its
 * place. Rounding up to whole lines already absorbs the raggedness. The one
 * cushion on this estimate is the explicit +6 at the end of estimateHeight,
 * where it can be seen.
 */
const CHAR_W = 0.446;

function linesFor(text, size, width = nameW()) {
  if (!text) return 0;
  const perLine = Math.max(12, Math.floor(width / (size * CHAR_W)));
  return Math.max(1, Math.ceil(String(text).length / perLine));
}

/**
 * How tall one item row is: whichever side is taller.
 *
 * A flex row is as tall as its tallest cell, so an item whose name wraps to
 * three lines pushes the row past the rules, and a one-line item still gets
 * the full two rules' worth of writing space. Charging only for the text was
 * what left the old estimate short.
 */
export function itemRowH(tier, it, grouped) {
  const LINE = 1.3;
  const textH = linesFor(it.text, tier.body) * tier.body * LINE +
    (hasMeta(it, grouped) ? 1 + tier.note * LINE : 0);
  return Math.max(textH, itemRulesH(tier));
}

/**
 * Whether the line under the name has anything on it.
 *
 * Grouped, the heading above has already said the category, so an item with no
 * date has nothing to put there and the line is dropped rather than left
 * hanging.
 */
export function hasMeta(it, grouped) {
  return grouped ? !!it.due_date : !!(it.due_date || it.category || it.catLabel);
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

  const items = sections.flatMap((s) => s.items || []);

  // The "Agenda Items" band.
  if (items.length) h += tier.sectionGap + line(tier.note) + 4 + 2;

  // Grouped, each group costs a heading. Measured against Chrome at 12pt: the
  // heading itself plus its margin comes to sectionGap + one line, and the
  // extra 4 this used to add was over-charging by about 34px on a page with
  // eight groups.
  if (grouped) {
    const withItems = sections.filter((s) => (s.items || []).length);
    h += withItems.length * (tier.sectionGap + line(tier.note));
  }

  for (const it of items) {
    h += tier.rowGap + itemRowH(tier, it, grouped);
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

  // Footer, including the 12px it sits below whatever is above it. That margin
  // was missing, which is a small number that mattered: it was the difference
  // between the sheet measuring 960 and measuring 964, and 964 is two pages.
  h += 12 + 5 + 1 + line(8);

  // One explicit margin for error, rather than a thumb on every scale above.
  // Measured against Chrome, the terms above land within a few pixels of the
  // real layout, so this is a small deliberate cushion rather than slack.
  return Math.round(h + 6);
}

/**
 * A hand-writing line, and what the "Decisions" heading costs.
 *
 * RULE_H is the CSS height; the 1px border underneath makes each line occupy
 * one more than that. Measuring the rendered page is how that turned up —
 * three lines were quietly 3px taller than the arithmetic said.
 */
export const RULE_H = 22;
export const RULE_TOTAL = RULE_H + 1;
// Below this the block is more heading than paper, so nothing is drawn.
export const WRITE_MIN_LINES = 2;
// Capped lower than it was. Every item now carries its own note space, so this
// block is for what comes out of the meeting rather than the only place to
// write — sixteen rules under a four-item agenda was a page of empty paper.
export const WRITE_MAX_LINES = 10;

/** The "Follow-Up & Next Steps" band: its top margin, line box, rule. */
export function writeHeadingHeight(tier) {
  return tier.sectionGap + 4 + tier.note * 1.35 + 4 + 2;
}

export function writeBlockHeight(tier, lines) {
  return lines > 0 ? writeHeadingHeight(tier) + lines * RULE_TOTAL : 0;
}

/**
 * How many ruled lines the leftover space is worth.
 *
 * The writing area used to be `flex: 1` over a repeating-gradient background,
 * which meant the page had to know its own height to stretch into — and the
 * printed sheet is not reliably that tall. Counting the lines instead makes
 * the page a definite length: nothing stretches, nothing gets scaled, and the
 * rules are real borders rather than a background, which matters because
 * browsers don't print background images unless the person ticks a box.
 *
 * Returns 0 when there's no room. It used to insist on three, which turned a
 * page with room for two into a page with none — and, worse, into a page the
 * fitter called too long.
 */
export function writeLinesFor(tier, contentHeight) {
  const spare = PRINTABLE_H - contentHeight - writeHeadingHeight(tier);
  const lines = Math.floor(spare / RULE_TOTAL);
  if (lines < WRITE_MIN_LINES) return 0;
  return Math.min(WRITE_MAX_LINES, lines);
}

/**
 * Pick the largest type the page will hold.
 *
 * Walks down the ladder and takes the first tier that fits. If none do — an
 * agenda long enough to beat 10pt — it returns the floor with `fits: false`,
 * and the screen says so before anybody prints. Shrinking further would buy a
 * single page at the cost of a page nobody can read; two honest pages is the
 * better trade at that point.
 *
 * `fits` is about the content alone. The writing block is sized from whatever
 * is left over, so it can never be the thing that pushes the page over.
 */
export function choosePrintPlan({ sections = [], events = [], grouped = false } = {}) {
  const heights = TIERS.map((tier) => ({
    tier,
    height: estimateHeight(tier, { sections, events, grouped }),
  }));

  // The largest type that holds the content *and* the Follow-Up block.
  //
  // The block is reserved, not left over. A busy meeting is exactly the one
  // that produces assignments, and busy weeks were the ones losing it.
  //
  // Reserving it is also what keeps the size honest. Two earlier versions
  // treated the block as optional and both produced type that got *bigger*
  // when you added an item — at fourteen items the search shrank to hold the
  // block, at fifteen no tier could hold it so the search gave up and jumped
  // back to the top. A page whose type grows as the agenda grows is one nobody
  // trusts. With one criterion instead of two there's nothing to cross over:
  // the size only ever falls.
  //
  // Past the floor the block is dropped rather than the page split, because at
  // that point the sheet is already as small as it prints and losing four
  // ruled lines costs less than losing a whole side of paper.
  const room = ({ tier, height }) =>
    height + writeBlockHeight(tier, WRITE_MIN_LINES) <= PRINTABLE_H;

  const chosen = heights.find(room) || heights[heights.length - 1];

  const { tier, height } = chosen;
  return {
    ...tier,
    grouped,
    height,
    fits: height <= PRINTABLE_H,
    // How far down the ladder we had to go, so the screen can mention it
    // rather than silently handing back a smaller sheet.
    shrunk: tier.bodyPt < BODY_PT,
    writeLines: writeLinesFor(tier, height),
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
 * @param {string[]} order  the presidency's own order for this meeting, if any
 */
export function groupByCategory(sections = [], categories = [], order = []) {
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
  return orderGroups(ordered, order);
}

/**
 * Put the categories in the order the presidency chose for this meeting.
 *
 * A meeting doesn't always run in the same order — a move-in that needs
 * deciding today goes first, whatever the list normally looks like. The saved
 * order is a list of category keys, and anything missing from it keeps its
 * default place rather than being dumped at one end. That matters because the
 * order is saved per meeting: a category added afterwards, or one that had no
 * items last week, must still turn up somewhere sensible.
 */
export function orderGroups(groups = [], order = []) {
  if (!order || !order.length) return groups;
  const rank = new Map(order.map((k, i) => [k, i]));
  // Sort is stable, so unranked groups hold their default order among
  // themselves rather than reshuffling.
  return [...groups].sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key) : Number.POSITIVE_INFINITY;
    const rb = rank.has(b.key) ? rank.get(b.key) : Number.POSITIVE_INFINITY;
    return ra === rb ? 0 : ra - rb;
  });
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
