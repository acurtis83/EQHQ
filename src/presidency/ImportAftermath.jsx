import { useState } from "react";
import { Check, X, UserMinus, Link2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import Sheet from "../components/Sheet";
import { T, Btn } from "../components/ui";

/**
 * What the import couldn't decide on its own.
 *
 * "if ministering changes or people move out can i just import a new PDF to
 *  update?"
 *
 * Mostly yes — but the LCR report only lists households that HAVE a
 * companionship, so a family missing from it might have moved away or might
 * simply be waiting to be assigned. Nothing in the file distinguishes those,
 * and guessing either way is wrong in a way that hides something:
 *
 *   - treat them all as moved out, and a family nobody has been given yet
 *     disappears from the list of people who need ministering
 *   - treat them all as still here, and families who left three years ago
 *     sit in the coverage gap for ever, making it read worse than it is
 *
 * So the import asks. Everything on this screen is a question with a name
 * attached, and doing nothing is a valid answer — the households keep their
 * records either way.
 */
export default function ImportAftermath({ dropped = [], renames = [], onClose, onDone }) {
  const [handled, setHandled] = useState({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const mark = (id, how) => setHandled((h) => ({ ...h, [id]: how }));

  const movedOut = async (house) => {
    setBusy(house.id);
    // Inactive, not deleted. The contact log hangs off this row, and a family
    // that moved away is still a family somebody ministered to.
    const { error } = await supabase.from("ministering_households")
      .update({ active: false }).eq("id", house.id);
    setBusy("");
    if (error) setErr(error.message); else mark(house.id, "moved");
  };

  /**
   * Merge a renamed household back into the one it came from.
   *
   * The OLD row survives and takes the new name, because it's the one holding
   * the contact history, the map pin and the notes. The new row is what gets
   * removed — it's minutes old and holds nothing.
   */
  const merge = async ({ before, after }) => {
    setBusy(before.id);
    const moved = await supabase.from("ministering_households")
      .update({ name: after.name, companionship_id: after.companionship_id ?? null, active: true })
      .eq("id", before.id);
    if (moved.error) { setBusy(""); setErr(moved.error.message); return; }

    // Re-point the new row's companionship onto the old row first, so the
    // family doesn't lose its assignment when the duplicate goes.
    const fresh = await supabase.from("ministering_households")
      .select("companionship_id").eq("id", after.id).maybeSingle();
    if (!fresh.error && fresh.data?.companionship_id) {
      await supabase.from("ministering_households")
        .update({ companionship_id: fresh.data.companionship_id }).eq("id", before.id);
    }
    const gone = await supabase.from("ministering_households").delete().eq("id", after.id);
    setBusy("");
    if (gone.error) setErr(gone.error.message); else mark(before.id, "merged");
  };

  const outstanding = dropped.filter((h) => !handled[h.id]);
  const renamePairs = renames.filter((r) => !handled[r.before.id]);

  return (
    <Sheet title="After the import" onClose={onClose}>
      {err && <div style={{ fontSize: 13.5, color: T.red, lineHeight: 1.5 }}>{err}</div>}

      {renamePairs.length > 0 && (
        <>
          <Head>Possibly the same family, renamed</Head>
          <Note>
            LCR relabels a household when its make-up changes. If these are the
            same family, joining them keeps the address, the map pin and every
            contact logged against them.
          </Note>
          {renamePairs.map((pair) => (
            <Row key={pair.before.id} data-rename={pair.before.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: T.sub }}>{pair.before.name}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
                  → {pair.after.name}
                </div>
              </div>
              <Btn size="sm" kind="soft" disabled={busy === pair.before.id}
                onClick={() => merge(pair)}>
                <Link2 size={13} />Same family
              </Btn>
              <Btn size="sm" kind="plain" onClick={() => mark(pair.before.id, "kept")}>
                <X size={13} />
              </Btn>
            </Row>
          ))}
        </>
      )}

      {outstanding.length > 0 && (
        <>
          <Head>No longer on the LCR list · {outstanding.length}</Head>
          <Note>
            These families aren't assigned to anyone in the report. That could
            mean they've moved out, or just that nobody has been given them
            yet — the report doesn't say which, so they're left as needing a
            companionship unless you say otherwise.
          </Note>
          {outstanding.map((h) => (
            <Row key={h.id} data-dropped={h.id}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: T.ink }}>
                {h.name}
              </span>
              <Btn size="sm" kind="plain" disabled={busy === h.id}
                onClick={() => movedOut(h)}>
                <UserMinus size={13} />Moved out
              </Btn>
              <Btn size="sm" kind="plain" onClick={() => mark(h.id, "kept")}>
                <Check size={13} />Needs one
              </Btn>
            </Row>
          ))}
        </>
      )}

      {!outstanding.length && !renamePairs.length && (
        <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
          Nothing left to sort out — every family in the app is on the report.
        </div>
      )}

      <Btn kind="primary" size="lg" style={{ justifyContent: "center" }}
        onClick={() => onDone?.()}>
        Done
      </Btn>
    </Sheet>
  );
}

function Head({ children }) {
  return (
    <div style={{
      fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
      textTransform: "uppercase", color: T.sub, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function Note({ children }) {
  return (
    <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, marginTop: -4 }}>
      {children}
    </div>
  );
}

function Row({ children, ...rest }) {
  return (
    <div {...rest} style={{
      display: "flex", alignItems: "center", gap: 8,
      background: T.inset, border: `1px solid ${T.lineSoft}`,
      borderRadius: 10, padding: "8px 10px",
    }}>
      {children}
    </div>
  );
}
