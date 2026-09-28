import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The Secretary card, mounted, all the way through to the email body.
 *
 * "The weekly email 'coming up' should include the Service activities also. I
 *  dont see the Blood Drive or its link on the email."
 *
 * The window rule is checked directly in announcements.test.jsx. This exists
 * because that passed with the screen not passing the window at all — proving
 * a rule works is not proving anything uses it, which is the third time this
 * has bitten in as many days.
 */

let TABLES = {};

/**
 * A stub that actually applies .eq() and .in().
 *
 * Most of this project's mocks ignore filters and hand back every row, which
 * is fine until the thing being tested is whether a filter exists. This suite
 * exists partly to guard against a hardcoded kind list coming back — that
 * regression has shipped twice, silently dropping every category the ward
 * added — and a stub that ignored .in() would have been perfectly happy with
 * one.
 */
function query(name) {
  const chain = (rows) => new Proxy(Promise.resolve({ data: rows, error: null }), {
    get(t, k) {
      if (k === "then" || k === "catch" || k === "finally") return t[k].bind(t);
      if (k === "maybeSingle") return () => Promise.resolve({ data: rows[0] || null, error: null });
      if (k === "single") return () => Promise.resolve({ data: rows[0] || { id: "x" }, error: null });
      if (k === "eq") {
        return (col, val) => chain(rows.filter((r) => r[col] === val));
      }
      if (k === "in") {
        return (col, vals) => chain(rows.filter((r) => (vals || []).includes(r[col])));
      }
      return () => chain(rows);
    },
  });
  return chain(TABLES[name] || []);
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
  useAuth: () => ({ presidency: { name: "Karl Moore" }, isPresidency: true, ready: true, signOut() {} }),
}));

