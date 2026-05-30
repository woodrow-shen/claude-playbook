# OpenRA2-Rust -- Claude Code Workflow

OpenRA2-Rust: Porting Red Alert 2 from C#/OpenRA to Rust/Bevy with Wgpu/Vulkan rendering.
License: GPL-3.0. Owner: Woodrow Shen.

- OpenRA engine: <https://github.com/OpenRA/OpenRA>
- RA2 mod: <https://github.com/OpenRA/ra2>
- Product spec (what/why): `docs/PRD.md`
- **Feature spec per phase (no progress state)**: `docs/ROADMAP.md`
- **Phase progress + tech-debt ledger**: `docs/PROJECT_STATUS.md`
- Architecture: `docs/ARCHITECTURE.md`
- Reference: `docs/testing/environment-variables.md`, `docs/testing/visual-testing-guide.md`
- Asset inventory: `docs/assets/INVENTORY.md`, `docs/assets/MOD-INVENTORY.md`, `docs/assets/inventory/*.md` (per-frame SHP/VXL/tile details)

## English-Only in Code (enforced)

`scripts/git-hooks/pre-commit` blocks CJK characters in staged `.rs`, `.wgsl`, `.toml`, `.md`, `.claude/**` files. Allow-list (only files allowed Chinese): `docs/PROJECT_STATUS.md` (phase progress + tech-debt ledger) and `docs/PRD.md` (product requirements). All other content — comments, log strings, panics, docs, commit messages — must be English. Mixed-language code leaks project metadata into runtime artifacts; toolchain (clippy, rustfmt, grep) works cleanly on ASCII.

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

- **Top priority: code must always be clean** -- no dead code, no unused imports, no warnings from `cargo clippy`
- Target: Ubuntu 24.04 x86_64, Intel Iris Xe, Vulkan
- Use `cargo clippy` and `cargo test` before commits
- Each Phase must produce a runnable verification target
- Port from C# reference -- don't invent new algorithms unless OpenRA's approach is unsuitable for ECS
- Integer math only in game logic; f32/f64 only in rendering
- **NEVER hardcode local paths** -- use environment variables via `.env`
- **NEVER commit** `.gitmodules`, `claude-playbook/`, `.claude/`, or `CLAUDE.md` (enforced by `.claude/hooks/enforce-no-blacklist-commit.sh`)
- **ALL commits** must end with these two trailers in this exact order:

  ```text
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  Signed-off-by: Woodrow Shen <woodrow.shen@gmail.com>
  ```

## Documentation Rules

- **ROADMAP vs PROJECT_STATUS split is hard.** `docs/ROADMAP.md` is **feature spec only** — one section per phase describing what the system does, scope, sub-phase breakdown, OpenRA references, design rationale. **No progress markers** (no "Done" / "Blocked" / "Last Updated" / Status columns / Verification `[x]` checklists / test counts / commit SHAs). `docs/PROJECT_STATUS.md` owns all of that — phase-progress table (0-current), "Last Updated" + "Current Phase" header, tech-debt ledger.
- When a phase lands, update PROJECT_STATUS's progress table and (if relevant) tech-debt ledger. If the feature scope grew/shrank, update ROADMAP's description. **Never** add a "DONE" marker to ROADMAP.
- When you deprecate a sub-phase, delete it from ROADMAP (or rewrite scope); don't leave `DEFERRED` tombstones in the spec — those are progress state and belong in PROJECT_STATUS.
- Phase screenshots (`docs/assets/phase28d/auto_apoc.png` etc.) are reference visuals; only commit if something references them (markdown / code / a run-all-auto doc). Unreferenced PNGs get stale the moment VFX changes — regenerate on demand from the AUTO smoke instead.

## Time / Tick Rules

See `docs/design/time-and-game-speed.md` for the full rule + examples. Short version:

- Every new `Time::delta()` usage **must** carry a one-line comment classifying it as `// game-logic timer — scales with F5 game speed (TODO Phase 40)` or `// visual timer — wall-clock, must NOT scale with game speed`.
- Classifier: *"If the player picks **Faster** game speed, should this go faster?"* Yes → game-logic. No → visual.
- `GameTime` resource is not landed yet; F5 menu is deferred to Phase 40+. Tracked in `docs/PROJECT_STATUS.md` tech-debt ledger.

## Visual Testing Rules

