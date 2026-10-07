import { readFileSync } from "node:fs";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  usageEvent, deviceId, usageSummary, weekOf, LABELS, OTHER, KIND, DEVICE_KEY, DEVICE_YEAR_KEY,
} from "../src/lib/domain/usage";

/**
 * "can we add a tracker in the settings to view how many people are using the
 *  app or clicking on links weekly?"
 *
 * Eighty brothers is a small enough population that a device id, a timestamp
 * and a roster get most of the way to a name. So most of what is worth
 * testing here is what the app must NOT be able to send, and that a failure
 * to count can never break the thing being counted.
 */

/* ------------------------- what may leave the phone ----------------------- */

describe("what a recorded event may contain", () => {
  it("a kind, a known label and a device — nothing else", () => {
    const row = usageEvent(KIND.LINK, "signup", "dev-1");
    expect(Object.keys(row).sort()).toEqual(["device", "kind", "label"]);
  });

  it("and an unrecognised label becomes 'other' rather than travelling", () => {
    // The guard that matters. A future caller passing `label: post.title`
    // meaning well would otherwise send a sentence about somebody's family.
    expect(usageEvent(KIND.LINK, "Brother Hill's retirement open house", "d").label).toBe(OTHER);
    expect(usageEvent(KIND.LINK, "https://docs.google.com/spreadsheets/d/1Fo", "d").label).toBe(OTHER);
    expect(usageEvent(KIND.LINK, "andrew.curtis@example.com", "d").label).toBe(OTHER);
  });

  it("every label the app uses is on the allowed list", () => {
    for (const l of ["signup", "rsvp", "talk", "summary", "schedule", "groupme", "link"]) {
      expect(LABELS, `${l} would be recorded as "other"`).toContain(l);
    }
  });

  it("an open carries no label at all", () => {
    expect(usageEvent(KIND.OPEN, "signup", "d")).toEqual({ kind: "open", device: "d" });
  });

  it("and an unknown kind records nothing", () => {
    // A typo at a call site should write no row, not a row nobody can read
    // back later.
    expect(usageEvent("page_view", "signup", "d")).toBeNull();
    expect(usageEvent("", null, "d")).toBeNull();
  });
});

describe("the device id", () => {
  const store = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), map: m };
  };

  it("is remembered, so the same browser counts once", () => {
    const s = store();
    let n = 0;
    const uuid = () => `id-${++n}`;
    expect(deviceId(s, 2026, uuid)).toBe("id-1");
    expect(deviceId(s, 2026, uuid)).toBe("id-1");
  });

  it("but changes with the year, so it can't follow anybody for ever", () => {
    const s = store();
    let n = 0;
    const uuid = () => `id-${++n}`;
    expect(deviceId(s, 2026, uuid)).toBe("id-1");
    expect(deviceId(s, 2027, uuid)).toBe("id-2");
  });

  it("and storage being blocked gives an id rather than an exception", () => {
    // A member with cookies off should still be able to use the app. Counting
    // him twice is a far better failure than not loading.
    const blocked = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
    };
    expect(deviceId(blocked, 2026, () => "fresh")).toBe("fresh");
  });

  it("stores nothing but the id and the year", () => {
    const s = store();
    deviceId(s, 2026, () => "x");
    expect([...s.map.keys()].sort()).toEqual([DEVICE_KEY, DEVICE_YEAR_KEY].sort());
  });
});

/* ----------------------------- reading it back ---------------------------- */

describe("the weekly summary", () => {
  // Weeks start Monday, matching the email.
  it("puts a Sunday in the week that started the Monday before", () => {
    expect(weekOf("2026-10-07")).toBe("2026-10-05");   // Wednesday
    expect(weekOf("2026-10-05")).toBe("2026-10-05");   // the Monday itself
    expect(weekOf("2026-10-11")).toBe("2026-10-05");   // Sunday, same week
    expect(weekOf("2026-10-12")).toBe("2026-10-12");   // next Monday
  });

  const ROWS = [
    { week: "2026-10-05", kind: "open", label: null, events: 41, people: 34 },
    { week: "2026-10-05", kind: "link", label: "signup", events: 11, people: 9 },
    { week: "2026-10-05", kind: "link", label: "talk", events: 8, people: 7 },
    { week: "2026-09-28", kind: "open", label: null, events: 36, people: 28 },
    { week: "2026-09-28", kind: "link", label: "signup", events: 6, people: 5 },
  ];

  it("counts this week and compares it with last", () => {
    const s = usageSummary(ROWS, "2026-10-07");
    expect(s.people).toBe(34);
    expect(s.peopleWas).toBe(28);
    expect(s.opens).toBe(41);
    expect(s.tapsTotal).toBe(19);
    expect(s.tapsWas).toBe(6);
  });

  it("ranks the links by how often they were tapped", () => {
    const s = usageSummary(ROWS, "2026-10-07");
    expect(s.taps.map((t) => t.label)).toEqual(["signup", "talk"]);
  });

  it("doesn't add devices across labels, which would overcount people", () => {
    // The same brother appears under opens and under every link he tapped.
    // 34 + 9 + 7 would be a number with no meaning.
    const s = usageSummary(ROWS, "2026-10-07");
    expect(s.people).toBe(34);
  });

  it("and says plainly when nothing has been recorded", () => {
    const s = usageSummary([], "2026-10-07");
    expect(s.empty).toBe(true);
    expect(s.people).toBe(0);
    expect(s.taps).toEqual([]);
  });
});

