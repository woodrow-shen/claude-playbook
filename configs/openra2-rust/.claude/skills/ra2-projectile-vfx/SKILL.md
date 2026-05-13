---
name: ra2-projectile-vfx
description: Projectile sprites + impact VFX — VFX_LAYER, live-Transform anchoring, warhead-driven explosion selection
---

# RA2 Projectile + Impact VFX

Phase 28a introduced projectile sprites and impact explosions. See `src/combat/projectile.rs`, `src/combat/vfx.rs`, `src/combat/vfx_registry.rs`.

## VFX_LAYER

All projectile + impact sprites render on a dedicated render layer (`VFX_LAYER`, see `src/combat/vfx.rs`). This avoids z-fighting with unit sprites and keeps VFX always above the terrain/unit painter stack.

Do NOT render VFX on the unit layer — use `VFX_LAYER`.

## Live-Transform Endpoint Anchoring (critical)

Projectile endpoints must read the target entity's **live Transform** at the frame of impact, NOT the world position captured at projectile spawn.

- **Bug** (before `edb9319` / `6d7f42e`): spawn-time world pos was stored on the projectile. If the target moved during flight, the impact VFX spawned at stale coords — visible gap between projectile and explosion.
- **Fix**: the projectile update system re-queries the target entity's `Transform.translation` each tick. Impact explosion spawns exactly where the projectile's final position = target's live position.

Applies equally to ground-target (AttackGround) vs unit-target projectiles.

## Warhead-Driven VFX Selection

`src/combat/vfx_registry.rs` maps warhead kind → explosion SHP.

- AP/bullet → small muzzle + tiny spark impact
- HE / explosive → medium explosion
- Nuclear / super → large multi-frame explosion

Keep this map in sync with `src/combat/warhead.rs` — every warhead kind needs a default VFX, or impact silently produces no visual.

## Projectile Sprite

`src/combat/projectile.rs` — projectile entity carries:

- Source WPos (spawn)
- Target entity OR target WPos (for AttackGround)
- Warhead kind (for impact VFX lookup)
- Velocity / arc params

Update system each tick moves projectile along path; on arrival, spawn impact VFX and apply damage.

## Pitfalls

- **Stale endpoint**: don't cache `target_world_pos` at spawn — always re-read from Transform. This was the top bug in Phase 28a (`edb9319`, `6d7f42e`).
- **Missing warhead entry**: adding a new weapon with a new warhead kind means adding a `vfx_registry` entry, else impact is invisible.
- **Layer mismatch**: a new projectile sprite rendered without `VFX_LAYER` render-target component will z-fight or render below units.
- **AoE splash**: Phase 28a is projectile + single-point impact only; AoE splash math is still a Phase 27i TODO (see memory `phase27i_remaining_todos.md`).

## Visual SSoT split — entity vs ground cell (CRITICAL)

The impact VFX position has TWO independent visual authorities, one per target kind. They MUST NOT borrow values from each other or from the flight system. This rule is the result of an entire half-day spent untangling a "shell falls 1 cell off" report (commits `7e03816`, `4590965`, `a58b011`, post-2026-04-25 reset).

### Rule 1 — Entity target: read `target.ScreenAnchor`

`spawn_impact_vfx_system`'s entity branch reads the target's `&ScreenAnchor` component directly. `sync_screen_anchor_system` keeps it fresh every frame with pitch projection + body lift + terrain + sprite offset all baked in. The explosion lands on the visible hull, no math required at the call site. Do not invent your own per-call body-lift compensation here — that's why `ScreenAnchor` exists.

### Rule 2 — Ground target (AttackGround / no target_entity): use `ground_cell_anchor`

`combat::vfx::ground_cell_anchor(base_screen, terrain_height_px) -> Vec2`. Returns `(base.x, base.y + terrain_height_px)`. The analogue of `ScreenAnchor` for cells: cells get exactly the visual compensation they need (terrain height) and nothing else (no body lift, no sprite offset — cells aren't bodies and aren't sprites).

```rust
let base = wpos_to_bevy_2d(ev.impact_wpos);
let terrain_h = terrain.map(|t| t.height_at(impact_cpos)).unwrap_or(0.0);
let ground = ground_cell_anchor(base, terrain_h);
let pos = Vec2::new(ground.x, ground.y + entry.pixel_lift);
```

### Rule 3 — NEVER borrow flight-system parameters for VFX placement

`ImpactEvent.screen_offset` is a flight-system value: it's the projectile's anchor offset at the moment of impact, computed by `anchor_offset_for(proj, anchors)` for visual continuity of the SHELL SPRITE between muzzle and target during flight. It mixes the attacker's body lift, muzzle local offset, and barrel direction.

**This value has no business authoring the explosion's screen position.** The old ground-target branch did `pos = base + screen_offset + pixel_lift`, which dragged the attacker's 58-72 px VXL body lift onto the impact cell. Result: explosion ~1 cell off (toward isometric map-north) from the clicked cell. On terrain mismatches between attacker and target it got worse.

If you need a visual anchor for a target kind that doesn't fit Rule 1 or Rule 2, **add a new helper** (analogous to `ground_cell_anchor`) — do not reach across to a flight-system field.

### The perception trap that hides this bug

The displacement caused by Rule 3 violation is **direction-independent** in screen space: always toward Bevy +y (isometric map-north). But the **visibility** of the displacement varies with click direction relative to the attacker:

- Click vector aligned with map-north (E, NE, N): displacement adds to expected motion — looks "close enough"
- Click vector opposite map-north (S, SW, W, NW): displacement is opposite the click — looks like an obvious miss

A bug report saying "wrong only in some compass directions" is not actually directional. Suspect a constant-displacement bug whose visibility varies, not a yaw/sign bug.

### How to debug position-mismatch reports

1. Add temporary log in `projectile_collision_system` (just before `events.send(ImpactEvent)`) printing `impact_wpos`, `wpos_to_bevy_2d(impact_wpos)`, the computed `screen_offset`, and the predicted final VFX position.
2. Run `AUTO_MUZZLE` (8 tanks compass-ring fire AttackGround at center). Each direction's `screen_offset` will surface in the log.
3. Tabulate `screen_offset` per direction — if it varies per attacker (which it WILL with the buggy code path), that proves the explosion position is reading attacker state instead of target state.
4. Compare the predicted position to `target_wpos` cell screen + terrain. The diff is the bug magnitude.

DO NOT debug this from screenshots alone — `AUTO_MUZZLE` overlaps 8 explosions at the same cell, making them visually indistinguishable from each other. Frame timing also matters (medium_clsn animation is ~10 ticks; capture at `frame=72-78` for first-pulse impact, not `75+` which may be mid-fade).
