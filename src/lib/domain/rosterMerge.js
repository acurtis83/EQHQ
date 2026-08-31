/**
 * Bringing a weekly roster in without making a mess of the one you have.
 *
 * The import used to be a straight insert: paste the ward directory, get every
 * name added again. Do that for a few weeks and the roster is mostly the same
 * people over and over, which is how it ended up needing a cleanup tool as
 * well as a fixed importer.
 *
 * So a paste is now a diff. Everything here is pure — text in, decisions out —
 * because the interesting part is the matching, and matching is much easier to
 * be sure about when you can run it over a hundred awkward cases in a
 * millisecond than when you have to click through a sheet.
 *
 * Nothing in this file writes to the database. It says what *should* happen;
 * Roster.jsx does it, and only after somebody has looked at the summary.
 */

/* ------------------------------ normalising ------------------------------ */

/**
 * Street words that mean the same thing written two ways.
 *
 * This is the whole reason a paste can't be matched on raw text. The same
 * house comes through as "1402 Cedar Hollow Dr" one week and "1402 Cedar
 * Hollow Drive" the next, depending on who typed it into the ward list, and
 * treating those as two addresses is what turns one brother into two rows.
 */
const SUFFIXES = {
  street: "st", st: "st",
  drive: "dr", dr: "dr",
  road: "rd", rd: "rd",
  avenue: "ave", ave: "ave", av: "ave",
  lane: "ln", ln: "ln",
  court: "ct", ct: "ct",
  circle: "cir", cir: "cir",
  boulevard: "blvd", blvd: "blvd",
  place: "pl", pl: "pl",
  parkway: "pkwy", pkwy: "pkwy",
  terrace: "ter", ter: "ter",
  trail: "trl", trl: "trl",
  highway: "hwy", hwy: "hwy",
  square: "sq", sq: "sq",
  loop: "loop",
  way: "way",
  cove: "cv", cv: "cv",
  bay: "bay",
  run: "run",
  hollow: "holw", holw: "holw",
  crossing: "xing", xing: "xing",
  ridge: "rdg", rdg: "rdg",
};

/** North / N, and the rest. */
const DIRECTIONS = {
  north: "n", n: "n",
  south: "s", s: "s",
  east: "e", e: "e",
  west: "w", w: "w",
  northeast: "ne", ne: "ne",
  northwest: "nw", nw: "nw",
  southeast: "se", se: "se",
  southwest: "sw", sw: "sw",
};

/** Apartment 3, Apt 3, Unit 3, #3 — all the same door. */
const UNITS = { apartment: "#", apt: "#", unit: "#", suite: "#", ste: "#", "#": "#" };

/**
 * An address reduced to something two spellings of it can agree on.
 *
 * Case, punctuation, "Drive" against "Dr", "North" against "N", and the
 * various ways of writing a unit number. Returns "" for nothing, which
 * matters: an empty address must never match another empty address, or every
 * record without one collapses into a single person. Callers check for that.
 */
