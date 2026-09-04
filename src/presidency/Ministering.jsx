import { useMemo, useState } from "react";
import {
  Map as MapIcon, Users, Home, Plus, Check, X, ChevronRight, ChevronDown,
  AlertTriangle, MapPin,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Select, Chip, Empty, SectionTitle } from "../components/ui";
import { useMinistering } from "../lib/useMinistering";
import { conductingNames } from "../lib/domain/conducting";
import {
  FLAG_LABEL, companionNames, isIncomplete, tally, rollUp,
} from "../lib/domain/ministering";
import { unplaced } from "../lib/domain/hotspots";
import MinisteringMap from "./MinisteringMap";
import GeocodeSheet from "./GeocodeSheet";

/**
 * Ministering: three districts, the companionships in them, and the households
 * they cover.
 *
 * "Ministering is split into companionships with multiple companionships in 3
 *  districts. a district is assigned to the EQP, EQ 1st Counselor or 2nd
 *  Counselor."
 *
 * Two views of the same data. The list is where the work gets done — assign a
 * companionship, add a household, log that somebody was visited. The map is
 * where the pattern shows up, which is a different question and doesn't belong
 * on the same screen as a set of dropdowns.
 *
 * Everything a household is judged on is computed in domain/ministering.js and
 * handed here already scored. This file decides what things look like; it does
 * not decide who is struggling.
 */

const LEVEL_COLOR = {
  ok: "var(--green, #1c8a4a)",
  watch: "var(--gold, #b07d20)",
  concern: "var(--red, #c0392b)",
};
const LEVEL_LABEL = { ok: "On track", watch: "Watch", concern: "Needs attention" };

/* ------------------------------- the summary ------------------------------ */

function Summary({ scores, points }) {
  const t = tally(scores);
  const missing = unplaced(points).length;
  const total = scores.length;

  return (
    <div style={{ ...card, padding: 13, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: missing ? 10 : 0 }}>
        {["ok", "watch", "concern"].map((k) => (
          <div key={k} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 22.5, fontWeight: 800, color: LEVEL_COLOR[k] }}>{t[k]}</div>
            <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {LEVEL_LABEL[k]}
            </div>
          </div>
        ))}
      </div>
      {/* Said out loud rather than left to be noticed. A map of two thirds of
          the ward looks exactly like a map of the ward. */}
      {missing > 0 && (
        <div style={{ fontSize: 13, color: T.faint, borderTop: `1px solid ${T.lineSoft}`,
          paddingTop: 9 }}>
          {missing} of {total} household{total === 1 ? "" : "s"} {missing === 1 ? "has" : "have"} no
          address yet, so {missing === 1 ? "it isn't" : "they aren't"} on the map.
        </div>
      )}
    </div>
  );
}

/* -------------------------------- households ------------------------------ */

function HouseholdRow({ household, score, onLog, onEdit }) {
  const level = score?.level || "ok";
  const days = score?.daysSinceContact;

  const since =
    score?.lastContact
      ? `Last contact ${days} day${days === 1 ? "" : "s"} ago`
      : "No contact logged yet";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 0", borderTop: `1px solid ${T.lineSoft}`,
    }}>
      <span style={{
        flex: "0 0 auto", width: 4, alignSelf: "stretch", minHeight: 30,
        borderRadius: 2, background: LEVEL_COLOR[level],
      }} />
      <button
        onClick={() => onEdit(household)}
        data-household={household.id}
        style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0,
          textAlign: "left", cursor: "pointer" }}
      >
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: T.ink }}>
          {household.name}
        </span>
        <span style={{ display: "block", fontSize: 12.5, color: T.sub, marginTop: 1 }}>
          {since}
          {!household.address && "  •  no address"}
        </span>
        {/* The flags, named for what was measured. "No contact logged" and
            "neglected" are different claims and only one of them is true. */}
        {score?.flags?.length > 0 && (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {score.flags.map((f) => (
              <span key={f} style={{
                fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                background: T.lineSoft, color: T.sub,
              }}>
                {FLAG_LABEL[f]}
              </span>
            ))}
          </span>
        )}
      </button>
      <Btn size="sm" kind="ghost" onClick={() => onLog(household)} title="Log a contact">
        <Check size={15} />
      </Btn>
    </div>
  );
}

/* ------------------------------ companionships ---------------------------- */

