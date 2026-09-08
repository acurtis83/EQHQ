import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  columnStarts, readMinisteringPdf, householdName, districtGroups,
} from "../src/lib/domain/ministeringPdf";

/**
 * Reading the LCR Ministering Assignments PDF.
 *
 * The fixture is a slice of Drew's real export, kept as the fixed-width dump a
 * text extractor produces. Column positions are the entire difficulty here, so
 * a hand-written fixture with tidy columns would test nothing — this one keeps
 * the wrapped addresses and the indented children's names that made the first
 * attempt split the table.
 *
 * The parser takes lines of `{ x, s }` and doesn't care what x measures, so
 * the same code reads a character-column dump here and pdf.js's points in the
 * browser. This adapter is the character-column half.
 */
// A plain path, not import.meta.url: under jsdom that isn't a file URL and
// readFileSync throws at import time, which vitest reports as "no tests" —
// a suite that looks like it ran and found nothing to say.
const lines = readFileSync(
  `${process.cwd()}/tests/fixtures/lcr-ministering.txt`, "utf8"
).split("\n").map((line) => {
  const segs = [];
  const re = /\S(?:.*?\S)?(?=\s{2,}|$)/g;
  let m;
  while ((m = re.exec(line))) segs.push({ x: m.index, s: m[0] });
  return segs;
});

const read = () => readMinisteringPdf(lines);

describe("finding the columns", () => {
  it("ignores an indent that repeats, however often", () => {
    // Built rather than sliced from the fixture, because this only goes wrong
    // at full-report scale: across 2,600 lines the indented children's names
    // repeat dozens of times, which is plenty to look like a column on a
    // count alone. A short excerpt can't reproduce it, so the rule is checked
    // on its own — four real columns used constantly, and one indent used
    // often enough to fool a fixed threshold.
    const real = [0, 60, 112, 180];
    const lines = [];
    for (let i = 0; i < 200; i += 1) lines.push(real.map((x) => ({ x, s: "text" })));
    // Far enough from a real column not to merge into it, and used ten times
    // — comfortably past any fixed "seen at least N times" threshold, but
    // nothing next to a column used two hundred times. Judging it against the
    // busiest column is what tells those two apart.
    for (let i = 0; i < 10; i += 1) lines.push([{ x: 140, s: "indented child" }]);

    expect(columnStarts(lines)).toEqual(real);
  });

  it("finds the table's columns and not its indents", () => {
    // A wrapped address and an indented child's name each start at their own
    // x and repeat often enough to look like a column on a count alone.
    // Reading them as columns shifts every cell one place right, which empties
    // the household column on every page after the first — silently, with the
    // districts and companionships still looking perfectly correct.
    const starts = columnStarts(lines);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts.length).toBeLessThanOrEqual(6);
  });
});

describe("reading the report", () => {
  it("finds the districts by name", () => {
    expect(read().districts.map((d) => d.name))
      .toEqual(["Bishopric/EQ Presidency", "District 1"]);
  });

  it("keeps each companionship with its own families", () => {
    const seen = read().districts.flatMap((d) =>
      districtGroups(d).groups.map((g) => ({
        who: g.companions.join(" + "),
        homes: g.households.map((h) => h.name),
      })));

    expect(seen).toEqual([
      { who: "Ballif, David + Weekley, Grayson Michael",
        homes: ["Arnold, Alexander Curtis & Kaitlyn Caresse", "Coulter, Brett"] },
      { who: "Adamson, Seth + Gifford, Spencer",
        homes: ["Hegerman, Mark Patrick"] },
      { who: "Brinley, Logan + Snell, Casey Chalmer",
        homes: ["Brown, Liana", "Hill, Matt & Carolyn"] },
    ]);
  });

  it("brings the addresses across for the map", () => {
    const homes = read().districts.flatMap((d) =>
      districtGroups(d).groups.flatMap((g) => g.households));
    expect(homes.find((h) => h.name.startsWith("Hill")).address)
      .toContain("2667 N Drexler Dr");
  });

  it("and says so when it isn't the right PDF", () => {
    const junk = [[{ x: 0, s: "just some words" }]];
    expect(readMinisteringPdf(junk).problems.map((p) => p.kind))
      .toContain("unreadable");
  });
});

/**
 * The household's name.
 *
 * The middle column is only a surname, and a surname is not a household —
 * Brown appears five times in this ward, Miller and Jensen four each. These
 * labels were checked against a real copy-and-paste of the same data and
 * reproduce all fourteen of its household names exactly.
 */
describe("naming a household", () => {
  const person = (name, male) => ({ name, male });

  it("husband and wife, when the man is listed first", () => {
    expect(householdName({ people: [
      person("Hill, Matt", true), person("Hill, Carolyn", false),
    ] })).toBe("Hill, Matt & Carolyn");
  });

  it("keeps middle names, because LCR does", () => {
    expect(householdName({ people: [
      person("Snell, Casey Chalmer", true), person("Snell, Melissa Jean", false),
    ] })).toBe("Snell, Casey Chalmer & Melissa Jean");
  });

  it("names a household after the woman who heads it, not her son", () => {
    // Liana Brown is listed above Carson, who is her child. "First man and
    // first woman" would call this household "Brown, Carson & Liana"; the
    // real paste calls it "Brown, Liana". LCR lists husband, then wife, then
    // children — so a couple is a man listed FIRST with a woman right after.
    expect(householdName({ people: [
      person("Brown, Liana", false), person("Brown, Carson", true),
    ] })).toBe("Brown, Liana");
  });

  it("one person on their own", () => {
    expect(householdName({ people: [person("Miller, Patricia", false)] }))
      .toBe("Miller, Patricia");
    expect(householdName({ people: [person("Hegerman, Mark Patrick", true)] }))
      .toBe("Hegerman, Mark Patrick");
  });

  it("leaves the children out", () => {
    expect(householdName({ people: [
      person("Arnold, Alexander Curtis", true),
      person("Arnold, Kaitlyn Caresse", false),
      person("Arnold, Rafferty Curtis", true),
    ] })).toBe("Arnold, Alexander Curtis & Kaitlyn Caresse");
  });

  it("and falls back to the surname when nobody is listed", () => {
    expect(householdName({ name: "Smith", people: [] })).toBe("Smith");
  });
});

describe("families listed twice", () => {
  it("are reported, not merged", () => {
    // Both cases in Drew's export are real duplicates in LCR — one family
    // entered twice under the same companionship with two different phone
    // numbers, another assigned to two companionships at once. Collapsing
    // them quietly would hide something worth fixing at the source.
    const district = {
      companionships: [
        { companions: ["A, One"], households: [
          { name: "Hill", people: [
            { name: "Hill, Andrew", male: true },
            { name: "Hill, Emilee", male: false }] },
        ] },
        { companions: ["B, Two"], households: [
          { name: "Hill", people: [
            { name: "Hill, Andrew", male: true },
            { name: "Hill, Emilee", male: false }] },
        ] },
      ],
    };
    expect(districtGroups(district).duplicates).toEqual(["Hill, Andrew & Emilee"]);
  });
});
