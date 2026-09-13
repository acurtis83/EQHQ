/**
 * The Sunday meeting, in the order it actually runs.
 *
 * "I need to see the full text box so i can read the announcement. So even if
 *  there was a presentation mode that formatted the agenda for use in a
 *  meeting that would work."
 *
 * The editing screen is laid out for editing: prayers together in one block at
 * the top because they're the same kind of control, announcements in boxes
 * with move and delete buttons beside them. None of that is the order somebody
 * stands up and works through, and the closing prayer sitting inches below the
 * opening one is the clearest sign of it.
 *
 * So the running order is stated once, here, and both the screen you read from
 * and anything else that needs it derive from the same list. Pure: rows in,
 * blocks out. No clock, no database, no DOM.
 *
 * Two rules decide whether a block appears at all, and they differ on purpose:
 *
 *   - A PERSON block always appears, even unassigned. "Opening prayer" with
 *     nobody against it is a thing that still has to happen in the meeting,
 *     and the whole value of a read-aloud sheet is noticing that at 8:55 with
 *     time to ask somebody. Hiding it would turn a gap into a silence.
 *   - A LIST block disappears when it's empty. There is nothing to read out,
 *     and a heading over nothing is a line the eye has to process and discard
 *     every week.
 */

export const NOBODY = "— not assigned —";

/**
 * @param {object}   o
 * @param {object}   o.agenda         the agendas row
 * @param {string}   o.conducting     already resolved against the month's schedule
 * @param {object}   o.lesson         the teaching_assignments row, if any
 * @param {string}   o.reason         why there's no lesson (stake conference, 5th Sunday…)
 * @param {object[]} o.sustainings    callings at Called / Need to Release
 * @param {object[]} o.announcements  agenda_items in the announcements section, in order
 * @param {object[]} o.events         upcoming, already resolved and sorted
 * @param {string[]} o.signUps        ids of events that have a sign-up
 */
export function runningOrder({
  agenda = {}, conducting = "", lesson = null, reason = "",
  sustainings = [], announcements = [], events = [], signUps = [],
} = {}) {
  const has = new Set(signUps);
  const blocks = [
    person("conducting", "Conducting", conducting),
    person("opening", "Opening Prayer", agenda?.opening_prayer),
    lessonBlock(lesson, reason),
  ];

  if (sustainings.length) {
    blocks.push({
      key: "sustainings", kind: "list", label: "Callings & Sustainings",
      items: sustainings.map((c) => ({
        id: c.id,
        // The word the conductor says. "Need to Release" is tracker language
        // and reads as a to-do; at the podium it's "Release".
        lead: c.stage === "Need to Release" ? "Release" : "Sustain",
        text: [c.candidate_name || "—", c.position].filter(Boolean).join(", "),
      })),
    });
  }

  if (announcements.length) {
    blocks.push({
      key: "announcements", kind: "notices", label: "Announcements",
      // Whole text, never a summary and never a cut. This block is the reason
      // the screen exists: the editing boxes clipped announcements to one
      // line, so the one thing being read out was the one thing unreadable.
      items: announcements.map((a) => ({ id: a.id, text: String(a.text || "").trim() }))
        .filter((a) => a.text),
    });
  }

  if (events.length) {
    blocks.push({
      key: "upcoming", kind: "events", label: "Coming Up",
      items: events.map((e) => ({
        id: e.id,
        when: e.when || e.event_date || null,
        title: e.title || "",
        where: [e.event_time, e.location].filter(Boolean).join(" · "),
        // Whether to mention one, not where it points. A URL read out loud is
        // noise; "there's a sign-up" is the part worth saying, and the link is
        // in the email and on the feed by the time anybody wants it.
        signUp: has.has(e.id),
      })),
    });
  }

  // Last, which is the whole point. On the editing screen it sits directly
  // under the opening prayer because they're the same kind of field.
  blocks.push(person("closing", "Closing Prayer", agenda?.closing_prayer));
  return blocks.filter(Boolean);
}

function person(key, label, value) {
  const name = String(value || "").trim();
  return { key, kind: "person", label, value: name || NOBODY, assigned: !!name };
}

/**
 * The lesson, or why there isn't one.
 *
 * A Sunday with no lesson isn't an empty block — stake conference and the
 * fifth Sunday are things to say out loud, and a blank where the lesson goes
 * looks like the teaching assignment was forgotten.
 */
function lessonBlock(lesson, reason) {
  if (reason) return { key: "lesson", kind: "lesson", label: "Lesson", reason };
  const teacher = String(lesson?.teacher_name || "").trim();
  const talk = String(lesson?.talk_title || lesson?.topic || "").trim();
  return {
    key: "lesson", kind: "lesson", label: "Lesson",
    teacher: teacher || NOBODY,
    assigned: !!teacher,
    talk,
    // Kept apart from the teacher, because they're two different people and
    // running the names together is what made the feed card confusing.
    speaker: String(lesson?.speaker || "").trim(),
    link: String(lesson?.talk_link || "").trim(),
  };
}
