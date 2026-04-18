# Kernel Quest Documentation

Reference documentation for the Kernel Quest gamified Linux kernel learning system.

## Overview

Kernel Quest teaches Linux kernel internals through an RPG-style skill tree. Each
skill maps to a real kernel subsystem and includes interactive animations that
trace actual kernel source code with exact function names, file paths, and line
numbers.

## Architecture

```
configs/linux/
  .claude/
    skills/           60 SKILL.md files (one per skill)
    commands/          Slash commands
  web/                Vite + TypeScript SPA
    src/
      animation/
        types.ts      Core type definitions
        registry.ts   Animation module registry
        modules/      61 animation modules + 61 test files
    data/
      realms.json     Realm definitions
      skills.json     Generated skill data
  docs/               This directory
  CLAUDE.md           Config overview and skill listing
```

## Statistics

| Metric | Value |
|--------|-------|
| Skills | 60 |
| Realms | 13 |
| Animation modules | 61 |
| Test files | 69 |
| Tests | 2,883 |
| Verified srcRefs | 110 (against Linux 7.0) |
| Total XP | 13,300 |
| Difficulty | 11 beginner, 29 intermediate, 20 advanced |

## Realms

| Realm | Skills | Kernel Subsystems |
|-------|--------|------------------|
| The Foundations | 6 | kernel/core, init/ |
| Memory Arcana | 7 | mm/ |
| Concurrency Citadel | 5 | kernel/locking/ |
| The Scheduler's Domain | 5 | kernel/sched/ |
| The Filesystem Labyrinth | 5 | fs/ |
| The Network Forge | 5 | net/ |
| Device Mastery | 5 | drivers/ |
| Security Fortress | 4 | security/ |
| Event Horizon | 4 | fs/eventpoll.c, io_uring/, kernel/time/ |
| Containers and Isolation | 4 | kernel/cgroup/, kernel/nsproxy.c |
| Tracing and Observability | 4 | kernel/trace/, kernel/bpf/ |
| Virtualization Vault | 3 | virt/kvm/, arch/x86/kvm/ |
| Kernel 7.0 Highlights | 3 | v7.0 release features across subsystems |

## Running the Web UI

The skill tree visualization is a Vite + TypeScript SPA. All web commands run
from `configs/linux/web/`.

### First-time setup

```bash
cd configs/linux/web
npm install
```

### Development server

```bash
npm run dev
```

Vite serves the UI at `http://localhost:5173` with hot module reload. Edits to
`src/` or `styles/` refresh the browser automatically.

### Production build

```bash
npm run build
```

This runs `build-data` (regenerating `data/skills.json` from SKILL.md files)
then produces the optimized bundle in `dist/`. Serve it with:

```bash
npm run preview
```

### Regenerate skill data only

```bash
npm run build-data
```

Run this after editing any SKILL.md front matter (name, xp, prerequisites,
unlocks, realm, etc.). The dev server reloads automatically on `skills.json`
change.

### Validate the skill tree

```bash
npm run validate
```

Checks every SKILL.md for required front-matter fields and verifies the
prerequisite/unlocks graph is consistent (bidirectional and acyclic).

### Testing

