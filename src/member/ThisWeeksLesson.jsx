import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T } from "../components/ui";
import {
  fmtDate, toIso, sundaysBetween, isScheduledSunday,
  noLessonReason, NO_LESSON,
} from "../lib/domain/dates";
import { talkUrl } from "../presidency/Teaching";

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
  const isThisSunday = sunday === toIso(new Date());
  const url = talkUrl(row);

  const eyebrow = `${isThisSunday ? "TODAY" : "THIS SUNDAY"} · ${fmtDate(sunday)
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
  } else if (row?.talk_title || row?.teacher_name) {
    title = row.talk_title || "Lesson";
    sub = [row.teacher_name, row.speaker].filter(Boolean).join(" · ");
  } else {
    title = "Lesson coming";
    sub = "Not posted yet — check back before Sunday.";
  }

  return (
    <div
      style={{
        background: INK,
        borderRadius: 18,
        padding: "16px 17px",
        marginBottom: 14,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          fontWeight: 700,
          color: ON_INK_ACCENT,
        }}
      >
        {eyebrow}
      </div>

      <div
        style={{
          fontSize: 20,
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
        <div style={{ fontSize: 13.5, color: ON_INK_SOFT, marginTop: 5, lineHeight: 1.5 }}>
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
            fontSize: 13.5,
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
