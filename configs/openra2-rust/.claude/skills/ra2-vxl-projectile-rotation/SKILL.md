---
name: ra2-vxl-projectile-rotation
description: Yaw+pitch decomposition for iso VXL projectile body rotation, screen-projected pitch tangent, and the rot=0 ballistic-flight gate that prevents homing-pipeline truncation from corrupting pre-aimed trajectories
---

# RA2 VXL Projectile Rotation + Pre-aimed Ballistic Flight

Phase 28k V3 missile work landed two coupled lessons. Both apply to any VXL-rendered projectile body that arcs (`gravity > 0`) — V3Rocket today, future Dread DMISL / Boomer BMISL etc. See `src/combat/flight.rs` `vxl_rotation_from_velocity` and `missile_flight_system::Homing` branch.

## Why basis-from-forward fails for iso VXL projectiles

`wpos_to_vxl_3d` projects three independent game-space quantities onto two Bevy axes:

```
Bevy +X = (vx - vy) * 30 / TS                           # screen X, only carries cell-X
Bevy +Z = -(vx + vy) * 15 / cos_pitch / TS              # cell-depth (NW-SE diagonal)
        + vz * 15 / TS                                  # altitude
```

Bevy `+Z` carries cell-depth AND altitude. For the SE/NW direction family `vx == vy`, the `bevy_dx` term is zero and the entire missile motion lives in the YZ plane. Any rotation built as `Quat::from_mat3(Mat3::from_cols(forward, right, up))` with a fixed up-reference axis (`Vec3::X`, `Vec3::Y`, `Vec3::Z`, `cam_up`, `world_up` all tried) eventually hits a singularity at some tick during the arc. Four iterations across `acbc292`, `1a7e6db`, `9b52730`, and the shipped baseline (`bf6bd19`, later replaced) each fixed the previous attempt's worst symptom but introduced a new one — the underlying rank-2 collapse cannot be fixed by changing the right-axis reference.

The shipped-then-replaced workaround encoded altitude rate into Bevy `+Y` (depth axis) to break the `+Z` conflation. That kept the 3D rotation smooth, but `forward.y = bevy_dz_alt * cot_pitch` sign-flipped at apex (positive on ascent, negative on descent). Bevy `-Y` is the toward-camera direction in the iso projection, so the mesh `+X` (rocket nose) crossed into the camera-near half-space at descent. Visible artifact: NW-shooting V3 produced "nose facing the viewer" in the descent half of the arc, instead of "nose pointing at target with tail facing the viewer".

## The fix: yaw + pitch decomposition

Build the rotation explicitly:

```rust
let yaw   = (bevy_dz_horiz * cot_pitch).atan2(bevy_dx);
let denom = (bevy_dx * bevy_dx + (bevy_dz_horiz * cot_pitch).powi(2)).sqrt();
let pitch = bevy_dz_alt.atan2(denom);
return Quat::from_rotation_z(yaw) * Quat::from_rotation_y(-pitch);
```

Two-step decoupling is the whole point:

1. `from_rotation_z(yaw)` lands mesh `+X` in the Bevy XY horizontal plane. The depth sign of mesh `+X.y` is set ONCE here and never moves again.
2. `from_rotation_y(-pitch)` rotates mesh `+X` around body-local `+Y` (right side after yaw). This rotation only changes the `.z` component of mesh `+X`. The `.y` component is invariant, so the depth half-space established by yaw is preserved across apex.

The yaw formula is identical to `body_aim::target_screen_yaw(src_wpos, tgt_wpos)`. Chassis movement and projectile flight share one yaw convention. The `cot_pitch` factor compensates the iso camera's foreshortening asymmetry (Bevy `+Y` contributes `sin_pitch` to screen-Y, Bevy `+Z` contributes `cos_pitch`).

### Direction-by-direction sanity

- NW: `yaw ≈ +π/2` → `mesh +X.y ≈ +1` (away from camera). Camera sees the tail. Pitch tilts the nose between `+Z` (ascent) and `-Z` (descent).
- SE: `yaw ≈ -π/2` → `mesh +X.y ≈ -1` (toward camera). Camera sees the nose — correct for SE because the target IS on the close-to-camera side, so nose-toward-target equals nose-toward-camera.
- NE / SW: `yaw ≈ 0` or `±π` → `mesh +X.y ≈ 0` (profile to camera). Pitch tilts up or down, body silhouette stays in profile.

## Pitch magnitude: screen-projected, not physical 3D angle

The first pitch attempt used `atan2(vz, sqrt(vx² + vy²))` — the actual 3D angle of velocity above horizontal. NW/SE looked fine, but NE/SW deep-descent shots showed the body almost vertical right before landing.

