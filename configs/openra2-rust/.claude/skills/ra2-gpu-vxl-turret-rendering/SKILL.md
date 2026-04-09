---
name: ra2-gpu-vxl-turret-rendering
description: GPU VXL turret rendering for buildings — no body facing rotation, +5/+15 offset required, mesh Z-elevation pitfall
---

# GPU VXL Turret Rendering on Buildings

## Problem

Building VXL turrets (e.g. caoutp satellite dish) are invisible when spawned as GPU 3D meshes in the map viewer. The turret entity is created, the mesh has valid vertices, but nothing appears on screen.

## Root Cause

The body facing rotation (`Quat::from_rotation_z(facing_rad)`) was applied to the turret Transform. The outp VXL mesh has vertices elevated at Z=5.0-7.6 (the dish sits high above the building). When a Z-axis rotation (e.g. 315 degrees) is applied to these elevated vertices, it swings the entire mesh far off its intended screen position — effectively rendering it outside the visible area.

## Rules

### 1. Never Apply Body Facing to Building Turrets

Building turrets rotate independently from the body. Do NOT apply the body's facing angle as a Transform rotation on the turret entity.

```rust
// WRONG: body facing swings elevated mesh off-position
Transform::from_translation(pos)
    .with_scale(Vec3::splat(scale))
    .with_rotation(Quat::from_rotation_z(facing_rad))

// CORRECT: no body facing, turret rotates via TurretRotation system
Transform::from_translation(pos)
    .with_scale(Vec3::splat(scale))
```

Vehicle turrets avoid this problem because they are children of the root entity — the root has the facing rotation, and children use `Transform::default()`.

### 2. The +5/+15 Pixel Offset is Required

Both CPU and GPU rendering paths need a `(+5.0, +15.0)` pixel offset added to the turret position after computing the Turreted.Offset pipeline. This is NOT a workaround — it is a real correction needed for correct turret placement.

```rust
let init_x = anchor_x + off_px_x + 5.0;
let init_y = anchor_y + off_px_y + 15.0;
```

The offset likely compensates for sprite anchor vs footprint center alignment in the OpenRA pipeline. Until the exact C# source is traced, keep this offset in both paths.

### 3. RenderVoxels.Scale IS Required for GPU Meshes

The mesh vertices from `build_vxl_part()` include `limb.scale` (typically ~0.08), making the mesh very small (~3-7 units across). `RenderVoxels.Scale` (e.g. 11.7 for caoutp) must be applied as `Transform.scale` to match the 2D sprite size in the map viewport.

```rust
// bevy_vxl_direct: no extra scale needed (viewport_height=55, mesh fits)
// map viewer: viewport_height=360, mesh needs scaling to match pixel sizes
Transform::from_translation(pos).with_scale(Vec3::splat(render_scale))
```

### 4. Mesh Z-Elevation Awareness

VXL turret meshes can have significant Z offset baked into vertices. The outp mesh has bounds Z=5.0-7.6, meaning the geometry floats above the spawn point. Any rotation applied to the Transform will orbit these vertices around the origin, causing large position shifts.

Always check mesh bounds when debugging invisible VXL meshes:

```rust
// Log bounds during build_vxl_part() for diagnosis
let (min, max) = compute_bounds(&all_positions);
info!("mesh bounds: [{:.1},{:.1},{:.1}]...[{:.1},{:.1},{:.1}]", ...);
```

## Differences: CPU vs GPU Turret Rendering

| Aspect | CPU (rasterize) | GPU (Mesh3d) |
|--------|----------------|--------------|
| Render path | VoxelRendered + dirty flag | Mesh3d + VxlMaterial on VXL_LAYER |
| Scale source | rasterizer internal | Transform.scale = RenderVoxels.Scale |
| Body facing | Not applied to turret sprite | Must NOT be applied to Transform |
| +5/+15 offset | Required | Required |
| Rotation | TurretRotation -> re-rasterize | TurretRotation -> gpu_turret_rotate_system |
| Z-ordering | Sprite z_order | Camera3d depth buffer |

## Game MapPlugin Requirement

The +5/+15 pixel offset and parent-child turret structure MUST be applied in the future game MapPlugin (`src/map/plugin.rs`), not only in the debug viewer. Any code path that loads a map and spawns mixed SHP+VXL buildings (caoutp, or future actors with `RenderVoxels` + `Building` traits) must:

1. Apply `TURRET_OFFSET_X` (+5.0) and `TURRET_OFFSET_Y` (+15.0) to the turret position
2. Use parent-child entity structure: root holds position+scale, child holds mesh+rotation
3. Never attach `TurretAnchor` to 3D VXL turret entities (that component is for 2D sprite turrets only; `update_turret_positions` will overwrite the 3D Transform with 2D pixel coords)

Constants currently live in `src/debug/mod.rs` — move them to a shared location (e.g. `src/render/` or `src/map/`) when building the game MapPlugin.

## Debug Checklist

When a GPU VXL turret is invisible:

1. Verify mesh exists in GPU cache (`gpu_mesh_cache.contains_key(name)`)
2. Check mesh vertex count is non-zero
3. Check mesh Z bounds — elevated meshes are sensitive to rotation
4. Verify no body facing rotation is applied
5. Confirm RenderLayers matches VXL camera (layer 3)
6. Confirm scale is applied (without scale, mesh is ~3 units in a 360-unit viewport)
7. Confirm +5/+15 offset is present
