PRE-IMPL REFLEX — Rust source modification detected
========================================================
If this edit introduces RA2 semantics (new unit / weapon / warhead /
armor / structure / animation / sprite / VFX / audio / AI / economy
behavior or values), STOP and consult canonical sources FIRST.

No magic numbers. No invented behaviors. Every implementation choice
touching RA2 must cite a canonical source in the diff comment, or
be marked `// MVP, NOT canonical` with a Phase-XX-polish TODO.

Canonical sources, ordered by authority:

  1. ASSET EXISTENCE — docs/assets/inventory/*.md
     - SHP frame layout / count / per-frame metadata
         conquer-mix-frames.md      (main game SHP)
         local-mix-frames.md        (mod-specific overrides)
         generic-neutral-cache-frames.md (neutral structures)
         yr-mix-frames.md           (YR additions)
     - Tile catalogs
         isotemp-tiles.md           (temperate)
         isosnow-tiles.md           (snow)
         isourb-isogen-tiles.md     (urban)
         yr-iso-tiles.md            (YR theaters)
     - Audio cues / voiceset
         audio-maps-wdt-frames.md
     - UI cameos / sidebar art
         sidebar-load-ecache-cameo-frames.md
     - Theater overlays
         theater-overlay-frames.md

  2. DATA VALUES — `$RA2_ASSETS_DIR/mods/cncreloaded/app/Tools/Map Editor/rulesmd.ini`
     - Unit: Strength (HP), Speed, TurnSpeed, Sight, Armor, Primary, Cost
     - Weapon: Damage, ROF, Range, Speed, Warhead, Burst, Report
     - Warhead: Verses (per-armor-class %), InfDeath, AnimList, Bullets,
                Sonic, Wall, AffectsAllies, Versus.<custom_armor>=
     - Structure: Strength, Armor, Cost, BuildTime, Prerequisite,
                  TechLevel, Power, AIBuildThis
     - General: speed multipliers, build time formulas
     Grep example:
         grep -B1 -A8 "^\[<TypeName>\]" "$RA2_RULES_PATH"

  3. ART VALUES — `$RA2_ASSETS_DIR/mods/cncreloaded/app/Tools/Map Editor/artmd.ini` (same dir as rulesmd.ini)
     - Sequence: per-anim Frames, Facings, Tick rate, looping flag
     - Render: WalkFrames, FiringFrames, ShouldShown, Voxel
     - Turret: TurretAnim, TurretOffset, PrimaryFireFLH, SecondaryFireFLH
     - Death: DeathAnim, DebrisAnim, DebrisMaximums
     Grep example:
         grep -B1 -A12 "^\[<ImageName>\]" "$RA2_ART_PATH"

  4. OpenRA CROSS-REFERENCE — github.com/OpenRA/ra2
     - mods/ra2/rules/*.yaml      (unit definitions, modernized)
     - mods/ra2/weapons/*.yaml    (weapon definitions)
     - mods/ra2/sequences/*.yaml  (sprite sequences)
     Use to disambiguate ambiguous INI values or check OpenRA balance
     tweaks. Stock INI wins on conflict — OpenRA is reference, not source.

  5. ModEnc / community wiki — last-resort, NOT authoritative.

If no canonical source covers the decision (true MVP / engine quirk):
  - Add `// MVP, NOT canonical (Phase-XX-polish TODO: <gap>)` comment
  - Mark in PROJECT_STATUS.md tech-debt ledger
  - Pin the chosen value via unit test so it can't drift silently

If this edit is purely refactor / comment / type rename / log message
text / test-assertion-tightening / etc. — no canonical query needed.
Trust your reading of the existing comments and continue.
