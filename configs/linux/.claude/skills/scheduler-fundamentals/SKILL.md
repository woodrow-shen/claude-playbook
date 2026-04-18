---
name: scheduler-fundamentals
description: Learn how the kernel decides which process runs next on each CPU
realm: scheduler
category: scheduling-basics
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
- process-lifecycle
unlocks:
- context-switching
- rt-and-deadline-scheduling
- cpu-topology-and-load-balancing
- sched-ext
kernel_files:
- kernel/sched/core.c
- kernel/sched/fair.c
- kernel/sched/sched.h
- include/linux/sched.h
doc_files:
- Documentation/scheduler/sched-design-CFS.rst
- Documentation/scheduler/index.rst
badge: Time Lord
tags:
- scheduler
- cfs
- context-switch
- runqueue
---


# Scheduler Fundamentals

The scheduler decides which process runs on which CPU and for how long. It runs
thousands of times per second, making split-microsecond decisions that determine
system responsiveness and throughput.

## Learning Objectives

After completing this skill, you will be able to:

- Describe the scheduler class hierarchy and how CFS works
- Trace schedule() and the context switch path
- Explain virtual runtime (vruntime) and the CFS red-black tree
- Understand per-CPU runqueues and load balancing
- Read /proc/sched_debug and /proc/<pid>/sched

## Core Concepts

### Scheduler Classes

Linux uses pluggable scheduler classes (struct sched_class in kernel/sched/sched.h):

1. **stop_sched_class**: highest priority. CPU hotplug and migration.
2. **dl_sched_class**: SCHED_DEADLINE with EDF (Earliest Deadline First).
3. **rt_sched_class**: SCHED_FIFO and SCHED_RR real-time (kernel/sched/rt.c).
4. **fair_sched_class**: SCHED_NORMAL (CFS, kernel/sched/fair.c). Most tasks.
5. **idle_sched_class**: runs when nothing else is runnable.

When picking next task, classes are checked in priority order. First class with
a runnable task wins.

### CFS: Completely Fair Scheduler

CFS (kernel/sched/fair.c) tracks CPU time via **virtual runtime (vruntime)**.
Tasks with less vruntime are "owed" CPU time and run next.

Key mechanics:
- Each task's sched_entity has a vruntime field
- vruntime increases as the task runs, scaled by nice priority
  (lower nice = slower vruntime growth = more CPU time)
- Runnable tasks stored in a red-black tree sorted by vruntime
- Leftmost node (lowest vruntime) is always the next to run
- When current task's vruntime exceeds leftmost's, preemption happens

### Per-CPU Runqueues

Each CPU has struct rq (kernel/sched/sched.h):
- cfs: CFS runqueue (struct cfs_rq) with vruntime tree
- rt: RT runqueue
- dl: deadline runqueue
- nr_running: total runnable tasks
- curr: currently running task

Per-CPU runqueues avoid global locking.

### The schedule() Function

schedule() (kernel/sched/core.c) is the context switch entry point. Called when:
- Task voluntarily sleeps or yields
- Scheduler tick determines task ran long enough
- Higher-priority task becomes runnable (preemption)

Inside __schedule():
1. pick_next_task() asks each class (priority order) for best candidate
2. For CFS: picks task with lowest vruntime
3. If picked task differs from current: context_switch()

### Context Switch

context_switch() (kernel/sched/core.c):
1. switch_mm() -- switches address space (new page tables via CR3 on x86)
2. switch_to() -- switches register state (stack pointer, instruction pointer)

After switch_to(), CPU executes the new task with new stack and address space.

### Preemption

Preemption points:
- Returning from interrupt/syscall to userspace (check TIF_NEED_RESCHED)
- Returning from interrupt to kernel (if CONFIG_PREEMPT)
- Explicit cond_resched() in long kernel code paths

## Code Walkthrough

### Exercise 1: Trace schedule()

1. kernel/sched/core.c: find __schedule()
2. Note pick_next_task() -- the core decision
3. It iterates sched classes via for_each_class
4. CFS: pick_next_task_fair() picks leftmost vruntime entity
5. If new task != current: context_switch()
6. context_switch() calls switch_mm_irqs_off() and switch_to()

### Exercise 2: Observe CFS vruntime

On a running system:
```
cat /proc/<pid>/sched
```
Look for se.vruntime. Compare across processes. Recently-run tasks have
higher vruntime.

### Exercise 3: Scheduler Tick

1. Find scheduler_tick() in kernel/sched/core.c
2. It calls curr->sched_class->task_tick() (task_tick_fair for CFS)
3. task_tick_fair() updates vruntime, checks if preemption needed
4. If current vruntime exceeds leftmost's, resched_curr() sets TIF_NEED_RESCHED

## Hands-On Challenges

### Challenge 1: Scheduler Class Chain (XP: 60)

Find every struct sched_class definition. For each, list implemented functions
(enqueue_task, dequeue_task, pick_next_task, task_tick). Create comparison table.

### Challenge 2: CFS Priority Experiment (XP: 70)

Run two CPU-bound processes with different nice values (0 and 10). Monitor CPU
usage. Calculate actual time ratio and compare with theoretical ratio from
prio_to_weight[] in kernel/sched/fair.c.

### Challenge 3: Context Switch Cost (XP: 70)

Read /proc/schedstat for a CPU. Write a program forcing many context switches
(two processes ping-ponging via pipe). Measure switch rate. Trace context_switch()
to understand what happens each time.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Name all scheduler classes in priority order with use cases
- [ ] Explain vruntime, CFS red-black tree, and fairness mechanism
- [ ] Trace schedule() from entry through pick_next_task to context_switch
- [ ] Describe what happens in a context switch (address space + registers)
- [ ] Read /proc/<pid>/sched and explain scheduler statistics
