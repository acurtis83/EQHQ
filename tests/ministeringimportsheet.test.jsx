import { readFileSync } from "node:fs";
import { render, act, cleanup, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The import sheet, mounted.
 *
 * The parser and the naming rules are checked directly elsewhere. What has to
 * be true here is the wiring: that the screen actually runs them, shows every
 * pairing, and writes nothing at all until Apply is pressed. Proving a rule
 * works has repeatedly not proved anything calls it.
 *
 * pdf.js is mocked away — it needs a worker and a real file, neither of which
 * exists under jsdom — and replaced with the same fixture the parser tests
 * use, converted to positioned lines.
 */

const LINES = readFileSync(
  `${process.cwd()}/tests/fixtures/lcr-ministering.txt`, "utf8"
).split("\n").map((line) => {
  const segs = [];
  const re = /\S(?:.*?\S)?(?=\s{2,}|$)/g;
  let m;
  while ((m = re.exec(line))) segs.push({ x: m.index, s: m[0] });
  return segs;
});

vi.mock("../src/lib/pdfLines", () => ({ pdfToLines: async () => LINES }));

let WRITES = [];
let TABLES = {};

/**
 * A stub that actually applies ilike / not / in.
 *
 * Filters matter here. The unassign step looks for households that ARE
 * assigned and whose name the import didn't mention, so a stub that hands
 * back every row for every query makes that branch untestable — it silently
 * finds nothing to orphan and the test passes whatever the code does.
 */
function query(name) {
  const capture = (op) => (arg) => {
    WRITES.push({ table: name, op, arg });
    return chain([]);
  };
  const chain = (r) => new Proxy(Promise.resolve({ data: r, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "maybeSingle") return () => Promise.resolve({ data: r[0] || null, error: null });
      if (k === "single") return () => Promise.resolve({ data: r[0] || { id: "new-row" }, error: null });
      if (["insert", "update", "delete", "upsert"].includes(k)) return capture(k);
      if (k === "ilike") {
        return (col, val) => chain(r.filter(
          (x) => String(x[col] || "").toLowerCase() === String(val).toLowerCase()));
      }
      if (k === "not") {
        return (col) => chain(r.filter((x) => x[col] != null));
      }
      if (k === "in") {
        return (col, vals) => chain(r.filter((x) => (vals || []).includes(x[col])));
      }
      if (k === "eq") return (col, val) => chain(r.filter((x) => x[col] === val));
      return () => chain(r);
    },
  });
  return chain(TABLES[name] || []);
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (t) => query(t),
    channel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe() {} }; return c; },
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const MEMBERS = [
  { id: "seth", name: "Seth Adamson" },
  { id: "spencer", name: "Spencer Gifford" },
];

beforeEach(() => {
  WRITES = [];
  TABLES = {
    // A family this ward ministers to today that the import doesn't mention.
    // Without one the unassign step has nothing to find and can't be tested.
    ministering_households: [
      { id: "old-h", name: "Departed, Family", companionship_id: "old-c" },
    ],
  };
});
afterEach(cleanup);

async function open() {
  const { default: Sheet } = await import("../src/presidency/MinisteringImport");
  let dom;
  await act(async () => {
    dom = render(<Sheet members={MEMBERS} onClose={() => {}} onDone={() => {}} />);
    await new Promise((r) => setTimeout(r, 10));
  });
  const input = dom.container.querySelector('input[type="file"]');
  await act(async () => {
    // pdfToLines is mocked, so the file only has to exist.
    fireEvent.change(input, { target: { files: [new File(["x"], "m.pdf")] } });
    await new Promise((r) => setTimeout(r, 30));
  });
  return dom;
}

describe("choosing the PDF", () => {
  it("shows the districts it found", async () => {
    const dom = await open();
    expect(dom.container.textContent).toContain("Bishopric/EQ Presidency");
    expect(dom.container.textContent).toContain("District 1");
  });

  it("and every pairing, before anything is written", async () => {
    // A wrong pairing is invisible once it's in the database — it just looks
    // like an assignment — so it has to be readable beforehand.
    const dom = await open();
    const groups = dom.container.querySelectorAll("[data-import-group]");
    expect(groups.length).toBe(3);
    expect(dom.container.textContent).toContain("Arnold, Alexander Curtis & Kaitlyn Caresse");
    expect(dom.container.textContent).toContain("Brown, Liana");
  });

  it("writes nothing until Apply is pressed", async () => {
    await open();
    expect(WRITES, "the import wrote to the database just from reading the file")
      .toHaveLength(0);
  });

  it("says which companions aren't on the roster", async () => {
    const dom = await open();
    // Only Seth and Spencer are in MEMBERS; the rest can't be linked.
    expect(dom.container.textContent).toMatch(/aren't on the roster/);
    expect(dom.container.textContent).toContain("Ballif, David");
  });
});

describe("applying it", () => {
  it("creates the districts, companionships and households", async () => {
    const dom = await open();
    await act(async () => {
      fireEvent.click([...dom.container.querySelectorAll("button")]
        .find((b) => /^Import \d+ companionships$/.test(b.textContent.trim())));
      await new Promise((r) => setTimeout(r, 60));
    });

    const inserts = (t) => WRITES.filter((w) => w.table === t && w.op === "insert");
    expect(inserts("ministering_districts").length).toBe(2);
    expect(inserts("ministering_companionships").length).toBe(3);
    expect(inserts("ministering_households").length).toBe(5);
  });

  it("and never sets a district leader", async () => {
    // "i know they are not assigned to a presidency member yet...i can assign
    //  the district to a presidency member later" — LCR has every district as
    //  Unassigned, so writing that over a leader set in the app would undo it
    //  on every import.
    const dom = await open();
    await act(async () => {
      fireEvent.click([...dom.container.querySelectorAll("button")]
        .find((b) => /^Import \d+ companionships$/.test(b.textContent.trim())));
      await new Promise((r) => setTimeout(r, 60));
    });

    for (const w of WRITES.filter((w) => w.table === "ministering_districts")) {
      expect(w.arg, "the import touched the district leader")
        .not.toHaveProperty("leader_id");
    }
  });

  it("never deletes a household", async () => {
    // Reorganisations happen every year or two; the record of who visited
    // whom shouldn't be thrown away with them.
    const dom = await open();
    await act(async () => {
      fireEvent.click([...dom.container.querySelectorAll("button")]
        .find((b) => /^Import \d+ companionships$/.test(b.textContent.trim())));
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(WRITES.filter((w) => w.table === "ministering_households" && w.op === "delete"))
      .toHaveLength(0);
    expect(WRITES.filter((w) => w.table === "ministering_contacts" && w.op === "delete"))
      .toHaveLength(0);

    // The family the import didn't mention is let go of, not removed: its
    // companionship is cleared and the row — with its address and every
    // contact logged against it — stays.
    const off = WRITES.filter(
      (w) => w.table === "ministering_households" && w.op === "update"
        && w.arg?.companionship_id === null
    );
    expect(off, "nothing was unassigned, so this proves nothing").toHaveLength(1);
  });
});
