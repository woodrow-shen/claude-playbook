import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CgroupNamespaceState {
  phase: string;
  namespaces: { type: string; active: boolean }[];
  cgroupPath: string;
  resourceLimits: { memory: string; cpu: string; pids: string };
  processTree: { pid: number; name: string; cgroup: string }[];
  isolationLevel: string;
  srcRef: string;
}

function cloneState(s: CgroupNamespaceState): CgroupNamespaceState {
  return {
    phase: s.phase,
    namespaces: s.namespaces.map(ns => ({ ...ns })),
    cgroupPath: s.cgroupPath,
    resourceLimits: { ...s.resourceLimits },
    processTree: s.processTree.map(p => ({ ...p })),
    isolationLevel: s.isolationLevel,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: container-clone
// Creating a container-like process with new namespaces + cgroup
// Traces copy_process() with CLONE_NEW* flags, copy_namespaces(), cgroup_fork()
// ---------------------------------------------------------------------------
function generateContainerClone(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CgroupNamespaceState = {
    phase: 'setup',
    namespaces: [],
    cgroupPath: '/sys/fs/cgroup/system.slice',
    resourceLimits: { memory: 'unlimited', cpu: 'unlimited', pids: 'unlimited' },
    processTree: [{ pid: 1, name: 'init', cgroup: '/' }],
    isolationLevel: 'none',
    srcRef: '',
  };

  // Frame 0: Setup -- clone3 with CLONE_NEW* flags
  state.srcRef = 'kernel/fork.c:2189 (cgroup_fork in copy_process)';
  frames.push({
    step: 0,
    label: 'clone3() called with CLONE_NEW* flags',
    description: 'A container runtime calls clone3() with flags CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWCGROUP | CLONE_NEWUTS. copy_process() at kernel/fork.c begins setting up the child task_struct. At line 2189, cgroup_fork(p) initializes cgroup fields before any namespace work.',
    highlights: ['phase-setup'],
    data: cloneState(state),
  });

  // Frame 1: cgroup_fork -- init cgroup fields
  state.phase = 'cgroup-fork';
  state.srcRef = 'kernel/cgroup/cgroup.c:6656 (cgroup_fork)';
  frames.push({
    step: 1,
    label: 'cgroup_fork() initializes child cgroup fields',
    description: 'cgroup_fork() at kernel/cgroup/cgroup.c:6656 sets the child task to init_css_set via RCU_INIT_POINTER(child->cgroups, &init_css_set) at line 6658, and initializes child->cg_list at line 6659. The child is temporarily associated with the root cgroup until cgroup_post_fork() attaches it to the correct css_set.',
    highlights: ['phase-cgroup-fork'],
    data: cloneState(state),
  });

  // Frame 2: copy_namespaces begins
  state.phase = 'copy-namespaces';
  state.srcRef = 'kernel/fork.c:2265 (copy_namespaces in copy_process)';
  frames.push({
    step: 2,
    label: 'copy_namespaces() creates new namespace set',
    description: 'copy_process() calls copy_namespaces(clone_flags, p) at kernel/fork.c:2265. At kernel/nsproxy.c:169, copy_namespaces() checks if any CLONE_NS_ALL flags are set (line 175). Since we passed CLONE_NEW* flags, it calls create_new_namespaces() at line 195 to build a fresh nsproxy with new namespace instances for each requested type.',
    highlights: ['phase-copy-ns'],
    data: cloneState(state),
  });

  // Frame 3: create_new_namespaces builds nsproxy
  state.phase = 'copy-namespaces';
  state.namespaces.push({ type: 'mnt', active: true });
  state.namespaces.push({ type: 'uts', active: true });
  state.namespaces.push({ type: 'pid', active: true });
  state.srcRef = 'kernel/nsproxy.c:88-146 (create_new_namespaces)';
  frames.push({
    step: 3,
    label: 'create_new_namespaces() builds nsproxy',
    description: 'create_new_namespaces() at kernel/nsproxy.c:88 allocates a new nsproxy via create_nsproxy() (line 95), then calls copy_mnt_ns() (line 99), copy_utsname() (line 106), copy_ipcs() (line 112), copy_pid_ns() (line 118) to create each namespace. Each copy_*_ns() function checks for the corresponding CLONE_NEW* flag; if set, it creates a new namespace, otherwise it increments the refcount on the parent.',
    highlights: ['ns-mnt', 'ns-uts', 'ns-pid'],
    data: cloneState(state),
  });

  // Frame 4: copy_cgroup_ns
  state.namespaces.push({ type: 'cgroup', active: true });
  state.srcRef = 'kernel/nsproxy.c:125-126 (copy_cgroup_ns call) -> kernel/cgroup/namespace.c:48';
  frames.push({
    step: 4,
    label: 'copy_cgroup_ns() creates cgroup namespace',
    description: 'At kernel/nsproxy.c:125, copy_cgroup_ns(flags, user_ns, tsk->nsproxy->cgroup_ns) is called. In kernel/cgroup/namespace.c:48, since CLONE_NEWCGROUP is set (line 58), it checks CAP_SYS_ADMIN (line 64), increments ucounts (line 67), takes css_set_lock (line 72), captures the current css_set as root_cset (line 73-74), and allocates a new cgroup_namespace with alloc_cgroup_ns() (line 77).',
    highlights: ['ns-cgroup'],
    data: cloneState(state),
  });

  // Frame 5: copy_net_ns
  state.namespaces.push({ type: 'net', active: true });
  state.srcRef = 'kernel/nsproxy.c:132 (copy_net_ns)';
  frames.push({
    step: 5,
    label: 'copy_net_ns() creates network namespace',
    description: 'At kernel/nsproxy.c:132, copy_net_ns() creates a new network namespace. The new net_ns gets its own routing tables, iptables rules, and network device list. copy_time_ns() follows at line 138. The child task->nsproxy is set to the new nsproxy at line 203. All five requested namespaces (mnt, uts, pid, cgroup, net) are now isolated.',
    highlights: ['ns-net'],
    data: cloneState(state),
  });

  // Frame 6: cgroup_can_fork validation
  state.phase = 'cgroup-can-fork';
  state.isolationLevel = 'partial';
  state.srcRef = 'kernel/fork.c:2366 (cgroup_can_fork) -> kernel/cgroup/cgroup.c:6853';
  frames.push({
    step: 6,
    label: 'cgroup_can_fork() validates subsystem constraints',
    description: 'Back in copy_process() at kernel/fork.c:2366, cgroup_can_fork(p, args) is called. At kernel/cgroup/cgroup.c:6853, it first calls cgroup_css_set_fork() (line 6858) to find or create the target css_set. Then it iterates subsystems with can_fork callbacks (line 6862-6866) -- e.g., the pids controller checks if the cgroup pids.max limit would be exceeded. If any subsystem denies the fork, copy_process() aborts.',
    highlights: ['phase-can-fork'],
    data: cloneState(state),
  });

  // Frame 7: sched_cgroup_fork
  state.phase = 'sched-fork';
  state.processTree.push({ pid: 2, name: 'container-init', cgroup: '/container' });
  state.srcRef = 'kernel/fork.c:2379 (sched_cgroup_fork)';
  frames.push({
    step: 7,
    label: 'sched_cgroup_fork() places task on runqueue',
    description: 'At kernel/fork.c:2379, sched_cgroup_fork(p, args) places the new task on the correct CPU runqueue. This must happen after cgroup_can_fork() pins the css_set, but before the task becomes visible. The child is associated with the target cgroup cpu controller, ensuring CPU bandwidth limits apply from the first schedule.',
    highlights: ['process-tree'],
    data: cloneState(state),
  });

  // Frame 8: cgroup_post_fork finalizes
  state.phase = 'post-fork';
  state.isolationLevel = 'full';
  state.cgroupPath = '/sys/fs/cgroup/container';
  state.resourceLimits = { memory: '512M', cpu: '200%', pids: '256' };
  state.srcRef = 'kernel/fork.c:2526 (cgroup_post_fork) -> kernel/cgroup/cgroup.c:6920-6941';
  frames.push({
    step: 8,
    label: 'cgroup_post_fork() attaches child to css_set',
    description: 'At kernel/fork.c:2526, cgroup_post_fork(p, args) finalizes cgroup attachment. At kernel/cgroup/cgroup.c:6927, it takes css_set_lock, then at line 6941 calls css_set_move_task(child, NULL, cset, false) to move the child from init_css_set to the target css_set. The child is now fully isolated: new pid/mnt/net/uts/cgroup namespaces, attached to its own cgroup hierarchy with resource limits.',
    highlights: ['phase-post-fork'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: cgroup-namespace-view
// How cgroupns provides virtualized cgroup paths
// ---------------------------------------------------------------------------
function generateCgroupNamespaceView(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CgroupNamespaceState = {
    phase: 'setup',
    namespaces: [{ type: 'cgroup', active: false }],
    cgroupPath: '/sys/fs/cgroup/system.slice/docker/abc123',
    resourceLimits: { memory: '1G', cpu: '400%', pids: '512' },
    processTree: [
      { pid: 1, name: 'init', cgroup: '/' },
      { pid: 100, name: 'dockerd', cgroup: '/system.slice/docker' },
    ],
    isolationLevel: 'none',
    srcRef: '',
  };

  // Frame 0: Host view of cgroup hierarchy
  state.srcRef = 'kernel/cgroup/cgroup.c:1897 (cgroup_show_path)';
  frames.push({
    step: 0,
    label: 'Host sees full cgroup hierarchy',
    description: 'From the host (init cgroup namespace), /proc/self/cgroup shows the full path in the cgroup hierarchy. cgroup_show_path() at kernel/cgroup/cgroup.c:1897 computes the path relative to the namespace root. In the init namespace, this is the absolute path from the cgroup root.',
    highlights: ['cgroup-path'],
    data: cloneState(state),
  });

  // Frame 1: unshare(CLONE_NEWCGROUP) called
  state.phase = 'unshare';
  state.srcRef = 'kernel/cgroup/namespace.c:48 (copy_cgroup_ns)';
  frames.push({
    step: 1,
    label: 'unshare(CLONE_NEWCGROUP) requested',
    description: 'The container runtime calls unshare(CLONE_NEWCGROUP) or clone3() with CLONE_NEWCGROUP. This enters copy_cgroup_ns() at kernel/cgroup/namespace.c:48. The function checks for CLONE_NEWCGROUP at line 58 -- if not set, it simply increments the refcount and returns the existing namespace.',
    highlights: ['phase-unshare'],
    data: cloneState(state),
  });

  // Frame 2: CAP_SYS_ADMIN check
  state.phase = 'cap-check';
  state.srcRef = 'kernel/cgroup/namespace.c:64 (ns_capable CAP_SYS_ADMIN)';
  frames.push({
    step: 2,
    label: 'CAP_SYS_ADMIN capability check',
    description: 'At kernel/cgroup/namespace.c:64, ns_capable(user_ns, CAP_SYS_ADMIN) verifies the caller has sufficient privilege to create a new cgroup namespace. Without CAP_SYS_ADMIN, the call returns -EPERM. inc_cgroup_namespaces() at line 67 increments the per-user namespace count, checked against the UCOUNT_CGROUP_NAMESPACES rlimit.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: Capture current css_set as root
  state.phase = 'cgns-create';
  state.namespaces = [{ type: 'cgroup', active: true }];
  state.srcRef = 'kernel/cgroup/namespace.c:72-86 (css_set capture and alloc)';
  frames.push({
    step: 3,
    label: 'Capture current css_set as namespace root',
    description: 'At kernel/cgroup/namespace.c:72, spin_lock_irq(&css_set_lock) is taken. task_css_set(current) at line 73 gets the current task css_set, and get_css_set(cset) at line 74 increments its refcount. alloc_cgroup_ns() at line 77 allocates the new namespace. The key assignment is new_ns->root_cset = cset at line 86 -- this css_set becomes the "root" of the new namespace, defining what the container sees as "/".',
    highlights: ['ns-cgroup'],
    data: cloneState(state),
  });

  // Frame 4: cgroup_show_path with namespace
  state.phase = 'path-virtualize';
  state.cgroupPath = '/';
  state.processTree.push({ pid: 1000, name: 'container-sh', cgroup: '/' });
  state.isolationLevel = 'partial';
  state.srcRef = 'kernel/cgroup/cgroup.c:1897-1922 (cgroup_show_path)';
  frames.push({
    step: 4,
    label: 'cgroup_show_path() virtualizes paths',
    description: 'When the container reads /proc/self/cgroup, cgroup_show_path() at kernel/cgroup/cgroup.c:1897 is called. At line 1910, it calls current_cgns_cgroup_from_root(kf_cgroot) to get the namespace root cgroup. At line 1911, kernfs_path_from_node(kf_node, ns_cgroup->kn, buf, PATH_MAX) computes the path RELATIVE to the namespace root. The container sees "/" instead of "/system.slice/docker/abc123".',
    highlights: ['cgroup-path'],
    data: cloneState(state),
  });

  // Frame 5: current_cgns_cgroup_from_root
  state.phase = 'cgns-resolve';
  state.srcRef = 'kernel/cgroup/cgroup.c:1418-1438 (current_cgns_cgroup_from_root)';
  frames.push({
    step: 5,
    label: 'current_cgns_cgroup_from_root() resolves namespace root',
    description: 'current_cgns_cgroup_from_root() at kernel/cgroup/cgroup.c:1418 finds the namespace root cgroup for the given hierarchy. It reads current->nsproxy->cgroup_ns->root_cset at line 1427 under RCU protection, then calls __cset_cgroup_from_root(cset, root) at line 1428 to find which cgroup in the specified hierarchy corresponds to this css_set. The result is the cgroup that appears as "/" to the containerized process.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 6: Nested cgroup creation inside namespace
  state.phase = 'nested-cgroup';
  state.cgroupPath = '/app';
  state.processTree.push({ pid: 1001, name: 'app', cgroup: '/app' });
  state.srcRef = 'kernel/cgroup/cgroup.c:1897-1911 (nested path relative to cgns root)';
  frames.push({
    step: 6,
    label: 'Nested cgroups appear relative to namespace root',
    description: 'When the container creates a sub-cgroup (e.g., /app), the kernel stores it at the real path /system.slice/docker/abc123/app. But cgroup_show_path() at line 1911 computes kernfs_path_from_node relative to ns_cgroup->kn (the namespace root). The container sees "/app" while the host sees "/system.slice/docker/abc123/app". This virtualization is read-only -- the kernel always tracks the full hierarchy internally.',
    highlights: ['cgroup-path'],
    data: cloneState(state),
  });

  // Frame 7: Security boundary
  state.phase = 'security';
  state.isolationLevel = 'full';
  state.srcRef = 'kernel/cgroup/namespace.c:92-99 (cgroupns_install permission check)';
  frames.push({
    step: 7,
    label: 'Namespace prevents cgroup escape',
    description: 'cgroupns_install() at kernel/cgroup/namespace.c:92 enforces that setns() into a cgroup namespace requires CAP_SYS_ADMIN in both the caller user_ns (line 97) and the target cgroup_ns->user_ns (line 98). A containerized process cannot traverse above its namespace root -- kernfs_path_from_node returns paths relative to ns_cgroup->kn, making parent cgroups invisible.',
    highlights: ['phase-security'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: resource-isolation
// Combined cgroup resource limits + namespace isolation
// ---------------------------------------------------------------------------
function generateResourceIsolation(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CgroupNamespaceState = {
    phase: 'setup',
    namespaces: [
      { type: 'pid', active: true },
      { type: 'net', active: true },
      { type: 'mnt', active: true },
    ],
    cgroupPath: '/sys/fs/cgroup/containers/web-app',
    resourceLimits: { memory: 'unlimited', cpu: 'unlimited', pids: 'unlimited' },
    processTree: [
      { pid: 1, name: 'init', cgroup: '/' },
      { pid: 500, name: 'containerd', cgroup: '/system.slice' },
    ],
    isolationLevel: 'partial',
    srcRef: '',
  };

  // Frame 0: Container runtime writes cgroup limits
  state.srcRef = 'kernel/cgroup/cgroup.c:2959 (cgroup_attach_task)';
  frames.push({
    step: 0,
    label: 'Container runtime configures resource limits',
    description: 'Before spawning the container process, the runtime writes to cgroup control files: memory.max, cpu.max, pids.max. These are stored in the cgroup hierarchy under /containers/web-app. The runtime will then use cgroup_attach_task() to move the container process into this cgroup, applying the resource limits.',
    highlights: ['resource-limits'],
    data: cloneState(state),
  });

  // Frame 1: cgroup_attach_task migration setup
  state.phase = 'cgroup-attach';
  state.resourceLimits = { memory: '512M', cpu: '100000 100000', pids: '128' };
  state.srcRef = 'kernel/cgroup/cgroup.c:2959-2987 (cgroup_attach_task)';
  frames.push({
    step: 1,
    label: 'cgroup_attach_task() begins migration',
    description: 'cgroup_attach_task() at kernel/cgroup/cgroup.c:2959 moves a task to the target cgroup. At line 2967, spin_lock_irq(&css_set_lock) is taken. The loop at lines 2968-2973 calls cgroup_migrate_add_src(task_css_set(task), dst_cgrp, &mgctx) for each thread (if threadgroup=true). This records the source css_sets that need migration.',
    highlights: ['phase-attach'],
    data: cloneState(state),
  });

  // Frame 2: cgroup_migrate_prepare_dst
  state.phase = 'migrate-prepare';
  state.srcRef = 'kernel/cgroup/cgroup.c:2977-2979 (cgroup_migrate_prepare_dst, cgroup_migrate)';
  frames.push({
    step: 2,
    label: 'Prepare destination css_sets',
    description: 'cgroup_migrate_prepare_dst(&mgctx) at line 2977 finds or allocates destination css_sets for each source css_set. It calls find_css_set() which looks up the css_set hash table for an existing css_set matching the target cgroup combination. If none exists, a new css_set is allocated. Then cgroup_migrate() at line 2979 performs the actual task movement.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: css_set_move_task
  state.phase = 'css-set-move';
  state.processTree.push({ pid: 1000, name: 'web-app', cgroup: '/containers/web-app' });
  state.srcRef = 'kernel/cgroup/cgroup.c:858-870 (css_set_move_task) called from line 2667';
  frames.push({
    step: 3,
    label: 'css_set_move_task() transfers task between css_sets',
    description: 'css_set_move_task() at kernel/cgroup/cgroup.c:858 is called from cgroup_migrate() at line 2667. It requires css_set_lock (line 862). If the destination css_set was not previously populated, css_set_update_populated() at line 865 is called to update ancestor populated counts. The task is moved from from_cset to to_cset, updating cg_list linkage. cgroup_freezer_migrate_task() at line 2673 handles frozen cgroup transitions.',
    highlights: ['phase-css-move'],
    data: cloneState(state),
  });

  // Frame 4: pid namespace provides PID isolation
  state.phase = 'pid-isolation';
  state.srcRef = 'kernel/nsproxy.c:118-123 (copy_pid_ns in create_new_namespaces)';
  frames.push({
    step: 4,
    label: 'PID namespace isolates process view',
    description: 'The pid namespace (created via copy_pid_ns at kernel/nsproxy.c:118) gives the container its own PID numbering. The web-app process sees itself as PID 1 inside the container, while the host sees it as PID 1000. The pids cgroup controller (pids.max=128) limits how many processes can exist in the cgroup, regardless of the pid namespace virtual numbering.',
    highlights: ['ns-pid'],
    data: cloneState(state),
  });

  // Frame 5: net namespace + cgroup bandwidth
  state.phase = 'net-isolation';
  state.srcRef = 'kernel/nsproxy.c:132 (copy_net_ns)';
  frames.push({
    step: 5,
    label: 'Network namespace + CPU bandwidth control',
    description: 'The net namespace (copy_net_ns at kernel/nsproxy.c:132) gives the container isolated network interfaces, routing, and iptables. The cpu cgroup controller enforces cpu.max (100000 100000 = 100% of one CPU). Together, the mnt namespace provides filesystem isolation, net namespace provides network isolation, and cgroup controllers enforce resource limits -- the three pillars of container isolation.',
    highlights: ['ns-net'],
    data: cloneState(state),
  });

  // Frame 6: Memory cgroup enforcement
  state.phase = 'memory-enforce';
  state.srcRef = 'kernel/cgroup/cgroup.c:6853 (cgroup_can_fork checks pids.max)';
  frames.push({
    step: 6,
    label: 'Memory cgroup limits container allocation',
    description: 'The memory controller enforces memory.max=512M. When the container allocates memory, mem_cgroup_charge() checks the cgroup memory usage against the limit. If exceeded, the kernel triggers direct reclaim or invokes the OOM killer scoped to the cgroup. cgroup_can_fork() at kernel/cgroup/cgroup.c:6853 also checks pids controller limits -- if pids.current >= pids.max, fork() returns -EAGAIN.',
    highlights: ['resource-limits'],
    data: cloneState(state),
  });

  // Frame 7: Complete isolation view
  state.phase = 'complete';
  state.isolationLevel = 'full';
  state.namespaces.push({ type: 'cgroup', active: true });
  state.resourceLimits = { memory: '512M', cpu: '100%', pids: '128' };
  state.srcRef = 'kernel/nsproxy.c:169-205 (copy_namespaces complete) + kernel/cgroup/cgroup.c:2959 (cgroup_attach_task)';
  frames.push({
    step: 7,
    label: 'Full container isolation achieved',
    description: 'The container is now fully isolated. Namespaces provide visibility isolation (pid: own PID space, net: own network stack, mnt: own filesystem view, cgroup: virtualized cgroup paths). Cgroup controllers provide resource isolation (memory.max=512M, cpu.max=100%, pids.max=128). copy_namespaces() at kernel/nsproxy.c:169 created the namespace boundary; cgroup_attach_task() at kernel/cgroup/cgroup.c:2959 enforces the resource boundary.',
    highlights: ['phase-complete'],
    data: cloneState(state),
  });

  // Frame 8: Runtime enforcement loop
  state.phase = 'enforcement';
  state.srcRef = 'kernel/cgroup/cgroup.c:6941 (css_set_move_task in cgroup_post_fork)';
  frames.push({
    step: 8,
    label: 'Ongoing enforcement for child processes',
    description: 'When the container forks child processes, cgroup_post_fork() at kernel/cgroup/cgroup.c:6941 calls css_set_move_task(child, NULL, cset, false) to inherit the parent cgroup. Children are born into the same namespaces (inherited via copy_namespaces at kernel/fork.c:2265) and same cgroup (via cgroup_post_fork). Resource limits and namespace isolation persist across the entire process subtree.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const NS_COLORS: Record<string, string> = {
  pid: '#da3633',
  net: '#58a6ff',
  mnt: '#3fb950',
  uts: '#d29922',
  cgroup: '#bc8cff',
};

const PHASE_LABELS = [
  { id: 'setup', label: 'Setup' },
  { id: 'cgroup-fork', label: 'CgFork' },
  { id: 'copy-namespaces', label: 'CopyNS' },
  { id: 'cgroup-can-fork', label: 'CanFork' },
  { id: 'post-fork', label: 'PostFork' },
  { id: 'complete', label: 'Complete' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'setup': return 0;
    case 'cgroup-fork': return 1;
    case 'copy-namespaces': return 2;
    case 'unshare': return 2;
    case 'cap-check': return 2;
    case 'cgns-create': return 2;
    case 'cgroup-can-fork': return 3;
    case 'cgroup-attach': return 3;
    case 'migrate-prepare': return 3;
    case 'css-set-move': return 3;
    case 'pid-isolation': return 4;
    case 'net-isolation': return 4;
    case 'memory-enforce': return 4;
    case 'sched-fork': return 3;
    case 'path-virtualize': return 4;
    case 'cgns-resolve': return 4;
    case 'nested-cgroup': return 4;
    case 'security': return 5;
    case 'post-fork': return 4;
    case 'complete': return 5;
    case 'enforcement': return 5;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as CgroupNamespaceState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Container Runtime Isolation';
  container.appendChild(title);

  // --- Phase flow diagram ---
  const flowTop = margin.top + 28;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(100, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isActive) {
      blockClass += ' anim-block-allocated anim-highlight';
    } else if (isPast) {
      blockClass += ' anim-block-allocated';
    } else {
      blockClass += ' anim-block-free';
    }
    rect.setAttribute('class', blockClass);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(px + phaseWidth / 2));
    label.setAttribute('y', String(flowTop + phaseHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = phase.label;
    container.appendChild(label);

    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = flowTop + phaseHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 6));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);
    }
  });

  // --- Namespace boxes ---
  const nsTop = flowTop + phaseHeight + 20;
  const nsBoxWidth = 70;
  const nsBoxHeight = 30;

  data.namespaces.forEach((ns, i) => {
    const nx = margin.left + i * (nsBoxWidth + 8);
    const color = NS_COLORS[ns.type] || '#8b949e';

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(nx));
    rect.setAttribute('y', String(nsTop));
    rect.setAttribute('width', String(nsBoxWidth));
    rect.setAttribute('height', String(nsBoxHeight));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', ns.active ? color : '#21262d');
    rect.setAttribute('opacity', ns.active ? '0.9' : '0.4');
    let nsCls = 'anim-namespace';
    if (frame.highlights.includes(`ns-${ns.type}`)) nsCls += ' anim-highlight';
    rect.setAttribute('class', nsCls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(nx + nsBoxWidth / 2));
    label.setAttribute('y', String(nsTop + nsBoxHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#e6edf3');
    label.setAttribute('font-size', '10');
    label.setAttribute('class', 'anim-namespace');
    label.textContent = ns.type.toUpperCase();
    container.appendChild(label);
  });

  // --- Cgroup path display ---
  const pathTop = nsTop + nsBoxHeight + 16;
  const pathLabel = document.createElementNS(NS, 'text');
  pathLabel.setAttribute('x', String(margin.left));
  pathLabel.setAttribute('y', String(pathTop));
  pathLabel.setAttribute('fill', '#8b949e');
  pathLabel.setAttribute('font-size', '11');
  pathLabel.setAttribute('class', 'anim-cgroup-path');
  pathLabel.textContent = `cgroup path: ${data.cgroupPath}`;
  container.appendChild(pathLabel);

  // --- Resource limits ---
  const limTop = pathTop + 18;
  const limits = [
    { name: 'memory', value: data.resourceLimits.memory },
    { name: 'cpu', value: data.resourceLimits.cpu },
    { name: 'pids', value: data.resourceLimits.pids },
  ];

  limits.forEach((lim, i) => {
    const lx = margin.left + i * 140;
    const isHighlighted = frame.highlights.includes('resource-limits');

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(lx));
    rect.setAttribute('y', String(limTop));
    rect.setAttribute('width', '130');
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', isHighlighted ? '#1f6feb' : '#21262d');
    let limCls = 'anim-resource-limit';
    if (isHighlighted) limCls += ' anim-highlight';
    rect.setAttribute('class', limCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(lx + 4));
    text.setAttribute('y', String(limTop + 13));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-resource-limit');
    text.textContent = `${lim.name}: ${lim.value}`;
    container.appendChild(text);
  });

  // --- Process tree ---
  const procTop = limTop + 30;
  const procLabel = document.createElementNS(NS, 'text');
  procLabel.setAttribute('x', String(margin.left));
  procLabel.setAttribute('y', String(procTop));
  procLabel.setAttribute('class', 'anim-cpu-label');
  procLabel.textContent = 'Process Tree:';
  container.appendChild(procLabel);

  const procEntryHeight = 20;
  const procEntryWidth = 260;

  data.processTree.forEach((proc, i) => {
    const py = procTop + 8 + i * (procEntryHeight + 2);
    const px = margin.left + i * 12;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(py));
    rect.setAttribute('width', String(procEntryWidth));
    rect.setAttribute('height', String(procEntryHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', i === 0 ? '#1a3a1a' : '#1f4068');
    rect.setAttribute('opacity', '0.8');
    let procCls = 'anim-process';
    if (frame.highlights.includes('process-tree') && i === data.processTree.length - 1) {
      procCls += ' anim-highlight';
    }
    rect.setAttribute('class', procCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(px + 6));
    text.setAttribute('y', String(py + procEntryHeight / 2 + 4));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-process');
    text.textContent = `PID ${proc.pid}: ${proc.name} [${proc.cgroup}]`;
    container.appendChild(text);
  });

  // --- Isolation level indicator ---
  const isoTop = margin.top + 28;
  const isoLeft = width - margin.right - 140;
  const isoColors: Record<string, string> = {
    none: '#8b949e',
    partial: '#d29922',
    full: '#3fb950',
  };

  const isoRect = document.createElementNS(NS, 'rect');
  isoRect.setAttribute('x', String(isoLeft));
  isoRect.setAttribute('y', String(isoTop));
  isoRect.setAttribute('width', '130');
  isoRect.setAttribute('height', String(phaseHeight));
  isoRect.setAttribute('rx', '6');
  isoRect.setAttribute('fill', isoColors[data.isolationLevel] || '#8b949e');
  isoRect.setAttribute('class', 'anim-isolation');
  container.appendChild(isoRect);

  const isoText = document.createElementNS(NS, 'text');
  isoText.setAttribute('x', String(isoLeft + 65));
  isoText.setAttribute('y', String(isoTop + 18));
  isoText.setAttribute('text-anchor', 'middle');
  isoText.setAttribute('fill', '#e6edf3');
  isoText.setAttribute('font-size', '11');
  isoText.setAttribute('class', 'anim-isolation');
  isoText.textContent = `Isolation: ${data.isolationLevel}`;
  container.appendChild(isoText);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'container-clone', label: 'Container Clone (clone3 + namespaces)' },
  { id: 'cgroup-namespace-view', label: 'Cgroup Namespace View (path virtualization)' },
  { id: 'resource-isolation', label: 'Resource Isolation (cgroup + namespaces)' },
];

const cgroupNamespace: AnimationModule = {
  config: {
    id: 'cgroup-namespace',
    title: 'Container Runtime Isolation',
    skillName: 'cgroups-and-namespaces',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'cgroup-namespace-view': return generateCgroupNamespaceView();
      case 'resource-isolation': return generateResourceIsolation();
      case 'container-clone':
      default: return generateContainerClone();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default cgroupNamespace;
