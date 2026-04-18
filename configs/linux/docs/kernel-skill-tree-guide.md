# Kernel Skill Tree Guide

How to create new SKILL.md files for the gamified Linux kernel learning system.

## Current Statistics

| Metric | Value |
|--------|-------|
| Skills | 57 |
| Realms | 12 |
| Animation modules | 61 |
| Animated skills | 57/57 (100%) |
| Tests | 2,676 |
| Total XP | 12,400 |
| Difficulty split | 11 beginner, 29 intermediate, 17 advanced |

## Skill File Location

Each skill is a directory containing a single SKILL.md file:

```
configs/linux/.claude/skills/<skill-name>/SKILL.md
```

Use kebab-case for directory names (e.g., `page-allocation`, `vfs-layer`).

## SKILL.md Format

### Required Frontmatter

```yaml
---
name: <skill-name>
description: <one-line description, max 80 chars>
realm: <realm-id>
category: <category within realm>
difficulty: <beginner|intermediate|advanced>
xp: <integer, 100-500>
estimated_minutes: <integer>
prerequisites:
  - <skill-name>
unlocks:
  - <skill-name>
kernel_files:
  - <path relative to kernel root>
doc_files:
  - <path relative to kernel root>
badge: <badge name, 2-3 words>
tags:
  - <tag>
---
```

### Realm IDs

| Realm | ID | Skill Count | Subsystems |
|-------|----|-------------|-----------|
| The Foundations | foundations | 6 | kernel/core, init/ |
| The Scheduler's Domain | scheduler | 5 | kernel/sched/ |
| Memory Arcana | memory | 7 | mm/ |
| The Filesystem Labyrinth | filesystem | 5 | fs/ |
| The Network Forge | network | 5 | net/ |
| Concurrency Citadel | concurrency | 5 | kernel/locking/ |
| Device Mastery | devices | 5 | drivers/ |
| Security Fortress | security | 4 | security/ |
| Event Horizon | events | 4 | fs/eventpoll.c, io_uring/, kernel/time/ |
| Containers and Isolation | containers | 4 | kernel/cgroup/, kernel/nsproxy.c |
| Tracing and Observability | tracing | 4 | kernel/trace/, kernel/bpf/ |
| Virtualization Vault | virtualization | 3 | virt/kvm/, arch/x86/kvm/ |

### XP Guidelines

| Difficulty | XP Range | Estimated Time |
|-----------|----------|---------------|
| Beginner | 100-150 | 45-90 min |
| Intermediate | 150-250 | 60-120 min |
| Advanced | 200-500 | 90-180 min |

### Required Content Sections

1. **Learning Objectives** -- 3-5 bullet points of what the learner will achieve
2. **Core Concepts** -- Detailed explanations referencing actual kernel source files
3. **Code Walkthrough** -- Step-by-step trace through real kernel code paths
4. **Hands-On Challenges** -- 2-3 practical exercises with XP values
5. **Verification Criteria** -- Checkbox list of mastery indicators

## Content Rules

These rules come from the claude-playbook documentation-principle:

1. **Plain text only** -- No emoji, no box-drawing characters
2. **Reference real code** -- Point to actual kernel source files and functions
3. **Self-contained** -- Include all context needed to understand the skill
4. **Accurate** -- Verify function names, file paths, and line numbers against current kernel source
5. **Educational** -- Write like an RPG quest briefing, not a dry textbook

## Animation Module Requirements

Every skill must have a corresponding animation module in the web UI. Each module:

- Lives in `configs/linux/web/src/animation/modules/<module-id>.ts`
- Has a test file at `configs/linux/web/src/animation/modules/<module-id>.test.ts`
- Must be registered in `configs/linux/web/src/animation/registry.ts`
- Implements the `AnimationModule` interface from `configs/linux/web/src/animation/types.ts`

### Animation Module Structure

```typescript
export interface YourState {
  phase: string;
  // ... skill-specific state fields
  srcRef: string;  // REQUIRED: real kernel source file:line
}

const module: AnimationModule = {
  config: { id: 'module-id', skillName: 'skill-name', title: 'Title' },
  generateFrames(scenario?: string): AnimationFrame[],
  renderFrame(container: SVGGElement, frame: AnimationFrame, w: number, h: number): void,
  getScenarios(): AnimationScenario[],
};
```

### Animation Rules

- 3 scenarios per module, 8-12 frames each
- Every frame must have a `srcRef` field pointing to a real kernel source file and line number
- Use `cloneState()` helper for immutable frame generation
- `renderFrame` must clear the container before rendering (`container.innerHTML = ''`)
- Use SVG with semantic CSS classes prefixed with `anim-` (e.g., `anim-title`, `anim-block`, `anim-highlight`)
- Follow TDD: write tests first, verify they fail, then implement
- All function names, file paths, and line numbers must come from reading the actual kernel source

## Prerequisite Graph Rules

- Prerequisites and unlocks must be bidirectionally consistent
  - If A unlocks B, then B must list A as a prerequisite
  - If B has prerequisite A, then A must list B in unlocks
- Prerequisites must reference existing skill names
- No circular dependencies (the graph must be a DAG)
- The single root is `boot-and-init` (no prerequisites)
- Beginner skills should have few prerequisites
- Advanced skills should build on intermediate ones

