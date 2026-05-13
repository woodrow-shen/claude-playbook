#!/usr/bin/env bash
# Enforce: no background polling loops in Bash tool.
#
# CLAUDE.md "Background-Task Hygiene" forbids this pattern:
#
#   while pgrep -f 'target/release/openra2-rust' > /dev/null; do
#     sleep 3
#   done
#
# Why it's banned: when invoked via Bash tool with run_in_background=true,
# the polling shell itself becomes a lingering background process that the
# Claude Code harness tracks indefinitely — even after the watched child
# exits. The "shells running" counter never decrements without manual
# pkill on the polling-shell PID. Survives across sessions / iterations.
#
# Correct alternative (always):
#
#   timeout 90 bash -c 'cmd > log 2>&1'
#
# Hook scope: ONLY blocks background-mode polling (run_in_background=true).
# Foreground synchronous polling is bad practice but doesn't pollute
# harness state; left for human review.
#
# Wired in `.claude/settings.json` under `hooks.PreToolUse` matcher "Bash".

set -u

PAYLOAD=$(cat)

# Defensive jq-or-grep parse so the hook still works on hosts without jq.
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // ""')
  BG=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.run_in_background // false')
else
  # Brittle fallback — extract command and run_in_background scalar.
  CMD=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("command",""))')
  BG=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(str(d.get("tool_input",{}).get("run_in_background",False)).lower())')
fi

# Only enforce in background mode. Foreground while-sleep is hand-wavy
# bad practice but doesn't pollute the harness shell counter.
if [ "$BG" != "true" ]; then
  exit 0
fi

# Polling-loop detection. Match `while`/`until` keyword paired with
# `sleep` in the same command. Covers:
#   while pgrep ... ; do sleep N; done
#   while ps -p $PID ... ; do sleep N; done
#   while kill -0 $PID ... ; do sleep N; done
#   while [ -e /tmp/marker ] ; do sleep N; done
#   until ! pgrep ... ; do sleep N; done
#   etc.
if printf '%s' "$CMD" | grep -qE '\b(while|until)\b.*\bsleep\b'; then
  # Structured JSON block (primary channel). Mirrors the
  # `hookSpecificOutput.additionalContext` schema the canonical
  # source reflex hook uses — both hooks ship JSON to stdout, so
  # Claude Code's hook parser sees one consistent format. We learned
  # the hard way on the canonical hook that plain-text stdout is
  # silently dropped; structured JSON is the only documented path.
  REASON='Background polling-loop pattern detected: `while|until ... sleep ... done` with run_in_background=true. This leaves a lingering shell in Claude Code harness state — counter does not decrement after the watched child exits, survives across sessions. Use synchronous `timeout` instead: `timeout 90 bash -c '"'"'cmd > /tmp/log 2>&1'"'"'`. See CLAUDE.md "Background-Task Hygiene" + `.claude/hooks/enforce-no-polling-loops.sh` rationale comment.'

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg reason "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  else
    python3 -c "import json,sys; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': sys.argv[1]}}))" "$REASON"
  fi

  # Stderr + exit 2 as belt-and-suspenders fallback. If Claude Code's
  # JSON parser ever changes schema or fails, exit code 2 still blocks
  # the tool call via the documented exit-code path. Stderr text
  # reaches the model as fallback feedback.
  cat >&2 <<EOF
BLOCKED: $REASON
EOF
  exit 2
fi

exit 0
