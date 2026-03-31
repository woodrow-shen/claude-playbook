---
name: tmux-session-management
description: Navigate between tmux sessions for multi-project debugging workflows
---

# Tmux Session Management Skill

## Overview

This skill enables the agent to navigate between multiple tmux sessions during development and debugging workflows. Common scenario: running tests in one session while developing features in another, then jumping between them to debug failures.

## Common Workflow Scenario

**Example:**
- **Session `test`**: Running integration tests
  - Branch: `dev/user/feature-A`
  - Status: Test failed
- **Session `dev`**: Developing feature A
  - Branch: `dev/user/feature-A`
  - Need to: Check code/logs and debug the failure

**Agent needs to:**
1. Detect test failure in session `test`
2. Jump to session `dev` to check code/logs
3. Debug the issue
4. Jump back to session `test` to re-run tests

---

## Tmux Session Commands Reference

### Basic Session Management

| Function | Command | Short Form |
|----------|---------|------------|
| Open new session | `tmux` | - |
| Open and name session | `tmux new -s <session_name>` | `tmux new -s <name>` |
| List all sessions | `tmux list-sessions` | `tmux ls` |
| Reconnect to session | `tmux attach-session -t <session_name>` | `tmux a -t <name>` |
| Delete specific session | `tmux kill-session -t <session_name>` | - |
| Delete all sessions | `tmux kill-server` | - |

### Detailed Command Examples

#### Create New Session

```bash
# Open new session (auto-named)
tmux

# Open and name session
tmux new -s dev
tmux new -s test
tmux new -s debug

# Create session in background (detached)
tmux new -s test -d

# Create session with specific directory
tmux new -s dev -c /path/to/project
```

#### List All Sessions

```bash
tmux list-sessions
# or short form
tmux ls

# Output format:
# dev: 3 windows (created Mon Mar 17 10:30:00 2026)
# test: 2 windows (created Mon Mar 17 09:15:00 2026)
# debug: 1 windows (created Mon Mar 17 08:00:00 2026)
```

#### Reconnect to Session

```bash
# Reconnect to a session (from outside tmux)
tmux attach-session -t dev
# or short form
tmux a -t dev

# Reconnect to most recent session
tmux attach
# or
tmux a
```

#### Switch Between Sessions

```bash
# From within tmux, switch to another session
tmux switch-client -t <session-name>

# Examples:
tmux switch-client -t dev     # Jump to dev session
tmux switch-client -t test    # Jump back to test session
tmux switch-client -t debug   # Jump to debug session
```

#### Delete Sessions

```bash
# Delete specific session
tmux kill-session -t test

# Delete all sessions except current
tmux kill-session -a

# Delete all sessions and tmux server
tmux kill-server
```

#### Get Current Session Name

```bash
# Get the name of the current tmux session
tmux display-message -p '#S'

# Use in scripts:
CURRENT_SESSION=$(tmux display-message -p '#S')
echo "Currently in session: $CURRENT_SESSION"
```

---

## Tmux Keyboard Shortcuts (Inside tmux)

All shortcuts require pressing the **Prefix Key** first (default: `Ctrl + b`).

**Usage:** Press `Ctrl + b`, release, then press the command key.

### Session Management

| Shortcut | Function |
|----------|----------|
| `Prefix + d` | **Detach** current session (runs in background) |
| `Prefix + s` | **Switch** sessions (list mode) |
| `Prefix + $` | **Rename** current session |

### Window Management (Like Browser Tabs)

| Shortcut | Function |
|----------|----------|
| `Prefix + c` | **Create** new window |
| `Prefix + ,` | **Rename** current window |
| `Prefix + n` | **Next** window |
| `Prefix + p` | **Previous** window |
| `Prefix + 0-9` | Switch to window by **number** |
| `Prefix + w` | Show **window list** |
| `Prefix + &` | **Close** current window |

### Pane Management (Split Screen)

| Shortcut | Function |
|----------|----------|
| `Prefix + %` | **Vertical split** (left/right) |
| `Prefix + "` | **Horizontal split** (top/bottom) |
| `Prefix + Arrow Keys` | **Move** between panes |
| `Prefix + o` | **Cycle** through panes (clockwise) |
| `Prefix + x` | **Close** current pane |
| `Prefix + z` | **Zoom** pane (fullscreen toggle) |
| `Prefix + Space` | **Cycle** through layouts |

### Copy Mode (Scroll Mode)

| Shortcut | Function |
|----------|----------|
| `Prefix + [` | **Enter** copy mode |
| `Arrow Keys` or `PgUp/PgDn` | **Scroll** through output |
| `q` | **Exit** copy mode |

**Advanced Copy Mode:**
- Press Space to start selection
- Move cursor to select text
- Press Enter to copy selection
- Press `Prefix + ]` to paste

---

## Debugging Workflow

### Step 1: Detect Context in Current Session

```bash
# Get current session name
CURRENT_SESSION=$(tmux display-message -p '#S')
echo "Current session: $CURRENT_SESSION"

# Get current directory
pwd

# Get current git branch
git branch --show-current
```

### Step 2: Identify Target Session

```bash
# List all sessions
tmux ls
```

### Step 3: Jump to Development Session

```bash
# Switch to the development session
tmux switch-client -t dev
```

