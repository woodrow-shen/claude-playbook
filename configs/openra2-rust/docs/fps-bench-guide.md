# /fps-bench Command Guide

Run the AUTO_PATROL smoke with `FPS_BENCH=1` instrumentation and report window-average, cumulative-average, min, and max FPS. Designed for A/B comparison across commits to catch render-path regressions in the openra2-rust Bevy/Wgpu pipeline.

## Usage

```
/fps-bench                       # single-run bench of current HEAD
/fps-bench <label>               # single-run, labels logs and screenshot with <label>
/fps-bench <commit-a> <commit-b> # two-run A/B: bench both commits, print diff
```

`<label>` is a short identifier used for log/screenshot file names. `<commit-a>` and `<commit-b>` are any ref accepted by `git checkout` (SHA, branch, tag).

## What It Does

1. Sources `.env` so `RA2_ASSETS_DIR` resolves correctly under cargo
2. Builds `cargo --release` so the bench measures the optimized binary, not debug
3. Runs `AUTO_PATROL=1 AUTO_FRAME=1800 AUTO_SCREENSHOT=...` -- 60 s of deterministic patrol scene at the 30 fps target
4. Captures every `[FPS_BENCH]` line emitted every 300 frames into `/tmp/fps_<label>.log`
5. Reports the final window (`frame=1800`) numbers and the screenshot path
6. In A/B mode: runs single-run flow against each commit, restores original HEAD, and prints a delta table with regression thresholds

## Key Features

- Uses AUTO_PATROL as a fixed-load reference scene -- single tank, no RNG, hits all three render paths (VXL / projectile / sprite)
- A/B mode never amends or rebases; works strictly via `git checkout` and restores the original ref before exiting
- Single-line metric format `window_avg / cum_avg / min / max` makes regressions easy to diff
- 1800-frame window matches `/run-all-auto` so the same numbers comparable across regression batches

## When to Use

- After landing render-path changes (VXL pipeline, shaders, batching, particle systems)
- Before merging a PR that touches the hot path, to confirm no -5%+ `cum_avg` regression
- When investigating reports of FPS drops -- run A/B between "last known good" and HEAD to bisect

## Pass/Fail Thresholds (A/B mode)

- `cum_avg` regression of -5% or worse -- investigate before merging
- `max` regression of -20% or worse -- batching-loss signature, requires deeper analysis

## Important Notes

- AUTO_FRAME=1800 is non-negotiable; shorter runs lose warm-up fairness
- Never run two benches in parallel -- GPU contention invalidates numbers
- Must run via `cargo run --release`, not the raw binary (`CARGO_MANIFEST_DIR` resolves asset paths)
- A/B mode requires a clean working tree and refuses to start if `git status --porcelain` reports modifications

## Related

- `/run-all-auto` -- full regression suite at the same `AUTO_FRAME` baseline
- `configs/openra2-rust/.claude/commands/fps-bench.md` -- canonical command file
