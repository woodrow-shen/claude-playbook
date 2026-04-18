---
name: futex-and-locking
description: Explore fast userspace mutexes and the kernel's futex subsystem
realm: concurrency
category: synchronization
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - spinlocks-and-mutexes
  - signals-and-ipc
unlocks: []
kernel_files:
  - kernel/futex/core.c
  - kernel/futex/waitwake.c
  - kernel/futex/pi.c
doc_files:
  - Documentation/locking/futex-requeue-pi.rst
badge: Futex Forger
tags:
  - futex
  - userspace-locking
  - pi
---

# Futex and Userspace Locking

## Quest Briefing

Every pthread_mutex_lock() call in a userspace program eventually relies on
the kernel's futex (Fast Userspace Mutex) subsystem. The key insight behind
futexes is that the common case -- acquiring an uncontended lock -- should
happen entirely in userspace with a single atomic operation, no system call
needed. The kernel is only involved when there is actual contention: a thread
needs to sleep waiting for a lock, or a thread needs to wake waiters when
releasing one.

The futex subsystem in kernel/futex/ is deceptively complex. It must handle
shared memory futexes (across processes), private futexes (within a process),
robust futexes (that survive process death), and priority-inheritance futexes
(that prevent priority inversion). The famous comment in kernel/futex/core.c
says it well: "The futexes are also cursed. But they come in a choice of
three flavours!"

Understanding futexes bridges the gap between userspace synchronization
libraries (pthreads, C++ std::mutex) and kernel locking. It reveals how the
kernel provides efficient sleeping and waking without the overhead of a system
call on every lock operation.


## Learning Objectives

- Explain the futex design: userspace fast path plus kernel slow path.
- Trace the futex_wait() and futex_wake() system call paths through the kernel.
- Understand how futex hash buckets map userspace addresses to kernel wait queues.
- Describe priority-inheritance futexes and how they prevent priority inversion.
- Explain robust futexes and the kernel's role in cleanup after process death.


## Core Concepts

### Futex Hash Table and Key Generation

The kernel maintains a global hash table of futex_hash_bucket structures for
wait queue management. The hash table is defined at core.c lines 56-64 as a
structure containing hashmask, hashshift, and per-node queues arrays.

When a thread calls futex_wait(), the kernel must identify which futex is
being waited on. The function get_futex_key() at core.c:548 computes a
union futex_key from the userspace address. For private futexes (the common
case), the key is based on the mm_struct and virtual address. For shared
futexes, it involves looking up the page's inode and offset via
get_inode_sequence_number() at line 499.

The futex_hash() function at core.c:302 maps the key to a specific
futex_hash_bucket. Each bucket contains a chain of waiters protected by a
spinlock. The private hash optimization (struct futex_private_hash at line 66)
allows per-process hash tables for better scalability.

### The futex_wait Path

When a thread needs to sleep waiting for a futex:

1. The sys_futex_wait syscall (kernel/futex/syscalls.c:398) calls
   __futex_wait() which calls futex_wait().
2. futex_wait() calls get_futex_key() to compute the key from the userspace
   address.
3. It hashes the key to find the appropriate futex_hash_bucket via
   futex_hash().
4. The current value at the userspace address is re-checked. If it has
   changed (another thread already modified it), the call returns immediately
   -- this is the atomic check that prevents lost wakeups.
5. A struct futex_q is allocated on the stack and queued via __futex_queue()
   at core.c:891 into the hash bucket.
6. The thread sleeps via schedule().

### The futex_wake Path

When a thread releases a futex and needs to wake waiters:

1. The sys_futex_wake syscall (kernel/futex/syscalls.c:366) calls
   futex_wake().
2. It computes the same futex_key for the address.
3. It looks up the hash bucket and walks the wait queue.
4. For each matching waiter (matching key), it calls wake_up_process().
5. The woken thread returns from its futex_wait() call.

The futex_top_waiter() function at core.c:804 finds the highest-priority
waiter in a hash bucket for a given key, which is essential for PI futexes.

### Priority-Inheritance Futexes

Standard futexes can cause priority inversion: a high-priority thread waits
for a lock held by a low-priority thread, which is preempted by medium-priority
threads. PI futexes solve this by boosting the lock holder's priority.

