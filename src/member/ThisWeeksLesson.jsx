import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T } from "../components/ui";
import {
  fmtDate, toIso, sundaysBetween, isScheduledSunday,
  noLessonReason, NO_LESSON,
} from "../lib/domain/dates";
import { talkUrl } from "../presidency/Teaching";
import { hasTalk, sundayLabel } from "../lib/domain/lesson";

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

export default function ThisWeeksLesson() {
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

  const eyebrow = `${when} · ${fmtDate(sunday)
    .replace(/^\w+, /, "")
    .replace(/, \d{4}$/, "")
    .toUpperCase()}`;

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
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          fontWeight: 700,
          color: ON_INK_ACCENT,
        }}
      >
        {eyebrow}
      </div>

      <div
        style={{
          fontSize: 21.5,
          fontWeight: 800,
          color: ON_INK,
          letterSpacing: "-0.02em",
          lineHeight: 1.25,
          marginTop: 6,
        }}
      >
        {title}
      </div>

      {sub && (
        <div style={{ fontSize: 14.5, color: ON_INK_SOFT, marginTop: 5, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}

      {!reason && url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginTop: 12,
            fontSize: 14.5,
            fontWeight: 700,
            color: ON_INK_ACCENT,
            textDecoration: "none",
          }}
        >
          Read the talk
          <ArrowUpRight size={15} />
        </a>
      )}
    </div>
  );
}
