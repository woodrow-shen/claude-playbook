# Claude Playbook

Centralized AI assistant configuration hub for Claude Code.

One repo. Shared commands, agents, skills, and rules across multiple projects.

## Quick Start

```bash
# 1. Clone
git clone git@github.com:user/claude-playbook.git

# 2. Source setup and configure any repo
source claude-playbook/setup.sh
cd ~/your-repo
claude-setup
```

## What's Inside

- **19 commands** — Bug triage, TDD, PR review, release management, tmux dispatch
- **13 agents** — 10 general-purpose roles + monitor, release, tmux
- **2 skills** — Input validation, tmux session management
- **6 rules** — Token efficiency, TDD, security, documentation standards

## Structure

```
configs/
├── global/              # 19 commands, 13 agents, 2 skills, 6 rules
└── debugging/           # Kernel debug, OpenOCD, coredump (skeleton)
```

## Setup Modes

| Mode | Description | Best For |
|------|-------------|----------|
| REPLACE | Entire `.claude/` symlinked to upstream | New projects, experiments |
| MERGE | Individual symlinks, local files take priority | Mature projects needing local commands |

## Setup Scripts

| Script | Purpose |
|--------|---------|
| `setup-global-claude.sh` | Install global config to `~/.claude/` |
| `setup-claude-merge.sh` | Install project config (merge mode) |
| `setup-claude-submodule.sh` | Git submodule + merge mode |
| `uninstall-claude.sh` | Remove project symlinks |
| `uninstall-global-claude.sh` | Remove global symlinks |

## Engineering Practices

- **TDD Enforcement** — Pre-commit hooks block code without tests
- **Security Scanning** — Command injection detection, template compliance scoring
- **Documentation Standards** — Automated validation, anti-sprawl rules
- **Token Efficiency** — Rules to maximize AI assistant value per token

## See Also

- `configs/global/CLAUDE.md` — Full command, agent, skill, and rule listing
- `docs/testing/tdd-enforcement-summary.md` — TDD methodology
- `docs/security/` — Security guides and checklists
- `docs/documentation-guidelines.md` — Documentation standards
