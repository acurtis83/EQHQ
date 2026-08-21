// Roster parsing.
//
// Directory exports vary — tabs, runs of spaces, one record per line or spread
// over several. So fields are identified by SHAPE, not by column position:
// an email looks like an email wherever it sits, a phone like a phone, a
// birthdate like a date, an address starts with a house number. Whatever is
// left over is the name.
//
// That survives column reordering and missing fields, which fixed-position
// parsing does not.

export const OFFICES = [
  "High Priest", "Elder", "Priest", "Teacher",
  "Deacon", "Unordained", "Bishop", "Patriarch", "Seventy",
];

// Five bands, no overlap — 65 belongs to "65+", not to the band below.
export const BANDS = ["18–35", "36–45", "46–55", "56–64", "65+", "Unknown"];

export function bandForAge(a) {
  if (a == null || isNaN(a)) return "Unknown";
  if (a <= 35) return "18–35";
  if (a <= 45) return "36–45";
  if (a <= 55) return "46–55";
  if (a <= 64) return "56–64";
  return "65+";
}

// Counts computed from age rather than the stored band, so rows written under
// the old four-band scheme still land in the right bucket.
export function bandCounts(members) {
  const out = {};
  for (const b of BANDS) out[b] = 0;
  for (const m of members || []) {
    const b = bandForAge(m.age == null ? null : Number(m.age));
    out[b] = (out[b] || 0) + 1;
  }
  return out;
}

// Turn "Last, First Middle" (or "Last, First, Middle") into "First Last"
export function normalizeName(raw) {
  const s = (raw || "").replace(/\s+/g, " ").trim();
  if (!s.includes(",")) return s;
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  const last = parts[0] || "";
  const rest = parts.slice(1).join(" ").trim();
  const first = rest.split(" ")[0] || "";
  return (first ? first + " " : "") + last;
}

export function lastNameOf(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  return s.includes(",") ? s.split(",")[0].trim() : s.split(/\s+/).pop();
}

/* ------------------------------ field shapes ------------------------------ */

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RE_PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
// "3 Feb 1983", "Feb 3, 1983", "3 February 1983", "02/03/1983", "1983-02-03".
// The month must be a real month name — an earlier version allowed any word,
// which happily read "Andrew 42 1234" as a date and ate the name and age.
const MONTHS =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|" +
  "Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const RE_DATE = new RegExp(
  "(?:\\b\\d{1,2}\\s+(?:" + MONTHS + ")\\.?\\s+\\d{4}\\b)" +      // 3 Feb 1983
  "|(?:\\b(?:" + MONTHS + ")\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b)" +   // Feb 3, 1983
  "|(?:\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b)" +                     // 02/03/1983
  "|(?:\\b\\d{4}-\\d{2}-\\d{2}\\b)",                                  // 1983-02-03
  "i"
);
// A street address: house number, then up to a few words, then a street word.
// The lookahead stops it starting on an age and swallowing the number that
// follows ("42 1234 N Holbrook Way" must not parse as one address).
const STREET =
  "N|S|E|W|NE|NW|SE|SW|North|South|East|West|St|Street|Ave|Avenue|Rd|Road|Dr|Drive|" +
  "Ln|Lane|Ct|Court|Cir|Circle|Blvd|Way|Pl|Place|Ter|Terrace|Pkwy|Trail|Trl|Loop|Hwy";
const RE_ADDRESS = new RegExp(
  "\\b\\d{1,6}\\s+(?!\\d)" +                    // house number, not followed by another number
  "(?:[\\w.'-]+\\s+){0,4}" +                       // a few street-name words
  "(?:" + STREET + ")\\b" +                          // the street word itself
  "[^,\\n]*" +                                       // rest of line 1
  "(?:,\\s*[A-Za-z .]+)?" +                          // , City
  "(?:,?\\s*[A-Z]{2})?" +                            // , ST
  "(?:\\s*\\d{5}(?:-\\d{4})?)?",                 // ZIP
  "i"
);

