import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CapCredState {
  phase: string;
  effective: string[];
  permitted: string[];
  inheritable: string[];
  uid: number;
  euid: number;
  currentCheck: string;
  srcRef: string;
}

function cloneState(s: CapCredState): CapCredState {
  return {
    phase: s.phase,
    effective: [...s.effective],
    permitted: [...s.permitted],
    inheritable: [...s.inheritable],
    uid: s.uid,
    euid: s.euid,
    currentCheck: s.currentCheck,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: capability-check (default)
// How the kernel checks capabilities: capable() -> ns_capable() ->
// security_capable() -> cap_capable() -> cap_capable_helper()
// ---------------------------------------------------------------------------
function generateCapabilityCheck(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CapCredState = {
    phase: 'init',
    effective: ['CAP_NET_BIND_SERVICE', 'CAP_NET_RAW'],
    permitted: ['CAP_NET_BIND_SERVICE', 'CAP_NET_RAW', 'CAP_SYS_PTRACE'],
    inheritable: [],
    uid: 1000,
    euid: 1000,
    currentCheck: '',
    srcRef: '',
  };

  // Frame 0: Process wants to bind to port 80
  state.srcRef = 'net/ipv4/af_inet.c:522 (inet_bind -> inet_bind_check_perm)';
  frames.push({
    step: 0,
    label: 'Process requests privileged port bind',
    description: 'A non-root process (uid=1000) calls bind() on a TCP socket to port 80. inet_bind() at net/ipv4/af_inet.c:522 calls inet_bind_check_perm() which checks if the port is below ip_unprivileged_port_start (default 1024). Since port 80 < 1024, the kernel must verify CAP_NET_BIND_SERVICE.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: capable() called
  state.phase = 'capable';
  state.currentCheck = 'CAP_NET_BIND_SERVICE';
  state.srcRef = 'kernel/capability.c:414-417 (capable)';
  frames.push({
    step: 1,
    label: 'capable(CAP_NET_BIND_SERVICE) called',
    description: 'The kernel calls capable(CAP_NET_BIND_SERVICE) at kernel/capability.c:414. capable() is a thin wrapper that calls ns_capable(&init_user_ns, cap) at line 416, checking the capability against the initial user namespace. This is the most common entry point for privilege checks throughout the kernel.',
    highlights: ['check-cap'],
    data: cloneState(state),
  });

  // Frame 2: ns_capable
  state.phase = 'ns-capable';
  state.srcRef = 'kernel/capability.c:361-364 (ns_capable)';
  frames.push({
    step: 2,
    label: 'ns_capable() dispatches to ns_capable_common()',
    description: 'ns_capable() at kernel/capability.c:361 calls ns_capable_common(ns, cap, CAP_OPT_NONE) at line 363. ns_capable_common() at line 331 first validates cap_valid(cap) at line 337, then calls security_capable(current_cred(), ns, cap, opts) at line 342. If the check succeeds (returns 0), it sets PF_SUPERPRIV on the task at line 344.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: security_capable LSM hook
  state.phase = 'security-check';
  state.srcRef = 'security/security.c:655-661 (security_capable)';
  frames.push({
    step: 3,
    label: 'security_capable() invokes LSM hooks',
    description: 'security_capable() at security/security.c:655 calls call_int_hook(capable, cred, ns, cap, opts) at line 660. This iterates through all registered Linux Security Modules. The default commoncap module provides cap_capable(). If SELinux or AppArmor are loaded, their hooks run too -- any module returning non-zero denies the capability.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 4: cap_capable
  state.phase = 'cap-check';
  state.srcRef = 'security/commoncap.c:124-132 (cap_capable)';
  frames.push({
    step: 4,
    label: 'cap_capable() checks effective set',
    description: 'cap_capable() at security/commoncap.c:124 gets the credential user namespace cred_ns = cred->user_ns at line 127, then calls cap_capable_helper(cred, target_ns, cred_ns, cap) at line 128. Finally, trace_cap_capable() at line 130 emits a tracepoint for observability. Returns 0 if the capability is present, -EPERM otherwise.',
    highlights: ['check-cap'],
    data: cloneState(state),
  });

  // Frame 5: cap_capable_helper namespace walk
  state.phase = 'ns-walk';
  state.srcRef = 'security/commoncap.c:68-106 (cap_capable_helper)';
  frames.push({
    step: 5,
    label: 'cap_capable_helper() walks namespace hierarchy',
    description: 'cap_capable_helper() at security/commoncap.c:68 walks up the user namespace hierarchy in a loop (line 79). When target_ns == cred_ns (line 81), it checks cap_raised(cred->cap_effective, cap) at line 82 -- this tests if the bit for CAP_NET_BIND_SERVICE is set in the effective capability set. If the namespace is a child, it checks ns->parent == cred_ns && uid_eq(ns->owner, cred->euid) at line 95.',
    highlights: ['check-cap'],
    data: cloneState(state),
  });

  // Frame 6: Bit test on cap_effective
  state.phase = 'bit-test';
  state.srcRef = 'include/linux/capability.h (cap_raised macro) -> include/linux/cred.h:128 (cap_effective)';
  frames.push({
    step: 6,
    label: 'cap_raised() tests capability bit',
    description: 'cap_raised(cred->cap_effective, cap) expands to a bitwise test on the kernel_cap_t structure. The cred struct at include/linux/cred.h:115 stores cap_effective at line 128 as a kernel_cap_t (a u64 bitmask). CAP_NET_BIND_SERVICE is capability 10, so the kernel checks if bit 10 is set. For this process, bit 10 IS set in cap_effective, so cap_capable_helper returns 0 (success).',
    highlights: ['check-cap'],
    data: cloneState(state),
  });

  // Frame 7: PF_SUPERPRIV set, return true
  state.phase = 'result';
  state.currentCheck = 'CAP_NET_BIND_SERVICE (granted)';
  state.srcRef = 'kernel/capability.c:342-345 (ns_capable_common result)';
  frames.push({
    step: 7,
    label: 'Capability granted, PF_SUPERPRIV set',
    description: 'Back in ns_capable_common() at kernel/capability.c:342, security_capable() returned 0. At line 344, current->flags |= PF_SUPERPRIV is set, marking that this task used a capability. The function returns true at line 345. The calling code in inet_bind_check_perm proceeds to allow the bind() to port 80. The PF_SUPERPRIV flag is visible in /proc/[pid]/status.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 8: Summary of call chain
  state.phase = 'summary';
  state.srcRef = 'kernel/capability.c:414 -> kernel/capability.c:361 -> security/security.c:655 -> security/commoncap.c:124';
  frames.push({
    step: 8,
    label: 'Complete capability check call chain',
    description: 'The full call chain: capable(CAP_NET_BIND_SERVICE) at kernel/capability.c:414 -> ns_capable(&init_user_ns, cap) at line 416 -> ns_capable_common() at line 331 -> security_capable(current_cred(), ns, cap, opts) at line 342 -> call_int_hook(capable, ...) at security/security.c:660 -> cap_capable() at security/commoncap.c:124 -> cap_capable_helper() at line 68 -> cap_raised(cred->cap_effective, cap) at line 82.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: credential-fork
// How credentials are copied during fork: copy_creds() -> prepare_creds()
// -> commit_creds()
// ---------------------------------------------------------------------------
function generateCredentialFork(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CapCredState = {
    phase: 'init',
    effective: ['CAP_NET_BIND_SERVICE'],
    permitted: ['CAP_NET_BIND_SERVICE', 'CAP_SYS_PTRACE'],
    inheritable: ['CAP_NET_BIND_SERVICE'],
    uid: 1000,
    euid: 1000,
    currentCheck: '',
    srcRef: '',
  };

  // Frame 0: fork() called
  state.srcRef = 'kernel/fork.c (copy_process)';
  frames.push({
    step: 0,
    label: 'Parent process calls fork()',
    description: 'A process with uid=1000 calls fork(). The kernel enters copy_process() which must duplicate the parent task, including its credentials. The parent has CAP_NET_BIND_SERVICE in its effective and inheritable sets, and additionally CAP_SYS_PTRACE in its permitted set. The child must inherit these correctly.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: copy_creds called
  state.phase = 'copy-creds';
  state.srcRef = 'kernel/cred.c:263-284 (copy_creds)';
  frames.push({
    step: 1,
    label: 'copy_creds() begins credential duplication',
    description: 'copy_creds() at kernel/cred.c:263 receives the new task_struct and clone_flags. At line 272-276, it checks if the thread can share credentials: if no thread_keyring exists AND CLONE_THREAD is set, it uses get_cred_many(p->cred, 2) at line 278 to share the parent credentials directly (incrementing refcount by 2 for both real_cred and cred pointers). Otherwise, it must create a new copy.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 2: prepare_creds allocates new cred
  state.phase = 'prepare-creds';
  state.srcRef = 'kernel/cred.c:179-223 (prepare_creds)';
  frames.push({
    step: 2,
    label: 'prepare_creds() allocates new credential set',
    description: 'For a non-CLONE_THREAD fork, copy_creds() calls prepare_creds() at kernel/cred.c:286. prepare_creds() at line 179 allocates from cred_jar slab cache via kmem_cache_alloc() at line 185. It copies the entire old cred struct with memcpy(new, old, sizeof(struct cred)) at line 192, then increments reference counts: get_group_info() at line 196, get_uid() at line 197, get_user_ns() at line 198.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: Key and security initialization
  state.phase = 'security-init';
  state.srcRef = 'kernel/cred.c:200-216 (prepare_creds key/security)';
  frames.push({
    step: 3,
    label: 'Key and LSM security initialization',
    description: 'prepare_creds() increments key references at kernel/cred.c:201-204: session_keyring, process_keyring, thread_keyring, request_key_auth. The LSM security pointer is reset to NULL at line 208, then security_prepare_creds(new, old, GFP_KERNEL_ACCOUNT) at line 215 calls LSM hooks to allocate and copy security-module-specific data (e.g., SELinux labels).',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 4: CLONE_NEWUSER check
  state.phase = 'ns-check';
  state.srcRef = 'kernel/cred.c:290-297 (copy_creds CLONE_NEWUSER)';
  frames.push({
    step: 4,
    label: 'CLONE_NEWUSER namespace check',
    description: 'Back in copy_creds() at kernel/cred.c:290, if CLONE_NEWUSER is set, create_user_ns(new) at line 291 creates a new user namespace where the child becomes root (uid 0) with full capabilities within that namespace. set_cred_ucounts(new) at line 294 updates user accounting. For a regular fork(), CLONE_NEWUSER is not set, so capabilities are inherited unchanged.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 5: Key inheritance for non-thread
  state.phase = 'key-inherit';
  state.srcRef = 'kernel/cred.c:299-316 (copy_creds keyring handling)';
  frames.push({
    step: 5,
    label: 'Keyring inheritance rules',
    description: 'At kernel/cred.c:300-307, if the parent has a thread_keyring, it is dropped (key_put at line 302) and set to NULL (line 303) since thread keyrings are per-thread. For non-CLONE_THREAD forks (line 312), the process_keyring is dropped at line 313 since each process gets its own. The session_keyring is inherited. These rules ensure proper credential isolation.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 6: Install credentials on child
  state.phase = 'commit-creds';
  state.srcRef = 'kernel/cred.c:318 (p->cred = p->real_cred = get_cred(new))';
  frames.push({
    step: 6,
    label: 'Credentials installed on child task',
    description: 'At kernel/cred.c:318, p->cred = p->real_cred = get_cred(new) installs the new credentials on the child task. Both the subjective (cred) and objective (real_cred) pointers reference the same credential set. get_cred() increments the refcount. inc_rlimit_ucounts() at line 319 accounts for the new process under RLIMIT_NPROC.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 7: commit_creds RCU mechanism
  state.phase = 'rcu-publish';
  state.srcRef = 'kernel/cred.c:368-416 (commit_creds RCU)';
  frames.push({
    step: 7,
    label: 'RCU credential publishing',
    description: 'When credentials change at runtime (e.g., setuid), commit_creds() at kernel/cred.c:368 uses RCU. It checks for dumpability changes at line 382-386 (comparing old/new euid, egid, fsuid, fsgid, cap_permitted). rcu_assign_pointer(task->real_cred, new) at line 415 and rcu_assign_pointer(task->cred, new) at line 416 atomically publish the new credentials. Readers using __task_cred() under rcu_read_lock see a consistent snapshot.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 8: Child has inherited capabilities
  state.phase = 'result';
  state.srcRef = 'kernel/cred.c:318 (child credential assignment complete)';
  frames.push({
    step: 8,
    label: 'Child inherits parent capabilities',
    description: 'The child process now has its own credential set with the same capability bitmasks as the parent: cap_effective contains CAP_NET_BIND_SERVICE, cap_permitted contains CAP_NET_BIND_SERVICE and CAP_SYS_PTRACE, cap_inheritable contains CAP_NET_BIND_SERVICE. The cap_bset (bounding set) and cap_ambient sets are also copied. uid/euid remain 1000. The child can independently modify its own credentials without affecting the parent.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: setuid-exec
// Capability transitions during setuid exec: cap_bprm_creds_from_file()
// ---------------------------------------------------------------------------
function generateSetuidExec(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CapCredState = {
    phase: 'init',
    effective: [],
    permitted: [],
    inheritable: [],
    uid: 1000,
    euid: 1000,
    currentCheck: '',
    srcRef: '',
  };

  // Frame 0: Non-root user execve() a setuid-root binary
  state.srcRef = 'fs/exec.c (do_execveat_common -> bprm_execve)';
  frames.push({
    step: 0,
    label: 'Non-root user exec() setuid-root binary',
    description: 'A non-root user (uid=1000, no capabilities) calls execve() on a setuid-root binary (e.g., /usr/bin/ping). The kernel enters do_execveat_common() which calls bprm_execve(). During exec preparation, prepare_exec_creds() at kernel/cred.c:230 calls prepare_creds() to allocate a new credential set. The bprm->cred will be modified before being committed.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: cap_bprm_creds_from_file called via LSM
  state.phase = 'bprm-creds';
  state.srcRef = 'security/commoncap.c:919-931 (cap_bprm_creds_from_file)';
  frames.push({
    step: 1,
    label: 'cap_bprm_creds_from_file() begins',
    description: 'The LSM hook bprm_creds_from_file triggers cap_bprm_creds_from_file() at security/commoncap.c:919. It gets old = current_cred() at line 922 and new = bprm->cred at line 923. At line 928, it validates cap_ambient_invariant_ok(old) -- ambient caps must be a subset of permitted intersected with inheritable. Then get_file_caps() at line 931 reads file capabilities from the binary.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 2: get_file_caps reads xattrs
  state.phase = 'vfs-caps';
  state.srcRef = 'security/commoncap.c:763-803 (get_file_caps)';
  frames.push({
    step: 2,
    label: 'get_file_caps() reads file capability xattrs',
    description: 'get_file_caps() at security/commoncap.c:763 first clears bprm->cred->cap_permitted at line 769. It checks file_caps_enabled at line 771 and mnt_may_suid() at line 774 (nosuid mounts block capabilities). get_vfs_caps_from_disk() at line 785 reads the security.capability xattr from the inode. bprm_caps_from_vfs_caps() at line 796 then computes new capability sets from the file capabilities.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: bprm_caps_from_vfs_caps computes new sets
  state.phase = 'compute-caps';
  state.srcRef = 'security/commoncap.c:626-658 (bprm_caps_from_vfs_caps)';
  frames.push({
    step: 3,
    label: 'bprm_caps_from_vfs_caps() computes capability sets',
    description: 'bprm_caps_from_vfs_caps() at security/commoncap.c:626 applies the capability transformation formula: pP\' = (X & fP) | (pI & fI) at line 644-646. X is cap_bset (bounding set), fP is file permitted, pI is process inheritable, fI is file inheritable. If VFS_CAP_FLAGS_EFFECTIVE is set at line 634, the file has an effective bit (fE=1), meaning the resulting effective set will equal the permitted set.',
    highlights: ['check-cap'],
    data: cloneState(state),
  });

  // Frame 4: handle_privileged_root for setuid
  state.phase = 'privileged-root';
  state.euid = 0;
  state.srcRef = 'security/commoncap.c:828-860 (handle_privileged_root)';
  frames.push({
    step: 4,
    label: 'handle_privileged_root() grants root capabilities',
    description: 'handle_privileged_root() at security/commoncap.c:828 handles the setuid-root case. root_privileged() at line 834 checks !issecure(SECURE_NOROOT). Since the binary is setuid-root, new->euid == 0. At line 850, __is_eff(root_uid, new) is true, so pP\' = cap_combine(old->cap_bset, old->cap_inheritable) at line 852 fills permitted with the bounding set. At line 858, *effective = true because euid is root.',
    highlights: ['check-cap'],
    data: cloneState(state),
  });

  // Frame 5: Safety checks for traced/NO_NEW_PRIVS
  state.phase = 'safety-check';
  state.effective = ['CAP_NET_BIND_SERVICE', 'CAP_NET_RAW', 'CAP_SYS_PTRACE', 'CAP_SYS_ADMIN', 'CAP_DAC_OVERRIDE'];
  state.permitted = ['CAP_NET_BIND_SERVICE', 'CAP_NET_RAW', 'CAP_SYS_PTRACE', 'CAP_SYS_ADMIN', 'CAP_DAC_OVERRIDE'];
  state.srcRef = 'security/commoncap.c:948-961 (ptrace/NO_NEW_PRIVS checks)';
  frames.push({
    step: 5,
    label: 'Ptrace and NO_NEW_PRIVS safety checks',
    description: 'At security/commoncap.c:948-961, the kernel checks if the exec is traced (bprm->unsafe) or the process has NO_NEW_PRIVS set. If traced by a less-privileged process without CAP_SYS_PTRACE in the target namespace (line 952), capabilities are downgraded: new->euid reverts to new->uid at line 956, and cap_permitted is intersected with the old cap_permitted at line 959-960 to prevent privilege escalation through ptrace.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 6: Ambient caps cleared, final effective set
  state.phase = 'finalize';
  state.srcRef = 'security/commoncap.c:963-983 (ambient clear, effective set)';
  frames.push({
    step: 6,
    label: 'Ambient caps cleared, effective set computed',
    description: 'At security/commoncap.c:963, suid/sgid/fsuid/fsgid are set from euid/egid. At line 967, since id_changed is true (uid 1000 -> euid 0), cap_clear(new->cap_ambient) clears the ambient set. Line 974 adds ambient back to permitted: pP\' = pP\' | pA\' (but pA\' is now 0). Lines 980-983: since effective=true (fE or root), new->cap_effective = new->cap_permitted, giving full effective capabilities.',
    highlights: ['check-cap'],
    data: cloneState(state),
  });

  // Frame 7: secureexec flag set
  state.phase = 'secure-exec';
  state.srcRef = 'security/commoncap.c:999-1006 (secureexec check)';
  frames.push({
    step: 7,
    label: 'secureexec flag set for AT_SECURE',
    description: 'At security/commoncap.c:1000, since id_changed is true (euid != old uid), bprm->secureexec = 1 at line 1006. This causes the ELF loader to set AT_SECURE=1 in the auxiliary vector, which tells glibc to sanitize the environment (removing LD_PRELOAD, LD_LIBRARY_PATH, etc.) to prevent library injection attacks against the newly-privileged process.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 8: commit_creds installs new credentials
  state.phase = 'commit-creds';
  state.srcRef = 'kernel/cred.c:368-416 (commit_creds)';
  frames.push({
    step: 8,
    label: 'commit_creds() installs elevated credentials',
    description: 'After exec completes, commit_creds() at kernel/cred.c:368 installs the new credentials. At line 382-388, since euid changed (1000 -> 0), set_dumpable(task->mm, suid_dumpable) restricts core dumps. rcu_assign_pointer(task->real_cred, new) at line 415 and rcu_assign_pointer(task->cred, new) at line 416 atomically publish. The process now runs as euid=0 with full effective capabilities.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 9: Final state summary
  state.phase = 'result';
  state.srcRef = 'include/linux/cred.h:115-131 (struct cred final state)';
  frames.push({
    step: 9,
    label: 'Setuid exec complete: elevated privileges',
    description: 'The process now runs with euid=0 and full capabilities in the effective set. The credential struct (include/linux/cred.h:115) shows: uid=1000 (real UID unchanged), euid=0 (effective root), cap_effective has all capabilities from the bounding set, cap_permitted matches cap_effective. The transformation formula applied was: pP\' = (X & fP) | (pI & fI) | pA\', pE\' = fE ? pP\' : pA\'. For setuid-root without file caps: pP\' = cap_bset, pE\' = pP\'.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS_CHECK = [
  { id: 'init', label: 'Init' },
  { id: 'capable', label: 'capable()' },
  { id: 'ns-capable', label: 'ns_capable' },
  { id: 'security-check', label: 'LSM' },
  { id: 'cap-check', label: 'cap_capable' },
  { id: 'ns-walk', label: 'NS Walk' },
  { id: 'bit-test', label: 'Bit Test' },
  { id: 'result', label: 'Result' },
];

const PHASE_LABELS_FORK = [
  { id: 'init', label: 'Fork' },
  { id: 'copy-creds', label: 'copy_creds' },
  { id: 'prepare-creds', label: 'prepare' },
  { id: 'security-init', label: 'Security' },
  { id: 'ns-check', label: 'NS Check' },
  { id: 'key-inherit', label: 'Keys' },
  { id: 'commit-creds', label: 'Commit' },
  { id: 'result', label: 'Result' },
];

const PHASE_LABELS_EXEC = [
  { id: 'init', label: 'Exec' },
  { id: 'bprm-creds', label: 'bprm_creds' },
  { id: 'vfs-caps', label: 'VFS Caps' },
  { id: 'compute-caps', label: 'Compute' },
  { id: 'privileged-root', label: 'Root' },
  { id: 'safety-check', label: 'Safety' },
  { id: 'finalize', label: 'Finalize' },
  { id: 'secure-exec', label: 'SecureExec' },
  { id: 'commit-creds', label: 'Commit' },
  { id: 'result', label: 'Result' },
];

function getPhaseLabels(phase: string): { id: string; label: string }[] {
  // Determine which scenario's labels to use based on the phase
  for (const p of PHASE_LABELS_EXEC) {
    if (p.id === phase) return PHASE_LABELS_EXEC;
  }
  for (const p of PHASE_LABELS_FORK) {
    if (p.id === phase) return PHASE_LABELS_FORK;
  }
  return PHASE_LABELS_CHECK;
}

function getActivePhaseIndex(phases: { id: string }[], phase: string): number {
  const idx = phases.findIndex(p => p.id === phase);
  if (idx >= 0) return idx;
  // summary maps to result
  if (phase === 'summary') return phases.length - 1;
  // rcu-publish maps to commit-creds
  if (phase === 'rcu-publish') return phases.findIndex(p => p.id === 'commit-creds');
  return -1;
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as CapCredState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Linux Capabilities & Credentials';
  container.appendChild(title);

  // --- Credential info (uid/euid) ---
  const credTop = margin.top + 28;
  const credInfo = document.createElementNS(NS, 'text');
  credInfo.setAttribute('x', String(margin.left));
  credInfo.setAttribute('y', String(credTop));
  credInfo.setAttribute('class', 'anim-cred-info');
  credInfo.setAttribute('fill', '#e6edf3');
  credInfo.setAttribute('font-size', '12');
  credInfo.textContent = `uid=${data.uid}  euid=${data.euid}`;
  container.appendChild(credInfo);

  const checkInfo = document.createElementNS(NS, 'text');
  checkInfo.setAttribute('x', String(margin.left));
  checkInfo.setAttribute('y', String(credTop + 16));
  checkInfo.setAttribute('class', 'anim-cred-info');
  checkInfo.setAttribute('fill', '#8b949e');
  checkInfo.setAttribute('font-size', '11');
  checkInfo.textContent = data.currentCheck ? `Check: ${data.currentCheck}` : '';
  container.appendChild(checkInfo);

  // --- Phase flow diagram ---
  const phases = getPhaseLabels(data.phase);
  const flowTop = credTop + 38;
  const phaseCount = phases.length;
  const phaseWidth = Math.min(85, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(phases, data.phase);

  phases.forEach((phase, i) => {
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
    label.setAttribute('font-size', '9');
    label.textContent = phase.label;
    container.appendChild(label);

    // Arrow between phases
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

  // --- Capability sets ---
  const capTop = flowTop + phaseHeight + 20;
  const capSetWidth = (usableWidth - 20) / 3;
  const capSets = [
    { name: 'Effective', caps: data.effective, color: '#3fb950' },
    { name: 'Permitted', caps: data.permitted, color: '#58a6ff' },
    { name: 'Inheritable', caps: data.inheritable, color: '#d2a8ff' },
  ];

  capSets.forEach((capSet, setIdx) => {
    const sx = margin.left + setIdx * (capSetWidth + 10);

    // Set title
    const setTitle = document.createElementNS(NS, 'text');
    setTitle.setAttribute('x', String(sx));
    setTitle.setAttribute('y', String(capTop));
    setTitle.setAttribute('fill', capSet.color);
    setTitle.setAttribute('font-size', '11');
    setTitle.setAttribute('class', 'anim-cpu-label');
    setTitle.textContent = capSet.name;
    container.appendChild(setTitle);

    // Cap entries
    capSet.caps.forEach((cap, capIdx) => {
      const cy = capTop + 8 + capIdx * 18;
      const isChecked = data.currentCheck === cap;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(sx));
      rect.setAttribute('y', String(cy));
      rect.setAttribute('width', String(capSetWidth));
      rect.setAttribute('height', '15');
      rect.setAttribute('rx', '2');
      rect.setAttribute('fill', isChecked ? '#1f6feb' : '#21262d');
      let entryCls = 'anim-cap-entry';
      if (isChecked) entryCls += ' anim-highlight';
      rect.setAttribute('class', entryCls);
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(sx + 4));
      text.setAttribute('y', String(cy + 11));
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '9');
      text.setAttribute('class', 'anim-cap-entry');
      text.textContent = cap;
      container.appendChild(text);
    });

    // Empty set indicator
    if (capSet.caps.length === 0) {
      const emptyText = document.createElementNS(NS, 'text');
      emptyText.setAttribute('x', String(sx));
      emptyText.setAttribute('y', String(capTop + 18));
      emptyText.setAttribute('fill', '#484f58');
      emptyText.setAttribute('font-size', '10');
      emptyText.setAttribute('class', 'anim-cap-entry');
      emptyText.textContent = '(empty)';
      container.appendChild(emptyText);
    }
  });
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'capability-check', label: 'Capability Check (CAP_NET_BIND_SERVICE)' },
  { id: 'credential-fork', label: 'Credential Fork (copy_creds)' },
  { id: 'setuid-exec', label: 'Setuid Exec (cap_bprm_creds_from_file)' },
];

const capabilitiesCred: AnimationModule = {
  config: {
    id: 'capabilities-cred',
    title: 'Linux Capabilities & Credentials',
    skillName: 'capabilities-and-credentials',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'credential-fork': return generateCredentialFork();
      case 'setuid-exec': return generateSetuidExec();
      case 'capability-check':
      default: return generateCapabilityCheck();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default capabilitiesCred;
