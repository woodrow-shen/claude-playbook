---
name: v7-scheduler-changes
description: Study Linux 7.0 scheduler changes -- sched_ext DL server and cross-class wakeup_preempt rework
realm: kernel-7
category: release-features
difficulty: advanced
xp: 300
estimated_minutes: 90
prerequisites:
- sched-ext
- rt-and-deadline-scheduling
unlocks: []
kernel_files:
- kernel/sched/ext.c
- kernel/sched/core.c
- kernel/sched/deadline.c
badge: Scheduler Futurist
tags:
- linux-7.0
- sched-ext
- dl-server
- wakeup-preempt
- release-notes
---


# Linux 7.0 Scheduler Changes

## Quest Briefing

Linux 7.0 landed two meaningful scheduler reworks. First, `sched_ext` gained a
dedicated per-runqueue `DL` (deadline) server so BPF-driven schedulers cannot
be starved by tightly-looping RT tasks. Second, the cross-class wakeup
preemption logic was rewritten around a new `rq->next_class` field that
tracks the highest-priority scheduling class that will run next, giving a
cleaner answer to the question "should this wakeup preempt the current task?"

Both changes matter because they alter scheduler decisions that were
previously hard to reason about. If you build or debug schedulers -- or if
you care about tail latency under mixed workloads -- these are the two
behavior shifts to internalize for 7.0.


## Learning Objectives

- Explain why `sched_ext` needed a DL server and how `ext_server_init()` at
  `kernel/sched/ext.c:3144` constructs one per runqueue.
- Trace the DL-server lifecycle: `dl_server_init()` at ext.c:3150 registers
  `ext_server_pick_task()` at ext.c:3133, `dl_server_start()` at ext.c:1956
  arms it on first SCX enqueue, and `dl_server_update()` at ext.c:1286
  drains its runtime under tick.
- Read the new `wakeup_preempt()` at `kernel/sched/core.c:2243` and identify
  the same-class fast path (line 2247), the higher-class upgrade branch
  (line 2250), and the `rq->next_class = p->sched_class` assignment on
  upgrade (line 2253).
- Describe when `rq->next_class` is reset to `idle_sched_class` (core.c:7087)
  and refreshed to the incoming class after a context switch (core.c:7105).


## Core Concepts

### The sched_ext DL Server

Before 7.0, RT tasks could monopolize a CPU indefinitely because the core
scheduler always preferred them over SCX tasks. 7.0 solves this by giving
every runqueue an `ext_server` -- a deadline entity owned by `sched_ext` --
and registering `ext_server_pick_task()` as its pick callback.

The shape:

1. `ext_server_init(struct rq *rq)` at ext.c:3144 initializes the per-rq
   `rq->ext_server` deadline entity with default runtime/period.
2. Within that init, `dl_server_init(dl_se, rq, ext_server_pick_task)` at
   ext.c:3150 wires the `ext_server_pick_task` callback so the deadline
   class knows how to ask sched_ext for a task when the server's turn comes.
3. On the first enqueue of an SCX task, `dl_server_start(&rq->ext_server)`
   at ext.c:1956 starts the server. Now the deadline class sees a
   bandwidth-reserved entity and will pick it over RT if its runtime is
   positive and RT has consumed too much CPU.
4. During the tick, `dl_server_update(&rq->ext_server, delta_exec)` at
   ext.c:1286 drains the server's runtime. When runtime is exhausted, CBS
   (Constant Bandwidth Server) rules apply and the next period replenishes.
5. When the deadline class picks the server, it calls
   `ext_server_pick_task()` at ext.c:3133 which returns the next SCX task
   to run for the DL-granted slice.

The net effect: SCX tasks are guaranteed bandwidth even when RT is busy,
without breaking RT's strict priority model on its own slice.

### Cross-Class `wakeup_preempt` and `rq->next_class`

Pre-7.0, `check_preempt_curr()` walked the scheduling classes to decide
whether a wakeup should preempt the currently running task. 7.0 renames
the function to `wakeup_preempt()` at core.c:2243 and changes the
underlying bookkeeping: each runqueue tracks `rq->next_class`, the highest
priority class whose task is scheduled to run.

Three branches inside `wakeup_preempt()`:

1. Same-class fast path (core.c:2247): `if (p->sched_class == rq->next_class)`.
   Delegate to the class's own `wakeup_preempt` method -- the inner class
   knows best whether its own task should yield.
2. Higher-class upgrade (core.c:2250): `if (sched_class_above(p->sched_class, rq->next_class))`.
   The waker is strictly above the currently tracked class. Ask the tracked
   class if it wants to yield (so CFS can do a vruntime-based decision, for
   example), call `resched_curr()`, then set `rq->next_class = p->sched_class`
   at core.c:2253.
