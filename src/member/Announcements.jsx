import { useEffect, useMemo, useState } from "react";
import { Megaphone, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn } from "../components/ui";
import { DOW, MON, isoParts } from "../lib/domain/dates";
import { MAX_SHOWN, sundayAnnouncements } from "../lib/domain/announcements";

/**
 * What was announced at the last quorum meeting.
 *
 * "lets also add a hub similar to Upcoming that lists the Announcements from
 *  the last Sunday. it can pull from the Announcements on the Sunday Quorum
 *  Meeting"
 *
 * Reads sunday_announcements_public, a VIEW — never agenda_items. That table
 * is the presidency's working record and carries `notes`, `who` and due dates
 * alongside the sentence meant to be read out; RLS is row-level, so opening
 * the table would have published all of it. See
 * supabase/announcements-public.sql.
 *
 * The view also decides WHICH Sunday, in SQL: the most recent meeting that has
 * already happened. That belongs there rather than here because it's a rule
 * about what may be shown, not about how to show it — a drafted agenda for
 * next Sunday must not be readable, and a check written in the browser can be
 * skipped by anyone who asks the API directly.
 */

function longDate(iso) {
  if (!iso) return "";
  const d = isoParts(iso);
  return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}

export default function Announcements() {
  const [rows, setRows] = useState([]);
  const [when, setWhen] = useState("");
  const [ready, setReady] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sunday_announcements_public").select("*").order("sort_order");
      if (!error) {
        setRows(data || []);
        setWhen(data?.[0]?.meeting_date || "");
      }
      setReady(true);
    })();
  }, []);

  const list = useMemo(() => sundayAnnouncements(rows), [rows]);
  const shown = all ? list : list.slice(0, MAX_SHOWN);
  const more = list.length - shown.length;

  // Nothing announced — or the migration hasn't been run — shows nothing at
  // all rather than an empty card. Upcoming says "Nothing on the calendar
  // yet" because an empty calendar is worth knowing; an empty announcements
  // card just takes up the space the feed is for. It reappears on its own the
  // next time somebody adds an announcement.
  if (!ready || !list.length) return null;

  // No bottom margin of its own: the feed spaces the hubs with one flex gap.
  // See HUB_GAP in Feed.jsx.
  return (
    <div style={{ ...card, padding: "12px 13px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
        <Megaphone size={15} style={{ color: T.sub, flex: "0 0 auto" }} />
        <span style={{
          fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
          textTransform: "uppercase", color: T.sub, flex: 1,
        }}>
          Announcements
        </span>
        {(more > 0 || all) && (
          <Btn size="sm" kind="plain" onClick={() => setAll((v) => !v)}>
            {all ? "Show less" : `See all ${list.length}`}
          </Btn>
        )}
      </div>

      {/* Which Sunday, said once at the top rather than on every row. Without
          it these read as current notices, and on a Saturday that's six days
          of drift with nothing on screen to explain it. */}
      {when && (
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: -4, paddingBottom: 8 }}>
          From {longDate(when)}
        </div>
      )}

      {shown.map((a, i) => (
        <div
          key={`${a.sort}-${i}`}
          data-announcement-row={i}
          style={{
            display: "flex", alignItems: "flex-start", gap: 11,
            padding: "10px 0", borderTop: `1px solid ${T.lineSoft}`,
          }}
        >
          <span style={{
            flex: "0 0 auto", width: 4, alignSelf: "stretch", minHeight: 20,
            borderRadius: 2, background: T.sub, opacity: 0.35,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Wraps rather than truncating. An announcement is a sentence,
                and half of one is no use — this is the text somebody would
                otherwise have had to be present to hear. */}
            <div style={{ fontSize: 14.5, color: T.ink, lineHeight: 1.45 }}>
              {a.text}
            </div>
            {a.link && (
              <a
                href={a.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5,
                  fontSize: 13.5, fontWeight: 600, color: T.primary, textDecoration: "none",
                }}
              >
                More <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
