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
let WRITES = [];

function table(name) {
  const rows =
    name === "conducting_schedule" ? SCHEDULE :
    name === "presidency_members" ? PRESIDENCY :
    name === "members" ? [{ id: "m1", name: "Ryan Talbot", active: true }] : [];

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
