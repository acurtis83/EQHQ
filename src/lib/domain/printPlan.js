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
 * checked without a browser. The estimates are deliberately generous — it is
 * far better to print slightly tighter than needed than to overflow by a line.
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
 * Only spacing and type size change between them; nothing is dropped. What
 * gets dropped, when even the tightest tier won't fit, is decided separately
 * below — losing a note is a content decision, not a typographic one.
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
  // Two more steps below what used to be the floor. They exist so a long
  // agenda can shrink instead of losing its notes — see below.
  { name: "tighter",  body: 9.1,  note: 8.2,  rowGap: 2.5, sectionGap: 8,  headGap: 4 },
  // Spacing only at the floor — the type stays at 8.6pt, which is the
  // smallest worth handing to someone across a table.
  { name: "smallest", body: 8.6,  note: 8,    rowGap: 1.5, sectionGap: 6,  headGap: 3 },
];

// Roughly how many characters fit on a line at a given point size. The width
// depends on whether the item's category, owner and date are stacked under the
// name — in which case the name has the whole page less its accent rule — or
// set beside it in a right-hand column, which takes 120px off.
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
 * @param {boolean}  opts.showNotes
 * @param {boolean}  opts.showLinks
 * @param {object[]} opts.events    upcoming activities, assignments, temple trips
 */
export function estimateHeight(tier, {
  sections = [], events = [], showNotes = true, showLinks = true, stackMeta = true,
}) {
  // Masthead: eyebrow, title, rule.
  let h = 14 + 30 + 14;
  // The details block — date, time, location, prayers — is always there.
  h += 38;

  const textW = PRINTABLE_W - GUTTER - (stackMeta ? 0 : META_COL);

  // The "Agenda Items" band above the whole run of items.
  const items = sections.flatMap((s) => s.items || []);
  if (items.length) h += tier.sectionGap + 20 + tier.headGap;

  for (const it of items) {
    // The name is the heading, so it gets the full body size and can wrap.
    h += linesFor(it.text, tier.body, textW) * tier.body * 1.35;
    // Category, owner and date sit on one line beneath the name — charged only
    // when there's something to put there, so a bare item costs one line, not
    // two. Set beside the name instead, they cost nothing: the column is
    // narrower than the name's line and never taller than the block already is.
    if (stackMeta && (it.category || it.catLabel || it.who || it.due_date)) {
      h += tier.note * 1.35 + 2;
    }
    if (showNotes && it.notes) {
      h += linesFor(it.notes, tier.note, textW) * tier.note * 1.35 + 2;
    }
    if (showLinks && (it.link_url || it.attachment_url)) {
      h += tier.note * 1.35 + 2;
    }
    // A stacked item is its own block and needs air around it or the accent
    // rules run together into one stripe. Set beside, it's a row again.
    h += tier.rowGap + (stackMeta ? 4 : 0);
  }

  // Upcoming activities, assignments and temple trips: a heading and a line
  // each. Grouped by kind, so each kind that has anything costs a sub-heading.
  const withDates = (events || []).filter((e) => e.when || e.event_date);
  if (withDates.length) {
    h += tier.sectionGap + 15 + tier.headGap;
    const kinds = new Set(withDates.map((e) => e.kind || "activity"));
    h += kinds.size * (tier.note * 1.4 + 3);
    h += withDates.length * (tier.body * 1.35 + tier.rowGap * 0.6);
  }

  h += 30;  // footer
  return Math.round(h);
}

/**
 * The loosest arrangement that still fits on one page.
 *
 * Notes are never dropped. An earlier version shed them to save space, which
 * meant a long agenda printed with information silently missing — and nothing
 * on the page said so. Losing what somebody wrote down is worse than a smaller
 * typeface, and worse than a second sheet.
 *
 * So the only concession is the link line, which reads "Link — see the app"
 * and carries no information anyway. Past that, the type tightens through six
 * steps. If none of them fit, it says `fits: false` and the screen warns
 * before printing rather than the page quietly running over.
 */
export function choosePrintPlan({ sections = [], events = [] } = {}) {
  const attempts = [
    { showNotes: true, showLinks: true, stackMeta: true },
    { showNotes: true, showLinks: false, stackMeta: true },
    // Last resort before the warning: the category, owner and date move off
    // their own line and sit beside the name in a column. It's the older, more
    // cramped arrangement and it loses a line per item, which is the only way
    // a twenty-plus-item agenda with notes on every one stays on a single
    // sheet. Normal weeks never reach this.
    { showNotes: true, showLinks: false, stackMeta: false },
  ];

  for (const content of attempts) {
    for (const tier of TIERS) {
      const height = estimateHeight(tier, { sections, events, ...content });
      if (height <= PRINTABLE_H) {
        return { ...tier, ...content, height, fits: true };
      }
    }
  }

  const tier = TIERS[TIERS.length - 1];
  const content = { showNotes: true, showLinks: false, stackMeta: false };
  return {
    ...tier, ...content, fits: false,
    height: estimateHeight(tier, { sections, events, ...content }),
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
  const ordered = [];
  for (const c of categories) {
    if (groups.has(c.label)) { ordered.push({ label: c.label, items: groups.get(c.label) }); groups.delete(c.label); }
  }
  for (const s of sections) {
    if (groups.has(s.label)) { ordered.push({ label: s.label, items: groups.get(s.label) }); groups.delete(s.label); }
  }
  for (const [name, items] of groups) ordered.push({ label: name, items });
  return ordered;
}

/**
 * Category colours for paper.
 *
 * Chosen for print rather than reused from the screen palette: the app's
 * colours are CSS variables that also have to work on a dark background, and
 * several of them turn to mud on white. These are picked to stay distinct when
 * a printer renders them as greys, which is how most of these will come out.
 */
export const PRINT_ACCENTS = {
  sunday: "#1f4e79",
  ministering: "#2e7d4f",
  missionary: "#3b6ea5",
  temple: "#a07c2c",
  callings: "#b03a34",
  service: "#4a7c59",
  moves: "#6b7280",
  need: "#8c2f2a",
};
export const PRINT_ACCENT_DEFAULT = "#4b5563";

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
