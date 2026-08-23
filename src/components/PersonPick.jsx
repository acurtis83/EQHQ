import { Select } from "./ui";

/**
 * Pick someone from the roster, without losing a name that isn't on it.
 *
 * A prayer or an assignment often goes to someone the roster doesn't have —
 * a visitor, a spouse, a name typed before the import. Rather than silently
 * dropping that, an unknown value stays in the list as its own option so
 * opening the picker and closing it again can't quietly erase it.
 *
 * Shared by the Sunday agenda and the presidency agenda; it used to live in
 * one of them, which is how the two would have drifted.
 */
export default function PersonPick({ members, value, onChange, empty = "— nobody yet —" }) {
  const known = (members || []).some((m) => m.name === value);
  return (
    <Select
      value={known || !value ? (value || "") : "__other"}
      onChange={(v) => onChange(v === "__other" ? value : v)}
    >
      <option value="">{empty}</option>
      {(members || []).filter((m) => m.active !== false).map((m) => (
        <option key={m.id} value={m.name}>{m.name}</option>
      ))}
      {value && !known && <option value="__other">{value}</option>}
    </Select>
  );
}
