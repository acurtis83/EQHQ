// The same job, run by hand — for checking the setup, and for a Sunday whose
// talk was assigned after Tuesday.
//
//   /.netlify/functions/draft-primer-now?token=…&dry=1
//   /.netlify/functions/draft-primer-now?token=…&date=2026-09-27
//
// This is a public URL that spends money on every call and writes to the
// database, so it is guarded, and it FAILS CLOSED: with no PRIMER_TRIGGER_TOKEN
// set in Netlify the endpoint refuses everything rather than standing open.
// An unguarded version would work perfectly well for months and then cost
// whatever somebody felt like costing the day they found it.
//
// The token is not a credential anybody issues — invent a long random string,
// put it in Netlify beside the other variables, and keep it out of anything
// public. Losing it costs nothing: change the variable and the old one is
// dead.

import { run } from "../../src/lib/draftPrimer.mjs";

/**
 * Compare without leaking the answer through timing.
 *
 * Overkill for a hobby endpoint and cheap enough not to argue about: a plain
 * === returns faster the earlier it finds a difference, which over enough
 * requests is a way to learn the token one character at a time.
 */
function sameToken(given, want) {
  // Trimmed on both sides. Pasting into an environment-variable field picks up
  // a trailing space or newline more often than anyone admits, and a token
  // that is right except for an invisible character fails in exactly the same
  // way as a wrong one — a bare 404 with nothing to go on. Whitespace at
  // either end of a secret is never meaningful, so it is never the difference.
  const a = String(given || "").trim();
  const b = String(want || "").trim();
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const want = (process.env.PRIMER_TRIGGER_TOKEN || "").trim();

  if (!want) {
    return new Response(
      JSON.stringify({
        ok: false,
        did: "PRIMER_TRIGGER_TOKEN isn't set in Netlify, so this endpoint is closed.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!sameToken(url.searchParams.get("token") || "", want)) {
    // Deliberately says nothing about why.
    return new Response("Not found", { status: 404 });
  }

  let out;
  try {
    out = await run({
      date: url.searchParams.get("date") || "",
      dry: !!url.searchParams.get("dry"),
    });
  } catch (e) {
    out = { ok: false, did: String(e?.message || e) };
  }
  console.log("[draft-primer-now]", out.did);
  return new Response(JSON.stringify(out, null, 2), {
    status: out.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}
