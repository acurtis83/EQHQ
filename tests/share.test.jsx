import { render, screen, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The two shareable links.
 *
 * ?f= opens a form on its own, for someone who has never opened the app.
 * ?p= opens the feed on one post, which is where an activity's "I\u2019m In"
 * button lives — an activity with an RSVP has no form to link to, so the
 * weekly email had nothing to point at and the button was invisible to
 * anyone reading the email. Which is most people.
 *
 * These mount the real App with a real query string, because the failure
 * mode is a link that opens the app and lands nowhere in particular.
 */

const POSTS = [
  { id: "p-basketball", category: "activity", title: "Basketball", rsvp: true,
    event_date: "2026-09-10", event_time: "8:00 PM", event_location: "Stake Center",
    pinned: false, created_at: "2026-09-01T00:00:00Z" },
  { id: "p-padel", category: "activity", title: "Conquer Padel Night", rsvp: true,
    event_date: "2026-09-11", pinned: false, created_at: "2026-09-01T00:00:00Z" },
];

function query(table) {
  const data = table === "posts" ? POSTS : [];
  const result = Promise.resolve({ data, error: null });
  const proxy = new Proxy(result, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
      if (prop === "single") return () => Promise.resolve({ data: { id: "stub" }, error: null });
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

// jsdom has no matchMedia, and App reads it to pick a theme. A stub rather
// than a mock of the whole module: the theme is real behaviour and shouldn't
// be mocked away just to get the app mounted.
if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  });
}

/** Put a query string on the location the app will read. */
function at(search) {
  window.history.replaceState({}, "", search ? `/?${search}` : "/");
}

async function mountApp() {
  vi.resetModules();
  const { default: App } = await import("../src/App");
  let dom;
  await act(async () => {
    dom = render(<App />);
    await new Promise((r) => setTimeout(r, 0));
  });
  // The feed loads, then a second effect scrolls to the focused post once the
  // posts are actually rendered. One tick isn't enough to see the second.
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  return dom;
}

beforeEach(() => { at(""); localStorage.clear(); });
afterEach(() => { at(""); cleanup(); });

describe("a link to one feed post", () => {
  it("opens on the feed with that post picked out", async () => {
    at("p=p-basketball");
    await mountApp();

    // On screen isn't enough — every post is on screen. The link has to land
    // on *this* one, which the feed shows by ringing the card. Without that
    // somebody arriving from the email has to hunt for the thing they tapped.
    expect((await screen.findAllByText("Basketball")).length).toBeGreaterThan(0);
    const card = document.getElementById("post-p-basketball");
    expect(card, "the post isn't on the page").toBeTruthy();
    expect(card.getAttribute("style")).toContain("0 0 0 3px");
  });

  it("leaves the other posts alone", async () => {
    at("p=p-basketball");
    await mountApp();

    const other = document.getElementById("post-p-padel");
    expect(other, "the other post isn't on the page").toBeTruthy();
    expect(other.getAttribute("style")).not.toContain("0 0 0 3px");
  });

  it("skips the splash, the way a form link does", async () => {
    // A link opened from a text message shouldn't sit on a splash screen
    // before showing what it was a link to.
    at("p=p-basketball");
    const dom = await mountApp();
    expect(dom.container.textContent).toContain("Basketball");
  });

  it("shows the splash when there's no link to jump to", async () => {
    // The counterpart to skipping it: an ordinary visit still gets the splash,
    // so "skips the splash" above is measuring something real.
    await mountApp();
    expect(document.body.innerHTML).toContain("eq-splash-in");
  });

  it("doesn't mistake a form link for a post link", async () => {
    at("f=some-form");
    await mountApp();
    // The form route renders on its own, with a way back to the feed.
    expect(screen.getByText("Back To The Feed")).toBeTruthy();
  });
});

describe("what the weekly email links to", () => {
  it("points an RSVP activity at its post", async () => {
    const { eventLink } = await import("../src/lib/domain/weeklyEmail");
    const link = eventLink(
      { title: "Basketball", rsvp: true, post_id: "p-basketball" },
      "https://eqhq.netlify.app"
    );
    expect(link.href).toBe("https://eqhq.netlify.app/?p=p-basketball");
    // Worded as the feed's own button, so the link and what it lands on are
    // recognisably the same act.
    expect(link.label).toBe("I\u2019m In for Basketball");
  });

  it("prefers a sign-up form when there is one", async () => {
    // An event can have both. The form is the one that collects something.
    const { eventLink } = await import("../src/lib/domain/weeklyEmail");
    const link = eventLink(
      { title: "Summer Soiree", rsvp: true, post_id: "p-x", form_id: "f-y" },
      "https://eqhq.netlify.app"
    );
    expect(link.href).toContain("?f=f-y");
  });

  it("gives no link to an activity that takes neither", async () => {
    const { eventLink } = await import("../src/lib/domain/weeklyEmail");
    expect(eventLink({ title: "Basketball" }, "https://eqhq.netlify.app")).toBeNull();
    // rsvp with no published post has nowhere to send anyone.
    expect(eventLink({ title: "Basketball", rsvp: true }, "https://eqhq.netlify.app")).toBeNull();
  });
});
