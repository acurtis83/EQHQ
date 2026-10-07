import { render, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bySession, parseConferenceHtml } from "../src/lib/domain/parseTalks";

/**
 * "are these loaded in order that they were given? or posted on the churchs
 *  website?"
 *
 * Given. The URL slug carries both the session and the position inside it —
 * "11oaks" opens the conference, "59oaks" closes it — so sorting by slug is
 * sorting by the running order of the weekend.
 *
 * Provided the sort knows the numbers are numbers. It has to be in one place,
 * because it was in two and they disagreed: the parser compared numerically
 * and the library's ORDER BY slug did not, so the same conference came out in
 * two different orders depending on which screen you were looking at.
 */

const SATURDAY_AFTERNOON = [
  "21christofferson", "22larson", "23stevenson", "24ortega", "25wu",
  "26wunderli", "27causse", "28holmes", "29matswagothata", "210soares",
];

describe("the order talks come back in", () => {
  it("is the order they were given", () => {
    const shuffled = [...SATURDAY_AFTERNOON].reverse().map((slug) => ({ slug }));
    expect(shuffled.sort(bySession).map((t) => t.slug)).toEqual(SATURDAY_AFTERNOON);
  });

  it("and the tenth talk of a session doesn't jump to the front of it", () => {
    // A plain text sort puts "210soares" before "21christofferson", because
    // the character "0" sorts before "c". That was the library's bug.
    const sorted = [...SATURDAY_AFTERNOON].map((slug) => ({ slug })).sort(bySession);
    expect(sorted[sorted.length - 1].slug).toBe("210soares");
    expect([...SATURDAY_AFTERNOON].sort()[0], "plain text sort, for contrast")
      .toBe("210soares");
  });

  it("nor to the end of the whole conference", () => {
    // A numeric-aware sort reads "210" as two hundred and ten and puts it
    // after "59oaks". That was the PARSER's bug, and it is why the slug has
    // to be read as two numbers rather than one.
    const mixed = ["210soares", "59oaks", "21christofferson"].map((slug) => ({ slug }));
    expect(mixed.sort(bySession).map((t) => t.slug))
      .toEqual(["21christofferson", "210soares", "59oaks"]);
    expect(
      ["210soares", "59oaks"].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      "numeric sort, for contrast"
    ).toEqual(["59oaks", "210soares"]);
  });

  it("and an odd slug sorts last rather than throwing", () => {
    // A crash in a comparator takes the whole library down over one URL.
    const odd = [{ slug: "contents" }, { slug: "11oaks" }];
    expect(odd.sort(bySession).map((t) => t.slug)).toEqual(["11oaks", "contents"]);
  });

  it("keeps the sessions in the order the weekend ran", () => {
    const mixed = ["51christofferson", "11oaks", "41uchtdorf", "21christofferson"]
      .map((slug) => ({ slug }));
    expect(mixed.sort(bySession).map((t) => t.slug))
      .toEqual(["11oaks", "21christofferson", "41uchtdorf", "51christofferson"]);
  });
});

describe("the import preview", () => {
  // Deliberately listed out of order and with the tenth talk early, which is
  // how a naive sort gives itself away.
  const PAGE = ["210soares", "21christofferson", "29matswagothata", "11oaks", "51wong"]
    .map((slug) => {
      const surname = slug.replace(/^\d+/, "");
      const name = surname[0].toUpperCase() + surname.slice(1);
      return `<a href="/study/general-conference/2026/10/${slug}?lang=eng">` +
             `A Talk by ${name} ${name}</a>`;
    }).join("\n");

  it("comes back in session order too", () => {
    // The parser sorted correctly on its own for months while the library
    // didn't. Pinned here so neither half can drift back.
    const { talks } = parseConferenceHtml(PAGE, { year: 2026, month: 10 });
    expect(talks.map((t) => t.slug))
      .toEqual(["11oaks", "21christofferson", "29matswagothata", "210soares", "51wong"]);
  });

  it("and agrees with the comparator the library sorts by", () => {
    const { talks } = parseConferenceHtml(PAGE, { year: 2026, month: 10 });
    expect(talks.map((t) => t.slug))
      .toEqual([...talks].sort(bySession).map((t) => t.slug));
  });
});

/* ------------------------- and the library uses it ------------------------ */

let TALKS = [];

function thenable(data) {
  const result = Promise.resolve({ data, error: null });
  return new Proxy(result, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return t[prop].bind(t);
      return () => thenable(data);
    },
  });
}

vi.mock("../src/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => thenable(TALKS) }) },
}));

beforeEach(() => {
  // As Postgres hands them back: ordered by slug as TEXT, which is the shape
  // that made the saved library disagree with the import preview.
  TALKS = [...SATURDAY_AFTERNOON].sort().map((slug) => ({
    slug, conf: "October 2026", year: 2026, month: 10,
    session: "Saturday Afternoon", title: `Talk ${slug}`,
    speaker: "Someone", url: `https://x/${slug}`,
  }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

describe("the saved library", () => {
  it("shows them in the order they were given, not as Postgres sorted them", async () => {
    // The parser got this right on its own for months while the library
    // didn't, which is exactly the kind of disagreement nobody notices until
    // somebody asks what order the list is in.
    const { default: TalkLibrary } = await import("../src/presidency/TalkLibrary");
    let dom;
    await act(async () => {
      dom = render(<TalkLibrary />);
      await new Promise((r) => setTimeout(r, 20));
    });

    const shown = [...dom.container.querySelectorAll("a[href^='https://x/']")]
      .map((a) => a.getAttribute("href").replace("https://x/", ""));
    expect(shown, "no talks rendered at all").not.toHaveLength(0);
    expect(shown).toEqual(SATURDAY_AFTERNOON);
  });
});
