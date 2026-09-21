import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stripTags, talkBody, looksLikeTalk } from "../src/lib/domain/talkText";
import { primerPrompt, readReply, SYSTEM } from "../src/lib/domain/primerPrompt";
import { run, nextGathering } from "../src/lib/draftPrimer.mjs";

/**
 * The weekly draft.
 *
 * "ok....so for each week i need to run a Quick Summary request"
 *
 * No — this runs on a schedule and writes the primer itself. Which means
 * nobody is watching it, so what has to be true is mostly about restraint:
 * it never overwrites, never invents a talk it hasn't read, and never saves a
 * reply it couldn't parse. Each of those failures would be invisible until
 * Sunday.
 *
 * The network is stubbed throughout. A test that really called Anthropic
 * would cost money, need a key in CI, and pass or fail for reasons that have
 * nothing to do with this code.
 */

/* ------------------------- reducing the talk page ------------------------- */

const PAGE = `
<html><head><title>About His Business</title>
<script>var nav = ["Come Home","All Who Have Endured Valiantly"];</script>
<style>.body-block { color: red }</style></head>
<body>
<nav><a href="/x">Saturday Morning Session</a><a href="/y">Come Home</a></nav>
<h1>About His Business</h1>
<p>By Elder Patrick Kearon</p>
<p>Of the Quorum of the Twelve Apostles</p>
<p>Life is better&mdash;everything is better&mdash;when we are about His business.</p>
<p>I was baptised into the Church in my mid-20s in London. ${"The talk continues at length. ".repeat(40)}</p>
<h2>Notes</h2>
<p>1. See General Handbook, 29.2.1.1.</p>
<p>2. See Ephesians 2:19&ndash;22.</p>
</body></html>`;

describe("reducing a conference page to the talk", () => {
  it("drops the scripts, styles and markup", () => {
    const out = stripTags(PAGE);
    expect(out).not.toContain("var nav");
    expect(out).not.toContain("color: red");
    expect(out).not.toContain("<p>");
  });

  it("turns entities back into the characters they stand for", () => {
    expect(stripTags("<p>better&mdash;everything</p>")).toBe("better—everything");
    expect(stripTags("<p>Ephesians 2:19&ndash;22 &amp; more</p>")).toBe("Ephesians 2:19–22 & more");
  });

  it("starts at the byline, not at the conference navigation", () => {
    // Forty other talk titles above the talk is tokens spent on giving the
    // model things to confuse with the one it was asked about.
    const body = talkBody(PAGE);
    expect(body.startsWith("By Elder Patrick Kearon")).toBe(true);
    expect(body).not.toContain("Saturday Morning Session");
  });

  it("and stops at the footnotes", () => {
    const body = talkBody(PAGE);
    expect(body).toContain("Life is better");
    expect(body, "the citations came too").not.toContain("General Handbook");
  });

  it("keeps the whole page when it can't find either mark", () => {
    // A page whose markup changed is better summarised wastefully than not at
    // all. Guessing a selector and silently matching nothing is the failure
    // this avoids.
    const odd = "<html><body><p>Some talk with no byline at all.</p></body></html>";
    expect(talkBody(odd)).toContain("Some talk with no byline");
  });

  it("caps the length, because a runaway page is a runaway bill", () => {
    const huge = `<p>By Elder Someone</p><p>${"word ".repeat(40000)}</p>`;
    expect(talkBody(huge, { max: 5000 }).length).toBeLessThanOrEqual(5000);
  });

  it("and knows when there isn't enough to summarise", () => {
    expect(looksLikeTalk(talkBody("<html><body><p>Page not found.</p></body></html>"))).toBe(false);
    expect(looksLikeTalk(talkBody(PAGE))).toBe(true);
  });
});

/* ----------------------------- asking for it ------------------------------ */

