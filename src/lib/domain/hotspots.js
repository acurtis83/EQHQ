/**
 * Finding the pockets.
 *
 * "maybe looking for hot spots or pockets. analyze which sections of the ward
 * are struggling or potentially need changes."
 *
 * The trap here is that clusters of struggling households are easy to find and
 * usually mean nothing. Group any set of points by proximity and you will get
 * groups; in a subdivision where the houses are forty feet apart, the biggest
 * cluster of struggling households is simply the densest street. That's a map
 * of where people live, drawn in red, and acting on it would send the
 * presidency to the busiest cul-de-sac in the ward every quarter.
 *
 * So a cluster here has to clear two bars, not one:
 *
 *   1. enough struggling households close enough together to be a place
 *      rather than a coincidence, and
 *   2. a struggling *rate* inside that place clearly above the ward's own
 *      rate — counting every household in the circle, not just the flagged
 *      ones.
 *
 * The second bar is what makes it an analysis. Six struggling families out of
 * eight on one street is a pocket. Six out of forty is that street being big.
 *
 * Pure arithmetic over {lat, lng, struggling}. No map library, no database —
 * the map draws what this returns, and this can be checked without a browser.
 */

/* -------------------------------- distance -------------------------------- */

const R_EARTH = 6371000; // metres
const rad = (d) => (d * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than flat Pythagoras on degrees: a degree of longitude in
 * Lehi is about 0.76 of a degree of latitude, so treating them as equal
 * stretches every east–west distance by a third and pulls streets into
 * clusters they aren't part of. At ward scale the earth's curvature is
 * irrelevant but that ratio very much isn't.
 */
export function metresBetween(a, b) {
  if (!isPlaced(a) || !isPlaced(b)) return Infinity;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Has this household actually got coordinates? */
export function isPlaced(h) {
  return (
    !!h &&
    Number.isFinite(Number(h.lat)) &&
    Number.isFinite(Number(h.lng)) &&
    // 0,0 is in the Atlantic and is what a failed geocode looks like when
    // somebody stores a default instead of a null.
    !(Number(h.lat) === 0 && Number(h.lng) === 0)
  );
}

/* -------------------------------- settings -------------------------------- */

/**
 * How close counts as the same pocket.
 *
 * 250m is a couple of blocks of suburban Lehi — near enough to walk between
 * on the same evening, which is the unit of action a pocket is for. Bigger
 * and a pocket stops suggesting anything you'd do differently.
 */
export const RADIUS_M = 250;

/** Fewer than this is an anecdote, not a pocket. */
export const MIN_CLUSTER = 3;

/**
 * How much worse than the ward a pocket has to be.
 *
 * 1.5 means half again the ward's struggling rate. Set at 1.0 every cluster
 * qualifies and the analysis says nothing; set at 3 nothing ever qualifies in
 * a ward that's broadly doing fine.
 */
export const MIN_LIFT = 1.5;

/* -------------------------------- clustering ------------------------------ */

/**
 * Single-link clustering: two struggling households are in the same pocket if
 * they're within `radius` of each other, and that chains — A near B near C is
 * one pocket even if A and C are further apart than the radius.
 *
 * Chaining is right for streets. A pocket is usually a road, and a road is a
 * line of houses each near the next but with ends well apart; a rule that
 * demanded every pair be close would cut it into thirds.
 */
export function clusterPoints(points = [], radius = RADIUS_M) {
  const pts = (points || []).filter(isPlaced);
  const seen = new Set();
  const out = [];

  for (let i = 0; i < pts.length; i++) {
    if (seen.has(i)) continue;
    const group = [i];
    seen.add(i);
    // Breadth-first over the neighbours, and the neighbours' neighbours.
    for (let g = 0; g < group.length; g++) {
      for (let j = 0; j < pts.length; j++) {
        if (seen.has(j)) continue;
        if (metresBetween(pts[group[g]], pts[j]) <= radius) {
          seen.add(j);
          group.push(j);
        }
      }
    }
    out.push(group.map((k) => pts[k]));
  }
  return out;
}

/** Mean position. Fine at ward scale; nobody's pocket crosses a pole. */
export function centroid(points = []) {
  const pts = (points || []).filter(isPlaced);
  if (!pts.length) return null;
  return {
    lat: pts.reduce((a, p) => a + Number(p.lat), 0) / pts.length,
    lng: pts.reduce((a, p) => a + Number(p.lng), 0) / pts.length,
  };
}

/**
 * How far out the pocket reaches: the furthest member from the middle, with a
 * floor so two houses next door to each other still describe a circle you can
 * count the neighbours inside.
 */
export function spread(points = [], floor = 120) {
  const c = centroid(points);
  if (!c) return 0;
  const far = points.reduce((m, p) => Math.max(m, metresBetween(c, p)), 0);
  return Math.max(far, floor);
}

/* --------------------------------- the rate ------------------------------- */

/** The ward's own struggling rate — the baseline everything is judged against. */
export function baseRate(households = []) {
  const placed = (households || []).filter(isPlaced);
  if (!placed.length) return 0;
  return placed.filter((h) => h.struggling).length / placed.length;
}

/**
 * The pockets, worst first.
 *
 * Each one reports what it's made of and why it qualified, because "District 2
 * has a pocket" is not something anybody should have to take on trust: the
 * count, the rate, the ward rate and the households are all on the result so
 * the screen can show its working.
 */
export function findHotspots(households = [], opts = {}) {
  const radius = opts.radius ?? RADIUS_M;
  const minSize = opts.minSize ?? MIN_CLUSTER;
  const minLift = opts.minLift ?? MIN_LIFT;

  const placed = (households || []).filter(isPlaced);
  const ward = baseRate(placed);
  const struggling = placed.filter((h) => h.struggling);

  const clusters = clusterPoints(struggling, radius);
  const out = [];

  for (const group of clusters) {
    if (group.length < minSize) continue;

    const mid = centroid(group);
    const reach = spread(group);

    // Everybody in the circle, not just the flagged ones. This is the step
    // that tells a bad street from a busy one.
    const inside = placed.filter((h) => metresBetween(mid, h) <= reach);
    const rate = inside.length ? group.length / inside.length : 0;
    // A ward with no struggling households at all has a base rate of 0, and
    // dividing by it would make every pocket infinitely bad. With no baseline
    // there's nothing to be worse than, so lift is 0 and nothing qualifies.
    const lift = ward > 0 ? rate / ward : 0;

    if (lift < minLift) continue;

    out.push({
      centre: mid,
      radiusM: Math.round(reach),
      households: group,
      count: group.length,
      inRadius: inside.length,
      rate,
      wardRate: ward,
      lift,
    });
  }

  // Worst first, and "worst" is how concentrated it is rather than how big:
  // a small street where nearly everybody is struggling needs the presidency
  // before a large one where a quarter are.
  return out.sort((a, b) => b.lift - a.lift || b.count - a.count);
}

/**
 * The households with no coordinates.
 *
 * Surfaced rather than silently dropped: an analysis run over half the ward
 * that looks like an analysis of the ward is worse than no analysis, and the
 * only way anybody would notice is if the screen says so.
 */
export function unplaced(households = []) {
  return (households || []).filter((h) => h && h.active !== false && !isPlaced(h));
}
