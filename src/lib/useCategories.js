import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { SEED } from "./domain/categories";

/**
 * The post categories, loaded once and shared.
 *
 * Cached at module scope like useSettings: the feed, the composer, Plan and
 * the agenda all want the same short list, and four components mounting
 * shouldn't mean four round trips for four rows.
 *
 * Two things this has to get right, both about the gap before the table
 * answers:
 *
 * It starts from SEED rather than an empty array. An empty list means a
 * composer with no options and a feed whose chips are all grey for a beat —
 * and on a slow connection that beat is visible. SEED is the same four the
 * app shipped with, so the first paint is right for every existing ward and
 * only a custom fifth arrives late.
 *
 * A missing table behaves like a database that hasn't run the migration,
 * which is exactly what it is: keep SEED, flag it, and let the settings
 * screen say which file to run. The app carries on working with four
 * categories, which is what it had yesterday.
 */

let cache = null;
let inflight = null;
const listeners = new Set();

async function fetchAll() {
  const { data, error } = await supabase
    .from("post_categories")
    .select("key,label,accent,soft,sort_order,retired,plans,hint")
    .order("sort_order");
  if (error) {
    // Distinguish "no table yet" from a real failure. The first is a prompt to
    // run a migration; the second shouldn't be dressed up as one.
    const missing = /does not exist|schema cache/i.test(error.message || "");
    return { rows: SEED, missing, error: missing ? "" : error.message };
  }
  // An empty table would leave the app with nothing to file under. Treat it
  // the same as not migrated rather than rendering a dead composer.
  if (!data?.length) return { rows: SEED, missing: true, error: "" };
  return { rows: data, missing: false, error: "" };
}

function publish(next) {
  cache = next;
  for (const fn of listeners) fn(next);
}

export function useCategories() {
  const [state, setState] = useState(cache || { rows: SEED, missing: false, error: "" });

  useEffect(() => {
    listeners.add(setState);
    if (cache) setState(cache);
    else {
      inflight = inflight || fetchAll();
      inflight.then((next) => { inflight = null; publish(next); });
    }
    return () => { listeners.delete(setState); };
  }, []);

  const reload = useCallback(async () => {
    const next = await fetchAll();
    publish(next);
    return next;
  }, []);

  return { ...state, reload };
}

/**
 * Write helpers. Each one reloads, so every screen sees the change at once —
 * the composer's dropdown and Plan's sections are the same list and must not
 * disagree about it for the rest of the session.
 */
export async function saveCategory(row) {
  const { error } = await supabase.from("post_categories").upsert(row, { onConflict: "key" });
  if (!error) publish(await fetchAll());
  return error?.message || "";
}

export async function saveOrder(pairs = []) {
  for (const p of pairs) {
    const { error } = await supabase
      .from("post_categories").update({ sort_order: p.sort_order }).eq("key", p.key);
    if (error) return error.message;
  }
  publish(await fetchAll());
  return "";
}

/**
 * Retire, never delete. Old posts keep pointing at this key and keep their
 * label and colour; the category just stops being offered.
 */
export async function setRetired(key, retired) {
  const { error } = await supabase
    .from("post_categories").update({ retired: !!retired }).eq("key", key);
  if (!error) publish(await fetchAll());
  return error?.message || "";
}

/** How many posts each category holds, so retiring is an informed choice. */
export async function countsByCategory() {
  const { data, error } = await supabase.from("posts").select("category");
  if (error) return {};
  const out = {};
  for (const r of data || []) out[r.category] = (out[r.category] || 0) + 1;
  return out;
}
