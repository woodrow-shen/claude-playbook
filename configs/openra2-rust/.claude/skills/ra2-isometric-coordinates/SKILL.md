---
name: ra2-isometric-coordinates
description: RA2 isometric coordinate pitfalls — world_to_screen vs cell_to_screen, WPos half-cell offset
---

# RA2 Isometric Coordinate Systems

## Coordinate Types

- **CPos** — cell position (isometric grid). Used for game logic.
- **MPos** — map position (rectangular storage index). Used for tile arrays.
- **WPos** — world position (integer, 1448 units per cell). Used for sub-cell precision.

Key constant: `TILE_SCALE = 1448`, half cell = 724.

## Problem: 15px Y Mismatch

`world_to_screen(WPos::from_cpos(c))` produces a 15px Y offset compared to `cell_to_screen(c)`.

### Root Cause

`WPos::from_cpos` adds 724 (half a cell) to center the position within the cell:
```
WPos.x = 724 + cpos.x * 1448
WPos.y = 724 + cpos.y * 1448
```

Dividing back: `cx = WPos.x / 1448 = cpos.x + 0.5`. This extra 0.5 shifts the screen position by 15px.

### Fix

Subtract 0.5 from both cx and cy after dividing by TILE_SCALE:
```rust
let cx = pos.x as f32 / TILE_SCALE as f32 - 0.5;
let cy = pos.y as f32 / TILE_SCALE as f32 - 0.5;
```

## Rule: Never Mix Coordinate Functions

All actors go through `sync_actor_positions` every frame, which uses `world_to_screen`. If spawn code uses `cell_to_screen` but sync uses `world_to_screen`, the actor jumps on the second frame.

After the -0.5 fix, both functions produce identical results. But the rule remains: use one coordinate path consistently for each entity.

## Isometric Projection Formulas

```
screen_x = (cx - cy) * (TILE_W / 2)    // TILE_W = 60
screen_y = (cx + cy) * (TILE_H / 2)    // TILE_H = 30
```

Bevy Y-up: negate screen_y. Terrain height: add `height * 15.0` to Y.

## MPos Parity

MPos conversion: `v = cpos.x + cpos.y`, `u = (v - (v&1))/2 - cpos.y`.

The `v&1` term means odd/even rows map differently. This parity affects footprint center calculations for multi-cell buildings — the center offset depends on whether the reference cell is on an odd or even MPos row.
