#!/usr/bin/env bash
# Remove project-level Claude Code symlinks from a target repo.
# Only removes symlinks that point into claude-playbook, never deletes native files.
#
# Usage: ./uninstall-claude.sh [target-repo-path]
set -euo pipefail

TARGET_REPO="${1:-.}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"

echo "Target: $TARGET_REPO"
echo ""

removed=0

# ---------------------------------------------------------------------------
# Helper: remove symlink only if it points to claude-playbook
# ---------------------------------------------------------------------------
remove_aws_link() {
    local path="$1"
    local label="$2"
    if [[ -L "$path" ]]; then
        local target
        target="$(readlink -f "$path")"
        if [[ "$target" == *claude-playbook* || "$target" == *claude-playbook* ]]; then
            rm "$path"
            echo "  [rm] $label"
            ((removed++)) || true
        else
            echo "  [skip] $label (symlink to non-claude-playbook target)"
        fi
    fi
}

# ---------------------------------------------------------------------------
# CLAUDE.md
# ---------------------------------------------------------------------------
echo "--- CLAUDE.md ---"
remove_aws_link "$TARGET_REPO/CLAUDE.md" "CLAUDE.md"

# ---------------------------------------------------------------------------
# .claude/ contents
# ---------------------------------------------------------------------------
DST_CLAUDE="$TARGET_REPO/.claude"

if [[ -L "$DST_CLAUDE" ]]; then
    # Entire .claude/ is a symlink (replace mode)
    remove_aws_link "$DST_CLAUDE" ".claude/"
elif [[ -d "$DST_CLAUDE" ]]; then
    # Merge mode: check individual files
    echo "--- .claude/rules/ ---"
    if [[ -d "$DST_CLAUDE/rules" ]]; then
        for f in "$DST_CLAUDE/rules"/*.md; do
            [[ -L "$f" ]] || continue
            remove_aws_link "$f" ".claude/rules/$(basename "$f")"
        done
        # Remove rules/ dir if empty
        rmdir "$DST_CLAUDE/rules" 2>/dev/null && echo "  [rm] .claude/rules/ (empty)" || true
    fi

    echo "--- .claude/commands/ ---"
    if [[ -d "$DST_CLAUDE/commands" ]]; then
        # Remove symlinked subdirectories (e.g., ac/)
        for d in "$DST_CLAUDE/commands"/*/; do
            [[ -L "${d%/}" ]] || continue
            remove_aws_link "${d%/}" ".claude/commands/$(basename "$d")/"
        done
        # Remove symlinked files
        for f in "$DST_CLAUDE/commands"/*.md; do
            [[ -L "$f" ]] || continue
            remove_aws_link "$f" ".claude/commands/$(basename "$f")"
        done
        rmdir "$DST_CLAUDE/commands" 2>/dev/null && echo "  [rm] .claude/commands/ (empty)" || true
    fi

    echo "--- .claude/settings.json ---"
    remove_aws_link "$DST_CLAUDE/settings.json" ".claude/settings.json"

    # Remove .claude/ dir if empty
    rmdir "$DST_CLAUDE" 2>/dev/null && echo "  [rm] .claude/ (empty)" || true
fi

echo ""
echo "Removed $removed symlink(s) from $TARGET_REPO"
