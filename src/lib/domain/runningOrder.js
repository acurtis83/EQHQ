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
 * The middle of the meeting, in order.
 *
 * "either add a manual reorder for things...or move Announcements and
 *  Callings & Sustainings above Lesson."
 *
 * Business first, lesson last. The lesson runs to the end of the hour, so
 * anything after it is whatever there turns out to be time for — which in
 * practice is how announcements got skipped. Upcoming Events sits with the
 * announcements because that is what it is: the same kind of thing, said in
 * the same breath.
 *
 * A fixed order rather than a per-meeting setting. A quorum meeting runs the
 * same way every week, so a knob for this is one nobody touches after the
 * first Sunday and one more thing that can be left in a state nobody meant.
 *
 * This constant is the ONLY statement of the order. The agenda screen lays its
 * sections out from it, and the read-aloud sheet, the printed copy and Copy
 * all build from the blocks below — so there is nowhere for a fifth version to
 * drift into.
 */
export const SECTIONS = ["announcements", "upcoming", "sustainings", "lesson"];

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

  const middle = {
    announcements: announcements.length && {
      key: "announcements", kind: "notices", label: "Announcements",
      // Whole text, never a summary and never a cut. This block is the reason
      // the read-aloud sheet exists: the editing boxes clipped announcements
      // to one line, so the one thing being read out was the one thing
      // unreadable.
      items: announcements.map((a) => ({ id: a.id, text: String(a.text || "").trim() }))
        .filter((a) => a.text),
    },
    upcoming: events.length && {
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
    },
    sustainings: sustainings.length && {
      key: "sustainings", kind: "list", label: "Callings & Sustainings",
      items: sustainings.map((c) => ({
        id: c.id,
        // The word the conductor says. "Need to Release" is tracker language
        // and reads as a to-do; at the podium it's "Release".
        lead: c.stage === "Need to Release" ? "Release" : "Sustain",
        text: [c.candidate_name || "—", c.position].filter(Boolean).join(", "),
      })),
    },
    // Not conditional: a Sunday with no lesson still has a reason worth
    // saying, and a blank where the lesson goes reads as a forgotten
    // assignment rather than stake conference.
    lesson: lessonBlock(lesson, reason),
  };

  return [
    person("conducting", "Conducting", conducting),
    person("opening", "Opening Prayer", agenda?.opening_prayer),
    ...SECTIONS.map((k) => middle[k]),
    // Last, which is the whole point. On the editing screen it sits directly
    // under the opening prayer because they're the same kind of field.
    person("closing", "Closing Prayer", agenda?.closing_prayer),
  ].filter(Boolean);
}

/**
 * The same meeting as pasteable text.
 *
 * Built from the blocks rather than assembled again, because it was assembled
 * again: Copy kept its own list of what to include and in what order, as did
 * the printed sheet, and both of them still had the lesson before the
 * announcements after the screen had moved on. Anything with an order to get
 * wrong now derives from runningOrder() and there is one order to fix.
 *
 * @param {object[]} blocks   from runningOrder()
 * @param {string}   heading  the meeting's title line, already formatted
 * @param {function} fmt      how to write a date. Passed in rather than
 *   imported so this stays pure text-shaping — the caller already knows which
 *   of the app's date formats it wants, and the default keeps ISO readable.
 */
export function agendaText(blocks = [], heading = "", fmt = (d) => d) {
  const out = heading ? [heading, ""] : [];
  for (const b of blocks) {
    if (b.kind === "person") { out.push(`${b.label}: ${b.value}`); continue; }

    out.push("", `${b.label}:`);
    if (b.kind === "lesson") {
      if (b.reason) { out.push(`  ${b.reason}`); continue; }
      out.push(`  Teacher: ${b.teacher}`);
      if (b.talk) out.push(`  Talk: “${b.talk}”${b.speaker ? ` — ${b.speaker}` : ""}`);
      if (b.link) out.push(`  ${b.link}`);
      continue;
    }
    for (const it of b.items) {
      if (b.kind === "notices") out.push(`  - ${it.text}`);
      if (b.kind === "list") out.push(`  - ${it.lead}: ${it.text}`);
      if (b.kind === "events") {
        const when = [it.when ? fmt(it.when) : "", it.where].filter(Boolean).join(" · ");
        out.push(`  - ${[it.title, when].filter(Boolean).join(" — ")}${it.signUp ? " (sign-up)" : ""}`);
      }
    }
  }
  return out;
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