function CompanionshipCard({
  comp, members, membersById, households, scoreById, onLog, onEditHousehold,
  onSave, onAddHousehold, onDelete,
}) {
  const [open, setOpen] = useState(false);
  const names = companionNames(comp, membersById);
  const short = isIncomplete(comp, membersById);
  // Active only. A family that moved away keeps its companionship_id so its
  // contact history stays attached to somebody, which means filtering on that
  // alone lists them here for ever.
  const mine = households.filter(
    (h) => h.companionship_id === comp.id && h.active !== false
  );

  const worst = mine.reduce((w, h) => {
    const l = scoreById[h.id]?.level;
    if (l === "concern") return "concern";
    if (l === "watch" && w !== "concern") return "watch";
    return w;
  }, "ok");

  return (
    <div style={{ ...card, padding: "11px 12px", marginBottom: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{
          flex: "0 0 auto", width: 9, height: 9, borderRadius: 5,
          background: LEVEL_COLOR[worst],
        }} />
        <button
          onClick={() => setOpen((v) => !v)}
          data-comp={comp.id}
          style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0,
            textAlign: "left", cursor: "pointer" }}
        >
          <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.ink }}>
            {names.length ? names.join(" & ") : "Unassigned companionship"}
          </span>
          <span style={{ display: "block", fontSize: 12.5, color: T.sub, marginTop: 1 }}>
            {mine.length} household{mine.length === 1 ? "" : "s"}
            {short && "  •  needs a companion"}
          </span>
        </button>
        {open ? <ChevronDown size={16} color={T.sub} /> : <ChevronRight size={16} color={T.sub} />}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {["companion_a_id", "companion_b_id"].map((field, i) => (
              <Select
                key={field}
                aria-label={i === 0 ? "First companion" : "Second companion"}
                value={comp[field] || ""}
                onChange={(v) => onSave(comp.id, { [field]: v || null })}
                style={{ flex: 1 }}
              >
                <option value="">{i === 0 ? "First companion" : "Second companion"}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            ))}
          </div>

          {mine.map((h) => (
            <HouseholdRow
              key={h.id}
              household={h}
              score={scoreById[h.id]}
              onLog={onLog}
              onEdit={onEditHousehold}
            />
          ))}
          {!mine.length && (
            <div style={{ fontSize: 13, color: T.faint, padding: "8px 0" }}>
              No households assigned yet.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn size="sm" kind="ghost" onClick={() => onAddHousehold(comp.id)}>
              <Plus size={14} /> Household
            </Btn>
            <div style={{ flex: 1 }} />
            <Btn size="sm" kind="ghost" onClick={() => onDelete(comp.id)}>Remove</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- the screen ----------------------------- */

export default function Ministering() {
  const m = useMinistering();
  const [view, setView] = useState("list");
  const [presidency, setPresidency] = useState([]);
  const [editing, setEditing] = useState(null);      // a household being edited
  const [logging, setLogging] = useState(null);      // a household being logged
  const [geo, setGeo] = useState(false);

  // The three who lead districts are the three who conduct: president, first
  // counsellor, second counsellor. Same rule, same order, one definition —
  // conducts() already excludes the secretary and the instructors.
  useMemo(() => {
    supabase.from("presidency_members").select("name,role").then(({ data }) => {
      setPresidency(conductingNames(data || []));
    });
  }, []);

  const activeMembers = useMemo(
    () => (m.members || []).filter((x) => x.active !== false)
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [m.members]
  );

  const save = async (table, id, patch) => {
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    if (error) m.setErr(error.message); else m.reload();
  };

  const addDistrict = async () => {
    const n = m.districts.length;
    const { error } = await supabase.from("ministering_districts")
      .insert({ name: `District ${n + 1}`, sort_order: n });
    if (error) m.setErr(error.message); else m.reload();
  };

  const addComp = async (districtId) => {
    const { error } = await supabase.from("ministering_companionships")
      .insert({ district_id: districtId });
    if (error) m.setErr(error.message); else m.reload();
  };

  const addHousehold = async (compId) => {
    const { data, error } = await supabase.from("ministering_households")
      .insert({ companionship_id: compId, name: "New household" }).select().single();
    if (error) m.setErr(error.message);
    else { await m.reload(); setEditing(data); }
  };

  const removeComp = async (id) => {
    // The households survive: setting their companionship to null is exactly
    // what a reorganisation looks like, and it puts them at the top of the
    // unassigned list rather than deleting a family's history.
    await supabase.from("ministering_households")
      .update({ companionship_id: null }).eq("companionship_id", id);
    const { error } = await supabase.from("ministering_companionships").delete().eq("id", id);
    if (error) m.setErr(error.message); else m.reload();
  };

  const orphans = useMemo(
    () => m.households.filter((h) => h.active !== false && !h.companionship_id),
    [m.households]
  );

  if (m.needsMigration) {
    return (
      <div style={{ ...card, padding: 16 }}>
        <SectionTitle sub="One migration to run first">Ministering</SectionTitle>
        <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.5 }}>
          The ministering tables aren't in the database yet. In Supabase → SQL Editor,
          run <strong>supabase/ministering.sql</strong> from the project, then reload
          this screen. It's safe to run twice and it doesn't delete anything.
        </p>
        <Btn onClick={m.reload} style={{ marginTop: 10 }}>Check again</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <SectionTitle sub={`${m.households.length} households · ${m.quarter}`}>
            Ministering
          </SectionTitle>
        </div>
        <Btn size="sm" kind={view === "list" ? "primary" : "ghost"} onClick={() => setView("list")}>
          <Users size={14} /> List
        </Btn>
        <Btn size="sm" kind={view === "map" ? "primary" : "ghost"} onClick={() => setView("map")}>
          <MapIcon size={14} /> Map
        </Btn>
      </div>

      {m.err && (
        <div style={{ ...card, padding: 11, marginBottom: 12, fontSize: 13.5, color: "var(--red, #c0392b)" }}>
          {m.err}
        </div>
      )}

      {m.loading ? (
        <div style={{ fontSize: 14, color: T.faint }}>Loading…</div>
      ) : view === "map" ? (
        <MinisteringMap
          points={m.points}
          districtsById={m.districtsById}
          compsById={m.compsById}
          membersById={m.membersById}
          onGeocode={() => setGeo(true)}
        />
      ) : (
        <>
          <Summary scores={m.scores} points={m.points} />

          {!m.districts.length && (
            <Empty title="No districts yet"
              hint="Three districts, one for the president and one for each counsellor." />
          )}

          {m.districts.map((d) => {
            const comps = m.comps.filter((c) => c.district_id === d.id);
            return (
              <div key={d.id} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: T.sub }}>
                      {d.name}
                    </div>
                  </div>
                  <Select
                    aria-label={`Who leads ${d.name}`}
                    value={d.leader_name || ""}
                    onChange={(v) => save("ministering_districts", d.id, { leader_name: v || null })}
                    style={{ maxWidth: 190 }}
                  >
                    <option value="">Nobody yet</option>
                    {presidency.map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>

                {comps.map((c) => (
                  <CompanionshipCard
                    key={c.id}
                    comp={c}
                    members={activeMembers}
                    membersById={m.membersById}
                    households={m.households}
                    scoreById={m.scoreById}
                    onLog={setLogging}
                    onEditHousehold={setEditing}
                    onSave={(id, patch) => save("ministering_companionships", id, patch)}
                    onAddHousehold={addHousehold}
                    onDelete={removeComp}
                  />
                ))}

                <Btn size="sm" kind="ghost" onClick={() => addComp(d.id)}>
                  <Plus size={14} /> Companionship
                </Btn>
              </div>
            );
          })}

          <Btn kind="ghost" onClick={addDistrict}><Plus size={14} /> District</Btn>

          {/* Households nobody is assigned to. Top-level rather than buried,
              because it's the one thing on this screen that is unambiguously
              a problem — every other flag is a maybe. */}
          {orphans.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <AlertTriangle size={15} color="var(--red, #c0392b)" />
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: T.sub }}>
                  Nobody assigned ({orphans.length})
                </span>
              </div>
              <div style={{ ...card, padding: "4px 12px 10px" }}>
                {orphans.map((h) => (
                  <HouseholdRow key={h.id} household={h} score={m.scoreById[h.id]}
                    onLog={setLogging} onEdit={setEditing} />
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn kind="ghost" onClick={() => setGeo(true)}>
              <MapPin size={14} /> Put households on the map
            </Btn>
          </div>
        </>
      )}

      {editing && (
        <HouseholdSheet
          household={editing}
          comps={m.comps}
          districtsById={m.districtsById}
          membersById={m.membersById}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); m.reload(); }}
          onError={m.setErr}
        />
      )}
      {logging && (
        <LogSheet
          household={logging}
          todayIso={m.todayIso}
          onClose={() => setLogging(null)}
          onSaved={() => { setLogging(null); m.reload(); }}
          onError={m.setErr}
        />
      )}
      {geo && (
        <GeocodeSheet
          households={m.households}
          onClose={() => setGeo(false)}
          onDone={() => { setGeo(false); m.reload(); }}
        />
      )}
    </div>
  );
}