### Validation

Run the DAG validator to check consistency:

```bash
cd configs/linux/.claude/skills
python3 -c "
import yaml, os
skills = sorted([d for d in os.listdir('.') if os.path.isdir(d)])
meta_map = {}
for skill in skills:
    with open(f'{skill}/SKILL.md') as f:
        parts = f.read().split('---', 2)
    meta_map[skill] = yaml.safe_load(parts[1])
errors = []
for skill, meta in meta_map.items():
    for u in (meta.get('unlocks') or []):
        t = meta_map.get(u)
        if t and skill not in (t.get('prerequisites') or []):
            errors.append(f'{skill} unlocks {u}, but {u} missing prereq')
    for p in (meta.get('prerequisites') or []):
        parent = meta_map.get(p)
        if parent and skill not in (parent.get('unlocks') or []):
            errors.append(f'{skill} prereq {p}, but {p} missing unlock')
print(f'{len(errors)} errors' if errors else 'DAG valid')
for e in errors: print(e)
"
```

## Checklist for New Skills

1. Create the directory: `mkdir -p configs/linux/.claude/skills/<name>/`
2. Write SKILL.md with all required frontmatter and sections
3. Verify kernel_files paths exist in the current kernel source
4. Check prerequisites reference existing skills
5. Add the skill to the parent skill's `unlocks` list (bidirectional consistency)
6. Create the animation module with test (TDD)
7. Register the animation in `configs/linux/web/src/animation/registry.ts`
8. Update `configs/linux/CLAUDE.md` to include the new skill
9. Run the DAG validator above
10. Run `npm test` to verify all tests pass
11. Run `/cp:pre-commit` to validate

## Skill Tree Graph

```
boot-and-init
  +-> system-calls
  |     +-> process-lifecycle
  |     |     +-> scheduler-fundamentals
  |     |     |     +-> context-switching
  |     |     |     +-> rt-and-deadline-scheduling
  |     |     |     +-> cpu-topology-and-load-balancing
  |     |     |     +-> sched-ext (also requires ebpf-programs)
  |     |     +-> page-allocation
  |     |     |     +-> slab-allocator
  |     |     |     +-> virtual-memory-areas
  |     |     |     |     +-> page-fault-handling
  |     |     |     |           +-> page-reclaim-and-swap
  |     |     |     |           |     +-> memcg-and-oom (also requires cgroups-v2)
  |     |     |     |           +-> rmap-and-folio
  |     |     |     |           +-> kvm-memory-virtualization (also requires kvm-fundamentals)
  |     |     |     +-> pci-and-dma (also requires device-model-and-sysfs)
  |     |     +-> vfs-layer
  |     |     |     +-> socket-layer
  |     |     |     |     +-> tcp-state-machine
  |     |     |     |     |     +-> tcp-congestion-control
  |     |     |     |     +-> netfilter-and-nftables
  |     |     |     |     +-> sk-buff-lifecycle
  |     |     |     +-> page-cache-and-readahead
  |     |     |     +-> ext4-internals
  |     |     |     +-> dcache-and-inode-cache
  |     |     |     +-> pipe-and-fifo
  |     |     |     +-> lsm-framework (also requires capabilities-and-credentials)
  |     |     |           +-> seccomp-filters
  |     |     |           +-> crypto-api
  |     |     |     +-> character-devices
  |     |     +-> spinlocks-and-mutexes
  |     |     |     +-> rcu-fundamentals
  |     |     |     +-> rwsem-and-percpu
  |     |     |     +-> lockdep-validation
  |     |     |     +-> futex-and-locking (also requires signals-and-ipc)
  |     |     |     +-> interrupt-handling (also requires kernel-modules)
  |     |     |           +-> block-device-layer
  |     |     |           +-> timers-and-hrtimers
  |     |     |           +-> kvm-fundamentals (also requires system-calls)
  |     |     |           |     +-> kvm-memory-virtualization
  |     |     |           |     +-> virtio-framework (also requires device-model-and-sysfs)
  |     |     |           +-> perf-events (also requires ftrace-and-kprobes)
  |     |     +-> signals-and-ipc
  |     |     +-> capabilities-and-credentials
  |     |     +-> waitqueue-and-completion
  |     |     |     +-> epoll-internals (also requires vfs-layer)
  |     |     |           +-> io-uring
  |     |     +-> namespaces
  |     |     |     +-> cgroups-and-namespaces (also requires cgroups-v2)
  |     |     |           +-> seccomp-and-sandboxing (also requires system-calls)
  |     |     +-> cgroups-v2
  |     |     +-> socket-layer
  |     +-> ftrace-and-kprobes (also requires kernel-modules)
  |     |     +-> ebpf-programs
  |     |     |     +-> ebpf-maps-and-helpers
  |     |     |     +-> sched-ext
  |     |     +-> perf-events
  |     +-> kvm-fundamentals (also requires interrupt-handling)
  |     +-> seccomp-filters
  |     +-> seccomp-and-sandboxing
  +-> kernel-modules
  |     +-> character-devices
  |     +-> device-model-and-sysfs
  |     |     +-> pci-and-dma
  |     |     +-> virtio-framework
  |     +-> ftrace-and-kprobes
  |     +-> interrupt-handling
  +-> kbuild-and-kconfig
```
