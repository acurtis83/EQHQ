import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  parsePrimer, primerColumns, primerFromRow, isEmptyPrimer, hasPrimer, primerToText, primerOrPaste,
} from "../src/lib/domain/primer";

/**
 * The Quick Summary.
 *
 * "a Cliff Notes style summary or Talk Primer for those who want the executive
 *  summary. Great for those first sitting down in EQ to get up to speed."
 *
 * Four fixed parts, because the sameness is what makes it readable in fifteen
 * seconds. The interesting part is the paste box: with no server to hold an
 * API key, a summary gets drafted elsewhere and arrives here as text, in
 * whatever shape it came out in.
 */

/* ------------------------------ reading a paste --------------------------- */

const DRAFT = `THE BIG IDEA
Covenants aren't a transaction. They're a relationship God initiates and keeps.

THREE THINGS
• Grace isn't a reward for effort
• Small consistent acts beat big gestures
• Repentance is a privilege, not a penalty

SCRIPTURE
Mosiah 5:7

WORTH THINKING ABOUT
Where have you felt God keeping His end of a covenant this month?`;

describe("reading a pasted draft", () => {
  it("sorts it into the four fields", () => {
    const p = parsePrimer(DRAFT);
    expect(p.idea).toBe("Covenants aren't a transaction. They're a relationship God initiates and keeps.");
    expect(p.takeaways).toEqual([
      "Grace isn't a reward for effort",
      "Small consistent acts beat big gestures",
      "Repentance is a privilege, not a penalty",
    ]);
    expect(p.scripture).toBe("Mosiah 5:7");
    expect(p.question).toBe("Where have you felt God keeping His end of a covenant this month?");
  });

  it("copes with markdown, because that's what a chat window produces", () => {
    const p = parsePrimer(`## The Big Idea
**Grace comes first.**

### Key Takeaways
1. One thing
2. Another thing

**Scripture:** Alma 32:21`);
    expect(p.idea).toBe("Grace comes first.");
    expect(p.takeaways).toEqual(["One thing", "Another thing"]);
    expect(p.scripture).toBe("Alma 32:21");
  });

  it("and with whichever word the writer reached for", () => {
    // "Takeaways", "Three Things", "Key Points" all mean the same list.
    for (const heading of ["Takeaways", "Three Things", "Key Points", "Highlights"]) {
      const p = parsePrimer(`${heading}\n- Only one`);
      expect(p.takeaways, `"${heading}" wasn't recognised`).toEqual(["Only one"]);
    }
  });

  it("takes an opening sentence with no heading as the big idea", () => {
    // A draft that opens with its point and no heading is still opening with
    // its point. Dropping it loses the most important line in the paste.
    const p = parsePrimer("Faith is a choice you keep making.\n\nScripture\nEther 12:6");
    expect(p.idea).toBe("Faith is a choice you keep making.");
    expect(p.scripture).toBe("Ether 12:6");
  });

  it("doesn't mistake a sentence for a heading", () => {
    // A long line ending in a colon is prose, not a section. Reading it as one
    // would file everything after it in the wrong box.
    const p = parsePrimer(
      "He makes the point plainly, and it is worth quoting at length here:\nand then continues."
    );
    expect(p.idea).toContain("worth quoting at length here:");
    expect(p.takeaways).toEqual([]);
  });

  it("leaves an unrecognised heading where it fell rather than guessing", () => {
    // Guessing which field "Context" meant is how a scripture reference ends
    // up filed as a discussion question.
    const p = parsePrimer("Context\nGeneral Conference, April 2026\n\nScripture\nMosiah 5:7");
    expect(p.scripture).toBe("Mosiah 5:7");
    expect(p.question).toBe("");
  });

  it("keeps a paragraph break the writer put in", () => {
    // Two paragraphs run together into one slab is exactly the clunkiness a
    // summary is supposed to save you from.
    const p = parsePrimer("THE BIG IDEA\nFirst thought.\n\nSecond thought.");
    expect(p.idea).toBe("First thought.\n\nSecond thought.");
  });

  it("but rejoins a sentence that was merely hard-wrapped", () => {
    // A pasted draft is wrapped by whatever wrote it, so one sentence can
    // arrive across several lines. Those are not paragraphs.
    const p = parsePrimer("THE BIG IDEA\nOne sentence that happens\nto be wrapped across lines.");
    expect(p.idea).toBe("One sentence that happens to be wrapped across lines.");
  });

  it("and a run of blank lines is still one break", () => {
    const p = parsePrimer("THE BIG IDEA\nFirst.\n\n\n\nSecond.");
    expect(p.idea).toBe("First.\n\nSecond.");
  });

  it("puts a wrapped bullet back together", () => {
    // "I had to go in and fix the takeaway points so split line sentences
    //  didnt split into multiple bullet points"
    //
    // A draft arrives hard-wrapped by whatever wrote it. Treating every line
    // as a new bullet turned four points into eleven fragments, each starting
    // mid-sentence — and it had to be unpicked by hand, which is the whole
    // job the paste box exists to remove.
    const p = parsePrimer(`TAKEAWAYS
• A literal resurrection changes how you carry mortality: deficiencies are
  temporary, and even a premature death is not the end of anyone's identity
• Peacemaking isn't only for bishops mediating disputes — it's parents
  raising children in righteousness`);
    expect(p.takeaways).toHaveLength(2);
    expect(p.takeaways[0]).toBe(
      "A literal resurrection changes how you carry mortality: deficiencies are " +
      "temporary, and even a premature death is not the end of anyone's identity"
    );
    expect(p.takeaways[1]).toContain("parents raising children in righteousness");
  });

  it("across three lines just the same", () => {
    const p = parsePrimer("Takeaways\n- one part\n  second part\n  third part\n- a new point");
    expect(p.takeaways).toEqual(["one part second part third part", "a new point"]);
  });

  it("and numbered lists start new points too", () => {
    const p = parsePrimer("Takeaways\n1. First point that\n   wraps here\n2. Second point");
    expect(p.takeaways).toEqual(["First point that wraps here", "Second point"]);
  });

  it("but a list with no markers is still one per line", () => {
    // With nothing marking the starts, every line must be one — there's
    // nothing else it could mean.
    const p = parsePrimer("Takeaways\nFirst thing\nSecond thing\nThird thing");
    expect(p.takeaways).toEqual(["First thing", "Second thing", "Third thing"]);
  });

  it("and reads nothing out of nothing", () => {
    expect(isEmptyPrimer(parsePrimer(""))).toBe(true);
    expect(isEmptyPrimer(parsePrimer("   \n\n  "))).toBe(true);
  });

  it("survives a round trip through the text form", () => {
    // What the sheet shows back has to parse into what it came from, or
    // copying a summary out and back in quietly loses a field.
    const once = parsePrimer(DRAFT);
    expect(parsePrimer(primerToText(once))).toEqual(once);
  });
});

