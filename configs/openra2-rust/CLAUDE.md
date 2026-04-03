# OpenRA2-Rust -- Claude Code Configuration

## Project Overview

OpenRA2-Rust: Porting Red Alert 2 from C#/OpenRA to Rust/Bevy with Wgpu/Vulkan rendering.
License: GPL-3.0. Owner: Woodrow Shen.

**Current status:** All 14 phases complete. 435 unit tests, 9 integration tests.
See `docs/PROJECT_STATUS.md` for full phase tracker.

## Reference Repos

- OpenRA engine: https://github.com/OpenRA/OpenRA
- RA2 mod: https://github.com/OpenRA/ra2

## Environment Variables

All binaries use environment variables for asset paths. Define in `.env` (gitignored):

```bash
export RA2_ASSETS_DIR="/path/to/RA2/assets"
export RA2_MIXDB_PATH="/path/to/OpenRA/global mix database.dat"
export RA2_MOD_DIR="/path/to/ra2/mods/ra2"
```

**NEVER hardcode local paths in committed files.** Use `std::env::var()` at runtime.

## Key Technical Facts

- **MiniYAML is NOT standard YAML** -- custom parser required (tab/4-space indent, `^` inheritance, `@` instance suffix, `-` removal)
- **Isometric tile scale = 1448** (constant 724), tile 60x30 pixels
- **All game logic uses integer math** -- no f32/f64 in simulation (WPos, WAngle, WDist are i32)
- **RA2 uses ShpTS format** (not ShpTD) -- 4 compression modes
- **VXL voxels use 244 normals** (RA2 type, not TS's 36)
- **MIX archives use Blowfish encryption** with RSA key block
- **Bevy 0.15** pinned version, Rust 2024 edition
- **Audio: IMA ADPCM** (89-step table) + Westwood compressed, BAG/IDX archive format

## Quick Start

```bash
# Build
cargo build

# Run main app (Phase 4 map renderer -- requires env vars)
source .env && cargo run

# Run all tests
cargo test --lib                  # 435 unit tests
cargo test --test demo_binaries   # 9 integration tests (auto-loads .env)

# Lint
cargo clippy
```

## Demo Binaries

| Binary | Phase | Type | Assets Required |
|--------|-------|------|-----------------|
| openra2-rust | 4 | GUI | Yes (map, tiles, palette) |
| yaml_dump | 1 | CLI | Yes (mod.yaml) |
| mix_tool | 2 | CLI | Yes (MIX file) |
| sprite_dump | 3 | CLI | Yes (MIX + palette) |
| shp_diag | 3 | CLI | Yes (ra2.mix) |
| sequence_viewer | 5 | GUI | Yes (ra2.mix + mod) |
| voxel_viewer | 6 | GUI | Yes (ra2.mix) |
| movement_demo | 8 | GUI | No (self-contained) |
| combat_demo | 9 | GUI | No (self-contained) |
| production_demo | 10 | GUI | No (self-contained) |
| audio_demo | 12 | CLI | Yes (audio.idx/bag) |
| fog_demo | 13 | GUI | No (self-contained) |
| net_demo | 14 | CLI | No (self-contained) |

Run with: `source .env && cargo run --bin <name>`

## Project Structure

```
openra2-rust/
  Cargo.toml              # Single crate, Bevy 0.15 + base64 + image
  .env                    # Local asset paths (gitignored)
  docs/
    PRD.md                # Product requirements (14-phase roadmap)
    ARCHITECTURE.md       # Technical architecture (OpenRA->Bevy mapping)
    PROJECT_STATUS.md     # Phase progress tracker (authoritative)
    testing/              # 12 demo binary documentation files
  tests/
    demo_binaries.rs      # 3-tier self-verified integration tests
  src/
    main.rs               # Bevy App entry -- Phase 4 map renderer
    lib.rs                # 19 pub modules
    audio/                # AUD codec, BAG/IDX archive, sound engine, music, voices
    buildings/            # Building footprint, placement, construction state
    combat/               # Weapon, warhead, projectile, armor, attack system
    crypto/               # Blowfish cipher, RSA key provider (bignum)
    ecs/                  # Actor definitions, components, registry, spawner
    fog/                  # Shroud, radar, visibility source system
    formats/              # PAL, ShpTS, TmpTS, VXL, HVA parsers
    locomotor/            # Terrain cost, locomotor types (Foot/Wheeled/Tracked/Fly/Float)
    map/                  # CPos/MPos/WPos coordinates, map.yaml+map.bin loader
    movement/             # Activity state machine, movement interpolation
    net/                  # Lockstep: order, frame, protocol, server, session, sync
    pathfinding/          # A* search, cell graph, cost heuristics
    production/           # Tech tree, prerequisites, production queue, resources
    ra2/                  # RA2 traits (see below)
    render/               # Isometric camera with WASD pan + scroll zoom
    sequences/            # SequenceDef, YAML loader, sprite cache, animation
    vfs/                  # MIX archive reader, XCC database, CRC32 hash
    voxels/               # VXL normals, software rasterizer
    yaml/                 # MiniYAML parser, merge/inheritance, loader
    bin/                  # 12 demo/tool binaries
```

## RA2-Specific Traits (src/ra2/)

| Module | Trait |
|--------|-------|
| mind_control | Yuri mind control with capacity/eviction |
| carrier_spawner | Aircraft carrier child launch/recall/rearm |
| mirage | Mirage tank disguise with reveal triggers |
| chrono_delivery | Chrono Legionnaire teleport with delay |
| weather_control | Lightning storm super weapon |
| periodic_explosion | Recurring damage (e.g., demo truck) |
| spawn_survivors | Infantry survivors on vehicle destruction |
| tinted_cells | Radiation/tiberium ground damage layer |

## Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| bevy | 0.15 | ECS engine, rendering, windowing, input (features: wayland) |
| base64 | 0.22 | Base64 decoding for RSA key block |
| image | 0.25 | PNG output for verification tools |
| tempfile | 3 | Dev dependency for tests |

## Phase Roadmap (14 phases -- all complete)

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project skeleton + Bevy | Done |
| 1 | MiniYAML parser | Done |
| 2 | VFS + MIX reader | Done |
| 3 | Palette + sprite parsing | Done |
| 4 | Map + isometric terrain render | Done |
| 5 | Sequence + animation system | Done |
| 6 | VXL voxel models | Done |
| 7 | ECS Actor system | Done |
| 8 | Movement + pathfinding | Done |
| 9 | Combat system | Done |
| 10 | Buildings + production | Done |
| 11 | RA2-specific traits | Done |
| 12 | Audio system | Done |
| 13 | Fog of war + radar | Done |
| 14 | Multiplayer lockstep networking | Done |

See `docs/PRD.md` for full requirements and `docs/ARCHITECTURE.md` for OpenRA->Bevy mapping decisions.

## Testing

```bash
cargo test --lib                  # Unit tests (435)
cargo test --test demo_binaries   # Integration tests (9, auto-loads .env)
cargo test                        # Everything
```

Integration tests are 3-tier:
- **Tier 1** -- No assets: net_demo output validation, mix_tool error handling
- **Tier 2** -- With assets: mix_tool, audio_demo, shp_diag, yaml_dump (skips gracefully if .env missing)
- **Tier 3** -- Compile-check: all 8 GUI binaries build successfully

## Development Guidelines

- Target: Ubuntu 24.04 x86_64, Intel Iris Xe, Vulkan
- Use `cargo clippy` and `cargo test` before commits
- Each Phase must produce a runnable verification target
- Port from C# reference -- don't invent new algorithms unless OpenRA's approach is unsuitable for ECS
- Integer math only in game logic; f32/f64 only in rendering
- **NEVER commit local paths** -- use environment variables via `.env`
- **NEVER commit** `.gitmodules`, `claude-playbook/`, `.claude/`, or `CLAUDE.md`

## Stats

- 22,175 lines Rust, 100 source files, 19 modules
- 13 binary targets (1 main + 12 demos/tools)
- 435 unit tests + 9 integration tests
- 587 RA2 actors parseable from mod rules

## Language

- Code: English (comments, variable names, docs)
- Conversation: traditional Chinese preferred
