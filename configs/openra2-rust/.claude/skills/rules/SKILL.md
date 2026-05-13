---
name: rules
description: RA2 rules.ini structure reference — object registry, behavior sections, weapon/warhead/projectile chain, general config
---

# RA2 rules.ini Structure

`rules.ini` is the gameplay definition file. It controls **behavior** (HP, speed, damage, weapons, build prerequisites, AI) but not graphics. Graphics live in `art.ini`. Sections link to art.ini via `Image=<artSection>` (defaulting to the section name if omitted).

Source of truth file: extract from `local.mix` inside `ra2.mix` or `ra2md.mix` with openra2-rust `mix_tool`.

## Top-level file shape

```
[General]              -- global tunables (build speed, veteran multipliers, repair rates, etc.)
[AudioVisual]          -- cross-cutting visual knobs (DamageFireTypes, ChronoBeamColor, OreTwinkle)
[SpecialWeapons]       -- numbered list (MultiMissile, IronCurtainSpecial, ChronoSphereSpecial, etc.)
[Countries]            -- numbered list of playable countries
[InfantryTypes]        -- numbered list: 1=E1 / 2=E2 / 3=SHK ...
[VehicleTypes]         -- numbered list: 1=HTNK / 2=MTNK ...
[AircraftTypes]        -- numbered list
[BuildingTypes]        -- numbered list: 1=GAPOWR / 2=GAPILE ...
[TerrainTypes]         -- numbered list of decoration props (trees, rocks)
[SmudgeTypes]          -- craters / scorch marks
[OverlayTypes]         -- tiberium, walls, bridges, tech crates, gems
[Animations]           -- numbered list: 22=H2O_EXP1 / 42=GUNFIRE / ...
[VoxelAnims]           -- numbered list: 1=PIECE / 4=SONICTURRET / ...
[Particles]            -- 1=GasCloud1 / 4=Spark / ...
[ParticleSystems]      -- named list of system definitions
[SuperWeaponTypes]     -- numbered list
[Warheads]             -- numbered list: 6=AP / 8=Fire / 26=PsiPulse / ...
[AI]                   -- AI behavior tunables
[Colors]               -- named color palette (DarkGreen=0,160,0,... etc.)
[Tiberiums]            -- numbered list (ore/gems variants)

... then one [<SectionName>] per registered object ...
```

**Every object name in the numbered registries MUST have a matching `[<Name>]` definition later in the file**, otherwise the engine crashes at load.

## Object section schemas

### Infantry `[<CODE>]` (example: `[E1]`)

```
UIName=Name:E1                     -- localization key
Name=GI                            -- fallback English display name
Image=GI                           -- art.ini section (defaults to section name)
Category=Soldier                   -- Soldier | Support | AFV | AirPower | ...
Primary=M60                        -- weapon id (must exist as [<weapon>] below)
Secondary=Para                     -- optional second weapon
ElitePrimary=M60E / EliteSecondary=ParaE
Prerequisite=GAPILE                -- requires this building (build-chain gate)
Strength=125                       -- HP
Armor=none                         -- none|flak|plate|light|medium|heavy|wood|steel|concrete|special_1|special_2
TechLevel=1                        -- -1 hides in sidebar
Sight=5                            -- reveal radius in cells
Speed=4                            -- movement rate
Cost=200 / Soylent=150 / Points=10
Owner=British,French,Germans,...   -- comma-list of countries
Locomotor={GUID}                   -- foot/tank/aircraft/hover/amphib/jumpjet/drive/ship
MovementZone=Infantry              -- Infantry|Normal|Destroyer|Aircraft|...
ThreatPosed=10                     -- AI threat weighting; MUST be 0 for building addons
Deployer=yes / DeployFire=yes      -- prone/crouch behavior
VeteranAbilities=STRONGER,FIREPOWER,ROF,SIGHT,FASTER
EliteAbilities=SELF_HEAL,STRONGER,FIREPOWER,ROF
Crushable=yes / Bombable=yes / ImmuneToPsionics=no
VoiceSelect=GISelect               -- sound bank id
VoiceMove=GIMove / VoiceAttack=GIAttackCommand / VoiceFeedback=GIFear
DieSound=GIDie / CrushSound=InfantrySquish
IFVMode=2                          -- IFV turret mode index
Size=1 / PhysicalSize=1            -- transport slot cost
Pip=white                          -- sidebar HP pip color
Occupier=yes                       -- can garrison UC buildings
```

