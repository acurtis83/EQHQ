// Parse a General Conference session index into talk records.
//
// The tricky part is splitting title from speaker. The conference page lists
// every talk TWICE with the two in opposite orders:
//
//   nav list:  "About His Business Patrick Kearon"      (title, then speaker)
//   tile list: "Patrick KearonAbout His Business …"     (speaker, then title)
//
// So the speaker is exactly the longest string that is both a suffix of the
// nav text and a prefix of the tile text. That's a deterministic match — no
// guessing where a name starts, which is otherwise ambiguous
// ("About His Business Patrick Kearon" could plausibly split three ways).
//
// The URL slug ("13kearon") carries the surname, which we use to tell the two
// listings apart and as a fallback if only one listing is present.

// Prefix matches, not exact — if the fallback splitter leaves a stray initial
// on the end of a title ("Solemn Assembly D."), it should still be filtered.
const PROCEDURAL = [
  /^introduction\b/i,
  /^solemn assembly\b/i,
  /^sustaining of/i,
  /^church auditing department report/i,
  /^statistical report/i,
];

export function isProcedural(title) {
  const t = (title || "").trim();
  return PROCEDURAL.some((re) => re.test(t));
}

export function stripDiacritics(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const norm = (s) => stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function textOf(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Longest string that ends `navText` and starts `tileText`.
function commonSpeaker(navText, tileText) {
  if (!navText || !tileText) return "";
  const maxLen = Math.min(navText.length, tileText.length);
  for (let len = maxLen; len >= 3; len--) {
    const cand = navText.slice(navText.length - len);
    if (!/^[A-ZÀ-Ý"“(]/.test(cand)) continue;
    if (tileText.startsWith(cand)) return cand.trim();
  }
  return "";
}

// Fallback for when only one listing is present. Deliberately conservative:
// it takes the surname, any initials in front of it, and exactly one given
// name. It will UNDER-capture a middle name ("John U. Teh" rather than
// "Michael John U. Teh") but it will not swallow words off the end of the
// title, which is the failure that actually corrupts data. Callers should
// treat these as low confidence.
function speakerFromSurname(navText, surname) {
  if (!navText || !surname) return "";
  const words = navText.split(" ");
  for (let i = words.length - 1; i >= 0; i--) {
    if (!norm(words[i]).endsWith(norm(surname))) continue;
    // Allows internal capitals so hyphenated names survive ("Wan-Liang").
    const givenName = /^[A-ZÀ-Ý][A-Za-zà-ÿ'’-]*$/;
    let start = i;
    let j = i - 1;
    // consume initials / parenthesised nicknames immediately before the surname
    let sawInitial = false;
    while (j >= 0 && (/^[A-ZÀ-Ý]\.$/.test(words[j]) || /^\([A-Za-z]+\)$/.test(words[j]))) {
      start = j;
      sawInitial = true;
      j--;
    }
    // Take exactly one given name and stop. Conference titles are title-case,
    // so a capitalised word before the name is indistinguishable from part of
    // the name ("About His Business Patrick Kearon"). Grabbing more would
    // corrupt the title; grabbing fewer only shortens the speaker, which the
    // import screen flags for review.
    void sawInitial;
    if (j >= 0 && givenName.test(words[j]) && j > 0) start = j;
    return words.slice(start).join(" ").trim();
  }
  return "";
}

export function sessionLabel(slug) {
  const n = (slug.match(/^(\d)/) || [])[1];
  return (
    { 1: "Saturday Morning", 2: "Saturday Afternoon", 3: "Saturday Evening", 4: "Sunday Morning", 5: "Sunday Afternoon" }[n] || ""
  );
}

export function confLabel(year, month) {
  const m = String(month).padStart(2, "0");
  return `${m === "04" ? "April" : m === "10" ? "October" : m} ${year}`;
}

/**
 * Which conferences actually exist, from the General Conference collection page
 * (https://www.churchofjesuschrist.org/study/general-conference?lang=eng).
 *
 * Beats guessing dates: a conference only appears here once it's published, so
 * the import list can't offer an October that hasn't happened yet. The page
 * also links decade archives ("2020–2024") — those aren't conferences, so only
 * /YYYY/MM links count.
 *
 * @returns {Array<{year:number, month:number, label:string, url:string}>} newest first
 */
export function parseConferenceList(html) {
  const re = /href="([^"]*\/study\/general-conference\/(\d{4})\/(0?4|10)(?:\?[^"]*)?)"/gi;
  const seen = new Map();
  let m;
  while ((m = re.exec(html))) {
    const [, href, y, mo] = m;
    const year = Number(y);
    const month = Number(mo);
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    const url = href.startsWith("http")
      ? href
      : `https://www.churchofjesuschrist.org${href.startsWith("/") ? "" : "/"}${href}`;
    seen.set(key, { year, month, label: confLabel(year, String(month).padStart(2, "0")), url });
  }
  return [...seen.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

/**
 * @param {string} html raw HTML of a conference index page
 * @param {{year:string|number, month:string|number, includeProcedural?:boolean}} opts
 * @returns {{talks:Array, skipped:Array}}
 */
export function parseConferenceHtml(html, opts = {}) {
  const { includeProcedural = false } = opts;
  const year = String(opts.year || "");
  const month = String(opts.month || "").padStart(2, "0");

  const anchorRe = /<a\b[^>]*href="([^"]*\/general-conference\/(\d{4})\/(\d{2})\/([^"?#/]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const bySlug = new Map();

  let m;
  while ((m = anchorRe.exec(html))) {
    const [, href, y, mo, slug, inner] = m;
    if (year && y !== year) continue;
    if (month && mo !== month) continue;
    // Session index pages and the contents link aren't talks.
    if (!/^\d/.test(slug)) continue;

    const text = textOf(inner);
    if (!text) continue;

    const url = href.startsWith("http")
      ? href
      : `https://www.churchofjesuschrist.org${href.startsWith("/") ? "" : "/"}${href}`;

    if (!bySlug.has(slug)) bySlug.set(slug, { slug, year: y, month: mo, url, texts: [] });
    const rec = bySlug.get(slug);
    if (!rec.texts.includes(text)) rec.texts.push(text);
  }

  const talks = [];
  const skipped = [];

  for (const rec of bySlug.values()) {
    const surname = rec.slug.replace(/^\d+/, "");
    // Shortest text is the plain "Title Speaker" nav entry; the tile entry is
    // longer because it carries the description.
    const sorted = [...rec.texts].sort((a, b) => a.length - b.length);
    const navText = sorted[0];
    const tileText =
      sorted.find((t) => t !== navText && norm(t).indexOf(norm(surname)) >= 0 && norm(t).indexOf(norm(surname)) < 40) || "";

    // Cross-matching the two listings is exact. The surname fallback is a
    // guess, so mark it — the import screen shows these for review.
    let speaker = commonSpeaker(navText, tileText);
    let confidence = "high";
    if (!speaker) {
      speaker = speakerFromSurname(navText, surname);
      confidence = "low";
    }

    let title = speaker && navText.endsWith(speaker)
      ? navText.slice(0, navText.length - speaker.length).trim()
      : navText;

    // Tile-only shape: "SpeakerTitle description" — take what follows the name.
    if (!title && tileText && speaker && tileText.startsWith(speaker)) {
      title = tileText.slice(speaker.length).trim();
    }

    title = title.replace(/[\s—–-]+$/, "").trim();
    if (!title) continue;

    const talk = {
      slug: rec.slug,
      conf: confLabel(rec.year, rec.month),
      year: Number(rec.year),
      month: Number(rec.month),
      session: sessionLabel(rec.slug),
      title,
      speaker: speaker || "",
      url: rec.url.split("?")[0] + "?lang=eng",
      confidence: speaker ? confidence : "low",
      // Kept only for low-confidence rows so the import screen can show what
      // the page actually said and let you correct the split by hand.
      rawText: confidence === "low" ? navText : undefined,
    };

    if (!includeProcedural && isProcedural(title)) skipped.push(talk);
    else talks.push(talk);
  }

  // Session order, then position within the session.
  talks.sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));
  return { talks, skipped };
}
