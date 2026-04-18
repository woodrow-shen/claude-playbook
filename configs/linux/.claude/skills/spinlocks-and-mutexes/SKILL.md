---
name: spinlocks-and-mutexes
description: Learn kernel locking primitives to safely synchronize concurrent access
realm: concurrency
category: locking-basics
difficulty: beginner
xp: 150
estimated_minutes: 90
prerequisites:
- process-lifecycle
unlocks:
- rcu-fundamentals
- rwsem-and-percpu
- lockdep-validation
- interrupt-handling
- futex-and-locking
kernel_files:
- kernel/locking/mutex.c
- kernel/locking/spinlock.c
- include/linux/spinlock.h
- include/linux/mutex.h
- kernel/locking/lockdep.c
doc_files:
- Documentation/locking/mutex-design.rst
- Documentation/locking/spinlocks.rst
- Documentation/locking/lockdep-design.rst
badge: Lock Smith
tags:
- locking
- spinlock
- mutex
- concurrency
- lockdep
---


# Spinlocks and Mutexes

The kernel is massively concurrent: multiple CPUs run kernel code simultaneously,
interrupts fire at any time, and preemption can switch tasks mid-execution. Without
proper synchronization, shared data structures would corrupt instantly. Spinlocks
and mutexes are the two fundamental locking primitives.

## Learning Objectives

After completing this skill, you will be able to:

- Explain the difference between spinlocks (busy-wait) and mutexes (sleep)
- Choose the correct lock type for a given context (interrupt, process, etc.)
- Use spin_lock/spin_unlock and mutex_lock/mutex_unlock correctly
- Understand why spin_lock_irqsave exists and when to use it
- Describe how lockdep detects potential deadlocks at runtime

## Core Concepts

### Spinlocks: Busy-Wait Locking

A spinlock (include/linux/spinlock.h) is the simplest lock: if the lock is
held, the CPU spins in a tight loop until it becomes available. Spinlocks are
appropriate when:

- The critical section is very short (microseconds)
- The code might run in interrupt context (where sleeping is forbidden)
- The lock must be acquired without blocking

Basic API:

```c
spinlock_t my_lock;
spin_lock_init(&my_lock);

spin_lock(&my_lock);
// critical section -- must be short, cannot sleep
spin_unlock(&my_lock);
```

When holding a spinlock, you MUST NOT:
- Call any function that might sleep (kmalloc with GFP_KERNEL, mutex_lock, etc.)
- Take too long (you are wasting CPU cycles on all contending CPUs)

### Spinlocks and Interrupts

If a spinlock protects data accessed by both process context and interrupt
handlers, you must disable interrupts while holding the lock:

```c
unsigned long flags;
spin_lock_irqsave(&my_lock, flags);    // save and disable interrupts
// critical section
spin_unlock_irqrestore(&my_lock, flags); // restore interrupt state
```

Why? If an interrupt fires while holding spin_lock() and the interrupt handler
tries to acquire the same lock, you get a deadlock on the same CPU.

Variants:
- spin_lock_irq / spin_unlock_irq: disable/enable interrupts (no save/restore)
- spin_lock_bh / spin_unlock_bh: disable/enable softirqs only

### Mutexes: Sleeping Locks

A mutex (include/linux/mutex.h) allows the holder to sleep if needed. When a
task tries to acquire a held mutex, it is put to sleep and woken when the mutex
becomes available. Mutexes are appropriate when:

- The critical section may be long
- The code runs in process context (not interrupt context)
- The critical section may call functions that sleep

Basic API:

```c
struct mutex my_mutex;
mutex_init(&my_mutex);

mutex_lock(&my_mutex);
// critical section -- may sleep, may call kmalloc(GFP_KERNEL), etc.
mutex_unlock(&my_mutex);
```

Mutex rules:
- Only the lock owner can unlock it (unlike semaphores)
- Cannot be used in interrupt context
- Cannot be held across a schedule() call by design (lockdep warns)
- Recursive locking is a bug (deadlock)

### Mutex Implementation

The mutex fast path (kernel/locking/mutex.c) uses an atomic operation to
try to acquire the lock without contention. If the lock is free, a single
atomic_try_cmpxchg sets it to locked. No function call overhead.

