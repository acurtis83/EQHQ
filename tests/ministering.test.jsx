import { render, act, cleanup, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The Ministering screen, mounted.
 *
 * The arithmetic is checked in tests/ministering.mjs; this is about whether
 * what's on screen matches it. The specific worry is a screen that renders a
 * household as fine while the rules say otherwise — two sources of truth is
 * the failure this feature is most exposed to, because the map and the list
 * each compute a colour.
 */

let TABLES = {};
let WRITES = [];

function query(table) {
  const rows = TABLES[table] || [];
  const chain = (r) => new Proxy(Promise.resolve({ data: r, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "single" || k === "maybeSingle") {
        return () => Promise.resolve({ data: r[0] || { id: "new" }, error: null });
      }
      if (k === "insert") return (v) => { WRITES.push({ table, op: "insert", v }); return chain(Array.isArray(v) ? v : [v]); };
      if (k === "update") return (v) => { WRITES.push({ table, op: "update", v }); return chain(r); };
      if (k === "delete") return () => { WRITES.push({ table, op: "delete" }); return chain(r); };
      return () => chain(r);
    },
  });
  return chain(rows);
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (t) => query(t),
    channel: () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe() {} }; return ch; },
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const NOW = new Date(2026, 8, 4, 12, 0, 0);            // 2026-09-04, in Q3
const isoAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  WRITES = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  TABLES = {
    presidency_members: [
      { name: "Drew Curtis", role: "President" },
      { name: "Karl Moore", role: "First Counselor" },
      { name: "Ben Reid", role: "Second Counselor" },
      { name: "Sam Nye", role: "Secretary" },
    ],
    members: [
      { id: "m1", name: "Cameron Butler", active: true },
      { id: "m2", name: "Nick Crump", active: true },
      { id: "m3", name: "Gone Away", active: false },
    ],
    ministering_districts: [{ id: "d1", name: "District 1", sort_order: 0, leader_name: "Drew Curtis" }],
    ministering_companionships: [
      { id: "c1", district_id: "d1", companion_a_id: "m1", companion_b_id: "m2" },
      { id: "c2", district_id: "d1", companion_a_id: "m1", companion_b_id: "m3" },
    ],
    ministering_households: [
      { id: "h1", companionship_id: "c1", name: "Hansen", address: "1 A St",
        lat: 40.3916, lng: -111.8508, active: true, created_at: "2025-01-01" },
      { id: "h2", companionship_id: "c1", name: "Webb", active: true, created_at: "2025-01-01" },
      { id: "orph", companionship_id: null, name: "Nobody's", active: true, created_at: "2025-01-01" },
      { id: "gone", companionship_id: "c1", name: "Moved Out", active: false, created_at: "2025-01-01" },
    ],
    ministering_contacts: [{ id: "k1", household_id: "h1", contacted_on: isoAgo(5) }],
    ministering_interviews: [
      { id: "i1", companionship_id: "c1", quarter: "2026-Q3", held_on: "2026-07-10" },
    ],
    form_questions: [],
    form_answers: [],
    form_responses: [],
  };
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

async function mount() {
  const { default: Ministering } = await import("../src/presidency/Ministering");
  let dom;
  await act(async () => {
    dom = render(<Ministering />);
    await new Promise((r) => setTimeout(r, 60));
  });
  return dom;
}

