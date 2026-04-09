# OpenRA2-Rust -- Claude Code Workflow

OpenRA2-Rust: Porting Red Alert 2 from C#/OpenRA to Rust/Bevy with Wgpu/Vulkan rendering.
License: GPL-3.0. Owner: Woodrow Shen.

- OpenRA engine: https://github.com/OpenRA/OpenRA
- RA2 mod: https://github.com/OpenRA/ra2
- Status/roadmap: `docs/PROJECT_STATUS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`
- Project structure: `src/lib.rs` (19 pub modules), `src/bin/` (12 demos/tools)
- Dependencies: `Cargo.toml` (Bevy 0.15, base64, image, tempfile)

## Environment Variables

All binaries use environment variables for asset paths. Define in `.env` (gitignored):

```bash
export RA2_ASSETS_DIR="/path/to/RA2/assets"
export RA2_MIXDB_PATH="/path/to/OpenRA/global mix database.dat"
export RA2_MOD_DIR="/path/to/ra2/mods/ra2"
export SOURCE_PATH_OPENRA="/path/to/OpenRA"
export SOURCE_PATH_RA2_MOD="/path/to/ra2"
```

**NEVER hardcode local paths in committed files.** Use `std::env::var()` at runtime.

### C# Source Reference Paths

When porting features, read the original C# source directly from local checkouts:

- `$SOURCE_PATH_OPENRA` -- OpenRA engine repo (e.g. `OpenRA.Game/`, `OpenRA.Mods.Common/`, `glsl/`)
- `$SOURCE_PATH_RA2_MOD` -- RA2 mod repo (e.g. `mods/ra2/`, `OpenRA.Mods.RA2/`)

Use these to quickly locate C# reference implementations:
```bash
# Example: find Turreted trait implementation
grep -r "class Turreted" "$SOURCE_PATH_OPENRA"/OpenRA.Mods.Common/
# Example: find RA2-specific trait
grep -r "class MindControl" "$SOURCE_PATH_RA2_MOD"/OpenRA.Mods.RA2/
```

### Debug / Runtime Environment Variables

These optional env vars control runtime behavior (not in `.env`):

| Variable | Usage | Example |
|----------|-------|---------|
| `WAYLAND_DISPLAY` | Required for headless/SSH — set to run without a display server | `WAYLAND_DISPLAY=wayland-0` |
| `AUTO_SCREENSHOT` | Capture screenshot after 10 frames and exit; value = output path | `AUTO_SCREENSHOT=/tmp/shot.png` |
| `CAM_CPOS` | Initial camera position in cell coords | `CAM_CPOS=79,6` |
| `CAM_ZOOM` | Initial camera zoom level | `CAM_ZOOM=2.0` |
| `NO_TERRAIN` | Skip terrain tile rendering (debug actor sprites) | `NO_TERRAIN=1` |
| `DUMP_TILES` | Dump cliff/extra tiles as PNG to /tmp | `DUMP_TILES=1` |
| `VXL_COPIES` | Stress test: spawn N copies of each VXL model in a grid (bevy_vxl_direct only) | `VXL_COPIES=500` |
| `DEBUG_HUD` | Show turret nudge debug HUD overlay | `DEBUG_HUD=1` |
| `TILE_WIREFRAME` | Draw building tile wireframe gizmos | `TILE_WIREFRAME=1` |

### Log Level Control (RUST_LOG)

Bevy uses `tracing`. Control log verbosity with `RUST_LOG`:

```bash
RUST_LOG=warn cargo run                                    # quiet: warnings only
RUST_LOG=info cargo run                                    # default: info+
RUST_LOG=debug cargo run                                   # verbose: all debug traces
RUST_LOG=openra2_rust::game::orders=debug cargo run        # debug for one module only
RUST_LOG=openra2_rust::game=debug,openra2_rust::map=info cargo run  # per-module control
```

Key debug traces (visible at `debug` level):
- `game::orders` — PICK (height-compensated click resolution), STOP (movement completion), PICK HIT (height level matching)
- `game::terrain_height` — ALIGN (terrain height alignment offsets per unit)
- `debug::systems` — [PICK] raw click-to-CPos mapping

Combine for headless CI testing:
```bash
source .env && AUTO_SCREENSHOT=/tmp/test.png CAM_CPOS=79,6 CAM_ZOOM=2.0 cargo run
```

