import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The teaching rotation on the Teaching screen.
 *
 * The slot maths is checked by arithmetic — see tests/teachrotation.mjs. What
 * has to be mounted is the promise the screen makes: a suggestion is visibly
 * a suggestion, opening the sheet doesn't quietly assign anybody, and Apply
 * changes exactly the Sundays it said it would.
 */

let ASSIGNMENTS = [];
let ROTATION = [];
let ROTATION_ERROR = null;
let WRITES = [];

const MEMBERS = [
  { id: "m1", name: "Cameron Butler", active: true },
  { id: "m2", name: "Nick Crump", active: true },
  { id: "m3", name: "Ryan Talbot", active: true },
];

function table(name) {
  // A database that hasn't run the migration answers with an error, not an
  // empty list — and the two used to look identical on screen.
  if (name === "teaching_rotation" && ROTATION_ERROR) {
    const failed = Promise.resolve({ data: null, error: ROTATION_ERROR });
    return new Proxy(failed, {
      get(t, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
        return () => table(name);
      },
    });
  }

  const rows =
    name === "teaching_assignments" ? ASSIGNMENTS :
    name === "teaching_rotation" ? ROTATION :
    name === "members" ? MEMBERS : [];

  const capture = (op) => (arg) => {
    WRITES.push({ table: name, op, arg });
    return chain({ data: [], error: null });
  };
  const chain = (result) => {
    const p = Promise.resolve(result);
    return new Proxy(p, {
      get(t, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
        if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ data: null, error: null });
        if (["insert", "update", "delete", "upsert"].includes(prop)) return capture(prop);
        if (["eq", "in", "not"].includes(prop)) {
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
  return chain({ data: rows, error: null });
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

// Wednesday 2 September 2026. The Sundays ahead are the 6th (1st), 13th (2nd),
// 20th (3rd) and 27th (4th) — one of each slot, which is what makes the
// rotation observable.
const NOW = new Date(2026, 8, 2, 12, 0, 0);

const DREW = [
  { slot: 1, name: "Invite/Presidency" },
  { slot: 2, name: "Cameron Butler" },
  { slot: 4, name: "Nick Crump" },
];

async function mount() {
  vi.setSystemTime(NOW);
  const { default: Teaching } = await import("../src/presidency/Teaching");
  let dom;
  await act(async () => {
    dom = render(<Teaching />);
    await new Promise((r) => setTimeout(r, 30));
  });
  return dom;
}

const writes = (op) => WRITES.filter((w) => w.op === op);

/**
 * The card for one Sunday.
 *
 * Scoped deliberately. The schedule runs six months, so there are half a dozen
 * 2nd Sundays on screen — asserting against the whole page said "still
 * suggested" for a Sunday that had in fact been assigned, because a later one
 * hadn't.
 */
function cardFor(dom, dateText) {
  const btn = [...dom.container.querySelectorAll("button")]
    .find((b) => b.textContent.includes(dateText));
  return btn ? btn.closest("div") : null;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  ASSIGNMENTS = [];
  ROTATION = DREW.map((r) => ({ ...r }));
  ROTATION_ERROR = null;
  WRITES = [];
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("the rotation card", () => {
  it("summarises the arrangement without opening it", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toContain("Invite/Presidency");
    expect(dom.container.textContent).toContain("Cameron Butler");
    expect(dom.container.textContent).toContain("Nick Crump");
    expect(dom.container.textContent).toContain("1 of 4 slots still open");
  });

  it("edits a slot by typing, so it takes more than roster names", async () => {
    await mount();
    fireEvent.click(screen.getByText("Edit"));

    const third = screen.getByLabelText("Teacher on the 3rd Sunday");
    expect(third.value).toBe("");
    await act(async () => {
      fireEvent.change(third, { target: { value: "Guest speaker" } });
    });

    const up = writes("upsert");
    expect(up).toHaveLength(1);
    expect(up[0].arg).toMatchObject({ slot: 3, name: "Guest speaker" });
  });

  it("clearing a slot removes the row rather than storing a blank", async () => {
    await mount();
    fireEvent.click(screen.getByText("Edit"));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Teacher on the 2nd Sunday"), { target: { value: "" } });
    });

    const del = writes("delete");
    expect(del).toHaveLength(1);
    expect(del[0].filter).toEqual(["slot", 2]);
    expect(writes("upsert")).toHaveLength(0);
  });

  it("offers the roster as suggestions and still allows the presidency slot", async () => {
    await mount();
    fireEvent.click(screen.getByText("Edit"));
    const list = document.getElementById("rotation-names-1");
    const values = [...list.options].map((o) => o.value);
    expect(values).toContain("Cameron Butler");
    expect(values).toContain("Invite/Presidency");
  });

  it("has no 5th Sunday slot", async () => {
    await mount();
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.queryByLabelText("Teacher on the 5th Sunday")).toBeNull();
    expect(screen.getByLabelText("Teacher on the 4th Sunday")).toBeTruthy();
  });
});

describe("suggestions on the schedule", () => {
  it("shows the rotation's name, marked as suggested", async () => {
    const dom = await mount();
    const sep13 = cardFor(dom, "Sep 13");
    expect(sep13.textContent).toContain("Cameron Butler");
    expect(sep13.textContent).toContain("suggested, 2nd sunday");
  });

  it("says nothing for a slot nobody fills", async () => {
    // The 3rd Sunday has no name in the rotation, so Sep 20 stays bare.
    const dom = await mount();
    expect(cardFor(dom, "Sep 6").textContent).toContain("suggested, 1st sunday");
    expect(cardFor(dom, "Sep 20").textContent).not.toContain("suggested");
  });

  it("a real assignment replaces the suggestion", async () => {
    ASSIGNMENTS = [{ id: "a1", date: "2026-09-13", teacher_name: "Ryan Talbot" }];
    const dom = await mount();
    const sep13 = cardFor(dom, "Sep 13");
    expect(sep13.textContent).toContain("Ryan Talbot");
    expect(sep13.textContent).not.toContain("suggested");
    // The other 2nd Sundays are untouched — proving the check above is
    // scoped to one card and not to the whole page.
    expect(cardFor(dom, "Oct 11").textContent).toContain("suggested, 2nd sunday");
  });

  it("shows nothing at all when there's no rotation", async () => {
    // The feature has to be invisible to a quorum that never sets one up.
    ROTATION = [];
    const dom = await mount();
    expect(dom.container.textContent).not.toContain("suggested");
    expect(dom.container.textContent).toContain("Nobody set");
  });
});

describe("Apply", () => {
  it("names how many Sundays it would change", async () => {
    const dom = await mount();
    // Sep 6 (1st) and Sep 27 (4th) have suggestions and nobody assigned; the
    // 13th does too until something is assigned to it.
    expect(dom.container.textContent).toMatch(/Apply rotation to \d+/);
  });

  it("assigns only the suggested, unassigned Sundays", async () => {
    ASSIGNMENTS = [{ id: "a1", date: "2026-09-13", teacher_name: "Ryan Talbot" }];
    await mount();
    const btn = screen.getByText(/Apply rotation to/);
    const said = Number(btn.textContent.match(/\d+/)[0]);

    await act(async () => { fireEvent.click(btn); });

    const inserts = writes("insert");
    const updates = writes("update");
    expect(inserts.length + updates.length, "did more than it promised").toBe(said);

    // Never the one already assigned — and checked against *both* kinds of
    // write. Ryan already has a row, so overwriting him would be an update,
    // not an insert; looking only at inserts passed against a build that
    // cheerfully reassigned him.
    expect(inserts.some((w) => w.arg.date === "2026-09-13"),
      "Ryan's Sunday was re-inserted").toBe(false);
    expect(updates.some((w) => (w.filter || []).includes("a1")),
      "Ryan's assignment was overwritten").toBe(false);
    // And he's still the teacher afterwards.
    expect(writes("insert").concat(writes("update"))
      .some((w) => w.arg.teacher_name === "Cameron Butler" && w.filter?.includes("a1"))).toBe(false);
  });

  it("carries the member id when the slot names somebody on the roster", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText(/Apply rotation to/)); });

    const nick = writes("insert").find((w) => w.arg.teacher_name === "Nick Crump");
    expect(nick, "Nick wasn't assigned").toBeTruthy();
    expect(nick.arg.teacher_id).toBe("m2");
  });

  it("carries no id for a standing arrangement", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText(/Apply rotation to/)); });

    const pres = writes("insert").find((w) => w.arg.teacher_name === "Invite/Presidency");
    expect(pres, "the presidency slot wasn't assigned").toBeTruthy();
    expect(pres.arg.teacher_id).toBeNull();
  });

  it("isn't offered when there's nothing to apply", async () => {
    ROTATION = [];
    await mount();
    expect(screen.queryByText(/Apply rotation to/)).toBeNull();
  });
});

