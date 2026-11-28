# Run All AUTO Smoke Tests

Run all 141 AUTO smoke tests sequentially with full validation. Covers Phases 23-29c: unit control / combat / VFX / pathfinding / death variants and veterancy / Phase 28k V3 ballistic-missile pipeline (Half A + Half B) / Phase 28l naval combat / Phase 28m aircraft (Kirov, Harrier, Black Eagle, Nighthawk, airfields, carrier Hornets, Rocketeer) and ground anti-air.

## Input Validation

This command takes no user arguments, but it MUST validate the environment before kicking off ~141 cargo runs (~3.7 hours of GPU time):

- Refuse to start if `[[ -z "$WAYLAND_DISPLAY" ]]` and SSH session detected -- headless without Wayland will silently render to nowhere.
- Refuse to start if `git status --porcelain` shows un-stashed changes that could be lost on a panic-driven `pkill`.
- Sanitize each test-row's `AUTO_*` env-var name against `[A-Z_]+` before splicing into the shell command (the matrix below is hard-coded, but validate anyway).
- Check input scope: ensure no stale openra2-rust process is holding `target/release/` (`pgrep -f openra2-rust`). Ask the user to close it, do not `pkill` blindly.

## Execution

### Step 1: Build the Release Binary

```bash
source .env && cargo build --release || exit 1
```

### Step 2: Run the 141-Test Matrix

Run each of the 141 tests below sequentially. For each test:

- Run the command exactly as specified (AUTO_FRAME=1800, no override)
- Capture stdout+stderr to a log file at `/tmp/auto_<name>.log`
- After completion, check exit code for PASS/FAIL
- Scan the log for symptoms: `panic`, `WARN`, `ERROR`, `overflow`, `Could not despawn`, `unwrap`, `index out of bounds`, unexpected state transitions
- Report per-test: PASS/FAIL + any symptoms found (excluding known baseline noise)

### Known baseline noise (ignore these)

- `vxl_material.wgsl` asset not found -- harmless, pre-loaded elsewhere
- `sctk_adwaita::buttons` Wayland decoration warning
- `wgpu_hal::vulkan::instance` Vulkan debug messages

### Test invocation pattern

