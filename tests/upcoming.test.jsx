import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { withEventDates, upcomingFrom } from "../src/lib/domain/upcomingAction";

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
let NOTICES = [];
let LINKS = [];
let EVENT_DATES = [];
let WRITES = [];

function query(table) {
  const rows = table === "posts" ? POSTS
    : table === "public_rsvps" ? RSVPS
    : table === "sunday_announcements_public" ? NOTICES
    : table === "post_links" ? LINKS
    : table === "public_event_dates" ? EVENT_DATES
    : [];
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
  NOTICES = [];
  LINKS = [];
  EVENT_DATES = [];
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

  /**
   * The announcements hub, mounted through the Feed rather than on its own.
   *
   * Its own tests render <Announcements /> directly, which proves the card
   * works but not that anything shows it — deleting it from the Feed left
   * every one of them passing. That is the same shape of hole as the Plan
   * screen's hardcoded section list: a component tested in a configuration
   * the app never ships.
   */
  it("and the announcements hub is on the feed, above Upcoming", async () => {
    NOTICES = [{
      meeting_date: "2026-09-06", text: "Temple recommend interviews after church.",
      sort_order: 0,
    }];
    const dom = await mount();
    expect(dom.container.textContent).toContain("Temple recommend interviews");

    // Compared by position in the document, not by index into textContent:
    // the heading is uppercased with CSS, so the text still reads
    // "Announcements" and searching for the shouted version finds nothing.
    const notice = dom.container.querySelector("[data-announcement-row]");
    const event = dom.container.querySelector("[data-upcoming-row]");
    expect(notice, "the hub isn't on the feed at all").toBeTruthy();
    expect(
      notice.compareDocumentPosition(event) & Node.DOCUMENT_POSITION_FOLLOWING,
      "what's coming up came out above the announcements"
    ).toBeTruthy();
  });

  it("and takes its space back when nothing was announced", async () => {
    const dom = await mount();   // NOTICES is empty
    expect(dom.container.textContent).not.toContain("From Sun");
  });
});

