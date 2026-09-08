import { normalizeName } from "./roster.js";
import { normalizeNameKey } from "./rosterMerge.js";

/**
 * Ministering assignments, pasted out of LCR.
 *
 * "for ministering can we paste assignments from LCR? it would be uploaded as
 *  a PDF file that shows the companionship and who they minister to....or i
 *  could copy and paste"
 *
 * The shape, from a real paste:
 *
 *     Adamson, Seth
 *     Gifford, Spencer
 *     Hiland, Donovan Joseph
 *     <tab>
 *     Hegerman, Mark Patrick
 *
 *     Aston, Ben
 *     Weekley, Grant<tab>
 *
 *     Lee, Michael & Madeline
 *     Mall, Prem & Nicole Michelle
 *     Woffinden, Shane & Torey Jo
 *
 * It's a two-column table — companions on the left, the families they minister
 * to on the right — and copying it flattens each cell into its own run of
 * lines with a tab where the column changed. So the file reads as alternating
 * blocks: companions, families, companions, families.
 *
 * Pure. Text in, records out, nothing touched.
 */

/* ------------------------------- reading it ------------------------------- */

/**
 * Split into blocks on any line that's only whitespace.
 *
 * Whitespace-only rather than empty, and that matters: the first record ends
 * its companions with a line containing nothing but a tab. Treating that as
 * content would glue the first companionship to the family it ministers to and
 * shift every record after it by one.
 */
