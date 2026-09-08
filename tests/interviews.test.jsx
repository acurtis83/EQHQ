import { describe, it, expect } from "vitest";
import {
  quarterMonths, previousQuarter, heldMonth, interviewFor, companionsOf,
  companionshipDone, notReporting, unassignedBrothers, headOfHousehold,
  bandOfHousehold, householdStatus, householdsByBand, brothersByBand,
  coveragePoints, quarterSummary,
} from "../src/lib/domain/interviews";

/**
 * Quarterly ministering interviews.
 *
 * "its a hybrid....of #1 and #3. the quarter is marked as complete with
 *  anyone in the companionship has one of their months marked"
 *
 * So two levels that mustn't be conflated: the record is per brother, the
 * completion is per companionship and needs only one of them.
 */

const Q = "2026-Q3";

const MEMBERS = [
  { id: "ben", name: "Ben Aston", age: 34 },
  { id: "grant", name: "Grant Weekley", age: 52 },
  { id: "seth", name: "Seth Adamson", age: 41 },
  { id: "spencer", name: "Spencer Gifford", age: 68 },
  { id: "spare", name: "Nobody Assigned", age: 30 },
  { id: "michael", name: "Michael Lee", age: 39 },
];
const byId = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));

const COMPS = [
  { id: "c1", district_id: "d1", companion_a_id: "ben", companion_b_id: "grant" },
  { id: "c2", district_id: "d1", companion_a_id: "seth", companion_b_id: "spencer" },
];

describe("the quarter's months", () => {
  it("gives the three months you can hold it in", () => {
    expect(quarterMonths("2026-Q3")).toEqual([
      { key: "2026-07", label: "Jul" },
      { key: "2026-08", label: "Aug" },
      { key: "2026-09", label: "Sep" },
    ]);
  });

  it("and the first quarter starts in January", () => {
    expect(quarterMonths("2026-Q1").map((m) => m.label)).toEqual(["Jan", "Feb", "Mar"]);
  });

  it("steps back a quarter, across the year end", () => {
    expect(previousQuarter("2026-Q3")).toBe("2026-Q2");
    expect(previousQuarter("2026-Q1")).toBe("2025-Q4");
  });

  it("and says nothing about a quarter that isn't one", () => {
    expect(quarterMonths("")).toEqual([]);
    expect(previousQuarter("nonsense")).toBe("");
  });
});

describe("one brother's interview", () => {
  it("is found by the quarter it's filed under", () => {
    const rows = [{ member_id: "ben", quarter: Q, held_on: "2026-07-12" }];
    expect(interviewFor(rows, "ben", Q)).toBeTruthy();
    expect(heldMonth(interviewFor(rows, "ben", Q))).toBe("2026-07");
  });

  it("counts even with no date filled in yet", () => {
    // Somebody was interviewed; the date just hasn't been typed. Requiring
    // held_on would quietly un-complete a quarter that had been done.
    const rows = [{ member_id: "ben", quarter: Q, held_on: null }];
    expect(interviewFor(rows, "ben", Q)).toBeTruthy();
    expect(heldMonth(rows[0])).toBe("");
  });

  it("and is found by its date when the quarter field is missing", () => {
    const rows = [{ member_id: "ben", quarter: null, held_on: "2026-08-03" }];
    expect(interviewFor(rows, "ben", Q)).toBeTruthy();
  });

  it("doesn't match another quarter", () => {
    const rows = [{ member_id: "ben", quarter: "2026-Q2", held_on: "2026-05-01" }];
    expect(interviewFor(rows, "ben", Q)).toBeNull();
  });
});

describe("when a companionship's quarter is complete", () => {
  it("as soon as either brother has reported", () => {
    // The hybrid Drew asked for. One of a pair usually reports for both.
    const rows = [{ member_id: "grant", quarter: Q, held_on: "2026-07-12" }];
    expect(companionshipDone(COMPS[0], rows, Q)).toBe(true);
  });

  it("but not when neither has", () => {
    expect(companionshipDone(COMPS[0], [], Q)).toBe(false);
  });

  it("and never for a companionship with nobody in it", () => {
    // A gap in the assignments, not an interview that's owed. Counting it as
    // complete would hide it; counting it as owed would put it on a list
    // nobody can act on.
    const empty = { id: "c9", companion_a_id: null, companion_b_id: null };
    expect(companionshipDone(empty, [], Q)).toBe(false);
    expect(companionsOf(empty)).toEqual([]);
  });
});

describe("the follow-up list", () => {
  const rows = [{ member_id: "grant", quarter: Q, held_on: "2026-07-12" }];

  it("names the brothers who haven't reported, not the companionships", () => {
    // Grant reported, Ben hasn't. The district leader needs to know which of
    // them he still has to catch — "c1 is done" doesn't tell him.
    const out = notReporting({ comps: COMPS, interviews: rows, quarter: Q, membersById: byId });
    expect(out.map((r) => r.name).sort())
      .toEqual(["Ben Aston", "Seth Adamson", "Spencer Gifford"]);
  });

  it("and marks the ones where nobody in the companionship has reported", () => {
    const out = notReporting({ comps: COMPS, interviews: rows, quarter: Q, membersById: byId });
    expect(out.find((r) => r.name === "Ben Aston").wholeCompanionship,
      "Ben's companionship is done, via Grant").toBe(false);
    expect(out.find((r) => r.name === "Seth Adamson").wholeCompanionship).toBe(true);
  });

  it("is empty once everyone has reported", () => {
    const all = ["ben", "grant", "seth", "spencer"]
      .map((id) => ({ member_id: id, quarter: Q, held_on: "2026-08-01" }));
    expect(notReporting({ comps: COMPS, interviews: all, quarter: Q, membersById: byId }))
      .toEqual([]);
  });
});

