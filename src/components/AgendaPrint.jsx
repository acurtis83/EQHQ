import { createPortal } from "react-dom";
import {
  choosePrintPlan, flattenItems, groupEvents, PRINTABLE_H,
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
 * A top-level heading — the parts of the meeting, not the items within them.
 *
 * There are only three of these on the page: the business, what's coming up,
 * and the space to write. Everything else is subordinate to one of them.
 */
function Band({ children, size, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      fontFamily: SANS, fontSize: size, fontWeight: 800,
      letterSpacing: "0.16em", textTransform: "uppercase", color: "#111",
      borderBottom: "2px solid #111", paddingBottom: 4,
    }}>
      <span>{children}</span>
      {right != null && (
        <span style={{
          marginLeft: "auto", fontSize: size - 1, fontWeight: 700,
          letterSpacing: "0.08em", color: "#9ca3af",
        }}>
          {right}
        </span>
      )}
    </div>
  );
}

/**
 * An item's category, owner and date.
 *
 * The category leads and carries the item's colour — it's the subheading to
 * the item's name, the same pairing the cards on the agenda screen use.
 * Stacked beneath the name normally; set in a column beside it only when the
 * page is too full to spend a line per item.
 */
function Meta({ it, size, stacked }) {
  if (!it.catLabel && !it.who && !it.due_date) return null;
  return (
    <div style={{
      fontFamily: SANS, fontSize: size,
      ...(stacked
        ? { marginTop: 1, display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }
        : { textAlign: "right", lineHeight: 1.3, paddingTop: 1 }),
    }}>
      {it.catLabel && (
        <div style={{
          display: stacked ? "inline" : "block",
          fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          color: it.accent,
        }}>
          {it.catLabel}
        </div>
      )}
      {it.who && (
        <div style={{ display: stacked ? "inline" : "block", color: "#374151", fontWeight: 600 }}>
          {it.who}
        </div>
      )}
      {/* The date is data, not decoration — kept dark enough to read at a
          glance down the page. */}
      {it.due_date && (
        <div style={{ display: stacked ? "inline" : "block", color: "#374151", fontWeight: 600 }}>
          {fmtShort(it.due_date)}
        </div>
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

  // In the order the meeting runs them, each carrying its own category — the
  // same shape as the cards on the agenda screen, so the printed copy and the
  // one on the phone read the same way.
  const items = flattenItems(withItems, categories);
  const eventGroups = groupEvents(events);
  const plan = choosePrintPlan({ sections: withItems, events });

  const sheet = (
    <div className="eq-print-root">
      {/* Set as raw CSS rather than as a text child. React escapes text
          inside <style> when it renders on the server, which turns
          "body > *" into "body &gt; *" — an invalid selector the browser
          silently drops, taking the whole print layout with it. */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* The document is mounted straight onto <body>, not left inside the
           app's layout. It used to be absolutely positioned inside the shell,
           which has a max-width — so "width: 100%" resolved against whatever
           happened to be constraining it rather than the page, and the right
           edge printed off the sheet. As a direct child of body in normal
           flow, its width is simply the page's content box. */
        @media print {
          html, body {
            margin: 0 !important; padding: 0 !important;
            width: auto !important; background: #fff !important;
          }
          body > * { display: none !important; }
          body > .eq-print-root { display: block !important; }
          .eq-print-root {
            width: auto !important; max-width: 100% !important;
            box-sizing: border-box; color: #111 !important;
          }
          /* Letter is shorter than A4, so sizing to Letter fits both. */
          @page { size: letter; margin: 0.5in 0.6in; }
        }
        /* Off-screen the rest of the time — it's a print artefact, not part
           of the app's interface. */
        .eq-print-root { display: none; }
` }} />

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
        // Never wider than the page. Without this a long unbroken string in an
        // item could stretch the flex row and take the right-hand column off
        // the edge of the sheet.
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
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

        {/* ---- business ---- */}
        {items.length > 0 && (
          <div style={{ marginTop: plan.sectionGap }}>
            <Band size={plan.note} right={`${items.length} item${items.length === 1 ? "" : "s"}`}>
              Agenda Items
            </Band>
          </div>
        )}

        {items.map((it) => (
          <div
            key={it.id}
            style={{
              marginTop: plan.rowGap + (plan.stackMeta ? 4 : 0),
              // A rule in the category's colour down the left edge, which is
              // what the card on screen does with its border. Cheaper on paper
              // than a boxed card and it survives a black-and-white printer as
              // a distinguishable grey.
              borderLeft: `3px solid ${it.accent}`,
              paddingLeft: 8,
              breakInside: "avoid",
              ...(plan.stackMeta ? {} : { display: "flex", gap: 10, alignItems: "flex-start" }),
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* The name is the heading. It's what somebody is looking for
                  when they scan the page, so it goes first and at full size. */}
              <div style={{ fontWeight: 700, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                {it.text}
              </div>

              {plan.stackMeta && <Meta it={it} size={plan.note} stacked />}

              {plan.showNotes && it.notes && (
                <div style={{
                  fontSize: plan.note, color: "#4b5563", marginTop: 2,
                  overflowWrap: "anywhere",
                }}>
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

            {/* Only on a page too full to give each item its own meta line. */}
            {!plan.stackMeta && (
              <div style={{ flex: "0 0 118px" }}>
                <Meta it={it} size={plan.note} stacked={false} />
              </div>
            )}
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
              fontFamily: SANS, fontSize: plan.note, fontWeight: 800,
              letterSpacing: "0.16em", textTransform: "uppercase", color: "#111",
              borderBottom: "1px solid #9ca3af", paddingBottom: 4, marginBottom: 7,
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
                      <div style={{ fontWeight: 600, lineHeight: 1.25, overflowWrap: "anywhere" }}>{e.title}</div>
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
            <div style={{ flex: "0 0 auto" }}>
              <Band size={plan.note}>Decisions &amp; Assignments</Band>
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

  // Rendered onto <body> so nothing in the app's layout can constrain its
  // width. Falls back to rendering in place when there's no document, which is
  // how the standalone print sample gets generated on the server.
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}
