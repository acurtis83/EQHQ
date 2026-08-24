import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { T, Input, Select } from "./ui";

/**
 * The quorum roster, for anywhere that needs a list of names to pick from.
 *
 * Cached at module scope rather than fetched per component: the agenda screen
 * renders a picker inside every item's editor, and each of those hitting the
 * database for the same list would be a request per row. The roster changes
 * rarely and a stale entry costs nothing — the picker still accepts a name
 * that isn't on it.
 */
let cache = null;
let inflight = null;

export function useMemberNames() {
  const [names, setNames] = useState(cache || []);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    inflight = inflight || supabase
      .from("members").select("name,active").order("name");
    inflight.then(({ data }) => {
      cache = (data || [])
        .filter((m) => m.active !== false && m.name)
        .map((m) => m.name);
      if (alive) setNames(cache);
    });
    return () => { alive = false; };
  }, []);

  return names;
}

/** Forget the cached roster, so a change on the roster screen shows up here. */
export function refreshMemberNames() {
  cache = null;
  inflight = null;
}

const OTHER = "__other__";

/**
 * Who owes this item.
 *
 * A dropdown off the roster rather than a text field, because the names being
 * typed in were already in the database and typing them again invited
 * "Cam", "Cam P." and "Cameron Pearson" to become three different people.
 *
 * It still takes a name that isn't on the roster — assignments go to a bishop,
 * a family, or somebody's wife often enough that a closed list would be wrong.
 * Picking "Someone else" opens a text field, and an existing value that isn't
 * on the roster opens it on its own so an old entry is never silently dropped.
 */
export default function AssigneePicker({ value, onChange, label = "Assigned To" }) {
  const names = useMemberNames();
  const known = !value || names.includes(value);
  const [free, setFree] = useState(!known);

  // A value loaded after the roster arrives — an item assigned to someone no
  // longer on it — has to flip this open, or the name would vanish from the
  // editor while staying in the database.
  useEffect(() => { if (value && !names.includes(value)) setFree(true); }, [value, names]);

  if (free) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0, flex: 1 }}>
        <Input value={value || ""} onChange={onChange} placeholder={label} />
        {names.length > 0 && (
          <button
            type="button"
            onClick={() => { setFree(false); onChange(""); }}
            style={{
              flex: "0 0 auto", background: "none", border: "none", padding: "0 2px",
              cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: T.faint,
            }}
          >
            List
          </button>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value || ""}
      onChange={(v) => {
        if (v === OTHER) { setFree(true); onChange(""); }
        else onChange(v);
      }}
    >
      <option value="">{label}…</option>
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
      <option value={OTHER}>Someone else…</option>
    </Select>
  );
}
