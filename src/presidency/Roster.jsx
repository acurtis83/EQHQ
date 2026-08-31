import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Upload, Search, X, Copy, AlertTriangle, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { BANDS, OFFICES, bandForAge, lastNameOf, parseDirectory } from "../lib/domain/roster";
import {
  diffRoster, findDuplicates, duplicateCount, CONFIRM,
} from "../lib/domain/rosterMerge";
import { T, card, Btn, Input, Select, Chip, SectionTitle, Empty } from "../components/ui";
import { refreshMemberNames } from "../components/AssigneePicker";

const blank = {
  name: "", age: "", address: "", phone: "", email: "",
  office: "Elder", calling: "", active: true, notes: "",
};

export default function Roster() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [band, setBand] = useState("all");
  const [editing, setEditing] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState([]);
  const [pasteSkipped, setPasteSkipped] = useState([]);
  // What the paste would do, and what the presidency decided about the parts
  // that need a person. Null until there's something parsed to diff.
  const [diff, setDiff] = useState(null);
  const [choices, setChoices] = useState({});
  const [dropMissing, setDropMissing] = useState({});
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupes, setDupes] = useState(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearWord, setClearWord] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    // Someone added or renamed here should appear in the "Assigned To" list
    // without a reload of the whole app.
    refreshMemberNames();
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("last_name", { ascending: true })
      .order("name", { ascending: true });
    if (error) setErr(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (band !== "all" && (r.band || "Unknown") !== band) return false;
      if (!needle) return true;
      return [r.name, r.calling, r.office, r.email, r.phone]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, band]);

  const counts = useMemo(() => {
    const out = {};
    for (const b of BANDS) out[b] = 0;
    for (const r of rows) out[r.band || "Unknown"] = (out[r.band || "Unknown"] || 0) + 1;
    return out;
  }, [rows]);

  const save = async (row) => {
    const age = row.age === "" || row.age == null ? null : Number(row.age);
    const payload = {
      name: row.name.trim(),
      last_name: lastNameOf(row.name),
      age: Number.isFinite(age) ? age : null,
      address: row.address?.trim() || null,
      phone: row.phone?.trim() || null,
      email: row.email?.trim() || null,
      office: row.office || null,
      calling: row.calling?.trim() || null,
      notes: row.notes?.trim() || null,
      active: row.active !== false,
      band: bandForAge(age),
    };
    if (!payload.name) return;
    const res = row.id
      ? await supabase.from("members").update(payload).eq("id", row.id)
      : await supabase.from("members").insert(payload);
    if (res.error) setErr(res.error.message);
    else { setEditing(null); load(); }
  };

  const remove = async (row) => {
    if (!confirm(`Remove ${row.name} from the roster?`)) return;
    const { error } = await supabase.from("members").delete().eq("id", row.id);
    if (error) setErr(error.message);
    else load();
  };

  /**
   * Read the paste and work out what it would change — without changing it.
   *
   * The diff is recomputed on every keystroke because it's pure arithmetic
   * over a few hundred rows, and because a summary that lags behind the box
   * it's describing is worse than no summary.
   */
  const runPaste = (text) => {
    setPasteText(text);
    const { rows: parsed, skipped } = parseDirectory(text);
    setPastePreview(parsed);
    setPasteSkipped(skipped);
    setDiff(parsed.length ? diffRoster(parsed, rows) : null);
    setChoices({});
    setDropMissing({});
  };

  /**
   * Apply what the summary promised, and nothing else.
   *
   * Adds and updates go without asking — they're the unambiguous half. The
   * confirmations only happen where the presidency ticked them, and a
   * move-out is only ever a deletion somebody chose.
   */
  const commitPaste = async () => {
    if (!diff) return;
    setBusy(true);
    const add = [...diff.add];
    const patches = diff.update.map((u) => ({ id: u.existing.id, patch: u.patch }));

    for (const [i, c] of diff.confirm.entries()) {
      const choice = choices[i];
      if (!choice) continue;
      if (c.reason === CONFIRM.MOVED && choice === "same") {
        patches.push({ id: c.existing.id, patch: c.patch });
      } else if (choice === "new") {
        add.push(c.incoming);
      }
    }

    const goneIds = diff.missing.filter((m) => dropMissing[m.id]).map((m) => m.id);

    let error = null;
    if (add.length) ({ error } = await supabase.from("members").insert(add));
    for (const p of patches) {
      if (error) break;
      if (!p.patch || !Object.keys(p.patch).length) continue;
      ({ error } = await supabase.from("members").update(p.patch).eq("id", p.id));
    }
    if (!error && goneIds.length) {
      ({ error } = await supabase.from("members").delete().in("id", goneIds));
    }

    setBusy(false);
    if (error) { setErr(error.message); return; }
    closePaste();
    load();
  };

  const closePaste = () => {
    setPasteOpen(false);
    setPasteText("");
    setPastePreview([]);
    setPasteSkipped([]);
    setDiff(null);
    setChoices({});
    setDropMissing({});
  };

  /* ------------------------------ cleaning up ------------------------------ */

  const openDupes = () => { setDupes(findDuplicates(rows)); setDupeOpen(true); };

  /**
   * Merge the groups that need no judgement.
   *
   * Anything the fuller record was missing is copied onto it first, then the
   * others go. Doing it the other way round — delete then patch — loses a
   * phone number that only existed on the row being removed, which is the
   * whole reason a merge isn't just a delete.
   */
  const mergeIdentical = async () => {
    if (!dupes?.identical.length) return;
    setBusy(true);
    let error = null;
    for (const g of dupes.identical) {
      if (error) break;
      if (g.patch) ({ error } = await supabase.from("members").update(g.patch).eq("id", g.keep.id));
      if (error) break;
      ({ error } = await supabase.from("members").delete().in("id", g.drop.map((r) => r.id)));
    }
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDupeOpen(false);
    setDupes(null);
    load();
  };

  /** Keep one of a same-name pair the presidency picked, drop the rest. */
  const resolveSimilar = async (rowsInGroup, keepId) => {
    const drop = rowsInGroup.filter((r) => r.id !== keepId).map((r) => r.id);
    if (!drop.length) return;
    const { error } = await supabase.from("members").delete().in("id", drop);
    if (error) { setErr(error.message); return; }
    const next = rows.filter((r) => !drop.includes(r.id));
    setRows(next);
    setDupes(findDuplicates(next));
    load();
  };

  const clearRoster = async () => {
    if (clearWord.trim().toUpperCase() !== "DELETE") return;
    setBusy(true);
    // No filter would be rejected; this matches every row without naming one.
    const { error } = await supabase.from("members").delete().not("id", "is", null);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setClearOpen(false);
    setClearWord("");
    load();
  };

  return (
    <div>
      <SectionTitle sub="The roster other sections reference — ministering, teaching, and callings all point back here.">
        Quorum Roster
      </SectionTitle>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: T.faint }} />
          <Input value={q} onChange={setQ} placeholder="Search name, calling…" style={{ paddingLeft: 32 }} />
        </div>
        <Select value={band} onChange={setBand} style={{ flex: "0 1 150px" }}>
          <option value="all">All ages ({rows.length})</option>
          {BANDS.map((b) => <option key={b} value={b}>{b} ({counts[b] || 0})</option>)}
        </Select>
        <Btn kind="soft" onClick={() => setPasteOpen(true)}><Upload size={15} />Paste Directory</Btn>
        <Btn kind="primary" onClick={() => setEditing({ ...blank })}><Plus size={15} />Add</Btn>
      </div>

      {/* Housekeeping, kept off the main row. Neither is a weekly job, and
          "Clear Roster" next to "Add" is an accident waiting to happen. */}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Btn size="sm" kind="plain" onClick={openDupes}>
            <Copy size={14} />Find Duplicates
          </Btn>
          <Btn size="sm" kind="plain" onClick={() => setClearOpen(true)} style={{ color: T.red }}>
            <Trash2 size={14} />Clear Roster
          </Btn>
        </div>
      )}

      {loading ? (
        <div style={{ color: T.sub, fontSize: 15, padding: 20, textAlign: "center" }}>Loading roster…</div>
      ) : !rows.length ? (
        <Empty
          title="No One on the Roster Yet"
          hint="Paste your ward directory export to bring everyone in at once, or add brethren one at a time."
        />
      ) : (
        <div className="eq-cols-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((r) => (
            <div key={r.id} style={{ ...card, padding: 13, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16.5, fontWeight: 700, color: T.ink }}>{r.name}</span>
                  {r.age != null && <Chip color={T.sub} bg={T.inset}>{r.age}</Chip>}
                  {r.office && <Chip>{r.office}</Chip>}
                  {!r.active && <Chip color={T.red} bg={T.redSoft}>Inactive</Chip>}
                </div>
                {(r.calling || r.phone) && (
                  <div style={{ fontSize: 14, color: T.sub, marginTop: 4 }}>
                    {[r.calling, r.phone].filter(Boolean).join(" · ")}
                  </div>
                )}
                {r.address && (
                  <div style={{ fontSize: 13.5, color: T.faint, marginTop: 2 }}>{r.address}</div>
                )}
              </div>
              <Btn size="sm" kind="plain" onClick={() => setEditing({ ...r, age: r.age ?? "" })}>Edit</Btn>
              <Btn size="sm" kind="plain" onClick={() => remove(r)}><Trash2 size={14} /></Btn>
            </div>
          ))}
          {!visible.length && (
            <div style={{ color: T.sub, fontSize: 15, padding: 20, textAlign: "center" }}>
              No one matches that search.
            </div>
          )}
        </div>
      )}

      {editing && (
        <Sheet title={editing.id ? "Edit Brother" : "Add Brother"} onClose={() => setEditing(null)}>
          <Field label="Name">
            <Input value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} placeholder="First Last" />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Age">
              <Input type="number" value={editing.age} onChange={(v) => setEditing({ ...editing, age: v })} />
            </Field>
            <Field label="Office">
              <Select value={editing.office || ""} onChange={(v) => setEditing({ ...editing, office: v })}>
                <option value="">—</option>
                {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Calling">
            <Input value={editing.calling || ""} onChange={(v) => setEditing({ ...editing, calling: v })} />
          </Field>
          <Field label="Address">
            <Input value={editing.address || ""} onChange={(v) => setEditing({ ...editing, address: v })}
              placeholder="1234 N Holbrook Way, Lehi, UT" />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Phone">
              <Input value={editing.phone || ""} onChange={(v) => setEditing({ ...editing, phone: v })} />
            </Field>
            <Field label="Email">
              <Input value={editing.email || ""} onChange={(v) => setEditing({ ...editing, email: v })} />
            </Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: T.ink, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={editing.active !== false}
              onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
            />
            Active in the quorum
          </label>
          <Btn kind="primary" size="lg" onClick={() => save(editing)} style={{ justifyContent: "center" }}>
            {editing.id ? "Save changes" : "Add to roster"}
          </Btn>
        </Sheet>
      )}

      {pasteOpen && (
        <Sheet title="Paste Ward Directory" onClose={() => setPasteOpen(false)}>
          <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6 }}>
            Paste straight from an LDS Tools or Ward Directory export. It reads
            name, age, birthdate, address, phone, and email — in whatever order
            they come, and however many lines each person takes.
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => runPaste(e.target.value)}
            rows={7}
            // Shown as an example, so it has to be the real export shape: one
            // person spread over several lines, with the city/state/ZIP on its
            // own row. A test parses this exact string to keep it honest.
            placeholder={
              "Adamson, Seth\t36\t5 Jul 1990\n" +
              "2685 N Drexler Dr\n" +
              "Lehi UT 84048\n" +
              "(801) 376-0070\tseth.c.adamson@gmail.com"
            }
            style={{
              background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10,
              padding: 11, fontSize: 15, color: T.ink, width: "100%",
              fontFamily: "ui-monospace, monospace", resize: "vertical",
            }}
          />
          {diff && (
            <>
              <ImportReview
                diff={diff}
                skipped={pasteSkipped}
                choices={choices}
                setChoices={setChoices}
                dropMissing={dropMissing}
                setDropMissing={setDropMissing}
              />
              <ParseQuality rows={pastePreview} skipped={pasteSkipped} />
            </>
          )}
          {!pastePreview.length && pasteSkipped.length > 0 && (
            <div style={{
              background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
              borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.55,
            }}>
              Couldn't read any names from that. Send me a couple of lines exactly as
              they paste and I'll adjust the parser.
            </div>
          )}
          <Btn
            kind="primary" size="lg" onClick={commitPaste}
            disabled={!diff || busy || !importWillDo(diff, choices, dropMissing)}
            style={{ justifyContent: "center" }}
          >
            {busy ? "Working…" : importLabel(diff, choices, dropMissing)}
          </Btn>
        </Sheet>
      )}

      {dupeOpen && (
        <Sheet title="Duplicates" onClose={() => setDupeOpen(false)}>
          <DuplicateReview
            dupes={dupes}
            busy={busy}
            onMerge={mergeIdentical}
            onKeep={resolveSimilar}
          />
        </Sheet>
      )}

      {clearOpen && (
        <Sheet title="Clear Roster" onClose={() => { setClearOpen(false); setClearWord(""); }}>
          <div style={{
            background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
            borderRadius: 10, padding: "11px 13px", fontSize: 14.5, lineHeight: 1.6,
          }}>
            <strong>This removes all {rows.length} brethren from the roster.</strong> Ministering
            assignments, teaching rotations and callings that point at these
            records will lose the name they point to. It can't be undone from
            here.
          </div>
          <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6 }}>
            Type <strong style={{ color: T.ink }}>DELETE</strong> to confirm.
          </div>
          <Input value={clearWord} onChange={setClearWord} placeholder="DELETE" />
          <Btn
            kind="danger" size="lg" onClick={clearRoster}
            disabled={busy || clearWord.trim().toUpperCase() !== "DELETE"}
            style={{ justifyContent: "center" }}
          >
            <Trash2 size={15} />
            {busy ? "Clearing…" : `Clear all ${rows.length}`}
          </Btn>
        </Sheet>
      )}
    </div>
  );
}