/* --------------------------------- sheets --------------------------------- */

function Sheet({ title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.panel, width: "100%", maxWidth: 520,
          borderRadius: "18px 18px 0 0", padding: 16,
          maxHeight: "86vh", overflowY: "auto",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 17.5, fontWeight: 800, color: T.ink }}>{title}</div>
          <Btn size="sm" kind="ghost" onClick={onClose} aria-label="Close"><X size={16} /></Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

function HouseholdSheet({ household, comps, districtsById, membersById, onClose, onSaved, onError }) {
  const [draft, setDraft] = useState({
    name: household.name || "", address: household.address || "",
    phone: household.phone || "", notes: household.notes || "",
    companionship_id: household.companionship_id || "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const patch = {
      name: draft.name.trim() || "Household",
      address: draft.address.trim() || null,
      phone: draft.phone.trim() || null,
      notes: draft.notes.trim() || null,
      companionship_id: draft.companionship_id || null,
    };
    const { error } = await supabase.from("ministering_households")
      .update(patch).eq("id", household.id);
    setBusy(false);
    if (error) onError(error.message); else onSaved();
  };

  const remove = async () => {
    // Marked inactive rather than deleted. A family that moves away has a
    // contact history somebody may want to look back at, and there is no undo
    // on this screen.
    const { error } = await supabase.from("ministering_households")
      .update({ active: false }).eq("id", household.id);
    if (error) onError(error.message); else onSaved();
  };

  return (
    <Sheet title="Household" onClose={onClose}>
      <label style={lbl}>Name</label>
      <Input value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })}
        placeholder="The Hansen family" aria-label="Household name" />

      <label style={lbl}>Address</label>
      <Input value={draft.address} onChange={(v) => setDraft({ ...draft, address: v })}
        placeholder="412 W Sage Vista Dr" aria-label="Address" />
      <div style={{ fontSize: 12.5, color: T.faint, marginTop: 4 }}>
        Street and number is enough — Lehi is assumed.
      </div>

      <label style={lbl}>Phone</label>
      <Input value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })}
        aria-label="Phone" />

      <label style={lbl}>Companionship</label>
      <Select value={draft.companionship_id}
        onChange={(v) => setDraft({ ...draft, companionship_id: v })}
        aria-label="Companionship">
        <option value="">Nobody assigned</option>
        {comps.map((c) => {
          const names = companionNames(c, membersById);
          const d = districtsById[c.district_id];
          return (
            <option key={c.id} value={c.id}>
              {(names.join(" & ") || "Unassigned")}{d ? ` — ${d.name}` : ""}
            </option>
          );
        })}
      </Select>

      <label style={lbl}>Notes</label>
      <Input value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })}
        aria-label="Notes" />

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn kind="primary" onClick={submit} disabled={busy}>Save</Btn>
        <div style={{ flex: 1 }} />
        <Btn kind="ghost" onClick={remove}>Moved away</Btn>
      </div>
    </Sheet>
  );
}

