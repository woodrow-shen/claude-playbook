#!/usr/bin/env bash
# Install project-level Claude Code config into a target repo (merge mode).
# Symlinks individual files so the target repo can also have native .claude/ files.
#
# Usage: ./setup-claude-merge.sh <config-name> [target-repo-path]
#   config-name:     one of: global, debugging (or any config under configs/)
#   target-repo-path: defaults to current directory
#
# Example:
#   ./setup-claude-merge.sh robot ~/work/robot-fw
set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <config-name> [target-repo-path]"
    echo ""
    echo "Available configs:"
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    for d in "$(cd "$SCRIPT_DIR/../.." && pwd)/configs"/*/; do
        name="$(basename "$d")"
        [[ "$name" == "global" ]] && continue
        echo "  $name"
    done
    exit 1
fi

CONFIG_NAME="$1"
TARGET_REPO="${2:-.}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_DIR="$AWS_ROOT/configs/$CONFIG_NAME"

if [[ ! -d "$CONFIG_DIR" ]]; then
    echo "ERROR: Config '$CONFIG_NAME' not found at $CONFIG_DIR"
    exit 1
fi

if [[ "$CONFIG_NAME" == "global" ]]; then
    echo "ERROR: Use setup-global-claude.sh for global config"
    exit 1
fi

echo "Config:     $CONFIG_NAME ($CONFIG_DIR)"
echo "Target:     $TARGET_REPO"
echo ""

# ---------------------------------------------------------------------------
# Helper: symlink a single file
# ---------------------------------------------------------------------------
link_file() {
    local src="$1"
    local dst="$2"
    local label="$3"

    if [[ -L "$dst" ]]; then
        local existing
        existing="$(readlink -f "$dst" 2>/dev/null || echo "")"
        local expected
        expected="$(readlink -f "$src" 2>/dev/null || echo "")"
        if [[ -n "$existing" ]] && [[ "$existing" == "$expected" ]]; then
            echo "  [skip] $label (already linked)"
            return
        fi
        rm "$dst"
    elif [[ -e "$dst" ]]; then
        echo "  [WARN] $label exists and is not a symlink, skipping"
        return
    fi
    ln -s "$src" "$dst"
    echo "  [link] $label"
}

# ---------------------------------------------------------------------------
# Symlink CLAUDE.md
# ---------------------------------------------------------------------------
echo "--- CLAUDE.md ---"
if [[ -f "$CONFIG_DIR/CLAUDE.md" ]]; then
    link_file "$CONFIG_DIR/CLAUDE.md" "$TARGET_REPO/CLAUDE.md" "CLAUDE.md"
else
    echo "  [skip] No CLAUDE.md in config"
fi

# ---------------------------------------------------------------------------
# Symlink .claude/ contents (merge mode: file by file)
# ---------------------------------------------------------------------------
SRC_CLAUDE="$CONFIG_DIR/.claude"
DST_CLAUDE="$TARGET_REPO/.claude"

if [[ ! -d "$SRC_CLAUDE" ]]; then
    echo "  [skip] No .claude/ directory in config"
    echo ""
    echo "Setup complete."
    exit 0
fi

mkdir -p "$DST_CLAUDE"

# --- rules ---
if [[ -d "$SRC_CLAUDE/rules" ]]; then
    echo "--- .claude/rules/ ---"
    mkdir -p "$DST_CLAUDE/rules"
    for f in "$SRC_CLAUDE/rules"/*.md; do
        [[ -f "$f" ]] || continue
        name="$(basename "$f")"
        link_file "$f" "$DST_CLAUDE/rules/$name" ".claude/rules/$name"
    done
fi

# --- commands (files + subdirs) ---
if [[ -d "$SRC_CLAUDE/commands" ]]; then
    echo "--- .claude/commands/ ---"
    mkdir -p "$DST_CLAUDE/commands"

    for f in "$SRC_CLAUDE/commands"/*.md; do
        [[ -f "$f" ]] || continue
        name="$(basename "$f")"
        link_file "$f" "$DST_CLAUDE/commands/$name" ".claude/commands/$name"
    done

    for dir in "$SRC_CLAUDE/commands"/*/; do
        [[ -d "$dir" ]] || continue
        dirname="$(basename "$dir")"
        target_subdir="$DST_CLAUDE/commands/$dirname"
        if [[ -L "$target_subdir" ]]; then
            existing="$(readlink -f "$target_subdir" 2>/dev/null || echo "")"
            if [[ -n "$existing" ]] && [[ "$existing" == "$(readlink -f "$dir" 2>/dev/null || echo "")" ]]; then
                echo "  [skip] .claude/commands/$dirname/ (already linked)"
                continue
            fi
            rm "$target_subdir"
        elif [[ -d "$target_subdir" ]]; then
            echo "  [WARN] .claude/commands/$dirname/ exists, skipping"
            continue
        fi
        ln -s "$dir" "$target_subdir"
        echo "  [link] .claude/commands/$dirname/"
    done
fi

# --- settings.json ---
if [[ -f "$SRC_CLAUDE/settings.json" ]]; then
    echo "--- .claude/settings.json ---"
    link_file "$SRC_CLAUDE/settings.json" "$DST_CLAUDE/settings.json" ".claude/settings.json"
fi

# ---------------------------------------------------------------------------
# Install git hooks into the playbook repo
# ---------------------------------------------------------------------------
INSTALL_HOOKS="$AWS_ROOT/scripts/hooks/install-hooks.sh"
if [[ -x "$INSTALL_HOOKS" ]]; then
    echo "--- Git Hooks (playbook) ---"
    bash "$INSTALL_HOOKS"
fi

echo ""
echo "Setup complete. Symlinks created in $TARGET_REPO"
echo ""
echo "Verify with:  ls -la $TARGET_REPO/CLAUDE.md $TARGET_REPO/.claude/"
