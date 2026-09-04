import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The Feed, laid out the way the flyer shows it.
 *
 * Lesson at the top, then what's coming up with the thing you'd do about it,
 * then the posts. The rule for which action a row gets is checked by
 * arithmetic — see tests/upcoming.mjs. What has to be mounted is that the
 * three sections are in that order and that an RSVP in the Upcoming row
 * actually writes an RSVP.
 */

let POSTS = [];
let RSVPS = [];
let WRITES = [];

function query(table) {
  const rows = table === "posts" ? POSTS : table === "public_rsvps" ? RSVPS : [];
  const capture = (op) => (arg) => {
    WRITES.push({ table, op, arg });
    return chain({ data: [], error: null });
  };
  const chain = (result) => {
    const p = Promise.resolve(result);
    return new Proxy(p, {
      get(t, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
        if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
        if (prop === "single") return () => Promise.resolve({ data: { id: "x" }, error: null });
        if (["insert", "update", "delete", "upsert"].includes(prop)) return capture(prop);
        return () => chain(result);
      },
    });
  };
  return chain({ data: rows, error: null });
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

const NOW = new Date(2026, 8, 6, 12, 0, 0);
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const DEFAULTS = [
  { id: "temple", category: "temple", title: "Stake Temple Cleaning", event_date: "2026-09-20",
    event_time: "7:00 AM", event_location: "Mount Timpanogos",
    link_url: "https://eqhq.netlify.app/?f=abc", created_at: daysAgo(2) },
  { id: "bbq", category: "activity", title: "EQ BBQ", event_date: "2026-09-23",
    event_time: "6:00 PM", event_location: "The Curtis Home", rsvp: true, created_at: daysAgo(1) },
  { id: "service", category: "assignment", title: "Hospital Service", event_date: "2026-10-11",
    event_time: "11:00 AM", allow_signup: true, created_at: daysAgo(3) },
  // A plain details link, deliberately: it is *not* a sign-up, and a row that
  // sprouted a Sign Up button over a map link was only caught by arithmetic.
  { id: "fourth", category: "activity", title: "Ward Temple Night", event_date: "2026-10-18",
    link_url: "https://maps.example/timp", created_at: daysAgo(4) },
  { id: "note", category: "announcement", title: "Ministering Interviews",
    body: "Reach out this week.", created_at: daysAgo(1) },
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

const rows = () =>
  [...document.querySelectorAll("[data-upcoming-row]")].map((el) => el.dataset.upcomingRow);
const rowFor = (id) => document.querySelector(`[data-upcoming-row="${id}"]`);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  POSTS = DEFAULTS.map((p) => ({ ...p }));
  RSVPS = [];
  WRITES = [];
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("the three sections, in order", () => {
  it("lesson, then upcoming, then recent activity", async () => {
    const dom = await mount();
    const text = dom.container.textContent;

    // By the banner's own copy, not by its eyebrow: the 6th of September 2026
    // is itself a Sunday, so the eyebrow reads "TODAY" and looking for "NEXT
    // SUNDAY" found nothing.
    const lesson = text.indexOf("Lesson Coming");
    const upcoming = text.indexOf("Upcoming");
    const recent = text.indexOf("Recent Activity");

    expect(lesson, "the lesson banner isn't on the feed").toBeGreaterThanOrEqual(0);
    expect(upcoming).toBeGreaterThan(lesson);
    expect(recent).toBeGreaterThan(upcoming);
  });

  it("has no category tiles any more", async () => {
    const dom = await mount();
    expect(dom.container.querySelector("[aria-label^='Activities:']")).toBeNull();
    expect(dom.container.querySelector("[aria-label^='Announcements:']")).toBeNull();
  });

  it("still lists the posts underneath", async () => {
    const dom = await mount();
    expect(dom.container.querySelectorAll("[id^='post-']").length).toBe(POSTS.length);
  });
});

describe("what Upcoming lists", () => {
  it("three at a time, soonest first", async () => {
    await mount();
    expect(rows()).toEqual(["temple", "bbq", "service"]);
  });

  it("and the rest behind See all", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("See all 4")); });
    expect(rows()).toEqual(["temple", "bbq", "service", "fourth"]);
  });

  it("leaves undated announcements out of the calendar", async () => {
    await mount();
    expect(rows()).not.toContain("note");
  });

  it("says so when there's nothing on the calendar", async () => {
    POSTS = [DEFAULTS[4]];
    const dom = await mount();
    expect(dom.container.textContent).toContain("Nothing on the calendar yet");
  });
});

describe("the action on each row", () => {
  it("a form gets a Sign Up link that goes to the form", async () => {
    await mount();
    const link = rowFor("temple").querySelector("a");
    expect(link, "no link on the sign-up row").toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://eqhq.netlify.app/?f=abc");
    expect(link.textContent).toContain("Sign Up");
  });

  it("an RSVP gets I'm In, and it works in the row", async () => {
    await mount();
    const row = rowFor("bbq");
    const btn = [...row.querySelectorAll("button")].find((b) => b.textContent.includes("I’m In"));
    expect(btn, "no I'm In on the rsvp row").toBeTruthy();

    // No name yet, so it asks; then it writes.
    await act(async () => { fireEvent.click(btn); });
    const box = row.querySelector("input");
    expect(box, "it didn't ask for a name").toBeTruthy();
    await act(async () => { fireEvent.change(box, { target: { value: "Drew Curtis" } }); });
    await act(async () => {
      fireEvent.click([...row.querySelectorAll("button")].find((b) => b.textContent === "Add"));
    });

    const ins = WRITES.filter((w) => w.table === "rsvps" && w.op === "insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].arg).toMatchObject({ post_id: "bbq", name: "Drew Curtis" });
  });

  it("a sheet on the post opens the post rather than acting in the row", async () => {
    await mount();
    const row = rowFor("service");
    expect(row.querySelector("a"), "a sheet has nowhere to link to").toBeNull();
    const btn = [...row.querySelectorAll("button")].find((b) => b.textContent.includes("Sign Up"));
    expect(btn).toBeTruthy();

    await act(async () => { fireEvent.click(btn); });
    // The post is picked out below.
    expect(document.getElementById("post-service").getAttribute("style"))
      .toContain("0 0 0 3px");
  });

  it("a details link is not a sign-up", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("See all 4")); });
    const row = rowFor("fourth");
    expect(row.textContent, "a map link got a Sign Up button").not.toContain("Sign Up");
    expect(row.querySelector("a"), "a details link became an action").toBeNull();
    // Only the row's own title button, nothing to act on.
    expect(row.querySelectorAll("button")).toHaveLength(1);
  });
});

describe("an RSVP is one RSVP", () => {
  it("the row and the post show the same state", async () => {
    // Both render <Rsvp> for the same post. If the row said "I'm In" while the
    // card said "You're In" they'd be two different records.
    RSVPS = [{ name: "Ryan Talbot", created_at: daysAgo(0) }];
    await mount();

    expect(rowFor("bbq").textContent).toContain("1 coming");
    expect(document.getElementById("post-bbq").textContent).toContain("Ryan Talbot");
  });
});