const KINDS = [
  ["visit", "Visit"], ["call", "Call"], ["text", "Text"],
  ["service", "Service"], ["church", "At church"], ["other", "Other"],
];

function LogSheet({ household, todayIso, onClose, onSaved, onError }) {
  const [kind, setKind] = useState("visit");
  const [on, setOn] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.from("ministering_contacts").insert({
      household_id: household.id,
      companionship_id: household.companionship_id || null,
      contacted_on: on,
      kind,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) onError(error.message); else onSaved();
  };

  return (
    <Sheet title={`Log contact — ${household.name}`} onClose={onClose}>
      <label style={lbl}>What happened</label>
      <Select value={kind} onChange={setKind} aria-label="Kind of contact">
        {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>

      <label style={lbl}>When</label>
      <Input type="date" value={on} onChange={setOn} aria-label="Date of contact" />

      <label style={lbl}>Notes</label>
      <Input value={notes} onChange={setNotes}
        placeholder="Optional — anything the presidency should know"
        aria-label="Notes" />

      <Btn kind="primary" onClick={submit} disabled={busy} style={{ marginTop: 16 }}>
        <Check size={15} /> Log it
      </Btn>
    </Sheet>
  );
}

const lbl = {
  display: "block", fontSize: 12, fontWeight: 700, color: T.sub,
  textTransform: "uppercase", letterSpacing: "0.06em", margin: "13px 0 5px",
};
