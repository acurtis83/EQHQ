import { render, act, cleanup, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The teaching schedule as a member sees it.
 *
 * Mounted signed OUT, which is the whole point of the feature: a teacher with
 * no account has to be able to find this. Every other test in this file's
 * neighbourhood mocks a presidency session, and a screen that only works when
 * signed in would pass all of them.
 */

let TABLES = {};
let ASKED = [];

function query(table) {
  ASKED.push(table);
  const rows = TABLES[table];
  if (rows === undefined) {
    // Mirrors a database that hasn't run teaching-public.sql.
    const err = { message: `relation "${table}" does not exist` };
    const chain = () => new Proxy(Promise.resolve({ data: null, error: err }), {
      get(t, k) {
        if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
        return () => chain();
      },
    });
    return chain();
  }
  const chain = (r) => new Proxy(Promise.resolve({ data: r, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "maybeSingle" || k === "single") return () => Promise.resolve({ data: r[0] || null, error: null });
      return () => chain(r);
    },
  });
  return chain(rows);
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
// Signed out. No account, no presidency row — a teacher on their phone.
vi.mock("../src/lib/useAuth", () => ({
  useAuth: () => ({ presidency: null, isPresidency: false, ready: true, signOut() {} }),
}));

const NOW = new Date(2026, 8, 13, 12, 0, 0);   // Sunday 13 September 2026

beforeEach(() => {
  ASKED = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  TABLES = {
    teaching_public: [
      { date: "2026-09-13", teacher_name: "Cameron Butler", topic: "Ministering",
        talk_title: null, speaker: null, talk_link: null, no_lesson_reason: null },
      { date: "2026-09-20", teacher_name: "Nick Crump", topic: null,
        talk_title: "Come Home", speaker: "Clark G. Gilbert",
        talk_link: "https://example.org/talk", no_lesson_reason: null },
    ],
    calendar_exceptions_public: [{ date: "2026-11-15", kind: "Stake Conference" }],
  };
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

async function open() {
  const { default: TeachingSchedule } = await import("../src/member/TeachingSchedule");
  let dom;
  await act(async () => {
    dom = render(<TeachingSchedule onClose={() => {}} />);
    await new Promise((r) => setTimeout(r, 60));
  });
  return dom;
}

describe("a teacher with no account", () => {
  it("can see who's teaching", async () => {
    const dom = await open();
    expect(dom.container.textContent).toContain("Cameron Butler");
    expect(dom.container.textContent).toContain("Nick Crump");
  });

  it("sees the talk and can open it", async () => {
    const dom = await open();
    expect(dom.container.textContent).toContain("Come Home");
    const link = [...dom.container.querySelectorAll("a")]
      .find((a) => a.href.includes("example.org"));
    expect(link).toBeTruthy();
    expect(link.target).toBe("_blank");
  });

  it("reads the views, never the tables", async () => {
    await open();
    // The tables hold a private notes column. If this screen ever reaches for
    // them directly, RLS blocks it and the schedule silently empties — or
    // worse, somebody "fixes" that by opening the table up.
    expect(ASKED).toContain("teaching_public");
    expect(ASKED).not.toContain("teaching_assignments");
    expect(ASKED).not.toContain("calendar_exceptions");
  });

  it("sees six months of Sundays", async () => {
    const dom = await open();
    const rows = dom.container.querySelectorAll("[data-sunday]");
    // Weekly from September, minus nothing — roughly 26 Sundays.
    expect(rows.length).toBeGreaterThan(20);
    const dates = [...rows].map((r) => r.dataset.sunday);
    expect(dates[0]).toBe("2026-09-13");
    expect(dates[dates.length - 1] <= "2027-03-13").toBe(true);
  });

  it("and conference shows as conference, not as a gap", async () => {
    const dom = await open();
    expect(dom.container.textContent).toContain("General Conference");
    // The row is there rather than missing — a hole in the list reads as an
    // oversight rather than as the calendar.
    const conf = dom.container.querySelector('[data-sunday="2026-10-04"]');
    expect(conf).toBeTruthy();
    expect(conf.textContent).toContain("General Conference");
  });

  it("and a recorded stake conference does too", async () => {
    const dom = await open();
    const sc = dom.container.querySelector('[data-sunday="2026-11-15"]');
    expect(sc.textContent).toContain("Stake Conference");
  });

  it("is told which Sundays aren't assigned yet", async () => {
    const dom = await open();
    expect(dom.container.textContent).toContain("Not assigned yet");
    expect(dom.container.textContent).toMatch(/haven't been\s+assigned yet/);
  });

  it("and has nothing to edit", async () => {
    const dom = await open();
    // Read-only: the only interactive things are the close button and the
    // talk links. No inputs, no selects, no save.
    expect(dom.container.querySelectorAll("input").length).toBe(0);
    expect(dom.container.querySelectorAll("select").length).toBe(0);
    expect(dom.container.querySelectorAll("textarea").length).toBe(0);
    expect(dom.container.textContent).not.toMatch(/\bSave\b/);
  });
});

describe("before the migration has run", () => {
  it("says which file to run rather than showing an empty schedule", async () => {
    delete TABLES.teaching_public;
    const dom = await open();
    expect(dom.container.textContent).toContain("teaching-public.sql");
    expect(dom.container.textContent).not.toContain("No quorum Sundays");
  });
});

describe("finding it", () => {
  it("opens from the lesson banner, signed out", async () => {
    TABLES.teaching_assignments = [];
    TABLES.calendar_exceptions = [];
    const { default: ThisWeeksLesson } = await import("../src/member/ThisWeeksLesson");
    let dom;
    await act(async () => {
      dom = render(<ThisWeeksLesson />);
      await new Promise((r) => setTimeout(r, 60));
    });
    const opener = screen.getByText(/upcoming lessons/i);
    expect(opener).toBeTruthy();
    await act(async () => {
      fireEvent.click(opener);
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(dom.container.textContent).toContain("Teaching Schedule");
  });
});