/* ------------------------- the promises in the SQL ------------------------ */

describe("what the database allows", () => {
  const SQL = readFileSync(`${process.cwd()}/supabase/usage.sql`, "utf8");

  it("lets anyone insert but only the presidency read", () => {
    // Without this asymmetry a member's browser could count the quorum, or
    // pull the raw rows and correlate them against a roster.
    expect(SQL).toMatch(/for insert to anon, authenticated with check \(true\)/i);
    expect(SQL).toMatch(/for select using \(is_presidency\(\)\)/i);
    expect(SQL).not.toMatch(/grant select on usage_events to anon/i);
  });

  it("has nowhere to put a name, an IP or a post id", () => {
    const table = SQL.slice(SQL.indexOf("create table if not exists usage_events"),
                            SQL.indexOf("create index"));
    for (const col of ["name", "member", "ip", "user_agent", "post_id", "email", "text"]) {
      expect(table, `a ${col} column exists to be filled in`)
        .not.toMatch(new RegExp(`^\\s+${col}\\b`, "im"));
    }
  });

  it("caps the label, so a URL can't be smuggled into it", () => {
    expect(SQL).toMatch(/length\(label\) <= 40/);
  });

  it("stores a date rather than a timestamp for the event itself", () => {
    // An exact moment plus a device id is a movement log; a date is a count.
    expect(SQL).toMatch(/^\s+day date not null/im);
  });

  it("and forgets the detail after 90 days", () => {
    expect(SQL).toMatch(/delete from usage_events where day <[\s\S]*?- 90/);
    expect(SQL).toMatch(/if not is_presidency\(\) then/);
  });
});

/* ------------------------- counting never breaks it ----------------------- */

let INSERTS = [];
let FAIL = false;

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      insert: (row) => {
        INSERTS.push(row);
        return {
          then: (ok, bad) => {
            if (FAIL) { bad?.(new Error("relation usage_events does not exist")); }
            else ok?.({ error: null });
            return { catch: () => {} };
          },
        };
      },
    }),
    rpc: () => ({ then: (ok) => { ok?.({}); return { catch: () => {} } } }),
  },
}));

beforeEach(() => { INSERTS = []; FAIL = false; localStorage.clear(); });
afterEach(cleanup);

describe("recording", () => {
  const load = async () => {
    const m = await import("../src/lib/record");
    m.resetRecording();
    return m;
  };

  it("counts an open once per tab, however often the feed remounts", async () => {
    // The feed remounts on navigation and on a realtime update. Counting
    // those would make one brother checking the lesson look like a dozen —
    // worse than useless, because it would look like growth.
    const { recordOpen } = await load();
    recordOpen(); recordOpen(); recordOpen();
    expect(INSERTS.filter((r) => r.kind === "open")).toHaveLength(1);
  });

  it("sends only the allowed shape", async () => {
    const { recordTap } = await load();
    recordTap("signup");
    expect(Object.keys(INSERTS[0]).sort()).toEqual(["device", "kind", "label"]);
    expect(INSERTS[0].label).toBe("signup");
  });

  it("and a failed write never throws at the caller", async () => {
    // A member tapping a sign-up link must reach the sign-up whether or not
    // the counting worked. A tracker that can break the thing it measures is
    // worse than no tracker.
    FAIL = true;
    const { recordTap } = await load();
    expect(() => recordTap("signup")).not.toThrow();
  });
});

/* --------------------------- the member's buttons ------------------------- */

describe("a sign-up link on the feed", () => {
  it("still opens even when recording is broken", async () => {
    FAIL = true;
    const { default: Upcoming } = await import("../src/member/Upcoming");
    const post = {
      id: "p1", title: "Fall EQ BBQ", category: "activity",
      event_date: "2026-12-01", link_url: "https://x.io/signup", link_label: "Sign Up",
    };
    let dom;
    await act(async () => {
      dom = render(<Upcoming posts={[post]} name="" setName={() => {}} todayIso="2026-10-07" />);
    });
    const a = [...dom.container.querySelectorAll("a")].find((x) => x.textContent.includes("Sign Up"));
    expect(a, "no sign-up link rendered").toBeTruthy();
    expect(a.getAttribute("href")).toBe("https://x.io/signup");
    // The href is what matters: the anchor navigates whatever the handler does.
    expect(() => fireEvent.click(a)).not.toThrow();
    expect(INSERTS.some((r) => r.label === "signup")).toBe(true);
  });
});
