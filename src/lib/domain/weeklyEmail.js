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
/**
 * The closing line, and the words inside it that are the link.
 *
 * Kept as constants because three things have to agree about them: the plain
 * text, the generated HTML, and the pass that turns hand-edited plain text
 * back into HTML. If they drift, the sentence still appears but the link
 * quietly stops being a link — which is exactly the sort of thing nobody
 * notices until somebody says "the app link doesn't work".
 */
export const APP_NAME = "Elders Quorum App";
export const APP_LINE =
  `Stay up to date and find all of the upcoming events and announcements on our ${APP_NAME}`;

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
 * Whether an event's name wants "the" in front of it.
 *
 * "the Stake Temple Cleaning Assignment" is right; "the Basketball" is not.
 * The difference is whether the name describes the thing or is just what it's
 * called, and the tell is the last word: a name ending in a generic event noun
 * takes an article, a name that is a proper noun doesn't.
 *
 * A list rather than something cleverer because it's short, it's ward
 * vocabulary, and a wrong guess reads badly in an email going to eighty
 * people. Anything not on it gets no article, which is the safe direction —
 * "Sign up for Ladder Golf here" is fine, "the Ladder Golf" is not.
 */
const GENERIC_NOUNS = new Set([
  "assignment", "assignments", "sacrament", "meeting", "night", "trip",
  "project", "activity", "party", "dinner", "breakfast", "lunch", "bbq",
  "cleaning", "conference", "soiree", "social", "service", "fireside",
  "devotional", "temple", "cleanup", "drive", "day", "morning",
  "evening", "weekend", "camp", "tournament", "game", "shift",
]);

export function article(title) {
  const t = String(title || "").trim();
  if (!t) return "";
  if (/^(the|a|an)\s/i.test(t)) return "";          // it brought its own
  const last = t.split(/\s+/).pop().toLowerCase().replace(/[^a-z-]/g, "");
  return GENERIC_NOUNS.has(last) ? "the " : "";
}

