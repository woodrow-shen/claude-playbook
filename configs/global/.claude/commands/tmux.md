---
name: tmux
description: Send instructions to Claude Code in another tmux session
argument-hint: "[session-name] [instruction]"
---

Send instructions to another Claude Code instance in a different tmux session for multi-session debugging.

Parse $ARGUMENTS: first word is session name, remaining words are the instruction.

## Step 1: Delegate to tmux sub-agent

Pass the session name and instruction to the tmux sub-agent:

- **Session name**: first argument
- **Instruction**: remaining arguments

The tmux sub-agent handles session verification, instruction delivery, output capture, and all error cases.
