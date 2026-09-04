import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Flame } from "lucide-react";
import { T, card, Btn, Empty } from "../components/ui";
import { findHotspots, isPlaced, unplaced } from "../lib/domain/hotspots";
import { companionNames, FLAG_LABEL } from "../lib/domain/ministering";

/**
 * The ward, drawn.
 *
 * "maybe looking for hot spots or pockets. analyze which sections of the ward
 *  are struggling or potentially need changes."
 *
 * Two things on one map, and they answer different questions:
 *
 *   * a pin per household, coloured either by how it's doing or by which
 *     district covers it — the second is the "who ministers to whom" view, and
 *     it's how you see that a companionship has been given three houses on
 *     opposite sides of the ward
 *   * a ring round each pocket the analysis found, with its working underneath
 *
 * All the arithmetic is in domain/hotspots.js. This file draws what it's given
 * and knows nothing about what makes a household struggle — which is why the
 * pocket list can show its reasoning: it's reading the same numbers the
 * analysis used, not recomputing them differently.
 */

const LEVEL_COLOR = {
  ok: "#1c8a4a",
  watch: "#b07d20",
  concern: "#c0392b",
};

// Distinct enough to tell apart on a phone in sunlight, and deliberately not
// the health colours — a district being blue must never read as "fine".
const DISTRICT_COLORS = ["#2f6fd0", "#7a3fbf", "#0f8f8f", "#c2571c", "#5a6b7a"];

const LEHI = [40.3916, -111.8508];

/**
 * Put the rings and the pins on a layer.
 *
 * Split out of the component and exported so it can be run against a real
 * Leaflet in a real browser — see tests/map-draw.py. It can't be checked in
 * jsdom: the component loads Leaflet with a dynamic import, and in a jsdom
 * test that promise doesn't settle before the assertions run, so the whole of
 * this used to be dead code as far as the test suite was concerned. A
 * mistyped option or a renamed Leaflet method would have reached the ward.
 *
 * Takes `L` as an argument rather than importing it, so the caller decides
 * when the library is paid for.
 */
export function drawLayers(L, layer, {
  placed = [], spots = [], colorBy = "health", colorForDistrict = {}, onPick,
} = {}) {
  layer.clearLayers();

  // The pockets go down first so the pins sit on top of their rings.
  for (const s of spots) {
    L.circle([s.centre.lat, s.centre.lng], {
      radius: s.radiusM,
      color: "#c0392b", weight: 2, opacity: 0.75,
      fillColor: "#c0392b", fillOpacity: 0.09,
    }).addTo(layer);
  }

  for (const p of placed) {
    const colour = colorBy === "district"
      ? (colorForDistrict[p.district_id] || "#8a8f98")
      : LEVEL_COLOR[p.level] || LEVEL_COLOR.ok;
    L.circleMarker([Number(p.lat), Number(p.lng)], {
      radius: 7, weight: 2, color: "#fff", opacity: 1,
      fillColor: colour, fillOpacity: 0.95,
    })
      .addTo(layer)
      .on("click", () => onPick?.(p));
  }

  return { rings: spots.length, pins: placed.length };
}

