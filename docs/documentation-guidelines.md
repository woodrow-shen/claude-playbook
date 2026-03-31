# Documentation Guidelines

**For Contributors**: This guide provides detailed guidelines and examples for writing documentation in the Claude Playbook workspace.

---

## Table of Contents

- [Overview](#overview)
- [File Types and Their Purpose](#file-types-and-their-purpose)
- [Core Principles](#core-principles)
- [Commands Writing Guide](#commands-writing-guide)
- [Agents Writing Guide](#agents-writing-guide)
- [Skills Writing Guide](#skills-writing-guide)
- [Rules Writing Guide](#rules-writing-guide)
- [Testing Considerations](#testing-considerations)
- [Quick Reference](#quick-reference)

---

## Overview

The Claude Playbook workspace has two types of documentation:

**1. Execution Files** (for AI agents):
- `.claude/commands/*.md` - User-facing commands
- `.claude/agents/*.md` - Specialized agent behaviors
- `.claude/skills/*.md` - Reusable domain knowledge
- `.claude/rules/*.md` - Policy enforcement

**2. Documentation Files** (for humans):
- `docs/*.md` - Guides, tutorials, references
- `CLAUDE.md` - Config overview and instructions
- `README.md` - Project overview

**This guide focuses on both**, providing examples that tests cannot validate.

---

## File Types and Their Purpose

### Commands (`configs/*/.claude/commands/*.md`)

**Purpose**: Instruct the AI agent on what to do when the user invokes `/command-name`.

**When to create:**
- Users need a workflow entry point
- Multi-step process needs orchestration
- Repeatable task worth codifying

**When NOT to create:**
- One-step operation (just tell the AI directly)
- Internal automation only
- Documentation only

**Structure:**
- Plain text instructions (no YAML front matter needed)
- Parameter parsing from `$ARGUMENTS`
- Step-by-step execution flow
- Error handling guidance

### Agents (`configs/*/.claude/agents/*.md`)

**Purpose**: Define specialized agent behaviors and capabilities.

**When to create:**
- Complex multi-step execution
- Specialized role (QA, DevOps, Architect, etc.)
- Domain-specific expertise needed

**When NOT to create:**
- Simple one-liner execution
- Just parameter collection
- Documentation only

**Structure:**
- Role description
- Capabilities and constraints
- Execution behavior
- Error handling approach

### Skills (`configs/*/.claude/skills/*.md`)

**Purpose**: Reusable domain knowledge and procedural expertise.

**When to create:**
- Workflow reused across commands or agents
- Step-by-step procedure worth codifying
- Domain expertise to capture
- Best practices to standardize

**When NOT to create:**
- One-time operation
- No clear procedure
- Just parameter collection

**Structure:**
- Use cases
- Prerequisites
- Workflow (step-by-step)
- Troubleshooting

### Rules (`configs/*/.claude/rules/*.md`)

**Purpose**: Policy enforcement and behavioral constraints.

**When to create:**
- Consistent behavior needed
- Safety/security requirements
- Workflow decisions
- Cross-repository policies

**When NOT to create:**
- One-time instruction
- Procedural knowledge (use command)
- Implementation detail (use agent)

**Structure:**
- Purpose (rationale)
- Scope (which configs/agents)
- Rules (MUST/MUST NOT/SHOULD)
- Examples (correct/wrong)
- Enforcement method

---

## Core Principles

### For Execution Files (Commands, Agents, Rules)

**Clean**: No emoji, no box-drawing, plain text only.

**Clear**: Simple language, hierarchical structure.

**Concise**: Remove redundancy, focus on essentials.

**Consistent**: Follow existing file style, use standard markdown.

**Precise**: Exact steps for bash/python, minimize LLM errors.

**Efficient**: Reduce token consumption, avoid verbosity.

### For Documentation Files (`docs/*.md`)

**Clean**: Clean markdown, no excessive styling.

**Clear**: Clear headings, helpful examples.

**Concise**: Use tables for structured information.

**Consistent**: Follow existing documentation style.

**Consolidate**: Add to existing files before creating new ones.

---

## Commands Writing Guide

### Design Principles

1. **Clear Instructions** - The AI reads this and executes it directly
2. **User-Centric Naming** - Domain language (not technical jargon)
3. **Input Validation** - Parse and validate `$ARGUMENTS`
4. **Step-by-Step Flow** - Logical execution order

### Structure Example

```markdown
Run FPGA Linux tests on the specified platform.

Parse $ARGUMENTS: first word is platform (vcu118 or haps100), second word is branch.

## Step 1: Validate Parameters

Validate the platform is one of: vcu118, haps100.
Validate the branch name matches: ^[a-zA-Z0-9._/-]+$
If no branch specified, use the current branch.

## Step 2: Allocate Resources

Request a SLURM allocation on the FPGA partition.
Set up a cleanup trap to release resources on exit.

## Step 3: Execute Tests

Run the test suite on the allocated FPGA.
Monitor progress and capture output.

## Step 4: Report Results

Summarize pass/fail counts.
If failures, show error details.
Clean up allocated resources.
```

### What Tests Cannot Validate

- Parameter order makes logical sense
- Defaults are appropriate for the workflow
- Error handling is complete for all failure modes
- Security validations are sufficient

**Document rationale in the command itself** for critical decisions.

---

## Agents Writing Guide

### Design Principles

1. **Specialized Role** - Each agent has a clear domain
2. **Safety First** - Validate inputs, handle errors
3. **Precise Instructions** - No ambiguity, exact behavior
4. **Self-Contained** - All context within the agent file

### Structure Example

```markdown
# Code Quality Debugger

You are a specialized debugging agent focused on code quality
and bug resolution.

## Capabilities

- Root cause analysis of bugs
- Code quality assessment
- Performance profiling guidance
- Test coverage analysis

## Behavior

When asked to debug:
1. Reproduce the issue first
2. Identify root cause before suggesting fixes
3. Propose minimal, targeted fixes
4. Verify the fix doesn't introduce regressions
5. Update tests to cover the bug

## Constraints

- Never modify code without understanding the bug first
- Always run existing tests before and after changes
- Prefer targeted fixes over broad refactors
```

### What Tests Cannot Validate

- Agent behavior is appropriate for the role
- Constraints are sufficient for safety
- Domain knowledge is accurate

**Document rationale in the agent** for critical decisions.

---

## Skills Writing Guide

### Design Principles

1. **Reusability** - Generic for multiple contexts, parameterized
2. **Step-by-Step Clarity** - Each step atomic and clear
3. **Self-Contained** - All prerequisites listed, no hidden dependencies
4. **Domain-Focused** - Use domain language, capture expert knowledge

### Structure Example

```markdown
# FPGA Baremetal Validation

Step-by-step workflow to validate FPGA baremetal test results.

## Use Cases

- Post-test result verification
- Failure analysis
- Test report validation

## Prerequisites

- Access to CI system
- Target platform available
- Test framework knowledge

## Workflow

### Step 1: Verify Job Completion

Check that the CI job finished with SUCCESS or UNSTABLE status.
Incomplete jobs produce unreliable results.

### Step 2: Locate Test Report

Navigate to job artifacts, find the test report.
If 404: job failed before generating report — check console output.
If empty: test framework didn't start — verify environment setup.

### Step 3: Analyze Results

Review test suite execution:
- Total tests run
- Pass/fail count
- Error messages and patterns

100% failure usually means environment issue.
Specific test failure means test-specific issue.
```

### What Tests Cannot Validate

- Workflow steps are in logical order (requires domain knowledge)
- Prerequisites are complete (experience-based)
- Troubleshooting is comprehensive (learned from failures)
- Domain knowledge is accurate (expert review needed)

**Document rationale in the skill** for non-obvious steps.

---

## Rules Writing Guide

### Design Principles

1. **Directive Language** - MUST/MUST NOT/SHOULD (not "would be nice")
2. **Enforceable Constraints** - Clear success/failure criteria
3. **Agent-Executable** - Actionable by LLM, no ambiguity
4. **No Duplication** - Check existing rules first

### Good vs Bad Examples

**Bad: Too Vague**
```markdown
# Good Code Rule

Write code that is good and doesn't have bugs.
```

Why bad: No criteria, untestable, not actionable.

**Good: Clear and Enforceable**
```markdown
# Input Validation Rule

## Purpose

Commands generate shell scripts that execute on real systems.
Unvalidated inputs can lead to command injection or resource leaks.

## Scope

Applies to: all `.claude/commands/*.md`

## Rules

### Rule 1: Validate Branch Names

**MUST** validate branch names match pattern: `^[a-zA-Z0-9._/-]+$`

**Rationale**: Prevents command injection via branch names.

**Examples**:
- CORRECT: `dev/feature-123`
- WRONG: `dev/feature; rm -rf /`

**Enforcement**: Check with regex before using in shell commands.

### Rule 2: Quote All Variables

**MUST** use `"$VAR"` not `$VAR` in all shell commands.

**Rationale**: Prevents word splitting and glob expansion attacks.

**Enforcement**: Security scanner checks for unquoted variables.
```

### What Tests Cannot Validate

- Semantic clarity of directives
- Completeness of rationale
- Appropriateness of scope
- Agent's ability to interpret correctly

**Document WHY, not just WHAT** in the rule.

---

## Testing Considerations

### What Automated Tests CAN Validate

**Structure:**
- File exists and is non-empty
- File naming conventions
- No duplicate names
- Cross-references exist

**Security:**
- No dangerous patterns without safety comments
- Security compliance score

### What Tests CANNOT Validate (Documentation Required)

**Semantic:**
- Steps are in logical order
- Defaults are appropriate
- Error handling is complete
- Security validations are sufficient
- Domain knowledge is accurate

**Judgment:**
- User experience is smooth
- Rationale is sound
- Scope is appropriate
- Examples are representative

**Therefore**: Document rationale, context, and "why" in the file itself.

---

## Quick Reference

### File Naming

- Commands: `command-name.md` (kebab-case)
- Agents: `agent-name.md` (kebab-case)
- Skills: `skill-name.md` (kebab-case)
- Rules: `rule-name.md` (kebab-case)

### Style Rules

**Execution Files** (`.claude/*.md`):
- No emoji
- No box-drawing
- Plain text only
- Code examples OK

**Documentation Files** (`docs/*.md`):
- Tables OK
- Examples encouraged
- Clean markdown, no excessive styling

### Anti-Sprawl Rule

Before creating a new file:
1. Search for existing files on the same topic
2. Prefer adding to an existing file
3. Only create new file if content is truly distinct (>500 lines)

### When in Doubt

1. Check existing files in same category
2. Follow their structure and style
3. Document your rationale
4. Ask for review

---

## See Also

- `docs/templates/secure-command-template.md` - Secure command template
- `docs/security/SECURITY-CHECKLIST.md` - Security checklist
- `docs/templates/new-config-template.md` - New config template