function blocksOf(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let cur = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (cur.length) out.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** One name per line, tabs and stray spacing gone. */
function namesIn(block) {
  return block
    .map((l) => l.replace(/\t/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Did this block carry the column break? Only companion blocks do. */
const hasTab = (block) => block.some((l) => l.includes("\t"));

/**
 * The companionships, in the order they appear.
 *
 * Blocks alternate, so the reading is positional: even-numbered blocks are
 * companions, odd-numbered are the families. The tab is used as a CHECK rather
 * than as the rule, because it isn't reliably present — the first record's tab
 * sits on its own line and disappears with the split, and a PDF won't have
 * tabs at all.
 *
 * When the two disagree, the pairing is still returned and a problem is
 * recorded. Alternation breaks if a companionship has no families listed at
 * all: everything after it shifts by one, so the check is what turns a silent
 * mis-pairing of every remaining record into something the review screen can
 * say out loud.
 */
export function parseAssignments(text) {
  const blocks = blocksOf(text);
  const groups = [];
  const problems = [];

  for (let i = 0; i < blocks.length; i += 2) {
    const companionBlock = blocks[i];
    const householdBlock = blocks[i + 1] || [];

    const companions = namesIn(companionBlock).map(normalizeName);
    const households = namesIn(householdBlock);

    if (!companions.length) continue;

    // A families block carrying a column break means the alternation has
    // slipped — most likely a companionship above it with nobody assigned.
    if (householdBlock.length && hasTab(householdBlock)) {
      problems.push({
        kind: "shifted",
        at: groups.length + 1,
        text: `Around "${companions[0]}" the companions and families may be paired wrongly — check this one by eye.`,
      });
    }

    if (!households.length) {
      problems.push({
        kind: "no-households",
        at: groups.length + 1,
        text: `${companions.join(" & ")} have no families listed.`,
      });
    }

    groups.push({ companions, households });
  }

  // Nothing anywhere has a family against it, which is not a ward with no
  // ministering assignments — it's text that isn't the two-column table. Said
  // as one clear sentence rather than as a per-companionship complaint about
  // every line of whatever was pasted.
  if (groups.length && !groups.some((g) => g.households.length)) {
    return {
      groups: [],
      problems: [{
        kind: "unreadable",
        at: 0,
        text: "That doesn't look like the ministering list. Copy both columns "
          + "from LCR — companions on the left, families on the right.",
      }],
    };
  }

  return { groups, problems };
}

/* ------------------------------ matching it ------------------------------- */

/** A household is the same household if it's spelled the same way. */
export function householdKey(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Companions matched to the roster by name.
 *
 * Unmatched names are reported rather than guessed at. A companionship
 * pointing at the wrong brother is worse than one pointing at nobody, and
 * "Hiland, Donovan Joseph" against a roster holding "Donovan Hiland" is
 * exactly the sort of near-miss a fuzzy match gets wrong confidently.
 */
export function matchCompanions(names = [], members = []) {
  const byKey = new Map();
  for (const m of members || []) {
    const k = normalizeNameKey(m?.name);
    if (k && !byKey.has(k)) byKey.set(k, m);
  }
  // normalizeName first, because the two ways in disagree about order: the
  // paste hands over "Seth Adamson", the PDF hands over "Adamson, Seth". The
  // key is order-sensitive, so without this every companion read from the PDF
  // came back unmatched — 189 of them, which is what "aren't on the roster"
  // was really reporting.
  return (names || []).map((name) => ({
    name,
    member: byKey.get(normalizeNameKey(normalizeName(name))) || null,
  }));
}

/* -------------------------------- the diff -------------------------------- */

/**
 * What a pasted district would change.
 *
 * Scoped to ONE district, because that's how the paste arrives: LCR shows a
 * district at a time and Drew pastes one at a time. That scoping is what makes
 * "no longer assigned" safe to report — across the whole ward it would be a
 * guess, but within a district it's simply the households that district had
 * and this paste doesn't.
 *
 * Nothing is written from here. It returns a description that the review
 * screen renders and the apply step walks, so the presidency sees every
 * pairing before it lands.
 *
 * @param groups        from parseAssignments()
 * @param existing      { companionships, households } already in this district
 * @param members       the roster, for matching companions to people
 */
export function planImport(groups = [], existing = {}, members = []) {
  const oldComps = existing.companionships || [];
  const oldHouses = existing.households || [];

  // Where each household sits today, by name.
  const homeOf = new Map();
  for (const h of oldHouses) homeOf.set(householdKey(h.name), h);

  const seen = new Set();
  const companionships = [];
  let newHouseholds = 0;
  let moved = 0;

  for (const g of groups) {
    const matched = matchCompanions(g.companions, members);
    // A companionship is the same companionship if it's the same people. Two
    // brothers reassigned as a pair keep their history; a pair with one
    // brother swapped is a new companionship, which is the truthful reading —
    // it isn't the same partnership any more.
    const key = matched
      .map((c) => normalizeNameKey(c.name)).filter(Boolean).sort().join(" + ");
    const before = oldComps.find((c) => c.matchKey === key) || null;

    const households = g.households.map((name) => {
      const k = householdKey(name);
      seen.add(k);
      const current = homeOf.get(k) || null;
      if (!current) { newHouseholds += 1; return { name, existing: null, status: "new" }; }
      const stays = before && current.companionship_id === before.id;
      if (!stays) moved += 1;
      return { name, existing: current, status: stays ? "same" : "moved" };
    });

    companionships.push({
      key,
      companions: matched,
      households,
      existing: before,
      status: before ? "same" : "new",
    });
  }

  // Households this district had that the paste doesn't mention. Unassigned
  // rather than deleted: a family that stops being ministered to is still a
  // family, and the contact history against them is worth keeping.
  const dropped = oldHouses.filter((h) => !seen.has(householdKey(h.name)));

  // Companionships with nobody left to visit, for the same reason.
  const retired = oldComps.filter(
    (c) => !companionships.some((n) => n.existing && n.existing.id === c.id)
  );

  const unmatched = companionships
    .flatMap((c) => c.companions.filter((p) => !p.member).map((p) => p.name));

  return {
    companionships,
    dropped,
    retired,
    unmatched: [...new Set(unmatched)],
    counts: {
      companionships: companionships.length,
      newCompanionships: companionships.filter((c) => c.status === "new").length,
      households: companionships.reduce((n, c) => n + c.households.length, 0),
      newHouseholds,
      moved,
      dropped: dropped.length,
      retired: retired.length,
      unmatched: new Set(unmatched).size,
    },
  };
}

/**
 * The key that identifies a stored companionship by its people.
 *
 * Exported because the caller has to stamp it onto the rows it loads before
 * handing them to planImport — the database stores two member ids, not a key.
 */
export function companionshipKey(memberIds = [], members = []) {
  const byId = new Map((members || []).map((m) => [m.id, m]));
  return (memberIds || [])
    .map((id) => normalizeNameKey(byId.get(id)?.name))
    .filter(Boolean)
    .sort()
    .join(" + ");
}
