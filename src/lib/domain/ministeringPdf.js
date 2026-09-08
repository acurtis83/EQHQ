/**
 * The LCR "Ministering Assignments" PDF, read into districts and assignments.
 *
 * The page is a four-column table, and the columns are the whole problem:
 *
 *   companions        household      the people in it        sex     birthday
 *   Ballif, David     Arnold         Arnold, Alexander       Male    7 Jan
 *   801-369-8118      2066653259
 *   4177 W Penstemon  2456 N Sunmore Arnold, Kaitlyn         Female  17 Sep
 *
 * Every cell is several lines tall and they interleave, so reading the page
 * line by line pairs a companion with whichever family happens to sit beside
 * him. The columns have to be recovered from position.
 *
 * ---------------------------------------------------------------------------
 * Input is deliberately unit-agnostic: an array of lines, each an array of
 * `{ x, s }` segments. `x` can be a character column (from a fixed-width text
 * dump) or a PDF point (from pdf.js) — the column boundaries are derived by
 * clustering, so nothing here depends on which. That's what lets the test
 * fixture come from one extractor and the browser use another, with the same
 * code deciding what belongs to what.
 * ---------------------------------------------------------------------------
 *
 * Pure.
 */

/* ------------------------------ finding columns --------------------------- */

/**
 * Where the columns start, by clustering the left edge of every segment.
 *
 * Text in a column all begins at the same x, give or take the indent LCR uses
 * for a child's name, so the starts pile up in four or five tight groups with
 * wide gaps between. Anything seen fewer than a handful of times is ignored —
 * that's a stray indent, not a column.
 */
export function columnStarts(lines, { tolerance = 0.06, share = 0.08 } = {}) {
  const xs = [];
  for (const line of lines || []) for (const seg of line || []) {
    if (String(seg?.s || "").trim()) xs.push(Number(seg.x) || 0);
  }
  if (!xs.length) return [];
  xs.sort((a, b) => a - b);

  const span = (xs[xs.length - 1] - xs[0]) || 1;
  const gap = span * tolerance;

  const groups = [];
  let cur = [xs[0]];
  for (const x of xs.slice(1)) {
    if (x - cur[cur.length - 1] <= gap) cur.push(x);
    else { groups.push(cur); cur = [x]; }
  }
  groups.push(cur);

  // Only the columns the table actually uses. A wrapped address and an
  // indented child's name both start at their own x and repeat often enough
  // to look like columns on a count alone — measured against the busiest
  // column instead, they're the rounding error they are. Reading them as
  // columns splits the table and shifts every cell one place right, which
  // silently empties the household column on every page after the first.
  const biggest = Math.max(...groups.map((g) => g.length));
  return groups
    .filter((g) => g.length >= biggest * share)
    .map((g) => g[0]);
}

/** Which column a segment sits in, by the last start at or before it. */
function columnOf(x, starts) {
  let i = 0;
  for (let n = 0; n < starts.length; n += 1) if (x >= starts[n] - 0.001) i = n;
  return i;
}

/**
 * Regroup each line's segments into columns.
 *
 * Returns one array per line, indexed by column, so `row[0]` is the companion
 * cell and `row[2]` the person cell whatever the underlying units were.
 */
export function toColumns(lines, starts) {
  return (lines || []).map((line) => {
    const row = starts.map(() => "");
    for (const seg of line || []) {
      const s = String(seg?.s || "").trim();
      if (!s) continue;
      const i = columnOf(Number(seg.x) || 0, starts);
      row[i] = row[i] ? `${row[i]} ${s}` : s;
    }
    return row;
  });
}

/* ------------------------------ reading it -------------------------------- */

const DOTTED = /^[.\s]{20,}$/;
const PRESIDENCY = /^Presidency Member:/i;
const SEX = /^(Male|Female|M|F)$/i;
// The report's own title, printed at the top of all 29 pages. It sits
// alone in the first column exactly like a district heading does.
const REPORT_TITLE = /^Ministering Assignments$/i;
const PERSON = /^[^,]+,\s*\S/;

