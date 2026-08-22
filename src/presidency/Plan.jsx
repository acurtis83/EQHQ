import { useEffect, useState } from "react";
import Segmented from "../components/Segmented";
import Planning from "./Planning";
import Teaching from "./Teaching";
import Forms from "./Forms";

// Everything the presidency schedules ahead of time. The first three are the
// planning table; Teaching and Forms are their own screens but belong to the
// same job, so they live behind the same tab rather than eating a slot each in
// the bottom bar.
const SECTIONS = [
  { key: "activity", label: "Activities" },
  { key: "temple", label: "Temple Trips" },
  { key: "assignment", label: "Assignments" },
  { key: "teaching", label: "Teaching" },
  { key: "forms", label: "Forms" },
];

const PLANNING_KINDS = ["activity", "temple", "assignment"];

export default function Plan({ focus, onFocusHandled }) {
  const [section, setSection] = useState("activity");

  // Arriving from a Home Hub card that points at a planning row: make sure the
  // section is one Planning actually renders, or the row would never mount and
  // the scroll-to would find nothing.
  useEffect(() => {
    if (focus?.eventId && !PLANNING_KINDS.includes(section)) setSection("activity");
  }, [focus, section]);

  return (
    <div>
      <Segmented value={section} onChange={setSection} options={SECTIONS} idAttr="data-plan" />

      {PLANNING_KINDS.includes(section) ? (
        <Planning
          kind={section}
          onKindChange={setSection}
          focus={focus}
          onFocusHandled={onFocusHandled}
        />
      ) : section === "teaching" ? (
        <Teaching />
      ) : (
        <Forms />
      )}
    </div>
  );
}
