import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export interface FtraceCallSite {
  id: string;
  funcName: string;
  /** 'nop' = mcount/nop placeholder, 'call' = patched to call trampoline */
  state: 'nop' | 'call';
  address: string;
}

export interface RingBufferPage {
  id: string;
  cpuId: number;
  state: 'empty' | 'writing' | 'committed' | 'reading';
}

export interface RingBufferEntry {
  id: string;
  label: string;
  state: 'reserved' | 'committed' | 'read';
}

export interface RingBufferState {
  pages: RingBufferPage[];
  entries: RingBufferEntry[];
  writePtr: number;
  commitPtr: number;
  readPtr: number;
}

export interface KprobeState {
  state: 'none' | 'registered' | 'prepared' | 'armed' | 'firing' | 'single-step' | 'complete';
  targetFunc: string;
  targetAddr: string;
  originalInsn: string;
  breakpointInsn: string;
}

export interface FtraceKprobeState {
  callSites: FtraceCallSite[];
  ringBuffer: RingBufferState;
  kprobe: KprobeState;
  phase: string;
  srcRef: string;
}

function cloneState(s: FtraceKprobeState): FtraceKprobeState {
  return {
    callSites: s.callSites.map(c => ({ ...c })),
    ringBuffer: {
      pages: s.ringBuffer.pages.map(p => ({ ...p })),
      entries: s.ringBuffer.entries.map(e => ({ ...e })),
      writePtr: s.ringBuffer.writePtr,
      commitPtr: s.ringBuffer.commitPtr,
      readPtr: s.ringBuffer.readPtr,
    },
    kprobe: { ...s.kprobe },
    phase: s.phase,
    srcRef: s.srcRef,
  };
}

function makeDefaultCallSites(): FtraceCallSite[] {
  return [
    { id: 'site-0', funcName: 'do_sys_open', state: 'nop', address: '0xffffffff812a0100' },
    { id: 'site-1', funcName: 'vfs_read', state: 'nop', address: '0xffffffff81290200' },
    { id: 'site-2', funcName: 'schedule', state: 'nop', address: '0xffffffff81c01300' },
    { id: 'site-3', funcName: 'sys_write', state: 'nop', address: '0xffffffff81290400' },
  ];
}

function makeDefaultRingBuffer(): RingBufferState {
  return {
    pages: [
      { id: 'page-0', cpuId: 0, state: 'empty' },
      { id: 'page-1', cpuId: 0, state: 'empty' },
      { id: 'page-2', cpuId: 0, state: 'empty' },
      { id: 'page-3', cpuId: 0, state: 'empty' },
    ],
    entries: [],
    writePtr: 0,
    commitPtr: 0,
    readPtr: 0,
  };
}

