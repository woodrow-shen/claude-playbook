---
name: art
description: RA2 art.ini structure reference — infantry/vehicle/building/animation sections, voxel keys, damage overlays, per-theater imagery
---

# RA2 art.ini Structure

`art.ini` defines **graphics and rendering metadata** — which file to load (SHP or VXL+HVA), where muzzle flashes appear, how buildings compose their damaged state from overlay layers, which cameos appear in the sidebar, frame ranges for each animation sequence. It is the rendering partner to `rules.ini`.

Every rules.ini object references an art.ini section via `Image=<name>`. If `Image=` is omitted, the rules section name is used directly. Same-name sections in the two files **do not link automatically** — the engine always looks up art by `Image`.

Source of truth file: extract from `local.mix` inside `ra2.mix` or `ra2md.mix` with openra2-rust `mix_tool`.

## File header (self-documenting key reference)

The first ~60 lines of `art.ini` list the valid keys. The most important are:

```
Cameo = image to use if this object happens to appear in the sidebar (def=none)
AltCameo = alternate cameo (Yuri's Revenge)
Voxel = Is this a voxel image (def=no)?            -- loads <section>.vxl + <section>.hva instead of <section>.shp
Remapable = Can this object be remapped to owner's color (def=no)?
Normalized = If its animation is regulated to appear constant speed (def=no)?
Theater = Does it have theater-specific imagery (def=no)?
NewTheater = Does it have a theater-specific name (def=no)?
                                                    -- second char of filename becomes t/s/u/l/d/n for theater
RotCount = number of rotation stages (def=32)       -- old system, used by infantry sprites
ShadowIndex = voxel piece index for shadow (def=0)
TurretOffset = turret center offset along body centerline, in leptons (def=0)
FireAngle = default barrel pitch above target line in degrees (def=10)
BarrelLength = length in 1.5 inch increments
PrimaryFireFLH = lepton offset (Forward,Lateral,Height) for bullet start (def=0,0,0)
SecondaryFireFLH = alternate weapon offset
ElitePrimaryFireFLH / EliteSecondaryFireFLH
```

## Section types

### Infantry (SHP + sequence table)

```
[GI]
Cameo=GIICON                -- sidebar icon SHP (60x48)
AltCameo=GIUICO             -- Yuri's Revenge sidebar icon
Sequence=GISequence         -- named sequence table (defined elsewhere in art.ini or via animation section)
Crawls=yes                  -- has crawl frames (else runs while prone)
Remapable=yes               -- tint by owner color
FireUp=2                    -- frame index of projectile launch during fire animation
PrimaryFireFLH=80,0,105     -- muzzle offset from infantry center (leptons)
SecondaryFireFLH=15,0,140   -- used for secondary weapon (e.g. Yuri's brain blast from head)
```

Infantry always use SHP — `Voxel=yes` is invalid for infantry.

### Vehicle / ship / aircraft (VXL)

```
[HTNK]
Voxel=yes                   -- loads htnk.vxl + htnk.hva (REQUIRED for voxel units)
Remapable=yes
Cameo=HTNKICON
AltCameo=HTNKUICO
PrimaryFireFLH=150,0,100    -- barrel-tip offset from turret center
SecondaryFireFLH=...
PBarrelLength=250           -- Primary barrel length (1.5" units) — used for recoil
SBarrelLength=250           -- Secondary
TurretOffset=-16            -- turret pivot offset along body Z (leptons)
UseTurretShadow=yes         -- cast shadow from turret voxel (else body shadow only)
WalkFrames=15               -- for units that also have walk SHP (mechs like Robot Tank)
VisibleLoad=yes             -- swap sprites when carrying cargo
```

Axis-swap rule when reading PrimaryFireFLH at runtime: RA2 uses body-local `(Forward, Lateral, Height)` in leptons. To convert to world-space, BodyOrientation.LocalToWorld does `(y, -x, z)` — see `src/voxels/` for the Rust port.

### Building (SHP + overlays + foundation)

