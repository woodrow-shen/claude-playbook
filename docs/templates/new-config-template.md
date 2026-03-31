# Template for Adding New Project Config

This template helps you add a new project-specific configuration to claude-playbook.

## Quick Start

```bash
# 1. Use the setup menu
source /path/to/claude-playbook/setup.sh
claude-setup
# → Select option 7: Create New Config

# 2. Or create manually
cd /path/to/claude-playbook/configs/
mkdir -p my-project/.claude/{agents,commands,rules}
mkdir -p my-project/docs

# 3. Add your files (examples below)

# 4. Test it
source /path/to/claude-playbook/setup.sh
cd /path/to/test-repo
claude-setup
# → Select your new config → Select mode

# 5. Commit
git add configs/my-project/
git commit -s -m "claude/configs/my-project: add initial configuration"
```

## Directory Structure

Your new config should follow this structure:

```
configs/my-project/
├── CLAUDE.md           # Config overview and instructions
├── .claude/
│   ├── agents/         # Agent definitions (optional)
│   │   └── *.md
│   ├── commands/       # Command definitions (optional)
│   │   └── *.md
│   └── rules/          # Rules (optional)
│       └── *.md
└── docs/               # Supporting documentation (optional)
```

## Example Files

### CLAUDE.md Example
```markdown
# my-project Config

## Overview

Configuration for my-project.

## Commands

- `/hello` — Sample command

## Getting Started

See [Claude Playbook Documentation](../../README.md) for more information.
```

### Command Example (`.claude/commands/my-command.md`)
```markdown
Run the specified task with validation.

Parse $ARGUMENTS: first word is the target, optional second word is the mode.

## Step 1: Validate Input

Check that required parameters are provided and valid.

## Step 2: Execute

Run the validated command and report results.
```

### Agent Example (`.claude/agents/my-agent.md`)
```markdown
# My Agent

Brief description of the agent.

## Purpose
What this agent does.

## Behavior
How this agent operates.
```

### Rule Example (`.claude/rules/my-rule.md`)
```markdown
# My Rule

Brief description of the rule.

## When to apply
...

## Guidelines
...
```

## Checklist

- [ ] Created `configs/my-project/` directory
- [ ] Created `CLAUDE.md` with overview
- [ ] Added at least one file (agent, command, or rule)
- [ ] Tested with `claude-setup`
- [ ] Committed changes

## Notes

- The config name is the directory name (e.g., `my-project`)
- All subdirectories under `.claude/` are optional
- Follow existing configs (global, debugging) as examples
- Keep files in Markdown format (`.md`)
- Commands are plain text instructions — no YAML front matter needed

## See Also

- [global/.claude/](../../configs/global/.claude/) - Example config with commands and agents
- [Security Checklist](../security/SECURITY-CHECKLIST.md) - Security best practices