// "Lehi UT 84048", "Lehi, UT 84048" — the second line of an address. Without
// this it reads as a person's name and splits one member into two records,
// stranding their phone and email on the phantom second row.
const RE_CITY_STATE_ZIP =
  /^[A-Za-z][A-Za-z .'-]*,?\s+[A-Z]{2}\.?[,]?\s+\d{5}(?:-\d{4})?\.?$/;

const SKIP =
  /^(ward directory|directory|members?|household|description|edit report|count:|search|your report|preferred name|priesthood|birth ?date|name\b|age\b|address\b|phone\b|e-?mail\b|page \d+|printed)/i;

/**
 * Pull every recognisable field out of one blob of text.
 * Order-independent: each match is removed as it's found, and the remainder
 * becomes the name.
 */
export function parseRecord(line) {
  let rest = String(line || "").replace(/\t/g, "  ").replace(/\s+/g, " ").trim();
  if (!rest) return null;

  const take = (re) => {
    const m = rest.match(re);
    if (!m) return "";
    rest = (rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length))
      .replace(/\s+/g, " ").trim();
    return m[0].trim();
  };

  // Order matters. Email, phone and birthdate are unambiguous, so lift them out
  // first; the address pattern is the loosest and would otherwise absorb them.
  const email = take(RE_EMAIL);
  const phone = take(RE_PHONE);
  const birth_date = take(RE_DATE);
  const address = take(RE_ADDRESS);

  // Priesthood office, wherever it appears.
  let office = "";
  for (const o of OFFICES) {
    const re = new RegExp(`\\b${o.replace(" ", "\\s+")}\\b`, "i");
    if (re.test(rest)) { office = o; rest = rest.replace(re, " ").replace(/\s+/g, " ").trim(); }
  }

  // Sex column in some exports — a lone M or F.
  rest = rest.replace(/(^|\s)[MF](\s|$)/, " ").replace(/\s+/g, " ").trim();

  // Age: a standalone 1–3 digit number that could plausibly be an age.
  let age = null;
  const ageMatch = rest.match(/(^|\s)(\d{1,3})(\s|$)/);
  if (ageMatch) {
    const n = Number(ageMatch[2]);
    if (n >= 1 && n <= 120) {
      age = n;
      rest = (rest.slice(0, ageMatch.index) + " " +
              rest.slice(ageMatch.index + ageMatch[0].length)).replace(/\s+/g, " ").trim();
    }
  }

  // Whatever survives is the name.
  const namePart = rest.replace(/[,\s]+$/, "").replace(/^[,\s]+/, "").trim();
  if (!/[A-Za-z]/.test(namePart)) return null;

  return {
    name: normalizeName(namePart),
    last_name: lastNameOf(namePart),
    age,
    birth_date,
    address,
    phone,
    email,
    office,
    band: bandForAge(age),
    calling: "",
    active: true,
  };
}

// A line is only worth treating as a record if it carries a real name —
// two words, or a "Last, First" comma.
function looksLikeRecord(rec) {
  if (!rec) return false;
  const n = rec.name.trim();
  return n.length > 2 && (n.includes(" ") || n.includes(","));
}

/**
 * Parse a pasted directory.
 *
 * Handles one record per line, and also records spread over several lines —
 * a common shape where the name is on one line and address/phone/email follow
 * underneath. Lines are joined into a record until the next line looks like a
 * new person's name.
 *
 * @returns {{rows: Array, skipped: string[]}}
 */
export function parseDirectory(text) {
  const raw = String(text || "").split(/\r?\n/);
  const rows = [];
  const skipped = [];

  // Group lines into records. A line that starts a new person is one that
  // contains a name and no contact-only content.
  const startsRecord = (line) => {
    const t = line.trim();
    if (!t || SKIP.test(t)) return false;
    // A city/state/ZIP line belongs to the address above it.
    if (RE_CITY_STATE_ZIP.test(t)) return false;
    // Contact-only lines (just an email, phone, or address) continue a record.
    const stripped = t
      .replace(RE_EMAIL, "").replace(RE_PHONE, "")
      .replace(RE_ADDRESS, "").replace(RE_DATE, "")
      .replace(/\d+/g, "").trim();
    return /[A-Za-z]{2,}/.test(stripped);
  };

  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    // Put a comma before a city/state/ZIP line so the address reads
    // "2685 N Drexler Dr, Lehi UT 84048" rather than running together.
    const joined = buffer
      .map((l, i) => (i > 0 && RE_CITY_STATE_ZIP.test(l) ? ", " + l : " " + l))
      .join("")
      .replace(/^\s+/, "");
    const rec = parseRecord(joined);
    if (looksLikeRecord(rec)) rows.push(rec);
    else skipped.push(joined.slice(0, 90));
    buffer = [];
  };

  for (const line of raw) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (SKIP.test(t)) { flush(); continue; }
    // No letters and not a phone number — junk. Report it rather than gluing it
    // onto whoever came before. A bare phone line IS a valid continuation, so
    // it has to be excluded from this check.
    if (!/[A-Za-z]/.test(t) && !RE_PHONE.test(t)) {
      flush(); skipped.push(t.slice(0, 90)); continue;
    }
    if (startsRecord(t) && buffer.length) flush();
    buffer.push(t);
  }
  flush();

  return { rows, skipped };
}

// Kept for callers that only want the rows.
export function parseRoster(text) {
  return parseDirectory(text).rows;
}
