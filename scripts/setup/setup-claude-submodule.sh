#!/usr/bin/env bash
# Install project-level Claude Code config into a target repo (submodule mode).
# Adds claude-playbook as a git submodule, then creates symlinks.
#
# Usage: ./setup-claude-submodule.sh <config-name> [target-repo-path] [submodule-path]
#   config-name:      one of: global, debugging (or any config under configs/)
#   target-repo-path: defaults to current directory
#   submodule-path:   where to place the submodule (default: .claude-playbook)
#
# Example:
#   cd ~/work/robot-fw
#   /path/to/setup-claude-submodule.sh robot . .claude-playbook
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
SUBMODULE_PATH="${3:-.claude-playbook}"

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
# Delegate to merge setup, pointing at the submodule copy
# ---------------------------------------------------------------------------
MERGE_SCRIPT="$SUBMODULE_PATH/scripts/setup/setup-claude-merge.sh"
if [[ ! -f "$MERGE_SCRIPT" ]]; then
    echo "ERROR: setup-claude-merge.sh not found in submodule"
    exit 1
fi

echo ""
echo "Running merge setup from submodule..."
echo ""
# Override AWS_ROOT via first arg (config-name) and second arg (target)
# The merge script expects: <config-name> [target-repo-path]
# But it resolves AWS_ROOT from its own location, which is now inside the submodule.
bash "$MERGE_SCRIPT" "$CONFIG_NAME" "$TARGET_REPO"

echo ""
echo "Submodule setup complete."
echo "Don't forget to commit the submodule addition:"
echo "  git add .gitmodules $SUBMODULE_PATH && git commit -m 'Add claude-playbook submodule'"