function makeDefaultKprobe(): KprobeState {
  return {
    state: 'none',
    targetFunc: '',
    targetAddr: '',
    originalInsn: '',
    breakpointInsn: '',
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: ftrace-function-tracing
// register_ftrace_function() -> ftrace_startup() -> ftrace_run_update_code()
// -> ftrace_replace_code() patches NOP -> CALL. Trampoline fires, records
// entry via ring_buffer_write().
// ---------------------------------------------------------------------------
function generateFtraceFunctionTracing(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: FtraceKprobeState = {
    callSites: makeDefaultCallSites(),
    ringBuffer: makeDefaultRingBuffer(),
    kprobe: makeDefaultKprobe(),
    phase: 'idle',
    srcRef: '',
  };

  // Frame 0: initial state -- compiled kernel with mcount/NOP sites
  state.srcRef = 'kernel/trace/ftrace.c:2766 ftrace_replace_code(); NOP call sites at function prologues';
  frames.push({
    step: 0,
    label: 'Kernel compiled with CONFIG_FTRACE -- NOP call sites at every function',
    description: 'When CONFIG_FTRACE is enabled, GCC inserts mcount/fentry calls at every function prologue. At boot, ftrace_init() converts these to NOPs via ftrace_replace_code() (ftrace.c:2766). Each call site is recorded as a struct dyn_ftrace in the ftrace_pages list. The kernel runs at full speed because all sites are NOPs -- zero tracing overhead until explicitly enabled.',
    highlights: ['site-0', 'site-1', 'site-2', 'site-3'],
    data: cloneState(state),
  });

  // Frame 1: register_ftrace_function() called
  state.phase = 'registering';
  state.srcRef = 'kernel/trace/ftrace.c:9180 register_ftrace_function()';
  frames.push({
    step: 1,
    label: 'User enables tracing -- register_ftrace_function()',
    description: 'A tracer (e.g., function tracer via /sys/kernel/tracing/current_tracer) calls register_ftrace_function() (ftrace.c:9180). This takes ftrace_lock and calls ftrace_startup() (ftrace.c:3091). The ftrace_ops structure holds the callback function pointer and filter hashes that determine which functions to trace.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 2: ftrace_startup() registers the ops
  state.phase = 'startup';
  state.srcRef = 'kernel/trace/ftrace.c:3091 ftrace_startup(); ftrace.c:330 __register_ftrace_function()';
  frames.push({
    step: 2,
    label: 'ftrace_startup() -- register ops and update records',
    description: 'ftrace_startup() (ftrace.c:3091) calls __register_ftrace_function() (ftrace.c:330) which adds the ftrace_ops to ftrace_ops_list, saves the callback function, updates the trampoline via ftrace_update_trampoline(), and calls update_ftrace_function(). Then ftrace_hash_rec_enable() marks matching dyn_ftrace records for update, setting FTRACE_UPDATE_CALLS in the command flags.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: ftrace_startup_enable -> ftrace_run_update_code
  state.phase = 'patching';
  state.srcRef = 'kernel/trace/ftrace.c:3071 ftrace_startup_enable(); ftrace.c:2992 ftrace_run_update_code()';
  frames.push({
    step: 3,
    label: 'ftrace_startup_enable() -> ftrace_run_update_code()',
    description: 'ftrace_startup_enable() (ftrace.c:3071) calls ftrace_run_update_code() (ftrace.c:2992) which invokes arch_ftrace_update_code(). On x86, this uses text_poke_bp() or stop_machine() to safely modify live kernel text. ftrace_arch_code_modify_prepare() disables page write protection on kernel text pages before patching.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 4: ftrace_replace_code patches NOP -> CALL
  state.callSites.forEach(s => { s.state = 'call'; });
  state.srcRef = 'kernel/trace/ftrace.c:2766 ftrace_replace_code(); ftrace.c:2731 __ftrace_replace_code()';
  frames.push({
    step: 4,
    label: 'ftrace_replace_code() -- NOP sites patched to CALL trampoline',
    description: 'ftrace_replace_code() (ftrace.c:2766) iterates all dyn_ftrace records via do_for_each_ftrace_rec(). For each enabled record, __ftrace_replace_code() (ftrace.c:2731) calls ftrace_update_record() which returns FTRACE_UPDATE_MAKE_CALL. This triggers ftrace_make_call() (ftrace.c:2752) which replaces the 5-byte NOP with a CALL instruction targeting the ftrace trampoline. All four function sites are now live.',
    highlights: ['site-0', 'site-1', 'site-2', 'site-3'],
    data: cloneState(state),
  });

  // Frame 5: function called, trampoline fires
  state.phase = 'tracing';
  state.ringBuffer.pages[0].state = 'writing';
  state.ringBuffer.entries.push({ id: 'entry-0', label: 'do_sys_open [CPU 0]', state: 'reserved' });
  state.ringBuffer.writePtr = 1;
  state.srcRef = 'kernel/trace/ring_buffer.c:4846 ring_buffer_write(); ring_buffer.c:4606 rb_reserve_next_event()';
  frames.push({
    step: 5,
    label: 'do_sys_open() called -- trampoline fires, ring_buffer_write()',
    description: 'When do_sys_open() is called, the patched CALL instruction jumps to the ftrace trampoline. The trampoline saves registers, calls the registered ftrace_ops callback which invokes ring_buffer_write() (ring_buffer.c:4846). Inside, rb_reserve_next_event() (ring_buffer.c:4606) reserves space on the per-CPU ring buffer page by calling rb_start_commit() and calculating event length via rb_calculate_event_length().',
    highlights: ['site-0', 'page-0'],
    data: cloneState(state),
  });

  // Frame 6: rb_commit() completes the write
  state.ringBuffer.entries[0].state = 'committed';
  state.ringBuffer.pages[0].state = 'committed';
  state.ringBuffer.commitPtr = 1;
  state.srcRef = 'kernel/trace/ring_buffer.c:4016 rb_commit(); ring_buffer.c:4885 (within ring_buffer_write)';
  frames.push({
    step: 6,
    label: 'rb_commit() -- trace entry committed to ring buffer',
    description: 'After memcpy() copies the trace data into the reserved event slot, rb_commit() (ring_buffer.c:4016) increments cpu_buffer->entries and calls rb_end_commit() to advance the commit pointer. The entry is now visible to consumers. rb_wakeups() (ring_buffer.c:4039) triggers irq_work to wake any waiters (e.g., trace_pipe readers). The trampoline restores registers and returns to do_sys_open().',
    highlights: ['page-0', 'entry-0'],
    data: cloneState(state),
  });

  // Frame 7: more functions traced
  state.ringBuffer.entries.push({ id: 'entry-1', label: 'vfs_read [CPU 0]', state: 'committed' });
  state.ringBuffer.entries.push({ id: 'entry-2', label: 'schedule [CPU 1]', state: 'committed' });
  state.ringBuffer.pages[1].state = 'committed';
  state.ringBuffer.writePtr = 3;
  state.ringBuffer.commitPtr = 3;
  state.srcRef = 'kernel/trace/ring_buffer.c:4846 ring_buffer_write(); ftrace.c:2752 ftrace_make_call()';
  frames.push({
    step: 7,
    label: 'Multiple functions traced -- ring buffer accumulates entries',
    description: 'As vfs_read() and schedule() execute, each patched CALL site fires the trampoline, recording entries via ring_buffer_write() (ring_buffer.c:4846). Each per-CPU ring buffer operates independently -- no cross-CPU locking needed. The write pointer advances through the circular page list. When a page fills, the writer moves to the next page. The ftrace_make_call() (ftrace.c:2752) patching ensures only selected functions incur tracing overhead.',
    highlights: ['site-1', 'site-2', 'entry-1', 'entry-2'],
    data: cloneState(state),
  });

  // Frame 8: reading trace data
  state.phase = 'reading';
  state.ringBuffer.entries[0].state = 'read';
  state.ringBuffer.pages[0].state = 'reading';
  state.ringBuffer.readPtr = 1;
  state.srcRef = 'kernel/trace/ring_buffer.c:5996 ring_buffer_read_start(); ring_buffer.c:6623 ring_buffer_read_page()';
  frames.push({
    step: 8,
    label: 'Consumer reads trace -- ring_buffer_read_start()',
    description: 'A consumer (cat /sys/kernel/tracing/trace_pipe) calls ring_buffer_read_start() (ring_buffer.c:5996) which creates an iterator, acquires the reader_lock, and calls rb_iter_reset(). The iterator reads committed entries sequentially. ring_buffer_read_page() (ring_buffer.c:6623) can swap entire pages for zero-copy reading. The read pointer advances independently of the write pointer, allowing concurrent tracing and reading.',
    highlights: ['page-0', 'entry-0'],
    data: cloneState(state),
  });

  // Frame 9: summary
  state.phase = 'complete';
  state.srcRef = 'kernel/trace/ftrace.c (full function tracing path)';
  frames.push({
    step: 9,
    label: 'Ftrace function tracing summary',
    description: 'The full path: register_ftrace_function() (ftrace.c:9180) -> ftrace_startup() (ftrace.c:3091) -> __register_ftrace_function() (ftrace.c:330) adds ops to list -> ftrace_startup_enable() (ftrace.c:3071) -> ftrace_run_update_code() (ftrace.c:2992) -> ftrace_replace_code() (ftrace.c:2766) -> __ftrace_replace_code() (ftrace.c:2731) patches NOP to CALL via ftrace_make_call() (ftrace.c:2752). On function call, trampoline records via ring_buffer_write() (ring_buffer.c:4846) -> rb_reserve_next_event() (ring_buffer.c:4606) -> rb_commit() (ring_buffer.c:4016).',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 2: kprobe-insertion
// register_kprobe() -> __register_kprobe() -> prepare_kprobe() -> arm_kprobe()
// patches INT3. On hit: kprobe_int3_handler() -> pre_handler -> single-step
// -> post_handler.
// ---------------------------------------------------------------------------
function generateKprobeInsertion(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: FtraceKprobeState = {
    callSites: makeDefaultCallSites(),
    ringBuffer: makeDefaultRingBuffer(),
    kprobe: {
      state: 'none',
      targetFunc: 'do_sys_open',
      targetAddr: '0xffffffff812a0100',
      originalInsn: 'push %rbp  (0x55)',
      breakpointInsn: 'int3  (0xcc)',
    },
    phase: 'idle',
    srcRef: '',
  };

  // Frame 0: initial state
  state.srcRef = 'kernel/kprobes.c:1708 register_kprobe()';
  frames.push({
    step: 0,
    label: 'Target function do_sys_open() -- normal execution',
    description: 'The target function do_sys_open() has its original instruction (push %rbp) at the entry point. A user wants to attach a kprobe to instrument this function. register_kprobe() (kprobes.c:1708) will be called with a kprobe struct containing the target address, pre_handler callback, and optional post_handler callback.',
    highlights: ['site-0'],
    data: cloneState(state),
  });

  // Frame 1: register_kprobe() canonicalizes address
  state.kprobe.state = 'registered';
  state.phase = 'registering';
  state.srcRef = 'kernel/kprobes.c:1708 register_kprobe(); kprobes.c:1716 _kprobe_addr()';
  frames.push({
    step: 1,
    label: 'register_kprobe() -- canonicalize address via _kprobe_addr()',
    description: 'register_kprobe() (kprobes.c:1708) first canonicalizes the probe address via _kprobe_addr() (kprobes.c:1716) which resolves symbol_name + offset to a kernel virtual address. It calls warn_kprobe_rereg() to detect duplicate registrations, sets flags (KPROBE_FLAG_ON_FUNC_ENTRY if at function entry), and calls check_kprobe_address_safe() (kprobes.c:1732) to verify the address is safe to probe.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 2: __register_kprobe() and prepare_kprobe()
  state.kprobe.state = 'prepared';
  state.phase = 'preparing';
  state.srcRef = 'kernel/kprobes.c:1671 __register_kprobe(); kprobes.c:1225 prepare_kprobe()';
  frames.push({
    step: 2,
    label: '__register_kprobe() -> prepare_kprobe() saves original instruction',
    description: '__register_kprobe() (kprobes.c:1671) acquires kprobe_mutex, then calls prepare_kprobe() (kprobes.c:1225) under text_mutex. prepare_kprobe() calls arch_prepare_kprobe() which copies the original instruction (push %rbp, 0x55) from the target address into kprobe->ainsn.insn for later single-stepping. The saved copy allows the original instruction to execute during single-step without the breakpoint.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: arm_kprobe() patches INT3
  state.kprobe.state = 'armed';
  state.phase = 'armed';
  state.srcRef = 'kernel/kprobes.c:1234 arm_kprobe(); kprobes.c:1039 __arm_kprobe(); kprobes.c:1051 arch_arm_kprobe()';
  frames.push({
    step: 3,
    label: 'arm_kprobe() -- patches INT3 breakpoint at target address',
    description: 'arm_kprobe() (kprobes.c:1234) acquires cpus_read_lock and text_mutex, then calls __arm_kprobe() (kprobes.c:1039). __arm_kprobe() checks for overlapping optimized kprobes, then calls arch_arm_kprobe() (kprobes.c:1051) which uses text_poke() to atomically replace the first byte of do_sys_open() with INT3 (0xcc). The original byte (0x55, push %rbp) was saved by prepare_kprobe(). The function is now probed.',
    highlights: ['site-0'],
    data: cloneState(state),
  });

  // Frame 4: hlist insertion and optimization attempt
  state.srcRef = 'kernel/kprobes.c:1691 hlist_add_head_rcu(); kprobes.c:1704 try_to_optimize_kprobe()';
  frames.push({
    step: 4,
    label: 'Kprobe added to hash table, optimization attempted',
    description: '__register_kprobe() (kprobes.c:1671) inserts the kprobe into kprobe_table[] via hlist_add_head_rcu() (kprobes.c:1691), hashing by the probe address. Then try_to_optimize_kprobe() (kprobes.c:1704) attempts to convert the INT3 breakpoint to a JMP instruction for lower overhead. Optimized kprobes use opt_pre_handler() (kprobes.c:426) which iterates the probe list calling each pre_handler.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 5: target function called, INT3 fires
  state.kprobe.state = 'firing';
  state.phase = 'firing';
  state.srcRef = 'arch/x86/kernel/kprobes/core.c:978 kprobe_int3_handler(); arch/x86/kernel/traps.c:983';
  frames.push({
    step: 5,
    label: 'do_sys_open() called -- INT3 fires, kprobe_int3_handler()',
    description: 'When do_sys_open() is called, the CPU executes INT3 (0xcc) at the entry point, generating a #BP trap. The trap handler in traps.c:983 calls kprobe_int3_handler() (arch/x86/kernel/kprobes/core.c:978). This handler looks up the kprobe from kprobe_table[] using the faulting address, sets current_kprobe, saves pt_regs, and calls the user-registered pre_handler callback with the kprobe and regs.',
    highlights: ['site-0'],
    data: cloneState(state),
  });

  // Frame 6: pre_handler executes, then single-step
  state.kprobe.state = 'single-step';
  state.phase = 'single-step';
  state.srcRef = 'arch/x86/kernel/kprobes/core.c:978 kprobe_int3_handler(); single-step via saved insn copy';
  frames.push({
    step: 6,
    label: 'pre_handler() executes, then single-step original instruction',
    description: 'After pre_handler() returns, the kprobe handler sets up single-stepping of the original instruction (push %rbp) from the saved copy in kprobe->ainsn.insn. On x86, this uses the TF (trap flag) in EFLAGS to generate a #DB after executing exactly one instruction. The single-step executes the saved copy of the original instruction, not the INT3-patched location, so the function prologue completes correctly.',
    highlights: ['site-0'],
    data: cloneState(state),
  });

  // Frame 7: post_handler and resume
  state.kprobe.state = 'complete';
  state.phase = 'complete';
  state.srcRef = 'arch/x86/kernel/kprobes/core.c:978 kprobe_int3_handler(); post_handler callback';
  frames.push({
    step: 7,
    label: 'post_handler() executes, execution resumes at next instruction',
    description: 'After the single-step #DB trap, the kprobe post_handler() callback is invoked (if registered). The handler can inspect the modified register state after the original instruction executed. Then kprobe restores the saved pt_regs, clears TF, resets current_kprobe, and returns. Execution resumes at the instruction after the probed site. The INT3 remains in place for the next invocation.',
    highlights: ['site-0'],
    data: cloneState(state),
  });

  // Frame 8: summary
  state.srcRef = 'kernel/kprobes.c (full kprobe lifecycle)';
  frames.push({
    step: 8,
    label: 'Kprobe lifecycle summary',
    description: 'The full path: register_kprobe() (kprobes.c:1708) -> _kprobe_addr() (kprobes.c:1716) resolves address -> __register_kprobe() (kprobes.c:1671) -> prepare_kprobe() (kprobes.c:1225) saves original instruction via arch_prepare_kprobe() -> arm_kprobe() (kprobes.c:1234) -> __arm_kprobe() (kprobes.c:1039) -> arch_arm_kprobe() (kprobes.c:1051) patches INT3. On hit: kprobe_int3_handler() (arch/x86/kernel/kprobes/core.c:978) -> pre_handler() -> single-step original insn -> post_handler() -> resume.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 3: ftrace-ring-buffer
// Detailed ring buffer operation: ring_buffer_write() ->
// rb_reserve_next_event() -> write -> rb_commit(). ring_buffer_read_start()
// consumes. Shows per-CPU pages, write/read/commit pointers.
// ---------------------------------------------------------------------------
function generateFtraceRingBuffer(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: FtraceKprobeState = {
    callSites: [],
    ringBuffer: {
      pages: [
        { id: 'page-0', cpuId: 0, state: 'empty' },
        { id: 'page-1', cpuId: 0, state: 'empty' },
        { id: 'page-2', cpuId: 0, state: 'empty' },
        { id: 'page-3', cpuId: 0, state: 'empty' },
        { id: 'page-4', cpuId: 1, state: 'empty' },
        { id: 'page-5', cpuId: 1, state: 'empty' },
        { id: 'page-6', cpuId: 1, state: 'empty' },
        { id: 'page-7', cpuId: 1, state: 'empty' },
      ],
      entries: [],
      writePtr: 0,
      commitPtr: 0,
      readPtr: 0,
    },
    kprobe: makeDefaultKprobe(),
    phase: 'idle',
    srcRef: '',
  };

  // Frame 0: ring buffer structure overview
  state.srcRef = 'kernel/trace/ring_buffer.c:4846 ring_buffer_write(); struct trace_buffer, ring_buffer_per_cpu';
  frames.push({
    step: 0,
    label: 'Per-CPU ring buffer structure -- 2 CPUs, 4 pages each',
    description: 'The ftrace ring buffer is organized as per-CPU circular buffers. Each CPU has a ring_buffer_per_cpu (ring_buffer.c) with a linked list of buffer pages (struct buffer_page). Each page holds a sub-buffer of trace events. Three pointers track state: write (where new events go), commit (last safely readable position), and read (consumer position). ring_buffer_write() (ring_buffer.c:4846) is the main write entry point.',
    highlights: ['page-0', 'page-1', 'page-2', 'page-3', 'page-4', 'page-5', 'page-6', 'page-7'],
    data: cloneState(state),
  });

  // Frame 1: ring_buffer_write() called on CPU 0
  state.phase = 'writing';
  state.srcRef = 'kernel/trace/ring_buffer.c:4846 ring_buffer_write(); ring_buffer.c:4856 guard(preempt_notrace)';
  frames.push({
    step: 1,
    label: 'ring_buffer_write() called on CPU 0',
    description: 'ring_buffer_write() (ring_buffer.c:4846) begins by disabling preemption via guard(preempt_notrace) (ring_buffer.c:4856). It reads raw_smp_processor_id() to select the correct per-CPU buffer (ring_buffer.c:4861), checks record_disabled flags, and verifies the data length fits within max_data_size (ring_buffer.c:4871). Then trace_recursive_lock() prevents reentrant tracing.',
    highlights: ['page-0'],
    data: cloneState(state),
  });

  // Frame 2: rb_reserve_next_event() reserves space
  state.ringBuffer.pages[0].state = 'writing';
  state.ringBuffer.entries.push({ id: 'entry-0', label: 'ftrace_entry [CPU 0]', state: 'reserved' });
  state.ringBuffer.writePtr = 1;
  state.srcRef = 'kernel/trace/ring_buffer.c:4606 rb_reserve_next_event(); ring_buffer.c:4626 rb_start_commit()';
  frames.push({
    step: 2,
    label: 'rb_reserve_next_event() -- reserve space on current page',
    description: 'rb_reserve_next_event() (ring_buffer.c:4606) calls rb_start_commit() (ring_buffer.c:4626) which increments cpu_buffer->committing to mark an active writer. It calculates event length via rb_calculate_event_length() (ring_buffer.c:4644), checks if the current page has enough space, and if so, advances the write pointer atomically. The reserved slot is returned as a ring_buffer_event pointer. The write pointer now leads the commit pointer.',
    highlights: ['page-0', 'entry-0'],
    data: cloneState(state),
  });

  // Frame 3: memcpy trace data, rb_commit()
  state.ringBuffer.entries[0].state = 'committed';
  state.ringBuffer.pages[0].state = 'committed';
  state.ringBuffer.commitPtr = 1;
  state.srcRef = 'kernel/trace/ring_buffer.c:4883 memcpy(); ring_buffer.c:4016 rb_commit()';
  frames.push({
    step: 3,
    label: 'memcpy() data, rb_commit() -- entry committed',
    description: 'ring_buffer_write() copies the trace data into the reserved event slot via memcpy() (ring_buffer.c:4883). Then rb_commit() (ring_buffer.c:4016) increments cpu_buffer->entries and calls rb_end_commit() to advance the commit pointer to match the write pointer. The entry is now visible to readers. rb_wakeups() (ring_buffer.c:4039) signals any waiting consumers via irq_work.',
    highlights: ['page-0', 'entry-0'],
    data: cloneState(state),
  });

  // Frame 4: second write, same CPU
  state.ringBuffer.entries.push({ id: 'entry-1', label: 'ftrace_entry [CPU 0]', state: 'committed' });
  state.ringBuffer.writePtr = 2;
  state.ringBuffer.commitPtr = 2;
  state.srcRef = 'kernel/trace/ring_buffer.c:4846 ring_buffer_write(); ring_buffer.c:4606 rb_reserve_next_event()';
  frames.push({
    step: 4,
    label: 'Second write on CPU 0 -- write and commit pointers advance',
    description: 'Another function call triggers ring_buffer_write() (ring_buffer.c:4846) on CPU 0. rb_reserve_next_event() (ring_buffer.c:4606) reserves the next slot on the same page. Both write and commit pointers advance to position 2. Multiple events can fit in a single page. When the page fills, the writer moves to the next page in the circular list.',
    highlights: ['page-0', 'entry-1'],
    data: cloneState(state),
  });

  // Frame 5: write on CPU 1 (independent)
  state.ringBuffer.pages[4].state = 'committed';
  state.ringBuffer.entries.push({ id: 'entry-2', label: 'ftrace_entry [CPU 1]', state: 'committed' });
  state.srcRef = 'kernel/trace/ring_buffer.c:4861 raw_smp_processor_id(); per-CPU independence';
  frames.push({
    step: 5,
    label: 'Write on CPU 1 -- completely independent, no locking',
    description: 'CPU 1 writes its own trace entry. ring_buffer_write() (ring_buffer.c:4846) uses raw_smp_processor_id() (ring_buffer.c:4861) to select cpu_buffer = buffer->buffers[cpu]. Each per-CPU buffer has its own write/commit/read pointers, its own page list, and its own committing counter. No spinlocks or atomic operations are shared between CPUs. This lock-free per-CPU design is critical for tracing performance.',
    highlights: ['page-4', 'entry-2'],
    data: cloneState(state),
  });

  // Frame 6: page fills, advance to next page
  state.ringBuffer.pages[0].state = 'committed';
  state.ringBuffer.pages[1].state = 'writing';
  state.ringBuffer.entries.push({ id: 'entry-3', label: 'ftrace_entry [CPU 0]', state: 'committed' });
  state.ringBuffer.pages[1].state = 'committed';
  state.ringBuffer.writePtr = 4;
  state.ringBuffer.commitPtr = 4;
  state.srcRef = 'kernel/trace/ring_buffer.c:4606 rb_reserve_next_event(); rb_move_tail() advances to next page';
  frames.push({
    step: 6,
    label: 'Page 0 full -- writer advances to page 1',
    description: 'When rb_reserve_next_event() (ring_buffer.c:4606) detects the current page cannot hold the new event, it calls rb_move_tail() to advance the tail page pointer to the next page in the circular list. If the next page is the reader page (head page), the oldest data is overwritten (ring buffer overflow). The new entry lands on page 1. The circular nature means the buffer never grows -- old data is silently dropped when full.',
    highlights: ['page-0', 'page-1', 'entry-3'],
    data: cloneState(state),
  });

  // Frame 7: ring_buffer_read_start() creates iterator
  state.phase = 'reading';
  state.ringBuffer.readPtr = 1;
  state.ringBuffer.entries[0].state = 'read';
  state.ringBuffer.pages[0].state = 'reading';
  state.srcRef = 'kernel/trace/ring_buffer.c:5996 ring_buffer_read_start(); ring_buffer.c:6024 rb_iter_reset()';
  frames.push({
    step: 7,
    label: 'ring_buffer_read_start() -- consumer creates iterator',
    description: 'A consumer calls ring_buffer_read_start() (ring_buffer.c:5996) which allocates a ring_buffer_iter, selects the per-CPU buffer, increments resize_disabled to prevent buffer resizing, acquires reader_lock (ring_buffer.c:6022), and calls rb_iter_reset() (ring_buffer.c:6024) to position the iterator at the oldest committed entry. The read pointer begins consuming entries from the commit pointer backwards.',
    highlights: ['page-0', 'entry-0'],
    data: cloneState(state),
  });

  // Frame 8: ring_buffer_read_page() for zero-copy
  state.ringBuffer.entries[1].state = 'read';
  state.ringBuffer.readPtr = 2;
  state.srcRef = 'kernel/trace/ring_buffer.c:6623 ring_buffer_read_page(); splice-based zero-copy read';
  frames.push({
    step: 8,
    label: 'ring_buffer_read_page() -- zero-copy page swap',
    description: 'For high-throughput reading, ring_buffer_read_page() (ring_buffer.c:6623) swaps an entire page out of the ring buffer, replacing it with an empty page. This avoids per-event copying. The splice() system call on trace_pipe uses this for zero-copy transfer to userspace. The read pointer advances past the swapped page. This is how tools like trace-cmd achieve low-overhead trace collection.',
    highlights: ['page-0', 'entry-0', 'entry-1'],
    data: cloneState(state),
  });

  // Frame 9: summary
  state.phase = 'complete';
  state.srcRef = 'kernel/trace/ring_buffer.c (full ring buffer path)';
  frames.push({
    step: 9,
    label: 'Ring buffer operation summary',
    description: 'The full write path: ring_buffer_write() (ring_buffer.c:4846) -> preempt_disable -> select per-CPU buffer (ring_buffer.c:4861) -> rb_reserve_next_event() (ring_buffer.c:4606) -> rb_start_commit() -> reserve slot -> memcpy data (ring_buffer.c:4883) -> rb_commit() (ring_buffer.c:4016) -> rb_wakeups(). The read path: ring_buffer_read_start() (ring_buffer.c:5996) -> rb_iter_reset() -> iterate entries. Zero-copy: ring_buffer_read_page() (ring_buffer.c:6623) swaps pages. Per-CPU design eliminates cross-CPU contention.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const SITE_COLORS: Record<string, string> = {
  nop: '#484f58',
  call: '#3fb950',
};

const PAGE_COLORS: Record<string, string> = {
  empty: '#30363d',
  writing: '#d29922',
  committed: '#3fb950',
  reading: '#58a6ff',
};

const ENTRY_COLORS: Record<string, string> = {
  reserved: '#d29922',
  committed: '#3fb950',
  read: '#484f58',
};

const KPROBE_COLORS: Record<string, string> = {
  none: '#30363d',
  registered: '#6e7681',
  prepared: '#d29922',
  armed: '#f85149',
  firing: '#ff7b72',
  'single-step': '#d29922',
  complete: '#3fb950',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as FtraceKprobeState;
  const margin = { top: 10, left: 10, right: 10, bottom: 10 };

  // -- Phase/title label --
  const titleText = document.createElementNS(NS, 'text');
  titleText.setAttribute('x', String(width / 2));
  titleText.setAttribute('y', '16');
  titleText.setAttribute('text-anchor', 'middle');
  titleText.setAttribute('class', 'anim-title');
  titleText.textContent = `Phase: ${data.phase}`;
  container.appendChild(titleText);

  // -- Source reference --
  if (data.srcRef) {
    const srcText = document.createElementNS(NS, 'text');
    srcText.setAttribute('x', String(margin.left));
    srcText.setAttribute('y', '36');
    srcText.setAttribute('class', 'anim-ftrace-srcref anim-cpu-label');
    srcText.textContent = data.srcRef;
    container.appendChild(srcText);
  }

  const topY = 50;

  // -- Call sites (left column) --
  if (data.callSites.length > 0) {
    const siteW = 160;
    const siteH = 28;
    const siteX = margin.left;

    const siteLabel = document.createElementNS(NS, 'text');
    siteLabel.setAttribute('x', String(siteX));
    siteLabel.setAttribute('y', String(topY));
    siteLabel.setAttribute('class', 'anim-cpu-label');
    siteLabel.textContent = 'Call Sites';
    container.appendChild(siteLabel);

    data.callSites.forEach((site, i) => {
      const sy = topY + 10 + i * (siteH + 6);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(siteX));
      rect.setAttribute('y', String(sy));
      rect.setAttribute('width', String(siteW));
      rect.setAttribute('height', String(siteH));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', SITE_COLORS[site.state]);
      let cls = 'anim-ftrace-site anim-block';
      if (frame.highlights.includes(site.id)) cls += ' anim-highlight';
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(siteX + siteW / 2));
      label.setAttribute('y', String(sy + 14));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'anim-cpu-label');
      label.textContent = `${site.funcName} [${site.state.toUpperCase()}]`;
      container.appendChild(label);

      const addrLabel = document.createElementNS(NS, 'text');
      addrLabel.setAttribute('x', String(siteX + siteW / 2));
      addrLabel.setAttribute('y', String(sy + 25));
      addrLabel.setAttribute('text-anchor', 'middle');
      addrLabel.setAttribute('class', 'anim-cpu-label');
      addrLabel.textContent = site.address;
      container.appendChild(addrLabel);
    });
  }

  // -- Kprobe visualization (center) --
  if (data.kprobe.state !== 'none') {
    const kpX = width / 2 - 80;
    const kpY = topY;
    const kpW = 160;
    const kpH = 70;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(kpX));
    rect.setAttribute('y', String(kpY));
    rect.setAttribute('width', String(kpW));
    rect.setAttribute('height', String(kpH));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', KPROBE_COLORS[data.kprobe.state]);
    rect.setAttribute('class', 'anim-kprobe anim-block');
    container.appendChild(rect);

    const kpTitle = document.createElementNS(NS, 'text');
    kpTitle.setAttribute('x', String(kpX + kpW / 2));
    kpTitle.setAttribute('y', String(kpY + 16));
    kpTitle.setAttribute('text-anchor', 'middle');
    kpTitle.setAttribute('class', 'anim-cpu-label');
    kpTitle.textContent = `kprobe: ${data.kprobe.targetFunc}`;
    container.appendChild(kpTitle);

    const kpState = document.createElementNS(NS, 'text');
    kpState.setAttribute('x', String(kpX + kpW / 2));
    kpState.setAttribute('y', String(kpY + 34));
    kpState.setAttribute('text-anchor', 'middle');
    kpState.setAttribute('class', 'anim-cpu-label');
    kpState.textContent = `state: ${data.kprobe.state}`;
    container.appendChild(kpState);

    const kpInsn = document.createElementNS(NS, 'text');
    kpInsn.setAttribute('x', String(kpX + kpW / 2));
    kpInsn.setAttribute('y', String(kpY + 52));
    kpInsn.setAttribute('text-anchor', 'middle');
    kpInsn.setAttribute('class', 'anim-cpu-label');
    kpInsn.textContent = data.kprobe.state === 'armed' || data.kprobe.state === 'firing'
      ? data.kprobe.breakpointInsn
      : data.kprobe.originalInsn;
    container.appendChild(kpInsn);
  }

  // -- Ring buffer pages (bottom area) --
  if (data.ringBuffer.pages.length > 0) {
    const rbY = height - 180;
    const pageW = Math.min(90, (width - margin.left - margin.right - 20) / data.ringBuffer.pages.length);
    const pageH = 50;

    const rbLabel = document.createElementNS(NS, 'text');
    rbLabel.setAttribute('x', String(margin.left));
    rbLabel.setAttribute('y', String(rbY - 6));
    rbLabel.setAttribute('class', 'anim-cpu-label');
    rbLabel.textContent = `Ring Buffer  |  W:${data.ringBuffer.writePtr}  C:${data.ringBuffer.commitPtr}  R:${data.ringBuffer.readPtr}`;
    container.appendChild(rbLabel);

    data.ringBuffer.pages.forEach((page, i) => {
      const px = margin.left + i * (pageW + 4);
      const py = rbY;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(px));
      rect.setAttribute('y', String(py));
      rect.setAttribute('width', String(pageW));
      rect.setAttribute('height', String(pageH));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', PAGE_COLORS[page.state]);
      let cls = 'anim-rb-page anim-block';
      if (frame.highlights.includes(page.id)) cls += ' anim-highlight';
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(px + pageW / 2));
      label.setAttribute('y', String(py + 16));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'anim-cpu-label');
      label.textContent = `CPU${page.cpuId} P${i % 4}`;
      container.appendChild(label);

      const stateLabel = document.createElementNS(NS, 'text');
      stateLabel.setAttribute('x', String(px + pageW / 2));
      stateLabel.setAttribute('y', String(py + 34));
      stateLabel.setAttribute('text-anchor', 'middle');
      stateLabel.setAttribute('class', 'anim-cpu-label');
      stateLabel.textContent = page.state;
      container.appendChild(stateLabel);
    });

    // -- Entries list below pages --
    if (data.ringBuffer.entries.length > 0) {
      const entryY = rbY + pageH + 14;
      const entryW = 140;
      const entryH = 22;

      data.ringBuffer.entries.forEach((entry, i) => {
        const ex = margin.left + i * (entryW + 6);
        const ey = entryY;

        if (ex + entryW > width - margin.right) return; // clip

        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(ex));
        rect.setAttribute('y', String(ey));
        rect.setAttribute('width', String(entryW));
        rect.setAttribute('height', String(entryH));
        rect.setAttribute('rx', '3');
        rect.setAttribute('fill', ENTRY_COLORS[entry.state]);
        let cls = 'anim-rb-entry';
        if (frame.highlights.includes(entry.id)) cls += ' anim-highlight';
        rect.setAttribute('class', cls);
        container.appendChild(rect);

        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', String(ex + entryW / 2));
        label.setAttribute('y', String(ey + 14));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 'anim-cpu-label');
        label.textContent = entry.label;
        container.appendChild(label);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'ftrace-function-tracing', label: 'Function Tracing (NOP -> CALL patching)' },
  { id: 'kprobe-insertion', label: 'Kprobe Insertion (INT3 breakpoint)' },
  { id: 'ftrace-ring-buffer', label: 'Ring Buffer Operation (per-CPU pages)' },
];

const ftraceKprobe: AnimationModule = {
  config: {
    id: 'ftrace-kprobe',
    title: 'Ftrace Function Tracing and Kprobes',
    skillName: 'ftrace-and-kprobes',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'kprobe-insertion': return generateKprobeInsertion();
      case 'ftrace-ring-buffer': return generateFtraceRingBuffer();
      case 'ftrace-function-tracing':
      default: return generateFtraceFunctionTracing();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default ftraceKprobe;
