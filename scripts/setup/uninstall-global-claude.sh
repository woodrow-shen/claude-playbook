#!/usr/bin/env bash
# Remove global Claude Code symlinks from ~/.claude/
# Only removes symlinks that point into claude-playbook, never deletes native files.
#
# Usage: ./uninstall-global-claude.sh
set -euo pipefail

TARGET_DIR="$HOME/.claude"

echo "Target: $TARGET_DIR"
echo ""

removed=0

remove_aws_link() {
    local path="$1"
    local label="$2"
    if [[ -L "$path" ]]; then
        local target
        target="$(readlink -f "$path" 2>/dev/null || echo "")"
        if [[ "$target" == *claude-playbook* ]]; then
            rm "$path"
            echo "  [rm] $label"
            ((removed++)) || true
        else
            echo "  [skip] $label (not an claude-playbook symlink)"
        fi
    fi
}

# --- CLAUDE.md ---
echo "--- CLAUDE.md ---"
remove_aws_link "$TARGET_DIR/CLAUDE.md" "CLAUDE.md"

# --- rules ---
echo "--- rules/ ---"
if [[ -d "$TARGET_DIR/rules" ]]; then
    for f in "$TARGET_DIR/rules"/*.md; do
        [[ -L "$f" ]] || continue
        remove_aws_link "$f" "rules/$(basename "$f")"
    done
fi

# --- commands ---
echo "--- commands/ ---"
if [[ -d "$TARGET_DIR/commands" ]]; then
    for d in "$TARGET_DIR/commands"/*/; do
        [[ -L "${d%/}" ]] || continue
        remove_aws_link "${d%/}" "commands/$(basename "$d")/"
    done
    for f in "$TARGET_DIR/commands"/*.md; do
        [[ -L "$f" ]] || continue
        remove_aws_link "$f" "commands/$(basename "$f")"
    done
fi

# --- skills ---
echo "--- skills/ ---"
if [[ -d "$TARGET_DIR/skills" ]]; then
    for d in "$TARGET_DIR/skills"/*/; do
        [[ -L "${d%/}" ]] || continue
        remove_aws_link "${d%/}" "skills/$(basename "$d")/"
    done
fi

echo ""
echo "Removed $removed symlink(s) from $TARGET_DIR"
