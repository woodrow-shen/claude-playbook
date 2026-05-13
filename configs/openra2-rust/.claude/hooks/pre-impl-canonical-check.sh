#!/usr/bin/env bash
# Pre-impl canonical-source reflex hook.
#
# Fires before any Edit/Write/MultiEdit/NotebookEdit on a Rust source
# file under `src/**/*.rs`. Injects a checklist reminding Claude to
# verify the change against canonical RA2 sources (asset inventory,
# rulesmd.ini, artmd.ini, OpenRA cross-ref) before introducing any
# new RA2 semantics or magic numbers.
#
# Wired in `.claude/settings.json` under `hooks.PreToolUse`.
# Triggered for tool_name == Edit | Write | MultiEdit; this script
# does the final file-path filter (only src/**/*.rs triggers the
# reminder; docs / .claude / Cargo.toml / target / tests-only edits
# fall through with exit 0).

set -u

PAYLOAD=$(cat)

# Defensive jq-or-grep parse so the hook still works on hosts without
# jq installed (extracts `.tool_input.file_path`).
if command -v jq >/dev/null 2>&1; then
  FILE=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // ""')
else
  FILE=$(printf '%s' "$PAYLOAD" | grep -oE '"file_path"\s*:\s*"[^"]+"' | head -1 | sed -E 's/.*"file_path"\s*:\s*"([^"]+)".*/\1/')
fi

# Only fire for Rust source files. Skip:
#   - docs/**            (doc edits)
#   - .claude/**         (hook / command / skill config)
#   - target/**          (cargo build artifacts)
#   - **/*.toml          (Cargo / build config)
#   - **/*.md            (markdown docs)
#   - src/**/tests.rs    (tests-only files — assertion tweaks usually
#                         track existing canonical values, no new
#                         magic numbers introduced)
case "$FILE" in
  *src/*.rs)
    case "$FILE" in
      */tests.rs|*src/tests/*) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac

# Resolve checklist relative to this script so the hook is portable
# regardless of CLAUDE_PROJECT_DIR.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CHECKLIST="$SCRIPT_DIR/../pre-impl-checklist.md"

if [ -r "$CHECKLIST" ]; then
  CONTENT=$(cat "$CHECKLIST")
else
  CONTENT="PRE-IMPL REFLEX — verify against canonical RA2 sources before edit:
  - asset existence → docs/assets/inventory/*.md
  - data values     → rulesmd.ini  (under \$RA2_ASSETS_DIR/mods/cncreloaded/...)
  - art values      → artmd.ini    (same dir)
  - OpenRA ref      → github.com/OpenRA/ra2
No magic numbers. Cite source or mark \`// MVP, NOT canonical\`."
fi

# Claude Code PreToolUse expects JSON output. `additionalContext` is
# the injection-into-model-context channel; plain stdout is dropped.
# jq if available, hand-crafted JSON fallback otherwise.
if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CONTENT" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
else
  # Hand-craft JSON (escape backslash + double-quote + newline).
  ESCAPED=$(printf '%s' "$CONTENT" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}')
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"%s"}}\n' "$ESCAPED"
fi
