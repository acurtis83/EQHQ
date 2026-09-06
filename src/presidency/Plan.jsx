import { useEffect, useMemo, useState } from "react";
import Segmented from "../components/Segmented";
import Planning from "./Planning";
import Teaching from "./Teaching";
import Forms from "./Forms";
import { useCategories } from "../lib/useCategories";
import { kindsFrom } from "../lib/domain/planning";

// Everything the presidency schedules ahead of time. The planning sections
// come from the category list, so adding "Service" in Settings puts a Service
// tab here; Teaching and Forms are their own screens but belong to the same
// job, so they live behind the same tab rather than eating a slot each in the
// bottom bar.
//
// This file used to carry its own hardcoded copy of the three planning kinds,
// and that copy is what made adding a category look like it did nothing.
// Planning.jsx has tabs of its own, derived from the categories — but they
// only render when it's mounted WITHOUT a kind, and this screen always passes
// one. So the derived tabs were real, correct, covered by a test, and never
// once shown to anybody. The list that mattered was this one.
const EXTRA = [
  { key: "teaching", label: "Teaching" },
  { key: "forms", label: "Forms" },
];

export default function Plan({ focus, onFocusHandled }) {
  const { rows: categories } = useCategories();
  const planningKinds = useMemo(() => kindsFrom(categories), [categories]);
  const sections = useMemo(
    () => [...planningKinds.map((k) => ({ key: k.key, label: k.label })), ...EXTRA],
    [planningKinds]
  );

  const [section, setSection] = useState(() => planningKinds[0]?.key || "activity");
  const isPlanning = planningKinds.some((k) => k.key === section);

  // Arriving from a Home Hub card that points at a planning row: make sure the
  // section is one Planning actually renders, or the row would never mount and
  // the scroll-to would find nothing.
  useEffect(() => {
    if (focus?.eventId && !isPlanning) setSection(planningKinds[0]?.key || "activity");
  }, [focus, isPlanning, planningKinds]);

  // A category can be retired while you're looking at its tab. Falling back
  // beats rendering Forms because the key didn't match anything.
  useEffect(() => {
    if (!planningKinds.length) return;
    const known = sections.some((s) => s.key === section);
    if (!known) setSection(planningKinds[0].key);
  }, [sections, section, planningKinds]);

  return (
    <div>
      <Segmented value={section} onChange={setSection} options={sections} idAttr="data-plan" />

      {isPlanning ? (
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
