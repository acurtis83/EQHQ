import { render, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import AgendaPrint from "../src/components/AgendaPrint";
import { choosePrintPlan, signUpLine } from "../src/lib/domain/printPlan";
import { eventSignUpHref } from "../src/lib/domain/upcomingAction";

/**
 * "need to take a look at the Stake Temple Cleaning Assignment. the SignUP
 *  link is not showing on the Sunday Meeting Agenda"
 *
 * A planner event keeps its sign-up in one of two places: a `form_id`, which
 * is one of the app's own forms, or a `link_url` the presidency marked as a
 * sign-up, which is how anything the stake runs arrives. The feed and the
 * weekly email had both been taught to look in both places. The Sunday agenda
 * still checked only `form_id`, so the stake's temple cleaning rota showed a
 * Sign Up everywhere except the one list that gets read out on Sunday.
 *
 * The fixture below has one of each kind plus a plain details link, because a
 * fixture with only the broken case scores the same against "check form_id
 * only" and against "show every link_url" — and the second of those puts a
 * Sign Up button on a map.
 */

let EVENTS = [];
let EVENT_DATES = [];
let AGENDA = null;

function table(name) {
  const rows =
    name === "events" ? EVENTS :
    name === "event_dates" ? EVENT_DATES :
    name === "members" ? [] : [];

  const chain = (result) => {
    const p = Promise.resolve(result);
    return new Proxy(p, {
      get(t, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
        if (prop === "maybeSingle") {
          return () => Promise.resolve({ data: name === "agendas" ? AGENDA : null, error: null });
        }
        if (prop === "single") {
          return () => Promise.resolve({ data: name === "agendas" ? AGENDA : { id: "x" }, error: null });
        }
        return () => chain(result);
      },
    });
  };
  return chain({ data: rows, error: null });
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (t) => table(t),
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
  useAuth: () => ({ presidency: { name: "Drew Curtis" }, isPresidency: true, ready: true, signOut() {} }),
}));

// Sunday 6 September 2026.
const NOW = new Date(2026, 8, 6, 9, 0, 0);

const STAKE_URL = "https://www.signupgenius.com/go/timp-temple-cleaning-holbrook8";
const FORM_ID = "ab4a4bc9-2f31-4d8e-9a77-1c0be5d2f8a3";

