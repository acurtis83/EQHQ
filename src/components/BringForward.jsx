import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Btn } from "../components/ui";
import { fmtShort } from "../lib/domain/dates";
import { notYetCarried } from "../lib/domain/announcements";

/**
 * "the announcements from sunday 9/6 did not carry over"
 *
 * The automatic roll-forward runs once per agenda, and it can run at the
 * wrong moment: open next Sunday's agenda before the secretary has typed up
 * last Sunday's notices and it finds nothing, marks itself done, and never
 * looks again. That's fixed at the source — it no longer marks itself done
 * with nothing to carry — but an agenda already flagged stays flagged, and
 * there was no way to ask again.
 *
 * So: offered, not automatic. By the time anybody presses this the week has
 * moved on and some of those notices are genuinely finished, which is a
 * judgement the person reading them can make and this can't.
 *
 * Shared by the Sunday agenda and the Secretary hub because both edit the
 * same rows, and a second copy of "what's missing from this week" would be a
 * second answer to it.
 */
export default function BringForward({ agendaId, forDate, current, onAdded, setErr }) {
  const [available, setAvailable] = useState([]);
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);

  const look = useCallback(async () => {
    if (!forDate) { setAvailable([]); return; }

    const prev = await supabase
      .from("agendas").select("id,meeting_date")
      .eq("kind", "sunday").lt("meeting_date", forDate)
      .order("meeting_date", { ascending: false }).limit(1).maybeSingle();
    if (!prev.data) { setAvailable([]); return; }

    const old = await supabase.from("agenda_items").select("*")
      .eq("agenda_id", prev.data.id).eq("section", "announcements").order("sort_order");

    setFrom(prev.data.meeting_date);
    setAvailable(notYetCarried(old.data || [], current || [], forDate));
  }, [forDate, current]);

  useEffect(() => { look(); }, [look]);

  const bring = async () => {
    if (!agendaId || !available.length) return;
    setBusy(true);
    const base = (current || []).length;
    const { error } = await supabase.from("agenda_items").insert(
      available.map((r, n) => ({
        agenda_id: agendaId,
        section: "announcements",
        text: r.text,
        // Provenance and expiry travel with it, so next week's rules see the
        // same row this week's did. Dropping these would turn a dated notice
        // into one that repeats for ever.
        source_item_id: r.source_item_id || null,
        expires_on: r.expires_on || null,
        carry_over: r.carry_over !== false,
        sort_order: base + n,
      }))
    );
    setBusy(false);
    if (error) { setErr?.(error.message); return; }
    onAdded?.();
  };

  // Nothing outstanding is the normal state, and it says so by not being
  // there. A permanent button reading "0 to bring forward" would be one more
  // thing to read past every week.
  if (!available.length) return null;

  return (
    <div style={{
      marginTop: 9, padding: "9px 10px", borderRadius: 10,
      background: T.inset, border: `1px solid ${T.lineSoft}`,
    }}>
      <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.5, marginBottom: 7 }}>
        {available.length} announcement{available.length === 1 ? "" : "s"} from{" "}
        {from ? fmtShort(from) : "last Sunday"} {available.length === 1 ? "isn't" : "aren't"} on
        this agenda.
      </div>

      {/* Listed, not just counted. "3 announcements" tells you nothing about
          whether you want them, and this is the moment to notice that one of
          them is about a Saturday that has already been and gone. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {available.map((r) => (
          <div key={r.id} data-bring-forward={r.id}
            style={{ fontSize: 13, color: T.ink, lineHeight: 1.45 }}>
            · {r.text}
          </div>
        ))}
      </div>

      <Btn size="sm" kind="soft" disabled={busy} onClick={bring}>
        <ArrowDownToLine size={14} />
        Bring {available.length === 1 ? "it" : "them"} forward
      </Btn>
    </div>
  );
}
