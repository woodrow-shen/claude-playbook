---
name: ra2-selection-and-groups
description: Selection SSoT, subgroup filtering (Tab, double-click), control groups (Ctrl+1-9), marquee drag, mixed armed/unarmed dispatch
---

# RA2 Selection and Control Groups

Phase 27j redesigned selection around a single source of truth and OpenRA-style exclusive group membership.

## SelectionState SSoT

`src/game/selection.rs` — `SelectionState` holds full selection + active subgroup filter.

Key refactor (429cd9d): subgroup filter lives on `SelectionState`, NOT as scattered per-entity components. All queries derive the active set from this single resource.

### Subgroup Filtering

- [Tab] cycles the subgroup filter through distinct unit types in the selection (e.g. GTNK(2) → GI(2) → all(4))
- Double-click a unit → selects all same-type on screen (`f08b98d`, `28ab693` — works for both VXL and infantry)
- T-key → select all same-type units on map

AUTO_TAB_FILTER smoke test verifies Tab cycle with 2 Grizzly + 2 GI.

## Control Groups (Ctrl+1-9)

OpenRA-style **exclusive membership** (`ffba6b5`):

- Ctrl+N assigns selection to group N and REMOVES those units from any previous group
- Bare N recalls group N
- Double-tap N snaps camera to group centroid
- PCX digit sprites from RA2 assets render the group number in faction color (`476f13e`)

AUTO_GROUP_COLORS and AUTO_GROUP_DISPATCH verify visuals + command routing.

## Marquee Drag-Select

`src/game/selection.rs` — drag-box selection with shift-add support (`ec1b63b`). Disambiguates click vs drag via pixel threshold (`a4f8aae`). Handles mixed VXL + infantry groups.

## Mixed Armed/Unarmed Dispatch

`src/game/orders.rs` — `GroupDispatcher` (Phase 27j):

- Right-click on enemy with mixed selection: armed units get CombatOrder, unarmed get MoveOrder to the click cell
- Example: Grizzly + MCV selected, right-click enemy → Grizzly attacks, MCV moves

AUTO_GROUP_DISPATCH and AUTO_MIXED_ATTACK_MOVE cover this.

## Force-Fire / Force-Move (Phase 27g)

- Ctrl+right-click → force-fire (attack ally, bypasses stance)
- Alt+right-click → force-move (ignore obstacles/attack)
- `src/render/cursor.rs` switches cursor frames from `mouse.shp` based on modifier + range
- `ClickConsumed` enum replaced old `GpuSelectionConsumed(bool)` for multi-stage click gates (`b677c45`)

## Pitfalls

- Adding a new selection query → read from `SelectionState` resource, do NOT iterate entities looking for `Selected` marker
- New control-group assignment must remove from prior group (exclusive membership)
- Drag-select threshold: click-vs-drag distinction is pixel-based; too low = accidental drags
- Infantry reveal fog of war AND preserve capture click blocking — don't drop either (`80ab48c`)
