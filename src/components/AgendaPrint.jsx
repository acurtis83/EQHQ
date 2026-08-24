import {
  choosePrintPlan, groupByCategory, groupEvents, printAccent, PRINTABLE_H,
} from "../lib/domain/printPlan";
import { fmtDate, fmtShort } from "../lib/domain/dates";

const RULE = "1px solid #d7d9de";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** One labelled fact in the details block. */
function Detail({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontFamily: SANS, fontSize: 8, fontWeight: 700, letterSpacing: "0.13em",
        textTransform: "uppercase", color: "#9ca3af", marginBottom: 1,
      }}>
        {label}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: "#111", fontWeight: 600 }}>
        {value || "—"}
      </div>
    </div>
  );
}

/**
 * A category heading.
 *
 * A colour mark, the label, then a hairline running to the count. The mark is
 * what tells the eye a new subject has started without spending a whole ruled
 * band on it — and it still reads as a distinct tone when the page comes out
 * of a black-and-white printer.
 */
function Head({ children, right, accent = "#111" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      marginBottom: 5,
    }}>
      <span style={{
        flex: "0 0 auto", width: 7, height: 7, borderRadius: 1,
        background: accent,
      }} />
      <span style={{
        flex: "0 0 auto",
        fontFamily: SANS, fontSize: 9, fontWeight: 800,
        letterSpacing: "0.14em", textTransform: "uppercase", color: "#111",
      }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: "#c9ccd2", minWidth: 8 }} />
      {right != null && (
        <span style={{ flex: "0 0 auto", fontFamily: SANS, fontSize: 8.5, color: "#9ca3af" }}>
          {right}
        </span>
      )}
    </div>
  );
}

/**
 * The printed agenda.
 *
 * One page, always. The density is chosen by measuring rather than guessed at
 * — see lib/domain/printPlan.js — so a short agenda breathes and a long one
 * tightens instead of spilling onto a second sheet nobody reads.
 *
 * Laid out as a working document: the meeting's details across the top, then
 * business grouped by subject, then what's coming up, then space to write.
 *
 * Everything it needs arrives as props — including the category list, which
 * the screen already has. That keeps it a pure function of its inputs, so it
 * can be rendered on its own to look at without dragging a database client
 * along for the ride.
 */
