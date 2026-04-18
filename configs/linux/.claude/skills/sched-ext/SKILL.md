---
name: sched-ext
description: Explore the BPF-extensible scheduling class for custom schedulers
realm: scheduler
category: scheduling
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - scheduler-fundamentals
  - ebpf-programs
unlocks: []
kernel_files:
  - kernel/sched/ext.c
  - kernel/sched/ext.h
doc_files:
  - Documentation/scheduler/sched-ext.rst
badge: Scheduler Architect
tags:
  - sched-ext
  - bpf
  - extensible
---

# sched_ext: BPF-Extensible Scheduling

## Quest Briefing

What if you could write a custom CPU scheduler without modifying the kernel?
sched_ext (the extensible scheduling class) makes this possible. It allows
BPF programs loaded from userspace to implement scheduling policies -- task
enqueueing, dispatching, CPU selection, and more -- all while the kernel
ensures safety guarantees prevent the BPF scheduler from crashing the system.

Introduced by Tejun Heo and David Vernet at Meta, sched_ext lives in
kernel/sched/ext.c. It operates as a scheduling class alongside CFS, RT,
and DEADLINE. When enabled, tasks assigned to the ext class have their
scheduling decisions delegated to BPF callbacks. The BPF scheduler organizes
tasks into dispatch queues (DSQs) and the kernel consumes from them.

This represents a fundamental shift in kernel scheduling philosophy. Instead
of a one-size-fits-all scheduler compiled into the kernel, sched_ext enables
rapid prototyping, workload-specific optimization, and scheduler research
without kernel rebuilds. Gaming workloads, data center scheduling, and
research schedulers can all be implemented as BPF programs.


## Learning Objectives

- Explain the sched_ext architecture: BPF callbacks, dispatch queues, and
  the enable/disable lifecycle.
- Trace the task enqueue and dispatch paths through the ext scheduling class.
- Understand the dispatch queue (DSQ) model and how tasks flow through it.
- Describe the safety mechanisms: watchdog, bypass mode, and error handling.
- Identify the key BPF kfuncs available to sched_ext schedulers.


## Core Concepts

### The scx_sched and sched_ext_ops Structures

The core of sched_ext is the struct scx_sched, defined at
kernel/sched/ext_internal.h:887. It contains:
- ops: A struct sched_ext_ops holding the BPF callback function pointers
  for all scheduling operations.
- has_op: A bitmap tracking which ops callbacks are provided by the BPF
  scheduler (line 889).
- dsq_hash: An rhashtable mapping DSQ IDs to dispatch queue structures
  (line 899).
- global_dsqs: Per-node global dispatch queues for the default dispatch
  path (line 900).
- exit_kind: Atomic variable tracking how the scheduler exited (line 910).

The global scx_root variable (ext.c:20) holds the RCU-protected pointer to
the active scx_sched instance. The __scx_enabled static key (line 33) is
used for zero-cost checking of whether sched_ext is active.

### Enable/Disable Lifecycle

sched_ext schedulers are enabled and disabled through a state machine tracked
by scx_enable_state_var (ext.c:35), initialized to SCX_DISABLED. The
scx_enable_mutex (line 32) serializes enable/disable operations.

The lifecycle:
1. A userspace program loads a BPF struct_ops program implementing
   sched_ext_ops.
2. The kernel calls the enable path, transitioning through states tracked
   by scx_enable_state() at line 731 and scx_set_enable_state() at line 736.
3. scx_tryset_enable_state() at line 741 performs atomic state transitions.
4. scx_switching_all (line 41) controls whether all tasks or only
   explicitly opted-in tasks use the BPF scheduler.
5. On disable, the kernel transitions back and all tasks fall back to CFS.

The scx_enable_seq counter (line 59) is a monotonically increasing sequence
number incremented each time a scheduler is enabled.

### Dispatch Queues (DSQs)

Dispatch queues are the central abstraction in sched_ext. Tasks are placed
into DSQs by the BPF scheduler, and the kernel consumes tasks from DSQs to
run them. There are several types:

- **Global DSQ** (SCX_DSQ_GLOBAL): Split per-node for scalability (see the
  comment at ext_internal.h:894-896). find_global_dsq() at ext.c:248
  locates the per-node global DSQ.
- **User DSQs**: Created by the BPF scheduler with unique IDs.
  find_user_dsq() at ext.c:254 looks them up in the dsq_hash.
- **Local DSQs**: Per-CPU queues for direct dispatch.

The dispatch_enqueue() function at ext.c:1017 handles inserting tasks into
DSQs. It supports two ordering modes:
- FIFO dispatch: Tasks are added to the tail of the queue (line 1044).
- PRIQ (priority queue) dispatch: Tasks are ordered by virtual time
  (line 1056).

dispatch_dequeue() at line 1147 removes tasks from DSQs.

### Direct Dispatch

The direct_dispatch_task per-CPU variable (ext.c:99) enables a fast path
where the BPF scheduler can dispatch a task directly to a local DSQ during
the enqueue callback, bypassing the normal DSQ routing. This is the hot
path for simple schedulers.

### Safety Mechanisms

sched_ext includes several safety mechanisms:

1. **Watchdog**: scx_watchdog_timeout (line 66) defines the maximum time
   a task can be runnable without being scheduled. If exceeded,
   scx_watchdog_work (line 76) triggers an error and the BPF scheduler
   is disabled. scx_watchdog_timestamp (line 74) tracks the last watchdog
   check.

