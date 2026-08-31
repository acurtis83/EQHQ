import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * Importing a weekly roster, and cleaning up after the one that wasn't.
 *
 * The matching itself is checked by arithmetic — see tests/rostermerge.mjs,
 * which runs it over a hundred awkward addresses. What has to be mounted is
 * the promise the screen makes: that nothing is written until somebody has
 * looked at the summary, and that the buttons do what their labels say.
 *
 * Every write goes through this mock, so the assertions are about what the
 * screen *tried* to do, which is the thing that matters when the operation is
 * "delete these fourteen people".
 */

let MEMBERS = [];
let WRITES = [];

function table(name) {
  const capture = (op) => (arg) => {
    WRITES.push({ table: name, op, arg });
    return chain({ data: [], error: null });
  };
  const chain = (result) => {
    const p = Promise.resolve(result);
    return new Proxy(p, {
      get(t, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
        if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
        if (prop === "single") return () => Promise.resolve({ data: null, error: null });
        if (prop === "insert" || prop === "update" || prop === "delete") return capture(prop);
        if (prop === "in" || prop === "eq" || prop === "not") {
          return (...args) => {
            const last = WRITES[WRITES.length - 1];
            if (last) last.filter = args;
            return chain(result);
          };
        }
        return () => chain(result);
      },
    });
  };
  return chain({ data: name === "members" ? MEMBERS : [], error: null });
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (t) => table(t),
    channel: () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} }; return ch; },
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

vi.mock("../src/components/AssigneePicker", () => ({ refreshMemberNames: () => {} }));

const HAVE = [
  { id: "a", name: "Ryan Talbot", last_name: "Talbot", address: "1402 Cedar Hollow Dr",
    phone: "801-555-0134", age: 34, band: "18–35", active: true },
  { id: "b", name: "Cameron Pearson", last_name: "Pearson", address: "88 N Main St",
    phone: "", age: 41, band: "36–45", active: true },
  { id: "c", name: "Marcus Webb", last_name: "Webb", address: "12 Ridgeline Dr",
    phone: "", age: 29, band: "18–35", active: true },
];

async function mount() {
  const { default: Roster } = await import("../src/presidency/Roster");
  let dom;
  await act(async () => {
    dom = render(<Roster />);
    await new Promise((r) => setTimeout(r, 0));
  });
  return dom;
}

async function paste(text) {
  fireEvent.click(screen.getByText("Paste Directory"));
  const box = document.querySelector("textarea");
  await act(async () => {
    fireEvent.change(box, { target: { value: text } });
    await new Promise((r) => setTimeout(r, 0));
  });
}

const writesOf = (op) => WRITES.filter((w) => w.op === op);

beforeEach(() => { MEMBERS = HAVE.map((m) => ({ ...m })); WRITES = []; });
afterEach(cleanup);

describe("pasting the same roster twice", () => {
  it("adds nobody the second time", async () => {
    await mount();
    await paste(
      "Talbot, Ryan\t34\t1402 Cedar Hollow Drive\t801-555-0134\n" +
      "Pearson, Cameron\t41\t88 North Main Street\n" +
      "Webb, Marcus\t29\t12 Ridgeline Dr\n"
    );

    // The old import inserted all three again. This is the bug Drew hit.
    expect(document.body.textContent).toContain("already here");
    fireEvent.click(screen.getByText("Nothing to import").closest("button"));
    expect(writesOf("insert")).toHaveLength(0);
  });

  it("says there is nothing to do rather than offering to do it", async () => {
    await mount();
    await paste("Talbot, Ryan\t34\t1402 Cedar Hollow Dr\n");
    const btn = screen.getByText("Nothing to import").closest("button");
    expect(btn.disabled).toBe(true);
  });
});

describe("a paste with someone new in it", () => {
  it("adds only the new man", async () => {
    await mount();
    await paste(
      "Talbot, Ryan\t34\t1402 Cedar Hollow Dr\n" +
      "Frost, Dallin\t24\t77 Quarry Rd\n"
    );

    expect(screen.getByText("Add 1")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("Add 1").closest("button")); });

    const ins = writesOf("insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].arg).toHaveLength(1);
    expect(ins[0].arg[0].name).toBe("Dallin Frost");
  });
});

