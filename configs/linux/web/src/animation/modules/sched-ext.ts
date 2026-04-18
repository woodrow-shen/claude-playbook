import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface SchedExtState {
  phase: 'loading' | 'init' | 'enabling' | 'enabled' | 'enqueue' | 'dispatch' | 'pick' | 'running' | 'error' | 'disabling' | 'fallback';
  bpfOps: Record<string, boolean>;
  dispatchQueue: string[];
  tasks: string[];
  scxEnabled: boolean;
  errorState: string | null;
  srcRef: string;
  dlServer?: {
    /** Current remaining runtime budget in nanoseconds (drains under ticks). */
    runtime: number;
    /** Replenishment budget -- dl_runtime (reset to this on each period). */
    dlRuntime: number;
    /** Period in nanoseconds (1_000_000_000 = 1s, default for ext_server). */
    dlPeriod: number;
    /** Absolute deadline (rq_clock + dl_period on replenish). */
    deadline: number;
    /** dl_server_active flag -- true between dl_server_start and dl_server_stop. */
    active: boolean;
    /** Set while ext_server_pick_task is running. */
    picking: boolean;
    /** Throttled means runtime drained to 0 and awaiting replenish/period timer. */
    throttled: boolean;
    /** Kernel version label for contrast frames ('pre-v7.0' shows the bug). */
    era: 'pre-v7.0' | 'v7.0';
  };
  /**
   * Simulated CPU timeline -- sequence of slices showing which class ran. Used
   * to contrast pre-v7.0 RT starvation with v7.0 DL-server-guaranteed SCX.
   * Each entry is 5ms in simulated wall time.
   */
  cpuTimeline?: Array<{ kind: 'RT' | 'SCX' | 'IDLE'; label: string }>;
  /** Highest observed SCX wait latency in milliseconds (bound we're proving). */
  rtLatencyMs?: number;
}

