#!/usr/bin/env bash
# Remove project-level Claude Code configuration from a target repo.
# Removes symlinks, .claude/ directory, CLAUDE.md, and playbook repo.
#
# Usage: ./uninstall-claude.sh [target-repo-path]
set -euo pipefail

TARGET_REPO="${1:-.}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"

echo "Target: $TARGET_REPO"
echo ""

removed=0

# ---------------------------------------------------------------------------
# CLAUDE.md
# ---------------------------------------------------------------------------
echo "--- CLAUDE.md ---"
if [[ -L "$TARGET_REPO/CLAUDE.md" ]]; then
    rm "$TARGET_REPO/CLAUDE.md"
    echo "  [rm] CLAUDE.md (symlink)"
    ((removed++)) || true
elif [[ -f "$TARGET_REPO/CLAUDE.md" ]]; then
    rm "$TARGET_REPO/CLAUDE.md"
    echo "  [rm] CLAUDE.md"
    ((removed++)) || true
else
    echo "  [skip] CLAUDE.md (not found)"
fi

# ---------------------------------------------------------------------------
# .claude/ directory
# ---------------------------------------------------------------------------
echo "--- .claude/ ---"
if [[ -L "$TARGET_REPO/.claude" ]]; then
    rm "$TARGET_REPO/.claude"
    echo "  [rm] .claude/ (symlink)"
    ((removed++)) || true
elif [[ -d "$TARGET_REPO/.claude" ]]; then
    rm -rf "$TARGET_REPO/.claude"
    echo "  [rm] .claude/ (directory)"
    ((removed++)) || true
else
    echo "  [skip] .claude/ (not found)"
fi

# ---------------------------------------------------------------------------
# .claude-playbook/ (local clone mode)
# ---------------------------------------------------------------------------
if [[ -d "$TARGET_REPO/.claude-playbook" ]]; then
    echo "--- .claude-playbook/ (local clone) ---"
    rm -rf "$TARGET_REPO/.claude-playbook"
    echo "  [rm] .claude-playbook/"
    ((removed++)) || true

    # Clean .gitignore entry
    if [[ -f "$TARGET_REPO/.gitignore" ]] && grep -qxF '.claude-playbook/' "$TARGET_REPO/.gitignore"; then
        sed -i '/^\.claude-playbook\/$/d' "$TARGET_REPO/.gitignore"
        echo "  [rm] .claude-playbook/ from .gitignore"
    fi
fi

# ---------------------------------------------------------------------------
# claude-playbook submodule
# ---------------------------------------------------------------------------
SUBMODULE_PATH=""
for candidate in claude-playbook; do
    if [[ -d "$TARGET_REPO/$candidate" ]]; then
        SUBMODULE_PATH="$candidate"
        break
    fi
done

if [[ -n "$SUBMODULE_PATH" ]]; then
    echo "--- $SUBMODULE_PATH/ (submodule) ---"
    cd "$TARGET_REPO"

    # Deinit and remove submodule
    git submodule deinit -f "$SUBMODULE_PATH" 2>/dev/null || true
    git rm -f "$SUBMODULE_PATH" 2>/dev/null || true
    rm -rf "$TARGET_REPO/.git/modules/$SUBMODULE_PATH" 2>/dev/null || true
    rm -rf "$TARGET_REPO/$SUBMODULE_PATH" 2>/dev/null || true
    echo "  [rm] $SUBMODULE_PATH/"
    ((removed++)) || true
fi

echo ""
echo "Removed $removed item(s) from $TARGET_REPO"