describe("the parts that need a person", () => {
  it("asks before treating a new address as a move", async () => {
    await mount();
    await paste("Talbot, Ryan\t34\t900 Sunset Ln\n");

    expect(document.body.textContent).toContain("Need a look");
    expect(document.body.textContent).toContain("Same man — he moved");

    // Untouched, it does nothing at all.
    expect(screen.getByText("Nothing to import").closest("button").disabled).toBe(true);

    fireEvent.click(screen.getByText("Same man — he moved"));
    await act(async () => { fireEvent.click(screen.getByText("Update 1").closest("button")); });

    const up = writesOf("update");
    expect(up).toHaveLength(1);
    expect(up[0].arg.address).toBe("900 Sunset Ln");
    expect(writesOf("insert")).toHaveLength(0);
  });

  it("can be told it's a different man instead", async () => {
    await mount();
    await paste("Talbot, Ryan\t34\t900 Sunset Ln\n");
    fireEvent.click(screen.getByText("Different man — add him"));
    await act(async () => { fireEvent.click(screen.getByText("Add 1").closest("button")); });

    expect(writesOf("insert")).toHaveLength(1);
    expect(writesOf("update")).toHaveLength(0);
  });

  it("leaves an unanswered question unanswered when something else is imported", async () => {
    // The disabled button only proves an import with *nothing but* questions
    // can't run. This is the case that actually reaches the commit path: one
    // clear addition alongside one question nobody answered. Defaulting that
    // question to "yes" passed every other test in this file.
    await mount();
    await paste(
      "Frost, Dallin\t24\t77 Quarry Rd\n" +      // unambiguous — enables the button
      "Talbot, Ryan\t34\t900 Sunset Ln\n"        // a question, deliberately left alone
    );

    expect(document.body.textContent).toContain("Need a look");
    await act(async () => { fireEvent.click(screen.getByText("Add 1").closest("button")); });

    // Exactly the one man, and no quiet update to Ryan's address.
    const ins = writesOf("insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].arg).toHaveLength(1);
    expect(ins[0].arg[0].name).toBe("Dallin Frost");
    expect(writesOf("update"), "an untouched question wrote something").toHaveLength(0);
  });

  it("asks about a new name at an address it already knows", async () => {
    await mount();
    await paste("Webb, Ethan\t19\t12 Ridgeline Dr\n");
    expect(document.body.textContent).toContain("New name at an address you already have");
    expect(document.body.textContent).toContain("Marcus Webb");
  });
});

describe("people missing from the paste", () => {
  it("lists them without removing anybody", async () => {
    await mount();
    await paste("Talbot, Ryan\t34\t1402 Cedar Hollow Dr\n");

    expect(document.body.textContent).toContain("Not in this roster");
    expect(screen.getByLabelText("Remove Cameron Pearson")).toBeTruthy();
    expect(writesOf("delete")).toHaveLength(0);
  });

  it("removes only the ones ticked", async () => {
    await mount();
    await paste("Talbot, Ryan\t34\t1402 Cedar Hollow Dr\n");

    fireEvent.click(screen.getByLabelText("Remove Cameron Pearson"));
    await act(async () => { fireEvent.click(screen.getByText("Remove 1").closest("button")); });

    const del = writesOf("delete");
    expect(del).toHaveLength(1);
    expect(del[0].filter[1]).toEqual(["b"]);
  });
});

describe("clearing the roster", () => {
  it("won't go on a click alone", async () => {
    await mount();
    fireEvent.click(screen.getByText("Clear Roster"));
    const go = screen.getByText(/Clear all 3/).closest("button");
    expect(go.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "yes" } });
    expect(go.disabled).toBe(true);
    expect(writesOf("delete")).toHaveLength(0);
  });

  it("goes once the word is typed", async () => {
    await mount();
    fireEvent.click(screen.getByText("Clear Roster"));
    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "delete" } });
    await act(async () => {
      fireEvent.click(screen.getByText(/Clear all 3/).closest("button"));
    });
    expect(writesOf("delete")).toHaveLength(1);
  });

  it("says what it will break", async () => {
    await mount();
    fireEvent.click(screen.getByText("Clear Roster"));
    expect(document.body.textContent).toContain("lose the name they point to");
  });
});

describe("duplicates already on the roster", () => {
  it("merges identical rows and keeps what only the copy knew", async () => {
    MEMBERS = [
      { id: "1", name: "Ryan Talbot", address: "1402 Cedar Hollow Dr", phone: "801-555-0134", email: "" },
      { id: "2", name: "Ryan Talbot", address: "1402 Cedar Hollow Drive", phone: "", email: "ryan@x.com" },
      { id: "3", name: "Cameron Pearson", address: "88 N Main St" },
    ];
    await mount();
    fireEvent.click(screen.getByText("Find Duplicates"));
    expect(document.body.textContent).toContain("Identical");

    await act(async () => {
      fireEvent.click(screen.getByText(/Merge 1 duplicate/).closest("button"));
    });

    // The email lived only on the row being deleted; it has to survive.
    const up = writesOf("update");
    expect(up).toHaveLength(1);
    expect(up[0].arg.email).toBe("ryan@x.com");

    const del = writesOf("delete");
    expect(del).toHaveLength(1);
    expect(del[0].filter[1]).toHaveLength(1);

    // And in that order — deleting first loses the value being copied.
    expect(WRITES.indexOf(up[0])).toBeLessThan(WRITES.indexOf(del[0]));
  });

  it("won't merge a shared name at two addresses on its own", async () => {
    MEMBERS = [
      { id: "1", name: "Karl Ricks", address: "45 Willow Way" },
      { id: "2", name: "Karl Ricks", address: "900 Sunset Ln" },
    ];
    await mount();
    fireEvent.click(screen.getByText("Find Duplicates"));

    expect(document.body.textContent).toContain("Same name, different address");
    expect(screen.queryByText(/Merge \d+ duplicate/)).toBeNull();
    expect(writesOf("delete")).toHaveLength(0);
  });

  it("says so when there's nothing to clean up", async () => {
    await mount();
    fireEvent.click(screen.getByText("Find Duplicates"));
    expect(document.body.textContent).toContain("No Duplicates");
  });
});
