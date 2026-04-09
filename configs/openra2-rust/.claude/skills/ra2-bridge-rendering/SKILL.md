---
name: ra2-bridge-rendering
description: RA2 bridge rendering — footprint stagger, terrain z-level, .tem as ShpTS, full canvas tiling
---

# RA2 Bridge Rendering

## Problem 1: Alternating Offset Stagger

Bridge segments render with odd/even cell misalignment — a zigzag pattern.

### Root Cause

Bridge actors (`lobrdg_b`) have `Building.Dimensions = "1, 3"` (1x3 cells). The footprint centering code computes the center of a 1x3 area, which shifts the sprite. In isometric coordinates, the center offset depends on MPos parity (odd vs even row), causing alternating stagger between adjacent segments.

### Key Insight

Bridge segments are per-cell sprites — each segment is a separate actor at a single CPos. Unlike regular buildings (where one sprite covers the entire multi-cell footprint), bridge sprites should NOT be footprint-centered.

### Fix

Skip footprint offset for bridge actors:
```rust
if actor_def.has_trait("Building") && !is_bridge {
    // footprint centering ...
}
```

### Detection

Any actor with Building trait AND per-cell placement (many actors of same type at adjacent cells) should skip footprint centering. Bridge types: names containing `brdg` or starting with `bridge`.

## Problem 2: Bridge Sprites Block Terrain

Bridge actor sprites at actor z-level (200+) block terrain tiles underneath with their transparent pixels.

### Fix

Bridge actors use `terrain_z(depth, height) + 0.5` instead of `actor_z(depth)`. This places them just above the terrain base, allowing proper compositing with water tiles.

## Problem 3: Gaps Between Segments

Cropped bridge sprites (117x70 from 180x120 canvas) leave gaps because adjacent segments no longer overlap.

### Fix

Bridge `.tem` files use full canvas rendering (180x120). The `pipeline_load_shp_sprite` function checks `filename.ends_with(".tem")` to decide. Full canvas frame_dx/frame_dy = 0.

## Technical: .tem Files Are ShpTS Format

Bridge `.tem` files (e.g., `lobrdg01.tem`) start with bytes `[00, 00, ...]` which passes ShpTS zero-check. They are genuine ShpTS format:
- Canvas: 180x120 (3x4 isometric tiles)
- 6 frames: frame 0 = empty, frame 1 = bridge plank pixels, frames 2-5 = empty
- Sequences use `start=1`

TmpTS parsing would fail — the header values are nonsensical as TmpTS dimensions.

## Bridge Sequence Structure

```
lobrdg_b sequences (each references a DIFFERENT .tem file):
  idle  -> lobrdg01.tem (undamaged)
  idle2 -> lobrdg02.tem (variant)
  idle3 -> lobrdg03.tem (variant)
  idle4 -> lobrdg04.tem (variant)
  adead -> lobrdg05.tem (A-side destroyed)
  bdead -> lobrdg06.tem (B-side destroyed)
  abdead -> lobrdg07.tem (fully destroyed)
```

These are NOT overlays — do not render idle2/3/4 simultaneously with idle.

## Bridge Actor Properties

- `Building.Dimensions`: "1, 3"
- `Building.Footprint`: "_ _ _"
- `RenderSprites.Palette`: "terrain" (uses isotem.pal, not unittem.pal)
- `WithBridgeSpriteBody`: manages damage state transitions
- `GroundLevelBridge`: low bridge specific trait
