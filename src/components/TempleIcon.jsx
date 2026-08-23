/**
 * The temple from the ward mark, as an icon.
 *
 * Lucide has no temple — the nearest are a church with a cross and a classical
 * portico, neither of which is what's on the logo. This traces the same
 * silhouette: a stepped base, low blocks either side, and a tall centre tower
 * rising to a spire.
 *
 * Drawn on lucide's 24x24 grid with the same stroke width and round joins, so
 * it sits level with the other icons rather than looking pasted in.
 */
export default function TempleIcon({ size = 24, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {/* ground */}
      <path d="M2 21h20" />
      {/* stepped base */}
      <path d="M4 21v-3h16v3" />
      {/* low wings */}
      <path d="M7 18v-4h3" />
      <path d="M17 18v-4h-3" />
      {/* centre tower */}
      <path d="M10 18V9h4v9" />
      {/* spire, seated straight on the tower — a gap made it read as a pin */}
      <path d="M10.4 9 12 2.5 13.6 9" />
    </svg>
  );
}
