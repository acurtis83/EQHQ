// Form question types, templates, and validation — shared by the builder, the
// member-facing form, and the results view so all three agree on what a
// question means.

export const QUESTION_TYPES = [
  { type: "short", label: "Short answer", hasOptions: false },
  { type: "long", label: "Paragraph", hasOptions: false },
  { type: "choice", label: "Multiple choice (pick one)", hasOptions: true },
  { type: "checkboxes", label: "Checkboxes (pick any)", hasOptions: true },
  { type: "capacity", label: "Sign-Up Slots (limited spots)", hasOptions: true },
  { type: "scale", label: "Scale 1–5", hasOptions: false },
  { type: "yesno", label: "Yes / No", hasOptions: false },
  { type: "date", label: "Date", hasOptions: false },
  { type: "number", label: "Number", hasOptions: false },
];

export function typeMeta(type) {
  return QUESTION_TYPES.find((t) => t.type === type) || QUESTION_TYPES[0];
}

export function needsOptions(type) {
  return typeMeta(type).hasOptions;
}

// Capacity options are { label, limit }. Everything else is a plain string.
export function normalizeOptions(type, options) {
  const arr = Array.isArray(options) ? options : [];
  if (type === "capacity") {
    return arr.map((o) =>
      typeof o === "string"
        ? { label: o, limit: 1 }
        : { label: String(o?.label ?? ""), limit: Math.max(1, Number(o?.limit) || 1) }
    );
  }
  return arr.map((o) => (typeof o === "string" ? o : String(o?.label ?? "")));
}

export function optionLabel(o) {
  return typeof o === "string" ? o : String(o?.label ?? "");
}

// How many spots are left on a capacity option, given existing picks.
// picks: array of answer values already recorded for this question.
export function capacityTaken(optionLabelText, picks) {
  let n = 0;
  for (const v of picks) {
    if (Array.isArray(v)) {
      if (v.includes(optionLabelText)) n += 1;
    } else if (v === optionLabelText) {
      n += 1;
    }
  }
  return n;
}

export function capacityState(option, picks) {
  const limit = Math.max(1, Number(option?.limit) || 1);
  const taken = capacityTaken(optionLabel(option), picks);
  return { limit, taken, remaining: Math.max(0, limit - taken), full: taken >= limit };
}

