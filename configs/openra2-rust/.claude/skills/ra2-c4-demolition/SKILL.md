---
name: ra2-c4-demolition
description: Tanya/SEAL C4 demolition — Approaching/Entering/Planted FSM, can_demolish_target matrix, force-fire own buildings, VXL turret despawn
---

# RA2 C4 Demolition

Phase 27m — Tanya and Navy SEAL can demolish enemy buildings by walking in and planting C4.

## Target Rule Matrix

`src/game/demolition.rs` — `can_demolish_target()`:

| Target Owner | Default Click | Ctrl (force-fire) |
|--------------|---------------|-------------------|
| Enemy        | OK (direct)   | OK                |
| Neutral      | OK (direct)   | OK                |
| Own (Multi0) | **BLOCKED**   | **OK** (force)    |
| Allied       | BLOCKED       | OK                |

Fix `6f6d14a`: enemy/neutral are direct; own requires Ctrl. Old code blocked all same-owner — which was wrong for "demolish own Con Yard before it's captured" edge case.

AUTO_C4_FORCE rewrites a Neutral building to Multi0 and asserts the Ctrl path via `force_fire=true` on the click.

## Enter → Plant → Detonate FSM

State machine in `src/game/demolition.rs`:

1. **Approaching** — walk to building footprint edge
2. **Entering** — reached footprint, ~1s animation (vanish into building)
3. **Planted** — C4 timer counting down
4. **Detonate** — full-damage warhead, building despawns, demolisher re-emerges and survives

Tanya/SEAL survive the detonation — do NOT apply self-damage.

## Demolishable Component Split (Phase 27m polish)

`120b119` split `Demolishable` into:

- `Demolishable` — can be demolished (applies to capturable buildings)
- Implicit guard — Neutral/Defend buildings never grant the Demolishable marker

Check before adding `Demolishable` to a new building type.

## VXL Turret Despawn Pitfall (7ed2adf)

When a capturable building with a VXL turret is demolished, the turret is a SEPARATE entity attached via `TurretAnchor`. Building despawn does NOT auto-cascade to turret → ghost turret remains floating.

Fix: `despawn_capturable_with_turret` system explicitly despawns the turret when its anchored building is removed.

## Click Gate

`src/game/orders.rs` — `can_demolish_target` is checked at click time. The order event carries `force_fire: bool`; the demolition system re-verifies with this flag.

## Smoke Tests

- AUTO_C4 @ CAM_CPOS=109,-2 zoom 2.0 — Tanya walks into east caoutp, full FSM plays out
- AUTO_C4_FORCE — asserts Ctrl path on own building

## Pitfalls

- Adding a new demolisher infantry → must carry explicit C4 trait; don't assume all infantry can
- Don't despawn Tanya/SEAL at detonate — they survive
- VXL turret orphan check: grep for `TurretAnchor` when adding new building death paths
- `can_demolish_target` must re-check owner at detonate — building could be captured mid-plant