describe("what gets asked for", () => {
  it("asks for the exact shape the paste box already reads", () => {
    // One format, one parser. Asking for JSON would have meant a second
    // format to keep in step with the one humans paste.
    const p = primerPrompt({ title: "About His Business", speaker: "Patrick Kearon", text: "..." });
    for (const heading of ["THE BIG IDEA", "TAKEAWAYS", "SCRIPTURE", "WORTH THINKING ABOUT"]) {
      expect(p).toContain(heading);
    }
    expect(p).toContain("About His Business");
    expect(p).toContain("Patrick Kearon");
  });

  it("and tells it to stay inside the talk", () => {
    // This is published to the whole quorum with nobody reading it first, so
    // the failure that matters is words put in a general authority's mouth.
    expect(SYSTEM).toMatch(/must come from the talk itself/i);
    expect(SYSTEM).toMatch(/no doctrine/i);
    expect(SYSTEM).toMatch(/own words/i);
  });
});

describe("reading the reply", () => {
  const GOOD = `THE BIG IDEA
A calling is an invitation into the Lord's work, sized to stretch you.

TAKEAWAYS
• Sustaining is an active promise, not a formality
• It matters less where you serve than how

SCRIPTURE
Luke 2:49

WORTH THINKING ABOUT
Whose calling have you raised your hand for and not thought about since?`;

  it("takes a well-formed one", () => {
    const p = readReply(GOOD);
    expect(p.idea).toContain("invitation into the Lord's work");
    expect(p.takeaways).toHaveLength(2);
    expect(p.scripture).toBe("Luke 2:49");
  });

  it("refuses an apology", () => {
    // Saved, this would be a Quick Summary button opening an empty sheet —
    // worse than no button, and nothing downstream would flag it.
    expect(readReply("I'm sorry, I can't help with that.")).toBeNull();
  });

  it("refuses a reply with no idea and no takeaways", () => {
    expect(readReply("WORTH THINKING ABOUT\nA question on its own.")).toBeNull();
  });

  it("and refuses nothing at all", () => {
    expect(readReply("")).toBeNull();
    expect(readReply("   ")).toBeNull();
  });
});

/* ---------------------------- the run, stubbed ---------------------------- */

let ROWS = [];
let PATCHED = null;
let CALLS = [];
const REPLY = `THE BIG IDEA
A calling is an invitation into the Lord's work.

TAKEAWAYS
• One thing
• Another`;

function stubFetch() {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    CALLS.push(u);

    if (u.includes("/rest/v1/teaching_assignments")) {
      if (init.method === "PATCH") {
        PATCHED = JSON.parse(init.body);
        return { ok: true, status: 204, text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => ROWS };
    }
    if (u.includes("api.anthropic.com")) {
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: REPLY }] }) };
    }
    // The talk page.
    return { ok: true, status: 200, text: async () => PAGE };
  });
}

