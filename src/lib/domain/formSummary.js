import { fmtDate } from "./dates.js";
import {
  normalizeOptions, optionLabel, capacityState, capacityTotals,
  namesByOption, summarize,
} from "./forms.js";

/**
 * A form's results, as something you can send someone.
 *
 * Written as plain text in the same shape as the weekly email — an uppercase
 * line is a heading, a line starting with "— " is a bullet — so textToHtml can
 * turn it into a formatted email without a second builder to keep in step.
 *
 * The audience is someone who wasn't in the meeting: the bishop wants the
 * headcount, who has committed to what, and what is still missing. So the
 * gaps get their own section at the end rather than being buried inside each
 * list, where they'd be easy to skim past.
 */

export function summarySubject(form) {
  return `${form?.title || "Form"} — sign-up update`;
}

const NUMBER_TYPES = ["number"];
const PICK_TYPES = ["capacity", "choice", "checkboxes", "yesno"];

/** One row per person, with their number answer when there's a single one. */
function peopleLines(form, questions, responses, byResponse) {
  const numberQ = questions.filter((q) => NUMBER_TYPES.includes(q.type));
  const one = numberQ.length === 1 ? numberQ[0] : null;

  return (responses || []).map((r) => {
    // An anonymous form has no names to give, so it says so rather than
    // printing a row of dashes that looks like missing data.
    const who = form?.anonymous ? "Anonymous" : (r.respondent_name || "No name given");
    const n = one ? byResponse?.[r.id]?.[one.id] : null;
    const count = n === undefined || n === null || n === "" ? null : Number(n);
    return count != null && !Number.isNaN(count) ? `— ${who} (${count})` : `— ${who}`;
  });
}

export function buildSummaryText({ form, questions, responses, byResponse, todayIso }) {
  const rows = responses || [];
  const qs = questions || [];
  const valuesFor = (qid) => rows.map((r) => byResponse?.[r.id]?.[qid]).filter((v) => v !== undefined);
  const rowsFor = (qid) => rows.map((r) => ({
    value: byResponse?.[r.id]?.[qid],
    name: form?.anonymous ? "" : (r.respondent_name || ""),
  }));

  const out = [form?.title || "Form", `Sign-up update${todayIso ? ` — ${fmtDate(todayIso)}` : ""}`, ""];

  if (!rows.length) {
    out.push("No responses yet.");
    return out.join("\n");
  }

  // ---------- headcount ----------
  const numberQ = qs.filter((q) => NUMBER_TYPES.includes(q.type));
  if (numberQ.length) {
    out.push("HEADCOUNT");
    for (const q of numberQ) {
      const s = summarize(q, valuesFor(q.id));
      out.push(`— ${q.label}: ${s.total ?? 0} across ${s.count} response${s.count === 1 ? "" : "s"}`);
    }
    out.push("");
  }

  // ---------- who ----------
  out.push(`RESPONSES — ${rows.length}`);
  out.push(...peopleLines(form, qs, rows, byResponse));
  out.push("");

  // ---------- each sign-up question ----------
  const gaps = [];
  for (const q of qs.filter((x) => PICK_TYPES.includes(x.type))) {
    const values = valuesFor(q.id);
    const options = normalizeOptions(q.type, q.options);
    const names = namesByOption(q, rowsFor(q.id));
    const isCapacity = q.type === "capacity";
    const totals = isCapacity ? capacityTotals(q, values) : null;

    const heading = totals && totals.needed
      ? `${q.label.toUpperCase()} — ${totals.taken} OF ${totals.needed} FILLED`
      : q.label.toUpperCase();
    out.push(heading);

    const labels = options.length ? options.map(optionLabel) : Object.keys(names);
    for (const label of labels) {
      const opt = options.find((o) => optionLabel(o) === label);
      const cap = isCapacity && opt ? capacityState(opt, values) : null;
      const who = names[label] || { names: [], anonymous: 0 };
      const taken = who.names.length + who.anonymous;

      const parts = [label];
      if (cap) parts.push(`(${cap.taken} of ${cap.limit})`);
      else if (taken) parts.push(`(${taken})`);

      const listed = who.names.length
        ? who.names.join(", ")
        : (who.anonymous ? `${who.anonymous} anonymous` : "nobody yet");
      let line = `— ${parts.join(" ")}: ${listed}`;

      if (cap && !cap.full) {
        const short = cap.limit - cap.taken;
        line += ` — ${short} still needed`;
        gaps.push(`— ${q.label}: ${label} (${short} still needed)`);
      }
      out.push(line);
    }
    out.push("");
  }

  // ---------- what's still missing ----------
  if (gaps.length) {
    out.push("STILL NEEDED");
    out.push(...gaps);
  } else if (qs.some((q) => q.type === "capacity")) {
    out.push("STILL NEEDED");
    out.push("— Nothing. Every slot is covered.");
  }

  // Trailing blanks would render as an empty paragraph in the email.
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}
