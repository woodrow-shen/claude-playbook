---
name: config-documentation
description: Rules for documenting configurations in claude-playbook
---

# Config Documentation Rules

Rules for documenting configurations in claude-playbook.

## Scope

Applies to: all directories under `configs/`.

## Rules

### Rule 1: Per-Command Guide Required

Every command **MUST** have a guide file at `configs/<config>/docs/<cmd>-guide.md`.

Namespace commands (e.g., `/cp:*`) share one guide file (e.g., `configs/global/docs/cp-guide.md`).

### Rule 2: Agent Documentation Coverage

Every agent file in `.claude/agents/*.md` **MUST** be listed with a one-line description in the config's CLAUDE.md.

### Rule 3: Config CLAUDE.md

Each config **SHOULD** have a `CLAUDE.md` file that provides:
- Overview of the config's purpose
- List of commands with descriptions
- List of agents with descriptions (if any)
- Setup or usage notes

### Rule 4: Counts Must Match

Documentation that claims specific counts (e.g., "20 commands") **MUST** match the actual file count in the config directory. The release validation script checks this.

## Enforcement

- Pre-release: `scripts/release/validate.sh` checks guide coverage
- Manual: PR review for documentation completeness