describe("the ministering screen", () => {
  it("shows the districts and who leads them", async () => {
    await mount();
    expect(screen.getByText("District 1")).toBeTruthy();
    const leader = screen.getByLabelText("Who leads District 1");
    expect(leader.value).toBe("Drew Curtis");
  });

  it("offers only the presidency as district leaders, not the secretary", async () => {
    await mount();
    const opts = [...screen.getByLabelText("Who leads District 1").options].map((o) => o.value);
    expect(opts).toContain("Drew Curtis");
    expect(opts).toContain("Karl Moore");
    expect(opts).toContain("Ben Reid");
    // The same rule that keeps him off the conducting list.
    expect(opts).not.toContain("Sam Nye");
  });

  it("names the companionship by its two companions", async () => {
    await mount();
    expect(screen.getByText("Cameron Butler & Nick Crump")).toBeTruthy();
  });

  it("says when a companionship is short a companion", async () => {
    await mount();
    // c2's second companion has left the ward, so it reads as needing one
    // even though the row has two ids in it.
    expect(screen.getByText(/needs a companion/)).toBeTruthy();
  });

  it("puts households nobody is assigned to at the top level", async () => {
    await mount();
    expect(screen.getByText(/Nobody assigned \(1\)/)).toBeTruthy();
    expect(screen.getByText("Nobody's")).toBeTruthy();
  });

  it("leaves moved-out households out entirely", async () => {
    await mount();
    // Opened first. Collapsed, this passed against a component that listed
    // moved-away families the moment you expanded it — the card just hadn't
    // rendered them yet.
    fireEvent.click(screen.getByText("Cameron Butler & Nick Crump"));
    expect(screen.queryByText("Moved Out")).toBeNull();
    expect(screen.getByText("Hansen")).toBeTruthy();
  });

  it("shows each companionship only its own households", async () => {
    await mount();
    // c1 has two active households; c2 has none. A component that filtered
    // badly would give them both the same list, and the counts are where
    // that shows up without depending on which card is open.
    expect(screen.getByText(/^2 households$/)).toBeTruthy();
    expect(screen.getByText(/^0 households/)).toBeTruthy();
  });

  it("counts households by level in the summary", async () => {
    await mount();
    // h1: contacted 5 days ago, interview held, full companionship -> ok
    // h2: no contact ever + nothing else wrong -> watch
    // orph: no contact + no companionship -> concern
    const summary = screen.getByText("On track").parentElement;
    expect(summary.textContent).toMatch(/^1/);
  });

  it("shows the reason a household is flagged, in the words of what was measured", async () => {
    await mount();
    fireEvent.click(screen.getByText("Cameron Butler & Nick Crump"));
    // "No contact logged" — a fact. Not "neglected", which is a conclusion.
    expect(screen.getAllByText("No contact logged").length).toBeGreaterThan(0);
  });

  it("logs a contact against the household rather than editing it", async () => {
    await mount();
    fireEvent.click(screen.getByText("Cameron Butler & Nick Crump"));
    const rows = document.querySelectorAll("[data-household]");
    expect(rows.length).toBeGreaterThan(0);
    // The tick button next to the first household.
    const tick = rows[0].parentElement.querySelector("button:last-of-type");
    await act(async () => { fireEvent.click(tick); await new Promise((r) => setTimeout(r, 10)); });
    expect(screen.getByLabelText("Kind of contact")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Log it"));
      await new Promise((r) => setTimeout(r, 20));
    });
    const w = WRITES.find((x) => x.table === "ministering_contacts");
    expect(w?.op).toBe("insert");
    expect(w.v.contacted_on).toBe("2026-09-04");
  });

  it("marks a household as moved away instead of deleting it", async () => {
    await mount();
    fireEvent.click(screen.getByText("Cameron Butler & Nick Crump"));
    fireEvent.click(document.querySelector("[data-household]"));
    await act(async () => {
      fireEvent.click(screen.getByText("Moved away"));
      await new Promise((r) => setTimeout(r, 20));
    });
    const w = WRITES.find((x) => x.table === "ministering_households" && x.op === "update");
    expect(w.v.active).toBe(false);
    expect(WRITES.some((x) => x.table === "ministering_households" && x.op === "delete")).toBe(false);
  });

  it("keeps the households when a companionship is removed", async () => {
    await mount();
    fireEvent.click(screen.getByText("Cameron Butler & Nick Crump"));
    await act(async () => {
      fireEvent.click(screen.getAllByText("Remove")[0]);
      await new Promise((r) => setTimeout(r, 20));
    });
    // The households are unhooked, not deleted with the companionship.
    const unhook = WRITES.find(
      (x) => x.table === "ministering_households" && x.op === "update" && "companionship_id" in x.v
    );
    expect(unhook.v.companionship_id).toBe(null);
    expect(WRITES.some((x) => x.table === "ministering_companionships" && x.op === "delete")).toBe(true);
  });

  it("says how many households have no address rather than quietly dropping them", async () => {
    await mount();
    // Three active households, one has an address.
    expect(screen.getByText(/2 of 3 households have no address/)).toBeTruthy();
  });
});

