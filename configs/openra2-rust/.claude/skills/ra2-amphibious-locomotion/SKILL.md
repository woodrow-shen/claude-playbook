---
name: ra2-amphibious-locomotion
description: Amphibious infantry (SEAL/Tanya) — Swimming state flip on water, swim-* animation variant, terrain-kind pathfinding
---

# RA2 Amphibious Locomotion

Phase 27l — SEAL and Tanya can walk across land AND swim across water. Other infantry cannot enter water.

## Swimming State Flip

`src/game/locomotion.rs` (and infantry locomotor integration) — when an amphibious unit steps onto a water tile, its state flips:

- Land cell → normal walk animation + land facing
- Water cell → `Swimming` component attached + `swim-*` animation sequence plays

The flip happens per-tile boundary crossing. Both directions — walk→swim and swim→walk — must be symmetric.

## swim-* Animation Sequences

`src/infantry/sequences.rs` — SEAL-type infantry has a dedicated `swim-*` sequence set: `swim-ready`, `swim-walk`, `swim-shoot`. These are distinct frames in the SHP, NOT the land frames played slower.

GI and most other infantry do NOT have `swim-*` — they simply can't enter water.

## Pathfinding Integration

`src/game/pathfinding_bridge.rs` / infantry navigation:

- Standard infantry: water cells are non-navigable — pathfinder skips them
- Amphibious: water cells ARE navigable, cost is higher than land (or equal, depending on tuning)

The `is_navigable()` check must consult the locomotor's amphibious flag, not just terrain kind.

## SEAL vs Tanya

Both are amphibious. SEAL additionally has a dive/underwater variant (not yet implemented). Tanya uses the same swim anim as SEAL for Phase 27l.

## Smoke Test

AUTO_SWIM @ CAM_CPOS=78,10 zoom 1.5 — SEAL spawned on land, walks to waypoint on opposite shore. Asserts Swimming component toggles and swim anim plays mid-crossing.

## Pitfalls

- **Forgetting the reverse flip**: unit stuck in `Swimming` state after reaching shore → walk animation never resumes. Always test both land→water AND water→land transitions.
- **Pathfinder amphibious flag**: copy-pasting infantry locomotor setup for a new amphibious unit → check the amphibious bit is forwarded to pathfinding, not hardcoded to false.
- **Missing swim-* sequences**: if a new infantry is marked amphibious but has no `swim-*` frames in its sequence table, animation silently falls back and looks wrong. Add explicit entries.
- **Attack while swimming**: weapon should still fire, but facing math must use the swim-shoot variant. Check `src/infantry/animation.rs` for state → sequence mapping.
