import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Upload, Search, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { BANDS, OFFICES, bandForAge, lastNameOf, parseRoster } from "../lib/domain/roster";
import { T, card, Btn, Input, Select, Chip, SectionTitle, Empty } from "../components/ui";

const blank = {
  name: "", age: "", phone: "", email: "",
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

  const load = async () => {
    setLoading(true);
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

  const runPaste = (text) => {
    setPasteText(text);
    setPastePreview(parseRoster(text));
  };

  const commitPaste = async () => {
    if (!pastePreview.length) return;
    const { error } = await supabase.from("members").insert(pastePreview);
    if (error) setErr(error.message);
    else {
      setPasteOpen(false);
      setPasteText("");
      setPastePreview([]);
      load();
    }
  };

  return (
    <div>
      <SectionTitle sub="The roster other sections reference — ministering, teaching, and callings all point back here.">
        Quorum Roster
      </SectionTitle>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 13.5 }}>
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
        <Btn kind="soft" onClick={() => setPasteOpen(true)}><Upload size={15} />Paste directory</Btn>
        <Btn kind="primary" onClick={() => setEditing({ ...blank })}><Plus size={15} />Add</Btn>
      </div>

      {loading ? (
        <div style={{ color: T.sub, fontSize: 14, padding: 20, textAlign: "center" }}>Loading roster…</div>
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
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{r.name}</span>
                  {r.age != null && <Chip color={T.sub} bg={T.inset}>{r.age}</Chip>}
                  {r.office && <Chip>{r.office}</Chip>}
                  {!r.active && <Chip color={T.red} bg={T.redSoft}>Inactive</Chip>}
                </div>
                {(r.calling || r.phone) && (
                  <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>
                    {[r.calling, r.phone].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <Btn size="sm" kind="plain" onClick={() => setEditing({ ...r, age: r.age ?? "" })}>Edit</Btn>
              <Btn size="sm" kind="plain" onClick={() => remove(r)}><Trash2 size={14} /></Btn>
            </div>
          ))}
          {!visible.length && (
            <div style={{ color: T.sub, fontSize: 14, padding: 20, textAlign: "center" }}>
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
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Phone">
              <Input value={editing.phone || ""} onChange={(v) => setEditing({ ...editing, phone: v })} />
            </Field>
            <Field label="Email">
              <Input value={editing.email || ""} onChange={(v) => setEditing({ ...editing, email: v })} />
            </Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.ink, fontWeight: 600 }}>
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
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>
            Paste straight from an LDS Tools or Ward Directory export. It reads
            name, age, birth date, phone, email, and priesthood office.
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => runPaste(e.target.value)}
            rows={7}
            placeholder="Curtis, Andrew  M  42  3 Feb 1983  (801) 874-4085  Elder"
            style={{
              background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10,
              padding: 11, fontSize: 14, color: T.ink, width: "100%",
              fontFamily: "ui-monospace, monospace", resize: "vertical",
            }}
          />
          {pastePreview.length > 0 && (
            <div style={{ ...card, background: T.inset, padding: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
                Found {pastePreview.length} {pastePreview.length === 1 ? "brother" : "brethren"}
              </div>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.7, maxHeight: 150, overflowY: "auto" }}>
                {pastePreview.slice(0, 20).map((p, i) => (
                  <div key={i}>{p.name}{p.age ? ` · ${p.age}` : ""}{p.office ? ` · ${p.office}` : ""}</div>
                ))}
                {pastePreview.length > 20 && <div style={{ color: T.faint }}>+{pastePreview.length - 20} more…</div>}
              </div>
            </div>
          )}
          <Btn
            kind="primary" size="lg" onClick={commitPaste}
            disabled={!pastePreview.length} style={{ justifyContent: "center" }}
          >
            Add {pastePreview.length || ""} to roster
          </Btn>
        </Sheet>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
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
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{title}</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>
        {children}
      </div>
    </div>
  );
}
