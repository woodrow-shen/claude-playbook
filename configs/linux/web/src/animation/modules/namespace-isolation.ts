import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface NamespaceState {
  processes: Array<{
    pid: number;
    nsPid: number | null;
    name: string;
    namespaces: string[];
  }>;
  namespaceLayers: Array<{
    type: string;
    id: number;
    parent: number | null;
  }>;
  currentFunction: string;
  phase: 'clone-entry' | 'copy-namespaces' | 'create-pid-ns' | 'create-mnt-ns' | 'create-net-ns' | 'create-user-ns' | 'switch-nsproxy' | 'running';
  srcRef: string;
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  state: NamespaceState,
): AnimationFrame {
  return {
    step,
    label,
    description,
    highlights,
    data: {
      processes: state.processes.map(p => ({ ...p, namespaces: [...p.namespaces] })),
      namespaceLayers: state.namespaceLayers.map(l => ({ ...l })),
      currentFunction: state.currentFunction,
      phase: state.phase,
      srcRef: state.srcRef,
    } satisfies NamespaceState,
  };
}

function generateCloneWithNamespacesFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Frame 0: clone3 entry -> copy_process
  const state: NamespaceState = {
    processes: [
      { pid: 1, nsPid: null, name: 'parent', namespaces: ['pid:1', 'mnt:1', 'net:1', 'uts:1', 'ipc:1', 'cgroup:1', 'time:1'] },
    ],
    namespaceLayers: [
      { type: 'pid', id: 1, parent: null },
      { type: 'mnt', id: 1, parent: null },
      { type: 'net', id: 1, parent: null },
    ],
    currentFunction: 'copy_process',
    phase: 'clone-entry',
    srcRef: 'kernel/fork.c:1967 copy_process()',
  };
  frames.push(makeFrame(
    0,
    'Entry: copy_process()',
    'clone3() with flags CLONE_NEWPID|CLONE_NEWNS|CLONE_NEWNET enters copy_process() at kernel/fork.c:1964. This is the core of process creation: it duplicates the parent task_struct via dup_task_struct(), copies credentials, signal handlers, and then proceeds to copy each namespace according to the clone flags.',
    ['copy_process'],
    state,
  ));

  // Frame 1: copy_namespaces entry
  state.currentFunction = 'copy_namespaces';
  state.phase = 'copy-namespaces';
  state.srcRef = 'kernel/nsproxy.c:167 copy_namespaces()';
  frames.push(makeFrame(
    1,
    'copy_namespaces() entry',
    'copy_process() calls copy_namespaces(clone_flags, p) at kernel/fork.c:2226. Defined at kernel/nsproxy.c:167, copy_namespaces() first checks if any CLONE_NEW* flags are set at line 173. If no new namespaces are requested and no time namespace change is pending, it simply increments the refcount on the existing nsproxy via get_nsproxy(old_ns) at line 178. Since we have CLONE_NEWPID|CLONE_NEWNS|CLONE_NEWNET, it proceeds to check ns_capable(user_ns, CAP_SYS_ADMIN) at line 181.',
    ['copy_namespaces'],
    state,
  ));

  // Frame 2: create_new_namespaces entry + nsproxy allocation
  state.currentFunction = 'create_new_namespaces';
  state.srcRef = 'kernel/nsproxy.c:87 create_new_namespaces()';
  frames.push(makeFrame(
    2,
    'create_new_namespaces() allocates nsproxy',
    'copy_namespaces() calls create_new_namespaces(flags, tsk, user_ns, tsk->fs) at kernel/nsproxy.c:195. Defined at line 87, create_new_namespaces() first allocates a new nsproxy via create_nsproxy() at line 94. The create_nsproxy() helper at line 53 calls kmem_cache_alloc(nsproxy_cachep, GFP_KERNEL) to allocate from the dedicated nsproxy slab cache initialized at line 605, then sets refcount to 1.',
    ['create_new_namespaces', 'nsproxy'],
    state,
  ));

  // Frame 3: copy_mnt_ns (CLONE_NEWNS)
  state.currentFunction = 'copy_mnt_ns';
  state.phase = 'create-mnt-ns';
  state.srcRef = 'fs/namespace.c:4230 copy_mnt_ns()';
  state.namespaceLayers.push({ type: 'mnt', id: 2, parent: 1 });
  frames.push(makeFrame(
    3,
    'copy_mnt_ns(): new mount namespace',
    'create_new_namespaces() calls copy_mnt_ns(flags, tsk->nsproxy->mnt_ns, user_ns, new_fs) at kernel/nsproxy.c:98. Defined at fs/namespace.c:4230, since CLONE_NEWNS is set, it allocates a new mount namespace via alloc_mnt_ns(user_ns, false) at line 4250. It then calls copy_tree(old, old->mnt.mnt_root, copy_flags) at line 4259 to duplicate the entire mount tree. If the user namespace differs, CL_SLAVE is added to copy_flags at line 4258, making copied mounts receive propagation events from the original.',
    ['copy_mnt_ns'],
    state,
  ));

  // Frame 4: copy_pid_ns (CLONE_NEWPID)
  state.currentFunction = 'copy_pid_ns';
  state.phase = 'create-pid-ns';
  state.srcRef = 'kernel/pid_namespace.c:175 copy_pid_ns()';
  state.namespaceLayers.push({ type: 'pid', id: 2, parent: 1 });
  frames.push(makeFrame(
    4,
    'copy_pid_ns(): new PID namespace',
    'create_new_namespaces() calls copy_pid_ns(flags, user_ns, tsk->nsproxy->pid_ns_for_children) at kernel/nsproxy.c:116-117. Defined at kernel/pid_namespace.c:175, since CLONE_NEWPID is set, it calls create_pid_namespace(user_ns, old_ns) at line 182. create_pid_namespace() at line 76 sets level = parent_pid_ns->level + 1 at line 80, allocates from pid_ns_cachep at line 96, initializes the IDR for PID allocation at line 100, and creates a per-level pid_cachep via create_pid_cachep(level) at line 102. The new namespace is stored in nsproxy->pid_ns_for_children.',
    ['copy_pid_ns', 'create_pid_namespace'],
    state,
  ));

  // Frame 5: copy_net_ns (CLONE_NEWNET)
  state.currentFunction = 'copy_net_ns';
  state.phase = 'create-net-ns';
  state.srcRef = 'net/core/net_namespace.c:551 copy_net_ns()';
  state.namespaceLayers.push({ type: 'net', id: 2, parent: 1 });
  frames.push(makeFrame(
    5,
    'copy_net_ns(): new network namespace',
    'create_new_namespaces() calls copy_net_ns(flags, user_ns, tsk->nsproxy->net_ns) at kernel/nsproxy.c:130. Defined at net/core/net_namespace.c:551, since CLONE_NEWNET is set, it allocates a new struct net via net_alloc() at line 565, initializes it with preinit_net(net, user_ns) at line 571, then calls setup_net(net) at line 581 under pernet_ops_rwsem. setup_net() iterates all registered pernet_operations to initialize per-namespace state for each network subsystem (loopback device, routing tables, netfilter rules).',
    ['copy_net_ns'],
    state,
  ));

  // Frame 6: Return to copy_namespaces, set nsproxy
  state.currentFunction = 'copy_namespaces';
  state.phase = 'switch-nsproxy';
  state.srcRef = 'kernel/nsproxy.c:195 copy_namespaces()';
  state.processes.push({
    pid: 2, nsPid: 1, name: 'child', namespaces: ['pid:2', 'mnt:2', 'net:2', 'uts:1', 'ipc:1', 'cgroup:1', 'time:1'],
  });
  frames.push(makeFrame(
    6,
    'Attach nsproxy to child task',
    'create_new_namespaces() returns the new nsproxy at kernel/nsproxy.c:144. Back in copy_namespaces() at line 195, the error is checked at line 196. If successful, timens_on_fork(new_ns, tsk) is called at line 200 for non-VM-sharing forks. Then nsproxy_ns_active_get(new_ns) at line 202 activates the namespace references, and tsk->nsproxy = new_ns at line 203 assigns the new nsproxy to the child task. The child now has its own PID, mount, and network namespaces.',
    ['nsproxy', 'child'],
    state,
  ));

  // Frame 7: copy_process continues, alloc_pid in new ns
  state.currentFunction = 'alloc_pid';
  state.phase = 'running';
  state.srcRef = 'kernel/pid.c:160 alloc_pid()';
  frames.push(makeFrame(
    7,
    'alloc_pid(): PID in new namespace',
    'After copy_namespaces() returns, copy_process() allocates the PID for the child. alloc_pid() at kernel/pid.c:160 iterates from the deepest namespace (level = ns->level) up to the root at line 239. For each level, it calls idr_alloc_cyclic(&tmp->idr, ...) at line 265 to assign a PID number. In the new PID namespace (level 1), the first process gets PID 1 as the init process. The pid->numbers[i].nr and pid->numbers[i].ns fields at lines 297-298 store the PID number for each namespace level.',
    ['alloc_pid'],
    state,
  ));

  // Frame 8: Child running with isolated namespaces
  state.currentFunction = 'switch_task_namespaces';
  state.srcRef = 'kernel/nsproxy.c:237 switch_task_namespaces()';
  frames.push(makeFrame(
    8,
    'Child running in isolated namespaces',
    'The child process is now running with isolated PID, mount, and network namespaces. It appears as PID 1 inside its PID namespace but has a different PID in the parent namespace. Its mount tree is a copy of the parent (subject to propagation rules), and its network stack is empty (only loopback). switch_task_namespaces() at kernel/nsproxy.c:237 is used for runtime namespace changes: it calls task_lock(p) at line 246, swaps p->nsproxy at line 248, and drops the old nsproxy via put_nsproxy(ns) at line 252.',
    ['child', 'isolated'],
    state,
  ));

  return frames;
}

function generatePidNamespaceNestingFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: NamespaceState = {
    processes: [
      { pid: 1, nsPid: null, name: 'init', namespaces: ['pid:0'] },
    ],
    namespaceLayers: [
      { type: 'pid', id: 0, parent: null },
    ],
    currentFunction: 'create_pid_namespace',
    phase: 'create-pid-ns',
    srcRef: 'kernel/pid_namespace.c:76 create_pid_namespace()',
  };

  // Frame 0: create_pid_namespace for level 1
  frames.push(makeFrame(
    0,
    'create_pid_namespace(): level 1',
    'A process calls clone3() with CLONE_NEWPID, triggering create_pid_namespace() at kernel/pid_namespace.c:76. The function sets level = parent_pid_ns->level + 1 at line 80, checks that the nesting does not exceed MAX_PID_NS_LEVEL at line 89, and allocates from pid_ns_cachep at line 96. The IDR is initialized at line 100 for PID number allocation within this namespace.',
    ['create_pid_namespace'],
    state,
  ));

  // Frame 1: pid_cachep creation for the new level
  state.currentFunction = 'create_pid_cachep';
  state.srcRef = 'kernel/pid_namespace.c:40 create_pid_cachep()';
  state.namespaceLayers.push({ type: 'pid', id: 1, parent: 0 });
  frames.push(makeFrame(
    1,
    'create_pid_cachep(): slab for level 1 PIDs',
    'create_pid_namespace() calls create_pid_cachep(level) at kernel/pid_namespace.c:102. Defined at line 40, this function creates a dedicated kmem_cache named "pid_<level+1>" for allocating struct pid with the correct number of upid entries. At line 53, it computes the size via struct_size_t(struct pid, numbers, level + 1). The cache is created under pid_caches_mutex at line 57 to avoid races. Each nesting level needs space for one additional upid entry to store the PID number visible at that level.',
    ['create_pid_cachep'],
    state,
  ));

  // Frame 2: namespace setup completes, parent/user_ns refs
  state.currentFunction = 'create_pid_namespace';
  state.srcRef = 'kernel/pid_namespace.c:115 create_pid_namespace()';
  frames.push(makeFrame(
    2,
    'PID namespace hierarchy links',
    'create_pid_namespace() stores the hierarchy: ns->level = level at line 115, ns->parent = get_pid_ns(parent_pid_ns) at line 116, ns->user_ns = get_user_ns(user_ns) at line 117. It sets ns->pid_allocated = PIDNS_ADDING at line 119 to indicate the namespace is accepting new PIDs. INIT_WORK(&ns->work, destroy_pid_namespace_work) at line 120 prepares the cleanup work item. The namespace is added to the ns_tree at line 126.',
    ['pid_ns_hierarchy'],
    state,
  ));

  // Frame 3: alloc_pid for the first process in new ns
  state.currentFunction = 'alloc_pid';
  state.srcRef = 'kernel/pid.c:160 alloc_pid()';
  state.processes.push({ pid: 42, nsPid: 1, name: 'child (ns init)', namespaces: ['pid:1'] });
  frames.push(makeFrame(
    3,
    'alloc_pid(): PID 1 in child namespace',
    'When the first child is forked into the new PID namespace, alloc_pid(ns, ...) at kernel/pid.c:160 allocates a struct pid from ns->pid_cachep at line 189. The allocation loop at line 239 iterates from i = ns->level down to 0, allocating a PID number at each level. At level 1 (new ns), idr_alloc_cyclic() at line 265 returns 1 since the IDR cursor starts at 0. At level 0 (init ns), a higher PID like 42 is allocated. Each number is stored in pid->numbers[i] at lines 297-298.',
    ['alloc_pid', 'pid_1'],
    state,
  ));

  // Frame 4: pid_nr_ns shows PID 1 inside
  state.currentFunction = 'pid_nr_ns';
  state.srcRef = 'kernel/pid.c:533 pid_nr_ns()';
  frames.push(makeFrame(
    4,
    'pid_nr_ns(): PID translation between namespaces',
    'pid_nr_ns(pid, ns) at kernel/pid.c:533 translates a struct pid to the numeric PID visible in a given namespace. It checks ns->level <= pid->level at line 538, then accesses upid = &pid->numbers[ns->level] at line 539 and verifies upid->ns == ns at line 540. For our child: pid_nr_ns(pid, child_ns) returns 1 (the process is PID 1 inside its namespace), while pid_nr_ns(pid, init_ns) returns 42 (the real PID in the root namespace). This dual identity is how containers see their init process.',
    ['pid_nr_ns'],
    state,
  ));

  // Frame 5: Create a nested level-2 PID namespace
  state.currentFunction = 'create_pid_namespace';
  state.phase = 'create-pid-ns';
  state.srcRef = 'kernel/pid_namespace.c:76 create_pid_namespace()';
  state.namespaceLayers.push({ type: 'pid', id: 2, parent: 1 });
  frames.push(makeFrame(
    5,
    'Nested PID namespace: level 2',
    'The PID 1 process inside level-1 namespace calls clone3(CLONE_NEWPID), creating a level-2 PID namespace. create_pid_namespace() at kernel/pid_namespace.c:76 runs again with level = 2 (line 80). A new pid_cachep is created for struct pid with 3 upid entries (one per level). The nested namespace has ns->parent pointing to the level-1 namespace at line 116. MAX_PID_NS_LEVEL (defined as 32) limits the maximum nesting depth, checked at line 89.',
    ['nested_pid_ns'],
    state,
  ));

  // Frame 6: alloc_pid in level-2 namespace
  state.currentFunction = 'alloc_pid';
  state.srcRef = 'kernel/pid.c:239 alloc_pid() IDR loop';
  state.processes.push({ pid: 100, nsPid: 1, name: 'grandchild (ns2 init)', namespaces: ['pid:2'] });
  frames.push(makeFrame(
    6,
    'alloc_pid(): triple PID allocation',
    'When a process is forked in the level-2 namespace, alloc_pid() at kernel/pid.c:160 allocates PIDs at three levels. The loop at line 239 iterates from i=2 down to i=0: at level 2 (deepest ns), idr_alloc_cyclic returns 1 (new PID 1). At level 1 (parent ns), it allocates a new PID (e.g., 2). At level 0 (root ns), it allocates another PID (e.g., 100). Each pid->numbers[i].nr at line 297 stores the respective number, and pid->numbers[i].ns at line 298 stores the namespace pointer.',
    ['alloc_pid', 'triple_pid'],
    state,
  ));

  // Frame 7: task_pid_nr_ns for multi-level translation
  state.currentFunction = '__task_pid_nr_ns';
  state.srcRef = 'include/linux/pid.h:239 task_pid_nr_ns()';
  frames.push(makeFrame(
    7,
    'Multi-level PID visibility',
    'task_pid_nr_ns(tsk, ns) at include/linux/pid.h:239 calls __task_pid_nr_ns(tsk, PIDTYPE_PID, ns) to resolve the PID visible in any ancestor namespace. For the grandchild process: in level-2 ns it is PID 1 (the namespace init), in level-1 ns it is PID 2, and in level-0 (root) ns it is PID 100. A process cannot see PIDs in child namespaces -- pid_nr_ns() returns 0 if ns->level > pid->level (line 538). This enforces the one-way visibility: parent namespaces can see child PIDs, but not vice versa.',
    ['task_pid_nr_ns', 'visibility'],
    state,
  ));

  // Frame 8: zap_pid_ns_processes for cleanup
  state.currentFunction = 'zap_pid_ns_processes';
  state.phase = 'running';
  state.srcRef = 'kernel/pid_namespace.c:192 zap_pid_ns_processes()';
  frames.push(makeFrame(
    8,
    'zap_pid_ns_processes(): namespace teardown',
    'When PID 1 in a namespace exits, zap_pid_ns_processes() at kernel/pid_namespace.c:192 tears down the entire namespace. It calls disable_pid_allocation(pid_ns) at line 201 to prevent new processes, sets SIGCHLD to SIG_IGN at line 209, then iterates the IDR sending SIGKILL to all remaining processes at lines 228-232 via group_send_sig_info(SIGKILL, ...). It waits for all children via kernel_wait4(-1, ...) at line 244, then blocks until pid_ns->pid_allocated drops to the init count at line 272. This ensures complete cleanup of the PID namespace hierarchy.',
    ['zap_pid_ns_processes'],
    state,
  ));

  return frames;
}

function generateUnshareMountNsFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: NamespaceState = {
    processes: [
      { pid: 1000, nsPid: null, name: 'process', namespaces: ['mnt:1'] },
    ],
    namespaceLayers: [
      { type: 'mnt', id: 1, parent: null },
    ],
    currentFunction: 'ksys_unshare',
    phase: 'clone-entry',
    srcRef: 'kernel/fork.c:3193 ksys_unshare()',
  };

  // Frame 0: unshare() syscall entry
  frames.push(makeFrame(
    0,
    'Entry: ksys_unshare(CLONE_NEWNS)',
    'The process calls unshare(CLONE_NEWNS). The unshare syscall at kernel/fork.c:3242 dispatches to ksys_unshare() at line 3123. Since CLONE_NEWNS is set, ksys_unshare() adds CLONE_FS to the flags at line 3152 because unsharing mount namespace must also unshare filesystem root/cwd. It then calls check_unshare_flags() at line 3154 to validate the flag combination.',
    ['ksys_unshare'],
    state,
  ));

  // Frame 1: unshare_fs and unshare_fd
  state.currentFunction = 'unshare_fs';
  state.srcRef = 'kernel/fork.c:3164 unshare_fs()';
  frames.push(makeFrame(
    1,
    'Prepare: unshare_fs()',
    'ksys_unshare() calls unshare_fs(unshare_flags, &new_fs) at kernel/fork.c:3164. Since CLONE_FS was added (implied by CLONE_NEWNS), this allocates a new fs_struct via copy_fs_struct() if the current fs_struct is shared. The fs_struct tracks the process root and current working directory. Next, unshare_fd() at line 3167 is called but since CLONE_FILES is not set, it is a no-op.',
    ['unshare_fs'],
    state,
  ));

  // Frame 2: unshare_nsproxy_namespaces
  state.currentFunction = 'unshare_nsproxy_namespaces';
  state.phase = 'copy-namespaces';
  state.srcRef = 'kernel/nsproxy.c:211 unshare_nsproxy_namespaces()';
  frames.push(makeFrame(
    2,
    'unshare_nsproxy_namespaces()',
    'ksys_unshare() calls unshare_nsproxy_namespaces(unshare_flags, &new_nsproxy, new_cred, new_fs) at kernel/fork.c:3173. Defined at kernel/nsproxy.c:211, it first checks if any namespace flags are set at line 217. It resolves the user_ns at line 222 and checks CAP_SYS_ADMIN capability at line 223. Then it calls create_new_namespaces(unshare_flags, current, user_ns, new_fs) at line 226 to create a fresh nsproxy with the new mount namespace.',
    ['unshare_nsproxy_namespaces'],
    state,
  ));

  // Frame 3: create_new_namespaces for unshare
  state.currentFunction = 'create_new_namespaces';
  state.srcRef = 'kernel/nsproxy.c:87 create_new_namespaces()';
  frames.push(makeFrame(
    3,
    'create_new_namespaces() for unshare',
    'create_new_namespaces() at kernel/nsproxy.c:87 allocates a new nsproxy via create_nsproxy() at line 94. For unshare(CLONE_NEWNS), only the mount namespace is new. copy_mnt_ns() at line 98 creates a new mount namespace, while copy_utsname() at line 104, copy_ipcs() at line 110, copy_pid_ns() at line 116, copy_cgroup_ns() at line 123, copy_net_ns() at line 130, and copy_time_ns() at line 136 all just increment refcounts on the existing namespaces since their CLONE_NEW* flags are not set.',
    ['create_new_namespaces'],
    state,
  ));

  // Frame 4: copy_mnt_ns creates new mount tree
  state.currentFunction = 'copy_mnt_ns';
  state.phase = 'create-mnt-ns';
  state.srcRef = 'fs/namespace.c:4230 copy_mnt_ns()';
  state.namespaceLayers.push({ type: 'mnt', id: 2, parent: 1 });
  frames.push(makeFrame(
    4,
    'copy_mnt_ns(): duplicate mount tree',
    'copy_mnt_ns() at fs/namespace.c:4230 is called with CLONE_NEWNS set. It allocates a new mnt_namespace via alloc_mnt_ns(user_ns, false) at line 4250. The alloc_mnt_ns() function at line 4193 calls kzalloc_obj() at line 4203, initializes ns_common at line 4212, sets up the mount RB tree at line 4222, and gets a reference on user_ns at line 4224. The copy_flags include CL_COPY_UNBINDABLE|CL_EXPIRE at line 4256.',
    ['copy_mnt_ns', 'alloc_mnt_ns'],
    state,
  ));

  // Frame 5: copy_tree duplicates mount hierarchy
  state.currentFunction = 'copy_tree';
  state.srcRef = 'fs/namespace.c:4259 copy_tree()';
  frames.push(makeFrame(
    5,
    'copy_tree(): clone mount hierarchy',
    'copy_mnt_ns() calls copy_tree(old, old->mnt.mnt_root, copy_flags) at fs/namespace.c:4259 to duplicate the entire mount tree. Each mount point is cloned with its mount options. If the caller is in a different user_ns than the source namespace, CL_SLAVE is added at line 4258, and lock_mnt_tree(new) at line 4266 makes the copied mounts locked (preventing further mount operations). The second pass at lines 4275-4294 associates each copied mount with the new namespace via mnt_add_to_ns(new_ns, q) at line 4278.',
    ['copy_tree'],
    state,
  ));

  // Frame 6: Mount propagation types
  state.currentFunction = 'copy_mnt_ns';
  state.srcRef = 'fs/namespace.c:4256 copy_flags and propagation';
  frames.push(makeFrame(
    6,
    'Mount propagation in new namespace',
    'Mount propagation determines how mount/unmount events flow between namespaces. There are four types: MS_SHARED (bidirectional propagation between peer groups), MS_SLAVE (receives events from master but does not propagate back), MS_PRIVATE (no propagation), and MS_UNBINDABLE (private + cannot be bind-mounted). When copy_tree() encounters CL_SLAVE at fs/namespace.c:4258, the new mounts become slaves of the original shared mounts. This means mounts added in the parent namespace propagate to the child, but the child mount changes are private.',
    ['propagation'],
    state,
  ));

  // Frame 7: switch_task_namespaces
  state.currentFunction = 'switch_task_namespaces';
  state.phase = 'switch-nsproxy';
  state.srcRef = 'kernel/nsproxy.c:237 switch_task_namespaces()';
  state.processes[0].namespaces = ['mnt:2'];
  frames.push(makeFrame(
    7,
    'switch_task_namespaces(): activate new nsproxy',
    'Back in ksys_unshare() at kernel/fork.c:3197, if new_nsproxy is non-NULL, it calls switch_task_namespaces(current, new_nsproxy). Defined at kernel/nsproxy.c:237, this function calls nsproxy_ns_active_get(new) at line 244 to activate the new namespace references, task_lock(p) at line 246 for safe access, swaps p->nsproxy = new at line 248, then task_unlock(p) at line 249. The old nsproxy is dropped via put_nsproxy(ns) at line 252. The process now operates in its private mount namespace.',
    ['switch_task_namespaces'],
    state,
  ));

  // Frame 8: Process in new mount namespace
  state.currentFunction = 'ksys_unshare';
  state.phase = 'running';
  state.srcRef = 'kernel/fork.c:3225 ksys_unshare() completion';
  frames.push(makeFrame(
    8,
    'Running in private mount namespace',
    'ksys_unshare() completes with perf_event_namespaces(current) at kernel/fork.c:3225 to emit a perf event for namespace changes. The process now has its own mount namespace: mount/unmount operations are visible only within this namespace (unless propagation rules apply). New mounts added in the parent namespace may still propagate to slave mounts in the child. The process can further call mount() with MS_PRIVATE to disconnect specific mount points from propagation, achieving full mount isolation as used by container runtimes.',
    ['complete'],
    state,
  ));

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'clone-with-namespaces', label: 'clone3() with CLONE_NEWPID|CLONE_NEWNS|CLONE_NEWNET' },
  { id: 'pid-namespace-nesting', label: 'Nested PID Namespace and PID Translation' },
  { id: 'unshare-mount-ns', label: 'unshare(CLONE_NEWNS): Private Mount Namespace' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as NamespaceState;
  const margin = { top: 24, right: 16, bottom: 16, left: 16 };
  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'Namespace Isolation';
  container.appendChild(titleEl);

  // Draw namespace layers as horizontal bands
  const layerCount = data.namespaceLayers.length;
  const bandHeight = Math.min(40, (usableHeight * 0.5) / Math.max(layerCount, 1));
  const bandWidth = usableWidth * 0.7;
  const bandX = margin.left + (usableWidth - bandWidth) / 2;

  for (let i = 0; i < layerCount; i++) {
    const layer = data.namespaceLayers[i];
    const y = margin.top + i * (bandHeight + 4);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(bandX));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(bandWidth));
    rect.setAttribute('height', String(bandHeight));
    rect.setAttribute('rx', '4');
    const cls = frame.highlights.includes(layer.type)
      ? 'anim-phase anim-phase-active anim-highlight'
      : 'anim-phase anim-phase-completed';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(bandX + 8));
    label.setAttribute('y', String(y + bandHeight * 0.6));
    label.setAttribute('class', 'anim-function');
    label.textContent = `${layer.type} ns (id: ${layer.id})`;
    container.appendChild(label);
  }

  // Draw processes
  const processY = margin.top + layerCount * (bandHeight + 4) + 16;
  const procCount = data.processes.length;
  const procWidth = Math.min(120, usableWidth / Math.max(procCount, 1) - 8);

  for (let i = 0; i < procCount; i++) {
    const proc = data.processes[i];
    const x = margin.left + i * (procWidth + 8);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(processY));
    rect.setAttribute('width', String(procWidth));
    rect.setAttribute('height', '32');
    rect.setAttribute('rx', '4');
    rect.setAttribute('class', 'anim-phase anim-phase-active');
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(x + procWidth / 2));
    label.setAttribute('y', String(processY + 14));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-function');
    label.textContent = `${proc.name} (PID ${proc.pid})`;
    container.appendChild(label);

    if (proc.nsPid !== null) {
      const nsLabel = document.createElementNS(NS, 'text');
      nsLabel.setAttribute('x', String(x + procWidth / 2));
      nsLabel.setAttribute('y', String(processY + 26));
      nsLabel.setAttribute('text-anchor', 'middle');
      nsLabel.setAttribute('class', 'anim-srcref');
      nsLabel.textContent = `nsPid: ${proc.nsPid}`;
      container.appendChild(nsLabel);
    }
  }

  // Current function and srcRef
  const infoY = Math.min(processY + 52, height - margin.bottom - 8);
  const fnLabel = document.createElementNS(NS, 'text');
  fnLabel.setAttribute('x', String(margin.left));
  fnLabel.setAttribute('y', String(infoY));
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.textContent = `Current: ${data.currentFunction}()`;
  container.appendChild(fnLabel);

  const srcLabel = document.createElementNS(NS, 'text');
  srcLabel.setAttribute('x', String(margin.left));
  srcLabel.setAttribute('y', String(infoY + 14));
  srcLabel.setAttribute('class', 'anim-srcref');
  srcLabel.textContent = data.srcRef;
  container.appendChild(srcLabel);
}

const namespaceIsolation: AnimationModule = {
  config: {
    id: 'namespace-isolation',
    title: 'Linux Namespace Isolation',
    skillName: 'namespaces',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'pid-namespace-nesting':
        return generatePidNamespaceNestingFrames();
      case 'unshare-mount-ns':
        return generateUnshareMountNsFrames();
      case 'clone-with-namespaces':
      default:
        return generateCloneWithNamespacesFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default namespaceIsolation;