3. Lower-class skip: otherwise, the waker is below `rq->next_class` -- no
   preemption needed.

Two bookkeeping touch points complete the picture:

- `rq->next_class = &idle_sched_class` at core.c:7087 when the runqueue
  becomes idle; the tracker must reset so the next wakeup is free to upgrade.
- `rq->next_class = next->sched_class` at core.c:7105 inside `__schedule()`
  after a context switch -- the tracker follows reality after a new task is
  actually picked.


## Code Walkthrough

Trace the DL-server arc on a CPU that is running an RT looper when an SCX
task wakes up for the first time:

1. `scx_enqueue()` decides to park the task on a DSQ. Because this is the
   first runnable SCX task on this rq, `dl_server_start(&rq->ext_server)`
   (ext.c:1956) arms the server.
2. RT keeps running. Tick arrives. `dl_server_update(&rq->ext_server,
   delta_exec)` at ext.c:1286 drains the server's runtime.
3. Eventually the server's deadline becomes eligible. The deadline class
   picks the server over RT on the next `pick_next_task()`.
4. The deadline class invokes `ext_server_pick_task()` at ext.c:3133 to
   ask sched_ext which SCX task should consume this DL slice. sched_ext
   returns the head of the chosen DSQ.
5. That SCX task runs. When its slice ends or its runtime is drained, the
   server replenishes and the cycle repeats.

And a cross-class preemption trace on a CPU running a CFS batch job:

1. An RT task wakes up. `wakeup_preempt(rq, p, flags)` (core.c:2243).
2. `p->sched_class` is `rt_sched_class`, `rq->next_class` is
   `fair_sched_class`. The same-class fast path (2247) misses.
3. `sched_class_above(rt, fair)` (2250) is true. Take the upgrade branch.
4. Call `rq->next_class->wakeup_preempt(rq, p, flags)` so CFS can honor any
   per-class hook; then `resched_curr(rq)` to set TIF_NEED_RESCHED on
   `current`.
5. Assign `rq->next_class = p->sched_class` at core.c:7087 (actually
   core.c:2253 in the upgrade path) -- the tracker is now RT.
6. After the context switch in `__schedule()`, core.c:7105 refreshes
   `rq->next_class = next->sched_class` with the actually-picked next task.


## Hands-On Challenges

### Challenge 1: Run the DL Server Animation (50 XP)

In the Kernel Quest web UI, load the `sched-ext` animation and run the
`DL Server Prevents SCX Starvation` scenario. Step through frame by frame
and map each frame's `srcRef` back to the live kernel tree. Note any
drift between the frame description and what the source actually does.

Verification: Produce a per-frame table of (frame #, srcRef, summary,
observation) with at least 9 entries.

### Challenge 2: Read rq->next_class Churn (100 XP)

Add a printk at core.c:2253, core.c:7087, and core.c:7105 that records
the class transitions. Boot the kernel (or use a test VM), run a mixed
workload (CFS `stress-ng`, an RT loop, and an SCX scheduler), and
collect a minute of transitions.

Classify the transitions: how many upgrades vs. same-class decisions
vs. idle resets vs. post-context-switch refreshes? Does your data match
the theoretical model?

Verification: Show the annotated trace output and a short writeup of
the distribution.

### Challenge 3: Contrast With Pre-7.0 (50 XP)

Check out `v6.17` in the kernel tree and read `check_preempt_curr()`
(the old name). Diff it against the 7.0 `wakeup_preempt()` and explain:

- What cases the old code got wrong?
- Why tracking `rq->next_class` is cheaper than re-walking the class list?
- Which scheduling classes could have lied in the old model?

Verification: 400-600 words with concrete code citations from both
trees.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain why `sched_ext` needed a dedicated DL server and how
      `ext_server_init()` (ext.c:3144) constructs it per runqueue.
- [ ] Describe the DL-server lifecycle: `dl_server_init` -> `dl_server_start`
      -> `dl_server_update` -> `ext_server_pick_task`, citing the four
      anchor lines (3150, 1956, 1286, 3133).
- [ ] Walk through `wakeup_preempt()` (core.c:2243) and identify the
      three branches by line number (2247, 2250, 2253).
- [ ] Explain the two `rq->next_class` bookkeeping points -- idle reset
      (core.c:7087) and post-context-switch refresh (core.c:7105) -- and
      why both are necessary for correctness.
- [ ] Relate both changes back to observable behavior in a mixed
      RT/CFS/SCX workload.
