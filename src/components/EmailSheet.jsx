import { useCallback, useMemo, useState } from "react";
import { T, Btn, Area } from "./ui";
import Sheet from "./Sheet";
import {
  buildEmailText, buildEmailHtml, textToHtml, emailSubject,
} from "../lib/domain/weeklyEmail";

/**
 * The weekly email, ready to send.
 *
 * Lifted out of the Sunday agenda so the secretary can reach it straight from
 * the Presidency Home. It was the only thing on that screen he needed, and
 * walking through a meeting agenda to get to it made the wrong thing feel like
 * the main thing.
 */
export default function EmailSheet({
  agenda, sundayIso, lesson, noLessonReason, announcements, events, senderName, onSave, onClose,
}) {
  // Where the app is served from, so a form_id can become a link someone can
  // tap. Read here rather than baked into the builder, which stays pure.
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const generate = useCallback(
    () => buildEmailText({ sundayIso, lesson, noLessonReason, announcements, events, senderName, siteUrl }),
    [sundayIso, lesson, noLessonReason, announcements, events, senderName, siteUrl]
  );

  // A saved body wins, so an edit survives reopening. "Regenerate" is how you
  // get back to the freshly built version after the lesson or events change.
  const [text, setText] = useState(agenda.email_body || generate);
  const [copied, setCopied] = useState("");
  const subject = emailSubject({ sundayIso });

  const edited = !!agenda.email_body && agenda.email_body !== generate();

  const copy = async (kind) => {
    // Copy the version on screen, not the generated one — otherwise Karl's
    // edits would silently not make it into the email.
    const plain = text;
    const html = agenda.email_body === text && !edited
      ? buildEmailHtml({ sundayIso, lesson, noLessonReason, announcements, events, senderName, siteUrl })
      : textToHtml(text);
    try {
      if (kind === "html" && window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(kind === "html" ? html : plain);
      }
      setCopied(kind);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("failed");
      setTimeout(() => setCopied(""), 2400);
    }
  };

  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  return (
    <Sheet title="Weekly Email" onClose={onClose}>
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        For the Monday note — this Sunday's lesson, announcements, and what's coming up.
        Edit anything below, then copy it into your mail app.
      </div>

      <Lbl label="Subject">
        <Input value={subject} onChange={() => {}} readOnly />
      </Lbl>

      <Lbl label="Body">
        <Area value={text} onChange={setText} rows={16} />
      </Lbl>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn kind="primary" onClick={() => copy("html")}>
          {copied === "html" ? <Check size={14} /> : <Copy size={14} />}
          {copied === "html" ? "Copied" : "Copy Formatted"}
        </Btn>
        <Btn kind="ghost" onClick={() => copy("plain")}>
          {copied === "plain" ? <Check size={14} /> : <Copy size={14} />}
          {copied === "plain" ? "Copied" : "Copy Plain Text"}
        </Btn>
        <Btn kind="plain" onClick={() => { window.location.href = mailto; }}>
          <Mail size={14} />Open In Mail
        </Btn>
      </div>

      {copied === "failed" && (
        <div style={{ fontSize: 13.5, color: T.red }}>
          The browser blocked the clipboard — select the text above and copy it manually.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${T.lineSoft}`, paddingTop: 11 }}>
        <Btn kind="soft" size="sm" onClick={() => { onSave(text); onClose(); }}>Save Draft</Btn>
        <Btn kind="plain" size="sm" onClick={() => setText(generate())}>
          <RefreshCw size={13} />Regenerate
        </Btn>
      </div>

      <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.5 }}>
        “Copy Formatted” keeps the headings and makes the talk link clickable in Gmail.
        Plain text is safer if the formatting comes through oddly.
      </div>
    </Sheet>
  );
}

/* ---------------------- pull announcements from a meeting ---------------------- */
