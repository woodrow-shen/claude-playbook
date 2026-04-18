import type { AnimationRegistryEntry } from './types.js';

const registry: AnimationRegistryEntry[] = [
  // Memory Arcana
  {
    skillName: 'page-allocation',
    moduleId: 'buddy-allocator',
    title: 'Buddy Allocator Visualization',
    load: () => import('./modules/buddy-allocator.js').then(m => m.default),
  },
  {
    skillName: 'page-allocation',
    moduleId: 'page-table-walk',
    title: '4-Level Page Table Walk',
    load: () => import('./modules/page-table-walk.js').then(m => m.default),
  },
  // Memory Arcana (page-reclaim-and-swap)
  {
    skillName: 'page-reclaim-and-swap',
    moduleId: 'page-reclaim',
    title: 'Page Reclaim & LRU',
    load: () => import('./modules/page-reclaim.js').then(m => m.default),
  },
  {
    skillName: 'slab-allocator',
    moduleId: 'slab-allocator',
    title: 'SLUB Slab Allocator',
    load: () => import('./modules/slab-allocator.js').then(m => m.default),
  },
  // Scheduler
  {
    skillName: 'scheduler-fundamentals',
    moduleId: 'cfs-scheduler',
    title: 'CFS Scheduler (Legacy)',
    load: () => import('./modules/cfs-scheduler.js').then(m => m.default),
  },
  {
    skillName: 'scheduler-fundamentals',
    moduleId: 'eevdf-scheduler',
    title: 'EEVDF Scheduler (Linux 6.6+)',
    load: () => import('./modules/eevdf-scheduler.js').then(m => m.default),
  },
  // Foundations
  {
    skillName: 'process-lifecycle',
    moduleId: 'cow-fork',
    title: 'Copy-on-Write Fork Visualization',
    load: () => import('./modules/cow-fork.js').then(m => m.default),
  },
  // Foundations (ELF loader)
  {
    skillName: 'process-lifecycle',
    moduleId: 'elf-loader',
    title: 'ELF Binary Loading',
    load: () => import('./modules/elf-loader.js').then(m => m.default),
  },
  // Concurrency
  {
    skillName: 'spinlocks-and-mutexes',
    moduleId: 'spinlock-mutex',
    title: 'Spinlock vs Mutex Visualization',
    load: () => import('./modules/spinlock-mutex.js').then(m => m.default),
  },
  {
    skillName: 'spinlocks-and-mutexes',
    moduleId: 'qspinlock',
    title: 'qspinlock MCS Queue',
    load: () => import('./modules/qspinlock.js').then(m => m.default),
  },
  // Concurrency (rcu-fundamentals)
  {
    skillName: 'rcu-fundamentals',
    moduleId: 'rcu-grace-period',
    title: 'RCU Grace Period Mechanism',
    load: () => import('./modules/rcu-grace-period.js').then(m => m.default),
  },
  // Filesystem
  {
    skillName: 'vfs-layer',
    moduleId: 'vfs-lookup',
    title: 'VFS Path Lookup',
    load: () => import('./modules/vfs-lookup.js').then(m => m.default),
  },
  // Network
  {
    skillName: 'socket-layer',
    moduleId: 'network-packet',
    title: 'Network Packet Journey (sk_buff)',
    load: () => import('./modules/network-packet.js').then(m => m.default),
  },
  // Devices
  {
    skillName: 'interrupt-handling',
    moduleId: 'interrupt-flow',
    title: 'Interrupt Handling Flow',
    load: () => import('./modules/interrupt-flow.js').then(m => m.default),
  },
  // Foundations (boot)
  {
    skillName: 'boot-and-init',
    moduleId: 'boot-sequence',
    title: 'Kernel Boot Sequence',
    load: () => import('./modules/boot-sequence.js').then(m => m.default),
  },
  // Foundations (syscalls)
  {
    skillName: 'system-calls',
    moduleId: 'syscall-flow',
    title: 'System Call Flow',
    load: () => import('./modules/syscall-flow.js').then(m => m.default),
  },
  // Foundations (modules)
  {
    skillName: 'kernel-modules',
    moduleId: 'module-lifecycle',
    title: 'Kernel Module Lifecycle',
    load: () => import('./modules/module-lifecycle.js').then(m => m.default),
  },
  // Devices (char dev)
  {
    skillName: 'character-devices',
    moduleId: 'chardev-ops',
    title: 'Character Device Operations',
    load: () => import('./modules/chardev-ops.js').then(m => m.default),
  },
  // Security
  {
    skillName: 'lsm-framework',
    moduleId: 'lsm-hooks',
    title: 'LSM Security Hook Flow',
    load: () => import('./modules/lsm-hooks.js').then(m => m.default),
  },
  // Memory Arcana (page fault)
  {
    skillName: 'page-fault-handling',
    moduleId: 'page-fault',
    title: 'Page Fault Handling Path',
    load: () => import('./modules/page-fault.js').then(m => m.default),
  },
  // Scheduler (context switch)
  {
    skillName: 'context-switching',
    moduleId: 'context-switching',
    title: 'Context Switch Path',
    load: () => import('./modules/context-switching.js').then(m => m.default),
  },
  // Network (TCP state machine)
  {
    skillName: 'tcp-state-machine',
    moduleId: 'tcp-state-machine',
    title: 'TCP State Machine',
    load: () => import('./modules/tcp-state-machine.js').then(m => m.default),
  },
  // Event Horizon (epoll)
  {
    skillName: 'epoll-internals',
    moduleId: 'epoll-internals',
    title: 'Epoll Internals',
    load: () => import('./modules/epoll-internals.js').then(m => m.default),
  },
  // Event Horizon (io_uring)
  {
    skillName: 'io-uring',
    moduleId: 'io-uring',
    title: 'io_uring Submission/Completion Rings',
    load: () => import('./modules/io-uring.js').then(m => m.default),
  },
  // Virtualization (KVM)
  {
    skillName: 'kvm-fundamentals',
    moduleId: 'kvm-entry-exit',
    title: 'KVM VM Entry/Exit Cycle',
    load: () => import('./modules/kvm-entry-exit.js').then(m => m.default),
  },
  // Containers (namespaces)
  {
    skillName: 'namespaces',
    moduleId: 'namespace-isolation',
    title: 'Namespace Isolation',
    load: () => import('./modules/namespace-isolation.js').then(m => m.default),
  },
  // Foundations (signals)
  {
    skillName: 'signals-and-ipc',
    moduleId: 'signal-delivery',
    title: 'Signal Delivery Path',
    load: () => import('./modules/signal-delivery.js').then(m => m.default),
  },
  // Concurrency (futex)
  {
    skillName: 'futex-and-locking',
    moduleId: 'futex-wait-wake',
    title: 'Futex Wait/Wake Mechanism',
    load: () => import('./modules/futex-wait-wake.js').then(m => m.default),
  },
  // Concurrency (lockdep)
  {
    skillName: 'lockdep-validation',
    moduleId: 'lockdep-graph',
    title: 'Lockdep Dependency Graph',
    load: () => import('./modules/lockdep-graph.js').then(m => m.default),
  },
  // Filesystem (ext4)
  {
    skillName: 'ext4-internals',
    moduleId: 'ext4-extent-journal',
    title: 'ext4 Extent Tree & JBD2 Journal',
    load: () => import('./modules/ext4-extent-journal.js').then(m => m.default),
  },
  // Containers (cgroups)
  {
    skillName: 'cgroups-v2',
    moduleId: 'cgroup-hierarchy',
    title: 'Cgroup v2 Hierarchy & Controllers',
    load: () => import('./modules/cgroup-hierarchy.js').then(m => m.default),
  },
  // Devices (block)
  {
    skillName: 'block-device-layer',
    moduleId: 'block-io-path',
    title: 'Block I/O Path (bio -> blk-mq)',
    load: () => import('./modules/block-io-path.js').then(m => m.default),
  },
  // Network (netfilter)
  {
    skillName: 'netfilter-and-nftables',
    moduleId: 'netfilter-hooks',
    title: 'Netfilter Hook Chain',
    load: () => import('./modules/netfilter-hooks.js').then(m => m.default),
  },
  // Filesystem (pipe)
  {
    skillName: 'pipe-and-fifo',
    moduleId: 'pipe-ring-buffer',
    title: 'Pipe Ring Buffer & Splice',
    load: () => import('./modules/pipe-ring-buffer.js').then(m => m.default),
  },
  // Network (TCP congestion)
  {
    skillName: 'tcp-congestion-control',
    moduleId: 'tcp-congestion',
    title: 'TCP Congestion Control (CUBIC/BBR)',
    load: () => import('./modules/tcp-congestion.js').then(m => m.default),
  },
  // Filesystem (page cache)
  {
    skillName: 'page-cache-and-readahead',
    moduleId: 'page-cache-readahead',
    title: 'Page Cache & Readahead',
    load: () => import('./modules/page-cache-readahead.js').then(m => m.default),
  },
  // Scheduler (RT/deadline)
  {
    skillName: 'rt-and-deadline-scheduling',
    moduleId: 'rt-deadline-sched',
    title: 'RT & SCHED_DEADLINE Scheduling',
    load: () => import('./modules/rt-deadline-sched.js').then(m => m.default),
  },
  // Event Horizon (timers)
  {
    skillName: 'timers-and-hrtimers',
    moduleId: 'timer-hrtimer',
    title: 'Timer Wheel & High-Resolution Timers',
    load: () => import('./modules/timer-hrtimer.js').then(m => m.default),
  },
  // Tracing (eBPF)
  {
    skillName: 'ebpf-programs',
    moduleId: 'ebpf-verifier',
    title: 'eBPF Verifier & JIT',
    load: () => import('./modules/ebpf-verifier.js').then(m => m.default),
  },
  // Memory (memcg/OOM)
  {
    skillName: 'memcg-and-oom',
    moduleId: 'memcg-oom',
    title: 'Memory Cgroup & OOM Killer',
    load: () => import('./modules/memcg-oom.js').then(m => m.default),
  },
  // Security (seccomp)
  {
    skillName: 'seccomp-filters',
    moduleId: 'seccomp-bpf',
    title: 'Seccomp-BPF Syscall Filtering',
    load: () => import('./modules/seccomp-bpf.js').then(m => m.default),
  },
  // Virtualization (KVM EPT)
  {
    skillName: 'kvm-memory-virtualization',
    moduleId: 'kvm-ept-walk',
    title: 'KVM EPT/TDP Page Walk',
    load: () => import('./modules/kvm-ept-walk.js').then(m => m.default),
  },
  // Virtualization (virtio)
  {
    skillName: 'virtio-framework',
    moduleId: 'virtio-vring',
    title: 'Virtio Vring Transport',
    load: () => import('./modules/virtio-vring.js').then(m => m.default),
  },
  // Memory (VMA)
  {
    skillName: 'virtual-memory-areas',
    moduleId: 'vma-operations',
    title: 'VMA Operations (mmap/munmap/merge)',
    load: () => import('./modules/vma-operations.js').then(m => m.default),
  },
  // Tracing (ftrace/kprobes)
  {
    skillName: 'ftrace-and-kprobes',
    moduleId: 'ftrace-kprobe',
    title: 'Ftrace & Kprobe Instrumentation',
    load: () => import('./modules/ftrace-kprobe.js').then(m => m.default),
  },
  // Foundations (kbuild)
  {
    skillName: 'kbuild-and-kconfig',
    moduleId: 'kbuild-kconfig',
    title: 'Kbuild & Kconfig System',
    load: () => import('./modules/kbuild-kconfig.js').then(m => m.default),
  },
  // Memory (rmap/folio)
  {
    skillName: 'rmap-and-folio',
    moduleId: 'rmap-folio',
    title: 'Reverse Mappings & Folio Abstraction',
    load: () => import('./modules/rmap-folio.js').then(m => m.default),
  },
  // Concurrency (rwsem/percpu)
  {
    skillName: 'rwsem-and-percpu',
    moduleId: 'rwsem-percpu',
    title: 'Reader-Writer Semaphores & Per-CPU Data',
    load: () => import('./modules/rwsem-percpu.js').then(m => m.default),
  },
  // Scheduler (CPU topology)
  {
    skillName: 'cpu-topology-and-load-balancing',
    moduleId: 'cpu-load-balance',
    title: 'CPU Topology & Load Balancing',
    load: () => import('./modules/cpu-load-balance.js').then(m => m.default),
  },
  // Scheduler (sched_ext)
  {
    skillName: 'sched-ext',
    moduleId: 'sched-ext',
    title: 'BPF-Extensible Scheduler (sched_ext)',
    load: () => import('./modules/sched-ext.js').then(m => m.default),
  },
  // Filesystem (dcache/inode)
  {
    skillName: 'dcache-and-inode-cache',
    moduleId: 'dcache-inode',
    title: 'Dentry Cache & Inode Cache',
    load: () => import('./modules/dcache-inode.js').then(m => m.default),
  },
  // Network (sk_buff)
  {
    skillName: 'sk-buff-lifecycle',
    moduleId: 'skbuff-lifecycle',
    title: 'sk_buff Allocation, Cloning & GSO/GRO',
    load: () => import('./modules/skbuff-lifecycle.js').then(m => m.default),
  },
  // Devices (device model/sysfs)
  {
    skillName: 'device-model-and-sysfs',
    moduleId: 'device-sysfs',
    title: 'Unified Device Model & Sysfs',
    load: () => import('./modules/device-sysfs.js').then(m => m.default),
  },
  // Devices (PCI/DMA)
  {
    skillName: 'pci-and-dma',
    moduleId: 'pci-dma',
    title: 'PCI Enumeration & DMA Mapping',
    load: () => import('./modules/pci-dma.js').then(m => m.default),
  },
  // Security (capabilities)
  {
    skillName: 'capabilities-and-credentials',
    moduleId: 'capabilities-cred',
    title: 'Linux Capabilities & Credentials',
    load: () => import('./modules/capabilities-cred.js').then(m => m.default),
  },
  // Security (crypto)
  {
    skillName: 'crypto-api',
    moduleId: 'crypto-api',
    title: 'Kernel Crypto API',
    load: () => import('./modules/crypto-api.js').then(m => m.default),
  },
  // Events (waitqueue/completion)
  {
    skillName: 'waitqueue-and-completion',
    moduleId: 'waitqueue-completion',
    title: 'Wait Queues & Completions',
    load: () => import('./modules/waitqueue-completion.js').then(m => m.default),
  },
  // Containers (cgroups+namespaces)
  {
    skillName: 'cgroups-and-namespaces',
    moduleId: 'cgroup-namespace',
    title: 'Container Runtime Isolation',
    load: () => import('./modules/cgroup-namespace.js').then(m => m.default),
  },
  // Containers (seccomp+sandbox)
  {
    skillName: 'seccomp-and-sandboxing',
    moduleId: 'seccomp-sandbox',
    title: 'Complete Sandbox with Seccomp + Namespaces + Cgroups',
    load: () => import('./modules/seccomp-sandbox.js').then(m => m.default),
  },
  // Tracing (eBPF maps)
  {
    skillName: 'ebpf-maps-and-helpers',
    moduleId: 'ebpf-maps',
    title: 'BPF Maps & Helper Functions',
    load: () => import('./modules/ebpf-maps.js').then(m => m.default),
  },
  // Tracing (perf)
  {
    skillName: 'perf-events',
    moduleId: 'perf-events',
    title: 'perf_event Subsystem & PMU Sampling',
    load: () => import('./modules/perf-events.js').then(m => m.default),
  },
  // Kernel 7.0 Highlights: Scheduler changes
  {
    skillName: 'v7-scheduler-changes',
    moduleId: 'sched-ext',
    title: 'sched_ext DL Server (v7.0)',
    load: () => import('./modules/sched-ext.js').then(m => m.default),
  },
  {
    skillName: 'v7-scheduler-changes',
    moduleId: 'cfs-scheduler',
    title: 'Cross-Class wakeup_preempt (v7.0)',
    load: () => import('./modules/cfs-scheduler.js').then(m => m.default),
  },
  // Kernel 7.0 Highlights: Memory changes
  {
    skillName: 'v7-memory-changes',
    moduleId: 'vma-operations',
    title: 'vma_flags_t & unmap_desc (v7.0)',
    load: () => import('./modules/vma-operations.js').then(m => m.default),
  },
  {
    skillName: 'v7-memory-changes',
    moduleId: 'page-reclaim',
    title: 'Batched Large-Folio Unmap (v7.0)',
    load: () => import('./modules/page-reclaim.js').then(m => m.default),
  },
  {
    skillName: 'v7-memory-changes',
    moduleId: 'memcg-oom',
    title: 'Private memcg ID API (v7.0)',
    load: () => import('./modules/memcg-oom.js').then(m => m.default),
  },
  {
    skillName: 'v7-memory-changes',
    moduleId: 'buddy-allocator',
    title: 'PCP Lock IRQ Removal & FPI_TRYLOCK (v7.0)',
    load: () => import('./modules/buddy-allocator.js').then(m => m.default),
  },
  // Kernel 7.0 Highlights: BPF changes
  {
    skillName: 'v7-bpf-changes',
    moduleId: 'ebpf-maps',
    title: 'BPF_F_CPU & BPF_F_ALL_CPUS (v7.0)',
    load: () => import('./modules/ebpf-maps.js').then(m => m.default),
  },
  {
    skillName: 'v7-bpf-changes',
    moduleId: 'ebpf-verifier',
    title: 'KF_TRUSTED_ARGS Default (v7.0)',
    load: () => import('./modules/ebpf-verifier.js').then(m => m.default),
  },
];

export function getAnimationsForSkill(skillName: string): AnimationRegistryEntry[] {
  return registry.filter(e => e.skillName === skillName);
}

export function hasAnimations(skillName: string): boolean {
  return registry.some(e => e.skillName === skillName);
}
