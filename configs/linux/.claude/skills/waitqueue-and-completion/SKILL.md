---
name: waitqueue-and-completion
description: Understand wait queues and completion variables for sleeping and waking tasks
realm: events
category: synchronization
difficulty: beginner
xp: 150
estimated_minutes: 90
prerequisites:
  - process-lifecycle
unlocks:
  - epoll-internals
kernel_files:
  - kernel/sched/wait.c
  - kernel/sched/completion.c
  - include/linux/wait.h
  - include/linux/completion.h
doc_files:
  - Documentation/scheduler/completion.rst
badge: Wait Watcher
tags:
  - waitqueue
  - completion
  - sleep
  - wake
---

# Wait Queues and Completions

## Quest Briefing

Almost everything interesting in the kernel involves waiting. A process reads
from a pipe with no data. A driver waits for a DMA transfer to finish. A
filesystem blocks until a disk page arrives. In every case, the kernel must put
the calling task to sleep and arrange for it to be woken up when the awaited
condition becomes true. The wait queue is the primitive that makes this possible.

Wait queues are the fundamental sleep/wake mechanism in Linux. They appear in
every subsystem: the scheduler uses them, VFS uses them, networking uses them,
device drivers use them. Understanding wait queues is the prerequisite for
understanding any blocking operation in the kernel. Completions build on top of
wait queues to provide a simpler one-shot signaling interface, and they appear
wherever one code path must wait for another to finish a specific piece of work.

Mastering these primitives unlocks the entire Event Horizon realm. Every
higher-level event mechanism -- epoll, timers, io_uring -- ultimately depends
on the ability to sleep a task and wake it up efficiently.


## Learning Objectives

- Describe the structure of a wait queue head and wait queue entry and how
  they form a linked list of sleeping tasks.
- Trace the prepare_to_wait / schedule / finish_wait pattern that prevents
  lost wakeups.
- Explain the difference between exclusive and non-exclusive waiters and
  why thundering herd avoidance matters.
- Use the wait_event family of macros and understand how they wrap the
  manual sleep/wake cycle.
- Implement a completion-based synchronization using init_completion,
  wait_for_completion, and complete.


## Core Concepts

### Wait Queue Data Structures

A wait queue consists of two structures defined in include/linux/wait.h.

The wait queue head (struct wait_queue_head at line 35) contains a spinlock
and a list head:

    struct wait_queue_head {
        spinlock_t      lock;
        struct list_head    head;
    };

Each sleeping task is represented by a wait queue entry (struct wait_queue_entry
at line 28):

    struct wait_queue_entry {
        unsigned int        flags;
        void            *private;
        wait_queue_func_t   func;
        struct list_head    entry;
    };

The private field typically points to the task_struct of the sleeping task. The
func field is a callback invoked on wakeup -- by default it is
default_wake_function, which calls try_to_wake_up(). The flags field controls
behavior: WQ_FLAG_EXCLUSIVE (0x01) marks exclusive waiters that receive wakeups
one at a time, and WQ_FLAG_PRIORITY (0x10) places the entry at the head of the
queue.

Initialization happens via init_waitqueue_head() (a macro at line 64 that calls
__init_waitqueue_head in kernel/sched/wait.c line 9), which initializes the
spinlock and the list.

### The Sleep/Wake Pattern

The canonical pattern to sleep on a condition is the three-step sequence:
prepare_to_wait, schedule, finish_wait. This pattern exists because of a subtle
race: the condition might become true between checking it and going to sleep.

The function prepare_to_wait() at kernel/sched/wait.c line 248 does three
things atomically under the wait queue lock:
1. Adds the entry to the wait queue if not already present.
2. Sets the task state to TASK_INTERRUPTIBLE (or TASK_UNINTERRUPTIBLE).
3. Releases the lock.

Setting the task state before calling schedule() is critical. If a wakeup
arrives between the condition check and schedule(), the waker calls
try_to_wake_up() which sets the state back to TASK_RUNNING, so schedule()
returns immediately rather than sleeping forever.

The function finish_wait() at line 375 restores the task state to TASK_RUNNING
and removes the entry from the wait queue.

For the common case, the wait_event() family of macros (defined in
include/linux/wait.h) wraps this entire pattern into a single call. For
example, wait_event(wq, condition) expands into a loop that calls
prepare_to_wait_event(), checks the condition, calls schedule() if false, and
calls finish_wait() when done.

### Wakeup Mechanics

Waking sleeping tasks is handled by __wake_up() at kernel/sched/wait.c line
143, which is the function behind the wake_up() macro. It acquires the wait
queue lock and calls __wake_up_common() at line 92.

The __wake_up_common() function walks the wait queue list and invokes each
entry's func callback. For non-exclusive wakeups (nr_exclusive == 0), it wakes <!-- safe: kernel waitqueue internals; 'func' is a struct field name -->
all entries. For exclusive wakeups, it wakes exactly nr_exclusive exclusive
entries plus all non-exclusive entries.

The exclusive wakeup is the kernel's solution to the thundering herd problem.
When multiple tasks wait for the same resource, waking all of them wastes CPU
because only one can acquire the resource. Functions like add_wait_queue_exclusive()
(line 29) set WQ_FLAG_EXCLUSIVE and add the entry to the tail of the queue,
ensuring FIFO ordering among exclusive waiters.

