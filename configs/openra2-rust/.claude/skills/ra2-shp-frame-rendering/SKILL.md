---
name: ra2-shp-frame-rendering
description: SHP cropped frame rendering — Bevy transparent pixel blocking, FrameOffset persistence
---

# SHP Cropped Frame Rendering

## Problem 1: Transparent Pixels Block Objects

In Bevy 2D, transparent sprite pixels still write to the depth buffer and block objects at lower z-values. A 290x192 SHP canvas with only 81x101 actual pixels blocks a large area of terrain behind it.

### Fix

Crop SHP frames to actual pixels only. Store the offset from canvas center to frame center as `frame_dx` and `frame_dy`:

```
frame_center_x = frame.x + actual_width / 2
frame_center_y = frame.y + actual_height / 2
frame_dx = frame_center_x - canvas_width / 2
frame_dy = frame_center_y - canvas_height / 2
```

### Exception: Bridge .tem Files

Bridge `.tem` files (ShpTS format with .tem extension) MUST use full canvas (180x120) rendering. Adjacent bridge segments need overlapping canvases to tile seamlessly. Bridge sprites render at terrain z-level where transparency blocking is acceptable.

## Problem 2: FrameOffset Lost Every Frame

`sync_actor_positions` runs every frame and overwrites `Transform.translation`. If `frame_dx`/`frame_dy` is only applied at spawn time, it gets overwritten on the next frame, causing overlay misalignment.

### Fix

Store frame offset as a persistent `FrameOffset` component:

```rust
#[derive(Component, Debug, Default)]
pub struct FrameOffset { pub x: f32, pub y: f32 }
```

`sync_actor_positions` reads and applies it every frame alongside `SpriteOffset`, `FootprintOffset`, and `TerrainHeightOffset`. This ensures cropped sprite positioning survives frame updates.

## Infantry SHP Rendering (Phase 26)

Infantry units use SHP sprites with multi-facing, multi-sequence animation.

### Animation State Machine

Infantry have multiple sequences: `stand`, `run`, `crawl`, `guard`, `prone`, etc. Each sequence has 8 or 32 facings. The animation system switches sequences based on movement state (idle -> stand, moving -> run).

### Facing Convention

OpenRA WAngle is counter-clockwise: 0=N, 256=W, 512=S, 768=E. The `facing_from_delta` function must rotate the movement delta to OpenRA's isometric convention (45-degree rotation) before computing the facing index. Without this rotation, infantry face the wrong direction when moving.

### Infantry Sprite Sources

Infantry SHP files are found in `conquer.mix` and `conqmd.mix` (not `local.mix` like VXL vehicles). The sequence_viewer searches conqmd -> conquer -> local MIX archives.

### Selection and Movement

- Infantry use 2D click selection (screen-space bounding box), separate from VXL 3D selection
- Left-click move must check for nearby 2D selectables before consuming the click for VXL orders
- Selection brackets persist after move order via `GpuSelectionConsumed` flag
- Only one Transform update path: `sync_actor_positions`. Duplicate updates from movement systems cause 15px jumps due to different projection formulas

## Problem 3: Multi-Facing SHP Convention Is Not Uniform — Dump bbox First

When wiring a new multi-facing SHP (missile, projectile, particle body — any sprite where one of the SHP frames represents one heading), DO NOT theorize the frame-ordering convention from OpenRA's `Facings:` YAML directive or our `index_facing` test cases. Inspect the SHP first.

### Why

OpenRA's standard "CW from north" interpretation does not uniformly apply to every RA2 SHP. dragon.shp (32-facing missile body, conquer.mix line 1126) encodes screen direction, NOT map direction — frame 0 = "missile streak points UP in screen", going CCW, with frame 8 = screen LEFT, frame 16 = screen DOWN, frame 24 = screen RIGHT. Cardinal map shots (north/south/east/west) project to screen diagonals, so they hit frames 28/12/20/4 (between the cardinals), NOT frames 0/8/16/24. Each artist's per-asset choice (screen vs map, CW vs CCW, frame 0 = N vs frame 0 = E) may differ.

