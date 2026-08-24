import { render, screen, within, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The grouped-by-category view, on both screens.
 *
 * The screens test mounts everything against an empty database, which is the
 * right check for "does it render at all" but useless here: with no items
 * there are no groups, so the entire grouped branch is skipped and a broken
 * hub would sail through. These mount with items in them.
 */

const AGENDA_ITEMS = [
  { id: "a1", agenda_id: "ag1", section: "items", text: "Sep 6th Teaching Changes", category: "sunday", sort_order: 0, done: false },
  { id: "a2", agenda_id: "ag1", section: "items", text: "Ward Temple Night", category: "temple", sort_order: 1, done: false },
  { id: "a3", agenda_id: "ag1", section: "items", text: "Elders Quorum Service Project", category: "service", sort_order: 2, done: true },
  { id: "a4", agenda_id: "ag1", section: "items", text: "Baptism on the 12th", category: "temple", sort_order: 3, done: false },
  // No category at all — falls back to the section it was typed into.
  { id: "a5", agenda_id: "ag1", section: "ministering", text: "Bro. Bagley", sort_order: 4, done: false },
];

const RUNNING_ITEMS = [
  { id: "r1", bucket: "topics", text: "Quorum BBQ", category: "activities", sort_order: 0, done: false },
  { id: "r2", bucket: "actions", text: "Call the Stones", category: "moves", sort_order: 1, done: false },
  { id: "r3", bucket: "watch", text: "Bro. Wyatt", sort_order: 2, done: false },
];

let TABLES = {};

function query(table) {
  const result = Promise.resolve({ data: TABLES[table] || [], error: null });
  const proxy = new Proxy(result, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return target[prop].bind(target);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
      if (prop === "single") return () => Promise.resolve({ data: { id: "stub-row" }, error: null });
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
  useAuth: () => ({ presidency: { name: "Test" }, isPresidency: true, ready: true, signOut() {} }),
}));

async function mount(ui) {
  let out;
  await act(async () => {
    out = render(ui);
    await new Promise((r) => setTimeout(r, 0));
  });
  return out;
}

