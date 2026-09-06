import { useEffect, useMemo, useState } from "react";
import { Plus, ChevronUp, ChevronDown, EyeOff, Eye, Check } from "lucide-react";
import { T, card, Btn, Input, Chip, SectionTitle } from "../components/ui";
import {
  useCategories, saveCategory, saveOrder, setRetired, countsByCategory,
} from "../lib/useCategories";
import {
  allCategories, activeCategories, canRetire, newCategory, nameProblem,
  reorder, PALETTE,
} from "../lib/domain/categories";

/**
 * Add and manage the categories a post can be filed under.
 *
 * "under PLAN we have activities. lets add the option to add new categories
 *  (like Service or something else)"
 *
 * Three things this screen is careful about, all of them about not losing
 * history:
 *
 * Retire, never delete. A retired category vanishes from the composer and
 * from Plan, and every post already filed under it keeps its label and its
 * colour. Deleting would silently restyle last year's service projects as
 * announcements, and there'd be no way back.
 *
 * The count is shown before you retire. "Retire Service" means something
 * different when it holds eleven posts than when it holds none, and the
 * screen shouldn't make you go and check.
 *
 * The key never changes. Renaming "Activities" to "Quorum Activities" changes
 * the label only; the key posts point at stays put, so nothing has to be
 * rewritten and nothing can be missed in the rewriting.
 */
export default function CategorySettings() {
  const { rows, missing, error, reload } = useCategories();
  const [counts, setCounts] = useState({});
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);

  useEffect(() => { countsByCategory().then(setCounts); }, [rows]);

  const list = useMemo(() => allCategories(rows), [rows]);
  const problem = adding ? nameProblem(adding, rows) : "";

  const add = async () => {
    if (problem) return;
    setBusy(true);
    const e = await saveCategory(newCategory(adding, rows));
    setBusy(false);
    if (e) setErr(e); else { setAdding(""); setErr(""); }
  };

  const move = async (key, delta) => {
    const keys = list.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setBusy(true);
    const e = await saveOrder(reorder(keys));
    setBusy(false);
    if (e) setErr(e);
  };

  if (missing) {
    return (
      <div style={{ ...card, padding: 16 }}>
        <SectionTitle sub="One migration to run first">Categories</SectionTitle>
        <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.5 }}>
          Categories are still built into the app. To add your own, run{" "}
          <strong>supabase/categories.sql</strong> in Supabase → SQL Editor, then
          reload. It keeps the four you have and never deletes a post.
        </p>
        <Btn onClick={reload} style={{ marginTop: 10 }}>Check again</Btn>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle sub="What a post or a planned event can be filed under">
        Categories
      </SectionTitle>

      {(err || error) && (
        <div style={{ ...card, padding: 11, marginBottom: 12, fontSize: 13.5,
          color: "var(--red, #c0392b)" }}>
          {err || error}
        </div>
      )}

      {list.map((c, i) => {
        const used = counts[c.key] || 0;
        const stuck = !c.retired && !canRetire(c.key, rows);
        return (
          <div key={c.key} style={{ ...card, padding: "11px 12px", marginBottom: 8,
            opacity: c.retired ? 0.62 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: "0 0 auto", width: 5, alignSelf: "stretch",
                minHeight: 34, borderRadius: 3, background: c.accent }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
                  {c.label}
                  {c.retired && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.sub,
                      marginLeft: 8 }}>retired</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: T.sub, marginTop: 1 }}>
                  {used} post{used === 1 ? "" : "s"}
                  {c.plans ? "  •  has a planner section" : "  •  feed only"}
                </div>
              </div>
              <Btn size="sm" kind="ghost" onClick={() => move(c.key, -1)}
                disabled={busy || i === 0} aria-label={`Move ${c.label} up`}>
                <ChevronUp size={15} />
              </Btn>
              <Btn size="sm" kind="ghost" onClick={() => move(c.key, 1)}
                disabled={busy || i === list.length - 1} aria-label={`Move ${c.label} down`}>
                <ChevronDown size={15} />
              </Btn>
              <Btn size="sm" kind="ghost" onClick={() => setEditing(c)}
                aria-label={`Edit ${c.label}`}>
                Edit
              </Btn>
            </div>

            {editing?.key === c.key && (
              <EditRow
                category={c}
                rows={rows}
                used={used}
                stuck={stuck}
                onDone={() => setEditing(null)}
                onError={setErr}
              />
            )}
          </div>
        );
      })}

      <div style={{ ...card, padding: "11px 12px", marginTop: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em",
          textTransform: "uppercase", color: T.sub, marginBottom: 8 }}>
          Add a category
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input value={adding} onChange={setAdding} placeholder="Service"
            aria-label="New category name" style={{ flex: 1 }} />
          <Btn kind="primary" onClick={add} disabled={busy || !adding.trim() || !!problem}>
            <Plus size={15} /> Add
          </Btn>
        </div>
        {problem && (
          <div style={{ fontSize: 13, color: "var(--red, #c0392b)", marginTop: 6 }}>
            {problem}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: 8, lineHeight: 1.45 }}>
          A new category gets its own section under Plan — dates, sign-ups and
          publishing to the feed, the same as Activities. It picks an unused
          colour so two categories never look alike.
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- editing --------------------------------- */

