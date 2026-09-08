import { describe, it, expect } from "vitest";
import {
  parseAssignments, matchCompanions, householdKey,
} from "../src/lib/domain/ministeringImport";

/**
 * Reading ministering assignments pasted out of LCR.
 *
 * The fixture below is Drew's real paste, tabs and all, kept byte for byte.
 * That matters more than usual here: the format is a flattened two-column
 * table, and the thing that makes it readable — a lone tab on its own line at
 * the end of the first companionship — is invisible in a diff and would be
 * "tidied" away by anybody retyping the fixture from the rendered page.
 */
const LCR = [
  "Adamson, Seth",
  "Gifford, Spencer",
  "Hiland, Donovan Joseph",
  "\t",
  "Hegerman, Mark Patrick",
  "",
  "Aston, Ben",
  "Weekley, Grant\t",
  "",
  "Lee, Michael & Madeline",
  "Mall, Prem & Nicole Michelle",
  "Woffinden, Shane & Torey Jo",
  "",
  "Benson, Jacob",
  "Moulton, Dallin",
  "Rawle, Bentley\t",
  "",
  "Adamson, Seth & Kara",
  "",
  "Brinley, Logan",
  "Snell, Casey Chalmer\t",
  "",
  "Brown, Liana",
  "Hill, Matt & Carolyn",
  "Potter, Noah & McKenna",
  "",
  "Brown, Todd",
  "Ivers, Adam\t",
  "",
  "Farnsworth, Brian Kenneth & Daniele",
  "Hendrycks, Rusty & Kylee",
  "Miller, Patricia",
  "Snell, Casey Chalmer & Melissa Jean",
  "",
  "Cherala, Karunakar",
  "Savio, Ben\t",
  "",
  "Curtis, Andrew & Camarie",
  "Jensen, Brandon & Jessica Mae",
].join("\n");

describe("reading the paste", () => {
  it("finds every companionship", () => {
    expect(parseAssignments(LCR).groups).toHaveLength(6);
  });

  it("pairs each companionship with its own families", () => {
    const { groups } = parseAssignments(LCR);
    expect(groups.map((g) => ({ c: g.companions, h: g.households }))).toEqual([
      { c: ["Seth Adamson", "Spencer Gifford", "Donovan Hiland"],
        h: ["Hegerman, Mark Patrick"] },
      { c: ["Ben Aston", "Grant Weekley"],
        h: ["Lee, Michael & Madeline", "Mall, Prem & Nicole Michelle",
            "Woffinden, Shane & Torey Jo"] },
      { c: ["Jacob Benson", "Dallin Moulton", "Bentley Rawle"],
        h: ["Adamson, Seth & Kara"] },
      { c: ["Logan Brinley", "Casey Snell"],
        h: ["Brown, Liana", "Hill, Matt & Carolyn", "Potter, Noah & McKenna"] },
      { c: ["Todd Brown", "Adam Ivers"],
        h: ["Farnsworth, Brian Kenneth & Daniele", "Hendrycks, Rusty & Kylee",
            "Miller, Patricia", "Snell, Casey Chalmer & Melissa Jean"] },
      { c: ["Karunakar Cherala", "Ben Savio"],
        h: ["Curtis, Andrew & Camarie", "Jensen, Brandon & Jessica Mae"] },
    ]);
  });

  it("and reports nothing wrong with a clean paste", () => {
    expect(parseAssignments(LCR).problems).toEqual([]);
  });

  it("splits on the lone tab that ends the first companionship", () => {
    // The tab-only line is the whole reason this parses. Treated as content,
    // it glues Seth Adamson's companionship to the family it ministers to and
    // shifts every record after it by one — six wrong answers, no error.
    const { groups } = parseAssignments(LCR);
    expect(groups[0].companions).not.toContain("Mark Hegerman");
    expect(groups[0].households).toEqual(["Hegerman, Mark Patrick"]);
  });

  it("turns Last, First into a name the roster would recognise", () => {
    expect(parseAssignments(LCR).groups[0].companions[0]).toBe("Seth Adamson");
  });

  it("keeps family names exactly as LCR writes them", () => {
    // "Lee, Michael & Madeline" is how the household is known; rewriting it to
    // "Michael Lee" would lose the wife and stop matching next time.
    expect(parseAssignments(LCR).groups[1].households[0])
      .toBe("Lee, Michael & Madeline");
  });
});

describe("when the paste isn't clean", () => {
  it("says so when one companionship has nobody assigned", () => {
    // Two companionships, one of them empty. A single empty one on its own is
    // indistinguishable from somebody pasting the wrong thing, which is what
    // the "unreadable" case below covers.
    const one = [
      "Aston, Ben", "Weekley, Grant\t", "",
      "Lee, Michael & Madeline", "",
      "Brown, Todd", "Ivers, Adam\t",
    ].join("\n");
    const { problems } = parseAssignments(one);
    expect(problems.map((p) => p.kind)).toContain("no-households");
  });

  it("warns when the columns look like they've slipped", () => {
    // A families block carrying a column break means the alternation is out
    // of step — the case where one companionship has no families and every
    // record below it silently pairs with the wrong one.
    const slipped = [
      "Aston, Ben", "Weekley, Grant\t", "",
      "Brown, Todd", "Ivers, Adam\t", "",
      "Miller, Patricia",
    ].join("\n");
    expect(parseAssignments(slipped).problems.map((p) => p.kind))
      .toContain("shifted");
  });

  it("and admits when it can't read it at all", () => {
    expect(parseAssignments("some notes I typed").problems.map((p) => p.kind))
      .toContain("unreadable");
  });

  it("but says nothing about an empty box", () => {
    expect(parseAssignments("").problems).toEqual([]);
    expect(parseAssignments("   \n\n ").problems).toEqual([]);
  });

  it("copes with Windows line endings", () => {
    const { groups } = parseAssignments(LCR.replace(/\n/g, "\r\n"));
    expect(groups).toHaveLength(6);
  });
});

describe("matching companions to the roster", () => {
  const MEMBERS = [
    { id: "m1", name: "Seth Adamson" },
    { id: "m2", name: "Spencer Gifford" },
  ];

  it("finds the ones on the roster", () => {
    const got = matchCompanions(["Seth Adamson", "Spencer Gifford"], MEMBERS);
    expect(got.map((g) => g.member?.id)).toEqual(["m1", "m2"]);
  });

  it("and leaves the rest unmatched rather than guessing", () => {
    // A companionship pointing at the wrong brother is worse than one
    // pointing at nobody, and it's the kind of mistake nobody goes back to
    // check.
    const got = matchCompanions(["Donovan Hiland"], MEMBERS);
    expect(got[0].member).toBeNull();
    expect(got[0].name).toBe("Donovan Hiland");
  });
});

describe("recognising the same household twice", () => {
  it("ignores spacing and case", () => {
    expect(householdKey("Lee,  Michael & Madeline"))
      .toBe(householdKey("lee, Michael & Madeline"));
  });

  it("but two different families stay different", () => {
    expect(householdKey("Brown, Liana")).not.toBe(householdKey("Brown, Todd"));
  });
});
