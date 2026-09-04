import { useCallback, useEffect, useState } from "react";
import { Check, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { newId } from "../lib/newId";
import { T, Btn, Input } from "../components/ui";

// Which RSVPs this browser created, so "I'm in" can be taken back.
//
// The id is the whole mechanism: members have no accounts, so there's nothing
// to check a delete against. Names are readable by everyone through a view
// that deliberately omits the id — so the only person who can withdraw an
// RSVP is whoever made it, because their browser kept the id.
const MINE_KEY = "eq_rsvp_ids";

function mine() {
  try { return JSON.parse(localStorage.getItem(MINE_KEY) || "{}"); }
  catch { return {}; }
}
function remember(postId, rowId) {
  const all = mine();
  all[postId] = rowId;
  try { localStorage.setItem(MINE_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}
function forget(postId) {
  const all = mine();
  delete all[postId];
  try { localStorage.setItem(MINE_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

/**
 * One-tap "I'm in" for an activity, instead of a whole sign-up form.
 */
/**
 * @param {boolean} compact  A row in Upcoming rather than a block on a post:
 *   the button and a headcount on one line, the name prompt underneath when
 *   it's needed, and no list of names. Same component either way — an RSVP
 *   made from the Upcoming list and one made on the post are the same RSVP,
 *   and two implementations would eventually disagree about that.
 */
export default function Rsvp({ postId, name, setName, compact = false }) {
  const [names, setNames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  const myId = mine()[postId];

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("public_rsvps").select("name,created_at")
      .eq("post_id", postId).order("created_at");
    if (error) setErr(error.message);
    else setNames((data || []).map((r) => r.name));
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const join = async () => {
    const who = (name || "").trim();
    if (!who) { setAsking(true); return; }
    setBusy(true); setErr("");
    // Same reason as the form: rsvps has no public read policy, so asking for
    // the row back would have the insert refused. The id is made here instead,
    // which is also what gets kept so this person can take themselves off.
    const id = newId();
    const { error } = await supabase
      .from("rsvps").insert({ id, post_id: postId, name: who });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    remember(postId, id);
    setAsking(false);
    load();
  };

  const leave = async () => {
    if (!myId) return;
    setBusy(true);
    const { error } = await supabase.from("rsvps").delete().eq("id", myId);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    forget(postId);
    load();
  };

  return (
    <div style={compact ? {
      display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end",
    } : {
      marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.lineSoft}`,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {myId ? (
          <Btn kind="soft" size="sm" onClick={leave} disabled={busy}
            aria-label={`Cancel your RSVP`}>
            <Check size={14} />{compact ? "You’re In" : "You’re In — Tap To Cancel"}
          </Btn>
        ) : (
          <Btn kind="primary" size="sm" onClick={join} disabled={busy}>
            I’m In
          </Btn>
        )}
        {!compact && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13.5, color: T.sub }}>
            <Users size={13} />
            {names.length ? `${names.length} coming` : "Nobody yet"}
          </span>
        )}
      </div>

      {asking && !myId && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Input value={name} onChange={setName} placeholder="Your name" />
          <Btn kind="primary" size="sm" onClick={join} disabled={!name.trim() || busy}>Add</Btn>
        </div>
      )}

      {/* On a post, everyone who's coming. In a row, a count — the list
          belongs with the post it's about, and a row of fifteen names is a
          row nobody can read past. */}
      {names.length > 0 && (compact ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, color: T.faint }}>
          <Users size={12} />{names.length} coming
        </span>
      ) : (
        <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.5 }}>
          {names.join(", ")}
        </div>
      ))}

      {err && <div style={{ fontSize: 13, color: T.red }}>{err}</div>}
    </div>
  );
}