- **ALWAYS** set `WAYLAND_DISPLAY=wayland-0` with `AUTO_SCREENSHOT`
- **NEVER** read Bevy PNGs directly -- convert first: `convert shot.png -depth 8 shot_safe.png`
- **ALWAYS** set correct `CAM_CPOS` and `CAM_ZOOM` -- read spawn code to confirm positions
- **BEFORE** running any `AUTO_*` smoke test, Read `docs/testing/environment-variables.md` for the env var list and `docs/testing/visual-testing-guide.md` for the camera preset — never guess coordinates from memory
- **AFTER** running AUTO tests, **check each log** for side effects or unusual symptoms (panics, warnings, unexpected state transitions, entity despawn issues) -- these are critical sanity checks beyond just PASS/FAIL exit codes
- **DON'T** use `./target/release/openra2-rust` directly to run tests during development — use `cargo run --release` instead. `cargo run` sets `CARGO_MANIFEST_DIR`, which is how Bevy's AssetPlugin locates the `assets/` folder; running the binary directly produces "Path not found" shader errors and broken rendering. (enforced by `.claude/hooks/enforce-no-direct-binary.sh`)
- **`AUTO_FRAME` is per-scenario, not a universal 1800.** The 1800 default in `/run-all-auto` is only appropriate for long-running scenarios (patrol, multi-attack, full death-cycle-to-respawn). New AUTO tests should pick the **shortest** frame count that still exercises the validation target, then document the recommended `AUTO_FRAME=N` in both the system's rustdoc AND `docs/testing/environment-variables.md`. Examples from Phase 28g-1: `AUTO_DEATH_VARIANTS=300` (spawn frame 5 + kills frames 240-293 + screenshot frame 300 catches all 5 deaths mid-animation); `AUTO_FLAMEGUY=60` (spawn 10 + walk reseed × 2-3 + screenshot 60). Forcing every test to 1800 wastes 3-6× the CI time and — worse — lets actors time-out / despawn before the capture, making the screenshot useless. Design new smokes to read `AUTO_FRAME` dynamically (e.g. kill offsets computed as `auto_frame - N`) so shorter overrides still exercise the right timing.

## Live Debugging Workflow (preferred over screenshot-and-paste)

**Default for any user-triggered single AUTO run or in-game test**: use **live mode** (no `AUTO_FRAME`, no `AUTO_SCREENSHOT`). When the user types "re-run AUTO_X" / "跑一下 AUTO_X" / "看看 AUTO_X" / "test the Kirov attack" mid-conversation, that is **iteration / debug**, not regression validation — even if the test passed before. Default to live mode unless the user explicitly says "for regression" / "screenshot mode" / "CI gating" / mentions `/run-all-auto`.

Two flavours of iteration both run live, both follow the same workflow:

- **Visual iteration** — alignment, animation, particle effects, FX timing, anything the user verifies by eye in the running window.
- **Behavioural debug** — cursor mismatch, missing event, wrong target resolution, order-vs-cursor divergence, anything the user reproduces by clicking / keying and then inspects the log.

**The agent takes over execution and orchestrates the test.** Don't launch and hope the user remembers what to test, and don't make the user inspect PNGs:

1. **Plan exact reproduction steps BEFORE launching.** Numbered checklist of which keys to press, which entity to spawn, which to select, which modifier to hold, where to click. State the expected vs bug-suspected outcome so the user knows what they're watching for.

2. **Wire enough debug logging up-front.** Enable the relevant `DEBUG_*` flags (`DEBUG_HUD`, `DEBUG_COMBAT`, `DEBUG_AIRCRAFT_FSM`, …) so the log captures the lines you need. **If a needed log line doesn't exist, add a one-shot env-gated `info!` BEFORE running** — don't make the user repro twice because instrumentation was missing.

3. **Launch live, in the background.** No `AUTO_FRAME`, no `AUTO_SCREENSHOT`, no `timeout`, `run_in_background: true`. The user controls the run length by closing the window — not a frame counter.

   ```bash
   WAYLAND_DISPLAY=wayland-0 DEBUG_HUD=1 DEBUG_COMBAT=1 \
     [AUTO_<NAME>=1] CAM_CPOS=<X,Y> CAM_ZOOM=<Z> \
     cargo run --release > /tmp/<name>_live.log 2>&1 &
   ```