```
[GAPOWR]
Normalized=yes / Remapable=yes
Cameo=POWRICON
Foundation=2x2              -- grid footprint (width x height in cells)
Height=4                    -- visual height in levels
Buildup=GAPOWRMK            -- construction animation SHP (build-up sequence)
DemandLoadBuildup=true      -- defer loading until needed (memory optimization)
FreeBuildup=true            -- no extra cost for buildup frame
NewTheater=yes              -- filename takes theater suffix
ActiveAnim=GAPOWR_A         -- overlay animation when healthy
ActiveAnimDamaged=GAPOWR_AD -- overlay when HP < ConditionYellow
ActiveAnimZAdjust=-32       -- Z-sort offset
ActiveAnimYSort=362         -- explicit Y-sort key
ActiveAnimTwo / ActiveAnimTwoDamaged / ActiveAnimThree / ...
IdleAnim=CAOUTP_D           -- overlay when idle (no work)
IdleAnimDamaged=CAOUTP_DD
SpecialAnim=CAOUTP_A / SpecialAnimDamaged=CAOUTP_AD  -- scripted one-shot animations
SpecialAnimZAdjust=0 / SpecialAnimYSort=543
DeployingAnim / DeployingAnimDamaged  -- for deployable buildings (Grand Cannon etc.)
BibShape=CAOUTPBB           -- foundation/base overlay drawn underneath
SuperAnim=GAPSIS_A          -- overlay tied to a superweapon charge state
TurretAnim=OUTP             -- building with turret
TurretAnimIsVoxel=true      -- turret is VXL not SHP
TurretAnimX=-30 / TurretAnimY=14 / TurretAnimZAdjust=-140  -- screen-space turret mount offset
CanHideThings=true / CanBeHidden=false  -- behind-building Z culling
OccupyHeight=3
AddOccupy1=-2,-1 / RemoveOccupy1=2,-1   -- per-cell occupancy fixups
DamageFireOffset0=-20,32    -- pixel offsets where FIRE01/02/03 spawn when damaged
DamageFireOffset1=3,12      -- each OffsetN gets one fire; up to 4 entries
DamageSmokeOffset0=...      -- same idea for smoke particles
PrimaryFirePixelOffset=x,y  -- firing offset for turretless defenses
SecondaryFirePixelOffset=x,y
SimpleDamage=yes            -- building has a simple damage frame pair (else multi-state)
DockingOffset0=384,0,0      -- lepton offsets where units park (harvesters, aircraft)
AnimActive=0,7,2            -- 3-field spec (Start, End, Rate) for simple animations
Flat=yes                    -- drawn flat to ground (not isometric-raised)
```

### Standalone animation section (referenced as overlay or impact)

```
[CAOUTP_F]                  -- flag animation for outpost
Image=CAOUTP_F              -- SHP filename (without .shp); defaults to section name
Layer=ground                -- ground | air | top (draw order)
NewTheater=yes
Start=0                     -- first frame to play
LoopStart=0 / LoopEnd=16    -- loop boundaries
LoopCount=-1                -- -1 = infinite
Rate=300                    -- animation speed (lower = faster; this is frame delay)
DemandLoad=true             -- defer loading until first spawn
Shadow=yes                  -- SHP has shadow frames
Translucent=yes / Translucency=50  -- additive blending level (0-100)
Flat=true                   -- draw on ground plane
Normalized=yes              -- constant visual speed across game-speed settings
UseNormalLight=yes          -- lighting behavior
Crater=yes                  -- leave crater smudge on impact
Scorch=yes                  -- leave scorch smudge on impact
Report=Explosion09          -- sound on start
StartSound=BuildingFireBig
TiberiumChainReaction=yes   -- triggers tiberium explosion cascade
TranslucencyDetailLevel=1   -- LOD for translucent effects
```

### Damaged-variant pattern

Buildings reference a damaged overlay with `<Name>Damaged=<DamagedAnim>`. The damaged animation can either be a separate SHP or a different frame range of the healthy SHP:

```
[CAOUTP_A]                  -- healthy arm-extend, 10 frames
Start=1 / End=10

[CAOUTP_AD]                 -- damaged arm-extend (same SHP, later frames)
Image=CAOUTP_A              -- explicit pointer to reuse same SHP file
Start=11 / End=20           -- different frame range within the same SHP
```

This is the Tier-2 damage system: one SHP packs both states, Start/End pick which frames to play based on building HP.

### Voxel animation (flying debris)

Rules.ini `[VoxelAnims]` registers them; art.ini has no separate section — the voxel animation is driven purely from the rules.ini [<Name>] section plus the `.vxl` + `.hva` files. `ShareSource=SONIC` lets debris reuse an existing unit's voxel without a new file.

### Projectile animation (in-flight sprite)

```
[120MM]                     -- referenced via rules.ini [Cannon] Image=120MM
Normalized=yes
Trailer=SMOKEY              -- smoke trail behind the projectile
```

### Cameo (sidebar icon)

Cameos are 60x48 SHP files ending in `ICON` (original) or `UICO` (YR Aftermath). They're referenced by building/unit sections, not as standalone art sections:

```
Cameo=GIICON                -- loads giicon.shp
AltCameo=GIUICO             -- loads giuico.shp when playing Yuri's Revenge
```

## Per-theater imagery

### `Theater=yes`

Multiple palette+SHP variants exist for different terrains (temperate/snow/urban/desert/lunar). The engine picks automatically based on the current map theater. Used by tiberium, terrain props, some buildings.

