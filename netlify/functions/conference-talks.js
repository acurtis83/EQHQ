// Fetches a General Conference index page and returns parsed talks.
//
// This has to run server-side: the browser can't fetch churchofjesuschrist.org
// directly (no CORS headers), so the app calls this instead.
//
//   /.netlify/functions/conference-talks?year=2026&month=10

import { parseConferenceHtml, parseConferenceList } from "../../src/lib/domain/parseTalks.js";

const COLLECTION = "https://www.churchofjesuschrist.org/study/general-conference?lang=eng";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const get = (url) =>
  fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  // ?list=1 — which conferences exist, newest first. Used to populate the
  // import dropdown so it can't offer one that isn't published yet.
  if (event.queryStringParameters?.list) {
    try {
      const res = await get(COLLECTION);
      if (!res.ok) return json(502, { error: `The Church site returned ${res.status}.`, url: COLLECTION });
      const conferences = parseConferenceList(await res.text());
      if (!conferences.length) {
        return json(502, { error: "Couldn't find any conferences on the collection page.", url: COLLECTION });
      }
      return json(200, { conferences });
    } catch (e) {
      return json(502, { error: `Couldn't reach the Church site: ${String(e?.message || e)}` });
    }
  }

  const year = String(event.queryStringParameters?.year || "").trim();
  const month = String(event.queryStringParameters?.month || "").trim().padStart(2, "0");

  if (!/^\d{4}$/.test(year)) return json(400, { error: "year must be four digits, e.g. 2026" });
  if (month !== "04" && month !== "10") {
    return json(400, { error: "month must be 04 (April) or 10 (October)" });
  }

  const url = `https://www.churchofjesuschrist.org/study/general-conference/${year}/${month}?lang=eng`;

  try {
    const res = await get(url);

    if (!res.ok) {
      return json(res.status === 404 ? 404 : 502, {
        error:
          res.status === 404
            ? `No conference found for ${month}/${year}. It may not be published yet.`
            : `The Church site returned ${res.status}.`,
        url,
      });
    }

    const html = await res.text();
    const { talks, skipped } = parseConferenceHtml(html, { year, month });

    if (!talks.length) {
      return json(502, {
        error:
          "Fetched the page but found no talks. The site layout may have changed — the parser needs updating.",
        url,
        htmlLength: html.length,
      });
    }

    return json(200, {
      url,
      conf: talks[0].conf,
      count: talks.length,
      lowConfidence: talks.filter((t) => t.confidence === "low").length,
      skipped: skipped.map((s) => s.title),
      talks,
    });
  } catch (e) {
    return json(502, { error: `Couldn't reach the Church site: ${String(e?.message || e)}`, url });
  }
}