export default function MinisteringMap({
  points = [], districtsById = {}, compsById = {}, membersById = {}, onGeocode,
}) {
  const holder = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [colorBy, setColorBy] = useState("health");
  const [picked, setPicked] = useState(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const placed = useMemo(() => points.filter(isPlaced), [points]);
  const missing = useMemo(() => unplaced(points), [points]);
  const spots = useMemo(() => findHotspots(placed), [placed]);

  const districtIds = useMemo(
    () => [...new Set(placed.map((p) => p.district_id).filter(Boolean))],
    [placed]
  );
  const colorForDistrict = useMemo(() => {
    const m = {};
    districtIds.forEach((id, i) => { m[id] = DISTRICT_COLORS[i % DISTRICT_COLORS.length]; });
    return m;
  }, [districtIds]);

  // Leaflet is loaded on demand rather than imported at the top of the file.
  // It's the largest thing in the app and every other screen would carry it in
  // the initial bundle for a map most sessions never open.
  useEffect(() => {
    let dead = false;
    if (!placed.length) return undefined;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        if (dead || !holder.current) return;

        if (!map.current) {
          map.current = L.map(holder.current, {
            zoomControl: true,
            attributionControl: true,
          }).setView(LEHI, 14);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap",
          }).addTo(map.current);
          layer.current = L.layerGroup().addTo(map.current);
        }
        if (!dead) { setReady(true); draw(L); }
      } catch {
        // No map library, no map — but the pockets below are arithmetic and
        // still worth showing, so this fails to a list rather than to nothing.
        if (!dead) setFailed(true);
      }
    })();

    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.length]);

  // Redraw when the data or the colouring changes. Separate from setup so
  // switching between health and districts doesn't tear the map down.
  useEffect(() => {
    if (!ready || !map.current) return;
    import("leaflet").then(({ default: L }) => draw(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, colorBy, placed, spots]);

  function draw(L) {
    if (!layer.current || !map.current) return;
    drawLayers(L, layer.current, {
      placed, spots, colorBy, colorForDistrict, onPick: setPicked,
    });
    const bounds = L.latLngBounds(placed.map((p) => [Number(p.lat), Number(p.lng)]));
    if (bounds.isValid()) map.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
  }

  if (!placed.length) {
    return (
      <div style={{ ...card, padding: 18 }}>
        <Empty
          title="Nothing on the map yet"
          hint="Households need an address before they can be placed."
        />
        <Btn kind="primary" onClick={onGeocode} style={{ marginTop: 12 }}>
          <MapPin size={15} /> Put households on the map
        </Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <Btn size="sm" kind={colorBy === "health" ? "primary" : "ghost"}
          onClick={() => setColorBy("health")}>
          How they're doing
        </Btn>
        <Btn size="sm" kind={colorBy === "district" ? "primary" : "ghost"}
          onClick={() => setColorBy("district")}>
          By district
        </Btn>
      </div>

      {!failed ? (
        <div
          ref={holder}
          data-map
          style={{
            height: 340, borderRadius: 16, overflow: "hidden",
            border: `1px solid ${T.line}`, marginBottom: 10,
            background: T.lineSoft,
          }}
        />
      ) : (
        <div style={{ ...card, padding: 12, marginBottom: 10, fontSize: 13.5, color: T.sub }}>
          The map couldn't load, but the analysis below doesn't need it.
        </div>
      )}

      {/* The legend says what a colour means. Without it the map is decoration:
          three shades of dot and no way to know which is bad. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12, fontSize: 12.5 }}>
        {colorBy === "health"
          ? [["ok", "On track"], ["watch", "Watch"], ["concern", "Needs attention"]].map(([k, l]) => (
              <Key key={k} colour={LEVEL_COLOR[k]} label={l} />
            ))
          : districtIds.map((id) => (
              <Key key={id} colour={colorForDistrict[id]}
                label={districtsById[id]?.name || "District"} />
            ))}
      </div>

      {missing.length > 0 && (
        <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 12 }}>
          {missing.length} household{missing.length === 1 ? "" : "s"} without an address
          {missing.length === 1 ? " isn't" : " aren't"} shown, and {missing.length === 1 ? "isn't" : "aren't"} counted
          in the analysis below.
        </div>
      )}

      {picked && (
        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>{picked.name}</div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>
            {picked.address || "No address"}
          </div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 6 }}>
            Ministered to by{" "}
            <strong>
              {companionNames(compsById[picked.companionship_id], membersById).join(" & ")
                || "nobody yet"}
            </strong>
            {districtsById[picked.district_id]?.name
              ? ` · ${districtsById[picked.district_id].name}`
              : ""}
          </div>
          {picked.flags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
              {picked.flags.map((f) => (
                <span key={f} style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                  background: T.lineSoft, color: T.sub,
                }}>
                  {FLAG_LABEL[f]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The analysis. Every number it used is on screen, because "District 2
          has a pocket" is not a thing anybody should have to take on trust. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Flame size={15} style={{ color: T.sub }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
          textTransform: "uppercase", color: T.sub }}>
          Pockets
        </span>
      </div>

      {!spots.length ? (
        <div style={{ ...card, padding: 13, fontSize: 13.5, color: T.sub, lineHeight: 1.5 }}>
          No pocket stands out. Households needing attention are spread across the ward
          rather than concentrated in one part of it — which is a good sign, and also
          means there's no single street to send somebody down.
        </div>
      ) : (
        spots.map((s, i) => (
          <div key={i} data-hotspot style={{ ...card, padding: 13, marginBottom: 9 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>
              {s.count} households needing attention, close together
            </div>
            <div style={{ fontSize: 13, color: T.sub, marginTop: 4, lineHeight: 1.5 }}>
              {s.count} of the {s.inRadius} households within about {s.radiusM}m
              {" "}({Math.round(s.rate * 100)}%), against {Math.round(s.wardRate * 100)}% across
              the ward — {s.lift.toFixed(1)}× the ward rate.
            </div>
            <div style={{ fontSize: 13, color: T.sub, marginTop: 6 }}>
              {s.households.map((h) => h.name).join(", ")}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Key({ colour, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.sub }}>
      <span style={{
        width: 10, height: 10, borderRadius: 5, background: colour,
        border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,0.12)",
      }} />
      {label}
    </span>
  );
}