```bash
npm test              # Single run
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### Verifying source references

Animation frames carry srcRef strings like `kernel/sched/ext.c:3150 (dl_server_init)`.
To verify every srcRef against the real kernel tree:

```bash
# From the kernel repo root (parent of .claude-playbook)
python3 .claude-playbook/configs/linux/scripts/verify-srcrefs.py
```

Reports OK / DRIFT / MOVED / MISSING_FN / MISSING_FILE counts per module.

## Skill Prerequisite DAG

The skill tree is a directed acyclic graph rooted at `boot-and-init`. Every edge
is bidirectionally consistent: if skill A unlocks skill B, then B lists A as a
prerequisite, and vice versa.

Suggested learning paths:

**Path 1: Memory Deep Dive**
boot-and-init -> system-calls -> process-lifecycle -> page-allocation ->
virtual-memory-areas -> page-fault-handling -> page-reclaim-and-swap -> memcg-and-oom

**Path 2: Network Stack**
boot-and-init -> system-calls -> process-lifecycle -> vfs-layer -> socket-layer ->
tcp-state-machine -> tcp-congestion-control

**Path 3: Container Internals**
boot-and-init -> system-calls -> process-lifecycle -> namespaces + cgroups-v2 ->
cgroups-and-namespaces -> seccomp-and-sandboxing

**Path 4: Tracing and eBPF**
boot-and-init -> system-calls + kernel-modules -> ftrace-and-kprobes ->
ebpf-programs -> ebpf-maps-and-helpers

**Path 5: Virtualization**
boot-and-init -> system-calls + kernel-modules -> interrupt-handling ->
kvm-fundamentals -> kvm-memory-virtualization + virtio-framework

**Path 6: Linux 7.0 New Features**
boot-and-init -> system-calls -> v7-scheduler-changes + v7-memory-changes +
v7-bpf-changes

## Animation System

Each animation module implements the `AnimationModule` interface:

- `config` -- Module ID, skill name, and display title
- `generateFrames(scenario?)` -- Returns deterministic frame array for a scenario
- `renderFrame(container, frame, width, height)` -- Renders SVG into a container
- `getScenarios()` -- Returns the available scenarios (typically 3-4 per module)

Every animation frame carries a `srcRef` field pointing to the exact kernel source
location being visualized (e.g., `kernel/sched/ext.c:3150 (dl_server_init)`). All
source references are verified against the Linux 7.0 kernel tree.

### Animation Modules by Realm

**Foundations (7 modules)**
boot-sequence, syscall-flow, cow-fork, elf-loader, module-lifecycle,
signal-delivery, kbuild-kconfig

**Memory Arcana (8 modules)**
buddy-allocator, page-table-walk, page-reclaim, slab-allocator, page-fault,
vma-operations, rmap-folio, memcg-oom

**Concurrency Citadel (6 modules)**
spinlock-mutex, qspinlock, rcu-grace-period, futex-wait-wake, lockdep-graph,
rwsem-percpu

**Scheduler (6 modules)**
cfs-scheduler, eevdf-scheduler, context-switching, rt-deadline-sched,
cpu-load-balance, sched-ext

**Filesystem (5 modules)**
vfs-lookup, ext4-extent-journal, pipe-ring-buffer, page-cache-readahead,
dcache-inode

**Network (5 modules)**
network-packet, tcp-state-machine, tcp-congestion, netfilter-hooks,
skbuff-lifecycle

**Devices (5 modules)**
interrupt-flow, chardev-ops, block-io-path, device-sysfs, pci-dma

**Security (4 modules)**
lsm-hooks, seccomp-bpf, capabilities-cred, crypto-api

**Event Horizon (4 modules)**
epoll-internals, io-uring, timer-hrtimer, waitqueue-completion

**Containers (4 modules)**
namespace-isolation, cgroup-hierarchy, cgroup-namespace, seccomp-sandbox

**Tracing (4 modules)**
ftrace-kprobe, ebpf-verifier, ebpf-maps, perf-events

**Virtualization (3 modules)**
kvm-entry-exit, kvm-ept-walk, virtio-vring

The three Kernel 7.0 Highlights skills reuse the existing subsystem modules
above (e.g., buddy-allocator hosts the PCP lock rework scenario, ebpf-verifier
hosts KF_TRUSTED_ARGS, cfs-scheduler hosts cross-class preemption).

## Development

### Adding a New Skill

See `kernel-skill-tree-guide.md` for the complete checklist. Key steps:

1. Create `configs/linux/.claude/skills/<name>/SKILL.md`
2. Write animation test file first (TDD)
3. Implement animation module reading real kernel source
4. Register in `registry.ts`
5. Update parent skill's `unlocks` and CLAUDE.md
6. Validate DAG consistency
7. Run full test suite

## Files

- `kernel-skill-tree-guide.md` -- How to create SKILL.md files and animation modules
- `README.md` -- This file: project overview and reference
