import { render, act, cleanup, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Categories, on screen.
 *
 * The arithmetic suite checks the rules. This checks the two things only a
 * mounted component can show:
 *
 *   * a category the ward added actually reaches the composer and Plan
 *   * retiring writes an update, never a delete, and old posts keep their
 *     colour afterwards
 */

let TABLES = {};
let WRITES = [];

function query(table) {
  const rows = TABLES[table] || [];
  const chain = (r) => new Proxy(Promise.resolve({ data: r, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "single" || k === "maybeSingle") return () => Promise.resolve({ data: r[0] || null, error: null });
      if (k === "insert") return (v) => { WRITES.push({ table, op: "insert", v }); return chain([v]); };
      if (k === "update") return (v) => { WRITES.push({ table, op: "update", v }); return chain(r); };
      if (k === "upsert") return (v) => { WRITES.push({ table, op: "upsert", v }); return chain([v]); };
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
vi.mock("../src/lib/useAuth", () => ({
  useAuth: () => ({ presidency: { name: "Drew Curtis" }, isPresidency: true, ready: true, signOut() {} }),
}));

// Announcements, Activities, a custom Service, and a retired one.
const CATS = [
  { key: "announcement", label: "Announcements", accent: "var(--primary-deep)", soft: "s", sort_order: 10, retired: false, plans: false, hint: null },
  { key: "activity", label: "Activities", accent: "var(--green)", soft: "s", sort_order: 20, retired: false, plans: true, hint: "BBQ" },
  { key: "service", label: "Service", accent: "var(--purple, #7a3fbf)", soft: "s", sort_order: 30, retired: false, plans: true, hint: "Yard clean-ups" },
  { key: "gone", label: "Old Thing", accent: "var(--gold)", soft: "s", sort_order: 40, retired: true, plans: true, hint: null },
];

beforeEach(async () => {
  WRITES = [];
  vi.resetModules();                     // the store caches at module scope
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0));
  TABLES = { post_categories: CATS, posts: [], comments: [], signup_slots: [],
    signup_claims: [], post_links: [], events: [], event_dates: [], members: [], forms: [] };
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

async function mount(path) {
  const { default: C } = await import(path);
  let dom;
  await act(async () => { dom = render(<C />); await new Promise((r) => setTimeout(r, 80)); });
  return dom;
}

describe("a category the ward added", () => {
  it("reaches the composer's dropdown", async () => {
    await mount("../src/member/Feed");
    await act(async () => {
      fireEvent.click(screen.getByLabelText("New Post"));
      await new Promise((r) => setTimeout(r, 20));
    });
    const options = [...document.querySelector("select").options].map((o) => o.value);
    expect(options).toContain("service");
  });

  it("but a retired one doesn't", async () => {
    await mount("../src/member/Feed");
    await act(async () => {
      fireEvent.click(screen.getByLabelText("New Post"));
      await new Promise((r) => setTimeout(r, 20));
    });
    const options = [...document.querySelector("select").options].map((o) => o.value);
    expect(options).not.toContain("gone");
  });

  it("gets its own section under Plan", async () => {
    // Mounted as Plan, not Planning. Planning has tabs of its own and they
    // were derived correctly — but they only render when it's mounted
    // WITHOUT a kind, and the app always passes one. Testing Planning
    // directly exercised a configuration nothing ships, so this passed while
    // there was no Service tab anywhere in the running app.
    const dom = await mount("../src/presidency/Plan");
    const tabs = [...dom.container.querySelectorAll("[data-plan]")]
      .map((b) => b.dataset.plan);
    expect(tabs).toContain("service");
    // Announcements have nothing to plan, and a retired one is gone.
    expect(tabs).not.toContain("announcement");
    expect(tabs).not.toContain("gone");
    // Teaching and Forms still live here.
    expect(tabs).toContain("teaching");
    expect(tabs).toContain("forms");
  });

  it("and opening that section shows the planner, not Forms", async () => {
    // The other half of the same bug: Plan decided what to render from a
    // hardcoded list of three kinds, so an unrecognised section fell through
    // to Forms. A Service tab that opened the forms screen would look like
    // the planner had simply lost the events.
    const dom = await mount("../src/presidency/Plan");
    const tab = [...dom.container.querySelectorAll("[data-plan]")]
      .find((b) => b.dataset.plan === "service");
    await act(async () => { fireEvent.click(tab); await new Promise((r) => setTimeout(r, 40)); });
    expect(dom.container.textContent).toContain("Yard clean-ups");   // the Service hint
    expect(dom.container.textContent).toContain("New");
  });
});

describe("a post filed under a retired category", () => {
  it("keeps its own label and colour", async () => {
    TABLES.posts = [{
      id: "p1", category: "gone", title: "Last year's thing",
      created_at: "2026-09-08T00:00:00Z",
    }];
    const dom = await mount("../src/member/Feed");
    // The promise retiring makes: history doesn't get restyled.
    expect(dom.container.textContent).toContain("Old Thing");
  });

  it("and a category that was deleted outright falls back neutrally", async () => {
    TABLES.posts = [{
      id: "p1", category: "vanished", title: "Orphan",
      created_at: "2026-09-08T00:00:00Z",
    }];
    const dom = await mount("../src/member/Feed");
    expect(dom.container.textContent).toContain("Orphan");
    // Not relabelled as Announcements, which is what falling back to the
    // first entry would have done.
    expect(dom.container.textContent).not.toContain("Announcements");
  });
});

describe("the settings screen", () => {
  it("lists them all, retired included", async () => {
    const dom = await mount("../src/presidency/CategorySettings");
    expect(dom.container.textContent).toContain("Service");
    expect(dom.container.textContent).toContain("Old Thing");
    expect(dom.container.textContent).toContain("retired");
  });

  it("refuses a duplicate name before you can add it", async () => {
    await mount("../src/presidency/CategorySettings");
    const box = screen.getByLabelText("New category name");
    fireEvent.change(box, { target: { value: "Service" } });
    expect(screen.getByText(/already a category with that name/)).toBeTruthy();
    const add = screen.getByText("Add").closest("button");
    expect(add.disabled).toBe(true);
  });

  it("adds one with a key made from its name", async () => {
    await mount("../src/presidency/CategorySettings");
    fireEvent.change(screen.getByLabelText("New category name"),
      { target: { value: "Service Projects" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Add"));
      await new Promise((r) => setTimeout(r, 30));
    });
    const w = WRITES.find((x) => x.table === "post_categories" && x.op === "upsert");
    expect(w.v.key).toBe("service_projects");
    expect(w.v.label).toBe("Service Projects");
    expect(w.v.plans).toBe(true);
  });

  it("retires with an update, never a delete", async () => {
    await mount("../src/presidency/CategorySettings");
    fireEvent.click(screen.getByLabelText("Edit Service"));
    await act(async () => {
      fireEvent.click(screen.getByText("Retire"));
      await new Promise((r) => setTimeout(r, 30));
    });
    const w = WRITES.find((x) => x.table === "post_categories" && x.op === "update");
    expect(w.v.retired).toBe(true);
    expect(WRITES.some((x) => x.op === "delete")).toBe(false);
  });

  it("says what retiring will and won't do, before you press it", async () => {
    TABLES.posts = [
      { id: "a", category: "service", created_at: "2026-01-01T00:00:00Z" },
      { id: "b", category: "service", created_at: "2026-01-01T00:00:00Z" },
    ];
    const dom = await mount("../src/presidency/CategorySettings");
    fireEvent.click(screen.getByLabelText("Edit Service"));
    // The count matters: "retire" reads like "delete", and it means something
    // different when there's history behind it.
    expect(dom.container.textContent).toMatch(/2 posts already filed under it keep this name/);
    expect(dom.container.textContent).toMatch(/nothing is deleted/i);
  });

  it("renaming leaves the key alone", async () => {
    await mount("../src/presidency/CategorySettings");
    fireEvent.click(screen.getByLabelText("Edit Service"));
    fireEvent.change(screen.getByLabelText("Name for service"),
      { target: { value: "Service Projects" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
      await new Promise((r) => setTimeout(r, 30));
    });
    const w = WRITES.find((x) => x.table === "post_categories" && x.op === "upsert");
    expect(w.v.label).toBe("Service Projects");
    // Every post points at this string. Rewriting it would orphan them all,
    // with no transaction and no way to tell which half succeeded.
    expect(w.v.key).toBe("service");
  });
});
