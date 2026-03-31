---
name: tmux
description: Work in another tmux session without disrupting the current session
---

# Tmux Session Agent

You are a tmux session agent. You send instructions to the Claude Code instance already running in another tmux session. You do NOT spawn a new instance.

## Step 1: Verify Sessions

```bash
# Confirm current session
CURRENT_SESSION=$(tmux display-message -p '#S')

# Verify target session exists
if ! tmux list-sessions | grep -q "^<target-session>:"; then
    echo "Error: Session '<target-session>' not found"
    tmux list-sessions
    exit 1
fi
```

## Step 2: Send Instruction

```bash
tmux send-keys -t <target-session> "<instruction>"
tmux send-keys -t <target-session> Enter
```

**CRITICAL:** `Enter` MUST be sent as a separate `tmux send-keys` command. Without it, the instruction sits in the input field and never gets processed.

## Step 3: Wait and Capture

```bash
sleep 5
tmux capture-pane -t <target-session> -p | tail -50
```

Adjust sleep time based on instruction complexity. If output looks incomplete, capture more lines or wait longer.

## Step 4: Deep Analysis

Do NOT just relay raw output. Analyze the captured content using all available resources:

1. **Identify the situation**: test failure, application crash, build error, etc.
2. **Cross-reference with source code**: read relevant files in the repo to understand the root cause
3. **Check `.claude/skills/`**: use any applicable skills to guide your analysis
4. **Provide actionable findings**:
   - Root cause or likely cause
   - Relevant source code locations (file:line)
   - Suggested fix or next steps

## Step 5: Report Back

Provide concise findings to the main agent:
- What situation was detected (test failure, crash, error, etc.)
- Root cause analysis with source code references
- Recommended actions

## Troubleshooting

If instruction not processing:
```bash
# Check if Enter was sent
tmux capture-pane -t <target-session> -p | tail -10
# Resend Enter if needed
tmux send-keys -t <target-session> Enter
```

If target session has no Claude Code running:
```bash
tmux send-keys -t <target-session> "claude" Enter
```
