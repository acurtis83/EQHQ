import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The categories the presidency has added, on top of the built-in eight.
 *
 * Shared through a module-level promise so the several components that draw a
 * category chip don't each fire their own query — a long agenda would
 * otherwise make one request per item.
 */
let cache = null;

export function invalidateCategories() {
  cache = null;
}

async function fetchCustom() {
  if (!cache) {
    cache = supabase
      .from("agenda_categories")
      .select("key,label,accent,soft")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        // A database that predates the table shouldn't break the agenda; the
        // built-in categories still work on their own.
        if (error) { cache = null; return []; }
        return data || [];
      });
  }
  return cache;
}

export function useAgendaCategories() {
  const [extra, setExtra] = useState([]);

  const reload = useCallback(async () => {
    invalidateCategories();
    setExtra(await fetchCustom());
  }, []);

  useEffect(() => {
    let alive = true;
    fetchCustom().then((rows) => { if (alive) setExtra(rows); });
    return () => { alive = false; };
  }, []);

  return { extra, reload };
}
