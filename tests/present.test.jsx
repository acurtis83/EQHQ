import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { runningOrder, agendaText, NOBODY, SECTIONS } from "../src/lib/domain/runningOrder";
import { rowsFor, MIN_ROWS, MAX_ROWS } from "../src/lib/domain/textRows";

/**
 * Reading the agenda out loud.
 *
 * "I need to see the full text box so i can read the announcement. So even if
 *  there was a presentation mode that formatted the agenda for use in a
 *  meeting that would work."
 *
 * Two halves. The editing screen's announcement boxes have to show the whole
 * announcement, and there has to be a screen you can read the meeting from at
 * the podium — in the order the meeting runs, not the order the editor lays
 * things out for editing.
 */

let ITEMS = [];
let EVENTS = [];
let CALLINGS = [];
let AGENDA = null;
let WRITES = [];

function table(name) {
  const rows =
    name === "agenda_items" ? ITEMS :
    name === "events" ? EVENTS :
    name === "callings" ? CALLINGS :
    name === "members" ? [] : [];

  const capture = (op) => (arg) => {
    WRITES.push({ table: name, op, arg });
    return chain({ data: [], error: null });
  };
  const chain = (result) => {
    const p = Promise.resolve(result);
    return new Proxy(p, {
      get(t, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
        if (prop === "maybeSingle") {
          return () => Promise.resolve({ data: name === "agendas" ? AGENDA : null, error: null });
        }
        if (prop === "single") {
          return () => Promise.resolve({ data: name === "agendas" ? AGENDA : { id: "x" }, error: null });
        }
        if (["insert", "update", "delete", "upsert"].includes(prop)) return capture(prop);
        if (prop === "eq" || prop === "in" || prop === "not") {
          return (...args) => {
            const last = WRITES[WRITES.length - 1];
            if (last && !last.filter) last.filter = args;
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
    storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: {} }) }) },
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

vi.mock("../src/lib/useAuth", () => ({
  useAuth: () => ({ presidency: { name: "Drew Curtis" }, isPresidency: true, ready: true, signOut() {} }),
}));

const NOW = new Date(2026, 8, 6, 9, 0, 0);

// Long enough to be the thing that couldn't be read in a one-line box, and
// with a second sentence carrying the detail — which is exactly the part a
// clipped box loses.
const LONG = "Ministering interviews are due before the end of the quarter. "
  + "Please get with your companion this week and let your district leader know "
  + "which families you were able to reach.";

const ANNOUNCEMENTS = [
  { id: "n1", section: "announcements", text: LONG, sort_order: 0 },
  { id: "n2", section: "announcements", text: "Temple cleaning on Saturday.", sort_order: 1 },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  ITEMS = ANNOUNCEMENTS.map((a) => ({ ...a }));
  // All four middle sections present, so an ordering assertion is measuring
  // the order rather than which of them happened to be empty.
  EVENTS = [{ id: "e1", kind: "temple", title: "Stake Temple Cleaning",
    event_date: "2026-09-19", event_time: "8:00 AM" }];
  CALLINGS = [{ id: "c1", stage: "Called", candidate_name: "Ben Savio",
    position: "Quorum Instructor", sort_order: 0 }];
  AGENDA = {
    id: "a1", kind: "sunday", meeting_date: "2026-09-06", carried_over: true,
    conducting: "Cameron Pearson", opening_prayer: "Karl Moore", closing_prayer: "",
  };
  WRITES = [];
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

/* ------------------------------ the box size ------------------------------ */

describe("how tall an announcement box has to be", () => {
  it("counts the lines the text wraps to", () => {
    expect(rowsFor("a".repeat(40), 20)).toBe(2);
    expect(rowsFor("a".repeat(100), 20)).toBe(5);
  });

  it("counts each typed line separately, not the total length", () => {
    // Two short lines are two rows. Dividing the whole string by the width
    // says one, and the second line is the one that disappears.
    expect(rowsFor("one\ntwo\nthree", 40)).toBe(3);
  });

  it("never smaller than a box you can see is a box", () => {
    expect(rowsFor("")).toBe(MIN_ROWS);
    expect(rowsFor("Short.")).toBe(MIN_ROWS);
  });

  it("and never tall enough to swallow the rest of the agenda", () => {
    expect(rowsFor("x".repeat(5000), 20)).toBe(MAX_ROWS);
  });
});

/* ---------------------------- the running order --------------------------- */

describe("the order the meeting runs in", () => {
  const full = () => runningOrder({
    agenda: { opening_prayer: "Karl Moore", closing_prayer: "Ryan Talbot" },
    conducting: "Cameron Pearson",
    lesson: { teacher_name: "Seth Adamson", talk_title: "Bearing Burdens", speaker: "Elder Renlund" },
    sustainings: [{ id: "c1", stage: "Called", candidate_name: "Ben Savio", position: "Instructor" }],
    announcements: [{ id: "n1", text: LONG }],
    events: [{ id: "e1", title: "Stake Temple Cleaning", when: "2026-09-19" }],
    signUps: ["e1"],
  });

  /**
   * "either add a manual reorder for things...or move Announcements and
   *  Callings & Sustainings above Lesson."
   *
   * Business first, lesson last. The lesson runs to the end of the hour, so
   * anything after it is whatever there turns out to be time for — which is
   * how announcements came to be the thing that got skipped. Upcoming sits
   * with the announcements because that's what it is.
   */
  it("does the business first and the lesson last", () => {
    const keys = full().map((b) => b.key);
    expect(keys).toEqual([
      "conducting", "opening", "announcements", "upcoming", "sustainings", "lesson", "closing",
    ]);
  });

  it("and the closing prayer after the lesson, not beside the opening one", () => {
    // On the editing screen the two prayers sit inches apart because they're
    // the same kind of control. Read out in that order the meeting would end
    // before it started.
    const keys = full().map((b) => b.key);
    expect(keys[keys.length - 1]).toBe("closing");
    expect(keys.indexOf("closing")).toBeGreaterThan(keys.indexOf("lesson"));
  });

  it("is stated in exactly one place", () => {
    // The screen lays its sections out from SECTIONS and everything else
    // renders the blocks. Four surfaces used to each hold their own copy of
    // this order, and two of them were already stale.
    expect(SECTIONS).toEqual(["announcements", "upcoming", "sustainings", "lesson"]);
    const keys = full().map((b) => b.key);
    expect(keys.slice(2, -1)).toEqual(SECTIONS);
  });

  it("keeps a prayer nobody is down for, and says so", () => {
    // A gap you can still fix at 8:55. A block that vanished when empty would
    // take the reminder with it.
    const blocks = runningOrder({ agenda: { opening_prayer: "" } });
    const opening = blocks.find((b) => b.key === "opening");
    expect(opening).toBeTruthy();
    expect(opening.value).toBe(NOBODY);
    expect(opening.assigned).toBe(false);
  });

  it("but drops a list with nothing in it", () => {
    // Nothing to read out. A heading over nothing is a line to process and
    // discard every week.
    const keys = runningOrder({ agenda: {} }).map((b) => b.key);
    expect(keys).not.toContain("sustainings");
    expect(keys).not.toContain("announcements");
    expect(keys).not.toContain("upcoming");
    // The prayers and the lesson still stand.
    expect(keys).toEqual(["conducting", "opening", "lesson", "closing"]);
  });

  it("and the lesson still sits after where the business would have been", () => {
    // Dropping the empty blocks must not quietly promote the lesson past
    // business that simply isn't there this week.
    const keys = runningOrder({
      agenda: {}, announcements: [{ id: "n1", text: "One thing." }],
    }).map((b) => b.key);
    expect(keys.indexOf("announcements")).toBeLessThan(keys.indexOf("lesson"));
  });

  it("says why there's no lesson rather than leaving a hole", () => {
    const b = runningOrder({ reason: "Stake conference." }).find((x) => x.key === "lesson");
    expect(b.reason).toBe("Stake conference.");
    expect(b.teacher).toBeUndefined();
  });

  it("keeps the teacher and the talk's author apart", () => {
    const b = full().find((x) => x.key === "lesson");
    expect(b.teacher).toBe("Seth Adamson");
    expect(b.speaker).toBe("Elder Renlund");
  });

  /**
   * Releases and callings are two pieces of business, not one list with a
   * word in front of each name. They're put to the quorum separately and the
   * words differ — thanks for one, a sustaining vote for the other.
   */
  it("splits releases from callings", () => {
    const keys = runningOrder({
      sustainings: [
        { id: "c1", stage: "Need to Release", candidate_name: "Matt Hill", position: "Instructor" },
        { id: "c2", stage: "Called", candidate_name: "Ben Savio", position: "Instructor" },
      ],
    }).map((b) => b.key);
    expect(keys).toContain("releases");
    expect(keys).toContain("sustainings");
    // Released first, the way the meeting runs it.
    expect(keys.indexOf("releases")).toBeLessThan(keys.indexOf("sustainings"));
  });

  it("and shows only the one that has anybody in it", () => {
    const keys = runningOrder({
      sustainings: [{ id: "c2", stage: "Called", candidate_name: "Ben Savio", position: "Instructor" }],
    }).map((b) => b.key);
    expect(keys).toContain("sustainings");
    expect(keys, "an empty Releases heading with nothing under it").not.toContain("releases");
  });

  it("carries the words to say, not just the names", () => {
    const [rel, sus] = runningOrder({
      sustainings: [
        { id: "c1", stage: "Need to Release", candidate_name: "Matt Hill", position: "Instructor" },
        { id: "c2", stage: "Called", candidate_name: "Ben Savio", position: "Instructor" },
      ],
    }).filter((b) => b.kind === "business");

    expect(rel.intro).toMatch(/released from their calling/i);
    expect(rel.vote).toMatch(/express thanks/i);
    // A release asks for thanks; it does not ask for a sustaining vote.
    expect(rel.vote).not.toMatch(/all in favor/i);

    expect(sus.intro).toMatch(/be sustained/i);
    expect(sus.vote).toMatch(/all in favor/i);
    expect(sus.vote).toMatch(/opposed/i);
  });

  it("and gets the grammar right for one person", () => {
    // "The following individuals have been released" over a single name is
    // the kind of thing every person in the room notices.
    const one = runningOrder({
      sustainings: [{ id: "c1", stage: "Need to Release", candidate_name: "Matt Hill", position: "Instructor" }],
    }).find((b) => b.key === "releases");
    expect(one.intro).toMatch(/individual has been released from their calling,/);

    const two = runningOrder({
      sustainings: [
        { id: "c1", stage: "Need to Release", candidate_name: "Matt Hill", position: "Instructor" },
        { id: "c3", stage: "Need to Release", candidate_name: "Joe Hirt", position: "Instructor" },
      ],
    }).find((b) => b.key === "releases");
    expect(two.intro).toMatch(/individuals have been released from their callings,/);
  });

  it("carries the whole announcement, not a summary of it", () => {
    const b = full().find((x) => x.key === "announcements");
    expect(b.items[0].text).toBe(LONG);
  });

  it("drops an announcement that's been emptied but not deleted", () => {
    const b = runningOrder({ announcements: [{ id: "n1", text: "   " }, { id: "n2", text: "Real" }] })
      .find((x) => x.key === "announcements");
    expect(b.items.map((i) => i.id)).toEqual(["n2"]);
  });

  it("marks which events have a sign-up worth mentioning", () => {
    const items = full().find((x) => x.key === "upcoming").items;
    expect(items[0].signUp).toBe(true);
    expect(runningOrder({ events: [{ id: "e1", title: "X", when: "2026-09-19" }], signUps: [] })
      .find((x) => x.key === "upcoming").items[0].signUp).toBe(false);
  });
});

/* ------------------------------ on the screen ----------------------------- */

async function mount() {
  vi.setSystemTime(NOW);
  const { default: SundayAgenda } = await import("../src/presidency/SundayAgenda");
  let dom;
  await act(async () => {
    dom = render(<SundayAgenda />);
    await new Promise((r) => setTimeout(r, 30));
  });
  return dom;
}

const boxFor = (id) =>
  document.querySelector(`[data-announcement="${id}"] textarea`);

const present = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Present");

describe("the announcement boxes on the editing screen", () => {
  it("are boxes that grow, not single-line inputs", async () => {
    await mount();
    const box = boxFor("n1");
    expect(box, "the announcement is still a one-line input").toBeTruthy();
    expect(box.value).toBe(LONG);
    // Tall enough to show the whole thing rather than the first forty
    // characters of it.
    expect(Number(box.getAttribute("rows"))).toBeGreaterThan(MIN_ROWS);
  });

  it("and a short one doesn't get a tall box", async () => {
    await mount();
    expect(Number(boxFor("n2").getAttribute("rows"))).toBe(MIN_ROWS);
  });

  it("save when you leave the box, not on every keystroke", async () => {
    // The old input wrote to the database and reloaded the whole agenda per
    // character. That's a round trip a letter in a box meant for paragraphs.
    await mount();
    WRITES = [];
    const box = boxFor("n2");

    await act(async () => {
      fireEvent.focus(box);
      fireEvent.change(box, { target: { value: "Temple cleaning on Saturday at 8am." } });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(WRITES.filter((w) => w.op === "update"),
      "typing wrote to the database").toHaveLength(0);

    await act(async () => {
      fireEvent.blur(box);
      await new Promise((r) => setTimeout(r, 20));
    });
    const saved = WRITES.filter((w) => w.op === "update");
    expect(saved).toHaveLength(1);
    expect(saved[0].arg.text).toBe("Temple cleaning on Saturday at 8am.");
  });

  it("and write nothing at all when the text didn't change", async () => {
    await mount();
    WRITES = [];
    const box = boxFor("n2");
    await act(async () => {
      fireEvent.focus(box);
      fireEvent.blur(box);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(WRITES.filter((w) => w.op === "update")).toHaveLength(0);
  });
});

describe("presentation mode", () => {
  it("is offered from the agenda toolbar", async () => {
    await mount();
    expect(present(), "no way into presentation mode").toBeTruthy();
  });

  async function open() {
    await mount();
    await act(async () => {
      fireEvent.click(present());
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  it("shows the whole announcement, uncut", async () => {
    await open();
    const sheet = document.querySelector("[data-present]");
    expect(sheet, "presentation mode didn't open").toBeTruthy();
    expect(sheet.textContent).toContain(LONG);
  });

  it("has no editable field in it", async () => {
    // It's read from while talking. Anything you can type into is something
    // you can change by accident holding a phone.
    await open();
    const sheet = document.querySelector("[data-present]");
    expect(sheet.querySelectorAll("textarea, input, select")).toHaveLength(0);
  });

  it("runs the meeting's order", async () => {
    await open();
    const keys = [...document.querySelectorAll("[data-present] [data-block]")]
      .map((el) => el.dataset.block);
    expect(keys[0]).toBe("conducting");
    expect(keys[keys.length - 1]).toBe("closing");
    expect(keys.indexOf("announcements")).toBeLessThan(keys.indexOf("lesson"));
  });

  it("keeps the announcements in the order they were put in", async () => {
    await open();
    const ids = [...document.querySelectorAll("[data-present] [data-notice]")]
      .map((el) => el.dataset.notice);
    expect(ids).toEqual(["n1", "n2"]);
  });

  /**
   * "the close button at the top is hard to use on my iphone"
   *
   * It was in the top-right corner — the furthest point from the thumb of a
   * hand holding a phone up in front of people, and on an iPhone it sits
   * under the notch and Safari's toolbar besides.
   */
  it("puts Done along the bottom, not in a top corner", async () => {
    await open();
    const done = document.querySelector('[data-present] [aria-label="Done"]');
    const bar = done.parentElement;
    const sheet = document.querySelector("[data-present]");

    // Last thing in the overlay, not the first.
    expect(bar).toBe(sheet.lastElementChild);
    expect(done.style.width, "still a corner-sized target").toBe("100%");
    expect(parseInt(done.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  it("and keeps it clear of the home indicator", async () => {
    // Without the safe-area inset the bottom of the button sits under the
    // iPhone's home bar, which swallows the tap.
    await open();
    const bar = document.querySelector('[data-present] [aria-label="Done"]').parentElement;
    expect(bar.className).toBe("eq-present-bar");

    const css = [...document.querySelectorAll("[data-present] style")]
      .map((s) => s.textContent).join("");
    expect(css).toMatch(/\.eq-present-bar\s*\{[^}]*env\(safe-area-inset-bottom/);
    // The notch at the other end, for the same reason.
    expect(css).toMatch(/\.eq-present-top\s*\{[^}]*env\(safe-area-inset-top/);
  });

  it("with nothing to press at the top", async () => {
    await open();
    const header = document.querySelector("[data-present]").firstElementChild;
    expect(header.querySelectorAll("button")).toHaveLength(0);
  });

  it("reads the business out with the words that go around it", async () => {
    await open();
    const sheet = document.querySelector("[data-present]");
    expect(sheet.textContent).toMatch(/have been called|has been called/i);
    expect(sheet.textContent).toMatch(/All in favor, please show by the uplifted hand/i);
    expect(sheet.textContent).toContain("Ben Savio — Quorum Instructor");
  });

  it("closes on Done", async () => {
    await open();
    await act(async () => {
      fireEvent.click(document.querySelector('[data-present] [aria-label="Done"]'));
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.querySelector("[data-present]")).toBeNull();
  });

  it("and on Escape, for anybody who opened it by accident", async () => {
    await open();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.querySelector("[data-present]")).toBeNull();
  });
});

/**
 * One order, four surfaces.
 *
 * The screen, the sheet you read from, the PDF and Copy all present the same
 * meeting. Each used to arrange it separately, and two of them were already
 * stale by the time this was noticed — the printed copy and Copy still had the
 * lesson before the announcements. These pin all four to the same sequence, so
 * moving one and forgetting the others fails here rather than on a Sunday.
 */
describe("every surface agrees on the order", () => {
  const positions = (text, labels) => labels.map((l) => text.indexOf(l));
  const rising = (xs) => xs.every((n, i) => n >= 0 && (i === 0 || n > xs[i - 1]));

  it("on the editing screen", async () => {
    const dom = await mount();
    const at = positions(dom.container.textContent,
      ["Announcements", "Upcoming Events", "Callings & Sustainings", "Lesson"]);
    expect(at, `sections came out at ${at}`).toSatisfy(rising);
  });

  it("in presentation mode", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(present());
      await new Promise((r) => setTimeout(r, 20));
    });
    const keys = [...document.querySelectorAll("[data-present] [data-block]")]
      .map((el) => el.dataset.block);
    expect(keys).toEqual([
      "conducting", "opening", "announcements", "upcoming", "sustainings", "lesson", "closing",
    ]);
  });

  it("on the printed copy", async () => {
    const dom = await mount();
    await act(async () => {
      fireEvent.click([...dom.container.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "PDF"));
      await new Promise((r) => setTimeout(r, 10));
    });
    const sheet = document.querySelector(".eq-print-root");
    expect(sheet, "the print sheet didn't render").toBeTruthy();
    const at = positions(sheet.textContent,
      ["Announcements", "Coming Up", "Sustainings", "Lesson", "Closing Prayer"]);
    expect(at, `headings came out at ${at}`).toSatisfy(rising);
  });

  it("and in what Copy puts on the clipboard", () => {
    const text = agendaText(runningOrder({
      agenda: { opening_prayer: "Karl Moore", closing_prayer: "Ryan Talbot" },
      conducting: "Cameron Pearson",
      lesson: { teacher_name: "Seth Adamson" },
      sustainings: [{ id: "c1", stage: "Called", candidate_name: "Ben Savio", position: "Instructor" }],
      announcements: [{ id: "n1", text: LONG }],
      events: [{ id: "e1", title: "Stake Temple Cleaning", when: "2026-09-19" }],
      signUps: ["e1"],
    }), "Sunday Quorum Meeting").join("\n");

    const at = positions(text,
      ["Announcements:", "Coming Up:", "Sustainings:", "Lesson:", "Closing Prayer:"]);
    expect(at, `lines came out at ${at}`).toSatisfy(rising);
    // ...and the whole announcement went with it, not a first line.
    expect(text).toContain(LONG);
    expect(text).toContain("Stake Temple Cleaning");
    // The wording travels too. Somebody pasting this to a counselor who's
    // conducting for them needs the sentences, not a list of names.
    expect(text).toMatch(/All in favor/i);
  });
});
