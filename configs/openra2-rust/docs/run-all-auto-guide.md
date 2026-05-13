# /run-all-auto Command Guide

Run all 68 AUTO smoke tests sequentially with full validation. Covers Phases 23-28l of the openra2-rust project: unit control / combat / VFX / pathfinding / Phase 28k V3 ballistic-missile pipeline / Phase 28l naval combat (including the amphibious commando vs naval target matrix).

## Usage

```
/run-all-auto
```

Takes no arguments. The 68-test matrix is hard-coded in the command file with per-row `AUTO_<NAME>`, `CAM_CPOS`, `CAM_ZOOM`, and `RA2_MAP`.

## What It Does

1. Validates environment: `WAYLAND_DISPLAY`, clean working tree, no stale openra2-rust process
2. Builds the release binary once (`source .env && cargo build --release`)
3. Runs each of the 68 smokes in sequence with `AUTO_FRAME=1800` and the row's camera preset
4. Captures stdout+stderr to `/tmp/auto_<name>.log` per row
5. Scans each log for symptoms: `panic`, `WARN`, `ERROR`, `overflow`, `Could not despawn`, `unwrap`, `index out of bounds`, unexpected state transitions
6. After the matrix completes, reports Passed N/68, Failed N/68, plus per-test non-baseline symptoms

## Key Features

- Two `RA2_MAP` values in use: `heartland` (land/combat/VFX) and `bering-strait` (21 water-dependent tests)
- Known baseline noise (`vxl_material.wgsl` missing / `sctk_adwaita::buttons` / `wgpu_hal::vulkan::instance`) is filtered automatically
- Known test-specific symptoms (AUTO_GROUP_COLORS double-despawn, AUTO_INFANTRY_DEPLOY shoot-deployed transition, V3 PREFIRE/TRAIL assertion lines) are documented inline so they are not misreported as failures
- 1800-frame window is mandatory; never reduce per-row -- shorter windows let actors despawn before the screenshot frame

## When to Use

- Before merging any PR that touches game logic, render path, FSM, or pathfinding
- After a refactor that spans multiple subsystems, to catch cross-system regressions
- To regenerate the regression-screenshot set under `/tmp/auto_*.png` for visual comparison

## Pass/Fail Reporting

- Exit code 0 / non-zero is captured per row; the matrix continues past individual failures so the final report is complete
- Per-row PASS = exit code 0 AND log contains `Screenshot saved` AND no non-baseline symptoms
- Per-row FAIL = any of the above conditions fails -- the row name and triggering symptom is logged

## Important Notes

- `AUTO_FRAME=1800` is mandatory; the per-test scheduler relies on it
- `AUTO_SCREENSHOT=...` must be set per test -- without it `auto_screenshot_system` never registers, the run hangs forever
- `WAYLAND_DISPLAY=wayland-0` required for headless GPU context
- Run tests one at a time -- each spawns a full Bevy app with a GPU context, parallel runs cause contention
- Kill stale openra2-rust processes before starting: `pkill -f openra2-rust || true` (never `-9`, never broader pattern)

## Related

- `/fps-bench` -- A/B compare two commits using the same 1800-frame `AUTO_PATROL` scene
- `configs/openra2-rust/.claude/commands/run-all-auto.md` -- canonical command file
- `docs/testing/environment-variables.md` (in the openra2-rust main repo) -- per-test env-var reference
