---
name: file-creation
description: Rules for creating new files in the workspace
---

# File Creation Rules

## CRITICAL: Before Creating Any .md File

**ALWAYS read `documentation-guidelines.md` first.**

Location: `docs/documentation-guidelines.md`

## Quick Checklist

Before creating a new `.md` file, verify:

1. **File Type Identification**
   - [ ] Is this a command, agent, skill, rule, or documentation file?
   - [ ] Which directory should it go in? (`.claude/` vs `docs/`)

2. **Visual Elements**
   - [ ] For `.claude/*.md`: NO emojis, use text prefixes (OK:, ERROR:, etc.)
   - [ ] For `docs/*.md`: Clean markdown, no excessive styling
   - [ ] NO box-drawing characters in ANY file

3. **Anti-Sprawl**
   - [ ] Searched for existing files on the same topic
   - [ ] Prefer adding to an existing file over creating a new one
   - [ ] Only create new file if content is truly distinct

4. **Content Standards**
   - [ ] Followed the appropriate style guide from `documentation-guidelines.md`
   - [ ] Plain text instructions for execution files
   - [ ] Self-contained with no hidden dependencies

## File Type Quick Reference

| File Type | Location | Emojis | Audience |
|-----------|----------|--------|----------|
| Command | `.claude/commands/` | NO | LLM |
| Agent | `.claude/agents/` | NO | LLM |
| Skill | `.claude/skills/` | NO | LLM |
| Rule | `.claude/rules/` | NO | LLM |
| Documentation | `docs/` | OK | Human |

## Common Mistakes to Avoid

1. WRONG: Using emojis in `.claude/*.md` files
2. WRONG: Using box-drawing characters anywhere
3. WRONG: Adding prefixes (OK:, ERROR:) to section headings
4. WRONG: Creating new docs instead of consolidating into existing files

## When in Doubt

**Read the full guidelines**: `docs/documentation-guidelines.md`
