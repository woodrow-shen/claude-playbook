---
name: claude-playbook-contribution
description: Rules for contributing changes to claude-playbook repository
---

# Claude Playbook Contribution Guidelines

Rules for contributing changes to the claude-playbook repository from other repositories that use it as a submodule.

## Protected Files and Directories

### WARNING: `.claude/` Directory Protection

**The `.claude/` folder MUST NOT be changed or deleted by anyone.**

This directory contains critical configuration files for AI assistants:
- `.claude/commands/` - Slash command definitions
- `.claude/agents/` - Agent definitions
- `.claude/skills/` - Skill definitions
- `.claude/rules/` - Always-on rules

**Rules:**
1. **DO NOT** delete the `.claude/` directory or any files within it
2. **DO NOT** modify existing files without explicit approval from the repository owner
3. **DO NOT** reset or revert commits that would remove this directory
4. When resetting git history, always preserve the `.claude/` folder
5. The `.claude/` folder may be listed in `.gitignore` if it does NOT exist in the remote branch — it is local configuration only

**For AI Assistants:**
- When performing `git reset`, `git revert`, or `git checkout`, always check if `.claude/` exists before and after
- If `.claude/` is accidentally removed, restore it immediately
- Never include `.claude/` changes in commits to other repositories

---

## Commit Message Format

### IMPORTANT NOTE

**These commit message format rules are ONLY for the `claude-playbook` repository.**

**For other repositories:**
- First, check if the repository has its own `.claude/rules/git-workflow.md`
- If it exists, follow the commit message rules defined there
- If not, check the repository's `CONTRIBUTING.md` or similar documentation
- Each repository may have its own commit message conventions

**Priority order for commit message rules:**
1. Repository-specific `.claude/rules/git-workflow.md` (highest priority)
2. Repository's `CONTRIBUTING.md` (if exists)
3. General best practices (lowercase, imperative mood, sign-off, etc.)

---

### Basic Format

```
<scope>: <short description>

<detailed body explaining what and why>

Signed-off-by: Your Name <your.email@example.com>
```

### Scope Prefix (claude-playbook specific)

- `claude/configs/<config>:` — Changes to specific config (global, debugging, etc.)
- `claude/docs:` — Changes to documentation in `docs/` directory
- `claude/scripts:` — Changes to scripts in `scripts/` directory
- `claude:` — Changes to root-level files (README.md, CHANGELOG.md, etc.)

**Examples:**
```bash
claude/configs/global: add tmux session management skill
claude/configs/debugging: update debug workflow agent
claude/docs: update pre-commit validation strategy
claude/scripts: fix symlink handling in merge mode
claude: update README with new command list
```

### Short Description

- Use lowercase (except for proper nouns)
- No period at the end
- Imperative mood ("add" not "added" or "adds")
- Maximum 50-72 characters
- Be specific and concise

### Detailed Body

- Explain **what** changed and **why**
- Use proper grammar and punctuation
- Wrap lines at 72 characters (recommended)
- Separate from subject with blank line

### Signed-off-by

Always use `git commit -s` to automatically add the Signed-off-by line.

### Repository-Specific Rules

The `claude/*` scope prefixes are reserved exclusively for commits to the claude-playbook repository itself.

**For other repositories:**
- Follow the repository's own commit message conventions
- Use the repository's specific scope prefixes
- **Do NOT use `claude/*` scope prefixes in other repositories**
