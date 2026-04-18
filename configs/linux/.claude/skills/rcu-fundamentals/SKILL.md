---
name: rcu-fundamentals
description: Understand Read-Copy-Update for scalable read-side synchronization
realm: concurrency
category: synchronization
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - spinlocks-and-mutexes
unlocks: []
kernel_files:
  - kernel/rcu/tree.c
  - kernel/rcu/update.c
  - include/linux/rcupdate.h
doc_files:
  - Documentation/RCU/whatisRCU.rst
  - Documentation/RCU/rcu.rst
badge: RCU Sage
tags:
  - rcu
  - read-copy-update
  - grace-period
---

# RCU Fundamentals

## Quest Briefing

Read-Copy-Update (RCU) is one of the most important synchronization mechanisms
in the Linux kernel. Unlike traditional locks that force readers and writers to
take turns, RCU allows readers to access shared data structures without any
locks at all -- no atomic operations, no memory barriers, no cache-line
bouncing. Readers simply call rcu_read_lock(), access the data, and call
rcu_read_unlock(). The cost is nearly zero.

The trick is on the writer side. Instead of modifying data in place, the writer
creates a new version of the data structure, publishes it atomically using
rcu_assign_pointer(), and then waits for all pre-existing readers to finish
before freeing the old version. This waiting period is called a "grace period."
RCU is used extensively throughout the kernel -- routing tables, file
descriptors, module lists, and thousands of other data structures rely on it.

Understanding RCU is essential for working with any performance-critical kernel
subsystem. It is the foundation for lock-free read paths in networking, VFS,
and security modules.


## Learning Objectives

- Explain the RCU read-side and write-side protocols and why readers are wait-free.
- Trace the rcu_read_lock() and rcu_read_unlock() implementation for both
  preemptible and non-preemptible kernels.
- Describe what a grace period is and how the kernel detects quiescent states.
- Follow the synchronize_rcu() call path through the grace-period kthread.
- Understand call_rcu() for asynchronous callback-based reclamation.


## Core Concepts

### The RCU API: Read Side

The reader API is defined in include/linux/rcupdate.h. For non-preemptible
kernels (the common case), rcu_read_lock() simply disables preemption via
__rcu_read_lock() at line 101, which calls preempt_disable(). rcu_read_unlock()
re-enables preemption via __rcu_read_unlock() at line 106. This is why RCU
read-side critical sections have nearly zero overhead -- they are just
preemption disable/enable pairs.

For CONFIG_PREEMPT_RCU kernels, __rcu_read_lock() and __rcu_read_unlock() are
real functions (declared at lines 82-83) that manipulate a per-task nesting
counter: current->rcu_read_lock_nesting (accessed via the rcu_preempt_depth()
macro at line 91).

The key data access primitive is rcu_dereference(), which uses READ_ONCE() with
appropriate memory barriers to safely load an RCU-protected pointer. On the
write side, rcu_assign_pointer() uses smp_store_release() to publish a new
pointer value so that readers see a fully initialized structure.

### Grace Periods and Quiescent States

A grace period is the time window during which the kernel waits for all
pre-existing RCU readers to complete. The kernel detects this by tracking
"quiescent states" -- points where a CPU is known to not be in an RCU read-side
critical section. In non-preemptible kernels, a context switch is a quiescent
state because rcu_read_lock() disables preemption.

The grace-period machinery lives in kernel/rcu/tree.c. The core data structures
are:

- struct rcu_state (line 92): The global RCU state, including the grace-period
  sequence number (gp_seq), state machine (gp_state), and the combining tree.
- struct rcu_data (line 80): Per-CPU RCU data, defined with
  DEFINE_PER_CPU_SHARED_ALIGNED. Tracks each CPU's quiescent-state reporting.
- struct rcu_node: The combining tree nodes used to aggregate quiescent-state
  reports from CPUs up to the root.

When a CPU passes through a quiescent state, it calls rcu_report_qs_rdp()
(forward-declared at line 163) to report up the combining tree. The function
rcu_note_context_switch() is called from __schedule() at core.c:6794 to
report quiescent states on context switches.

### The Grace-Period Kthread

The grace-period kthread (rcu_gp_kthread at tree.c:2271) is the heart of RCU.
It runs a loop that:

1. Calls rcu_gp_init() at line 1804 to start a new grace period. This
   initializes the combining tree's qsmask bitmaps, marking which CPUs need
   to report quiescent states.
2. Waits for all CPUs to report quiescent states, which propagate up through
   the rcu_node combining tree via rcu_report_qs_rnp().
