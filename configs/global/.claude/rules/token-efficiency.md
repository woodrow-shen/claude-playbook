---
name: token-efficiency
description: Token efficiency rules - maximize value per token spent
---

# Token Efficiency Strategy

AI coding assistants have daily/weekly token limits. Every interaction costs tokens. Follow these rules to maximize value per token.

## Core Principle

**Do the right thing, do it once.**

Top 3 token waste sources:
1. Work rejected (didn't align first)
2. Searching too long (unfocused exploration)
3. Redundant read/write (not trusting your own operations)

## Rules

### Before Starting

- **Complex tasks: align first** — Discuss approach before implementing. A rejected plan costs 500 tokens; a rejected implementation costs 5000.
- **Ask instead of guess** — If requirements are unclear, ask. Don't guess, build, then rebuild.

### Searching

- **Targeted search first** — Use specific file/function name searches. Broad exploration is the last resort.
- **Be precise** — Search for `def calculate_price` not `price`.
- **Don't re-read** — Files read in this session that haven't changed don't need to be read again.

### Editing

- **Minimal diffs** — Only change lines that need changing. Don't rewrite entire files for a one-line fix.
- **Get it right first time** — Read, understand, edit. Not edit, check, re-edit, re-check.
- **Parallelize independent operations** — Multiple unrelated reads/edits/searches should be done simultaneously.

### Responses

- **Short and direct** — Lead with conclusion, then reasoning. One sentence beats three.
- **Don't restate** — Don't repeat what the user said. Just do it.
- **Don't over-verify** — A one-line fix you're confident about doesn't need a full file re-read.

### Resource Awareness

- **When user says quota is tight, adjust immediately**:
  - Only handle blocking issues
  - Skip exploratory work
  - More concise responses
  - Proactively suggest "this can wait until next session"
- **Warn before large tasks** — "This requires changes to 8 files, proceed?" Let user decide.

## Anti-Patterns

| Waste Pattern | Correct Approach |
|---|---|
| Broad exploration for a known file path | Read the file directly |
| Rewriting 500 lines to change 1 | Edit only the changed line |
| Re-reading entire file after a small edit | Trust the edit output |
| Implementing a large feature without alignment | Discuss approach first |
| Reading 10 files one by one | Read 10 files in parallel |
| Searching, fail, rephrase, fail, rephrase | Stop, think about strategy, or ask user |
| Starting response with "Sure, I'll help you..." | Just do it |
