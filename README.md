# Claude Playbook

Shared AI assistant configurations for Claude Code development workflows.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Shell](https://img.shields.io/badge/shell-bash-green.svg)](setup.sh)
[![Tests](https://img.shields.io/badge/tests-45_scripts-brightgreen.svg)](tests/)

## Overview

This repository provides reusable Claude Code configurations, enabling consistent AI-assisted development workflows with shared best practices.

**Quick Stats:**
- **3 configs** - Global, Debugging, OpenRA2-Rust
- **20 commands** - 100% documentation coverage
- **Interactive setup** - `claude-setup` command for easy installation
- **Comprehensive tests** - Functional coverage with isolated environments

Read the complete overview: [docs/guides/overview.md](docs/guides/overview.md)

## Available Configs

| Config | Use Case | Description |
|--------|----------|-------------|
| **Global** | Cross-project commands (installed to `~/.claude`) | 20 commands, 13 agents, 2 skills, 8 rules |
| **Debugging** | Kernel debugging and coredump analysis | Skeleton config |
| **OpenRA2-Rust** | OpenRA2 Rust project | Git workflow rules |

See detailed config descriptions: [docs/guides/overview.md#available-configs](docs/guides/overview.md#available-configs)

---

## Installation

### Quick Start (Recommended)

```bash
# 1. Clone or navigate to claude-playbook
cd claude-playbook

# 2. Source the setup script (one-time)
source setup.sh

# 3. Run claude-setup from anywhere
cd ~/my-project
claude-setup
```

**The `claude-setup` command provides:**
- Setup Global Claude (install to `~/.claude`)
- Setup Project with Submodule Mode (tracked by git)
- Setup Project with Merge Mode (tracked by git)
- Setup Project with Local Clone Mode (gitignored, no submodule)
- Update/Uninstall configurations
- Install Pre-commit Hooks
- Recover broken configuration files
- Create new config scaffolds

**Make it permanent:** Add to your `~/.bashrc`:
```bash
export CLAUDE_SETUP_SILENT=1  # Optional: suppress startup message
source /path/to/claude-playbook/setup.sh
```

### Manual Setup

For automation or advanced use cases:

```bash
# Install global config (recommended first step)
bash scripts/setup/setup-global-claude.sh

# Setup project config (submodule, REPLACE mode)
bash scripts/setup/setup-claude-submodule.sh debugging /path/to/repo

# Setup project config (merge mode, existing .claude/)
bash scripts/setup/setup-claude-merge.sh debugging /path/to/repo

# Setup project config (local clone, no submodule)
bash scripts/setup/setup-claude-local-clone.sh debugging /path/to/repo
```

See detailed setup instructions: [docs/guides/overview.md#setup-scripts-overview](docs/guides/overview.md#setup-scripts-overview)

---

## CI/CD Status

**Pre-commit Hooks:** Active and enforced

All quality checks run locally via pre-commit hooks and test scripts:

```bash
# Run all functional tests
for test in tests/func/test-*.sh; do bash "$test"; done

# Run release validation
bash scripts/release/validate.sh

# Run pre-commit hooks
pre-commit run --all-files
```

---

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Config overview and AI instructions
- **[CHANGELOG.md](CHANGELOG.md)** - Version history
- **[docs/guides/overview.md](docs/guides/overview.md)** - Complete overview
- **[docs/documentation-guidelines.md](docs/documentation-guidelines.md)** - Writing standards
- **[docs/security/](docs/security/)** - Security documentation
- **[docs/templates/](docs/templates/)** - Templates for new configs and commands

## Contributing

Development workflow:

1. Create a feature branch
2. Write tests first (TDD enforced)
3. Implement changes
4. Run `pre-commit run --all-files`
5. Commit with `claude/<scope>:` prefix and sign-off (`git commit -s`)
6. Submit PR for review

See [docs/documentation-guidelines.md](docs/documentation-guidelines.md) for writing standards.
