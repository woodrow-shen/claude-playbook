# /tmux Command Guide

Send instructions to Claude Code running in another tmux session.

## Usage

```
/tmux <session-name> <instruction>
```

## What It Does

1. Delegates to the tmux sub-agent with the target session name and instruction
2. The tmux agent sends the instruction to the specified tmux session
3. Enables cross-session debugging and task dispatch

## Parameters

- `session-name` - Target tmux session name
- `instruction` - What to tell Claude Code in that session

## Key Features

- Cross-session task dispatch
- Multi-session debugging support
- Works with the tmux-session-management skill

## When to Use

- Running parallel tasks across multiple sessions
- Sending follow-up instructions to a background agent
- Coordinating work across terminal sessions

## See Also

- `/monitor-tmux` for monitoring session progress
- tmux-session-management skill for navigation patterns
