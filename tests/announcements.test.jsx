import { render, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sundayAnnouncements, saysTheSameAs, missingFromAgenda, nearDuplicates,
  restatingEvents, announcementWarnings, notYetCarried, MAX_SHOWN,
  moveAnnouncement, orderWrites,
} from "../src/lib/domain/announcements";
import { buildEmailText, buildEmailHtml } from "../src/lib/domain/weeklyEmail";
import { signUpHref, actionFor, ACTION } from "../src/lib/domain/upcomingAction";
import { publishedLink } from "../src/lib/domain/planning";

/**
 * Announcements, in the three places they show up.
 *
 * The hub on the feed, the secretary's warnings before the email goes out, and
 * the email itself. The rules are pure and checked directly; only the hub is
 * mounted, because what has to be true about it is which table it reads.
 */

let TABLES = {};
let ASKED = [];

function query(table) {
  ASKED.push(table);
  const rows = TABLES[table];
  if (rows === undefined) {
    const err = { message: `relation "${table}" does not exist` };
    const chain = () => new Proxy(Promise.resolve({ data: null, error: err }), {
      get(t, k) {
        if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
        return () => chain();
      },
    });
    return chain();
  }
  const chain = () => new Proxy(Promise.resolve({ data: rows, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
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
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock("../src/lib/useAuth", () => ({
  useAuth: () => ({ presidency: null, isPresidency: false, ready: true, signOut() {} }),
}));

beforeEach(() => {
  ASKED = [];
  TABLES = {
    sunday_announcements_public: [
      { meeting_date: "2026-09-06", text: "Temple recommend interviews after church.", link_url: "", sort_order: 0 },
      { meeting_date: "2026-09-06", text: "Bring a chair to the ward party.", link_url: "https://example.org/party", sort_order: 1 },
    ],
  };
});
afterEach(() => cleanup());

async function openHub() {
  const { default: Announcements } = await import("../src/member/Announcements");
  let dom;
  await act(async () => {
    dom = render(<Announcements />);
    await new Promise((r) => setTimeout(r, 40));
  });
  return dom;
}

/* ------------------------------- the feed hub ----------------------------- */

describe("the announcements hub", () => {
  it("shows what was announced, with the Sunday it came from", async () => {
    const dom = await openHub();
    expect(dom.container.textContent).toContain("Temple recommend interviews");
    expect(dom.container.textContent).toContain("Bring a chair");
    // Without the date these read as current notices; on a Saturday that's
    // most of a week of drift with nothing on screen to explain it.
    expect(dom.container.textContent).toMatch(/From Sun, Sep 6/);
  });

  it("reads the view, never the agenda tables", async () => {
    await openHub();
    // agenda_items carries the presidency's private notes, who is responsible
    // and due dates. RLS is row-level, so reading that table from a member's
    // screen would mean opening all of it.
    expect(ASKED).toContain("sunday_announcements_public");
    expect(ASKED).not.toContain("agenda_items");
    expect(ASKED).not.toContain("agendas");
  });

  it("links out where an announcement has a link", async () => {
    const dom = await openHub();
    const a = [...dom.container.querySelectorAll("a")].find((x) => x.href.includes("example.org"));
    expect(a).toBeTruthy();
    expect(a.target).toBe("_blank");
  });

  it("disappears entirely when there's nothing to announce", async () => {
    TABLES.sunday_announcements_public = [];
    const dom = await openHub();
    // Not an empty card. Upcoming says "nothing on the calendar" because an
    // empty calendar is worth knowing; an empty announcements card is just a
    // hole in the feed.
    expect(dom.container.textContent.trim()).toBe("");
  });

  it("and stays away when the migration hasn't been run", async () => {
    delete TABLES.sunday_announcements_public;
    const dom = await openHub();
    expect(dom.container.textContent.trim()).toBe("");
  });

  it("holds the long Sundays behind See all", async () => {
    TABLES.sunday_announcements_public = Array.from({ length: MAX_SHOWN + 3 }, (_, i) => ({
      meeting_date: "2026-09-06", text: `Announcement number ${i} about something`, sort_order: i,
    }));
    const dom = await openHub();
    expect(dom.container.querySelectorAll("[data-announcement-row]")).toHaveLength(MAX_SHOWN);
    expect(dom.container.textContent).toContain(`See all ${MAX_SHOWN + 3}`);
  });

  it("keeps the order they were read out in", async () => {
    TABLES.sunday_announcements_public = [
      { meeting_date: "2026-09-06", text: "Third thing said", sort_order: 2 },
      { meeting_date: "2026-09-06", text: "First thing said", sort_order: 0 },
      { meeting_date: "2026-09-06", text: "Second thing said", sort_order: 1 },
    ];
    const dom = await openHub();
    const text = dom.container.textContent;
    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"));
    expect(text.indexOf("Second")).toBeLessThan(text.indexOf("Third"));
  });

  it("gives members nothing to edit", async () => {
    // "which would need to be on the presidency side not the feed/member
    //  side." Editing and reordering went onto the presidency screens; this
    //  is the counterweight, because the obvious way to share that work would
    //  have been to reuse the row component on both sides.
    const dom = await openHub();
    expect(dom.container.querySelectorAll("input")).toHaveLength(0);
    expect(dom.container.querySelectorAll("textarea")).toHaveLength(0);
    expect(dom.container.querySelectorAll("button")).toHaveLength(0);
    expect(dom.container.textContent).not.toMatch(/Move up|Move down/);
  });

  it("drops the blank rows the agenda leaves behind", async () => {
    TABLES.sunday_announcements_public = [
      { meeting_date: "2026-09-06", text: "  ", sort_order: 0 },
      { meeting_date: "2026-09-06", text: "A real announcement here", sort_order: 1 },
    ];
    const dom = await openHub();
    expect(dom.container.querySelectorAll("[data-announcement-row]")).toHaveLength(1);
  });
});

/* ------------------------------ is it the same? --------------------------- */

describe("telling one announcement from the same one twice", () => {
  it("sees through rewording", () => {
    expect(saysTheSameAs(
      "Ward temple night is Thursday at 7pm",
      "Temple night Thursday 7pm"
    )).toBe(true);
  });

  it("but leaves two different temple announcements alone", () => {
    expect(saysTheSameAs(
      "Ward temple night is Thursday at 7pm",
      "Temple recommend interviews are after church on Sunday"
    )).toBe(false);
  });

  it("isn't fooled by shared filler", () => {
    // Nothing in common but the words everyone writes.
    expect(saysTheSameAs(
      "Please remember to bring your families with you on Saturday",
      "Please remember to bring a chair with you on Saturday"
    )).toBe(false);
  });

  it("and won't call two short different notices the same", () => {
    expect(saysTheSameAs("Temple night", "Temple recommends")).toBe(false);
    expect(saysTheSameAs("Temple night", "Temple night")).toBe(true);
  });

  it("reads the same both ways round", () => {
    const a = "Ward temple night is Thursday at 7pm";
    const b = "Temple night Thursday 7pm";
    // A one-directional rule would flag a pair or not depending on sort order,
    // and the warning would come and go as announcements were reordered.
    expect(saysTheSameAs(a, b)).toBe(saysTheSameAs(b, a));
  });
});

/* --------------------------- the secretary's checks ----------------------- */

describe("what Karl gets warned about", () => {
  const agenda = [
    { id: "a1", text: "Ward temple night is Thursday at 7pm" },
    { id: "a2", text: "Elders quorum service project Saturday morning" },
  ];

  it("catches a feed post that never reached the agenda", () => {
    const feed = [{ id: "p1", title: "Blood drive Friday at the stake center", body: "" }];
    const missed = missingFromAgenda(feed, agenda);
    expect(missed.map((p) => p.id)).toEqual(["p1"]);
  });

  it("and doesn't flag one that did", () => {
    const feed = [{ id: "p2", title: "Temple night Thursday 7pm", body: "" }];
    expect(missingFromAgenda(feed, agenda)).toHaveLength(0);
  });

  it("matches on the body when the title is just a heading", () => {
    // People write "Temple Night" as the title and the detail underneath.
    const feed = [{ id: "p3", title: "Reminder", body: "Temple night Thursday 7pm" }];
    expect(missingFromAgenda(feed, agenda)).toHaveLength(0);
  });

  it("spots the carried-forward announcement typed again", () => {
    const dupes = nearDuplicates([
      { id: "a1", text: "Ward temple night is Thursday at 7pm" },
      { id: "a2", text: "Elders quorum service project Saturday morning" },
      { id: "a3", text: "Temple night Thursday 7pm" },
    ]);
    expect(dupes).toHaveLength(1);
    expect([dupes[0].a.id, dupes[0].b.id].sort()).toEqual(["a1", "a3"]);
  });

  it("notices an announcement restating an event already listed", () => {
    // Deliberately a full sentence, which is how announcements are actually
    // written. Against the short event title it scores about 0.3 on word
    // overlap — well under the duplicate threshold — so a rule built on
    // similarity finds nothing here. Containment is the right relation: is
    // the whole title in there?
    const hits = restatingEvents(
      [{ id: "a4", text: "Remember the stake blood drive is this Friday afternoon at the stake center, walk-ins welcome" }],
      [{ id: "e1", title: "Stake Blood Drive" }]
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].event.id).toBe("e1");
  });

  it("but not one that merely shares a word with an event", () => {
    // Containment, not similarity: the whole title has to be in there. An
    // announcement mentioning the stake is not an announcement about the
    // Stake Blood Drive.
    expect(restatingEvents(
      [{ id: "a5", text: "The stake offices are closed on Monday" }],
      [{ id: "e1", title: "Stake Blood Drive" }]
    )).toHaveLength(0);
  });

  it("says nothing when there's nothing wrong", () => {
    expect(announcementWarnings({
      agendaItems: agenda,
      feedPosts: [{ id: "p9", title: "Temple night Thursday 7pm" }],
      events: [],
    })).toHaveLength(0);
  });

  it("puts the missing one first", () => {
    // Something absent from the email costs more than something said twice.
    const w = announcementWarnings({
      agendaItems: [
        { id: "a1", text: "Ward temple night is Thursday at 7pm" },
        { id: "a3", text: "Temple night Thursday 7pm" },
      ],
      feedPosts: [{ id: "p1", title: "Blood drive Friday at the stake center" }],
      events: [],
    });
    expect(w.length).toBeGreaterThan(1);
    expect(w[0].kind).toBe("missing");
  });

  it("ignores a feed notice whose day has passed", () => {
    // Handled where it's loaded, but stated here so the intent survives: an
    // announcement about last week isn't missing from the agenda, it's over.
    expect(missingFromAgenda([], agenda)).toHaveLength(0);
  });
});

/* --------------------------- bringing them forward ------------------------ */

describe("what's still owed from last Sunday", () => {
  const LAST = [
    { id: "a", text: "Stake Blood Drive on Friday, September 11, 1:00 to 7:00PM at the Stake Center" },
    { id: "b", text: "9/11 National Day of Service - Saturday 9/12 - 9am to Noon" },
    { id: "c", text: "Church cleaning Saturday 9/12 at 7am, last names S-Z" },
  ];

  it("offers the ones this week hasn't got", () => {
    const here = [{ text: "9/11 National Day of Service - Saturday 9/12 - 9am to Noon" }];
    expect(notYetCarried(LAST, here, "2026-09-13").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("matches on wording, not on id", () => {
    // A carried row is a new row with its own id, and people retype an
    // announcement as often as they carry it. Comparing ids would offer to
    // add things that are plainly already on the agenda.
    const here = [{ id: "zzz", text: "Blood drive Friday September 11 at the stake center, 1 to 7pm" }];
    expect(notYetCarried(LAST, here, "2026-09-13").map((r) => r.id)).not.toContain("a");
  });

  it("leaves out anything already over by that Sunday", () => {
    const dated = [{ id: "d", text: "Church cleaning Saturday", expires_on: "2026-09-12" }];
    expect(notYetCarried(dated, [], "2026-09-13")).toHaveLength(0);
    expect(notYetCarried(dated, [], "2026-09-12")).toHaveLength(1);
  });

  it("and anything pinned to its own week", () => {
    const pinned = [{ id: "e", text: "Fast offerings are collected today", carry_over: false }];
    expect(notYetCarried(pinned, [], "2026-09-13")).toHaveLength(0);
  });

  it("says nothing when the week is already up to date", () => {
    expect(notYetCarried(LAST, LAST, "2026-09-13")).toHaveLength(0);
  });

  it("and ignores the blank rows the agenda leaves behind", () => {
    expect(notYetCarried([{ id: "f", text: "   " }], [], "2026-09-13")).toHaveLength(0);
  });
});

/* -------------------------------- reordering ------------------------------ */

describe("shuffling the announcements", () => {
  const ROWS = [
    { id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }, { id: "c", sort_order: 2 },
  ];

  it("moves one down", () => {
    expect(moveAnnouncement(ROWS, "a", 1).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("and up", () => {
    expect(moveAnnouncement(ROWS, "c", -1).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("won't wrap off either end", () => {
    // Tapping "up" on the top item wanting it to appear at the bottom is not
    // a thing anybody has ever wanted.
    expect(moveAnnouncement(ROWS, "a", -1).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(moveAnnouncement(ROWS, "c", 1).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves the list alone when the row isn't in it", () => {
    expect(moveAnnouncement(ROWS, "nope", 1).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("writes only the rows that actually moved", () => {
    // Reordering fifteen after one tap should be two updates, not fifteen.
    expect(orderWrites(moveAnnouncement(ROWS, "a", 1)))
      .toEqual([{ id: "b", sort_order: 0 }, { id: "a", sort_order: 1 }]);
  });

  it("and renumbers a list whose sort_orders arrived crooked", () => {
    // This is the case a swap-two-values reorder gets wrong and silently does
    // nothing for. Agendas collect collisions: a carried batch starts
    // numbering at the count of what was already there, and deleting a row
    // leaves a hole.
    const messy = [
      { id: "x", sort_order: 0 }, { id: "y", sort_order: 0 }, { id: "z", sort_order: 7 },
    ];
    const moved = moveAnnouncement(messy, "y", -1);
    expect(moved.map((r) => r.id)).toEqual(["y", "x", "z"]);
    const writes = orderWrites(moved);
    expect(writes.map((w) => w.sort_order)).toEqual([1, 2]);
    expect(writes.map((w) => w.id)).toEqual(["x", "z"]);
  });
});

/* -------------------------------- the email ------------------------------- */

describe("the weekly email leads with the lesson", () => {
  const base = {
    sundayIso: "2026-09-13",
    lesson: {
      teacher_name: "Nick Crump", talk_title: "Come Home", speaker: "Clark G. Gilbert",
      talk_link: "https://example.org/talk",
    },
    announcements: ["Temple recommend interviews after church"],
    events: [{ id: "e1", title: "Basketball", event_date: "2026-09-17" }],
    siteUrl: "https://eqhq.netlify.app",
    groupMeUrl: "https://groupme.com/join/1",
  };

  it("lesson, teacher and talk before anything else", () => {
    const t = buildEmailText(base);
    expect(t.indexOf("Nick Crump")).toBeGreaterThan(-1);
    expect(t.indexOf("Nick Crump")).toBeLessThan(t.indexOf("ANNOUNCEMENTS"));
    expect(t.indexOf("Read the talk")).toBeLessThan(t.indexOf("ANNOUNCEMENTS"));
  });

  it("then the push to the site, above the announcements", () => {
    // "then the push for everyone to visit the website for updates,
    //  announcements, and information" — it used to be the last line, under
    //  the signature, which is the part people scroll past.
    const t = buildEmailText(base);
    const site = t.indexOf("Elders Quorum App");
    expect(site).toBeGreaterThan(t.indexOf("Read the talk"));
    expect(site).toBeLessThan(t.indexOf("ANNOUNCEMENTS"));
  });

  it("and says it once, not twice", () => {
    const t = buildEmailText(base);
    expect(t.split("Elders Quorum App").length - 1).toBe(1);
  });

  it("the HTML version agrees with the plain text", () => {
    // The secretary can hand-edit the plain text and send that instead, so an
    // email whose shape depended on which one he sent would be a difference
    // nobody could explain.
    const h = buildEmailHtml(base);
    const site = h.indexOf("Elders Quorum App");
    expect(site).toBeGreaterThan(h.indexOf("Come Home"));
    expect(site).toBeLessThan(h.indexOf("Announcements"));
    expect(h.split("Elders Quorum App").length - 1).toBe(1);
  });

  it("GroupMe still closes the email", () => {
    const t = buildEmailText(base);
    expect(t.indexOf("EQ GroupMe")).toBeGreaterThan(t.indexOf("COMING UP"));
  });

  it("and a ward with no site set gets no dangling line", () => {
    const t = buildEmailText({ ...base, siteUrl: "" });
    expect(t).not.toContain("Elders Quorum App");
    expect(t).toContain("ANNOUNCEMENTS");
  });
});

/* ------------------------- the sign-up rule, shared ----------------------- */

describe("the sign-up rule is one rule", () => {
  it("recognises our own forms", () => {
    expect(signUpHref({ link_url: "https://eqhq.netlify.app/?f=abc" })).toBeTruthy();
  });

  it("and an outside link the presidency called a sign-up", () => {
    expect(signUpHref({
      link_url: "https://redcrossblood.org/drive", link_label: "Sign up",
    })).toBe("https://redcrossblood.org/drive");
    expect(actionFor({
      link_url: "https://signupgenius.com/x", link_label: "Volunteer",
    }).kind).toBe(ACTION.SIGNUP);
  });

  it("but not a flyer, a map or a stake calendar", () => {
    for (const label of ["Details", "Flyer", "Map", "Read more", "Calendar", ""]) {
      expect(signUpHref({ link_url: "https://example.org/x", link_label: label }), label).toBe("");
    }
  });

  /**
   * The Planner end of it.
   *
   * The label rule above can only work if something sets a truthful label, and
   * the Planner sets it for every event published from PLAN. It used to write
   * "Details" for any link that wasn't one of our own forms — so a blood drive
   * pointing at the stake's booking page was labelled "Details" before the
   * feed ever saw it, and no amount of reading labels downstream could help.
   */
  it("the Planner marks an outside sign-up link as one", () => {
    const { url, label } = publishedLink(
      { link_url: "https://redcrossblood.org/drive", link_is_signup: true }, null
    );
    expect(label).toBe("Sign Up");
    // ...and that's exactly what the feed needs to show the button.
    expect(actionFor({ link_url: url, link_label: label }).kind).toBe(ACTION.SIGNUP);
  });

  it("and leaves an ordinary link alone", () => {
    const { label } = publishedLink(
      { link_url: "https://maps.example/timp", link_is_signup: false }, null
    );
    expect(label).toBe("Details");
    expect(actionFor({ link_url: "https://maps.example/timp", link_label: label }).kind)
      .toBe(ACTION.NONE);
  });

  it("our own form still wins over an outside link", () => {
    // An event with both should send people where the response is recorded.
    const { url, label } = publishedLink(
      { link_url: "https://example.org/flyer", link_is_signup: true },
      "https://eqhq.netlify.app/?f=abc"
    );
    expect(url).toBe("https://eqhq.netlify.app/?f=abc");
    expect(label).toBe("Sign Up");
  });

  it("and an event with no link publishes none", () => {
    expect(publishedLink({}, null)).toEqual({ url: null, label: null });
  });

  it("and the email calls it the same thing the button does", () => {
    const t = buildEmailText({
      sundayIso: "2026-09-13", lesson: null, announcements: [],
      events: [{
        id: "e1", title: "Stake Blood Drive", event_date: "2026-09-11",
        link_url: "https://redcrossblood.org/drive", link_label: "Sign up",
      }],
      siteUrl: "https://eqhq.netlify.app",
    });
    // The feed shows a Sign Up button; the email must not call the same thing
    // "Details", or the two disagree about what tapping it does.
    expect(t).toMatch(/Sign up for the Stake Blood Drive/i);
  });
});