// Monday 7 September 2026 — the day the note goes out, for Sunday the 13th.
const NOW = new Date(2026, 8, 7, 9, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  TABLES = {
    // The meeting that just happened, and what was announced at it.
    agendas: [{ id: "a1", kind: "sunday", meeting_date: "2026-09-06" }],
    agenda_items: [
      { id: "i1", agenda_id: "a1", section: "announcements", sort_order: 0,
        text: "Ministering interviews after church this week" },
    ],
    // The lesson being ANNOUNCED is the one on the 13th, not the 6th.
    teaching_assignments: [
      { date: "2026-09-13", teacher_name: "Nick Crump", talk_title: "Come Home" },
    ],
    calendar_exceptions: [],
    event_dates: [],
    posts: [],
    events: [
      // The Friday before the Sunday this email is about.
      { id: "blood", title: "Stake Blood Drive", kind: "service",
        event_date: "2026-09-11", event_time: "1PM", location: "Stake Center",
        link_url: "https://redcrossblood.org/drive/8th", link_is_signup: true },
      // ...and the Saturday.
      { id: "serve", title: "9/11 National Day of Service", kind: "service",
        event_date: "2026-09-12" },
      // After the Sunday, so this one was always making it in.
      { id: "bball", title: "Basketball", kind: "activity", event_date: "2026-09-17" },
    ],
  };
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

async function mount() {
  const { default: SecretaryEmail } = await import("../src/presidency/SecretaryEmail");
  let dom;
  await act(async () => {
    dom = render(<SecretaryEmail />);
    await new Promise((r) => setTimeout(r, 40));
  });
  return dom;
}

async function openEmail() {
  const dom = await mount();
  await act(async () => {
    fireEvent.click(screen.getByText("Weekly Email"));
    await new Promise((r) => setTimeout(r, 40));
  });
  return {
    body: dom.container.querySelector("textarea").value,
    // By its label, not "the first input on the page" — that one is the
    // announcement being edited on the card behind the sheet.
    subject: screen.getByLabelText("Subject").value,
  };
}

describe("the Monday email", () => {
  it("lists the events between the meeting and the Sunday it announces", async () => {
    const { body } = await openEmail();
    expect(body, "the blood drive on the Friday is missing").toContain("Stake Blood Drive");
    expect(body).toContain("9/11 National Day of Service");
  });

  it("and still lists the ones after it", async () => {
    const { body } = await openEmail();
    expect(body).toContain("Basketball");
  });

  it("with the sign-up link, not a details link", async () => {
    const { body } = await openEmail();
    expect(body).toMatch(/Sign up for the Stake Blood Drive here: https:\/\/redcrossblood\.org/);
    expect(body).not.toMatch(/Details for the Stake Blood Drive/);
  });

  it("in date order", async () => {
    const { body } = await openEmail();
    expect(body.indexOf("Stake Blood Drive")).toBeLessThan(body.indexOf("Basketball"));
  });

  it("and never filters events by category", async () => {
    // The regression this is really guarding. A hardcoded kind list has
    // shipped twice — once on this screen, once on the Sunday agenda — and
    // both times it silently dropped every category the ward had added, with
    // no error and nothing on screen to say why. Service is a ward-added
    // category, which is exactly why Drew read the missing blood drive as
    // "Service events are excluded".
    const { body } = await openEmail();
    for (const title of ["Stake Blood Drive", "9/11 National Day of Service", "Basketball"]) {
      expect(body, `${title} fell out of the email`).toContain(title);
    }
  });
});

/**
 * "if an announcement is added to the Sunday Meeting Agenda for 9/6....it
 *  should carry through the announcements that get emailed out the next day
 *  on monday...but that is labeled as the next week of 9/13"
 *
 * Three dates, and the screen used to use one of them for everything.
 */
describe("which Sunday is which", () => {
  it("carries the announcements from the meeting that just happened", async () => {
    const { body } = await openEmail();
    // Typed onto the 6th's agenda; goes out in Monday the 7th's email with no
    // carry-forward step in between for it to fall through.
    expect(body).toContain("Ministering interviews after church this week");
  });

  it("but announces the lesson from the Sunday coming", async () => {
    const { body } = await openEmail();
    expect(body).toContain("Nick Crump");
    expect(body).toContain("Come Home");
  });

  it("and calls itself the week it goes out in, not the week of the lesson", async () => {
    const { subject } = await openEmail();
    // Sent Monday 7 September. "Week of Sep 13" was a week that hadn't
    // started, about announcements made the day before.
    expect(subject).toBe("Elders Quorum — Week of Sep 7");
  });

  it("says on the card where each part comes from", async () => {
    const dom = await mount();
    const plan = dom.container.querySelector("[data-email-plan]");
    expect(plan, "nothing explains the flow").toBeTruthy();
    expect(plan.textContent).toMatch(/announced at the meeting on .*Sep 6/);
    expect(plan.textContent).toMatch(/coming up on .*Sep 13/);
    expect(plan.textContent).toMatch(/Week of Sep 7/);
  });

  it("and the picker is labelled as the meeting, not the lesson", async () => {
    const dom = await mount();
    const picker = dom.container.querySelector("select");
    expect(picker.value).toBe("2026-09-06");
    expect([...picker.options].every((o) => /^Meeting of /.test(o.textContent))).toBe(true);
  });
});

/* ---------------------------- condensing it ------------------------------- */

import {
  comingUp, withoutRestated, COMING_UP_SHOWN,
  buildEmailText, buildEmailHtml,
} from "../src/lib/domain/weeklyEmail";

/**
 * "can we just limit it to 3 items prioritizing anything in the next 7-14
 *  days? Also, if an announcement is a duplicate of an upcoming event we dont
 *  need doubles. We are trying to condense the email"
 *
 * Coming Up printed six events with no far horizon, so a temple assignment in
 * December sat next to Wednesday's barbecue at the same weight.
 */
describe("which events make the email", () => {
  const ev = (id, when) => ({ id, title: `Event ${id}`, when });
  const TODAY = "2026-09-28";

  it("three of them, soonest first", () => {
    const out = comingUp(
      [ev("d", "2026-10-20"), ev("a", "2026-09-30"), ev("c", "2026-10-08"), ev("b", "2026-10-02")],
      TODAY
    );
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(out).toHaveLength(COMING_UP_SHOWN);
  });

  it("prefers the fortnight over anything past it", () => {
    // The December temple assignment must not push out Wednesday's barbecue
    // just because it was entered first.
    const out = comingUp([ev("far", "2026-12-15"), ev("soon", "2026-09-30")], TODAY);
    expect(out.map((e) => e.id)).toEqual(["soon", "far"]);
  });

  it("but fills from beyond it rather than printing an empty section", () => {
    // A hard cutoff would tell the quorum nothing is coming when something is.
    const out = comingUp([ev("far", "2026-11-20"), ev("further", "2026-12-15")], TODAY);
    expect(out.map((e) => e.id)).toEqual(["far", "further"]);
  });

  it("and an undated one sorts last, being the least urgent by definition", () => {
    const out = comingUp([{ id: "tbc", title: "Still planning" }, ev("soon", "2026-09-30")], TODAY);
    expect(out.map((e) => e.id)).toEqual(["soon", "tbc"]);
  });
});

describe("announcements that restate an event", () => {
  const BBQ = { id: "e1", title: "Fall EQ BBQ", when: "2026-09-30" };
  const NOTE = { id: "n1", text: "Fall EQ BBQ on Wednesday at 6pm, kid friendly." };
  const OTHER = { id: "n2", text: "Church cleaning Saturday at 8am." };

  it("are dropped when the event is in the email", () => {
    const out = withoutRestated([NOTE, OTHER], [BBQ]);
    expect(out.map((a) => a.id)).toEqual(["n2"]);
  });

  it("but kept when the event got trimmed out", () => {
    // Then the announcement is the only place that information still appears,
    // and dropping it would lose it — the opposite of condensing.
    expect(withoutRestated([NOTE, OTHER], []).map((a) => a.id)).toEqual(["n1", "n2"]);
  });

  it("and an unrelated announcement is never touched", () => {
    expect(withoutRestated([OTHER], [BBQ])).toEqual([OTHER]);
  });
});


describe("the condensed email, whole", () => {
  const ARGS = {
    sundayIso: "2026-10-04",
    todayIso: "2026-09-28",
    lesson: { teacher_name: "Nick Crump", talk_title: "Alive in Christ" },
    announcements: [
      { id: "n1", text: "Fall EQ BBQ on Wednesday at 6pm, kid friendly." },
      { id: "n2", text: "Church cleaning Saturday at 8am, names G-L." },
      { id: "n3", text: "Ward Christmas Party tickets go on sale in October." },
    ],
    events: [
      { id: "e1", title: "Fall EQ BBQ", when: "2026-09-30", form_id: "bbq" },
      { id: "e2", title: "Temple Cleaning", when: "2026-10-03", link_url: "https://x.io/t", link_is_signup: true },
      { id: "e3", title: "Padel Night", when: "2026-10-09" },
      { id: "e4", title: "Ward Christmas Party", when: "2026-12-12" },
      { id: "e5", title: "Stake Conference", when: "2026-11-01" },
    ],
    siteUrl: "https://eqhq.netlify.app",
  };

  it("prints three events and says how many more", () => {
    const text = buildEmailText(ARGS);
    expect(text).toContain("Fall EQ BBQ");
    expect(text).toContain("Temple Cleaning");
    expect(text).toContain("Padel Night");
    // The event LISTING, not the string — an announcement may legitimately
    // name a trimmed event, and asserting on the bare title would pass or
    // fail for the wrong reason.
    expect(text, "a December event crowded out a near one")
      .not.toMatch(/— Ward Christmas Party —/);
    // Nothing is said about what was trimmed. The app link under the lesson
    // is the answer to "what else is on"; a second one at the bottom made a
    // deliberately short email read as apologising for its length.
    expect(text, "the trimmed-events line came back").not.toMatch(/more events? on the/);
  });

  it("drops the announcement that restates a listed event", () => {
    const text = buildEmailText(ARGS);
    expect(text).toContain("Church cleaning Saturday");
    // The BBQ has its own line under COMING UP with a date and a link; saying
    // it again four lines up is the same information twice.
    expect(text.match(/kid friendly/g), "the BBQ was announced twice").toBeNull();
  });

  it("but keeps one that restates an event the cap trimmed out", () => {
    // The Christmas Party didn't make the three, so this announcement is the
    // only place it appears at all. Deduping against every event rather than
    // the shown ones would delete it and mention it nowhere.
    const text = buildEmailText(ARGS);
    expect(text).not.toContain("Ward Christmas Party —");
    expect(text, "the only mention of a trimmed event was deleted")
      .toContain("tickets go on sale in October");
  });

  it("and the GroupMe invitation still closes it", () => {
    // It sits after COMING UP, which is the block the cap rewrote, so it is
    // exactly the line a careless trim would take with it.
    const text = buildEmailText({ ...ARGS, groupMeUrl: "https://groupme.com/join_group/123" });
    expect(text).toContain("EQ GroupMe");
    expect(text).toContain("https://groupme.com/join_group/123");
    const html = buildEmailHtml({ ...ARGS, groupMeUrl: "https://groupme.com/join_group/123" });
    expect(html).toContain("https://groupme.com/join_group/123");
  });

  it("and still carries every sign-up link", () => {
    // "lets still attach the links to event signups"
    const text = buildEmailText(ARGS);
    expect(text).toContain("https://eqhq.netlify.app/?f=bbq");
    expect(text).toContain("https://x.io/t");
  });

  it("the formatted copy agrees with the plain one", () => {
    // The secretary can hand-edit the plain text and send that instead, so an
    // email whose contents depended on which button he pressed would be a
    // difference nobody could explain.
    const html = buildEmailHtml(ARGS);
    expect(html).toContain("Padel Night");
    expect(html).not.toContain("<strong>Ward Christmas Party</strong>");
    expect(html).not.toContain("kid friendly");
    expect(html).not.toMatch(/more events? on the/);
  });
});
