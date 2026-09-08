import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The interview tracker, mounted.
 *
 * The rules are checked directly in interviews.test.jsx. What has to be true
 * here is the wiring: the grid renders a month per brother, a tick writes the
 * right row, and the hybrid completion rule is what the screen actually shows
 * — proving a rule works has repeatedly not proved anything calls it.
 */

let WRITES = [];

function query(name) {
  const capture = (op) => (arg) => {
    WRITES.push({ table: name, op, arg });
    return chain([]);
  };
  const chain = (r) => new Proxy(Promise.resolve({ data: r, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (["insert", "update", "delete", "upsert"].includes(k)) return capture(k);
      if (k === "eq") {
        return (col, val) => {
          const last = WRITES[WRITES.length - 1];
          if (last) last.filter = [col, val];
          return chain(r);
        };
      }
      return () => chain(r);
    },
  });
  return chain([]);
}

vi.mock("../src/lib/supabase", () => ({ supabase: { from: (t) => query(t) } }));

// Tuesday 8 September 2026 — the third quarter, so Jul/Aug/Sep.
const NOW = new Date(2026, 8, 8, 9, 0, 0);

const MEMBERS = [
  { id: "ben", name: "Ben Aston", age: 34 },
  { id: "grant", name: "Grant Weekley", age: 52 },
  { id: "spare", name: "Nobody Assigned", age: 30 },
];
const membersById = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));
const COMPS = [
  { id: "c1", district_id: "d1", companion_a_id: "ben", companion_b_id: "grant" },
];
const DISTRICTS = [{ id: "d1", name: "District 1" }];
const HOUSES = [
  { id: "h1", name: "Lee, Michael & Madeline", companionship_id: "c1" },
];

beforeEach(() => {
  WRITES = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

async function mount(interviews = []) {
  const { default: Interviews } = await import("../src/presidency/Interviews");
  let dom;
  await act(async () => {
    dom = render(
      <Interviews
        comps={COMPS} households={HOUSES} interviews={interviews}
        members={MEMBERS} membersById={membersById} districts={DISTRICTS}
        me="Drew Curtis" onChanged={() => {}} setErr={() => {}}
      />
    );
    await new Promise((r) => setTimeout(r, 10));
  });
  return dom;
}

describe("the grid", () => {
  it("shows the quarter's three months against each brother", async () => {
    const dom = await mount();
    for (const who of ["Ben Aston", "Grant Weekley"]) {
      for (const mo of ["Jul", "Aug", "Sep"]) {
        expect(dom.container.querySelector(`[aria-label="${who} ${mo}"]`),
          `${who} has no ${mo}`).toBeTruthy();
      }
    }
  });

  it("and the households the companionship has", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toContain("1 household");
  });

  it("opens on the current quarter", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toContain("2026 · Quarter 3");
  });
});

describe("ticking a month", () => {
  it("records the interview against that brother and month", async () => {
    const dom = await mount();
    await act(async () => {
      fireEvent.click(dom.container.querySelector('[aria-label="Ben Aston Aug"]'));
      await new Promise((r) => setTimeout(r, 20));
    });

    const ins = WRITES.filter((w) => w.table === "ministering_interviews" && w.op === "insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].arg).toMatchObject({
      member_id: "ben", quarter: "2026-Q3", held_on: "2026-08-01",
    });
  });

  it("dates it to the month, not to today", async () => {
    // LCR records interviews to the month and so does this. Stamping today's
    // date would file a July interview under September the moment somebody
    // caught up on their records.
    const dom = await mount();
    await act(async () => {
      fireEvent.click(dom.container.querySelector('[aria-label="Ben Aston Jul"]'));
      await new Promise((r) => setTimeout(r, 20));
    });
    const ins = WRITES.find((w) => w.op === "insert");
    expect(ins.arg.held_on).toBe("2026-07-01");
  });

  it("clears it when the same month is tapped again", async () => {
    const rows = [{ id: "i1", member_id: "ben", quarter: "2026-Q3", held_on: "2026-08-01" }];
    const dom = await mount(rows);
    await act(async () => {
      fireEvent.click(dom.container.querySelector('[aria-label="Ben Aston Aug"]'));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(WRITES.filter((w) => w.op === "delete")).toHaveLength(1);
  });

  it("and moves it when a different month is tapped", async () => {
    const rows = [{ id: "i1", member_id: "ben", quarter: "2026-Q3", held_on: "2026-08-01" }];
    const dom = await mount(rows);
    await act(async () => {
      fireEvent.click(dom.container.querySelector('[aria-label="Ben Aston Sep"]'));
      await new Promise((r) => setTimeout(r, 20));
    });
    const up = WRITES.filter((w) => w.op === "update");
    expect(up).toHaveLength(1);
    expect(up[0].arg.held_on).toBe("2026-09-01");
    expect(WRITES.filter((w) => w.op === "insert")).toHaveLength(0);
  });
});

describe("the hybrid completion rule, on screen", () => {
  it("marks the companionship done when just one brother has reported", async () => {
    // "the quarter is marked as complete with anyone in the companionship has
    //  one of their months marked"
    const rows = [{ id: "i1", member_id: "grant", quarter: "2026-Q3", held_on: "2026-07-01" }];
    const dom = await mount(rows);
    const row = dom.container.querySelector('[data-companionship="c1"]');
    expect(row.textContent).toContain("Done");
    expect(row.textContent).not.toContain("Owed");
  });

  it("but still names the brother who hasn't", async () => {
    // The companionship being done doesn't tell the district leader whether
    // he's spoken to Ben or to Grant.
    const rows = [{ id: "i1", member_id: "grant", quarter: "2026-Q3", held_on: "2026-07-01" }];
    const dom = await mount(rows);
    expect(dom.container.querySelector('[data-behind="ben"]'),
      "Ben isn't on the follow-up list").toBeTruthy();
    expect(dom.container.querySelector('[data-behind="grant"]')).toBeNull();
  });

  it("and shows Owed when nobody has reported", async () => {
    const dom = await mount();
    expect(dom.container.querySelector('[data-companionship="c1"]').textContent)
      .toContain("Owed");
  });
});

describe("who isn't ministering", () => {
  it("lists brothers with no companionship at all, separately", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toContain("Not ministering to anyone");
    expect(dom.container.textContent).toContain("Nobody Assigned");
  });
});

describe("the metrics", () => {
  it("counts households by the age of whoever heads them", async () => {
    // The Lee household is headed by Michael Lee, who isn't on this roster,
    // so it lands in Unknown rather than being dropped.
    const dom = await mount();
    const unknown = dom.container.querySelector('[data-band="Unknown"]');
    expect(unknown).toBeTruthy();
    expect(unknown.textContent).toContain("Unknown");
  });

  it("and the brothers by their own age", async () => {
    const rows = [{ id: "i1", member_id: "grant", quarter: "2026-Q3", held_on: "2026-07-01" }];
    const dom = await mount(rows);
    // Grant is 52 and reported; Ben is 34 and hasn't. Two different bands.
    expect(dom.container.textContent).toContain("46–55");
    expect(dom.container.textContent).toContain("18–35");
  });

  it("keeps every band so the table doesn't reshuffle", async () => {
    const dom = await mount();
    for (const band of ["18–35", "36–45", "46–55", "56–64", "65+", "Unknown"]) {
      expect(dom.container.querySelector(`[data-band="${band}"]`), band).toBeTruthy();
    }
  });
});
