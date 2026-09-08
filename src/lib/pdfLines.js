/**
 * A PDF file, read into the positioned lines the ministering parser wants.
 *
 * This is the only part of the PDF import that touches a library or a
 * browser. Everything that decides what the text MEANS is pure and lives in
 * domain/ministeringPdf.js, which takes lines of `{ x, s }` and doesn't care
 * whether x is a character column or a PDF point. That split is what lets the
 * parser be tested against a text dump while the app feeds it pdf.js.
 *
 * Loaded on demand, like the map's Leaflet: the reader is about a megabyte and
 * nobody who isn't importing assignments should pay for it.
 */

/**
 * Two fragments belong to the same word if there's no real gap between them.
 *
 * pdf.js hands back runs, not words — "Adamson", ",", " Seth" can arrive
 * separately. Joining every fragment with a space gives "Adamson , Seth" and
 * breaks the name matching; joining with nothing gives "AdamsonSeth" when the
 * gap was a real space. So the gap is measured, in units of the text's own
 * height, which scales with the font instead of assuming one.
 */
const SAME_WORD = 0.25;

/** Lines are the same line if their baselines are within a fraction of a line. */
const SAME_LINE = 0.5;

export async function pdfToLines(file) {
  const pdfjs = await import("pdfjs-dist");
  // Vite hands back a URL for the worker bundle; without it pdf.js falls back
  // to running on the main thread and locks the tab up on a long report.
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;

  const out = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    // transform is [a,b,c,d,e,f]: e is x, f is y, and d is the text height.
    const items = content.items
      .filter((i) => String(i.str || "").trim())
      .map((i) => ({
        x: i.transform[4],
        y: i.transform[5],
        h: Math.abs(i.transform[3]) || 10,
        s: i.str,
        w: i.width || 0,
      }));

    // Group by baseline. Pages come out roughly in reading order but not
    // reliably so, and a row of this table is only a row because its cells
    // share a baseline.
    const rows = [];
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.y - it.y) <= it.h * SAME_LINE) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const segs = [];
      for (const it of row.items) {
        const prev = segs[segs.length - 1];
        const gap = prev ? it.x - (prev.x + prev.w) : Infinity;
        if (prev && gap <= it.h * SAME_WORD) {
          // Same word, split by the encoder. No space, and the segment keeps
          // growing so the next gap is measured from its real right edge.
          prev.s += it.s;
          prev.w = it.x + it.w - prev.x;
        } else {
          segs.push({ x: it.x, s: it.s, w: it.w });
        }
      }
      out.push(segs.map(({ x, s }) => ({ x, s: s.trim() })).filter((g) => g.s));
    }

    // A blank line between pages, so a companionship can't run across the
    // page break and swallow the next one.
    out.push([]);
  }
  return out;
}
