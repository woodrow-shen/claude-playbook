# Claude Playbook

Shared AI assistant configurations for Claude Code development workflows.

[![CI](https://github.com/woodrow-shen/claude-playbook/actions/workflows/ci.yml/badge.svg)](https://github.com/woodrow-shen/claude-playbook/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](tests/)
[![Shell](https://img.shields.io/badge/shell-bash-green.svg)](setup.sh)

## Overview

This repository provides reusable Claude Code configurations, enabling consistent AI-assisted development workflows with shared best practices.

**Quick Stats:**
- **3 configs** - Global, Debugging, OpenRA2-Rust
- **21 commands** - 100% documentation coverage
- **Interactive setup** - `claude-setup` command for easy installation
- **Comprehensive tests** - Functional coverage with isolated environments

Read the complete overview: [docs/guides/overview.md](docs/guides/overview.md)

## Available Configs

| Config | Use Case | Description |
|--------|----------|-------------|
| **Global** | Cross-project commands (installed to `~/.claude`) | 21 commands, 13 agents, 2 skills, 9 rules |
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

**GitHub Actions:** Runs on every push and PR to `main`.

| Job | What it does |
|-----|-------------|
| Pre-commit Hooks | Command injection, template compliance, TDD, formatting |
| Functional Tests | All 46 test scripts in isolated environments |
| Test Coverage | Validates 100% coverage (commands, agents, skills, rules) |
| Release Validation | README/CLAUDE.md accuracy, guide coverage, counts |

Run locally:

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

- **[CLAUDE.md](CLAUDE.md)** - Project rules and policies
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development workflow and guidelines
- **[CHANGELOG.md](CHANGELOG.md)** - Version history
- **[docs/guides/overview.md](docs/guides/overview.md)** - Complete overview
- **[docs/documentation-guidelines.md](docs/documentation-guidelines.md)** - Writing standards
- **[docs/testing/testing-guide.md](docs/testing/testing-guide.md)** - Testing guide
- **[docs/security/](docs/security/)** - Security documentation
- **[docs/templates/](docs/templates/)** - Templates for new configs and commands

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full development workflow, including:

- Adding new commands, agents, and configs
- Commit message format and scopes
- Pre-commit hook setup
- Testing requirements (TDD, 100% coverage)
- Release process