export default function AgendaPrint({
  agenda = {}, sections: SECTIONS = [], bySection = {}, events = [], categories = [],
}) {
  const withItems = SECTIONS
    .map((s) => ({ ...s, items: bySection[s.key] || [] }))
    .filter((s) => s.items.length);

  // Grouped by subject, not by which list an item was typed into — that's how
  // the meeting actually runs.
  const groups = groupByCategory(withItems, categories);
  const eventGroups = groupEvents(events);
  const plan = choosePrintPlan({ sections: groups, events });

  return (
    <div className="eq-print-only">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .eq-print-only, .eq-print-only * { visibility: visible !important; }
          .eq-print-only {
            position: absolute !important; left: 0; top: 0; width: 100%;
            padding: 0 !important; background: #fff !important; color: #111 !important;
          }
          /* Letter is shorter than A4, so sizing to Letter fits both. */
          @page { size: letter; margin: 0.5in 0.6in; }
        }
        .eq-print-only { display: none; }
        @media print { .eq-print-only { display: block; } }
      `}</style>

      <div style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: "#111",
        fontSize: plan.body,
        lineHeight: 1.35,
        // A full-height column so the page always looks composed: whatever
        // space the agenda doesn't use becomes writing space, and the footer
        // sits on the bottom rule rather than halfway up a blank sheet.
        display: "flex",
        flexDirection: "column",
        minHeight: PRINTABLE_H,
      }}>
        {/* ---- masthead ---- */}
        <div style={{ borderBottom: "2px solid #111", paddingBottom: 5 }}>
          <div style={{
            fontFamily: SANS, fontSize: 8.5, letterSpacing: "0.18em",
            color: "#6b7280", fontWeight: 700, textTransform: "uppercase",
          }}>
            Holbrook Farms 8th Ward
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 1 }}>
            Elders Quorum Presidency Meeting
          </div>
        </div>

        {/* ---- the facts of the meeting, in a labelled row ---- */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 12,
          padding: "8px 0 9px",
          borderBottom: RULE,
        }}>
          <Detail label="Date" value={agenda.meeting_date ? fmtDate(agenda.meeting_date) : ""} />
          <Detail label="Time" value={agenda.meeting_time} />
          <Detail label="Location" value={agenda.location} />
          <Detail label="Opening Prayer" value={agenda.opening_prayer} />
          <Detail label="Closing Prayer" value={agenda.closing_prayer} />
        </div>

        {/* ---- business, by subject ---- */}
        {groups.map((g) => (
          <div key={g.label} style={{ marginTop: plan.sectionGap, breakInside: "avoid" }}>
            <Head right={g.items.length} accent={printAccent(categories, g.label)}>{g.label}</Head>
            {g.items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  marginBottom: plan.rowGap, breakInside: "avoid",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{it.text}</div>
                  {plan.showNotes && it.notes && (
                    <div style={{ fontSize: plan.note, color: "#4b5563", marginTop: 1 }}>
                      {it.notes}
                    </div>
                  )}
                  {plan.showLinks && (it.link_url || it.attachment_url) && (
                    // The name, not the whole URL: nobody types a 90-character
                    // link off a sheet of paper, and it wraps horribly.
                    <div style={{ fontFamily: SANS, fontSize: plan.note, color: "#6b7280", marginTop: 1 }}>
                      {it.attachment_url ? (it.attachment_name || "Attachment") : "Link"} — see the app
                    </div>
                  )}
                </div>

                {/* Fixed right column so who and when line up down the page. */}
                <div style={{
                  flex: "0 0 118px", textAlign: "right",
                  fontFamily: SANS, fontSize: plan.note, color: "#374151",
                  lineHeight: 1.3, paddingTop: 1,
                }}>
                  {it.who && <div style={{ fontWeight: 600 }}>{it.who}</div>}
                  {/* The date is data, not decoration — kept dark enough to
                      read at a glance down the column. */}
                  {it.due_date && (
                    <div style={{ color: "#374151", fontWeight: 600 }}>{fmtShort(it.due_date)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* ---- what's coming up ---- */}
        {/* A tinted panel, not another ruled section. What's above is business
            to work through; this is reference. Making them look the same put
            equal weight on both, and the eye had nothing to latch onto. Two
            columns because these are short lines and a single stack of them
            wastes half the width. */}
        {eventGroups.length > 0 && (
          <div style={{
            marginTop: plan.sectionGap + 2,
            border: "1px solid #c9ccd2",
            background: "#f6f7f8",
            borderRadius: 3,
            padding: "8px 10px 9px",
            breakInside: "avoid",
          }}>
            <div style={{
              fontFamily: SANS, fontSize: 9, fontWeight: 800,
              letterSpacing: "0.14em", textTransform: "uppercase", color: "#111",
              borderBottom: "1px solid #c9ccd2", paddingBottom: 4, marginBottom: 6,
            }}>
              Upcoming
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              columnGap: 18, rowGap: 2,
            }}>
              {eventGroups.map((g) => (
                <div key={g.label} style={{ breakInside: "avoid", marginBottom: 4 }}>
                  <div style={{
                    fontFamily: SANS, fontSize: plan.note - 0.5, fontWeight: 800,
                    color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase",
                    marginBottom: 2,
                  }}>
                    {g.label}
                  </div>
                  {g.items.map((e) => (
                    <div key={e.id} style={{ marginBottom: 3 }}>
                      <div style={{ fontWeight: 600, lineHeight: 1.25 }}>{e.title}</div>
                      <div style={{
                        fontFamily: SANS, fontSize: plan.note, color: "#4b5563", lineHeight: 1.3,
                      }}>
                        {[fmtShort(e.when || e.event_date), e.event_time, e.location]
                          .filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- room to write ---- */}
        {/* Takes whatever is left. The rules are a repeating gradient rather
            than counted <div>s, so the block fills the exact remaining height
            without arithmetic that could be off by a line and push to page 2. */}
        {plan.fits && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            marginTop: plan.sectionGap + 4, minHeight: 0,
          }}>
            <div style={{
              fontFamily: SANS, fontSize: 9, fontWeight: 800,
              letterSpacing: "0.14em", textTransform: "uppercase",
              borderBottom: "1px solid #111", paddingBottom: 3, flex: "0 0 auto",
            }}>
              Decisions &amp; Assignments
            </div>
            <div style={{
              flex: 1, minHeight: 44,
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0 21px, #d7d9de 21px 22px)",
            }} />
          </div>
        )}

        <div style={{
          marginTop: "auto", paddingTop: 5, borderTop: RULE, flex: "0 0 auto",
          fontFamily: SANS, fontSize: 8, color: "#9ca3af",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>Elders Quorum Presidency &middot; Holbrook Farms 8th Ward</span>
          <span>{new Date().toLocaleDateString("en-US")}</span>
        </div>
      </div>
    </div>
  );
}
