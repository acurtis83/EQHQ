// The Tuesday run. All it does is call run() and leave a line in the log.
//
// A Netlify function with a `schedule` in its config is schedule-ONLY: Netlify
// answers 403 to any HTTP request for it. That is the behaviour you want for a
// job that spends money and writes to the database — nobody triggers it by
// guessing a URL — but it means this file cannot also be the manual test
// endpoint. That lives next door in draft-primer-now.mjs, behind a token, and
// both call the same run().
//
// See src/lib/draftPrimer.mjs for what it actually does and why it refuses
// what it refuses.

import { run } from "../../src/lib/draftPrimer.mjs";

export default async function handler() {
  let out;
  try {
    out = await run();
  } catch (e) {
    out = { ok: false, did: String(e?.message || e) };
  }
  // Logged whether it worked or not. Nobody is watching a scheduled run, so
  // the log is the only place a broken key can announce itself before the
  // first anyone knows is a Sunday with no summary.
  console.log("[draft-primer]", out.did);
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Tuesdays at 13:00 UTC — 6am Mountain in summer, 7am in winter. Early enough
// that a bad run can be noticed and fixed long before Sunday, and after the
// Monday email has gone out so the two never race for the same row.
export const config = { schedule: "0 13 * * 2" };
