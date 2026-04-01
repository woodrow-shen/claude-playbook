#!/usr/bin/env bash
# Install global Claude Code config to ~/.claude/
# Symlinks rules, commands, and CLAUDE.md from configs/global/
#
# Usage: ./setup-global-claude.sh [claude-playbook-path]
#   If no path given, auto-detects from script location.
set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve claude-playbook root
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_ROOT="${1:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

GLOBAL_CONFIG="$AWS_ROOT/configs/global"
GLOBAL_CLAUDE="$GLOBAL_CONFIG/.claude"
GLOBAL_CLAUDEMD="$GLOBAL_CONFIG/CLAUDE.md"
TARGET_DIR="$HOME/.claude"

if [[ ! -d "$GLOBAL_CONFIG" ]]; then
    echo "ERROR: configs/global/ not found at $GLOBAL_CONFIG"
    exit 1
fi

echo "claude-playbook: $AWS_ROOT"
echo "Target:            $TARGET_DIR"
echo ""

# ---------------------------------------------------------------------------
# Create ~/.claude/ structure
# ---------------------------------------------------------------------------
mkdir -p "$TARGET_DIR/rules"
mkdir -p "$TARGET_DIR/commands"
mkdir -p "$TARGET_DIR/skills"

# ---------------------------------------------------------------------------
# Symlink rules
# ---------------------------------------------------------------------------
if [[ -d "$GLOBAL_CLAUDE/rules" ]]; then
    echo "--- Rules ---"
    for f in "$GLOBAL_CLAUDE/rules"/*.md; do
        [[ -f "$f" ]] || continue
        name="$(basename "$f")"
        target="$TARGET_DIR/rules/$name"
        if [[ -L "$target" ]]; then
            existing="$(readlink -f "$target")"
            if [[ "$existing" == "$(readlink -f "$f")" ]]; then
                echo "  [skip] rules/$name (already linked)"
                continue
            fi
            rm "$target"
        elif [[ -f "$target" ]]; then
            echo "  [WARN] rules/$name exists and is not a symlink, skipping"
            continue
        fi
        ln -s "$f" "$target"
        echo "  [link] rules/$name"
    done
fi

# ---------------------------------------------------------------------------
# Symlink commands
# ---------------------------------------------------------------------------
if [[ -d "$GLOBAL_CLAUDE/commands" ]]; then
    echo "--- Commands ---"
    # Handle flat files
    for f in "$GLOBAL_CLAUDE/commands"/*.md; do
        [[ -f "$f" ]] || continue
        name="$(basename "$f")"
        target="$TARGET_DIR/commands/$name"
        if [[ -L "$target" ]]; then
            existing="$(readlink -f "$target")"
            if [[ "$existing" == "$(readlink -f "$f")" ]]; then
                echo "  [skip] commands/$name (already linked)"
                continue
            fi
            rm "$target"
        elif [[ -f "$target" ]]; then
            echo "  [WARN] commands/$name exists and is not a symlink, skipping"
            continue
        fi
        ln -s "$f" "$target"
        echo "  [link] commands/$name"
    done

    # Handle subdirectories (e.g., ac/)
    for dir in "$GLOBAL_CLAUDE/commands"/*/; do
        [[ -d "$dir" ]] || continue
        dirname="$(basename "$dir")"
        target_subdir="$TARGET_DIR/commands/$dirname"

        if [[ -L "$target_subdir" ]]; then
            existing="$(readlink -f "$target_subdir")"
            if [[ "$existing" == "$(readlink -f "$dir")" ]]; then
                echo "  [skip] commands/$dirname/ (already linked)"
                continue
            fi
            rm "$target_subdir"
        elif [[ -d "$target_subdir" ]]; then
            echo "  [WARN] commands/$dirname/ exists and is not a symlink, skipping"
            continue
        fi
        ln -s "$dir" "$target_subdir"
        echo "  [link] commands/$dirname/"
    done
fi

# ---------------------------------------------------------------------------
# Symlink skills (subdirectory-based: skills/<name>/SKILL.md)
# ---------------------------------------------------------------------------
if [[ -d "$GLOBAL_CLAUDE/skills" ]]; then
    echo "--- Skills ---"
    for dir in "$GLOBAL_CLAUDE/skills"/*/; do
        [[ -d "$dir" ]] || continue
        dirname="$(basename "$dir")"
        target_subdir="$TARGET_DIR/skills/$dirname"

        if [[ -L "$target_subdir" ]]; then
            existing="$(readlink -f "$target_subdir")"
            if [[ "$existing" == "$(readlink -f "$dir")" ]]; then
                echo "  [skip] skills/$dirname/ (already linked)"
                continue
            fi
            rm "$target_subdir"
        elif [[ -d "$target_subdir" ]]; then
            echo "  [WARN] skills/$dirname/ exists and is not a symlink, skipping"
            continue
        fi
        ln -s "$dir" "$target_subdir"
        echo "  [link] skills/$dirname/"
    done
fi

# ---------------------------------------------------------------------------
# Symlink CLAUDE.md
# ---------------------------------------------------------------------------
echo "--- CLAUDE.md ---"
if [[ -f "$GLOBAL_CLAUDEMD" ]]; then
    target="$TARGET_DIR/CLAUDE.md"
    if [[ -L "$target" ]]; then
        existing="$(readlink -f "$target")"
        if [[ "$existing" == "$(readlink -f "$GLOBAL_CLAUDEMD")" ]]; then
            echo "  [skip] CLAUDE.md (already linked)"
        else
            rm "$target"
            ln -s "$GLOBAL_CLAUDEMD" "$target"
            echo "  [link] CLAUDE.md"
        fi
    elif [[ -f "$target" ]]; then
        echo "  [WARN] CLAUDE.md exists and is not a symlink, skipping"
    else
        ln -s "$GLOBAL_CLAUDEMD" "$target"
        echo "  [link] CLAUDE.md"
    fi
fi

# ---------------------------------------------------------------------------
# Install git hooks for claude-playbook repo
# ---------------------------------------------------------------------------
INSTALL_HOOKS="$AWS_ROOT/scripts/hooks/install-hooks.sh"
if [[ -x "$INSTALL_HOOKS" ]] && [[ -d "$AWS_ROOT/.git" ]]; then
    echo "--- Git Hooks ---"
    bash "$INSTALL_HOOKS"
fi

echo ""
echo "Global Claude Code setup complete."
