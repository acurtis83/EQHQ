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

function query(name) {
  const rows = name === "teaching_assignments" ? TEACHING : [];
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