If contended, the slow path:
1. Adds the task to the mutex's wait queue
2. Sets the task state to TASK_UNINTERRUPTIBLE
3. Calls schedule() to sleep
4. When the lock holder calls mutex_unlock(), it wakes the first waiter

### Choosing Between Spinlock and Mutex

| Criterion | Spinlock | Mutex |
|-----------|----------|-------|
| Interrupt context? | Yes | No |
| Can sleep while held? | No | Yes |
| Critical section length | Very short | Any |
| Contention cost | CPU cycles (spinning) | Context switch |
| Per-CPU data? | Often | Rarely |

Rule of thumb: use mutex by default. Only use spinlock when you must (interrupt
context, very short critical sections, or when the code cannot sleep).

### Lockdep: The Lock Validator

Lockdep (kernel/locking/lockdep.c, enabled by CONFIG_PROVE_LOCKING) is a
runtime deadlock detector. It:

1. Tracks the order in which locks are acquired
2. Builds a dependency graph
3. Detects potential deadlocks by finding cycles in the graph

Lockdep reports violations like:
- AB-BA deadlocks (two locks acquired in opposite order on different CPUs)
- Lock acquired in interrupt context without interrupt-safe variant
- Sleeping while holding a spinlock

Lockdep warnings look like:

```
WARNING: possible circular locking dependency detected
...
Chain exists of: lock_A --> lock_B --> lock_A
```

## Code Walkthrough

### Exercise 1: Trace Spinlock Acquisition

1. Open include/linux/spinlock.h and find spin_lock()
2. It calls raw_spin_lock() which calls __raw_spin_lock()
3. On SMP systems, this calls do_raw_spin_lock() then the arch-specific
   implementation (e.g., queued spinlocks on x86)
4. Find the qspinlock implementation in kernel/locking/qspinlock.c
5. Note how it uses a MCS-style queue to avoid cache-line bouncing

### Exercise 2: Trace Mutex Contention

1. Open kernel/locking/mutex.c and find mutex_lock()
2. The fast path: __mutex_trylock_fast() attempts an atomic acquire
3. If it fails, __mutex_lock_slowpath() is called
4. This calls __mutex_lock() which adds the task to the wait list
   and calls schedule_preempt_disabled()
5. Find mutex_unlock() and trace how it wakes the next waiter

### Exercise 3: Read a Lockdep Report

Enable CONFIG_PROVE_LOCKING and trigger a lockdep warning by creating a
deliberate AB-BA scenario in a test module:

```c
mutex_lock(&A);
mutex_lock(&B);    // CPU 0: acquires A then B
mutex_unlock(&B);
mutex_unlock(&A);

// On another path:
mutex_lock(&B);
mutex_lock(&A);    // CPU 1: acquires B then A -- DEADLOCK
mutex_unlock(&A);
mutex_unlock(&B);
```

Read the lockdep output in dmesg and identify the chain and backtrace.

## Hands-On Challenges

### Challenge 1: Lock Type Selection (XP: 40)

For each scenario, determine the correct lock type and variant:

1. Protecting a linked list accessed by a timer callback and process context
2. Protecting a data structure accessed only in process context, with long
   critical sections that may allocate memory
3. Protecting per-CPU statistics updated in both softirq and process context
4. Protecting a configuration structure read frequently, written rarely

### Challenge 2: Find Locking in the Kernel (XP: 50)

Search the kernel source for 5 real examples of spinlock usage and 5 examples
of mutex usage. For each, identify: the protected data structure, why that
lock type was chosen, and whether interrupt-safe variants are used.

### Challenge 3: Lockdep Experiment (XP: 60)

Write a kernel module that deliberately creates an AB-BA lock ordering
violation using two mutexes. Load it and capture the lockdep output.
Annotate each line of the lockdep report explaining what it means.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain when to use spinlock vs mutex and why
- [ ] Describe why spin_lock_irqsave exists (interrupt + process context)
- [ ] Trace the spinlock and mutex acquisition paths in the kernel source
- [ ] Read and interpret a lockdep deadlock report
- [ ] Identify correct locking for any given kernel concurrency scenario
