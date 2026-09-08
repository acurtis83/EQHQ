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
    agendas: [{ id: "a1", kind: "sunday", meeting_date: "2026-09-13" }],
    agenda_items: [],
    teaching_assignments: [],
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

async function openEmail() {
  const { default: SecretaryEmail } = await import("../src/presidency/SecretaryEmail");
  let dom;
  await act(async () => {
    dom = render(<SecretaryEmail />);
    await new Promise((r) => setTimeout(r, 40));
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Weekly Email"));
    await new Promise((r) => setTimeout(r, 40));
  });
  return dom.container.querySelector("textarea").value;
}

describe("the Monday email", () => {
  it("lists the events between now and that Sunday", async () => {
    const body = await openEmail();
    expect(body, "the blood drive on the Friday is missing").toContain("Stake Blood Drive");
    expect(body).toContain("9/11 National Day of Service");
  });

  it("and still lists the ones after it", async () => {
    const body = await openEmail();
    expect(body).toContain("Basketball");
  });

  it("with the sign-up link, not a details link", async () => {
    const body = await openEmail();
    expect(body).toMatch(/Sign up for the Stake Blood Drive here: https:\/\/redcrossblood\.org/);
    expect(body).not.toMatch(/Details for the Stake Blood Drive/);
  });

  it("in date order", async () => {
    const body = await openEmail();
    expect(body.indexOf("Stake Blood Drive")).toBeLessThan(body.indexOf("Basketball"));
  });

  it("and never filters events by category", async () => {
    // The regression this is really guarding. A hardcoded kind list has
    // shipped twice — once on this screen, once on the Sunday agenda — and
    // both times it silently dropped every category the ward had added, with
    // no error and nothing on screen to say why. Service is a ward-added
    // category, which is exactly why Drew read the missing blood drive as
    // "Service events are excluded".
    const body = await openEmail();
    for (const title of ["Stake Blood Drive", "9/11 National Day of Service", "Basketball"]) {
      expect(body, `${title} fell out of the email`).toContain(title);
    }
  });
});
