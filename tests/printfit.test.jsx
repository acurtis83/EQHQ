import { render, cleanup, act } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import AgendaPrint from "../src/components/AgendaPrint";
import { AGENDA_CATEGORIES } from "../src/lib/domain/agendaCategories";
import {
  PRINTABLE_H, TIER, BODY_PT, FLOOR_PT, ITEM_RULES, PT, RULE_TOTAL,
  choosePrintPlan, writeLinesFor,
} from "../src/lib/domain/printPlan";

/**
 * The printed page: one fixed size, and the leftover ruled for notes.
 *
 * The agenda used to choose its own type size, walking a ladder of eight
 * densities until the page fitted — so one week printed at 13.5pt and the next
 * at 9.6pt. It's twelve point now whatever the agenda looks like, and the only
 * thing still measured is how many writing lines the remaining space is worth.
 *
 * jsdom has no layout engine, so every height is 0 — which is the case the
 * component has to survive by standing on the estimate. For the other case
 * this stands in a fake layout engine.
 */

const ITEMS = Array.from({ length: 11 }, (_, i) => ({
  id: i, section: "items", text: "Follow up with the brethren about item " + i,
  category: AGENDA_CATEGORIES[i % 6].key, due_date: "2026-09-06",
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

/** @param {number} contentH what the content measures, in px. */
function fakeLayout(contentH) {
  const real = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute && this.hasAttribute("data-eq-footer")) return { height: 17, width: 700 };
    if (this.hasAttribute && this.hasAttribute("data-eq-content")) return { height: contentH, width: 700 };
    return real.call(this);
  };
  return () => { Element.prototype.getBoundingClientRect = real; };
}

const sheetEl = () => document.querySelector("[data-eq-sheet]");
const bodyPx = () => parseFloat(sheetEl().style.fontSize);
const ruleCount = () => [...document.querySelectorAll("div")]
  .filter((d) => d.style.height === "22px" && d.style.borderBottom).length;

let restore = () => {};
beforeEach(() => { restore = () => {}; });
afterEach(() => { restore(); cleanup(); });

describe("the printed page", () => {
  it("is twelve point, stated in points", async () => {
    await act(async () => { render(sheet()); });
    expect(bodyPx()).toBeCloseTo(BODY_PT * PT, 2);
    expect(bodyPx() / PT).toBeCloseTo(12, 2);
  });

  it("steps down for a long agenda, but only to the floor", async () => {
    // The size is no longer fixed — a busy week shrinks rather than spilling
    // onto a second sheet. What is fixed is the range: twelve point at the top
    // and ten at the bottom, which is a difference you have to look for, so
    // the sheet still reads as the same document week to week.
    await act(async () => { render(sheet({ bySection: { items: ITEMS.slice(0, 2) } })); });
    const short = bodyPx();
    expect(short / PT).toBeCloseTo(12, 2);
    cleanup();

    const many = Array.from({ length: 40 }, (_, i) => ({ ...ITEMS[i % 11], id: i }));
    await act(async () => { render(sheet({ bySection: { items: many } })); });
    const long = bodyPx();

    expect(long, "a long agenda should shrink").toBeLessThan(short);
    expect(long / PT, "and never below the floor").toBeCloseTo(FLOOR_PT, 2);
  });

  it("gives every item ruled space to write beside it", async () => {
    // The right half of the sheet used to be blank margin. This is the change
    // Drew asked for, so it's asserted rather than looked at.
    await act(async () => { render(sheet()); });
    const rows = document.querySelectorAll("[data-eq-item]");
    expect(rows.length).toBe(ITEMS.length);

    for (const row of rows) {
      expect(row.children.length, "a name cell and a note cell").toBe(2);
      const rules = row.children[1].children;
      expect(rules.length, "two writing rules").toBe(ITEM_RULES);
      // Real borders. A background gradient looks the same on screen and
      // prints as nothing at all unless the person ticks "Background graphics".
      for (const r of rules) {
        expect(r.style.borderBottom).toMatch(/1px solid/);
        expect(r.style.background || "").toBe("");
      }
    }
  });

  it("heads the note column so the space reads as deliberate", async () => {
    await act(async () => { render(sheet()); });
    expect(document.body.textContent).toContain("Notes");
  });

  it("never pins the column to a fixed page height", async () => {
    // A hard min-height is one of the things that makes browsers scale a sheet.
    await act(async () => { render(sheet()); });
    expect(sheetEl().style.minHeight).toBe("");
  });

  it("asks for the page width in inches, not a percentage", async () => {
    // "width: auto" on body doesn't resolve to the page box in Chrome — it
    // keeps the window width, so the sheet laid out at 1280px against a 7.3in
    // printable area and the whole page was scaled to 55%. Twelve point
    // printed at six and a half with the bottom of the sheet blank.
    await act(async () => { render(sheet()); });
    const css = document.querySelector(".eq-print-root style").textContent;
    expect(css).toContain("width: 7.3in !important");
    expect(css).not.toContain("width: auto !important");
  });

  it("keeps the estimate where there's no layout engine", async () => {
    // Every rect is 0 in jsdom. Read naively that says the page is empty and
    // the writing block would fill the sheet with rules.
    const estimate = choosePrintPlan({
      sections: [{ key: "items", label: "Agenda Items", items: ITEMS }],
      events: [],
    });
    await act(async () => { render(sheet()); });
    expect(ruleCount()).toBe(estimate.writeLines);
  });

  it("rules the leftover once the browser has measured it", async () => {
    restore = fakeLayout(500);
    await act(async () => { render(sheet()); });
    expect(ruleCount()).toBe(writeLinesFor(TIER, 500 + 17 + 12));
    expect(ruleCount()).toBeGreaterThan(0);
  });

  it("draws no writing block at all when the page is full", async () => {
    // It used to insist on a minimum of three lines, which turned a page with
    // room for two into a page the fitter called too long.
    restore = fakeLayout(940);
    await act(async () => { render(sheet()); });
    expect(ruleCount()).toBe(0);
  });

  it("never rules past the bottom of the sheet", async () => {
    // The writing block only ever uses space that's already left over, so it
    // can never be the thing that pushes a page onto a second sheet. A page
    // whose content alone overruns is a different problem, and the screen
    // warns about that one — so it's excluded here rather than asserted away.
    for (const contentH of [200, 500, 700, 850]) {
      restore = fakeLayout(contentH);
      await act(async () => { render(sheet()); });

      const spent = contentH + 17 + 12;
      expect(spent, "this case is meant to fit").toBeLessThanOrEqual(PRINTABLE_H);
      const block = ruleCount() ? ruleCount() * RULE_TOTAL + 45 : 0;
      expect(spent + block, `content ${contentH} overran with ${ruleCount()} lines`)
        .toBeLessThanOrEqual(PRINTABLE_H);

      restore();
      cleanup();
    }
  });

  it("draws the writing rules as borders, not a background", async () => {
    // Browsers don't print background images unless the person ticks
    // "Background graphics", so the ruled area used to come out blank.
    restore = fakeLayout(400);
    await act(async () => { render(sheet()); });
    expect(ruleCount()).toBeGreaterThanOrEqual(3);
    expect(document.body.innerHTML).not.toContain("repeating-linear-gradient");
  });
});
