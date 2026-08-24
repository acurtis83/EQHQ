import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  choosePrintPlan, flattenItems, groupByCategory, groupEvents, printAccent,
  RULE_H, TIERS, PRINTABLE_H, WRITE_MIN_LINES, WRITE_MAX_LINES,
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
 * Let the browser do the measuring.
 *
 * printPlan.js estimates the page's height from counts and character lengths,
 * which is what makes it testable without a browser — but an estimate built
 * from a dozen guessed constants drifts, and it drifted conservative. A page
 * it called full printed with the bottom quarter empty, so the presidency got
 * 9.6pt type on a sheet that had room for 12.
 *
 * So the estimate is now only the opening bid. Once the sheet is in the DOM,
 * this measures what actually got laid out and walks the tier up while there's
 * room, or down while there isn't. Three or four passes and it settles, before
 * the print dialog opens.
 *
 * Where there's no layout engine — jsdom in the tests, or server rendering for
 * the standalone sample — every measurement is 0, and it keeps the estimate.
 * That's deliberate: the estimate must stay good enough to ship on its own.
 */
// useLayoutEffect warns when there's no DOM to lay anything out in. The
// standalone print sample is rendered on the server, where the measuring pass
// is a no-op anyway.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useMeasuredTier(estimate) {
  const startAt = Math.max(0, TIERS.findIndex((t) => t.name === estimate.name));
  const contentRef = useRef(null);
  const footerRef = useRef(null);
  const [index, setIndex] = useState(startAt);
  const [lines, setLines] = useState(estimate.writeLines);
  // Guards against a layout that never settles — two tiers that each measure
  // as wanting the other would otherwise re-render forever.
  const passes = useRef(0);
  const seen = useRef(new Set());

  // The starting point moves when the agenda does, so a new item resets it.
  const key = `${estimate.name}:${estimate.height}:${estimate.grouped}`;
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    passes.current = 0;
    seen.current = new Set();
  }

  useIsoLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const contentH = content.getBoundingClientRect().height;
    if (!contentH) return;             // no layout engine — trust the estimate

    const footerH = footerRef.current?.getBoundingClientRect().height || 18;
    const tier = TIERS[index];
    const headingH = tier.sectionGap + 4 + tier.note * 1.35 + 4 + 2;
    const spare = PRINTABLE_H - contentH - footerH - 12 - headingH;

    const want = Math.max(WRITE_MIN_LINES, Math.min(WRITE_MAX_LINES, Math.floor(spare / RULE_H)));
    if (want !== lines) setLines(want);

    if (passes.current >= 8) return;

    // Too tall: tighten. Room to spare: loosen, but only if the next size up
    // plausibly still fits — the ratio of body sizes is a good enough guide
    // for one step, and the next pass measures it for real anyway.
    let next = index;
    if (spare < WRITE_MIN_LINES * RULE_H && index < TIERS.length - 1) {
      next = index + 1;
    } else if (index > 0) {
      const up = TIERS[index - 1];
      const projected = contentH * (up.body / tier.body);
      if (projected + footerH + 12 + headingH + WRITE_MIN_LINES * RULE_H <= PRINTABLE_H) {
        next = index - 1;
      }
    }

    if (next !== index && !seen.current.has(next)) {
      seen.current.add(index);
      passes.current += 1;
      setIndex(next);
    }
  });

  return { tier: TIERS[index], lines, contentRef, footerRef };
}

/**
 * A category heading, for the grouped layout.
 *
 * A colour mark, the label, then a hairline running to the count. Lighter than
 * a Band — these are subjects within the business, not parts of the meeting —
 * but heavy enough that the eye can find where one subject ends.
 */