/**
 * Drew opened the screen and the Apply button wasn't there.
 *
 * It correctly hides in three different situations, each needing a different
 * thing done about it — and an absent button explains none of them. So the
 * card now says why, and these are the four things it can say.
 */
describe("why Apply isn't showing", () => {
  it("nothing set yet: says to set a slot", async () => {
    ROTATION = [];
    const dom = await mount();
    expect(screen.queryByText(/Apply rotation to/)).toBeNull();
    expect(dom.container.textContent)
      .toContain("Set a teacher for a Sunday above and this will offer to fill the schedule in");
  });

  it("the migration hasn't been run: says which file to run", async () => {
    // This looked identical to "nothing set yet" — the load swallowed the
    // error, so the card offered an Edit button that then failed on save.
    ROTATION_ERROR = { message: 'relation "public.teaching_rotation" does not exist' };
    const dom = await mount();
    expect(dom.container.textContent).toContain("run supabase/catch-up.sql");
    expect(screen.queryByText(/Apply rotation to/)).toBeNull();
  });

  it("everything's already assigned: says so, with the count", async () => {
    const { scheduleBetween, toIso } = await import("../src/lib/domain/dates");
    const all = scheduleBetween(toIso(new Date(2026, 8, 2)), toIso(new Date(2027, 2, 0)), new Set())
      .filter((s) => s.teaches);
    ASSIGNMENTS = all.map((s, i) => ({ id: `a${i}`, date: s.date, teacher_name: "Somebody" }));

    const dom = await mount();
    expect(screen.queryByText(/Apply rotation to/)).toBeNull();
    expect(dom.container.textContent)
      .toMatch(/Every one of the \d+ teaching Sundays ahead already has a teacher/);
    // …and it points at the way out, rather than just reporting a dead end.
    expect(dom.container.textContent).toContain("replace teachers already assigned");
    expect(dom.container.textContent).toContain("the talks stay as they are");
  });

  it("and says nothing at all when the button is there", async () => {
    // Checked by the element's presence, not by listing the sentences it
    // could contain — there are five of them, and a build that explained
    // itself *alongside* a working button passed a string-by-string check.
    const dom = await mount();
    expect(screen.getByText(/Apply rotation to/)).toBeTruthy();
    expect(dom.container.querySelector("[data-no-apply-why]"),
      "explained why the button was missing while showing it").toBeNull();
  });

  it("and the explanation is one element, whichever reason it gives", async () => {
    ROTATION = [];
    const dom = await mount();
    expect(dom.container.querySelectorAll("[data-no-apply-why]")).toHaveLength(1);
  });
});

