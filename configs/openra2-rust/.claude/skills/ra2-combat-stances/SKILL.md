---
name: ra2-combat-stances
description: RA2 unit stances gate auto-target and pursuit — HoldFire/ReturnFire/Defend/Aggressive, damage memory, weighted threat scoring
---

# RA2 Combat Stances

Stances decide when a unit may auto-engage. Added in Phase 27f, extended through 27h.

## Stance Types

`src/combat/stance.rs` defines `Stance` enum:

- **HoldFire** — never auto-target; only fire on explicit CombatOrder
- **ReturnFire** — passive; retaliate only after taking damage (tracked via `DamageMemory`)
- **Defend** — engage in-range enemies; NEVER pursue. Clear target when out of range.
- **Aggressive** — engage and pursue in-range enemies

## Spawn Defaults (non-obvious)

Set in `src/debug/tuner.rs` and `src/combat/ra2_unit_stats.rs`:

- MCV = **HoldFire** (NOT ReturnFire) — will never auto-attack
- War Miner / Chrono Miner = **Defend** with 20mmrapid weapon (armed harvester)
- Engineer / Harvester = HoldFire (unarmed)
- Default tanks/infantry = Aggressive

## Auto-Target Scan Gating

`src/combat/auto_target.rs` MUST check:

1. Stance allows engagement (HoldFire returns early)
2. `MoveOrder` is inactive OR stance is Aggressive — prevents normal Move from walking into a fight (fix 99dc818)
3. ReturnFire requires a `DamageMemory` hit within the memory window

## Pursuit (Phase 27e + 27f.3)

`src/combat/pursuit.rs` closes range on an active `CombatOrder`:

- Aggressive pursues indefinitely
- Defend must NEVER pursue — clear target when `distance > weapon.range` (fix b67be6b)
- Infantry `stop_on_engage` fix (13f8db6): halt move order when target locks, else walk-shoot

## Weighted Threat Scoring (Phase 27h)

`src/combat/auto_target.rs` picks target via weighted score:

- Damaged > healthy (finish-kill bias)
- Armed > unarmed (threat bias)
- Closer > farther

AUTO_THREAT_SCORING smoke test asserts correct pick among 3 decoys.

## HUD + Stance Cycle (Phase 27g)

[V] hotkey cycles stance of selected units. HUD row reflows live. See `d022296`.

## Pitfalls

- Arming a harvester without setting `Defend` stance → it sits idle under fire
- Default stance for new unit class → always grep `ra2_unit_stats.rs` first, don't assume
- Force-fire (`CombatOrder` with `force=true`) bypasses stance — even HoldFire fires
- AUTO_STANCE smoke test only covers ReturnFire leg; ignore+cooldown legs deferred to Phase 27i+
