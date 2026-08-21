// Verified from the 2026 Lehi Primary Children's Hospital sacrament schedule
export const HOSPITAL_PRESETS = [
  { date: "2026-08-16", title: "Hospital Sacrament Meeting — LPCH", fast: false,
    roles: ["Pianist", "Chorister", "Bless the Sacrament (1 of 2)", "Bless the Sacrament (2 of 2)", "Pass the Sacrament (1 of 2 — only if Young Men unavailable)", "Pass the Sacrament (2 of 2 — only if Young Men unavailable)", "Musical Number"],
    contact: "Branch presidency: Peterson (385) 425-8145" },
  { date: "2026-10-11", title: "Hospital Sacrament Meeting — LPCH (Fast Sunday)", fast: true,
    roles: ["Pianist", "Chorister", "Bless the Sacrament (1 of 2)", "Bless the Sacrament (2 of 2)", "Pass the Sacrament (1 of 2 — only if Young Men unavailable)", "Pass the Sacrament (2 of 2 — only if Young Men unavailable)"],
    contact: "Branch presidency: Przybyla (801) 860-8409" },
];
export const HOSPITAL_NOTES = "Meeting begins 11:00 AM. Location: Education & Conference Center, 1st Floor (North side), Lehi Primary Children's Hospital. Arrivals: priesthood 10:40 AM; speaker/music/pianist/chorister 10:45 AM. Ward coordinators: Andrew Curtis (801) 874-4085, Carly Aston (801) 403-7039.";

export const CALLING_STAGES = ["Need", "Proposed", "Approved", "Called", "Sustained", "Set Apart", "Need to Release", "Released"];
export const CALLING_STAGE_COLOR = {
  "Need": ["var(--gold)", "var(--gold-soft)"],
  "Proposed": ["var(--sub)", "var(--line-soft)"],
  "Approved": ["var(--primary-deep)", "var(--primary-soft)"],
  "Called": ["var(--primary-deep)", "var(--primary-soft)"],
  "Sustained": ["var(--green)", "var(--green-soft)"],
  "Set Apart": ["#fff", "var(--green)"],
  "Need to Release": ["var(--gold)", "var(--gold-soft)"],
  "Released": ["var(--red)", "var(--red-soft)"],
};

// Suggested starter questions for a ministering / check-in survey
export const MINISTERING_TEMPLATE = [
  { text: "How are you doing overall?", type: "scale" },
  { text: "How are you doing spiritually?", type: "scale" },
  { text: "How are you doing physically and emotionally?", type: "scale" },
  { text: "What's something you're working on right now, or could use help with?", type: "long" },
  { text: "Which of these are weighing on you or your family right now? (choose any)", type: "multi", options: ["Employment / work", "Finances", "School / education", "Family / marriage", "Health", "Emotional / mental health", "Spiritual", "Loneliness / isolation", "Other"] },
  { text: "Is there anything the quorum or presidency can do to support you or your family?", type: "long" },
  { text: "Do you know who you're assigned to minister to?", type: "yesno" },
  { text: "When did you last connect with those you minister to, and how did it go?", type: "long" },
  { text: "What do you feel the people you minister to need most right now?", type: "long" },
  { text: "How is your ministering going?", type: "scale" },
  { text: "Do you know who ministers to you and your family?", type: "yesno" },
  { text: "Is there anything we should be aware of about the families you minister to? (needs, concerns, life events)", type: "long" },
  { text: "What's one thing you could do to be a better minister this month?", type: "long" },
  { text: "Some things are easier to talk through than to write — check the box if you'd like a conversation.", type: "multi", options: ["I'd prefer to talk about this in person"] },
  { text: "Anything else you'd like to share with the presidency?", type: "long" },
];
