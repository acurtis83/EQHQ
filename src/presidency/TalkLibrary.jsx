import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Select, Chip, SectionTitle } from "../components/ui";

// Fallback only. The real list is discovered from the Church site so it can't
// offer a conference that hasn't been published yet.
function conferenceOptions() {
  const out = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1 >= 10 ? 10 : 4;
  for (let i = 0; i < 10; i++) {
    out.push({ year: y, month: m, label: `${m === 4 ? "April" : "October"} ${y}` });
    if (m === 10) m = 4;
    else { m = 10; y -= 1; }
  }
  return out;
}

export default function TalkLibrary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState(() => {
    const o = conferenceOptions()[0];
    return `${o.year}-${o.month}`;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState("");
  const [discovered, setDiscovered] = useState(null);

  const fallback = useMemo(conferenceOptions, []);
  const options = discovered?.length ? discovered : fallback;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("talks")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("slug", { ascending: true });
    if (error) setErr(error.message);
    else setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Ask the site which conferences exist. Quietly keep the computed list if
  // this fails — the function isn't available under plain `npm run dev`.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/.netlify/functions/conference-talks?list=1");
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !data.conferences?.length) return;
        setDiscovered(data.conferences);
        setPick(`${data.conferences[0].year}-${data.conferences[0].month}`);
      } catch {
        /* keep the fallback list */
      }
    })();
    return () => { alive = false; };
  }, []);

  const byConf = useMemo(() => {
    const m = {};
    for (const r of rows) (m[r.conf] ||= []).push(r);
    return m;
  }, [rows]);

  const fetchTalks = async () => {
    setBusy(true); setErr(""); setResult(null);
    const [year, month] = pick.split("-");
    try {
      const res = await fetch(`/.netlify/functions/conference-talks?year=${year}&month=${month}`);
      const data = await res.json();
      if (!res.ok) { setErr(data.error || `Request failed (${res.status})`); setBusy(false); return; }
      setResult(data);
    } catch (e) {
      setErr(
        "Couldn't reach the import function. It only exists once the site is deployed to Netlify — it won't work with `npm run dev` alone (use `netlify dev`)."
      );
    }
    setBusy(false);
  };

  const importTalks = async () => {
    if (!result?.talks?.length) return;
    setBusy(true);
    const payload = result.talks.map((t) => ({
      slug: t.slug, conf: t.conf, year: t.year, month: t.month,
      session: t.session, title: t.title, speaker: t.speaker, url: t.url,
    }));
    // slug is the primary key, so re-importing updates instead of duplicating.
    const { error } = await supabase.from("talks").upsert(payload, { onConflict: "slug" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setResult(null);
    setToast(`Imported ${payload.length} talks`);
    setTimeout(() => setToast(""), 2600);
    load();
  };

  return (
    <div>
      <SectionTitle sub="Reload after each General Conference. Talks come in with their real Gospel Library links.">
        Conference talks
      </SectionTitle>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 13.5, lineHeight: 1.6 }}>
          {err}
        </div>
      )}
      {toast && (
        <div style={{ ...card, background: T.greenSoft, borderColor: T.green, color: T.green, marginBottom: 12, fontSize: 13.5, padding: "10px 14px" }}>
          {toast}
        </div>
      )}

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 180px", minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
              Conference
            </span>
            <Select value={pick} onChange={setPick}>
              {options.map((o) => (
                <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>
              ))}
            </Select>
          </label>
          {discovered?.length > 0 && (
            <div style={{ fontSize: 12, color: T.faint, flex: "1 1 100%" }}>
              {discovered.length} conferences available, newest first.
            </div>
          )}
          <Btn kind="primary" onClick={fetchTalks} disabled={busy}>
            <Download size={15} />{busy ? "Fetching…" : "Fetch talks"}
          </Btn>
        </div>
      </div>

      {result && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{result.conf}</span>
            <Chip color={T.green} bg={T.greenSoft}>{result.count} talks</Chip>
            {result.lowConfidence > 0 && (
              <Chip color={T.gold} bg={T.goldSoft}>{result.lowConfidence} to check</Chip>
            )}
          </div>

          {result.lowConfidence > 0 && (
            <div style={{
              display: "flex", gap: 8, alignItems: "flex-start", background: T.goldSoft,
              borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 13, color: T.gold, lineHeight: 1.55,
            }}>
              <AlertTriangle size={15} style={{ flex: "0 0 auto", marginTop: 1 }} />
              <span>
                Some titles and speakers couldn't be split with certainty — they're marked below.
                Import anyway and fix the odd one when you assign it, or tell me and I'll adjust the parser.
              </span>
            </div>
          )}

          {result.skipped?.length > 0 && (
            <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 10, lineHeight: 1.55 }}>
              Skipped {result.skipped.length} procedural item{result.skipped.length === 1 ? "" : "s"}: {result.skipped.join(", ")}
            </div>
          )}

          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {result.talks.map((t) => (
              <div
                key={t.slug}
                style={{
                  background: t.confidence === "low" ? T.goldSoft : T.inset,
                  borderRadius: 10, padding: "9px 11px",
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>
                  {t.speaker || "—"}{t.session ? ` · ${t.session}` : ""}
                </div>
                {t.confidence === "low" && t.rawText && (
                  <div style={{ fontSize: 12, color: T.gold, marginTop: 4 }}>
                    page said: “{t.rawText}”
                  </div>
                )}
              </div>
            ))}
          </div>

          <Btn kind="primary" size="lg" style={{ justifyContent: "center", marginTop: 12 }} onClick={importTalks} disabled={busy}>
            {busy ? "Importing…" : `Add ${result.count} talks to the library`}
          </Btn>
        </div>
      )}

      {loading ? (
        <div style={{ color: T.sub, fontSize: 14, padding: 20, textAlign: "center" }}>Loading library…</div>
      ) : !rows.length ? (
        <div style={{ ...card, textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>No talks loaded yet</div>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6, lineHeight: 1.6 }}>
            Pick a conference above and fetch. Until then the teaching schedule falls
            back to the bundled April 2026 list.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.entries(byConf).map(([conf, list]) => (
            <div key={conf} style={{ ...card, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{conf}</span>
                <Chip>{list.length}</Chip>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {list.map((t) => (
                  <a
                    key={t.slug} href={t.url} target="_blank" rel="noreferrer"
                    style={{ textDecoration: "none", color: "inherit", display: "flex", gap: 8, alignItems: "baseline" }}
                  >
                    <span style={{ fontSize: 13.5, color: T.ink, fontWeight: 500 }}>{t.title}</span>
                    <span style={{ fontSize: 12.5, color: T.sub }}>{t.speaker}</span>
                    <ExternalLink size={12} style={{ color: T.faint, flex: "0 0 auto", marginLeft: "auto" }} />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
