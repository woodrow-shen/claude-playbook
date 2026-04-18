---
name: rt-and-deadline-scheduling
description: Master real-time and deadline scheduling policies in the kernel
realm: scheduler
category: scheduling
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - scheduler-fundamentals
unlocks: []
kernel_files:
  - kernel/sched/rt.c
  - kernel/sched/deadline.c
doc_files:
  - Documentation/scheduler/sched-rt-group.rst
  - Documentation/scheduler/sched-deadline.rst
badge: Deadline Master
tags:
  - rt
  - deadline
  - sched-fifo
  - cbs
---

# Real-Time and Deadline Scheduling

## Quest Briefing

While CFS handles the majority of tasks with its fair-share approach, some
workloads demand deterministic timing guarantees. Audio processing, industrial
control, and robotics cannot tolerate unbounded scheduling delays. The Linux
kernel provides two real-time scheduling classes: the traditional POSIX
real-time class (SCHED_FIFO and SCHED_RR) and the newer deadline class
(SCHED_DEADLINE).

The RT scheduling class in kernel/sched/rt.c implements fixed-priority
scheduling. Tasks with higher static priorities always preempt those with
lower priorities. SCHED_FIFO tasks run until they voluntarily yield;
SCHED_RR tasks get a time slice and round-robin among tasks of equal
priority. The RT class supports up to 100 priority levels.

The deadline scheduling class in kernel/sched/deadline.c implements
Earliest Deadline First (EDF) combined with Constant Bandwidth Server (CBS).
Each task declares its runtime, deadline, and period. The scheduler always
runs the task with the earliest absolute deadline. CBS ensures that tasks
that overrun their budget are throttled rather than stealing time from others.

Understanding these classes is critical for anyone working on latency-sensitive
kernel subsystems or real-time Linux applications.


## Learning Objectives

- Explain the priority-based scheduling of SCHED_FIFO and SCHED_RR policies.
- Trace the enqueue, dequeue, and pick_next paths in the RT scheduling class.
- Describe the EDF+CBS algorithm and the sched_dl_entity parameters.
- Follow the deadline task lifecycle: admission, replenishment, and throttling.
- Understand RT bandwidth throttling and the safety mechanisms that prevent
  RT tasks from starving the system.


## Core Concepts

### RT Scheduling Class: SCHED_FIFO and SCHED_RR

The RT class is implemented in kernel/sched/rt.c. The core data structure is
struct rt_prio_array, which contains a bitmap and an array of 100 run queues
(MAX_RT_PRIO), one per priority level. The init_rt_rq() function at line 68
initializes this structure.

Key scheduling parameters are controlled via sysctl:
- sched_rt_period_us (line 18): The period over which RT bandwidth is
  measured, default 1 second (1000000 us).
- sched_rt_runtime_us (line 24): The maximum RT runtime per period, default
  950ms (950000 us). This means RT tasks can use at most 95% of CPU time,
  leaving 5% for non-RT tasks.
- sched_rr_timeslice_ms (line 27): The time slice for SCHED_RR tasks,
  default RR_TIMESLICE.

The sched_rr_timeslice variable (line 10) controls the actual timeslice in
jiffies for SCHED_RR.

### RT Enqueueing and Task Selection

When an RT task becomes runnable, enqueue_task_rt() at line 1431 places it
into the rt_prio_array at its priority level. The bitmap is updated so the
scheduler can quickly find the highest-priority runnable task.

dequeue_task_rt() at line 1450 removes a task from the run queue.

Task selection uses _pick_next_task_rt() at line 1689, which scans the bitmap
to find the highest-priority bit (lowest numerical value = highest priority)
and returns the first task from that priority queue.

task_tick_rt() at line 2520 handles the timer tick for RT tasks:
- For SCHED_FIFO: No time slice -- the task runs until it yields or blocks.
- For SCHED_RR: Decrements the time slice. When it expires, the task is
  moved to the end of its priority queue (round-robin).

The complete scheduling class operations are registered at line 2582 with the
DEFINE_SCHED_CLASS(rt) structure.

### Deadline Scheduling: EDF + CBS

The deadline class in kernel/sched/deadline.c implements a fundamentally
different approach. Instead of fixed priorities, each task specifies:

- dl_runtime: Maximum execution time per period (struct sched_dl_entity
  at include/linux/sched.h:652).
- dl_deadline: Relative deadline from the start of each period (line 653).
- dl_period: The separation between task instances (line 654).
- dl_bw: Bandwidth = dl_runtime / dl_period (line 655).

The scheduler always picks the task with the earliest absolute deadline.
This is Earliest Deadline First (EDF), proven optimal for uniprocessor
preemptive scheduling of periodic tasks.

Sysctl parameters limit deadline periods:
- sched_deadline_period_max_us (line 30): Maximum period, ~4 seconds.
- sched_deadline_period_min_us (line 31): Minimum period, 100 us.

### Deadline Task Lifecycle

The deadline task lifecycle involves:

1. **Admission**: When a task is set to SCHED_DEADLINE, the kernel performs
   an admission test to ensure total bandwidth does not exceed available CPU
   capacity. dl_bw_alloc() at sched.h:1886 reserves bandwidth.

