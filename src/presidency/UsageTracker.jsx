import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, SectionTitle } from "../components/ui";
import { toIso } from "../lib/domain/dates";
import { usageSummary } from "../lib/domain/usage";

/**
 * Is the app earning its place?
 *
 * "can we add a tracker in the settings to view how many people are using the
 *  app or clicking on links weekly?"
 *
 * Two numbers and a short list. Enough to answer whether the app is being
 * used and which announcements land, and deliberately not enough to answer
 * anything about a particular brother — eighty people is a small enough
 * population that the difference matters.
 *
 * What's recorded is written on the screen, under the numbers. If somebody
 * asks what the app tracks, the answer should be somewhere they can read it
 * rather than in whoever happens to remember.
 */

const WORDS = {
  signup: "Sign-up links",
  rsvp: "I’m In",
  talk: "Read the talk",
  summary: "Quick Summary",
  schedule: "Upcoming Lessons",
  groupme: "GroupMe invite",
  link: "Other links on posts",
  other: "Everything else",
};

export default function UsageTracker() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("usage_weekly").select("*");
    // A database that hasn't run supabase/usage.sql says so rather than
    // showing zeroes, which would read as "nobody is using the app".
    if (error) setMissing(true);
    else setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Opening the tracker is when the pruning happens. "Roll up weekly, bin the
  // detail after 90 days" needs no scheduler if the one person who looks at
  // this does the forgetting by looking — and a tracker nobody opens is one
  // that hasn't been accumulating either.
  useEffect(() => {
    supabase.rpc("prune_usage_events").then(() => {}, () => {});
  }, []);

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading…</div>;
  }

  const s = usageSummary(rows, toIso(new Date()));

  return (
    <div>
      <SectionTitle sub="Whether the app is being used, and what people tap.">
        Usage
      </SectionTitle>

      {missing ? (
        <div style={{ ...card, background: T.goldSoft, borderColor: T.gold, fontSize: 14.5, lineHeight: 1.55 }}>
          Nothing is being recorded yet — run <strong>supabase/usage.sql</strong> and
          this fills in from the following week.
        </div>
      ) : (
        <>
          <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Figure n={s.people} was={s.peopleWas} label="People this week" />
            <Figure n={s.opens} was={s.opensWas} label="Times opened" />
            <Figure n={s.tapsTotal} was={s.tapsWas} label="Links tapped" />
          </div>

          <div style={{ ...card, marginTop: 12 }}>
            <div style={{
              fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
              textTransform: "uppercase", color: T.sub, marginBottom: 10,
            }}>
              Most tapped this week
            </div>
            {!s.taps.length ? (
              <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>
                {s.empty
                  ? "Nothing recorded yet. The first numbers appear once members open the app."
                  : "No links tapped yet this week."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.taps.map((t) => (
                  <div key={t.label} data-tap={t.label}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, color: T.ink, flex: 1, minWidth: 0 }}>
                      {WORDS[t.label] || t.label}
                    </span>
                    {/* A bar as well as a number: "11 and 6" is a comparison
                        you have to do, a bar is one you've already made. */}
                    <span style={{
                      flex: "0 0 90px", height: 6, borderRadius: 4, background: T.inset,
                      overflow: "hidden",
                    }}>
                      <span style={{
                        display: "block", height: "100%", borderRadius: 4,
                        background: T.primary,
                        width: `${Math.round((t.count / s.taps[0].count) * 100)}%`,
                      }} />
                    </span>
                    <span style={{
                      flex: "0 0 auto", fontSize: 15, fontWeight: 700, color: T.ink,
                      minWidth: 24, textAlign: "right", fontVariantNumeric: "tabular-nums",
                    }}>
                      {t.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Said on the screen, not just in the code. The presidency will be
          asked what this records, and "I'd have to check" is a worse answer
          than a paragraph anyone can point at. */}
      <div style={{ ...card, marginTop: 12, background: T.inset }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Activity size={15} style={{ color: T.sub, flex: "0 0 auto", marginTop: 3 }} />
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>
            <strong style={{ color: T.ink }}>What this records.</strong> That the
            app was opened, and which <em>kind</em> of link was tapped — a
            sign-up, a talk, the GroupMe. Each browser makes up a random id for
            itself so the count is people rather than taps; it changes every
            year and is attached to no name.
            <br /><br />
            <strong style={{ color: T.ink }}>What it doesn’t.</strong> No names,
            no member records, nothing anybody typed, no IP addresses, and not
            which post or which brother an action was about. Members can’t read
            any of it, and the detail is deleted after 90 days — only the
            weekly totals above are kept.
            <br /><br />
            “People” counts browsers, so a brother with a phone and a laptop is
            two, and a shared family tablet is one. Treat it as roughly right,
            not exact.
          </div>
        </div>
      </div>
    </div>
  );
}

function Figure({ n, was, label }) {
  // Only when there's something to compare against. "↑ 34" in the first week
  // would be measuring the app's existence rather than its use.
  const delta = was > 0 ? n - was : 0;
  return (
    <div style={{ flex: "1 1 120px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: T.ink, lineHeight: 1.1 }}>{n}</span>
        {delta !== 0 && (
          <span data-delta style={{
            fontSize: 14, fontWeight: 700,
            color: delta > 0 ? T.green : T.sub,
          }}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>{label}</div>
    </div>
  );
}
