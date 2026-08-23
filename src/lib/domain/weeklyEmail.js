// The Monday email.
//
// Karl sends this at the start of the week, so "this Sunday" means the Sunday
// coming up, not the one just gone. Everything here is pure text assembly with
// no database or DOM involved, which is what makes it testable.

// Explicit .js so this module can be imported by plain Node as well as Vite —
// the email is pure text assembly and worth testing on its own.
import { fmtDate, fmtShort } from "./dates.js";

const dash = "—";

/**
 * Subject line. Dated so a thread doesn't collapse weeks together in Gmail.
 */
export function emailSubject({ sundayIso }) {
  return `Elders Quorum ${dash} Week of ${fmtShort(sundayIso)}`;
}

/**
 * Plain-text body. This is the source of truth; the HTML version is rendered
 * from the same inputs so the two can't drift apart in content.
 *
 * @param {object} a
 * @param {string} a.sundayIso        the coming Sunday
 * @param {object|null} a.lesson      teaching_assignments row for that date
 * @param {string} a.noLessonReason   set when there's no quorum meeting
 * @param {string[]} a.announcements  lines from the Sunday agenda
 * @param {object[]} a.events         upcoming activities and temple trips
 * @param {string} a.senderName
 */

/**
 * Where an event sends people, and what to call it.
 *
 * An event points somewhere in one of two ways: a sign-up form attached in the
 * planner (form_id, or the form on the specific date being shown), or a plain
 * link someone pasted on. They read differently in an email — "Sign up" is an
 * instruction, "Details" is an offer — so they get different labels.
 *
 * A pasted link that already points at a form counts as a sign-up: that's how
 * a form gets attached when it was made before the event.
 *
 * @param {object} e        the resolved event, as upcomingForSunday returns it
 * @param {string} siteUrl  where the app is served from; without it a form_id
 *                          can't be turned into a link, so it's skipped rather
 *                          than guessed at
 */
export function eventLink(e, siteUrl) {
  if (e?.form_id && siteUrl) {
    return { label: "Sign up", href: `${String(siteUrl).replace(/\/+$/, "")}/?f=${e.form_id}` };
  }
  const url = (e?.link_url || "").trim();
  if (!url) return null;
  return { label: /[?&]f=/.test(url) ? "Sign up" : "Details", href: url };
}

/**
 * An announcement, however it was passed.
 *
 * Callers used to hand over plain strings. Agenda items carry a link and an
 * attachment too, so they can hand over the row instead — both shapes work so
 * an older caller doesn't break.
 */
function asNote(a) {
  if (typeof a === "string") return { text: a.trim(), link: null };
  const text = String(a?.text || "").trim();
  const link = (a?.link_url || a?.attachment_url || "").trim() || null;
  return { text, link };
}

export function buildEmailText({
  sundayIso, lesson, noLessonReason, announcements = [], events = [], senderName = "",
  siteUrl = "",
}) {
  const out = [];
  out.push(`Brethren,`);
  out.push("");

  // --- lesson ---
  out.push(`THIS SUNDAY ${dash} ${fmtDate(sundayIso)}`);
  if (noLessonReason) {
    out.push(noLessonReason);
  } else if (lesson && (lesson.teacher_name || lesson.talk_title)) {
    if (lesson.teacher_name) out.push(`Teacher: ${lesson.teacher_name}`);
    if (lesson.talk_title) {
      out.push(`Lesson: "${lesson.talk_title}"${lesson.speaker ? ` by ${lesson.speaker}` : ""}`);
    }
    if (lesson.topic && !lesson.talk_title) out.push(`Topic: ${lesson.topic}`);
    // The link is the point of the email for most people — put it on its own
    // line so it stays clickable when a mail client wraps the text.
    if (lesson.talk_link) out.push(lesson.talk_link);
    out.push("");
    out.push("Please read the talk before Sunday.");
  } else {
    out.push("Lesson details to follow.");
  }

  // --- announcements ---
  const notes = announcements.map(asNote).filter((n) => n.text);
  if (notes.length) {
    out.push("");
    out.push("ANNOUNCEMENTS");
    for (const n of notes) {
      out.push(`  ${dash} ${n.text}`);
      // On its own line so it stays clickable when a mail client wraps text.
      if (n.link) out.push(`    ${n.link}`);
    }
  }

  // --- what's coming ---
  if (events.length) {
    out.push("");
    out.push("COMING UP");
    for (const e of events) {
      // `when` is the resolved occurrence for a repeating event; a one-off
      // just has its own date.
      const on = e.when || e.event_date;
      const when = on ? fmtShort(on) : "Date to be confirmed";
      const bits = [when, e.event_time, e.location].filter(Boolean).join(", ");
      out.push(`  ${dash} ${e.title}${bits ? ` ${dash} ${bits}` : ""}`);
      // The sign-up link is the reason most people open the email at all.
      const link = eventLink(e, siteUrl);
      if (link) out.push(`    ${link.label}: ${link.href}`);
    }
  }

  out.push("");
  out.push(senderName ? `${senderName}` : "Elders Quorum Presidency");
  out.push("Holbrook Farms 8th Ward");
  return out.join("\n");
}