Why: iso projection foreshortens the two direction families at different rates.
- NW/SE direction puts mesh `+X` on the depth axis. Screen-Y = `mesh+X.y * sin_pitch` ≈ ×0.5
- NE/SW direction puts mesh `+X` on the screen-X axis. Screen-Y = `mesh+X.z * cos_pitch` ≈ ×0.866

A given physical pitch maps to a steep on-screen tilt for NE/SW and a shallow on-screen tilt for NW/SE.

The screen-projected pitch tangent (formula above) compensates for that asymmetry by aligning the projection of mesh `+X` with the velocity's screen direction. Derivation:

After yaw, mesh `+X` projects onto screen direction proportional to `(bevy_dx, bevy_dz_horiz · cos_pitch)` — that's the horizontal-only screen velocity. After pitch `φ` around body-local `+Y`:

```
screen_x(mesh+X) = cos φ · cos yaw
screen_y(mesh+X) = cos φ · sin yaw · sin_pitch + sin φ · cos_pitch
```

Setting these proportional to the FULL screen velocity `(bevy_dx, (bevy_dz_horiz + bevy_dz_alt) · cos_pitch)` and substituting the yaw definition collapses (after a `cot · sin = cos` cancellation) to:

```
tan φ = bevy_dz_alt / sqrt(bevy_dx² + (bevy_dz_horiz · cot_pitch)²)
```

The denominator is the magnitude of the yaw atan2 args — the "horizontal screen speed" already established by the yaw step. The body tilt now matches the visible parabola tangent for all four direction families.

## Pre-aimed ballistic missiles must skip the Homing pipeline

V3 sets `weapon.rot = 0` ("pre-aimed ballistic missile"). The launch velocity in `fire_weapons_system` is calibrated so the parabola lands exactly at `target_wpos`. The `MissileState::Homing` branch must NOT run `turn_velocity_toward` or `clamp_speed` for these weapons:

```rust
MissileState::Homing => {
    if hom.rot > 0
        && let Some(tgt) = tgt_wpos
    {
        let delta = tgt - proj.current_wpos;
        let desired = delta.yaw();
        hom.velocity = turn_velocity_toward(hom.velocity, desired, hom.rot);
        hom.velocity = clamp_speed(hom.velocity, hom.max_speed);
    }
}
```

Both helpers corrupt a pre-aimed trajectory in cumulative ways, but only when `vy != 0`:

### Truncation in `turn_velocity_toward`

`turn_velocity_toward(velocity, desired_yaw, max_turn=0)` is logically a no-op (angle preserved). Implementation re-decomposes velocity through polar coordinates:

```rust
let speed = velocity.len_horizontal();   // sqrt(vx² + vy²) as i32 — TRUNCATES
let new_yaw = current_yaw.tick_toward(desired_yaw, max_turn);  // rot=0 ⇒ same angle
WVec::new(
    (speed as f64 * cos(new_yaw)).round() as i32,
    (speed as f64 * sin(new_yaw)).round() as i32,
    velocity.z,
)
```

For `vy == 0` the input is on a clean integer lattice (`sqrt(315² + 0²) = 315.0`), `as i32` is exact, output equals input. For `vy != 0` (e.g. `sqrt(294² + 42²) = 296.985`), the cast drops 0.985 horizontal speed per tick. Over 50+ ticks `vx` decays from `-294` to `-249`.

### Proportional scaling in `clamp_speed`

`clamp_speed(velocity, max_speed)` divides ALL three components by `len/max_speed` when `len > max_speed`. Gravity grows `|vz|` over time; once total magnitude crosses `max_speed`, `vx` and `vy` get pulled down too. Same direction of failure: missile undershoots horizontally, fuel runs out, missile enters Freefall+dud, and the per-tick `vz -= 32` dud-fallback drives it deep underground.

### Failure mode

V3 firing at heartland NW house from `(85, 3)` to target on `(70, 4)` (different y row, target on +60 px terrain). Per-tick log:

```
tick=1   vel=(-315, 21, 1156) vel_mag=1198  cur_wpos=(123489, 5089, 6948)
tick=70  vel=(-247, 17, -1190) vel_mag=1215  cur_wpos=(104100, 6401, 4602)
tick=80  vel=(-229, 13, -1482) vel_mag=1499  cur_wpos=(101696, 6560, -9106)
tick=100 vel=(-139,  0, -1494) vel_mag=1500  cur_wpos=(98111, 6656, -38889)
→ impact wpos (97343, 6656, -47924)  — 33 cells underground
```

Same shot from `(85, 4)` to `(70, 4)` (same y row, `vy = 0`) lands precisely on target. The vy=0 vs vy!=0 dichotomy is the key clue — the bug is per-tick velocity decay that only triggers when components are off the integer lattice.

With the `rot > 0` gate in place, V3 (`rot = 0`) skips both helpers entirely. Velocity inherits directly from the launch-time ballistic solver plus per-tick gravity. Same shot lands within 14 WDist of `target_wpos`.

