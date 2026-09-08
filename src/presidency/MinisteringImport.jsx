import { useState } from "react";
import { Upload, AlertTriangle, Check, X } from "lucide-react";
import Sheet from "../components/Sheet";
import { T, Btn, Chip } from "../components/ui";
import { pdfToLines } from "../lib/pdfLines";
import { readMinisteringPdf, districtGroups } from "../lib/domain/ministeringPdf";
import { matchCompanions } from "../lib/domain/ministeringImport";
import { applyImport, clearCompanionships } from "../lib/ministeringApply";

/**
 * Import ministering assignments from the LCR report.
 *
 * "id like to upload and put groups into districts. i know they are not
 *  assigned to a presidency member yet...i can assign the district to a
 *  presidency member later"
 *
 * So: districts are created by name and left without a leader. LCR has every
 * one of them as "Presidency Member: Unassigned", and writing that over a
 * leader the presidency has set in the app would undo their work on every
 * import.
 *
 * Nothing is written until Apply. The whole point of the review step is that
 * the column reading, which is the delicate part, is visible before it lands
 * rather than after.
 */
export default function MinisteringImport({ members, onClose, onDone }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [read, setRead] = useState(null);

  const pick = async (file) => {
    if (!file) return;
    setErr(""); setBusy("Reading the PDF…"); setRead(null);
    try {
      const lines = await pdfToLines(file);
      const { districts, problems } = readMinisteringPdf(lines);
      const shaped = districts.map((d) => {
        const { groups, duplicates } = districtGroups(d);
        return { name: d.name, groups, duplicates };
      });
      setRead({ districts: shaped, problems });
    } catch (e) {
      setErr(`Couldn't read that file: ${e.message}`);
    }
    setBusy("");
  };

  const apply = async () => {
    setBusy("Saving…"); setErr("");
    // Replace this import's companionships rather than stacking a second set
    // beside them. Households and their contact history survive: they're a
    // separate table, re-pointed by name.
    const cleared = await clearCompanionships(read.districts.map((d) => d.name));
    if (cleared.error) { setErr(cleared.error); setBusy(""); return; }

    const out = await applyImport({ districts: read.districts, members });
    setBusy("");
    if (out.error) { setErr(out.error); return; }
    onDone?.(out.done);
  };

  const totals = read ? {
    districts: read.districts.length,
    companionships: read.districts.reduce((n, d) => n + d.groups.length, 0),
    households: read.districts.reduce(
      (n, d) => n + d.groups.reduce((k, g) => k + g.households.length, 0), 0),
    duplicates: read.districts.flatMap((d) => d.duplicates),
    unmatched: [...new Set(read.districts.flatMap((d) => d.groups.flatMap(
      (g) => matchCompanions(g.companions, members)
        .filter((c) => !c.member).map((c) => c.name))))],
  } : null;

  return (
    <Sheet title="Import From LCR" onClose={onClose}>
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        In LCR: <strong>Ministering</strong> → the printer icon →{" "}
        <strong>Ministering Assignments</strong>. Save the PDF and choose it here.
      </div>

      <label style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        border: `1px dashed ${T.line}`, borderRadius: 12, padding: "18px 12px",
        cursor: "pointer", color: T.primaryDeep, fontWeight: 700, fontSize: 15,
      }}>
        <Upload size={16} />
        {busy || "Choose the PDF"}
        <input type="file" accept="application/pdf" style={{ display: "none" }}
          onChange={(e) => pick(e.target.files?.[0])} />
      </label>

      {err && <div style={{ fontSize: 13.5, color: T.red, lineHeight: 1.5 }}>{err}</div>}

      {read && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip color={T.sub} bg={T.inset}>{totals.districts} districts</Chip>
            <Chip color={T.sub} bg={T.inset}>{totals.companionships} companionships</Chip>
            <Chip color={T.sub} bg={T.inset}>{totals.households} households</Chip>
          </div>

          {read.problems.map((p, i) => (
            <Warn key={i}>{p.text}</Warn>
          ))}

          {totals.unmatched.length > 0 && (
            <Warn>
              {totals.unmatched.length} companion{totals.unmatched.length === 1 ? "" : "s"}{" "}
              {totals.unmatched.length === 1 ? "isn't" : "aren't"} on the roster, so
              they'll be listed by name without being linked to a member:{" "}
              {totals.unmatched.slice(0, 6).join(", ")}
              {totals.unmatched.length > 6 ? "…" : ""}
            </Warn>
          )}

          {totals.duplicates.length > 0 && (
            <Warn>
              Listed twice in LCR — worth fixing there rather than here:{" "}
              {totals.duplicates.join(", ")}
            </Warn>
          )}

          {/* Every pairing, before anything is written. The column reading is
              the delicate part of this, and a wrong pairing is invisible once
              it's in the database — it just looks like an assignment. */}
          <div style={{ maxHeight: "44vh", overflowY: "auto", display: "flex",
            flexDirection: "column", gap: 12 }}>
            {read.districts.map((d) => (
              <div key={d.name}>
                <div style={{
                  fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: T.sub, marginBottom: 6,
                }}>
                  {d.name} · {d.groups.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {d.groups.map((g, i) => (
                    <div key={i} data-import-group
                      style={{
                        background: T.inset, border: `1px solid ${T.lineSoft}`,
                        borderRadius: 10, padding: "8px 10px",
                      }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
                        {g.companions.join("  ·  ")}
                      </div>
                      {g.households.map((h) => (
                        <div key={h.name} style={{ fontSize: 13.5, color: T.sub, marginTop: 2 }}>
                          {h.name}
                        </div>
                      ))}
                      {!g.households.length && (
                        <div style={{ fontSize: 13, color: T.faint, marginTop: 2 }}>
                          No families listed
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.5 }}>
            Districts are created without a leader — you can assign each one to
            a presidency member afterwards. Nothing is deleted: a family that
            drops off the list keeps its record and its contact history.
          </div>

          <Btn kind="primary" size="lg" style={{ justifyContent: "center" }}
            disabled={!!busy} onClick={apply}>
            <Check size={16} />Import {totals.companionships} companionships
          </Btn>
        </>
      )}

      <Btn kind="plain" onClick={onClose}><X size={14} />Cancel</Btn>
    </Sheet>
  );
}

function Warn({ children }) {
  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-start",
      background: T.inset, border: `1px solid ${T.gold}`, borderRadius: 10,
      padding: "9px 10px", fontSize: 13.5, color: T.sub, lineHeight: 1.5,
    }}>
      <AlertTriangle size={14} style={{ color: T.gold, flex: "0 0 auto", marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}
