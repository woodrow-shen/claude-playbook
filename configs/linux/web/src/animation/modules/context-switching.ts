import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface ContextSwitchState {
  currentTask: string;
  nextTask: string;
  cpu: number;
  phase: 'schedule-entry' | 'pick-next' | 'mm-switch' | 'register-switch' | 'fpu-switch' | 'segment-switch' | 'finish';
  registers: Record<string, string>;
  mmState: 'same' | 'lazy-tlb' | 'switching';
  srcRef: string;
  kernelStack: string[];
}

function cloneState(s: ContextSwitchState): ContextSwitchState {
  return {
    currentTask: s.currentTask,
    nextTask: s.nextTask,
    cpu: s.cpu,
    phase: s.phase,
    registers: { ...s.registers },
    mmState: s.mmState,
    srcRef: s.srcRef,
    kernelStack: [...s.kernelStack],
  };
}

// ---------------------------------------------------------------------------
// Scenario: voluntary-switch (default)
// A process calls schedule() voluntarily (e.g., going to sleep on I/O).
// Trace from __schedule(SM_NONE) through context_switch() to finish_task_switch().
// ---------------------------------------------------------------------------
function generateVoluntarySwitch(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ContextSwitchState = {
    currentTask: 'Process A (pid 1234)',
    nextTask: 'Process B (pid 5678)',
    cpu: 0,
    phase: 'schedule-entry',
    registers: { rsp: '0xffffc900001bfd00', rbp: '0xffffc900001bfde0', r15: '(callee-saved)', rip: 'schedule' },
    mmState: 'same',
    srcRef: '',
    kernelStack: ['schedule'],
  };

  // Frame 0: schedule() entry point
  state.srcRef = 'kernel/sched/core.c:6998 (asmlinkage __visible void __sched schedule(void))';
  frames.push({
    step: 0,
    label: 'schedule() called voluntarily',
    description: 'Process A calls schedule() at kernel/sched/core.c:6998, e.g., after setting its state to TASK_INTERRUPTIBLE and waiting on I/O. schedule() calls sched_submit_work(tsk) at line 7007 to flush any plugged block I/O, then enters __schedule_loop(SM_NONE) at line 7008. SM_NONE (defined at line 6480) indicates a voluntary, non-preemption schedule call.',
    highlights: ['phase-schedule-entry'],
    data: cloneState(state),
  });

  // Frame 1: __schedule() entry
  state.kernelStack.push('__schedule_loop', '__schedule');
  state.srcRef = 'kernel/sched/core.c:6764 (static void __sched notrace __schedule(int sched_mode))';
  frames.push({
    step: 1,
    label: '__schedule(SM_NONE) begins',
    description: '__schedule() at kernel/sched/core.c:6764 is the main scheduler function. It reads prev = rq->curr (line 6784), calls local_irq_disable() at line 6793 to disable interrupts, rcu_note_context_switch() at line 6794 to inform RCU, then rq_lock(rq, &rf) at line 6814 to acquire the runqueue lock. smp_mb__after_spinlock() at line 6815 provides the memory barrier required by membarrier.',
    highlights: ['phase-schedule-entry'],
    data: cloneState(state),
  });

  // Frame 2: try_to_block_task and dequeue
  state.phase = 'pick-next';
  state.srcRef = 'kernel/sched/core.c:6839-6848 (try_to_block_task for voluntary sleep)';
  frames.push({
    step: 2,
    label: 'Deactivate prev, prepare to pick next',
    description: 'Since sched_mode is SM_NONE (not preempt) and prev_state is non-zero (TASK_INTERRUPTIBLE), __schedule() enters the block at line 6839. try_to_block_task() at line 6846 checks signal_pending_state() -- if no signal, it deactivates the task from the runqueue via deactivate_task(). switch_count is set to &prev->nvcsw (voluntary context switch counter) at line 6848.',
    highlights: ['phase-pick-next'],
    data: cloneState(state),
  });

  // Frame 3: pick_next_task
  state.kernelStack.push('pick_next_task');
  state.srcRef = 'kernel/sched/core.c:6852 (next = pick_next_task(rq, rq->donor, &rf))';
  frames.push({
    step: 3,
    label: 'pick_next_task() selects Process B',
    description: 'pick_next_task() at kernel/sched/core.c:6852 iterates scheduling classes in priority order: stop_sched_class -> dl_sched_class -> rt_sched_class -> fair_sched_class -> idle_sched_class. For CFS tasks, it calls pick_next_task_fair() which picks the leftmost entity in the EEVDF tree. Process B is selected. rq->curr is updated to next at line 6875 via RCU_INIT_POINTER(rq->curr, next).',
    highlights: ['phase-pick-next'],
    data: cloneState(state),
  });

  // Frame 4: context_switch() entry
  state.phase = 'mm-switch';
  state.kernelStack.push('context_switch');
  state.srcRef = 'kernel/sched/core.c:5239-5242 (context_switch(struct rq *rq, struct task_struct *prev, struct task_struct *next, struct rq_flags *rf))';
  frames.push({
    step: 4,
    label: 'context_switch() entered',
    description: '__schedule() calls context_switch() at kernel/sched/core.c:6911. context_switch() at line 5239 first calls prepare_task_switch(rq, prev, next) at line 5243, which fires sched-out notifiers and perf_event_task_sched_out(). arch_start_context_switch(prev) at line 5250 begins paravirt context switch. Then the MM switch logic at lines 5259-5285 handles the address space transition.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 5: MM switch (user->user case)
  state.mmState = 'switching';
  state.srcRef = 'kernel/sched/core.c:5267-5278 (to-user path: switch_mm_irqs_off)';
  frames.push({
    step: 5,
    label: 'MM switch: user -> user',
    description: 'Both Process A and B are user processes (both have mm set). context_switch() takes the "to user" path at line 5267. membarrier_switch_mm() at line 5268 handles membarrier bookkeeping. switch_mm_irqs_off(prev->active_mm, next->mm, next) at line 5277 loads Process B CR3 page table base, flushes TLB entries as needed. Since prev->mm is set (from user), the kernel->user mmdrop at lines 5280-5283 is skipped.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 6: switch_to -> __switch_to_asm
  state.phase = 'register-switch';
  state.mmState = 'same';
  state.registers.rsp = '(switching stacks)';
  state.srcRef = 'arch/x86/entry/entry_64.S:177 (SYM_FUNC_START(__switch_to_asm))';
  frames.push({
    step: 6,
    label: 'switch_to() saves/restores registers',
    description: 'context_switch() calls switch_to(prev, next, prev) at kernel/sched/core.c:5298. The switch_to() macro expands to __switch_to_asm at arch/x86/entry/entry_64.S:177. It pushes callee-saved registers (rbp, rbx, r12-r15) at lines 183-188, saves RSP to prev->thread.sp at line 191 (movq %rsp, TASK_threadsp(%rdi)), loads next->thread.sp at line 192 (movq TASK_threadsp(%rsi), %rsp). FILL_RETURN_BUFFER at line 206 mitigates Spectre RSB attacks. Then it pops r15-rbp (lines 209-214) and jumps to __switch_to at line 216.',
    highlights: ['phase-register-switch'],
    data: cloneState(state),
  });

  // Frame 7: __switch_to() in C
  state.phase = 'fpu-switch';
  state.srcRef = 'arch/x86/kernel/process_64.c:610 (__switch_to(struct task_struct *prev_p, struct task_struct *next_p))';
  frames.push({
    step: 7,
    label: '__switch_to() handles FPU, segments, TLS',
    description: '__switch_to() at arch/x86/kernel/process_64.c:610 performs: switch_fpu(prev_p, cpu) at line 619 to save/restore FPU/SSE/AVX state via XSAVE/XRSTOR, save_fsgs(prev_p) at line 626 to save FS/GS bases, load_TLS(next, cpu) at line 632 to load Thread-Local Storage descriptors into GDT, arch_end_context_switch(next_p) at line 639 for paravirt cleanup. Then segments DS/ES are saved and restored at lines 655-661, x86_fsgsbase_load() at line 663 restores FS/GS bases, and x86_pkru_load() at line 665 switches PKRU for memory protection keys.',
    highlights: ['phase-fpu-switch'],
    data: cloneState(state),
  });

  // Frame 8: __switch_to() sets current_task
  state.phase = 'segment-switch';
  state.registers.rsp = '0xffffc900002afd00 (Process B kernel stack)';
  state.srcRef = 'arch/x86/kernel/process_64.c:670-674 (current_task and sp0 update)';
  frames.push({
    step: 8,
    label: 'Update current_task and sp0',
    description: '__switch_to() writes raw_cpu_write(current_task, next_p) at arch/x86/kernel/process_64.c:670, making Process B the current task on this CPU. raw_cpu_write(cpu_current_top_of_stack, task_top_of_stack(next_p)) at line 671 updates the per-CPU stack top pointer used by entry code. update_task_stack(next_p) at line 674 reloads sp0 in the TSS so that ring transitions use Process B kernel stack. switch_to_extra() at line 676 handles I/O bitmap and debug registers.',
    highlights: ['phase-segment-switch'],
    data: cloneState(state),
  });

  // Frame 9: finish_task_switch()
  state.phase = 'finish';
  state.kernelStack = ['schedule', '__schedule_loop', '__schedule', 'context_switch', 'finish_task_switch'];
  state.srcRef = 'kernel/sched/core.c:5112 (static struct rq *finish_task_switch(struct task_struct *prev))';
  frames.push({
    step: 9,
    label: 'finish_task_switch() cleanup',
    description: 'After switch_to() returns at kernel/sched/core.c:5298, we are now running as Process B. barrier() at line 5299 prevents compiler reordering. finish_task_switch(prev) at line 5301 is called with prev=Process A. At line 5112, it verifies preempt_count==2 (line 5130), clears rq->prev_mm (line 5135), reads prev->__state (line 5148), calls vtime_task_switch() (line 5149), perf_event_task_sched_in() (line 5150), finish_task(prev) (line 5151) which clears prev->on_cpu. If prev was TASK_DEAD (line 5183), it calls put_task_struct_rcu_user() to release the task.',
    highlights: ['phase-finish'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: preemption
// Timer tick sets TIF_NEED_RESCHED, return from interrupt calls
// preempt_schedule_irq() -> __schedule(SM_PREEMPT).
// ---------------------------------------------------------------------------
function generatePreemption(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ContextSwitchState = {
    currentTask: 'CPU-bound A (pid 2001)',
    nextTask: 'Woken-up B (pid 2002)',
    cpu: 1,
    phase: 'schedule-entry',
    registers: { rsp: '0xffffc90000abfd00', rbp: '0xffffc90000abfde0', r15: '(callee-saved)', rip: '(userspace code)' },
    mmState: 'same',
    srcRef: '',
    kernelStack: [],
  };

  // Frame 0: Timer interrupt fires
  state.srcRef = 'kernel/sched/core.c:6735-6736 (TIF_NEED_RESCHED set by sched_tick)';
  state.kernelStack = ['timer_interrupt'];
  frames.push({
    step: 0,
    label: 'Timer tick fires on CPU 1',
    description: 'Process A is running in userspace when a timer interrupt fires. The timer interrupt handler calls scheduler_tick() which calls sched_tick(). As described in the __schedule() comment at kernel/sched/core.c:6735-6736, the scheduler sets TIF_NEED_RESCHED in the timer interrupt handler via sched_tick() when the current task has exhausted its time slice or a higher-priority task is ready.',
    highlights: ['phase-schedule-entry'],
    data: cloneState(state),
  });

  // Frame 1: TIF_NEED_RESCHED set
  state.srcRef = 'kernel/sched/core.c:6732 (TIF_NEED_RESCHED flag checked on interrupt return)';
  frames.push({
    step: 1,
    label: 'TIF_NEED_RESCHED flag set',
    description: 'The scheduler sets TIF_NEED_RESCHED on Process A thread_info. As documented in __schedule() at kernel/sched/core.c:6732, this flag is checked on interrupt and userspace return paths. On x86, the return-from-interrupt path in arch/x86/entry checks this flag. With CONFIG_PREEMPTION=y, the kernel can preempt even kernel code at preempt_enable() points.',
    highlights: ['phase-schedule-entry'],
    data: cloneState(state),
  });

  // Frame 2: preempt_schedule_irq entry
  state.kernelStack = ['preempt_schedule_irq'];
  state.srcRef = 'kernel/sched/core.c:7226 (asmlinkage __visible void __sched preempt_schedule_irq(void))';
  frames.push({
    step: 2,
    label: 'preempt_schedule_irq() called',
    description: 'On return from IRQ context, the kernel detects TIF_NEED_RESCHED and calls preempt_schedule_irq() at kernel/sched/core.c:7226. This is the entry point for preemption from IRQ context. It asserts preempt_count()==0 and irqs_disabled() at line 7231 via BUG_ON. It calls exception_enter() at line 7233, then enters a loop: preempt_disable() at line 7236, local_irq_enable() at line 7237, __schedule(SM_PREEMPT) at line 7238.',
    highlights: ['phase-schedule-entry'],
    data: cloneState(state),
  });

  // Frame 3: __schedule(SM_PREEMPT)
  state.kernelStack.push('__schedule');
  state.srcRef = 'kernel/sched/core.c:6764-6825 (__schedule with SM_PREEMPT)';
  frames.push({
    step: 3,
    label: '__schedule(SM_PREEMPT) entered',
    description: '__schedule(SM_PREEMPT) at kernel/sched/core.c:6764 sets preempt=true at line 6771 (sched_mode > SM_NONE). SM_PREEMPT is 1 (defined at line 6481). The key difference from voluntary: at line 6825, preempt is rechecked as (sched_mode == SM_PREEMPT), and since prev_state is TASK_RUNNING (the task was preempted, not sleeping), the try_to_block_task() path at line 6839 is NOT taken. The task stays on the runqueue.',
    highlights: ['phase-schedule-entry'],
    data: cloneState(state),
  });

  // Frame 4: pick_next_task selects B
  state.phase = 'pick-next';
  state.kernelStack.push('pick_next_task');
  state.srcRef = 'kernel/sched/core.c:6852 (next = pick_next_task(rq, rq->donor, &rf))';
  frames.push({
    step: 4,
    label: 'pick_next_task() selects woken-up B',
    description: 'pick_next_task() at kernel/sched/core.c:6852 selects Process B which was recently woken up (e.g., its I/O completed). In the CFS/EEVDF scheduler, B has accumulated no virtual runtime while sleeping, so it has a favorable position. RCU_INIT_POINTER(rq->curr, next) at line 6875 updates the current task pointer. trace_sched_switch(preempt, prev, next, prev_state) at line 6908 records the preemption event.',
    highlights: ['phase-pick-next'],
    data: cloneState(state),
  });

  // Frame 5: context_switch
  state.phase = 'mm-switch';
  state.kernelStack.push('context_switch');
  state.srcRef = 'kernel/sched/core.c:6911 (rq = context_switch(rq, prev, next, &rf))';
  frames.push({
    step: 5,
    label: 'context_switch() for preemption',
    description: 'context_switch() at kernel/sched/core.c:5239 proceeds identically for preemption and voluntary switches. prepare_task_switch() at line 5243, arch_start_context_switch() at line 5250. The MM switch at lines 5259-5285 handles the address space transition. For user->user preemption, switch_mm_irqs_off() at line 5277 loads the new CR3.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 6: Register switch
  state.phase = 'register-switch';
  state.registers.rsp = '(switching stacks)';
  state.srcRef = 'arch/x86/entry/entry_64.S:177-217 (__switch_to_asm)';
  frames.push({
    step: 6,
    label: 'Register switch via __switch_to_asm',
    description: 'switch_to() at kernel/sched/core.c:5298 calls __switch_to_asm at arch/x86/entry/entry_64.S:177. Callee-saved registers pushed (lines 183-188), stack pointer swapped (lines 191-192), RSB filled for Spectre mitigation (line 206), registers restored (lines 209-214), then jmp __switch_to at line 216 enters C code at arch/x86/kernel/process_64.c:610 for FPU, TLS, segments, PKRU, current_task update.',
    highlights: ['phase-register-switch'],
    data: cloneState(state),
  });

  // Frame 7: __switch_to C portion
  state.phase = 'fpu-switch';
  state.srcRef = 'arch/x86/kernel/process_64.c:610-676 (__switch_to)';
  frames.push({
    step: 7,
    label: '__switch_to() FPU and segment state',
    description: '__switch_to() at arch/x86/kernel/process_64.c:610: switch_fpu() at line 619 saves A FPU state and restores B FPU state via XSAVE/XRSTOR. save_fsgs() at line 626, load_TLS() at line 632, arch_end_context_switch() at line 639. Segment registers DS/ES at lines 655-661, x86_fsgsbase_load() at line 663, x86_pkru_load() at line 665. raw_cpu_write(current_task, next_p) at line 670 makes B current.',
    highlights: ['phase-fpu-switch'],
    data: cloneState(state),
  });

  // Frame 8: finish_task_switch
  state.phase = 'finish';
  state.kernelStack = ['preempt_schedule_irq', '__schedule', 'context_switch', 'finish_task_switch'];
  state.registers.rsp = '0xffffc90000ccfd00 (Process B kernel stack)';
  state.srcRef = 'kernel/sched/core.c:5112-5201 (finish_task_switch)';
  frames.push({
    step: 8,
    label: 'finish_task_switch() completes preemption',
    description: 'Now running as Process B. finish_task_switch(prev) at kernel/sched/core.c:5112 verifies preempt_count (line 5130), calls vtime_task_switch() at line 5149, perf_event_task_sched_in(prev, current) at line 5150 to update perf events, finish_task(prev) at line 5151 clears prev->on_cpu allowing prev to be woken on another CPU. finish_lock_switch() at line 5153 releases the rq lock. Process A remains on the runqueue (it was preempted, not sleeping) and can be picked again.',
    highlights: ['phase-finish'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: kernel-to-user-mm-switch
// Focus on the MM switch path in context_switch(), showing all 4 cases.
// ---------------------------------------------------------------------------
function generateMmSwitch(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ContextSwitchState = {
    currentTask: 'kworker/0:1 (pid 100, kernel thread)',
    nextTask: 'Process C (pid 3000, user process)',
    cpu: 0,
    phase: 'schedule-entry',
    registers: { rsp: '0xffffc900001afd00', rbp: '0xffffc900001afde0', r15: '(callee-saved)', rip: '__schedule' },
    mmState: 'same',
    srcRef: '',
    kernelStack: ['worker_thread', 'schedule'],
  };

  // Frame 0: Setup -- overview of the 4 MM cases
  state.srcRef = 'kernel/sched/core.c:5252-5285 (context_switch MM switch logic)';
  frames.push({
    step: 0,
    label: 'MM switch overview: 4 cases',
    description: 'context_switch() at kernel/sched/core.c:5252-5285 handles 4 address space transition cases. The comment at lines 5253-5257 documents them: (1) kernel -> kernel: lazy + transfer active_mm, (2) user -> kernel: lazy + mmgrab_lazy_tlb() active, (3) kernel -> user: switch + mmdrop_lazy_tlb() active, (4) user -> user: just switch. The logic checks next->mm (line 5259) to distinguish "to kernel" vs "to user", and prev->mm (lines 5263, 5280) for "from user" vs "from kernel".',
    highlights: ['phase-schedule-entry'],
    data: cloneState(state),
  });

  // Frame 1: Case 1 -- kernel -> kernel
  state.srcRef = 'kernel/sched/core.c:5259-5266 (kernel -> kernel: enter_lazy_tlb, transfer active_mm)';
  state.mmState = 'lazy-tlb';
  frames.push({
    step: 1,
    label: 'Case 1: kernel -> kernel',
    description: 'When switching from one kernel thread to another kernel thread: next->mm is NULL (line 5259, "to kernel" branch). enter_lazy_tlb(prev->active_mm, next) at line 5260 enters lazy TLB mode -- the CPU keeps using the previous address space CR3 since kernel threads share the kernel address space. next->active_mm = prev->active_mm at line 5262 transfers the borrowed mm. Since prev->mm is also NULL (kernel thread), the else branch at line 5265 sets prev->active_mm = NULL, passing ownership.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 2: Case 2 -- user -> kernel
  state.srcRef = 'kernel/sched/core.c:5259-5264 (user -> kernel: enter_lazy_tlb, mmgrab_lazy_tlb)';
  frames.push({
    step: 2,
    label: 'Case 2: user -> kernel',
    description: 'When switching from a user process to a kernel thread: next->mm is NULL (line 5259, "to kernel"). enter_lazy_tlb(prev->active_mm, next) at line 5260 -- lazy TLB again, keeping the user process CR3 loaded. next->active_mm = prev->active_mm at line 5262 borrows the user mm. But since prev->mm is set (from user, line 5263), mmgrab_lazy_tlb(prev->active_mm) at line 5264 increments the mm refcount so it is not freed while the kernel thread borrows it.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 3: Case 3 -- kernel -> user (our actual scenario)
  state.phase = 'mm-switch';
  state.mmState = 'switching';
  state.srcRef = 'kernel/sched/core.c:5267-5284 (kernel -> user: switch_mm_irqs_off, mmdrop_lazy_tlb deferred)';
  frames.push({
    step: 3,
    label: 'Case 3: kernel -> user (active)',
    description: 'Our scenario: kworker switching to Process C. next->mm is set (line 5267, "to user" branch). membarrier_switch_mm() at line 5268. switch_mm_irqs_off(prev->active_mm, next->mm, next) at line 5277 loads Process C CR3 into the CPU, flushes stale TLB entries. Since prev->mm is NULL (from kernel, line 5280), the borrowed mm must be released: rq->prev_mm = prev->active_mm at line 5282 defers the mmdrop_lazy_tlb() to finish_task_switch(), prev->active_mm = NULL at line 5283.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 4: Case 4 -- user -> user
  state.srcRef = 'kernel/sched/core.c:5267-5278 (user -> user: switch_mm_irqs_off only)';
  frames.push({
    step: 4,
    label: 'Case 4: user -> user',
    description: 'When both prev and next are user processes: next->mm is set (line 5267, "to user"). switch_mm_irqs_off(prev->active_mm, next->mm, next) at line 5277 loads the new CR3. Since prev->mm is also set (from user), the kernel->user cleanup at lines 5280-5283 is skipped entirely. This is the simplest and most common case. If prev->active_mm == next->mm (same address space, e.g., threads), switch_mm_irqs_off() may skip the CR3 reload as an optimization.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 5: switch_mm_irqs_off details for our kernel->user case
  state.srcRef = 'kernel/sched/core.c:5277 (switch_mm_irqs_off called for kernel -> user)';
  frames.push({
    step: 5,
    label: 'switch_mm_irqs_off() loads new CR3',
    description: 'For our kernel -> user case, switch_mm_irqs_off(prev->active_mm, next->mm, next) at kernel/sched/core.c:5277 must load Process C page tables. On x86, this writes to CR3, which triggers a full TLB flush (unless PCID is used for TLB tagging). The function also handles IBPB (Indirect Branch Prediction Barrier) for Spectre v2 mitigation when switching between different user address spaces. lru_gen_use_mm(next->mm) at line 5278 updates MGLRU generation tracking.',
    highlights: ['phase-mm-switch'],
    data: cloneState(state),
  });

  // Frame 6: switch_to and register switch
  state.phase = 'register-switch';
  state.registers.rsp = '(switching stacks)';
  state.kernelStack.push('__schedule', 'context_switch');
  state.srcRef = 'kernel/sched/core.c:5287-5298 (mm_cid, rseq, prepare_lock_switch, switch_to)';
  frames.push({
    step: 6,
    label: 'switch_to() swaps register state',
    description: 'After MM switch, context_switch() calls mm_cid_switch_to(prev, next) at kernel/sched/core.c:5287 for mm concurrency ID tracking, rseq_sched_switch_event(next) at line 5293 notifies restartable sequences. prepare_lock_switch(rq, next, rf) at line 5295 prepares lock handoff. switch_to(prev, next, prev) at line 5298 calls __switch_to_asm at arch/x86/entry/entry_64.S:177 to swap stack pointers (lines 191-192) and callee-saved registers (lines 183-188, 209-214), then jmp __switch_to at line 216.',
    highlights: ['phase-register-switch'],
    data: cloneState(state),
  });

  // Frame 7: __switch_to C code
  state.phase = 'fpu-switch';
  state.srcRef = 'arch/x86/kernel/process_64.c:610-676 (__switch_to)';
  frames.push({
    step: 7,
    label: '__switch_to() FPU, TLS, segments',
    description: '__switch_to() at arch/x86/kernel/process_64.c:610 handles hardware state: switch_fpu(prev_p, cpu) at line 619, save_fsgs(prev_p) at line 626 saves FS/GS segment bases, load_TLS(next, cpu) at line 632 loads Thread-Local Storage from next->thread into GDT slots, arch_end_context_switch() at line 639, save/restore DS/ES at lines 655-661, x86_fsgsbase_load() at line 663, x86_pkru_load() at line 665 for memory protection keys. raw_cpu_write(current_task, next_p) at line 670 updates the per-CPU current pointer.',
    highlights: ['phase-fpu-switch'],
    data: cloneState(state),
  });

  // Frame 8: finish_task_switch with mmdrop
  state.phase = 'finish';
  state.mmState = 'same';
  state.kernelStack = ['schedule', '__schedule', 'context_switch', 'finish_task_switch'];
  state.registers.rsp = '0xffffc900003bfd00 (Process C kernel stack)';
  state.srcRef = 'kernel/sched/core.c:5112-5181 (finish_task_switch with mmdrop_lazy_tlb for kernel->user)';
  frames.push({
    step: 8,
    label: 'finish_task_switch() drops borrowed mm',
    description: 'Now running as Process C. finish_task_switch(prev) at kernel/sched/core.c:5112 reads mm = rq->prev_mm at line 5116 -- this was set to kworker active_mm in context_switch() (line 5282). rq->prev_mm = NULL at line 5135 clears it. After the main cleanup (vtime, perf, finish_task at lines 5149-5151, finish_lock_switch at line 5153), the deferred mm drop happens at line 5178-5180: membarrier_mm_sync_core_before_usermode(mm) and mmdrop_lazy_tlb_sched(mm) decrements the mm refcount that was grabbed by mmgrab_lazy_tlb() when the kernel thread borrowed it.',
    highlights: ['phase-finish'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering (placeholder with basic structure)
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS = [
  { id: 'schedule-entry', label: 'Entry' },
  { id: 'pick-next', label: 'Pick' },
  { id: 'mm-switch', label: 'MM' },
  { id: 'register-switch', label: 'Regs' },
  { id: 'fpu-switch', label: 'FPU' },
  { id: 'segment-switch', label: 'Seg' },
  { id: 'finish', label: 'Finish' },
];

function getActivePhaseIndex(phase: string): number {
  const idx = PHASE_LABELS.findIndex(p => p.id === phase);
  return idx >= 0 ? idx : -1;
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as ContextSwitchState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Context Switching';
  container.appendChild(title);

  // Task labels
  const taskTop = margin.top + 30;
  const prevLabel = document.createElementNS(NS, 'text');
  prevLabel.setAttribute('x', String(margin.left));
  prevLabel.setAttribute('y', String(taskTop));
  prevLabel.setAttribute('class', 'anim-task');
  prevLabel.setAttribute('fill', '#f0883e');
  prevLabel.textContent = `prev: ${data.currentTask}`;
  container.appendChild(prevLabel);

  const nextLabel = document.createElementNS(NS, 'text');
  nextLabel.setAttribute('x', String(width / 2));
  nextLabel.setAttribute('y', String(taskTop));
  nextLabel.setAttribute('class', 'anim-task');
  nextLabel.setAttribute('fill', '#3fb950');
  nextLabel.textContent = `next: ${data.nextTask}`;
  container.appendChild(nextLabel);

  // Phase flow diagram
  const flowTop = taskTop + 25;
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

  // Current function
  const funcTop = flowTop + phaseHeight + 18;
  const funcText = document.createElementNS(NS, 'text');
  funcText.setAttribute('x', String(margin.left));
  funcText.setAttribute('y', String(funcTop));
  funcText.setAttribute('fill', '#e6edf3');
  funcText.setAttribute('font-size', '12');
  funcText.setAttribute('class', 'anim-cpu-label');
  funcText.textContent = `CPU ${data.cpu} | MM: ${data.mmState}`;
  container.appendChild(funcText);

  // Kernel stack
  const stackTop = funcTop + 20;
  const stackEntryHeight = 18;
  const stackEntryWidth = 200;

  data.kernelStack.forEach((entry, i) => {
    const sy = stackTop + i * (stackEntryHeight + 2);
    const sx = margin.left + i * 8;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(sx));
    rect.setAttribute('y', String(sy));
    rect.setAttribute('width', String(stackEntryWidth));
    rect.setAttribute('height', String(stackEntryHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#1f4068');
    rect.setAttribute('opacity', '0.8');
    rect.setAttribute('class', 'anim-stack-frame');
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(sx + 6));
    text.setAttribute('y', String(sy + 13));
    text.setAttribute('fill', '#8b949e');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-stack-frame');
    text.textContent = entry;
    container.appendChild(text);
  });
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const contextSwitchingModule: AnimationModule = {
  config: {
    id: 'context-switching',
    title: 'Context Switching',
    skillName: 'context-switching',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'preemption':
        return generatePreemption();
      case 'kernel-to-user-mm-switch':
        return generateMmSwitch();
      case 'voluntary-switch':
      default:
        return generateVoluntarySwitch();
    }
  },

  renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
    renderFrame(container, frame, width, height);
  },

  getScenarios(): AnimationScenario[] {
    return [
      { id: 'voluntary-switch', label: 'Voluntary Context Switch' },
      { id: 'preemption', label: 'Preemptive Context Switch' },
      { id: 'kernel-to-user-mm-switch', label: 'MM Switch (4 cases)' },
    ];
  },
};

export default contextSwitchingModule;
