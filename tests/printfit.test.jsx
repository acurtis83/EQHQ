import { render, cleanup, act } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import AgendaPrint from "../src/components/AgendaPrint";
import { AGENDA_CATEGORIES } from "../src/lib/domain/agendaCategories";
import {
  PRINTABLE_H, TIER, TIERS, BODY_PT, FLOOR_PT, ITEM_RULES, PT, RULE_TOTAL,
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

/* --------------------------- notes on the sheet --------------------------- */

import { noteLines, noteH, itemRowH, NOTE_LINES } from "../src/lib/domain/printPlan";

/**
 * "on the PDF for the presidency meeting can we include any note for the
 *  agenda items?"
 *
 * This reverses a deliberate omission. The reason it's safe to reverse is the
 * thing to protect: the original problem was never notes, it was charging
 * every item three or four lines whether it had anything to say or not, so a
 * normal week couldn't hold twelve items above 9pt.
 */
describe("an item's note", () => {
  const TIER = TIERS[0];
  const bare = { id: 1, text: "Follow up with the Hills" };
  const short = { ...bare, notes: "Cam spoke to them Sunday." };
  const noted = {
    ...bare,
    notes: "Cam spoke to them Sunday and they asked for a call this week; " +
      "he thinks a visit would be better received than a phone call, and " +
      "offered to go along if somebody can make an evening work.",
  };

  it("costs nothing when there isn't one", () => {
    expect(noteLines(TIER, bare)).toBe(0);
    expect(noteH(TIER, bare)).toBe(0);
    expect(noteH(TIER, { ...bare, notes: "   " })).toBe(0);
  });

  it("is charged by the lines it wraps to, not a flat one", () => {
    // An uncounted second line on six items is ninety pixels the fitter never
    // knew about — the difference between one page and two.
    expect(noteLines(TIER, short)).toBe(1);
    expect(noteLines(TIER, noted)).toBeGreaterThan(1);
    expect(noteH(TIER, noted)).toBeGreaterThan(noteH(TIER, short));
  });

  it("and capped, so one long note can't take the page", () => {
    const essay = { ...bare, notes: "word ".repeat(400) };
    expect(noteLines(TIER, essay)).toBe(NOTE_LINES);
  });

  it("makes its own row taller without touching anyone else's", () => {
    expect(itemRowH(TIER, noted, false)).toBeGreaterThan(itemRowH(TIER, bare, false));
  });

  it("but never shorter than the writing space beside it", () => {
    // The ruled lines are why the note went in the left column at all. A row
    // must still be tall enough to hold them.
    expect(itemRowH(TIER, bare, false)).toBeGreaterThanOrEqual(ITEM_RULES * TIER.body);
  });
});

describe("the page, with notes on it", () => {
  const withNotes = (n, notes) => Array.from({ length: n }, (_, i) => ({
    id: i, section: "items", text: `Agenda item number ${i}`,
    category: AGENDA_CATEGORIES[i % 6].key, notes,
  }));

  it("is charged for them, so the fitter can't be surprised", () => {
    const plain = choosePrintPlan({
      sections: [{ key: "items", label: "Items", items: withNotes(8, null) }],
    });
    const noted = choosePrintPlan({
      sections: [{ key: "items", label: "Items", items: withNotes(8, "A sentence of context about this item.") }],
    });
    expect(noted.height).toBeGreaterThan(plain.height);
  });

  it("and steps the type down rather than spilling onto a second sheet", () => {
    const heavy = choosePrintPlan({
      sections: [{
        key: "items", label: "Items",
        items: withNotes(13, "Two lines of context that will certainly wrap in the name column of the printed sheet."),
      }],
    });
    expect(heavy.bodyPt).toBeLessThan(BODY_PT);
    expect(heavy.bodyPt).toBeGreaterThanOrEqual(FLOOR_PT);
  });
});

describe("the printed item", () => {
  it("shows the note, and marks an attachment without printing the URL", async () => {
    const items = [{
      id: 1, section: "items", text: "Temple recommend interviews",
      category: AGENDA_CATEGORIES[0].key,
      notes: "Bishop asked for a list before the 15th.",
      link_url: "https://docs.google.com/spreadsheets/d/1FoXgUAxBA2xsQfNHdiYJFztGTLtodJpEE0",
    }];
    await act(async () => {
      render(
        <AgendaPrint
          agenda={{ meeting_date: "2026-10-14" }}
          sections={[{ key: "items", label: "Agenda Items" }]}
          bySection={{ items }}
          events={[]}
          categories={AGENDA_CATEGORIES}
        />
      );
    });
    const sheet = document.querySelector("[data-eq-sheet]");
    expect(sheet.querySelector("[data-eq-note]"), "the note isn't on the sheet").toBeTruthy();
    expect(sheet.textContent).toContain("Bishop asked for a list before the 15th.");
    expect(sheet.textContent).toContain("attached");
    // Forty characters nobody can tap.
    expect(sheet.textContent, "the raw URL was printed").not.toContain("docs.google.com");
  });

  it("and an item without one gets no empty line", async () => {
    await act(async () => {
      render(
        <AgendaPrint
          agenda={{ meeting_date: "2026-10-14" }}
          sections={[{ key: "items", label: "Agenda Items" }]}
          bySection={{ items: [{ id: 2, section: "items", text: "Just an item" }] }}
          events={[]}
          categories={AGENDA_CATEGORIES}
        />
      );
    });
    expect(document.querySelector("[data-eq-sheet] [data-eq-note]")).toBeNull();
    expect(document.querySelector("[data-eq-sheet]").textContent).not.toContain("attached");
  });
});
