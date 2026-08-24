import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { T, card, Btn, Chip } from "./ui";

/**
 * One category's items, gathered.
 *
 * The point of the grouped view is to talk about everything on a subject at
 * once — all the ministering in one go, then all the callings — instead of
 * jumping between subjects as the list happens to fall. So each category gets
 * its own hub: a header that can be folded away once the presidency has
 * worked through it, and a plus that adds an item already tagged, without
 * anyone having to find the category in a dropdown.
 *
 * Collapsing is deliberately not remembered between visits. A hub folded away
 * last week would hide items this week, and nothing on a folded header says
 * what's inside it beyond a count.
 */
export default function CategoryHub({
  label, accent, count, open, children, onAdd, adding, addForm, defaultCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div style={{
      ...card,
      padding: 14,
      // The category's colour on the edge, the same cue the item cards use.
      borderLeft: `4px solid ${accent || T.lineSoft}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          style={{
            display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0,
            background: "none", border: "none", padding: 0, cursor: "pointer",
            textAlign: "left", fontFamily: "inherit",
          }}
        >
          <Chevron size={17} style={{ flex: "0 0 auto", color: T.sub }} />
          <span style={{
            fontSize: 16.5, fontWeight: 700, color: T.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {label}
          </span>
          {open > 0 && <Chip>{open} open</Chip>}
          {/* A folded hub still says how much is inside, or folding it would
              be a way to lose track of items rather than a way to get through
              the meeting. */}
          {collapsed && count > open && (
            <Chip color={T.faint} bg={T.inset}>{count} total</Chip>
          )}
        </button>

        {onAdd && (
          <Btn size="sm" kind="plain" onClick={onAdd} aria-label={`Add to ${label}`}>
            <Plus size={15} />Add
          </Btn>
        )}
      </div>

      {!collapsed && (
        <div style={{ marginTop: 10 }}>
          {adding && addForm}
          {children}
        </div>
      )}
    </div>
  );
}
