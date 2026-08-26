import { render, screen, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The lesson banner at the top of the feed.
 *
 * Two things went wrong here and both were invisible to the email tests that
 * were supposed to cover them: the banner still said "THIS SUNDAY" after the
 * email was renamed, and it showed "Read the talk" on a week with no talk.
 * The link came from talkUrl(), which falls back to a Church *search* built
 * from the topic — so the URL was real, the link worked, and it went to a
 * page of search results.
 *
 * Mounted against a fixed clock, because which Sunday is next (and whether
 * it's a 5th Sunday) otherwise depends on the day the suite happens to run.
 */

let LESSON = null;
let EXCEPTIONS = [];
let TEACHING = [];

function query(table) {
  const rows =
    table === "public_calendar_exceptions" ? EXCEPTIONS :
    table === "teaching_assignments" ? TEACHING : [];
  const result = Promise.resolve({ data: rows, error: null });
  const proxy = new Proxy(result, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: LESSON, error: null });
      if (prop === "single") return () => Promise.resolve({ data: LESSON, error: null });
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

// The presidency home card reads the signed-in name; the feed banner doesn't
// touch auth at all, so this only matters for the HomeHub half.
vi.mock("../src/lib/useAuth", () => ({
  useAuth: () => ({ presidency: { name: "Karl Ricks" }, isPresidency: true, ready: true, signOut() {} }),
}));

// Wednesday 2 Sep 2026. The next Sunday is the 6th — a first Sunday, no
// conference, so a normal teaching week unless a test says otherwise.
const WEDNESDAY = new Date(2026, 8, 2, 12, 0, 0);
// Wednesday 25 Nov 2026. The next Sunday is the 29th, the fifth in November,
// which the bishopric directs — no quorum lesson. November rather than August
// because before WEEKLY_CHANGE the quorum only met on 2nd and 4th Sundays, so
// an August 5th Sunday isn't a gathering at all and the banner skips past it.
const BEFORE_FIFTH = new Date(2026, 10, 25, 12, 0, 0);
// Sunday 6 Sep 2026 itself.
const SUNDAY = new Date(2026, 8, 6, 9, 0, 0);

async function mount(now = WEDNESDAY) {
  vi.setSystemTime(now);
  const { default: ThisWeeksLesson } = await import("../src/member/ThisWeeksLesson");
  let dom;
  await act(async () => {
    dom = render(<ThisWeeksLesson />);
    await new Promise((r) => setTimeout(r, 0));
  });
  return dom;
}

const readTheTalk = () => screen.queryByText("Read the talk");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  LESSON = null;
  EXCEPTIONS = [];
  TEACHING = [];
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("what the banner calls the day", () => {
  it("says NEXT SUNDAY LESSON, the same as the weekly email", async () => {
    LESSON = { date: "2026-09-06", teacher_name: "Karl Ricks", talk_title: "Come Home" };
    const dom = await mount();
    expect(dom.container.textContent).toContain("NEXT SUNDAY LESSON");
    // The old wording, which the email had already moved on from.
    expect(dom.container.textContent).not.toContain("THIS SUNDAY");
  });

  it("says TODAY when it is Sunday", async () => {
    LESSON = { date: "2026-09-06", teacher_name: "Karl Ricks", talk_title: "Come Home" };
    const dom = await mount(SUNDAY);
    expect(dom.container.textContent).toContain("TODAY");
    expect(dom.container.textContent).not.toContain("NEXT SUNDAY");
  });

  it("drops the word LESSON when there isn't one", async () => {
    // A fifth Sunday. "NEXT SUNDAY LESSON" over "no quorum lesson" contradicts
    // itself, so the eyebrow shortens rather than lying.
    const dom = await mount(BEFORE_FIFTH);
    expect(dom.container.textContent).toContain("no quorum lesson");
    expect(dom.container.textContent).toContain("NEXT SUNDAY");
    expect(dom.container.textContent).not.toContain("NEXT SUNDAY LESSON");
  });
});

describe("the Read the talk link", () => {
  it("is there when a talk has been chosen", async () => {
    LESSON = {
      date: "2026-09-06", teacher_name: "Karl Ricks", talk_title: "Come Home",
      speaker: "Clark G. Gilbert",
      talk_link: "https://www.churchofjesuschrist.org/study/general-conference/2026/04/15gilbert?lang=eng",
    };
    await mount();
    expect(readTheTalk()).toBeTruthy();
    expect(readTheTalk().closest("a").getAttribute("href")).toBe(LESSON.talk_link);
  });

  it("is there for a pasted link with nothing else filled in", async () => {
    // A link on its own is enough — there's nothing to infer. Worth its own
    // case because every other talk row here also has a title and a speaker,
    // so deleting the link rule entirely still passed.
    LESSON = {
      date: "2026-09-06", teacher_name: "Karl Ricks",
      talk_link: "https://www.churchofjesuschrist.org/study/general-conference/2026/04/15gilbert?lang=eng",
    };
    await mount();
    expect(readTheTalk()).toBeTruthy();
    expect(readTheTalk().closest("a").getAttribute("href")).toBe(LESSON.talk_link);
  });

  it("is there for a talk named with its speaker but no link", async () => {
    // Title plus speaker is a conference talk identified well enough that a
    // search finds it. The speaker is what distinguishes this from a lesson
    // subject typed into the same box.
    LESSON = { date: "2026-09-06", teacher_name: "Karl Ricks", talk_title: "Come Home", speaker: "Clark G. Gilbert" };
    await mount();
    const href = readTheTalk().closest("a").getAttribute("href");
    expect(href).toContain("churchofjesuschrist.org/search");
    expect(decodeURIComponent(href)).toContain("Come Home");
  });

  it("is gone when the talk field holds a lesson subject", async () => {
    // The one Drew caught: "2nd Hour Changes" typed into the talk box, no
    // speaker, no link. talkUrl() happily built a general-conference search
    // for that phrase, so the link rendered and found nothing.
    LESSON = { date: "2026-09-06", teacher_name: "Andrew Curtis", talk_title: "2nd Hour Changes" };
    const dom = await mount();
    expect(dom.container.textContent).toContain("2nd Hour Changes");
    expect(readTheTalk()).toBeNull();
  });

  it("is gone when the week has only a topic", async () => {
    // The bug Drew found. A topic is a subject for the teacher to build on,
    // not a talk anybody can go and read.
    LESSON = { date: "2026-09-06", teacher_name: "Karl Ricks", topic: "Ministering" };
    const dom = await mount();
    expect(dom.container.textContent).toContain("Karl Ricks");
    expect(readTheTalk()).toBeNull();
  });

  it("shows the topic rather than the bare word Lesson", async () => {
    // The email prints "Topic: Ministering" for the same week. The banner was
    // dropping it and headlining "Lesson", which says less than nothing.
    LESSON = { date: "2026-09-06", teacher_name: "Karl Ricks", topic: "Ministering" };
    const dom = await mount();
    expect(dom.container.textContent).toContain("Ministering");
  });

  it("still says a lesson is coming when the row is empty apart from a date", async () => {
    // The counterpart: the topic standing in mustn't swallow the "not posted
    // yet" state, which is what tells members to check back.
    LESSON = { date: "2026-09-06" };
    const dom = await mount();
    expect(dom.container.textContent).toContain("Not posted yet");
  });

  it("is gone when nothing has been posted yet", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toContain("Not posted yet");
    expect(readTheTalk()).toBeNull();
  });

  it("is gone on a Sunday with no quorum lesson", async () => {
    LESSON = { date: "2026-11-29", talk_title: "Come Home", talk_link: "https://example.org/talk" };
    await mount(BEFORE_FIFTH);
    expect(readTheTalk()).toBeNull();
  });
});

describe("the presidency home card heads the same Sunday", () => {
  async function mountHub(now = WEDNESDAY) {
    vi.setSystemTime(now);
    const { default: HomeHub } = await import("../src/presidency/HomeHub");
    let dom;
    await act(async () => {
      dom = render(<HomeHub />);
      await new Promise((r) => setTimeout(r, 0));
    });
    return dom;
  }

  it("says Next Sunday Lesson, not This Sunday", async () => {
    TEACHING = [{ date: "2026-09-06", teacher_name: "Karl Ricks", talk_title: "Come Home" }];
    const dom = await mountHub();
    expect(dom.container.textContent).toContain("Next Sunday Lesson");
    expect(dom.container.textContent).not.toContain("This Sunday");
  });

  it("drops LESSON on a Sunday the bishopric directs", async () => {
    const dom = await mountHub(BEFORE_FIFTH);
    expect(dom.container.textContent).toContain("Next Sunday");
    expect(dom.container.textContent).not.toContain("Next Sunday Lesson");
  });

  it("uses the same words as the member feed for the same week", async () => {
    // The point of sharing the function: whatever the two screens say, they
    // say it together. Compare them on one week rather than asserting a
    // literal in two places that can drift apart again.
    TEACHING = [{ date: "2026-09-06", teacher_name: "Karl Ricks", talk_title: "Come Home" }];
    LESSON = TEACHING[0];

    const hub = await mountHub();
    const hubSays = ["Today", "Next Sunday Lesson", "Next Sunday"]
      .find((w) => hub.container.textContent.includes(w));
    cleanup();

    const feed = await mount();
    const feedSays = ["TODAY", "NEXT SUNDAY LESSON", "NEXT SUNDAY"]
      .find((w) => feed.container.textContent.includes(w));

    expect(hubSays).toBeTruthy();
    expect(feedSays).toBe(hubSays.toUpperCase());
  });
});

describe("what counts as a talk, on its own", () => {
  it("takes a pasted link at face value", async () => {
    const { hasTalk } = await import("../src/lib/domain/lesson");
    expect(hasTalk({ talk_link: "https://example.org/talk" })).toBe(true);
    expect(hasTalk({ talk_link: "   " })).toBe(false);
  });

  it("needs a speaker before it trusts a title", async () => {
    const { hasTalk } = await import("../src/lib/domain/lesson");
    expect(hasTalk({ talk_title: "Come Home", speaker: "Clark G. Gilbert" })).toBe(true);
    expect(hasTalk({ talk_title: "2nd Hour Changes" })).toBe(false);
    expect(hasTalk({ speaker: "Clark G. Gilbert" })).toBe(false);
  });

  it("never counts a topic, and never crashes on nothing", async () => {
    const { hasTalk } = await import("../src/lib/domain/lesson");
    expect(hasTalk({ topic: "Ministering" })).toBe(false);
    expect(hasTalk(null)).toBe(false);
    expect(hasTalk({})).toBe(false);
  });
});

describe("what the label is on its own", () => {
  it("is Today only when the Sunday is today", async () => {
    const { sundayLabel } = await import("../src/lib/domain/lesson");
    expect(sundayLabel("2026-09-06", "2026-09-06", true)).toBe("Today");
    expect(sundayLabel("2026-09-06", "2026-09-02", true)).toBe("Next Sunday Lesson");
  });

  it("keeps LESSON off a week without one", async () => {
    const { sundayLabel } = await import("../src/lib/domain/lesson");
    expect(sundayLabel("2026-11-29", "2026-11-25", false)).toBe("Next Sunday");
  });

  it("doesn't call a missing Sunday today", async () => {
    // The presidency card passes undefined when nothing is scheduled at all.
    const { sundayLabel } = await import("../src/lib/domain/lesson");
    expect(sundayLabel(undefined, "2026-09-06", false)).toBe("Next Sunday");
    expect(sundayLabel("", "", true)).toBe("Next Sunday Lesson");
  });
});

describe("the banner and the email agree", () => {
  it("ask the same question about whether there's a talk", async () => {
    const { hasTalk } = await import("../src/lib/domain/lesson");
    const { buildEmailText } = await import("../src/lib/domain/weeklyEmail");

    const cases = [
      { teacher_name: "Karl Ricks", topic: "Ministering" },
      { teacher_name: "Karl Ricks", talk_title: "2nd Hour Changes" },
      { teacher_name: "Karl Ricks", talk_title: "Come Home", speaker: "Clark G. Gilbert" },
      { teacher_name: "Karl Ricks", talk_link: "https://example.org/talk" },
      { teacher_name: "Karl Ricks" },
    ];
    for (const lesson of cases) {
      const txt = buildEmailText({
        sundayIso: "2026-09-06", lesson, announcements: [], events: [],
        senderName: "Karl", siteUrl: "https://eqhq.netlify.app",
      });
      expect(
        txt.includes("Please read the talk before Sunday."),
        `email disagrees with hasTalk for ${JSON.stringify(lesson)}`
      ).toBe(hasTalk(lesson));
    }
  });
});
