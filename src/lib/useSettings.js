import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { SETTING_KEYS, safeUrl } from "./domain/settings";

/**
 * The handful of things the quorum sets up once.
 *
 * Cached at module scope and shared: the feed, the settings screen and the
 * weekly email all want the same two or three values, and three components
 * mounting means three round trips for a table with one row in it.
 *
 * A missing table isn't an error worth showing anybody. Settings are optional
 * by definition — no GroupMe link just means no GroupMe card — so a database
 * that hasn't run the migration behaves like one where nothing is set yet.
 *
 * The keys and the URL check live in domain/settings.js so they can be tested
 * without a database; they're re-exported here so callers need one import.
 */
export { SETTING_KEYS, safeUrl };

let cache = null;
let inflight = null;
const listeners = new Set();

async function fetchAll() {
  const { data, error } = await supabase.from("app_settings").select("key,value");
  if (error) return {};
  const out = {};
  for (const row of data || []) out[row.key] = row.value || "";
  return out;
}

export function useSettings() {
  const [settings, setSettings] = useState(cache || {});

  useEffect(() => {
    listeners.add(setSettings);
    if (cache) setSettings(cache);
    else {
      inflight = inflight || fetchAll();
      inflight.then((all) => {
        cache = all;
        for (const l of listeners) l(all);
      });
    }
    return () => { listeners.delete(setSettings); };
  }, []);

  /**
   * Write one setting.
   *
   * Upsert rather than update: the first time anybody sets the GroupMe link
   * there's no row to update, and an update that matches nothing succeeds
   * silently — which looks exactly like saving and then losing it.
   */
  const save = useCallback(async (key, value) => {
    const next = String(value || "").trim();
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return error.message;

    cache = { ...(cache || {}), [key]: next };
    for (const l of listeners) l(cache);
    return "";
  }, []);

  return { settings, save };
}

/** Forget the cache — for tests, and after a sign-in changes what's visible. */
export function resetSettings() {
  cache = null;
  inflight = null;
}
