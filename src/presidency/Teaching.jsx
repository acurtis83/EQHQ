import { useCallback, useEffect, useMemo, useState } from "react";
import { Wand2, X, ExternalLink, CalendarOff, Search, Repeat, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Area, Select, Chip, Empty } from "../components/ui";
import { fmtDate, toIso, isoParts, scheduleBetween, NO_LESSON } from "../lib/domain/dates";
import { GC_TALKS } from "../lib/domain/talks";
import {
  SLOTS, slotLabel, rotationFromRows, teacherFor, pendingRotation, memberFor,
  emptySlots, assignmentFields,
} from "../lib/domain/teachingRotation";

// Prefer the real direct link. The search URL is only a fallback for talks
// typed in by hand, where we have a title but no link.
export function talkUrl(row) {
  if (!row) return "";
  if (row.talk_link) return row.talk_link;
  const title = (row.talk_title || row.topic || "").trim();
  if (!title) return "";
  const surname = (row.speaker || "").trim().split(/\s+/).pop() || "";
  const q = `"${title}"${surname ? ` ${surname}` : ""}`;
  return `https://www.churchofjesuschrist.org/search?lang=eng&query=${encodeURIComponent(q)}&facet=general-conference`;
}

const MONTHS_AHEAD = 6;

export default function Teaching() {
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [talks, setTalks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const [hidePast, setHidePast] = useState(true);
  const [toast, setToast] = useState("");
  // The standing arrangement: who teaches on the 1st, 2nd, 3rd, 4th Sunday.
  // A suggestion for Sundays nobody has answered for — never a substitute for
  // an assignment, because the email and the feed read assignments.
  const [rotation, setRotation] = useState({});
  const [applying, setApplying] = useState(false);
  // Set when the rotation table isn't there yet. Swallowing this made a
  // database that hadn't run the migration look exactly like a rotation
  // nobody had filled in — so the card offered an Edit button that then
  // failed on save, which is the worst of both.
  const [rotationMissing, setRotationMissing] = useState(false);
  // Off by default: the safe Apply fills gaps and can't undo a decision.
  // Turned on when the rotation itself has changed and the schedule should
  // move to it.
  const [replaceTeachers, setReplaceTeachers] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  /**
   * Write one slot of the rotation.
   *
   * Upsert, because a slot has no row until somebody fills it in — an update
   * matching nothing succeeds silently, which looks exactly like saving and
   * then losing it. Clearing deletes the row rather than storing "", so an
   * empty slot is one state and not two.
   */
  const saveSlot = async (slot, name) => {
    const next = { ...rotation };
    if (name) next[slot] = name; else delete next[slot];
    setRotation(next);

    const { error } = name
      ? await supabase.from("teaching_rotation")
          .upsert({ slot, name, updated_at: new Date().toISOString() }, { onConflict: "slot" })
      : await supabase.from("teaching_rotation").delete().eq("slot", slot);

    if (error) {
      setErr(/does not exist|schema cache/i.test(error.message)
        ? "The database needs updating before this can be saved — run supabase/catch-up.sql."
        : error.message);
      return;
    }
    setErr("");
  };

  const load = useCallback(async () => {
    const [t, m, x, k, rot] = await Promise.all([
      supabase.from("teaching_assignments").select("*").order("date", { ascending: true }),
      supabase.from("members").select("id,name,active").order("name"),
      supabase.from("calendar_exceptions").select("*"),
      supabase.from("talks").select("*").order("year", { ascending: false }).order("month", { ascending: false }),
      // A database that hasn't run the migration behaves like an empty
      // rotation — the screen works exactly as it did before this existed.
      supabase.from("teaching_rotation").select("slot,name"),
    ]);
    if (rot.error) {
      setRotationMissing(/does not exist|schema cache/i.test(rot.error.message));
    } else {
      setRotationMissing(false);
      setRotation(rotationFromRows(rot.data || []));
    }
    if (t.error) setErr(t.error.message);
    else setRows(t.data || []);
    if (!m.error) setMembers(m.data || []);
    if (!x.error) setExceptions(x.data || []);
    // Imported talks carry real Gospel Library URLs; the bundled April 2026
    // list is the fallback until the first import runs.
    setTalks(
      !k.error && k.data?.length
        ? k.data
        : GC_TALKS.map((g) => ({ ...g, slug: g.title }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stakeConf = useMemo(() => new Set(exceptions.map((e) => e.date)), [exceptions]);
  const byDate = useMemo(() => {
    const map = {};
    for (const r of rows) map[r.date] = r;
    return map;
  }, [rows]);

  const sundays = useMemo(() => {
    const today = new Date();
    const start = toIso(new Date(today.getFullYear(), today.getMonth(), 1));
    const end = toIso(new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD, 0));
    const all = scheduleBetween(start, end, stakeConf);
    const todayIso = toIso(today);
    return hidePast ? all.filter((s) => s.date >= todayIso) : all;
  }, [stakeConf, hidePast]);

  const saveAssignment = async (date, fields) => {
    const existing = byDate[date];
    const res = existing
      ? await supabase.from("teaching_assignments").update(fields).eq("id", existing.id)
      : await supabase.from("teaching_assignments").insert({ date, ...fields });
    if (res.error) setErr(res.error.message);
    else { setEditing(null); load(); }
  };

  const clearAssignment = async (date) => {
    const existing = byDate[date];
    if (!existing) { setEditing(null); return; }
    await supabase.from("teaching_assignments").delete().eq("id", existing.id);
    setEditing(null);
    load();
  };

  const toggleStakeConf = async (date) => {
    if (stakeConf.has(date)) {
      await supabase.from("calendar_exceptions").delete().eq("date", date);
      flash("Stake conference removed");
    } else {
      await supabase.from("calendar_exceptions").insert({ date, kind: "Stake Conference" });
      flash("Marked as stake conference");
    }
    setEditing(null);
    load();
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading schedule…</div>;
  }

  const teachable = sundays.filter((s) => s.teaches);
  const unassigned = teachable.filter((s) => !byDate[s.date]?.teacher_name).length;
  // Only Sundays with a suggestion and no teacher. Applying must never
  // overwrite a decision somebody already made, and a button reading
  // "Apply rotation to 5" has to mean five.
  const pending = pendingRotation(teachable, byDate, rotation, { replace: replaceTeachers });

  /**
   * Turn every suggestion into a real assignment.
   *
   * A slot naming somebody on the roster carries their id through, so an
   * applied Sunday links up the same way a hand-made one does. A slot holding
   * a standing arrangement — "Invite/Presidency" — carries the text alone,
   * which is exactly what a person would have typed.
   */
  const applyRotation = async () => {
    if (!pending.length) return;
    setApplying(true);
    let error = null;
    for (const p of pending) {
      if (error) break;
      // Only the teacher. An update patches the columns it's given, so the
      // talk, topic, speaker, link and notes on that Sunday survive a replace
      // untouched — which is the whole reason this is safe to offer.
      const fields = assignmentFields(p.name, memberFor(p.name, members));
      const existing = byDate[p.date];
      ({ error } = existing
        ? await supabase.from("teaching_assignments").update(fields).eq("id", existing.id)
        : await supabase.from("teaching_assignments").insert({ date: p.date, ...fields }));
    }
    setApplying(false);
    if (error) { setErr(error.message); return; }
    const changed = pending.filter((p) => p.was).length;
    flash(
      `Assigned ${pending.length} Sunday${pending.length === 1 ? "" : "s"} from the rotation` +
      (changed ? ` — ${changed} teacher${changed === 1 ? "" : "s"} replaced, talks kept.` : ".")
    );
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20.5, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
            Teaching Schedule
          </div>
          <div style={{ fontSize: 14.5, color: T.sub, marginTop: 3 }}>
            {teachable.length} teaching Sunday{teachable.length === 1 ? "" : "s"} ahead
            {unassigned > 0 ? ` · ${unassigned} unassigned` : " · all assigned"}
          </div>
        </div>
        <Btn kind="primary" style={{ marginLeft: "auto", flex: "0 0 auto" }} onClick={() => setGenOpen(true)}>
          <Wand2 size={15} />Generate
        </Btn>
      </div>

      <RotationCard
        rotation={rotation}
        members={members}
        onSet={saveSlot}
        pending={pending.length}
        applying={applying}
        onApply={applyRotation}
        missing={rotationMissing}
        assignedAhead={teachable.length - unassigned}
        teachableAhead={teachable.length}
        replace={replaceTeachers}
        onReplaceChange={setReplaceTeachers}
        canReplace={pendingRotation(teachable, byDate, rotation, { replace: true }).length}
        replacing={pending.filter((p) => p.was).length}
      />

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>
          {err}
        </div>
      )}
      {toast && (
        <div style={{ ...card, background: T.greenSoft, borderColor: T.green, color: T.green, marginBottom: 12, fontSize: 14.5, padding: "10px 14px" }}>
          {toast}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.sub, fontWeight: 600, marginBottom: 12 }}>
        <input type="checkbox" checked={hidePast} onChange={(e) => setHidePast(e.target.checked)} />
        Hide past Sundays
      </label>

      {!sundays.length ? (
        <Empty title="No Sundays in Range" hint="Try unchecking “Hide past Sundays”." />
      ) : (
        <div className="eq-cols-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sundays.map((s) => (
            <SundayCard
              key={s.date}
              sunday={s}
              row={byDate[s.date]}
              rotation={rotation}
              onOpen={() => setEditing(s)}
            />
          ))}
        </div>
      )}

      {editing && (
        <AssignSheet
          sunday={editing}
          row={byDate[editing.date]}
          members={members}
          talks={talks}
          rotation={rotation}
          isStakeConf={stakeConf.has(editing.date)}
          onClose={() => setEditing(null)}
          onSave={(fields) => saveAssignment(editing.date, fields)}
          onClear={() => clearAssignment(editing.date)}
          onToggleStakeConf={() => toggleStakeConf(editing.date)}
        />
      )}

      {genOpen && (
        <GenerateSheet
          members={members}
          sundays={teachable}
          existing={byDate}
          onClose={() => setGenOpen(false)}
          onDone={(n) => { setGenOpen(false); load(); flash(`Assigned ${n} Sunday${n === 1 ? "" : "s"}`); }}
        />
      )}
    </div>
  );
}

