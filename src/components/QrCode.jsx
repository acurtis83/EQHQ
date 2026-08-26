import { useMemo } from "react";
import { qrRuns } from "../lib/domain/qr";

/**
 * A link as a scannable code.
 *
 * Always black on white, whatever the app's theme is doing. A scanner needs
 * the contrast, and a code rendered in the dark theme's inverted colours is
 * one most phones refuse — so this is one of the few places that ignores the
 * palette on purpose.
 *
 * The code is also the link: tapping it opens the group on the phone that's
 * already holding the screen, which is what happens when somebody shows this
 * to the brother next to him rather than across the room.
 */
export default function QrCode({ value, size = 180, label = "Open the link", href }) {
  const grid = useMemo(() => qrRuns(value), [value]);
  if (!grid) return null;

  const svg = (
    <svg
      viewBox={`0 0 ${grid.total} ${grid.total}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      style={{ display: "block", borderRadius: 8 }}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={grid.total} height={grid.total} fill="#ffffff" />
      {grid.runs.map((r) => (
        <rect key={`${r.y}-${r.x}`} x={r.x} y={r.y} width={r.w} height="1" fill="#000000" />
      ))}
    </svg>
  );

  const target = href || value;
  if (!target) return svg;

  return (
    <a
      href={target}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      style={{ display: "inline-block", lineHeight: 0, border: "1px solid #e6e6e6", borderRadius: 10, padding: 8, background: "#fff" }}
    >
      {svg}
    </a>
  );
}