/** A name, rather than a phone number, an address or an email. */
function isName(s) {
  const t = String(s || "").trim();
  if (!t || t.includes("@")) return false;
  if (/\d/.test(t)) return false;
  return PERSON.test(t);
}

/**
 * The column holding Male/Female.
 *
 * The only column in the report with a closed set of values, which makes it
 * the one thing that can be identified without counting. Chosen by whichever
 * column has the most of them, so a stray "Male" in someone's notes can't win.
 */
export function findSexColumn(rows) {
  const hits = [];
  for (const row of rows || []) {
    row.forEach((cell, i) => {
      if (SEX.test(String(cell || "").trim())) hits[i] = (hits[i] || 0) + 1;
    });
  }
  let best = -1;
  hits.forEach((n, i) => { if (n > (hits[best] || 0)) best = i; });
  return best;
}

/**
 * Districts, companionships, households.
 *
 * The page's own furniture does the structuring: a "Presidency Member:" line
 * starts a companionship, a dotted rule ends one, and a district is announced
 * by the only other kind of line that sits alone in the first column.
 */
export function readMinisteringPdf(lines) {
  const starts = columnStarts(lines);
  if (starts.length < 3) {
    return {
      districts: [],
      problems: [{
        kind: "unreadable",
        text: "Couldn't find the columns in that PDF. It should be the "
          + "Ministering Assignments report from LCR.",
      }],
    };
  }

  const rows = toColumns(lines, starts);

  // Which column is which, found by CONTENT rather than by counting from the
  // left. Two extractors of the same page don't agree on how many columns
  // there are — pdf.js reports six (it splits "Presidency Member:" from
  // "Unassigned"), a fixed-width text dump reports five — and hardcoded
  // indices shift by one between them, which empties the household column
  // completely while districts and companionships still look right.
  //
  // The sex column is the anchor because it's the only one with a closed set
  // of values. Everything else is positioned relative to it: the people are
  // immediately to its left, the household surname to their left again.
  const sexCol = findSexColumn(rows);
  if (sexCol < 2) {
    return {
      districts: [],
      problems: [{
        kind: "unreadable",
        text: "Couldn't find the Male/Female column in that PDF. It should be "
          + "the Ministering Assignments report from LCR.",
      }],
    };
  }
  const personCol = sexCol - 1;
  const houseCol = sexCol - 2;

  const districts = [];
  const problems = [];
  let district = null;
  let comp = null;

  const closeCompanionship = () => {
    if (comp && (comp.companions.length || comp.households.length)) {
      district.companionships.push(comp);
    }
    comp = null;
  };
  const openDistrict = (name) => {
    closeCompanionship();
    district = { name, companionships: [] };
    districts.push(district);
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const first = row[0] || "";
    const joined = row.join(" ").trim();

    if (!joined) continue;
    if (DOTTED.test(joined)) { closeCompanionship(); continue; }

    if (PRESIDENCY.test(first)) {
      // A district heading is the line just above the first "Presidency
      // Member:" under it — the only other thing that sits alone in the left
      // column with nothing beside it.
      // A heading sits alone in the first column. Judging it on the joined
      // text instead let a person's row through — "Woffinden, Kinxton Kourt
      // Male 25 Sep" isn't a name by the strict test and has no long number
      // in it, so it read as a district. That's how one report produced
      // twenty-five of them.
      const alone = (r) => !!r && !!String(r[0] || "").trim()
        && r.slice(1).every((c) => !String(c || "").trim());
      const text = (r) => String((r || [])[0] || "").trim();
      const heading = [rows[i - 1], rows[i - 2]]
        .filter(alone)
        .map(text)
        .find((t) => t && !DOTTED.test(t) && !PRESIDENCY.test(t)
          && !REPORT_TITLE.test(t) && t.length < 40
          // Not an email, not an address, not a person. A companion's email
          // or the last line of his address ends up alone in the first column
          // at a page break, directly above the next "Presidency Member:" —
          // which is how "lizeshlo@gmail.com" and "Lehi UT 84043" became
          // districts. Three digits rather than any digit, because
          // "District 1" is a perfectly good name.
          && !t.includes("@") && !t.includes(",") && !/\d{3}/.test(t));
      if (heading && (!district || district.name !== heading)) openDistrict(heading);
      if (!district) openDistrict("Ministering");
      closeCompanionship();
      comp = { companions: [], households: [] };
      continue;
    }

    if (!comp) continue;

    // Left column: the brothers assigned.
    if (isName(first)) comp.companions.push(first);

    // A bare surname in the household column opens a household.
    const surname = row[houseCol] || "";
    if (surname && !/\d/.test(surname) && !surname.includes("@") && !surname.includes(",")) {
      comp.households.push({ name: surname, people: [], address: "", phone: "", email: "" });
    }
    const house = comp.households[comp.households.length - 1];
    if (house) {
      if (surname.includes("@")) house.email = surname;
      else if (/^[+(\d][\d\s()+-]{6,}$/.test(surname)) house.phone = surname;
      else if (/\d/.test(surname)) {
        house.address = house.address ? `${house.address}, ${surname}` : surname;
      }

      // Right columns: one person, and whether they're a man or a woman.
      const person = row[personCol] || "";
      const sex = (row[sexCol] || "").trim();
      if (isName(person) && SEX.test(sex)) {
        house.people.push({ name: person, male: /^m/i.test(sex) });
      }
    }
  }
  closeCompanionship();

  if (!districts.length) {
    problems.push({
      kind: "unreadable",
      text: "No ministering districts found in that PDF.",
    });
  }
  return { districts, problems };
}

/* ----------------------------- naming a household ------------------------- */

/**
 * The household's name, the way LCR itself writes it.
 *
 * The middle column is only a surname, and a surname is not a household:
 * Brown appears five times in this ward, Miller and Jensen four each. The
 * people column is what makes them distinguishable, and it's also how the
 * copy-and-paste view of the same data labels them — checked against a real
 * paste, this reproduces all fourteen of its labels exactly.
 *
 * LCR lists a household as husband, then wife, then children by age. So a
 * couple is specifically a man listed FIRST with a woman immediately after
 * him — not "the first man and the first woman", which labels a widow's
 * household after her son. Liana Brown is listed above her son Carson, and
 * the paste calls that household "Brown, Liana".
 */
export function householdName(house) {
  const people = house?.people || [];
  if (!people.length) return String(house?.name || "").trim();

  const surname = people[0].name.split(",")[0].trim();
  const given = (n) => n.split(",").slice(1).join(",").trim();

  if (people.length > 1 && people[0].male && !people[1].male) {
    return `${surname}, ${given(people[0].name)} & ${given(people[1].name)}`;
  }
  return `${surname}, ${given(people[0].name)}`;
}

/**
 * Flatten to the shape the importer already understands, per district.
 *
 * Households listed twice are reported rather than merged. Both cases in
 * Drew's export are real duplicates in LCR — one family entered twice under
 * the same companionship with two different phone numbers, and another
 * assigned to two companionships at once — and quietly collapsing them would
 * hide a thing worth fixing at the source.
 */
export function districtGroups(district) {
  const seen = new Map();
  const duplicates = [];

  const groups = (district?.companionships || []).map((c) => {
    const households = (c.households || []).map((h) => {
      const name = householdName(h);
      if (seen.has(name)) duplicates.push(name);
      else seen.set(name, true);
      return { name, address: h.address, phone: h.phone, email: h.email };
    });
    return { companions: c.companions, households };
  });

  return { groups, duplicates: [...new Set(duplicates)] };
}
