import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CpuState {
  id: number;
  context: 'user' | 'kernel' | 'hardirq' | 'softirq' | 'kworker';
  currentTask: string;
  irqsDisabled: boolean;
  preemptCount: number;
}

export interface SoftirqEntry {
  name: string;
  pending: boolean;
  running: boolean;
}

export interface WorkqueueItem {
  name: string;
  state: 'queued' | 'running' | 'done';
}

export interface InterruptState {
  cpus: CpuState[];
  irqLine: { number: number; name: string; state: 'idle' | 'firing' | 'handling' | 'done' };
  phase: 'idle' | 'hardirq-entry' | 'top-half' | 'irq-exit' | 'softirq' | 'threaded-irq' | 'workqueue' | 'complete';
  softirqs: SoftirqEntry[];
  workqueue: WorkqueueItem[];
  pendingSoftirqBits: number;
  contextStack: string[];
  srcRef: string;
}

function defaultSoftirqs(): SoftirqEntry[] {
  return [
    { name: 'HI', pending: false, running: false },
    { name: 'TIMER', pending: false, running: false },
    { name: 'NET_TX', pending: false, running: false },
    { name: 'NET_RX', pending: false, running: false },
    { name: 'BLOCK', pending: false, running: false },
    { name: 'IRQ_POLL', pending: false, running: false },
    { name: 'TASKLET', pending: false, running: false },
    { name: 'SCHED', pending: false, running: false },
    { name: 'HRTIMER', pending: false, running: false },
    { name: 'RCU', pending: false, running: false },
  ];
}

function cloneState(s: InterruptState): InterruptState {
  return {
    cpus: s.cpus.map(c => ({ ...c })),
    irqLine: { ...s.irqLine },
    phase: s.phase,
    softirqs: s.softirqs.map(e => ({ ...e })),
    workqueue: s.workqueue.map(w => ({ ...w })),
    pendingSoftirqBits: s.pendingSoftirqBits,
    contextStack: [...s.contextStack],
    srcRef: s.srcRef,
  };
}

function setSoftirqPending(state: InterruptState, name: string): void {
  const entry = state.softirqs.find(s => s.name === name);
  if (entry) {
    entry.pending = true;
    const idx = state.softirqs.indexOf(entry);
    state.pendingSoftirqBits |= (1 << idx);
  }
}

function setSoftirqRunning(state: InterruptState, name: string): void {
  const entry = state.softirqs.find(s => s.name === name);
  if (entry) {
    entry.running = true;
    entry.pending = false;
    const idx = state.softirqs.indexOf(entry);
    state.pendingSoftirqBits &= ~(1 << idx);
  }
}

function clearSoftirq(state: InterruptState, name: string): void {
  const entry = state.softirqs.find(s => s.name === name);
  if (entry) {
    entry.running = false;
    entry.pending = false;
  }
}

