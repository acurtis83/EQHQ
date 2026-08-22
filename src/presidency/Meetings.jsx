import { useState } from "react";
import Segmented from "../components/Segmented";
import Presidency from "./Presidency";
import SundayAgenda from "./SundayAgenda";

// Presidency meetings and the Sunday quorum meeting are both "a meeting with
// an agenda", so they share one tab rather than two.
const SECTIONS = [
  { key: "presidency", label: "Presidency" },
  { key: "sunday", label: "Sunday" },
];

export default function Meetings({ section, onSection }) {
  // Works standalone or driven from outside, so a Home Hub card can land on
  // the right section.
  const [own, setOwn] = useState("presidency");
  const value = section || own;
  const set = onSection || setOwn;

  return (
    <div>
      <Segmented value={value} onChange={set} options={SECTIONS} idAttr="data-meeting" />
      {value === "presidency" ? <Presidency /> : <SundayAgenda />}
    </div>
  );
}