function EditRow({ category, rows, used, stuck, onDone, onError }) {
  const [label, setLabel] = useState(category.label);
  const [accent, setAccent] = useState(category.accent);
  const [plans, setPlans] = useState(!!category.plans);
  const [hint, setHint] = useState(category.hint || "");
  const [busy, setBusy] = useState(false);

  const problem = nameProblem(label, rows, category.key);

  const save = async () => {
    if (problem) return;
    setBusy(true);
    const colour = PALETTE.find((p) => p.accent === accent);
    // The key is deliberately not touched. It's what every post points at,
    // and a rename that rewrote it would have to rewrite them all — with no
    // transaction around it and no way to tell which half succeeded.
    const e = await saveCategory({
      key: category.key,
      label: label.trim(),
      accent,
      soft: colour?.soft || category.soft,
      sort_order: category.sort_order,
      retired: category.retired,
      plans,
      hint: hint.trim() || null,
    });
    setBusy(false);
    if (e) onError(e); else onDone();
  };

  const retire = async () => {
    setBusy(true);
    const e = await setRetired(category.key, !category.retired);
    setBusy(false);
    if (e) onError(e); else onDone();
  };

  return (
    <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${T.lineSoft}` }}>
      <label style={lbl}>Name</label>
      <Input value={label} onChange={setLabel} aria-label={`Name for ${category.key}`} />
      {problem && (
        <div style={{ fontSize: 13, color: "var(--red, #c0392b)", marginTop: 5 }}>{problem}</div>
      )}

      <label style={lbl}>Colour</label>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {PALETTE.map((p) => (
          <button
            key={p.name}
            onClick={() => setAccent(p.accent)}
            aria-label={p.name}
            aria-pressed={accent === p.accent}
            style={{
              width: 30, height: 30, borderRadius: 8, background: p.accent,
              border: accent === p.accent ? `3px solid ${T.ink}` : "2px solid transparent",
              cursor: "pointer", display: "inline-flex",
              alignItems: "center", justifyContent: "center",
            }}
          >
            {accent === p.accent && <Check size={14} color="#fff" />}
          </button>
        ))}
      </div>

      <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8,
        textTransform: "none", fontSize: 14.5, letterSpacing: 0 }}>
        <input type="checkbox" checked={plans} onChange={(e) => setPlans(e.target.checked)} />
        Give it a section under Plan
      </label>

      {plans && (
        <>
          <label style={lbl}>Hint under the heading</label>
          <Input value={hint} onChange={setHint}
            placeholder="Yard clean-ups, moves, meals."
            aria-label="Planner hint" />
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Btn kind="primary" onClick={save} disabled={busy || !!problem}>Save</Btn>
        <Btn kind="ghost" onClick={onDone}>Cancel</Btn>
        <div style={{ flex: 1 }} />
        <Btn kind="ghost" onClick={retire} disabled={busy || stuck}
          title={stuck ? "There has to be at least one category left" : ""}>
          {category.retired ? <><Eye size={14} /> Bring back</> : <><EyeOff size={14} /> Retire</>}
        </Btn>
      </div>

      {/* Said before the button is pressed, not after. "Retire" reads like
          "delete" and the difference matters most when there's history. */}
      {!category.retired && (
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: 8, lineHeight: 1.45 }}>
          {stuck
            ? "This is the last category left, so it can't be retired."
            : used > 0
              ? `Retiring stops it being offered on new posts. The ${used} post${used === 1 ? "" : "s"} already filed under it keep this name and colour, and nothing is deleted.`
              : "Retiring stops it being offered on new posts. Nothing is deleted, and you can bring it back."}
        </div>
      )}
    </div>
  );
}

const lbl = {
  display: "block", fontSize: 12, fontWeight: 700, color: T.sub,
  textTransform: "uppercase", letterSpacing: "0.06em", margin: "13px 0 5px",
};
