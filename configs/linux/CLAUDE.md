# linux Config

## Overview

Gamified Linux kernel learning system. SKILL.md files teach kernel concepts through
RPG-style skill trees with realms, quests, XP, and badges. A web UI (Phase 2+)
renders the skill tree visually with progress tracking.

## Skills (60)

### The Foundations (6)

- boot-and-init -- Understand how the Linux kernel boots from start_kernel to userspace
- system-calls -- Learn how userspace communicates with the kernel through system calls
- process-lifecycle -- Trace a process from fork through execve to exit in the kernel
- kernel-modules -- Build and load kernel modules to extend kernel functionality at runtime
- signals-and-ipc -- Trace signal delivery and POSIX IPC mechanisms through the kernel
- kbuild-and-kconfig -- Understand the kernel build system, Kconfig language, and .config generation

### Memory Arcana (7)

- page-allocation -- Master the buddy allocator and physical page management
- slab-allocator -- Understand SLUB slab allocation for efficient kernel object caching
- virtual-memory-areas -- Understand VMAs, mmap, and the process address space
- page-fault-handling -- Trace the page fault path from hardware trap to resolution
- page-reclaim-and-swap -- Master kswapd, direct reclaim, LRU lists, and the swap subsystem
- rmap-and-folio -- Understand reverse mappings, folio abstraction, and PTE discovery
- memcg-and-oom -- Trace memory cgroup accounting and OOM killer decision path

### Concurrency Citadel (5)

- spinlocks-and-mutexes -- Learn kernel locking primitives for safe concurrent access
- rcu-fundamentals -- Master Read-Copy-Update lock-free synchronization
- rwsem-and-percpu -- Understand reader-writer semaphores and per-CPU data patterns
- futex-and-locking -- Trace futex fast/slow paths and userspace mutex implementation
- lockdep-validation -- Understand the lock dependency validator and deadlock detection

### The Filesystem Labyrinth (5)

- vfs-layer -- Understand the Virtual Filesystem Switch abstraction layer
- page-cache-and-readahead -- Understand file data caching and readahead algorithms
- ext4-internals -- Trace ext4 extent trees, jbd2 journaling, and block allocation
- dcache-and-inode-cache -- Deep-dive into dentry cache and inode cache internals
- pipe-and-fifo -- Understand pipe ring buffer implementation with VFS integration

### The Network Forge (5)

- socket-layer -- Explore the BSD socket interface and kernel network connections
- tcp-state-machine -- Trace TCP connection lifecycle through kernel state machine
- tcp-congestion-control -- Understand CUBIC, BBR, and pluggable congestion control
- netfilter-and-nftables -- Understand netfilter hook architecture and nftables filtering
- sk-buff-lifecycle -- Deep-dive into sk_buff allocation, cloning, and GSO/GRO

### The Scheduler's Domain (5)

- scheduler-fundamentals -- Learn how the kernel decides which process runs next
- context-switching -- Trace the complete context switch from schedule() to __switch_to
- rt-and-deadline-scheduling -- Understand SCHED_FIFO, SCHED_RR, and SCHED_DEADLINE
- cpu-topology-and-load-balancing -- Understand scheduling domains and NUMA load balancing
- sched-ext -- Explore the BPF-extensible scheduler framework

### Device Mastery (5)

- character-devices -- Build character device drivers exposing kernel functionality
- interrupt-handling -- Master hardware interrupts and deferred work mechanisms
- block-device-layer -- Understand block I/O layer, bio, request queues, and blk-mq
- device-model-and-sysfs -- Understand unified device model: buses, devices, drivers, sysfs
- pci-and-dma -- Trace PCI device enumeration, BAR mapping, and DMA API

### Security Fortress (4)

- capabilities-and-credentials -- Understand Linux capabilities, credentials, and privilege checking
- lsm-framework -- Explore the Linux Security Modules framework and MAC
- seccomp-filters -- Trace seccomp-bpf syscall filtering and BPF evaluation
- crypto-api -- Understand kernel cryptographic API: algorithms, templates, async operations

### Event Horizon (4)

- waitqueue-and-completion -- Understand wait queues and completion as kernel sleeping primitives
- epoll-internals -- Trace epoll from epoll_create through ready-list wakeup
- timers-and-hrtimers -- Understand timer wheel, hrtimer red-black tree, and kernel timekeeping
- io-uring -- Understand io_uring submission/completion ring architecture

### Containers and Isolation (4)

- namespaces -- Understand the 8 Linux namespace types and resource isolation
- cgroups-v2 -- Trace cgroup v2 hierarchy, resource controllers, and unified hierarchy
- cgroups-and-namespaces -- Combine namespaces and cgroups for container runtime isolation
- seccomp-and-sandboxing -- Build complete sandboxes with namespaces, cgroups, and seccomp-bpf

### Tracing and Observability (4)

- ftrace-and-kprobes -- Understand ftrace function tracing and kprobes dynamic instrumentation
- ebpf-programs -- Understand eBPF virtual machine, verifier, JIT, and program types
- ebpf-maps-and-helpers -- Deep-dive into BPF maps, helper functions, and kfuncs
- perf-events -- Understand perf_event subsystem: PMU abstraction, sampling, ring buffer

### Virtualization Vault (3)

- kvm-fundamentals -- Understand KVM architecture: VMCS, VM entry/exit cycle
- kvm-memory-virtualization -- Understand EPT/NPT nested page tables and memory slots
- virtio-framework -- Understand virtio transport: virtqueues, vring, device negotiation

### Kernel 7.0 Highlights (3)

- v7-scheduler-changes -- Study v7.0 scheduler changes: sched_ext DL server and cross-class wakeup_preempt rework
- v7-memory-changes -- Study v7.0 memory-management changes: vma_flags_t, batched folio unmap, private memcg IDs, PCP lock rework
- v7-bpf-changes -- Study v7.0 BPF changes: BPF_F_CPU/BPF_F_ALL_CPUS flags and KF_TRUSTED_ARGS as default kfunc policy

## Realms

| Realm | ID | Subsystems |
|-------|----|-----------|
| The Foundations | foundations | kernel/core, init/ |
| The Scheduler's Domain | scheduler | kernel/sched/ |
| Memory Arcana | memory | mm/ |
| The Filesystem Labyrinth | filesystem | fs/ |
| The Network Forge | network | net/ |
| Concurrency Citadel | concurrency | kernel/locking/ |
| Device Mastery | devices | drivers/ |
| Security Fortress | security | security/ |
| Event Horizon | events | fs/eventpoll.c, io_uring/, kernel/time/ |
| Containers and Isolation | containers | kernel/cgroup/, kernel/nsproxy.c |
| Tracing and Observability | tracing | kernel/trace/, kernel/bpf/ |
| Virtualization Vault | virtualization | virt/kvm/, arch/x86/kvm/ |
| Kernel 7.0 Highlights | kernel-7 | v7.0 release features across subsystems |

## Commands (1)

- `/hello` -- Say hello and confirm the config is working

## Getting Started

1. Skills are in `.claude/skills/` -- each is a self-contained kernel learning module
2. Start with the Foundations realm: boot-and-init -> system-calls -> process-lifecycle
3. Branch out to other realms based on your interests
4. See `docs/kernel-skill-tree-guide.md` for how to create new skills