describe("brothers with no assignment at all", () => {
  it("are a different list from the ones not reporting", () => {
    const out = unassignedBrothers({ comps: COMPS, members: MEMBERS });
    expect(out.map((m) => m.name)).toContain("Nobody Assigned");
    expect(out.map((m) => m.name)).not.toContain("Ben Aston");
  });

  it("and leave out anybody no longer on the roster", () => {
    const out = unassignedBrothers({
      comps: COMPS,
      members: [...MEMBERS, { id: "gone", name: "Moved Away", active: false }],
    });
    expect(out.map((m) => m.name)).not.toContain("Moved Away");
  });
});

describe("giving a household an age", () => {
  it("reads the head of household off the name LCR wrote", () => {
    expect(headOfHousehold("Lee, Michael & Madeline")).toBe("Michael Lee");
    expect(headOfHousehold("Miller, Patricia")).toBe("Patricia Miller");
  });

  it("and matches him to the roster", () => {
    expect(bandOfHousehold({ name: "Lee, Michael & Madeline" }, MEMBERS)).toBe("36–45");
  });

  it("but counts a household nobody matches as Unknown, not as missing", () => {
    // Most households in a ward are headed by somebody who isn't in the
    // elders quorum. Dropping them would make coverage look better than it is.
    expect(bandOfHousehold({ name: "Nobody, In The Roster" }, MEMBERS)).toBe("Unknown");
  });
});

describe("how a household is doing", () => {
  const rows = [{ member_id: "grant", quarter: Q, held_on: "2026-07-12" }];

  it("covered when its companionship has reported", () => {
    expect(householdStatus({ companionship_id: "c1" }, COMPS, rows, Q)).toBe("covered");
  });

  it("assigned but not reported is its own state", () => {
    // A different problem from nobody being assigned, and a different
    // conversation, so it isn't folded in with either of the others.
    expect(householdStatus({ companionship_id: "c2" }, COMPS, rows, Q)).toBe("no-report");
  });

  it("and unassigned when nobody has it", () => {
    expect(householdStatus({ companionship_id: null }, COMPS, rows, Q)).toBe("unassigned");
    expect(householdStatus({ companionship_id: "gone" }, COMPS, rows, Q)).toBe("unassigned");
  });
});

describe("the metrics", () => {
  const HOUSES = [
    { id: "h1", name: "Lee, Michael & Madeline", companionship_id: "c1", lat: 40.4, lng: -111.8 },
    { id: "h2", name: "Miller, Patricia", companionship_id: "c2", lat: 40.5, lng: -111.9 },
    { id: "h3", name: "Nobody, Home", companionship_id: null },
    { id: "h4", name: "Gone, Away", companionship_id: "c1", active: false },
  ];
  const rows = [{ member_id: "grant", quarter: Q, held_on: "2026-07-12" }];

  it("counts households by band and by how they're doing", () => {
    const out = householdsByBand({
      households: HOUSES, comps: COMPS, interviews: rows, quarter: Q, members: MEMBERS,
    });
    const total = out.reduce((n, r) => n + r.total, 0);
    expect(total, "an inactive household was counted").toBe(3);
    expect(out.find((r) => r.band === "36–45").covered).toBe(1);
    expect(out.reduce((n, r) => n + r.noReport, 0)).toBe(1);
    expect(out.reduce((n, r) => n + r.unassigned, 0)).toBe(1);
  });

  it("keeps every band, so the table doesn't reshuffle as the quarter fills", () => {
    const out = householdsByBand({ households: [], comps: [], interviews: [], quarter: Q });
    expect(out.map((r) => r.band)).toEqual(["18–35", "36–45", "46–55", "56–64", "65+", "Unknown"]);
  });

  it("counts the brothers by band too", () => {
    const out = brothersByBand({ comps: COMPS, interviews: rows, quarter: Q, members: MEMBERS });
    expect(out.reduce((n, r) => n + r.total, 0)).toBe(4);
    expect(out.find((r) => r.band === "46–55").reported, "Grant, 52, reported").toBe(1);
    expect(out.find((r) => r.band === "18–35").missing, "Ben, 34, hasn't").toBe(1);
  });

  it("and maps only the households that have a location", () => {
    const { points, missingLocation } = coveragePoints({
      households: HOUSES, comps: COMPS, interviews: rows, quarter: Q,
    });
    expect(points.map((p) => p.status)).toEqual(["covered", "no-report"]);
    // A household with no coordinates is a gap in the address, not in the
    // ministering — counted, so the map can't look better than the ward is.
    expect(missingLocation).toBe(1);
  });

  it("sums up the quarter in one line", () => {
    expect(quarterSummary({ comps: COMPS, interviews: rows, quarter: Q }))
      .toEqual({ done: 1, total: 2, left: 1 });
  });
});
