// One-time importer: legacy EQ Planner backup JSON -> new normalized tables.
//
// The old app stored everything in a single JSON document. Settings had a
// "Download backup" button; that file is what this reads.
//
// Safe to run more than once only if you clear the tables first — it inserts,
// it does not reconcile. dryRun lets you see the counts before committing.

import { supabase } from "./supabase";
import { bandForAge, lastNameOf, normalizeName } from "./domain/roster";

function s(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}
function dateOrNull(v) {
  const t = s(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export function summarizeLegacy(raw) {
  const d = raw || {};
  return {
    roster: (d.roster || []).length,
    teaching: (d.teaching || []).length,
    presAgendas: (d.presAgendas || []).length,
    sundayAgendas: (d.sundayAgendas || []).length,
    callings: (d.callings || []).length,
    districts: (d.ministering?.districts || []).length,
    running: Object.values(d.planning || {}).reduce(
      (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
      0
    ),
  };
}

export async function importLegacy(raw, { dryRun = false } = {}) {
  const d = raw || {};
  const report = { inserted: {}, errors: [] };
  const idMap = new Map(); // legacy member id -> new uuid

  const step = async (label, rows, table, afterInsert) => {
    if (!rows.length) {
      report.inserted[label] = 0;
      return [];
    }
    if (dryRun) {
      report.inserted[label] = rows.length;
      return [];
    }
    const { data, error } = await supabase.from(table).insert(rows).select();
    if (error) {
      report.errors.push(`${label}: ${error.message}`);
      report.inserted[label] = 0;
      return [];
    }
    report.inserted[label] = data.length;
    afterInsert?.(data);
    return data;
  };

  // ---------- roster ----------
  const legacyRoster = (d.roster || []).filter((m) => s(m.name));
  const rosterRows = legacyRoster.map((m) => ({
    name: normalizeName(s(m.name)),
    last_name: s(m.last) || lastNameOf(s(m.name)),
    age: Number.isFinite(m.age) ? m.age : null,
    birth_date: s(m.birthDate) || null,
    phone: s(m.phone) || null,
    email: s(m.email) || null,
    office: s(m.office) || null,
    band: s(m.band) || bandForAge(m.age),
    calling: s(m.calling) || null,
    active: m.active !== false,
    notes: s(m.notes) || null,
  }));

  await step("members", rosterRows, "members", (inserted) => {
    // Map by position — insert order matches input order.
    legacyRoster.forEach((old, i) => {
      if (inserted[i]) idMap.set(old.id, inserted[i].id);
    });
  });

  const memberIdFor = (legacyId) => idMap.get(legacyId) || null;
  const memberIdByName = (name) => {
    const want = normalizeName(s(name)).toLowerCase();
    if (!want) return null;
    for (const [legacyId, newId] of idMap.entries()) {
      const old = legacyRoster.find((m) => m.id === legacyId);
      if (old && normalizeName(s(old.name)).toLowerCase() === want) return newId;
    }
    return null;
  };

  // ---------- teaching ----------
  const teachingRows = (d.teaching || [])
    .filter((t) => dateOrNull(t.date))
    .map((t) => ({
      date: dateOrNull(t.date),
      teacher_id: memberIdFor(t.teacherId) || memberIdByName(t.teacher),
      teacher_name: s(t.teacher) || null,
      topic: s(t.topic) || null,
      talk_title: s(t.talkTitle) || null,
      speaker: s(t.speaker) || null,
      talk_link: s(t.talkLink) || null,
      notes: s(t.notes) || null,
      no_lesson_reason: s(t.noLesson || t.noLessonReason) || null,
    }));
  await step("teaching_assignments", teachingRows, "teaching_assignments");

  // ---------- running list ----------
  const BUCKETS = ["topics", "actions", "watch", "moves", "service", "missionary"];
  const runningRows = [];
  for (const bucket of BUCKETS) {
    (d.planning?.[bucket] || []).forEach((it, i) => {
      const text = s(it.text || it.title || it.name);
      if (!text) return;
      runningRows.push({
        bucket,
        text,
        who: s(it.who) || null,
        notes: s(it.notes) || null,
        due_date: dateOrNull(it.date),
        done: !!it.done,
        meta: {
          ...(it.type ? { type: it.type } : {}),
          ...(it.location ? { location: it.location } : {}),
          ...(it.time ? { time: it.time } : {}),
        },
        sort_order: i,
      });
    });
  }
  await step("running_items", runningRows, "running_items");

  // ---------- agendas ----------
  for (const [kind, list] of [
    ["presidency", d.presAgendas || []],
    ["sunday", d.sundayAgendas || []],
  ]) {
    for (const a of list) {
      const agendaRow = {
        kind,
        meeting_date: dateOrNull(a.date),
        meeting_time: s(a.time) || null,
        location: s(a.location) || null,
        title: s(a.title) || null,
        notes: s(a.notes) || null,
      };
      if (dryRun) {
        report.inserted[`agendas_${kind}`] =
          (report.inserted[`agendas_${kind}`] || 0) + 1;
        continue;
      }
      const { data: ag, error } = await supabase
        .from("agendas")
        .insert(agendaRow)
        .select()
        .single();
      if (error) {
        report.errors.push(`agenda (${kind}): ${error.message}`);
        continue;
      }
      report.inserted[`agendas_${kind}`] =
        (report.inserted[`agendas_${kind}`] || 0) + 1;

      const items = (a.items || []).map((it, i) => ({
        agenda_id: ag.id,
        section: s(it.section) || "items",
        text: s(it.text),
        who: s(it.who) || null,
        notes: s(it.notes) || null,
        due_date: dateOrNull(it.date),
        done: !!it.done,
        category: s(it.cat) || null,
        sort_order: i,
      }));
      if (items.length) {
        const { error: e2 } = await supabase.from("agenda_items").insert(items);
        if (e2) report.errors.push(`agenda items: ${e2.message}`);
        else
          report.inserted.agenda_items =
            (report.inserted.agenda_items || 0) + items.length;
      }
    }
  }

  // ---------- callings ----------
  const callingRows = (d.callings || [])
    .filter((c) => s(c.position || c.title))
    .map((c, i) => ({
      position: s(c.position || c.title),
      member_id: memberIdFor(c.memberId) || memberIdByName(c.name || c.candidate),
      candidate_name: s(c.name || c.candidate) || null,
      stage: s(c.stage) || "Need",
      group_name: s(c.group || c.groupName) || null,
      notes: s(c.notes) || null,
      sort_order: i,
    }));
  await step("callings", callingRows, "callings");

  // ---------- ministering districts ----------
  const legacyDistricts = d.ministering?.districts || [];
  const districtRows = legacyDistricts
    .filter((x) => s(x.name))
    .map((x, i) => ({
      name: s(x.name),
      leader_id: memberIdFor(x.leaderId) || memberIdByName(x.leader),
      sort_order: i,
    }));
  const insertedDistricts = await step(
    "ministering_districts",
    districtRows,
    "ministering_districts"
  );

  // ---------- companionships ----------
  if (!dryRun && insertedDistricts.length) {
    const compRows = [];
    legacyDistricts.forEach((dist, di) => {
      const newDistrict = insertedDistricts[di];
      if (!newDistrict) return;
      (dist.companionships || dist.comps || []).forEach((c) => {
        compRows.push({
          district_id: newDistrict.id,
          companion_a_id: memberIdFor(c.aId) || memberIdByName(c.a),
          companion_b_id: memberIdFor(c.bId) || memberIdByName(c.b),
          households: (c.households || c.families || []).map(s).filter(Boolean),
          notes: s(c.notes) || null,
        });
      });
    });
    await step(
      "ministering_companionships",
      compRows,
      "ministering_companionships"
    );
  }

  // ---------- interviews ----------
  const interviewRows = [];
  const interviews = d.ministering?.interviews || {};
  for (const [quarter, byMember] of Object.entries(interviews)) {
    for (const [legacyMemberId, rec] of Object.entries(byMember || {})) {
      const mid = memberIdFor(legacyMemberId);
      if (!mid) continue;
      interviewRows.push({
        member_id: mid,
        quarter,
        held_on: dateOrNull(rec?.date),
        held_by: s(rec?.by) || null,
        notes: s(rec?.notes) || null,
      });
    }
  }
  await step("ministering_interviews", interviewRows, "ministering_interviews");

  return report;
}
