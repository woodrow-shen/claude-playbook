---
name: lockdep-validation
description: Learn the kernel's runtime locking correctness validator
realm: concurrency
category: debugging
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - spinlocks-and-mutexes
unlocks: []
kernel_files:
  - kernel/locking/lockdep.c
  - include/linux/lockdep.h
doc_files:
  - Documentation/locking/lockdep-design.rst
badge: Deadlock Detective
tags:
  - lockdep
  - deadlock
  - validation
---

# Lockdep: Runtime Lock Validation

## Quest Briefing

Deadlocks are among the most insidious bugs in the kernel. They can lurk in
code for months, only triggering under rare timing conditions. The lockdep
subsystem (kernel/locking/lockdep.c) is the kernel's answer: a runtime
locking correctness validator that detects potential deadlocks before they
actually occur.

Lockdep works by tracking every lock acquisition and building a directed
graph of lock dependencies. If thread A takes lock X then lock Y, lockdep
records "X -> Y". If another code path takes Y then X, lockdep detects the
cycle and reports a potential deadlock -- even if the two code paths have
never actually executed concurrently. The system catches lock inversion
scenarios, circular dependencies, and hardirq/softirq safety violations.

As stated in the source (lockdep.c lines 15-27): "If anytime in the past
two locks were taken in a different order, even if it happened for another
task, even if those were different locks (but of the same class as this
lock), this code will detect it." This is the power of lockdep: it reasons
about lock classes rather than individual lock instances.


## Learning Objectives

- Explain the concept of lock classes and how lockdep groups locks.
- Describe the dependency graph and how lockdep detects potential deadlocks.
- Trace the __lock_acquire() path and understand the validation checks.
- Understand the BFS (breadth-first search) algorithm used for cycle detection.
- Interpret lockdep warnings and use them to fix real locking bugs.


## Core Concepts

### Lock Classes and Keys

Lockdep does not track individual lock instances. Instead, it groups locks
into "classes" based on their lock_class_key (defined in
include/linux/lockdep.h:119-120 with lockdep_register_key and
lockdep_unregister_key). Two locks with the same key are considered the same
class -- they must always be acquired in the same order.

The struct lock_class (defined in include/linux/lockdep_types.h:98) represents
a class. Each class tracks:
- Its name and key for identification.
- Lists of dependencies: locks that are acquired after this class (forward
  dependencies) and locks that are acquired before (backward dependencies).
- Usage state: whether the class has been held in hardirq context, softirq
  context, and with/without interrupts enabled.

The struct held_lock (lockdep_types.h:206) represents a currently held lock
instance on a per-task stack. Each task's held_lock array tracks the task's
current lock nesting.

### The Dependency Graph

Every time a task acquires lock B while already holding lock A, lockdep
records the dependency A -> B. The function validate_chain() at lockdep.c:3861
is the core validation entry point called from __lock_acquire().

validate_chain() calls check_deadlock() at line 3057 to check for self-
deadlocks (acquiring the same lock class twice without nesting annotation).
Then it checks for circular dependencies by searching the graph.

The dependency graph uses struct lock_list entries linked into per-class
dependency lists. Each dependency records:
- The source and target lock classes.
- Whether the dependency was observed with the source lock held for read
  or write.
- The call trace where the dependency was first observed.

### BFS Cycle Detection

Lockdep uses breadth-first search to detect cycles in the dependency graph.
The core BFS function __bfs() at lockdep.c:1733 traverses dependencies:

1. It starts from a source lock_list entry.
2. __bfs_next() at line 1697 returns the next dependency to explore.
3. The search continues through forward or backward dependencies.
4. __bfs_forwards() (line 1842) searches forward: "if I hold X, what could
   I then take?"
5. __bfs_backwards() (line 1854) searches backward: "what locks lead to
   taking X?"

A cycle is detected when the BFS search reaches the starting lock class.
The search also considers dependency strength: read-vs-write lock distinctions
affect whether a cycle represents a real deadlock (see the comment at line
1726 about strong dependency paths).

### IRQ Safety Validation

Lockdep also validates hardirq/softirq safety. If a lock is ever held with
interrupts enabled, and the same lock class is later acquired in an interrupt
handler, lockdep reports an unsafe locking scenario. The usage_accumulate()
function (referenced at line 2796) tracks lock usage across different contexts.

