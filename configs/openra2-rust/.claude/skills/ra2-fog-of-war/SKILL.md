---
name: ra2-fog-of-war
description: Fog of war — GPU overlay, reverse-mapped isometric texture, owner-aware visibility, shroud source tracking
---

# RA2 Fog of War

## Architecture (Phase 25a)

GPU fog overlay using a screen-space texture rendered by a dedicated FogCamera (render layer 4), synced to the primary camera.

### Reverse-Mapped Isometric Texture

The fog texture maps each texel back to its CPos via inverse isometric transform, guaranteeing zero gaps between adjacent cells. Forward mapping (CPos -> texel) leaves gaps due to diamond shape.

### Fog States

Three states per cell: Shroud (unexplored, black), Fog (previously seen, dark), Visible (currently in sight, clear).

### PlayerShroud Resource

- Tracks entity -> source_id mapping for sight sources
- Stores base_height_px (average terrain height) to align fog with elevated terrain
- Grid dimensions match map CPos bounds with origin offset

## Owner-Aware Visibility (Phase 25b)

Fog visibility is per-player. Each player only sees cells within their own units' sight range.

### SightRange Component

Attach `SightRange(n)` to any entity that should reveal fog. Without it, the entity exists but reveals nothing.

### Pitfall: Tuner-Spawned Units

Debug tuner spawns (V key, I key) must attach `SightRange` component. Without it, `update_shroud_on_move` query never matches tuner units, and fog doesn't update when they move.

### System Ordering

`register_shroud_sources` must run before `update_shroud_on_move`. Without explicit ordering, race conditions cause duplicate source registration or missed move updates. Add `.after()` ordering constraint.

### Fog Toggle

[F] key toggles fog overlay on/off for debugging.

## Terrain Height Alignment

Fog texture uses average terrain height to offset the overlay vertically. Without this, fog on elevated terrain (hills) appears shifted relative to the ground tiles.

## Camera Bounds Integration (Phase 24e)

Camera is clamped to the map's playable area diamond, computed from MapPathGraph CPos corners. The fog texture world-space extent must match or exceed the camera's visible area to avoid fog edge artifacts.
