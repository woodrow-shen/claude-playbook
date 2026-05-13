#!/usr/bin/env bash
# PostToolUse: when an AUTO smoke `cargo run --release` doesn't reach
# its self-exit point, inject the 3-step "Don't Misdiagnose as Hangs"
# diagnostic checklist so the model doesn't have to backtrack to
# CLAUDE.md when triaging.
#
# Claude Code's PostToolUse `tool_response` does NOT expose exit_code
# (verified empirically — only stdout / stderr / interrupted are in
# the payload). The hook uses two proxy signals instead:
#
#   - `Screenshot saved` MISSING from stdout when AUTO_SCREENSHOT was
#     requested == smoke didn't reach the auto_screenshot_system
#     AppExit emit → lifecycle incomplete, inject diagnostic.
#   - `interrupted: true` (SIGTERM, timeout, ^C) always inject —
#     that's the prototypical "hang or kill" case regardless of mode.
#
# Wired in `.claude/settings.json` under `hooks.PostToolUse` matcher "Bash".

set -u

PAYLOAD=$(cat)

# Claude Code's PostToolUse `tool_response` does NOT expose `exit_code`
# (only stdout / stderr / interrupted / isImage / noOutputExpected).
# Use proxy signals instead:
#
#   - AUTO_SCREENSHOT mode: completion is signalled by `Screenshot saved`
#     line in stdout (auto_screenshot_system emits it as AppExit fires).
#     Missing line == lifecycle didn't complete → inject diagnostic.
#   - Live mode (no AUTO_SCREENSHOT): user closes window manually; we
#     can't tell "completed normally" from "crashed" so skip.
#   - `interrupted: true` (SIGTERM, timeout, ^C) overrides — always
#     inject because that's the prototypical "hang or kill" scenario.
#
# Net effect: hook fires when an AUTO smoke test was kicked off and
# didn't reach its self-exit point. Matches the original CLAUDE.md
# intent ("don't misdiagnose as hangs") without needing exit_code.

if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // ""')
  STDOUT=$(printf '%s' "$PAYLOAD" | jq -r '.tool_response.stdout // ""')
  INTERRUPTED=$(printf '%s' "$PAYLOAD" | jq -r '.tool_response.interrupted // false')
else
  CMD=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
  STDOUT=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; r=json.load(sys.stdin).get("tool_response",{}); print(r.get("stdout",""))')
  INTERRUPTED=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; r=json.load(sys.stdin).get("tool_response",{}); print(str(r.get("interrupted",False)).lower())')
fi

# Only fire for cargo run --release (the smoke / app run command).
if ! printf '%s' "$CMD" | grep -qE '\bcargo run --release\b'; then
  exit 0
fi

# Gate: did the user opt into AUTO smoke mode? If not (live mode, dev
# exploration), we can't reliably distinguish success from failure.
if ! printf '%s' "$CMD" | grep -qE '\bAUTO_SCREENSHOT='; then
  # Allow interrupted-flag override — SIGTERM mid-run is always
  # diagnostic-worthy regardless of mode.
  if [ "$INTERRUPTED" != "true" ]; then
    exit 0
  fi
fi

# Did the smoke reach its lifecycle exit point?
if printf '%s' "$STDOUT" | grep -q 'Screenshot saved'; then
  exit 0
fi

CONTEXT="AUTO TEST DIAGNOSTIC — \`cargo run --release\` returned without 'Screenshot saved' marker (interrupted=${INTERRUPTED}).
Before declaring 'app hung', run the 3-step diagnostic order from CLAUDE.md:

  1. grep 'Screenshot saved' /tmp/auto_<name>.log
       If present → app completed; screenshot exists; problem is
       elsewhere (assertion / runtime symptom, not lifecycle).

  2. grep -cE 'frame=|Auto-|auto-' /tmp/auto_<name>.log
       Non-zero → Update loop did fire. Frame-gated AUTO systems
       only log on specific frames; silence between 'Fog overlay
       spawned' and first AUTO log is normal up to ~1 s.

  3. pgrep -f 'target/release/openra2-rust'
       Alive → check 'ps -o stat,%cpu,wchan'. Bevy main thread should
       be R/S with non-trivial %cpu (not 'do_wait' which is normal
       for the *bash parent*).

If all three say 'nothing', THEN consider the app stuck.

Common false-hang triggers (don't panic):
  - timeout < 90 s on AUTO_FRAME=1800 → SIGTERM mid-run (the
    enforce-auto-test-hygiene.sh hook BLOCKs this pre-call, so this
    PostToolUse triggering means actual failure not config error)
  - pkill -f openra2 chained with && (its exit is unreliable, see
    CLAUDE.md)
  - bash parent in 'do_wait' state with 0% CPU (NORMAL — parent
    blocking on child, find the child via pgrep)

Per CLAUDE.md \"Running AUTO Tests\" + this hook's rationale comment."

if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CONTEXT" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
else
  python3 -c "import json,sys; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PostToolUse', 'additionalContext': sys.argv[1]}}))" "$CONTEXT"
fi

exit 0