Variant wakeup functions include __wake_up_sync_key() (line 186) which sets
WF_SYNC to hint to the scheduler that the waker is about to sleep, and
__wake_up_locked() (line 158) for callers that already hold the wait queue lock.

### Completions: One-Shot Signaling

A completion (struct completion in include/linux/completion.h line 26) is a
lightweight wrapper around a simple wait queue designed for the common pattern
of "wait for this operation to finish":

    struct completion {
        unsigned int done;
        struct swait_queue_head wait;
    };

The done counter tracks whether the event has occurred. The wait field is a
simple wait queue (swait), a more constrained variant that uses raw spinlocks
for real-time safety.

The complete() function at kernel/sched/completion.c line 50 increments done
and wakes one waiter via swake_up_locked(). The complete_all() function at
line 72 sets done to UINT_MAX, waking all waiters -- useful when a resource
becomes permanently available.

The wait_for_completion() function calls do_wait_for_common() at line 86, which
loops: it prepares to sleep with __prepare_to_swait(), checks if done is
nonzero, and calls schedule_timeout() if not. When done becomes nonzero, it
decrements it (unless UINT_MAX) and returns.

Completions are used extensively in the kernel: the block layer waits for I/O
completion, module loading waits for init to finish, and io_uring uses
complete(&ctx->ref_comp) during ring context teardown (io_uring/io_uring.c
line 188).


## Code Walkthrough

Trace a task sleeping on a wait queue and being woken up:

1. **Declaring and initializing the wait queue** -- include/linux/wait.h:59:
   DECLARE_WAIT_QUEUE_HEAD(my_wq) statically allocates a wait_queue_head with
   the spinlock initialized and an empty list.

2. **A task prepares to sleep** -- kernel/sched/wait.c:280:
   init_wait_entry() initializes a stack-allocated wait_queue_entry, setting
   private to current (the calling task), func to autoremove_wake_function,
   and flags to 0.

3. **prepare_to_wait_event()** -- kernel/sched/wait.c:289:
   Acquires wq_head->lock, checks for pending signals (returning -ERESTARTSYS
   if the state is interruptible and a signal is pending), adds the entry to
   the wait queue, sets the task state, and releases the lock.

4. **Condition check fails, task calls schedule()** -- The task enters the
   scheduler. Because its state is TASK_INTERRUPTIBLE, the scheduler removes it
   from the run queue. The task is now sleeping.

5. **Another context makes the condition true and calls wake_up()** --
   kernel/sched/wait.c:143: __wake_up() acquires the lock and calls
   __wake_up_common() at line 92. This iterates the wait queue list, calling
   autoremove_wake_function for each entry, which calls
   default_wake_function -> try_to_wake_up() to place the task back on the
   run queue and remove the entry from the wait queue.

6. **The sleeping task resumes** -- schedule() returns. The task loops back,
   rechecks the condition (now true), and falls through.

7. **finish_wait()** -- kernel/sched/wait.c:375:
   Sets the task state back to TASK_RUNNING. If the entry is still on the
   queue (e.g., spurious wakeup path), it removes it under the lock.


## Hands-On Challenges

### Challenge 1: Manual Sleep/Wake Module (50 XP)

Write a kernel module that creates a /proc/mywait file. Reading from the file
blocks the calling task on a wait queue. Writing any data to the file wakes all
blocked readers. Implement the sleep loop manually using prepare_to_wait_event,
schedule, and finish_wait -- do not use the wait_event macros. Verify with two
terminal sessions: one blocking on cat /proc/mywait, the other writing with
echo 1 > /proc/mywait.

Verification: The reader unblocks only after the writer writes, and dmesg shows
your debug printk messages for the sleep and wake paths.

### Challenge 2: Exclusive vs Non-Exclusive Wakeup (50 XP)

Modify your module to support both exclusive and non-exclusive waiters. Add a
second proc file /proc/mywait_excl that uses add_wait_queue_exclusive(). Start
four readers on the exclusive file and two on the non-exclusive file. Write to
the wake file with wake_up(). Observe which tasks are woken.

Verification: All non-exclusive waiters wake up. Exactly one exclusive waiter
wakes up per wake_up() call. Document the behavior difference.

### Challenge 3: Completion-Based Handshake (50 XP)

Write a module that spawns a kernel thread using kthread_run(). The main thread
calls wait_for_completion() on a DECLARE_COMPLETION_ONSTACK variable. The kernel
thread does some simulated work (msleep), then calls complete(). Measure the
time spent waiting and print it to the kernel log.

Verification: The main thread blocks until the kernel thread calls complete().
The measured time matches the msleep duration within a few milliseconds.


## Verification Criteria

- [ ] Can describe struct wait_queue_head and struct wait_queue_entry fields
      and their roles.
- [ ] Can explain the prepare_to_wait / schedule / finish_wait pattern and
      why setting the task state before schedule() prevents lost wakeups.
- [ ] Can distinguish exclusive from non-exclusive waiters and explain the
      thundering herd problem.
- [ ] Can trace __wake_up -> __wake_up_common -> func callback -> try_to_wake_up
      through the source code.
- [ ] Can use wait_event_interruptible() and wake_up() correctly in a module.
- [ ] Can implement completion-based synchronization with init_completion,
      wait_for_completion, and complete.
- [ ] Can explain why completions use swait_queue_head instead of wait_queue_head
      and the real-time implications.