/**
 * Where an event sends people, and what to call it.
 *
 * An event points somewhere in one of two ways: a sign-up form attached in the
 * planner (form_id, or the form on the specific date being shown), or a plain
 * link someone pasted on. They read differently in an email — "Sign up" is an
 * instruction, "Details" is an offer — so they get different words.
 *
 * The label names the event. "Sign up" on its own was fine when it sat beside
 * the thing it belonged to, but the email puts it on its own line, and two
 * events in a row gave you two identical links above two different URLs — you
 * had to count lines to work out which was which.
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
  const title = String(e?.title || "").trim();
  const named = (verb, bare) => (title ? `${verb} ${article(title)}${title} here` : bare);

  const base = String(siteUrl || "").replace(/\/+$/, "");

  if (e?.form_id && siteUrl) {
    return {
      label: named("Sign up for", "Sign up"),
      short: "Sign up",
      href: `${base}/?f=${e.form_id}`,
    };
  }

  // An activity with no form but an RSVP on it — basketball, a games night.
  // The email used to leave those with no link at all, so the one-tap button
  // on the feed was invisible to anyone reading the email, which is most
  // people. It points at the post rather than a form, because that's where
  // the button is.
  //
  // Worded as the button itself says it — the feed's is "I’m In" — so the
  // link and the thing it lands on are recognisably the same act. Signing up
  // for an assignment and saying you'll turn up to basketball are different
  // things, and calling both of them "Sign up" blurred that.
  if (e?.rsvp && e?.post_id && siteUrl) {
    return {
      label: title ? `I’m In for ${article(title)}${title}` : "I’m In",
      short: "I’m In",
      href: `${base}/?p=${e.post_id}`,
    };
  }
  const url = (e?.link_url || "").trim();
  if (!url) return null;
  const signup = /[?&]f=/.test(url);
  return {
    label: signup ? named("Sign up for", "Sign up") : named("Details for", "Details"),
    short: signup ? "Sign up" : "Details",
    href: url,
  };
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
    // Named, like the sign-up links: a bare conference URL is 90 characters
    // of noise in the middle of a four-line block, and the formatted copy was
    // already showing it as "Read the talk" while the plain one showed the
    // address — so a hand-edited email came out different from a sent one.
    if (lesson.talk_link) out.push(`Read the talk: ${lesson.talk_link}`);
    // The teacher, the lesson and the link are one block — no breaks between
    // them. The ask is a different kind of line, so it gets one blank line
    // above it, and the heading below it gets a wider margin than that.
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
      // Indented under its own event: textToHtml keeps an indented line with
      // the bullet above it, so the list doesn't get chopped in two, and the
      // "label: url" shape is what turns into a named hyperlink.
      const link = eventLink(e, siteUrl);
      if (link) out.push(`    ${link.label}: ${link.href}`);
    }
  }

  // The closing line, before the signature. Written as "sentence: url" like
  // the event links, so a plain-text reader can still get there — the HTML
  // pass puts the link on the app's name and drops the address.
  if (siteUrl) {
    out.push("");
    out.push(`${APP_LINE}: ${String(siteUrl).replace(/\/+$/, "")}`);
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
  const H = 'margin:26px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#626974';
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
    if (lesson.talk_link) {
      rows.push(`<a href="${escHtml(lesson.talk_link)}" style="color:#0063d6">Read the talk</a>`);
    }
    parts.push(`<p style="${P};margin-bottom:0">${rows.join("<br>")}</p>`);
    parts.push(`<p style="${P};margin-top:10px">Please read the talk before Sunday.</p>`);
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
        return `<li style="margin-bottom:6px"><strong>${escHtml(e.title)}</strong>${bits ? ` ${dash} ${bits}` : ""}` +
          (link ? `<br><a href="${escHtml(link.href)}" style="color:#0063d6">${escHtml(link.label)}</a>` : "") +
          `</li>`;
      }).join("") + `</ul>`);
  }

  if (siteUrl) {
    const home = String(siteUrl).replace(/\/+$/, "");
    const [before, after] = APP_LINE.split(APP_NAME);
    parts.push(`<p style="${P};margin-top:18px">${escHtml(before)}` +
      `<a href="${escHtml(home)}" style="color:#0063d6">${escHtml(APP_NAME)}</a>` +
      `${escHtml(after)}</p>`);
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
  const H = 'margin:26px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#626974';
  const lines = String(text || "").split(/\r?\n/);
  const out = [`<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px">`];
  let bullets = [];
  let para = [];

  // Consecutive lines are one paragraph with breaks in it; a blank line starts
  // a new one. That's how people write plain text, and it's what keeps the
  // teacher, the lesson and "please read the talk" together as one block
  // instead of four paragraphs with a gap between each.
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p style="${P}">${para.map((l) => linkify(escHtml(l))).join("<br>")}</p>`);
    para = [];
  };

  const flush = () => {
    if (!bullets.length) return;
    out.push(`<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#17181c">` +
      bullets.map((b) => `<li style="margin-bottom:6px">` +
        b.split("\n").map((part) => linkify(escHtml(part))).join("<br>") +
        `</li>`).join("") + `</ul>`);
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); flushPara(); continue; }
    if (/^[—-]\s+/.test(line)) { flushPara(); bullets.push(line.replace(/^[—-]\s+/, "")); continue; }
    // An indented line under a bullet belongs to it — that's where the sign-up
    // link goes. Treating it as a new paragraph chopped the list in two and
    // put a stray line between every pair of events.
    if (/^\s/.test(raw) && bullets.length) {
      bullets[bullets.length - 1] += `\n${line}`;
      continue;
    }
    flush();
    // A heading is a short line in capitals, optionally with a date after a dash.
    const head = line.split("—")[0].trim();
    if (head.length > 1 && head === head.toUpperCase() && /[A-Z]/.test(head)) {
      flushPara();
      out.push(`<div style="${H}">${escHtml(line)}</div>`);
    } else {
      para.push(line);
    }
  }
  flush();
  flushPara();
  out.push(`</div>`);
  return out.join("");
}

// Bare URLs become links. Runs on already-escaped text, so it matches &amp; too.
/**
 * Turn URLs into anchors, and "Label: URL" into an anchor that says Label.
 *
 * The named form is what the generated email writes — "Sign up for the Stake
 * Temple Cleaning Assignment here: https://..." — so that the plain-text copy
 * still shows somebody where they're going, while the formatted copy shows
 * the sentence and hides the URL behind it. Two events in a row used to give
 * two identical "Sign up" links above two different addresses.
 *
 * The label must not itself contain a URL, or "see https://a: https://b" would
 * turn into a link labelled with a link.
 */
function linkify(escaped) {
  // The closing line links a phrase inside a sentence rather than the whole
  // line, so it's handled before the label rule below — which would otherwise
  // make the entire sentence the link text.
  const appName = escHtml(APP_NAME);
  const closing = escaped.match(
    new RegExp(`^(.*${appName}.*?)[:\\s]+\\s*(https?://[^\\s<]+)$`)
  );
  if (closing) {
    const [, sentence, url] = closing;
    return sentence.replace(appName,
      `<a href="${url}" style="color:#0063d6">${appName}</a>`);
  }

  const named = escaped.replace(
    /^(\s*)([^:<>]{2,120}?):\s+(https?:\/\/[^\s<]+)$/,
    (_, indent, label, url) => `${indent}<a href="${url}" style="color:#0063d6">${label}</a>`
  );
  if (named !== escaped) return named;
  return escaped.replace(/(https?:\/\/[^\s<]+)/g,
    (u) => `<a href="${u}" style="color:#0063d6">${u}</a>`);
}
