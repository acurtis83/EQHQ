import { describe, it, expect } from "vitest";
import {
  sundayOptions, defaultSunday, LOOKBACK_DAYS, PAST_SHOWN,
} from "../src/lib/domain/sundayPicker";

/**
 * Which Sundays the presidency can open.
 *
 * "i need to be able to see the previous Sunday Agendas so I can edit the
 *  Announcements"
 *
 * Pure, so a year of picker behaviour is checked here rather than by clicking
 * through it. The interesting case isn't that past Sundays appear — it's that
 * adding them doesn't move where the screens open.
 */

const SUN = "2026-09-13";   // a Sunday
const WED = "2026-09-09";   // midweek, which is when anybody actually looks

describe("the Sunday picker", () => {
  it("offers recent Sundays as well as coming ones", () => {
    const opts = sundayOptions(WED, new Set());
    expect(opts.some((s) => s.past)).toBe(true);
    expect(opts.some((s) => !s.past)).toBe(true);
  });

  it("reads forwards in time", () => {
    const dates = sundayOptions(WED, new Set()).map((s) => s.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("marks which ones have already happened", () => {
    for (const s of sundayOptions(WED, new Set())) {
      expect(s.past, s.date).toBe(s.date < WED);
    }
  });

  it("doesn't reach back further than the lookback", () => {
    const oldest = sundayOptions(WED, new Set())[0].date;
    const floor = new Date(Date.parse(`${WED}T00:00:00Z`) - LOOKBACK_DAYS * 86400000)
      .toISOString().slice(0, 10);
    expect(oldest >= floor).toBe(true);
  });

  it("keeps the past list short", () => {
    expect(sundayOptions(WED, new Set()).filter((s) => s.past).length)
      .toBeLessThanOrEqual(PAST_SHOWN);
  });

  it("and still offers a full run of coming Sundays", () => {
    // The bug this guards: slicing the first N of the combined list would
    // have spent the whole allowance on old meetings and cut off the ones
    // being planned, which is what the screen is mainly for.
    const ahead = sundayOptions(WED, new Set(), { ahead: 8 }).filter((s) => !s.past);
    expect(ahead.length).toBe(8);
  });
});

describe("where the screens open", () => {
  it("on the next meeting with a lesson, not the first in the list", () => {
    const opts = sundayOptions(WED, new Set());
    const picked = defaultSunday(opts, WED);
    // The trap: the old rule took the first teaching Sunday in the list, and
    // once past Sundays joined the front, "first" became one in July. The
    // screen would still have worked — it would just have opened on the wrong
    // week, every time, with nothing to complain about.
    expect(picked >= WED).toBe(true);
    expect(picked).toBe(opts.find((s) => !s.past && s.teaches).date);
  });

  it("and today counts, when today is Sunday", () => {
    const opts = sundayOptions(SUN, new Set());
    expect(defaultSunday(opts, SUN)).toBe(SUN);
    expect(opts.find((s) => s.date === SUN).past).toBe(false);
  });

  it("falls forward to a non-teaching Sunday rather than backwards", () => {
    // Conference weekend: the next Sunday has no lesson. Better to open on it
    // than on a meeting that has already happened.
    const opts = [
      { date: "2026-09-06", teaches: true, past: true },
      { date: "2026-09-13", teaches: false, past: false },
    ];
    expect(defaultSunday(opts, "2026-09-09")).toBe("2026-09-13");
  });

  it("and copes with nothing ahead at all", () => {
    const opts = [{ date: "2026-09-06", teaches: true, past: true }];
    expect(defaultSunday(opts, "2026-09-09")).toBe("2026-09-06");
    expect(defaultSunday([], "2026-09-09")).toBe("");
  });
});
