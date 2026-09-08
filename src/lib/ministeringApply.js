import { supabase } from "./supabase";
import { matchCompanions } from "./domain/ministeringImport";

/**
 * Write an approved ministering import.
 *
 * Nothing here decides anything — the districts, companionships and household
 * names were worked out by the pure code in domain/ministeringPdf.js and
 * reviewed on screen. This walks that and does the writes.
 *
 * Three rules it keeps:
 *
 *  - Nothing is deleted. A family the ward no longer ministers to is
 *    unassigned and kept, along with every contact logged against them.
 *    Ministering assignments are reorganised every year or two; the record of
 *    who visited whom shouldn't be.
 *  - A household is matched by name, so re-importing next year moves families
 *    between companionships rather than creating a second copy of each.
 *  - District leaders are left alone. LCR has them all as "Unassigned" and
 *    the presidency sets them in the app, so an import must never overwrite
 *    that with nothing.
 */
export async function applyImport({ districts, members }) {
  const done = { districts: 0, companionships: 0, households: 0, unassigned: 0 };

  const existingDistricts = await supabase
    .from("ministering_districts").select("id,name,sort_order");
  if (existingDistricts.error) return { error: existingDistricts.error.message };

  const byName = new Map(
    (existingDistricts.data || []).map((d) => [d.name.trim().toLowerCase(), d])
  );
  let order = Math.max(0, ...(existingDistricts.data || []).map((d) => d.sort_order || 0));

  // Every household the import mentions, so anything left over can be
  // unassigned at the end.
  const claimed = new Set();

  for (const district of districts) {
    let row = byName.get(district.name.trim().toLowerCase());
    if (!row) {
      order += 10;
      // No leader_id: LCR doesn't know who leads a district, and writing null
      // over one the presidency has set would undo their work every import.
      const made = await supabase.from("ministering_districts")
        .insert({ name: district.name, sort_order: order }).select().single();
      if (made.error) return { error: made.error.message };
      row = made.data;
      byName.set(district.name.trim().toLowerCase(), row);
      done.districts += 1;
    }

    for (const group of district.groups) {
      const matched = matchCompanions(group.companions, members);
      const ids = matched.map((c) => c.member?.id).filter(Boolean);

      // The table holds two companions. A threesome keeps the first two and
      // the third is named in the notes rather than dropped silently — it
      // happens, and losing a brother off an assignment is the kind of thing
      // nobody notices until he's the one who wasn't asked.
      const extra = matched.slice(2).map((c) => c.name);
      const notes = extra.length ? `Also: ${extra.join(", ")}` : null;

      const comp = await supabase.from("ministering_companionships").insert({
        district_id: row.id,
        companion_a_id: ids[0] || null,
        companion_b_id: ids[1] || null,
        notes,
      }).select().single();
      if (comp.error) return { error: comp.error.message };
      done.companionships += 1;

      for (const house of group.households) {
        claimed.add(house.name.trim().toLowerCase());

        const found = await supabase.from("ministering_households")
          .select("id").ilike("name", house.name).maybeSingle();
        if (found.error) return { error: found.error.message };

        if (found.data) {
          // Address and phone are refreshed from LCR, which is where they're
          // maintained; anything typed into the app's own notes is left alone.
          const patch = { companionship_id: comp.data.id, active: true };
          if (house.address) patch.address = house.address;
          if (house.phone) patch.phone = house.phone;
          const up = await supabase.from("ministering_households")
            .update(patch).eq("id", found.data.id);
          if (up.error) return { error: up.error.message };
        } else {
          const ins = await supabase.from("ministering_households").insert({
            companionship_id: comp.data.id,
            name: house.name,
            address: house.address || null,
            phone: house.phone || null,
          });
          if (ins.error) return { error: ins.error.message };
        }
        done.households += 1;
      }
    }
  }

  // Anything the import didn't mention loses its companionship but keeps its
  // row, its address and its history.
  const all = await supabase.from("ministering_households")
    .select("id,name").not("companionship_id", "is", null);
  if (!all.error) {
    const orphans = (all.data || [])
      .filter((h) => !claimed.has(String(h.name || "").trim().toLowerCase()));
    if (orphans.length) {
      const off = await supabase.from("ministering_households")
        .update({ companionship_id: null }).in("id", orphans.map((h) => h.id));
      if (off.error) return { error: off.error.message };
      done.unassigned = orphans.length;
    }
  }

  return { done };
}

/**
 * Clear the companionships an import is about to replace.
 *
 * Called first so a second import doesn't stack a duplicate set alongside the
 * first. The households survive — they're a separate table and are re-pointed
 * by name — and so does every logged contact, which is why the contact log
 * hangs off the household rather than off the companionship.
 */
export async function clearCompanionships(districtNames = []) {
  const ds = await supabase.from("ministering_districts").select("id,name");
  if (ds.error) return { error: ds.error.message };
  const wanted = new Set(districtNames.map((n) => n.trim().toLowerCase()));
  const ids = (ds.data || [])
    .filter((d) => wanted.has(String(d.name || "").trim().toLowerCase()))
    .map((d) => d.id);
  if (!ids.length) return {};
  const del = await supabase.from("ministering_companionships")
    .delete().in("district_id", ids);
  return del.error ? { error: del.error.message } : {};
}