## Pitfalls

- **Do not build VXL projectile rotation from a single forward vector.** `Quat::from_mat3(Mat3::from_cols(forward, right, up))` with any fixed up-reference WILL hit a singularity in the SE/NW direction family, regardless of which axis you pick. Use the yaw + pitch decomposition above.
- **Do not use the physical 3D pitch `atan2(vz, sqrt(vx² + vy²))`.** It produces near-vertical bodies for NE/SW deep descent because of iso foreshortening asymmetry. Use the screen-projected pitch tangent.
- **Do not run `turn_velocity_toward` or `clamp_speed` for `rot = 0` weapons.** Even with `max_turn = 0`, the polar→cartesian round-trip drops integer speed. Even with `max_speed` generous, gravity eventually crosses it and proportional scaling hits horizontal components.
- **`vy = 0` is not a representative test.** Same-row shots stay on the integer lattice and hide both the truncation and the clamp scaling. Always test with `vy != 0` (different y row between attacker and target) when validating projectile trajectory math.
- **Do not modify rotation expecting it to fix a "missile lands at wrong cell" report.** Rotation only writes `Transform.rotation`. Position is set by `wpos_to_vxl_3d(current_wpos) + visual_offset`, both rotation-independent. If the impact `WPos` is wrong, the bug is in flight integration (`missile_flight_system`) or `target_wpos` resolution (`fire_weapons_system`), not rotation.

## How to debug visual rotation reports

1. Run `AUTO_V3_DIAG` (`AUTO_V3_DIAG=1 AUTO_FRAME=300 CAM_CPOS=64,34 CAM_ZOOM=1.5`). Spawns four V3 trucks at the diagonal compass points around a central Rhino. Validates rotation in all four direction families simultaneously.
2. The smoke is rotation-only — a working rotation produces 7 `[combat impact] target=` log lines (4 launchers, ~1.7 shots each in 10 s) with 0 `[missile lifetime cap]` warns. Less than 7 hits means the missile is missing (likely flight bug, not rotation). Any `lifetime cap` warn means the missile is in an infinite loop.
3. For a single direction at high zoom, capture `AUTO_FRAME` at multiple ticks to see the body through ascent → apex → descent. Recommended frames: 70 (ascent), 95 (apex region), 120 (descent), 150 (late descent / impact). Camera centered on the launcher, `CAM_ZOOM=4.5`.
4. To verify "tail toward camera" specifically, look at NW direction (SE-corner launcher firing toward central Rhino). At descent, mesh `+X.y` should remain positive — the tail end (mesh `-X` direction) of the body should be on the camera-near side.

## How to debug "missile lands at wrong WPos"

1. Add per-tick log inside `missile_flight_system` (gate on `proj.weapon == "V3Rocket"` and `lifetime_ticks % 10 == 0`) printing `state`, `fuel`, `dist_to_target`, `current_wpos`, `target_wpos`, `velocity`, `velocity.len()`.
2. Add log at fire time inside `fire_weapons_system` printing `attacker_cpos`, `target_cpos`, `src_h`, `tgt_h`, `src_z`, `tgt_z`, and the final `target_wpos`. Confirms the homing target the missile is steering toward.
3. Compare `[combat impact]` log at the end with `target_wpos` from fire log. Three failure shapes:
   - `target_wpos.z` matches `tgt_h * (TILE_SCALE / HEIGHT_OFFSET)` and `impact_wpos == target_wpos` → terrain altitude resolution is correct, AoE radius is the problem. Check `apply_impact_damage_system` distance against `weapon.spread`.
   - `target_wpos` correct but `impact_wpos` differs — flight integration bug. Inspect per-tick velocity for decay (truncation), magnitude clamp at `max_speed`, or unexpected state transitions.
   - `target_wpos.z` doesn't match `tgt_h * 96.5` — terrain altitude resolution is wrong. Check `terrain_height_map.height_at(t_cpos)` and the `HEIGHT_PX_TO_WDIST` constant.
4. Two reproduction shots side by side: one with `vy = 0` (same row), one with `vy != 0` (different row). If only the second misses, the bug is in the `rot = 0` Homing pipeline gate or related integer-lattice arithmetic.

## Related code

- `src/combat/flight.rs::vxl_rotation_from_velocity` — yaw + pitch construction.
- `src/combat/flight.rs::missile_flight_system` — `MissileState::Homing` branch with the `rot > 0` gate.
- `src/combat/body_aim.rs::target_screen_yaw` — same yaw formula for chassis aim, shared with rotation.
- `src/combat/live.rs::fire_weapons_system` — launch velocity solver, terrain altitude encoding into `WPos.z`, `min_arc_range_cells` / `max_arc_range_cells` helpers.
- `src/debug/tuner.rs::auto_v3_diag_smoke_system` — `AUTO_V3_DIAG` four-direction regression coverage.
