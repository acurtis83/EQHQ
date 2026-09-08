import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The conducting schedule, and the Sunday agenda reading from it.
 *
 * The month arithmetic is checked by arithmetic — see tests/conducting.mjs.
 * What has to be mounted is the promise the two screens make to each other:
 * the schedule fills the Conducting box, a one-off change to a single Sunday
 * doesn't rewrite the month, and clearing that change gives the month back.
 *
 * Against a fixed clock, because "the next twelve months" is otherwise a
 * different twelve months depending on when the suite runs.
 */

let SCHEDULE = [];
let PRESIDENCY = [];
let AGENDA = null;
let ITEMS = [];
let WRITES = [];

function table(name) {
  const rows =
    name === "conducting_schedule" ? SCHEDULE :
    name === "presidency_members" ? PRESIDENCY :
    name === "members" ? [{ id: "m1", name: "Ryan Talbot", active: true }] :
    name === "agenda_items" ? ITEMS : [];

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
        if (prop === "insert" || prop === "update" || prop === "delete" || prop === "upsert") {
          return capture(prop);
        }
        if (prop === "eq" || prop === "in" || prop === "not") {
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

// Sunday 6 September 2026. September is the first month on the schedule.
const NOW = new Date(2026, 8, 6, 9, 0, 0);

const PRES = [
  // Deliberately out of order, and with the secretary in it. Conducting goes
  // round the President and his two counselors only.
  { name: "Karl Moore", role: "Secretary" },
  { name: "Cameron Pearson", role: "First Counselor" },
  { name: "Drew Curtis", role: "President" },
  { name: "Ryan Talbot", role: "Second Counselor" },
];
const ROTATION = ["Drew Curtis", "Cameron Pearson", "Ryan Talbot"];

async function mountSchedule() {
  vi.setSystemTime(NOW);
  const { default: ConductingSchedule } = await import("../src/presidency/ConductingSchedule");
  let dom;
  await act(async () => {
    dom = render(<ConductingSchedule />);
    await new Promise((r) => setTimeout(r, 0));
  });
  return dom;
}

const upserts = () => WRITES.filter((w) => w.op === "upsert");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  SCHEDULE = [];
  PRESIDENCY = PRES.map((p) => ({ ...p }));
  AGENDA = null;
  ITEMS = [];
  WRITES = [];
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("the schedule screen", () => {
  it("lists a year starting from the month you're in", async () => {
    const dom = await mountSchedule();
    expect(dom.container.textContent).toContain("September 2026");
    // Twelve rows, crossing the year end.
    expect(dom.container.textContent).toContain("August 2027");
    expect(document.querySelectorAll("[data-conducting-month]").length).toBe(12);
  });

  it("says how much is still open", async () => {
    const dom = await mountSchedule();
    expect(dom.container.textContent).toContain("12 of 12 months still open");
  });

  it("saves one month without touching the others", async () => {
    await mountSchedule();
    const sep = screen.getByLabelText("Conducting in September 2026");
    await act(async () => { fireEvent.change(sep, { target: { value: "Ryan Talbot" } }); });

    expect(upserts()).toHaveLength(1);
    expect(upserts()[0].arg).toMatchObject({ month: "2026-09", name: "Ryan Talbot" });
  });

  it("clearing a month removes the row rather than storing a blank", async () => {
    SCHEDULE = [{ month: "2026-09", name: "Karl Ricks" }];
    await mountSchedule();
    const sep = screen.getByLabelText("Conducting in September 2026");
    await act(async () => { fireEvent.change(sep, { target: { value: "" } }); });

    const dels = WRITES.filter((w) => w.op === "delete");
    expect(dels).toHaveLength(1);
    expect(dels[0].filter).toEqual(["month", "2026-09"]);
    expect(upserts()).toHaveLength(0);
  });

  it("deals the presidency through the year in one go", async () => {
    await mountSchedule();
    await act(async () => { fireEvent.click(screen.getByText("Rotate presidency")); });

    expect(upserts()).toHaveLength(1);
    const rows = upserts()[0].arg;
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ month: "2026-09", name: "Drew Curtis" });
    expect(rows[1].name).toBe("Cameron Pearson");
    // Four months each, nobody twice running.
    for (const name of ROTATION) {
      expect(rows.filter((r) => r.name === name)).toHaveLength(4);
    }
    expect(rows.some((r) => r.name === "Karl Moore"),
      "the secretary was dealt a month").toBe(false);
  });

  it("offers the rotation only, in the order it runs", async () => {
    await mountSchedule();
    const opts = [...screen.getByLabelText("Conducting in September 2026").options]
      .map((o) => o.textContent);

    expect(opts[0]).toBe("— nobody yet —");
    expect(opts.slice(1)).toEqual(ROTATION);
    expect(opts, "the secretary is in the list").not.toContain("Karl Moore");
  });

  it("says who the rotation is between", async () => {
    const dom = await mountSchedule();
    expect(dom.container.textContent).toContain("President and his two counselors");
  });

  it("flags a month still assigned to somebody who no longer conducts", async () => {
    // Rotating before the secretary was excluded left him holding months. He
    // has to stay visible — silently blanking his month would be worse — but
    // the row should say why he's there.
    SCHEDULE = [{ month: "2026-09", name: "Karl Moore" }];
    await mountSchedule();
    const sep = screen.getByLabelText("Conducting in September 2026");
    expect(sep.value).toBe("Karl Moore");
    expect(sep.textContent).toContain("no longer in the rotation");
    expect(WRITES, "opening the screen rewrote a month").toHaveLength(0);
  });

  it("keeps showing somebody who has left the presidency", async () => {
    // Their month is already assigned. Dropping them from the list would
    // silently reset that month to nobody the next time this screen opened.
    SCHEDULE = [{ month: "2026-09", name: "Former Counselor" }];
    await mountSchedule();
    const sep = screen.getByLabelText("Conducting in September 2026");
    expect(sep.value).toBe("Former Counselor");
    expect(WRITES).toHaveLength(0);
  });

  it("says so when nobody in the presidency conducts", async () => {
    PRESIDENCY = [{ name: "Karl Moore", role: "Secretary" }];
    const dom = await mountSchedule();
    expect(dom.container.textContent).toContain("Nobody in the presidency has a role that conducts");
    expect(screen.queryByText("Rotate presidency")).toBeNull();
  });

  it("says so when the presidency is empty", async () => {
    PRESIDENCY = [];
    const dom = await mountSchedule();
    expect(dom.container.textContent).toContain("Nobody in the presidency has a role that conducts");
    expect(screen.queryByText("Rotate presidency")).toBeNull();
  });
});