/* ------------------------------ storing it -------------------------------- */

describe("what gets stored", () => {
  it("blank fields go in as null, not empty strings", () => {
    // "Has a primer" is then one check against null everywhere, rather than
    // null in some places and "" in others.
    expect(primerColumns({ idea: "  ", takeaways: ["", "  "], scripture: "", question: "" }))
      .toEqual({
        primer_idea: null, primer_takeaways: null,
        primer_scripture: null, primer_question: null,
      });
  });

  it("empty takeaway lines are dropped, not stored as blanks", () => {
    // Typing the list leaves trailing newlines behind, and a blank bullet on
    // the members' sheet reads as a mistake.
    expect(primerColumns({ takeaways: ["One", "", "Two", "   "] }).primer_takeaways)
      .toEqual(["One", "Two"]);
  });

  it("and a row reads back as the same thing", () => {
    const p = parsePrimer(DRAFT);
    const row = primerColumns(p);
    expect(primerFromRow({
      primer_idea: row.primer_idea,
      primer_takeaways: row.primer_takeaways,
      primer_scripture: row.primer_scripture,
      primer_question: row.primer_question,
    })).toEqual(p);
  });

  it("knows when a lesson has one worth offering", () => {
    expect(hasPrimer({ primer_idea: "Something" })).toBe(true);
    expect(hasPrimer({ primer_takeaways: ["Something"] })).toBe(true);
    expect(hasPrimer({ talk_title: "A talk", primer_idea: null })).toBe(false);
    expect(hasPrimer(null)).toBe(false);
  });
});

/* ------------------------- the button on the feed ------------------------- */

let LESSON = null;
let EXCEPTIONS = [];

function thenable(data, single = false) {
  const result = Promise.resolve({ data, error: null });
  return new Proxy(result, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: single ? data : null, error: null });
      return () => thenable(data, single);
    },
  });
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (table) => ({
      select: () => {
        if (table === "public_lessons") return thenable(LESSON, true);
        if (table === "public_calendar_exceptions") return thenable(EXCEPTIONS);
        return thenable([]);
      },
    }),
  },
}));

const WITH_PRIMER = {
  date: "2026-09-20",
  teacher_name: "Seth Adamson",
  talk_title: "Bearing One Another's Burdens",
  speaker: "Elder Renlund",
  talk_link: "https://www.churchofjesuschrist.org/study/general-conference/2026/04/burdens",
  primer_idea: "Covenants aren't a transaction.",
  primer_takeaways: ["Grace isn't a reward for effort", "Small acts beat big gestures"],
  primer_scripture: "Mosiah 5:7",
  primer_question: "Where have you felt God keep His end this month?",
};

async function mountLesson() {
  const { default: ThisWeeksLesson } = await import("../src/member/ThisWeeksLesson");
  let dom;
  await act(async () => {
    dom = render(<ThisWeeksLesson />);
    await new Promise((r) => setTimeout(r, 10));
  });
  return dom;
}

