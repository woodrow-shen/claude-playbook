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
