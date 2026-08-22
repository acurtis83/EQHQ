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
export function buildEmailText({
  sundayIso, lesson, noLessonReason, announcements = [], events = [], senderName = "",
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
  const notes = announcements.filter((t) => (t || "").trim());
  if (notes.length) {
    out.push("");
    out.push("ANNOUNCEMENTS");
    for (const n of notes) out.push(`  ${dash} ${n.trim()}`);
  }

  // --- what's coming ---
  if (events.length) {
    out.push("");
    out.push("COMING UP");
    for (const e of events) {
      const when = e.event_date ? fmtShort(e.event_date) : "Date to be confirmed";
      const bits = [when, e.event_time, e.location].filter(Boolean).join(", ");
      out.push(`  ${dash} ${e.title}${bits ? ` ${dash} ${bits}` : ""}`);
    }
  }

  out.push("");
  out.push(senderName ? `${senderName}` : "Elders Quorum Presidency");
  out.push("Holbrook Farms 8th Ward");
  return out.join("\n");
}

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * HTML body, for pasting into Gmail with the link live and the headings bold.
 * Inline styles only — mail clients drop <style> blocks.
 */
export function buildEmailHtml({
  sundayIso, lesson, noLessonReason, announcements = [], events = [], senderName = "",
}) {
  const P = 'margin:0 0 12px;font-size:15px;line-height:1.55;color:#17181c';
  const H = 'margin:20px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#626974';
  const parts = [];
  parts.push(`<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px">`);
  parts.push(`<p style="${P}">Brethren,</p>`);

  parts.push(`<div style="${H}">This Sunday ${dash} ${esc(fmtDate(sundayIso))}</div>`);
  if (noLessonReason) {
    parts.push(`<p style="${P}">${esc(noLessonReason)}</p>`);
  } else if (lesson && (lesson.teacher_name || lesson.talk_title)) {
    const rows = [];
    if (lesson.teacher_name) rows.push(`<strong>Teacher:</strong> ${esc(lesson.teacher_name)}`);
    if (lesson.talk_title) {
      rows.push(`<strong>Lesson:</strong> &ldquo;${esc(lesson.talk_title)}&rdquo;` +
        (lesson.speaker ? ` by ${esc(lesson.speaker)}` : ""));
    }
    if (lesson.topic && !lesson.talk_title) rows.push(`<strong>Topic:</strong> ${esc(lesson.topic)}`);
    parts.push(`<p style="${P}">${rows.join("<br>")}</p>`);
    if (lesson.talk_link) {
      parts.push(`<p style="${P}"><a href="${esc(lesson.talk_link)}" style="color:#0063d6">Read the talk</a></p>`);
    }
    parts.push(`<p style="${P}">Please read the talk before Sunday.</p>`);
  } else {
    parts.push(`<p style="${P}">Lesson details to follow.</p>`);
  }

  const notes = announcements.filter((t) => (t || "").trim());
  if (notes.length) {
    parts.push(`<div style="${H}">Announcements</div>`);
    parts.push(`<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#17181c">` +
      notes.map((n) => `<li>${esc(n.trim())}</li>`).join("") + `</ul>`);
  }

  if (events.length) {
    parts.push(`<div style="${H}">Coming Up</div>`);
    parts.push(`<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#17181c">` +
      events.map((e) => {
        const when = e.event_date ? fmtShort(e.event_date) : "Date to be confirmed";
        const bits = [when, e.event_time, e.location].filter(Boolean).map(esc).join(", ");
        return `<li><strong>${esc(e.title)}</strong>${bits ? ` ${dash} ${bits}` : ""}</li>`;
      }).join("") + `</ul>`);
  }

  parts.push(`<p style="${P};margin-top:20px;color:#626974">` +
    `${esc(senderName || "Elders Quorum Presidency")}<br>Holbrook Farms 8th Ward</p>`);
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
      bullets.map((b) => `<li>${linkify(esc(b))}</li>`).join("") + `</ul>`);
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
      out.push(`<div style="${H}">${esc(line)}</div>`);
    } else {
      out.push(`<p style="${P}">${linkify(esc(line))}</p>`);
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
