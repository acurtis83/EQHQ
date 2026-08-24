import { useCallback, useEffect, useState } from "react";

/**
 * How the agenda and the planner are arranged: in the order things were added,
 * or gathered into one hub per category.
 *
 * A meeting runs one way or the other, not one way on the agenda and another
 * on the planner, so this is a single setting shared by both screens and the
 * printed copy. Kept in a module-level variable as well as in storage so that
 * flipping it on one screen is already true on the other — waiting for a
 * remount to re-read storage would show the old arrangement for a beat.
 */

const KEY = "eq.view";

export const VIEWS = {
  ORDER: "order",
  CATEGORY: "category",
};

let current = null;
const listeners = new Set();

function read() {
  if (current) return current;
  try {
    current = localStorage.getItem(KEY) === VIEWS.CATEGORY ? VIEWS.CATEGORY : VIEWS.ORDER;
  } catch {
    // Private browsing, or storage disabled. The toggle still works for the
    // session; it just won't be remembered.
    current = VIEWS.ORDER;
  }
  return current;
}

export function useViewMode() {
  const [view, setView] = useState(read);

  useEffect(() => {
    listeners.add(setView);
    // Another screen may have changed it between this component's first render
    // and its effects running.
    setView(read());
    return () => { listeners.delete(setView); };
  }, []);

  const change = useCallback((next) => {
    if (next !== VIEWS.ORDER && next !== VIEWS.CATEGORY) return;
    current = next;
    try { localStorage.setItem(KEY, next); } catch { /* not fatal */ }
    for (const l of listeners) l(next);
  }, []);

  return [view, change];
}

/** For tests, and for anything that needs the value without subscribing. */
export function currentView() {
  return read();
}

export function resetViewMode() {
  current = null;
  try { localStorage.removeItem(KEY); } catch { /* not fatal */ }
}
