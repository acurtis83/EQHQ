import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * What the import couldn't decide on its own.
 *
 * The LCR report only lists households that HAVE a companionship, so a family
 * missing from it might have moved away or might just be waiting to be
 * assigned. Nothing in the file says which. This screen asks instead of
 * guessing, and what has to be true of it is that doing nothing is safe:
 * nothing is deleted, nothing is hidden, until somebody says so.
 */

let WRITES = [];
let TABLES = {};

function query(name) {
  const capture = (op) => (arg) => {
    WRITES.push({ table: name, op, arg });
    return chain([]);
  };
  const chain = (r) => new Proxy(Promise.resolve({ data: r, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "maybeSingle") return () => Promise.resolve({ data: r[0] || null, error: null });
      if (["insert", "update", "delete", "upsert"].includes(k)) return capture(k);
      if (k === "eq") {
        return (col, val) => {
          const last = WRITES[WRITES.length - 1];
          if (last && !last.filter) last.filter = [col, val];
          return chain(r.filter((x) => x[col] === val));
        };
      }
      return () => chain(r);
    },
  });
  return chain(TABLES[name] || []);
}

vi.mock("../src/lib/supabase", () => ({ supabase: { from: (t) => query(t) } }));

const DROPPED = [
  { id: "h-gone", name: "Departed, Family" },
  { id: "h-wait", name: "Waiting, Family" },
];
const RENAMES = [
  { before: { id: "h-old", name: "Brown, Liana" },
    after: { id: "h-new", name: "Brown, Liana & David" } },
];

beforeEach(() => {
  WRITES = [];
  TABLES = { ministering_households: [{ id: "h-new", companionship_id: "c9" }] };
});
afterEach(cleanup);

async function mount(props = {}) {
  const { default: After } = await import("../src/presidency/ImportAftermath");
  let dom;
  await act(async () => {
    dom = render(
      <After dropped={DROPPED} renames={RENAMES}
        onClose={() => {}} onDone={() => {}} {...props} />
    );
    await new Promise((r) => setTimeout(r, 10));
  });
  return dom;
}

describe("families no longer on the report", () => {
  it("are listed by name, with both answers offered", async () => {
    const dom = await mount();
    expect(dom.container.querySelector('[data-dropped="h-gone"]')).toBeTruthy();
    expect(dom.container.textContent).toContain("Departed, Family");
    expect(dom.container.textContent).toContain("Moved out");
    expect(dom.container.textContent).toContain("Needs one");
  });

  it("and says plainly that the report can't tell the difference", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toMatch(/moved out, or just that nobody has been given them/i);
  });

  it("writes nothing until one is chosen", async () => {
    await mount();
    expect(WRITES, "opening the screen changed the data").toHaveLength(0);
  });

  it("marks one moved out without deleting it", async () => {
    // The contact log hangs off this row. A family that moved away is still a
    // family somebody ministered to.
    const dom = await mount();
    await act(async () => {
      fireEvent.click([...dom.container.querySelector('[data-dropped="h-gone"]')
        .querySelectorAll("button")].find((b) => b.textContent.includes("Moved out")));
      await new Promise((r) => setTimeout(r, 20));
    });

    const up = WRITES.filter((w) => w.op === "update");
    expect(up).toHaveLength(1);
    expect(up[0].arg).toEqual({ active: false });
    expect(up[0].filter).toEqual(["id", "h-gone"]);
    expect(WRITES.filter((w) => w.op === "delete")).toHaveLength(0);
  });

  it("and leaves the other one alone", async () => {
    const dom = await mount();
    await act(async () => {
      fireEvent.click([...dom.container.querySelector('[data-dropped="h-wait"]')
        .querySelectorAll("button")].find((b) => b.textContent.includes("Needs one")));
      await new Promise((r) => setTimeout(r, 20));
    });
    // "Needs a companionship" is the state it's already in, so there's
    // nothing to write — it just stops being asked about.
    expect(WRITES).toHaveLength(0);
    expect(dom.container.querySelector('[data-dropped="h-wait"]')).toBeNull();
  });
});

describe("a household that was renamed", () => {
  it("is offered, showing both names", async () => {
    const dom = await mount();
    const row = dom.container.querySelector('[data-rename="h-old"]');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain("Brown, Liana");
    expect(row.textContent).toContain("Brown, Liana & David");
  });

  it("keeps the OLD row when merged, because it holds the history", async () => {
    // The new row is minutes old and holds nothing: no contacts, no map pin.
    // Keeping it and deleting the old one would throw away the very thing
    // the merge exists to save.
    const dom = await mount();
    await act(async () => {
      fireEvent.click([...dom.container.querySelector('[data-rename="h-old"]')
        .querySelectorAll("button")].find((b) => b.textContent.includes("Same family")));
      await new Promise((r) => setTimeout(r, 30));
    });

    const renamed = WRITES.find((w) => w.op === "update" && w.arg?.name);
    expect(renamed.arg.name).toBe("Brown, Liana & David");
    expect(renamed.filter).toEqual(["id", "h-old"]);

    const deleted = WRITES.filter((w) => w.op === "delete");
    expect(deleted, "the duplicate wasn't cleared up").toHaveLength(1);
    expect(deleted[0].filter, "it deleted the row holding the history")
      .toEqual(["id", "h-new"]);
  });

  it("and carries the new row's companionship onto it", async () => {
    // Otherwise the family keeps its history and loses the assignment the
    // import just gave it.
    const dom = await mount();
    await act(async () => {
      fireEvent.click([...dom.container.querySelector('[data-rename="h-old"]')
        .querySelectorAll("button")].find((b) => b.textContent.includes("Same family")));
      await new Promise((r) => setTimeout(r, 30));
    });
    const moved = WRITES.filter(
      (w) => w.op === "update" && w.arg?.companionship_id === "c9"
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it("or can be dismissed, leaving both rows alone", async () => {
    const dom = await mount();
    await act(async () => {
      const btns = [...dom.container.querySelector('[data-rename="h-old"]')
        .querySelectorAll("button")];
      fireEvent.click(btns[btns.length - 1]);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(WRITES).toHaveLength(0);
  });
});

describe("when there's nothing to sort out", () => {
  it("says so rather than showing an empty screen", async () => {
    const dom = await mount({ dropped: [], renames: [] });
    expect(dom.container.textContent).toContain("Nothing left to sort out");
  });
});