/* --------------------------- the import summary --------------------------- */

/** Whether pressing the button would do anything at all. */
function importWillDo(diff, choices, dropMissing) {
  if (!diff) return false;
  if (diff.add.length || diff.update.length) return true;
  if (Object.values(choices).some(Boolean)) return true;
  return Object.values(dropMissing).some(Boolean);
}

/**
 * What the button says it will do, counted out.
 *
 * "Add 12 to roster" was a lie the moment the import stopped being an insert —
 * most of a weekly paste is people already there. The label names every kind
 * of change so nobody has to infer it from the summary above.
 */
function importLabel(diff, choices, dropMissing) {
  if (!diff) return "Import";
  let added = diff.add.length;
  let updated = diff.update.length;
  for (const [i, c] of diff.confirm.entries()) {
    if (choices[i] === "new") added += 1;
    else if (choices[i] === "same") updated += 1;
  }
  const removed = diff.missing.filter((m) => dropMissing[m.id]).length;
  const bits = [];
  if (added) bits.push(`add ${added}`);
  if (updated) bits.push(`update ${updated}`);
  if (removed) bits.push(`remove ${removed}`);
  if (!bits.length) return "Nothing to import";
  const s = bits.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const where = (r) => [r?.address, r?.phone].filter(Boolean).join("  ·  ") || "No address on file";

function Tally({ n, label, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
      <span style={{ fontSize: 19.5, fontWeight: 800, color: tone || T.ink, minWidth: 26 }}>{n}</span>
      <span style={{ fontSize: 14, color: T.sub }}>{label}</span>
    </div>
  );
}

/**
 * What this paste would do, before it does any of it.
 *
 * The counts come first because on a normal week they're the whole answer:
 * a few new brethren, everyone else already there, nothing to decide. The
 * lists below only appear when there's actually a judgement to make, so a
 * clean import is four lines rather than a wall of names.
 */
function ImportReview({ diff, skipped, choices, setChoices, dropMissing, setDropMissing }) {
  const pick = (i, v) => setChoices((c) => ({ ...c, [i]: c[i] === v ? undefined : v }));
  const toggleGone = (id) => setDropMissing((d) => ({ ...d, [id]: !d[id] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        ...card, padding: 13, display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "7px 14px",
      }}>
        <Tally n={diff.add.length} label="new — will be added" tone={T.green} />
        <Tally n={diff.skip.length} label="already here — skipped" />
        <Tally n={diff.update.length} label="updated from this roster" tone={T.primary} />
        <Tally n={diff.confirm.length} label="need a look" tone={diff.confirm.length ? T.gold : T.sub} />
        {skipped.length > 0 && (
          <Tally n={skipped.length} label="lines I couldn't read" tone={T.faint} />
        )}
      </div>

      {diff.confirm.length > 0 && (
        <div>
          <SubHead icon={AlertTriangle} tone={T.gold}>Need a look</SubHead>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {diff.confirm.map((c, i) => (
              <div key={i} style={{ ...card, padding: 12 }}>
                {c.reason === CONFIRM.MOVED ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{c.incoming.name}</div>
                    <div style={{ fontSize: 13.5, color: T.sub, marginTop: 4, lineHeight: 1.5 }}>
                      Already on the roster at <strong>{c.existing.address || "no address"}</strong>,
                      and this roster says <strong>{c.incoming.address || "no address"}</strong>.
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                      <Btn size="sm" kind={choices[i] === "same" ? "primary" : "soft"}
                        onClick={() => pick(i, "same")}>
                        Same man — he moved
                      </Btn>
                      <Btn size="sm" kind={choices[i] === "new" ? "primary" : "soft"}
                        onClick={() => pick(i, "new")}>
                        Different man — add him
                      </Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{c.incoming.name}</div>
                    <div style={{ fontSize: 13.5, color: T.sub, marginTop: 4, lineHeight: 1.5 }}>
                      New name at an address you already have —{" "}
                      <strong>{c.incoming.address}</strong>, where {c.existing.name} lives.
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                      <Btn size="sm" kind={choices[i] === "new" ? "primary" : "soft"}
                        onClick={() => pick(i, "new")}>
                        Add him
                      </Btn>
                      <Btn size="sm" kind={choices[i] === "skip" ? "primary" : "soft"}
                        onClick={() => pick(i, "skip")}>
                        Skip
                      </Btn>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {diff.missing.length > 0 && (
        <div>
          <SubHead icon={X} tone={T.sub}>Not in this roster ({diff.missing.length})</SubHead>
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55, marginBottom: 8 }}>
            On your roster but not in what you pasted — probably moved out. Tick
            anyone to remove; leave them and nothing happens to them.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {diff.missing.map((m) => (
              <label key={m.id} style={{
                ...card, padding: "9px 11px", display: "flex", alignItems: "center",
                gap: 10, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={!!dropMissing[m.id]}
                  onChange={() => toggleGone(m.id)}
                  aria-label={`Remove ${m.name}`}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{m.name}</span>
                  <span style={{ fontSize: 13, color: T.faint, marginLeft: 8 }}>{where(m)}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- the dupe sheet ----------------------------- */

/**
 * Duplicates, split by whether there's anything to decide.
 *
 * The identical groups are one button — same name, same address, nothing a
 * person can add. The same-name-different-address groups are the ones that
 * need somebody who knows the quorum, so each is its own choice and nothing
 * happens to them until it's made.
 */
function DuplicateReview({ dupes, busy, onMerge, onKeep }) {
  if (!dupes) return null;
  const going = duplicateCount(dupes);

  if (!going && !dupes.similar.length) {
    return (
      <Empty title="No Duplicates" hint="Every brother on the roster appears once." />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {going > 0 && (
        <div>
          <SubHead icon={Copy} tone={T.primary}>
            Identical — {going} row{going === 1 ? "" : "s"} to remove
          </SubHead>
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55, marginBottom: 9 }}>
            Same name, same address. Anything one copy knows and the other
            doesn't — a phone number, an email — is kept on the one that stays.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
            {dupes.identical.slice(0, 12).map((g) => (
              <div key={g.keep.id} style={{ ...card, padding: "9px 11px" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{g.keep.name}</span>
                <span style={{ fontSize: 13, color: T.faint, marginLeft: 8 }}>
                  {g.drop.length + 1} copies · {where(g.keep)}
                </span>
              </div>
            ))}
            {dupes.identical.length > 12 && (
              <div style={{ fontSize: 13, color: T.faint, paddingLeft: 2 }}>
                and {dupes.identical.length - 12} more…
              </div>
            )}
          </div>
          <Btn kind="primary" size="lg" onClick={onMerge} disabled={busy} style={{ justifyContent: "center" }}>
            <Check size={15} />
            {busy ? "Merging…" : `Merge ${going} duplicate${going === 1 ? "" : "s"}`}
          </Btn>
        </div>
      )}

      {dupes.similar.length > 0 && (
        <div>
          <SubHead icon={AlertTriangle} tone={T.gold}>
            Same name, different address ({dupes.similar.length})
          </SubHead>
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55, marginBottom: 9 }}>
            Either one brother who moved and got pasted twice, or two brethren
            who share a name. Keep the right one, or leave it alone.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dupes.similar.map((group, gi) => (
              <div key={gi} style={{ ...card, padding: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 7 }}>
                  {group[0].name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.map((r) => (
                    <div key={r.id} style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    }}>
                      <span style={{ fontSize: 13.5, color: T.sub, flex: 1, minWidth: 120 }}>
                        {where(r)}
                      </span>
                      <Btn size="sm" kind="soft" disabled={busy} onClick={() => onKeep(group, r.id)}>
                        Keep this one
                      </Btn>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubHead({ icon: Icon, tone, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, marginBottom: 7,
      fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em",
      textTransform: "uppercase", color: tone || T.sub,
    }}>
      <Icon size={14} />
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
        {label}
      </span>
      {children}
    </label>
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
          background: T.bg, width: "100%", maxWidth: 520, maxHeight: "90vh",
          overflowY: "auto", borderRadius: "18px 18px 0 0", padding: 18,
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 19.5, fontWeight: 700, color: T.ink }}>{title}</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Whether the parser actually found each column.
 *
 * This used to list every parsed row as well, which the import summary now
 * does better — but the per-field coverage stayed, because it answers a
 * question the summary can't: a paste where "Address 0/84" is how you find out
 * the export changed shape, and without an address the matching falls back to
 * names alone and starts asking about people it shouldn't.
 */
function ParseQuality({ rows, skipped }) {
  const FIELDS = [
    ["name", "Name"], ["age", "Age"], ["birth_date", "Birthdate"],
    ["address", "Address"], ["phone", "Phone"], ["email", "Email"],
  ];
  const filled = {};
  for (const [k] of FIELDS) {
    filled[k] = rows.filter((r) => r[k] != null && String(r[k]).trim() !== "").length;
  }

  return (
    <div style={{ ...card, background: T.inset, padding: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em",
        textTransform: "uppercase", color: T.sub, marginBottom: 8 }}>
        What was read
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FIELDS.map(([k, label]) => (
          <Chip key={k}
            color={filled[k] ? T.green : T.gold}
            bg={filled[k] ? T.greenSoft : T.goldSoft}>
            {label} {filled[k]}/{rows.length}
          </Chip>
        ))}
      </div>
      {skipped.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13.5, color: T.gold, lineHeight: 1.55 }}>
          {skipped.length} line{skipped.length === 1 ? "" : "s"} couldn't be read:{" "}
          {skipped.slice(0, 3).map((x) => `"${x}"`).join(", ")}
          {skipped.length > 3 ? "…" : ""}
        </div>
      )}
    </div>
  );
}
