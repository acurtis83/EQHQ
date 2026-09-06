import { render, act, cleanup, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The Feed as the presidency sees it — the + button and the composer.
 *
 * This file exists because none of it was tested. Every other feed test mocks
 * useAuth as a signed-out member, and a member never sees the + button, so the
 * composer was never rendered by anything. It had been crashing on open since
 * the tiles were removed — CATEGORIES went out of the import line while the
 * category dropdown still used it — and the whole suite stayed green through
 * it, because a component nothing mounts can't fail.
 *
 * The lesson isn't "add a test for CATEGORIES". It's that the presidency half
 * of this screen needs mounting at all, so the rest of it is exercised here
 * too: publishing, the event fields, pinning, closing.
 */

let POSTS = [];
let WRITES = [];

function query(table) {
  const rows = table === "posts" ? POSTS : [];
  const chain = (r) => new Proxy(Promise.resolve({ data: r, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "maybeSingle" || k === "single") return () => Promise.resolve({ data: null, error: null });
      if (k === "insert") return (v) => { WRITES.push({ table, op: "insert", v }); return chain([v]); };
      if (k === "update") return (v) => { WRITES.push({ table, op: "update", v }); return chain(r); };
      if (k === "delete") return () => { WRITES.push({ table, op: "delete" }); return chain(r); };
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
    storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: {} }) }) },
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

// The one line that makes this file different from every other feed test.
vi.mock("../src/lib/useAuth", () => ({
  useAuth: () => ({
    presidency: { name: "Drew Curtis" }, isPresidency: true, ready: true, signOut() {},
  }),
}));

const NOW = new Date(2026, 8, 9, 12, 0, 0);

beforeEach(() => {
  POSTS = []; WRITES = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

async function mount() {
  const { default: Feed } = await import("../src/member/Feed");
  let dom;
  await act(async () => { dom = render(<Feed />); await new Promise((r) => setTimeout(r, 60)); });
  return dom;
}

async function openComposer() {
  const dom = await mount();
  await act(async () => {
    fireEvent.click(screen.getByLabelText("New Post"));
    await new Promise((r) => setTimeout(r, 20));
  });
  return dom;
}

describe("the + button", () => {
  it("is there for the presidency", async () => {
    await mount();
    expect(screen.getByLabelText("New Post")).toBeTruthy();
  });

  it("opens the composer without crashing", async () => {
    // The regression this file was written for. A thrown ReferenceError in a
    // child leaves React rendering nothing at all — the white screen.
    const dom = await openComposer();
    expect(dom.container.textContent).toContain("Category");
    expect(dom.container.textContent).toContain("Title");
  });

  it("offers every category, by name", async () => {
    await openComposer();
    const { CATEGORIES } = await import("../src/member/categories");
    const select = screen.getByText("Category").closest("label, div")
      .querySelector("select") || document.querySelector("select");
    const options = [...select.options].map((o) => o.value);
    // Compared against the real list rather than a hardcoded four: the whole
    // bug was the composer losing its grip on that list.
    for (const c of CATEGORIES) expect(options).toContain(c.key);
    expect(options.length).toBe(CATEGORIES.length);
  });
});

describe("publishing", () => {
  it("writes a post with what was typed", async () => {
    await openComposer();
    const [title] = screen.getAllByPlaceholderText("Quorum BBQ");
    fireEvent.change(title, { target: { value: "Ward Temple Night" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Post to feed"));
      await new Promise((r) => setTimeout(r, 20));
    });
    const w = WRITES.find((x) => x.table === "posts" && x.op === "insert");
    expect(w).toBeTruthy();
    expect(w.v.title).toBe("Ward Temple Night");
    expect(w.v.category).toBe("announcement");
  });

  it("won't publish an untitled post", async () => {
    await openComposer();
    await act(async () => {
      fireEvent.click(screen.getByText("Post to feed"));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(WRITES.some((x) => x.table === "posts" && x.op === "insert")).toBe(false);
  });

  it("shows the date and time fields once it's an event", async () => {
    const dom = await openComposer();
    // An announcement has no date fields; picking an activity reveals them.
    expect(dom.container.querySelector('input[type="date"]')).toBeNull();
    await act(async () => {
      fireEvent.change(document.querySelector("select"), { target: { value: "activity" } });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(dom.container.querySelector('input[type="date"]')).toBeTruthy();
    expect(dom.container.querySelector('input[placeholder="6:00 PM"]')).toBeTruthy();
  });

  it("the post button is disabled until there's a title", async () => {
    await openComposer();
    const post = screen.getByText("Post to feed").closest("button");
    expect(post.disabled).toBe(true);
    const [title] = screen.getAllByPlaceholderText("Quorum BBQ");
    fireEvent.change(title, { target: { value: "Something" } });
    expect(screen.getByText("Post to feed").closest("button").disabled).toBe(false);
  });

  it("carries the pin through", async () => {
    await openComposer();
    fireEvent.change(screen.getAllByPlaceholderText("Quorum BBQ")[0],
      { target: { value: "Pinned notice" } });
    fireEvent.click(screen.getByLabelText("Pin to top of feed", { selector: "input" })
      || document.querySelectorAll('input[type="checkbox"]')[0]);
    await act(async () => {
      fireEvent.click(screen.getByText("Post to feed"));
      await new Promise((r) => setTimeout(r, 20));
    });
    const w = WRITES.find((x) => x.table === "posts" && x.op === "insert");
    expect(w.v.pinned).toBe(true);
  });

  it("closes on a tap outside, writing nothing", async () => {
    const dom = await openComposer();
    expect(dom.container.textContent).toContain("Category");
    // The backdrop is the composer's outermost element and closes on click.
    const backdrop = [...dom.container.querySelectorAll("div")]
      .find((d) => d.style.position === "fixed" && d.style.zIndex === "60");
    await act(async () => {
      fireEvent.click(backdrop);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(dom.container.textContent).not.toContain("Pin to top of feed");
    expect(WRITES.some((x) => x.op === "insert")).toBe(false);
  });
});
