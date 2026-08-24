import { render, cleanup, act } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import AgendaPrint from "../src/components/AgendaPrint";
import { AGENDA_CATEGORIES } from "../src/lib/domain/agendaCategories";
import { PRINTABLE_H, TIERS, choosePrintPlan } from "../src/lib/domain/printPlan";

/**
 * The print layout measuring itself.
 *
 * jsdom has no layout engine, so every height is 0 — which is exactly the case
 * the component has to survive by falling back to the estimate. To test the
 * other case, this stands in a fake layout engine: content height scales with
 * the chosen type size, the way a real page does.
 *
 * That's enough to check the two things that matter and that no amount of
 * arithmetic in printPlan.js can promise — the tier walks up when there's room
 * on the sheet, and the loop always stops.
 */

const ITEMS = Array.from({ length: 11 }, (_, i) => ({
  id: i, section: "items", text: "Follow up with the brethren about item " + i,
  category: AGENDA_CATEGORIES[i % 6].key, who: "Cam Pearson", due_date: "2026-09-06",
}));

// A heavy week. Used wherever the test needs the estimate to open somewhere
// other than the loosest tier — otherwise "it didn't blow the type up" and
// "it climbed to the top" are the same observation.
const MANY = Array.from({ length: 24 }, (_, i) => ({
  id: i, section: "items", text: "Follow up with the brethren about item " + i,
  category: AGENDA_CATEGORIES[i % 6].key, who: "Cam Pearson",
  due_date: "2026-09-06", notes: "Report back before the next meeting.",
}));

function sheet(extra = {}) {
  return (
    <AgendaPrint
      agenda={{ meeting_date: "2026-08-26", meeting_time: "7:00 AM", location: "Cam's House" }}
      sections={[{ key: "items", label: "Agenda Items" }]}
      bySection={{ items: ITEMS }}
      events={[]}
      categories={AGENDA_CATEGORIES}
      {...extra}
    />
  );
}

/**
 * @param {number} pxPerPt how tall the content is per point of body size.
 *   Tuned per test to put the "right" answer at a known tier.
 */
function fakeLayout(pxPerPt) {
  const real = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute && this.hasAttribute("data-eq-footer")) return { height: 18, width: 700 };
    if (this.hasAttribute && this.hasAttribute("data-eq-content")) {
      const sheetEl = this.closest("[data-eq-sheet]");
      const body = parseFloat((sheetEl && sheetEl.style.fontSize) || "10");
      return { height: body * pxPerPt, width: 700 };
    }
    return real.call(this);
  };
  return () => { Element.prototype.getBoundingClientRect = real; };
}

const tierOf = () => {
  const el = document.querySelector("[data-eq-sheet]");
  return el && el.getAttribute("data-eq-tier");
};
const bodyOf = () => parseFloat(document.querySelector("[data-eq-sheet]").style.fontSize);

let restore = () => {};
beforeEach(() => { restore = () => {}; });
afterEach(() => { restore(); cleanup(); });

describe("the printed page measures itself", () => {
  it("keeps the estimate where there's no layout engine", async () => {
    // Plain jsdom: every rect is 0. Read naively that says the page is empty,
    // and the type would blow up to the largest tier on every server render
    // and in every test. It has to recognise "no layout" and stand pat on
    // exactly what printPlan.js worked out.
    const estimate = choosePrintPlan({
      sections: [{ key: "items", label: "Agenda Items", items: MANY }],
      events: [],
    });
    expect(estimate.name).not.toBe(TIERS[0].name);   // or the check proves nothing

    await act(async () => { render(sheet({ bySection: { items: MANY } })); });

    expect(tierOf()).toBe(estimate.name);
  });

  it("walks the type up when the sheet has room", async () => {
    // A long agenda, so the estimate opens conservatively — and a layout that
    // turns out to be roomy, which is the exact situation that produced a
    // 9.6pt page with the bottom quarter blank. It has to climb all the way to
    // the loosest tier rather than trusting the estimate it started from.
    restore = fakeLayout(40);
    await act(async () => { render(sheet({ bySection: { items: MANY } })); });

    expect(tierOf()).toBe(TIERS[0].name);
    expect(bodyOf() * 40).toBeLessThanOrEqual(PRINTABLE_H);
  });

  it("fills the sheet rather than stopping short", async () => {
    restore = fakeLayout(55);
    await act(async () => { render(sheet()); });

    const content = bodyOf() * 55;
    expect(content).toBeLessThanOrEqual(PRINTABLE_H);
    expect(content).toBeGreaterThan(PRINTABLE_H * 0.7);
  });

  it("walks it down when the content overruns", async () => {
    restore = fakeLayout(110);
    await act(async () => { render(sheet()); });

    expect(bodyOf() * 110).toBeLessThanOrEqual(PRINTABLE_H);
  });

  it("stops even when no tier is comfortable", async () => {
    // Every tier overflows. It has to settle on the smallest and stop, not
    // oscillate — a render loop here would hang the print dialog.
    restore = fakeLayout(400);
    await act(async () => { render(sheet()); });
    expect(tierOf()).toBe(TIERS[TIERS.length - 1].name);
  });

  it("draws the writing rules as borders, not a background", async () => {
    // Browsers don't print background images unless the person ticks
    // "Background graphics", so the ruled area used to come out blank.
    restore = fakeLayout(55);
    await act(async () => { render(sheet()); });

    const ruled = [...document.querySelectorAll("div")]
      .filter((d) => d.style.borderBottom === "1px solid rgb(217, 217, 217)");
    expect(ruled.length).toBeGreaterThanOrEqual(3);
    expect(document.body.innerHTML).not.toContain("repeating-linear-gradient");
  });

  it("never pins the column to a fixed page height", async () => {
    // A hard min-height is what makes browsers scale the whole sheet down.
    restore = fakeLayout(55);
    await act(async () => { render(sheet()); });
    expect(document.querySelector("[data-eq-sheet]").style.minHeight).toBe("");
  });
});
