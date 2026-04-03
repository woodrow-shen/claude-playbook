---
name: config-documentation
description: Rules for documenting configurations in claude-playbook
---

# Config Documentation Rules

Rules for documenting configurations in claude-playbook.

## Scope

Applies to: all directories under `configs/`.

## Rules

### Rule 1: Config Guide Required

Each config with 4+ commands **MUST** have a guide document at `docs/guides/configs/<config-name>-guide.md`.

Small configs (1-3 commands) are self-documenting and do not require a separate guide.

### Rule 2: Command Documentation Coverage

Every command file in `.claude/commands/*.md` **MUST** be documented in one of:
- The config's guide file (`docs/guides/configs/<config-name>-guide.md`)
- The config's CLAUDE.md (for smaller configs)
- A namespace-level entry (e.g., `/cp:*` commands documented as a group)

### Rule 3: Agent Documentation Coverage

Every agent file in `.claude/agents/*.md` **MUST** be listed with a one-line description in the config's guide or CLAUDE.md.

### Rule 4: Config CLAUDE.md

Each config **SHOULD** have a `CLAUDE.md` file that provides:
- Overview of the config's purpose
- List of commands with descriptions
- List of agents with descriptions (if any)
- Setup or usage notes

### Rule 5: Counts Must Match

Documentation that claims specific counts (e.g., "20 commands") **MUST** match the actual file count in the config directory. The release validation script checks this.

## Enforcement

- Pre-release: `scripts/release/validate.sh` checks guide coverage
- Manual: PR review for documentation completeness
