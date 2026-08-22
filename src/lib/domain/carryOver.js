// Which announcements roll forward to the next Sunday.
//
// Kept as a pure function so the rule can be tested directly. The rule is
// small but has four ways to say no, and getting one wrong means either
// announcements that never die or ones that vanish without being dealt with.

/**
 * @param {object[]} previous   last Sunday's announcement rows
 * @param {string}   toDate     the Sunday they'd be carried to (ISO)
 * @param {object}   opts
 * @param {Set<string>} opts.liveSourceIds  ids of presidency items that still
 *   exist AND are not marked done. Anything whose source is missing from this
 *   set was completed or deleted, so it stops carrying.
 * @returns {object[]} the rows worth carrying
 */
export function carryable(previous, toDate, { liveSourceIds } = {}) {
  const live = liveSourceIds || new Set();
  return (previous || []).filter((row) => {
    // Explicitly pinned to one week.
    if (row.carry_over === false) return false;

    // Nothing to say.
    if (!(row.text || "").trim()) return false;

    // Past its date. Compared against the Sunday it would appear on, not
    // today — an announcement for Saturday shouldn't ride along to a Sunday
    // after the event has already happened.
    if (row.expires_on && row.expires_on < toDate) return false;

    // Came from a presidency meeting item that's since been finished or
    // deleted. Note the check is on source_item_id being SET: an announcement
    // typed by hand has no source and carries on its own terms.
    if (row.source_item_id && !live.has(row.source_item_id)) return false;

    return true;
  });
}

/**
 * Shape a carried row for insertion under the new agenda. Keeps the provenance
 * and the expiry so the same rules apply again next week.
 */
export function carriedRow(row, agendaId, sortOrder) {
  return {
    agenda_id: agendaId,
    section: "announcements",
    text: row.text,
    source_item_id: row.source_item_id || null,
    expires_on: row.expires_on || null,
    carry_over: row.carry_over !== false,
    sort_order: sortOrder,
  };
}