### Step 4: Debug in Target Session

```bash
# Verify you're in the right session
tmux display-message -p '#S'

# Check git branch
git branch --show-current

# Check recent changes
git log --oneline -5

# View relevant code, check logs, make fixes
```

### Step 5: Return to Test Session

```bash
# Jump back to test session
tmux switch-client -t test

# Re-run the failed test, verify the fix
```

---

## Advanced Session Management

### Session Context Tracking

```bash
# Set session description (tmux 3.2+)
tmux set-option -t dev @description "Developing auth feature"
tmux set-option -t test @description "Running integration tests"

# Get session description
tmux show-options -t dev @description
```

### Rename Session

```bash
# Rename current session
tmux rename-session <new-name>

# Rename to match branch
BRANCH=$(git branch --show-current)
tmux rename-session "dev-${BRANCH}"
```

---

## Workflow Automation

### Automated Session Jumping Script

```bash
#!/bin/bash
# jump-to-dev-session.sh

CURRENT_SESSION=$(tmux display-message -p '#S')
echo "Current session: $CURRENT_SESSION"

# Map test sessions to development sessions
case "$CURRENT_SESSION" in
    *-test)
        TARGET_SESSION="${CURRENT_SESSION%-test}-dev"
        ;;
    test*)
        TARGET_SESSION="dev"
        ;;
    *)
        echo "Unknown session type, listing all sessions:"
        tmux ls
        exit 1
        ;;
esac

echo "Jumping to development session: $TARGET_SESSION"
tmux switch-client -t "$TARGET_SESSION"
```

### Session Synchronization

```bash
# Tag sessions with branch name
BRANCH=$(git branch --show-current)
tmux set-option -t dev @branch "$BRANCH"
tmux set-option -t test @branch "$BRANCH"

# Find all sessions working on the same branch
CURRENT_BRANCH=$(git branch --show-current)
for session in $(tmux list-sessions -F '#{session_name}'); do
    session_branch=$(tmux show-options -t "$session" @branch 2>/dev/null | cut -d' ' -f2)
    if [ "$session_branch" = "$CURRENT_BRANCH" ]; then
        echo "Session $session is on branch $CURRENT_BRANCH"
    fi
done
```

---

## Best Practices

### Session Naming Conventions

Use consistent naming for easy navigation:

**Option 1: By Activity**
```
dev           # Main development session
test          # Test execution
debug         # Debugging/investigation
review        # Code review
```

**Option 2: By Project**
```
frontend-dev    # Frontend development
frontend-test   # Frontend test execution
backend-dev     # Backend development
backend-test    # Backend test execution
```

**Option 3: By Feature Branch**
```
auth-dev        # Working on auth feature
auth-test       # Testing auth feature
```

### Quick Session Switching

Add aliases to your shell config:

```bash
# In ~/.bashrc or ~/.zshrc
alias ts='tmux switch-client -t'
alias tl='tmux list-sessions'
alias ta='tmux attach-session -t'

# Usage:
ts dev        # Quick switch to dev session
ts test       # Quick switch to test session
tl            # List all sessions
```

---

## Troubleshooting

### Session Not Found

```bash
# Error: session not found: dev
# Solution: List available sessions
tmux ls

# Create the session if it doesn't exist
tmux new -s dev -c /path/to/project
```

### Can't Switch Sessions (Not in tmux)

```bash
# Error: switch-client only works from inside tmux
# Solution: Attach to a session first
tmux a -t dev

# Then switch
tmux switch-client -t test
```

### Lost Track of Sessions

```bash
# Show all sessions with their current directories
for session in $(tmux list-sessions -F '#{session_name}'); do
    echo "=== Session: $session ==="
    tmux list-panes -t "$session" -F 'Window #{window_index}: #{pane_current_path}'
    echo ""
done
```

---

## Quick Reference

### Essential Commands (Outside tmux)

| Task | Command |
|------|---------|
| **Create** | `tmux new -s <name>` |
| **List** | `tmux ls` |
| **Attach** | `tmux a -t <name>` |
| **Switch** | `tmux switch-client -t <name>` |
| **Rename** | `tmux rename-session <name>` |
| **Delete** | `tmux kill-session -t <name>` |
| **Info** | `tmux display-message -p '#S'` |

### Essential Shortcuts (Inside tmux, Prefix = Ctrl+b)

| Category | Shortcut | Function |
|----------|----------|----------|
| Session | `Prefix + d` | Detach |
| | `Prefix + s` | Switch sessions |
| | `Prefix + $` | Rename session |
| Window | `Prefix + c` | Create window |
| | `Prefix + n/p` | Next/Previous window |
| | `Prefix + w` | Window list |
| Pane | `Prefix + %` | Vertical split |
| | `Prefix + "` | Horizontal split |
| | `Prefix + Arrow` | Move between panes |
| | `Prefix + z` | Zoom pane toggle |
| Scroll | `Prefix + [` | Enter copy mode |
| | `q` | Exit copy mode |

### Debugging Workflow Summary

1. Detect failure in current session
2. `tmux switch-client -t <dev-session>` or `Prefix + s`
3. Debug and fix the issue
4. `tmux switch-client -t <test-session>` or `Prefix + s`
5. Re-run tests
