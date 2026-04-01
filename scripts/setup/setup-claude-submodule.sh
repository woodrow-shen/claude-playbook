#!/usr/bin/env bash
# Install project-level Claude Code config into a target repo (submodule mode).
# Adds claude-playbook as a git submodule, then creates symlinks.
#
# Usage: ./setup-claude-submodule.sh <config-name> [target-repo-path] [submodule-path]
#   config-name:      one of: global, debugging (or any config under configs/)
#   target-repo-path: defaults to current directory
#   submodule-path:   where to place the submodule (default: claude-playbook)
#
# Example:
#   cd ~/work/robot-fw
#   /path/to/setup-claude-submodule.sh robot . claude-playbook
set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <config-name> [target-repo-path] [submodule-path]"
    exit 1
fi

CONFIG_NAME="$1"
TARGET_REPO="${2:-.}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"
SUBMODULE_PATH="${3:-claude-playbook}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ "$CONFIG_NAME" == "global" ]]; then
    echo "ERROR: Use setup-global-claude.sh for global config"
    exit 1
fi

# ---------------------------------------------------------------------------
# Get remote URL of claude-playbook
# ---------------------------------------------------------------------------
AWS_REMOTE="$(cd "$AWS_ROOT" && git remote get-url origin 2>/dev/null || echo "")"
if [[ -z "$AWS_REMOTE" ]]; then
    echo "ERROR: Cannot determine claude-playbook remote URL"
    echo "Make sure claude-playbook has a git remote configured."
    exit 1
fi

echo "Config:       $CONFIG_NAME"
echo "Target:       $TARGET_REPO"
echo "Submodule:    $SUBMODULE_PATH"
echo "Remote:       $AWS_REMOTE"
echo ""

# ---------------------------------------------------------------------------
# Add submodule if not present
# ---------------------------------------------------------------------------
cd "$TARGET_REPO"

if [[ -d "$SUBMODULE_PATH/.git" ]] || [[ -f "$SUBMODULE_PATH/.git" ]]; then
    echo "[skip] Submodule already exists at $SUBMODULE_PATH"
else
    echo "[add]  Adding claude-playbook as submodule..."
    git submodule add "$AWS_REMOTE" "$SUBMODULE_PATH"
fi

git submodule update --init "$SUBMODULE_PATH"

# ---------------------------------------------------------------------------
# Sync config into submodule if it only exists locally (not yet pushed)
# ---------------------------------------------------------------------------
SUBMODULE_CONFIG="$SUBMODULE_PATH/configs/$CONFIG_NAME"
LOCAL_CONFIG="$AWS_ROOT/configs/$CONFIG_NAME"
if [[ ! -d "$SUBMODULE_CONFIG" ]] && [[ -d "$LOCAL_CONFIG" ]]; then
    echo "[sync] Config '$CONFIG_NAME' not in submodule yet, copying from local playbook..."
    cp -r "$LOCAL_CONFIG" "$SUBMODULE_CONFIG"
fi

# ---------------------------------------------------------------------------
# REPLACE mode: symlink entire .claude/ and CLAUDE.md
# ---------------------------------------------------------------------------
CONFIG_DIR="$SUBMODULE_PATH/configs/$CONFIG_NAME"

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
        echo "  [WARN] Remove it first or use MERGE mode (option 3) instead"
    fi
    if [[ ! -e "$TARGET_REPO/.claude" ]]; then
        ln -s "$CONFIG_DIR/.claude" "$TARGET_REPO/.claude"
        echo "  [link] .claude/ -> $CONFIG_DIR/.claude/"
    fi
else
    echo "  [skip] No .claude/ directory in config"
fi

# ---------------------------------------------------------------------------
# Install git hooks into the playbook submodule
# ---------------------------------------------------------------------------
INSTALL_HOOKS="$TARGET_REPO/$SUBMODULE_PATH/scripts/hooks/install-hooks.sh"
if [[ -x "$INSTALL_HOOKS" ]]; then
    echo "--- Git Hooks (submodule) ---"
    bash "$INSTALL_HOOKS"
fi

echo ""
echo "Submodule setup complete (REPLACE mode)."
echo "Don't forget to commit the submodule addition:"
echo "  git add .gitmodules $SUBMODULE_PATH && git commit -m 'Add claude-playbook submodule'"
