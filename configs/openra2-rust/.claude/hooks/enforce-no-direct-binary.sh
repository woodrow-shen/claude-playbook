#!/usr/bin/env bash
# Enforce: never execute `./target/release/openra2-rust` directly.
#
# CLAUDE.md "Visual Testing Rules" forbids running the release binary
# directly during development. Use `cargo run --release` instead — only
# `cargo run` sets `CARGO_MANIFEST_DIR`, which Bevy's AssetPlugin needs
# to locate the `assets/` folder. Direct execution silently fails with
# "Path not found" shader errors and broken rendering.
#
# Pattern catches:
#   ./target/release/openra2-rust ...
#   timeout 90 ./target/release/openra2-rust ...
#   bash -c './target/release/openra2-rust ...'
#
# Pattern intentionally lets through:
#   pgrep -f 'target/release/openra2-rust'      (no `./` prefix — process scan)
#   pkill -f 'target/release/openra2-rust'      (no `./` prefix — process kill)
#   ls target/release/openra2-rust              (file inspect, no `./`)
#   cargo run --release                         (correct invocation)
#
# The discriminator is the leading `./` — `./target/...` is shell-syntax
# for "execute this path as a command", while bare `target/...` inside a
# string arg (pgrep/pkill/grep) is a substring filter, not an execution.
#
# Wired in `.claude/settings.json` under `hooks.PreToolUse` matcher "Bash".

set -u

PAYLOAD=$(cat)

if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // ""')
else
  CMD=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
fi

# Detect direct binary execution at a real command position — start
# of string, after a shell separator (`;`, `&&`, `||`, `|`, newline),
# or after typical command wrappers (`timeout N`, `bash -c '`). This
# excludes substring matches inside echo / printf / git commit message
# / heredoc text where the pattern is being documented rather than
# executed.
#
# Patterns this BLOCKs:
#   ./target/release/openra2-rust args
#   ; ./target/release/openra2-rust args
#   && ./target/release/openra2-rust args
#   timeout 90 ./target/release/openra2-rust args
#   bash -c './target/release/openra2-rust args'
#   timeout 90 bash -c './target/release/openra2-rust args'
#
# Patterns this ALLOWs (intentional):
#   echo "see ./target/release/openra2-rust"      (echo content)
#   git commit -m "ban ./target/release/openra2-rust"  (commit msg)
#   grep './target/release/openra2-rust' log      (grep arg)
#   cat <<EOF ... ./target/release/openra2-rust ... EOF (heredoc)
if ! printf '%s' "$CMD" | grep -qE "(^|[;&|]+|\\n)[[:space:]]*(timeout[[:space:]]+[0-9]+[[:space:]]+)?(bash[[:space:]]+-c[[:space:]]+[\"']?)?\\./target/release/openra2-rust\\b"; then
  exit 0
fi

REASON='Direct binary execution detected: `./target/release/openra2-rust`. This bypasses cargo and Bevy AssetPlugin fails because `CARGO_MANIFEST_DIR` is unset — you will see "Path not found" shader errors and the renderer will be broken. Use `cargo run --release` instead (Bevy reads CARGO_MANIFEST_DIR to locate `assets/`). See CLAUDE.md "Visual Testing Rules". For process inspection (not execution), `pgrep -f target/release/openra2-rust` without the leading `./` is fine and not blocked.'

if command -v jq >/dev/null 2>&1; then
  jq -n --arg reason "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
else
  python3 -c "import json,sys; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': sys.argv[1]}}))" "$REASON"
fi

cat >&2 <<EOF
BLOCKED: $REASON
EOF
exit 2