### CRITICAL: Never Read AUTO_SCREENSHOT PNGs Directly

Bevy's screenshot encoder may produce PNGs that Claude's vision API cannot process (16-bit depth, non-standard chunks, etc.). Reading such a file with the Read tool **poisons the entire conversation context** -- every subsequent message will fail with `API Error: 400 Could not process image`, and the only fix is `/clear` which destroys all context.

**Always convert before reading:**
```bash
convert /tmp/shot.png -depth 8 /tmp/shot_safe.png
```
Then read `shot_safe.png` instead. Alternatively, use `file` or `identify` to verify format first.

### CRITICAL: Always Set WAYLAND_DISPLAY with AUTO_SCREENSHOT

`AUTO_SCREENSHOT` requires a Wayland display server connection to render frames. Over SSH or in headless environments, Bevy cannot create a GPU context without `WAYLAND_DISPLAY` being set.

- **NEVER** skip visual testing because "headless SSH has no display" -- set `WAYLAND_DISPLAY` to make it work
- **ALWAYS** include `WAYLAND_DISPLAY=wayland-0` when running `AUTO_SCREENSHOT`

```bash
# WRONG - will fail in SSH sessions
AUTO_SCREENSHOT=/tmp/shot.png cargo run

# CORRECT - works in SSH by connecting to the host's Wayland compositor
WAYLAND_DISPLAY=wayland-0 AUTO_SCREENSHOT=/tmp/shot.png cargo run
```

## Key Technical Facts

- **MiniYAML is NOT standard YAML** -- custom parser required (tab/4-space indent, `^` inheritance, `@` instance suffix, `-` removal)
- **Isometric tile scale = 1448** (constant 724), tile 60x30 pixels
- **All game logic uses integer math** -- no f32/f64 in simulation (WPos, WAngle, WDist are i32)
- **RA2 uses ShpTS format** (not ShpTD) -- 4 compression modes
- **VXL voxels use 244 normals** (RA2 type, not TS's 36)
- **MIX archives use Blowfish encryption** with RSA key block
- **Bevy 0.15** pinned version, Rust 2024 edition
- **Audio: IMA ADPCM** (89-step table) + Westwood compressed, BAG/IDX archive format

## Development Guidelines

- Target: Ubuntu 24.04 x86_64, Intel Iris Xe, Vulkan
- Use `cargo clippy` and `cargo test` before commits
- Each Phase must produce a runnable verification target
- Port from C# reference -- don't invent new algorithms unless OpenRA's approach is unsuitable for ECS
- Integer math only in game logic; f32/f64 only in rendering
- **NEVER commit local paths** -- use environment variables via `.env`
- **NEVER commit** `.gitmodules`, `claude-playbook/`, `.claude/`, or `CLAUDE.md`

## OpenRA Porting Rules

**CRITICAL: Read the full C# call chain before implementing in Rust.**

Never assume coordinate system conventions. Always trace the complete pipeline from trait definition through rendering. Key lessons learned:

- **LocalToWorld axis swap**: `BodyOrientation.LocalToWorld()` does `(y, -x, z)` for isometric maps. Body-local coordinates `(forward, right, up)` are NOT world-space WPos. This applies to ALL traits that use body-relative offsets (Turreted, WithVoxelTurret, etc.)
- **Key C# files to check for any rendering feature**:
  - Trait file itself (e.g. `Turreted.cs`)
  - `BodyOrientation.cs` -- LocalToWorld, coordinate transforms
  - `WorldRenderer.cs` / `ScreenPosition` -- WPos to screen pixel conversion
  - `MapGrid.cs` -- TileScale (1448 for isometric), CellSize
- **Verify with 2+ test cases** at different map positions to catch stagger/position-dependent bugs
- **Use WebFetch on OpenRA GitHub** (`raw.githubusercontent.com/OpenRA/OpenRA/refs/heads/bleed/...`) to read actual source -- never guess formulas

## Quick Reference

```bash
cargo build                              # Build
source .env && cargo run                 # Run main app (map renderer)
cargo test --lib                         # 467 unit tests
cargo test --test integration       # 27 integration tests (auto-loads .env)
source .env && cargo run --bin <name>    # Run demo binary
```
