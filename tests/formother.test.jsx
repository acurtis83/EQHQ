import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  pickLabel, pickText, pickList, isOtherOption, capacityTaken, namesByOption,
  summarize, unmatchedPicks, strandedBy, responsesToCsv,
} from "../src/lib/domain/forms";
import { buildSummaryText } from "../src/lib/domain/formSummary";

/**
 * "on the EQ BBQ form results the Other category still shows 0. I signed up
 *  and marked Other and put 'Drinks' in the text box."
 *
 * Two faults behind that, and they compound.
 *
 * The first: results are tallied by matching the stored answer against the
 * option's CURRENT label, so renaming a slot after people have signed up
 * detaches every answer already recorded under the old name. The slot reads
 * zero and the answers appear nowhere — not in the count, not in the summary,
 * not in the export. A sign-up that reached nobody.
 *
 * The second: there was no "Other, please specify" at all. The box was a
 * separate question, so the pick and the words behind it were two unrelated
 * answers with nothing joining them.
 */

/* ------------------------------- the shapes ------------------------------- */

describe("what a pick can be", () => {
  it("a plain string, as it always was", () => {
    expect(pickLabel("Salad")).toBe("Salad");
    expect(pickText("Salad")).toBe("");
  });

  it("or an option with what somebody typed against it", () => {
    const p = { option: "Other", text: "Drinks" };
    expect(pickLabel(p)).toBe("Other");
    expect(pickText(p)).toBe("Drinks");
  });

  it("and a whole answer reads as a list either way", () => {
    expect(pickList(["Salad", { option: "Other", text: "Drinks" }]).map(pickLabel))
      .toEqual(["Salad", "Other"]);
    // Answers saved before multi-pick are a bare string, not a list.
    expect(pickList("Salad").map(pickLabel)).toEqual(["Salad"]);
    expect(pickList(null)).toEqual([]);
  });

  it("recognising the slots that should offer a box", () => {
    expect(isOtherOption("Other")).toBe(true);
    expect(isOtherOption("other")).toBe(true);
    expect(isOtherOption("Other (please specify)")).toBe(true);
    // Decided from the label so a form already built with an "Other" slot
    // starts working without being edited — and editing options is the very
    // thing that strands answers.
    expect(isOtherOption("Salad")).toBe(false);
    expect(isOtherOption("Otherwise engaged")).toBe(false);
  });
});

describe("counting picks", () => {
  const Q = {
    type: "capacity",
    label: "What can you bring?",
    options: [{ label: "Salad", limit: 2 }, { label: "Other", limit: 3 }],
  };

  it("counts an Other pick that carries text", () => {
    // The whole reported bug in one assertion.
    expect(capacityTaken("Other", [[{ option: "Other", text: "Drinks" }]])).toBe(1);
  });

  it("and still counts the plain ones beside it", () => {
    expect(capacityTaken("Salad", [["Salad", { option: "Other", text: "Drinks" }]])).toBe(1);
  });

  it("keeps what was typed with whoever typed it", () => {
    const names = namesByOption(Q, [
      { value: [{ option: "Other", text: "Drinks" }], name: "Drew Curtis" },
      { value: ["Salad"], name: "Karl Moore" },
    ]);
    expect(names.Other.names).toEqual(["Drew Curtis"]);
    expect(names.Other.notes).toEqual(["Drew Curtis: Drinks"]);
    // A slot with nothing typed against it collects no notes.
    expect(names.Salad.notes).toEqual([]);
  });

  it("and tallies them", () => {
    const s = summarize(Q, [[{ option: "Other", text: "Drinks" }], ["Salad"]]);
    expect(Object.fromEntries(s.tally)).toEqual({ Other: 1, Salad: 1 });
  });

  it("exports them as something readable", () => {
    const csv = responsesToCsv(
      { anonymous: false }, [{ id: "q1", label: "Bringing" }],
      [{ id: "r1", respondent_name: "Drew", created_at: "2026-09-12T18:00:00Z" }],
      { r1: { q1: [{ option: "Other", text: "Drinks" }] } }
    );
    expect(csv).toContain("Other: Drinks");
    // A bare String() on the object is what this replaced.
    expect(csv).not.toContain("[object Object]");
  });
});

/* --------------------------- the renamed-slot hole ------------------------ */