// Named escHtml, not esc: the standalone preview inlines this file verbatim
// and already has an `esc` of its own.
const escHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * HTML body, for pasting into Gmail with the link live and the headings bold.
 * Inline styles only — mail clients drop <style> blocks.
 */
export function buildEmailHtml({
  sundayIso, lesson, noLessonReason, announcements = [], events = [], senderName = "",
  siteUrl = "",
}) {
  const P = 'margin:0 0 12px;font-size:15px;line-height:1.55;color:#17181c';
  const H = 'margin:20px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#626974';
  const parts = [];
  parts.push(`<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px">`);
  parts.push(`<p style="${P}">Brethren,</p>`);

  parts.push(`<div style="${H}">This Sunday ${dash} ${escHtml(fmtDate(sundayIso))}</div>`);
  if (noLessonReason) {
    parts.push(`<p style="${P}">${escHtml(noLessonReason)}</p>`);
  } else if (lesson && (lesson.teacher_name || lesson.talk_title)) {
    const rows = [];
    if (lesson.teacher_name) rows.push(`<strong>Teacher:</strong> ${escHtml(lesson.teacher_name)}`);
    if (lesson.talk_title) {
      rows.push(`<strong>Lesson:</strong> &ldquo;${escHtml(lesson.talk_title)}&rdquo;` +
        (lesson.speaker ? ` by ${escHtml(lesson.speaker)}` : ""));
    }
    if (lesson.topic && !lesson.talk_title) rows.push(`<strong>Topic:</strong> ${escHtml(lesson.topic)}`);
    parts.push(`<p style="${P}">${rows.join("<br>")}</p>`);
    if (lesson.talk_link) {
      parts.push(`<p style="${P}"><a href="${escHtml(lesson.talk_link)}" style="color:#0063d6">Read the talk</a></p>`);
    }
    parts.push(`<p style="${P}">Please read the talk before Sunday.</p>`);
  } else {
    parts.push(`<p style="${P}">Lesson details to follow.</p>`);
  }

  const notes = announcements.map(asNote).filter((n) => n.text);
  if (notes.length) {
    parts.push(`<div style="${H}">Announcements</div>`);
    parts.push(`<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#17181c">` +
      notes.map((n) => `<li>${escHtml(n.text)}` +
        (n.link ? ` <a href="${escHtml(n.link)}" style="color:#0063d6">Open</a>` : "") +
        `</li>`).join("") + `</ul>`);
  }

  if (events.length) {
    parts.push(`<div style="${H}">Coming Up</div>`);
    parts.push(`<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#17181c">` +
      events.map((e) => {
        const on = e.when || e.event_date;
        const when = on ? fmtShort(on) : "Date to be confirmed";
        const bits = [when, e.event_time, e.location].filter(Boolean).map(escHtml).join(", ");
        const link = eventLink(e, siteUrl);
        return `<li><strong>${escHtml(e.title)}</strong>${bits ? ` ${dash} ${bits}` : ""}` +
          (link ? ` &mdash; <a href="${escHtml(link.href)}" style="color:#0063d6">${escHtml(link.label)}</a>` : "") +
          `</li>`;
      }).join("") + `</ul>`);
  }

  parts.push(`<p style="${P};margin-top:20px;color:#626974">` +
    `${escHtml(senderName || "Elders Quorum Presidency")}<br>Holbrook Farms 8th Ward</p>`);
  parts.push(`</div>`);
  return parts.join("");
}

/**
 * Turn hand-edited plain text back into HTML, so the "copy formatted" button
 * still reflects Karl's edits rather than silently sending the generated
 * version. Headings are the ALL-CAPS lines; bullets start with a dash.
 */
export function textToHtml(text) {
  const P = 'margin:0 0 12px;font-size:15px;line-height:1.55;color:#17181c';
  const H = 'margin:20px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#626974';
  const lines = String(text || "").split(/\r?\n/);
  const out = [`<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px">`];
  let bullets = [];

  const flush = () => {
    if (!bullets.length) return;
    out.push(`<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#17181c">` +
      bullets.map((b) => `<li>${linkify(escHtml(b))}</li>`).join("") + `</ul>`);
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^[—-]\s+/.test(line)) { bullets.push(line.replace(/^[—-]\s+/, "")); continue; }
    flush();
    // A heading is a short line in capitals, optionally with a date after a dash.
    const head = line.split("—")[0].trim();
    if (head.length > 1 && head === head.toUpperCase() && /[A-Z]/.test(head)) {
      out.push(`<div style="${H}">${escHtml(line)}</div>`);
    } else {
      out.push(`<p style="${P}">${linkify(escHtml(line))}</p>`);
    }
  }
  flush();
  out.push(`</div>`);
  return out.join("");
}

// Bare URLs become links. Runs on already-escaped text, so it matches &amp; too.
function linkify(escaped) {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g,
    (u) => `<a href="${u}" style="color:#0063d6">${u}</a>`);
}