The Phase 28m-5a.4-polish RedEye2 facing fix went through TWO wrong attempts before bbox dumping revealed the truth:

1. Raw `+256` WAngle shift (theorized that WVec.Yaw East=0 must be shifted to sprite-facing North=0) — looked right for cardinal north test only because frame 0 = slot 0 under either convention
2. Reversing `frame_indices = (32 - i) % 32` (theorized SHP was CCW from N) — also coincidentally passed cardinal north, failed diagonals

### The fix that works

```bash
cargo run --release --bin shp_dump -- <name>.shp /tmp/<name>_dump
```

Read the per-frame bbox output:

```
frame 00: bbox=(10, 4, 2x5)   ← center (11, 6.5) → upper of canvas
frame 08: bbox=(4,  7, 7x2)   ← center (7.5, 8)  → left of canvas
frame 16: bbox=(10, 7, 2x5)   ← center (11, 9.5) → lower of canvas
frame 24: bbox=(11, 7, 7x2)   ← center (14.5, 8) → right of canvas
```

Compute bbox center = `(x + w/2, y + h/2)`. If frames encode rotation, the centers trace a circle around the canvas center. Walking frame 0 → 1 → 2 → ... reveals direction:

- Frame 0 at canvas TOP → screen UP direction
- Frame 8 at canvas LEFT → screen LEFT direction (going CCW from frame 0)
- Frame 16 at canvas BOTTOM → screen DOWN
- Frame 24 at canvas RIGHT → screen RIGHT

This is screen-space, not map-space. If the bbox doesn't trace a circle, the frames are NOT facings — could be animation cycle (smoke pulse, exhaust shimmer) or unrelated sub-sequences.

### Pick the frame from velocity

For screen-direction-encoded SHPs (dragon.shp), compute the slot via screen-projected velocity:

```rust
// Same iso projection as wpos_to_bevy_2d, plus altitude lift.
let sx = (vx - vy) * 30.0 / TILE_SCALE;
let sy = -(vx + vy) * 15.0 / TILE_SCALE + vz * 15.0 / TILE_SCALE;
let angle = sy.atan2(sx);
// Frame 0 = screen up (pi/2), CCW for one full revolution = num_facings frames.
let slot = ((angle - PI/2.0) / (2.0 * PI) * num_facings as f32)
    .round() as i32;
let slot = slot.rem_euclid(num_facings);
```

The `vz * 15.0` altitude term means pitch is automatically encoded — climbing missiles pick frames closer to screen-up, diving missiles pick screen-down. No separate pitch-rotation Quat needed.

Set `SpriteAnimation.facing = slot * (1024 / num_facings)` so `index_facing` resolves to the right slot. Set `frame_indices = (0..num_facings).collect()` (identity — slot N → SHP frame N — because the screen-projection math has already done the convention conversion upstream).

### Testing tips

- Cardinal-only tests (vy=-200 north shot) WILL pass under any wrong CW/CCW guess because frame 0 = slot 0 — false confidence
- Test diagonals (`vx=-200, vy=-200` for map-NW, `vx=200, vy=-200` for map-NE etc.) to expose the bug
- Pin the four diagonals to specific slot expectations (e.g. map-NW → slot 0, map-NE → slot 24) so future SHPs that flip the convention can't silently slip through

### Per-facing palette differences are intentional

At 1× native size (24×16 for dragon.shp), the per-facing pixel values look near-identical. At dev-debug 10× scale, each frame visibly uses different palette indices — bright golds for frames where the missile's "lit side" (RA2's virtual sun is upper-left) faces the camera, dim grays where the shadow side faces the camera. This is the artist's intentional directional lighting, not a render bug. Mammoth tank, Apoc, infantry all carry the same convention. Don't try to "normalize" it.

### Asset inventory citation

Per-frame layout info lives in `docs/assets/inventory/conquer-mix-frames.md` (and the equivalent local/yr files). dragon.shp at line 1126 says "32 frames, 24x16 max, 1 frame x 32 facings (Image: DRAGON, used by ^Missile)" — confirms 32 facings, layout convention determined by bbox dump.
