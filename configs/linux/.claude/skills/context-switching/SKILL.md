---
name: context-switching
description: Understand how the kernel switches between tasks at the CPU level
realm: scheduler
category: scheduling
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - scheduler-fundamentals
unlocks: []
kernel_files:
  - kernel/sched/core.c
  - arch/x86/kernel/process_64.c
  - arch/x86/entry/entry_64.S
doc_files:
  - Documentation/scheduler/sched-design-CFS.rst
badge: Context Conductor
tags:
  - context-switch
  - registers
  - stack
---

# Context Switching

## Quest Briefing

A context switch is the fundamental operation that gives the illusion of
concurrent execution on a single CPU. When the kernel decides to run a
different task, it must save the complete execution state of the current task
-- CPU registers, stack pointer, floating-point state, segment registers --
and restore the state of the next task. This must happen atomically from the
perspective of both tasks: each one resumes exactly where it left off, as if
nothing happened.

The context switch path in Linux is one of the most performance-critical
code paths in the entire kernel. It runs millions of times per second on a
busy system. Every unnecessary instruction adds measurable overhead. The
implementation spans three layers: the scheduler core in kernel/sched/core.c
which orchestrates the switch, the architecture-specific code in
arch/x86/kernel/process_64.c which handles x86-specific register state, and
the assembly entry code in arch/x86/entry/entry_64.S which performs the
actual stack switch.

Understanding context switching is essential for comprehending scheduler
behavior, debugging task state issues, and understanding performance
implications of scheduling decisions.


## Learning Objectives

- Trace the complete context switch path from __schedule() through
  context_switch() to the architecture-specific __switch_to().
- Explain what state is saved and restored during a context switch.
- Understand the memory management switch (switch_mm) and lazy TLB handling.
- Describe the finish_task_switch() cleanup that runs after the switch.
- Identify the difference between voluntary and involuntary context switches.


## Core Concepts

### The __schedule() Function

The scheduler's entry point is __schedule() at kernel/sched/core.c:6764. This
function is declared as `static void __sched notrace __schedule(int sched_mode)`
and is called from schedule(), preempt_schedule(), and the idle loop.

The sched_mode parameter distinguishes the type of switch:
- SM_NONE: Voluntary schedule (the task called schedule() explicitly).
- SM_PREEMPT: Involuntary preemption (the task was preempted).
- SM_IDLE: The idle loop calling schedule.

Key steps in __schedule():
1. Gets the current CPU and runqueue: cpu = smp_processor_id(), rq = cpu_rq(cpu),
   prev = rq->curr (line 6782-6784).
2. Disables local interrupts: local_irq_disable() at line 6793.
3. Notifies RCU: rcu_note_context_switch(preempt) at line 6794.
4. Locks the runqueue: rq_lock(rq, &rf) at line 6814.
5. Reads prev_state: READ_ONCE(prev->__state) at line 6831.
6. For voluntary switches, calls try_to_block_task() at line 6846 to
   dequeue the task if it is going to sleep.
7. Picks the next task: pick_next_task(rq, rq->donor, &rf) at line 6852.
8. If prev != next (line 6868), performs the actual switch via
   context_switch().

### The context_switch() Function

context_switch() at core.c:5239 is the bridge between the scheduler and
architecture-specific code. Its signature:

    static __always_inline struct rq *
    context_switch(struct rq *rq, struct task_struct *prev,
                   struct task_struct *next, struct rq_flags *rf)

The function performs these steps:

1. **prepare_task_switch()** at line 5243 (defined at line 5080): Calls
   architecture hooks (arch_start_context_switch at line 5250), performs
   perf event context switch, and prepares the lock handoff.

2. **Memory management switch** (lines 5259-5285): This is the most complex
   part. Four cases are handled:
   - kernel -> kernel: lazy TLB via enter_lazy_tlb(), transfer active_mm.
   - user -> kernel: lazy TLB + mmgrab_lazy_tlb() on prev's mm.
   - kernel -> user: switch_mm_irqs_off() to load new page tables.
   - user -> user: switch_mm_irqs_off() to switch page tables.

3. **Register state switch**: switch_to(prev, next, prev) at line 5298.
   This is an architecture-specific macro that saves prev's register state
   and restores next's. On x86-64, it calls __switch_to_asm in entry_64.S.

4. **Cleanup**: finish_task_switch(prev) at line 5301 handles post-switch
   cleanup after the new task is running.

### Architecture-Specific __switch_to()

On x86-64, __switch_to() is defined at arch/x86/kernel/process_64.c:610.
It receives the prev and next task_struct pointers and switches:

1. **FPU state**: switch_fpu(prev_p, cpu) at line 619 saves/restores the
   FPU, SSE, and AVX register state.
2. **Segment registers**: save_fsgs(prev_p) at line 626 saves FS and GS
   base addresses. load_TLS(next, cpu) at line 632 loads the new task's
   Thread Local Storage.
