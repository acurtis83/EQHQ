/**
 * What the presidency plans, derived from the category list.
 *
 * Pure, and in domain/ rather than in Planning.jsx, for a reason worth
 * recording: these functions started life in the component file and the
 * arithmetic suite imported them from there — which silently did nothing,
 * because plain Node can't load a .jsx file and the import was wrapped in a
 * catch. Fourteen assertions reported themselves as passing without ever
 * running. Rules that need testing live in a .js file.
 */
import { planningCategories, SEED } from "./categories.js";

/**
 * "Activities" -> "Activity". For the "New Activity" button and the picker.
 *
 * Handled here rather than stored, because every plural the ward is likely to
 * type follows one of these two rules, and a column somebody has to fill in
 * correctly is a column that ends up saying "Servicess".
 */
export function singular(label) {
  const t = String(label || "").trim();
  if (/ies$/i.test(t)) return t.replace(/ies$/i, "y");
  if (/(ss|us|s)$/i.test(t) && !/ss$/i.test(t)) return t.replace(/s$/i, "");
  return t;
}

/** The planner sections, from the categories flagged as planning ones. */
export function kindsFrom(categories = []) {
  return planningCategories(categories).map((c) => ({
    key: c.key,
    label: c.label,
    one: singular(c.label),
    hint: c.hint || "",
    publishes: true,
    category: c.key,
  }));
}

// Kept so the app still works before the category list has loaded, and so a
// database that hasn't run categories.sql behaves exactly as it did before.
export const EVENT_KINDS = kindsFrom(SEED);

/**
 * The section a planner row belongs to.
 *
 * Falls back to the first rather than returning undefined: the caller reads
 * .label and .one straight off it, and an undefined here is a white screen.
 */
export const kindMeta = (k, kinds) => {
  const list = kinds && kinds.length ? kinds : EVENT_KINDS;
  return list.find((x) => x.key === k) || list[0];
};
