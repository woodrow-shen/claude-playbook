# Claude Playbook

Centralized AI assistant configuration hub for Claude Code.

## Overview

This repo provides shared commands, agents, skills, and rules distributed via symlinks to target repos.

## Structure

```
configs/
├── global/          # 19 commands, 13 agents, 2 skills, 6 rules
└── debugging/       # Kernel debug, OpenOCD, coredump (skeleton)
```

## Setup

```bash
# 1. Source setup
source claude-playbook/setup.sh

# 2. Go to target repo and run setup
cd ~/your-repo
claude-setup
```

## Key Features

- TDD enforcement via pre-commit/pre-push hooks
- Security scanning (command injection, template compliance)
- `/cp:*` namespace for playbook self-management
- Tmux-based multi-session agent dispatch