For each test, run (set `RA2_MAP=<map>` if the test's row lists one — otherwise omit it):

```bash
source .env && WAYLAND_DISPLAY=wayland-0 DEBUG_HUD=1 DEBUG_COMBAT=1 [RA2_MAP=<map>] AUTO_FRAME=1800 AUTO_SCREENSHOT="/tmp/auto_<NAME>.png" AUTO_<NAME>=1 CAM_CPOS=<X,Y> CAM_ZOOM=<Z> cargo run --release > /tmp/auto_<name>.log 2>&1
```

### All 141 tests with camera presets

`RA2_MAP` is **required for every test** — every row spells out the exact map name so no test runs on an unintended layout. Two maps in use:

- `heartland` — default land map; used by most combat / infantry / VFX tests
- `bering-strait` — open-ocean naval map; used by all 35 water-dependent tests (naval VXL ships, swimming infantry, water-cell impact, dolphin / squid sprites, amphibious commando vs naval target matrix)

| # | Env Var | CAM_CPOS | CAM_ZOOM | RA2_MAP |
|---|---------|----------|----------|---------|
| 1 | AUTO_PATROL | 55,15 | 1.0 | heartland |
| 2 | AUTO_INFANTRY | 109,-2 | 2.0 | heartland |
| 3 | AUTO_CAPTURE | 109,-2 | 2.0 | heartland |
| 4 | AUTO_COMBAT | 62,30 | 2.0 | heartland |
| 5 | AUTO_ATTACK_MOVE | 70,35 | 1.0 | heartland |
| 6 | AUTO_NORMAL_MOVE | 70,35 | 1.0 | heartland |
| 7 | AUTO_PURSUIT | 62,30 | 1.0 | heartland |
| 8 | AUTO_STANCE | 62,30 | 2.0 | heartland |
| 9 | AUTO_HOLDFIRE_NOCHASE | 62,30 | 2.0 | heartland |
| 10 | AUTO_DEFEND_NOCHASE | 70,30 | 1.0 | heartland |
| 11 | AUTO_FORCE_FIRE | 62,30 | 2.0 | heartland |
| 12 | AUTO_ATTACK_GROUND | 62,30 | 2.0 | heartland |
| 13 | AUTO_THREAT_SCORING | 63,30 | 2.0 | heartland |
| 14 | AUTO_INFANTRY_DEATH | 62,30 | 2.0 | heartland |
| 15 | AUTO_INFANTRY_DEPLOY | 62,30 | 2.0 | heartland |
| 16 | AUTO_INFANTRY_COMBAT_MIX | 80,30 | 2.0 | heartland |
| 17 | AUTO_TAB_FILTER | 79,31 | 2.0 | heartland |
| 18 | AUTO_GROUP_SELECTION | 79,8 | 2.0 | heartland |
| 19 | AUTO_MIXED_GROUP_SELECTION | 80,10 | 1.5 | heartland |
| 20 | AUTO_GROUP_COLORS | 79,8 | 2.5 | heartland |
| 21 | AUTO_GROUP_DISPATCH | 79,8 | 2.0 | heartland |
| 22 | AUTO_MIXED_ATTACK_MOVE | 72,36 | 1.5 | heartland |
| 23 | AUTO_INFANTRY_NAV | 77,25 | 1.5 | heartland |
| 24 | AUTO_PATROL_INFANTRY | 80,8 | 1.5 | heartland |
| 25 | AUTO_SWIM | 78,10 | 1.5 | bering-strait |
| 26 | AUTO_C4 | 109,-2 | 2.0 | heartland |
| 27 | AUTO_C4_FORCE | 109,-2 | 2.0 | heartland |
| 28 | AUTO_BALLISTIC | 62,30 | 2.0 | heartland |
| 29 | AUTO_INFANTRY_AG | 62,30 | 2.0 | heartland |
| 30 | AUTO_INFANTRY_AG_8WAY | 75,35 | 2.0 | heartland |
| 31 | AUTO_ZORDER | 78,25 | 2.0 | heartland |
| 32 | AUTO_MUZZLE | 78,25 | 2.5 | heartland |
| 33 | AUTO_APOC | 60,31 | 2.0 | heartland |
| 34 | AUTO_EXPLOSIONS | 63,33 | 1.5 | heartland |
| 35 | AUTO_PRISM | 62,30 | 2.0 | heartland |
| 36 | AUTO_PARTICLES | 65,30 | 1.5 | heartland |
| 37 | AUTO_DAMAGE_SMOKE | 65,30 | 1.5 | heartland |
| 38 | AUTO_SCORCH_CRATER | 112,10 | 2.0 | heartland |
| 39 | AUTO_WAKE | 80,8 | 1.5 | bering-strait |
| 40 | AUTO_NAVAL_DEPTHS | 79,13 | 2.5 | bering-strait |
| 41 | AUTO_V3_4WAY | 64,34 | 1.5 | heartland |
| 42 | AUTO_V3_DIAG | 64,34 | 1.5 | heartland |
| 43 | AUTO_V3_MINRANGE | 64,34 | 2.5 | heartland |
| 44 | AUTO_V3_MAXRANGE | 64,34 | 1.5 | heartland |
| 45 | AUTO_V3_PREFIRE | 65,30 | 2.0 | heartland |
| 46 | AUTO_V3_TRAIL | 64,34 | 1.5 | heartland |
| 47 | AUTO_WATER_IMPACT | 78,7 | 2.0 | bering-strait |
| 48 | AUTO_DEST_CANNON | 74,17 | 2.0 | bering-strait |
| 49 | AUTO_DRED_MISSILE | 124,-33 | 0.8 | bering-strait |
| 50 | AUTO_DRED_MISSILE_ATTACK_LAND | 93,-4 | 1.5 | bering-strait |
| 51 | AUTO_HYD_FLAK | 74,16 | 2.5 | bering-strait |
| 52 | AUTO_HYD_FAG | 74,16 | 3.0 | bering-strait |
| 53 | AUTO_V3_BUILDING | 53,15 | 2.0 | heartland |
| 54 | AUTO_DLPH_SPAWN | 78,13 | 3.0 | bering-strait |
| 55 | AUTO_DLPH_SONIC | 78,7 | 3.0 | bering-strait |
| 56 | AUTO_VETERANCY_INFANTRY | 64,30 | 2.5 | heartland |
| 57 | AUTO_TWO_WAY_PURSUIT | 63,25 | 2.0 | heartland |
| 58 | AUTO_IDLE_FIDGET | 62,30 | 3.0 | heartland |
| 59 | AUTO_DLPH_VS_SQD | 79,10 | 2.0 | bering-strait |
| 60 | AUTO_SQD_DLPH_LORE | 82,10 | 2.0 | bering-strait |
| 61 | AUTO_DLPH_FORCE_FIRE | 78,10 | 2.5 | bering-strait |
| 62 | AUTO_DLPH_ATTACK_MOVE | 77,8 | 2.0 | bering-strait |
| 63 | AUTO_SQD_ATTACK_MOVE | 80,8 | 2.0 | bering-strait |
| 64 | AUTO_TANYA_VS_SEAL | 78,8 | 2.5 | bering-strait |
| 65 | AUTO_TANYA_VS_DLPH | 77,8 | 2.5 | bering-strait |
| 66 | AUTO_TANYA_VS_SQD | 76,8 | 2.0 | bering-strait |
| 67 | AUTO_SEAL_VS_DLPH | 77,8 | 2.5 | bering-strait |
| 68 | AUTO_SEAL_VS_SQD | 76,8 | 2.0 | bering-strait |
| 69 | AUTO_SUB_TORPEDO | 83,9 | 2.0 | bering-strait |
| 70 | AUTO_NAVAL_SINK | 83,9 | 2.5 | bering-strait |
| 71 | AUTO_SWIM_DEATH | 83,9 | 2.5 | bering-strait |
| 72 | AUTO_SQD_GRAPPLE | 125,-27 | 1.0 | bering-strait |
| 73 | AUTO_BUILDING_COLLAPSE | 109,-2 | 2.0 | heartland |
| 74 | AUTO_FIRE_COMPARE | 62,30 | 2.5 | heartland |
| 75 | AUTO_ROAD_PATH | 67,20 | 1.0 | heartland |
| 76 | AUTO_KIROV_CLIMB | 109,-2 | 1.5 | heartland |
| 77 | AUTO_AEGIS_VS_KIROV | 74,10 | 2.0 | bering-strait |
| 78 | AUTO_AEGIS_OVERFLY | 78,10 | 1.0 | bering-strait |
| 79 | AUTO_DEATH_VARIANTS | 62,30 | 2.0 | heartland |
| 80 | AUTO_FLAMEGUY | 62,30 | 2.5 | heartland |
| 81 | AUTO_WRECKAGE | 62,30 | 2.5 | heartland |
| 82 | AUTO_VETERANCY | 64,30 | 2.0 | heartland |
| 83 | AUTO_ELITE | 63,30 | 2.0 | heartland |
| 84 | AUTO_ELITE_GI | 62,30 | 2.5 | heartland |
| 85 | AUTO_VFX | 62,30 | 2.0 | heartland |
| 86 | AUTO_VFX_CROSS | 62,30 | 2.0 | heartland |
| 87 | AUTO_BUILDING_AIM_8WAY | 110,-1 | 2.0 | heartland |
| 88 | AUTO_DROWN | 80,8 | 2.5 | bering-strait |
| 89 | AUTO_AA_PATRIOT | 62,28 | 3.0 | heartland |
| 90 | AUTO_AA_TANK_VS_KIROV_FORCE | 62,30 | 2.0 | heartland |
| 91 | AUTO_AA_NAFLAK | 64,28 | 2.0 | heartland |
| 92 | AUTO_AA_FLAKT | 59,26 | 2.0 | heartland |
| 93 | AUTO_AA_HTK | 58,24 | 1.5 | heartland |
| 94 | AUTO_AA_IFV | 58,23 | 1.5 | heartland |
| 95 | AUTO_AA_APOC | 58,22 | 2.0 | heartland |
| 96 | AUTO_KIROV_VS_KIROV | 62,28 | 2.0 | heartland |
| 97 | AUTO_AIR_VS_GROUND_BOMB | 60,30 | 2.5 | heartland |
| 98 | AUTO_AIR_HARRIER | 58,28 | 1.5 | heartland |
| 99 | AUTO_AIR_HARRIER_SORTIE | 57,28 | 1.2 | heartland |
| 100 | AUTO_AIR_HARRIER_EGRESS | 62,28 | 1.2 | heartland |
| 101 | AUTO_AIR_BLACK_EAGLE_SORTIE | 57,28 | 1.2 | heartland |
| 102 | AUTO_AIR_NIGHTHAWK | 58,28 | 1.5 | heartland |
| 103 | AUTO_AIRFIELD_PADS | 50,25 | 4.0 | heartland |
| 104 | AUTO_AIRFIELD_STRIKE | 50,20 | 1.2 | heartland |
| 105 | AUTO_CARRIER_HORNET | 68,8 | 1.5 | bering-strait |
| 106 | AUTO_CARRIER_REGEN | 68,8 | 1.5 | bering-strait |
| 107 | AUTO_CARRIER_SINK | 68,8 | 1.5 | bering-strait |
| 108 | AUTO_ASW_HORNET | 81,8 | 2.5 | bering-strait |
| 109 | AUTO_ROCKETEER | 63,30 | 2.0 | heartland |
| 110 | AUTO_ROCKETEER_AIR | 63,28 | 2.0 | heartland |
| 111 | AUTO_ROCKETEER_DEATH | 62,28 | 3.0 | heartland |
| 112 | AUTO_ROCKETEER_SWARM | 62,27 | 1.5 | heartland |
| 113 | AUTO_V3_INTERCEPT | 58,30 | 1.0 | heartland |
| 114 | AUTO_V3_ROCKETEER | 58,30 | 1.0 | heartland |
| 115 | AUTO_V3_FLAK | 58,30 | 1.0 | heartland |
| 116 | AUTO_TRANSPORT_HTK | 60,31 | 2.0 | heartland |
| 117 | AUTO_TRANSPORT_HTK_KILL | 60,31 | 2.0 | heartland |
| 118 | AUTO_TRANSPORT_IFV | 63,30 | 2.0 | heartland |
| 119 | AUTO_TRANSPORT_LCRF | 56,9 | 1.5 | bering-strait |
| 120 | AUTO_TRANSPORT_LCRF_KILL | 56,9 | 1.5 | bering-strait |
| 121 | AUTO_TRANSPORT_SHAD | 63,30 | 1.5 | heartland |
| 122 | AUTO_TRANSPORT_SHAD_KILL | 63,30 | 1.5 | heartland |
| 123 | AUTO_VXL_HILL_CLICK | 85,-62 | 1.5 | heartland |
| 124 | AUTO_GAME_SPEED | 62,30 | 1.5 | heartland |
| 125 | AUTO_DATA_REGISTRY | 63,32 | 2.0 | heartland |
| 126 | AUTO_STATS_DUEL | 63,35 | 2.0 | heartland |
| 127 | AUTO_CMIN_UNARMED | 63,37 | 2.0 | heartland |
| 128 | AUTO_MCV_DEPLOY | 59,42 | 1.5 | heartland |
| 129 | AUTO_PLACEMENT_RULES | 56,42 | 1.5 | heartland |
| 130 | AUTO_SELL_REPAIR | 57,42 | 1.5 | heartland |
| 131 | AUTO_LOW_POWER | 56,40 | 1.5 | heartland |
| 132 | AUTO_BUILD_INFANTRY | 57,42 | 1.5 | heartland |
| 133 | AUTO_BUILD_VEHICLE | 58,44 | 1.5 | heartland |
| 134 | AUTO_BUILD_STRUCTURE | 57,42 | 1.5 | heartland |
| 135 | AUTO_TECH_TREE | 57,42 | 1.5 | heartland |
| 136 | AUTO_SIDEBAR | 57,42 | 1.5 | heartland |
| 137 | AUTO_RALLY | 56,44 | 1.5 | heartland |
| 138 | AUTO_ROSTER_SPAWN | 55,58 | 0.6 | heartland |
| 139 | AUTO_BUILD_SHIP | 74,17 | 1.0 | bering-strait |
| 140 | AUTO_BUILD_SHAD | 58,44 | 1.5 | heartland |
| 141 | AUTO_TNKD_SABOT | 63,35 | 2.0 | heartland |

### Known test-specific symptoms (non-blocking)

- Phase 29b / 29c economy smokes (AUTO_MCV_DEPLOY, AUTO_PLACEMENT_RULES, AUTO_SELL_REPAIR, AUTO_LOW_POWER, AUTO_BUILD_*, AUTO_TECH_TREE, AUTO_SIDEBAR, AUTO_RALLY): verdicts are in game frames and finish well before frame 1800; each logs one `PASS` / `FAIL` line. A missing verdict line means the run ended early, not a pass. AUTO_BUILD_SHIP (shipyard exit + `ProductionAnim`, needs ~1600 frames) and AUTO_BUILD_SHAD (Nighthawk roof exit, needs ~1500 frames) finish closest to the limit. AUTO_BUILD_INFANTRY's hold check is occasionally flaky; rerun once before calling it a regression.
- AUTO_APOC (rewritten in 28o-1): a Rookie and an Elite Apocalypse fire at the stock cadence; `PASS 2/2` needs Burst 2 / 84 frames and Burst 4 / 60 frames with alternating barrels. AUTO_TNKD_SABOT logs two PASS lines (SABOT, then SABOTE after the forced promotion).
- AUTO_GROUP_COLORS: double-despawn race at `gpu_selection.rs:418` (cosmetic)
- AUTO_ROCKETEER_SWARM: needs ~3000 frames with 4 Patriots (PASS ~38 s). At the mandatory 1800 the run ends around 18/20 kills without a PASS / FAIL line; that is not a regression.
- Visual-only smokes (no PASS / FAIL line): AUTO_DEATH_VARIANTS, AUTO_FLAMEGUY, AUTO_WRECKAGE, AUTO_VETERANCY, AUTO_ELITE, AUTO_ELITE_GI, AUTO_VFX, AUTO_VFX_CROSS, AUTO_BUILDING_AIM_8WAY, AUTO_AA_PATRIOT, AUTO_KIROV_VS_KIROV (interactive). Judge them by `Screenshot saved` and a clean log.
- AUTO_V3_4WAY / AUTO_V3_DIAG / AUTO_V3_MINRANGE / AUTO_V3_MAXRANGE: recommended `AUTO_FRAME` is shorter than 1800 (130 / 300 / 900 / 300 respectively) — running at 1800 is safe but produces ~50 s of post-impact idle. Smokes spawn launchers at frame 5, fire/impact early, and stay idle until the screenshot frame. Pass criteria: at least one `[combat impact] target=...` line per launcher and zero `[missile lifetime cap]` warnings.
- AUTO_V3_PREFIRE / AUTO_V3_TRAIL: assertion fires at frame 180 regardless of `AUTO_FRAME`, so the universal `AUTO_FRAME=1800` works without a per-smoke override (action completes ~frame 109, then idle until screenshot). Each smoke logs an explicit `PASS` / `FAIL` line — look for `[auto-v3-prefire] PASS` and `[auto-v3-trail] PASS`. Pass criteria:
  - **AUTO_V3_PREFIRE**: `peak_dwell ≥ PRE_FIRE_TICKS` (= 18) AND `dwell_window ≥ PRE_FIRE_TICKS - 1` (= 17). The `-1` accounts for the counter going 0→1 on settle frame and reaching N exactly N-1 frames later.
  - **AUTO_V3_TRAIL**: `trail_burst_count ≥ 15` (4 V3 launchers × ~7 puffs each ≈ 28; assertion floor is 15). Counts both `EmitterPreset::Smoke` and `EmitterPreset::SmokeTrail` events so the gate stays robust if V3 swaps presets. Also requires at least one `MissileTrail` component observed during flight.

### Step 3: Aggregate and Report

After all tests complete, report:

- Total: Passed N / 141, Failed N / 141
- Per-test symptom summary (only non-baseline warnings)
- Any new or unexpected symptoms not in the known list above

## Error Handling

- If `cargo build --release` returns non-zero, abort the whole run with `exit 1`. Do not run individual smokes against a stale binary.
- If any per-test cargo invocation exits without writing the `Screenshot saved` marker, classify the row as FAIL and continue to the next test -- a single failed smoke must not block the matrix.
- If the harness panics or `pkill -f openra2-rust` is required mid-matrix, record the row that triggered it AND the row that was next-up so the matrix can be resumed deterministically.
- On any hook-blocked invocation (timeout-too-short, AUTO_FRAME-without-AUTO_SCREENSHOT), surface the blocker to the user; do not paper over by retrying with looser env.

## Security

- All env vars are constants from the hard-coded matrix below. Never pass user-supplied values into the `AUTO_<NAME>=...` slot.
- Log files are written under `/tmp/auto_*.log` only. Refuse any caller request to redirect output to absolute paths outside `/tmp/`.
- The matrix is read-only intent: this command never modifies the working tree, never `git checkout`s a different ref, never amends. Any deviation is a bug.
- The kill step (`pkill -f openra2-rust`) is the only process operation. It must NOT include `-9` (SIGKILL) or pattern-match anything broader than `openra2-rust`.

## Security Checklist

- [ ] `WAYLAND_DISPLAY` validated before launch.
- [ ] Working tree clean before launch.
- [ ] All env-var names in the matrix sanitized against `[A-Z_]+`.
- [ ] No stale openra2-rust process before launch.
- [ ] Per-test output redirected only under `/tmp/auto_*`.
- [ ] No `--no-verify` / `--force` / `--no-edit` paths anywhere in the command.

## Important

- AUTO_FRAME=1800 is mandatory -- never reduce it. This gives 60 seconds at 30fps for proper validation.
- AUTO_SCREENSHOT must be set for each test -- without it, the auto_screenshot_system is never registered and the test runs forever with no exit mechanism.
- WAYLAND_DISPLAY=wayland-0 is required for GPU context in SSH/headless environments.
- Run tests one at a time -- each test spawns a full Bevy app with GPU context.
- Kill any stale openra2-rust processes before starting: `pkill -f openra2-rust || true`