2. **Bypass mode**: When errors are detected, scx_bypass_depth (line 36)
   is incremented and the system falls back to simple FIFO scheduling
   using the global DSQ. This ensures the system remains functional even
   if the BPF scheduler misbehaves.

3. **Error reporting**: scx_error() triggers scheduler shutdown with an
   error message. The exit_info in scx_sched (ext_internal.h:911) records
   the exit reason.

4. **Task tracking**: A dedicated task list (scx_tasks at ext.c:29,
   protected by scx_tasks_lock at line 28) tracks every task from fork to
   free, ensuring safe iteration during disable.

### BPF Kfuncs

The BPF scheduler interacts with the kernel through kfuncs (kernel functions
callable from BPF). Key kfuncs include:

- scx_bpf_dispatch_nr_slots() at ext.c:6195: Returns the remaining dispatch
  slots available.
- scx_bpf_dispatch_cancel() at ext.c:6217: Cancels the latest dispatch.
- BTF_ID_FLAGS entries at line 6386 register these kfuncs for BPF access.

The kfunc interface (line 5950 comment) allows dispatching multiple tasks
from the BPF scheduler during a single dispatch cycle.

### ext.h: The Scheduling Class Interface

kernel/sched/ext.h defines the interface between sched_ext and the core
scheduler. Key functions:
- scx_tick() at line 11: Called every scheduler tick.
- init_scx_entity() at line 12: Initializes a task's scx entity.
- scx_pre_fork/scx_fork/scx_post_fork (lines 13-15): Task creation hooks.
- task_on_scx() at line 33: Checks if a task is using the ext class
  (requires scx_enabled() and p->sched_class == &ext_sched_class).


## Code Walkthrough

Trace a task being scheduled by a BPF sched_ext scheduler:

1. **Scheduler loaded**: A userspace program loads a BPF struct_ops
   implementing sched_ext_ops. The kernel enables scx via the state machine,
   setting __scx_enabled (ext.c:33) to true.

2. **Task wakes up**: The task becomes runnable. The ext scheduling class's
   enqueue callback is invoked. The BPF ops.enqueue() decides which DSQ to
   place the task in.

3. **Direct dispatch check**: If the BPF callback sets direct_dispatch_task
   (ext.c:99), the task goes straight to a local DSQ via dispatch_enqueue()
   at line 1017.

4. **Normal dispatch**: Otherwise, the task enters a DSQ. The BPF scheduler
   may use user-created DSQs or the global DSQ.

5. **CPU picks task**: When a CPU needs work, it calls the ext class's
   dispatch path. The kernel iterates DSQs via nldsq_next_task() at
   line 441 to find the next task to run.

6. **Task runs**: The task executes on the CPU. scx_tick() (ext.h:11) is
   called each tick for accounting.

7. **Watchdog check**: The watchdog (scx_watchdog_work at ext.c:76)
   periodically verifies no task has been runnable too long without
   being scheduled.


## Hands-On Challenges

### Challenge 1: Read the sched_ext Source Structure (100 XP)

Map the complete sched_ext source layout:
- List all functions in ext.h (lines 11-23) and explain each hook.
- Document the scx_sched structure (ext_internal.h:887) field by field.
- Identify all global variables in ext.c (lines 20-99) and their purpose.
- Draw the relationship between scx_sched, DSQs, and the per-CPU state.

Verification: Produce a complete annotated map with at least 15 functions
and 10 global variables accurately documented.

### Challenge 2: Analyze an scx Scheduler (100 XP)

Find an example sched_ext BPF scheduler (e.g., scx_simple from the
tools/sched_ext directory or the scx project on GitHub). For the scheduler:
- Identify which ops callbacks it implements.
- Trace the enqueue -> dispatch -> pick path through the BPF code and
  the kernel ext.c code.
- Explain the DSQ strategy used.
- Identify how it handles edge cases (CPU hotplug, task migration).

Verification: Show annotated BPF source with kernel code path mappings for
at least 3 ops callbacks.

### Challenge 3: Safety Mechanism Exploration (100 XP)

Examine the sched_ext safety mechanisms:
- Trace the watchdog path from scx_watchdog_timeout (ext.c:66) through
  scx_watchdog_work (line 76).
- Explain the bypass mode (scx_bypass_depth at line 36) and what happens
  to running tasks when bypass activates.
- Document the error handling path through scx_error() and exit_info.
- Explain why scx_tasks (line 29) maintains a separate task list.

Verification: Show the complete safety mechanism flow with source code
references for each component.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain the sched_ext architecture: struct scx_sched
      (ext_internal.h:887), sched_ext_ops, and the DSQ model.
- [ ] Describe the enable/disable lifecycle managed by scx_enable_state_var
      (ext.c:35) and scx_enable_mutex (line 32).
- [ ] Trace the dispatch path through dispatch_enqueue() (ext.c:1017) and
      dispatch_dequeue() (ext.c:1147) for both FIFO and PRIQ ordering.
- [ ] Explain the global DSQ split per-node (ext_internal.h:894) and
      the user DSQ lookup via find_user_dsq() (ext.c:254).
- [ ] Describe the watchdog mechanism (scx_watchdog_timeout at ext.c:66)
      and bypass mode (scx_bypass_depth at line 36).
- [ ] Identify the BPF kfunc interface including scx_bpf_dispatch_nr_slots()
      (ext.c:6195) and scx_bpf_dispatch_cancel() (ext.c:6217).
- [ ] Explain why task_on_scx() (ext.h:33) checks both scx_enabled() and
      the task's sched_class.
