import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SeccompSandboxState {
  phase: 'setup' | 'unshare' | 'cgroup-attach' | 'no-new-privs' | 'seccomp-install' | 'sandbox-active' | 'filter-eval' | 'filter-result' | 'defense' | 'blocked';
  sandboxLayers: string[];
  seccompFilters: string[];
  namespaceSet: string[];
  cgroupLimits: string[];
  blockedSyscalls: string[];
  srcRef: string;
}

function cloneState(s: SeccompSandboxState): SeccompSandboxState {
  return {
    phase: s.phase,
    sandboxLayers: [...s.sandboxLayers],
    seccompFilters: [...s.seccompFilters],
    namespaceSet: [...s.namespaceSet],
    cgroupLimits: [...s.cgroupLimits],
    blockedSyscalls: [...s.blockedSyscalls],
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: sandbox-setup
// Building a complete sandbox: unshare, cgroup, seccomp filter installation
// ---------------------------------------------------------------------------
function generateSandboxSetup(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SeccompSandboxState = {
    phase: 'setup',
    sandboxLayers: [],
    seccompFilters: [],
    namespaceSet: [],
    cgroupLimits: [],
    blockedSyscalls: [],
    srcRef: '',
  };

  // Frame 0: Sandbox creation begins
  state.srcRef = 'kernel/fork.c:3317 (SYSCALL_DEFINE1(unshare, unsigned long, unshare_flags))';
  frames.push({
    step: 0,
    label: 'Begin sandbox construction',
    description: 'A container runtime calls unshare(CLONE_NEWUSER | CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWIPC | CLONE_NEWUTS) to isolate the process. SYSCALL_DEFINE1(unshare) at kernel/fork.c:3317 enters ksys_unshare() at line 3193. If CLONE_NEWUSER is set, line 3206 forces CLONE_THREAD | CLONE_FS to be added.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: ksys_unshare validates and calls create_new_namespaces
  state.phase = 'unshare';
  state.sandboxLayers.push('namespaces');
  state.srcRef = 'kernel/fork.c:3193-3245 (ksys_unshare -> unshare_nsproxy_namespaces)';
  frames.push({
    step: 1,
    label: 'ksys_unshare() creates new namespaces',
    description: 'ksys_unshare() at kernel/fork.c:3193 calls unshare_nsproxy_namespaces() at line 3245. This calls create_new_namespaces() at kernel/nsproxy.c:88. create_new_namespaces() allocates a new nsproxy via create_nsproxy() (line 95), then calls copy_mnt_ns() (line 99), copy_utsname() (line 106), copy_ipcs() (line 112), copy_pid_ns() (line 118), copy_cgroup_ns() (line 125), and copy_net_ns() (line 132) for each requested namespace.',
    highlights: ['layer-ns'],
    data: cloneState(state),
  });

  // Frame 2: Namespace details - what each provides
  state.namespaceSet.push('user', 'pid', 'mnt', 'net', 'ipc', 'uts');
  state.srcRef = 'kernel/nsproxy.c:88-135 (create_new_namespaces copies each ns type)';
  frames.push({
    step: 2,
    label: 'Namespace isolation established',
    description: 'create_new_namespaces() at kernel/nsproxy.c:88 creates isolated views: user ns (UID/GID mapping), pid ns (PID 1 inside sandbox), mnt ns (private mount tree), net ns (empty network stack), ipc ns (private SysV IPC), uts ns (own hostname). The new nsproxy is installed via switch_task_namespaces(). The process now has root (UID 0) inside its user namespace but maps to an unprivileged UID outside.',
    highlights: ['layer-ns'],
    data: cloneState(state),
  });

  // Frame 3: Enter cgroup
  state.phase = 'cgroup-attach';
  state.sandboxLayers.push('cgroups');
  state.cgroupLimits.push('memory.max=512M', 'pids.max=64', 'cpu.max=100000/100000');
  state.srcRef = 'kernel/cgroup/cgroup.c (cgroup_attach_task, cgroup_migrate)';
  frames.push({
    step: 3,
    label: 'Attach to resource-limiting cgroup',
    description: 'The sandbox process is moved into a dedicated cgroup v2 hierarchy with resource limits: memory.max=512M caps RSS, pids.max=64 limits fork bombs, cpu.max throttles CPU time. cgroup_attach_task() calls cgroup_migrate() which updates task->cgroups. The device controller can also deny access to /dev nodes, preventing raw device access from within the sandbox.',
    highlights: ['layer-cgroup'],
    data: cloneState(state),
  });

  // Frame 4: PR_SET_NO_NEW_PRIVS
  state.phase = 'no-new-privs';
  state.sandboxLayers.push('no_new_privs');
  state.srcRef = 'kernel/sys.c:2706-2711 (PR_SET_NO_NEW_PRIVS -> task_set_no_new_privs)';
  frames.push({
    step: 4,
    label: 'prctl(PR_SET_NO_NEW_PRIVS, 1)',
    description: 'Before installing seccomp filters, prctl(PR_SET_NO_NEW_PRIVS, 1) is called. At kernel/sys.c:2706, the PR_SET_NO_NEW_PRIVS case validates arg2==1 (line 2707), then calls task_set_no_new_privs(current) at line 2710. This sets the no_new_privs bit on the task, preventing execve() from granting suid/sgid privileges. This is REQUIRED before seccomp filter installation unless the process has CAP_SYS_ADMIN.',
    highlights: ['layer-nnp'],
    data: cloneState(state),
  });

  // Frame 5: seccomp_set_mode_filter called
  state.phase = 'seccomp-install';
  state.sandboxLayers.push('seccomp');
  state.srcRef = 'kernel/seccomp.c:1956-1992 (seccomp_set_mode_filter)';
  frames.push({
    step: 5,
    label: 'Install seccomp-BPF filter',
    description: 'seccomp(SECCOMP_SET_MODE_FILTER, 0, &prog) invokes seccomp_set_mode_filter() at kernel/seccomp.c:1956. It validates flags (line 1966), then calls seccomp_prepare_user_filter() at line 1990 which copies the BPF program from userspace and calls seccomp_prepare_filter() at line 669 to allocate a seccomp_filter struct and run bpf_prog_create_from_user() to compile the cBPF to eBPF.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 6: Filter attached to task
  state.seccompFilters.push('allow: read/write/exit/sigreturn', 'errno: open/socket/fork', 'kill: mount/ptrace/setns');
  state.blockedSyscalls.push('mount', 'ptrace', 'setns', 'open', 'socket', 'fork');
  state.srcRef = 'kernel/seccomp.c:2017-2033 (spin_lock, seccomp_attach_filter, seccomp_assign_mode)';
  frames.push({
    step: 6,
    label: 'Filter chain attached to task',
    description: 'With sighand->siglock held (line 2017), seccomp_attach_filter() at kernel/seccomp.c:921 validates total instruction count against MAX_INSNS_PER_PATH (line 933). The filter is prepended to current->seccomp.filter chain (filters evaluate in reverse install order, lowest return value wins). seccomp_assign_mode() at line 2033 sets current->seccomp.mode = SECCOMP_MODE_FILTER and sets SYSCALL_WORK_SECCOMP on the task.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 7: Sandbox fully active
  state.phase = 'sandbox-active';
  state.srcRef = 'kernel/seccomp.c:447 (seccomp_assign_mode sets SECCOMP_MODE_FILTER)';
  frames.push({
    step: 7,
    label: 'Sandbox fully active',
    description: 'All four defense layers are now active: (1) Namespaces isolate the process view of system resources. (2) Cgroup limits cap resource consumption. (3) no_new_privs prevents privilege escalation via execve. (4) Seccomp-BPF filters restrict available syscalls. Every subsequent syscall passes through __seccomp_filter() at kernel/seccomp.c:1259 before the syscall handler executes. The sandbox is irrevocable -- seccomp filters cannot be removed, only made more restrictive.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: syscall-filtering
// How seccomp filters evaluate during sandboxed execution
// ---------------------------------------------------------------------------
function generateSyscallFiltering(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SeccompSandboxState = {
    phase: 'sandbox-active',
    sandboxLayers: ['namespaces', 'cgroups', 'no_new_privs', 'seccomp'],
    seccompFilters: ['allow: read/write/exit', 'errno: open/socket', 'kill: mount/ptrace'],
    namespaceSet: ['user', 'pid', 'mnt', 'net'],
    cgroupLimits: ['memory.max=512M', 'pids.max=64'],
    blockedSyscalls: ['mount', 'ptrace'],
    srcRef: '',
  };

  // Frame 0: Sandboxed process issues syscall
  state.srcRef = 'arch/x86/entry/entry_64.S:87 (entry_SYSCALL_64)';
  frames.push({
    step: 0,
    label: 'Sandboxed process calls read()',
    description: 'A sandboxed process executes read(fd, buf, count). The SYSCALL instruction enters entry_SYSCALL_64 at arch/x86/entry/entry_64.S:87 normally. do_syscall_64() calls syscall_enter_from_user_mode() which checks SYSCALL_WORK_SECCOMP flag -- this flag was set by seccomp_assign_mode() when the filter was installed.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: __seccomp_filter entry
  state.phase = 'filter-eval';
  state.srcRef = 'kernel/seccomp.c:1259-1276 (__seccomp_filter)';
  frames.push({
    step: 1,
    label: '__seccomp_filter() begins evaluation',
    description: '__seccomp_filter() at kernel/seccomp.c:1259 is called with this_syscall (the syscall number). It calls smp_rmb() at line 1270 to ensure filter modifications from other threads are visible. populate_seccomp_data() at line 1272 fills a seccomp_data struct with: syscall number (nr), architecture (arch), instruction pointer, and the first 6 syscall arguments (args[0..5]).',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 2: seccomp_run_filters evaluates BPF
  state.srcRef = 'kernel/seccomp.c:404-425 (seccomp_run_filters)';
  frames.push({
    step: 2,
    label: 'seccomp_run_filters() runs BPF programs',
    description: 'seccomp_run_filters() at kernel/seccomp.c:404 starts with ret = SECCOMP_RET_ALLOW (line 407). It reads current->seccomp.filter via READ_ONCE() (line 410). First, seccomp_cache_check_allow() at line 416 checks the bitmap cache -- if this syscall was previously allowed by all filters, skip BPF execution entirely. Otherwise, the filter chain is walked (line 423): for each filter, bpf_prog_run_pin_on_cpu() at line 424 executes the compiled eBPF program. The lowest return value wins.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 3: SECCOMP_RET_ALLOW for read()
  state.phase = 'filter-result';
  state.srcRef = 'kernel/seccomp.c:1347-1353 (SECCOMP_RET_ALLOW case)';
  frames.push({
    step: 3,
    label: 'read() allowed -- SECCOMP_RET_ALLOW',
    description: 'For read() (syscall 0), the BPF filter returns SECCOMP_RET_ALLOW. At kernel/seccomp.c:1347, the SECCOMP_RET_ALLOW case simply returns 0, allowing the syscall to proceed normally. The match filter is NULL for this action since SECCOMP_RET_ALLOW is the starting state (line 1350). __seccomp_filter() returns 0, and do_syscall_64() continues to dispatch the actual read() handler.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 4: Now try a blocked syscall - open()
  state.phase = 'filter-eval';
  state.srcRef = 'kernel/seccomp.c:1259-1272 (__seccomp_filter for open())';
  frames.push({
    step: 4,
    label: 'Sandboxed process calls open()',
    description: 'The sandboxed process attempts open("/etc/shadow", O_RDONLY). __seccomp_filter() at kernel/seccomp.c:1259 is invoked again. populate_seccomp_data() at line 1272 fills sd.nr with __NR_open. seccomp_cache_check_allow() at line 416 returns false -- open() is not in the allow bitmap. seccomp_run_filters() evaluates the BPF program chain against the open syscall number.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 5: SECCOMP_RET_ERRNO for open()
  state.phase = 'filter-result';
  state.blockedSyscalls.push('open');
  state.srcRef = 'kernel/seccomp.c:1279-1285 (SECCOMP_RET_ERRNO case)';
  frames.push({
    step: 5,
    label: 'open() denied -- SECCOMP_RET_ERRNO',
    description: 'The BPF filter returns SECCOMP_RET_ERRNO | EPERM. At kernel/seccomp.c:1279, the SECCOMP_RET_ERRNO case extracts the errno data (line 1281 caps at MAX_ERRNO). syscall_set_return_value() at line 1283 sets regs->ax to -EPERM. Execution jumps to skip: (line 1375) which calls seccomp_log() and returns -1. The syscall is NEVER dispatched -- open() handler never runs. The process sees errno=EPERM.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 6: SECCOMP_RET_KILL for mount()
  state.phase = 'filter-eval';
  state.srcRef = 'kernel/seccomp.c:1355-1370 (SECCOMP_RET_KILL case)';
  frames.push({
    step: 6,
    label: 'mount() triggers SECCOMP_RET_KILL_PROCESS',
    description: 'If the sandboxed process attempts mount(), the filter returns SECCOMP_RET_KILL_PROCESS. At kernel/seccomp.c:1355, current->seccomp.mode is set to SECCOMP_MODE_DEAD (line 1358). seccomp_log() at line 1359 logs the violation with SIGSYS. If this is the last thread (line 1361), syscall_rollback() at line 1364 restores original registers and force_sig_seccomp() at line 1366 delivers SIGSYS with a coredump. Otherwise do_exit(SIGSYS) at line 1368 kills the thread.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 7: Cache optimization
  state.phase = 'sandbox-active';
  state.srcRef = 'kernel/seccomp.c:367-384 (seccomp_cache_check_allow bitmap)';
  frames.push({
    step: 7,
    label: 'Seccomp bitmap cache accelerates hot path',
    description: 'For frequently allowed syscalls, seccomp_cache_check_allow() at kernel/seccomp.c:367 uses a per-arch bitmap. seccomp_cache_check_allow_bitmap() at line 349 tests the syscall number bit in cache->allow_native (line 375 for native, line 384 for compat). If the bit is set, BPF evaluation is skipped entirely -- the syscall is allowed in O(1). This cache is populated after the first evaluation of each syscall and makes hot-path syscalls like read/write nearly zero-cost under seccomp.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: sandbox-escape-prevention
// How layered defenses prevent sandbox escape
// ---------------------------------------------------------------------------
function generateSandboxEscapePrevention(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SeccompSandboxState = {
    phase: 'sandbox-active',
    sandboxLayers: ['namespaces', 'cgroups', 'no_new_privs', 'seccomp'],
    seccompFilters: ['allow: read/write/exit', 'kill: mount/ptrace/setns/unshare'],
    namespaceSet: ['user', 'pid', 'mnt', 'net'],
    cgroupLimits: ['memory.max=512M', 'pids.max=64'],
    blockedSyscalls: [],
    srcRef: '',
  };

  // Frame 0: Escape attempt overview
  state.srcRef = 'kernel/seccomp.c:1259 (__seccomp_filter guards every syscall)';
  frames.push({
    step: 0,
    label: 'Sandboxed process attempts escape',
    description: 'A malicious process inside the sandbox attempts to escape isolation. Every syscall first passes through __seccomp_filter() at kernel/seccomp.c:1259. Even if a syscall is allowed by seccomp, namespace isolation and capability checks provide additional defense layers. The sandbox uses defense-in-depth: each layer blocks different attack vectors.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: Attempt mount() - seccomp blocks
  state.phase = 'defense';
  state.blockedSyscalls.push('mount');
  state.srcRef = 'kernel/seccomp.c:1355-1370 (SECCOMP_RET_KILL_PROCESS for mount)';
  frames.push({
    step: 1,
    label: 'Layer 1: seccomp blocks mount()',
    description: 'Attacker tries mount("proc", "/proc", "proc", 0, NULL) to remount /proc and access host information. seccomp_run_filters() at kernel/seccomp.c:404 evaluates the BPF filter which returns SECCOMP_RET_KILL_PROCESS for __NR_mount. The process is killed with SIGSYS at line 1366 via force_sig_seccomp(). Mount never reaches the VFS layer.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 2: Attempt ptrace() - seccomp blocks
  state.blockedSyscalls.push('ptrace');
  state.srcRef = 'kernel/seccomp.c:1355-1370 (SECCOMP_RET_KILL_PROCESS for ptrace)';
  frames.push({
    step: 2,
    label: 'Layer 1: seccomp blocks ptrace()',
    description: 'Attacker tries ptrace(PTRACE_ATTACH, target_pid) to inspect or control another process. The seccomp filter returns SECCOMP_RET_KILL_PROCESS for __NR_ptrace. Even without seccomp, ptrace would fail: the PID namespace means target_pid may not exist, and YAMA LSM (security/yama/yama_lsm.c) restricts ptrace scope. Seccomp provides the first and fastest rejection.',
    highlights: ['layer-seccomp'],
    data: cloneState(state),
  });

  // Frame 3: capable() check in namespace context
  state.blockedSyscalls.push('setns');
  state.srcRef = 'kernel/capability.c:361-364 (ns_capable checks against user namespace)';
  frames.push({
    step: 3,
    label: 'Layer 2: namespace limits capabilities',
    description: 'Even if seccomp allowed a privileged syscall, ns_capable() at kernel/capability.c:361 checks capabilities against the task user namespace, not init_user_ns. CAP_SYS_ADMIN inside a user namespace only grants privileges within that namespace. ns_capable_common() at line 331 calls security_capable() which evaluates cap against current_user_ns(). The process has "root" inside its sandbox but zero privileges in the host namespace.',
    highlights: ['layer-ns'],
    data: cloneState(state),
  });

  // Frame 4: unshare() blocked by seccomp + capability check
  state.blockedSyscalls.push('unshare');
  state.srcRef = 'kernel/fork.c:3193-3206 (ksys_unshare) + kernel/fork.c:2065 (ns_capable check)';
  frames.push({
    step: 4,
    label: 'Layer 2: nested unshare() limited',
    description: 'Attacker tries unshare(CLONE_NEWUSER) to create a nested user namespace and gain new capabilities. Even if seccomp allowed this, ksys_unshare() at kernel/fork.c:3193 with CLONE_NEWUSER forces CLONE_THREAD (line 3206). create_user_ns() checks ns_capable(current_user_ns(), CAP_SYS_ADMIN) at kernel/fork.c:2065 -- capabilities are scoped to the current user namespace. Nested namespaces cannot escape the parent capability boundary.',
    highlights: ['layer-ns'],
    data: cloneState(state),
  });

  // Frame 5: Cgroup device controller blocks /dev access
  state.blockedSyscalls.push('mknod');
  state.srcRef = 'kernel/cgroup/cgroup.c (device controller denies access)';
  frames.push({
    step: 5,
    label: 'Layer 3: cgroup device controller',
    description: 'Attacker tries to access /dev/sda directly to read the host filesystem. The cgroup v2 device controller maintains an allow/deny list for device access. devcgroup_check_permission() validates major:minor device numbers against the cgroup policy. The sandbox cgroup denies all block devices. Even if the process created a device node via mknod (blocked by seccomp), the cgroup device controller would deny open() on it.',
    highlights: ['layer-cgroup'],
    data: cloneState(state),
  });

  // Frame 6: no_new_privs blocks suid escalation
  state.blockedSyscalls.push('execve-suid');
  state.srcRef = 'kernel/cred.c:179-224 (prepare_creds) + fs/exec.c (no_new_privs check)';
  frames.push({
    step: 6,
    label: 'Layer 4: no_new_privs blocks suid',
    description: 'Attacker tries execve("/usr/bin/su") hoping suid bit grants root. The no_new_privs flag (set via prctl at kernel/sys.c:2710) is checked during execve in security_bprm_set_creds(). With no_new_privs set, suid/sgid bits are ignored -- prepare_creds() at kernel/cred.c:179 prepares new credentials but the bprm_set_creds hook strips elevated privileges. The process cannot gain capabilities beyond what it already has.',
    highlights: ['layer-nnp'],
    data: cloneState(state),
  });

  // Frame 7: Fork bomb limited by pids.max
  state.blockedSyscalls.push('fork-excess');
  state.srcRef = 'kernel/fork.c:1967 (copy_process) + kernel/cgroup/pids.c (pids_can_fork)';
  frames.push({
    step: 7,
    label: 'Layer 3: cgroup pids.max limits fork bombs',
    description: 'Attacker tries a fork bomb: while(1) fork(). copy_process() at kernel/fork.c:1967 calls cgroup_can_fork() which invokes the pids controller pids_can_fork(). With pids.max=64, once 64 processes exist in the cgroup, pids_can_fork() returns -EAGAIN and fork() fails. The host system is unaffected. Combined with memory.max, CPU throttling, and seccomp, the sandbox contains resource exhaustion attacks.',
    highlights: ['layer-cgroup'],
    data: cloneState(state),
  });

  // Frame 8: Defense summary
  state.phase = 'blocked';
  state.srcRef = 'kernel/seccomp.c:1259 + kernel/nsproxy.c:88 + kernel/cred.c:179 + kernel/sys.c:2710';
  frames.push({
    step: 8,
    label: 'All escape vectors blocked',
    description: 'Defense-in-depth summary: Layer 1 (seccomp) blocks dangerous syscalls before they execute (kernel/seccomp.c:1259). Layer 2 (namespaces) limits what resources are visible and what capabilities mean (kernel/nsproxy.c:88). Layer 3 (cgroups) caps resource consumption and device access (kernel/cgroup/). Layer 4 (no_new_privs) prevents privilege escalation through execve (kernel/sys.c:2710). Each layer compensates for potential bypasses in others.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  setup: '#8b949e',
  unshare: '#58a6ff',
  'cgroup-attach': '#3fb950',
  'no-new-privs': '#d29922',
  'seccomp-install': '#f85149',
  'sandbox-active': '#a371f7',
  'filter-eval': '#f0883e',
  'filter-result': '#58a6ff',
  defense: '#f85149',
  blocked: '#f85149',
};

const LAYER_LABELS = [
  { id: 'namespaces', label: 'Namespaces', color: '#58a6ff' },
  { id: 'cgroups', label: 'Cgroups', color: '#3fb950' },
  { id: 'no_new_privs', label: 'NoNewPrivs', color: '#d29922' },
  { id: 'seccomp', label: 'Seccomp', color: '#f85149' },
];

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as SeccompSandboxState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Seccomp + Namespaces + Cgroups Sandbox';
  container.appendChild(title);

  // --- Phase indicator ---
  const phaseTop = margin.top + 28;
  const phaseWidth = 220;
  const phaseHeight = 30;
  const phaseColor = PHASE_COLORS[data.phase] || '#30363d';

  const phaseRect = document.createElementNS(NS, 'rect');
  phaseRect.setAttribute('x', String(margin.left));
  phaseRect.setAttribute('y', String(phaseTop));
  phaseRect.setAttribute('width', String(phaseWidth));
  phaseRect.setAttribute('height', String(phaseHeight));
  phaseRect.setAttribute('rx', '6');
  phaseRect.setAttribute('fill', phaseColor);
  let phaseCls = 'anim-mode';
  if (frame.highlights.includes('phase-indicator')) phaseCls += ' anim-highlight';
  phaseRect.setAttribute('class', phaseCls);
  container.appendChild(phaseRect);

  const phaseText = document.createElementNS(NS, 'text');
  phaseText.setAttribute('x', String(margin.left + phaseWidth / 2));
  phaseText.setAttribute('y', String(phaseTop + 20));
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.setAttribute('class', 'anim-mode');
  phaseText.setAttribute('fill', '#e6edf3');
  phaseText.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseText);

  // --- Sandbox layer blocks ---
  const layerTop = phaseTop + phaseHeight + 20;
  const layerBlockWidth = Math.min(120, (usableWidth - (LAYER_LABELS.length - 1) * 8) / LAYER_LABELS.length);
  const layerBlockHeight = 28;

  LAYER_LABELS.forEach((layer, i) => {
    const lx = margin.left + i * (layerBlockWidth + 8);
    const isActive = data.sandboxLayers.includes(layer.id);
    const isHighlighted = frame.highlights.includes(`layer-${layer.id === 'no_new_privs' ? 'nnp' : layer.id === 'namespaces' ? 'ns' : layer.id === 'cgroups' ? 'cgroup' : layer.id}`);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(lx));
    rect.setAttribute('y', String(layerTop));
    rect.setAttribute('width', String(layerBlockWidth));
    rect.setAttribute('height', String(layerBlockHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isHighlighted) {
      blockClass += ' anim-block-allocated anim-highlight';
      rect.setAttribute('fill', layer.color);
    } else if (isActive) {
      blockClass += ' anim-block-allocated';
      rect.setAttribute('fill', layer.color);
      rect.setAttribute('opacity', '0.6');
    } else {
      blockClass += ' anim-block-free';
    }
    rect.setAttribute('class', blockClass);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(lx + layerBlockWidth / 2));
    label.setAttribute('y', String(layerTop + layerBlockHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = layer.label;
    container.appendChild(label);
  });

  // --- Blocked syscalls list ---
  if (data.blockedSyscalls.length > 0) {
    const blockedTop = layerTop + layerBlockHeight + 18;
    const blockedLabel = document.createElementNS(NS, 'text');
    blockedLabel.setAttribute('x', String(width - margin.right - 280));
    blockedLabel.setAttribute('y', String(blockedTop));
    blockedLabel.setAttribute('class', 'anim-cpu-label');
    blockedLabel.textContent = 'Blocked Syscalls:';
    container.appendChild(blockedLabel);

    data.blockedSyscalls.forEach((sc, i) => {
      const sy = blockedTop + 8 + i * 16;
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(width - margin.right - 270));
      text.setAttribute('y', String(sy + 12));
      text.setAttribute('fill', '#f85149');
      text.setAttribute('font-size', '10');
      text.setAttribute('class', 'anim-stack-frame');
      text.textContent = `X ${sc}`;
      container.appendChild(text);
    });
  }

  // --- Namespace / filter / cgroup details ---
  const detailTop = layerTop + layerBlockHeight + 18;
  const items: { label: string; values: string[] }[] = [];
  if (data.namespaceSet.length > 0) items.push({ label: 'Namespaces', values: data.namespaceSet });
  if (data.seccompFilters.length > 0) items.push({ label: 'Filters', values: data.seccompFilters });
  if (data.cgroupLimits.length > 0) items.push({ label: 'Cgroup Limits', values: data.cgroupLimits });

  let itemY = detailTop;
  items.forEach(section => {
    const sectionLabel = document.createElementNS(NS, 'text');
    sectionLabel.setAttribute('x', String(margin.left));
    sectionLabel.setAttribute('y', String(itemY));
    sectionLabel.setAttribute('class', 'anim-cpu-label');
    sectionLabel.textContent = `${section.label}:`;
    container.appendChild(sectionLabel);

    section.values.forEach((val, i) => {
      const vy = itemY + 6 + i * 18;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(margin.left));
      rect.setAttribute('y', String(vy));
      rect.setAttribute('width', String(Math.min(240, usableWidth / 2)));
      rect.setAttribute('height', '16');
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', '#21262d');
      rect.setAttribute('opacity', '0.8');
      rect.setAttribute('class', 'anim-stack-frame');
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(margin.left + 6));
      text.setAttribute('y', String(vy + 12));
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '10');
      text.setAttribute('class', 'anim-stack-frame');
      text.textContent = val;
      container.appendChild(text);
    });

    itemY += 6 + section.values.length * 18 + 10;
  });
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'sandbox-setup', label: 'Sandbox Setup (unshare + seccomp)' },
  { id: 'syscall-filtering', label: 'Syscall Filtering (BPF evaluation)' },
  { id: 'sandbox-escape-prevention', label: 'Escape Prevention (layered defense)' },
];

const seccompSandbox: AnimationModule = {
  config: {
    id: 'seccomp-sandbox',
    title: 'Complete Sandbox with Seccomp + Namespaces + Cgroups',
    skillName: 'seccomp-and-sandboxing',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'syscall-filtering': return generateSyscallFiltering();
      case 'sandbox-escape-prevention': return generateSandboxEscapePrevention();
      case 'sandbox-setup':
      default: return generateSandboxSetup();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default seccompSandbox;
