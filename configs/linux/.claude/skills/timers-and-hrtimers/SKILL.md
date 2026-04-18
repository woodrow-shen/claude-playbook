---
name: timers-and-hrtimers
description: Master the kernel timer wheel and high-resolution timer subsystems
realm: events
category: timing
difficulty: intermediate
xp: 200
estimated_minutes: 120
prerequisites:
  - interrupt-handling
unlocks: []
kernel_files:
  - kernel/time/timer.c
  - kernel/time/hrtimer.c
  - include/linux/timer.h
  - include/linux/hrtimer.h
doc_files:
  - Documentation/timers/hrtimers.rst
badge: Timekeeper
tags:
  - timer
  - hrtimer
  - jiffies
  - timer-wheel
---

# Timers and High-Resolution Timers

## Quest Briefing

Time is one of the kernel's most fundamental resources. Network protocols need
retransmission timeouts. Schedulers need preemption ticks. Drivers need hardware
polling delays. Userspace needs sleep(), alarm(), and POSIX timers. The kernel
provides two distinct timer subsystems to serve these needs: the timer wheel
for coarse-grained timeouts, and high-resolution timers (hrtimers) for
nanosecond-precision expiration.

The timer wheel, implemented in kernel/time/timer.c, is optimized for the vast
majority of kernel timeouts: they are set and then canceled before they expire.
Network timeouts, disk I/O watchdogs, and protocol state machines all follow
this pattern. The wheel provides O(1) insertion and deletion at the cost of
reduced time granularity for distant expirations. Hrtimers, in
kernel/time/hrtimer.c, use a red-black tree sorted by expiration time to
deliver nanosecond-accurate callbacks, serving POSIX timers, the scheduler's
tick, and nanosleep().

Understanding both systems reveals a core kernel design principle: different
use cases demand different data structures, and the kernel provides specialized
implementations rather than forcing a one-size-fits-all solution.


## Learning Objectives

- Describe the hierarchical timer wheel architecture with its 9 levels of
  granularity buckets and explain how timer placement depends on expiry distance.
- Trace the add_timer / mod_timer / del_timer lifecycle through the internal
  __mod_timer function.
- Explain the hrtimer red-black tree organization with per-CPU bases and
  multiple clock sources (MONOTONIC, REALTIME, BOOTTIME, TAI).
- Follow the hrtimer expiration path from __hrtimer_run_queues through
  __run_hrtimer to the callback function invocation.
- Distinguish when to use timer_list (jiffies-based) versus hrtimer
  (nanosecond-based) in kernel code.


## Core Concepts

### The Timer Wheel Architecture

The timer wheel in kernel/time/timer.c replaces the original cascading timer
wheel with a flat hierarchical design. The key insight, documented in the
extensive comment starting at line 64, is that most kernel timers are timeouts
that get canceled before they fire. Exact expiry is unnecessary -- what matters
is efficient insertion and cancellation.

The wheel has LVL_DEPTH levels (9 for HZ > 100, 8 otherwise), each with
LVL_SIZE (64) buckets. Each level has a different granularity:

- Level 0: 1ms granularity, 0-63ms range (at HZ=1000)
- Level 1: 8ms granularity, 64-511ms range
- Level 2: 64ms granularity, 512ms-4s range
- Level 8: ~4.7 hours granularity, up to ~12 days range

The total wheel size is WHEEL_SIZE = LVL_SIZE * LVL_DEPTH = 576 buckets (at
9 levels). This is defined at line 187.

Each CPU has its own timer_base structure (defined at line 206), containing:
- lock: A raw spinlock protecting the wheel.
- running_timer: Points to the currently expiring timer (for safe deletion).
- clk: The clock value driving this base, updated before enqueue.
- next_expiry: The earliest pending expiration, used by the tick to decide
  when to fire next.
- vectors: The actual wheel -- an array of WHEEL_SIZE hlist_heads.

There are NR_BASES per CPU (3 with CONFIG_NO_HZ_COMMON): BASE_LOCAL for
CPU-pinned timers, BASE_GLOBAL for migratable timers, and BASE_DEF for
deferrable timers that do not wake idle CPUs.

### Timer Lifecycle: add_timer, mod_timer, del_timer

A timer is represented by struct timer_list (include/linux/timer.h), containing
the expiry time, the callback function, and flags indicating which base it
belongs to.

