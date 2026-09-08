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
