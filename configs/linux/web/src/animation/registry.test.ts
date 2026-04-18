import { describe, it, expect } from 'vitest';
import { getAnimationsForSkill, hasAnimations } from './registry.js';

describe('animation registry', () => {
  it('returns empty array for skills without animations', () => {
    expect(getAnimationsForSkill('nonexistent-skill')).toEqual([]);
  });

  it('hasAnimations returns false for unknown skills', () => {
    expect(hasAnimations('nonexistent-skill')).toBe(false);
  });

  it('returns entries for page-allocation (buddy + page-table-walk)', () => {
    const entries = getAnimationsForSkill('page-allocation');
    expect(entries.length).toBe(2);
    const ids = entries.map(e => e.moduleId);
    expect(ids).toContain('buddy-allocator');
    expect(ids).toContain('page-table-walk');
  });

  it('returns entries for page-reclaim-and-swap', () => {
    const entries = getAnimationsForSkill('page-reclaim-and-swap');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('page-reclaim');
  });

  it('returns entries for slab-allocator', () => {
    const entries = getAnimationsForSkill('slab-allocator');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('slab-allocator');
  });

  it('returns entries for scheduler-fundamentals (cfs + eevdf)', () => {
    const entries = getAnimationsForSkill('scheduler-fundamentals');
    expect(entries.length).toBe(2);
    const ids = entries.map(e => e.moduleId);
    expect(ids).toContain('cfs-scheduler');
    expect(ids).toContain('eevdf-scheduler');
  });

  it('returns entries for process-lifecycle (cow-fork + elf-loader)', () => {
    const entries = getAnimationsForSkill('process-lifecycle');
    expect(entries.length).toBe(2);
    const ids = entries.map(e => e.moduleId);
    expect(ids).toContain('cow-fork');
    expect(ids).toContain('elf-loader');
  });

  it('returns entries for spinlocks-and-mutexes (spinlock-mutex + qspinlock)', () => {
    const entries = getAnimationsForSkill('spinlocks-and-mutexes');
    expect(entries.length).toBe(2);
    const ids = entries.map(e => e.moduleId);
    expect(ids).toContain('spinlock-mutex');
    expect(ids).toContain('qspinlock');
  });

  it('returns entries for rcu-fundamentals', () => {
    const entries = getAnimationsForSkill('rcu-fundamentals');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('rcu-grace-period');
  });

  it('returns entries for vfs-layer', () => {
    const entries = getAnimationsForSkill('vfs-layer');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('vfs-lookup');
  });

  it('returns entries for socket-layer', () => {
    const entries = getAnimationsForSkill('socket-layer');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('network-packet');
  });

  it('returns entries for interrupt-handling', () => {
    const entries = getAnimationsForSkill('interrupt-handling');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('interrupt-flow');
  });

  it('returns entries for boot-and-init', () => {
    const entries = getAnimationsForSkill('boot-and-init');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('boot-sequence');
  });

  it('returns entries for system-calls', () => {
    const entries = getAnimationsForSkill('system-calls');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('syscall-flow');
  });

  it('returns entries for kernel-modules', () => {
    const entries = getAnimationsForSkill('kernel-modules');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('module-lifecycle');
  });

  it('returns entries for character-devices', () => {
    const entries = getAnimationsForSkill('character-devices');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('chardev-ops');
  });

  it('returns entries for lsm-framework', () => {
    const entries = getAnimationsForSkill('lsm-framework');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('lsm-hooks');
  });

  it('returns entries for page-fault-handling', () => {
    const entries = getAnimationsForSkill('page-fault-handling');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('page-fault');
  });

  it('returns entries for context-switching', () => {
    const entries = getAnimationsForSkill('context-switching');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('context-switching');
  });

  it('returns entries for tcp-state-machine', () => {
    const entries = getAnimationsForSkill('tcp-state-machine');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('tcp-state-machine');
  });

  it('returns entries for epoll-internals', () => {
    const entries = getAnimationsForSkill('epoll-internals');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('epoll-internals');
  });

  it('returns entries for io-uring', () => {
    const entries = getAnimationsForSkill('io-uring');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('io-uring');
  });

  it('returns entries for kvm-fundamentals', () => {
    const entries = getAnimationsForSkill('kvm-fundamentals');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('kvm-entry-exit');
  });

  it('returns entries for namespaces', () => {
    const entries = getAnimationsForSkill('namespaces');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('namespace-isolation');
  });

  it('returns entries for signals-and-ipc', () => {
    const entries = getAnimationsForSkill('signals-and-ipc');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('signal-delivery');
  });

  it('returns entries for futex-and-locking', () => {
    const entries = getAnimationsForSkill('futex-and-locking');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('futex-wait-wake');
  });

  it('returns entries for lockdep-validation', () => {
    const entries = getAnimationsForSkill('lockdep-validation');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('lockdep-graph');
  });

  it('returns entries for ext4-internals', () => {
    const entries = getAnimationsForSkill('ext4-internals');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('ext4-extent-journal');
  });

  it('returns entries for cgroups-v2', () => {
    const entries = getAnimationsForSkill('cgroups-v2');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('cgroup-hierarchy');
  });

  it('returns entries for block-device-layer', () => {
    const entries = getAnimationsForSkill('block-device-layer');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('block-io-path');
  });

  it('returns entries for netfilter-and-nftables', () => {
    const entries = getAnimationsForSkill('netfilter-and-nftables');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('netfilter-hooks');
  });

  it('returns entries for pipe-and-fifo', () => {
    const entries = getAnimationsForSkill('pipe-and-fifo');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('pipe-ring-buffer');
  });

  it('returns entries for tcp-congestion-control', () => {
    const entries = getAnimationsForSkill('tcp-congestion-control');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('tcp-congestion');
  });

  it('returns entries for page-cache-and-readahead', () => {
    const entries = getAnimationsForSkill('page-cache-and-readahead');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('page-cache-readahead');
  });

  it('returns entries for rt-and-deadline-scheduling', () => {
    const entries = getAnimationsForSkill('rt-and-deadline-scheduling');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('rt-deadline-sched');
  });

  it('returns entries for timers-and-hrtimers', () => {
    const entries = getAnimationsForSkill('timers-and-hrtimers');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('timer-hrtimer');
  });

  it('returns entries for ebpf-programs', () => {
    const entries = getAnimationsForSkill('ebpf-programs');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('ebpf-verifier');
  });

  it('returns entries for memcg-and-oom', () => {
    const entries = getAnimationsForSkill('memcg-and-oom');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('memcg-oom');
  });

  it('returns entries for seccomp-filters', () => {
    const entries = getAnimationsForSkill('seccomp-filters');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('seccomp-bpf');
  });

  it('returns entries for kvm-memory-virtualization', () => {
    const entries = getAnimationsForSkill('kvm-memory-virtualization');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('kvm-ept-walk');
  });

  it('returns entries for virtio-framework', () => {
    const entries = getAnimationsForSkill('virtio-framework');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('virtio-vring');
  });

  it('returns entries for virtual-memory-areas', () => {
    const entries = getAnimationsForSkill('virtual-memory-areas');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('vma-operations');
  });

  it('returns entries for ftrace-and-kprobes', () => {
    const entries = getAnimationsForSkill('ftrace-and-kprobes');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('ftrace-kprobe');
  });

  it('returns entries for kbuild-and-kconfig', () => {
    const entries = getAnimationsForSkill('kbuild-and-kconfig');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('kbuild-kconfig');
  });

  it('returns entries for rmap-and-folio', () => {
    const entries = getAnimationsForSkill('rmap-and-folio');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('rmap-folio');
  });

  it('returns entries for rwsem-and-percpu', () => {
    const entries = getAnimationsForSkill('rwsem-and-percpu');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('rwsem-percpu');
  });

  it('returns entries for cpu-topology-and-load-balancing', () => {
    const entries = getAnimationsForSkill('cpu-topology-and-load-balancing');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('cpu-load-balance');
  });

  it('returns entries for sched-ext', () => {
    const entries = getAnimationsForSkill('sched-ext');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('sched-ext');
  });

  it('returns entries for dcache-and-inode-cache', () => {
    const entries = getAnimationsForSkill('dcache-and-inode-cache');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('dcache-inode');
  });

  it('returns entries for sk-buff-lifecycle', () => {
    const entries = getAnimationsForSkill('sk-buff-lifecycle');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('skbuff-lifecycle');
  });

  it('returns entries for device-model-and-sysfs', () => {
    const entries = getAnimationsForSkill('device-model-and-sysfs');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('device-sysfs');
  });

  it('returns entries for pci-and-dma', () => {
    const entries = getAnimationsForSkill('pci-and-dma');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('pci-dma');
  });

  it('returns entries for capabilities-and-credentials', () => {
    const entries = getAnimationsForSkill('capabilities-and-credentials');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('capabilities-cred');
  });

  it('returns entries for crypto-api', () => {
    const entries = getAnimationsForSkill('crypto-api');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('crypto-api');
  });

  it('returns entries for waitqueue-and-completion', () => {
    const entries = getAnimationsForSkill('waitqueue-and-completion');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('waitqueue-completion');
  });

  it('returns entries for cgroups-and-namespaces', () => {
    const entries = getAnimationsForSkill('cgroups-and-namespaces');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('cgroup-namespace');
  });

  it('returns entries for seccomp-and-sandboxing', () => {
    const entries = getAnimationsForSkill('seccomp-and-sandboxing');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('seccomp-sandbox');
  });

  it('returns entries for ebpf-maps-and-helpers', () => {
    const entries = getAnimationsForSkill('ebpf-maps-and-helpers');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('ebpf-maps');
  });

  it('returns entries for perf-events', () => {
    const entries = getAnimationsForSkill('perf-events');
    expect(entries.length).toBe(1);
    expect(entries[0].moduleId).toBe('perf-events');
  });

  it('hasAnimations returns true for all animated skills', () => {
    const animatedSkills = [
      'page-allocation', 'slab-allocator', 'scheduler-fundamentals',
      'process-lifecycle', 'spinlocks-and-mutexes', 'vfs-layer',
      'socket-layer', 'interrupt-handling',
      'boot-and-init', 'system-calls', 'kernel-modules',
      'character-devices', 'lsm-framework',
      'page-fault-handling', 'context-switching', 'tcp-state-machine',
      'epoll-internals', 'io-uring', 'kvm-fundamentals', 'namespaces',
      'signals-and-ipc', 'futex-and-locking', 'lockdep-validation',
      'ext4-internals', 'cgroups-v2', 'block-device-layer', 'netfilter-and-nftables',
      'pipe-and-fifo', 'tcp-congestion-control', 'page-cache-and-readahead',
      'rt-and-deadline-scheduling', 'timers-and-hrtimers', 'ebpf-programs',
      'memcg-and-oom', 'seccomp-filters', 'kvm-memory-virtualization',
      'virtio-framework', 'virtual-memory-areas', 'ftrace-and-kprobes',
      'rcu-fundamentals', 'page-reclaim-and-swap',
      'kbuild-and-kconfig', 'rmap-and-folio', 'rwsem-and-percpu',
      'cpu-topology-and-load-balancing', 'sched-ext', 'dcache-and-inode-cache',
      'sk-buff-lifecycle', 'device-model-and-sysfs', 'pci-and-dma',
      'capabilities-and-credentials', 'crypto-api', 'waitqueue-and-completion',
      'cgroups-and-namespaces', 'seccomp-and-sandboxing', 'ebpf-maps-and-helpers',
      'perf-events',
    ];
    for (const skill of animatedSkills) {
      expect(hasAnimations(skill)).toBe(true);
    }
  });

  it('each entry has required fields', () => {
    const animatedSkills = [
      'page-allocation', 'slab-allocator', 'scheduler-fundamentals',
      'process-lifecycle', 'spinlocks-and-mutexes', 'vfs-layer',
      'socket-layer', 'interrupt-handling',
      'page-fault-handling', 'context-switching', 'tcp-state-machine',
      'epoll-internals', 'io-uring', 'kvm-fundamentals', 'namespaces',
      'signals-and-ipc', 'futex-and-locking', 'lockdep-validation',
      'ext4-internals', 'cgroups-v2', 'block-device-layer', 'netfilter-and-nftables',
      'pipe-and-fifo', 'tcp-congestion-control', 'page-cache-and-readahead',
      'rt-and-deadline-scheduling', 'timers-and-hrtimers', 'ebpf-programs',
      'memcg-and-oom', 'seccomp-filters', 'kvm-memory-virtualization',
      'virtio-framework', 'virtual-memory-areas', 'ftrace-and-kprobes',
      'rcu-fundamentals', 'page-reclaim-and-swap',
      'kbuild-and-kconfig', 'rmap-and-folio', 'rwsem-and-percpu',
      'cpu-topology-and-load-balancing', 'sched-ext', 'dcache-and-inode-cache',
      'sk-buff-lifecycle', 'device-model-and-sysfs', 'pci-and-dma',
      'capabilities-and-credentials', 'crypto-api', 'waitqueue-and-completion',
      'cgroups-and-namespaces', 'seccomp-and-sandboxing', 'ebpf-maps-and-helpers',
      'perf-events',
    ];
    for (const skillName of animatedSkills) {
      const entries = getAnimationsForSkill(skillName);
      for (const entry of entries) {
        expect(entry.skillName).toBe(skillName);
        expect(entry.moduleId).toBeTruthy();
        expect(entry.title).toBeTruthy();
        expect(typeof entry.load).toBe('function');
      }
    }
  });

  it('has 61 total animation entries', () => {
    const allSkills = [
      'page-allocation', 'slab-allocator', 'scheduler-fundamentals',
      'process-lifecycle', 'spinlocks-and-mutexes', 'vfs-layer',
      'socket-layer', 'interrupt-handling',
      'boot-and-init', 'system-calls', 'kernel-modules',
      'character-devices', 'lsm-framework',
      'page-fault-handling', 'context-switching', 'tcp-state-machine',
      'epoll-internals', 'io-uring', 'kvm-fundamentals', 'namespaces',
      'signals-and-ipc', 'futex-and-locking', 'lockdep-validation',
      'ext4-internals', 'cgroups-v2', 'block-device-layer', 'netfilter-and-nftables',
      'pipe-and-fifo', 'tcp-congestion-control', 'page-cache-and-readahead',
      'rt-and-deadline-scheduling', 'timers-and-hrtimers', 'ebpf-programs',
      'memcg-and-oom', 'seccomp-filters', 'kvm-memory-virtualization',
      'virtio-framework', 'virtual-memory-areas', 'ftrace-and-kprobes',
      'rcu-fundamentals', 'page-reclaim-and-swap',
      'kbuild-and-kconfig', 'rmap-and-folio', 'rwsem-and-percpu',
      'cpu-topology-and-load-balancing', 'sched-ext', 'dcache-and-inode-cache',
      'sk-buff-lifecycle', 'device-model-and-sysfs', 'pci-and-dma',
      'capabilities-and-credentials', 'crypto-api', 'waitqueue-and-completion',
      'cgroups-and-namespaces', 'seccomp-and-sandboxing', 'ebpf-maps-and-helpers',
      'perf-events',
    ];
    let total = 0;
    for (const skill of allSkills) {
      total += getAnimationsForSkill(skill).length;
    }
    expect(total).toBe(61);
  });
});
