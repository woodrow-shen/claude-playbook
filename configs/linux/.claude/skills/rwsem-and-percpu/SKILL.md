---
name: rwsem-and-percpu
description: Master reader-writer semaphores and per-CPU synchronization primitives
realm: concurrency
category: synchronization
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - spinlocks-and-mutexes
unlocks: []
kernel_files:
  - kernel/locking/rwsem.c
  - kernel/locking/percpu-rwsem.c
  - include/linux/percpu.h
doc_files:
  - Documentation/locking/locktypes.rst
badge: Read-Write Warden
tags:
  - rwsem
  - percpu
  - reader-writer
---

# Reader-Writer Semaphores and Per-CPU Primitives

## Quest Briefing

Many kernel data structures are read far more often than they are written. A
simple mutex serializes all access, forcing readers to wait for each other even
though concurrent reads are perfectly safe. Reader-writer semaphores (rwsem)
solve this by allowing unlimited concurrent readers while giving writers
exclusive access.

The Linux kernel's rwsem implementation in kernel/locking/rwsem.c is a
sophisticated piece of engineering. It uses a single atomic counter to track
both readers and writers, supports optimistic spinning (where a waiter spins
on the lock owner rather than sleeping), and includes a handoff mechanism to
prevent writer starvation.

Per-CPU reader-writer semaphores (percpu-rwsem) take this further. Instead of
a single atomic counter that bounces between CPU caches, they use per-CPU
counters for readers. This makes the read path extremely fast -- each CPU
increments its own local counter with no cache contention. The write path is
slower, but for read-dominated workloads this is an excellent trade-off. The
VFS mounts system and cgroup freezer use percpu-rwsem extensively.


## Learning Objectives

- Explain the rwsem count field encoding and how readers and writers coexist.
- Trace the fast path and slow path for both down_read and down_write operations.
- Describe the optimistic spinning mechanism and when it activates.
- Understand how percpu-rwsem achieves zero-contention read-side locking.
- Identify the handoff mechanism that prevents writer starvation.


## Core Concepts

### rwsem Count Field Encoding

The rwsem uses a single atomic long (the count field) to encode all lock
state. On 64-bit architectures (kernel/locking/rwsem.c, lines 83-99):

- Bit 0: RWSEM_WRITER_LOCKED -- writer holds the lock.
- Bit 1: RWSEM_FLAG_WAITERS -- tasks are waiting in the wait queue.
- Bit 2: RWSEM_FLAG_HANDOFF -- lock handoff is pending.
- Bits 3-7: Reserved.
- Bits 8-62: 55-bit reader count.
- Bit 63: RWSEM_READ_FAIL -- read lock attempts must fail (overflow guard).

The owner field (defined with RWSEM_READER_OWNED at line 64 and
RWSEM_NONSPINNABLE at line 65) stores the task_struct pointer of the lock
holder with flag bits in the low bits. For writers, this is the exact owning
task. For readers, it is the last reader that acquired the lock (a hint for
debugging, not a definitive owner).

### Fast Path and Slow Path

The read lock fast path is in rwsem_read_trylock() at line 249. It atomically
adds RWSEM_READER_BIAS (1 << 8) to the count. If no writer is active and no
handoff is pending, the lock is acquired immediately.

If the fast path fails, the slow path rwsem_down_read_slowpath() at line 993
is invoked. It creates a struct rwsem_waiter (defined at line 337) and adds it
to the wait list. Before sleeping, it attempts optimistic spinning via
rwsem_optimistic_spin() at line 816.

The write lock fast path is in rwsem_write_trylock() at line 264. It uses
atomic_long_try_cmpxchg_acquire to set RWSEM_WRITER_LOCKED when the count is
zero. If this fails, rwsem_down_write_slowpath() at line 1111 handles queuing
and spinning.

### Optimistic Spinning

When a lock is held by a running task (on a CPU), it is often faster to spin
waiting for the owner to release the lock than to sleep and be woken up later.
The function rwsem_optimistic_spin() at line 816 implements this:

1. rwsem_can_spin_on_owner() at line 704 checks if the current owner is
   running on a CPU.
2. The spinner enters a loop, checking rwsem_spin_on_owner() (line 743)
   which monitors the owner's on-CPU status.
3. If the owner goes to sleep or the spinner has spun too long (checked via
   rwsem_rspin_threshold at line 803), spinning stops.
4. For readers, spinning is bounded by the threshold to avoid unbounded waits.

### Writer Starvation Prevention: Handoff