4. **Hand off cleanly.** State the steps once, then stop. User performs steps, watches the window, closes when done.

5. **Diagnose from the log.** Grep for the specific markers you planned in step 2 — not generic "any error" sweeps. For behavioural divergences, cross-reference multiple log streams (e.g. cursor vs order vs FSM) to find the exact branch where they diverge.

6. **Compare working vs broken paths in the SAME session** when possible. If the user reports "tank works, aircraft doesn't" — ask them to perform BOTH operations in one run so the log shows the divergence point side-by-side. Don't ask for repro-after-repro across sessions.

**Why this beats screenshot-and-paste**: user verifies in real time, agent collects exactly the log lines the fix turns on, instead of guessing which capture frame would be informative. Origin: Phase 28m-4a-polish cursor-vs-order hit-test divergence — three round-trips wasted because debug logs weren't wired before the user clicked.

**When to STILL use the screenshot path**: regression validation in `/run-all-auto`, CI gating, frozen-frame asset comparison, when the user is not at the keyboard. Live mode is for the *iteration / debug* phase; screenshot mode is for the *validation* phase.

## Running AUTO Tests (enforced)

`PreToolUse` Bash hook (`.claude/hooks/enforce-auto-test-hygiene.sh`) **blocks** two catastrophic anti-patterns:

- `timeout N` shorter than `ceil(AUTO_FRAME / 30) + 30 s` (cargo run has ~30 s startup + frames-at-30fps runtime; SIGTERM mid-run leaves a half-written log that looks like a hang). For `AUTO_FRAME=1800` minimum is 90 s; recommended 150 s.
- `AUTO_FRAME=N` without `AUTO_SCREENSHOT=...`. The auto_screenshot_system owns the AppExit emit — without it, the test runs forever even though the frame counter advances.

`PostToolUse` Bash hook (`.claude/hooks/auto-test-diagnostic-inject.sh`) auto-injects the 3-step diagnostic checklist (`grep 'Screenshot saved'` → `grep -c 'frame=|Auto-|auto-'` → `pgrep -f target/release/openra2-rust`) whenever `cargo run --release` exits non-zero, so triage starts from "did it complete?" rather than "is it hung?".

Interpretation guidance (not mechanically enforceable): `pkill -f openra2` exit 1/144 is normal — don't `&&`-chain after it. `ps -p $bash_pid` showing `do_wait` / 0 % CPU is normal (parent blocking on child) — find the real state via `pgrep -f 'target/release/openra2-rust'`. ~1 s of silence between `Fog overlay spawned` and first AUTO log is normal (frame-gated logging).

## Background-Task Hygiene (enforced)

`PreToolUse` Bash hook (`.claude/hooks/enforce-no-polling-loops.sh`) **blocks** any background-mode (`run_in_background: true`) Bash command containing `while|until ... sleep` polling pattern. Use synchronous `timeout` instead: `timeout 90 bash -c 'cargo run --release > log 2>&1'`. Reason: polling loops leave a lingering shell in harness state that survives across sessions. One-shot `pgrep` is fine — only the looping form is forbidden.

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

## Canonical Source Reflex (enforced)

`PreToolUse` hook (`.claude/hooks/pre-impl-canonical-check.sh`) injects a checklist before every Rust source Edit. **No magic numbers, no invented RA2 behaviors** — cite source in the diff comment or mark `// MVP, NOT canonical` with a polish TODO. Authority order:

1. **Asset existence** → `docs/assets/inventory/*.md` (SHP frames, tiles, audio cues, cameos)
2. **Data values** → `$RA2_ASSETS_DIR/mods/cncreloaded/app/Tools/Map Editor/rulesmd.ini`
3. **Art values** → `artmd.ini` (same dir — sequences, turret offsets, FLH, death anims)
4. **OpenRA cross-reference** → `github.com/OpenRA/ra2` (modernized port; stock INI wins on conflict)

Full checklist (5 layers, filter rules, exceptions) at `.claude/pre-impl-checklist.md`. Hook silent for `docs/**`, `.claude/**`, `*.toml`, `*.md`, `tests.rs`. Origin: the 28l-9d-final cycle landed `Sonic vs AnimalUnderwater = 1000%` + `10× drowning amplifier` invented multipliers and ripped them out hours later when INI was finally fetched — this hook makes "fetch INI first" a reflex at the action moment.
