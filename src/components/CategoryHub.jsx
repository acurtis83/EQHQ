import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
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
 *
 * The order is remembered, though — see onMove. A meeting doesn't always run
 * the same way round, and the presidency decides that on the day.
 */
export default function CategoryHub({
  label, accent, count, open, children, onAdd, adding, addForm,
  defaultCollapsed = false, onMove, first, last,
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

        {/* Reordering lives on the header rather than behind an edit mode:
            setting the order of a meeting means moving several categories in
            a row, and a mode to enter and leave would make that tedious. */}
        {onMove && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "0 0 auto" }}>
            <Btn size="sm" kind="plain" disabled={first} aria-label={`Move ${label} up`}
              onClick={(e) => { e.stopPropagation(); onMove(-1); }}>
              <ChevronUp size={14} />
            </Btn>
            <Btn size="sm" kind="plain" disabled={last} aria-label={`Move ${label} down`}
              onClick={(e) => { e.stopPropagation(); onMove(1); }}>
              <ChevronDown size={14} />
            </Btn>
          </div>
        )}

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