export function isBlank(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/**
 * Returns { ok, errors } where errors maps question id -> message.
 * Kept out of the component so it can be tested directly.
 */
export function validateResponse(form, questions, answers, name) {
  const errors = {};

  if (!form.anonymous && !String(name || "").trim()) {
    errors._name = "Enter your name";
  }

  for (const q of questions) {
    const v = answers[q.id];
    if (q.required && isBlank(v)) {
      errors[q.id] = "This one's required";
      continue;
    }
    if (isBlank(v)) continue;

    if (q.type === "number" && isNaN(Number(v))) {
      errors[q.id] = "Enter a number";
    }
    if (q.type === "scale") {
      const n = Number(v);
      if (isNaN(n) || n < 1 || n > 5) errors[q.id] = "Pick 1 to 5";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// Carried over from the legacy app's ministering check-in, plus starters for
// the recurring assignments — temple cleaning, youth camp, the rodeo.
export const FORM_TEMPLATES = [
  {
    key: "blank",
    label: "Blank",
    form: { title: "", description: "", kind: "signup", anonymous: false },
    questions: [],
  },
  {
    key: "assignment",
    label: "Assignment Sign-Up",
    form: {
      title: "Temple Cleaning Assignment",
      description: "Pick a slot that works for you.",
      kind: "signup",
      anonymous: false,
    },
    questions: [
      {
        type: "capacity",
        label: "Which shift can you take?",
        required: true,
        options: [
          { label: "Saturday 6:00 AM", limit: 4 },
          { label: "Saturday 8:00 AM", limit: 4 },
          { label: "Saturday 10:00 AM", limit: 4 },
        ],
      },
      { type: "short", label: "Phone number", required: false, options: [] },
      { type: "long", label: "Anything we should know?", required: false, options: [] },
    ],
  },
  {
    key: "volunteer",
    label: "Volunteer Shifts",
    form: {
      title: "Volunteer Sign-Up",
      description: "Thanks for helping out.",
      kind: "signup",
      anonymous: false,
    },
    questions: [
      {
        type: "capacity",
        label: "Which shift?",
        required: true,
        options: [
          { label: "Friday evening", limit: 6 },
          { label: "Saturday morning", limit: 6 },
          { label: "Saturday afternoon", limit: 6 },
        ],
      },
      {
        type: "choice",
        label: "Can you bring a truck or trailer?",
        required: false,
        options: ["Truck", "Trailer", "Neither"],
      },
      { type: "short", label: "Phone number", required: false, options: [] },
    ],
  },
  {
    key: "ministering",
    label: "Ministering Check-In",
    form: {
      title: "Ministering Check-In",
      description: "A few questions so we know how to support you.",
      kind: "survey",
      anonymous: false,
    },
    questions: [
      { type: "scale", label: "How are you doing overall?", required: false, options: [] },
      { type: "scale", label: "How are you doing spiritually?", required: false, options: [] },
      { type: "long", label: "What's something you're working on, or could use help with?", required: false, options: [] },
      {
        type: "checkboxes",
        label: "Which of these are weighing on you or your family right now?",
        required: false,
        options: [
          "Employment / work", "Finances", "School / education", "Family / marriage",
          "Health", "Emotional / mental health", "Spiritual", "Loneliness / isolation", "Other",
        ],
      },
      { type: "yesno", label: "Do you know who you're assigned to minister to?", required: false, options: [] },
      { type: "yesno", label: "Do you know who ministers to you and your family?", required: false, options: [] },
      { type: "long", label: "Is there anything the quorum can do to support you?", required: false, options: [] },
      {
        type: "checkboxes",
        label: "Some things are easier to talk through than to write.",
        required: false,
        options: ["I'd prefer to talk about this in person"],
      },
    ],
  },
  {
    key: "feedback",
    label: "Anonymous Feedback",
    form: {
      title: "How Is the Quorum Doing?",
      description: "Answers are anonymous — no name is collected.",
      kind: "survey",
      anonymous: true,
    },
    questions: [
      { type: "scale", label: "How connected do you feel to the quorum?", required: false, options: [] },
      { type: "long", label: "What's working well?", required: false, options: [] },
      { type: "long", label: "What should we change?", required: false, options: [] },
    ],
  },
];

export function templateByKey(key) {
  return FORM_TEMPLATES.find((t) => t.key === key) || null;
}

// CSV for the results view. One row per response, one column per question.
export function responsesToCsv(form, questions, responses, answersByResponse) {
  const esc = (v) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    ...(form.anonymous ? [] : ["Name"]),
    "Submitted",
    ...questions.map((q) => q.label),
  ];

  const rows = responses.map((r) => {
    const a = answersByResponse[r.id] || {};
    return [
      ...(form.anonymous ? [] : [r.respondent_name || ""]),
      new Date(r.created_at).toLocaleString("en-US"),
      ...questions.map((q) => a[q.id]),
    ];
  });

  return [header, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

// Per-question rollup for the summary view.
export function summarize(question, values) {
  const present = values.filter((v) => !isBlank(v));
  if (question.type === "scale" || question.type === "number") {
    const nums = present.map(Number).filter((n) => !isNaN(n));
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = nums.length ? sum / nums.length : null;
    // A total and an average answer different questions. "How many will
    // attend" wants the total — it's the headcount you cook for. A 1-5 rating
    // wants the average, where a total means nothing. Both are returned and
    // the caller leads with whichever fits the question.
    return {
      kind: "number",
      count: nums.length,
      total: nums.length ? sum : null,
      average: avg == null ? null : Math.round(avg * 10) / 10,
    };
  }
  if (["choice", "checkboxes", "capacity", "yesno"].includes(question.type)) {
    const tally = {};
    for (const v of present) {
      for (const one of Array.isArray(v) ? v : [v]) {
        const k = String(one);
        tally[k] = (tally[k] || 0) + 1;
      }
    }
    return {
      kind: "tally",
      count: present.length,
      tally: Object.entries(tally).sort((a, b) => b[1] - a[1]),
    };
  }
  return { kind: "text", count: present.length, samples: present.slice(0, 20).map(String) };
}


/**
 * How full a whole sign-up question is, across every slot.
 *
 * capacityState answers this for one slot; this is the line at the top of the
 * question — 12 of 18 taken, 6 still needed — so you can tell at a glance
 * whether the assignment is covered without adding the slots up yourself.
 */
export function capacityTotals(question, values) {
  const opts = normalizeOptions(question.type, question.options);
  let needed = 0;
  let taken = 0;
  for (const o of opts) {
    const st = capacityState(o, values);
    needed += st.limit;
    // Capped per slot: three people on a two-person slot is still two filled,
    // and the overflow shouldn't make the whole question look complete.
    taken += Math.min(st.taken, st.limit);
  }
  return { needed, taken, remaining: Math.max(0, needed - taken), complete: needed > 0 && taken >= needed };
}

/**
 * Who picked what.
 *
 * Takes { value, name } pairs — one per submitted answer — and groups the
 * names under each option, so a sign-up reads as "Dessert: Cameron, Karl"
 * rather than "Dessert: 2".
 *
 * An anonymous form has no names to show. Those answers still count toward the
 * tally; they just come back as an unnamed tally rather than a list, because
 * inventing "Anonymous" as a person would be worse than saying nothing.
 */
export function namesByOption(question, rows) {
  const out = {};
  for (const r of rows || []) {
    if (isBlank(r.value)) continue;
    for (const one of Array.isArray(r.value) ? r.value : [r.value]) {
      const k = String(one);
      (out[k] ||= { names: [], anonymous: 0 });
      const name = (r.name || "").trim();
      if (name) out[k].names.push(name);
      else out[k].anonymous += 1;
    }
  }
  // Stable order so the list doesn't reshuffle between renders.
  for (const k of Object.keys(out)) out[k].names.sort((a, b) => a.localeCompare(b));
  return out;
}
