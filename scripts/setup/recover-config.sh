#!/usr/bin/env bash
# Recover broken claude-playbook configuration in a target repo.
# Fixes broken symlinks, missing .gitignore entries, and .gitmodules registration.
#
# Usage: ./recover-config.sh [target-repo-path]
set -euo pipefail

TARGET_REPO="${1:-.}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"

echo "Target: $TARGET_REPO"
echo ""

fixed=0
ok=0
skipped=0

# ---------------------------------------------------------------------------
# Detect playbook location
# ---------------------------------------------------------------------------
PLAYBOOK_PATH=""

if [[ -d "$TARGET_REPO/.claude-playbook/configs" ]]; then
    PLAYBOOK_PATH="$TARGET_REPO/.claude-playbook"
    MODE="local-clone"
elif [[ -d "$TARGET_REPO/claude-playbook/configs" ]]; then
    PLAYBOOK_PATH="$TARGET_REPO/claude-playbook"
    MODE="submodule"
else
    # Try to resolve from existing symlinks
    for candidate in "$TARGET_REPO/CLAUDE.md" "$TARGET_REPO/.claude"; do
        if [[ -L "$candidate" ]]; then
            link_target="$(readlink "$candidate")"
            # Resolve relative to TARGET_REPO
            if [[ "$link_target" != /* ]]; then
                link_target="$TARGET_REPO/$link_target"
            fi
            resolved="${link_target%%/configs/*}"
            if [[ -d "$resolved/configs" ]]; then
                PLAYBOOK_PATH="$resolved"
                break
            fi
        fi
    done

    if [[ -z "$PLAYBOOK_PATH" ]]; then
        echo "ERROR: Could not find claude-playbook in $TARGET_REPO"
        echo "Looked for: .claude-playbook/, claude-playbook/, symlink targets"
        exit 1
    fi

    if [[ -f "$PLAYBOOK_PATH/.git" ]]; then
        MODE="submodule"
    elif [[ -d "$PLAYBOOK_PATH/.git" ]]; then
        MODE="local-clone"
    else
        MODE="unknown"
    fi
fi

echo "Playbook: $PLAYBOOK_PATH"
echo "Mode:     $MODE"
echo ""

# ---------------------------------------------------------------------------
# Detect config name from existing symlinks or directory structure
# ---------------------------------------------------------------------------
CONFIG_NAME=""

# Try from .claude symlink target
if [[ -L "$TARGET_REPO/.claude" ]]; then
    link_target="$(readlink "$TARGET_REPO/.claude")"
    CONFIG_NAME="$(echo "$link_target" | sed -n 's|.*configs/\([^/]*\)/.*|\1|p')"
fi

# Try from CLAUDE.md symlink target
if [[ -z "$CONFIG_NAME" ]] && [[ -L "$TARGET_REPO/CLAUDE.md" ]]; then
    link_target="$(readlink "$TARGET_REPO/CLAUDE.md")"
    CONFIG_NAME="$(echo "$link_target" | sed -n 's|.*configs/\([^/]*\)/.*|\1|p')"
fi

# Fallback: list available configs
if [[ -z "$CONFIG_NAME" ]]; then
    echo "WARNING: Could not detect config name from symlinks."
    echo "Available configs:"
    for d in "$PLAYBOOK_PATH/configs"/*/; do
        [[ -d "$d" ]] || continue
        name="$(basename "$d")"
        [[ "$name" == "global" ]] && continue
        echo "  - $name"
    done
    if [[ -t 0 ]]; then
        read -p "Config name: " CONFIG_NAME
    else
        echo "ERROR: Cannot detect config name and stdin is not a terminal."
        echo "Use symlinks that point into configs/<name>/ so recovery can auto-detect."
        exit 1
    fi
    if [[ -z "$CONFIG_NAME" ]]; then
        echo "ERROR: Config name required"
        exit 1
    fi
fi

CONFIG_DIR="$PLAYBOOK_PATH/configs/$CONFIG_NAME"
if [[ ! -d "$CONFIG_DIR" ]]; then
    echo "ERROR: Config '$CONFIG_NAME' not found at $CONFIG_DIR"
    exit 1
fi

echo "Config:   $CONFIG_NAME"
echo ""

# ---------------------------------------------------------------------------
# Helper: fix a broken symlink
# ---------------------------------------------------------------------------
fix_symlink() {
    local path="$1"
    local target="$2"
    local label="$3"

    if [[ -L "$path" ]]; then
        if [[ -e "$path" ]]; then
            echo "  [ok] $label"
            ((ok++)) || true
            return
        fi
        # Broken symlink
        rm "$path"
        ln -s "$target" "$path"
        echo "  [fix] $label (re-created broken symlink)"
        ((fixed++)) || true
    elif [[ -e "$path" ]]; then
        echo "  [skip] $label (native file, not a symlink)"
        ((skipped++)) || true
    else
        # Missing entirely
        ln -s "$target" "$path"
        echo "  [fix] $label (created missing symlink)"
        ((fixed++)) || true
    fi
}

# ---------------------------------------------------------------------------
# 1. Fix CLAUDE.md symlink
# ---------------------------------------------------------------------------
echo "--- CLAUDE.md ---"
if [[ -f "$CONFIG_DIR/CLAUDE.md" ]]; then
    fix_symlink "$TARGET_REPO/CLAUDE.md" "$CONFIG_DIR/CLAUDE.md" "CLAUDE.md"
else
    echo "  [skip] No CLAUDE.md in config"
fi

# ---------------------------------------------------------------------------
# 2. Fix .claude/ symlink or contents
# ---------------------------------------------------------------------------
echo "--- .claude/ ---"
if [[ -d "$CONFIG_DIR/.claude" ]]; then
    if [[ -L "$TARGET_REPO/.claude" ]]; then
        # REPLACE mode
        fix_symlink "$TARGET_REPO/.claude" "$CONFIG_DIR/.claude" ".claude/"
    elif [[ -d "$TARGET_REPO/.claude" ]]; then
        # MERGE mode: check individual symlinks
        echo "  [ok] .claude/ is a directory (MERGE mode)"

        if [[ -d "$CONFIG_DIR/.claude/rules" ]]; then
            echo "--- .claude/rules/ ---"
            mkdir -p "$TARGET_REPO/.claude/rules"
            for f in "$CONFIG_DIR/.claude/rules"/*.md; do
                [[ -f "$f" ]] || continue
                name="$(basename "$f")"
                fix_symlink "$TARGET_REPO/.claude/rules/$name" "$f" ".claude/rules/$name"
            done
        fi

        if [[ -d "$CONFIG_DIR/.claude/commands" ]]; then
            echo "--- .claude/commands/ ---"
            mkdir -p "$TARGET_REPO/.claude/commands"
            for f in "$CONFIG_DIR/.claude/commands"/*.md; do
                [[ -f "$f" ]] || continue
                name="$(basename "$f")"
                fix_symlink "$TARGET_REPO/.claude/commands/$name" "$f" ".claude/commands/$name"
            done
            for dir in "$CONFIG_DIR/.claude/commands"/*/; do
                [[ -d "$dir" ]] || continue
                dirname="$(basename "$dir")"
                fix_symlink "$TARGET_REPO/.claude/commands/$dirname" "$dir" ".claude/commands/$dirname/"
            done
        fi

        if [[ -d "$CONFIG_DIR/.claude/skills" ]]; then
            echo "--- .claude/skills/ ---"
            mkdir -p "$TARGET_REPO/.claude/skills"
            for dir in "$CONFIG_DIR/.claude/skills"/*/; do
                [[ -d "$dir" ]] || continue
                dirname="$(basename "$dir")"
                fix_symlink "$TARGET_REPO/.claude/skills/$dirname" "$dir" ".claude/skills/$dirname/"
            done
        fi
    else
        # .claude/ missing entirely — recreate as REPLACE mode symlink
        ln -s "$CONFIG_DIR/.claude" "$TARGET_REPO/.claude"
        echo "  [fix] .claude/ (created missing symlink)"
        ((fixed++)) || true
    fi
else
    echo "  [skip] No .claude/ in config"
fi

# ---------------------------------------------------------------------------
# 3. Fix .gitignore (local clone mode)
# ---------------------------------------------------------------------------
echo "--- .gitignore ---"
if [[ -d "$TARGET_REPO/.claude-playbook" ]]; then
    if grep -qxF '.claude-playbook/' "$TARGET_REPO/.gitignore" 2>/dev/null; then
        echo "  [ok] .claude-playbook/ in .gitignore"
        ((ok++)) || true
    else
        echo '.claude-playbook/' >> "$TARGET_REPO/.gitignore"
        echo "  [fix] Added .claude-playbook/ to .gitignore"
        ((fixed++)) || true
    fi
else
    echo "  [skip] Not in local clone mode"
fi

# ---------------------------------------------------------------------------
# 4. Fix .gitmodules (submodule mode)
# ---------------------------------------------------------------------------
echo "--- .gitmodules ---"
if [[ "$MODE" == "submodule" ]]; then
    SUBMODULE_REL="$(python3 -c "import os; print(os.path.relpath('$PLAYBOOK_PATH', '$TARGET_REPO'))" 2>/dev/null || basename "$PLAYBOOK_PATH")"

    if [[ -f "$TARGET_REPO/.gitmodules" ]] && grep -q "$SUBMODULE_REL" "$TARGET_REPO/.gitmodules" 2>/dev/null; then
        echo "  [ok] $SUBMODULE_REL registered in .gitmodules"
        ((ok++)) || true
    else
        # Get remote URL from the submodule itself
        REMOTE_URL="$(cd "$PLAYBOOK_PATH" && git remote get-url origin 2>/dev/null || echo "")"
        if [[ -n "$REMOTE_URL" ]]; then
            cd "$TARGET_REPO"
            echo "  Registering submodule $SUBMODULE_REL..."
            # Use git submodule add to properly register
            # --force in case the directory already exists
            git submodule add --force "$REMOTE_URL" "$SUBMODULE_REL" 2>/dev/null || true
            echo "  [fix] $SUBMODULE_REL registered in .gitmodules"
            ((fixed++)) || true
        else
            echo "  [skip] Cannot determine remote URL for submodule"
            ((skipped++)) || true
        fi
    fi
else
    echo "  [skip] Not in submodule mode"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Recovery complete: $fixed fixed, $ok ok, $skipped skipped"
