# FPS Benchmark

Run the AUTO_PATROL smoke with FPS_BENCH instrumentation and report window-average, cumulative-average, min, and max FPS. Designed for A/B comparison across commits to catch render-path regressions.

## Usage

```
/fps-bench                       # single-run bench of current HEAD
/fps-bench <label>               # single-run, labels logs and screenshot with <label>
/fps-bench <commit-a> <commit-b> # two-run A/B: bench both commits, print diff
```

`<label>` is a short identifier used for log file names. `<commit-a>` / `<commit-b>` are any ref accepted by `git checkout` (SHA, branch, tag).

## Input Validation

Before running any checkout or shell expansion:

1. Reject `<label>` containing anything other than `[A-Za-z0-9_.-]`. Shell-escape if in doubt.
2. Resolve refs with `git rev-parse --verify <ref>^{commit}` first. If it fails, abort.
3. Refuse to run if `git status --porcelain` shows modifications — checking out across commits with a dirty tree silently loses work. Ask the user to stash or commit first.
4. Refuse if a stale `openra2-rust` release binary is holding `target/release/` — check with `ps -ef | grep -v grep | grep openra2-rust`. Ask the user to close it instead of killing.

## Step 1: Setup (once per session)

```bash
source .env
```

## Step 2: Execute the Bench

### Single-run mode (`/fps-bench` or `/fps-bench <label>`)

1. Resolve the label. Default is the abbreviated commit id: `LABEL=$(git rev-parse --short HEAD)`. <!-- safe: read-only git query, no user input flows into the command --> <!-- # SAFETY: ditto -->
2. Build release binary:

   ```bash
   cargo build --release
   ```

3. Run the bench:

   ```bash
   WAYLAND_DISPLAY=wayland-0 FPS_BENCH=1 AUTO_PATROL=1 \
     AUTO_FRAME=1800 AUTO_SCREENSHOT="/tmp/fps_${LABEL}.png" \
     CAM_CPOS=55,15 CAM_ZOOM=1.0 cargo run --release \
     > "/tmp/fps_${LABEL}.log" 2>&1
   ```

4. Extract the `[FPS_BENCH]` lines from the log:

   ```bash
   grep '^\[FPS_BENCH\]' "/tmp/fps_${LABEL}.log"
   ```

5. Report the final window (frame=1800) values: `window_avg`, `cum_avg`, `min`, `max`. Flag the log path and screenshot path for review.

### A/B mode (`/fps-bench <commit-a> <commit-b>`)

1. Validate refs per the input-validation block above.
2. Save the current branch: `ORIG_REF=$(git rev-parse --abbrev-ref HEAD)`. If detached, use the commit id. <!-- safe: read-only git query, no user input flows into the command -->
3. For each commit in order A, B:
   - `git checkout <commit>` (strictly read-only — no amend, no rebase)
   - Run the single-run steps 2-4 above with `LABEL=$(git rev-parse --short HEAD)`. <!-- safe: read-only git query, no user input flows into the command -->
   - Persist the last `[FPS_BENCH]` line into a summary table.
4. Restore: `git checkout ${ORIG_REF}`.
5. Print the summary with per-metric deltas:

   ```
   commit    window_avg  cum_avg  min   max
   <a-sha>   X           Y        Z     W
   <b-sha>   X'          Y'       Z'    W'
   delta     dX (dX%)    dY (dY%) dZ    dW (dW%)
   ```

6. Flag any delta beyond these thresholds as a regression needing investigation:
   - `cum_avg`: -5% or worse
   - `max`: -20% or worse (batching-loss signature — see memory `feedback_per_entity_material_scales_poorly.md`)

## What FPS_BENCH reports

Every 300 frames (10 s at 30 fps target) the app emits one line to stderr:

```
[FPS_BENCH] frame=N window_avg=.. cum_avg=.. min=.. max=..
```