### Vehicle `[<CODE>]` (example: `[APOC]`)

Infantry schema plus:

```
Image=MTNK                         -- usually points to a different art section (visual reuse)
Turret=yes / ROT=5                 -- has turret, rotation rate
Crusher=yes                        -- can crush infantry
SelfHealing=yes
Crewed=no                          -- spawn parachuting crew on death?
Explodes=yes                       -- death-trigger secondary explosion
Explosion=TWLT070,S_BANG48,S_BRNL58,S_CLSN58,S_TUMU60  -- animation pool
Maxdebris=3                        -- voxel debris count on death
DebrisAnims=DBRIS1LG,DBRIS1SM      -- animation pool for chunks
Weight=3.5                         -- bridge/collision mass
ZFudgeColumn=9                     -- Z-sort tiebreaker
DamageParticleSystems=SparkSys,SmallGreySSys
MoveSound=ApocalypseMoveStart
TargetLaser=yes                    -- paints red laser on target
IsSelectableCombatant=yes
AllowedToStartInMultiplayer=no     -- hide from pre-game spawn pool
```

### Building `[<CODE>]` (example: `[GAPOWR]`)

```
UIName=Name:GAPOWR / Name=Power Plant
BuildCat=Power                     -- Power|Refinery|Factory|Barracks|Tech|Combat|DontCare
Prerequisite=GACNST                -- must own this building to unlock
Strength=750 / Armor=wood / TechLevel=1
Sight=4 / Adjacent=2               -- build-adjacency radius
Owner=British,French,Germans,...
AIBasePlanningSide=0               -- 0=Allied base layout, 1=Soviet
Cost=800 / Points=40
Power=200                          -- positive=produce, negative=consume
Capturable=true                    -- engineer can take over
Spyable=yes                        -- spy can infiltrate
Crewed=yes                         -- spawn survivors on sell/destroy
Explosion=TWLT070,S_BANG48,...
DebrisAnims=DBRIS1LG,...           -- physical chunks
MaxDebris=6 / MinDebris=4
DamageSmokeOffset=300,300,450      -- lepton-space smoke position when damaged
TogglePower=no                     -- player can toggle this building on/off
Unsellable=yes
IsBase=yes                         -- counts as base presence for win/lose
LeaveRubble=yes                    -- spawn rubble overlay on destroy
ThreatPosed=0                      -- MUST be 0 for buildings
UnitRepair=yes                     -- acts as service depot
NumberOfDocks=1                    -- loading bays (refinery/repair/etc.)
Upgrades=2                         -- slots for power-plant upgrade etc.
NeedsEngineer=yes                  -- capture requires engineer not just any unit
Turret=yes / TurretAnim=OUTP / TurretAnimIsVoxel=true  -- turret-having defenses
TurretAnimX=-30 / TurretAnimY=14 / TurretAnimZAdjust=-140  -- screen-space mount offset
FireAngle=0                        -- default upward angle for fire
NumberImpassableRows=3             -- fix for service depot tile drive-on bug
```

## Weapon chain (the most common chain to trace)

Unit Primary -> Weapon -> Projectile + Image + Warhead -> Warhead AnimList -> Animation section.

### `[<WeaponName>]` (example: `[120mm]`)

