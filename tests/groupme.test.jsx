import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The GroupMe card and the setting behind it.
 *
 * The whole feature hinges on one value being absent most of the time: a ward
 * that hasn't set a link should see no card, no QR and no line in the email,
 * rather than an empty invitation to join nothing. That's the case worth
 * mounting, because "renders when configured" is the easy half.
 */

let SETTINGS = [];
let UPSERTS = [];

function thenable(data) {
  const result = Promise.resolve({ data, error: null });
  return new Proxy(result, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
      if (prop === "single") return () => Promise.resolve({ data: null, error: null });
      return () => new Proxy(result, this);
    },
  });
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (table) => ({
      select: () => thenable(table === "app_settings" ? SETTINGS : []),
      upsert: (row) => { UPSERTS.push(row); return thenable([]); },
      insert: () => thenable([]),
      update: () => thenable([]),
      delete: () => thenable([]),
    }),
    channel: () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} }; return ch; },
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const GM = "https://groupme.com/join_group/104857392/xYzAbC12";

async function mount(ui) {
  let dom;
  await act(async () => {
    dom = render(ui);
    await new Promise((r) => setTimeout(r, 0));
  });
  return dom;
}

beforeEach(async () => {
  SETTINGS = [];
  UPSERTS = [];
  const { resetSettings } = await import("../src/lib/useSettings");
  resetSettings();
});
afterEach(cleanup);

describe("the GroupMe card on the feed", () => {
  it("shows nothing at all when no link has been set", async () => {
    const { default: GroupMeCard } = await import("../src/member/GroupMeCard");
    const dom = await mount(<GroupMeCard />);
    expect(dom.container.textContent).toBe("");
  });

  it("shows a join link once one has", async () => {
    SETTINGS = [{ key: "groupme_url", value: GM }];
    const { default: GroupMeCard } = await import("../src/member/GroupMeCard");
    await mount(<GroupMeCard />);

    const join = screen.getByText("Join");
    expect(join.getAttribute("href")).toBe(GM);
  });

  it("keeps the QR behind a tap", async () => {
    // It's a standing invitation, not the point of the feed — it shouldn't
    // take a third of the screen every time somebody opens the app.
    SETTINGS = [{ key: "groupme_url", value: GM }];
    const { default: GroupMeCard } = await import("../src/member/GroupMeCard");
    await mount(<GroupMeCard />);

    expect(document.querySelector("svg[role='img']")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the QR code" }));
    expect(document.querySelector("svg[role='img']")).toBeTruthy();
  });

  it("makes the code itself open the group", async () => {
    SETTINGS = [{ key: "groupme_url", value: GM }];
    const { default: GroupMeCard } = await import("../src/member/GroupMeCard");
    await mount(<GroupMeCard />);
    fireEvent.click(screen.getByRole("button", { name: "Show the QR code" }));

    const link = document.querySelector("svg[role='img']").closest("a");
    expect(link, "the code isn't wrapped in a link").toBeTruthy();
    expect(link.getAttribute("href")).toBe(GM);
  });

  it("refuses a link that isn't a link", async () => {
    // The value is typed into a box by a person, and this one ends up in an
    // href that every member taps.
    SETTINGS = [{ key: "groupme_url", value: "javascript:alert(1)" }];
    const { default: GroupMeCard } = await import("../src/member/GroupMeCard");
    const dom = await mount(<GroupMeCard />);
    expect(dom.container.textContent).toBe("");
  });
});

describe("setting the link", () => {
  it("saves what was typed", async () => {
    const { default: QuorumSettings } = await import("../src/presidency/QuorumSettings");
    await mount(<QuorumSettings />);

    fireEvent.change(screen.getByPlaceholderText(/groupme\.com/), { target: { value: GM } });
    await act(async () => { fireEvent.click(screen.getByText("Save")); });

    expect(UPSERTS).toHaveLength(1);
    expect(UPSERTS[0]).toMatchObject({ key: "groupme_url", value: GM });
  });

  it("says so rather than silently storing a bad one", async () => {
    const { default: QuorumSettings } = await import("../src/presidency/QuorumSettings");
    await mount(<QuorumSettings />);

    fireEvent.change(screen.getByPlaceholderText(/groupme\.com/), { target: { value: "groupme" } });
    await act(async () => { fireEvent.click(screen.getByText("Save")); });

    expect(UPSERTS).toHaveLength(0);
    expect(screen.getByText(/doesn't look like a link/)).toBeTruthy();
  });

  it("shows the code once there's a valid link to encode", async () => {
    const { default: QuorumSettings } = await import("../src/presidency/QuorumSettings");
    await mount(<QuorumSettings />);
    expect(document.querySelector("svg[role='img']")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/groupme\.com/), { target: { value: GM } });
    expect(document.querySelector("svg[role='img']")).toBeTruthy();
  });

  it("fills the box from what's already saved", async () => {
    // The settings arrive after the first render. A box that stays empty over
    // a link that's already set means the next Save wipes it.
    SETTINGS = [{ key: "groupme_url", value: GM }];
    const { default: QuorumSettings } = await import("../src/presidency/QuorumSettings");
    await mount(<QuorumSettings />);

    expect(screen.getByDisplayValue(GM)).toBeTruthy();
    expect(screen.getByText("Save").closest("button").disabled).toBe(true);
  });
});