beforeEach(() => {
  ROWS = [{ date: "2026-09-27", talk_title: "About His Business", speaker: "Patrick Kearon",
    talk_link: "https://www.churchofjesuschrist.org/study/general-conference/2026/04/13kearon",
    primer_idea: null, primer_takeaways: null, primer_scripture: null, primer_question: null }];
  PATCHED = null;
  CALLS = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.ANTHROPIC_API_KEY = "anthropic-key";
  vi.stubGlobal("fetch", stubFetch());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("a scheduled run", () => {
  it("writes the summary for the Sunday coming", async () => {
    const out = await run({ date: "2026-09-27" });
    expect(out.ok).toBe(true);
    expect(PATCHED, "nothing was written").toBeTruthy();
    expect(PATCHED.primer_idea).toContain("invitation into the Lord's work");
    expect(PATCHED.primer_takeaways).toEqual(["One thing", "Another"]);
  });

  it("leaves an existing summary completely alone", async () => {
    // A job that can silently replace what somebody wrote is a job nobody
    // can trust, and this one runs unwatched.
    ROWS[0].primer_idea = "Something a counselor typed.";
    const out = await run({ date: "2026-09-27" });
    expect(out.ok).toBe(true);
    expect(out.did).toMatch(/already has a summary/i);
    expect(PATCHED).toBeNull();
    expect(CALLS.some((u) => u.includes("anthropic")), "it paid for a draft it threw away")
      .toBe(false);
  });

  it("stops when no talk has been assigned", async () => {
    // Nothing to read. Summarising a title would be inventing the talk.
    ROWS[0].talk_link = null;
    const out = await run({ date: "2026-09-27" });
    expect(out.did).toMatch(/no talk link/i);
    expect(PATCHED).toBeNull();
    expect(CALLS.some((u) => u.includes("anthropic"))).toBe(false);
  });

  it("stops when there's no lesson row at all", async () => {
    ROWS = [];
    const out = await run({ date: "2026-09-27" });
    expect(out.did).toMatch(/no lesson row/i);
    expect(PATCHED).toBeNull();
  });

  it("saves nothing when the reply can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      const u = String(url);
      if (u.includes("/rest/v1/")) {
        if (init.method === "PATCH") { PATCHED = JSON.parse(init.body); return { ok: true, status: 204, text: async () => "" }; }
        return { ok: true, status: 200, json: async () => ROWS };
      }
      if (u.includes("anthropic")) {
        return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Sorry, no." }] }) };
      }
      return { ok: true, status: 200, text: async () => PAGE };
    }));
    const out = await run({ date: "2026-09-27" });
    expect(out.ok).toBe(false);
    expect(PATCHED, "an unreadable draft was saved anyway").toBeNull();
  });

  it("uses the project URL the app already has", async () => {
    // VITE_SUPABASE_URL is set because the browser needs it. Asking for a
    // second copy under another name is two places to change one string.
    delete process.env.SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    const out = await run({ date: "2026-09-27" });
    expect(out.ok).toBe(true);
    expect(PATCHED).toBeTruthy();
    delete process.env.VITE_SUPABASE_URL;
  });

  it("but never takes the secret key from a VITE_ variable", async () => {
    // Anything named VITE_ is compiled into the bundle every member
    // downloads. A key that bypasses row-level security must not be
    // reachable from one, even if somebody sets it there by mistake.
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_leaked";
    process.env.VITE_SUPABASE_SECRET_KEY = "sb_secret_leaked";
    const out = await run({ date: "2026-09-27" });
    expect(out.ok, "it picked up a key from a published variable").toBe(false);
    expect(PATCHED).toBeNull();
    delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VITE_SUPABASE_SECRET_KEY;
  });

  it("takes the newer Supabase secret key under its own name", async () => {
    // Supabase is retiring service_role in favour of sb_secret_... Either
    // name works, so a project on the new keys doesn't end up with a variable
    // called SERVICE_ROLE holding something else.
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SECRET_KEY = "sb_secret_abc";
    const out = await run({ date: "2026-09-27" });
    expect(out.ok).toBe(true);
    expect(PATCHED).toBeTruthy();
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("and says which one to set when neither is there", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const out = await run({ date: "2026-09-27" });
    expect(out.ok).toBe(false);
    expect(out.did).toContain("SUPABASE_SECRET_KEY");
    expect(out.did, "the older name isn't mentioned as a fallback")
      .toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("says so rather than throwing when a key is missing", async () => {
    // A scheduled job that crashes leaves a stack trace nobody reads. This
    // has to name the thing to go and fix.
    process.env.ANTHROPIC_API_KEY = "";
    const out = await run({ date: "2026-09-27" });
    expect(out.ok).toBe(false);
    expect(out.did).toContain("ANTHROPIC_API_KEY");
    expect(PATCHED).toBeNull();
  });

  it("and a dry run decides everything but writes nothing", async () => {
    const out = await run({ date: "2026-09-27", dry: true });
    expect(out.ok).toBe(true);
    expect(out.primer.idea).toBeTruthy();
    expect(PATCHED).toBeNull();
  });
});

describe("which Sunday it picks", () => {
  it("the next one the quorum actually gathers", () => {
    // Tuesday 22 September 2026 → the Sunday after.
    expect(nextGathering("2026-09-22")).toBe("2026-09-27");
  });

  it("skipping conference weekends rather than drafting for them", () => {
    // The first Sunday of April is General Conference — no quorum lesson, so
    // no summary to write.
    const picked = nextGathering("2026-03-31");
    expect(picked).not.toBe("2026-04-05");
    expect(picked > "2026-04-05").toBe(true);
  });
});

/* ------------------------ the hand-triggered endpoint --------------------- */

/**
 * A Netlify function with a schedule is schedule-ONLY — Netlify answers 403 to
 * any HTTP request for it. Right for a job that spends money and writes to the
 * database, and it means the documented ?dry=1 test could never have worked in
 * production. So the manual run is a second, public endpoint, and being public
 * is exactly why it's guarded.
 */
describe("running it by hand", () => {
  const call = async (query) => {
    const { default: handler } = await import("../netlify/functions/draft-primer-now.mjs");
    const res = await handler(new Request(`https://eqhq.netlify.app/x?${query}`));
    return { status: res.status, body: await res.text() };
  };

  it("refuses everything when no token is configured", async () => {
    // Fails closed. An endpoint that stands open because a variable wasn't
    // set works perfectly for months and then costs whatever somebody feels
    // like costing the day they find it.
    delete process.env.PRIMER_TRIGGER_TOKEN;
    const out = await call("dry=1");
    expect(out.status).toBe(503);
    expect(out.body).toContain("PRIMER_TRIGGER_TOKEN");
    expect(PATCHED).toBeNull();
  });

  it("gives a wrong token nothing to learn from", async () => {
    process.env.PRIMER_TRIGGER_TOKEN = "a-long-random-string";
    const out = await call("token=wrong&dry=1");
    expect(out.status).toBe(404);
    // No hint that the endpoint exists, let alone why the token failed.
    expect(out.body).not.toContain("PRIMER_TRIGGER_TOKEN");
    expect(PATCHED).toBeNull();
  });

  it("and no token at all is the same answer", async () => {
    process.env.PRIMER_TRIGGER_TOKEN = "a-long-random-string";
    expect((await call("dry=1")).status).toBe(404);
    expect(PATCHED).toBeNull();
  });

  it("isn't defeated by whitespace on a pasted value", async () => {
    // Pasting into an environment-variable field picks up a trailing newline
    // more often than anyone admits, and the failure is indistinguishable
    // from a wrong token: a bare 404 with nothing to go on.
    process.env.PRIMER_TRIGGER_TOKEN = "a-long-random-string\n";
    const out = await call("token=a-long-random-string&date=2026-09-27");
    expect(out.status).toBe(200);
    expect(PATCHED).toBeTruthy();
  });

  it("but a genuinely different token still fails", async () => {
    // Trimming must not become "close enough".
    process.env.PRIMER_TRIGGER_TOKEN = "a-long-random-string";
    expect((await call("token=a-long-random-strin&dry=1")).status).toBe(404);
    expect((await call("token=A-LONG-RANDOM-STRING&dry=1")).status).toBe(404);
    expect(PATCHED).toBeNull();
  });

  it("runs with the right token", async () => {
    process.env.PRIMER_TRIGGER_TOKEN = "a-long-random-string";
    const out = await call("token=a-long-random-string&date=2026-09-27");
    expect(out.status).toBe(200);
    expect(PATCHED, "the right token didn't get through").toBeTruthy();
  });

  it("and a dry run still writes nothing", async () => {
    process.env.PRIMER_TRIGGER_TOKEN = "a-long-random-string";
    const out = await call("token=a-long-random-string&date=2026-09-27&dry=1");
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body).primer.idea).toBeTruthy();
    expect(PATCHED).toBeNull();
  });
});
