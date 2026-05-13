#!/usr/bin/env bash
# Enforce: never `git add` or `git commit` blacklisted paths.
#
# CLAUDE.md "Development Guidelines" forbids committing:
#   - `.gitmodules`            (submodule wiring lives in claude-playbook)
#   - `claude-playbook/`       (submodule itself; managed independently)
#   - `.claude/`               (local Claude Code config, symlinked to
#                               claude-playbook/configs/openra2-rust/.claude/)
#   - `CLAUDE.md`              (symlink to claude-playbook config; tracked
#                               there, not in main repo)
#
# Two checks:
#   1. Inline arg scan: if command contains `git add <blacklist-path>` or
#      `-f <blacklist-path>`, block immediately (catches explicit pushes
#      past .gitignore via `-f`).
#   2. Stage scan: if command is `git commit` (with any flags), inspect
#      `git diff --cached --name-only` for blacklist matches (catches
#      cases where blacklist files got staged earlier).
#
# Wired in `.claude/settings.json` under `hooks.PreToolUse` matcher "Bash".

set -u

PAYLOAD=$(cat)

if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // ""')
else
  CMD=$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
fi

# Only fire when `git add` / `git commit` appears at a real command
# position — start-of-string, or right after a shell separator
# (`;`, `&&`, `||`, `|`, newline). This excludes substring matches
# inside echo / printf / heredoc arguments where the text mentions
# the literal command (e.g. documentation, hook test fixtures, this
# hook's own commit message).
if ! printf '%s' "$CMD" | grep -qE '(^|[;&|]+|\n)[[:space:]]*git[[:space:]]+(add|commit)\b'; then
  exit 0
fi

# Blacklist regex — anchored so it only matches when the token starts
# a path (start of string OR after whitespace), NOT when it appears
# inside a longer path. Examples:
#
#   git add .claude/foo                           → matches (.claude/ at start)
#   git add CLAUDE.md                             → matches (CLAUDE.md at start)
#   git add configs/openra2-rust/.claude/foo      → NO match (.claude/ preceded by /)
#   git add docs/CLAUDE-design.md                 → NO match (CLAUDE.md not standalone)
#
# Critical: when running inside the playbook submodule (e.g. via
# `cd claude-playbook && git add configs/openra2-rust/.claude/...`),
# the path-internal `.claude/` reference must not trigger the project-
# level blacklist.
BLACKLIST_RE='(^|[[:space:]])(\.gitmodules|claude-playbook/?|\.claude/?|CLAUDE\.md)\b'

# Subcommand-aware checks. Critical distinction:
#   - `git add <args>`        — argv IS the path list, inline-arg scan correct
#   - `git commit ... -m '…'` — argv is flags + message, NOT paths. Inline
#                                scan here would false-positive on any
#                                commit message that mentions blacklist
#                                file names (which happens whenever we
#                                document the blacklist itself, e.g. this
#                                hook's own commit). Use staged check only.
INLINE_MATCH=""
STAGED_MATCH=""

if printf '%s' "$CMD" | grep -qE '(^|[;&|]+|\n)[[:space:]]*git[[:space:]]+add\b'; then
  # For `git add`, scan inline args for explicit blacklist paths —
  # BUT only the segment STARTING WITH `git add` itself, not the
  # whole CMD. Otherwise `cd /path/to/claude-playbook && git add .`
  # false-matches on the cd target path. Extract the substring from
  # `git add` to the next shell separator (`&&`, `||`, `;`, `|`, EOL)
  # and scan only that piece.
  ADD_ARGS=$(printf '%s' "$CMD" | grep -oE '(^|[;&|]+|\n)[[:space:]]*git[[:space:]]+add[^;&|]*' | sed -E 's/^.*git[[:space:]]+add[[:space:]]*//')
  INLINE_MATCH=$(printf '%s' "$ADD_ARGS" | grep -oE "$BLACKLIST_RE" | sort -u || true)
fi

if printf '%s' "$CMD" | grep -qE '(^|[;&|]+|\n)[[:space:]]*git[[:space:]]+commit\b'; then
  # For `git commit`, the authoritative check is the staged set —
  # what's about to be committed, regardless of what the message text
  # mentions. Inline-arg scan is intentionally skipped here.
  STAGED_MATCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" diff --cached --name-only --diff-filter=ACMR 2>/dev/null \
    | grep -E "^$BLACKLIST_RE" | sort -u || true)
fi

if [ -z "$INLINE_MATCH" ] && [ -z "$STAGED_MATCH" ]; then
  exit 0
fi

# Build human-readable reason.
DETAILS=""
[ -n "$INLINE_MATCH" ] && DETAILS+="inline args: $(printf '%s' "$INLINE_MATCH" | tr '\n' ' '); "
[ -n "$STAGED_MATCH" ] && DETAILS+="staged: $(printf '%s' "$STAGED_MATCH" | tr '\n' ' '); "

REASON="Blacklisted path in git operation. Per CLAUDE.md these must never be committed to the openra2-rust main repo: \`.gitmodules\` / \`claude-playbook/\` / \`.claude/\` / \`CLAUDE.md\` (all live in / are symlinked from the claude-playbook submodule and tracked there separately). Detected — $DETAILS. If you genuinely need to update playbook contents, \`cd claude-playbook && git ...\` in the submodule instead."

if command -v jq >/dev/null 2>&1; then
  jq -n --arg reason "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
else
  python3 -c "import json,sys; print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': sys.argv[1]}}))" "$REASON"
fi

# Belt-and-suspenders: stderr + exit 2 if JSON parsing fails.
cat >&2 <<EOF
BLOCKED: $REASON
EOF
exit 2