/** Flip to grouped and let the re-render settle. */
async function goGrouped() {
  await act(async () => {
    fireEvent.click(screen.getByText("By Category"));
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  TABLES = { agenda_items: AGENDA_ITEMS, running_items: RUNNING_ITEMS };
  const { resetViewMode } = await import("../src/lib/useViewMode");
  resetViewMode();
});
afterEach(cleanup);

async function mountAgenda() {
  const { AgendaDetail } = await import("../src/presidency/PresidencyAgenda");
  return mount(
    <AgendaDetail
      agenda={{ id: "ag1", meeting_date: "2026-08-26" }}
      items={AGENDA_ITEMS}
      agendas={[]}
      members={[]}
      events={[]}
      onBack={() => {}}
      onReloadItems={() => {}}
      onPatchAgenda={() => {}}
      onDelete={() => {}}
      flash={() => {}}
    />
  );
}

describe("the agenda, grouped by category", () => {
  it("starts in the chronological view", async () => {
    await mountAgenda();
    expect(screen.getByText("Agenda Items")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add to Sunday" })).toBeNull();
  });

  it("gathers items into a hub per category", async () => {
    await mountAgenda();
    await goGrouped();

    for (const label of ["Sunday", "Temple & Family History", "Service"]) {
      expect(screen.getByText(label), `no hub for ${label}`).toBeTruthy();
    }
  });

  it("counts what's still open in each hub, not what's in it", async () => {
    await mountAgenda();
    await goGrouped();

    // Two temple items, both open.
    const temple = screen.getByText("Temple & Family History").closest("button");
    expect(within(temple).getByText("2 open")).toBeTruthy();

    // The one service item is done, so the hub shows no open count.
    const service = screen.getByText("Service").closest("button");
    expect(within(service).queryByText(/open/)).toBeNull();
  });

  it("keeps every item — nothing is dropped by regrouping", async () => {
    await mountAgenda();
    await goGrouped();

    for (const it of AGENDA_ITEMS) {
      expect(screen.getByText(it.text), `${it.text} vanished`).toBeTruthy();
    }
  });

  it("files an uncategorised item under the section it was typed into", async () => {
    await mountAgenda();
    await goGrouped();

    expect(screen.getByText("Ministering Checks").closest("button")).toBeTruthy();
    expect(screen.getByText("Bro. Bagley")).toBeTruthy();
  });

  it("keeps Ministering, Ministering Checks and Brothers in Need apart", async () => {
    // The category now called "Brothers in Need" was briefly called
    // "Ministering Checks", which is also the name of a section — so the two
    // merged into one hub and a brother in real need sat in the same pile as a
    // routine check. Three different things, three different places.
    const { AGENDA_CATEGORIES } = await import("../src/lib/domain/agendaCategories");
    const labels = AGENDA_CATEGORIES.map((c) => c.label);
    expect(labels).toContain("Ministering");
    expect(labels).toContain("Brothers in Need");
    expect(labels).not.toContain("Ministering Checks");

    // The key didn't move with the label, or every item already tagged with it
    // would have been orphaned.
    expect(AGENDA_CATEGORIES.find((c) => c.key === "need").label).toBe("Brothers in Need");
  });

  it("folds a hub away and back", async () => {
    await mountAgenda();
    await goGrouped();

    expect(screen.getByText("Sep 6th Teaching Changes")).toBeTruthy();
    fireEvent.click(screen.getByText("Sunday").closest("button"));
    expect(screen.queryByText("Sep 6th Teaching Changes")).toBeNull();

    fireEvent.click(screen.getByText("Sunday").closest("button"));
    expect(screen.getByText("Sep 6th Teaching Changes")).toBeTruthy();
  });

  it("opens an add form on the hub without asking for the category again", async () => {
    await mountAgenda();
    await goGrouped();

    fireEvent.click(screen.getByRole("button", { name: /Add to Sunday/ }));
    expect(screen.getByPlaceholderText("What needs discussing?")).toBeTruthy();

    // The category picker's "No category" option is the tell: if it's on
    // screen, the form is asking for something the hub already answered.
    expect(screen.queryByText("No category")).toBeNull();
  });

  it("still asks for a category when adding outside any hub", async () => {
    // The counterpart — the button for a category that has no hub yet, where
    // nothing has been decided and the picker has to be there.
    await mountAgenda();
    await goGrouped();

    fireEvent.click(screen.getByRole("button", { name: /Add To Another Category/ }));
    expect(screen.getByText("No category")).toBeTruthy();
  });

  it("lists the hubs in the presidency's category order", async () => {
    // The page has to read the same way every week. Grouping that came out in
    // whatever order the items happened to be added would make the agenda a
    // different shape each time, which is most of the value of grouping gone.
    await mountAgenda();
    await goGrouped();

    const headings = [...document.querySelectorAll("[aria-expanded]")]
      .map((b) => b.textContent);
    const at = (label) => headings.findIndex((h) => h.startsWith(label));

    expect(at("Sunday")).toBeGreaterThanOrEqual(0);
    expect(at("Sunday")).toBeLessThan(at("Temple & Family History"));
    expect(at("Temple & Family History")).toBeLessThan(at("Service"));
    // The section fallback sorts after every real category.
    expect(at("Service")).toBeLessThan(at("Ministering Checks"));
  });
});

describe("the planner, grouped by category", () => {
  it("gathers items into hubs and keeps them all", async () => {
    const { default: RunningList } = await import("../src/presidency/RunningList");
    await mount(<RunningList onCountChange={() => {}} />);
    await goGrouped();

    expect(screen.getByText("Activities/Events")).toBeTruthy();
    expect(screen.getByText("Move In/Out")).toBeTruthy();
    for (const it of RUNNING_ITEMS) {
      expect(screen.getByText(it.text), `${it.text} vanished`).toBeTruthy();
    }
  });

  it("shares the setting with the agenda", async () => {
    // One meeting, one arrangement. Flipping it on the planner must already be
    // true on the agenda rather than waiting for a reload.
    const { default: RunningList } = await import("../src/presidency/RunningList");
    await mount(<RunningList onCountChange={() => {}} />);
    await goGrouped();
    cleanup();

    await mountAgenda();
    expect(screen.getByText("Temple & Family History")).toBeTruthy();
  });
});

describe("setting the order a meeting runs in", () => {
  it("moves a category up the meeting", async () => {
    // The order a meeting runs in is decided on the day — a move-in that needs
    // settling goes first, whatever the standing list looks like.
    const patched = [];
    const { AgendaDetail } = await import("../src/presidency/PresidencyAgenda");
    await mount(
      <AgendaDetail
        agenda={{ id: "ag1", meeting_date: "2026-08-26" }}
        items={AGENDA_ITEMS} agendas={[]} members={[]} events={[]}
        onBack={() => {}} onReloadItems={() => {}} onDelete={() => {}} flash={() => {}}
        onPatchAgenda={(f) => patched.push(f)}
      />
    );
    await goGrouped();

    fireEvent.click(screen.getByRole("button", { name: "Move Service up" }));

    // The whole visible order is written, not just the pair that swapped.
    const order = patched.at(-1).category_order;
    expect(order.indexOf("service")).toBeLessThan(order.indexOf("temple"));
    expect(order.length).toBeGreaterThan(2);
  });

  it("honours a saved order", async () => {
    const { AgendaDetail } = await import("../src/presidency/PresidencyAgenda");
    await mount(
      <AgendaDetail
        agenda={{ id: "ag1", meeting_date: "2026-08-26", category_order: ["service", "sunday"] }}
        items={AGENDA_ITEMS} agendas={[]} members={[]} events={[]}
        onBack={() => {}} onReloadItems={() => {}} onPatchAgenda={() => {}}
        onDelete={() => {}} flash={() => {}}
      />
    );
    await goGrouped();

    const headings = [...document.querySelectorAll("[aria-expanded]")].map((b) => b.textContent);
    const at = (label) => headings.findIndex((h) => h.startsWith(label));
    expect(at("Service")).toBeLessThan(at("Sunday"));
    // A category nobody moved keeps its default place rather than being
    // dumped at one end.
    expect(at("Sunday")).toBeLessThan(at("Temple & Family History"));
  });

  it("can't move the first one up or the last one down", async () => {
    await mountAgenda();
    await goGrouped();

    const headings = [...document.querySelectorAll("[aria-expanded]")].map((b) => b.textContent);
    const firstLabel = headings[0].replace(/\d+ (open|total)/g, "").trim();
    expect(screen.getByRole("button", { name: `Move ${firstLabel} up` }).disabled).toBe(true);
  });
});
