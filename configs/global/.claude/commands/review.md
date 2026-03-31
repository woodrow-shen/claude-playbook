---
name: review
description: "Enter plan mode to review and discuss feature design"
argument-hint: "[area]"
---

# Claude Code User Command: Review

Product requirement review and discussion command. Enter plan mode to collaborate with the user on feature design, UX decisions, and implementation strategy.

## Usage

```
/review <feature or area to discuss>
```

`$ARGUMENTS` contains the feature, page, or area the user wants to review and discuss.

## What This Command Does

1. Enter plan mode immediately.
2. Explore the current codebase for the area described in `$ARGUMENTS`.
3. Provide insights on the current state: what exists, what's missing, what could be improved.
4. Collaborate with the user on product requirements and design decisions.
5. Finalize the plan and update `docs/PRD.md` before exiting plan mode.

## Instructions

### Step 1: Enter Plan Mode

- Call `EnterPlanMode` immediately. No pre-work outside of plan mode.

### Step 2: Explore Current State

- Read ALL `docs/*.md` files (`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_STATUS.md`) for existing design context, current status, and known issues.
- Read the relevant source files for the area in `$ARGUMENTS`.
- Summarize the current state to the user:
  - What's implemented
  - What's stubbed or incomplete
  - What's missing entirely
  - Relevant items from `docs/PROJECT_STATUS.md` backlog and known issues

### Step 3: Provide Insights

- Identify UX issues, edge cases, or architectural concerns.
- Suggest improvements based on the project's target audience (Taiwanese travelers, TWD currency, Asia-Pacific focus).
- Reference industry best practices where relevant.
- Present options with trade-offs — let the user decide.

### Step 4: Discuss with the User

- Use `AskUserQuestion` to clarify requirements and preferences.
- Iterate on the design based on user feedback.
- Do NOT finalize unilaterally — this is a collaborative discussion.

### Step 5: Finalize Plan & Update Docs

Before exiting plan mode, update ALL relevant `docs/*.md` files:

1. **`docs/PRD.md`** — Add/update requirements, roadmap items, acceptance criteria for the agreed plan.
2. **`docs/ARCHITECTURE.md`** — Add/update architectural decisions, new components, or data flow changes if the plan involves them.
3. **`docs/PROJECT_STATUS.md`** — Move relevant backlog items to in-progress, add new checklist items for the planned work.
4. Write the agreed-upon plan to the plan file.
5. Exit plan mode with `ExitPlanMode`.

### After Plan Mode

- Once approved, follow the Checkpoint Validation process in CLAUDE.md after implementation:
  1. Code matches the plan
  2. `docs/PRD.md` and `docs/ARCHITECTURE.md` are in sync
  3. `docs/PROJECT_STATUS.md` checklists updated (items checked, known issues resolved)
  4. Tests cover the changes
  5. Lint passes
