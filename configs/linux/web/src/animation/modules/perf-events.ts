import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PerfEventsState {
  phase: string;
  eventType: string;
  pmuConfig: string;
  sampleCount: number;
  ringBuffer: { head: number; tail: number };
  overflowCount: number;
  eventState: string;
  srcRef: string;
}

function cloneState(s: PerfEventsState): PerfEventsState {
  return {
    phase: s.phase,
    eventType: s.eventType,
    pmuConfig: s.pmuConfig,
    sampleCount: s.sampleCount,
    ringBuffer: { ...s.ringBuffer },
    overflowCount: s.overflowCount,
    eventState: s.eventState,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: event-open-enable
// Opening and enabling a hardware perf event via perf_event_open() syscall
// ---------------------------------------------------------------------------
function generateEventOpenEnable(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: PerfEventsState = {
    phase: 'syscall',
    eventType: 'hardware',
    pmuConfig: 'PERF_COUNT_HW_CPU_CYCLES',
    sampleCount: 0,
    ringBuffer: { head: 0, tail: 0 },
    overflowCount: 0,
    eventState: 'OFF',
    srcRef: '',
  };

  // Frame 0: perf_event_open syscall entry
  state.srcRef = 'kernel/events/core.c:13804 (SYSCALL_DEFINE5 perf_event_open)';
  frames.push({
    step: 0,
    label: 'perf_event_open() syscall entry',
    description: 'Userspace calls perf_event_open() with struct perf_event_attr specifying type=PERF_TYPE_HARDWARE, config=PERF_COUNT_HW_CPU_CYCLES, sample_period=100000. SYSCALL_DEFINE5(perf_event_open, ...) at kernel/events/core.c:13804 begins by calling perf_copy_attr() at line 13826 to copy and validate the attr struct from userspace. security_perf_event_open() at line 13831 checks LSM permissions.',
    highlights: ['phase-syscall'],
    data: cloneState(state),
  });

  // Frame 1: perf_event_alloc
  state.phase = 'alloc';
  state.srcRef = 'kernel/events/core.c:13266 (perf_event_alloc)';
  frames.push({
    step: 1,
    label: 'perf_event_alloc() creates event struct',
    description: 'perf_event_alloc() at kernel/events/core.c:13266 allocates the perf_event from the perf_event_cache slab via kmem_cache_alloc_node() at line 13289. It initializes hw_perf_event (hwc) at line 13381, sets hwc->sample_period from attr at line 13382, and initializes period_left at line 13387. mutex_init(&event->child_mutex) at line 13300 and INIT_LIST_HEAD for sibling and active lists at lines 13303-13305.',
    highlights: ['phase-alloc'],
    data: cloneState(state),
  });

  // Frame 2: PMU init via perf_init_event
  state.phase = 'pmu-init';
  state.srcRef = 'kernel/events/core.c:13401 (perf_init_event) -> arch/x86/events/core.c:588 (x86_pmu_hw_config)';
  frames.push({
    step: 2,
    label: 'PMU hardware configuration',
    description: 'perf_init_event() at kernel/events/core.c:13401 iterates registered PMUs to find one that accepts this event. For hardware events on x86, x86_pmu_hw_config() at arch/x86/events/core.c:588 configures the hardware counter: selects a PMC register, validates the event config, and sets up hw_perf_event fields. x86_pmu.handle_irq is registered via DEFINE_STATIC_CALL at arch/x86/events/core.c:70.',
    highlights: ['phase-pmu-init'],
    data: cloneState(state),
  });

  // Frame 3: security check and fd allocation
  state.phase = 'fd-alloc';
  state.srcRef = 'kernel/events/core.c:13923 (perf_event_alloc call) -> 13831 (security_perf_event_open)';
  frames.push({
    step: 3,
    label: 'Security check and fd creation',
    description: 'Back in sys_perf_event_open(), security_perf_event_open() at kernel/events/core.c:13831 runs LSM hooks (PERF_SECURITY_OPEN). perf_event_alloc() at line 13923 returns the new event. is_sampling_event() check at line 13930 verifies the PMU supports interrupts (PERF_PMU_CAP_NO_INTERRUPT check). An anonymous inode fd is allocated via anon_inode_getfile() to represent the event in userspace.',
    highlights: ['phase-fd-alloc'],
    data: cloneState(state),
  });

  // Frame 4: Find or create context
  state.phase = 'context';
  state.eventState = 'OFF';
  state.srcRef = 'kernel/events/core.c:3120 (perf_install_in_context)';
  frames.push({
    step: 4,
    label: 'perf_install_in_context() binds event',
    description: 'perf_install_in_context() at kernel/events/core.c:3120 binds the event to its target context. smp_store_release(&event->ctx, ctx) at line 3137 publishes the context pointer with release semantics. For per-CPU events (!task), cpu_function_call() at line 3160 sends an IPI to the target CPU to run __perf_install_in_context(). For task events, task_function_call() at line 3202 is used instead.',
    highlights: ['phase-context'],
    data: cloneState(state),
  });

  // Frame 5: __perf_install_in_context on target CPU
  state.phase = 'install';
  state.srcRef = 'kernel/events/core.c:3051 (__perf_install_in_context)';
  frames.push({
    step: 5,
    label: '__perf_install_in_context() on target CPU',
    description: '__perf_install_in_context() at kernel/events/core.c:3051 runs on the target CPU via IPI. It acquires ctx->lock (raw_spin_lock), calls add_event_to_ctx() at line 3154 to insert the event into the context event list, and if the context is active, triggers event scheduling. The ctx->is_active flag determines whether the event can be immediately scheduled onto hardware.',
    highlights: ['phase-install'],
    data: cloneState(state),
  });

  // Frame 6: IOC_ENABLE triggers event_sched_in
  state.phase = 'enable';
  state.eventState = 'ACTIVE';
  state.srcRef = 'kernel/events/core.c:2802 (event_sched_in)';
  frames.push({
    step: 6,
    label: 'event_sched_in() programs PMU hardware',
    description: 'When the event is enabled (via IOC_ENABLE ioctl or if not created disabled), event_sched_in() at kernel/events/core.c:2802 programs the PMU. WRITE_ONCE(event->oncpu, smp_processor_id()) at line 2815 records the CPU. smp_wmb() at line 2821 ensures ordering. perf_event_set_state(event, PERF_EVENT_STATE_ACTIVE) at line 2822 marks it active. The PMU pmu->add() callback writes the event config into the hardware performance counter MSR.',
    highlights: ['phase-enable'],
    data: cloneState(state),
  });

  // Frame 7: Hardware counter running
  state.phase = 'counting';
  state.srcRef = 'arch/x86/events/core.c:128 (x86_perf_event_update)';
  frames.push({
    step: 7,
    label: 'Hardware PMC counting cycles',
    description: 'The hardware performance monitoring counter (PMC) is now counting CPU cycles. x86_perf_event_update() at arch/x86/events/core.c:128 reads the counter via rdpmc() at line 147, uses local64_try_cmpxchg() at line 148 to atomically update prev_count (handling NMI races), computes delta at line 159, and adds it to event->count at line 162. period_left at line 163 tracks when the next sample overflow will fire.',
    highlights: ['phase-counting'],
    data: cloneState(state),
  });

  // Frame 8: Event fd returned to userspace
  state.phase = 'complete';
  state.srcRef = 'kernel/events/core.c:13804 (perf_event_open returns fd)';
  frames.push({
    step: 8,
    label: 'Event fd returned to userspace',
    description: 'sys_perf_event_open() returns the file descriptor to userspace. The fd can be used with read() to get counter values, mmap() to map the ring buffer for samples, and ioctl() for IOC_ENABLE/IOC_DISABLE/IOC_RESET. The perf_event is now fully initialized: PMU hardware is programmed, the ring buffer (if mmap\'d) is ready, and overflow interrupts will fire at the configured sample_period.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: sampling-overflow
// PMU overflow interrupt triggers sample recording into ring buffer
// ---------------------------------------------------------------------------
function generateSamplingOverflow(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: PerfEventsState = {
    phase: 'counting',
    eventType: 'hardware',
    pmuConfig: 'PERF_COUNT_HW_CPU_CYCLES',
    sampleCount: 0,
    ringBuffer: { head: 0, tail: 0 },
    overflowCount: 0,
    eventState: 'ACTIVE',
    srcRef: '',
  };

  // Frame 0: PMC counting, approaching overflow
  state.srcRef = 'arch/x86/events/core.c:128 (x86_perf_event_update)';
  frames.push({
    step: 0,
    label: 'PMC counting, period_left approaching 0',
    description: 'The hardware PMC is counting CPU cycles. x86_perf_event_update() at arch/x86/events/core.c:128 reads the counter via rdpmc() at line 147. The counter value approaches the configured sample_period. hwc->period_left (local64 at kernel/events/core.c:13387) tracks remaining counts. When the counter overflows (wraps past the programmed reload value), the PMU generates a Performance Monitoring Interrupt (PMI).',
    highlights: ['phase-counting'],
    data: cloneState(state),
  });

  // Frame 1: PMI fires, enters NMI handler
  state.phase = 'pmi';
  state.overflowCount = 1;
  state.srcRef = 'arch/x86/events/core.c:70 (x86_pmu_handle_irq static_call)';
  frames.push({
    step: 1,
    label: 'PMU overflow fires NMI/PMI',
    description: 'The PMC overflow triggers a Performance Monitoring Interrupt. On x86, this arrives as an NMI via the APIC LVTPC vector. The NMI handler calls x86_pmu_handle_irq via the static_call defined at arch/x86/events/core.c:70 (DEFINE_STATIC_CALL_NULL(x86_pmu_handle_irq, *x86_pmu.handle_irq)). The handler iterates over active events on this CPU to find which counter overflowed.',
    highlights: ['phase-pmi'],
    data: cloneState(state),
  });

  // Frame 2: perf_event_overflow
  state.phase = 'overflow';
  state.srcRef = 'kernel/events/core.c:10772 (perf_event_overflow)';
  frames.push({
    step: 2,
    label: 'perf_event_overflow() entry',
    description: 'perf_event_overflow() at kernel/events/core.c:10772 is the entry point from the hardware PMI. lockdep_assert_irqs_disabled() at line 10781 verifies interrupts are off. It calls __perf_event_overflow() at line 10783 with throttle=1. __perf_event_overflow() at line 10680 first checks is_sampling_event() at line 10691, then calls __perf_event_account_interrupt() at line 10694 for throttle accounting.',
    highlights: ['phase-overflow'],
    data: cloneState(state),
  });

  // Frame 3: Sample data preparation
  state.phase = 'sample-prep';
  state.srcRef = 'kernel/events/core.c:8787 (__perf_event_output)';
  frames.push({
    step: 3,
    label: '__perf_event_output() prepares sample',
    description: '__perf_event_output() at kernel/events/core.c:8787 prepares the sample record. rcu_read_lock() at line 8800 protects the event and ring buffer. perf_prepare_sample() at line 8802 fills perf_sample_data with IP, TID, time, callchain, etc. based on attr.sample_type flags. perf_prepare_header() at line 8803 constructs the perf_event_header with type=PERF_RECORD_SAMPLE and computed size.',
    highlights: ['phase-sample-prep'],
    data: cloneState(state),
  });

  // Frame 4: Ring buffer output_begin
  state.phase = 'rb-begin';
  state.srcRef = 'kernel/events/ring_buffer.c:153 (__perf_output_begin)';
  frames.push({
    step: 4,
    label: 'perf_output_begin() reserves ring buffer space',
    description: 'output_begin() dispatches to __perf_output_begin() at kernel/events/ring_buffer.c:153. rcu_read_lock() protects rb access. For inherited events, the parent\'s rb is used (line 171-172). rb = rcu_dereference(event->rb) at line 174 gets the ring buffer. If rb->paused (line 178), samples are lost (local_inc(&rb->lost) at line 180). The function reserves space by advancing the head pointer atomically, handling wrap-around in the circular buffer.',
    highlights: ['phase-rb-begin'],
    data: cloneState(state),
  });

  // Frame 5: Sample written to ring buffer
  state.phase = 'rb-write';
  state.sampleCount = 1;
  state.ringBuffer = { head: 72, tail: 0 };
  state.srcRef = 'kernel/events/core.c:8809 (perf_output_sample)';
  frames.push({
    step: 5,
    label: 'perf_output_sample() writes to ring buffer',
    description: 'perf_output_sample() at kernel/events/core.c:8809 writes the sample record into the reserved ring buffer space. The sample contains: IP (instruction pointer), TID, timestamp, and other fields based on attr.sample_type. The ring buffer is a memory-mapped circular buffer shared with userspace. The head pointer at offset 0 in the mmap page tells userspace where new data ends. Data pages follow the control page.',
    highlights: ['phase-rb-write'],
    data: cloneState(state),
  });

  // Frame 6: perf_output_end and wakeup
  state.phase = 'rb-end';
  state.srcRef = 'kernel/events/ring_buffer.c:308 (perf_output_end)';
  frames.push({
    step: 6,
    label: 'perf_output_end() publishes and wakes',
    description: 'perf_output_end() at kernel/events/ring_buffer.c:308 calls perf_output_put_handle() which publishes the updated head to userspace. The nested counter (rb->nest at line 50) ensures that when multiple NMIs overlap, only the outermost writer publishes the final head. perf_output_wakeup() at line 20 sets rb->poll to EPOLLIN|EPOLLRDNORM (line 22) and queues irq_work (line 29) to wake poll/epoll waiters.',
    highlights: ['phase-rb-end'],
    data: cloneState(state),
  });

  // Frame 7: Counter reprogrammed
  state.phase = 'reprogram';
  state.srcRef = 'arch/x86/events/core.c:128 (x86_perf_event_update) -> set_period';
  frames.push({
    step: 7,
    label: 'Counter reprogrammed for next sample',
    description: 'After recording the sample, the PMU handler reprograms the counter for the next overflow period. x86_pmu.set_period (static_call at arch/x86/events/core.c:82) reloads the counter with the negative of sample_period so it overflows after that many more events. local64_set(&hwc->period_left, hwc->sample_period) resets the countdown. The NMI handler returns, and normal execution resumes.',
    highlights: ['phase-reprogram'],
    data: cloneState(state),
  });

  // Frame 8: Userspace reads samples
  state.phase = 'userspace-read';
  state.sampleCount = 1;
  state.ringBuffer = { head: 72, tail: 72 };
  state.srcRef = 'kernel/events/ring_buffer.c:20 (perf_output_wakeup -> userspace mmap read)';
  frames.push({
    step: 8,
    label: 'Userspace reads samples from ring buffer',
    description: 'Userspace (perf tool) is woken by the irq_work queued in perf_output_wakeup(). It reads the mmap control page to get the updated data_head (72 bytes). It processes the PERF_RECORD_SAMPLE record between its local data_tail and data_head, extracting IP, timestamp, etc. After processing, userspace writes data_tail=72 to the control page, freeing ring buffer space for new samples. The cycle repeats at each overflow.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: software-event
// Software events: context switches, page faults
// ---------------------------------------------------------------------------
function generateSoftwareEvent(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: PerfEventsState = {
    phase: 'setup',
    eventType: 'software',
    pmuConfig: 'PERF_COUNT_SW_CONTEXT_SWITCHES',
    sampleCount: 0,
    ringBuffer: { head: 0, tail: 0 },
    overflowCount: 0,
    eventState: 'ACTIVE',
    srcRef: '',
  };

  // Frame 0: Software event creation
  state.srcRef = 'kernel/events/core.c:13804 (perf_event_open with type=PERF_TYPE_SOFTWARE)';
  frames.push({
    step: 0,
    label: 'Software perf event created',
    description: 'perf_event_open() at kernel/events/core.c:13804 is called with attr.type=PERF_TYPE_SOFTWARE, attr.config=PERF_COUNT_SW_CONTEXT_SWITCHES. Software events do not use hardware PMCs. perf_init_event() finds the software PMU (pmu->task_ctx_nr == perf_sw_context check at line 13949). The event is installed into the task context via task->perf_event_ctxp (include/linux/sched.h:1346).',
    highlights: ['phase-setup'],
    data: cloneState(state),
  });

  // Frame 1: task_struct perf context
  state.phase = 'task-ctx';
  state.srcRef = 'kernel/events/core.c:3767 (perf_event_context_sched_out)';
  frames.push({
    step: 1,
    label: 'task->perf_event_ctxp context binding',
    description: 'The software event is bound to the task via task->perf_event_ctxp at include/linux/sched.h:1346. perf_event_context_sched_out() at kernel/events/core.c:3765 reads ctx = task->perf_event_ctxp at line 3767. When a context switch occurs, this pointer is used to find all perf events attached to the outgoing task. next_ctx = rcu_dereference(next->perf_event_ctxp) at line 3776 gets the incoming task context.',
    highlights: ['phase-task-ctx'],
    data: cloneState(state),
  });

  // Frame 2: Context switch triggers __perf_event_task_sched_out
  state.phase = 'sched-out';
  state.srcRef = 'kernel/events/core.c:3944 (__perf_event_task_sched_out)';
  frames.push({
    step: 2,
    label: '__perf_event_task_sched_out() on context switch',
    description: 'When schedule() performs a context switch, __perf_event_task_sched_out() at kernel/events/core.c:3944 is called. It first checks perf_sched_cb_usages at line 3947 for PMU sched callbacks. atomic_read(&nr_switch_events) at line 3950 detects active switch event listeners. perf_event_switch() at line 3951 generates PERF_RECORD_SWITCH records. perf_event_context_sched_out() at line 3953 handles the full context sched-out.',
    highlights: ['phase-sched-out'],
    data: cloneState(state),
  });

  // Frame 3: perf_sw_event fires
  state.phase = 'sw-event';
  state.srcRef = 'kernel/events/core.c:11034 (__perf_sw_event)';
  frames.push({
    step: 3,
    label: '__perf_sw_event() fires for context switch',
    description: '__perf_sw_event() at kernel/events/core.c:11034 is called from the scheduler for PERF_COUNT_SW_CONTEXT_SWITCHES. preempt_disable_notrace() at line 11038 prevents reentrancy. perf_swevent_get_recursion_context() at line 11039 uses current->perf_recursion to track nesting depth. ___perf_sw_event() at line 11043 initializes perf_sample_data with perf_sample_data_init() (line 11030) and calls do_perf_sw_event() at line 11031.',
    highlights: ['phase-sw-event'],
    data: cloneState(state),
  });

  // Frame 4: do_perf_sw_event hash table lookup
  state.phase = 'swevent-lookup';
  state.srcRef = 'kernel/events/core.c:10988 (do_perf_sw_event)';
  frames.push({
    step: 4,
    label: 'do_perf_sw_event() looks up event in hash table',
    description: 'do_perf_sw_event() at kernel/events/core.c:10988 looks up the software event in the per-CPU swevent_htable. rcu_read_lock() at line 10997 protects the hash table. find_swevent_head_rcu() at line 10998 hashes type+event_id to find the bucket. hlist_for_each_entry_rcu() at line 11002 iterates matching events. perf_swevent_match() at line 11003 checks type, event_id, and context. Matching events get perf_swevent_event() called at line 11004.',
    highlights: ['phase-swevent-lookup'],
    data: cloneState(state),
  });

  // Frame 5: perf_swevent_event counting
  state.phase = 'swevent-count';
  state.overflowCount = 1;
  state.srcRef = 'kernel/events/core.c:10853 (perf_swevent_event)';
  frames.push({
    step: 5,
    label: 'perf_swevent_event() increments counter',
    description: 'perf_swevent_event() at kernel/events/core.c:10853 processes the software event. lockdep_assert_preemption_disabled() at line 10871 verifies safety. local64_add(nr, &event->count) at line 10872 atomically increments the event counter. For non-sampling events, it returns after the count update. For sampling events (attr.sample_period > 0), it checks if the sample period has elapsed and calls perf_swevent_overflow() to record a sample.',
    highlights: ['phase-swevent-count'],
    data: cloneState(state),
  });

  // Frame 6: Sample recording for software event
  state.phase = 'sw-sample';
  state.sampleCount = 1;
  state.ringBuffer = { head: 64, tail: 0 };
  state.srcRef = 'kernel/events/core.c:8787 (__perf_event_output for software event)';
  frames.push({
    step: 6,
    label: 'Software event sample recorded',
    description: 'If sampling is configured, perf_swevent_overflow() calls __perf_event_output() at kernel/events/core.c:8787. The sample records the current instruction pointer, task ID, and timestamp at the moment of the context switch. perf_output_begin() reserves ring buffer space, perf_output_sample() writes the record, and perf_output_end() publishes it. The same ring buffer mechanism is used for both hardware and software events.',
    highlights: ['phase-sw-sample'],
    data: cloneState(state),
  });

  // Frame 7: Context switch completes, next task scheduled
  state.phase = 'sched-in';
  state.srcRef = 'kernel/events/core.c:3953 (perf_event_context_sched_out completes)';
  frames.push({
    step: 7,
    label: 'Context sched-out completes, next task runs',
    description: 'perf_event_context_sched_out() at kernel/events/core.c:3953 completes. If the next task also has perf events (next->perf_event_ctxp is non-NULL at line 3776), an optimization may swap contexts (RCU_INIT_POINTER at lines 3834-3835) instead of removing and re-adding events. perf_cgroup_switch() at line 3960 handles cgroup-aware PMU multiplexing. The scheduler then calls __switch_to() to actually switch register state.',
    highlights: ['phase-sched-in'],
    data: cloneState(state),
  });

  // Frame 8: Userspace reads context switch sample
  state.phase = 'complete';
  state.ringBuffer = { head: 64, tail: 64 };
  state.srcRef = 'kernel/events/ring_buffer.c:20 (perf_output_wakeup -> userspace)';
  frames.push({
    step: 8,
    label: 'Userspace reads context switch record',
    description: 'The perf tool reads the PERF_RECORD_SAMPLE from the mmap ring buffer. For context switch events, PERF_RECORD_SWITCH (generated by perf_event_switch() at kernel/events/core.c:3951) provides prev/next task info. Software events use the same __perf_sw_event() -> perf_swevent_event() -> __perf_event_output() pipeline, but fire from kernel instrumentation points rather than hardware PMU interrupts. No PMC register is involved.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS = [
  { id: 'syscall', label: 'Syscall' },
  { id: 'alloc', label: 'Alloc' },
  { id: 'pmu-init', label: 'PMU Init' },
  { id: 'enable', label: 'Enable' },
  { id: 'counting', label: 'Counting' },
  { id: 'overflow', label: 'Overflow' },
  { id: 'rb-write', label: 'RB Write' },
  { id: 'complete', label: 'Complete' },
];

const STATE_COLORS: Record<string, string> = {
  OFF: '#8b949e',
  ACTIVE: '#3fb950',
  ERROR: '#f85149',
};

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'syscall': return 0;
    case 'alloc': return 1;
    case 'pmu-init':
    case 'fd-alloc': return 2;
    case 'context':
    case 'install':
    case 'enable':
    case 'setup':
    case 'task-ctx': return 3;
    case 'counting':
    case 'pmi':
    case 'sched-out':
    case 'sw-event':
    case 'swevent-lookup': return 4;
    case 'overflow':
    case 'sample-prep':
    case 'swevent-count': return 5;
    case 'rb-begin':
    case 'rb-write':
    case 'rb-end':
    case 'sw-sample': return 6;
    case 'reprogram':
    case 'userspace-read':
    case 'sched-in':
    case 'complete': return 7;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as PerfEventsState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'perf_event Subsystem & PMU Sampling';
  container.appendChild(title);

  // --- Event State indicator ---
  const stateTop = margin.top + 28;
  const stateWidth = 180;
  const stateHeight = 30;
  const stateColor = STATE_COLORS[data.eventState] || '#30363d';

  const stateRect = document.createElementNS(NS, 'rect');
  stateRect.setAttribute('x', String(margin.left));
  stateRect.setAttribute('y', String(stateTop));
  stateRect.setAttribute('width', String(stateWidth));
  stateRect.setAttribute('height', String(stateHeight));
  stateRect.setAttribute('rx', '6');
  stateRect.setAttribute('fill', stateColor);
  let stateCls = 'anim-mode';
  if (frame.highlights.some(h => h.startsWith('phase-'))) stateCls += ' anim-highlight';
  stateRect.setAttribute('class', stateCls);
  container.appendChild(stateRect);

  const stateText = document.createElementNS(NS, 'text');
  stateText.setAttribute('x', String(margin.left + stateWidth / 2));
  stateText.setAttribute('y', String(stateTop + 20));
  stateText.setAttribute('text-anchor', 'middle');
  stateText.setAttribute('class', 'anim-mode');
  stateText.setAttribute('fill', '#e6edf3');
  stateText.textContent = `Event: ${data.eventState} (${data.eventType})`;
  container.appendChild(stateText);

  // --- Info panel (right side) ---
  const infoLeft = width - margin.right - 260;
  const infoTop = margin.top + 28;

  const infoEntries = [
    { label: 'Type', value: data.eventType },
    { label: 'Config', value: data.pmuConfig },
    { label: 'Samples', value: String(data.sampleCount) },
    { label: 'Overflows', value: String(data.overflowCount) },
  ];

  infoEntries.forEach((info, i) => {
    const iy = infoTop + i * 20;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(infoLeft));
    rect.setAttribute('y', String(iy));
    rect.setAttribute('width', '250');
    rect.setAttribute('height', '16');
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', '#21262d');
    rect.setAttribute('class', 'anim-register');
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(infoLeft + 4));
    label.setAttribute('y', String(iy + 12));
    label.setAttribute('fill', '#8b949e');
    label.setAttribute('font-size', '10');
    label.setAttribute('class', 'anim-register');
    label.textContent = `${info.label}: ${info.value}`;
    container.appendChild(label);
  });

  // --- Phase flow diagram ---
  const flowTop = stateTop + stateHeight + 25;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(85, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
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

  // --- Ring buffer visualization ---
  const rbTop = flowTop + phaseHeight + 30;
  const rbLabel = document.createElementNS(NS, 'text');
  rbLabel.setAttribute('x', String(margin.left));
  rbLabel.setAttribute('y', String(rbTop));
  rbLabel.setAttribute('class', 'anim-cpu-label');
  rbLabel.textContent = 'Ring Buffer:';
  container.appendChild(rbLabel);

  const rbWidth = Math.min(400, usableWidth * 0.6);
  const rbHeight = 24;
  const rbX = margin.left;
  const rbY = rbTop + 8;
  const totalSlots = 8;
  const slotWidth = rbWidth / totalSlots;

  // Normalize head/tail to slot positions
  const headSlot = data.ringBuffer.head > 0 ? Math.min(Math.ceil(data.ringBuffer.head / 16), totalSlots) : 0;
  const tailSlot = data.ringBuffer.tail > 0 ? Math.min(Math.ceil(data.ringBuffer.tail / 16), totalSlots) : 0;

  for (let s = 0; s < totalSlots; s++) {
    const sx = rbX + s * slotWidth;
    const isFilled = s < headSlot && s >= tailSlot;

    const slotRect = document.createElementNS(NS, 'rect');
    slotRect.setAttribute('x', String(sx));
    slotRect.setAttribute('y', String(rbY));
    slotRect.setAttribute('width', String(slotWidth - 2));
    slotRect.setAttribute('height', String(rbHeight));
    slotRect.setAttribute('rx', '2');
    slotRect.setAttribute('fill', isFilled ? '#1f6feb' : '#21262d');
    slotRect.setAttribute('class', 'anim-ring-buffer');
    container.appendChild(slotRect);
  }

  // Head/tail labels
  const headLabel = document.createElementNS(NS, 'text');
  headLabel.setAttribute('x', String(rbX + rbWidth + 8));
  headLabel.setAttribute('y', String(rbY + 10));
  headLabel.setAttribute('fill', '#8b949e');
  headLabel.setAttribute('font-size', '10');
  headLabel.setAttribute('class', 'anim-ring-buffer');
  headLabel.textContent = `head=${data.ringBuffer.head} tail=${data.ringBuffer.tail}`;
  container.appendChild(headLabel);

  // --- Source reference ---
  const srcTop = rbY + rbHeight + 20;
  const srcText = document.createElementNS(NS, 'text');
  srcText.setAttribute('x', String(margin.left));
  srcText.setAttribute('y', String(srcTop));
  srcText.setAttribute('fill', '#8b949e');
  srcText.setAttribute('font-size', '10');
  srcText.setAttribute('class', 'anim-cpu-label');
  srcText.textContent = `src: ${data.srcRef}`;
  container.appendChild(srcText);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'event-open-enable', label: 'Event Open & Enable (HW cycles)' },
  { id: 'sampling-overflow', label: 'PMU Overflow & Sample Recording' },
  { id: 'software-event', label: 'Software Event (context switches)' },
];

const perfEvents: AnimationModule = {
  config: {
    id: 'perf-events',
    title: 'perf_event Subsystem & PMU Sampling',
    skillName: 'perf-events',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'sampling-overflow': return generateSamplingOverflow();
      case 'software-event': return generateSoftwareEvent();
      case 'event-open-enable':
      default: return generateEventOpenEnable();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default perfEvents;
