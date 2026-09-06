/**
 * The post categories, now that the ward can add their own.
 *
 * "under PLAN we have activities. lets add the option to add new categories
 *  (like Service or something else)"
 *
 * These were four hardcoded entries and a CHECK constraint. They're a table
 * now, which means every rule that used to be guaranteed by the array being a
 * literal has to be written down and checked instead:
 *
 *   * a post can hold a key no category has any more
 *   * two categories mustn't collide on a key
 *   * a retired category still has to colour its old posts
 *   * the list can be empty for a moment while it loads
 *
 * Nothing here touches a database. The store in useCategories.js does that;
 * this decides what the answers mean.
 */

/**
 * What the app falls back to when it meets a category it doesn't recognise.
 *
 * Not the first entry in the list, which is what the old hardcoded version
 * did: with an editable list "the first one" is whatever happens to sort
 * first today, so a post would change colour when somebody reordered the
 * settings screen. A fixed, neutral, unnamed fallback keeps an orphaned post
 * looking the same forever.
 */
export const UNKNOWN = Object.freeze({
  key: "", label: "Post",
  accent: "var(--sub, #6b7280)", soft: "var(--line-soft, #eef1f5)",
  sort_order: 9999, retired: false, plans: false, hint: null,
});

/** The four the app ships with, used until the table has loaded. */
export const SEED = Object.freeze([
  { key: "announcement", label: "Announcements", accent: "var(--primary-deep)", soft: "var(--primary-soft)", sort_order: 10, plans: false, hint: null },
  { key: "activity", label: "Activities", accent: "var(--green)", soft: "var(--green-soft)", sort_order: 20, plans: true, hint: "Pickleball, basketball, the quorum BBQ." },
  { key: "assignment", label: "Assignments", accent: "var(--red)", soft: "var(--red-soft)", sort_order: 30, plans: true, hint: "Temple cleaning, youth camp, the rodeo — jobs the quorum takes on." },
  { key: "temple", label: "Temple Trips", accent: "var(--gold)", soft: "var(--gold-soft)", sort_order: 40, plans: true, hint: "Sessions the quorum is going to together." },
].map(Object.freeze));

/**
 * Colours offered when adding one, in the order they're suggested.
 *
 * CSS variables rather than hex, so a new category themes itself in dark mode
 * like the original four do. The list is the palette the app already uses —
 * a category in an off-brand colour looks like a bug.
 */
export const PALETTE = Object.freeze([
  { name: "Blue", accent: "var(--primary-deep)", soft: "var(--primary-soft)" },
  { name: "Green", accent: "var(--green)", soft: "var(--green-soft)" },
  { name: "Red", accent: "var(--red)", soft: "var(--red-soft)" },
  { name: "Gold", accent: "var(--gold)", soft: "var(--gold-soft)" },
  { name: "Purple", accent: "var(--purple, #7a3fbf)", soft: "var(--purple-soft, #efe6fb)" },
  { name: "Teal", accent: "var(--teal, #0f8f8f)", soft: "var(--teal-soft, #dff3f3)" },
].map(Object.freeze));

/* --------------------------------- keys ---------------------------------- */

/**
 * "Service Projects" -> "service_projects".
 *
 * The key is what lands in posts.category and never changes afterwards, so
 * it's built once from the name and then left alone. Renaming the category
 * later changes only the label — which is the point of having both.
 */
export function keyFor(label) {
  return String(label || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * A key nothing else is using, by adding a number if it has to.
 *
 * Two categories called "Service" would both key to "service", and the second
 * would silently overwrite the first on insert — primary keys don't warn.
 * Checked against retired ones too: their old posts still point at that key.
 */
export function uniqueKey(label, existing = []) {
  const taken = new Set((existing || []).map((c) => c?.key).filter(Boolean));
  const base = keyFor(label) || "category";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const k = `${base}_${n}`;
    if (!taken.has(k)) return k;
  }
  return `${base}_${Date.now()}`;
}

/* ------------------------------- the list -------------------------------- */

const byOrder = (a, b) =>
  (a.sort_order ?? 100) - (b.sort_order ?? 100) ||
  String(a.label || "").localeCompare(String(b.label || ""));

/** Everything, retired included, in display order. For the settings screen. */
export function allCategories(rows = []) {
  return [...(rows || [])].filter(Boolean).sort(byOrder);
}

/**
 * The ones you can file something under: not retired.
 *
 * This is what the composer's dropdown and Plan's sections use. Retiring is
 * how a category stops being offered without rewriting history.
 */
export function activeCategories(rows = []) {
  return allCategories(rows).filter((c) => !c.retired);
}

/** The ones with their own planner section under Plan. */
export function planningCategories(rows = []) {
  return activeCategories(rows).filter((c) => c.plans);
}

/**
 * Look up one category by key.
 *
 * Falls back to UNKNOWN rather than to the first entry, and finds retired
 * ones — a post filed under a category that's since been retired must keep
 * its label and colour, which is the whole promise retiring makes.
 */
export function metaFor(key, rows = []) {
  const k = String(key || "");
  return (rows || []).find((c) => c && c.key === k) || UNKNOWN;
}

/**
 * Can this category be retired right now?
 *
 * Not the last one standing: a composer with an empty dropdown can't file
 * anything, and there'd be no way back except SQL.
 */
export function canRetire(key, rows = []) {
  const active = activeCategories(rows);
  if (active.length <= 1) return false;
  return active.some((c) => c.key === key);
}

/**
 * Sort orders spaced ten apart, renumbered from the given order.
 *
 * Gaps on purpose: inserting between two neighbours doesn't have to renumber
 * the whole list, so a reorder writes as few rows as it can.
 */
export function reorder(keys = []) {
  return (keys || []).map((key, i) => ({ key, sort_order: (i + 1) * 10 }));
}

/**
 * What a brand new category should look like.
 *
 * Picks the first palette colour nothing is using, so two categories don't
 * arrive the same colour and become indistinguishable on the feed. Falls back
 * to cycling once every colour is taken.
 */
export function newCategory(label, rows = []) {
  const used = new Set((rows || []).map((c) => c?.accent));
  const colour = PALETTE.find((p) => !used.has(p.accent))
    || PALETTE[(rows || []).length % PALETTE.length];
  const last = allCategories(rows).slice(-1)[0];
  return {
    key: uniqueKey(label, rows),
    label: String(label || "").trim(),
    accent: colour.accent,
    soft: colour.soft,
    sort_order: ((last?.sort_order ?? 0) + 10),
    retired: false,
    plans: true,
    hint: null,
  };
}

/** Is this name usable? Returns "" when it's fine, or why not. */
export function nameProblem(label, rows = [], selfKey = "") {
  const t = String(label || "").trim();
  if (!t) return "Give it a name.";
  if (t.length > 40) return "That's a bit long — 40 characters or fewer.";
  if (!keyFor(t)) return "Use at least one letter or number.";
  const clash = (rows || []).some(
    (c) => c && c.key !== selfKey && String(c.label || "").trim().toLowerCase() === t.toLowerCase()
  );
  // Checked against retired ones as well: two categories reading "Service" in
  // the settings list, one greyed out, is confusing even though it works.
  if (clash) return "There's already a category with that name.";
  return "";
}
