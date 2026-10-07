import { supabase } from "./supabase";
import { usageEvent, deviceId, KIND } from "./domain/usage";

/**
 * Record that the app was opened, or that a link was tapped.
 *
 * Fire-and-forget, and that word is doing real work: nothing here is awaited
 * by a caller and every failure is swallowed. A member tapping a sign-up link
 * must get to the sign-up whether or not the counting worked — a tracker that
 * can break the thing it is measuring is worse than no tracker.
 *
 * The device id is read lazily rather than at import, so a browser with
 * storage blocked doesn't throw while the module is still loading.
 */

let device = null;
const who = () => {
  if (!device) device = deviceId(typeof localStorage === "undefined" ? null : localStorage);
  return device;
};

function send(kind, label) {
  const row = usageEvent(kind, label, who());
  if (!row) return;
  try {
    // No await, no .then that could reject unhandled. If the table doesn't
    // exist because usage.sql hasn't been run, this fails silently and the
    // app carries on exactly as before.
    supabase.from("usage_events").insert(row).then(
      () => {},
      () => {}
    );
  } catch {
    /* counting is never worth an exception */
  }
}

/**
 * Once per tab, not once per render.
 *
 * The feed remounts on navigation and on a realtime update, and counting
 * those would turn one brother checking the lesson into a dozen "opens" —
 * which would make the number worse than useless, because it would look
 * like growth.
 */
let opened = false;
export function recordOpen() {
  if (opened) return;
  opened = true;
  send(KIND.OPEN, null);
}

export function recordTap(label) {
  send(KIND.LINK, label);
}

/** Test seam: forget the once-per-tab flag and the cached device. */
export function resetRecording() {
  opened = false;
  device = null;
}
