import { supabase } from "./supabase";
import { moveAnnouncement, orderWrites } from "./domain/announcements";

/**
 * Move an announcement and write the new order.
 *
 * Both presidency screens edit the same rows, so the write lives here rather
 * than being typed out twice. The rule itself is pure and next door in
 * domain/announcements.js; this is only the part that talks to the database.
 *
 * Every row whose position changed gets its sort_order set explicitly, rather
 * than swapping two values. Agendas accumulate crooked sort_orders — a carried
 * batch starts numbering at the count of what was already there, and deleting
 * a row leaves a hole — and swapping does nothing at all when two rows share
 * a number, which looks exactly like the button being broken.
 *
 * @returns {string} an error message, or "" when it worked
 */
export async function moveAndSave(rows, id, delta) {
  const next = moveAnnouncement(rows, id, delta);
  const writes = orderWrites(next);
  if (!writes.length) return "";

  // One statement per row. This is a handful of rows on a Sunday, and an
  // upsert would need every not-null column of agenda_items carried along
  // just to renumber them — which is how a reorder ends up wiping the text.
  for (const w of writes) {
    const { error } = await supabase
      .from("agenda_items").update({ sort_order: w.sort_order }).eq("id", w.id);
    if (error) return error.message;
  }
  return "";
}
