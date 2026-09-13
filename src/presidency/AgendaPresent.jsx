import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink } from "lucide-react";
import { T } from "../components/ui";
import { fmtDate, fmtShort } from "../lib/domain/dates";

/**
 * The agenda as something to read from at the podium.
 *
 * "I need to see the full text box so i can read the announcement. So even if
 *  there was a presentation mode that formatted the agenda for use in a
 *  meeting that would work."
 *
 * Everything here follows from where it gets used: a phone, held at arm's
 * length, in front of the quorum, while talking. That rules out most of what
 * the editing screen does.
 *
 *   - Nothing is editable and nothing is clipped. The announcements are the
 *     whole point — they were the one thing on the screen that couldn't be
 *     read, because they lived in a single-line input.
 *   - Type is large and the line spacing is loose. Losing your place is the
 *     failure this screen exists to prevent, and it costs a lot more than
 *     scrolling does.
 *   - One column, scrolled, in the order the meeting runs — not paged. You
 *     can see what's next, which is what stops the pauses.
 *   - One control, at the bottom. See BOTTOM BAR below.
 *
 * The layout follows the printed sacrament meeting agenda: a gold rule of
 * small caps to open each part, people as label-and-name rows so the eye can
 * run down the right-hand side for the name, and business set in a bordered
 * card with the words to say above and below the names. It reads as a script
 * because that is what it is being used as.
 *
 * The order itself is not decided in this file. The blocks arrive already
 * built by lib/domain/runningOrder.js — the same ones the agenda screen lays
 * itself out from, and the same ones the PDF and Copy render.
 */
