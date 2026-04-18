import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SeccompState {
  phase: 'init' | 'syscall-entry' | 'validate' | 'prepare' | 'attach' | 'filter-chain' | 'bpf-eval' | 'action' | 'fork' | 'tsync' | 'complete';
  syscallNr: number | null;
  arch: string;
  filterChain: { id: number; progLen: number; verdict: string }[];
  currentFilter: number | null;
  finalAction: string;
  seccompData: { nr: number; arch: string; args: number[] } | null;
  refcount: number;
  threadCount: number;
  srcRef: string;
}

function cloneState(state: SeccompState): SeccompState {
  return {
    ...state,
    filterChain: state.filterChain.map(f => ({ ...f })),
    seccompData: state.seccompData ? { ...state.seccompData, args: [...state.seccompData.args] } : null,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: filter-installation
// ---------------------------------------------------------------------------
function generateFilterInstallationFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: SeccompState = {
    phase: 'init',
    syscallNr: null,
    arch: 'x86_64',
    filterChain: [],
    currentFilter: null,
    finalAction: 'none',
    seccompData: null,
    refcount: 0,
    threadCount: 1,
    srcRef: 'kernel/seccomp.c:2126',
  };

  // Frame 0: seccomp() syscall entry
  frames.push({
    step: 0,
    label: 'seccomp(SECCOMP_SET_MODE_FILTER) syscall entry',
    description: `Userspace calls seccomp(SECCOMP_SET_MODE_FILTER, flags, filter) (kernel/seccomp.c:2126). The SYSCALL_DEFINE3(seccomp) handler at kernel/seccomp.c:2126 dispatches to do_seccomp(op, flags, uargs). The user provides a struct sock_fprog containing the BPF filter program length and instruction array pointer.`,
    highlights: ['syscall-entry'],
    data: cloneState(state),
  });

  // Frame 1: do_seccomp dispatches
  state.phase = 'syscall-entry';
  state.srcRef = 'kernel/seccomp.c:2101';
  frames.push({
    step: 1,
    label: 'do_seccomp() dispatches SECCOMP_SET_MODE_FILTER',
    description: `do_seccomp() (kernel/seccomp.c:2101) is the common entry point for both prctl and syscall paths. The switch on op (kernel/seccomp.c:2104) matches SECCOMP_SET_MODE_FILTER and calls seccomp_set_mode_filter(flags, uargs) at kernel/seccomp.c:2110. Flags may include SECCOMP_FILTER_FLAG_TSYNC or SECCOMP_FILTER_FLAG_LOG.`,
    highlights: ['do-seccomp'],
    data: cloneState(state),
  });

  // Frame 2: seccomp_set_mode_filter validates flags
  state.phase = 'validate';
  state.srcRef = 'kernel/seccomp.c:1956';
  frames.push({
    step: 2,
    label: 'seccomp_set_mode_filter() validates flags and prepares filter',
    description: `seccomp_set_mode_filter() (kernel/seccomp.c:1956) first validates flags against SECCOMP_FILTER_FLAG_MASK (kernel/seccomp.c:1966). It rejects invalid combinations like TSYNC + NEW_LISTENER without TSYNC_ESRCH (kernel/seccomp.c:1976). Then it calls seccomp_prepare_user_filter(filter) at kernel/seccomp.c:1990 to copy the sock_fprog from userspace.`,
    highlights: ['validate-flags'],
    data: cloneState(state),
  });

  // Frame 3: seccomp_prepare_filter allocates and verifies BPF
  state.phase = 'prepare';
  state.srcRef = 'kernel/seccomp.c:669';
  frames.push({
    step: 3,
    label: 'seccomp_prepare_filter() creates and verifies BPF program',
    description: `seccomp_prepare_filter() (kernel/seccomp.c:669) checks fprog->len is between 1 and BPF_MAXINSNS (kernel/seccomp.c:680). It verifies the task has CAP_SYS_ADMIN or no_new_privs set (kernel/seccomp.c:691). A new seccomp_filter is allocated via kzalloc (kernel/seccomp.c:696), then bpf_prog_create_from_user() compiles the cBPF with seccomp_check_filter as the validator (kernel/seccomp.c:701).`,
    highlights: ['prepare-filter'],
    data: cloneState(state),
  });

  // Frame 4: seccomp_check_filter validates BPF instructions
  state.srcRef = 'kernel/seccomp.c:278';
  frames.push({
    step: 4,
    label: 'seccomp_check_filter() validates each BPF instruction',
    description: `seccomp_check_filter() (kernel/seccomp.c:278) iterates every BPF instruction (kernel/seccomp.c:281). For BPF_LD|BPF_W|BPF_ABS it verifies the offset is 32-bit aligned and within sizeof(struct seccomp_data) (kernel/seccomp.c:290). Loads of sk_buff data are rewritten to seccomp_bpf_load. Only an explicit allowlist of opcodes (BPF_RET, BPF_ALU, BPF_JMP, BPF_LD, BPF_LDX) is permitted; anything else returns -EINVAL.`,
    highlights: ['check-filter'],
    data: cloneState(state),
  });

  // Frame 5: refcount initialization
  state.filterChain.push({ id: 1, progLen: 6, verdict: 'pending' });
  state.refcount = 1;
  state.srcRef = 'kernel/seccomp.c:708';
  frames.push({
    step: 5,
    label: 'Filter allocated: refcount=1, refs and users initialized',
    description: `After successful BPF compilation, seccomp_prepare_filter() initializes refcount_set(&sfilter->refs, 1) and refcount_set(&sfilter->users, 1) at kernel/seccomp.c:708-709. It also initializes the notification waitqueue via init_waitqueue_head(&sfilter->wqh) at kernel/seccomp.c:710. The filter is ready for attachment.`,
    highlights: ['filter-alloc'],
    data: cloneState(state),
  });

  // Frame 6: seccomp_attach_filter links into chain
  state.phase = 'attach';
  state.srcRef = 'kernel/seccomp.c:921';
  frames.push({
    step: 6,
    label: 'seccomp_attach_filter() links filter into task chain',
    description: `seccomp_attach_filter() (kernel/seccomp.c:921) is called under sighand->siglock (kernel/seccomp.c:2017). It walks the existing filter chain accumulating total_insns with a 4-instruction penalty per filter (kernel/seccomp.c:931-932), checking against MAX_INSNS_PER_PATH (kernel/seccomp.c:933). Then filter->prev = current->seccomp.filter (kernel/seccomp.c:961) links the new filter as the head. current->seccomp.filter = filter (kernel/seccomp.c:963) and filter_count is incremented (kernel/seccomp.c:964).`,
    highlights: ['attach-filter'],
    data: cloneState(state),
  });

  // Frame 7: seccomp_cache_prepare and mode assignment
  state.srcRef = 'kernel/seccomp.c:962';
  frames.push({
    step: 7,
    label: 'seccomp_cache_prepare() optimizes and mode is assigned',
    description: `seccomp_cache_prepare(filter) at kernel/seccomp.c:962 builds a bitmap cache of syscalls that always return SECCOMP_RET_ALLOW, enabling a fast path that skips BPF evaluation entirely. Then seccomp_assign_mode(current, SECCOMP_MODE_FILTER, flags) at kernel/seccomp.c:2033 sets current->seccomp.mode = SECCOMP_MODE_FILTER and sets TIF_SECCOMP on the thread so the syscall entry path checks filters.`,
    highlights: ['cache-prepare'],
    data: cloneState(state),
  });

  // Frame 8: Filter chain structure (newest first)
  state.phase = 'filter-chain';
  state.filterChain.unshift({ id: 2, progLen: 4, verdict: 'pending' });
  state.refcount = 2;
  state.srcRef = 'kernel/seccomp.c:423';
  frames.push({
    step: 8,
    label: 'Filter chain: newest filter first, linked via prev pointer',
    description: `The seccomp filter chain is a singly-linked list via the prev pointer (kernel/seccomp.c:961). current->seccomp.filter points to the newest filter. seccomp_run_filters() at kernel/seccomp.c:423 traverses with "for (; f; f = f->prev)" evaluating all filters. The lowest (most restrictive) SECCOMP_RET_ACTION wins (kernel/seccomp.c:426). Installing a second filter prepends it: filter2->prev = filter1, so filter2 runs first.`,
    highlights: ['filter-chain'],
    data: cloneState(state),
  });

  // Frame 9: Installation complete
  state.phase = 'complete';
  state.srcRef = 'kernel/seccomp.c:2033';
  frames.push({
    step: 9,
    label: 'Filter installation complete -- task now has seccomp mode FILTER',
    description: `seccomp_set_mode_filter() releases sighand->siglock (kernel/seccomp.c:2035) and returns 0 on success. The task's seccomp.mode is now SECCOMP_MODE_FILTER. Every subsequent syscall entry will invoke __secure_computing() (kernel/seccomp.c:1388) which checks the mode and calls __seccomp_filter() (kernel/seccomp.c:1404) to evaluate all filters in the chain. The prepared filter pointer is set to NULL (kernel/seccomp.c:2031) to prevent double-free.`,
    highlights: ['complete'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 2: syscall-filtering
// ---------------------------------------------------------------------------
function generateSyscallFilteringFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: SeccompState = {
    phase: 'init',
    syscallNr: 2, // __NR_open
    arch: 'x86_64',
    filterChain: [
      { id: 2, progLen: 4, verdict: 'pending' },
      { id: 1, progLen: 6, verdict: 'pending' },
    ],
    currentFilter: null,
    finalAction: 'pending',
    seccompData: null,
    refcount: 2,
    threadCount: 1,
    srcRef: 'kernel/seccomp.c:1388',
  };

  // Frame 0: syscall entry triggers seccomp check
  frames.push({
    step: 0,
    label: 'Syscall entry: __secure_computing() checks seccomp mode',
    description: `On every syscall entry, the architecture-specific entry code checks TIF_SECCOMP and calls __secure_computing() (kernel/seccomp.c:1388). It reads current->seccomp.mode (kernel/seccomp.c:1390) and calls syscall_get_nr(current, current_pt_regs()) at kernel/seccomp.c:1397 to get the syscall number. For SECCOMP_MODE_FILTER, it dispatches to __seccomp_filter(this_syscall, false) at kernel/seccomp.c:1404.`,
    highlights: ['secure-computing'],
    data: cloneState(state),
  });

  // Frame 1: __seccomp_filter entry
  state.phase = 'syscall-entry';
  state.srcRef = 'kernel/seccomp.c:1259';
  frames.push({
    step: 1,
    label: '__seccomp_filter() begins filter evaluation',
    description: `__seccomp_filter() (kernel/seccomp.c:1259) issues smp_rmb() (kernel/seccomp.c:1270) to ensure any cross-thread mode changes are visible. It declares struct seccomp_data sd and struct seccomp_filter *match = NULL (kernel/seccomp.c:1262-1263). The match pointer will track which filter produced the most restrictive verdict.`,
    highlights: ['seccomp-filter'],
    data: cloneState(state),
  });

  // Frame 2: populate_seccomp_data fills seccomp_data
  state.phase = 'bpf-eval';
  state.seccompData = { nr: 2, arch: 0xc000003e, args: [0x7ffd1234, 0, 0x1b6, 0, 0, 0] };
  state.srcRef = 'kernel/seccomp.c:1272';
  frames.push({
    step: 2,
    label: 'populate_seccomp_data() fills struct seccomp_data',
    description: `populate_seccomp_data(&sd) at kernel/seccomp.c:1272 fills the seccomp_data struct. sd.nr = syscall_get_nr() gets the syscall number (kernel/seccomp.c:254), sd.arch = syscall_get_arch() gets AUDIT_ARCH_X86_64 (kernel/seccomp.c:255), syscall_get_arguments() copies all 6 args (kernel/seccomp.c:256), and sd.instruction_pointer = KSTK_EIP(task) at kernel/seccomp.c:263. This struct is the input to BPF evaluation.`,
    highlights: ['populate-data'],
    data: cloneState(state),
  });

  // Frame 3: seccomp_run_filters starts evaluation
  state.srcRef = 'kernel/seccomp.c:404';
  frames.push({
    step: 3,
    label: 'seccomp_run_filters() begins chain evaluation',
    description: `seccomp_run_filters(&sd, &match) (kernel/seccomp.c:404) initializes ret = SECCOMP_RET_ALLOW (kernel/seccomp.c:407). It reads f = READ_ONCE(current->seccomp.filter) at kernel/seccomp.c:410. If f is NULL, it returns SECCOMP_RET_KILL_PROCESS as a safety check (kernel/seccomp.c:414). First it tries the bitmap cache via seccomp_cache_check_allow(f, sd) at kernel/seccomp.c:416 for a fast-path allow.`,
    highlights: ['run-filters'],
    data: cloneState(state),
  });

  // Frame 4: First filter (newest) evaluated
  state.currentFilter = 0;
  state.filterChain[0].verdict = 'SECCOMP_RET_ALLOW';
  state.srcRef = 'kernel/seccomp.c:424';
  frames.push({
    step: 4,
    label: 'Filter #2 (newest): BPF returns SECCOMP_RET_ALLOW',
    description: `The for loop at kernel/seccomp.c:423 starts with the newest filter. cur_ret = bpf_prog_run_pin_on_cpu(f->prog, sd) at kernel/seccomp.c:424 runs the BPF program against the seccomp_data. This filter allows open(). Since ACTION_ONLY(cur_ret) is not less than ACTION_ONLY(ret) (both ALLOW), ret stays SECCOMP_RET_ALLOW and match is not updated. The loop continues with f = f->prev.`,
    highlights: ['filter-eval-0'],
    data: cloneState(state),
  });

  // Frame 5: Second filter (older) evaluated -- denies with ERRNO
  state.currentFilter = 1;
  state.filterChain[1].verdict = 'SECCOMP_RET_ERRNO';
  state.srcRef = 'kernel/seccomp.c:426';
  frames.push({
    step: 5,
    label: 'Filter #1 (older): BPF returns SECCOMP_RET_ERRNO|EPERM',
    description: `The second filter in the chain (f->prev) runs. bpf_prog_run_pin_on_cpu() returns SECCOMP_RET_ERRNO|1 (EPERM). ACTION_ONLY(SECCOMP_RET_ERRNO) = 0x00050000 < ACTION_ONLY(SECCOMP_RET_ALLOW) = 0x7fff0000, so the check at kernel/seccomp.c:426 is true: ret = cur_ret and *match = f. All filters are always evaluated -- the most restrictive (lowest action value) wins.`,
    highlights: ['filter-eval-1'],
    data: cloneState(state),
  });

  // Frame 6: seccomp_run_filters returns
  state.currentFilter = null;
  state.finalAction = 'SECCOMP_RET_ERRNO';
  state.srcRef = 'kernel/seccomp.c:1274';
  frames.push({
    step: 6,
    label: 'seccomp_run_filters() returns SECCOMP_RET_ERRNO',
    description: `After traversing all filters (kernel/seccomp.c:431), seccomp_run_filters() returns ret = SECCOMP_RET_ERRNO|1. Back in __seccomp_filter(), filter_ret is split: data = filter_ret & SECCOMP_RET_DATA = 1 (EPERM), action = filter_ret & SECCOMP_RET_ACTION_FULL = SECCOMP_RET_ERRNO at kernel/seccomp.c:1275-1276. The switch at kernel/seccomp.c:1278 dispatches on the action.`,
    highlights: ['filter-result'],
    data: cloneState(state),
  });

  // Frame 7: SECCOMP_RET_ERRNO handling
  state.phase = 'action';
  state.srcRef = 'kernel/seccomp.c:1279';
  frames.push({
    step: 7,
    label: 'SECCOMP_RET_ERRNO: syscall returns -EPERM to userspace',
    description: `The SECCOMP_RET_ERRNO case at kernel/seccomp.c:1279 caps data at MAX_ERRNO (kernel/seccomp.c:1281). Then syscall_set_return_value(current, current_pt_regs(), -data, 0) at kernel/seccomp.c:1283 sets the return register to -EPERM. Execution jumps to skip (kernel/seccomp.c:1285) which calls seccomp_log() (kernel/seccomp.c:1376) if the filter has logging enabled, then returns -1 to signal the syscall should be skipped.`,
    highlights: ['action-errno'],
    data: cloneState(state),
  });

  // Frame 8: Other possible actions
  state.phase = 'complete';
  state.srcRef = 'kernel/seccomp.c:1347';
  frames.push({
    step: 8,
    label: 'Seccomp filter evaluation complete -- syscall blocked',
    description: `The full action switch at kernel/seccomp.c:1278 handles: SECCOMP_RET_ALLOW (kernel/seccomp.c:1347) returns 0 letting the syscall proceed; SECCOMP_RET_KILL_PROCESS (kernel/seccomp.c:1356) sets mode to SECCOMP_MODE_DEAD and sends SIGSYS; SECCOMP_RET_TRAP (kernel/seccomp.c:1287) delivers SIGSYS via force_sig_seccomp(); SECCOMP_RET_TRACE (kernel/seccomp.c:1294) notifies a ptrace tracer; SECCOMP_RET_USER_NOTIF (kernel/seccomp.c:1337) forwards to a userspace notification fd.`,
    highlights: ['complete'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 3: filter-inheritance
// ---------------------------------------------------------------------------
function generateFilterInheritanceFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: SeccompState = {
    phase: 'init',
    syscallNr: null,
    arch: 'x86_64',
    filterChain: [
      { id: 2, progLen: 4, verdict: 'inherited' },
      { id: 1, progLen: 6, verdict: 'inherited' },
    ],
    currentFilter: null,
    finalAction: 'none',
    seccompData: null,
    refcount: 1,
    threadCount: 1,
    srcRef: 'kernel/fork.c:2413',
  };

  // Frame 0: copy_process calls copy_seccomp
  frames.push({
    step: 0,
    label: 'fork(): copy_process() calls copy_seccomp()',
    description: `During fork(), copy_process() calls copy_seccomp(p) at kernel/fork.c:2413. The comment at kernel/fork.c:2410 explains this is done explicitly after holding sighand lock, in case seccomp state changed between task_struct duplication and lock acquisition. copy_seccomp() at kernel/fork.c:1749 is called under assert_spin_locked(&current->sighand->siglock) at kernel/fork.c:1758.`,
    highlights: ['copy-process'],
    data: cloneState(state),
  });

  // Frame 1: get_seccomp_filter increments refcount
  state.phase = 'fork';
  state.refcount = 2;
  state.srcRef = 'kernel/seccomp.c:979';
  frames.push({
    step: 1,
    label: 'get_seccomp_filter() increments filter refcount',
    description: `copy_seccomp() calls get_seccomp_filter(current) at kernel/fork.c:1761. get_seccomp_filter() (kernel/seccomp.c:979) reads orig = tsk->seccomp.filter (kernel/seccomp.c:981), then calls __get_seccomp_filter(orig) which does refcount_inc(&filter->refs) at kernel/seccomp.c:975, and also increments refcount_inc(&orig->users) at kernel/seccomp.c:986. The filter is shared, not copied.`,
    highlights: ['get-filter'],
    data: cloneState(state),
  });

  // Frame 2: child inherits parent's seccomp struct
  state.srcRef = 'kernel/fork.c:1762';
  frames.push({
    step: 2,
    label: 'Child inherits parent seccomp state via struct copy',
    description: `p->seccomp = current->seccomp at kernel/fork.c:1762 copies the entire struct seccomp from parent to child. This includes seccomp.mode (SECCOMP_MODE_FILTER), seccomp.filter (pointer to the same filter chain head), and seccomp.filter_count. The child shares the same filter linked list -- both parent and child point to filter2->prev->filter1. No BPF programs are duplicated.`,
    highlights: ['inherit-seccomp'],
    data: cloneState(state),
  });

  // Frame 3: no_new_privs propagation
  state.srcRef = 'kernel/fork.c:1769';
  frames.push({
    step: 3,
    label: 'no_new_privs propagated to child process',
    description: `If the parent has no_new_privs set, copy_seccomp() propagates it to the child via task_set_no_new_privs(p) at kernel/fork.c:1770. This check at kernel/fork.c:1769 handles a race: no_new_privs may have been set between task_struct duplication and the sighand lock acquisition. The nnp bit ensures the child cannot gain privileges via exec() that would bypass the inherited seccomp filters.`,
    highlights: ['no-new-privs'],
    data: cloneState(state),
  });

  // Frame 4: Filter chain shared between parent and child
  state.refcount = 2;
  state.threadCount = 2;
  state.srcRef = 'kernel/seccomp.c:961';
  frames.push({
    step: 4,
    label: 'Filter chain shared: refcount=2, parent and child share filters',
    description: `After copy_seccomp(), both parent and child point to the same seccomp_filter chain. The filter's refs refcount is 2 (kernel/seccomp.c:975). The prev pointers (kernel/seccomp.c:961) form a shared linked list. If the child later installs a new filter, it prepends to its own chain -- the new filter->prev points to the shared ancestor. This is copy-on-write for filter chains.`,
    highlights: ['shared-chain'],
    data: cloneState(state),
  });

  // Frame 5: SECCOMP_FILTER_FLAG_TSYNC overview
  state.phase = 'tsync';
  state.srcRef = 'kernel/seccomp.c:937';
  frames.push({
    step: 5,
    label: 'SECCOMP_FILTER_FLAG_TSYNC synchronizes across threads',
    description: `When installing a filter with SECCOMP_FILTER_FLAG_TSYNC (kernel/seccomp.c:937), seccomp_attach_filter() first calls seccomp_can_sync_threads() (kernel/seccomp.c:940) to verify all threads can accept the new filter. If TSYNC_ESRCH is not set and sync fails, it returns the failing thread's pid. Otherwise seccomp_sync_threads() at kernel/seccomp.c:968 is called after attachment.`,
    highlights: ['tsync-flag'],
    data: cloneState(state),
  });

  // Frame 6: seccomp_sync_threads iterates thread group
  state.srcRef = 'kernel/seccomp.c:598';
  state.threadCount = 3;
  frames.push({
    step: 6,
    label: 'seccomp_sync_threads() updates all threads in the group',
    description: `seccomp_sync_threads() (kernel/seccomp.c:598) holds both cred_guard_mutex (kernel/seccomp.c:602) and sighand->siglock (kernel/seccomp.c:603). It uses for_each_thread(caller, thread) at kernel/seccomp.c:614 to iterate all threads. For each non-exiting thread, it calls get_seccomp_filter(caller) (kernel/seccomp.c:627) to increment the refcount, releases the thread's old filter via __seccomp_filter_release() (kernel/seccomp.c:634), then uses smp_store_release(&thread->seccomp.filter, ...) at kernel/seccomp.c:637 to atomically update the thread's filter pointer.`,
    highlights: ['sync-threads'],
    data: cloneState(state),
  });

  // Frame 7: Thread synchronization effects
  state.srcRef = 'kernel/seccomp.c:637';
  frames.push({
    step: 7,
    label: 'All threads now share the same filter chain',
    description: `After seccomp_sync_threads(), every thread in the thread group points to the caller's filter chain via smp_store_release() at kernel/seccomp.c:637. Each thread's seccomp.mode is set to SECCOMP_MODE_FILTER and SYSCALL_WORK_SECCOMP is enabled via seccomp_assign_mode() at kernel/seccomp.c:645. Old per-thread filters are properly released. This ensures no thread can escape the security policy.`,
    highlights: ['all-synced'],
    data: cloneState(state),
  });

  // Frame 8: Inheritance summary
  state.phase = 'complete';
  state.srcRef = 'kernel/fork.c:1749';
  frames.push({
    step: 8,
    label: 'Filter inheritance complete -- seccomp policy crosses fork()',
    description: `Seccomp filter inheritance (kernel/fork.c:1749) ensures security policies survive fork(). Filters are reference-counted (kernel/seccomp.c:708) and shared via copy-on-write semantics. SECCOMP_FILTER_FLAG_TSYNC (kernel/seccomp.c:598) synchronizes all threads in a thread group. Together with no_new_privs (kernel/fork.c:1769), this prevents privilege escalation across process boundaries. The filter chain is immutable once attached -- only new filters can be prepended.`,
    highlights: ['complete'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenarios and module definition
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'filter-installation', label: 'Seccomp Filter Installation' },
  { id: 'syscall-filtering', label: 'Syscall Filtering with BPF' },
  { id: 'filter-inheritance', label: 'Filter Inheritance on fork()' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFilterChain(
  container: SVGGElement,
  filters: SeccompState['filterChain'],
  currentFilter: number | null,
  highlights: string[],
  startX: number,
  startY: number,
  boxW: number,
  boxH: number,
): void {
  const gap = 16;

  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const x = startX;
    const y = startY + i * (boxH + gap);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxW));
    rect.setAttribute('height', String(boxH));
    rect.setAttribute('rx', '5');

    let cls = 'anim-filter';
    const filterHighlightId = `filter-eval-${i}`;
    if (highlights.includes(filterHighlightId)) cls += ' anim-highlight';
    if (i === currentFilter) cls += ' anim-active';

    rect.setAttribute('class', cls);

    let fill = '#34495e';
    if (filter.verdict === 'SECCOMP_RET_ALLOW') fill = '#27ae60';
    else if (filter.verdict === 'SECCOMP_RET_ERRNO') fill = '#e74c3c';
    else if (filter.verdict === 'SECCOMP_RET_KILL_PROCESS') fill = '#c0392b';
    else if (filter.verdict === 'inherited') fill = '#2980b9';
    rect.setAttribute('fill', fill);
    rect.setAttribute('opacity', i === currentFilter ? '1' : '0.7');
    rect.setAttribute('stroke', i === currentFilter ? '#f39c12' : '#555');
    rect.setAttribute('stroke-width', i === currentFilter ? '3' : '1');

    container.appendChild(rect);

    const nameText = document.createElementNS(NS, 'text');
    nameText.setAttribute('x', String(x + boxW / 2));
    nameText.setAttribute('y', String(y + boxH / 2 - 4));
    nameText.setAttribute('text-anchor', 'middle');
    nameText.setAttribute('class', 'anim-filter');
    nameText.setAttribute('fill', '#fff');
    nameText.setAttribute('font-weight', 'bold');
    nameText.textContent = `Filter #${filter.id} (${filter.progLen} insns)`;
    container.appendChild(nameText);

    const verdictText = document.createElementNS(NS, 'text');
    verdictText.setAttribute('x', String(x + boxW / 2));
    verdictText.setAttribute('y', String(y + boxH / 2 + 14));
    verdictText.setAttribute('text-anchor', 'middle');
    verdictText.setAttribute('class', 'anim-verdict');
    verdictText.setAttribute('fill', '#ddd');
    verdictText.setAttribute('font-size', '10');
    verdictText.textContent = filter.verdict === 'pending' ? '...' : filter.verdict;
    container.appendChild(verdictText);

    // Arrow (prev pointer) from this filter to the next
    if (i < filters.length - 1) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(x + boxW / 2));
      line.setAttribute('y1', String(y + boxH));
      line.setAttribute('x2', String(x + boxW / 2));
      line.setAttribute('y2', String(startY + (i + 1) * (boxH + gap)));
      line.setAttribute('stroke', '#888');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4,3');
      container.appendChild(line);

      const prevLabel = document.createElementNS(NS, 'text');
      prevLabel.setAttribute('x', String(x + boxW / 2 + 12));
      prevLabel.setAttribute('y', String(y + boxH + (gap / 2) + 3));
      prevLabel.setAttribute('text-anchor', 'start');
      prevLabel.setAttribute('fill', '#888');
      prevLabel.setAttribute('font-size', '9');
      prevLabel.textContent = 'prev';
      container.appendChild(prevLabel);
    }
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as SeccompState;
  const margin = { top: 10, right: 10, bottom: 10, left: 10 };

  // Arrowhead marker
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'seccomp-arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(NS, 'polygon');
  arrowPath.setAttribute('points', '0 0, 10 3.5, 0 7');
  arrowPath.setAttribute('fill', '#888');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  container.appendChild(defs);

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', String(margin.top + 14));
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'Seccomp-BPF Syscall Filtering';
  container.appendChild(titleEl);

  // Phase indicator (top-left)
  const infoY = margin.top + 40;
  const phaseLabel = document.createElementNS(NS, 'text');
  phaseLabel.setAttribute('x', String(margin.left + 10));
  phaseLabel.setAttribute('y', String(infoY));
  phaseLabel.setAttribute('class', 'anim-hook');
  phaseLabel.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseLabel);

  // Syscall info
  if (data.syscallNr !== null) {
    const sysLabel = document.createElementNS(NS, 'text');
    sysLabel.setAttribute('x', String(margin.left + 10));
    sysLabel.setAttribute('y', String(infoY + 18));
    sysLabel.setAttribute('class', 'anim-hook');
    sysLabel.setAttribute('fill', '#3498db');
    sysLabel.textContent = `Syscall NR: ${data.syscallNr} (${data.arch})`;
    container.appendChild(sysLabel);
  }

  // Left side: entry box
  const entryBoxX = margin.left + 20;
  const entryBoxY = margin.top + 75;
  const entryBoxW = 160;
  const entryBoxH = 40;

  const entryRect = document.createElementNS(NS, 'rect');
  entryRect.setAttribute('x', String(entryBoxX));
  entryRect.setAttribute('y', String(entryBoxY));
  entryRect.setAttribute('width', String(entryBoxW));
  entryRect.setAttribute('height', String(entryBoxH));
  entryRect.setAttribute('rx', '5');
  let entryCls = 'anim-filter';
  if (frame.highlights.includes('syscall-entry') || frame.highlights.includes('secure-computing') || frame.highlights.includes('copy-process')) {
    entryCls += ' anim-highlight';
  }
  entryRect.setAttribute('class', entryCls);
  entryRect.setAttribute('fill', '#2c3e50');
  entryRect.setAttribute('stroke', frame.highlights.some(h => ['syscall-entry', 'secure-computing', 'copy-process'].includes(h)) ? '#f39c12' : '#555');
  entryRect.setAttribute('stroke-width', frame.highlights.some(h => ['syscall-entry', 'secure-computing', 'copy-process'].includes(h)) ? '2' : '1');
  container.appendChild(entryRect);

  const entryText = document.createElementNS(NS, 'text');
  entryText.setAttribute('x', String(entryBoxX + entryBoxW / 2));
  entryText.setAttribute('y', String(entryBoxY + entryBoxH / 2 + 4));
  entryText.setAttribute('text-anchor', 'middle');
  entryText.setAttribute('class', 'anim-filter');
  entryText.setAttribute('fill', '#ecf0f1');
  const entryLabel = data.phase === 'fork' || data.phase === 'tsync'
    ? 'copy_process()'
    : data.filterChain.length === 0
      ? 'seccomp()'
      : '__secure_computing()';
  entryText.textContent = entryLabel;
  container.appendChild(entryText);

  // Arrow from entry to filter chain area
  if (data.filterChain.length > 0) {
    const chainX = entryBoxX + entryBoxW + 30;
    const chainY = entryBoxY;
    const chainW = 200;
    const chainH = 40;

    const arrow1 = document.createElementNS(NS, 'line');
    arrow1.setAttribute('x1', String(entryBoxX + entryBoxW));
    arrow1.setAttribute('y1', String(entryBoxY + entryBoxH / 2));
    arrow1.setAttribute('x2', String(chainX));
    arrow1.setAttribute('y2', String(chainY + chainH / 2));
    arrow1.setAttribute('stroke', '#888');
    arrow1.setAttribute('stroke-width', '2');
    arrow1.setAttribute('marker-end', 'url(#seccomp-arrow)');
    container.appendChild(arrow1);

    // seccomp_run_filters / filter-chain header box
    const headerRect = document.createElementNS(NS, 'rect');
    headerRect.setAttribute('x', String(chainX));
    headerRect.setAttribute('y', String(chainY));
    headerRect.setAttribute('width', String(chainW));
    headerRect.setAttribute('height', String(chainH));
    headerRect.setAttribute('rx', '5');
    let headerCls = 'anim-hook';
    if (frame.highlights.includes('run-filters') || frame.highlights.includes('filter-chain') || frame.highlights.includes('attach-filter')) {
      headerCls += ' anim-highlight';
    }
    headerRect.setAttribute('class', headerCls);
    headerRect.setAttribute('fill', '#8e44ad');
    headerRect.setAttribute('stroke', frame.highlights.some(h => ['run-filters', 'filter-chain', 'attach-filter'].includes(h)) ? '#f39c12' : '#555');
    headerRect.setAttribute('stroke-width', frame.highlights.some(h => ['run-filters', 'filter-chain', 'attach-filter'].includes(h)) ? '2' : '1');
    container.appendChild(headerRect);

    const headerText = document.createElementNS(NS, 'text');
    headerText.setAttribute('x', String(chainX + chainW / 2));
    headerText.setAttribute('y', String(chainY + chainH / 2 + 4));
    headerText.setAttribute('text-anchor', 'middle');
    headerText.setAttribute('class', 'anim-hook');
    headerText.setAttribute('fill', '#ecf0f1');
    headerText.setAttribute('font-size', '11');
    headerText.textContent = 'seccomp_run_filters()';
    container.appendChild(headerText);

    // Arrow from header to first filter
    const filterBoxW = 180;
    const filterBoxH = 46;
    const filterStartX = chainX + (chainW - filterBoxW) / 2;
    const filterStartY = chainY + chainH + 15;

    const hookToFilterArrow = document.createElementNS(NS, 'line');
    hookToFilterArrow.setAttribute('x1', String(chainX + chainW / 2));
    hookToFilterArrow.setAttribute('y1', String(chainY + chainH));
    hookToFilterArrow.setAttribute('x2', String(filterStartX + filterBoxW / 2));
    hookToFilterArrow.setAttribute('y2', String(filterStartY));
    hookToFilterArrow.setAttribute('stroke', '#888');
    hookToFilterArrow.setAttribute('stroke-width', '1.5');
    hookToFilterArrow.setAttribute('marker-end', 'url(#seccomp-arrow)');
    container.appendChild(hookToFilterArrow);

    renderFilterChain(container, data.filterChain, data.currentFilter, frame.highlights, filterStartX, filterStartY, filterBoxW, filterBoxH);
  }

  // seccomp_data panel (when populated)
  if (data.seccompData) {
    const sdX = width - 190;
    const sdY = margin.top + 75;

    const sdRect = document.createElementNS(NS, 'rect');
    sdRect.setAttribute('x', String(sdX));
    sdRect.setAttribute('y', String(sdY));
    sdRect.setAttribute('width', '170');
    sdRect.setAttribute('height', '80');
    sdRect.setAttribute('rx', '5');
    sdRect.setAttribute('class', frame.highlights.includes('populate-data') ? 'anim-filter anim-highlight' : 'anim-filter');
    sdRect.setAttribute('fill', '#1a2533');
    sdRect.setAttribute('stroke', frame.highlights.includes('populate-data') ? '#f39c12' : '#555');
    container.appendChild(sdRect);

    const sdTitle = document.createElementNS(NS, 'text');
    sdTitle.setAttribute('x', String(sdX + 85));
    sdTitle.setAttribute('y', String(sdY + 16));
    sdTitle.setAttribute('text-anchor', 'middle');
    sdTitle.setAttribute('fill', '#3498db');
    sdTitle.setAttribute('font-size', '10');
    sdTitle.setAttribute('font-weight', 'bold');
    sdTitle.textContent = 'struct seccomp_data';
    container.appendChild(sdTitle);

    const fields = [
      `nr: ${data.seccompData.nr}`,
      `arch: 0x${data.seccompData.arch.toString(16)}`,
      `args[0]: 0x${data.seccompData.args[0].toString(16)}`,
    ];
    fields.forEach((text, idx) => {
      const el = document.createElementNS(NS, 'text');
      el.setAttribute('x', String(sdX + 10));
      el.setAttribute('y', String(sdY + 34 + idx * 14));
      el.setAttribute('fill', '#aaa');
      el.setAttribute('font-size', '9');
      el.textContent = text;
      container.appendChild(el);
    });
  }

  // Right side: Info panel
  const panelX = width - 190;
  const panelY = data.seccompData ? margin.top + 170 : margin.top + 75;

  // Final action
  const actionLabel = document.createElementNS(NS, 'text');
  actionLabel.setAttribute('x', String(panelX));
  actionLabel.setAttribute('y', String(panelY));
  actionLabel.setAttribute('class', 'anim-verdict');
  let actionColor = '#888';
  if (data.finalAction.includes('ALLOW')) actionColor = '#27ae60';
  else if (data.finalAction.includes('ERRNO') || data.finalAction.includes('KILL')) actionColor = '#e74c3c';
  actionLabel.setAttribute('fill', actionColor);
  actionLabel.setAttribute('font-weight', 'bold');
  actionLabel.setAttribute('font-size', '11');
  actionLabel.textContent = `Action: ${data.finalAction}`;
  container.appendChild(actionLabel);

  // Refcount
  const refLabel = document.createElementNS(NS, 'text');
  refLabel.setAttribute('x', String(panelX));
  refLabel.setAttribute('y', String(panelY + 20));
  refLabel.setAttribute('class', 'anim-verdict');
  refLabel.setAttribute('fill', '#888');
  refLabel.setAttribute('font-size', '10');
  refLabel.textContent = `Refs: ${data.refcount} | Threads: ${data.threadCount}`;
  container.appendChild(refLabel);

  // Source reference
  const srcRefLabel = document.createElementNS(NS, 'text');
  srcRefLabel.setAttribute('x', String(panelX));
  srcRefLabel.setAttribute('y', String(panelY + 40));
  srcRefLabel.setAttribute('class', 'anim-hook');
  srcRefLabel.setAttribute('fill', '#888');
  srcRefLabel.textContent = `Src: ${data.srcRef}`;
  container.appendChild(srcRefLabel);

  // Bottom: Step label bar
  const descY = height - margin.bottom - 15;
  const descBg = document.createElementNS(NS, 'rect');
  descBg.setAttribute('x', String(margin.left));
  descBg.setAttribute('y', String(descY - 14));
  descBg.setAttribute('width', String(width - margin.left - margin.right));
  descBg.setAttribute('height', '22');
  descBg.setAttribute('rx', '3');
  descBg.setAttribute('class', 'anim-filter');
  descBg.setAttribute('opacity', '0.15');
  container.appendChild(descBg);

  const descText = document.createElementNS(NS, 'text');
  descText.setAttribute('x', String(margin.left + 5));
  descText.setAttribute('y', String(descY));
  descText.setAttribute('class', 'anim-hook');
  const shortLabel = frame.label.length > 90 ? frame.label.substring(0, 87) + '...' : frame.label;
  descText.textContent = shortLabel;
  container.appendChild(descText);
}

const seccompBpf: AnimationModule = {
  config: {
    id: 'seccomp-bpf',
    title: 'Seccomp-BPF Syscall Filtering',
    skillName: 'seccomp-filters',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'syscall-filtering':
        return generateSyscallFilteringFrames();
      case 'filter-inheritance':
        return generateFilterInheritanceFrames();
      case 'filter-installation':
      default:
        return generateFilterInstallationFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default seccompBpf;
