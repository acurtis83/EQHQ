// Writes next Sunday's Quick Summary, once a week, without being asked.
//
// "ok....so for each week i need to run a Quick Summary request"
//
// No. This runs every Tuesday morning: it finds the Sunday coming, reads the
// talk assigned to it, drafts the primer and saves it. By the time anybody
// opens the feed midweek the button is there.
//
// It can also be poked by hand for testing:
//   /.netlify/functions/draft-primer?date=2026-09-27
//   /.netlify/functions/draft-primer?dry=1        (says what it would do)
//
// Three things it will not do, each for its own reason:
//
//   - It never overwrites. A primer that already exists was either written by
//     the presidency or drafted on an earlier run and possibly edited since,
//     and a scheduled job that can silently replace somebody's words is a job
//     nobody can trust.
//   - It never invents a talk. No talk_link on the row means nothing to read,
//     so it stops rather than summarising a title.
//   - It never saves a reply it couldn't parse. An apology or a wall of prose
//     would land as a Quick Summary button opening an empty sheet, which is
//     worse than no button, and nothing downstream would flag it.
//
// The service role key bypasses row-level security entirely. It lives in
// Netlify's environment and is read here, server-side; it must never be put
// in a VITE_ variable, because everything with that prefix is compiled into
// the bundle every member downloads.

import { toIso, isScheduledSunday, sundaysBetween } from "../../src/lib/domain/dates.js";
import { primerColumns, isEmptyPrimer, primerFromRow } from "../../src/lib/domain/primer.js";
import { talkBody, looksLikeTalk } from "../../src/lib/domain/talkText.js";
import { SYSTEM, primerPrompt, readReply } from "../../src/lib/domain/primerPrompt.js";

const MODEL = "claude-sonnet-5";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122 Safari/537.36";

/** The next Sunday the quorum actually gathers, from a given day. */
export function nextGathering(fromIso) {
  const horizon = new Date(new Date(`${fromIso}T00:00:00Z`).getTime() + 45 * 86400000);
  for (const iso of sundaysBetween(fromIso, toIso(horizon))) {
    if (isScheduledSunday(iso)) return iso;
  }
  return "";
}

const env = (name) => process.env[name] || "";

/**
 * The key that can write to the database, under either of its names.
 *
 * Supabase is replacing `service_role` with a `sb_secret_...` key and will
 * retire the old one. Both are sent exactly the same way, so which one a
 * project has is not this function's business — but the variable NAME would
 * otherwise be a small lie sitting in Netlify for a year, and the kind of
 * thing that sends somebody hunting for a service_role key their project no
 * longer offers. Either name works; the newer one wins if both are set.
 */
const secretKey = () => env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");

async function supabase(path, init = {}) {
  const url = `${env("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: secretKey(),
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

async function draft({ title, speaker, text }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: "user", content: primerPrompt({ title, speaker, text }) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

/**
 * One run. Returns what it did, in words, so a manual poke and the scheduled
 * run report the same way and a log line is worth reading.
 */
export async function run({ date, dry = false } = {}) {
  for (const need of ["SUPABASE_URL", "ANTHROPIC_API_KEY"]) {
    if (!env(need)) return { ok: false, did: `${need} isn't set in Netlify.` };
  }
  if (!secretKey()) {
    return { ok: false, did: "SUPABASE_SECRET_KEY isn't set in Netlify (SUPABASE_SERVICE_ROLE_KEY also works)." };
  }

  const sunday = date || nextGathering(toIso(new Date()));
  if (!sunday) return { ok: true, did: "No gathering Sunday in the next six weeks." };

  const rows = await supabase(
    `teaching_assignments?date=eq.${sunday}&select=date,talk_title,topic,speaker,talk_link,` +
    `primer_idea,primer_takeaways,primer_scripture,primer_question`
  );
  const row = rows?.[0];
  if (!row) return { ok: true, did: `No lesson row for ${sunday} yet.`, sunday };

  // Never overwrite. See the header.
  if (!isEmptyPrimer(primerFromRow(row))) {
    return { ok: true, did: `${sunday} already has a summary — left alone.`, sunday };
  }
  if (!row.talk_link) {
    return { ok: true, did: `${sunday} has no talk link, so there's nothing to read.`, sunday };
  }

  const page = await fetch(row.talk_link, { headers: { "User-Agent": UA } });
  if (!page.ok) return { ok: false, did: `The talk page returned ${page.status}.`, sunday };
  const text = talkBody(await page.text());
  if (!looksLikeTalk(text)) {
    return { ok: false, did: "That link didn't give back enough text to summarise.", sunday };
  }

  const reply = await draft({
    title: row.talk_title || row.topic, speaker: row.speaker, text,
  });
  const primer = readReply(reply);
  if (!primer) return { ok: false, did: "The draft came back in a shape I couldn't read.", sunday };

  if (dry) return { ok: true, did: `Would write a summary for ${sunday}.`, sunday, primer };

  await supabase(`teaching_assignments?date=eq.${sunday}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(primerColumns(primer)),
  });
  return { ok: true, did: `Wrote the summary for ${sunday}.`, sunday, primer };
}

export default async function handler(req) {
  const url = new URL(req.url);
  let out;
  try {
    out = await run({
      date: url.searchParams.get("date") || "",
      dry: !!url.searchParams.get("dry"),
    });
  } catch (e) {
    out = { ok: false, did: String(e?.message || e) };
  }
  // Logged either way: a scheduled run nobody watches still has to leave a
  // trail saying what it decided, or the first anybody knows of a broken key
  // is a Sunday with no summary.
  console.log("[draft-primer]", out.did);
  return new Response(JSON.stringify(out, null, 2), {
    status: out.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

// Tuesdays at 13:00 UTC — 6am Mountain in summer, 7am in winter. Early enough
// that a bad run can be noticed and fixed long before Sunday, and after the
// Monday email has gone out so the two never race for the same row.
export const config = { schedule: "0 13 * * 2" };
