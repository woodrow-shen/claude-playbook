# Claude Playbook - Complete Overview

This document provides a comprehensive overview of the Claude Playbook repository structure, available configurations, and setup options.

## Directory Structure

```
claude-playbook/
├── configs/                # Project-specific Claude Code configurations
│   ├── global/             # Global configs (shared across all projects)
│   ├── debugging/          # Kernel debugging and low-level analysis
│   └── openra2-rust/       # OpenRA2 Rust project config
│       ├── .claude/        # Each contains a .claude/ directory with:
│       │                   #   - commands/  (command definitions)
│       │                   #   - agents/    (agent definitions)
│       │                   #   - skills/    (skill definitions)
│       │                   #   - rules/     (rules and guidelines)
│       ├── docs/           # Config-specific documentation (optional)
│       └── CLAUDE.md       # Config overview (optional)
│
├── scripts/                # Automation scripts
│   ├── setup/              # Setup, uninstall, and recovery scripts (8 scripts)
│   │   ├── setup-global-claude.sh        # Global config setup
│   │   ├── setup-claude-submodule.sh     # Submodule mode setup
│   │   ├── setup-claude-merge.sh         # Merge mode setup
│   │   ├── setup-claude-local-clone.sh   # Local clone mode setup
│   │   ├── sparse-checkout-helper.sh     # Sparse checkout support
│   │   ├── recover-config.sh             # Configuration recovery
│   │   ├── uninstall-claude.sh           # Uninstall project config
│   │   └── uninstall-global-claude.sh    # Uninstall global config
│   ├── hooks/              # Pre-commit hook scripts (7 scripts)
│   ├── release/            # Release automation (validate, prepare)
│   └── helpers/            # Utility scripts
│
├── docs/                   # Documentation
│   ├── guides/             # User guides and overview
│   ├── security/           # Security documentation (5 docs)
│   ├── templates/          # Templates for new configs and commands
│   └── testing/            # Test strategy documentation
│
├── tests/                  # Test scripts (45 files)
│   ├── func/               # Functional tests (44 scripts)
│   │   ├── helpers/        # Shared test helpers
│   │   ├── test-setup-*.sh # Setup script tests
│   │   ├── test-uninstall.sh
│   │   ├── test-lifecycle.sh
│   │   ├── test-*-deep.sh  # Command/agent structure validation
│   │   └── test-agents-*.sh
│   └── scripts/            # Coverage validation
│
├── setup.sh                # Interactive setup script (claude-setup command)
├── CLAUDE.md               # AI instructions and project overview
├── CHANGELOG.md            # Version history
└── .pre-commit-config.yaml # Pre-commit hook configuration
```

## Config Structure

Each config follows a standard directory structure:

```
configs/<config-name>/
├── .claude/           # Required: Claude Code configuration
│   ├── commands/      # Command definitions (.md files)
│   ├── skills/        # Skill definitions (SKILL.md files in subdirs)
│   ├── agents/        # Agent definitions (.md files)
│   └── rules/         # Behavioral rules (.md files)
├── docs/              # Optional: Config-specific documentation
└── CLAUDE.md          # Optional: Config overview
```

**Notes:**
- `.claude/` directory is required and contains all functional definitions
- `docs/` directory is optional but recommended for configs with multiple commands
- `CLAUDE.md` is optional but recommended for configs with 4+ commands
- Command guides follow [documentation guidelines](../documentation-guidelines.md)

## Available Configs

### Global Config (`global/`)

**Use Case:** Cross-project commands and workflows available everywhere (installed to `~/.claude`)

**Key Features:**
- 20 commands (12 general + 8 `/cp:*` namespace)
- 13 agents (10 general-purpose + 3 specialized)
- 2 skills (input validation, tmux session management)
- 9 rules (security, TDD, documentation, contribution, config docs)
- `/cp:*` namespace for playbook self-management
- Tmux-based multi-session agent dispatch

---

### Debugging Config (`debugging/`)

**Use Case:** Kernel debugging, coredump analysis, and low-level debugging tools

**Status:** Skeleton config - structure created, commands to be added.

**Planned Features:**
- Kernel debugging workflows
- Coredump analysis commands
- GDB automation
- OpenOCD integration

---

### OpenRA2-Rust Config (`openra2-rust/`)

**Use Case:** OpenRA2 Rust project development

**Key Features:**
- Git workflow rules (commit message conventions)
- Project-specific development guidelines

---

## Setup Scripts Overview

### How Config Files Are Installed

All setup scripts create **symlinks**, not copies. This means:
- No file duplication - config files remain in claude-playbook
- Always up-to-date - changes in claude-playbook are immediately reflected
- Easy updates - just `git pull` in claude-playbook
- Space efficient - only one copy of files exists

### Script Descriptions

#### `setup-global-claude.sh`
Creates symlinks from `~/.claude` to `configs/global/.claude`.

```
~/.claude/commands/commit.md -> /path/to/claude-playbook/configs/global/.claude/commands/commit.md
~/.claude/agents/monitor.md  -> /path/to/claude-playbook/configs/global/.claude/agents/monitor.md
```

- Installs to `~/.claude` (global, available in all repositories)
- Handles: rules, commands, skills, agents, CLAUDE.md
- Idempotent - safe to re-run
- Preserves native (non-symlinked) files