- `window_avg`: FPS across the last 300 frames only (local regression signal)
- `cum_avg`: FPS averaged since frame 1 (stable headline number)
- `min` / `max`: minimum / maximum instantaneous FPS since launch

AUTO_FRAME=1800 produces 6 windows (frames 300, 600, 900, 1200, 1500, 1800).

## Why AUTO_PATROL is the bench scene

- Deterministic: one tank on a fixed patrol path, no RNG-driven combat.
- Representative load: hits the VXL render path, the projectile/VFX path, and the ACTOR_LAYER sprite path at the same time.
- Matched to the rest of the AUTO suite so results line up with smoke tests.

Do not swap in a heavier scene without explicit user sign-off — the baseline numbers only mean something against the same scene.

## Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `FPS_BENCH=1` | yes | Enables the bench resource + logging system |
| `AUTO_PATROL=1` | yes | Spawns the deterministic patrol scene |
| `AUTO_FRAME=1800` | yes | Exit after 1800 frames (60 s at 30 fps target) |
| `AUTO_SCREENSHOT=...` | yes | Registers the exit path; without it AUTO_FRAME never fires |
| `WAYLAND_DISPLAY=wayland-0` | yes | GPU context in SSH/headless environments |
| `CAM_CPOS=55,15` | yes | Camera preset matching the AUTO_PATROL smoke |
| `CAM_ZOOM=1.0` | yes | Zoom preset matching the AUTO_PATROL smoke |

## Known baseline noise (ignore)

- `vxl_material.wgsl` asset not found -- harmless, pre-loaded elsewhere
- `sctk_adwaita::buttons` Wayland decoration warning
- `wgpu_hal::vulkan::instance` Vulkan debug messages

## Step 3: Error Handling

If any of these conditions hit, stop the bench, surface the failure to the user, and `exit 1`:

- `cargo build --release` returns non-zero: dump the last 40 lines of build output, do not run the bench.
- `cargo run --release` exits without writing the `Screenshot saved` marker to its log: the run is non-deterministic, discard the result.
- Final `[FPS_BENCH] frame=1800` line missing from the log: the bench did not reach the target frame, the numbers are unusable.
- In A/B mode, if any step from commit A's run fails, restore the original ref with `git checkout "${ORIG_REF}"` BEFORE bailing out; never leave the tree on a stranger ref.

## Step 4: Cleanup

- Logs at `/tmp/fps_*.log` and screenshots at `/tmp/fps_*.png` are user artifacts -- leave them. They are the audit trail for the bench run.
- Always restore `HEAD` to `${ORIG_REF}` after A/B mode, even on the happy path.
- Confirm `git status --porcelain` is still clean before declaring done; the bench must not silently leave dirty state behind.

## Security

- Refuse any `<label>` outside `[A-Za-z0-9_.-]`. Anything else is shell-active and can rewrite log paths.
- Validate refs with `git rev-parse --verify <ref>^{commit}` before `git checkout`. Never pass a raw user-supplied ref to `git checkout` without verification.
- Read-only git operations only. The bench never amends, never rebases, never force-pushes. If a run fails, restore HEAD; do not "fix" by editing history.

## Security Checklist

- [ ] Label sanitized against `[A-Za-z0-9_.-]`.
- [ ] Refs resolved with `git rev-parse --verify` before any checkout.
- [ ] Working tree clean before bench start.
- [ ] No stale openra2-rust process holding `target/release/`.
- [ ] A/B mode restores original ref before exiting.
- [ ] Bench artifacts written under `/tmp/fps_*` only; no writes outside the workspace.

## Important

- Never bypass `AUTO_FRAME=1800`. Shorter windows drop the warm-up fairness between A and B runs.
- Never run two benches in parallel. GPU contention invalidates the numbers.
- Always run via `cargo run --release` (not the raw binary) so `CARGO_MANIFEST_DIR` resolves assets correctly.
- After A/B mode, confirm `git rev-parse --abbrev-ref HEAD` matches the original ref before declaring done.
