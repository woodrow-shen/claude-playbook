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

## Problem: Negative CPos.y in Isometric Maps

Isometric MPos-to-CPos conversion yields CPos.y in range `[-(map_width-1), map_height-1]`, not `[0, w+h)`. A valid map cell like MPos(96,14) can become CPos(96,-14).

### Symptom

A* pathfinding silently rejects negative-y goals, causing units to stop short. The nav grid only covered `[0, N)`.

### Fix

Add origin offset to CellLayer/PathGraph so `CPos(origin_x, origin_y)` maps to array index (0,0). The nav grid must cover the full isometric CPos range including negative coordinates.

## Problem: Map Bounds Off-by-One

OpenRA's `Map.cs SetBounds()` excludes the outermost ring of MPos cells: `SetBounds(tl+1, br-1)`. Without this, A* routes units through edge cells with no terrain sprites.

### Fix

Mark MPos `[0,*]` and `[w-1,h-1]` rows/columns as Impassable in the pathfinding grid.

## Terrain Height in Screen Coordinates

Wireframe gizmos and debug overlays must account for terrain height. Height offset: `height_level * HEIGHT_OFFSET` pixels, applied to screen Y. Without this, Water wireframes at height=0 appear shifted onto land tiles at height>0.

## Infantry Facing Convention

OpenRA WAngle is counter-clockwise: 0=N, 256=W, 512=S, 768=E. RA2/TS SHP frames store facings in this order. The `facing_from_delta` function must rotate the movement delta to OpenRA's isometric convention (45-degree rotation) before computing `ArcTan(-Y, X) - 256`.

## MPos Parity

MPos conversion: `v = cpos.x + cpos.y`, `u = (v - (v&1))/2 - cpos.y`.

The `v&1` term means odd/even rows map differently. This parity affects footprint center calculations for multi-cell buildings — the center offset depends on whether the reference cell is on an odd or even MPos row.
