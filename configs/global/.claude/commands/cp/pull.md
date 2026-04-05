---
name: cp:pull
description: "Pull latest changes from claude-playbook"
---

Pull latest changes from the claude-playbook repository (submodule or local clone).

## Step 1: Find Playbook and Detect Mode

```bash
MODE=""
PLAYBOOK_PATH=""

if [ -L ".claude" ]; then
    # REPLACE mode: .claude is a symlink to configs/<name>/.claude
    PLAYBOOK_PATH=$(readlink ".claude" | sed 's|/configs/.*||')
    if echo "$PLAYBOOK_PATH" | grep -q '\.claude-playbook'; then
        MODE="local-clone (REPLACE)"
    else
        MODE="submodule (REPLACE)"
    fi
elif [ -d ".claude" ] && [ ! -L ".claude" ]; then
    # MERGE mode: .claude is a real directory with symlinked files inside
    if [ -d ".claude-playbook" ]; then
        PLAYBOOK_PATH=".claude-playbook"
        MODE="local-clone (MERGE)"
    elif [ -d "claude-playbook" ]; then
        PLAYBOOK_PATH="claude-playbook"
        MODE="submodule (MERGE)"
    fi
elif [ -d ".claude-playbook" ]; then
    PLAYBOOK_PATH=".claude-playbook"
    MODE="local-clone"
elif [ -d "claude-playbook" ]; then
    PLAYBOOK_PATH="claude-playbook"
    MODE="submodule"
fi

if [ -z "$PLAYBOOK_PATH" ]; then
    echo "ERROR: Could not find claude-playbook"
    echo "Looked in: .claude symlink, .claude-playbook/, claude-playbook/"
    exit 1
fi

echo "Playbook: $PLAYBOOK_PATH"
echo "Mode: $MODE"
```

## Step 2: Pull Changes

```bash
cd "$PLAYBOOK_PATH"
git pull origin main
cd ..
```

If pull fails due to local changes, automatically stash with `git stash push -m "Auto-stash before /cp:pull"`, retry, and inform user.

## Step 3: Check Symlink Conflicts

Only handle conflicts for symlinks INSIDE `.claude/` directory (MERGE mode). Do NOT touch the `.claude` symlink itself (REPLACE mode).

```bash
git fetch origin 2>/dev/null
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
INCOMING_FILES=$(git diff --name-only HEAD..origin/$CURRENT_BRANCH 2>/dev/null)
FAILED_PULL_CONFLICTS=$(git status --porcelain 2>/dev/null | grep "^??" | awk '{print $2}')

ALL_POTENTIAL_CONFLICTS=$(echo -e "$FAILED_PULL_CONFLICTS\n$INCOMING_FILES" | sort -u | grep -v '^$')

if [ -n "$ALL_POTENTIAL_CONFLICTS" ]; then
    while IFS= read -r file; do
        # Skip .claude symlink itself
        if [ "$file" = ".claude" ]; then
            continue
        fi
        # Only remove symlinks inside .claude/ that conflict
        if [ -L "$file" ]; then
            echo "Removing conflicting symlink: $file"
            rm "$file"
        fi
    done <<< "$ALL_POTENTIAL_CONFLICTS"

    # If reactive scenario (failed git pull), retry
    if [ -n "$FAILED_PULL_CONFLICTS" ]; then
        git pull
    fi
fi
```

## Step 4: Refresh MERGE Mode Symlinks

If parent repo uses MERGE mode (`.claude` is a directory, not a symlink):

```bash
if [ -d ".claude" ] && [ ! -L ".claude" ]; then
    SETUP_SCRIPT="$PLAYBOOK_PATH/scripts/setup/setup-claude-merge.sh"
    if [ -f "$SETUP_SCRIPT" ]; then
        bash "$SETUP_SCRIPT" --update
    fi
fi
```

## Step 5: Report Success

```bash
echo "Successfully pulled latest changes from claude-playbook ($MODE)"
```
