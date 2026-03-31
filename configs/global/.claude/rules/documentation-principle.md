---
name: documentation-principle
description: Core documentation standards for all file types in this workspace
---

# Documentation Principle

Core documentation standards for all file types in this workspace.

## Scope

Applies to: all `.claude/commands/*.md`, `.claude/agents/*.md`, `.claude/skills/*.md`, `.claude/rules/*.md`

## Rules

### Rule 1: Clean Format

**MUST** use plain text only in execution files. No emoji, no box-drawing characters.

**Rationale**: Execution files are consumed by AI agents. Visual decorations waste tokens and add no value.

### Rule 2: Precise Instructions

**MUST** provide exact steps for bash/python execution. Minimize ambiguity to reduce LLM errors.

**Rationale**: Vague instructions lead to hallucinated commands and incorrect execution.

### Rule 3: Input Validation

**MUST** validate all user input from `$ARGUMENTS` before use in shell commands.

**Rationale**: Command files are executable code. Unvalidated input enables command injection.

### Rule 4: Self-Contained

**MUST** include all necessary context within the file. No hidden dependencies or assumptions.

**Rationale**: AI agents cannot infer missing context. Incomplete files produce incomplete execution.

### Rule 5: Anti-Sprawl

**SHOULD** add content to existing files before creating new ones. Only create a new file if content is truly distinct.

**Rationale**: File sprawl increases maintenance burden and creates inconsistency.

### Rule 6: Document Rationale

**SHOULD** document WHY, not just WHAT, for non-obvious decisions and security choices.

**Rationale**: Tests cannot validate semantic correctness. Rationale enables human review.

## Enforcement

- Automated: pre-commit hooks check structure, security patterns, and compliance score
- Manual: PR review for semantic clarity, domain accuracy, and rationale completeness