describe("the Sunday agenda reading the schedule", () => {
  async function mountAgenda() {
    vi.setSystemTime(NOW);
    const { default: SundayAgenda } = await import("../src/presidency/SundayAgenda");
    let dom;
    await act(async () => {
      dom = render(<SundayAgenda />);
      await new Promise((r) => setTimeout(r, 30));
    });
    return dom;
  }

  /**
   * Opening an old agenda has to be a read.
   *
   * Past Sundays are selectable now, so the presidency can correct an
   * announcement after the fact. But the agenda screen rolls the previous
   * week's announcements forward on first visit — and pointed at a meeting
   * that already happened, that would write announcements INTO it: changing
   * the record of what was said that day, and, when it's the most recent past
   * Sunday, changing what the whole quorum reads on the feed.
   */
  it("doesn't carry announcements into a Sunday that has already happened", async () => {
    SCHEDULE = [];
    AGENDA = { id: "old", kind: "sunday", meeting_date: "2026-08-23", carried_over: false };
    const dom = await mountAgenda();

    // Opening on today's Sunday DOES carry forward, which is the point of the
    // feature — so the writes are cleared and only what a past selection
    // causes is measured. Without this step the test passes either way, since
    // the screen never leaves the current Sunday on its own.
    WRITES = [];

    const picker = dom.container.querySelector("select");
    expect([...picker.options].some((o) => o.value === "2026-08-23"),
      "past Sundays aren't selectable at all").toBe(true);

    await act(async () => {
      fireEvent.change(picker, { target: { value: "2026-08-23" } });
      await new Promise((r) => setTimeout(r, 30));
    });

    const wrote = WRITES.filter((w) => w.table === "agenda_items" && w.op === "insert");
    expect(wrote, "opening a past agenda rewrote what was announced").toHaveLength(0);
    const marked = WRITES.filter(
      (w) => w.table === "agendas" && w.op === "update" && "carried_over" in (w.arg || {})
    );
    expect(marked, "it marked a past agenda as carried").toHaveLength(0);
  });

  /**
   * "the announcements from sunday 9/6 did not carry over"
   *
   * `carried_over` meant "this agenda has been opened once", not "the carry
   * has happened", and the two come apart in the ordinary case: the
   * presidency looks ahead at next Sunday before the secretary has written up
   * last Sunday's notices. The agenda found nothing, marked itself done, and
   * could never carry again — so announcements about the 11th and 12th stayed
   * on the 6th's agenda and never reached the week they were about.
   */
  it("doesn't call the carry done when there was nothing to carry yet", async () => {
    SCHEDULE = [];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", carried_over: false };
    // No previous agenda at all: the mock's maybeSingle returns AGENDA for the
    // lookup, but agenda_items comes back empty, which is the case that
    // matters — last Sunday exists and has no announcements on it yet.
    await mountAgenda();

    const marked = WRITES.filter(
      (w) => w.table === "agendas" && w.op === "update" && w.arg?.carried_over === true
    );
    expect(marked, "it gave up on carrying before there was anything to carry")
      .toHaveLength(0);
  });

  /**
   * "theres too many spots for the weekly Email to be generated....its a
   *  little confusing to know which one to use or if the announcements are
   *  synced between them all"
   *
   * There were three, two of them on this one screen: the toolbar button, and
   * an embedded copy of the Secretary card that kept its OWN selected Sunday
   * — so on the agenda for the 20th it could be sitting on the 13th, with two
   * "Weekly Email" buttons inches apart building different weeks.
   */
  it("has no way to generate the weekly email any more", async () => {
    SCHEDULE = [];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", carried_over: true };
    const dom = await mountAgenda();

    const buttons = [...dom.container.querySelectorAll("button")]
      .map((b) => b.textContent.trim());
    expect(buttons.filter((t) => /^Weekly Email$/i.test(t)),
      "the agenda is still offering to build the email").toHaveLength(0);

    // ...and says where it went, since this is where it'll be looked for.
    expect(dom.container.textContent).toContain("Weekly email is on Home");
  });

  it("and doesn't embed a second secretary card with its own date", async () => {
    SCHEDULE = [];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", carried_over: true };
    const dom = await mountAgenda();
    // The embedded card announced itself with this heading.
    expect(dom.container.textContent).not.toContain("Secretary");

    // Two Sunday pickers on one screen is the actual hazard — that's what let
    // the two email buttons sit on different weeks. Counted by which selects
    // list Sundays, because the agenda also has selects for conducting and
    // the two prayers.
    const sundayPickers = [...dom.container.querySelectorAll("select")]
      .filter((s) => [...s.options].some((o) => /^Sun, /.test(o.textContent)));
    expect(sundayPickers).toHaveLength(1);
  });

  it("can shuffle the announcements, and writes the new order", async () => {
    SCHEDULE = [];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", carried_over: true };
    ITEMS = [
      { id: "i1", section: "announcements", text: "First one", sort_order: 0 },
      { id: "i2", section: "announcements", text: "Second one", sort_order: 1 },
    ];
    const dom = await mountAgenda();
    WRITES = [];

    const down = dom.container.querySelector('[data-announcement="i1"] [aria-label="Move down"]');
    expect(down, "no reorder control on the announcement").toBeTruthy();
    await act(async () => {
      fireEvent.click(down);
      await new Promise((r) => setTimeout(r, 20));
    });

    const orders = WRITES.filter(
      (w) => w.table === "agenda_items" && w.op === "update" && "sort_order" in (w.arg || {})
    );
    // Both rows renumbered explicitly rather than two values swapped: agendas
    // collect colliding sort_orders, and a swap silently does nothing there.
    expect(orders.map((w) => w.arg.sort_order)).toEqual([0, 1]);
  });

  it("and the ends don't offer a move that goes nowhere", async () => {
    SCHEDULE = [];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", carried_over: true };
    ITEMS = [
      { id: "i1", section: "announcements", text: "First one", sort_order: 0 },
      { id: "i2", section: "announcements", text: "Second one", sort_order: 1 },
    ];
    const dom = await mountAgenda();
    expect(dom.container.querySelector('[data-announcement="i1"] [aria-label="Move up"]').disabled)
      .toBe(true);
    expect(dom.container.querySelector('[data-announcement="i2"] [aria-label="Move down"]').disabled)
      .toBe(true);
  });

  it("fills Conducting from the month, and says where it came from", async () => {
    SCHEDULE = [{ month: "2026-09", name: "Cameron Pearson" }];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", conducting: null };
    const dom = await mountAgenda();

    expect(dom.container.textContent).toContain("Cameron Pearson");
    expect(dom.container.textContent).toContain("From the September 2026 schedule");
  });

  it("lets one Sunday differ, and says that too", async () => {
    SCHEDULE = [{ month: "2026-09", name: "Cameron Pearson" }];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", conducting: "Karl Ricks" };
    const dom = await mountAgenda();

    expect(dom.container.textContent).toContain("Karl Ricks");
    expect(dom.container.textContent).toContain("Just this Sunday");
    expect(dom.container.textContent).not.toContain("From the September 2026 schedule");
  });

  it("leaves the box alone when no schedule has been set", async () => {
    // The whole feature has to be invisible to a ward that never opens it.
    SCHEDULE = [];
    AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", conducting: null };
    const dom = await mountAgenda();
    expect(dom.container.textContent).not.toContain("From the");
    expect(dom.container.textContent).not.toContain("Just this Sunday");
  });
});
