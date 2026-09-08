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

/* --------------------------- what an import changes ----------------------- */

import { planImport, companionshipKey } from "../src/lib/domain/ministeringImport";

const MEMBERS = [
  { id: "seth", name: "Seth Adamson" },
  { id: "spencer", name: "Spencer Gifford" },
  { id: "ben", name: "Ben Aston" },
  { id: "grant", name: "Grant Weekley" },
];

// Ben and Grant, exactly as they'd come back from the database.
const PAIR = {
  id: "c1",
  matchKey: companionshipKey(["ben", "grant"], MEMBERS),
};

describe("planning the import", () => {
  const { groups } = parseAssignments(
    ["Aston, Ben", "Weekley, Grant\t", "",
     "Lee, Michael & Madeline", "Mall, Prem & Nicole Michelle"].join("\n")
  );

  it("recognises a companionship that hasn't changed", () => {
    const plan = planImport(groups, {
      companionships: [PAIR],
      households: [
        { id: "h1", name: "Lee, Michael & Madeline", companionship_id: "c1" },
        { id: "h2", name: "Mall, Prem & Nicole Michelle", companionship_id: "c1" },
      ],
    }, MEMBERS);

    expect(plan.counts.newCompanionships).toBe(0);
    expect(plan.counts.newHouseholds).toBe(0);
    expect(plan.counts.moved).toBe(0);
    expect(plan.companionships[0].households.every((h) => h.status === "same")).toBe(true);
  });

  it("spots a family that has moved to a different companionship", () => {
    const plan = planImport(groups, {
      companionships: [PAIR],
      households: [
        { id: "h1", name: "Lee, Michael & Madeline", companionship_id: "somebody-else" },
        { id: "h2", name: "Mall, Prem & Nicole Michelle", companionship_id: "c1" },
      ],
    }, MEMBERS);

    expect(plan.counts.moved).toBe(1);
    expect(plan.companionships[0].households.find((h) => h.name.startsWith("Lee")).status)
      .toBe("moved");
  });

  it("and one that's new to the ward", () => {
    const plan = planImport(groups, {
      companionships: [PAIR],
      households: [{ id: "h2", name: "Mall, Prem & Nicole Michelle", companionship_id: "c1" }],
    }, MEMBERS);
    expect(plan.counts.newHouseholds).toBe(1);
  });

  it("reports a family the district no longer ministers to, without deleting it", () => {
    const plan = planImport(groups, {
      companionships: [PAIR],
      households: [
        { id: "h1", name: "Lee, Michael & Madeline", companionship_id: "c1" },
        { id: "h2", name: "Mall, Prem & Nicole Michelle", companionship_id: "c1" },
        { id: "h9", name: "Gone, Family", companionship_id: "c1" },
      ],
    }, MEMBERS);

    // Unassigned, not removed: a family that stops being ministered to is
    // still a family, and the contact log against them is worth keeping.
    expect(plan.dropped.map((h) => h.id)).toEqual(["h9"]);
    expect(plan.counts.dropped).toBe(1);
  });

  it("treats a pair with one brother swapped as a new companionship", () => {
    // Not the same partnership, and saying it is would carry one man's
    // history onto another's.
    const swapped = parseAssignments(
      ["Aston, Ben", "Adamson, Seth\t", "", "Lee, Michael & Madeline"].join("\n")
    ).groups;
    const plan = planImport(swapped, { companionships: [PAIR], households: [] }, MEMBERS);
    expect(plan.companionships[0].status).toBe("new");
    expect(plan.counts.retired).toBe(1);
  });

  it("doesn't care what order the two names were pasted in", () => {
    const flipped = parseAssignments(
      ["Weekley, Grant", "Aston, Ben\t", "", "Lee, Michael & Madeline"].join("\n")
    ).groups;
    const plan = planImport(flipped, { companionships: [PAIR], households: [] }, MEMBERS);
    expect(plan.companionships[0].status, "the same pair read as a new one").toBe("same");
  });

  it("lists companions it couldn't find on the roster", () => {
    const plan = planImport(groups, { companionships: [], households: [] },
      [{ id: "ben", name: "Ben Aston" }]);
    expect(plan.unmatched).toEqual(["Grant Weekley"]);
  });

  it("and says nothing at all about an empty paste", () => {
    const plan = planImport([], { companionships: [], households: [] }, MEMBERS);
    expect(plan.counts).toMatchObject({ companionships: 0, dropped: 0, retired: 0 });
  });
});

describe("matching companions however the name arrived", () => {
  const ROSTER = [{ id: "m1", name: "David Ballif" }];

  it("matches a name written the PDF's way round", () => {
    // The PDF hands over "Ballif, David"; the paste hands over "David
    // Ballif". The lookup key is order-sensitive, so without normalising
    // first every companion read from the PDF came back unmatched — 189 of
    // them, reported on screen as "aren't on the roster".
    expect(matchCompanions(["Ballif, David"], ROSTER)[0].member?.id).toBe("m1");
  });

  it("and the paste's way round", () => {
    expect(matchCompanions(["David Ballif"], ROSTER)[0].member?.id).toBe("m1");
  });

  it("but still doesn't invent a match for somebody absent", () => {
    expect(matchCompanions(["Weekley, Grant"], ROSTER)[0].member).toBeNull();
  });
});