export function normalizeAddress(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s.trim()) return "";
  const tokens = s
    .replace(/[.,]/g, " ")
    .replace(/#\s*/g, " # ")
    .replace(/[^a-z0-9#\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out = [];
  for (const t of tokens) {
    if (UNITS[t]) { out.push("#"); continue; }
    out.push(SUFFIXES[t] || DIRECTIONS[t] || t);
  }
  // "apt 3" and "#3" both became "# 3"; collapse so they read the same.
  return out.join(" ").replace(/#\s+/g, "#").trim();
}

/**
 * A name reduced the same way.
 *
 * Middle initials are dropped rather than normalised. The directory prints
 * "Talbot, Ryan J" some weeks and "Talbot, Ryan" others, and a middle initial
 * is never the thing that distinguishes two brethren in one quorum — where it
 * would, the address does the work instead.
 */
export function normalizeNameKey(raw) {
  const s = String(raw || "").toLowerCase().replace(/[.,]/g, " ");
  const parts = s.replace(/[^a-z\s-]/g, " ").split(/\s+/).filter(Boolean);
  const kept = parts.filter((p, i) => !(p.length === 1 && i > 0 && i < parts.length - 1));
  return kept.join(" ").trim();
}

/** The pair that identifies a person: who, and where they live. */
export function matchKey(rec) {
  return `${normalizeNameKey(rec?.name)}|${normalizeAddress(rec?.address)}`;
}

/* -------------------------------- merging -------------------------------- */

/**
 * Fields a ward roster is authoritative about.
 *
 * Deliberately not `calling`, `notes` or `active`: those are the quorum's own
 * records and the directory export knows nothing about them. An import that
 * blanked a calling because the roster didn't mention it would be losing
 * information rather than refreshing it.
 */
export const ROSTER_FIELDS =
  ["name", "last_name", "age", "band", "birth_date", "address", "phone", "email", "office"];

/**
 * Existing record brought up to date from a pasted one.
 *
 * The roster is treated as the newer truth — that was the choice — but only
 * where it actually says something. A blank column in an export means the
 * field wasn't included, not that the phone number was deleted, so empty
 * values never overwrite. Returns null when nothing would change, which is
 * what lets the summary say "84 already here" instead of claiming 84 updates.
 */
export function mergeRecord(existing, incoming) {
  const patch = {};
  for (const f of ROSTER_FIELDS) {
    const next = incoming?.[f];
    if (next === null || next === undefined || next === "") continue;
    if (sameValue(f, existing?.[f], next)) continue;
    patch[f] = next;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Whether two values of a field say the same thing.
 *
 * Compared the way the field is matched, not as raw text. "1402 Cedar Hollow
 * Dr" and "1402 Cedar Hollow Drive" are the same address, so re-pasting last
 * week's roster with the street spelled out is not an edit — without this
 * every import reported the whole quorum as updated, which buries the handful
 * of rows that genuinely changed and rewrites rows for no reason.
 *
 * The stored spelling wins ties. There's nothing to choose between them, and
 * not writing is cheaper than writing.
 */
function sameValue(field, a, b) {
  if (field === "address") return normalizeAddress(a) === normalizeAddress(b);
  if (field === "name" || field === "last_name") {
    return normalizeNameKey(a) === normalizeNameKey(b);
  }
  return a === b;
}

/** Which of two records to keep when merging duplicates: the fuller one. */
export function richer(a, b) {
  const score = (r) => ROSTER_FIELDS.filter((f) => r?.[f] !== null && r?.[f] !== undefined && r?.[f] !== "").length
    + (r?.calling ? 2 : 0);
  return score(b) > score(a) ? b : a;
}

/* --------------------------------- diffing -------------------------------- */

export const CONFIRM = {
  MOVED: "moved",          // same name, a different address
  HOUSEHOLD: "household",  // same address, a name we don't have
};

/**
 * What a pasted roster would do to the one already stored.
 *
 * Four buckets, and the point of all four is that nothing is written until
 * somebody has seen them:
 *
 *   add      — nobody by that name, nobody at that address. Straight in.
 *   update   — same name at the same address, with something new to say.
 *   skip     — same name at the same address, nothing new. The common case.
 *   confirm  — one of the two matched but not the other, so it's a judgement.
 *   missing  — in the roster, absent from the paste. Probably moved out.
 *
 * A record with no address can only ever match on name. That's deliberate:
 * matching two blank addresses would merge every brother the directory has no
 * address for into one person.
 */
export function diffRoster(incoming = [], existing = []) {
  const byKey = new Map();
  const byName = new Map();
  const byAddr = new Map();

  for (const m of existing) {
    const name = normalizeNameKey(m.name);
    const addr = normalizeAddress(m.address);
    if (!byKey.has(`${name}|${addr}`)) byKey.set(`${name}|${addr}`, m);
    if (name && !byName.has(name)) byName.set(name, m);
    if (addr) {
      if (!byAddr.has(addr)) byAddr.set(addr, []);
      byAddr.get(addr).push(m);
    }
  }

  const add = [];
  const update = [];
  const skip = [];
  const confirm = [];
  const seenIncoming = new Set();
  const matchedExisting = new Set();

  for (const rec of incoming) {
    const name = normalizeNameKey(rec.name);
    const addr = normalizeAddress(rec.address);
    const key = `${name}|${addr}`;

    // A paste can repeat a person too — some exports list a brother once per
    // calling. The second copy is nothing, not a duplicate to create.
    if (seenIncoming.has(key)) continue;
    seenIncoming.add(key);

    const exact = byKey.get(key);
    if (exact) {
      matchedExisting.add(exact.id);
      const patch = mergeRecord(exact, rec);
      if (patch) update.push({ existing: exact, incoming: rec, patch });
      else skip.push({ existing: exact, incoming: rec });
      continue;
    }

    const sameName = name ? byName.get(name) : null;
    if (sameName) {
      matchedExisting.add(sameName.id);
      confirm.push({
        reason: CONFIRM.MOVED, existing: sameName, incoming: rec,
        patch: mergeRecord(sameName, rec) || {},
      });
      continue;
    }

    const housemates = addr ? byAddr.get(addr) : null;
    if (housemates && housemates.length) {
      confirm.push({ reason: CONFIRM.HOUSEHOLD, existing: housemates[0], incoming: rec, patch: null });
      continue;
    }

    add.push(rec);
  }

  // Anyone the paste never mentioned. Matched on name alone, so a brother who
  // simply moved house isn't reported as having left the ward.
  const missing = existing.filter((m) => !matchedExisting.has(m.id));

  return { add, update, skip, confirm, missing };
}

/* ------------------------------- duplicates ------------------------------- */

/**
 * Duplicates already sitting in the roster.
 *
 * `identical` are groups matching on both name and address — there is no
 * judgement to make about those, so they can be merged without asking.
 * `similar` are pairs sharing a name at different addresses, which is either
 * a move that was pasted twice or two brethren who share a name. Only a person
 * knows which, so those are returned to be asked about.
 *
 * Each identical group comes back as { keep, drop, patch }: the fullest record,
 * the ones to delete, and whatever the others knew that it didn't — merging
 * must not lose a phone number just because it was on the row being deleted.
 */
export function findDuplicates(members = []) {
  const groups = new Map();
  for (const m of members) {
    const key = matchKey(m);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const identical = [];
  for (const [, rows] of groups) {
    if (rows.length < 2) continue;
    let keep = rows[0];
    for (const r of rows.slice(1)) keep = richer(keep, r);
    const drop = rows.filter((r) => r !== keep);
    const patch = {};
    for (const r of drop) {
      for (const f of ROSTER_FIELDS) {
        const v = r?.[f];
        const have = keep?.[f];
        if ((have === null || have === undefined || have === "") &&
            v !== null && v !== undefined && v !== "") patch[f] = v;
      }
      if (!keep.calling && r.calling) patch.calling = r.calling;
    }
    identical.push({ keep, drop, patch: Object.keys(patch).length ? patch : null });
  }

  // Same name, different address. Grouped by name so three rows for one
  // brother come back as one decision rather than three pairs.
  const byName = new Map();
  for (const m of members) {
    const n = normalizeNameKey(m.name);
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(m);
  }
  const similar = [];
  for (const [, rows] of byName) {
    const addrs = new Set(rows.map((r) => normalizeAddress(r.address)));
    if (rows.length > 1 && addrs.size > 1) similar.push(rows);
  }

  return { identical, similar };
}

/** How many rows would go away if every identical group were merged. */
export function duplicateCount(dups) {
  return (dups?.identical || []).reduce((n, g) => n + g.drop.length, 0);
}
