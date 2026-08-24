import { render, screen, within, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * Signing up for more than one thing.
 *
 * A sign-up question is a set of slots with limits — "Salad (2)", "Dessert
 * (3)". It only ever took one pick, so a brother bringing a salad *and* a
 * dessert had to submit the form twice, and the second submission counted him
 * as a second head.
 *
 * The counting was always array-aware; it was the form that wasn't. These
 * mount the real form and click the real buttons, because that's where the
 * single-pick assumption lived.
 */

const FORM = {
  id: "f1", title: "Summer Soiree", published: true, anonymous: false,
  description: null, closes_on: null, flyer_url: null,
};

const QUESTIONS = [
  {
    id: "q1", form_id: "f1", type: "capacity", label: "What can you bring?",
    required: false, sort_order: 0,
    options: [
      { label: "Salad", limit: 2 },
      { label: "Dessert", limit: 2 },
      { label: "Drinks", limit: 1 },
    ],
  },
];

// Answers already recorded against the capacity question, as the public view
// hands them over.
let EXISTING = [];
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
        if (table === "public_form_capacity") return thenable(EXISTING);
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
const answerFor = (qid) => INSERTED.find((r) => r.question_id === qid);

beforeEach(() => {
  EXISTING = [];
  INSERTED = [];
  localStorage.clear();
});
afterEach(cleanup);

describe("signing up to bring things", () => {
  it("lets one person take two slots", async () => {
    await mountForm();

    fireEvent.click(slot("Salad"));
    fireEvent.click(slot("Dessert"));

    expect(slot("Salad").getAttribute("aria-pressed")).toBe("true");
    expect(slot("Dessert").getAttribute("aria-pressed")).toBe("true");
  });

  it("says so, rather than leaving people to discover it", async () => {
    await mountForm();
    expect(screen.getByText("Pick as many as you'd like to bring.")).toBeTruthy();
  });

  it("submits both picks as one response", async () => {
    await mountForm();
    fireEvent.click(slot("Salad"));
    fireEvent.click(slot("Dessert"));
    fireEvent.change(screen.getByPlaceholderText("First and last"), { target: { value: "Cameron Pearson" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
      await new Promise((r) => setTimeout(r, 0));
    });

    // One response, not two — which is what submitting the form twice used to
    // produce, and why the headcount ran high.
    expect(INSERTED.filter((r) => r.form_id === "f1").length).toBe(1);
    expect(answerFor("q1").value).toEqual(["Salad", "Dessert"]);
  });

  it("lets a pick be taken back", async () => {
    await mountForm();
    fireEvent.click(slot("Salad"));
    fireEvent.click(slot("Dessert"));
    fireEvent.click(slot("Salad"));

    expect(slot("Salad").getAttribute("aria-pressed")).toBe("false");
    expect(slot("Dessert").getAttribute("aria-pressed")).toBe("true");
  });

  it("stores nothing for a question picked and then cleared", async () => {
    // An empty array is not an answer. Stored as one it would count as a
    // response to the question and skew the tally.
    await mountForm();
    fireEvent.click(slot("Salad"));
    fireEvent.click(slot("Salad"));
    fireEvent.change(screen.getByPlaceholderText("First and last"), { target: { value: "Karl Bagley" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(answerFor("q1")).toBeUndefined();
  });

  it("still closes a slot when it's full", async () => {
    // Drinks has a limit of 1 and someone already took it. Multiple picks
    // must not become a way past the limits.
    EXISTING = [{ question_id: "q1", value: ["Drinks"] }];
    await mountForm();

    expect(slot("Drinks").disabled).toBe(true);
    expect(screen.getByText("Full")).toBeTruthy();
  });

  it("counts each of one person's picks against its own slot", async () => {
    // Cameron took a salad and a dessert; Karl took a salad. Salad's two
    // places are gone, dessert has one of two left. A multi-pick has to count
    // separately against each slot, not once against the question.
    EXISTING = [
      { question_id: "q1", value: ["Salad", "Dessert"] },
      { question_id: "q1", value: ["Salad"] },
    ];
    await mountForm();

    expect(slot("Salad").disabled).toBe(true);
    expect(slot("Dessert").disabled).toBe(false);
    expect(within(slot("Dessert")).getByText("1 left")).toBeTruthy();
  });

  it("reads an answer saved before any of this as a single pick", async () => {
    // Existing rows hold a bare string, not a list. They have to keep counting.
    EXISTING = [{ question_id: "q1", value: "Drinks" }];
    await mountForm();

    expect(slot("Drinks").disabled).toBe(true);
  });
});
