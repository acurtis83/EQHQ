import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importLegacy, summarizeLegacy } from "../lib/importLegacy";
import { T, card, Btn, SectionTitle } from "../components/ui";

export default function ImportLegacy() {
  const fileRef = useRef(null);
  const [raw, setRaw] = useState(null);
  const [summary, setSummary] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(""); setReport(null);
    try {
      const parsed = JSON.parse(await file.text());
      setRaw(parsed);
      setSummary(summarizeLegacy(parsed));
    } catch {
      setErr("That doesn't look like a valid backup file.");
      setRaw(null); setSummary(null);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const run = async () => {
    if (!raw) return;
    setBusy(true); setErr("");
    try {
      setReport(await importLegacy(raw));
    } catch (e2) {
      setErr(String(e2?.message || e2));
    }
    setBusy(false);
  };

  return (
    <div>
      <SectionTitle sub="One-time move of your old Planner data into the new tables.">
        Import from the old app
      </SectionTitle>

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.65 }}>
          In the old app, open <strong style={{ color: T.ink }}>Settings → Download backup</strong> to
          get a <code>.json</code> file, then choose it here. You'll see what was found before anything is written.
        </div>
        <div style={{ marginTop: 12 }}>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={pick} style={{ display: "none" }} />
          <Btn kind="soft" onClick={() => fileRef.current?.click()}>
            <Upload size={15} />Choose backup file
          </Btn>
        </div>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 13.5 }}>
          {err}
        </div>
      )}

      {summary && !report && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Found in the backup</div>
          <Rows rows={Object.entries(summary)} />
          <div style={{ fontSize: 13, color: T.sub, marginTop: 12, lineHeight: 1.6 }}>
            Importing adds these as new rows. If you've already imported once, clear the
            tables first or you'll end up with duplicates.
          </div>
          <Btn kind="primary" size="lg" onClick={run} disabled={busy} style={{ marginTop: 12, justifyContent: "center", width: "100%" }}>
            {busy ? "Importing…" : "Import into the new app"}
          </Btn>
        </div>
      )}

      {report && (
        <div style={{ ...card }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Import complete</div>
          <Rows rows={Object.entries(report.inserted)} />
          {report.errors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.red, marginBottom: 5 }}>
                {report.errors.length} problem{report.errors.length === 1 ? "" : "s"}
              </div>
              <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6 }}>
                {report.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Rows({ rows }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: T.sub }}>{k.replace(/_/g, " ")}</span>
          <span style={{ color: T.ink, fontWeight: 700 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