describe("answers whose option no longer exists", () => {
  const Q = { type: "capacity", label: "Bringing", options: [{ label: "Other", limit: 3 }] };
  const ROWS = [
    // Signed up when the slot was called something longer.
    { value: ["Other (drinks, chips, etc.)"], name: "Drew Curtis" },
    { value: ["Other"], name: "Karl Moore" },
  ];

  it("are found rather than silently dropped", () => {
    const lost = unmatchedPicks(Q, ROWS);
    expect(lost).toHaveLength(1);
    expect(lost[0].label).toBe("Other (drinks, chips, etc.)");
    expect(lost[0].names).toEqual(["Drew Curtis"]);
  });

  it("and the ones that do match are left alone", () => {
    expect(unmatchedPicks(Q, ROWS).some((o) => o.label === "Other")).toBe(false);
  });

  it("nothing is reported for a question with no options at all", () => {
    // A short-answer question has no options to fail to match, and calling
    // every answer an orphan would bury the real ones.
    expect(unmatchedPicks({ type: "short", options: [] }, [{ value: "anything" }])).toEqual([]);
  });

  it("they reach the summary somebody actually reads", () => {
    const text = buildSummaryText({
      form: { title: "EQ BBQ" },
      questions: [{ id: "q1", ...Q }],
      responses: [{ id: "r1", respondent_name: "Drew Curtis" }],
      byResponse: { r1: { q1: ["Other (drinks, chips, etc.)"] } },
    });
    expect(text).toContain("no longer a slot");
    expect(text).toContain("Drew Curtis");
  });

  it("and what a rename would cost is known before it's saved", () => {
    // After saving there's nothing left to warn about: the answers are
    // already detached and the only clue is a slot reading zero.
    const lost = strandedBy(
      Q,
      [["Other (drinks, chips, etc.)"], ["Other (drinks, chips, etc.)"], ["Other"]],
      [{ label: "Other", limit: 3 }]
    );
    expect(lost).toEqual([{ label: "Other (drinks, chips, etc.)", count: 2 }]);
  });

  it("with nothing to say when the rename strands nobody", () => {
    expect(strandedBy(Q, [["Other"]], [{ label: "Other", limit: 3 }])).toEqual([]);
  });
});

/* ------------------------- filling the form in ---------------------------- */

const FORM = {
  id: "f1", title: "EQ BBQ", published: true, anonymous: false,
  description: null, closes_on: null, flyer_url: null,
};

const QUESTIONS = [{
  id: "q1", form_id: "f1", type: "capacity", label: "What can you bring?",
  required: false, sort_order: 0,
  options: [{ label: "Salad", limit: 2 }, { label: "Other", limit: 3 }],
}];

let INSERTED = [];

function thenable(data) {
  const result = Promise.resolve({ data, error: null });
  const proxy = new Proxy(result, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: data[0] ?? null, error: null });
      if (prop === "single") return () => Promise.resolve({ data: data[0] ?? null, error: null });
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (table) => ({
      select: () => {
        if (table === "forms") return thenable([FORM]);
        if (table === "form_questions") return thenable(QUESTIONS);
        return thenable([]);
      },
      insert: (rows) => {
        INSERTED.push(...(Array.isArray(rows) ? rows : [rows]));
        return thenable([]);
      },
    }),
  },
}));

async function mountForm() {
  const { default: FormFill } = await import("../src/member/FormFill");
  await act(async () => {
    render(<FormFill formId="f1" />);
    await new Promise((r) => setTimeout(r, 0));
  });
}

const slot = (name) => screen.getByText(name).closest("button");
const otherBox = () => screen.queryByLabelText("Other — what are you bringing?");

beforeEach(() => { INSERTED = []; localStorage.clear(); });
afterEach(cleanup);

describe("picking Other on the form", () => {
  it("opens a box to say what", async () => {
    await mountForm();
    expect(otherBox(), "a box before anything is picked").toBeNull();
    fireEvent.click(slot("Other"));
    expect(otherBox(), "no box after picking Other").toBeTruthy();
  });

  it("but not for the ordinary slots", async () => {
    await mountForm();
    fireEvent.click(slot("Salad"));
    expect(screen.queryByPlaceholderText("What are you bringing?")).toBeNull();
  });

  it("stores what was typed with the pick, not beside it", async () => {
    await mountForm();
    fireEvent.click(slot("Other"));
    fireEvent.change(otherBox(), { target: { value: "Drinks" } });
    fireEvent.change(screen.getByPlaceholderText("First and last"), { target: { value: "Drew Curtis" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
      await new Promise((r) => setTimeout(r, 0));
    });

    const answer = INSERTED.find((r) => r.question_id === "q1");
    expect(answer.value).toEqual([{ option: "Other", text: "Drinks" }]);
  });

  it("and counts as a pick even with the box left empty", async () => {
    // Ticking Other still says you're bringing something. Refusing the
    // submission over a blank box would lose that.
    await mountForm();
    fireEvent.click(slot("Other"));
    fireEvent.change(screen.getByPlaceholderText("First and last"), { target: { value: "Karl Moore" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
      await new Promise((r) => setTimeout(r, 0));
    });

    const answer = INSERTED.find((r) => r.question_id === "q1");
    expect(answer.value).toEqual([{ option: "Other", text: "" }]);
    expect(capacityTaken("Other", [answer.value])).toBe(1);
  });

  it("takes the box away again when Other is unpicked", async () => {
    await mountForm();
    fireEvent.click(slot("Other"));
    fireEvent.change(otherBox(), { target: { value: "Drinks" } });
    fireEvent.click(slot("Other"));
    expect(otherBox()).toBeNull();
  });

  it("and keeps a second pick alongside it", async () => {
    await mountForm();
    fireEvent.click(slot("Salad"));
    fireEvent.click(slot("Other"));
    fireEvent.change(otherBox(), { target: { value: "Drinks" } });
    fireEvent.change(screen.getByPlaceholderText("First and last"), { target: { value: "Drew Curtis" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(INSERTED.find((r) => r.question_id === "q1").value)
      .toEqual(["Salad", { option: "Other", text: "Drinks" }]);
  });
});