describe("the map", () => {
  it("says there's nothing to show when no household has been placed", async () => {
    TABLES.ministering_households = TABLES.ministering_households.map((h) => ({
      ...h, lat: null, lng: null,
    }));
    await mount();
    fireEvent.click(screen.getByText("Map"));
    expect(screen.getByText("Nothing on the map yet")).toBeTruthy();
  });

  it("offers both a health view and a district view", async () => {
    await mount();
    fireEvent.click(screen.getByText("Map"));
    expect(screen.getByText("How they're doing")).toBeTruthy();
    expect(screen.getByText("By district")).toBeTruthy();
  });

  it("says plainly when no pocket stands out", async () => {
    await mount();
    fireEvent.click(screen.getByText("Map"));
    expect(screen.getByText(/No pocket stands out/)).toBeTruthy();
    expect(document.querySelectorAll("[data-hotspot]").length).toBe(0);
  });

  it("shows a pocket with the numbers behind it", async () => {
    // A ward the pocket can stand out from. The first fixture here was eight
    // households of which six were in trouble, and it found nothing — rightly,
    // because in a ward that is 75% struggling there is nowhere half again
    // worse than average. A pocket is a comparison, so the fixture needs the
    // rest of the ward in it.
    //
    // Sage Vista: 6 struggling (no contact ever, nobody assigned = two flags)
    //             + 2 fine, all within a few hundred metres
    // Elsewhere:  30 fine households half a mile away
    // Ward rate 6/38 ≈ 16%, Sage Vista ≈ 100%.
    // The two healthy ones sit AMONG the struggling six rather than at the
    // end of the street. A pocket with nobody healthy inside it reports "6 of
    // the 6", which is the one shape that can't tell a correct implementation
    // from one printing the same number twice.
    const bad = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`, name: `House ${i}`, active: true, created_at: "2024-01-01",
      companionship_id: i % 4 === 3 ? "c1" : null,
      address: `${i} Sage Vista`, lat: 40.3916, lng: -111.8508 + i * 0.0007,
    }));
    const fine = Array.from({ length: 30 }, (_, i) => ({
      id: `q${i}`, name: `Elsewhere ${i}`, active: true, created_at: "2024-01-01",
      companionship_id: "c1",
      address: `${i} Far Away`, lat: 40.3800, lng: -111.8508 + i * 0.0002,
    }));
    TABLES.ministering_households = [...bad, ...fine];
    TABLES.ministering_contacts = TABLES.ministering_households
      .filter((h) => h.companionship_id)
      .map((h, i) => ({ id: `k${i}`, household_id: h.id, contacted_on: isoAgo(3) }));
    await mount();
    fireEvent.click(screen.getByText("Map"));

    const spots = document.querySelectorAll("[data-hotspot]");
    expect(spots.length).toBe(1);
    const text = spots[0].textContent;
    expect(text).toMatch(/6 households needing attention/);
    // The working: count, circle size, rate, ward rate and the multiple.
    expect(text).toMatch(/against \d+% across the ward/);
    expect(text).toMatch(/× the ward rate/);

    // The two counts have to be the struggling ones and the total in the
    // circle, and they have to differ — "6 of the 6 households" is what a
    // component prints when it reports the same number twice, and a regex
    // that only checked the shape accepted it.
    const [, flagged, inCircle] = /(\d+) of the (\d+) households within about (\d+)m/.exec(text);
    expect(Number(flagged)).toBe(6);
    expect(Number(inCircle)).toBeGreaterThan(Number(flagged));
    // ...and the percentage is derived from those two, not from thin air.
    const pct = Number(/\((\d+)%\)/.exec(text)[1]);
    expect(pct).toBe(Math.round((Number(flagged) / Number(inCircle)) * 100));
  });
});

describe("the migration prompt", () => {
  it("says which file to run when the tables aren't there", async () => {
    const realFrom = query;
    vi.resetModules();
    vi.doMock("../src/lib/supabase", () => ({
      supabase: {
        from: () => ({
          select: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'relation "ministering_households" does not exist' } }),
            eq: () => Promise.resolve({ data: null, error: { message: "does not exist" } }),
            in: () => Promise.resolve({ data: null, error: { message: "does not exist" } }),
            then: (f) => Promise.resolve({ data: null, error: { message: "does not exist" } }).then(f),
          }),
        }),
      },
    }));
    const { default: M } = await import("../src/presidency/Ministering");
    await act(async () => { render(<M />); await new Promise((r) => setTimeout(r, 40)); });
    expect(screen.getByText(/ministering\.sql/)).toBeTruthy();
    expect(realFrom).toBeTruthy();
  });
});