### `NewTheater=yes`

The **second character** of the filename is replaced by a theater code at load:

```
GAWEAP.shp  -> base filename declared
GAWEAP.shp becomes:
  GTWEAP.shp  for temperate
  GSWEAP.shp  for snow
  GUWEAP.shp  for urban
  GLWEAP.shp  for lunar (YR)
  GDWEAP.shp  for desert
  GNWEAP.shp  for new urban (YR)
```

`NewTheater` is the standard mechanism for most RA2 buildings since theatres share the same geometry but recolored/retextured.

## Animation section keys (common)

```
Image=<name>                -- file to load (default: section name)
Start=<n>                   -- first frame index
End=<n>                     -- last frame (inclusive) — for non-looping
LoopStart=<n> / LoopEnd=<n> -- loop boundaries
LoopCount=<n>               -- -1 = infinite, 0 = no loop, N = N plays
Rate=<n>                    -- frame delay in ticks (smaller = faster)
Layer=ground|air|top        -- render order
Normalized=yes              -- fixed visual rate regardless of game speed
Translucent=yes             -- enable alpha blending
Translucency=<0-100>        -- alpha percent (0=opaque, 100=invisible)
Flat=yes                    -- render parallel to ground plane
Shadow=yes                  -- SHP has shadow frames
NewTheater=yes              -- theater-swapped filename
DemandLoad=true             -- lazy load on first use
Report=<sound>              -- sound played at animation start
StartSound=<sound>          -- alternative start sound field
EndSound=<sound>            -- sound played at animation end
UseNormalLight=yes          -- render with map-ambient light instead of effect light
Crater=yes / Scorch=yes     -- ground-marks left on finish
TiberiumChainReaction=yes   -- adjacent tiberium detonates
Bouncer=yes / Elasticity=..
Spawns=<anim> / SpawnCount=<n>  -- spawn child animations
```

## Global list sections in art.ini

```
[MovementZones]             -- numbered zone definitions (sometimes lives in rules.ini instead)
[WarheadPArticles]          -- particle-system-to-warhead mapping (legacy TS)
[Lamps]                     -- numbered list of attached-light definitions
[Rods]                      -- (Yuri's Revenge) extended light definitions
```

Most sections in art.ini are individual per-object definitions without a numbered index — the rules.ini registries and `Image=` references drive loading.

## Tracing a render pipeline from unit to screen

1. `[APOC]` rules.ini -> `Image=MTNK`
2. `[MTNK]` art.ini -> `Voxel=yes` -> loads `mtnk.vxl` + `mtnk.hva`
3. `PrimaryFireFLH=190,25,120` -> muzzle world-offset when firing
4. rules.ini weapon `[120mmx]` -> `Anim=APMUZZLE` -> art.ini `[APMUZZLE]` muzzle flash SHP
5. rules.ini weapon `[120mmx]` -> `Projectile=Cannon2`, which has `Image=120MM` -> art.ini `[120MM]` for in-flight sprite
6. Impact: warhead `[ApocAP]` -> `AnimList=APOCEXP,EXPLOSML` -> art.ini `[APOCEXP]` explosion SHP

For building turrets add:

- `TurretAnim=OUTP` + `TurretAnimIsVoxel=true` -> load `outp.vxl` + `outp.hva`
- `TurretAnimX/Y/ZAdjust` -> screen-space mount offset
- If missing `TurretAnimIsVoxel`, engine expects `outp.shp`

## How to inspect a specific object quickly

```
grep -nE "^\[<CODE>\]" art.ini                      -- find section line
awk '/^\[<CODE>\]/,/^\[/' art.ini | head -50        -- dump the section
grep -n "Image=\|Voxel=\|Cameo=\|ActiveAnim" art.ini | grep -i <CODE>
```

## Render-related voxel facts

- `.vxl` = RA2 uses 244 normal table (not TS's 36). See `docs/ARCHITECTURE.md`.
- `.hva` = hierarchical voxel animation — matrix stack per frame for each voxel piece.
- Turrets and barrels are separate voxel pieces inside the same `.vxl`, hierarchically attached.
- Voxel shadow = flattened projection of the body voxel onto ground plane, unless `UseTurretShadow=yes`.

## Related files

- Behavior is defined in `rules.ini` — see the companion `rules` skill for unit/weapon/warhead schemas.
- Voxel formats: `.vxl` + `.hva` pairs, in `local.mix` inside `ra2.mix`/`ra2md.mix`.
- SHP files: theater-specific in iso`<theater>`.mix / cameo in `cache.mix` / generic in `generic.mix`.
- Palettes: `isosno.pal`/`isotem.pal`/`isourb.pal` (theaters), `unitsno.pal`/etc (units), `anim.pal` (effects), `mousepal.pal` (cursors).