function cloneState(s: SchedExtState): SchedExtState {
  const copy: SchedExtState = {
    phase: s.phase,
    bpfOps: { ...s.bpfOps },
    dispatchQueue: [...s.dispatchQueue],
    tasks: [...s.tasks],
    scxEnabled: s.scxEnabled,
    errorState: s.errorState,
    srcRef: s.srcRef,
  };
  if (s.dlServer) {
    copy.dlServer = { ...s.dlServer };
  }
  if (s.cpuTimeline) {
    copy.cpuTimeline = s.cpuTimeline.map(slot => ({ ...slot }));
  }
  if (s.rtLatencyMs !== undefined) {
    copy.rtLatencyMs = s.rtLatencyMs;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Scenario: scx-ops-enable (default)
// Loading and enabling an ext scheduler via BPF struct_ops
// ---------------------------------------------------------------------------
function generateScxOpsEnable(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SchedExtState = {
    phase: 'loading',
    bpfOps: {},
    dispatchQueue: [],
    tasks: [],
    scxEnabled: false,
    errorState: null,
    srcRef: '',
  };

  // Frame 0: BPF program loads struct_ops
  state.srcRef = 'kernel/sched/ext.c:7341 (bpf_scx_reg)';
  frames.push({
    step: 0,
    label: 'BPF struct_ops program loads sched_ext_ops',
    description: 'A BPF program registers a sched_ext scheduler via bpf_struct_ops. bpf_scx_reg() at kernel/sched/ext.c:7341 is called when the BPF link is created. The sched_ext_ops struct defines callbacks like .enqueue, .dispatch, .init_task, and .init. The kernel validates the BPF program via bpf_scx_validate() at line 7376 before enabling.',
    highlights: ['ops-struct'],
    data: cloneState(state),
  });

  // Frame 1: scx_enable() entry
  state.phase = 'init';
  state.srcRef = 'kernel/sched/ext.c:7134 (scx_enable)';
  frames.push({
    step: 1,
    label: 'scx_enable() begins scheduler activation',
    description: 'scx_enable() at kernel/sched/ext.c:7134 is called with the sched_ext_ops and bpf_link. It creates a dedicated RT kthread worker "scx_enable_helper" (line 7150) with sched_set_fifo() priority (line 7155) to avoid starvation during enable. It queues scx_root_enable_workfn() (line 7166) on this kthread and waits for completion.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 2: scx_root_enable_workfn begins
  state.srcRef = 'kernel/sched/ext.c:6583-6639 (scx_root_enable_workfn)';
  state.bpfOps['init'] = true;
  frames.push({
    step: 2,
    label: 'scx_root_enable_workfn() initializes scheduler',
    description: 'scx_root_enable_workfn() at kernel/sched/ext.c:6583 acquires scx_enable_mutex (line 6593), checks state is SCX_DISABLED (line 6595), allocates kick syncs (line 6600), and calls scx_alloc_and_add_sched() (line 6607) to create the scx_sched struct. It transitions state to SCX_ENABLING (line 6617), initializes per-CPU local DSQs (lines 6622-6627), and makes the scheduler visible via rcu_assign_pointer(scx_root, sch) at line 6639.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 3: ops.init() callback
  state.srcRef = 'kernel/sched/ext.c:6647-6656 (ops.init callback)';
  frames.push({
    step: 3,
    label: 'BPF ops.init() callback invoked',
    description: 'At kernel/sched/ext.c:6647, if the BPF scheduler defines ops.init, it is called via SCX_CALL_OP_RET(). This is where the BPF scheduler performs its own initialization -- creating custom DSQs via scx_bpf_create_dsq(), initializing per-CPU state, etc. On failure (line 6649), ops_sanitize_err() sanitizes the return code and scx_error() triggers disable. On success, SCX_EFLAG_INITIALIZED is set (line 6655).',
    highlights: ['ops-callback'],
    data: cloneState(state),
  });

  // Frame 4: validate_ops and bypass mode
  state.phase = 'enabling';
  state.bpfOps['enqueue'] = true;
  state.bpfOps['dispatch'] = true;
  state.srcRef = 'kernel/sched/ext.c:6671-6681 (validate_ops, bypass mode)';
  frames.push({
    step: 4,
    label: 'Validate ops and enter bypass mode',
    description: 'validate_ops() at kernel/sched/ext.c:6543 checks for invalid flag combinations -- e.g., SCX_OPS_ENQ_LAST without ops.enqueue (line 6549). At line 6681, scx_bypass(sch, true) enters bypass mode to guarantee forward progress while switching tasks. In bypass mode, all tasks use a simple FIFO with SCX_SLICE_BYPASS (5ms) slices, ensuring the system remains responsive during the transition.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 5: Init and enable tasks
  state.bpfOps['init_task'] = true;
  state.bpfOps['enable'] = true;
  state.tasks = ['init[1]', 'kthreadd[2]', 'bash[1234]'];
  state.srcRef = 'kernel/sched/ext.c:6718-6737 (scx_init_task loop)';
  frames.push({
    step: 5,
    label: 'Initialize all tasks via ops.init_task()',
    description: 'With forks locked out (percpu_down_write(&scx_fork_rwsem) at line 6694) and scx_init_task_enabled set (line 6697), the enable path iterates all tasks via scx_task_iter_next_locked() at line 6719. For each task, scx_init_task() at line 6730 calls __scx_init_task() (kernel/sched/ext.c:3478) which invokes ops.init_task() (line 3490). The BPF scheduler can reject tasks by setting p->scx.disallow (line 3497).',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 6: Switch tasks to ext sched class
  state.bpfOps['select_cpu'] = true;
  state.bpfOps['running'] = true;
  state.bpfOps['stopping'] = true;
  state.srcRef = 'kernel/sched/ext.c:6738-6774 (task switching loop)';
  frames.push({
    step: 6,
    label: 'Switch tasks to ext_sched_class',
    description: 'After init, a second pass at kernel/sched/ext.c:6738 enables each task. scx_enable_task() at line 3577 calls __scx_enable_task() (line 3545) which invokes ops.enable() (line 3567) and transitions the task state to SCX_TASK_READY via scx_set_task_state() (line 3571). Each task with SCHED_EXT policy gets p->sched_class switched to &ext_sched_class, making the BPF scheduler responsible for scheduling it.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 7: Enable complete, exit bypass
  state.phase = 'enabled';
  state.scxEnabled = true;
  state.srcRef = 'kernel/sched/ext.c:6786-6828 (enable completion)';
  frames.push({
    step: 7,
    label: 'Scheduler enabled, exit bypass mode',
    description: 'scx_set_enable_state(SCX_ENABLED) transitions the global state. static_branch_enable(&__scx_enabled) at line 6796 activates the fast-path checks. If ops.flags includes SCX_OPS_SWITCH_PARTIAL, only tasks with SCHED_EXT policy use the BPF scheduler; otherwise all tasks are switched. scx_bypass(sch, false) exits bypass mode. The BPF scheduler is now fully active -- ops.enqueue(), ops.dispatch(), and ops.select_cpu() will be called for task scheduling decisions.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: scx-enqueue-dispatch
// Task enqueue and dispatch through BPF callbacks
// ---------------------------------------------------------------------------
function generateScxEnqueueDispatch(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SchedExtState = {
    phase: 'enqueue',
    bpfOps: { enqueue: true, dispatch: true, select_cpu: true, init_task: true, running: true, stopping: true },
    dispatchQueue: [],
    tasks: [],
    scxEnabled: true,
    errorState: null,
    srcRef: '',
  };

  // Frame 0: Task wakes up, enters enqueue path
  state.tasks = ['worker[5678]'];
  state.srcRef = 'kernel/sched/ext.c:1920 (enqueue_task_scx)';
  frames.push({
    step: 0,
    label: 'Task wakes up, enters enqueue_task_scx()',
    description: 'When a task becomes runnable (e.g., wakeup), the scheduler core calls enqueue_task_scx() at kernel/sched/ext.c:1920. It sets SCX_RQ_IN_WAKEUP flag (line 1927), marks the task runnable via set_task_runnable() (line 1943), sets SCX_TASK_QUEUED (line 1944), increments rq->scx.nr_running (line 1945), and starts the dl_server if this is the first task (line 1956). Then calls do_enqueue_task() at line 1958.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 1: do_enqueue_task calls ops.enqueue()
  state.srcRef = 'kernel/sched/ext.c:1780-1830 (do_enqueue_task)';
  frames.push({
    step: 1,
    label: 'do_enqueue_task() invokes BPF ops.enqueue()',
    description: 'do_enqueue_task() at kernel/sched/ext.c:1780 checks bypass mode (line 1810), direct dispatch (line 1815), and special cases (exiting at line 1819, migration-disabled at line 1826). For normal enqueue, SCX_CALL_OP_TASK(sch, enqueue, rq, p, enq_flags) invokes the BPF ops.enqueue() callback. The BPF scheduler decides where to place the task -- it can call scx_bpf_dsq_insert() to insert into a DSQ, or hold the task for later dispatch.',
    highlights: ['ops-callback'],
    data: cloneState(state),
  });

  // Frame 2: BPF calls scx_bpf_dsq_insert()
  state.dispatchQueue = ['worker[5678] -> SCX_DSQ_GLOBAL'];
  state.srcRef = 'kernel/sched/ext.c:7881 (scx_bpf_dsq_insert)';
  frames.push({
    step: 2,
    label: 'BPF calls scx_bpf_dsq_insert()',
    description: 'The BPF ops.enqueue() callback calls scx_bpf_dsq_insert() (kernel/sched/ext.c:7881) to insert the task into a dispatch queue. This kfunc validates the task and DSQ ID via scx_dsq_insert_preamble() (line 7787), records the dispatch in the per-CPU dispatch buffer via scx_dsq_insert_commit() (line 7814), and marks the task for insertion. The task can target SCX_DSQ_LOCAL (current CPU), SCX_DSQ_GLOBAL (any CPU), or a custom user DSQ.',
    highlights: ['dsq-queue'],
    data: cloneState(state),
  });

  // Frame 3: dispatch_enqueue inserts into DSQ
  state.phase = 'dispatch';
  state.srcRef = 'kernel/sched/ext.c:1417-1542 (dispatch_enqueue)';
  frames.push({
    step: 3,
    label: 'dispatch_enqueue() inserts task into DSQ',
    description: 'dispatch_enqueue() at kernel/sched/ext.c:1417 performs the actual DSQ insertion. For FIFO ordering, it links the task at the tail of dsq->list (line 1484). For vtime ordering, it inserts into the DSQ priority queue (rb_tree) via dsq_inc_nr() (line 1300). The task p->scx.dsq pointer is set, and the DSQ nr counter is incremented. If the target is a local DSQ, the task becomes immediately eligible for picking.',
    highlights: ['dsq-queue'],
    data: cloneState(state),
  });

  // Frame 4: balance_one triggers dispatch
  state.dispatchQueue = ['worker[5678] -> SCX_DSQ_GLOBAL', 'render[9012] -> SCX_DSQ_LOCAL'];
  state.tasks = ['worker[5678]', 'render[9012]'];
  state.srcRef = 'kernel/sched/ext.c:2768-2815 (balance_one)';
  frames.push({
    step: 4,
    label: 'balance_one() checks for tasks to dispatch',
    description: 'When a CPU needs work, balance_one() at kernel/sched/ext.c:2768 is called. It checks if the previous task has remaining slice (lines 2803-2807) and if the local DSQ has tasks (line 2811). If empty, it calls scx_dispatch_sched() (line 2814) which invokes the BPF ops.dispatch() callback. The BPF scheduler can call scx_bpf_dsq_insert() to move tasks from global/user DSQs to the local DSQ, or call scx_bpf_dsq_move_to_local() to consume from a DSQ.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 5: flush_dispatch_buf commits dispatches
  state.srcRef = 'kernel/sched/ext.c:2632-2646 (flush_dispatch_buf)';
  frames.push({
    step: 5,
    label: 'flush_dispatch_buf() commits pending dispatches',
    description: 'After ops.dispatch() returns, flush_dispatch_buf() at kernel/sched/ext.c:2632 iterates the per-CPU dispatch buffer (dsp_buf). For each buffered dispatch, it calls finish_dispatch() (line 2564) which atomically transitions the task from QUEUED to DISPATCHING state via try_cmpxchg (line 2607), then calls dispatch_enqueue() or dispatch_to_local_dsq() to insert the task into the target DSQ. This two-phase approach allows BPF to batch multiple dispatches safely.',
    highlights: ['dsq-queue'],
    data: cloneState(state),
  });

  // Frame 6: consume_global_dsq moves to local
  state.dispatchQueue = ['render[9012] -> LOCAL'];
  state.srcRef = 'kernel/sched/ext.c:2442-2462 (consume_global_dsq)';
  frames.push({
    step: 6,
    label: 'consume_global_dsq() moves task to local DSQ',
    description: 'consume_global_dsq() at kernel/sched/ext.c:2442 is called as a fallback when the BPF scheduler does not fully handle dispatch. It calls consume_dispatch_q() (line 2395) which iterates the global DSQ, finds the first eligible task, and moves it to the local DSQ via move_local_task_to_local_dsq() (line 2132) or move_remote_task_to_local_dsq() (line 2164). This ensures forward progress even if the BPF scheduler is incomplete.',
    highlights: ['dsq-queue'],
    data: cloneState(state),
  });

  // Frame 7: pick_task_scx selects next task
  state.phase = 'pick';
  state.srcRef = 'kernel/sched/ext.c:3121-3123 (pick_task_scx)';
  frames.push({
    step: 7,
    label: 'pick_task_scx() selects next task to run',
    description: 'pick_task_scx() at kernel/sched/ext.c:3121 calls do_pick_task_scx() to select the next task from the local DSQ. It returns first_local_task() (line 3039) which picks the first task from rq->scx.local_dsq. The scheduler core then calls set_next_task_scx() (line 2848) which invokes ops.running() (line 2878) to notify the BPF scheduler that the task is now executing on the CPU.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 8: Task runs, update_curr_scx tracks time
  state.phase = 'running';
  state.tasks = ['render[9012] (running)'];
  state.dispatchQueue = [];
  state.srcRef = 'kernel/sched/ext.c:1271-1288 (update_curr_scx)';
  frames.push({
    step: 8,
    label: 'Task runs, slice tracked by update_curr_scx()',
    description: 'While the task runs, update_curr_scx() at kernel/sched/ext.c:1271 is called on each timer tick via task_tick_scx() (line 3400) and on scheduling events. It accounts CPU time by decrementing p->scx.slice (line 1280). When slice reaches zero, it triggers rescheduling via resched_curr() (line 1285). The BPF scheduler can also call scx_bpf_kick_cpu() to force rescheduling at any time.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: scx-error-recovery
// Error handling and fallback to CFS
// ---------------------------------------------------------------------------
function generateScxErrorRecovery(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: SchedExtState = {
    phase: 'running',
    bpfOps: { enqueue: true, dispatch: true, select_cpu: true, init_task: true },
    dispatchQueue: ['task_a[100]', 'task_b[200]'],
    tasks: ['task_a[100]', 'task_b[200]', 'task_c[300]'],
    scxEnabled: true,
    errorState: null,
    srcRef: '',
  };

  // Frame 0: BPF scheduler is running normally
  state.srcRef = 'kernel/sched/ext.c:1271 (update_curr_scx normal operation)';
  frames.push({
    step: 0,
    label: 'BPF scheduler running normally',
    description: 'The sched_ext BPF scheduler is active. Tasks are being enqueued via ops.enqueue(), dispatched via ops.dispatch(), and picked via the local DSQ. update_curr_scx() at kernel/sched/ext.c:1271 tracks time slices. The watchdog at scx_watchdog_workfn() (line 3356) periodically checks for stuck runnable tasks via check_rq_for_timeouts() (line 3324).',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: BPF scheduler triggers error
  state.phase = 'error';
  state.errorState = 'SCX_EXIT_ERROR';
  state.srcRef = 'kernel/sched/ext.c:6270-6297 (scx_vexit)';
  frames.push({
    step: 1,
    label: 'Error detected: scx_vexit() called',
    description: 'An error occurs in the BPF scheduler -- for example, a watchdog timeout (task stuck runnable), an invalid return from ops.enqueue(), or an explicit scx_bpf_error() call. scx_vexit() at kernel/sched/ext.c:6270 is called with SCX_EXIT_ERROR. It calls scx_claim_exit() (line 6278) to atomically claim the exit via cmpxchg on sch->exit_kind (line 5859), captures a stack trace (line 6284), formats the error message (line 6286), and queues irq_work to trigger disable (line 6295).',
    highlights: ['error-indicator'],
    data: cloneState(state),
  });

  // Frame 2: scx_claim_exit propagates to descendants
  state.srcRef = 'kernel/sched/ext.c:5850-5892 (scx_claim_exit)';
  frames.push({
    step: 2,
    label: 'scx_claim_exit() sets aborting flag',
    description: 'scx_claim_exit() at kernel/sched/ext.c:5850 atomically transitions exit_kind from SCX_EXIT_NONE to the error kind (line 5859). It sets sch->aborting = true (line 5867) to break potential live-lock scenarios in dispatch paths. For non-propagation exits, it propagates to all descendant schedulers under scx_sched_lock (lines 5884-5888), calling scx_disable() with SCX_EXIT_PARENT on each. This ensures the entire scheduler hierarchy is torn down.',
    highlights: ['error-indicator'],
    data: cloneState(state),
  });

  // Frame 3: Disable IRQ work fires
  state.phase = 'disabling';
  state.srcRef = 'kernel/sched/ext.c:5894-5915 (scx_disable_workfn)';
  frames.push({
    step: 3,
    label: 'scx_disable_workfn() starts teardown',
    description: 'The irq_work queued by scx_vexit() triggers scx_disable_irq_workfn() (line 6259) which queues scx_disable_workfn() on the dedicated kthread. scx_disable_workfn() at kernel/sched/ext.c:5894 reads exit_kind (line 5900), transitions to SCX_EXIT_DONE via cmpxchg (line 5905), sets ei->kind and ei->reason (lines 5908-5909), and calls scx_root_disable() (line 5914) for root schedulers.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 4: Enter bypass mode for forward progress
  state.srcRef = 'kernel/sched/ext.c:5708-5716 (scx_root_disable bypass)';
  frames.push({
    step: 4,
    label: 'Enter bypass mode for forward progress',
    description: 'scx_root_disable() at kernel/sched/ext.c:5708 first calls scx_bypass(sch, true) at line 5716 to guarantee forward progress. Bypass mode (kernel/sched/ext.c:5277) sets all task slices to SCX_SLICE_BYPASS (5ms), forces direct dispatch to local DSQs, and uses a simple load-balancer timer (scx_bypass_lb_timerfn at line 5135). This ensures the system remains responsive even if the BPF scheduler is broken.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 5: Switch tasks back from ext
  state.tasks = ['task_a[100] -> fair', 'task_b[200] -> fair', 'task_c[300] -> fair'];
  state.dispatchQueue = [];
  state.srcRef = 'kernel/sched/ext.c:5758-5775 (task switching loop)';
  frames.push({
    step: 5,
    label: 'Switch all tasks back to CFS fair class',
    description: 'scx_root_disable() iterates all tasks at kernel/sched/ext.c:5758 via scx_task_iter_next_locked(). For each task, scx_setscheduler_class() (line 3342) determines the new class (typically fair_sched_class for SCHED_NORMAL/SCHED_EXT). Tasks are dequeued from ext and re-enqueued on the fair runqueue (line 5769-5771). scx_disable_and_exit_task() (line 5773) calls ops.exit_task() and ops.disable() BPF callbacks for cleanup.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 6: Call ops.exit() and cleanup
  state.bpfOps = {};
  state.srcRef = 'kernel/sched/ext.c:5777-5810 (disable dump and cleanup)';
  frames.push({
    step: 6,
    label: 'ops.exit() called, scheduler resources freed',
    description: 'After all tasks are switched, scx_disable_dump() (line 5777) captures the final scheduler state for debugging via /sys/kernel/sched_ext/. set_cgroup_sched() clears the cgroup association (line 5780). The state transitions through SCX_DISABLING to SCX_DISABLED via scx_set_enable_state() (line 5719). static_branch_disable(&__scx_enabled) (line 5739) deactivates all sched_ext fast-path checks. ops.exit() is called with the scx_exit_info containing the error message and backtrace.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 7: System dump and notification
  state.srcRef = 'kernel/sched/ext.c:6098-6258 (scx_dump_state)';
  frames.push({
    step: 7,
    label: 'State dumped for debugging',
    description: 'scx_dump_state() at kernel/sched/ext.c:6098 generates a comprehensive dump: per-CPU runqueue state (line 6172), DSQ contents (line 6200), and per-task state via scx_dump_task() (line 6035). ops.dump() and ops.dump_cpu() callbacks are invoked (lines 6132, 6188) if defined. The dump is written to both the trace buffer and the exit_info for /sys/kernel/sched_ext/. A uevent is sent (scx_uevent at line 4816) to notify userspace of the scheduler exit.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 8: CFS fallback complete
  state.phase = 'fallback';
  state.scxEnabled = false;
  state.tasks = ['task_a[100] (CFS)', 'task_b[200] (CFS)', 'task_c[300] (CFS)'];
  state.srcRef = 'kernel/sched/ext.c:5806-5828 (fallback complete)';
  frames.push({
    step: 8,
    label: 'Fallback to CFS complete',
    description: 'The sched_ext scheduler is fully disabled. All tasks now run under the CFS fair scheduler (fair_sched_class). free_kick_syncs() releases per-CPU resources (line 5431). The scx_root pointer is cleared. The system continues operating normally under CFS until a new BPF scheduler is loaded. The exit reason and message are available via /sys/kernel/sched_ext/root/exit_info for debugging. A new scheduler can be loaded immediately via bpf_struct_ops.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: scx-dl-server (v7.0)
// Dedicated DL server prevents SCX task starvation by RT tasks
// ---------------------------------------------------------------------------
function generateScxDlServer(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Default replenishment parameters match sched_init_dl_servers() at
  // kernel/sched/deadline.c:1843-1844 (50ms runtime / 1000ms period).
  const DL_RUNTIME = 50_000_000;
  const DL_PERIOD = 1_000_000_000;

  const state: SchedExtState = {
    phase: 'running',
    bpfOps: { enqueue: true, dispatch: true, select_cpu: true, init_task: true, running: true, stopping: true },
    dispatchQueue: [],
    tasks: ['rt_hog[101] (SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)'],
    scxEnabled: true,
    errorState: null,
    srcRef: '',
    dlServer: {
      runtime: 0,
      dlRuntime: DL_RUNTIME,
      dlPeriod: DL_PERIOD,
      deadline: 0,
      active: false,
      picking: false,
      throttled: false,
      era: 'pre-v7.0',
    },
    cpuTimeline: [],
    rtLatencyMs: 0,
  };

  // ---------------------------------------------------------------
  // Act 1 -- Pre-v7.0 starvation timeline (contrast, frames 0..2)
  // ---------------------------------------------------------------

  // Frame 0: pre-v7.0 world -- no DL server, RT monopolizes
  state.cpuTimeline = [
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
    { kind: 'RT', label: 'rt_hog[101]' },
  ];
  state.rtLatencyMs = Number.POSITIVE_INFINITY;
  state.srcRef = 'kernel/sched/ext.c:3121 pick_task_scx()';
  frames.push({
    step: 0,
    label: 'Pre-v7.0 contrast -- RT monopolizes CPU, SCX stars',
    description: 'Before Linux v7.0, sched_ext was strictly lower priority than rt_sched_class. pick_next_task() walks classes in order (stop -> dl -> rt -> fair -> ext -> idle), so if two SCHED_FIFO hogs are runnable on a CPU, pick_task_scx() at kernel/sched/ext.c:3121 never even gets a chance to return. A BPF scheduler could be starved indefinitely -- the CPU timeline shows rt_hog slices back-to-back with no SCX gap. Worst-case SCX latency was unbounded (infinity in the visualization).',
    highlights: ['task-list', 'error-indicator'],
    data: cloneState(state),
  });

  // Frame 1: starvation consequence -- scx_worker never runs
  state.tasks = ['rt_hog[101] (running, SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777] (starved)'];
  state.dispatchQueue = ['scx_worker[777] -> SCX_DSQ_LOCAL (never picked)'];
  state.srcRef = 'kernel/sched/ext.c:3121 pick_task_scx()';
  frames.push({
    step: 1,
    label: 'Pre-v7.0 -- scx_worker queued in local DSQ but unreachable',
    description: 'scx_worker[777] is sitting in rq->scx.local_dsq. pick_task_scx() would happily return it if invoked, but pick_next_task() short-circuits inside pick_next_task_rt() because rt_rq->rt_nr_running > 0. No watchdog inside sched_ext itself can raise SCX priority above RT -- rt_sched_class is hard-coded higher. The only workaround was userspace-enforced bandwidth (e.g. CPU shielding), which defeats the purpose of a loadable scheduler. This is the starvation bug that v7.0 fixes.',
    highlights: ['dsq-queue', 'error-indicator'],
    data: cloneState(state),
  });

  // Frame 2: v7.0 enters -- ext_server_init wires up a DL reservation
  state.dlServer = {
    runtime: 0,
    dlRuntime: DL_RUNTIME,
    dlPeriod: DL_PERIOD,
    deadline: 0,
    active: false,
    picking: false,
    throttled: false,
    era: 'v7.0',
  };
  state.cpuTimeline = [];
  state.rtLatencyMs = 0;
  state.srcRef = 'kernel/sched/ext.c:3144 ext_server_init()';
  frames.push({
    step: 2,
    label: 'v7.0 cure -- ext_server_init() reserves DL bandwidth per rq',
    description: 'Linux v7.0 introduces a per-runqueue DL (deadline) server dedicated to sched_ext. At CPU onlining, ext_server_init() at kernel/sched/ext.c:3144 is called. It takes &rq->ext_server (a struct sched_dl_entity embedded in struct rq) and calls init_dl_entity(dl_se) at kernel/sched/deadline.c:3737 to zero-init the rb_node, DL timers, and DL params. Later, sched_init_dl_servers() at kernel/sched/deadline.c:1836 applies dl_runtime=50ms / dl_period=1s and sets dl_se->dl_server = 1.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // ---------------------------------------------------------------
  // Act 2 -- v7.0 DL server wiring (frames 3..4)
  // ---------------------------------------------------------------

  // Frame 3: dl_server_init registers ext_server_pick_task callback
  state.srcRef = 'kernel/sched/ext.c:3150 dl_server_init()';
  frames.push({
    step: 3,
    label: 'dl_server_init() registers ext_server_pick_task() callback',
    description: 'ext_server_init() calls dl_server_init(dl_se, rq, ext_server_pick_task) at kernel/sched/ext.c:3150. dl_server_init() at kernel/sched/deadline.c:1829 simply stores dl_se->rq and dl_se->server_pick_task. The callback ext_server_pick_task() at kernel/sched/ext.c:3133 checks scx_enabled() and then tail-calls do_pick_task_scx(dl_se->rq, rf, true) with force_scx=true -- so when the DL core asks "who runs now?", the answer is always the next SCX task from the local DSQ.',
    highlights: ['ops-callback'],
    data: cloneState(state),
  });

  // Frame 4: First SCX task wakes -- dl_server_start arms the reservation
  state.phase = 'enqueue';
  state.tasks = ['rt_hog[101] (SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777]'];
  state.dispatchQueue = ['scx_worker[777] -> SCX_DSQ_LOCAL'];
  state.dlServer = {
    runtime: DL_RUNTIME,
    dlRuntime: DL_RUNTIME,
    dlPeriod: DL_PERIOD,
    deadline: DL_PERIOD,
    active: true,
    picking: false,
    throttled: false,
    era: 'v7.0',
  };
  state.cpuTimeline = [];
  state.rtLatencyMs = 0;
  state.srcRef = 'kernel/sched/ext.c:1956 dl_server_start()';
  frames.push({
    step: 4,
    label: 'First SCX task enqueued -- dl_server_start() arms the server',
    description: 'enqueue_task_scx() at kernel/sched/ext.c:1920 runs. When rq->scx.nr_running transitions 0 -> 1 (line 1955), it calls dl_server_start(&rq->ext_server) at kernel/sched/ext.c:1956. dl_server_start() at kernel/sched/deadline.c:1791 verifies dl_server(dl_se) and !dl_server_active, sets dl_se->dl_server_active = 1, and calls enqueue_dl_entity(dl_se, ENQUEUE_WAKEUP). The reservation is now an active DL entity on the rq\'s dl.root rb-tree. Runtime=50ms, deadline= rq_clock + 1s.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // ---------------------------------------------------------------
  // Act 3 -- v7.0 runtime tracking and replenishment (frames 5..9)
  // ---------------------------------------------------------------

  // Frame 5: RT still runs; dl_server_update ticks down runtime
  state.phase = 'running';
  state.tasks = ['rt_hog[101] (running, SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777] (queued)'];
  state.dlServer = {
    runtime: 35_000_000,  // drained 15ms of the 50ms budget
    dlRuntime: DL_RUNTIME,
    dlPeriod: DL_PERIOD,
    deadline: DL_PERIOD,
    active: true,
    picking: false,
    throttled: false,
    era: 'v7.0',
  };
  state.cpuTimeline = [
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
  ];
  state.rtLatencyMs = 15;
  state.srcRef = 'kernel/sched/ext.c:1286 dl_server_update()';
  frames.push({
    step: 5,
    label: 'RT runs; update_curr_scx() drains DL server runtime',
    description: 'The RT task is still picked (its priority beats a non-expired DL entity). But on every tick, update_curr_scx() at kernel/sched/ext.c:1271 runs and at line 1286 calls dl_server_update(&rq->ext_server, delta_exec). dl_server_update() at kernel/sched/deadline.c:1580 checks dl_server_active && dl_runtime, then calls update_curr_dl_se() at kernel/sched/deadline.c:1420 which does dl_se->runtime -= scaled_delta_exec (line 1437). The 50ms budget drains on each tick of stolen CPU time.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 6: runtime reaches zero -- dl_runtime_exceeded triggers throttle
  state.dlServer = {
    runtime: 0,
    dlRuntime: DL_RUNTIME,
    dlPeriod: DL_PERIOD,
    deadline: DL_PERIOD,
    active: true,
    picking: false,
    throttled: true,
    era: 'v7.0',
  };
  state.cpuTimeline = [
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
  ];
  state.rtLatencyMs = 50;
  state.srcRef = 'kernel/sched/deadline.c:1501 update_curr_dl_se()';
  frames.push({
    step: 6,
    label: 'Runtime exhausted -- dl_runtime_exceeded() throttles the server',
    description: 'After ~50ms of RT monopoly, dl_se->runtime reaches 0. update_curr_dl_se() at kernel/sched/deadline.c:1501 detects dl_runtime_exceeded() and enters the throttle branch: dl_se->dl_throttled = 1 (line 1503), dequeue_dl_entity (line 1510), then replenish_dl_new_period (line 1518) pushes dl_se->deadline forward and start_dl_timer (line 1519) arms the period hrtimer to fire when the reservation window ends. resched_curr(rq) at line 1526 forces pick_next_task() to rerun.',
    highlights: ['phase-flow', 'error-indicator'],
    data: cloneState(state),
  });

  // Frame 7: DL class outranks RT -- ext_server_pick_task fires
  state.phase = 'pick';
  state.dlServer = {
    runtime: DL_RUNTIME,
    dlRuntime: DL_RUNTIME,
    dlPeriod: DL_PERIOD,
    deadline: 2 * DL_PERIOD,
    active: true,
    picking: true,
    throttled: false,
    era: 'v7.0',
  };
  state.srcRef = 'kernel/sched/ext.c:3133 ext_server_pick_task()';
  frames.push({
    step: 7,
    label: 'DL class outranks RT -- ext_server_pick_task() selects SCX',
    description: 'With the server replenished and its absolute deadline earlier than any RT task\'s notional deadline, pick_next_task() walks classes and pick_next_task_dl() selects &rq->ext_server from dl.root. Because dl_se->server_pick_task is non-NULL, the DL core invokes it: ext_server_pick_task() at kernel/sched/ext.c:3133 verifies scx_enabled() and tail-calls do_pick_task_scx(dl_se->rq, rf, /*force_scx=*/true). The returned task is scx_worker[777], pulled from the local DSQ. RT is preempted.',
    highlights: ['ops-callback'],
    data: cloneState(state),
  });

  // Frame 8: SCX runs under the DL server's borrowed priority
  state.phase = 'running';
  state.tasks = ['rt_hog[101] (SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777] (running via DL server)'];
  state.dispatchQueue = [];
  state.dlServer = {
    runtime: 40_000_000,  // consumed 10ms of SCX work
    dlRuntime: DL_RUNTIME,
    dlPeriod: DL_PERIOD,
    deadline: 2 * DL_PERIOD,
    active: true,
    picking: false,
    throttled: false,
    era: 'v7.0',
  };
  state.cpuTimeline = [
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
    { kind: 'SCX', label: 'scx_worker[777]' },
    { kind: 'SCX', label: 'scx_worker[777]' },
  ];
  state.rtLatencyMs = 50;
  state.srcRef = 'kernel/sched/ext.c:3133 ext_server_pick_task()';
  frames.push({
    step: 8,
    label: 'SCX runs under DL bandwidth -- bounded worst-case latency',
    description: 'scx_worker[777] executes with scheduling credit charged to the DL server. set_next_task_scx() fires ops.running() so the BPF scheduler observes the task as running. While the SCX task is on-cpu, update_curr_scx() keeps calling dl_server_update() -- but now delta_exec is consumed *by SCX*, so dl_server_update() at deadline.c:1580 decrements runtime against the server\'s own work. The worst-case SCX wait is now bounded by dl_period - dl_runtime = 950ms under perfect RT adversary, and typically much less.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 9: period timer refreshes; cycle repeats with steady guarantee
  state.phase = 'running';
  state.tasks = ['rt_hog[101] (running, SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777] (queued)'];
  state.dlServer = {
    runtime: DL_RUNTIME,
    dlRuntime: DL_RUNTIME,
    dlPeriod: DL_PERIOD,
    deadline: 3 * DL_PERIOD,
    active: true,
    picking: false,
    throttled: false,
    era: 'v7.0',
  };
  state.cpuTimeline = [
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
    { kind: 'SCX', label: 'scx_worker[777]' },
    { kind: 'SCX', label: 'scx_worker[777]' },
    { kind: 'RT', label: 'rt_hog[101]' },
    { kind: 'RT', label: 'rt_hog[102]' },
  ];
  state.rtLatencyMs = 50;
  state.srcRef = 'kernel/sched/deadline.c:1140 dl_server_timer()';
  frames.push({
    step: 9,
    label: 'Period timer fires -- runtime replenished, cycle repeats',
    description: 'When the dl_timer armed earlier expires, dl_server_timer() at kernel/sched/deadline.c:1140 runs. It calls dl_server_update() to flush any in-flight delta, then if the server is still needed it replenishes via replenish_dl_new_period(): dl_se->runtime = dl_runtime (50ms), dl_se->deadline += dl_period (+1s). The server returns to the rb-tree. Steady state: every 1s window, SCX is guaranteed at least 50ms of CPU, and worst-case RT-pressure latency is bounded instead of infinite. When the last SCX task leaves, dl_server_stop() at kernel/sched/deadline.c:1814 disarms the reservation.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS = [
  { id: 'loading', label: 'Load' },
  { id: 'init', label: 'Init' },
  { id: 'enabling', label: 'Enable' },
  { id: 'enabled', label: 'Active' },
  { id: 'enqueue', label: 'Enqueue' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'pick', label: 'Pick' },
  { id: 'running', label: 'Running' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'loading': return 0;
    case 'init': return 1;
    case 'enabling': return 2;
    case 'enabled': return 3;
    case 'enqueue': return 4;
    case 'dispatch': return 5;
    case 'pick': return 6;
    case 'running': return 7;
    case 'error': return 7;
    case 'disabling': return 3;
    case 'fallback': return 0;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as SchedExtState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'BPF-Extensible Scheduler (sched_ext)';
  container.appendChild(title);

  // --- SCX enabled indicator ---
  const statusTop = margin.top + 28;
  const statusWidth = 180;
  const statusHeight = 28;
  const statusColor = data.scxEnabled ? '#3fb950' : (data.errorState ? '#f85149' : '#484f58');

  const statusRect = document.createElementNS(NS, 'rect');
  statusRect.setAttribute('x', String(margin.left));
  statusRect.setAttribute('y', String(statusTop));
  statusRect.setAttribute('width', String(statusWidth));
  statusRect.setAttribute('height', String(statusHeight));
  statusRect.setAttribute('rx', '6');
  statusRect.setAttribute('fill', statusColor);
  statusRect.setAttribute('class', 'anim-block');
  container.appendChild(statusRect);

  const statusText = document.createElementNS(NS, 'text');
  statusText.setAttribute('x', String(margin.left + statusWidth / 2));
  statusText.setAttribute('y', String(statusTop + 19));
  statusText.setAttribute('text-anchor', 'middle');
  statusText.setAttribute('fill', '#e6edf3');
  statusText.setAttribute('class', 'anim-block');
  statusText.textContent = data.scxEnabled ? 'sched_ext ENABLED' : (data.errorState ? 'sched_ext ERROR' : 'sched_ext DISABLED');
  container.appendChild(statusText);

  // --- Phase flow diagram ---
  const flowTop = statusTop + statusHeight + 20;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(85, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 26;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;
    const isError = (data.phase === 'error' || data.phase === 'disabling') && isActive;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isError) {
      blockClass += ' anim-block-allocated anim-highlight';
      rect.setAttribute('fill', '#f85149');
    } else if (isActive) {
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

  // --- Error indicator ---
  if (data.errorState) {
    const errText = document.createElementNS(NS, 'text');
    errText.setAttribute('x', String(width / 2));
    errText.setAttribute('y', String(flowTop - 6));
    errText.setAttribute('text-anchor', 'middle');
    errText.setAttribute('fill', '#f85149');
    errText.setAttribute('font-size', '11');
    errText.setAttribute('class', 'anim-highlight');
    errText.textContent = `ERROR: ${data.errorState}`;
    container.appendChild(errText);
  }

  // --- BPF Ops callbacks ---
  const opsTop = flowTop + phaseHeight + 16;
  const opsLabel = document.createElementNS(NS, 'text');
  opsLabel.setAttribute('x', String(margin.left));
  opsLabel.setAttribute('y', String(opsTop));
  opsLabel.setAttribute('class', 'anim-cpu-label');
  opsLabel.textContent = 'BPF ops callbacks:';
  container.appendChild(opsLabel);

  const opsKeys = Object.keys(data.bpfOps);
  const opsEntryW = 90;
  const opsEntryH = 18;
  opsKeys.forEach((op, i) => {
    const ox = margin.left + (i % 6) * (opsEntryW + 4);
    const oy = opsTop + 6 + Math.floor(i / 6) * (opsEntryH + 3);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(ox));
    rect.setAttribute('y', String(oy));
    rect.setAttribute('width', String(opsEntryW));
    rect.setAttribute('height', String(opsEntryH));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', data.bpfOps[op] ? '#1f6feb' : '#21262d');
    rect.setAttribute('class', 'anim-block');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(ox + opsEntryW / 2));
    text.setAttribute('y', String(oy + 13));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '9');
    text.setAttribute('class', 'anim-cpu-label');
    text.textContent = `.${op}()`;
    container.appendChild(text);
  });

  // --- Dispatch Queue ---
  const opsRows = Math.ceil(opsKeys.length / 6) || 1;
  const dsqTop = opsTop + 6 + opsRows * (opsEntryH + 3) + 14;

  const dsqLabel = document.createElementNS(NS, 'text');
  dsqLabel.setAttribute('x', String(margin.left));
  dsqLabel.setAttribute('y', String(dsqTop));
  dsqLabel.setAttribute('class', 'anim-cpu-label');
  dsqLabel.textContent = 'Dispatch Queue (DSQ):';
  container.appendChild(dsqLabel);

  const dsqEntryH = 20;
  const dsqEntryW = 250;
  data.dispatchQueue.forEach((entry, i) => {
    const dy = dsqTop + 6 + i * (dsqEntryH + 2);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left));
    rect.setAttribute('y', String(dy));
    rect.setAttribute('width', String(dsqEntryW));
    rect.setAttribute('height', String(dsqEntryH));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#1f4068');
    rect.setAttribute('class', 'anim-dsq-entry');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 6));
    text.setAttribute('y', String(dy + 14));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-dsq-entry');
    text.textContent = entry;
    container.appendChild(text);
  });

  // --- Tasks ---
  const dsqRows = data.dispatchQueue.length || 0;
  const taskTop = dsqTop + 6 + dsqRows * (dsqEntryH + 2) + 14;

  const taskLabel = document.createElementNS(NS, 'text');
  taskLabel.setAttribute('x', String(width / 2));
  taskLabel.setAttribute('y', String(taskTop));
  taskLabel.setAttribute('class', 'anim-cpu-label');
  taskLabel.textContent = 'Tasks:';
  container.appendChild(taskLabel);

  const taskEntryH = 20;
  const taskEntryW = 200;
  data.tasks.forEach((entry, i) => {
    const tx = margin.left + (i % 3) * (taskEntryW + 8);
    const ty = taskTop + 6 + Math.floor(i / 3) * (taskEntryH + 2);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(tx));
    rect.setAttribute('y', String(ty));
    rect.setAttribute('width', String(taskEntryW));
    rect.setAttribute('height', String(taskEntryH));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', entry.includes('running') ? '#238636' : (entry.includes('CFS') || entry.includes('fair') ? '#8b949e' : '#1a3a1a'));
    rect.setAttribute('class', 'anim-task');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(tx + 6));
    text.setAttribute('y', String(ty + 14));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-task');
    text.textContent = entry;
    container.appendChild(text);
  });

  // --- DL server budget bar (dl-server scenario) ---
  const taskRows = Math.ceil((data.tasks.length || 0) / 3);
  let extraTop = taskTop + 6 + taskRows * (taskEntryH + 2) + 10;

  if (data.dlServer) {
    const ds = data.dlServer;
    const budgetLabel = document.createElementNS(NS, 'text');
    budgetLabel.setAttribute('x', String(margin.left));
    budgetLabel.setAttribute('y', String(extraTop));
    budgetLabel.setAttribute('class', 'anim-cpu-label anim-dl-budget');
    budgetLabel.textContent = `DL server (${ds.era}): runtime ${Math.round(ds.runtime / 1_000_000)}ms / ${Math.round(ds.dlRuntime / 1_000_000)}ms${ds.throttled ? ' (THROTTLED)' : ''}${ds.active ? '' : ' (inactive)'}`;
    container.appendChild(budgetLabel);

    const barY = extraTop + 4;
    const barW = Math.min(360, usableWidth);
    const barH = 10;
    const barBg = document.createElementNS(NS, 'rect');
    barBg.setAttribute('x', String(margin.left));
    barBg.setAttribute('y', String(barY));
    barBg.setAttribute('width', String(barW));
    barBg.setAttribute('height', String(barH));
    barBg.setAttribute('fill', '#21262d');
    barBg.setAttribute('class', 'anim-block anim-dl-budget');
    container.appendChild(barBg);

    const fillRatio = ds.dlRuntime > 0 ? Math.max(0, Math.min(1, ds.runtime / ds.dlRuntime)) : 0;
    const fillW = Math.round(barW * fillRatio);
    const barFill = document.createElementNS(NS, 'rect');
    barFill.setAttribute('x', String(margin.left));
    barFill.setAttribute('y', String(barY));
    barFill.setAttribute('width', String(fillW));
    barFill.setAttribute('height', String(barH));
    barFill.setAttribute('fill', ds.throttled ? '#f85149' : (ds.picking ? '#d29922' : '#3fb950'));
    barFill.setAttribute('class', 'anim-block anim-dl-budget-fill');
    container.appendChild(barFill);

    extraTop += barH + 14;
  }

  // --- CPU timeline strip (pre-v7.0 vs v7.0 contrast) ---
  if (data.cpuTimeline && data.cpuTimeline.length > 0) {
    const tlLabel = document.createElementNS(NS, 'text');
    tlLabel.setAttribute('x', String(margin.left));
    tlLabel.setAttribute('y', String(extraTop));
    tlLabel.setAttribute('class', 'anim-cpu-label anim-cpu-timeline');
    const latencyStr = data.rtLatencyMs === Number.POSITIVE_INFINITY
      ? 'infinity'
      : `${data.rtLatencyMs ?? 0}ms`;
    tlLabel.textContent = `CPU timeline (worst SCX wait: ${latencyStr}):`;
    container.appendChild(tlLabel);

    const slotY = extraTop + 4;
    const slotH = 14;
    const slotCount = data.cpuTimeline.length;
    const slotW = Math.max(24, Math.min(48, Math.floor(usableWidth / Math.max(slotCount, 1))));
    data.cpuTimeline.forEach((slot, i) => {
      const sx = margin.left + i * slotW;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(sx));
      rect.setAttribute('y', String(slotY));
      rect.setAttribute('width', String(slotW - 2));
      rect.setAttribute('height', String(slotH));
      rect.setAttribute('class', 'anim-block anim-cpu-timeline');
      const fill = slot.kind === 'RT' ? '#f85149' : slot.kind === 'SCX' ? '#3fb950' : '#30363d';
      rect.setAttribute('fill', fill);
      container.appendChild(rect);

      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', String(sx + (slotW - 2) / 2));
      t.setAttribute('y', String(slotY + 10));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#0d1117');
      t.setAttribute('font-size', '8');
      t.setAttribute('class', 'anim-cpu-timeline');
      t.textContent = slot.kind;
      container.appendChild(t);
    });
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'scx-ops-enable', label: 'Loading & Enabling sched_ext' },
  { id: 'scx-enqueue-dispatch', label: 'Enqueue & Dispatch via BPF' },
  { id: 'scx-error-recovery', label: 'Error Handling & CFS Fallback' },
  { id: 'scx-dl-server', label: 'DL Server Prevents SCX Starvation' },
];

const schedExt: AnimationModule = {
  config: {
    id: 'sched-ext',
    title: 'BPF-Extensible Scheduler (sched_ext)',
    skillName: 'sched-ext',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'scx-enqueue-dispatch': return generateScxEnqueueDispatch();
      case 'scx-error-recovery': return generateScxErrorRecovery();
      case 'scx-dl-server': return generateScxDlServer();
      case 'scx-ops-enable':
      default: return generateScxOpsEnable();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default schedExt;
