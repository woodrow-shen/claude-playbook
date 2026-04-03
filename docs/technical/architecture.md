# Architecture and Key Features

## Overview

Claude Playbook distributes shared Claude Code configurations via symlinks from a central repository to target projects.

## Directory Structure

```
claude-playbook/
├── configs/                # Per-project Claude Code configurations
│   ├── global/             # Global config (installed to ~/.claude)
│   │   ├── .claude/        # commands/, agents/, skills/, rules/
│   │   ├── docs/           # Per-command guide files
│   │   └── CLAUDE.md       # Config overview
│   ├── debugging/          # Kernel debug, coredump (skeleton)
│   └── openra2-rust/       # OpenRA2 Rust project config
├── scripts/
│   ├── setup/              # 8 setup/uninstall/recover scripts
│   ├── hooks/              # 7 pre-commit hook scripts
│   ├── release/            # Release validation and preparation
│   └── helpers/            # Utility scripts
├── docs/
│   ├── guides/             # User guides and overview
│   ├── security/           # Security documentation
│   ├── technical/          # Architecture and design docs
│   ├── templates/          # Config and command templates
│   └── testing/            # Test strategy docs
├── tests/
│   ├── func/               # 44 functional test scripts + helpers
│   └── scripts/            # Coverage validation
├── setup.sh                # Interactive setup (claude-setup command)
├── CLAUDE.md               # Project rules and policies
├── README.md               # Quick start guide
└── CHANGELOG.md            # Version history
```

## Installation Modes

All modes create symlinks, never copies.

| Mode | Method | Use Case |
|------|--------|----------|
| Global | Symlinks to `~/.claude` | Cross-project commands (all repos) |
| Submodule REPLACE | Single `.claude` symlink | New repos, no local overrides |
| Submodule MERGE | Per-file symlinks inside `.claude/` | Repos with existing `.claude/` |
| Local Clone | Clone to `.claude-playbook/` (gitignored) | No submodule complexity |

## Key Features

- TDD enforcement via pre-commit/pre-push hooks
- Security scanning (command injection, template compliance)
- `/cp:*` namespace for playbook self-management
- Tmux-based multi-session agent dispatch
- Sparse checkout support for submodule and local-clone modes
- Configuration recovery for broken symlinks
- 100% test coverage with mock-based functional tests
- 100% command guide documentation coverage
- Release management with automated validation

## Config Inventory

### Global Config

- **20 commands** (12 general + 8 `/cp:*` namespace)
- **13 agents** (10 general-purpose + 3 specialized)
- **2 skills** (input-validation, tmux-session-management)
- **9 rules** (security, TDD, documentation, contribution, config-docs)

### Other Configs

- **Debugging** - Skeleton config for kernel debugging workflows
- **OpenRA2-Rust** - Git workflow rules for OpenRA2 Rust project

## Version Format

```
<major>.<minor>.<patch>[-<stage>.<n>]
```

- Stages: `alpha`, `beta`, `rc` only
- Versions < 1.0.0 are pre-release
- Examples: `0.1.0`, `1.0.0-alpha.1`, `1.0.0-rc.1`
