import { render, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The lesson card on Presidency Home.
 *
 * "on the Presidency side HOME button...lets split the teacher and who the
 *  talk is by like we did on the feed"
 *
 * The same two names either side of a dot, and the same confusion: one is the
 * brother teaching on Sunday, the other gave the conference talk and is never
 * in the room.
 */

let TEACHING = [];
let EVENTS = [];
let EVENT_DATES = [];
let POSTS = [];

function query(name) {
  const rows = name === "teaching_assignments" ? TEACHING
    : name === "events" ? EVENTS
    : name === "event_dates" ? EVENT_DATES
    : name === "posts" ? POSTS
    : [];
  const chain = () => new Proxy(Promise.resolve({ data: rows, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "maybeSingle") return () => Promise.resolve({ data: rows[0] || null, error: null });
      if (k === "single") return () => Promise.resolve({ data: rows[0] || { id: "x" }, error: null });
      return () => chain();
    },
  });
  return chain();
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (t) => query(t),
    channel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe() {} }; return c; },
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

// Tuesday 8 September 2026, so the next quorum Sunday is the 13th.
const NOW = new Date(2026, 8, 8, 9, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  TEACHING = [];
  EVENT_DATES = [];
  POSTS = [];
  EVENTS = [
    // Runs every Thursday since August. Its stored event_date is the FIRST
    // one it ever had, which is the whole problem: the screen filtered on
    // that column and the series disappeared the moment August passed.
    { id: "bball", kind: "activity", title: "Basketball",
      event_date: "2026-08-20", repeat_rule: "weekly" },
    { id: "bbq", kind: "activity", title: "2026 Fall EQ BBQ", event_date: "2026-09-23" },
    { id: "padel", kind: "activity", title: "Conquer Padel Night", event_date: "2026-11-06" },
    // Genuinely over, and should stay out.
    { id: "old", kind: "activity", title: "August Social", event_date: "2026-08-01" },
    // Sits between today and basketball's next Thursday. Sorting on the
    // STORED date puts basketball (August) first; sorting on when each thing
    // next happens puts this first. Without a row like this the two orders
    // are identical and the sort is untested.
    { id: "tnight", kind: "temple", title: "Ward Temple Night", event_date: "2026-09-09" },
  ];
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

async function mount() {
  const { default: HomeHub } = await import("../src/presidency/HomeHub");
  let dom;
  await act(async () => {
    dom = render(<HomeHub onGo={() => {}} />);
    await new Promise((r) => setTimeout(r, 40));
  });
  return dom;
}

describe("the lesson card on Home", () => {
  it("says which name is the teacher and which gave the talk", async () => {
    TEACHING = [{
      date: "2026-09-13", teacher_name: "Cameron Butler",
      talk_title: "Choose Jesus Christ as Your Guide", speaker: "Edward B. Rowe",
    }];
    const dom = await mount();

    const talk = dom.container.querySelector('[data-credit="Talk by"]');
    const taught = dom.container.querySelector('[data-credit="Taught by"]');
    expect(talk, "no speaker line on the Home card").toBeTruthy();
    expect(talk.textContent).toContain("Edward B. Rowe");
    expect(talk.textContent).not.toContain("Cameron Butler");
    expect(taught.textContent).toContain("Cameron Butler");
    expect(taught.textContent).not.toContain("Edward B. Rowe");

    // The old shape, gone.
    expect(dom.container.textContent).not.toContain("Cameron Butler · Edward B. Rowe");
  });

  it("names only the teacher when the lesson is a topic", async () => {
    TEACHING = [{ date: "2026-09-13", teacher_name: "Cameron Butler", topic: "Ministering" }];
    const dom = await mount();
    expect(dom.container.querySelector('[data-credit="Taught by"]').textContent)
      .toContain("Cameron Butler");
    expect(dom.container.querySelector('[data-credit="Talk by"]'),
      "an empty Talk by line on a topic lesson").toBeNull();
  });

  it("and still says when nobody is assigned", async () => {
    TEACHING = [];
    const dom = await mount();
    expect(dom.container.textContent).toContain("No Teacher Assigned");
  });
});

/**
 * "Activities is off too i think it should show 3"
 *
 * Basketball, the BBQ and padel night. The count said 2 because the events
 * query filtered on event_date >= today, and a repeating event keeps the date
 * of its first occurrence for ever.
 */
describe("the counts on Home", () => {
  const count = (dom, label) =>
    dom.container.querySelector(`[data-count-tile="${label}"]`)?.dataset.count;

  it("counts a repeating activity that's still running", async () => {
    const dom = await mount();
    expect(count(dom, "Activities"), "basketball fell out of the count").toBe("3");
  });

  it("and lists it under Upcoming Events, at its next date", async () => {
    const dom = await mount();
    const text = dom.container.textContent;
    expect(text, "the weekly activity is missing from Upcoming").toContain("Basketball");
    // Next Thursday, not the August one it started on.
    expect(text).not.toContain("Aug 20");
  });

  it("soonest first, by when it next happens", async () => {
    const dom = await mount();
    const text = dom.container.textContent;
    // Basketball's stored date (20 Aug) is the oldest of the lot, but it
    // doesn't happen again until Thursday the 10th — after the temple night
    // on the 9th. By stored date it would come first; by when it next
    // happens it comes second.
    expect(text.indexOf("Ward Temple Night")).toBeLessThan(text.indexOf("Basketball"));
    expect(text.indexOf("Basketball")).toBeLessThan(text.indexOf("2026 Fall EQ BBQ"));
  });

  it("but leaves out one that's genuinely over", async () => {
    const dom = await mount();
    expect(dom.container.textContent).not.toContain("August Social");
  });

  it("drops a series once its explicit dates are used up", async () => {
    // The stored date is deliberately in the FUTURE while every real date is
    // past. That's what makes this test able to fail: with a past stored date
    // the row drops out anyway and the rule under test never runs.
    EVENTS = [{ id: "clean", kind: "assignment", title: "Temple Cleaning", event_date: "2026-12-01" }];
    EVENT_DATES = [
      { id: "d1", event_id: "clean", event_date: "2026-08-01" },
      { id: "d2", event_id: "clean", event_date: "2026-08-15" },
    ];
    const dom = await mount();
    // Falling back to the row's own date here would resurrect it.
    expect(dom.container.textContent).not.toContain("Temple Cleaning");
  });

  it("and the feed-notice tile says what it counts", async () => {
    // It counts announcement POSTS on the members' feed, not the
    // announcements read out at the meeting — which is why it read 0 while
    // the Sunday agenda had two.
    const dom = await mount();
    expect(dom.container.textContent).toContain("Feed Notices");
  });
});
