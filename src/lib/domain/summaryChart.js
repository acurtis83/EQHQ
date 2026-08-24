import { fmtDate } from "./dates.js";
import {
  normalizeOptions, optionLabel, capacityState, capacityTotals, namesByOption,
} from "./forms.js";

/**
 * A form's sign-up state, laid out as a picture.
 *
 * The text summary already says all of this, and it gets skimmed: "Dessert 1
 * of 3" reads the same as "Dessert 3 of 3" when you're scrolling on a phone.
 * A bar that's a third full doesn't.
 *
 * This is the model and the arithmetic only — every position and size is
 * computed here, so the layout can be checked without a browser and the
 * component that draws it stays a straight transcription. It's also why the
 * graphic is plain SVG rectangles and text rather than HTML: it has to
 * rasterise to a PNG somebody can text to the bishop, and foreignObject
 * doesn't survive that trip.
 */

export const CHART_W = 640;

// Everything the layout needs, in one place, so a change to the type size
// can't leave the boxes behind.
export const M = {
  pad: 22,
  titleSize: 21,
  dateSize: 12.5,
  countSize: 44,
  countLabelSize: 12,
  sectionSize: 12.5,
  slotSize: 14,
  nameSize: 11.5,
  barH: 9,
  slotGap: 7,
  sectionGap: 20,
  nameLead: 14,
};

// Greys, matching the printed agenda: this gets forwarded, printed and
// screenshotted, and colour survives none of that reliably.
export const INK = "#1a1a1a";
export const SUB = "#565656";
export const FAINT = "#8a8a8a";
export const RULE = "#d9d9d9";
export const TRACK = "#e8e8e8";
export const FILL = "#3d3d3d";
export const FULL = "#1a1a1a";

/**
 * Roughly how wide a string is at a given size.
 *
 * 0.58 rather than the 0.52 the print estimator uses: this text is semibold
 * and full of em-dashes, and the first pass at 0.52 let the "still needed"
 * line run off the right edge of the image.
 */
function textW(s, size) {
  return String(s || "").length * size * 0.58;
}

/**
 * Wrap a list of names onto lines that fit the width.
 *
 * Names are joined with commas and broken at whole names — a name split
 * across two lines is unreadable and looks like two people.
 */
export function wrapNames(names, width, size) {
  const lines = [];
  let line = "";
  for (const n of names) {
    const next = line ? `${line}, ${n}` : n;
    if (line && textW(next, size) > width) {
      lines.push(line);
      line = n;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Build the whole picture: what to draw and where.
 *
 * @param {object}   form
 * @param {object[]} questions
 * @param {object[]} responses
 * @param {object}   byResponse   response_id -> question_id -> value
 * @param {string}   todayIso
 * @param {boolean}  showNames    names under each slot
 */
export function buildSummaryChart({
  form, questions, responses, byResponse, todayIso, showNames = true,
}) {
  const rows = responses || [];
  const qs = questions || [];
  const inner = CHART_W - M.pad * 2;

  const valuesFor = (qid) => rows.map((r) => byResponse?.[r.id]?.[qid]).filter((v) => v !== undefined);
  const rowsFor = (qid) => rows.map((r) => ({
    value: byResponse?.[r.id]?.[qid],
    name: form?.anonymous ? "" : (r.respondent_name || ""),
  }));

  // ---------- headcount ----------
  // A single number question is the headcount — "how many will attend". More
  // than one and there's no telling which, so it falls back to counting
  // responses, which is at least unambiguous.
  const numberQs = qs.filter((q) => q.type === "number");
  let headcount = null;
  if (numberQs.length === 1) {
    const nums = valuesFor(numberQs[0].id).map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length) {
      headcount = {
        total: nums.reduce((a, b) => a + b, 0),
        label: numberQs[0].label,
      };
    }
  }

  // ---------- sign-up slots ----------
  const sections = [];
  for (const q of qs) {
    if (q.type !== "capacity") continue;
    const opts = normalizeOptions(q.type, q.options);
    if (!opts.length) continue;

    const values = valuesFor(q.id);
    const named = namesByOption(q, rowsFor(q.id));
    const slots = opts.map((o) => {
      const label = optionLabel(o);
      const st = capacityState(o, values);
      const entry = named[label] || { names: [], anonymous: 0 };
      const nameList = [
        ...entry.names,
        ...(entry.anonymous ? [`${entry.anonymous} anonymous`] : []),
      ];
      return {
        label,
        taken: st.taken,
        limit: st.limit,
        remaining: st.remaining,
        full: st.full,
        names: nameList,
        nameLines: showNames ? wrapNames(nameList, inner - 12, M.nameSize) : [],
      };
    });

    sections.push({ label: q.label, slots, totals: capacityTotals(q, values) });
  }

  // ---------- what's still missing ----------
  const gaps = [];
  for (const s of sections) {
    for (const slot of s.slots) {
      if (slot.remaining > 0) gaps.push(`${slot.label} — ${slot.remaining} more`);
    }
  }

  // ---------- lay it out ----------
  // `y` is the current top edge; a text baseline sits roughly one font size
  // below it. Treating y as the baseline directly is what put the section
  // headings on top of the first slot in the first version of this.
  let y = M.pad;

  const titleY = y + M.titleSize;
  y += M.titleSize + 5;
  const dateY = y + M.dateSize;
  y += M.dateSize + 11;
  const headRuleY = y;
  y += 17;

  let countY = null;
  if (headcount) {
    countY = y + M.countSize * 0.78;
    // The count has a second line under it — "7 responses" — and the first
    // version forgot to leave room for it, so the section heading below
    // landed almost on top of it.
    y += M.countSize * 0.78 + 15 + M.countLabelSize + 12;
  }

  for (const s of sections) {
    s.y = y + M.sectionSize;
    y += M.sectionSize + 13;
    for (const slot of s.slots) {
      slot.y = y + M.slotSize;
      y += M.slotSize + 6;
      slot.barY = y;
      y += M.barH + 7;
      if (slot.nameLines.length) {
        slot.namesY = y + M.nameSize;
        y += slot.nameLines.length * M.nameLead + 2;
      } else {
        slot.namesY = y;
      }
      y += M.slotGap;
    }
    y += M.sectionGap - M.slotGap;
  }

  let gapsY = null;
  let gapsFirstY = null;
  let gapLines = [];
  if (gaps.length) {
    gapLines = wrapNames(gaps, inner, M.nameSize);
    gapsY = y + M.sectionSize;
    y += M.sectionSize + 10;
    gapsFirstY = y + M.nameSize;
    y += gapLines.length * M.nameLead + 12;
  }

  const footRuleY = y;
  const footY = y + 15;
  const height = Math.round(footY + 11);

  return {
    width: CHART_W,
    height,
    inner,
    title: form?.title || "Form",
    dateLine: `Sign-up update${todayIso ? ` — ${fmtDate(todayIso)}` : ""}`,
    responseCount: rows.length,
    empty: rows.length === 0,
    headcount,
    sections,
    gaps: gapLines,
    y: { titleY, dateY, headRuleY, countY, gapsY, gapsFirstY, footRuleY, footY },
  };
}

/** A filename someone can find again in their downloads. */
export function chartFilename(form, todayIso) {
  const slug = String(form?.title || "form").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "form";
  return `${slug}-signups-${todayIso || "today"}.png`;
}