const THREE = [
  // The one Drew reported. No form of our own — the stake runs the rota — so
  // the sign-up is an outside link the presidency ticked as one.
  { id: "temple", kind: "temple", title: "Stake Temple Cleaning Assignment",
    event_date: "2026-09-19", event_time: "8:00 AM", location: "Mount Timpanogos Temple",
    link_url: STAKE_URL, link_is_signup: true },
  // One of ours, which is the case that already worked.
  { id: "bbq", kind: "activity", title: "Quorum BBQ", event_date: "2026-09-23",
    form_id: FORM_ID },
  // A place to look at, not a thing to sign up for. Giving this a Sign Up
  // promises an action the page doesn't offer.
  { id: "night", kind: "activity", title: "Ward Temple Night", event_date: "2026-09-25",
    link_url: "https://maps.example/timp", link_label: "Details" },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  EVENTS = THREE.map((e) => ({ ...e }));
  EVENT_DATES = [];
  AGENDA = { id: "a1", kind: "sunday", meeting_date: "2026-09-06", carried_over: true };
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

/* ----------------------------- the rule itself ---------------------------- */

describe("where an event keeps its sign-up", () => {
  it("our own form, as a link into the app", () => {
    expect(eventSignUpHref({ form_id: FORM_ID })).toBe(`?f=${FORM_ID}`);
  });

  it("a stake link the presidency marked as a sign-up", () => {
    expect(eventSignUpHref({ link_url: STAKE_URL, link_is_signup: true })).toBe(STAKE_URL);
  });

  it("or one whose label says so, for a link typed in by hand", () => {
    expect(eventSignUpHref({ link_url: STAKE_URL, link_label: "Sign Up" })).toBe(STAKE_URL);
  });

  it("but not a link that only offers something to read", () => {
    expect(eventSignUpHref({ link_url: "https://maps.example/timp", link_label: "Details" })).toBe("");
  });

  it("and nothing at all when there's no link and no form", () => {
    expect(eventSignUpHref({ title: "Ministering interviews" })).toBe("");
  });

  it("prefers our own form when an event somehow has both", () => {
    // The form collects something; the outside page is background. Offering
    // both would ask the same brother the same question twice.
    expect(eventSignUpHref({ form_id: FORM_ID, link_url: STAKE_URL, link_is_signup: true }))
      .toBe(`?f=${FORM_ID}`);
  });
});

/* ------------------------- the agenda on the screen ----------------------- */

describe("Upcoming Events on the Sunday agenda", () => {
  async function mount() {
    vi.setSystemTime(NOW);
    const { default: SundayAgenda } = await import("../src/presidency/SundayAgenda");
    let dom;
    await act(async () => {
      dom = render(<SundayAgenda />);
      await new Promise((r) => setTimeout(r, 30));
    });
    return dom;
  }

  /** Every "Sign up" anchor on the page, by where it points. */
  const signUps = () =>
    [...document.querySelectorAll("a")]
      .filter((a) => a.textContent.trim() === "Sign up")
      .map((a) => a.getAttribute("href"));

  it("offers the stake's sign-up, not just our own forms", async () => {
    const dom = await mount();
    expect(dom.container.textContent).toContain("Stake Temple Cleaning Assignment");
    expect(signUps(), "the stake rota still has no Sign Up on the agenda")
      .toContain(STAKE_URL);
  });

  it("still offers our own form", async () => {
    await mount();
    expect(signUps()).toContain(`?f=${FORM_ID}`);
  });

  it("and gives a details link none", async () => {
    await mount();
    expect(signUps()).not.toContain("https://maps.example/timp");
    // Exactly the two above: a third would mean something got a Sign Up that
    // isn't one.
    expect(signUps()).toHaveLength(2);
  });
});

/* --------------------------- the agenda on paper -------------------------- */

/**
 * The printed sheet used to carry no links at all — deliberately, because
 * three or four lines an item is what forces the page down to nine point. The
 * Upcoming panel is the exception Drew asked for: it's the part that gets read
 * out, and announcing a sign-up without saying where is worse than silence.
 */
describe("the printed Upcoming panel", () => {
  const ORIGIN = "https://eqhq.netlify.app";

  function print(events, extra = {}) {
    render(
      <AgendaPrint
        agenda={{ meeting_date: "2026-09-06" }}
        sections={[{ key: "items", label: "Agenda Items" }]}
        bySection={{ items: [] }}
        events={events}
        origin={ORIGIN}
        {...extra}
      />
    );
    return [...document.querySelectorAll("[data-eq-signup]")].map((d) => d.textContent);
  }

  it("prints the stake's URL under the event", () => {
    expect(print([THREE[0]])).toEqual(["Sign up: signupgenius.com/go/timp-temple-cleaning-holbrook8"]);
  });

  it("prints one of our own forms as something typeable", () => {
    // Stored as a bare "?f=<uuid>", which on paper is nothing at all.
    expect(print([THREE[1]])).toEqual([`Sign up: eqhq.netlify.app/?f=${FORM_ID}`]);
  });

  it("prints nothing for an event with only a details link", () => {
    expect(print([THREE[2]])).toEqual([]);
  });

  it("never shortens a URL, because a shortened one doesn't work", () => {
    const long = "https://www.signupgenius.com/go/10c0d4aa8ac2ba1fbc16-stake#/invitation/slot";
    const line = signUpLine({ link_url: long, link_is_signup: true });
    expect(line).toContain("10c0d4aa8ac2ba1fbc16-stake#/invitation/slot");
    expect(line).not.toContain("…");
    expect(line).not.toContain("...");
  });

  it("drops the scheme and the www, which nobody has to type", () => {
    expect(signUpLine({ link_url: "https://www.example.org/go/", link_is_signup: true }))
      .toBe("Sign up: example.org/go");
  });

  /**
   * The estimate has to charge for the line, or the fitter picks a type size
   * for a page that is taller than it thinks — and a sheet that measures as
   * fitting comes out of the printer as two.
   */
  it("is charged against the page height", () => {
    const bare = { ...THREE[0], link_url: null, link_is_signup: false };
    const tall = choosePrintPlan({ events: [THREE[0]], origin: ORIGIN }).height;
    const short = choosePrintPlan({ events: [bare], origin: ORIGIN }).height;
    expect(tall).toBeGreaterThan(short);
  });

  it("and charged by the line it wraps to, not a flat one line", () => {
    // Half a page wide is about fifty characters at 12pt. A stake sign-up URL
    // routinely runs past that, and charging one line for a two-line URL is
    // 16px a time — three events and the sheet is over.
    const short = { id: "s", kind: "activity", title: "A", event_date: "2026-09-19",
      link_url: "https://x.io/s", link_is_signup: true };
    const long = { ...short,
      link_url: `https://www.signupgenius.com/go/${"a".repeat(90)}` };
    expect(choosePrintPlan({ events: [long], origin: ORIGIN }).height)
      .toBeGreaterThan(choosePrintPlan({ events: [short], origin: ORIGIN }).height);
  });
});