/**
 * Moving a schedule that's already full onto a new rotation.
 *
 * "all of the sundays are currently set. i dont want to change the talks but
 * i do want to apply the new rotation."
 *
 * The talks are the thing that must survive. Everything else here is about
 * proving that.
 */
describe("replacing teachers on assigned Sundays", () => {
  // Every teaching Sunday assigned to the wrong man, each with a talk chosen.
  async function fullyAssigned() {
    const { scheduleBetween, toIso } = await import("../src/lib/domain/dates");
    ASSIGNMENTS = scheduleBetween(toIso(new Date(2026, 8, 2)), toIso(new Date(2027, 2, 0)), new Set())
      .filter((s) => s.teaches)
      .map((s, i) => ({
        id: `a${i}`,
        date: s.date,
        teacher_name: "Somebody Else",
        teacher_id: "m3",
        talk_title: `Talk ${i}`,
        topic: `Topic ${i}`,
        speaker: "Dieter F. Uchtdorf",
        talk_link: `https://example.org/talk-${i}`,
        notes: `Notes ${i}`,
      }));
  }

  it("does nothing until the box is ticked", async () => {
    await fullyAssigned();
    await mount();
    expect(screen.queryByText(/Apply/)).toBeNull();
    expect(WRITES.filter((w) => w.op === "update")).toHaveLength(0);
  });

  it("offers to replace once it is", async () => {
    await fullyAssigned();
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Replace teachers already assigned/ }));
    });
    expect(screen.getByText(/Apply to \d+, replacing \d+/)).toBeTruthy();
  });

  it("changes the teacher and nothing else", async () => {
    await fullyAssigned();
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Replace teachers already assigned/ }));
    });
    await act(async () => { fireEvent.click(screen.getByText(/Apply to \d+, replacing/)); });

    const updates = writes("update");
    expect(updates.length).toBeGreaterThan(0);

    for (const u of updates) {
      // The whole point: a talk somebody chose is not the rotation's business.
      expect(Object.keys(u.arg).sort())
        .toEqual(["no_lesson_reason", "teacher_id", "teacher_name"]);
      expect(u.arg).not.toHaveProperty("talk_title");
      expect(u.arg).not.toHaveProperty("topic");
      expect(u.arg).not.toHaveProperty("speaker");
      expect(u.arg).not.toHaveProperty("talk_link");
      expect(u.arg).not.toHaveProperty("notes");
    }
  });

  it("writes the rotation's names, with ids where they're known", async () => {
    await fullyAssigned();
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Replace teachers already assigned/ }));
    });
    await act(async () => { fireEvent.click(screen.getByText(/Apply to \d+, replacing/)); });

    const names = new Set(writes("update").map((u) => u.arg.teacher_name));
    expect(names).toContain("Invite/Presidency");
    expect(names).toContain("Cameron Butler");
    expect(names).toContain("Nick Crump");
    expect(names, "a 3rd Sunday was assigned from an empty slot").not.toContain("");

    const cam = writes("update").find((u) => u.arg.teacher_name === "Cameron Butler");
    expect(cam.arg.teacher_id).toBe("m1");
    const pres = writes("update").find((u) => u.arg.teacher_name === "Invite/Presidency");
    expect(pres.arg.teacher_id).toBeNull();
  });

  it("leaves the 3rd Sundays alone, because that slot is empty", async () => {
    await fullyAssigned();
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: /Replace teachers already assigned/ }));
    });
    const said = Number(screen.getByText(/Apply to \d+, replacing/).textContent.match(/\d+/)[0]);
    await act(async () => { fireEvent.click(screen.getByText(/Apply to \d+, replacing/)); });

    // Roughly three of every four Sundays have a slot; the 3rd is empty and a
    // 5th has no slot at all, so it must be well short of the total.
    expect(writes("update").length).toBe(said);
    expect(said).toBeLessThan(ASSIGNMENTS.length);
  });

  it("skips a Sunday already showing the right name", async () => {
    // Nothing to write, and counting it would make the button overstate.
    const { scheduleBetween, toIso } = await import("../src/lib/domain/dates");
    const all = scheduleBetween(toIso(new Date(2026, 8, 2)), toIso(new Date(2027, 2, 0)), new Set())
      .filter((s) => s.teaches);
    const { rotationFor } = await import("../src/lib/domain/teachingRotation");
    const rot = { 1: "Invite/Presidency", 2: "Cameron Butler", 4: "Nick Crump" };
    ASSIGNMENTS = all.map((s, i) => ({
      id: `a${i}`, date: s.date,
      teacher_name: rotationFor(rot, s.date) || "Somebody Else",
    }));

    await mount();
    // The tick box isn't even offered: there is nothing a replace could
    // change, so offering one would be a button that does nothing.
    expect(screen.queryByRole("checkbox", { name: /Replace teachers already assigned/ })).toBeNull();
    expect(screen.queryByText(/Apply/)).toBeNull();
    expect(document.body.textContent)
      .toMatch(/already has the teacher the rotation names/);
  });
});

describe("opening a Sunday", () => {
  it("prefills the suggestion but writes nothing until saved", async () => {
    const dom = await mount();
    const before = WRITES.length;

    // Sep 13 is the 2nd Sunday — Cameron.
    const card = [...dom.container.querySelectorAll("button")]
      .find((b) => b.textContent.includes("Sep 13"));
    await act(async () => { fireEvent.click(card); });

    // Scoped to the sheet: the rotation editor above also holds a box reading
    // "Cameron Butler", so a page-wide query passes without the sheet ever
    // having been prefilled.
    const sheet = [...document.querySelectorAll("div")]
      .find((el) => (el.getAttribute("style") || "").includes("position: fixed"));
    expect(sheet, "the assign sheet didn't open").toBeTruthy();
    const filled = [...sheet.querySelectorAll("input")].map((i) => i.value);
    expect(filled).toContain("Cameron Butler");

    expect(sheet.textContent).toContain("saving is what makes it an assignment");
    expect(WRITES.length, "opening the sheet wrote something").toBe(before);
  });
});
