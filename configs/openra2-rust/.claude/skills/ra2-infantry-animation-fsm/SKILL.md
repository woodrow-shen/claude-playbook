---
name: ra2-infantry-animation-fsm
description: Infantry animation state machine — deploy/undeploy/shoot-deployed/die1-die2/prone, per-infantry sequence tables, tick rates
---

# RA2 Infantry Animation FSM

Phase 27i added a complete animation FSM for infantry: idle → walk → shoot → die / deploy / prone.

## Per-Infantry Sequence Tables

`src/infantry/sequences.rs` — each infantry type has its own Rust table (no YAML parse yet, `879ccc2`).

- **flakt** (Flak Trooper) — anti-air, unique frame layout (different shoot frames)
- **spy** — no shoot sequence (disguise unit)
- **seal** — needs water/land switch between swim-* and regular sequences
- **GI** — ready/walk/shoot/deploy/deployed/shoot-deployed/undeploy/die1/die2
- All others — use shared base but DO NOT fall back silently; add an explicit entry

Do not copy a base_sequences hashmap — use a `match` table, one arm per unit type.

## Animation Tick Rates (RA2-authentic)

Wrong tick rate is the top bug source in this domain. Values from RA2 originals:

- Walk / Ready = default (~40ms or inferred from sequence)
- **Deploy / Undeploy = 10ms** (`81c432e`, `90122e9`, `90e01be`) — was originally 40ms and looked wrong
- **Shoot-deployed = 20ms** (`1c77417`)
- Die1 / Die2 = sequence-defined, terminates with Dying component

Always check the commit history on `src/infantry/animation.rs` before changing tick values.

## Deploy FSM

`src/game/deploy.rs` — D-key toggles deploy state. State transitions:

- Standing → `deploy` anim → Deployed (prone with M60)
- Deployed → `undeploy` anim → Standing (with para rifle)
- Weapon swap on both edges (`6d40f29` — register para weapon, swap range)
- Move orders blocked while deployed (`38f0752`)
- `HoldFire` stance set in AUTO smoke test defaults (`f2ab9fa`) — else tests misfire

AUTO_INFANTRY_DEPLOY includes a shoot-deployed verification step (`ed94f19`).

## Prone / TakeCover (50% dmg reduction)

`src/combat/prone.rs` — infantry caught by AoE goes prone for N ticks, takes 50% damage. Not the same as deployed prone (deploy is voluntary + persistent).

## Death Pipeline

`src/combat/death.rs`:

1. Health reaches 0 → attach `Dying` component + start die1 or die2 anim
2. Warhead kind selects variant (`a6722bf`) — e.g. explosive → die2, bullet → die1
3. Animation end → despawn
4. **Timeout fallback** (`ddf4946`): Dying has a tick cap so a missing `on_end` hook still despawns

AUTO_INFANTRY_DEATH kills 4 GI at frame 100 and asserts die anim plays before despawn.

## Animation System Loop

`c5d6d6b` fixed a while-loop bug in the animation system — old code could skip frames or spin. Always step frames by wall-time delta, not by tick count.

## Pitfalls

- Tuner-spawned GI must attach `Deployable` (`0dd776c`) — else D-key silently ignored
- Animation tick rate mismatches look "almost right" but feel wrong; always A/B against RA2 gameplay video
- Infantry facing from Transform SSoT (`f530154`) — do NOT cache facing elsewhere
- Death variant selection lives in warhead_to_death_kind(); extending warheads means extending the map