#### `setup-claude-submodule.sh`
Creates a single symlink from `.claude` to the submodule config (REPLACE mode).

```
.claude -> claude-playbook/configs/debugging/.claude
```

- REPLACE mode - simple symlink to entire config directory
- Adds claude-playbook as git submodule
- Supports sparse checkout (`--no-sparse` to disable)
- Creates CLAUDE.md symlink

#### `setup-claude-merge.sh`
Creates selective symlinks for each file (MERGE mode).

```
.claude/commands/debug-cmd.md -> ../claude-playbook/configs/debugging/.claude/commands/debug-cmd.md
.claude/rules/debug-rule.md   -> ../claude-playbook/configs/debugging/.claude/rules/debug-rule.md
```

- MERGE mode - creates symlinks for each shared file
- Native files take precedence over shared files
- Best for projects with existing `.claude/` directory

#### `setup-claude-local-clone.sh`
Clones claude-playbook locally and creates symlink (gitignored).

```
.claude-playbook/             # Local clone (gitignored)
.claude -> .claude-playbook/configs/debugging/.claude
```

- Clones to `.claude-playbook/` (added to `.gitignore`)
- No submodule complexity
- Supports sparse checkout
- `/cp:pull` and `/cp:push` still work

#### `recover-config.sh`
Repairs broken configurations.

- Fixes broken symlinks (.claude, CLAUDE.md, individual files)
- Auto-detects installation mode (REPLACE, MERGE, local-clone, submodule)
- Non-destructive - only fixes what's broken

### Summary Table

| Script | Method | Location | Use Case |
|--------|--------|----------|----------|
| `setup-global-claude.sh` | Symlinks | `~/.claude` | Global configs (all repos) |
| `setup-claude-submodule.sh` | Single symlink | `.claude` -> submodule | New repos (REPLACE mode) |
| `setup-claude-merge.sh` | Selective symlinks | `.claude/` directory | Existing repos (MERGE mode) |
| `setup-claude-local-clone.sh` | Clone + symlink | `.claude-playbook/` | No submodule (REPLACE mode) |
| `recover-config.sh` | Repair | Existing install | Fix broken symlinks |

All scripts create **symlinks**, not copies. Config files are never duplicated.

---

## Advanced Setup (Using Scripts Directly)

### Step 0: Install Global Configs (Recommended First Step)

Install global configurations to `~/.claude` for cross-project commands:

```bash
bash /path/to/claude-playbook/scripts/setup/setup-global-claude.sh
```

This installs:
- `/cp:*` namespace commands (pull, push, fix-issue, release, etc.)
- `/tmux` and `/monitor-tmux` for multi-session debugging
- Tmux session management skill
- All 13 agents
- Git workflow rules and documentation guidelines

Only needs to be done **once per user**.

### Step 1: Setup Project-Specific Config

#### Option A: Submodule (REPLACE mode)
```bash
cd /path/to/your-repo
bash /path/to/claude-playbook/scripts/setup/setup-claude-submodule.sh debugging .
git add .gitmodules .claude CLAUDE.md
git commit -s -m "add claude-playbook configuration"
```

#### Option B: Submodule (MERGE mode)
```bash
cd /path/to/your-repo
bash /path/to/claude-playbook/scripts/setup/setup-claude-merge.sh debugging .
git add .gitmodules .claude CLAUDE.md
git commit -s -m "add claude-playbook configuration (merge mode)"
```

#### Option C: Local Clone (no submodule)
```bash
cd /path/to/your-repo
bash /path/to/claude-playbook/scripts/setup/setup-claude-local-clone.sh debugging .
git add .gitignore
git commit -s -m "add gitignore for claude-playbook"
```

### Uninstall

```bash
# Uninstall from project
bash /path/to/claude-playbook/scripts/setup/uninstall-claude.sh /path/to/repo

# Uninstall global config
bash /path/to/claude-playbook/scripts/setup/uninstall-global-claude.sh
```

---

## CI/CD Status

### Pre-commit Hooks (Active)

Pre-commit hooks are active and enforced for all commits:

```bash
# Install pre-commit hooks
pip install pre-commit
bash scripts/hooks/install-hooks.sh

# Run manually
pre-commit run --all-files
```

**Hooks enforce:**
- Command injection scanning
- Commit message format validation
- Template compliance checking
- TDD enforcement
- No submodule staging

### Testing

All quality checks run locally:

```bash
# Run all functional tests
for test in tests/func/test-*.sh; do bash "$test"; done

# Run release validation
bash scripts/release/validate.sh

# Validate 100% test coverage
bash tests/scripts/validate-100-percent-coverage.sh
```

---

## Version Format

Claude Playbook uses semantic versioning with optional stage prefixes:

```
<major>.<minor>.<patch>[-<stage>.<n>]
```

- **major** - Breaking changes (config structure, script interface changes)
- **minor** - New features (new commands, agents, configs)
- **patch** - Bug fixes, documentation updates
- **stage** - Optional: `alpha`, `beta`, `rc` (e.g., `1.0.0-alpha.1`)

Examples: `0.1.0`, `1.0.0-beta.1`, `1.2.3`
