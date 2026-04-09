---
name: ra2-palette-tileset
description: RA2 palette selection, player color remap, and tileset filename resolution
---

# RA2 Palette Selection, Player Color Remap, and Tileset Resolution

## Palette Selection

RA2 uses multiple palettes. Using the wrong one produces visible color errors.

### Available Palettes

- `isotem.pal` — terrain tiles, bridges
- `unittem.pal` — actors, buildings, units, building overlays (default)

### Resolution Rule

Check `RenderSprites.Palette` property on the actor definition:
- `"terrain"` -> use `isotem.pal`
- `"player"` or absent -> use `unittem.pal` with player color remap

```rust
let render_palette = actor_def
    .trait_property("RenderSprites", "Palette")
    .unwrap_or("player");
```

### Special Cases

- Bridge actors: `Palette: terrain`
- Building bib layers: use unit palette (NOT terrain). Indices 40-54 are grey in unittem.pal but orange in isotem.pal. Using terrain palette causes bibs to render orange instead of grey concrete.
- Building overlay layers (idle-*, flag): use same palette as the main building body (unit palette with player remap)

## Player Color Remap

RA2 palette indices 16-31 are player-remappable. These indices store the "team color" pixels. Without remap, they show the base palette colors (red in unittem.pal).

### Remap Mechanism

HSV-based color replacement:
- Keep original brightness (V) from the base palette entry
- Replace hue (H) and saturation (S) with the player's color
- Result: player-colored pixels that preserve shading/detail

```rust
// palette.rs
pub const RA2_REMAP_INDICES: &[usize] = &[16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

let remapped = unit_pal.with_player_remap(player_color_rgb, RA2_REMAP_INDICES);
```

### Player Colors

| Owner | Color | RGB |
|-------|-------|-----|
| Neutral | Grey | (110, 110, 110) |
| Multi0 | Blue | (0, 100, 200) |
| Multi1 | Red | (200, 50, 50) |
| Multi2 | Green | (50, 200, 50) |
| Multi3-7 | Yellow/Orange/Purple/Cyan/Pink | various |

### Sprite Caching

Different owners need separate sprite textures because remap changes pixel colors. Cache key must include owner:

```rust
// Cache key: "filename:u:OwnerName" for unit palette
// Cache key: "filename:t" for terrain palette (no remap)
let sprite_key = format!("{}:u:{}", filename, actor_ref.owner);
```

### Palette Index Ranges (unittem.pal)

| Range | Purpose | Notes |
|-------|---------|-------|
| 0 | Transparent | Always 0x00000000 |
| 1-15 | System colors | Blue, yellow, black, etc. |
| 16-31 | Player remap | Remapped per owner |
| 32-54 | Greyscale ramp | Used for concrete, metal, shadows |
| 55+ | Shared colors | Terrain-like, vegetation, etc. |

### Gotcha: isotem.pal vs unittem.pal Index Differences

The same palette index maps to DIFFERENT colors in each palette. Key differences that cause visible bugs:

| Index Range | unittem.pal | isotem.pal |
|------------|-------------|------------|
| 16-31 | Red ramp (player remap) | Pink/purple tones |
| 40-54 | Grey ramp (concrete) | Orange/tan/golden tones |

This is why building bibs (which use indices 40-54) must use unittem.pal: the terrain palette turns grey concrete into orange.

### VXL Rendering Pipeline

VXL models also use unittem.pal and need player color remap. There are TWO code paths:

1. **Initial spawn rasterization** — `rasterize_multi()` / `rasterize()` called directly in main.rs during actor spawning. Must pass the owner-remapped palette, NOT the base `unit_pal`.

2. **Runtime re-rasterization** — `rasterize_dirty_voxels()` system runs when `VoxelRendered.dirty` is set (turret rotation, animation). Uses `VoxelRenderData.palette_for_owner(vr.owner)` to look up the correct palette.

Both paths must use the same owner-remapped palette. Without remap, VXL palette indices 16-31 render as bright red stripes (base unittem.pal colors) instead of the owner's color.

```rust
// VoxelRendered stores the owner for palette lookup
pub struct VoxelRendered {
    // ... model refs, facing, scale, anchor ...
    pub owner: String,  // e.g. "Neutral", "Multi0"
}

// VoxelRenderData holds per-owner palettes
pub struct VoxelRenderData {
    pub palette: Palette,                          // base (fallback)
    pub owner_palettes: HashMap<String, Palette>,  // remapped per owner
}
```

## TilesetFilenames Resolution

RA2 sequences use `TilesetFilenames` to resolve different sprite files per tileset.

### Mapping Examples

| Tileset | Tree prefix | Bridge prefix | Building prefix |
|---------|------------|---------------|-----------------|
| TEMPERATE | ct*.shp | lobrdg*.tem | ct*.shp |
| SNOW | ca*.shp | lobrdg*.sno | ca*.shp |
| URBAN | similar | lobrdg*.urb | similar |

### Resolution Priority

1. `TilesetFilenames` — per-tileset override (highest priority)
2. `Filename` — explicit filename in sequence definition
3. Default — `{actor_type}.shp`

```rust
fn resolve_sprite_filename(seq, tileset, actor_type) -> String {
    if let Some(tsf) = &seq.tileset_filenames {
        for (ts_name, ts_file) in tsf {
            if ts_name.to_uppercase() == tileset.to_uppercase() {
                return ts_file.clone();
            }
        }
    }
    seq.filename.clone().unwrap_or_else(|| format!("{}.shp", actor_type))
}
```

### Gotcha

The resolved filename extension does NOT determine the file format. Bridge `.tem` files are actually ShpTS format, not TmpTS. Always try ShpTS parsing first, fall back to TmpTS.
