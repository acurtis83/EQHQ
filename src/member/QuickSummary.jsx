import { X, ArrowUpRight } from "lucide-react";
import { T, card } from "../components/ui";
import { primerFromRow } from "../lib/domain/primer";

/**
 * Sunday's talk in about a minute.
 *
 * "a Cliff Notes style summary or Talk Primer for those who want the
 *  executive summary. Great for those first sitting down in EQ to get up to
 *  speed."
 *
 * Which says exactly who this is for and therefore how it has to read: someone
 * who sat down ninety seconds ago, hasn't read the talk, and would like to
 * follow the discussion. So it is short, it is always the same four parts in
 * the same order, and the link to the real talk sits at the bottom — this is a
 * way in, not a replacement, and a summary that quietly becomes the thing
 * people read instead would be a worse outcome than no summary at all.
 *
 * No data fetching here. The lesson row is already loaded by the card that
 * offers the button, and fetching it again would mean this sheet could show
 * something different from the card that opened it.
 */
export default function QuickSummary({ row, onClose }) {
  const p = primerFromRow(row);
  const title = row?.talk_title || row?.topic || "This Week's Lesson";

  return (
    <div
      data-quick-summary
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      {/* Stops a tap inside the sheet closing it — the backdrop above is the
          dismiss target, and without this every tap on the text dismissed. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...card,
          width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto",
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          padding: "16px 17px calc(20px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow>Quick Summary</Eyebrow>
            <div style={{
              fontSize: 19, fontWeight: 800, color: T.ink, marginTop: 3, lineHeight: 1.3,
            }}>
              {title}
            </div>
            {row?.speaker && (
              <div style={{ fontSize: 14.5, color: T.sub, marginTop: 2 }}>
                Talk by {row.speaker}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flex: "0 0 auto", width: 40, height: 40, borderRadius: 12,
              border: `1px solid ${T.line}`, background: T.inset,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: T.sub, cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          {p.idea && (
            <section data-primer="idea">
              <Eyebrow>The Big Idea</Eyebrow>
              {/* The one line somebody would keep if they kept nothing else,
                  so it's set larger than everything under it. pre-line keeps
                  any paragraph break the writer put in; without it two
                  paragraphs render as one slab, which is the thing a summary
                  is meant to save you from. */}
              <div style={{
                fontSize: 17.5, lineHeight: 1.5, color: T.ink, marginTop: 5,
                whiteSpace: "pre-line",
              }}>
                {p.idea}
              </div>
            </section>
          )}

          {p.takeaways.length > 0 && (
            <section data-primer="takeaways">
              <Eyebrow>Takeaways</Eyebrow>
              <ul style={{
                margin: "6px 0 0", padding: 0, listStyle: "none",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {p.takeaways.map((t, i) => (
                  <li key={i} data-takeaway
                    style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{
                      flex: "0 0 auto", color: T.primaryDeep, fontWeight: 800,
                      fontSize: 15, lineHeight: 1.55,
                    }}>
                      •
                    </span>
                    <span style={{ fontSize: 15.5, lineHeight: 1.55, color: T.ink, minWidth: 0 }}>
                      {t}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.scripture && (
            <section data-primer="scripture">
              <Eyebrow>Scripture</Eyebrow>
              <div style={{
                fontSize: 16, lineHeight: 1.5, color: T.ink, marginTop: 5,
                borderLeft: `2px solid ${T.line}`, paddingLeft: 11,
              }}>
                {p.scripture}
              </div>
            </section>
          )}

          {p.question && (
            <section data-primer="question">
              <Eyebrow>Worth Thinking About</Eyebrow>
              <div style={{
                fontSize: 16.5, lineHeight: 1.5, color: T.ink, marginTop: 5,
                fontStyle: "italic",
              }}>
                {p.question}
              </div>
            </section>
          )}
        </div>

        {/* Last, and said plainly. A summary that becomes the thing people
            read instead of the talk is a worse outcome than no summary, so
            the way to the real thing is the last word on the sheet. */}
        {row?.talk_link && (
          <a
            href={row.talk_link}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              marginTop: 18, minHeight: 48, borderRadius: 12,
              background: T.primary, color: "var(--on-primary)",
              border: `1px solid ${T.primary}`,
              fontSize: 15.5, fontWeight: 700, textDecoration: "none",
            }}
          >
            Read the whole talk
            <ArrowUpRight size={16} />
          </a>
        )}

        <div style={{
          fontSize: 13, color: T.faint, marginTop: 10, lineHeight: 1.5, textAlign: "center",
        }}>
          A summary to get you started — not a substitute for the talk.
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }) {
  return (
    <div style={{
      fontSize: 11.5, fontWeight: 800, letterSpacing: "0.13em",
      textTransform: "uppercase", color: T.faint,
    }}>
      {children}
    </div>
  );
}