The handoff mechanism (RWSEM_FLAG_HANDOFF, bit 2 of count) prevents writers
from being starved by a continuous stream of readers. When a writer has waited
too long, the RWSEM_FLAG_HANDOFF bit is set. Once set:

- New readers cannot acquire the lock via the fast path.
- The lock is "handed off" to the first waiter in the queue.
- rwsem_try_write_lock() at line 603 checks the handoff condition.

### Per-CPU Reader-Writer Semaphores

The percpu-rwsem in kernel/locking/percpu-rwsem.c eliminates read-side cache
contention entirely. The __percpu_init_rwsem() function at line 14 allocates
a per-CPU integer (sem->read_count) and initializes the rcu_sync, rcuwait,
and waitqueue structures.

The read path in __percpu_down_read_trylock() at line 48:
1. Increments this_cpu_inc(*sem->read_count) -- a purely local operation.
2. Checks atomic_read_acquire(&sem->block) after an smp_mb() barrier at
   line 67.
3. If block is not set, the read lock is acquired with zero contention.
4. If block is set (a writer is waiting), it decrements the counter and
   wakes the writer via rcuwait_wake_up(&sem->writer) at line 79.

The write path sets sem->block, then must sum all per-CPU read_count values
to determine if all readers have finished -- an expensive operation that
justifies the per-CPU design only for read-heavy workloads.


## Code Walkthrough

Trace a down_read() call through the full code path:

1. **Entry**: down_read() in the public API calls __down_read() at
   rwsem.c:1272, which calls __down_read_common() at line 1254.

2. **Fast path attempt**: __down_read_common() calls rwsem_read_trylock()
   at line 249. This does atomic_long_add_return(RWSEM_READER_BIAS, &sem->count).
   If the result has no writer locked, no waiters, and no handoff, the lock
   is acquired. Return success.

3. **Slow path**: If the fast path fails, rwsem_down_read_slowpath() at
   line 993 is called. It allocates a waiter on the stack and adds it to
   sem->wait_list.

4. **Spinning or sleeping**: The function attempts rwsem_optimistic_spin()
   if conditions permit. If spinning fails, the task sets its state to
   TASK_UNINTERRUPTIBLE and calls schedule().

5. **Wake-up**: When the writer releases the lock via __up_write() at
   line 1371, it calls rwsem_wake() at line 1214. rwsem_mark_wake() at
   line 410 walks the wait list and wakes the appropriate waiters.


## Hands-On Challenges

### Challenge 1: Decode the Count Field (60 XP)

Write a kernel module that creates an rwsem and performs various operations
while printing the raw count field value. Demonstrate:
- The count value with 0, 1, 3, and 10 concurrent readers.
- The count value with a writer holding the lock.
- The count value with a writer holding and readers waiting.
Decode each value using the bit field definitions from rwsem.c lines 83-99.

Verification: Show decoded output matching the bit field layout for at least
4 different lock states.

### Challenge 2: Benchmark rwsem vs percpu-rwsem (80 XP)

Write a kernel module that benchmarks:
- rwsem with 95% reads, 5% writes across 4 CPUs.
- percpu-rwsem with the same workload.
Measure operations per second for each. Explain the results in terms of
cache-line behavior and the per-CPU counter design.

Verification: Show benchmark results with at least 2x read-side improvement
for percpu-rwsem, with explanation referencing the source code.

### Challenge 3: Trigger and Observe Handoff (60 XP)

Create a scenario where a writer is starved by continuous readers. Use
ftrace or printk to observe:
- The RWSEM_FLAG_HANDOFF bit being set.
- New readers being blocked after handoff.
- The writer finally acquiring the lock.
Reference the exact code paths in rwsem.c that implement this.

Verification: Show trace output demonstrating the handoff mechanism with
annotated code references.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Decode the rwsem count field bit layout (rwsem.c lines 83-99) for any
      given lock state.
- [ ] Trace the fast path for down_read through rwsem_read_trylock() at
      line 249 and down_write through rwsem_write_trylock() at line 264.
- [ ] Explain the slow path in rwsem_down_read_slowpath() (line 993) and
      rwsem_down_write_slowpath() (line 1111) including wait queue management.
- [ ] Describe how optimistic spinning works in rwsem_optimistic_spin()
      at line 816 and when it is beneficial.
- [ ] Explain the percpu-rwsem read path (__percpu_down_read_trylock at
      percpu-rwsem.c:48) and why it has zero cache contention.
- [ ] Identify the handoff mechanism and explain how it prevents writer
      starvation.
- [ ] Name at least 3 kernel subsystems that use rwsem or percpu-rwsem and
      explain the choice.