/**
 * The standing arrangement: who teaches on which Sunday of the month.
 *
 * Each slot takes a name from the roster or anything typed. "Invite/
 * Presidency" is a real answer and isn't a person, so a dropdown alone would
 * refuse the most common slot on the list.
 *
 * Sits above the schedule rather than in Settings — unlike the conducting
 * rotation, this one is read *while* looking at the Sundays it fills in, and
 * the Apply button only makes sense next to what it's applying to.
 */
function RotationCard({ rotation, members, onSet, pending, applying, onApply, missing, assignedAhead, teachableAhead, replace, onReplaceChange, canReplace, replacing }) {
  const [open, setOpen] = useState(false);
  const blank = emptySlots(rotation);
  const active = members.filter((m) => m.active !== false);

  const summary = SLOTS
    .map((n) => rotation[n])
    .filter(Boolean)
    .join(" · ");
  const anySet = blank < SLOTS.length;

  /**
   * Why there's no Apply button.
   *
   * There are three reasons it can be absent and they need different actions,
   * so an unexplained gap where a button should be is the one thing this card
   * must not do. Returns null when the button *is* showing.
   */
  const noApplyBecause = () => {
    if (pending > 0) return null;
    if (missing) {
      return "The database needs updating before the rotation can be saved — run supabase/catch-up.sql, then reload.";
    }
    if (!anySet) return "Set a teacher for a Sunday above and this will offer to fill the schedule in.";
    if (teachableAhead === 0) return "No teaching Sundays in range — try unchecking “Hide past Sundays”.";
    if (assignedAhead === teachableAhead) {
      return canReplace
        ? `Every one of the ${teachableAhead} teaching Sundays ahead already has a teacher. Tick “replace teachers already assigned” to move them onto the rotation — the talks stay as they are.`
        : `Every one of the ${teachableAhead} teaching Sundays ahead already has the teacher the rotation names.`;
    }
    return "The Sundays without a teacher fall on slots nobody is set for.";
  };
  const why = noApplyBecause();

  return (
    <div style={{ ...card, padding: 13, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Repeat size={15} style={{ color: T.sub, flex: "0 0 auto" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>Rotation</div>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 1 }}>
            {summary || "Nobody set — a default teacher for each Sunday of the month."}
          </div>
        </div>
        <Btn size="sm" kind="plain" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Done" : "Edit"}
        </Btn>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
          {SLOTS.map((n) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{
                flex: "0 0 92px", fontSize: 14.5, fontWeight: 600,
                color: rotation[n] ? T.ink : T.faint,
              }}>
                {slotLabel(n)}
              </span>
              <Input
                value={rotation[n] || ""}
                onChange={(v) => onSet(n, v.trim())}
                placeholder="Nobody yet"
                list={`rotation-names-${n}`}
                aria-label={`Teacher on the ${slotLabel(n)}`}
                style={{ flex: 1, minWidth: 140 }}
              />
              {/* A datalist rather than a select: it suggests the roster while
                  still accepting "Invite/Presidency", which no dropdown of
                  members could ever offer. */}
              <datalist id={`rotation-names-${n}`}>
                {active.map((m) => <option key={m.id} value={m.name} />)}
                <option value="Invite/Presidency" />
              </datalist>
            </div>
          ))}
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.55, marginTop: 2 }}>
            A 5th Sunday is bishopric-directed, so it has no slot. Type any name
            or leave a slot empty.
          </div>
        </div>
      )}

      {(canReplace > 0 || pending > 0) && (
        <div style={{
          marginTop: 11, paddingTop: 11, borderTop: `1px solid ${T.lineSoft}`,
        }}>
          {/* Off by default. Filling gaps can't undo anything; replacing can,
              so it's a deliberate tick rather than a second button somebody
              presses by accident. */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            fontSize: 13.5, color: T.sub, lineHeight: 1.5, cursor: "pointer",
            marginBottom: 9,
          }}>
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => onReplaceChange(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Replace teachers already assigned
              <span style={{ color: T.faint }}>
                {" — only the teacher changes; the talk, topic and notes stay."}
              </span>
            </span>
          </label>

          {/* No button when there's nothing to press. A greyed-out
              "Apply to 0" reads as broken rather than as finished. */}
          {pending > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, color: T.sub, flex: 1, minWidth: 140 }}>
                {replacing > 0
                  ? `${pending} Sunday${pending === 1 ? "" : "s"} to set, ${replacing} of them replacing somebody.`
                  : `${pending} Sunday${pending === 1 ? "" : "s"} ahead ${pending === 1 ? "matches" : "match"} the rotation and ${pending === 1 ? "has" : "have"} nobody assigned.`}
              </span>
              <Btn size="sm" kind="primary" onClick={onApply} disabled={applying}>
                <Check size={14} />
                {applying
                  ? "Assigning…"
                  : replacing > 0
                    ? `Apply to ${pending}, replacing ${replacing}`
                    : `Apply rotation to ${pending}`}
              </Btn>
            </div>
          )}
        </div>
      )}

      {why && (
        <div data-no-apply-why style={{
          fontSize: 13, color: missing ? T.gold : T.faint,
          marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.lineSoft}`,
          lineHeight: 1.55,
        }}>
          {why}
        </div>
      )}

      {blank > 0 && !open && !missing && (
        <div style={{ fontSize: 13, color: T.faint, marginTop: 8 }}>
          {blank} of {SLOTS.length} slots still open.
        </div>
      )}
    </div>
  );
}

function SundayCard({ sunday, row, rotation, onOpen }) {
  const teaches = sunday.teaches;
  const url = talkUrl(row);
  const who = teacherFor(row, rotation, sunday.date);

  let accent = T.line;
  if (teaches) accent = row?.teacher_name ? T.green : T.gold;
  else if (sunday.reason === NO_LESSON.STAKE_CONF) accent = T.primary;

  return (
    <div style={{ ...card, padding: 13, borderLeft: `5px solid ${accent}` }}>
      <button
        onClick={onOpen}
        style={{ background: "none", border: "none", padding: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{fmtDate(sunday.date)}</span>
          {!teaches && (
            <Chip
              color={sunday.reason === NO_LESSON.STAKE_CONF ? T.primaryDeep : T.sub}
              bg={sunday.reason === NO_LESSON.STAKE_CONF ? T.primarySoft : T.inset}
            >
              {sunday.reason}
            </Chip>
          )}
          {teaches && !row?.teacher_name && <Chip color={T.gold} bg={T.goldSoft}>Unassigned</Chip>}
        </div>

        {teaches && row?.teacher_name && (
          <div style={{ fontSize: 14.5, color: T.sub, marginTop: 5 }}>
            <strong style={{ color: T.ink }}>{row.teacher_name}</strong>
            {row.talk_title ? ` — ${row.talk_title}` : row.topic ? ` — ${row.topic}` : ""}
            {row.speaker ? ` (${row.speaker})` : ""}
          </div>
        )}

        {/* The rotation's answer for a Sunday nobody has answered for. Greyed
            and italic, and labelled: it has to be obviously a suggestion, or
            the schedule looks assigned when it isn't and nobody gets asked. */}
        {teaches && who.from === "rotation" && (
          <div style={{ fontSize: 14.5, color: T.faint, marginTop: 5, fontStyle: "italic" }}>
            {who.name}
            <span style={{ fontStyle: "normal", fontSize: 13 }}>
              {` — suggested, ${slotLabel(who.slot).toLowerCase()}`}
            </span>
          </div>
        )}
        {row?.notes && (
          <div style={{ fontSize: 14, color: T.faint, marginTop: 4, lineHeight: 1.5 }}>{row.notes}</div>
        )}
      </button>

      {url && (
        <a
          href={url} target="_blank" rel="noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
            fontSize: 14, fontWeight: 700, color: T.primaryDeep, textDecoration: "none",
          }}
        >
          <ExternalLink size={13} />Open talk in Gospel Library
        </a>
      )}
    </div>
  );
}

function AssignSheet({ sunday, row, members, talks, rotation, isStakeConf, onClose, onSave, onClear, onToggleStakeConf }) {
  // Opens on the rotation's answer when nobody has been assigned, so the
  // common case is "open it, glance at the name, save". A slot naming somebody
  // on the roster brings their id with it; "Invite/Presidency" brings none,
  // which is right — it isn't a person.
  const suggested = teacherFor(row, rotation, sunday.date);
  const fromRotation = suggested.from === "rotation";
  const [teacherName, setTeacherName] = useState(suggested.name);
  const [teacherId, setTeacherId] = useState(
    row?.teacher_id || (fromRotation ? memberFor(suggested.name, members)?.id || "" : "")
  );
  const [topic, setTopic] = useState(row?.topic || "");
  const [talkTitle, setTalkTitle] = useState(row?.talk_title || "");
  const [speaker, setSpeaker] = useState(row?.speaker || "");
  const [talkLink, setTalkLink] = useState(row?.talk_link || "");
  const [notes, setNotes] = useState(row?.notes || "");
  const [talkQuery, setTalkQuery] = useState("");

  const matches = useMemo(() => {
    const q = talkQuery.trim().toLowerCase();
    if (!q) return [];
    return (talks || []).filter(
      (t) => t.title.toLowerCase().includes(q) || (t.speaker || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [talkQuery, talks]);

  const pickTeacher = (id) => {
    setTeacherId(id);
    setTeacherName(members.find((m) => m.id === id)?.name || "");
  };

  return (
    <Sheet title={fmtDate(sunday.date)} onClose={onClose}>
      {!sunday.teaches ? (
        <>
          <div style={{ ...card, background: T.inset, padding: 13 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{sunday.reason}</div>
            <div style={{ fontSize: 14, color: T.sub, marginTop: 5, lineHeight: 1.6 }}>
              {sunday.reason === NO_LESSON.FIFTH_SUNDAY
                ? "The quorum still meets, but the bishopric directs it — no teacher to assign."
                : "No quorum meeting this Sunday."}
            </div>
          </div>
          {sunday.reason !== NO_LESSON.GENERAL_CONF && (
            <Btn kind={isStakeConf ? "ghost" : "soft"} onClick={onToggleStakeConf} style={{ justifyContent: "center" }}>
              <CalendarOff size={15} />
              {isStakeConf ? "Not stake conference after all" : "Mark as stake conference"}
            </Btn>
          )}
        </>
      ) : (
        <>
          <Lbl label="Teacher">
            <Select value={teacherId} onChange={pickTeacher}>
              <option value="">— pick from roster —</option>
              {members.filter((m) => m.active !== false).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Lbl>
          <Lbl label="Or type a name">
            <Input value={teacherName} onChange={(v) => { setTeacherName(v); setTeacherId(""); }} placeholder="Anyone not on the roster" />
          </Lbl>

          {/* Said out loud. A prefilled box looks like a decision somebody
              made, and the whole point of the rotation is that this one
              hasn't been made yet — nobody has asked him. */}
          {fromRotation && teacherName === suggested.name && (
            <div style={{ fontSize: 13, color: T.faint, marginTop: -4, lineHeight: 1.5 }}>
              Suggested by the {slotLabel(suggested.slot).toLowerCase()} rotation —
              saving is what makes it an assignment.
            </div>
          )}

          <div style={{ borderTop: `1px solid ${T.lineSoft}`, paddingTop: 12, marginTop: 4 }}>
            <Lbl label="Find a conference talk">
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: T.faint }} />
                <Input value={talkQuery} onChange={setTalkQuery} placeholder="Title or speaker…" style={{ paddingLeft: 32 }} />
              </div>
            </Lbl>
            {matches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                {matches.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTalkTitle(t.title); setSpeaker(t.speaker || "");
                      setTopic(t.title); setTalkQuery("");
                      if (t.url) setTalkLink(t.url);
                    }}
                    style={{
                      textAlign: "left", background: T.inset, border: `1px solid ${T.lineSoft}`,
                      borderRadius: 10, padding: "9px 11px", cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{t.title}</div>
                    <div style={{ fontSize: 13.5, color: T.sub, marginTop: 2 }}>{t.speaker} · {t.conf}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Lbl label="Talk / topic">
            <Input value={talkTitle} onChange={setTalkTitle} placeholder="Come, Follow Me: Alma 32" />
          </Lbl>
          <Lbl label="Speaker">
            <Input value={speaker} onChange={setSpeaker} placeholder="Optional" />
          </Lbl>
          <Lbl label="Exact link (optional)">
            <Input value={talkLink} onChange={setTalkLink} placeholder="Paste a churchofjesuschrist.org URL" />
          </Lbl>
          <Lbl label="Notes">
            <Area value={notes} onChange={setNotes} rows={2} placeholder="Anything the teacher should know" />
          </Lbl>

          <Btn
            kind="primary" size="lg" style={{ justifyContent: "center" }}
            onClick={() => onSave({
              teacher_id: teacherId || null,
              teacher_name: teacherName.trim() || null,
              topic: topic.trim() || talkTitle.trim() || null,
              talk_title: talkTitle.trim() || null,
              speaker: speaker.trim() || null,
              talk_link: talkLink.trim() || null,
              notes: notes.trim() || null,
              no_lesson_reason: null,
            })}
          >
            Save
          </Btn>

          <div style={{ display: "flex", gap: 8 }}>
            {row && <Btn kind="plain" onClick={onClear}>Clear this Sunday</Btn>}
            <Btn kind="plain" style={{ marginLeft: "auto" }} onClick={onToggleStakeConf}>
              <CalendarOff size={14} />Mark stake conference
            </Btn>
          </div>
        </>
      )}
    </Sheet>
  );
}

function GenerateSheet({ members, sundays, existing, onClose, onDone }) {
  const active = members.filter((m) => m.active !== false);
  const [picked, setPicked] = useState(() => Object.fromEntries(active.map((m) => [m.id, true])));
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  const pool = active.filter((m) => picked[m.id]);
  const targets = sundays.filter((s) => overwrite || !existing[s.date]?.teacher_name);

  const run = async () => {
    if (!pool.length || !targets.length) return;
    setBusy(true);
    // Rotate through the pool in roster order so the load is even and predictable.
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      const teacher = pool[i % pool.length];
      const row = existing[s.date];
      const fields = { teacher_id: teacher.id, teacher_name: teacher.name, no_lesson_reason: null };
      if (row) await supabase.from("teaching_assignments").update(fields).eq("id", row.id);
      else await supabase.from("teaching_assignments").insert({ date: s.date, ...fields });
    }
    setBusy(false);
    onDone(targets.length);
  };

  return (
    <Sheet title="Generate Rotation" onClose={onClose}>
      <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6 }}>
        Rotates the brethren you pick across upcoming teaching Sundays. General
        Conference, stake conference, and 5th Sundays are skipped automatically.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn size="sm" kind="plain" onClick={() => setPicked(Object.fromEntries(active.map((m) => [m.id, true])))}>
          Select all
        </Btn>
        <Btn size="sm" kind="plain" onClick={() => setPicked({})}>Clear</Btn>
      </div>

      <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
        {active.map((m) => (
          <label
            key={m.id}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 11px",
              background: picked[m.id] ? T.primarySoft : T.panel,
              border: `1px solid ${picked[m.id] ? T.primary : T.lineSoft}`,
              borderRadius: 10, cursor: "pointer", fontSize: 15, color: T.ink,
            }}
          >
            <input
              type="checkbox" checked={!!picked[m.id]} style={{ width: "auto" }}
              onChange={(e) => setPicked({ ...picked, [m.id]: e.target.checked })}
            />
            {m.name}
          </label>
        ))}
        {!active.length && (
          <div style={{ fontSize: 14.5, color: T.sub }}>
            No One on the Roster Yet — add brethren first.
          </div>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: T.ink, fontWeight: 600 }}>
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        Replace Sundays that already have a teacher
      </label>

      <div style={{ ...card, background: T.inset, padding: 12, fontSize: 14.5, color: T.sub }}>
        {pool.length} teacher{pool.length === 1 ? "" : "s"} across {targets.length} Sunday
        {targets.length === 1 ? "" : "s"}
        {pool.length > 0 && targets.length > 0 && (
          <> · about {Math.ceil(targets.length / pool.length)} turn{Math.ceil(targets.length / pool.length) === 1 ? "" : "s"} each</>
        )}
      </div>

      <Btn
        kind="primary" size="lg" style={{ justifyContent: "center" }}
        onClick={run} disabled={busy || !pool.length || !targets.length}
      >
        {busy ? "Assigning…" : `Assign ${targets.length} Sunday${targets.length === 1 ? "" : "s"}`}
      </Btn>
    </Sheet>
  );
}

function Sheet({ title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
          borderRadius: "18px 18px 0 0", padding: 18, display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18.5, fontWeight: 700, color: T.ink }}>{title}</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

function Lbl({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
        {label}
      </span>
      {children}
    </label>
  );
}
