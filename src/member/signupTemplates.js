// One-tap starting points for a sign-up. These are just seeds — every slot is
// editable after applying, and applying adds to whatever is already there.

export const SIGNUP_TEMPLATES = [
  {
    key: "bbq",
    label: "BBQ",
    slots: [
      { label: "Buns", quantity_needed: 2 },
      { label: "Drinks", quantity_needed: 3 },
      { label: "Side dish", quantity_needed: 4 },
      { label: "Dessert", quantity_needed: 3 },
      { label: "Camp chairs", quantity_needed: 4 },
    ],
  },
  {
    key: "temple",
    label: "Temple Trip",
    slots: [
      { label: "Driver", quantity_needed: 3 },
      { label: "Riding along", quantity_needed: 8 },
    ],
  },
  {
    key: "service",
    label: "Service Project",
    slots: [
      { label: "Truck", quantity_needed: 2 },
      { label: "Trailer", quantity_needed: 1 },
      { label: "Tools", quantity_needed: 3 },
      { label: "Helping hands", quantity_needed: 8 },
    ],
  },
  {
    key: "meal",
    label: "Meal Train",
    slots: [
      { label: "Main dish", quantity_needed: 3 },
      { label: "Sides", quantity_needed: 3 },
      { label: "Dessert", quantity_needed: 2 },
    ],
  },
];

export function templateByKey(key) {
  return SIGNUP_TEMPLATES.find((t) => t.key === key) || null;
}

// A slot is full once claims meet the number needed.
export function slotStatus(slot, claims) {
  const taken = claims.filter((c) => c.slot_id === slot.id).length;
  const needed = Math.max(1, slot.quantity_needed || 1);
  return { taken, needed, remaining: Math.max(0, needed - taken), full: taken >= needed };
}

export function signupSummary(slots, claims) {
  if (!slots.length) return null;
  let needed = 0;
  let taken = 0;
  for (const s of slots) {
    const st = slotStatus(s, claims);
    needed += st.needed;
    taken += Math.min(st.taken, st.needed);
  }
  return { needed, taken, remaining: Math.max(0, needed - taken), complete: taken >= needed };
}
