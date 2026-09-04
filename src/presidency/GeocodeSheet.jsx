import { useMemo, useState } from "react";
import { X, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Btn } from "../components/ui";
import {
  PAUSE_MS, PRIVACY_NOTE, queryFor, queueFor, urlFor, parseResult,
  fieldsFor, failureFields, estimateLabel,
} from "../lib/domain/geocode";

/**
 * Putting households on the map.
 *
 * This is the only screen in the app that sends anything about a ward family
 * somewhere else, so it says so before it does it, in the same words every
 * time (PRIVACY_NOTE lives in the domain module, not here). Nothing runs on
 * open — the sheet explains, shows exactly how many addresses would go, and
 * waits.
 *
 * The pause between requests is OpenStreetMap's published rate limit rather
 * than politeness. Running flat out would get the ward's IP blocked from a
 * free service that costs nothing and asks for one thing.
 *
 * Progress is per-household and the run can be stopped part way. Everything
 * already looked up is saved as it goes, so stopping loses nothing and a
 * second run picks up where this one left off — that's what makes the queue
 * safe to interrupt on a phone that locks its screen.
 */
export default function GeocodeSheet({ households = [], onClose, onDone }) {
  const queue = useMemo(() => queueFor(households), [households]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [found, setFound] = useState(0);
  const [missed, setMissed] = useState(0);
  const [failed, setFailed] = useState(false);
  const [stop, setStop] = useState(false);
  const [finished, setFinished] = useState(false);

  const run = async () => {
    setRunning(true); setStop(false); setFailed(false);
    let stopped = false;

    for (let i = 0; i < queue.length; i++) {
      if (stopped) break;
      const h = queue[i];
      const q = queryFor(h.address);

      try {
        const res = await fetch(urlFor(q), {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const hit = parseResult(await res.json());

        await supabase.from("ministering_households")
          .update(fieldsFor(q, hit, new Date().toISOString()))
          .eq("id", h.id);

        if (hit) setFound((n) => n + 1); else setMissed((n) => n + 1);
      } catch {
        // Couldn't reach the service. Recorded as a failure WITHOUT the query,
        // so this address is tried again next time — the address may be
        // perfect and the wifi may not be.
        await supabase.from("ministering_households")
          .update(failureFields()).eq("id", h.id);
        setFailed(true);
      }

      setDone(i + 1);
      // Read through a setter so pressing Stop mid-run is seen on the very
      // next iteration rather than after the whole queue has drained.
      setStop((s) => { stopped = s; return s; });
      if (i < queue.length - 1 && !stopped) {
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    }

    setRunning(false);
    setFinished(true);
  };

  return (
    <div
      onClick={running ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.panel, width: "100%", maxWidth: 520,
          borderRadius: "18px 18px 0 0", padding: 16,
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 17.5, fontWeight: 800, color: T.ink }}>
            Put households on the map
          </div>
          {!running && (
            <Btn size="sm" kind="ghost" onClick={onClose} aria-label="Close"><X size={16} /></Btn>
          )}
        </div>

        {/* The warning is shown, not linked to and not collapsed. Somebody
            deciding whether to send the ward's addresses to a third party
            should not have to go looking for what that means. */}
        <div style={{
          display: "flex", gap: 9, padding: 11, borderRadius: 12,
          background: T.lineSoft, marginBottom: 14,
        }}>
          <ShieldCheck size={16} style={{ flex: "0 0 auto", color: T.sub, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.45 }}>{PRIVACY_NOTE}</div>
        </div>

        {!queue.length ? (
          <div style={{ fontSize: 14, color: T.sub }}>
            Every household with an address is already on the map. Add an address to a
            household, or edit one that's wrong, and it'll show up here.
          </div>
        ) : !finished ? (
          <>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 4 }}>
              <strong>{queue.length}</strong> address{queue.length === 1 ? "" : "es"} to look up
              {" — "}{estimateLabel(queue.length)}.
            </div>
            <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 14 }}>
              One a second, which is what the service asks for. You can stop part way;
              anything already found is saved.
            </div>

            {running && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  height: 6, borderRadius: 3, background: T.lineSoft, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", width: `${(done / queue.length) * 100}%`,
                    background: T.primary, transition: "width 200ms",
                  }} />
                </div>
                <div style={{ fontSize: 12.5, color: T.sub, marginTop: 6 }}>
                  {done} of {queue.length} · {found} found
                  {missed > 0 && ` · ${missed} not found`}
                </div>
              </div>
            )}

            {running ? (
              <Btn kind="ghost" onClick={() => setStop(true)}>Stop</Btn>
            ) : (
              <Btn kind="primary" onClick={run}>
                <MapPin size={15} /> Look up {queue.length} address{queue.length === 1 ? "" : "es"}
              </Btn>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 14.5, color: T.ink, marginBottom: 6 }}>
              {found} household{found === 1 ? "" : "s"} placed on the map.
            </div>
            {missed > 0 && (
              <div style={{ fontSize: 13, color: T.sub, marginBottom: 6 }}>
                {missed} address{missed === 1 ? " wasn't" : "es weren't"} recognised. Check
                the spelling on those households — editing an address is what queues it to
                be looked up again.
              </div>
            )}
            {failed && (
              <div style={{ fontSize: 13, color: "var(--red, #c0392b)", marginBottom: 6 }}>
                Some lookups couldn't reach the service. Those will be tried again next time.
              </div>
            )}
            <Btn kind="primary" onClick={onDone} style={{ marginTop: 10 }}>Done</Btn>
          </>
        )}
      </div>
    </div>
  );
}
