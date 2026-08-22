import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Area, Select, Chip, Empty, SectionTitle } from "../components/ui";
import { CALLING_STAGES, CALLING_STAGE_COLOR } from "../lib/domain/constants";
import { toIso, fmtShort } from "../lib/domain/dates";

const stageColors = (stage) =>
  CALLING_STAGE_COLOR[stage] || [T.sub, T.lineSoft];

export default function Callings({ focus, onFocusHandled }) {
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [view, setView] = useState("board");
  const [editing, setEditing] = useState(null);
  const [manageGroups, setManageGroups] = useState(false);
  const [focusId, setFocusId] = useState(null);

  const load = useCallback(async () => {
    const [c, g, m] = await Promise.all([
      supabase.from("callings").select("*").order("sort_order"),
      supabase.from("calling_groups").select("*").order("sort_order"),
      supabase.from("members").select("id,name,active").order("name"),
    ]);
    if (c.error) setErr(c.error.message);
    else setRows(c.data || []);
    if (!g.error) setGroups(g.data || []);
    if (!m.error) setMembers(m.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Arriving from the Home Hub with a specific calling in mind: scroll it into
  // view and ring it. Waits for rows so the element exists, and clears the
  // request afterwards so switching tabs and coming back doesn't re-scroll.
  // The highlight fades on its own — it's a pointer, not a selection.
  useEffect(() => {
    const id = focus?.callingId;
    if (!id || loading) return;
    if (!rows.some((r) => r.id === id)) { onFocusHandled?.(); return; }

    setFocusId(id);
    const t = setTimeout(() => {
      const el = document.getElementById(`calling-${id}`);
      el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 60);
    const clear = setTimeout(() => setFocusId(null), 2600);
    onFocusHandled?.();
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [focus, loading, rows, onFocusHandled]);

  const byStage = useMemo(() => {
    const out = {};
    for (const s of CALLING_STAGES) out[s] = [];
    for (const r of rows) (out[r.stage] ||= []).push(r);
    return out;
  }, [rows]);

  const byGroup = useMemo(() => {
    const out = { _none: [] };
    for (const g of groups) out[g.id] = [];
    for (const r of rows) {
      const key = r.group_id && out[r.group_id] ? r.group_id : "_none";
      out[key].push(r);
    }
    return out;
  }, [rows, groups]);

  // Moving a stage stamps the date it was reached, so you can see how long
  // something has been sitting at "Proposed".
  const setStage = async (row, stage) => {
    const dates = { ...(row.stage_dates || {}) };
    if (!dates[stage]) dates[stage] = toIso(new Date());
    const { error } = await supabase
      .from("callings")
      .update({ stage, stage_dates: dates, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) setErr(error.message);
    else load();
  };

  const addCalling = async () => {
    const { data, error } = await supabase
      .from("callings")
      .insert({ position: "New calling", stage: "Need", sort_order: rows.length })
      .select().single();
    if (error) { setErr(error.message); return; }
    await load();
    setEditing(data);
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading callings…</div>;
  }

  const open = rows.filter((r) => !["Set Apart", "Released"].includes(r.stage)).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <SectionTitle sub={`${rows.length} tracked · ${open} in progress`}>Callings</SectionTitle>
        </div>
        <Btn kind="primary" style={{ marginLeft: "auto", flex: "0 0 auto" }} onClick={addCalling}>
          <Plus size={15} />New
        </Btn>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>{err}</div>
      )}

      <div role="tablist" style={{ display: "flex", gap: 4, background: T.inset, borderRadius: 12, padding: 4, marginBottom: 14 }}>
        {[["board", "Board"], ["groups", "By Group"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 9, border: "none",
              background: view === id ? T.panel : "transparent",
              color: view === id ? T.ink : T.sub,
              fontSize: 15, fontWeight: 700, cursor: "pointer",
              boxShadow: view === id ? "var(--card-shadow)" : "none",
            }}>
            {label}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <Empty title="No Callings Tracked Yet" hint="Add one and move it along as it progresses — Need, Proposed, Approved, Called, Sustained, Set Apart." />
      ) : view === "board" ? (
        <Board byStage={byStage} groups={groups} onOpen={setEditing} onStage={setStage} focusId={focusId} />
      ) : (
        <GroupView
          byGroup={byGroup} groups={groups} onOpen={setEditing}
          onManage={() => setManageGroups(true)}
          focusId={focusId}
        />
      )}

      {editing && (
        <EditSheet
          row={rows.find((r) => r.id === editing.id) || editing}
          groups={groups}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={load}
          onStage={setStage}
          setErr={setErr}
        />
      )}

      {manageGroups && (
        <GroupSheet groups={groups} rows={rows} onClose={() => setManageGroups(false)} onChanged={load} setErr={setErr} />
      )}
    </div>
  );
}

// Horizontal board — the stages are a pipeline, so it scrolls sideways rather
// than squashing eight columns onto a phone.
function Board({ byStage, groups, onOpen, onStage, focusId }) {
  return (
    <div className="eq-callings-board" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
      {CALLING_STAGES.map((stage) => {
        const [fg, bg] = stageColors(stage);
        const list = byStage[stage] || [];
        return (
          <div key={stage} style={{ flex: "0 0 auto", width: 208, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{
                background: bg, color: fg, fontSize: 12.5, fontWeight: 800,
                padding: "4px 10px", borderRadius: 999,
              }}>
                {stage}
              </span>
              <span style={{ fontSize: 13, color: T.faint, fontWeight: 700 }}>{list.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {list.map((r) => (
                <CallingCard key={r.id} row={r} groups={groups} onOpen={onOpen} onStage={onStage} showStageNav
                  highlight={focusId === r.id} />
              ))}
              {!list.length && (
                <div style={{
                  border: `1px dashed ${T.line}`, borderRadius: 12, padding: "14px 10px",
                  fontSize: 13.5, color: T.faint, textAlign: "center",
                }}>
                  Empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Condensed group view: each group is one tight block with its callings as
// single lines, so a committee fits on screen instead of scrolling. Empty
// groups collapse to a single row rather than a card with a message in it.
function GroupView({ byGroup, groups, onOpen, onManage, focusId }) {
  const unassigned = byGroup._none || [];

  const Section = ({ name, list, dashed, countColor, countBg }) => (
    <div style={{ ...card, padding: "10px 12px", borderStyle: dashed ? "dashed" : "solid" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: list.length ? 7 : 0 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: dashed ? T.sub : T.ink }}>{name}</span>
        <Chip color={countColor || T.sub} bg={countBg || T.inset}>{list.length}</Chip>
      </div>
      {list.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((r) => (
            <GroupRow key={r.id} row={r} onOpen={onOpen} highlight={focusId === r.id} />
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 13.5, color: T.faint, fontStyle: "italic", marginLeft: "auto" }}>
          Nobody assigned yet.
        </span>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <Btn size="sm" kind="plain" onClick={onManage}>Manage Groups</Btn>
      </div>
      <div className="eq-cols-2" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {groups.map((g) => (
          <Section key={g.id} name={g.name} list={byGroup[g.id] || []} />
        ))}
        {unassigned.length > 0 && (
          <Section name="No Group" list={unassigned} dashed countColor={T.gold} countBg={T.goldSoft} />
        )}
      </div>
    </div>
  );
}

// One calling as a single line inside a group: position, who, and the stage dot.
function GroupRow({ row, onOpen, highlight }) {
  const [fg, bg] = stageColors(row.stage);
  return (
    <button
      id={`calling-${row.id}`}
      data-calling-id={row.id}
      onClick={() => onOpen(row)}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
        background: highlight ? T.primarySoft : "transparent",
        border: `1px solid ${highlight ? T.primary : "transparent"}`,
        borderRadius: 8, padding: "5px 7px", cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, flex: "0 1 auto", minWidth: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {row.position}
      </span>
      {row.candidate_name && (
        <span style={{ fontSize: 13, color: T.sub, flex: "1 1 auto", minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.candidate_name}
        </span>
      )}
      <span style={{ marginLeft: "auto", flex: "0 0 auto", background: bg, color: fg,
        fontSize: 10.5, fontWeight: 800, padding: "2px 6px", borderRadius: 999 }}>
        {row.stage}
      </span>
    </button>
  );
}

// Condensed card. Name and person share a line where they fit; the meta line
// only appears when there's something to put on it, so a bare calling is two
// lines rather than four. `highlight` is set when the Home Hub sent you here,
// so the card you asked for is obvious among its neighbours.
function CallingCard({ row, groups, onOpen, onStage, showStageNav, highlight }) {
  const [fg, bg] = stageColors(row.stage);
  const idx = CALLING_STAGES.indexOf(row.stage);
  const group = groups.find((g) => g.id === row.group_id);
  const reached = row.stage_dates?.[row.stage];
  const hasMeta = (!showStageNav && row.stage) || group || reached;

  return (
    <div
      id={`calling-${row.id}`}
      data-calling-id={row.id}
      style={{
        background: T.panel,
        border: `1px solid ${highlight ? T.primary : T.lineSoft}`,
        boxShadow: highlight ? `0 0 0 3px ${T.primarySoft}` : "none",
        borderRadius: 11, padding: "8px 10px",
        transition: "box-shadow 200ms ease, border-color 200ms ease",
      }}
    >
      <button
        onClick={() => onOpen(row)}
        style={{ background: "none", border: "none", padding: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, lineHeight: 1.25 }}>{row.position}</span>
          {row.candidate_name && (
            <span style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.25 }}>{row.candidate_name}</span>
          )}
        </div>
        {hasMeta && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
            {!showStageNav && (
              <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 999 }}>
                {row.stage}
              </span>
            )}
            {group && <Chip color={T.sub} bg={T.inset}>{group.name}</Chip>}
            {reached && <Chip color={T.faint} bg={T.inset}>{fmtShort(reached)}</Chip>}
          </div>
        )}
      </button>

      {showStageNav && onStage && (
        <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
          <Btn size="sm" kind="ghost" disabled={idx <= 0}
            onClick={() => onStage(row, CALLING_STAGES[idx - 1])}
            style={{ flex: 1, justifyContent: "center", padding: "4px 8px" }}>
            <ChevronLeft size={13} />
          </Btn>
          <Btn size="sm" kind="ghost" disabled={idx >= CALLING_STAGES.length - 1}
            onClick={() => onStage(row, CALLING_STAGES[idx + 1])}
            style={{ flex: 1, justifyContent: "center", padding: "4px 8px" }}>
            <ChevronRight size={13} />
          </Btn>
        </div>
      )}
    </div>
  );
}

function EditSheet({ row, groups, members, onClose, onSaved, onStage, setErr }) {
  const [d, setD] = useState({
    position: row.position || "",
    candidate_name: row.candidate_name || "",
    member_id: row.member_id || "",
    group_id: row.group_id || "",
    set_apart_by: row.set_apart_by || "",
    notes: row.notes || "",
    stage_dates: { ...(row.stage_dates || {}) },
  });
  const [showAllStages, setShowAllStages] = useState(false);

  const save = async () => {
    const { error } = await supabase.from("callings").update({
      position: d.position.trim() || "Untitled",
      candidate_name: d.candidate_name.trim() || null,
      member_id: d.member_id || null,
      group_id: d.group_id || null,
      set_apart_by: d.set_apart_by.trim() || null,
      notes: d.notes.trim() || null,
      stage_dates: d.stage_dates,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (error) { setErr(error.message); return; }
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!confirm(`Remove "${row.position}"?`)) return;
    await supabase.from("callings").delete().eq("id", row.id);
    onSaved();
    onClose();
  };

  // Changing the stage from in here writes a stamp straight to the database.
  // The sheet is holding its own copy of stage_dates to make them editable, so
  // it has to stamp locally too — otherwise saving afterwards would write the
  // stale copy back over the date that was just recorded.
  const changeStage = (v) => {
    setD((prev) => {
      const next = { ...prev.stage_dates };
      if (!next[v]) next[v] = toIso(new Date());
      return { ...prev, stage_dates: next };
    });
    onStage(row, v);
  };

  return (
    <Sheet title="Calling" onClose={onClose}>
      <Lbl label="Calling">
        <Input value={d.position} onChange={(v) => setD({ ...d, position: v })} placeholder="Activities Committee chair" />
      </Lbl>

      <Lbl label="Brother">
        <Select value={d.member_id} onChange={(v) => {
          const m = members.find((x) => x.id === v);
          setD({ ...d, member_id: v, candidate_name: m ? m.name : d.candidate_name });
        }}>
          <option value="">— pick from roster —</option>
          {members.filter((m) => m.active !== false).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </Lbl>
      <Lbl label="Or type a name">
        <Input value={d.candidate_name} onChange={(v) => setD({ ...d, candidate_name: v, member_id: "" })} />
      </Lbl>

      <Lbl label="Group">
        <Select value={d.group_id} onChange={(v) => setD({ ...d, group_id: v })}>
          <option value="">— no group —</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      </Lbl>

      <Lbl label="Stage">
        <Select value={row.stage} onChange={changeStage}>
          {CALLING_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Lbl>

      {/* Stage dates stamp themselves as the stage moves, but the stamp is
          "when you tapped it", not "when it happened" — a calling extended on
          Sunday and entered on Tuesday records Tuesday. So every stage is
          editable, including ones not yet reached, and clearing a field
          removes it. Saved with the rest of the sheet. */}
      <div style={{ ...card, background: T.inset, borderColor: "transparent", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
            Stage Dates
          </span>
          <span style={{ fontSize: 12.5, color: T.faint, marginLeft: "auto" }}>
            {showAllStages ? "" : `${CALLING_STAGES.filter((s) => d.stage_dates[s]).length} set`}
          </span>
          <Btn size="sm" kind="plain" onClick={() => setShowAllStages((v) => !v)}>
            {showAllStages ? "Show Fewer" : "Show All"}
          </Btn>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CALLING_STAGES
            .filter((s) => showAllStages || d.stage_dates[s] || s === row.stage)
            .map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 14,
                  color: s === row.stage ? T.ink : T.sub,
                  fontWeight: s === row.stage ? 700 : 500,
                }}>
                  {s}
                </span>
                <Input
                  type="date"
                  value={d.stage_dates[s] || ""}
                  onChange={(v) => {
                    const next = { ...d.stage_dates };
                    if (v) next[s] = v; else delete next[s];
                    setD({ ...d, stage_dates: next });
                  }}
                  style={{ width: 156, flex: "0 0 auto" }}
                />
              </div>
            ))}
        </div>

        {!Object.keys(d.stage_dates).length && !showAllStages && (
          <div style={{ fontSize: 13.5, color: T.faint, fontStyle: "italic", marginTop: 7 }}>
            Nothing stamped yet — dates record themselves as the stage changes, and you can correct them here.
          </div>
        )}
      </div>

      <Lbl label="Set apart by">
        <Input value={d.set_apart_by} onChange={(v) => setD({ ...d, set_apart_by: v })} placeholder="Who set them apart" />
      </Lbl>
      <Lbl label="Notes">
        <Area value={d.notes} onChange={(v) => setD({ ...d, notes: v })} rows={2} />
      </Lbl>

      <Btn kind="primary" size="lg" style={{ justifyContent: "center" }} onClick={save}>Save</Btn>
      <Btn kind="plain" onClick={remove}><Trash2 size={14} />Remove this calling</Btn>
    </Sheet>
  );
}

function GroupSheet({ groups, rows, onClose, onChanged, setErr }) {
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("calling_groups")
      .insert({ name: name.trim(), sort_order: groups.length });
    if (error) setErr(error.message);
    else { setName(""); onChanged(); }
  };

  const rename = async (g, v) => {
    await supabase.from("calling_groups").update({ name: v }).eq("id", g.id);
    onChanged();
  };

  const remove = async (g) => {
    const inUse = rows.filter((r) => r.group_id === g.id).length;
    if (inUse) {
      alert(`${g.name} still has ${inUse} calling${inUse === 1 ? "" : "s"}. Move them first.`);
      return;
    }
    await supabase.from("calling_groups").delete().eq("id", g.id);
    onChanged();
  };

  return (
    <Sheet title="Groups" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {groups.map((g) => (
          <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input value={g.name} onChange={(v) => rename(g, v)} />
            <Btn size="sm" kind="plain" onClick={() => remove(g)}><Trash2 size={14} /></Btn>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${T.lineSoft}`, paddingTop: 12 }}>
        <Input value={name} onChange={setName} placeholder="Add a group" />
        <Btn kind="primary" onClick={add} disabled={!name.trim()}><Plus size={15} /></Btn>
      </div>
    </Sheet>
  );
}

function Sheet({ title, children, onClose }) {
  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
          borderRadius: "18px 18px 0 0", padding: 18, display: "flex", flexDirection: "column", gap: 12,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink }}>{title}</div>
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
