import qrcode from "qrcode-generator";

/**
 * A URL as a grid of black and white squares.
 *
 * The encoding is the library's job — QR has masking, error correction and
 * version selection that nobody should be reimplementing. What lives here is
 * everything around it: the quiet zone, the sizing, and turning the grid into
 * runs of adjacent squares.
 *
 * Kept out of the component so it can be checked without a browser. A QR that
 * scans wrong is not something you notice by looking at it.
 */

// Four modules of white all the way round. It's in the spec, and a code
// printed hard against the edge of a card is one a phone won't see.
export const QUIET = 4;

/**
 * @param {string} value  what the code encodes
 * @param {"L"|"M"|"Q"|"H"} level  error correction; M is the usual trade
 * @returns {{ size: number, dark: (r: number, c: number) => boolean } | null}
 */
export function qrMatrix(value, level = "M") {
  const text = String(value || "").trim();
  if (!text) return null;

  // 0 = pick the smallest version that fits. A longer link gets a denser
  // code rather than being truncated.
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();

  const size = qr.getModuleCount();
  return { size, dark: (r, c) => qr.isDark(r, c) };
}

/**
 * The matrix as horizontal runs, so a row of ten dark squares is one rect
 * rather than ten.
 *
 * A 33-module code is over a thousand squares. Drawn one rect each that's a
 * thousand DOM nodes on a phone, and the seams between them show as hairlines
 * when a browser rounds subpixels — which is exactly the sort of artefact that
 * makes a scanner hesitate.
 *
 * @returns {{ modules: number, total: number, runs: {x,y,w}[] }}
 */
export function qrRuns(value, level = "M") {
  const m = qrMatrix(value, level);
  if (!m) return null;

  const runs = [];
  for (let r = 0; r < m.size; r++) {
    let start = -1;
    for (let c = 0; c <= m.size; c++) {
      const on = c < m.size && m.dark(r, c);
      if (on && start < 0) start = c;
      if (!on && start >= 0) {
        runs.push({ x: start + QUIET, y: r + QUIET, w: c - start });
        start = -1;
      }
    }
  }

  return { modules: m.size, total: m.size + QUIET * 2, runs };
}

/** A filename someone can find again. */
export function qrFilename(label) {
  const slug = String(label || "qr-code").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "qr-code";
  return `${slug}-qr.png`;
}