3. **DS and ES segments**: savesegment/loadsegment calls at lines 655-661.
4. **FS/GS base**: x86_fsgsbase_load(prev, next) at line 663.
5. **PKRU**: x86_pkru_load(prev, next) at line 665 switches memory
   protection keys.
6. **Current task pointer**: raw_cpu_write(current_task, next_p) at line 670
   updates the per-CPU current pointer.
7. **Stack pointer**: update_task_stack(next_p) at line 674 sets sp0 for
   the next task.
8. **Extra state**: switch_to_extra(prev_p, next_p) at line 676 handles
   I/O permissions and debug registers.

### finish_task_switch()

After the context switch completes, finish_task_switch() at core.c:5112 runs
in the context of the new task. It handles:
- Dropping the reference to the previous task's mm (if it was a kernel thread
  borrowing an mm via lazy TLB).
- Freeing the previous task's task_struct if it was a dead task (TASK_DEAD).
- Updating perf event counters.
- Re-enabling preemption.


## Code Walkthrough

Trace a complete context switch when process A is preempted by process B:

1. **Timer interrupt fires**: The tick handler calls scheduler_tick(), which
   sets TIF_NEED_RESCHED on A's thread_info if its time slice is up.

2. **Return from interrupt**: On return to kernel, the preemption check
   sees TIF_NEED_RESCHED and calls preempt_schedule_irq(), which calls
   __schedule(SM_PREEMPT) at core.c:6764.

3. **Pick next task**: __schedule() calls pick_next_task() at line 6852.
   The scheduler selects process B.

4. **context_switch()** at line 5238: Called with prev=A, next=B.

5. **MM switch**: Since both are user processes (user -> user case at
   line 5267), switch_mm_irqs_off() loads B's page tables into CR3.

6. **Register switch**: switch_to(A, B, A) at line 5298 saves A's
   registers (RSP, RBP, callee-saved registers) to A's kernel stack and
   thread_struct. Loads B's registers from B's saved state.

7. **__switch_to()** at process_64.c:610: Switches FPU state, segment
   registers, TLS, and updates the per-CPU current_task to point to B.

8. **B resumes**: B's execution continues from where it last called
   switch_to(). It runs finish_task_switch(A) at line 5301 to clean up.

9. **A sleeps**: A's state is fully saved. When it is selected to run again,
   steps 4-8 will repeat in reverse.


## Hands-On Challenges

### Challenge 1: Count Context Switches (60 XP)

Write a program that:
1. Reads /proc/[pid]/status to find voluntary (voluntary_ctxt_switches) and
   involuntary (nonvoluntary_ctxt_switches) context switch counts.
2. Runs a CPU-bound loop and measures involuntary switches.
3. Runs an I/O-bound loop (reading files) and measures voluntary switches.
4. Uses sched_yield() and measures its effect on switch counts.

Correlate the switch_count tracking in __schedule() (nivcsw at line 6822
vs nvcsw at line 6848) with your measurements.

Verification: Show measurements for all three workload types with
explanations referencing the kernel counter update code.

### Challenge 2: Trace a Context Switch with ftrace (80 XP)

Enable the sched_switch ftrace event and capture 10 context switches. For
each switch, document:
- The prev and next task PIDs and states.
- Whether it was voluntary or involuntary (check the prev_state field).
- The time between switches (measure context switch latency).

Then enable function_graph tracing on context_switch() and capture the
function call tree. Map each function call to the source code walkthrough.

Verification: Show ftrace output with at least 10 switches annotated,
plus the function_graph output mapped to source code.

### Challenge 3: Measure Context Switch Cost (60 XP)

Write a benchmark using two threads ping-ponging on a pipe or eventfd.
Each write/read pair forces a context switch. Measure:
- The average context switch time in nanoseconds.
- How the cost changes with different numbers of CPUs active.
- The impact of running on the same core vs different cores.

Explain the results in terms of cache and TLB effects (switch_mm costs).

Verification: Show benchmark results with at least 3 configurations and
explanations of the performance differences.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Trace __schedule() at core.c:6764 through the complete decision path
      to context_switch() at line 5238.
- [ ] Explain the four MM switch cases in context_switch() (lines 5259-5285):
      kernel-to-kernel, user-to-kernel, kernel-to-user, and user-to-user.
- [ ] Describe what __switch_to() at process_64.c:610 saves and restores:
      FPU, segments, TLS, PKRU, and per-CPU current_task.
- [ ] Explain the role of finish_task_switch() at core.c:5112 and why it
      runs in the context of the new task.
- [ ] Distinguish voluntary (nvcsw) from involuntary (nivcsw) context
      switches and identify where each counter is updated.
- [ ] Describe lazy TLB mode and when the kernel avoids loading new page
      tables during a context switch.