3. Calls rcu_gp_cleanup() at line 2150 to end the grace period. This advances
   the gp_seq counter and processes the rcu_sr_normal_gp_cleanup_work to wake
   synchronize_rcu() waiters.

The rcu_gp_kthread_wake() function (line 1119) is called to wake the kthread
when new callbacks are enqueued.

### synchronize_rcu() and call_rcu()

synchronize_rcu() (declared at include/linux/rcupdate.h:53) is the synchronous
API: it blocks the caller until a full grace period has elapsed. Internally,
it enqueues a callback and waits for it to be invoked after the grace period
completes.

call_rcu() (declared at include/linux/rcupdate.h:51) is the asynchronous API.
It takes an rcu_head embedded in the data structure and a callback function.
The callback is invoked after a grace period, typically to free the old
structure. call_rcu_hurry() (line 121) is a variant that requests expedited
processing.


## Code Walkthrough

Trace a typical RCU-protected linked list update:

1. **Reader path**: A reader calls rcu_read_lock() which disables preemption.
   It then calls rcu_dereference(pointer) to load the RCU-protected pointer
   with appropriate memory ordering. It accesses the data structure, then
   calls rcu_read_unlock() to re-enable preemption.

2. **Writer prepares new version**: The writer allocates a new node, copies
   the old data, and makes modifications to the new copy.

3. **Writer publishes**: The writer calls rcu_assign_pointer() to atomically
   replace the old pointer with the new one. Existing readers still see the
   old version -- this is safe because they are in an RCU read-side critical
   section.

4. **Writer waits**: The writer calls synchronize_rcu() or call_rcu() with
   the old structure. synchronize_rcu() blocks until the grace period
   completes. The grace-period kthread (rcu_gp_kthread at tree.c:2271)
   initializes the grace period via rcu_gp_init(), waits for all CPUs to
   pass through quiescent states, then runs rcu_gp_cleanup().

5. **Old version freed**: After the grace period, the old structure is freed.
   At this point, all readers that could have been accessing it have completed
   their rcu_read_unlock() calls.


## Hands-On Challenges

### Challenge 1: Map the RCU Combining Tree (75 XP)

Read kernel/rcu/tree.c and find the struct rcu_state definition at line 92.
Examine the rcu_node combining tree structure. For a system with 64 CPUs,
draw the tree layout showing:
- How many levels the tree has (controlled by RCU_NUM_LVLS and rcu_num_lvls
  at line 125).
- How rcu_fanout_leaf (line 123) determines the fan-out.
- How quiescent states propagate from leaf nodes to the root.

Verification: Your diagram should show the correct number of rcu_node
structures matching num_rcu_lvl[] (line 127) for 64 CPUs.

### Challenge 2: Trace synchronize_rcu() End-to-End (75 XP)

Starting from synchronize_rcu() declared at include/linux/rcupdate.h:53,
trace the complete call path through the kernel. Document:
- How the calling task blocks and waits.
- How start_poll_synchronize_rcu() (called at tree.c:3301) initiates polling.
- How rcu_gp_kthread (tree.c:2271) processes the grace period.
- How rcu_gp_cleanup (tree.c:2150) wakes the waiting task.

Verification: Show the complete call chain with file:line references.

### Challenge 3: Write an RCU-Protected Module (50 XP)

Write a kernel module that maintains an RCU-protected global pointer to a
struct containing a counter. Implement:
- A read function that uses rcu_read_lock/rcu_dereference/rcu_read_unlock.
- A write function that allocates a new struct, updates it, publishes with
  rcu_assign_pointer(), and frees the old version with call_rcu().
- A /proc entry exposing the counter.

Verification: Load the module, read the counter from /proc, update it
concurrently from multiple threads, and verify no crashes or data corruption.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain why rcu_read_lock() is nearly free on non-preemptible kernels
      (it maps to preempt_disable at include/linux/rcupdate.h:101).
- [ ] Describe the three core RCU data structures: rcu_state (tree.c:92),
      rcu_data (tree.c:80), and rcu_node combining tree.
- [ ] Trace the grace-period kthread loop at rcu_gp_kthread (tree.c:2271)
      through rcu_gp_init (tree.c:1804) and rcu_gp_cleanup (tree.c:2150).
- [ ] Explain the difference between synchronize_rcu() and call_rcu() and
      when to use each.
- [ ] Describe how quiescent states are reported via rcu_note_context_switch()
      and propagated through the combining tree by rcu_report_qs_rnp().
- [ ] Identify at least 3 kernel subsystems that use RCU and explain why
      RCU is a good fit for each.
