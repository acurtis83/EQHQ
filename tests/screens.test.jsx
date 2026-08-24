import { render, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Every screen has to survive being rendered.
 *
 * This exists because three separate bugs shipped that the build was perfectly
 * happy with and every text-matching test passed: a component using an icon it
 * never imported, a `const` read twenty lines before its own declaration, and a
 * banner referencing a variable that lived in a different component. All three
 * looked identical from outside — a blank screen.
 *
 * None of those are catchable by reading source as text. They need the thing
 * actually rendered. So: mount each screen against a Supabase that answers
 * everything with an empty list, and fail on any React error.
 *
 * An empty database is also the least-covered case in normal use — a fresh
 * install, or a week with nothing planned yet — so this doubles as the check
 * that none of the screens assume they have data.
 */

// A stub that satisfies any chain of query builder calls and resolves to an
// empty result, so `from(...).select(...).eq(...).order(...)` works whatever
// order it's written in.
function query() {
  const result = Promise.resolve({ data: [], error: null });
  const proxy = new Proxy(result, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return target[prop].bind(target);
      }
      // maybeSingle() is a lookup that finds nothing — the empty-database
      // case. single() follows an insert, which does hand a row back, so it
      // returns one; a stub that returned null there would be modelling a
      // failure rather than an empty database.
      if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
      if (prop === "single") {
        return () => Promise.resolve({ data: { id: "stub-row" }, error: null });
      }
      return () => proxy;
    },
  });
  return proxy;
}

// Realtime, stubbed enough to be subscribed to and torn down.
function channel() {
  const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
  return ch;
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => query(),
    channel: () => channel(),
    removeChannel: () => {},
    storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: {} }) }) },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

vi.mock("../src/lib/useAuth", () => ({
  useAuth: () => ({ presidency: { name: "Test" }, isPresidency: true, ready: true, signOut() {} }),
}));

const SCREENS = [
  ["Presidency meetings and planner", () => import("../src/presidency/Presidency.jsx")],
  ["Presidency home", () => import("../src/presidency/HomeHub.jsx")],
  ["Sunday agenda", () => import("../src/presidency/SundayAgenda.jsx")],
  ["Secretary email", () => import("../src/presidency/SecretaryEmail.jsx")],
  ["Planning", () => import("../src/presidency/Planning.jsx")],
  ["Callings", () => import("../src/presidency/Callings.jsx")],
  ["Forms", () => import("../src/presidency/Forms.jsx")],
  ["Roster", () => import("../src/presidency/Roster.jsx")],
  ["Feed", () => import("../src/member/Feed.jsx")],
];

afterEach(cleanup);

describe("every screen renders", () => {
  for (const [name, load] of SCREENS) {
    it(`${name} mounts with an empty database`, async () => {
      const mod = await load();
      const Screen = mod.default;

      const fatal = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
        fatal.push(args.map(String).join(" "));
      });

      try {
        // Rendering alone only exercises the loading branch — every one of
        // these screens fetches before it shows anything. Without letting the
        // effects settle, this would pass on a screen that throws the moment
        // its data arrives, which is exactly the bug it exists to catch.
        await act(async () => {
          render(<Screen onGo={() => {}} onCountChange={() => {}} onFocusHandled={() => {}} />);
          await Promise.resolve();
          await new Promise((r) => setTimeout(r, 0));
        });
      } finally {
        spy.mockRestore();
      }

      // React logs component errors through console.error before rethrowing.
      // These are the ones that mean a blank screen.
      const blank = fatal.filter((e) =>
        /is not defined|before initialization|is not a function|Cannot read propert/.test(e));
      expect(blank, `${name} threw:\n${blank.join("\n")}`).toEqual([]);
    });
  }
});