export default function AgendaPresent({ date, blocks = [], onClose }) {
  // Escape leaves. Somebody who opened this by accident shouldn't have to hunt
  // for a target on a screen deliberately stripped of them.
  useEffect(() => {
    const bail = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", bail);
    return () => window.removeEventListener("keydown", bail);
  }, [onClose]);

  const view = (
    <div
      data-present
      style={{
        position: "fixed", inset: 0, zIndex: 4000, background: T.bg,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* The safe areas live in a stylesheet rather than inline, because
          env() inside calc() is not something React's style object survives
          intact everywhere it gets parsed — and getting this wrong is
          invisible until it's a dead tap on somebody's phone. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .eq-present-top { padding: calc(14px + env(safe-area-inset-top, 0px)) 18px 12px; }
        .eq-present-bar { padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); }
      ` }} />

      {/* The top is the notch, the status bar and Safari's own chrome, so
          nothing that has to be touched goes up here — only the heading, and
          it is padded clear of all of it. */}
      <div className="eq-present-top" style={{
        flex: "0 0 auto",
        borderBottom: `1px solid ${T.lineSoft}`, background: T.panel,
      }}>
        <Eyebrow>Sunday Quorum Meeting</Eyebrow>
        <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, marginTop: 2 }}>
          {fmtDate(date)}
        </div>
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "16px 14px 24px",
        display: "flex", flexDirection: "column", gap: 12,
        // Room to read on a wide screen without the lines running the full
        // width of a laptop, which is its own way of losing your place.
        width: "100%", maxWidth: 720, margin: "0 auto", boxSizing: "border-box",
      }}>
        {blocks.map((b) => (
          <Hub key={b.key} block={b}>
            {b.kind === "people" && <People rows={b.rows} />}
            {b.kind === "lesson" && <Lesson block={b} />}
            {b.kind === "business" && <Business block={b} />}
            {b.kind === "notices" && <Notices items={b.items} />}
            {b.kind === "events" && <Events items={b.items} />}
          </Hub>
        ))}
      </div>

      {/* BOTTOM BAR.
          "the close button at the top is hard to use on my iphone"

          It was a button in the top-right corner, which on a phone held in one
          hand while you're standing up in front of people is the furthest
          point from your thumb — and on an iPhone it sits under the notch and
          Safari's toolbar besides. Full width along the bottom instead, inside
          the home indicator's safe area, where the thumb already is. */}
      <div className="eq-present-bar" style={{
        flex: "0 0 auto", background: T.panel,
        borderTop: `1px solid ${T.lineSoft}`,
      }}>
        <button
          onClick={onClose}
          aria-label="Done"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", minHeight: 52, borderRadius: 14,
            border: `1px solid ${T.line}`, background: T.inset,
            fontSize: 17, fontWeight: 700, color: T.ink, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <X size={18} />Done
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined" ? view : createPortal(view, document.body);
}

/** The small gold capitals that open each part of the meeting. */
function Eyebrow({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 800, letterSpacing: "0.14em",
      textTransform: "uppercase", color: T.gold,
    }}>
      {children}
    </div>
  );
}

/**
 * One part of the meeting, outlined.
 *
 * "lets give the Sunday Quorum Meeting Agenda presentation a little more
 *  segmentation. similar to the hubs on the Agenda...categories can have a
 *  hub outline"
 *
 * A run of headings down a scrolling page gives you nothing to aim at: the
 * eye has to read to work out where one part stops. A border does that
 * without being read, which is the whole job while you're looking up at the
 * room between items — and it makes the sheet match the agenda screen the
 * presidency already knows, hub for hub.
 *
 * The count comes off the block's own items rather than being passed in, so a
 * heading can't say two while three are printed underneath it.
 */
function Hub({ block, children }) {
  const count = block.items?.length || 0;
  return (
    <section
      data-block={block.key}
      style={{
        border: `1px solid ${T.lineSoft}`, borderRadius: 14,
        background: T.panel, padding: "13px 14px 15px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <Eyebrow>{block.label}</Eyebrow>
        {count > 1 && (
          // Only when there's more than one. "Lesson 1" and "Closing Prayer 1"
          // are noise; "Announcements 4" is how many are left to read.
          <span data-count style={{
            fontSize: 12, fontWeight: 800, color: T.sub, background: T.inset,
            borderRadius: 20, padding: "1px 8px", lineHeight: 1.6,
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Label on the left, name on the right, as the printed agenda sets them. The
 * names line up in a column, so finding who's praying is a glance down one
 * edge rather than a read.
 *
 * A single row drops its label — the hub above it already says "Closing
 * Prayer", and printing that twice reads as a mistake.
 *
 * Nobody assigned is not the same as nothing to show: an unassigned prayer is
 * a gap worth spotting at 8:55, so the row stays and says so.
 */
function People({ rows = [] }) {
  const solo = rows.length === 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {rows.map((r) => (
        <div key={r.key} data-person={r.key}
          style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          {!solo && (
            <span style={{ flex: "0 0 42%", fontSize: 16, color: T.sub, minWidth: 0 }}>
              {r.label}
            </span>
          )}
          <span style={{
            flex: 1, minWidth: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.3,
            color: r.assigned ? T.ink : T.faint,
            fontStyle: r.assigned ? "normal" : "italic",
          }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** What to say, set apart from what to read out. */
function Say({ children }) {
  return (
    <div style={{
      fontSize: 16.5, lineHeight: 1.5, color: T.sub, fontStyle: "italic",
    }}>
      {children}
    </div>
  );
}

/** A name behind a rule, the way the printed agenda indents them. */
function Named({ children, ...rest }) {
  return (
    <div {...rest} style={{
      borderLeft: `2px solid ${T.line}`, paddingLeft: 12,
      fontSize: 19, lineHeight: 1.45, color: T.ink,
    }}>
      {children}
    </div>
  );
}

/**
 * A piece of business: the sentence, the names, the vote.
 *
 * No border of its own any more — the hub around it is the border. Nesting a
 * card inside a card made the business look like a sub-part of itself.
 */
function Business({ block }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <Say>{block.intro}</Say>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {block.items.map((it) => (
          <Named key={it.id} data-business={it.id}>{it.text}</Named>
        ))}
      </div>
      <Say>{block.vote}</Say>
    </div>
  );
}

function Lesson({ block }) {
  if (block.reason) return <Say>{block.reason}</Say>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        fontSize: 23, fontWeight: 700, lineHeight: 1.3,
        color: block.assigned ? T.ink : T.faint,
        fontStyle: block.assigned ? "normal" : "italic",
      }}>
        {block.teacher}
      </div>
      {block.talk && (
        <div style={{ fontSize: 19, lineHeight: 1.4, color: T.sub }}>
          {`“${block.talk}”`}
          {/* The talk's author, not the teacher. Two different people, and
              running the names together is what made this confusing on the
              feed card before they were split. */}
          {block.speaker && <span style={{ color: T.faint }}> — {block.speaker}</span>}
        </div>
      )}
      {block.link && (
        <a href={block.link} target="_blank" rel="noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 17, fontWeight: 700, color: T.primaryDeep, textDecoration: "none",
          }}>
          <ExternalLink size={15} />Read the talk
        </a>
      )}
    </div>
  );
}

/**
 * The announcements, whole.
 *
 * Numbered, because "that's four of five" is how somebody keeps their place
 * while looking up at the room between them. No truncation anywhere: the
 * clipped single-line box is the thing this screen was built to replace.
 */
function Notices({ items }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none",
      display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((a, i) => (
        <li key={a.id} data-notice={a.id}
          style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          <span style={{
            flex: "0 0 auto", minWidth: 24, fontSize: 16, fontWeight: 800,
            color: T.gold, lineHeight: 1.65, fontVariantNumeric: "tabular-nums",
          }}>
            {i + 1}.
          </span>
          <span style={{
            fontSize: 21, lineHeight: 1.55, color: T.ink,
            // Newlines the presidency typed are newlines here too, and a long
            // URL breaks rather than pushing the column sideways.
            whiteSpace: "pre-wrap", overflowWrap: "anywhere", minWidth: 0,
          }}>
            {a.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Events({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((e) => (
        <Named key={e.id} data-event={e.id}>
          <div style={{ fontWeight: 700, lineHeight: 1.35 }}>{e.title}</div>
          <div style={{ fontSize: 16.5, color: T.sub, lineHeight: 1.45, marginTop: 1 }}>
            {[e.when ? fmtShort(e.when) : null, e.where].filter(Boolean).join(" · ")}
          </div>
          {/* That there is one, not where it points. A URL read out loud is
              noise; by the time anybody wants it, it's on the feed and in
              Monday's email. */}
          {e.signUp && (
            <div style={{ fontSize: 16, fontWeight: 700, color: T.primaryDeep, marginTop: 2 }}>
              Sign-up on the app
            </div>
          )}
        </Named>
      ))}
    </div>
  );
}
