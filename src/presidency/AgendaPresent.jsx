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
 *   - Exactly one control: a large Done. A button you might hit by accident
 *     while holding a phone is a button that shouldn't be here.
 *
 * The order itself is not decided in this file. The blocks arrive already
 * built by lib/domain/runningOrder.js — the same ones the agenda screen lays
 * itself out from, and the same ones the PDF and Copy render — so the sheet
 * can't quietly disagree with anything else built from the same meeting.
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
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px", borderBottom: `1px solid ${T.lineSoft}`,
        background: T.panel,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 800, letterSpacing: "0.12em",
            textTransform: "uppercase", color: T.faint,
          }}>
            Sunday Quorum Meeting
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{fmtDate(date)}</div>
        </div>
        {/* Deliberately oversized. Missing Done and hitting something else
            while standing up in front of everybody is the one interaction
            that has to be impossible to get wrong. */}
        <button
          onClick={onClose}
          aria-label="Done"
          style={{
            flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 7,
            minHeight: 46, padding: "0 18px", borderRadius: 12,
            border: `1px solid ${T.line}`, background: T.inset,
            fontSize: 16, fontWeight: 700, color: T.ink, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <X size={17} />Done
        </button>
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "18px 18px 64px",
        display: "flex", flexDirection: "column", gap: 26,
        // Room to read on a wide screen without the lines running the full
        // width of a laptop, which is its own way of losing your place.
        width: "100%", maxWidth: 720, margin: "0 auto", boxSizing: "border-box",
      }}>
        {blocks.map((b) => (
          <section key={b.key} data-block={b.key}>
            <Label>{b.label}</Label>
            {b.kind === "person" && <Person block={b} />}
            {b.kind === "lesson" && <Lesson block={b} />}
            {b.kind === "list" && <Sustainings items={b.items} />}
            {b.kind === "notices" && <Notices items={b.items} />}
            {b.kind === "events" && <Events items={b.items} />}
          </section>
        ))}
      </div>
    </div>
  );

  return typeof document === "undefined" ? view : createPortal(view, document.body);
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 800, letterSpacing: "0.14em",
      textTransform: "uppercase", color: T.faint, marginBottom: 7,
    }}>
      {children}
    </div>
  );
}

/**
 * A name, or the fact that there isn't one.
 *
 * Greyed and italic rather than absent. An unassigned prayer is a thing to
 * notice with five minutes to fix it, and a block that vanished when empty
 * would take the reminder with it.
 */
function Person({ block }) {
  return (
    <div style={{
      fontSize: 25, fontWeight: 700, lineHeight: 1.3,
      color: block.assigned ? T.ink : T.faint,
      fontStyle: block.assigned ? "normal" : "italic",
    }}>
      {block.value}
    </div>
  );
}

function Lesson({ block }) {
  if (block.reason) {
    return <div style={{ fontSize: 21, lineHeight: 1.4, color: T.sub }}>{block.reason}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        fontSize: 25, fontWeight: 700, lineHeight: 1.3,
        color: block.assigned ? T.ink : T.faint,
        fontStyle: block.assigned ? "normal" : "italic",
      }}>
        {block.teacher}
      </div>
      {block.talk && (
        <div style={{ fontSize: 20, lineHeight: 1.4, color: T.sub }}>
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

function Sustainings({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((c) => (
        <div key={c.id} style={{ fontSize: 21, lineHeight: 1.4, color: T.ink }}>
          <span style={{ fontWeight: 800 }}>{c.lead}</span>
          <span style={{ color: T.sub }}> — {c.text}</span>
        </div>
      ))}
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
      display: "flex", flexDirection: "column", gap: 18 }}>
      {items.map((a, i) => (
        <li key={a.id} data-notice={a.id}
          style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{
            flex: "0 0 auto", minWidth: 26, fontSize: 17, fontWeight: 800,
            color: T.faint, lineHeight: 1.6, fontVariantNumeric: "tabular-nums",
          }}>
            {i + 1}.
          </span>
          <span style={{
            fontSize: 22, lineHeight: 1.55, color: T.ink,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((e) => (
        <div key={e.id} data-event={e.id}>
          <div style={{ fontSize: 21, fontWeight: 700, color: T.ink, lineHeight: 1.35 }}>
            {e.title}
          </div>
          <div style={{ fontSize: 17, color: T.sub, lineHeight: 1.45, marginTop: 2 }}>
            {[e.when ? fmtShort(e.when) : null, e.where].filter(Boolean).join(" · ")}
          </div>
          {/* That there is one, not where it points. A URL read out loud is
              noise; by the time anybody wants it, it's on the feed and in
              Monday's email. */}
          {e.signUp && (
            <div style={{ fontSize: 16, fontWeight: 700, color: T.primaryDeep, marginTop: 3 }}>
              Sign-up on the app
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