function Head({ children, right, accent = "#111", size }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
      <span style={{
        flex: "0 0 auto", width: 7, height: 7, borderRadius: 1, background: accent,
      }} />
      <span style={{
        flex: "0 0 auto", fontFamily: SANS, fontSize: size, fontWeight: 800,
        letterSpacing: "0.13em", textTransform: "uppercase", color: "#111",
      }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: "#c9ccd2", minWidth: 8 }} />
      {right != null && (
        <span style={{ flex: "0 0 auto", fontFamily: SANS, fontSize: size - 1, color: "#9ca3af" }}>
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
function Meta({ it, size, stacked, showCategory = true }) {
  const cat = showCategory ? it.catLabel : "";
  if (!cat && !it.who && !it.due_date) return null;
  return (
    <div style={{
      fontFamily: SANS, fontSize: size,
      ...(stacked
        ? { marginTop: 1, display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }
        : { textAlign: "right", lineHeight: 1.3, paddingTop: 1 }),
    }}>
      {cat && (
        <div style={{
          display: stacked ? "inline" : "block",
          fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          color: it.accent,
        }}>
          {cat}
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
 * One item, as it prints.
 *
 * Shared by both layouts — the only difference is whether the category is
 * repeated on the item, which it isn't when a heading above already says it.
 */
function PrintItem({ it, plan, showCategory }) {
  return (
    <div
      style={{
        marginTop: plan.rowGap + (plan.stackMeta ? 4 : 0),
        // A rule in the category's colour down the left edge, which is what
        // the card on screen does with its border. Cheaper on paper than a
        // boxed card and it survives a black-and-white printer as a
        // distinguishable grey.
        borderLeft: `3px solid ${it.accent}`,
        paddingLeft: 8,
        breakInside: "avoid",
        ...(plan.stackMeta ? {} : { display: "flex", gap: 10, alignItems: "flex-start" }),
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* The name is the heading. It's what somebody is looking for when
            they scan the page, so it goes first and at full size. */}
        <div style={{ fontWeight: 700, lineHeight: 1.25, overflowWrap: "anywhere" }}>
          {it.text}
        </div>

        {plan.stackMeta && <Meta it={it} size={plan.note} stacked showCategory={showCategory} />}

        {plan.showNotes && it.notes && (
          <div style={{
            fontSize: plan.note, color: "#4b5563", marginTop: 2,
            overflowWrap: "anywhere",
          }}>
            {it.notes}
          </div>
        )}
        {plan.showLinks && (it.link_url || it.attachment_url) && (
          // The name, not the whole URL: nobody types a 90-character link off
          // a sheet of paper, and it wraps horribly.
          <div style={{ fontFamily: SANS, fontSize: plan.note, color: "#6b7280", marginTop: 1 }}>
            {it.attachment_url ? (it.attachment_name || "Attachment") : "Link"} — see the app
          </div>
        )}
      </div>

      {/* Only on a page too full to give each item its own meta line. */}
      {!plan.stackMeta && (
        <div style={{ flex: "0 0 118px" }}>
          <Meta it={it} size={plan.note} stacked={false} showCategory={showCategory} />
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
  grouped = false,
}) {
  const withItems = SECTIONS
    .map((s) => ({ ...s, items: bySection[s.key] || [] }))
    .filter((s) => s.items.length);

  // In the order the meeting runs them, each carrying its own category — the
  // same shape as the cards on the agenda screen, so the printed copy and the
  // one on the phone read the same way.
  const items = flattenItems(withItems, categories);
  // Grouped, the page is a heading per subject with its items beneath. The
  // printed copy follows whichever arrangement the presidency is working in,
  // so the sheet on the table matches the screen they planned it on.
  const groups = grouped
    ? groupByCategory(withItems, categories).map((g) => ({
        ...g, items: flattenItems([g], categories),
      }))
    : [];
  const eventGroups = groupEvents(events);
  const estimate = choosePrintPlan({
    sections: grouped ? groups : withItems, events, grouped,
  });
  // The estimate opens; the browser's own layout has the last word.
  const { tier, lines, contentRef, footerRef } = useMeasuredTier(estimate);
  const plan = { ...estimate, ...tier, writeLines: lines };

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

      <div data-eq-sheet data-eq-tier={plan.name} style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: "#111",
        fontSize: plan.body,
        lineHeight: 1.35,
        // Deliberately no min-height. The column used to be pinned to the
        // printable height so the writing area could stretch into whatever was
        // left — but the printed sheet is not reliably that tall. Browsers
        // apply their own margins, add a header and footer, and then scale the
        // whole page down to make it fit, which came out as small type with
        // the bottom of the sheet blank. The page is a definite length now:
        // the leftover space is counted into ruled lines by the plan.
        display: "flex",
        flexDirection: "column",
        // Never wider than the page. Without this a long unbroken string in an
        // item could stretch the flex row and take the right-hand column off
        // the edge of the sheet.
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}>
        <div ref={contentRef} data-eq-content>
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

        {grouped
          ? groups.map((g) => (
              <div key={g.key || g.label} style={{ marginTop: plan.sectionGap, breakInside: "avoid" }}>
                <Head
                  size={plan.note}
                  right={g.items.length}
                  accent={printAccent(categories, g.label)}
                >
                  {g.label}
                </Head>
                {g.items.map((it) => (
                  <PrintItem key={it.id} it={it} plan={plan} showCategory={false} />
                ))}
              </div>
            ))
          : items.map((it) => (
              <PrintItem key={it.id} it={it} plan={plan} showCategory />
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

        </div>

        {/* ---- room to write ---- */}
        {/* As many ruled lines as the leftover space is worth, drawn as real
            borders. The rules were a repeating-linear-gradient before, and
            browsers don't print background images unless the person ticks
            "Background graphics" — so on paper this was a blank void. */}
        {plan.fits && plan.writeLines > 0 && (
          <div style={{ marginTop: plan.sectionGap + 4 }}>
            <Band size={plan.note}>Decisions &amp; Assignments</Band>
            <div>
              {Array.from({ length: plan.writeLines }, (_, i) => (
                <div key={i} style={{ height: RULE_H, borderBottom: "1px solid #d7d9de" }} />
              ))}
            </div>
          </div>
        )}

        <div ref={footerRef} data-eq-footer style={{
          marginTop: 12, paddingTop: 5, borderTop: RULE, flex: "0 0 auto",
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
