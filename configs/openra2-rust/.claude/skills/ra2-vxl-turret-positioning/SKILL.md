---
name: ra2-vxl-turret-positioning
description: VXL turret positioning on buildings — LocalToWorld axis swap, body-relative anchoring, scale calibration
---

# VXL Turret Positioning on Buildings

## Problem

Placing a pre-rasterized VXL turret sprite (e.g. caoutp antenna) on a building SHP body requires converting OpenRA's body-local turret offset to Bevy screen coordinates. Multiple coordinate transforms interact and errors compound.

## OpenRA Turret Offset Pipeline

The complete C# call chain (Turreted.cs -> BodyOrientation.cs -> WorldRenderer.cs):

```
1. Raw offset:    Turreted.Offset = (forward, right, up) in body-local coords
2. Rotate:        offset.Rotate(bodyOrientation) — standard 2D rotation by facing
3. LocalToWorld:  (rotated.Y, -rotated.X, rotated.Z) — axis swap for isometric
4. World offset:  added to building CenterPosition
5. Screen:        isometric diamond projection
```

### Step 1: Raw Offset

Parse `Turreted.Offset` from actor rules. Values are `(forward, right, up)` in body-local WDist units.

```rust
let (offset_x, offset_y, offset_z) = parse_turreted_offset(actor_def); // e.g. (700, -1000, 1500)
```

### Step 2: Facing Rotation

```rust
let angle = facing as f32 * TAU / 1024.0;  // WAngle: 0..1024 = full rotation
let (sin_a, cos_a) = angle.sin_cos();
let rot_x = offset_x * cos_a - offset_y * sin_a;
let rot_y = offset_x * sin_a + offset_y * cos_a;
```

### Step 3: LocalToWorld Axis Swap (CRITICAL)

For isometric maps, `BodyOrientation.LocalToWorld()` swaps axes:

```rust
let world_dx = rot_y;      // body-local Y -> world X
let world_dy = -rot_x;     // body-local -X -> world Y
let world_dz = offset_z;   // Z unchanged
```

This converts from body-local (forward, right, up) to world (east, south, up).
Omitting this step causes ~75px errors for multi-cell buildings.

### Step 4: Diamond Projection

```rust
let half_w = 30.0;  // TILE_W / 2
let half_h = 15.0;  // TILE_H / 2
let off_px_x = (world_dx - world_dy) * half_w / 1024.0;
let off_screen_y = (world_dx + world_dy) * half_h / 1024.0;
let off_px_y = -off_screen_y + offset_z * 30.0 / 1024.0;  // Bevy Y-up + Z elevation
```

### Step 5: Apply to Anchor

```rust
turret_x = anchor_x + off_px_x - sprite_origin_offset_x + calibration_x;
turret_y = anchor_y + off_px_y + sprite_origin_offset_y + calibration_y;
```

## Turret Entity Architecture

VXL turrets are **independent entities** (NOT children of body).

### Why Not Child Entities

- Parent SpriteOffset pollutes child Transform
- Isometric footprint center (fp_dx) varies with MPos stagger, causing position-dependent drift

### TurretAnchor Component

```rust
pub struct TurretAnchor {
    pub body_x: f32,           // Building logical center X (sx + fp_dx, no sprite_offset)
    pub body_y: f32,           // Building logical center Y
    pub offset_px_x: f32,     // Pre-computed screen pixel offset (after LocalToWorld + projection)
    pub offset_px_y: f32,
    pub z_order: f32,
    pub sprite_origin_offset_x: f32,  // VXL rasterizer 3D origin vs sprite center
    pub sprite_origin_offset_y: f32,
    pub calibration_x: f32,    // Residual per-actor-type correction
    pub calibration_y: f32,
}
```

Anchor uses `sx + fp_dx` (building logical center) WITHOUT SHP sprite_offset.
The sprite_offset is only for the body SHP canvas, not the turret anchor point.

### Positioning System

```rust
transform.x = anchor.body_x + anchor.offset_px_x
    - anchor.sprite_origin_offset_x + anchor.calibration_x;
transform.y = anchor.body_y + anchor.offset_px_y
    + anchor.sprite_origin_offset_y + anchor.calibration_y;
```

## VXL Scale

OpenRA `RenderVoxels.Scale` (default 12.0) needs calibration for isometric tiles:

```rust
let render_scale = openra_scale * 7.0 / 12.0;  // Calibrated: Scale 12 -> effective 7.0
```

## Sprite Origin Offset

The VXL rasterizer crops to a tight bounding box. The 3D model origin is NOT at the sprite center.

```rust
// After rasterization:
let origin_offset_x = origin_pixel_x - (width as f32 - 1.0) / 2.0;
let origin_offset_y = origin_pixel_y - (height as f32 - 1.0) / 2.0;
```

Use `(width - 1) / 2.0` not `width / 2.0` to account for discrete pixel centers.

## Image Handle Swap for Runtime Re-rasterization

In-place `*image = new_image` does NOT trigger GPU re-upload when dimensions change.
Must create a new handle:

```rust
let new_handle = images.add(new_image);
images.remove(&sprite.image);
sprite.image = new_handle;
```

## Debug Hotkeys

Press T to toggle turret debug mode:
- Arrow keys: pixel nudge position
- Q/A: scale +/- 0.1
- Space: print current offset and scale to console

## Pitfalls

1. Missing LocalToWorld axis swap causes ~75px X offset
2. Using body_x (with sprite_offset) instead of anchor (without) causes ~60px offset
3. Using WPos CenterOffset instead of fp_dx causes inconsistent positioning between buildings at different map locations (MPos stagger)
4. VXL scale too large by 2x without the 7/12 calibration factor

## Game MapPlugin Requirement

The (+5, +15) pixel workaround offset MUST be carried into the future game MapPlugin for ALL mixed SHP+VXL buildings (caoutp and any future actors). This is NOT debug-only.

When implementing `src/map/plugin.rs`:
1. Apply `TURRET_OFFSET_X` (+5.0) and `TURRET_OFFSET_Y` (+15.0) after the Turreted.Offset pipeline
2. Use parent-child entity structure for GPU VXL turrets (root: position+scale, child: mesh+rotation)
3. Do NOT attach `TurretAnchor` to 3D VXL entities — that overwrites 3D coords with 2D pixel values
4. Move constants from `src/debug/mod.rs` to a shared module accessible by both debug and game code
5. TODO: derive the correction from OpenRA's `CenterOfCell` math instead of hardcoding

## Key OpenRA Source Files

Always read these before implementing any rendering feature:
- `Turreted.cs` — offset definition, rotation
- `BodyOrientation.cs` — LocalToWorld axis swap
- `WorldRenderer.cs` — WPos to screen conversion
- `MapGrid.cs` — TileScale (1448), CellSize
