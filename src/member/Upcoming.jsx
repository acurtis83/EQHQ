import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { T, card, Btn } from "../components/ui";
import Rsvp from "./Rsvp";
import { categoryMeta } from "./categories";
import { DOW, MON, isoParts } from "../lib/domain/dates";
import { ACTION, actionFor } from "../lib/domain/upcomingAction";

const SHOWN = 3;

/** "Sat, Sep 20" — the same shape the rest of the app uses for a short date. */
function shortDate(iso) {
  if (!iso) return "";
  const d = isoParts(iso);
  return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}

/**
 * One thing coming up, with the thing you'd do about it.
 *
 * The action is worked out in domain/upcomingAction.js rather than here — the
 * weekly email has to make the same call about the same post, and two copies
 * of "is this a sign-up or an RSVP" would eventually disagree.
 *
 * An RSVP works in place. It's the same <Rsvp> the post carries, so an "I'm
 * In" from this list and one from the card below are the same record; there is
 * no second implementation to fall out of step.
 */
function UpcomingRow({ post, name, setName, onOpen }) {
  const meta = categoryMeta(post.category);
  const action = actionFor(post);
  const when = [shortDate(post.event_date), post.event_time].filter(Boolean).join("  •  ");

  return (
    <div
      data-upcoming-row={post.id}
      style={{
        display: "flex", alignItems: "center", gap: 11,
        padding: "10px 0", borderTop: `1px solid ${T.lineSoft}`,
      }}
    >
      {/* A colour block rather than an icon per category: the categories are
          already coloured everywhere else, and a made-up icon for "Assignment"
          would be one more thing to learn. */}
      <span style={{
        flex: "0 0 auto", width: 4, alignSelf: "stretch", minHeight: 34,
        borderRadius: 2, background: meta.accent,
      }} />

      <button
        onClick={() => onOpen?.(post.id)}
        style={{
          flex: 1, minWidth: 0, background: "none", border: "none", padding: 0,
          textAlign: "left", cursor: "pointer",
        }}
      >
        <span style={{
          display: "block", fontSize: 15, fontWeight: 700, color: T.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {post.title}
        </span>
        <span style={{ display: "block", fontSize: 13, color: T.sub, marginTop: 2 }}>
          {when}
          {post.event_location ? `  •  ${post.event_location}` : ""}
        </span>
      </button>

      <div style={{ flex: "0 0 auto" }}>
        {action.kind === ACTION.RSVP && (
          <Rsvp postId={post.id} name={name} setName={setName} compact />
        )}
        {action.kind === ACTION.SIGNUP && (action.href ? (
          // A real anchor rather than a button that opens the URL in script.
          // It's a link to a form: long-press, open in a new tab and "copy
          // link" should all work, and a screen reader should call it a link.
          <a
            href={action.href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: T.primary, color: "var(--on-primary)",
              border: `1px solid ${T.primary}`, borderRadius: 10,
              padding: "6px 10px", fontSize: 14, fontWeight: 600,
              textDecoration: "none", lineHeight: 1.2,
            }}
          >
            Sign Up
          </a>
        ) : (
          // The sheet lives on the post, so this is the one action that has to
          // send you there rather than happening in the row. No arrow: it had
          // one, which read as "this leaves the app" — exactly backwards, since
          // this is the button that *doesn't*.
          <Btn size="sm" kind="primary" onClick={() => onOpen?.(post.id)}>
            Sign Up
          </Btn>
        ))}
      </div>
    </div>
  );
}

/**
 * What's coming up, and what to do about it.
 *
 * Three at a time. The point of this block is the next thing happening; a
 * month of temple cleaning shifts pushes Recent Activity off the screen, and
 * the feed is the other half of why anybody opens the app.
 */
export default function Upcoming({ posts = [], name, setName, onOpen }) {
  const [all, setAll] = useState(false);
  const shown = all ? posts : posts.slice(0, SHOWN);
  const more = posts.length - shown.length;

  // No bottom margin of its own: the feed spaces the hubs with one flex gap so
  // the three cards can't drift apart. See HUB_GAP in Feed.jsx.
  return (
    <div style={{ ...card, padding: "12px 13px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
        <CalendarDays size={15} style={{ color: T.sub, flex: "0 0 auto" }} />
        <span style={{
          fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
          textTransform: "uppercase", color: T.sub, flex: 1,
        }}>
          Upcoming
        </span>
        {(more > 0 || all) && (
          <Btn size="sm" kind="plain" onClick={() => setAll((v) => !v)}>
            {all ? "Show less" : `See all ${posts.length}`}
          </Btn>
        )}
      </div>

      {!posts.length ? (
        <div style={{ fontSize: 14, color: T.faint, paddingBottom: 10 }}>
          Nothing on the calendar yet.
        </div>
      ) : (
        shown.map((p) => (
          <UpcomingRow key={p.id} post={p} name={name} setName={setName} onOpen={onOpen} />
        ))
      )}
    </div>
  );
}
