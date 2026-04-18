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
    skills/           57 SKILL.md files (one per skill)
    commands/          Slash commands
  web/                Vite + TypeScript SPA
    src/
      animation/
        types.ts      Core type definitions
        registry.ts   Animation module registry (61 entries)
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
| Skills | 57 |
| Realms | 12 |
| Animation modules | 61 |
| Animation coverage | 57/57 skills (100%) |
| Scenarios | 183 (3 per module) |
| Tests | 2,676 |
| Test files | 69 |
| Total XP | 12,400 |
| Difficulty | 11 beginner, 29 intermediate, 17 advanced |

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

## Animation System

Each animation module implements the `AnimationModule` interface:

- `config` -- Module ID, skill name, and display title
- `generateFrames(scenario?)` -- Returns deterministic frame array for a scenario
- `renderFrame(container, frame, width, height)` -- Renders SVG into a container
- `getScenarios()` -- Returns 3 available scenarios

Every animation frame carries a `srcRef` field pointing to the exact kernel source
location being visualized (e.g., `kernel/sched/ext.c:7341 (bpf_scx_reg)`). All
source references have been verified against the Linux 7.0 kernel tree.

### Animation Modules by Realm

**Foundations (6 modules)**
boot-sequence, syscall-flow, cow-fork, elf-loader, module-lifecycle,
signal-delivery, kbuild-kconfig

**Memory Arcana (7 modules)**
buddy-allocator, page-table-walk, page-reclaim, slab-allocator, page-fault,
vma-operations, rmap-folio, memcg-oom

**Concurrency Citadel (5 modules)**
spinlock-mutex, qspinlock, rcu-grace-period, futex-wait-wake, lockdep-graph,
rwsem-percpu

**Scheduler (5 modules)**
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

## Development

### Running Tests

```bash
cd configs/linux/web
npm test              # Watch mode
npm run test:run      # Single run
```

### Adding a New Skill

See `kernel-skill-tree-guide.md` for the complete checklist. Key steps:

1. Create `configs/linux/.claude/skills/<name>/SKILL.md`
2. Write animation test file first (TDD)
3. Implement animation module reading real kernel source
4. Register in `registry.ts`
5. Update parent skill's `unlocks` and CLAUDE.md
6. Validate DAG consistency
7. Run full test suite

### Verifying Source References

Animation srcRef values point to real kernel source. To verify:

```bash
# Extract a srcRef and check it
grep "srcRef = " configs/linux/web/src/animation/modules/<module>.ts | head -3
# Then read the actual kernel source at that location
sed -n '<line>p' <kernel-file>
```

## Files

- `kernel-skill-tree-guide.md` -- How to create SKILL.md files and animation modules
- `README.md` -- This file: project overview and reference
