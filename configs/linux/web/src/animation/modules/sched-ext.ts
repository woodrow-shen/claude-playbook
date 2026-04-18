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
    runtime: number;
    deadline: number;
    active: boolean;
    picking: boolean;
  };
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
  const state: SchedExtState = {
    phase: 'running',
    bpfOps: { enqueue: true, dispatch: true, select_cpu: true, init_task: true, running: true, stopping: true },
    dispatchQueue: [],
    tasks: ['rt_hog[101] (SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)'],
    scxEnabled: true,
    errorState: null,
    srcRef: '',
    dlServer: { runtime: 0, deadline: 0, active: false, picking: false },
  };

  // Frame 0: SCX enabled but RT tasks saturate the CPU -- starvation risk
  state.srcRef = 'kernel/sched/ext.c:3144 ext_server_init()';
  frames.push({
    step: 0,
    label: 'RT tasks saturate CPU -- SCX tasks at risk of starvation',
    description: 'The sched_ext scheduler is enabled, but SCHED_FIFO RT tasks are hogging the CPU. Without intervention, rt_sched_class always outranks ext_sched_class in pick_next_task(), so any pending SCX task would never run. Prior to v7.0 this was a real starvation hazard -- BPF schedulers could be preempted indefinitely by userspace RT hogs. v7.0 introduces a dedicated DL (deadline) server per-rq via ext_server_init() at kernel/sched/ext.c:3144 to guarantee SCX tasks a bounded share of CPU time.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 1: ext_server_init() sets up dl_se on the rq
  state.srcRef = 'kernel/sched/ext.c:3144 ext_server_init()';
  state.dlServer = { runtime: 0, deadline: 0, active: false, picking: false };
  frames.push({
    step: 1,
    label: 'ext_server_init() initializes per-rq DL entity',
    description: 'During runqueue bring-up, ext_server_init() at kernel/sched/ext.c:3144 is invoked for every runqueue. It takes a pointer to rq->ext_server (a struct sched_dl_entity embedded in struct rq) and calls init_dl_entity(dl_se) to zero-initialize the DL entity fields (dl_runtime, dl_deadline, dl_period, flags). This reserves a dedicated DL slot on every CPU that the SCX class can use to borrow deadline-class priority without requiring userspace SCHED_DEADLINE tasks.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 2: dl_server_init registers ext_server_pick_task callback
  state.srcRef = 'kernel/sched/ext.c:3150 dl_server_init(dl_se, rq, ext_server_pick_task)';
  frames.push({
    step: 2,
    label: 'dl_server_init() registers ext_server_pick_task callback',
    description: 'Next, ext_server_init() calls dl_server_init(dl_se, rq, ext_server_pick_task) at kernel/sched/ext.c:3150. This stores ext_server_pick_task as dl_se->server_pick_task -- the callback that the DL scheduler core will invoke when this DL entity is selected. ext_server_pick_task() at kernel/sched/ext.c:3133 is a thin wrapper that checks scx_enabled() and then defers to do_pick_task_scx(dl_se->rq, rf, true), ensuring the DL server always hands back a sched_ext task when asked.',
    highlights: ['ops-callback'],
    data: cloneState(state),
  });

  // Frame 3: first SCX task is enqueued -- dl_server_start fires
  state.phase = 'enqueue';
  state.tasks = ['rt_hog[101] (SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777]'];
  state.dispatchQueue = ['scx_worker[777] -> SCX_DSQ_LOCAL'];
  state.dlServer = { runtime: 50_000_000, deadline: 1_000_000_000, active: true, picking: false };
  state.srcRef = 'kernel/sched/ext.c:1956 dl_server_start(&rq->ext_server)';
  frames.push({
    step: 3,
    label: 'First SCX task enqueued -- dl_server_start() arms the server',
    description: 'When the first SCX task becomes runnable on this rq, enqueue_task_scx() notices rq->scx.nr_running == 1 and calls dl_server_start(&rq->ext_server) at kernel/sched/ext.c:1956. This hands rq->ext_server to the DL core, which inserts dl_se into the runqueue dl.root rb-tree with the default dl_runtime/dl_period (the reservation bandwidth for SCX). The server is now visible to pick_next_task_dl() and competes as a DL entity, not as an SCX task.',
    highlights: ['phase-flow'],
    data: cloneState(state),
  });

  // Frame 4: RT task picked and runs (DL server waits but is armed)
  state.phase = 'running';
  state.tasks = ['rt_hog[101] (running, SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777] (queued)'];
  state.dlServer = { runtime: 50_000_000, deadline: 1_000_000_000, active: true, picking: false };
  state.srcRef = 'kernel/sched/ext.c:1286 dl_server_update(&rq->ext_server, delta_exec)';
  frames.push({
    step: 4,
    label: 'RT task runs -- DL server armed but not yet expired',
    description: 'pick_next_task() still picks the RT task because the DL server has positive runtime remaining (its deadline has not fired). The RT task runs, but every tick update_curr_scx() at kernel/sched/ext.c:1286 calls dl_server_update(&rq->ext_server, delta_exec). This decrements rq->ext_server.runtime by delta_exec. Note that dl_server_update is called from the SCX update path so that CPU time consumed by any task on this CPU counts toward replenishing the server budget fairly.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 5: DL server runtime drains to zero / deadline fires
  state.dlServer = { runtime: 0, deadline: 1_000_000_000, active: true, picking: false };
  state.srcRef = 'kernel/sched/ext.c:1286 dl_server_update(&rq->ext_server, delta_exec)';
  frames.push({
    step: 5,
    label: 'DL server runtime expires -- SCX now owed CPU time',
    description: 'After enough ticks dl_server_update() drives rq->ext_server.runtime to zero. The DL core marks the server as "throttled-needs-replenish" and refreshes dl_se->deadline relative to rq_clock(). Because the deadline of a replenished DL entity is earliest among all runnable entities on this CPU, the DL scheduling class now has a pending deadline job that outranks rt_sched_class in pick_next_task() on the next scheduling decision.',
    highlights: ['error-indicator'],
    data: cloneState(state),
  });

  // Frame 6: DL server is picked over RT -- ext_server_pick_task invoked
  state.phase = 'pick';
  state.dlServer = { runtime: 50_000_000, deadline: 2_000_000_000, active: true, picking: true };
  state.srcRef = 'kernel/sched/ext.c:3133 ext_server_pick_task()';
  frames.push({
    step: 6,
    label: 'DL server outranks RT -- ext_server_pick_task() is called',
    description: 'pick_next_task() walks the sched classes in priority order. The DL class now has a ready entity (rq->ext_server) whose deadline fires before any runnable RT task, so pick_next_task_dl() selects rq->ext_server. Because dl_se->server_pick_task is set, the core invokes ext_server_pick_task(dl_se, rf) at kernel/sched/ext.c:3133. The wrapper verifies scx_enabled() and calls do_pick_task_scx(dl_se->rq, rf, true) -- returning the next runnable SCX task from the local DSQ instead of letting RT run.',
    highlights: ['ops-callback'],
    data: cloneState(state),
  });

  // Frame 7: SCX task runs under the DL server's borrowed slice
  state.phase = 'running';
  state.tasks = ['rt_hog[101] (SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777] (running via DL server)'];
  state.dlServer = { runtime: 50_000_000, deadline: 2_000_000_000, active: true, picking: false };
  state.srcRef = 'kernel/sched/ext.c:3133 ext_server_pick_task()';
  frames.push({
    step: 7,
    label: 'SCX task runs under DL server slice -- starvation avoided',
    description: 'The selected SCX task begins executing. From the scheduler core\'s perspective it is running as part of the DL class via rq->ext_server, so it cannot be preempted by RT tasks until the DL entity\'s runtime drains again. set_next_task_scx() is still invoked (ops.running BPF callback fires) because the task itself is a SCHED_EXT task -- only the scheduling credit comes from the DL server. This guarantees the BPF scheduler at least dl_runtime / dl_period worth of CPU per deadline period even under RT pressure.',
    highlights: ['task-list'],
    data: cloneState(state),
  });

  // Frame 8: Cycle repeats -- replenishment keeps SCX live
  state.phase = 'running';
  state.tasks = ['rt_hog[101] (running, SCHED_FIFO)', 'rt_hog[102] (SCHED_FIFO)', 'scx_worker[777] (queued)'];
  state.dlServer = { runtime: 40_000_000, deadline: 2_000_000_000, active: true, picking: false };
  state.srcRef = 'kernel/sched/ext.c:1286 dl_server_update(&rq->ext_server, delta_exec)';
  frames.push({
    step: 8,
    label: 'DL server cycles -- periodic SCX bandwidth guarantee',
    description: 'After the SCX slice is consumed, control returns to pick_next_task(). The DL server either still has budget (SCX keeps running) or is drained and throttled until the next replenishment (RT resumes, dl_server_update continues to account delta_exec against rq->ext_server). Every period, dl_server replenishes runtime and the cycle repeats. Net effect: SCX receives a bounded, deterministic share of CPU even when SCHED_FIFO workers try to monopolize the CPU -- the v7.0 fix for BPF scheduler starvation.',
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