```
Damage=90                          -- raw damage before Verses multiplier
ROF=65                             -- rate of fire (game frames between shots)
Range=5.75                         -- cells
MinimumRange=0                     -- if >0, weapon cannot fire inside this radius
Projectile=Cannon                  -- [<projectile>] section (path shape)
Speed=40                           -- projectile travel speed
Warhead=AP                         -- damage + impact animation resolver
Report=RhinoTankAttack             -- fire sound
Anim=GUNFIRE                       -- muzzle-flash animation at fire point
Bright=yes                         -- add lightsource during fire
Burst=2                            -- shots per trigger
Charges=yes                        -- weapon powers up before fire (Prism Tower)
AttachedParticleSystem=<name>      -- trailing particle effect
```

### `[<ProjectileName>]` (example: `[Cannon]`)

```
Image=120MM                        -- art.ini anim for the in-flight projectile
Arcing=true                        -- ballistic parabola (true) vs straight line
SubjectToCliffs=yes                -- blocked by terrain elevation
SubjectToElevation=yes
SubjectToWalls=yes
AA=no                              -- anti-air capable
AG=yes                             -- anti-ground capable
Ranged=yes / VeryHigh=yes
ROT=4                              -- homing turn rate (0 = no homing)
Proximity=yes                      -- fuse on nearby target
Dropping=yes                       -- free-fall arc (bombs)
Cluster=8                          -- spawn N child projectiles on expire
Airburst=yes / AirburstWeapon=V3Cluster
IgnoresFirestorm=yes
Color=DarkGreen                    -- trail color
Shadow=no                          -- no ground shadow
```

### `[<WarheadName>]` (example: `[AP]`)

```
CellSpread=.3                      -- damage radius in cells (0 = single-target)
PercentAtMax=.5                    -- damage at outer edge (linear interp to 100% at center)
Verses=25%,25%,25%,75%,100%,100%,65%,45%,60%,60%,100%
      -- damage % vs armor types in order:
      -- none, flak, plate, light, medium, heavy, wood, steel, concrete, special_1, special_2
Wall=yes                           -- damages walls
Wood=yes                           -- can kill trees
Conventional=yes                   -- shown in kill tally (vs psionic/chrono)
InfDeath=3                         -- infantry death animation index
                                   --   1=normal, 2=burn, 3=gore, 4=zap, 5=explode, 6=disintegrate
AnimList=S_CLSN16,S_CLSN22         -- impact animations (engine picks by CellSpread)
ProneDamage=50%                    -- damage multiplier vs prone infantry
ProneCrouchReduction=... / ProneCrouchDamage=...
Radiation=no / RadLevel=... / Tiberium=yes
Sonic=yes / Particle=<system>
```

Verses armor order MUST match `[General]` armor enum order. Missing entries default to 100%.

### `[<AnimationName>]` (example: `[TWLT070]` rendered in art.ini)

rules.ini only lists animations in `[Animations]` numbered registry; the actual animation definition lives in **art.ini** under `[<AnimName>]`.

## Voxel debris `[<Name>]` (example: `[SONICTURRET]`)

```
Name=Disruptor Turret
ShareBodyData=no
ShareTurretData=yes                -- reuse voxel from another unit instead of separate file
ShareBarrelData=no
ShareSource=SONIC                  -- unit name to borrow voxel from
VoxelIndex=0                       -- which piece in voxel hierarchy
Elasticity=0.0                     -- bounce factor 0-1
MinAngularVelocity=10.0 / MaxAngularVelocity=14.0  -- spin speed
MinZVel=30.0 / MaxZVel=38.0        -- initial vertical velocity
MaxXYVel=8.0                       -- initial horizontal velocity
Duration=100                       -- max life in frames
ExpireAnim=TWLT036                 -- animation when lifespan ends
Spawns=<particle> / SpawnCount=3
StartSound / BounceSound / ExpireSound
TrailerAnim=<anim>                 -- animation trailing behind (smoke/flame)
Damage=20 / DamageRadius=100 / Warhead=TankOGas
AttachedSystem=<particle-system>
```

