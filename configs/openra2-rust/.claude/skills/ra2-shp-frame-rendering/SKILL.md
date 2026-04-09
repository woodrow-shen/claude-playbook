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
