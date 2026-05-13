#!/usr/bin/env bash
# Enforce: AUTO smoke test hygiene at action site.
#
# CLAUDE.md "Running AUTO Tests — Don't Misdiagnose as Hangs" lists 6
# anti-patterns. This hook mechanically blocks the 2 catastrophic ones
# (the others are interpretation-guidance, not action-prevention):
#
#   Check 1: `timeout N` too short for the `AUTO_FRAME` count.
#            cargo run --release needs ~30 s of startup before the Update
#            loop fires + (AUTO_FRAME / ~30 fps) seconds for the smoke.
#            Minimum:  N >= ceil(AUTO_FRAME / 30) + 30.
#            Examples:
#              AUTO_FRAME=1800 → min N = 90  (CLAUDE.md says 150 recommended)
#              AUTO_FRAME=900  → min N = 60
#              AUTO_FRAME=300  → min N = 40
#            Too-short timeouts SIGTERM the binary mid-run and leave a
#            half-written log that looks like a hang.
#
#   Check 2: `AUTO_FRAME=N` without `AUTO_SCREENSHOT=...`.
#            The auto_screenshot_system owns the AppExit emit — it's the
#            ONLY way an AUTO smoke terminates cleanly. Setting
#            `AUTO_FRAME` alone without `AUTO_SCREENSHOT` means the test
#            runs forever (the frame counter increments but the exit
#            mechanism never fires).
#
# Both are BLOCKs. Live mode (`cargo run` with neither `AUTO_SCREENSHOT`
# nor `AUTO_FRAME`) is intentionally allowed — the user closes the
# window manually.
#
# Wired in `.claude/settings.json` under `hooks.PreToolUse` matcher "Bash".

set -u

PAYLOAD=$(cat)

if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // ""')
else
  CMD=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
fi

# Fast-skip if not an AUTO test or cargo run command.
if ! printf '%s' "$CMD" | grep -qE '\bcargo run --release\b|\bAUTO_[A-Z_]+='; then
  exit 0
fi

# Extract scalars. Both can be empty (live mode legitimately omits both).
AUTO_FRAME=$(printf '%s' "$CMD" | grep -oE '\bAUTO_FRAME=[0-9]+' | head -1 | cut -d= -f2)
TIMEOUT_N=$(printf '%s' "$CMD" | grep -oE '\btimeout[[:space:]]+[0-9]+' | head -1 | grep -oE '[0-9]+')
HAS_SCREENSHOT=$(printf '%s' "$CMD" | grep -cE '\bAUTO_SCREENSHOT=' || true)

BLOCKS=()

# Check 1: timeout vs AUTO_FRAME
if [ -n "$AUTO_FRAME" ] && [ -n "$TIMEOUT_N" ]; then
  MIN_TIMEOUT=$(( (AUTO_FRAME + 29) / 30 + 30 ))   # ceil(frame/30) + 30 s startup buffer
  if [ "$TIMEOUT_N" -lt "$MIN_TIMEOUT" ]; then
    BLOCKS+=("\`timeout ${TIMEOUT_N}\` too short for AUTO_FRAME=${AUTO_FRAME}: cargo run --release needs ~30 s startup + (AUTO_FRAME / 30 fps) for the smoke. Minimum: timeout >= ${MIN_TIMEOUT}. CLAUDE.md recommends 150 for AUTO_FRAME=1800.")
  fi
fi

# Check 2: AUTO_FRAME without AUTO_SCREENSHOT (test never terminates)
if [ -n "$AUTO_FRAME" ] && [ "$HAS_SCREENSHOT" -eq 0 ]; then
  BLOCKS+=("\`AUTO_FRAME=${AUTO_FRAME}\` set without \`AUTO_SCREENSHOT=...\`: the auto_screenshot_system is the ONLY exit mechanism for AUTO smokes — frame counter advances but AppExit never fires, test runs forever. Either add \`AUTO_SCREENSHOT=/tmp/auto_<name>.png\` (smoke mode) or remove AUTO_FRAME (live mode, user closes window).")
fi

if [ ${#BLOCKS[@]} -eq 0 ]; then
  exit 0
fi

REASON="AUTO test hygiene violation(s):"
for b in "${BLOCKS[@]}"; do
  REASON+=$'\n  - '"$b"
done
REASON+=$'\n\nSee CLAUDE.md "Running AUTO Tests" + `.claude/hooks/enforce-auto-test-hygiene.sh` rationale comment.'

if command -v jq >/dev/null 2>&1; then
  jq -n --arg reason "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
else
  python3 -c "import json,sys; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': sys.argv[1]}}))" "$REASON"
fi

cat >&2 <<EOF
BLOCKED: $REASON
EOF
exit 2