The add_timer() function at line 1245 is the primary entry point. It calls
__mod_timer() with MOD_TIMER_NOTPENDING, which:

1. Locks the appropriate timer_base.
2. If the timer is already pending, removes it from its current bucket.
3. Calculates the wheel level and offset based on the delta between the
   requested expiry and the base clock (calc_wheel_index).
4. Inserts the timer into the correct bucket via enqueue_timer().
5. Updates base->next_expiry if this timer expires sooner than any existing one.

The mod_timer() function modifies an already-pending timer's expiry. It is
the most commonly used function because code frequently resets timeouts (e.g.,
a TCP retransmit timer is reset on every ACK).

del_timer() and del_timer_sync() remove timers. del_timer_sync() additionally
spins waiting for the callback to finish if the timer is currently executing
on another CPU -- this is essential for safe cleanup in module unload paths.

### Timer Expiration: run_timer_softirq

When the tick interrupt fires, it checks whether any timers have expired by
comparing jiffies against base->next_expiry. If timers are due, it raises
TIMER_SOFTIRQ, which runs run_timer_softirq().

The expire_timers() function at line 1766 processes a bucket of expired timers.
For each timer, it:

1. Detaches the timer from the wheel.
2. Sets base->running_timer to this timer (so del_timer_sync knows to wait).
3. Calls call_timer_fn() at line 1722, which invokes the timer callback.
4. Clears base->running_timer.

The callback runs in softirq context, meaning it cannot sleep but can be
preempted on PREEMPT_RT kernels.

### High-Resolution Timers (hrtimers)

Hrtimers, implemented in kernel/time/hrtimer.c, provide nanosecond-resolution
timers using a red-black tree (timerqueue) sorted by absolute expiration time.

Each CPU has a struct hrtimer_cpu_base (defined via DEFINE_PER_CPU at line 80)
containing an array of clock_base entries. There are 8 bases: 4 clock sources
(MONOTONIC, REALTIME, BOOTTIME, TAI) times 2 contexts (hard IRQ and soft IRQ).
The hard vs soft distinction (HRTIMER_ACTIVE_HARD and HRTIMER_ACTIVE_SOFT at
lines 65-66) determines whether the callback runs in hard IRQ or softirq
context.

An hrtimer is represented by struct hrtimer (include/linux/hrtimer.h),
containing the expiry time as a ktime_t (nanoseconds), a pointer to the
clock base, and the callback function.

The hrtimer_start_range_ns() function is the main entry point for arming a
timer. It acquires the per-CPU base lock via lock_hrtimer_base() (line 163),
removes the timer if already enqueued, sets the new expiry, and enqueues it
into the red-black tree. If this timer is now the earliest, it reprograms the
clock event device to fire at the new time.

### Hrtimer Expiration: __hrtimer_run_queues and __run_hrtimer

When the clock event device fires, __hrtimer_run_queues() at line 1817 is
called. It iterates over all active clock bases, checking each base's earliest
timer against the current time.

For each expired timer, __run_hrtimer() at line 1742 executes the callback:

1. Deactivates the timer via __remove_hrtimer() (line 1765).
2. Retrieves the callback via ACCESS_PRIVATE(timer, function) (line 1766).
3. Drops the base lock (line 1781) -- callbacks run without holding any
   hrtimer lock.
4. Calls the callback function fn(timer) (line 1785).
5. Reacquires the lock and checks the return value. If HRTIMER_RESTART, the
   timer is re-enqueued via enqueue_hrtimer() (line 1802). If
   HRTIMER_NORESTART, it stays deactivated.

A key example is hrtimer_wakeup() at line 2013, the callback for
nanosleep(). It calls wake_up_process() on the sleeping task, connecting
hrtimers directly to the wait queue / scheduler infrastructure.


## Code Walkthrough

Trace a network retransmission timeout using the timer wheel:

1. **Timer initialization** -- A TCP socket initializes its retransmit timer
   during connection setup using timer_setup(), which sets the callback to
   tcp_retransmit_timer and binds it to the timer_list.

2. **Timer armed with mod_timer()** -- After sending a segment, the TCP code
   calls mod_timer(&icsk->icsk_retransmit_timer, jiffies + rto). Inside
   __mod_timer(), the delta (rto) determines the wheel level: a 200ms RTO at
   HZ=1000 places the timer at level 1 (8ms granularity, 64-511ms range).