## Numbered list sections

These registries tell the engine which object IDs exist. The **numeric index matters only for save-game binary layout** — new additions must append at the end in Yuri's Revenge (`ra2md`) and the corresponding `[Name]` section must exist.

Example:

```
[InfantryTypes]
1=E1
2=E2
3=SHK
...

[BuildingTypes]
1=GAPOWR
2=GAPILE
...

[Warheads]
1=EMPuls
6=AP
8=Fire
26=PsiPulse
33=NUKE
```

## Global knobs worth knowing

```
[General]
VeteranRatio=3.0 VeteranCombat=1.1 VeteranSpeed=1.2 VeteranArmor=1.5 VeteranROF=0.6 VeteranCap=2
RefundPercent=50% ReloadRate=.3 RepairPercent=15% RepairRate=.016 RepairStep=8
BuildSpeed=.7 BuildupTime=.06 GrowthRate=5 (ore growth min)
BridgeVoxelMax=3 ExplosiveVoxelDebris=GASTANK,PIECE
TireVoxelDebris=TIRE ScrapVoxelDebris=PIECE
GameSpeedBias=1.6                  -- global movement multiplier (F5 preset)
CloakDelay=.02                     -- sub surface-stay minimum

[AudioVisual]
DamageFireTypes=FIRE01,FIRE02,FIRE03  -- global pool; engine picks per DamageFireOffsetN
ChronoBeamColor=128,200,255           -- 24-bit RGB
OreTwinkleChance=30 OreTwinkle=TWNK1  -- 1-in-N ore twinkle probability
LineTrailColorOverride=0,0,0          -- must stay 0,0,0 in rules.ini
```

## Locomotor GUIDs (foot/tank/hover/aircraft/ship/jumpjet/drive/amphib)

```
Infantry    {4A582744-9839-11d1-B709-00A024DDAFD1}
DriveLoco   {4A582741-9839-11d1-B709-00A024DDAFD1}
HoverLoco   {4A582742-9839-11d1-B709-00A024DDAFD1}
ShipLoco    {2BEA74E1-7CCA-11d3-BE14-0050041179A7}
AircraftLoco{4A582745-9839-11d1-B709-00A024DDAFD1}
JumpjetLoco {92612C46-F71F-11d1-AC9F-006008055BB5}
TeslaDrone  {55D141B8-DB94-11d1-AC98-006008055BB5}
MechLoco    {B7B49766-E576-11d3-9BD9-00600870B9F7}
```

## Tracing a behavior from unit to impact

1. `[APOC]` -> `Primary=120mmx` (weapon)
2. `[120mmx]` -> `Projectile=Cannon2` + `Image=120MMX` + `Warhead=ApocAP` + `Anim=APMUZZLE`
3. `[Cannon2]` (art: `Image=120MM`) -> travel shape
4. `[ApocAP]` -> `AnimList=APOCEXP,EXPLOSML` (impact) + `Verses=...` + `InfDeath=3`
5. `[APOCEXP]` -- definition lives in art.ini under `[APOCEXP]`

## Related files

- Unit graphics live in `art.ini` — see the companion `art` skill for section schemas.
- Animation scripts also live in `art.ini` (`[Animations]` in rules.ini is just a numbered id list).
- String localization: `ra2md.csf` / `ra2.csf`.
- AI triggers: `aimd.ini` / `ai.ini` (separate file, similar section-registry pattern).

## How to inspect a specific object quickly

```
grep -nE "^\[<CODE>\]" rules.ini                     -- find section line
grep -n "Primary=\|Warhead=\|Image=\|Prerequisite=" rules.ini | grep <CODE>
awk '/^\[<CODE>\]/,/^\[/' rules.ini | head -40       -- dump one section
```

For weapon/warhead chain tracing see the `art` skill for the graphics side.