The PI futex implementation lives in kernel/futex/pi.c. When a high-priority
thread calls futex_lock_pi() (invoked from syscalls.c:146), the kernel:

1. Identifies the current lock owner.
2. Attaches an rt_mutex (from kernel/locking/rtmutex_common.h, included at
   core.c:49) to the futex.
3. The rt_mutex's priority inheritance chain boosts the owner to the
   waiter's priority.
4. When the owner releases the lock, its priority is restored.

### Robust Futexes

When a thread holding a futex lock dies (crashes or is killed), the lock would
be held forever without cleanup. Robust futexes solve this. Each thread
maintains a list of held futexes. On thread exit, the kernel walks this list
via exit_robust_list() and marks each futex with FUTEX_OWNER_DIED, then calls
futex_wake() to wake waiters (see core.c lines 1069-1123).

The waiting threads can then detect the OWNER_DIED flag and recover the lock.


## Code Walkthrough

Trace a contended pthread_mutex_lock/unlock cycle:

1. **Userspace fast path**: pthread_mutex_lock() attempts an atomic
   compare-and-swap on the futex word in userspace. If it succeeds (lock
   was free), no system call is needed. This is the common case.

2. **Contention detected**: If the CAS fails, the thread calls
   sys_futex(FUTEX_WAIT) which enters the kernel through
   sys_futex_wait (syscalls.c:398).

3. **Key computation**: get_futex_key() at core.c:548 translates the
   userspace address into a kernel-internal futex_key. For private futexes
   (FLAGS_SHARED not set), futex_key_is_private() at line 136 returns true.

4. **Hash and queue**: futex_hash() at line 302 finds the hash bucket.
   __futex_queue() at line 891 adds the waiter to the bucket's list.
   The waiter sleeps via schedule().

5. **Unlock and wake**: The unlocking thread modifies the futex word in
   userspace, then calls sys_futex(FUTEX_WAKE). futex_wake() walks the
   hash bucket and calls wake_up_process() on the first matching waiter.

6. **Recovery**: The woken thread returns from schedule(), dequeues itself
   via futex_unqueue() at line 922, and retries the userspace CAS.


## Hands-On Challenges

### Challenge 1: Map the Futex Hash Table (100 XP)

Read kernel/futex/core.c and document the hash table layout:
- The __futex_data structure (lines 56-64) and its fields.
- The struct futex_private_hash (line 66) and how it enables per-process hashing.
- How get_futex_key() at line 548 handles private vs shared futexes differently.
- Compute the hash bucket for a given address on your system.

Verification: Show the hash table configuration and trace a key computation
with accurate field values.

### Challenge 2: Trace Contention with ftrace (100 XP)

Write a C program with two threads contending on a single futex. Enable
ftrace events for the futex subsystem and capture:
- The futex_wait entry showing the key and hash bucket.
- The thread sleeping in schedule().
- The futex_wake entry from the unlocking thread.
- The woken thread returning from wait.

Map each trace event to the kernel source function and line number.

Verification: Show annotated ftrace output with at least 4 events mapped to
source code locations.

### Challenge 3: PI Futex Priority Inversion Demo (100 XP)

Write a program that demonstrates priority inversion:
1. A low-priority thread holds a PI mutex.
2. A high-priority thread attempts to lock the same PI mutex.
3. Observe (via /proc or ftrace) that the low-priority thread is boosted.

Then modify the program to use a non-PI futex and show the inversion occurring.
Explain the kernel code path in kernel/futex/pi.c that implements the boost.

Verification: Show priority values before and after the boost, with code
references to the PI implementation.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain the futex design principle: userspace fast path with kernel
      slow path for contention only.
- [ ] Trace get_futex_key() at core.c:548 and explain how private and shared
      futexes generate different keys.
- [ ] Describe the futex hash table structure (__futex_data at core.c:56) and
      how futex_hash() at line 302 maps keys to buckets.
- [ ] Walk through the futex_wait path from sys_futex_wait (syscalls.c:398)
      through queue and sleep.
- [ ] Explain priority-inheritance futexes and how rt_mutex integration
      prevents priority inversion.
- [ ] Describe robust futexes and the FUTEX_OWNER_DIED recovery mechanism
      at core.c lines 1069-1123.
- [ ] Explain the futex_requeue operation and why it is important for
      condition variables.