describe("one link per destination, on the post itself", () => {
  /**
   * "why is there 2 links? we only need one"
   *
   * Mounted through the Feed. The rule is checked directly in
   * postlinks.test.jsx, but that passed with the component ignoring it
   * entirely — proving a function works is not proving anything calls it.
   */
  const BLOOD = {
    id: "blood", category: "service", title: "Stake Blood Drive",
    event_date: "2026-09-11", link_url: "https://redcrossblood.org/drive/8th",
    link_label: "Sign Up", created_at: "2026-09-05T00:00:00Z",
  };

  it("collapses a hand-added copy of the post's own link", async () => {
    POSTS = [BLOOD];
    LINKS = [{
      id: "l1", post_id: "blood", label: "Sign Up Here",
      url: "https://redcrossblood.org/drive/8th", sort_order: 0,
    }];
    const dom = await mount();

    const card = document.getElementById("post-blood");
    const toDrive = [...card.querySelectorAll("a")]
      .filter((a) => a.getAttribute("href") === "https://redcrossblood.org/drive/8th");
    expect(toDrive, "the same page is linked twice on one post").toHaveLength(1);
    expect(card.textContent).not.toContain("Sign Up Here");
  });

  it("but keeps two links that go to different places", async () => {
    POSTS = [BLOOD];
    LINKS = [{
      id: "l1", post_id: "blood", label: "Flyer",
      url: "https://example.org/flyer.pdf", sort_order: 0,
    }];
    const dom = await mount();
    const card = document.getElementById("post-blood");
    expect(card.textContent).toContain("Flyer");
    expect(dom.container.textContent).toContain("Sign Up");
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

  /**
   * "im not sure why the service events dont show the Sign Up button like the
   *  Assignement or Activity"
   *
   * They didn't because the rule only recognised our own forms (/?f=). A blood
   * drive on the stake's site, or a Google form for a day of service, got the
   * same treatment as a link to a map. What separates the two is what the
   * presidency called the link.
   */
  it("an outside link labelled as a sign-up gets the button", async () => {
    POSTS = [{
      id: "blood", category: "service", title: "Stake Blood Drive",
      event_date: "2026-09-11", link_url: "https://redcrossblood.org/drive/8th",
      link_label: "Sign up", created_at: daysAgo(1),
    }];
    await mount();
    const link = rowFor("blood").querySelector("a");
    expect(link, "an outside sign-up link got no button").toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://redcrossblood.org/drive/8th");
    expect(link.textContent).toContain("Sign Up");
    // Opens the stake's site, so it must behave like a link out.
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("but an outside link labelled anything else still doesn't", async () => {
    // The counterweight. Without this the rule could be "any link at all is a
    // sign-up", which passes the test above and puts a Sign Up button on a
    // flyer, a map and a stake calendar.
    POSTS = [{
      id: "flyer", category: "service", title: "9/11 Day of Service",
      event_date: "2026-09-12", link_url: "https://example.org/flyer.pdf",
      link_label: "Details", created_at: daysAgo(1),
    }];
    await mount();
    const row = rowFor("flyer");
    expect(row.textContent, "a flyer got a Sign Up button").not.toContain("Sign Up");
    expect(row.querySelector("a")).toBeNull();
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


/* -------------------- an assignment with several dates -------------------- */

/**
 * "why is the Stake Temple Cleaning assignment not showing on the FEED or
 *  upcoming events?"
 *
 * Because a post carries ONE date and that assignment has five. It was
 * stamped with the first, and the morning after that date passed the whole
 * thing left the feed with four still to come — silently, because from the
 * feed's point of view it had simply happened.
 *
 * Checked against the live row: event_date was 2026-09-18 with dates running
 * to December.
 */
describe("a post whose event runs over several dates", () => {
  const TODAY = "2026-09-28";
  const TEMPLE = {
    id: "p-temple", title: "Stake Temple Cleaning Assignment",
    category: "assignment", event_date: "2026-09-18",
    link_url: "https://docs.google.com/x", link_label: "Sign Up",
  };
  const DATES = [
    { post_id: "p-temple", event_date: "2026-09-18" },
    { post_id: "p-temple", event_date: "2026-10-03", event_time: "8:00 AM" },
    { post_id: "p-temple", event_date: "2026-11-07" },
    { post_id: "p-temple", event_date: "2026-12-15" },
  ];

  it("shows the next date still ahead, not the first one ever", () => {
    const [p] = withEventDates([TEMPLE], DATES, TODAY);
    expect(p.event_date).toBe("2026-10-03");
    expect(p.event_time).toBe("8:00 AM");
  });

  it("and so it stays on the feed instead of vanishing", () => {
    // The whole complaint, in one assertion.
    expect(upcomingFrom([TEMPLE], TODAY), "the bug as it was").toHaveLength(0);
    expect(upcomingFrom(withEventDates([TEMPLE], DATES, TODAY), TODAY)).toHaveLength(1);
  });

  it("counts how many are left, so it doesn't read as one evening", () => {
    const [p] = withEventDates([TEMPLE], DATES, TODAY);
    expect(p.remaining).toBe(3);
  });

  it("rolls forward as each date passes", () => {
    expect(withEventDates([TEMPLE], DATES, "2026-10-04")[0].event_date).toBe("2026-11-07");
    expect(withEventDates([TEMPLE], DATES, "2026-11-08")[0].event_date).toBe("2026-12-15");
  });

  it("and leaves the series alone once every date is behind", () => {
    // Falling back to the planner's first date would resurrect a finished
    // series months later — the mirror of the bug this fixes.
    const [p] = withEventDates([TEMPLE], DATES, "2026-12-16");
    expect(p.event_date).toBe("2026-09-18");
    expect(p.remaining).toBeUndefined();
    expect(upcomingFrom([p], "2026-12-16")).toHaveLength(0);
  });

  it("prefers a form attached to the specific date", () => {
    // A particular shift can have its own sign-up sheet.
    const dated = [{ post_id: "p-temple", event_date: "2026-10-03", form_id: "shift-2" }];
    const [p] = withEventDates([{ ...TEMPLE, form_id: "general" }], dated, TODAY);
    expect(p.form_id).toBe("shift-2");
  });

  it("and every ordinary post is returned untouched", () => {
    const bbq = { id: "p-bbq", title: "EQ BBQ", event_date: "2026-09-30" };
    expect(withEventDates([bbq], DATES, TODAY)[0]).toBe(bbq);
  });

  it("with no dates loaded at all, nothing changes", () => {
    // A database that hasn't run post-dates.sql yet must behave exactly as
    // it did before.
    expect(withEventDates([TEMPLE], [], TODAY)[0]).toBe(TEMPLE);
  });
});


/**
 * ...and that the Feed actually asks for them.
 *
 * withEventDates is checked above on its own, which proves the rule and
 * nothing about whether anything calls it. Removing the call from Feed.jsx
 * left every one of those tests passing — the failure this repo keeps
 * finding. This one mounts the real feed.
 */
describe("the feed, with a multi-date assignment", () => {
  // NOW is Sun 6 September 2026. The first cleaning date is behind us and
  // three are still to come, which is the live situation exactly.
  const PAST = "2026-08-15";

  beforeEach(() => {
    POSTS = [{
      id: "temple", category: "assignment", title: "Stake Temple Cleaning Assignment",
      event_date: PAST, link_url: "https://docs.google.com/x", link_label: "Sign Up",
      created_at: daysAgo(30),
    }];
    EVENT_DATES = [
      { post_id: "temple", event_date: PAST },
      { post_id: "temple", event_date: "2026-10-03", event_time: "8:00 AM" },
      { post_id: "temple", event_date: "2026-11-07" },
      { post_id: "temple", event_date: "2026-12-15" },
    ];
  });

  it("puts it back in Upcoming, on its next date", async () => {
    const dom = await mount();
    expect(rows(), "the assignment is still missing from the feed").toContain("temple");
    expect(dom.container.textContent).toContain("Stake Temple Cleaning Assignment");
  });

  it("and says how many dates are left", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toContain("3 dates");
  });

  it("but without the dates it stays gone, as it did", async () => {
    // The same post with no date rows — a database that hasn't run
    // post-dates.sql — behaves exactly as before.
    EVENT_DATES = [];
    await mount();
    expect(rows()).not.toContain("temple");
  });
});