2. **Activation**: When the task becomes runnable, update_dl_entity() at
   deadline.c:1023 sets up the current deadline based on the current time
   and the task's dl_deadline parameter.

3. **Replenishment**: replenish_dl_entity() at line 795 is called when
   a new period starts. replenish_dl_new_period() at line 721 resets the
   runtime budget and computes the new absolute deadline.

4. **Execution and throttling**: The task runs until its runtime budget is
   exhausted. If it overruns, the CBS algorithm kicks in -- the task is
   throttled and its deadline is pushed forward. This prevents budget
   overruns from affecting other tasks.

5. **Enqueueing**: enqueue_task_dl() at line 717 (forward-declared) places
   the task on the deadline run queue, ordered by absolute deadline. The
   dl_rq uses a red-black tree for efficient O(log n) insertion and
   extraction.

### RT Bandwidth Throttling

To prevent RT tasks from starving the entire system, the kernel enforces a
bandwidth limit. With the default settings (sched_rt_runtime_us = 950000,
sched_rt_period_us = 1000000), RT tasks are throttled after using 95% of
each one-second period. The remaining 5% is reserved for SCHED_NORMAL tasks
and essential kernel work. The max_rt_runtime constant (line 12) defines the
upper limit.


## Code Walkthrough

Trace a SCHED_DEADLINE task through one complete period:

1. **Task set to SCHED_DEADLINE**: The sched_setattr() syscall configures
   dl_runtime=10ms, dl_deadline=30ms, dl_period=50ms. The kernel checks
   admission via dl_bw_alloc() -- total bandwidth must not exceed capacity.

2. **Period starts**: update_dl_entity() at deadline.c:1023 computes the
   absolute deadline = now + dl_deadline. replenish_dl_new_period() at
   line 721 sets runtime_remaining = dl_runtime.

3. **Task enqueued**: enqueue_task_dl() places the task in the deadline
   red-black tree, keyed by absolute deadline.

4. **Task selected**: The scheduler picks this task because it has the
   earliest absolute deadline among all SCHED_DEADLINE tasks.

5. **Task runs**: The task executes for up to 10ms. task_tick_dl checks
   runtime consumption each tick.

6. **Budget exhausted**: If the task uses all 10ms of runtime, it is
   throttled. A replenishment timer is armed for the start of the next
   period.

7. **New period**: When the timer fires, replenish_dl_entity() at line 795
   grants a new 10ms budget and recomputes the deadline. The task is
   re-enqueued and can be selected again.


## Hands-On Challenges

### Challenge 1: RT Priority Ordering (100 XP)

Write a program that creates 5 SCHED_FIFO threads at priorities 10, 20, 30,
40, and 50. Each thread does a CPU-bound workload. On a single CPU, verify:
- Threads run strictly in priority order (50 first, then 40, etc.).
- A lower-priority thread never runs while a higher-priority thread is
  runnable.

Use /proc/[pid]/sched to observe scheduling statistics. Map the behavior to
_pick_next_task_rt() at rt.c:1689 and the priority bitmap search.

Verification: Show scheduling trace proving strict priority ordering with
source code references.

### Challenge 2: Deadline Scheduling Demo (100 XP)

Write a program that creates 3 SCHED_DEADLINE tasks with different parameters:
- Task A: runtime=5ms, deadline=20ms, period=30ms.
- Task B: runtime=10ms, deadline=25ms, period=50ms.
- Task C: runtime=3ms, deadline=10ms, period=20ms.

Run all three and trace the scheduling decisions with ftrace's sched_switch
event. Verify that the task with the earliest absolute deadline always runs
first. Show at least one case where the scheduling order changes as deadlines
shift.

Verification: Show ftrace output demonstrating EDF ordering across at least
3 deadline crossovers.

### Challenge 3: RT Throttling Observation (100 XP)

Write an RT task that attempts to use 100% of a CPU. Observe:
- The task being throttled after sched_rt_runtime_us (default 950ms).
- The throttled period lasting sched_rt_period_us - sched_rt_runtime_us.
- System responsiveness during the 5% non-RT window.

Modify sched_rt_runtime_us via sysctl and observe the behavior change.
Reference the bandwidth enforcement code in rt.c.

Verification: Show timing measurements demonstrating the throttling with
at least 2 different sched_rt_runtime_us values.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain SCHED_FIFO vs SCHED_RR scheduling and the role of the
      rt_prio_array bitmap (init_rt_rq at rt.c:68).
- [ ] Trace enqueue_task_rt (line 1431), _pick_next_task_rt (line 1689),
      and task_tick_rt (line 2520) for RT task lifecycle.
- [ ] Describe the sched_dl_entity fields: dl_runtime (sched.h:652),
      dl_deadline (653), dl_period (654), and dl_bw (655).
- [ ] Explain the EDF+CBS algorithm and how replenish_dl_entity()
      (deadline.c:795) grants new budgets and computes deadlines.
- [ ] Describe RT bandwidth throttling using sched_rt_period_us (rt.c:18)
      and sched_rt_runtime_us (rt.c:24).
- [ ] Explain admission control for SCHED_DEADLINE tasks and why it is
      necessary to prevent system overcommitment.
- [ ] Identify the sysctl parameters that tune RT and deadline scheduling
      behavior and their default values.
