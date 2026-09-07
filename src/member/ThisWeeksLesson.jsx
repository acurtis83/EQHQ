import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarRange } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T } from "../components/ui";
import {
  fmtDate, toIso, sundaysBetween, isScheduledSunday,
  noLessonReason, NO_LESSON,
} from "../lib/domain/dates";
import { talkUrl } from "../presidency/Teaching";
import { hasTalk, sundayLabel } from "../lib/domain/lesson";
import TeachingSchedule from "./TeachingSchedule";

// The coming Sunday the quorum gathers — today counts if it's Sunday.
function nextGatheringSunday(fromIso) {
  const horizon = new Date(new Date(fromIso).getTime() + 60 * 86400000);
  for (const iso of sundaysBetween(fromIso, toIso(horizon))) {
    if (isScheduledSunday(iso)) return iso;
  }
  return "";
}

// Deliberately dark in both themes. It's the one fixed focal point on the
// home screen, and inverting it is what stops the screen reading as a wall
// of identical white cards.
const INK = "#17181c";
const ON_INK = "#ffffff";
const ON_INK_SOFT = "#a6abb4";
const ON_INK_ACCENT = "#8ab6e8";

/**
 * The same button the Upcoming rows use for Sign Up.
 *
 * Written out rather than imported because Upcoming builds its own inline —
 * the two are meant to match, and this comment is the only thing holding them
 * together. If either changes, change both.
 *
 * T.primary and --on-primary both flip with the theme, and the pair stays
 * legible on this card either way: a blue button with white text in light
 * mode, a pale blue button with near-black text in dark. The card itself is
 * fixed dark in both, so it's worth having checked.
 */
const PILL = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: T.primary,
  color: "var(--on-primary)",
  border: `1px solid ${T.primary}`,
  borderRadius: 10,
  padding: "7px 11px",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

export default function ThisWeeksLesson() {
  const [showSchedule, setShowSchedule] = useState(false);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    (async () => {
      const today = toIso(new Date());
      const sunday = nextGatheringSunday(today);
      if (!sunday) { setState({ loading: false, sunday: "" }); return; }

      // Views expose only what's announced publicly — no prep notes.
      const [lesson, exceptions] = await Promise.all([
        supabase.from("public_lessons").select("*").eq("date", sunday).maybeSingle(),
        supabase.from("public_calendar_exceptions").select("date").eq("date", sunday),
      ]);

      const stakeConf = new Set((exceptions.data || []).map((e) => e.date));
      setState({
        loading: false,
        sunday,
        reason: noLessonReason(sunday, stakeConf),
        row: lesson.data || null,
      });
    })();
  }, []);

  if (state.loading || !state.sunday) return null;

  const { sunday, reason, row } = state;

  // Only when a talk was actually chosen. talkUrl() falls back to a Church
  // search built from the topic, which is useful to the presidency looking
  // for a talk to assign but is not something to put "Read the talk" on in
  // front of the quorum — it opens a page of search results.
  const url = hasTalk(row) ? talkUrl(row) : "";

  // Shared with the presidency home card and the weekly email, so the three
  // screens can't end up calling the same Sunday different things again.
  const when = sundayLabel(sunday, toIso(new Date()), !reason).toUpperCase();

  const dateLabel = fmtDate(sunday)
    .replace(/^\w+, /, "")
    .replace(/, \d{4}$/, "")
    .toUpperCase();

  let title;
  let sub;
  if (reason) {
    const fifth = reason === NO_LESSON.FIFTH_SUNDAY;
    title = fifth ? "5th Sunday" : reason;
    sub =
      reason === NO_LESSON.STAKE_CONF
        ? "Stake conference — no quorum meeting."
        : reason === NO_LESSON.GENERAL_CONF
        ? "General Conference — no quorum meeting."
        : "The bishopric directs this one — no quorum lesson.";
  } else if (row?.talk_title || row?.topic || row?.teacher_name) {
    // The topic stands in as the headline when no talk has been chosen. It was
    // being dropped, so a week set up with a teacher and a subject showed the
    // bare word "Lesson" — less than the email said about the same week.
    title = row.talk_title || row.topic || "Lesson";
    sub = [row.teacher_name, row.speaker].filter(Boolean).join(" · ");
  } else {
    title = "Lesson Coming";
    sub = "Not posted yet — check back before Sunday.";
  }

  return (
    <div
      style={{
        background: INK,
        borderRadius: 18,
        padding: "16px 17px",
        // No bottom margin: the feed spaces the hubs with one flex gap so the
        // three cards can't drift apart. See HUB_GAP in Feed.jsx.
        minWidth: 0,
      }}
    >
      {/* "TODAY · SEP 6", and big enough to be the first thing read.
          It was 11px with wide tracking — a caption above the headline. But
          which Sunday this card is talking about is the question people
          actually arrive with, especially on a Wednesday when "this week's
          lesson" could mean the one just gone. The lesson title stays larger
          still, so there's one headline rather than two competing for it. */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 7,
          fontSize: 15,
          letterSpacing: "0.06em",
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        <span style={{ color: ON_INK_ACCENT }}>{when}</span>
        {/* Softer, so at this size the label still leads and the date reads as
            what it is — the answer to "which Sunday", not a second heading. */}
        <span style={{ color: ON_INK_SOFT, fontWeight: 700 }}>{dateLabel}</span>
      </div>

      <div
        style={{
          fontSize: 21.5,
          fontWeight: 800,
          color: ON_INK,
          letterSpacing: "-0.02em",
          lineHeight: 1.25,
          marginTop: 8,
        }}
      >
        {title}
      </div>

      {sub && (
        <div style={{ fontSize: 14.5, color: ON_INK_SOFT, marginTop: 5, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}

      {/* Both actions as buttons, matching the Sign Up button in Upcoming.
          They were two text links of different sizes and colours, which read
          as small print under the lesson rather than as things to press — and
          the schedule, which is the only way a teacher can check when their
          turn is, was the fainter of the two.

          Side by side rather than stacked: on the narrowest phone they wrap,
          and wrapping is better than permanently spending two lines. */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, marginTop: 13,
      }}>
        {!reason && url && (
          // A real anchor, as in Upcoming: it leaves the app, so long-press,
          // open-in-new-tab and "copy link" all have to work, and a screen
          // reader should call it a link rather than a button.
          <a href={url} target="_blank" rel="noreferrer" style={PILL}>
            Read the talk
            <ArrowUpRight size={15} />
          </a>
        )}

        {/* The way in to the full schedule. Members have no navigation of
            their own — the feed is the whole app for them — so this is the
            only place a teacher could reasonably find it. */}
        <button
          onClick={() => setShowSchedule(true)}
          style={{ ...PILL, cursor: "pointer", font: "inherit", fontSize: 14, fontWeight: 600 }}
        >
          <CalendarRange size={14} />
          Upcoming Lessons
        </button>
      </div>

      {showSchedule && <TeachingSchedule onClose={() => setShowSchedule(false)} />}
    </div>
  );
}