The prove_locking parameter (line 70) controls whether this validation is
active. When CONFIG_PROVE_LOCKING is enabled, lockdep performs the full
validation on every lock operation.

### Performance Considerations

Lockdep has significant overhead: it runs on every lock operation. The
lockdep_recursion per-CPU variable (line 113, exported at line 114) prevents
re-entrant calls into lockdep. The lockdep_enabled() function (line 116)
checks both debug_locks and recursion depth before proceeding.

The lock_stat feature (controlled by CONFIG_LOCK_STAT, line 77) adds
contention statistics gathering on top of the validation, accessible via
/proc/lock_stat.


## Code Walkthrough

Trace what happens when a task acquires a lock with lockdep enabled:

1. **lock_acquire() called**: The lock primitive (spin_lock, mutex_lock, etc.)
   calls lock_acquire() which is the lockdep entry point for acquisitions.
   This is registered via lockdep_init_map() using the lock_class_key.

2. **__lock_acquire() executes**: This is the core function in lockdep.c.
   It looks up or creates the lock_class for the given key, then pushes a
   new held_lock entry onto the task's held_lock stack.

3. **validate_chain() at line 3861**: For each new acquisition, lockdep
   validates the dependency chain. It checks:
   - check_deadlock() at line 3057: Is this a self-deadlock?
   - Does adding this dependency create a cycle in the graph?

4. **BFS search via __bfs() at line 1733**: If a new dependency edge is
   added, lockdep runs BFS to check for cycles. __bfs_forwards() and
   __bfs_backwards() traverse the graph looking for paths that would
   form a cycle.

5. **Warning or success**: If a violation is found, lockdep prints a
   detailed warning with the lock classes involved, the dependency chain,
   and the call traces where each dependency was first observed. If no
   violation is found, the acquisition proceeds normally.


## Hands-On Challenges

### Challenge 1: Trigger a Lockdep Warning (100 XP)

Write a kernel module that deliberately creates a lock ordering violation:
- Create two mutex locks A and B.
- In one code path, acquire A then B.
- In another code path, acquire B then A.
- Both paths must execute (the actual deadlock need not occur).

Capture the lockdep warning from dmesg. For each line of the warning:
- Identify which lockdep function generated it.
- Explain the lock classes and dependency chain shown.
- Map the call traces to your module's source code.

Verification: Show the complete lockdep warning with line-by-line annotation.

### Challenge 2: Read /proc/lockdep and /proc/lock_stat (100 XP)

On a running kernel with CONFIG_PROVE_LOCKING and CONFIG_LOCK_STAT enabled:
- Examine /proc/lockdep_stats and explain each counter.
- Find 5 lock classes in /proc/lockdep and trace each to its definition
  in the kernel source.
- Use /proc/lock_stat to identify the most contended locks on your system.
- Explain how the lock_stat data is collected (reference lockdep.c line 77).

Verification: Show /proc output with explanations for at least 5 lock classes
and the top 3 contended locks.

### Challenge 3: Understand a Real Lockdep Splat (100 XP)

Find a real lockdep warning from the kernel mailing list (LKML) or bugzilla.
For the warning:
- Identify the two (or more) conflicting lock orderings.
- Draw the dependency cycle.
- Trace through the BFS algorithm (__bfs at lockdep.c:1733) showing how
  it would detect this specific cycle.
- Explain the fix that was applied (or propose one).

Verification: Show the original warning, your dependency cycle diagram, and
the BFS trace with source code references.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain lock classes vs lock instances and why lockdep uses classes
      (struct lock_class at lockdep_types.h:98, keyed by lock_class_key).
- [ ] Describe the dependency graph structure and how new edges are added
      during __lock_acquire().
- [ ] Trace the validation path through validate_chain() (lockdep.c:3861)
      and check_deadlock() (lockdep.c:3057).
- [ ] Explain the BFS cycle detection in __bfs() (lockdep.c:1733) including
      forward and backward traversal.
- [ ] Interpret a lockdep warning: identify the conflicting orderings, the
      lock classes, and the call traces.
- [ ] Describe IRQ safety validation and how lockdep catches locks used
      unsafely across interrupt contexts.
- [ ] Explain the performance overhead of lockdep and why it is typically
      a debug-only configuration.
