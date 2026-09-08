import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Chip, Empty, SectionTitle } from "../components/ui";
import { qKey } from "../lib/domain/dates";
import { quarterOf } from "../lib/domain/ministering";
import {
  quarterMonths, previousQuarter, heldMonth, interviewFor, companionsOf,
  companionshipDone, notReporting, unassignedBrothers, householdsByBand,
  brothersByBand, quarterSummary,
} from "../lib/domain/interviews";

/**
 * Quarterly ministering interviews.
 *
 * Laid out like the LCR page the presidency already reads: a row per
 * companionship, a tick per brother per month, and the quarter marked complete
 * beside them. Everything about WHEN a quarter counts as done lives in
 * domain/interviews.js — this screen renders it and writes the ticks.
 */

export default function Interviews({
  comps = [], households = [], interviews = [], members = [], membersById = {},
  districts = [], me, onChanged, setErr,
}) {
  const thisQuarter = quarterOf(new Date().toISOString().slice(0, 10))
    || qKey(new Date().getFullYear(), 1);
  const [quarter, setQuarter] = useState(thisQuarter);
  const [busy, setBusy] = useState("");

  const months = useMemo(() => quarterMonths(quarter), [quarter]);
  const summary = useMemo(
    () => quarterSummary({ comps, interviews, quarter }), [comps, interviews, quarter]
  );
  const behind = useMemo(
    () => notReporting({ comps, interviews, quarter, membersById }),
    [comps, interviews, quarter, membersById]
  );
  const unassigned = useMemo(
    () => unassignedBrothers({ comps, members }), [comps, members]
  );

  /**
   * Tick or untick one brother's month.
   *
   * The date stored is the first of that month. LCR records interviews to the
   * month and so does this screen, and inventing a day — today's, say — would
   * put a July interview on a September date the moment somebody caught up on
   * their records.
   */
  const toggle = async (memberId, monthKey) => {
    if (busy) return;
    setBusy(`${memberId}:${monthKey}`);
    const existing = interviewFor(interviews, memberId, quarter);
    const wanted = `${monthKey}-01`;

    let error = null;
    if (existing && heldMonth(existing) === monthKey) {
      ({ error } = await supabase.from("ministering_interviews")
        .delete().eq("id", existing.id));
    } else if (existing) {
      ({ error } = await supabase.from("ministering_interviews")
        .update({ held_on: wanted, quarter }).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("ministering_interviews").insert({
        member_id: memberId, quarter, held_on: wanted, held_by: me || null,
      }));
    }
    setBusy("");
    if (error) setErr?.(error.message); else onChanged?.();
  };

  const byDistrict = useMemo(() => {
    const groups = districts.map((d) => ({
      d, rows: comps.filter((c) => c.district_id === d.id),
    }));
    const loose = comps.filter((c) => !districts.some((d) => d.id === c.district_id));
    if (loose.length) groups.push({ d: { id: "none", name: "No district" }, rows: loose });
    return groups.filter((g) => g.rows.length);
  }, [comps, districts]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <SectionTitle sub={`${summary.done} of ${summary.total} companionships reported`}>
            {quarter.replace("-Q", " · Quarter ")}
          </SectionTitle>
        </div>
        <Btn size="sm" kind="ghost" aria-label="Previous quarter"
          onClick={() => setQuarter(previousQuarter(quarter))}>
          <ChevronLeft size={15} />
        </Btn>
        <Btn size="sm" kind="ghost" aria-label="This quarter"
          disabled={quarter === thisQuarter} onClick={() => setQuarter(thisQuarter)}>
          <ChevronRight size={15} />
        </Btn>
      </div>

      {!comps.length ? (
        <Empty title="No companionships yet"
          hint="Import the assignments from LCR and they'll show up here." />
      ) : (
        byDistrict.map(({ d, rows }) => (
          <div key={d.id} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
              textTransform: "uppercase", color: T.sub, marginBottom: 7,
            }}>
              {d.name}
            </div>

            <div style={{ ...card, padding: "2px 12px 8px" }}>
              {rows.map((comp) => {
                const done = companionshipDone(comp, interviews, quarter);
                const homes = households.filter((h) => h.companionship_id === comp.id);
                return (
                  <div key={comp.id} data-companionship={comp.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 0", borderTop: `1px solid ${T.lineSoft}`,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {companionsOf(comp).map((id) => {
                        const row = interviewFor(interviews, id, quarter);
                        const held = heldMonth(row);
                        return (
                          <div key={id} data-brother={id}
                            style={{
                              display: "flex", alignItems: "center", gap: 8,
                              marginBottom: 3,
                            }}>
                            <span style={{
                              flex: 1, minWidth: 0, fontSize: 14.5, color: T.ink,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {membersById[id]?.name || "Unknown"}
                            </span>
                            {months.map((m) => {
                              const on = held === m.key || (!!row && !held && m === months[0]);
                              return (
                                <button
                                  key={m.key}
                                  aria-label={`${membersById[id]?.name || id} ${m.label}`}
                                  aria-pressed={on}
                                  onClick={() => toggle(id, m.key)}
                                  style={{
                                    width: 30, height: 26, borderRadius: 8, cursor: "pointer",
                                    border: `1px solid ${on ? T.primary : T.line}`,
                                    background: on ? T.primary : "transparent",
                                    color: on ? "var(--on-primary)" : T.faint,
                                    fontSize: 11.5, fontWeight: 700,
                                  }}
                                >
                                  {on ? <Check size={13} /> : m.label}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                      {!companionsOf(comp).length && (
                        <div style={{ fontSize: 13.5, color: T.faint }}>
                          Nobody assigned to this companionship
                        </div>
                      )}
                    </div>

                    <div style={{ flex: "0 0 auto", width: 96, paddingTop: 2 }}>
                      {done
                        ? <Chip color="#2f9e5e" bg={T.inset}>Done</Chip>
                        : <Chip color={T.faint} bg={T.inset}>Owed</Chip>}
                      <div style={{ fontSize: 12, color: T.faint, marginTop: 4, lineHeight: 1.4 }}>
                        {homes.length} household{homes.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Who to chase, and who was never asked. Two lists, because they need
          different things from you: one is a reminder, the other is a calling. */}
      {behind.length > 0 && (
        <Panel title={`Still to report · ${behind.length}`}>
          {behind.map((b) => (
            <div key={b.id} data-behind={b.id}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <span style={{ flex: 1, fontSize: 14, color: T.ink }}>{b.name}</span>
              {b.wholeCompanionship && (
                <Chip color={T.gold} bg={T.inset}>Nobody in the companionship</Chip>
              )}
            </div>
          ))}
        </Panel>
      )}

      {unassigned.length > 0 && (
        <Panel title={`Not ministering to anyone · ${unassigned.length}`}>
          <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5, marginBottom: 6 }}>
            On the roster but in no companionship.
          </div>
          {unassigned.map((m) => (
            <div key={m.id} style={{ fontSize: 14, color: T.ink, padding: "3px 0" }}>
              {m.name}
            </div>
          ))}
        </Panel>
      )}

      <BandTable
        title="Households, by age of whoever heads them"
        rows={householdsByBand({ households, comps, interviews, quarter, members })}
        cols={[["covered", "Reported"], ["noReport", "No report"], ["unassigned", "Unassigned"]]}
      />
      <BandTable
        title="Ministering brothers, by age"
        rows={brothersByBand({ comps, interviews, quarter, members })}
        cols={[["reported", "Reported"], ["missing", "Still to report"]]}
      />
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ ...card, padding: "12px 13px", marginBottom: 12 }}>
      <div style={{
        fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
        textTransform: "uppercase", color: T.sub, marginBottom: 7,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * A band table.
 *
 * Every band shows, including the empty ones, so the rows don't reshuffle as
 * the quarter fills in — a table that reorders itself is one you have to read
 * again from the top every time you look.
 */
function BandTable({ title, rows, cols }) {
  const any = rows.some((r) => r.total);
  return (
    <div style={{ ...card, padding: "12px 13px", marginBottom: 12 }}>
      <div style={{
        fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
        textTransform: "uppercase", color: T.sub, marginBottom: 8,
      }}>
        {title}
      </div>
      {!any ? (
        <div style={{ fontSize: 13.5, color: T.faint }}>Nothing to count yet.</div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8, fontSize: 11.5, color: T.faint, paddingBottom: 4 }}>
            <span style={{ flex: 1 }} />
            {cols.map(([, label]) => (
              <span key={label} style={{ width: 74, textAlign: "right" }}>{label}</span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.band} data-band={r.band}
              style={{
                display: "flex", gap: 8, alignItems: "center",
                padding: "5px 0", borderTop: `1px solid ${T.lineSoft}`,
                opacity: r.total ? 1 : 0.45,
              }}>
              <span style={{ flex: 1, fontSize: 14, color: T.ink }}>{r.band}</span>
              {cols.map(([key]) => (
                <span key={key} style={{
                  width: 74, textAlign: "right", fontSize: 14,
                  fontWeight: key === cols[0][0] ? 700 : 400,
                  color: key === cols[0][0] ? T.ink : T.sub,
                }}>
                  {r[key]}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

