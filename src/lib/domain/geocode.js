/**
 * Turning street addresses into coordinates, once.
 *
 * This is the one part of the app that sends anything about a ward family to
 * somebody else's computer, so the rules are written down here rather than
 * being spread through a component:
 *
 *   * It only ever runs when somebody presses the button. Nothing geocodes on
 *     load, on save, or in the background.
 *   * An address that already has coordinates is never sent again. That's what
 *     `geocode_query` is for: it records the exact string that was looked up,
 *     so an address that hasn't been edited can be recognised and skipped.
 *   * A failure is remembered too. One unfixable address must not be retried
 *     on every run — it burns a rate limit that belongs to a free service and
 *     achieves nothing.
 *   * Only the address goes. Not the family's name, not the notes, not who
 *     ministers to them.
 *
 * The service is Nominatim, OpenStreetMap's geocoder: no account, no API key,
 * no billing, and a published usage policy that asks for at most one request a
 * second. `PAUSE_MS` is that promise, not a guess — see queueFor().
 */

/** Nominatim asks for no more than one request per second. */
export const PAUSE_MS = 1100;

/** What the presidency is told before anything is sent. Shown, not buried. */
export const PRIVACY_NOTE =
  "Street addresses are sent to OpenStreetMap's public lookup service to find " +
  "their coordinates. Names, notes and ministering assignments are never sent. " +
  "Each address is looked up once and the result is kept, so this only runs " +
  "for households you've added or edited.";

export const STATUS = { OK: "ok", NOT_FOUND: "not_found", FAILED: "failed" };

/**
 * The ward's town, appended when an address doesn't name one.
 *
 * People type "412 W Sage Vista Dr" because everyone they know lives in Lehi.
 * A bare street number matches a hundred places and the geocoder is entitled
 * to pick any of them, which is how a pin ends up in Ohio.
 */
export const DEFAULT_REGION = "Lehi, Utah, USA";

/**
 * The exact string that gets looked up.
 *
 * Also the cache key, which is why it's built by a pure function: the decision
 * "have we already asked about this?" has to be made the same way every time,
 * and a rule that lives inside an async loop can't be tested.
 */
export function queryFor(address, region = DEFAULT_REGION) {
  const a = String(address || "").trim().replace(/\s+/g, " ");
  if (!a) return "";
  // Don't bolt the town on twice. Somebody typing the full address should get
  // exactly what they typed.
  const hasRegion = /\b(lehi|utah|\but\b|usa)\b/i.test(a);
  return hasRegion ? a : `${a}, ${region}`;
}

/**
 * Does this household need sending?
 *
 * Four ways the answer is no, and the interesting one is the last: an address
 * that was looked up and not found stays not-found until somebody edits it.
 * Editing changes the query, which no longer matches `geocode_query`, which is
 * what lets a corrected address through without a "retry" button existing.
 */
export function needsGeocode(h, region = DEFAULT_REGION) {
  if (!h || h.active === false) return false;
  const q = queryFor(h.address, region);
  if (!q) return false;                     // nothing to look up
  if (h.geocode_query === q) return false;  // asked before, same address
  return true;
}

/** Which households a run would actually send, in a stable order. */
export function queueFor(households = [], region = DEFAULT_REGION) {
  return (households || [])
    .filter((h) => needsGeocode(h, region))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

/** Roughly how long a run will take, so the button can say so before it starts. */
export function estimateMs(count) {
  return Math.max(0, Number(count) || 0) * PAUSE_MS;
}

export function estimateLabel(count) {
  const n = Math.max(0, Number(count) || 0);
  if (!n) return "";
  const secs = Math.ceil(estimateMs(n) / 1000);
  if (secs < 90) return `about ${secs} seconds`;
  return `about ${Math.ceil(secs / 60)} minutes`;
}

/**
 * The request URL.
 *
 * `limit=1` because we take the best match or nothing — offering the
 * presidency a list of five possible Sage Vista Drives to choose between is a
 * job nobody wants. `format=jsonv2` for the structured fields.
 */
export function urlFor(query) {
  const q = String(query || "").trim();
  if (!q) return "";
  return (
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
    encodeURIComponent(q)
  );
}

/**
 * What came back.
 *
 * Nominatim answers with an array, `[]` when it found nothing. A result whose
 * coordinates don't parse as numbers is treated as no result rather than
 * stored — a pin at NaN, NaN silently vanishes off the map and looks like a
 * household that was never geocoded, which is the confusing failure.
 */
export function parseResult(json) {
  const first = Array.isArray(json) ? json[0] : null;
  if (!first) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // The Atlantic null island: what a geocoder returns when it has given up
  // but not admitted it.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng, label: String(first.display_name || "") };
}

/**
 * How a result — or the lack of one — is written back.
 *
 * `geocode_query` is set on every outcome including the failures, and that's
 * the whole cache: it records what was asked, not what was found.
 */
export function fieldsFor(query, result, nowIso) {
  const base = { geocode_query: String(query || ""), geocoded_at: nowIso || null };
  if (!result) return { ...base, geocode_status: STATUS.NOT_FOUND, lat: null, lng: null };
  return { ...base, geocode_status: STATUS.OK, lat: result.lat, lng: result.lng };
}

/**
 * A run that couldn't reach the service at all is different from one that
 * asked and got nothing: the address might be perfect and the wifi might be
 * off. Not remembering the query means it'll be tried again next time, which
 * is what you want for a network failure and not what you want for a bad
 * address.
 */
export function failureFields() {
  return { geocode_status: STATUS.FAILED };
}
