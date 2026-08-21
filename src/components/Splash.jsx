import { useEffect, useState } from "react";

// Brief branded screen on every launch. Always dark — the logo's white elements
// need a dark ground, and a fixed colour means no flash when the theme resolves.
//
// Rules it follows so it never becomes an obstacle:
//  - tapping skips it
//  - "reduce motion" in the OS skips it entirely
//  - it never shows on a shared form link, where someone is trying to do one thing
const HOLD_MS = 1100;
const FADE_MS = 350;

export default function Splash({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onDone(); return; }

    const hold = setTimeout(() => setLeaving(true), HOLD_MS);
    const gone = setTimeout(onDone, HOLD_MS + FADE_MS);
    return () => { clearTimeout(hold); clearTimeout(gone); };
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      role="presentation"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "#17181c",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        cursor: "pointer",
      }}
    >
      <img
        src="/logo.png"
        alt="Holbrook Farms 8th Ward Elders Quorum"
        style={{
          width: "min(62vw, 300px)",
          height: "auto",
          animation: "eq-splash-in 620ms ease-out both",
        }}
      />
      <style>{`
        @keyframes eq-splash-in {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes eq-splash-in { from { opacity: 1; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
