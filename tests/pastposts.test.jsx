import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * Hiding what's behind us, on the feed itself.
 *
 * The rule is checked by arithmetic — see tests/pastposts.mjs. What has to be
 * mounted is that hiding is only hiding: nothing is deleted, the toggle brings
 * everything back, and the numbers on screen agree with the cards on screen.
 */

let POSTS = [];

function query(table) {
  const rows = table === "posts" ? POSTS : [];
  const result = Promise.resolve({ data: rows, error: null });
  const proxy = new Proxy(result, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
      if (prop === "single") return () => Promise.resolve({ data: { id: "x" }, error: null });
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (t) => query(t),
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
  useAuth: () => ({ presidency: null, isPresidency: false, ready: true, signOut() {} }),
}));

// Sunday 6 September 2026, midday.
const NOW = new Date(2026, 8, 6, 12, 0, 0);
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const CURRENT = [
  { id: "up", category: "activity", title: "Temple Trip", event_date: "2026-09-12", created_at: daysAgo(1) },
  { id: "today", category: "activity", title: "Basketball Tonight", event_date: "2026-09-06", created_at: daysAgo(2) },
  { id: "fresh", category: "announcement", title: "Ministering Reminder", created_at: daysAgo(3) },
];
const BEHIND = [
  { id: "gone", category: "activity", title: "Quorum BBQ", event_date: "2026-08-30", created_at: daysAgo(12) },
  { id: "stale", category: "announcement", title: "Old Move-In Notice", created_at: daysAgo(60) },
];

async function mount() {
  vi.setSystemTime(NOW);
  const { default: Feed } = await import("../src/member/Feed");
  let dom;
  await act(async () => {
    dom = render(<Feed />);
    await new Promise((r) => setTimeout(r, 40));
  });
  return dom;
}

const cards = () => [...document.querySelectorAll("[id^='post-']")].map((el) => el.id);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  POSTS = [...CURRENT, ...BEHIND];
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("what the feed shows by default", () => {
  it("leaves out what's behind us", async () => {
    await mount();
    expect(cards().sort()).toEqual(["post-fresh", "post-today", "post-up"]);
  });

  it("keeps today's activity — people check on the way there", async () => {
    await mount();
    // By card id, not by text: the Upcoming strip also names it, so a text
    // query passes even when the card itself is missing.
    expect(document.getElementById("post-today")).toBeTruthy();
  });

  it("says how many are behind the button", async () => {
    await mount();
    expect(screen.getByText("Show 2 earlier")).toBeTruthy();
  });

  it("says nothing when there's nothing behind", async () => {
    POSTS = [...CURRENT];
    await mount();
    expect(screen.queryByText(/Show \d+ earlier/)).toBeNull();
  });
});

describe("the toggle", () => {
  it("brings everything back", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("Show 2 earlier")); });

    expect(cards().sort())
      .toEqual(["post-fresh", "post-gone", "post-stale", "post-today", "post-up"]);
    expect(screen.getByText("Quorum BBQ")).toBeTruthy();
    expect(screen.getByText("Old Move-In Notice")).toBeTruthy();
  });

  it("puts them away again", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("Show 2 earlier")); });
    await act(async () => { fireEvent.click(screen.getByText("Hide earlier")); });
    expect(cards()).toHaveLength(3);
  });

  it("keeps the past underneath, not mixed in", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("Show 2 earlier")); });
    const order = cards();
    expect(order.indexOf("post-gone")).toBeGreaterThan(order.indexOf("post-up"));
    expect(order.indexOf("post-stale")).toBeGreaterThan(order.indexOf("post-up"));
  });

  it("doesn't remember itself between visits", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("Show 2 earlier")); });
    expect(cards()).toHaveLength(5);
    cleanup();

    await mount();
    expect(cards(), "the past was still showing on a fresh visit").toHaveLength(3);
  });
});

describe("a link straight to a post", () => {
  async function mountFocused(postId) {
    vi.setSystemTime(NOW);
    const { default: Feed } = await import("../src/member/Feed");
    await act(async () => {
      render(<Feed focus={{ postId }} onFocusHandled={() => {}} />);
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  it("opens the past for itself when the post has gone by", async () => {
    // The weekly email links to a post by id. Weeks later that post is behind
    // us, and scrolling to a card that isn't rendered lands nowhere — which
    // reads as a broken link rather than as an old one.
    await mountFocused("gone");
    expect(document.getElementById("post-gone"), "the linked post wasn't rendered").toBeTruthy();
    expect(screen.getByText("Hide earlier")).toBeTruthy();
  });

  it("leaves the past alone for a link to something current", async () => {
    await mountFocused("up");
    expect(document.getElementById("post-up")).toBeTruthy();
    expect(document.getElementById("post-gone")).toBeNull();
    expect(screen.getByText("Show 2 earlier")).toBeTruthy();
  });
});

describe("pinning", () => {
  it("keeps an old post up", async () => {
    POSTS = [...CURRENT, { ...BEHIND[0], pinned: true }];
    await mount();
    expect(screen.getByText("Quorum BBQ")).toBeTruthy();
    expect(screen.queryByText(/Show \d+ earlier/)).toBeNull();
  });
});

describe("the numbers agree with the cards", () => {
  it("the tiles count only what's showing", async () => {
    await mount();
    // The tile's accessible name carries the count, which is a firmer thing to
    // assert than its text — "Activities" also appears as a chip on every
    // activity card.
    expect(screen.getByLabelText(/^Activities: /).getAttribute("aria-label"))
      .toBe("Activities: 2");

    await act(async () => { fireEvent.click(screen.getByText("Show 2 earlier")); });
    expect(screen.getByLabelText(/^Activities: /).getAttribute("aria-label"))
      .toBe("Activities: 3");
  });

  it("the count follows the category filter", async () => {
    await mount();
    // Announcements: one current, one stale.
    await act(async () => { fireEvent.click(screen.getByLabelText(/^Announcements: /)); });
    expect(screen.getByText("Show 1 earlier")).toBeTruthy();
  });
});

describe("a category with nothing current", () => {
  it("says so rather than looking broken", async () => {
    POSTS = [
      { id: "up", category: "activity", title: "Temple Trip", event_date: "2026-09-12", created_at: daysAgo(1) },
      { id: "stale", category: "announcement", title: "Old Notice", created_at: daysAgo(60) },
    ];
    await mount();
    await act(async () => { fireEvent.click(screen.getByLabelText(/^Announcements: /)); });

    expect(screen.getByText("Nothing Current")).toBeTruthy();
    expect(document.body.textContent).toContain("1 earlier post is behind the button");
    // And the way out is on screen.
    expect(screen.getByText("Show 1 earlier")).toBeTruthy();
  });
});