// ---------------------------------------------------------------------------
// Scenario: Network IRQ (default)
// ---------------------------------------------------------------------------
function generateNetworkIrq(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: InterruptState = {
    cpus: [
      { id: 0, context: 'user', currentTask: 'nginx', irqsDisabled: false, preemptCount: 0 },
    ],
    irqLine: { number: 19, name: 'eth0', state: 'idle' },
    phase: 'idle',
    softirqs: defaultSoftirqs(),
    workqueue: [],
    pendingSoftirqBits: 0,
    contextStack: ['user: nginx'],
    srcRef: '',
  };

  // Frame 0: Idle state
  state.srcRef = 'kernel/irq/handle.c:24 (handle_arch_irq function pointer)';
  frames.push({
    step: 0,
    label: 'CPU running userspace process',
    description: 'CPU 0 is running nginx in user mode. The network card (eth0) is connected to IRQ line 19 via the APIC. The kernel registered a handler with request_irq(19, e1000_intr, ...) during driver init. [kernel/irq/handle.c:24 -- handle_arch_irq is the root IRQ dispatch function pointer set during boot.]',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 1: IRQ fires -- x86 common_interrupt entry
  state.irqLine.state = 'firing';
  state.phase = 'hardirq-entry';
  state.cpus[0].context = 'hardirq';
  state.cpus[0].irqsDisabled = true;
  state.cpus[0].preemptCount = 1;
  state.contextStack.push('hardirq: IRQ 19');
  state.srcRef = 'arch/x86/kernel/irq.c:326 (DEFINE_IDTENTRY_IRQ common_interrupt)';

  frames.push({
    step: 1,
    label: 'Hardware IRQ 19 fires!',
    description: 'A packet arrives on eth0. The NIC asserts IRQ 19. The CPU saves registers and jumps to the IDT vector, entering common_interrupt() at arch/x86/kernel/irq.c:326 (DEFINE_IDTENTRY_IRQ). This is the x86 entry point for all device IRQs. Interrupts are DISABLED on this CPU.',
    highlights: ['irq-line'],
    data: cloneState(state),
  });

  // Frame 2: handle_fasteoi_irq -> handle_irq_event
  state.irqLine.state = 'handling';
  state.srcRef = 'kernel/irq/chip.c:736 (handle_fasteoi_irq) -> kernel/irq/handle.c:255 (handle_irq_event)';

  frames.push({
    step: 2,
    label: 'handle_fasteoi_irq() dispatches IRQ',
    description: 'common_interrupt() calls the irq_desc flow handler. For MSI/APIC-based NICs this is handle_fasteoi_irq() at kernel/irq/chip.c:736. It takes desc->lock, increments stats via kstat_incr_irqs_this_cpu() at line 760, then calls handle_irq_event() at kernel/irq/handle.c:255 which clears IRQS_PENDING and sets IRQD_IRQ_INPROGRESS (lines 259-260).',
    highlights: ['stage-do-irq'],
    data: cloneState(state),
  });

  // Frame 3: Top-half handler -- __handle_irq_event_percpu iterates action chain
  state.phase = 'top-half';
  state.srcRef = 'kernel/irq/handle.c:185 (__handle_irq_event_percpu)';

  frames.push({
    step: 3,
    label: 'Top-half handler: e1000_intr()',
    description: 'handle_irq_event() calls handle_irq_event_percpu() at kernel/irq/handle.c:242, which calls __handle_irq_event_percpu() at line 185. This iterates all irqaction handlers via for_each_action_of_desc() (line 191). For each action, it calls action->handler(irq, action->dev_id) at line 209. For eth0, this invokes e1000_intr() with IRQs DISABLED.',
    highlights: ['stage-handler'],
    data: cloneState(state),
  });

  // Frame 4: NAPI scheduled, softirq raised
  setSoftirqPending(state, 'NET_RX');
  state.srcRef = 'kernel/softirq.c:777 (raise_softirq) -> kernel/softirq.c:786 (__raise_softirq_irqoff)';

  frames.push({
    step: 4,
    label: 'napi_schedule() raises NET_RX_SOFTIRQ',
    description: 'napi_schedule() adds the NIC NAPI struct to the per-CPU poll list and calls raise_softirq_irqoff(NET_RX_SOFTIRQ). raise_softirq() at kernel/softirq.c:777 saves IRQ flags, then calls raise_softirq_irqoff() at line 760, which calls __raise_softirq_irqoff() at line 786. This sets the bit in per-CPU __softirq_pending via or_softirq_pending(). Packet processing is DEFERRED.',
    highlights: ['softirq-NET_RX'],
    data: cloneState(state),
  });

  // Frame 5: Handler returns IRQ_HANDLED
  state.phase = 'irq-exit';
  state.srcRef = 'kernel/irq/handle.c:209 (action->handler returns) -> chip.c:766 (cond_unmask_eoi_irq)';

  frames.push({
    step: 5,
    label: 'Handler returns IRQ_HANDLED',
    description: 'The top-half returns IRQ_HANDLED. Back in __handle_irq_event_percpu() at kernel/irq/handle.c:218, the switch on retval accumulates the result. handle_irq_event_percpu() at line 248 calls add_interrupt_randomness(). Control returns to handle_fasteoi_irq() at kernel/irq/chip.c:766, which calls cond_unmask_eoi_irq() to send EOI to the APIC. Total top-half: ~1 microsecond.',
    highlights: ['stage-handler'],
    data: cloneState(state),
  });

  // Frame 6: irq_exit checks softirqs -- __irq_exit_rcu
  state.srcRef = 'kernel/softirq.c:713 (__irq_exit_rcu) -> line 722 (invoke_softirq check)';

  frames.push({
    step: 6,
    label: 'irq_exit() checks pending softirqs',
    description: 'irq_exit() at kernel/softirq.c:749 calls __irq_exit_rcu() at line 713. This decrements preempt_count via preempt_count_sub(HARDIRQ_OFFSET) at line 721, then checks: if !in_interrupt() && local_softirq_pending() (line 722). NET_RX bit is set! invoke_softirq() at line 487 calls __do_softirq() at line 496 (on the IRQ stack).',
    highlights: ['stage-irq-exit'],
    data: cloneState(state),
  });

  // Frame 7: Enter softirq context -- handle_softirqs
  state.phase = 'softirq';
  state.cpus[0].context = 'softirq';
  state.cpus[0].irqsDisabled = false;
  state.contextStack.push('softirq: NET_RX');
  setSoftirqRunning(state, 'NET_RX');
  state.srcRef = 'kernel/softirq.c:654 (__do_softirq) -> line 579 (handle_softirqs) -> line 606 (local_irq_enable)';

  frames.push({
    step: 7,
    label: '__do_softirq() processes NET_RX',
    description: '__do_softirq() at kernel/softirq.c:654 calls handle_softirqs(false) at line 579. It reads pending = local_softirq_pending() at line 596, clears the bitmask with set_softirq_pending(0) at line 604, then crucially re-enables interrupts at line 606 (local_irq_enable). The while loop at line 610 iterates set bits via ffs(pending) and calls h->action() at line 622 for each. NET_RX calls net_rx_action().',
    highlights: ['stage-softirq', 'softirq-NET_RX'],
    data: cloneState(state),
  });

  // Frame 8: NAPI poll processes packets
  state.srcRef = 'kernel/softirq.c:610 (while softirq_bit = ffs(pending)) -> line 622 (h->action())';

  frames.push({
    step: 8,
    label: 'net_rx_action() calls NAPI poll',
    description: 'net_rx_action() (the NET_RX softirq handler invoked at kernel/softirq.c:622 via h->action()) iterates the per-CPU NAPI poll list and calls each device poll function (e.g., e1000_clean()). NAPI processes up to a budget of 64 packets per poll cycle. This is where SKB allocation, protocol parsing, and socket delivery happen -- all with IRQs ENABLED.',
    highlights: ['stage-softirq'],
    data: cloneState(state),
  });

  // Frame 9: Packets delivered
  state.srcRef = 'kernel/softirq.c:622 (h->action executing net_rx_action)';

  frames.push({
    step: 9,
    label: 'Packets delivered to socket receive queue',
    description: 'NAPI poll calls napi_gro_receive() -> netif_receive_skb() which passes packets up the protocol stack: ip_rcv() -> tcp_v4_rcv() -> tcp_queue_rcv(). Packets land in the socket receive buffer. If nginx is blocked in epoll_wait(), it gets woken up. All of this runs inside the softirq action at kernel/softirq.c:622.',
    highlights: ['stage-softirq'],
    data: cloneState(state),
  });

  // Frame 10: Softirq completes -- restart check
  clearSoftirq(state, 'NET_RX');
  state.contextStack.pop(); // remove softirq
  state.srcRef = 'kernel/softirq.c:639-645 (pending recheck and MAX_SOFTIRQ_RESTART at line 544)';

  frames.push({
    step: 10,
    label: 'NET_RX softirq completes',
    description: 'net_rx_action() finishes. handle_softirqs() disables IRQs at line 637, then rechecks pending = local_softirq_pending() at line 639. If new softirqs were raised during processing, it restarts (goto restart at line 643) up to MAX_SOFTIRQ_RESTART=10 times or 2ms (line 543-544). If the limit is hit, wakeup_softirqd() at line 645 hands off to ksoftirqd.',
    highlights: ['softirq-NET_RX'],
    data: cloneState(state),
  });

  // Frame 11: Return to userspace
  state.phase = 'complete';
  state.cpus[0].context = 'user';
  state.cpus[0].irqsDisabled = false;
  state.cpus[0].preemptCount = 0;
  state.irqLine.state = 'done';
  state.contextStack = ['user: nginx'];
  state.srcRef = 'kernel/softirq.c:749 (irq_exit completes) -> arch/x86/kernel/irq.c:336 (set_irq_regs/return)';

  frames.push({
    step: 11,
    label: 'Return to userspace',
    description: 'The interrupt is fully handled. irq_exit() at kernel/softirq.c:749 completes with lockdep_hardirq_exit(). common_interrupt() at arch/x86/kernel/irq.c:336 restores irq_regs and returns. CPU restores saved registers via iret. Total latency: ~5-50us. The key: top-half ran ~1us with IRQs off, while heavy packet processing ran in softirq with IRQs ENABLED.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: Timer softirq
// ---------------------------------------------------------------------------
function generateTimerSoftirq(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: InterruptState = {
    cpus: [
      { id: 0, context: 'user', currentTask: 'bash', irqsDisabled: false, preemptCount: 0 },
    ],
    irqLine: { number: 0, name: 'LAPIC timer', state: 'idle' },
    phase: 'idle',
    softirqs: defaultSoftirqs(),
    workqueue: [],
    pendingSoftirqBits: 0,
    contextStack: ['user: bash'],
    srcRef: '',
  };

  state.srcRef = 'kernel/softirq.c:662 (irq_enter_rcu) -> line 676 (irq_enter)';
  frames.push({
    step: 0,
    label: 'CPU running userspace process',
    description: 'CPU 0 is running bash. The Local APIC timer fires at HZ frequency (250 or 1000 times/sec). On entry, the CPU will call irq_enter() at kernel/softirq.c:676 which calls ct_irq_enter() and irq_enter_rcu() at line 662 to set up hardirq context, enable RCU watching, and account CPU time.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 1: Timer IRQ fires
  state.irqLine.state = 'firing';
  state.phase = 'hardirq-entry';
  state.cpus[0].context = 'hardirq';
  state.cpus[0].irqsDisabled = true;
  state.cpus[0].preemptCount = 1;
  state.contextStack.push('hardirq: LAPIC timer');
  state.srcRef = 'arch/x86/kernel/irq.c:326 (common_interrupt) -> kernel/irq/chip.c:823 (handle_edge_irq)';

  frames.push({
    step: 1,
    label: 'Local APIC timer interrupt fires',
    description: 'The LAPIC timer fires, entering common_interrupt() at arch/x86/kernel/irq.c:326. For edge-triggered timer IRQs, the flow handler is handle_edge_irq() at kernel/irq/chip.c:823, which calls irq_ack via chip->irq_ack() at line 836, then dispatches to handle_irq_event() at line 855 in a do-while loop. IRQs are disabled.',
    highlights: ['irq-line'],
    data: cloneState(state),
  });

  // Frame 2: Top-half updates tick
  state.irqLine.state = 'handling';
  state.phase = 'top-half';
  state.srcRef = 'kernel/irq/handle.c:185 (__handle_irq_event_percpu) -> line 209 (action->handler)';

  frames.push({
    step: 2,
    label: 'Top-half: tick_handle_periodic()',
    description: 'handle_irq_event() calls __handle_irq_event_percpu() at kernel/irq/handle.c:185. The action->handler() call at line 209 invokes the timer handler. tick_handle_periodic() -> tick_periodic() increments jiffies, updates wall clock time, and accounts CPU time. All fast counter updates with IRQs disabled.',
    highlights: ['stage-handler'],
    data: cloneState(state),
  });

  // Frame 3: Raise TIMER and SCHED softirqs
  setSoftirqPending(state, 'TIMER');
  setSoftirqPending(state, 'SCHED');
  state.srcRef = 'kernel/softirq.c:777 (raise_softirq) -> line 786 (__raise_softirq_irqoff)';

  frames.push({
    step: 3,
    label: 'Raise TIMER_SOFTIRQ and SCHED_SOFTIRQ',
    description: 'The tick handler calls raise_softirq(TIMER_SOFTIRQ) and raise_softirq(SCHED_SOFTIRQ). raise_softirq() at kernel/softirq.c:777 saves IRQ flags, calls raise_softirq_irqoff() at line 760, which calls __raise_softirq_irqoff() at line 786. This sets bits 1 and 7 in __softirq_pending via or_softirq_pending(). Actual processing is deferred.',
    highlights: ['softirq-TIMER', 'softirq-SCHED'],
    data: cloneState(state),
  });

  // Frame 4: Update vruntime for current task
  state.srcRef = 'kernel/irq/handle.c:209 (still in action->handler context)';

  frames.push({
    step: 4,
    label: 'scheduler_tick() updates accounting',
    description: 'Still inside the timer action->handler() call at kernel/irq/handle.c:209, scheduler_tick() updates the current task vruntime (virtual runtime for CFS) and checks if the task exceeded its time slice. If so, set_tsk_need_resched() marks TIF_NEED_RESCHED for preemption on return.',
    highlights: ['stage-handler'],
    data: cloneState(state),
  });

  // Frame 5: irq_exit
  state.phase = 'irq-exit';
  state.srcRef = 'kernel/softirq.c:713 (__irq_exit_rcu) -> line 721-723 (preempt_count_sub + softirq check)';

  frames.push({
    step: 5,
    label: 'Top-half returns, irq_exit()',
    description: 'The timer top-half returns. irq_exit() at kernel/softirq.c:749 calls __irq_exit_rcu() at line 713 which decrements preempt_count (line 721) and checks local_softirq_pending() (line 722). TIMER and SCHED bits are set, and !in_interrupt() is true, so invoke_softirq() at line 487 calls __do_softirq() at line 496.',
    highlights: ['stage-irq-exit'],
    data: cloneState(state),
  });

  // Frame 6: Enter softirq, run TIMER
  state.phase = 'softirq';
  state.cpus[0].context = 'softirq';
  state.cpus[0].irqsDisabled = false;
  state.contextStack.push('softirq: TIMER');
  setSoftirqRunning(state, 'TIMER');
  state.srcRef = 'kernel/softirq.c:654 (__do_softirq) -> line 606 (local_irq_enable) -> line 610-622 (softirq loop)';

  frames.push({
    step: 6,
    label: '__do_softirq() runs TIMER_SOFTIRQ',
    description: '__do_softirq() at kernel/softirq.c:654 calls handle_softirqs(false) at line 579. After reading pending bits (line 596) and clearing them (line 604), it re-enables IRQs at line 606. The while loop at line 610 uses ffs(pending) to find TIMER bit first. h->action() at line 622 calls run_timer_softirq() to process expired timers.',
    highlights: ['stage-softirq', 'softirq-TIMER'],
    data: cloneState(state),
  });

  // Frame 7: Timer callbacks fire
  state.srcRef = 'kernel/softirq.c:622 (h->action executing run_timer_softirq)';

  frames.push({
    step: 7,
    label: 'Expired timer callbacks execute',
    description: 'run_timer_softirq() (invoked via h->action() at kernel/softirq.c:622) calls __run_timers() which iterates the timer wheel buckets. For each expired timer_list, it calls the timer function pointer. Examples: delayed_work_timer_fn() wakes a workqueue item, tcp_write_timer() retransmits TCP segments.',
    highlights: ['softirq-TIMER'],
    data: cloneState(state),
  });

  // Frame 8: TIMER done, run SCHED
  clearSoftirq(state, 'TIMER');
  state.contextStack.pop();
  state.contextStack.push('softirq: SCHED');
  setSoftirqRunning(state, 'SCHED');
  state.srcRef = 'kernel/softirq.c:610-631 (while loop advances to next set bit via ffs)';

  frames.push({
    step: 8,
    label: 'SCHED_SOFTIRQ: scheduler maintenance',
    description: 'The while loop at kernel/softirq.c:610 shifts pending >>= softirq_bit (line 631) and ffs() finds the SCHED bit next. h->action() at line 622 calls the SCHED softirq handler which runs trigger_load_balance() to check cross-CPU load balancing. This runs with IRQs enabled but not preemptible (softirq context).',
    highlights: ['stage-softirq', 'softirq-SCHED'],
    data: cloneState(state),
  });

  // Frame 9: Load balancing
  state.srcRef = 'kernel/softirq.c:622 (h->action executing SCHED softirq)';

  frames.push({
    step: 9,
    label: 'Load balancing across CPUs',
    description: 'run_rebalance_domains() (invoked via h->action() at kernel/softirq.c:622) checks if this CPU runqueue is imbalanced relative to others in the same scheduling domain. If so, it calls load_balance() to pull tasks from busier CPUs. Runs in softirq context -- IRQs enabled but not preemptible.',
    highlights: ['softirq-SCHED'],
    data: cloneState(state),
  });

  // Frame 10: Softirq completes
  clearSoftirq(state, 'SCHED');
  state.contextStack.pop();
  state.srcRef = 'kernel/softirq.c:637-645 (local_irq_disable, recheck pending, wakeup_softirqd)';

  frames.push({
    step: 10,
    label: 'Softirqs complete',
    description: 'Both softirqs are done. handle_softirqs() disables IRQs at kernel/softirq.c:637 and rechecks local_softirq_pending() at line 639. If new softirqs were raised during processing, it may restart (up to MAX_SOFTIRQ_RESTART=10 at line 544, or 2ms at line 543). Otherwise, wakeup_softirqd() at line 645 handles overflow.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 11: Check need_resched
  state.phase = 'complete';
  state.cpus[0].context = 'user';
  state.cpus[0].irqsDisabled = false;
  state.cpus[0].preemptCount = 0;
  state.irqLine.state = 'done';
  state.contextStack = ['user: bash'];
  state.srcRef = 'kernel/softirq.c:749 (irq_exit) -> arch/x86/kernel/irq.c:336 (return from common_interrupt)';

  frames.push({
    step: 11,
    label: 'Return path checks need_resched',
    description: 'irq_exit() at kernel/softirq.c:749 completes. Before returning to userspace from common_interrupt() at arch/x86/kernel/irq.c:336, the return-from-interrupt path checks TIF_NEED_RESCHED. If set (because scheduler_tick() decided the task exceeded its slice), the kernel calls schedule() for a context switch. This is preemptive multitasking.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: Workqueue deferred
// ---------------------------------------------------------------------------
function generateWorkqueueDeferred(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: InterruptState = {
    cpus: [
      { id: 0, context: 'user', currentTask: 'dd', irqsDisabled: false, preemptCount: 0 },
    ],
    irqLine: { number: 14, name: 'ata0', state: 'idle' },
    phase: 'idle',
    softirqs: defaultSoftirqs(),
    workqueue: [],
    pendingSoftirqBits: 0,
    contextStack: ['user: dd'],
    srcRef: '',
  };

  state.srcRef = 'kernel/irq/handle.c:24 (handle_arch_irq)';
  frames.push({
    step: 0,
    label: 'CPU running userspace I/O process',
    description: 'CPU 0 is running dd (disk copy). It submitted a block I/O request. The disk controller is connected to IRQ 14 (ATA/SATA primary). When I/O completes, the controller fires this IRQ, entering via handle_arch_irq (kernel/irq/handle.c:24) on architectures using the generic IRQ handler.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 1: Disk IRQ fires
  state.irqLine.state = 'firing';
  state.phase = 'hardirq-entry';
  state.cpus[0].context = 'hardirq';
  state.cpus[0].irqsDisabled = true;
  state.cpus[0].preemptCount = 1;
  state.contextStack.push('hardirq: IRQ 14');
  state.srcRef = 'arch/x86/kernel/irq.c:326 (common_interrupt) -> kernel/irq/chip.c:685 (handle_level_irq)';

  frames.push({
    step: 1,
    label: 'Disk I/O completion IRQ fires!',
    description: 'The disk controller asserts IRQ 14. CPU enters common_interrupt() at arch/x86/kernel/irq.c:326. For level-triggered IRQs (typical for legacy ATA), the flow handler is handle_level_irq() at kernel/irq/chip.c:685, which calls mask_ack_irq() at line 688 to mask and acknowledge, then handle_irq_event() at line 694. IRQs are disabled.',
    highlights: ['irq-line'],
    data: cloneState(state),
  });

  // Frame 2: Top-half runs
  state.irqLine.state = 'handling';
  state.phase = 'top-half';
  state.srcRef = 'kernel/irq/handle.c:255 (handle_irq_event) -> line 185 (__handle_irq_event_percpu) -> line 209 (action->handler)';

  frames.push({
    step: 2,
    label: 'Top-half: ata_bmdma_interrupt()',
    description: 'handle_irq_event() at kernel/irq/handle.c:255 clears IRQS_PENDING (line 259), sets IRQD_IRQ_INPROGRESS (line 260), releases desc->lock (line 261), then calls handle_irq_event_percpu() at line 263. __handle_irq_event_percpu() at line 185 iterates the action chain and calls action->handler() at line 209, invoking ata_bmdma_interrupt().',
    highlights: ['stage-handler'],
    data: cloneState(state),
  });

  // Frame 3: Cannot process in hardirq context
  state.srcRef = 'kernel/irq/handle.c:209 (still in action->handler -- hardirq context)';

  frames.push({
    step: 3,
    label: 'Why not process here?',
    description: 'We are inside action->handler() at kernel/irq/handle.c:209 in hardirq context. The completed I/O needs post-processing: update page cache, wake blocked processes, trigger filesystem journaling. These may need to SLEEP (take mutexes, allocate with GFP_KERNEL). But hardirq context cannot sleep -- the CPU has IRQs disabled and preempt_count > 0.',
    highlights: ['stage-handler'],
    data: cloneState(state),
  });

  // Frame 4: schedule_work
  state.workqueue.push({ name: 'blk_done_softirq', state: 'queued' });
  state.srcRef = 'kernel/irq/handle.c:209 (action->handler queues work before returning)';

  frames.push({
    step: 4,
    label: 'schedule_work() queues deferred processing',
    description: 'Still inside action->handler() at kernel/irq/handle.c:209, the ATA handler calls schedule_work() to queue the heavy processing on system_wq. The work_struct is added to a per-CPU worklist. A kworker thread will pick it up in PROCESS CONTEXT where it CAN sleep. The handler returns IRQ_HANDLED.',
    highlights: ['stage-handler'],
    data: cloneState(state),
  });

  // Frame 5: Handler returns
  state.phase = 'irq-exit';
  state.srcRef = 'kernel/irq/handle.c:248 (add_interrupt_randomness) -> kernel/softirq.c:713 (__irq_exit_rcu line 722)';

  frames.push({
    step: 5,
    label: 'Handler returns IRQ_HANDLED',
    description: 'The handler returns. handle_irq_event_percpu() at kernel/irq/handle.c:248 calls add_interrupt_randomness() for entropy. handle_level_irq() calls cond_unmask_irq() at kernel/irq/chip.c:696 to re-enable the IRQ line. irq_exit() -> __irq_exit_rcu() at kernel/softirq.c:713 checks local_softirq_pending() at line 722. No softirqs raised, so __do_softirq() is skipped.',
    highlights: ['stage-irq-exit'],
    data: cloneState(state),
  });

  // Frame 6: Return from interrupt
  state.cpus[0].context = 'user';
  state.cpus[0].irqsDisabled = false;
  state.cpus[0].preemptCount = 0;
  state.contextStack.pop();
  state.srcRef = 'arch/x86/kernel/irq.c:336 (common_interrupt returns)';

  frames.push({
    step: 6,
    label: 'Return from interrupt to userspace',
    description: 'common_interrupt() at arch/x86/kernel/irq.c:336 restores irq_regs and returns. The CPU returns to dd in userspace. The work_struct is still queued -- nothing has processed it yet. The kworker thread is now runnable and will be scheduled by CFS.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 7: kworker wakes
  state.phase = 'workqueue';
  state.cpus[0].context = 'kworker';
  state.cpus[0].currentTask = 'kworker/0:1';
  state.contextStack = ['kworker: blk_done_softirq'];
  state.srcRef = 'kernel/irq/handle.c:255 (original handle_irq_event set up the chain that queued work)';

  frames.push({
    step: 7,
    label: 'kworker thread scheduled',
    description: 'CFS schedules kworker/0:1. kworker threads are kernel threads managed by the workqueue subsystem. They call worker_thread() -> process_one_work() which dequeues work_structs and calls their func pointer. This runs in full PROCESS CONTEXT with a normal kernel stack.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 8: Work function runs
  state.workqueue[0].state = 'running';
  state.srcRef = 'kernel/irq/handle.c:209 (the action->handler queued this work; now executing in kworker)';

  frames.push({
    step: 8,
    label: 'Work function executes in process context',
    description: 'process_one_work() calls the work function. Now in PROCESS CONTEXT -- we can sleep. The function completes the bio, updates the page cache, wakes dd (which was blocked in read() -> io_schedule()). Unlike hardirq context (kernel/irq/handle.c:209) where the work was queued, here preempt_count is 0 and mutexes are allowed.',
    highlights: ['stage-workqueue'],
    data: cloneState(state),
  });

  // Frame 9: Work can sleep
  state.srcRef = 'kernel/irq/handle.c:185-240 (contrast: __handle_irq_event_percpu runs with IRQs off)';

  frames.push({
    step: 9,
    label: 'Work function allocates memory (can sleep!)',
    description: 'The work function calls kmalloc(GFP_KERNEL). GFP_KERNEL can sleep if memory is unavailable. This is IMPOSSIBLE in __handle_irq_event_percpu() at kernel/irq/handle.c:185 (hardirq context must use GFP_ATOMIC) or in __do_softirq() at kernel/softirq.c:654 (softirq context also cannot sleep). Workqueues exist for exactly this: deferred work needing process context.',
    highlights: ['stage-workqueue'],
    data: cloneState(state),
  });

  // Frame 10: dd wakes up
  state.workqueue[0].state = 'done';
  state.srcRef = 'kernel/softirq.c:654 vs kernel/irq/handle.c:185 (context comparison)';

  frames.push({
    step: 10,
    label: 'dd process woken up',
    description: 'The work function calls wake_up_process() on dd. dd moves from TASK_UNINTERRUPTIBLE to TASK_RUNNING on the CFS runqueue. Its read() syscall can now return data. The three execution contexts form a hierarchy: hardirq (kernel/irq/handle.c:185, IRQs off) -> softirq (kernel/softirq.c:654, IRQs on, no sleep) -> workqueue (process context, can sleep).',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 11: kworker goes idle
  state.phase = 'complete';
  state.cpus[0].context = 'user';
  state.cpus[0].currentTask = 'dd';
  state.irqLine.state = 'done';
  state.contextStack = ['user: dd'];
  state.srcRef = 'kernel/irq/handle.c:255 -> kernel/softirq.c:749 -> workqueue (full deferral chain)';

  frames.push({
    step: 11,
    label: 'I/O completion fully processed',
    description: 'kworker goes back to sleep. dd is scheduled and read() returns data. The full kernel path: IRQ entry at arch/x86/kernel/irq.c:326 -> handle_irq_event at kernel/irq/handle.c:255 (top-half, ~500ns, IRQs off) -> irq_exit at kernel/softirq.c:749 -> schedule_work -> kworker process_one_work (process context, can sleep). Three deferral levels, each with more capabilities but more latency.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const CONTEXT_COLORS: Record<string, string> = {
  user: '#3fb950',
  kernel: '#58a6ff',
  hardirq: '#f85149',
  softirq: '#d29922',
  kworker: '#bc8cff',
};

const FLOW_STAGES = [
  { id: 'irq-pin', label: 'IRQ Pin' },
  { id: 'idt', label: 'IDT' },
  { id: 'do-irq', label: 'do_IRQ' },
  { id: 'handler', label: 'Handler' },
  { id: 'irq-exit', label: 'irq_exit' },
  { id: 'softirq', label: 'softirq' },
  { id: 'workqueue', label: 'workqueue' },
];

function getActiveStageIndex(phase: string): number {
  switch (phase) {
    case 'idle': return -1;
    case 'hardirq-entry': return 1; // IDT
    case 'top-half': return 3; // Handler
    case 'irq-exit': return 4;
    case 'softirq': return 5;
    case 'workqueue': return 6;
    case 'complete': return -1;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as InterruptState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Interrupt Handling Flow';
  container.appendChild(title);

  // --- CPU Box (top area) ---
  const cpuTop = margin.top + 28;
  const cpuWidth = 180;
  const cpuHeight = 55;
  const cpuX = margin.left;

  data.cpus.forEach((cpu) => {
    const color = CONTEXT_COLORS[cpu.context] || '#30363d';

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(cpuX));
    rect.setAttribute('y', String(cpuTop));
    rect.setAttribute('width', String(cpuWidth));
    rect.setAttribute('height', String(cpuHeight));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', color);
    let cls = `anim-cpu anim-cpu-${cpu.context}`;
    if (frame.highlights.includes(`cpu-${cpu.id}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(cpuX + cpuWidth / 2));
    label.setAttribute('y', String(cpuTop + 18));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = `CPU ${cpu.id} [${cpu.context.toUpperCase()}]`;
    container.appendChild(label);

    const taskText = document.createElementNS(NS, 'text');
    taskText.setAttribute('x', String(cpuX + cpuWidth / 2));
    taskText.setAttribute('y', String(cpuTop + 34));
    taskText.setAttribute('text-anchor', 'middle');
    taskText.setAttribute('class', 'anim-cpu-task');
    taskText.textContent = cpu.currentTask;
    container.appendChild(taskText);

    const irqText = document.createElementNS(NS, 'text');
    irqText.setAttribute('x', String(cpuX + cpuWidth / 2));
    irqText.setAttribute('y', String(cpuTop + 50));
    irqText.setAttribute('text-anchor', 'middle');
    irqText.setAttribute('class', 'anim-cpu-state');
    irqText.textContent = cpu.irqsDisabled ? 'IRQs: DISABLED' : 'IRQs: enabled';
    container.appendChild(irqText);
  });

  // --- Flow diagram (center area) ---
  const flowTop = cpuTop + cpuHeight + 25;
  const stageCount = FLOW_STAGES.length;
  const stageWidth = Math.min(95, (usableWidth - (stageCount - 1) * 8) / stageCount);
  const stageHeight = 32;
  const activeIndex = getActiveStageIndex(data.phase);

  FLOW_STAGES.forEach((stage, i) => {
    const sx = margin.left + i * (stageWidth + 8);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(sx));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(stageWidth));
    rect.setAttribute('height', String(stageHeight));
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
    label.setAttribute('x', String(sx + stageWidth / 2));
    label.setAttribute('y', String(flowTop + stageHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = stage.label;
    container.appendChild(label);

    // Arrow between stages
    if (i < stageCount - 1) {
      const arrowX = sx + stageWidth;
      const arrowY = flowTop + stageHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 8));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      container.appendChild(line);
    }
  });

  // --- Softirq bitmask (right area) ---
  const softirqTop = margin.top + 28;
  const softirqLeft = width - margin.right - 200;
  const bitSize = 16;
  const bitGap = 3;

  const softirqTitle = document.createElementNS(NS, 'text');
  softirqTitle.setAttribute('x', String(softirqLeft));
  softirqTitle.setAttribute('y', String(softirqTop));
  softirqTitle.setAttribute('class', 'anim-cpu-label');
  softirqTitle.textContent = '__softirq_pending';
  container.appendChild(softirqTitle);

  data.softirqs.forEach((entry, i) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const bx = softirqLeft + col * (bitSize + bitGap + 20);
    const by = softirqTop + 8 + row * (bitSize + bitGap + 12);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(bx));
    rect.setAttribute('y', String(by));
    rect.setAttribute('width', String(bitSize));
    rect.setAttribute('height', String(bitSize));
    rect.setAttribute('rx', '2');
    let bitClass = 'anim-softirq-bit';
    if (entry.running) {
      bitClass += ' anim-highlight';
      rect.setAttribute('fill', '#d29922');
    } else if (entry.pending) {
      rect.setAttribute('fill', '#f0883e');
    } else {
      rect.setAttribute('fill', '#21262d');
    }
    rect.setAttribute('class', bitClass);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(bx + bitSize + 2));
    label.setAttribute('y', String(by + bitSize - 3));
    label.setAttribute('font-size', '8');
    label.setAttribute('fill', '#8b949e');
    label.textContent = entry.name;
    container.appendChild(label);
  });

  // --- Context stack (bottom area) ---
  const stackTop = flowTop + stageHeight + 30;
  const stackLabel = document.createElementNS(NS, 'text');
  stackLabel.setAttribute('x', String(margin.left));
  stackLabel.setAttribute('y', String(stackTop));
  stackLabel.setAttribute('class', 'anim-cpu-label');
  stackLabel.textContent = 'Context Stack:';
  container.appendChild(stackLabel);

  const stackEntryHeight = 24;
  const stackEntryWidth = 160;

  data.contextStack.forEach((entry, i) => {
    const sy = stackTop + 8 + i * (stackEntryHeight + 3);
    const sx = margin.left + i * 12; // indent for visual nesting

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(sx));
    rect.setAttribute('y', String(sy));
    rect.setAttribute('width', String(stackEntryWidth));
    rect.setAttribute('height', String(stackEntryHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('class', 'anim-stack-entry');

    // Color based on context type
    const contextType = entry.split(':')[0].trim();
    const color = CONTEXT_COLORS[contextType] || '#30363d';
    rect.setAttribute('fill', color);
    rect.setAttribute('opacity', '0.7');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(sx + 8));
    text.setAttribute('y', String(sy + stackEntryHeight / 2 + 4));
    text.setAttribute('class', 'anim-stack-entry');
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '11');
    text.textContent = entry;
    container.appendChild(text);
  });

  // --- Workqueue items (below context stack if present) ---
  if (data.workqueue.length > 0) {
    const wqTop = stackTop + 8 + data.contextStack.length * (stackEntryHeight + 3) + 15;
    const wqLabel = document.createElementNS(NS, 'text');
    wqLabel.setAttribute('x', String(margin.left));
    wqLabel.setAttribute('y', String(wqTop));
    wqLabel.setAttribute('class', 'anim-cpu-label');
    wqLabel.textContent = 'Workqueue:';
    container.appendChild(wqLabel);

    data.workqueue.forEach((item, i) => {
      const wy = wqTop + 8 + i * 22;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(margin.left));
      rect.setAttribute('y', String(wy));
      rect.setAttribute('width', '150');
      rect.setAttribute('height', '18');
      rect.setAttribute('rx', '3');
      const wqColor = item.state === 'running' ? '#bc8cff' : item.state === 'done' ? '#3fb950' : '#484f58';
      rect.setAttribute('fill', wqColor);
      rect.setAttribute('class', 'anim-block');
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(margin.left + 8));
      text.setAttribute('y', String(wy + 13));
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '10');
      text.textContent = `${item.name} [${item.state}]`;
      container.appendChild(text);
    });
  }

  // --- IRQ line indicator ---
  if (data.irqLine.state !== 'idle' && data.irqLine.state !== 'done') {
    const irqIndicator = document.createElementNS(NS, 'text');
    irqIndicator.setAttribute('x', String(width / 2));
    irqIndicator.setAttribute('y', String(flowTop - 8));
    irqIndicator.setAttribute('text-anchor', 'middle');
    irqIndicator.setAttribute('class', 'anim-highlight');
    irqIndicator.setAttribute('fill', '#f85149');
    irqIndicator.setAttribute('font-size', '11');
    irqIndicator.textContent = `IRQ ${data.irqLine.number} (${data.irqLine.name}) -- ${data.irqLine.state.toUpperCase()}`;
    container.appendChild(irqIndicator);
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'network-irq', label: 'Network IRQ (NAPI + softirq)' },
  { id: 'timer-softirq', label: 'Timer Interrupt (TIMER + SCHED softirq)' },
  { id: 'workqueue-deferred', label: 'Disk I/O Completion (workqueue)' },
];

const interruptFlow: AnimationModule = {
  config: {
    id: 'interrupt-flow',
    title: 'Interrupt Handling Flow',
    skillName: 'interrupt-handling',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'timer-softirq': return generateTimerSoftirq();
      case 'workqueue-deferred': return generateWorkqueueDeferred();
      case 'network-irq':
      default: return generateNetworkIrq();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default interruptFlow;
