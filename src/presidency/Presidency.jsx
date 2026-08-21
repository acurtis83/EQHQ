import { useState } from "react";
import { T } from "../components/ui";
import RunningList from "./RunningList";
import PresidencyAgenda from "./PresidencyAgenda";

// Mirrors the old app's presMode toggle: the standing list vs. a dated meeting.
export default function Presidency() {
  const [mode, setMode] = useState("agenda");
  const [openCount, setOpenCount] = useState(null);

  return (
    <div>
      <div
        role="tablist"
        style={{
          display: "flex", gap: 4, background: T.inset, borderRadius: 12,
          padding: 4, marginBottom: 14,
        }}
      >
        {[
          { id: "agenda", label: "Meetings" },
          { id: "plan", label: openCount == null ? "Running list" : `Running list (${openCount})` },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => setMode(t.id)}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 9, border: "none",
              background: mode === t.id ? "var(--seg, var(--panel))" : "transparent",
              color: mode === t.id ? T.ink : T.sub,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              boxShadow: mode === t.id ? "var(--card-shadow)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "agenda" ? <PresidencyAgenda /> : <RunningList onCountChange={setOpenCount} />}
    </div>
  );
}