const summaryBtn = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Quick Summary");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // A Wednesday, so the next gathering Sunday is the 20th.
  vi.setSystemTime(new Date(2026, 8, 16, 9, 0, 0));
  LESSON = { ...WITH_PRIMER };
  EXCEPTIONS = [];
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("the Quick Summary button", () => {
  it("sits beside Read the talk", async () => {
    const dom = await mountLesson();
    expect(summaryBtn(), "no Quick Summary button").toBeTruthy();
    const text = dom.container.textContent;
    expect(text.indexOf("Read the talk")).toBeLessThan(text.indexOf("Quick Summary"));
  });

  it("isn't offered when nobody has written one", async () => {
    // A button that opens an empty sheet is worse than no button.
    LESSON = { ...WITH_PRIMER, primer_idea: null, primer_takeaways: null,
      primer_scripture: null, primer_question: null };
    await mountLesson();
    expect(summaryBtn()).toBeUndefined();
  });

  it("opens the summary, all four parts", async () => {
    await mountLesson();
    await act(async () => { fireEvent.click(summaryBtn()); });

    const sheet = document.querySelector("[data-quick-summary]");
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain("Covenants aren't a transaction.");
    expect([...sheet.querySelectorAll("[data-takeaway]")]).toHaveLength(2);
    expect(sheet.textContent).toContain("Mosiah 5:7");
    expect(sheet.textContent).toContain("Where have you felt God keep His end this month?");
  });

  it("and points at the real talk rather than replacing it", async () => {
    // A summary that becomes the thing people read instead of the talk is a
    // worse outcome than no summary at all.
    await mountLesson();
    await act(async () => { fireEvent.click(summaryBtn()); });
    const sheet = document.querySelector("[data-quick-summary]");
    expect(sheet.textContent).toMatch(/not a substitute for the talk/i);
    expect([...sheet.querySelectorAll("a")].map((a) => a.getAttribute("href")))
      .toContain(WITH_PRIMER.talk_link);
  });

  it("shows only the parts that were written", async () => {
    LESSON = { ...WITH_PRIMER, primer_scripture: null, primer_question: null };
    await mountLesson();
    await act(async () => { fireEvent.click(summaryBtn()); });
    const sheet = document.querySelector("[data-quick-summary]");
    expect(sheet.querySelector('[data-primer="idea"]')).toBeTruthy();
    expect(sheet.querySelector('[data-primer="scripture"]'), "an empty Scripture heading").toBeNull();
    expect(sheet.querySelector('[data-primer="question"]')).toBeNull();
  });

  it("closes again", async () => {
    await mountLesson();
    await act(async () => { fireEvent.click(summaryBtn()); });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Close"));
    });
    expect(document.querySelector("[data-quick-summary]")).toBeNull();
  });

  it("and isn't offered on a Sunday with no meeting", async () => {
    // Stake conference. A primer left on the row from an earlier plan must not
    // put a button on a card that says there's no quorum meeting.
    EXCEPTIONS = [{ date: "2026-09-20" }];
    const dom = await mountLesson();
    expect(dom.container.textContent).toMatch(/no quorum meeting/i);
    expect(summaryBtn()).toBeUndefined();
  });
});

/* --------------------- a paste that was never applied --------------------- */

/**
 * "i just saved the summary and dont see the quick summary"
 *
 * The paste box is a staging area and it is the FIELDS that get saved, so
 * pasting and then pressing Save — the obvious thing to do — discarded the
 * paste and wrote four nulls. Silently: no error, no warning, and the only
 * symptom was a button that never appeared on the feed.
 */
describe("saving with text still in the paste box", () => {
  const DRAFT = "THE BIG IDEA\nGrace comes first.\n\nSCRIPTURE\nAlma 32:21";

  it("rescues it rather than writing nulls", () => {
    const empty = { idea: "", takeaways: [], scripture: "", question: "" };
    const out = primerOrPaste(empty, DRAFT);
    expect(out.idea).toBe("Grace comes first.");
    expect(primerColumns(out).primer_idea).toBe("Grace comes first.");
  });

  it("but never overwrites fields somebody filled in", () => {
    // Those may have been edited after the paste, and an edit is a more
    // deliberate act than leaving text in a box.
    const edited = { idea: "My own wording.", takeaways: [], scripture: "", question: "" };
    expect(primerOrPaste(edited, DRAFT).idea).toBe("My own wording.");
  });

  it("and leaves an empty primer empty when the paste is junk", () => {
    const empty = { idea: "", takeaways: [], scripture: "", question: "" };
    expect(isEmptyPrimer(primerOrPaste(empty, "   "))).toBe(true);
    expect(primerColumns(primerOrPaste(empty, "")).primer_idea).toBeNull();
  });
});
