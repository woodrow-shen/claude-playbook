---
name: ra2-building-compositing
description: RA2 buildings require multi-layer SHP sprite compositing — idle body, overlays, bib, flag
---

# RA2 Building Multi-Layer Compositing

## Problem

Buildings render with transparent/missing areas. Only one SHP layer is visible.

## Root Cause

RA2 buildings are composited from multiple SHP sprite layers, not a single sprite.
Each building has several sequences rendered simultaneously:

- `idle` (WithSpriteBody) — main body SHP
- `idle-*` overlays (WithIdleOverlay) — tower, pump, crane, etc.
- `bib` (WithBuildingBib) — ground foundation
- `flag` — faction/warning flag

The transparent areas in the building SHP are by design — other layers fill them.

## Fix

For each building, iterate ALL sequences matching `bib`, `idle-*` (excluding shadow/damaged), and `flag`. Spawn each overlay as a separate Bevy entity at the same position with its own SHP + frame offset.

Z-ordering per layer:
- bib: `actor_z - 0.5` (below building body)
- overlays: `actor_z + 0.01` (above building body)

## Overlay Filter Rule

Only `idle-*` (with hyphen) are visual overlays to render simultaneously.
`idle2`, `idle3`, `idle4` (no hyphen) are damage states or animation variants — do NOT render them as overlays.

Example: cow has `idle1`, `idle2` (chewing animations). Bridge has `idle2`, `idle3`, `idle4` (damage variants). Neither should be composited.

## VXL Exception

Some buildings (e.g., caoutp) have a VXL 3D model as the main body. The SHP layers are decorations around it. The VXL part (e.g., `outp.vxl`) requires software rasterization to produce 2D sprites — not yet integrated.
