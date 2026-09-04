import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { toIso } from "./domain/dates";
import { scoreAll, quarterOf } from "./domain/ministering";

/**
 * Everything the ministering screen and the map both need, loaded once.
 *
 * The two views ask the same six questions of the database and then disagree
 * about the answers if they ask separately — the map showing a household as
 * fine while the list two taps away calls it overdue is the kind of bug nobody
 * reports because they assume they misread it. One loader, one set of scores.
 *
 * The scoring itself is in domain/ministering.js and gets `todayIso` handed to
 * it rather than reading the clock, which is what makes it testable. This hook
 * is the only thing here that knows what day it is.
 */

const EMPTY = {
  districts: [], comps: [], households: [], contacts: [], interviews: [],
  members: [], responses: [],
};

/**
 * The check-in scores, flattened out of the forms tables.
 *
 * A "pulse" is the average of the 1–5 answers a brother gave on any survey,
 * so this pulls every scale answer with a name attached and lets the domain
 * layer decide whose is whose. Anonymous responses have no name and are
 * skipped: they're still worth having in the survey summary, but they can't
 * be attributed to a companionship, and guessing would be worse than not
 * counting them.
 */
async function loadPulse() {
  const { data: qs, error: qErr } = await supabase
    .from("form_questions").select("id").eq("type", "scale");
  if (qErr || !qs?.length) return [];

  const { data: answers, error: aErr } = await supabase
    .from("form_answers")
    .select("value, response_id, question_id")
    .in("question_id", qs.map((q) => q.id));
  if (aErr || !answers?.length) return [];

  const { data: responses, error: rErr } = await supabase
    .from("form_responses")
    .select("id, respondent_name")
    .in("id", [...new Set(answers.map((a) => a.response_id))]);
  if (rErr) return [];

  const nameById = {};
  for (const r of responses || []) {
    const n = String(r.respondent_name || "").trim();
    if (n) nameById[r.id] = n;
  }

  const out = [];
  for (const a of answers) {
    const name = nameById[a.response_id];
    if (!name) continue;                       // anonymous — can't attribute it
    const score = Number(a.value);
    if (Number.isFinite(score)) out.push({ name, score });
  }
  return out;
}

export function useMinistering() {
  const [raw, setRaw] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Set when the tables aren't there yet, so the screen can say which file to
  // run rather than showing an empty ward and letting somebody conclude the
  // feature is broken.
  const [needsMigration, setNeedsMigration] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, c, h, ct, iv, m] = await Promise.all([
      supabase.from("ministering_districts").select("*").order("sort_order"),
      supabase.from("ministering_companionships").select("*"),
      supabase.from("ministering_households").select("*").order("name"),
      supabase.from("ministering_contacts").select("*"),
      supabase.from("ministering_interviews").select("*"),
      supabase.from("members").select("id,name,active"),
    ]);

    // A missing table reads as "relation does not exist". Anything else is a
    // real error and shouldn't be dressed up as a migration prompt.
    const missing = [d, c, h, ct, iv].some(
      (r) => r.error && /does not exist|schema cache/i.test(r.error.message || "")
    );
    setNeedsMigration(missing);

    const firstReal = [d, c, h, ct, iv, m].find((r) => r.error && !missing);
    setErr(firstReal ? firstReal.error.message : "");

    const responses = await loadPulse().catch(() => []);

    setRaw({
      districts: d.data || [], comps: c.data || [], households: h.data || [],
      contacts: ct.data || [], interviews: iv.data || [], members: m.data || [],
      responses,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const derived = useMemo(() => {
    const todayIso = toIso(new Date());
    const membersById = {};
    for (const m of raw.members) membersById[m.id] = m;
    const compsById = {};
    for (const c of raw.comps) compsById[c.id] = c;
    const districtsById = {};
    for (const d of raw.districts) districtsById[d.id] = d;

    const scores = scoreAll(raw.households, {
      todayIso,
      contacts: raw.contacts,
      compsById,
      membersById,
      interviews: raw.interviews,
      responses: raw.responses,
    });
    const scoreById = {};
    for (const s of scores) scoreById[s.id] = s;

    // What the map draws: a household with its coordinates and whether it's
    // struggling, and nothing else. Deliberately the same shape the hot-spot
    // arithmetic takes, so the two can't drift.
    const points = raw.households
      .filter((h) => h.active !== false)
      .map((h) => ({
        ...h,
        district_id: compsById[h.companionship_id]?.district_id || null,
        struggling: !!scoreById[h.id]?.struggling,
        level: scoreById[h.id]?.level || "ok",
        flags: scoreById[h.id]?.flags || [],
      }));

    return {
      todayIso, quarter: quarterOf(todayIso),
      membersById, compsById, districtsById, scores, scoreById, points,
    };
  }, [raw]);

  return { ...raw, ...derived, loading, err, needsMigration, reload: load, setErr };
}