3. **Tick fires, softirq runs** -- When jiffies advances past the timer's
   expiry, the tick interrupt raises TIMER_SOFTIRQ. run_timer_softirq() calls
   expire_timers() for the relevant bucket.

4. **call_timer_fn() invokes the callback** -- kernel/time/timer.c:1722:
   The retransmit callback fires, re-sending the unacknowledged segment.

5. **Normal case: timer canceled** -- If an ACK arrives before the timeout,
   del_timer() removes the timer from the wheel before it fires. This is the
   common case and is very cheap: O(1) list removal.

Trace a nanosleep() call using hrtimers:

1. **Userspace calls nanosleep()** -- The syscall enters the kernel and calls
   hrtimer_nanosleep(), which initializes an hrtimer on CLOCK_MONOTONIC.

2. **hrtimer_start_range_ns() arms the timer** -- The timer is inserted into
   the MONOTONIC clock base's red-black tree. The clock event device is
   reprogrammed if this is the new earliest timer.

3. **The task sleeps** -- do_nanosleep() calls schedule() after setting the
   task state to TASK_INTERRUPTIBLE.

4. **Clock event fires** -- __hrtimer_run_queues() finds the expired timer.
   __run_hrtimer() calls hrtimer_wakeup() (line 2013), which calls
   wake_up_process() on the sleeping task.

5. **Task resumes** -- schedule() returns, nanosleep() returns to userspace.


## Hands-On Challenges

### Challenge 1: Timer Wheel Level Mapping (75 XP)

Write a kernel module that arms 9 timers with exponentially increasing delays:
1ms, 10ms, 100ms, 1s, 10s, 1m, 10m, 1h, and 12h. For each timer, use the
kernel's internal calc_wheel_index logic to determine which wheel level and
bucket the timer lands in. Print the level, granularity, and bucket index for
each timer.

Verification: The output must match the granularity table from the comment in
kernel/time/timer.c (lines 104-114 for HZ=1000). The 1ms timer should be in
level 0, the 12h timer in level 8.

### Challenge 2: Hrtimer Precision Measurement (75 XP)

Write a kernel module that uses hrtimer_init and hrtimer_start to arm a
one-shot hrtimer for 1ms, 10ms, and 100ms. In the callback, record the actual
ktime using ktime_get() and compare it to the requested expiry. Compute the
jitter (difference between actual and requested) for 100 iterations of each
delay.

Verification: Report mean and max jitter for each delay. On a non-RT kernel,
typical jitter should be under 100us for the 1ms case. Explain why jitter
exists and how CONFIG_PREEMPT_RT improves it.

### Challenge 3: del_timer_sync Race Condition (50 XP)

Write a module with two kernel threads. Thread A arms a timer with a 50ms
callback that sleeps for 100ms using msleep (to simulate long work). Thread B
calls del_timer_sync() while the callback is running. Measure how long
del_timer_sync() blocks. Then replace del_timer_sync() with del_timer() and
document the difference: del_timer() returns immediately but the callback is
still running, creating a use-after-free risk if the module is unloaded.

Verification: del_timer_sync() blocks for approximately 100ms (the callback
duration). del_timer() returns immediately. Explain why del_timer_sync() is
required before kfree() or module_exit().


## Verification Criteria

- [ ] Can draw the timer wheel with its 9 levels and explain how expiry distance
      determines level placement.
- [ ] Can trace add_timer -> __mod_timer -> calc_wheel_index -> enqueue_timer
      through the source code.
- [ ] Can explain the per-CPU timer_base structure and the three base types
      (LOCAL, GLOBAL, DEF) under CONFIG_NO_HZ_COMMON.
- [ ] Can describe the hrtimer red-black tree organization with 8 clock bases
      per CPU (4 clocks x 2 contexts).
- [ ] Can trace the hrtimer expiration path: clock event -> __hrtimer_run_queues
      -> __run_hrtimer -> fn(timer) -> optional re-enqueue.
- [ ] Can explain the difference between HRTIMER_RESTART and HRTIMER_NORESTART
      and how re-enqueue works in __run_hrtimer (line 1802).
- [ ] Can correctly choose between timer_list and hrtimer for a given use case
      and justify the choice.
