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
    // Two blocks, not one list with a "Release"/"Sustain" word in front of
    // each name. They are different pieces of business: a release asks for a
    // vote of thanks, a calling asks to be sustained, and they're put to the
    // quorum separately with different words. Mixing them means reading the
    // list twice and picking out the right ones each time.
    sustainings: business(sustainings),
    // Not conditional: a Sunday with no lesson still has a reason worth
    // saying, and a blank where the lesson goes reads as a forgotten
    // assignment rather than stake conference.
    lesson: lessonBlock(lesson, reason),
  };

  return [
    person("conducting", "Conducting", conducting),
    person("opening", "Opening Prayer", agenda?.opening_prayer),
    // flatMap, because the business slot yields two blocks when there are both
    // releases and callings to put.
    ...SECTIONS.flatMap((k) => middle[k] || []),
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
    // The wording goes with it. Somebody pasting this into a message to a
    // counselor who's conducting for them wants the sentences, not a list of
    // names they then have to work out what to do with.
    if (b.intro) out.push(`  ${b.intro}`);

    for (const it of b.items) {
      if (b.kind === "notices" || b.kind === "business") out.push(`  - ${it.text}`);
      if (b.kind === "events") {
        const when = [it.when ? fmt(it.when) : "", it.where].filter(Boolean).join(" · ");
        out.push(`  - ${[it.title, when].filter(Boolean).join(" — ")}${it.signUp ? " (sign-up)" : ""}`);
      }
    }
    if (b.vote) out.push(`  ${b.vote}`);
  }
  return out;
}

/**
 * Releases and callings, each with the words that go around them.
 *
 * The lead-in and the vote are part of the item, not decoration. Standing up
 * to put business to the quorum, what you need is the sentence — the names are
 * the easy part, and composing "and we propose that they be given a vote of
 * thanks" from memory while everyone waits is where it goes wrong.
 *
 * Singular and plural are handled because this is read aloud. "The following
 * individuals have been released" over one name is the kind of thing everyone
 * in the room notices.
 */
function business(rows = []) {
  const of = (stage) => rows.filter((c) => c.stage === stage);
  const named = (list) => list.map((c) => ({
    id: c.id,
    text: [c.candidate_name || "—", c.position].filter(Boolean).join(" — "),
  }));

  const blocks = [];
  const releases = of("Need to Release");
  const callings = rows.filter((c) => c.stage !== "Need to Release");

  if (releases.length) {
    blocks.push({
      key: "releases", kind: "business", label: "Releases",
      intro: releases.length === 1
        ? "The following individual has been released from their calling, and we propose that they be given a vote of thanks."
        : "The following individuals have been released from their callings, and we propose that they be given a vote of thanks.",
      items: named(releases),
      vote: "Those who would like to express thanks for their service may show it by the uplifted hand.",
    });
  }

  if (callings.length) {
    blocks.push({
      key: "sustainings", kind: "business", label: "Sustainings",
      intro: callings.length === 1
        ? "The following individual has been called, and we propose that they be sustained."
        : "The following individuals have been called, and we propose that they be sustained.",
      items: named(callings),
      vote: "All in favor, please show by the uplifted hand. Any opposed, by the same sign.",
    });
  }
  return blocks;
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
