#!/usr/bin/env bash
# Install project-level Claude Code config via local clone (no submodule).
# Clones claude-playbook into a hidden .claude-playbook/ directory and
# creates REPLACE-mode symlinks.
#
# Usage: ./setup-claude-local-clone.sh <config-name> [target-repo-path]
#   config-name:      one of: debugging (or any config under configs/, except global)
#   target-repo-path: defaults to current directory
#
# Example:
#   cd ~/work/my-project
#   /path/to/setup-claude-local-clone.sh debugging .
set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
SPARSE_CHECKOUT=true
CONFIG_NAME=""
TARGET_REPO=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-sparse) SPARSE_CHECKOUT=false; shift ;;
        *)
            if [[ -z "$CONFIG_NAME" ]]; then
                CONFIG_NAME="$1"
            elif [[ -z "$TARGET_REPO" ]]; then
                TARGET_REPO="$1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$CONFIG_NAME" ]]; then
    echo "Usage: $0 [--no-sparse] <config-name> [target-repo-path]"
    exit 1
fi

TARGET_REPO="${TARGET_REPO:-.}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYBOOK_SRC="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/sparse-checkout-helper.sh"

if [[ "$CONFIG_NAME" == "global" ]]; then
    echo "ERROR: Use setup-global-claude.sh for global config"
    exit 1
fi

# ---------------------------------------------------------------------------
# Get remote URL of claude-playbook
# ---------------------------------------------------------------------------
PLAYBOOK_REMOTE="$(cd "$PLAYBOOK_SRC" && git remote get-url origin 2>/dev/null || echo "")"
if [[ -z "$PLAYBOOK_REMOTE" ]]; then
    echo "ERROR: Cannot determine claude-playbook remote URL"
    echo "Make sure claude-playbook has a git remote configured."
    exit 1
fi

CLONE_PATH=".claude-playbook"

echo "Config:       $CONFIG_NAME"
echo "Target:       $TARGET_REPO"
echo "Clone path:   $TARGET_REPO/$CLONE_PATH"
echo "Remote:       $PLAYBOOK_REMOTE"
echo ""

# ---------------------------------------------------------------------------
# Clone claude-playbook (not a submodule)
# ---------------------------------------------------------------------------
cd "$TARGET_REPO"

if [[ -d "$CLONE_PATH/.git" ]]; then
    echo "[skip] Clone already exists at $CLONE_PATH"
else
    if [[ "$SPARSE_CHECKOUT" == true ]]; then
        echo "[clone] Cloning claude-playbook (sparse)..."
        git clone --no-checkout "$PLAYBOOK_REMOTE" "$CLONE_PATH"
        if configure_sparse_checkout "$TARGET_REPO/$CLONE_PATH" "$CONFIG_NAME"; then
            git checkout -q
        else
            cd "$TARGET_REPO/$CLONE_PATH" && git checkout -q
        fi
        cd "$TARGET_REPO"
    else
        echo "[clone] Cloning claude-playbook..."
        git clone "$PLAYBOOK_REMOTE" "$CLONE_PATH"
    fi
fi

# ---------------------------------------------------------------------------
# Add .claude-playbook/ to .gitignore
# ---------------------------------------------------------------------------
echo "--- .gitignore ---"
if ! grep -qxF '.claude-playbook/' "$TARGET_REPO/.gitignore" 2>/dev/null; then
    echo '.claude-playbook/' >> "$TARGET_REPO/.gitignore"
    echo "  [add] .claude-playbook/ to .gitignore"
else
    echo "  [skip] .claude-playbook/ already in .gitignore"
fi

# ---------------------------------------------------------------------------
# Create config scaffold in clone if it does not exist
# ---------------------------------------------------------------------------
CLONE_CONFIG="$CLONE_PATH/configs/$CONFIG_NAME"
if [[ ! -d "$CLONE_CONFIG" ]]; then
    echo "[create] Creating config '$CONFIG_NAME' in clone..."
    mkdir -p "$CLONE_CONFIG/.claude/commands"
    mkdir -p "$CLONE_CONFIG/.claude/agents"
    mkdir -p "$CLONE_CONFIG/.claude/rules"
    mkdir -p "$CLONE_CONFIG/docs"
    cat > "$CLONE_CONFIG/CLAUDE.md" << EOF
# ${CONFIG_NAME} Config

## Overview

Configuration for ${CONFIG_NAME} project.

## Commands

(Add your commands here)

## Getting Started

See [Claude Playbook Documentation](../../README.md) for more information.
EOF
    cat > "$CLONE_CONFIG/.claude/commands/hello.md" << 'CMDEOF'
Say hello and confirm the config is working.

When the user runs this command:
1. Print "Hello from the config!"
2. List available commands in this config
CMDEOF
fi

# ---------------------------------------------------------------------------
# REPLACE mode: symlink entire .claude/ and CLAUDE.md
# ---------------------------------------------------------------------------
CONFIG_DIR="$CLONE_PATH/configs/$CONFIG_NAME"

if [[ ! -d "$CONFIG_DIR" ]]; then
    echo "ERROR: Config '$CONFIG_NAME' not found at $TARGET_REPO/$CONFIG_DIR"
    exit 1
fi

echo ""
echo "Installing config (REPLACE mode)..."
echo ""

# --- CLAUDE.md ---
echo "--- CLAUDE.md ---"
if [[ -f "$CONFIG_DIR/CLAUDE.md" ]]; then
    if [[ -L "$TARGET_REPO/CLAUDE.md" ]]; then
        rm "$TARGET_REPO/CLAUDE.md"
    elif [[ -e "$TARGET_REPO/CLAUDE.md" ]]; then
        echo "  [WARN] CLAUDE.md exists and is not a symlink, skipping"
    fi
    if [[ ! -e "$TARGET_REPO/CLAUDE.md" ]]; then
        ln -s "$CONFIG_DIR/CLAUDE.md" "$TARGET_REPO/CLAUDE.md"
        echo "  [link] CLAUDE.md -> $CONFIG_DIR/CLAUDE.md"
    fi
else
    echo "  [skip] No CLAUDE.md in config"
fi

# --- .claude/ (whole directory) ---
echo "--- .claude/ ---"
if [[ -d "$CONFIG_DIR/.claude" ]]; then
    if [[ -L "$TARGET_REPO/.claude" ]]; then
        rm "$TARGET_REPO/.claude"
    elif [[ -d "$TARGET_REPO/.claude" ]]; then
        echo "  [WARN] .claude/ exists as a real directory, skipping"
        echo "  [WARN] Remove it first if you want REPLACE mode"
    fi
    if [[ ! -e "$TARGET_REPO/.claude" ]]; then
        ln -s "$CONFIG_DIR/.claude" "$TARGET_REPO/.claude"
        echo "  [link] .claude/ -> $CONFIG_DIR/.claude/"
    fi
else
    echo "  [skip] No .claude/ directory in config"
fi

# ---------------------------------------------------------------------------
# Install git hooks into the cloned playbook
# ---------------------------------------------------------------------------
INSTALL_HOOKS="$TARGET_REPO/$CLONE_PATH/scripts/hooks/install-hooks.sh"
if [[ -x "$INSTALL_HOOKS" ]]; then
    echo "--- Git Hooks (playbook clone) ---"
    bash "$INSTALL_HOOKS"
fi

echo ""
echo "Local clone setup complete."
echo "Don't forget to commit the .gitignore change:"
echo "  git add .gitignore && git commit -m 'Add .claude-playbook to gitignore'"
