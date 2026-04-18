import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CfsTask {
  pid: number;
  name: string;
  vruntime: number;
  weight: number;
  state: 'running' | 'ready' | 'sleeping';
}

export interface RBNode {
  task: CfsTask;
  color: 'red' | 'black';
  left: RBNode | null;
  right: RBNode | null;
}

export type SchedClass = 'idle' | 'fair' | 'rt' | 'deadline' | 'stop';

export interface WakingTask {
  class: SchedClass;
  prio: number;
  name: string;
}

/** Wakeup flags passed down from try_to_wake_up() -- kernel/sched/sched.h:2423-2430 */
export interface WakeFlags {
  ttwu: boolean;     // WF_TTWU   0x08 -- SD_BALANCE_WAKE, always set by try_to_wake_up
  sync: boolean;     // WF_SYNC   0x10 -- waker will sleep after wakeup
  fork: boolean;     // WF_FORK   0x04 -- wakeup after fork
  migrated: boolean; // WF_MIGRATED 0x20 -- task was migrated on wakeup
}

/** Which sched_class handler was invoked inside wakeup_preempt(), if any. */
export type PreemptPath =
  | 'same-class'      // p->sched_class == rq->next_class   (core.c:2247)
  | 'upgrade'         // sched_class_above(p, rq->next_class) true  (core.c:2250)
  | 'below-skip';     // both branches miss -> no handler, no resched

export interface CfsState {
  tasks: CfsTask[];
  runningPid: number | null;
  minVruntime: number;
  tick: number;
  srcRef?: string;
  /** v7.0: highest-priority sched_class tracked on the rq */
  nextClass?: SchedClass;
  /** v7.0: task currently being evaluated by wakeup_preempt() */
  wakingTask?: WakingTask;
  /** Which branch of wakeup_preempt() this frame represents (if any). */
  preemptPath?: PreemptPath;
  /** Which class-specific ->wakeup_preempt handler (if any) was invoked this frame. */
  classHandler?: 'wakeup_preempt_fair' | 'wakeup_preempt_rt' | 'wakeup_preempt_dl' | null;
  /** Whether resched_curr() fired this frame -> TIF_NEED_RESCHED set on rq->curr. */
  reschedFired?: boolean;
  /** TIF_NEED_RESCHED state on the current task. */
  needResched?: boolean;
  /** Wakeup flags reaching wakeup_preempt() this frame. */
  wakeFlags?: WakeFlags;
  /** Short breadcrumb showing current call-path depth. */
  callPath?: string;
  /** Flag marking frames that contrast pre-v7.0 behaviour with v7.0. */
  v7Divergence?: boolean;
}

function cloneTasks(tasks: CfsTask[]): CfsTask[] {
  return tasks.map(t => ({ ...t }));
}

function cloneState(state: CfsState): CfsState {
  return {
    tasks: cloneTasks(state.tasks),
    runningPid: state.runningPid,
    minVruntime: state.minVruntime,
    tick: state.tick,
    srcRef: state.srcRef,
    nextClass: state.nextClass,
    wakingTask: state.wakingTask ? { ...state.wakingTask } : undefined,
    preemptPath: state.preemptPath,
    classHandler: state.classHandler,
    reschedFired: state.reschedFired,
    needResched: state.needResched,
    wakeFlags: state.wakeFlags ? { ...state.wakeFlags } : undefined,
    callPath: state.callPath,
    v7Divergence: state.v7Divergence,
  };
}

/** Numeric priority of a sched_class (higher = more important). Mirrors sched_class_above(). */
function classRank(c: SchedClass): number {
  switch (c) {
    case 'stop': return 4;
    case 'deadline': return 3;
    case 'rt': return 2;
    case 'fair': return 1;
    case 'idle': return 0;
  }
}

function schedClassAbove(a: SchedClass, b: SchedClass): boolean {
  return classRank(a) > classRank(b);
}

function pickNext(tasks: CfsTask[]): CfsTask | null {
  const ready = tasks.filter(t => t.state === 'ready');
  if (ready.length === 0) return null;
  return ready.reduce((min, t) => t.vruntime < min.vruntime ? t : min);
}

function generateEqualWeight(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const tasks: CfsTask[] = [
    { pid: 1, name: 'httpd', vruntime: 0, weight: 1024, state: 'ready' },
    { pid: 2, name: 'bash', vruntime: 0, weight: 1024, state: 'ready' },
    { pid: 3, name: 'cron', vruntime: 0, weight: 1024, state: 'ready' },
  ];

  frames.push({
    step: 0,
    label: 'Initial state: 3 equal-weight tasks',
    description: 'Three tasks with equal weight (nice 0, weight 1024). All start at vruntime 0. The legacy CFS scheduler (pre-6.6, replaced by EEVDF) picks the task with the lowest vruntime via __pick_first_entity() (fair.c:940).',
    highlights: [],
    data: { tasks: cloneTasks(tasks), runningPid: null, minVruntime: 0, tick: 0, srcRef: 'kernel/sched/fair.c:1032 __pick_first_entity()' } as CfsState,
  });

  for (let tick = 1; tick <= 9; tick++) {
    const next = pickNext(tasks);
    if (!next) break;

    // Mark running
    for (const t of tasks) {
      if (t.pid === next.pid) t.state = 'running';
      else if (t.state === 'running') t.state = 'ready';
    }

    frames.push({
      step: frames.length,
      label: `Tick ${tick}: ${next.name} (PID ${next.pid}) runs`,
      description: `${next.name} has the lowest vruntime (${next.vruntime.toFixed(1)}). It gets the CPU. Legacy CFS (pre-6.6) always picks the leftmost node in the red-black tree via __pick_first_entity() (fair.c:940) -- the task that has received the least CPU time relative to its weight.`,
      highlights: [`pid-${next.pid}`],
      data: { tasks: cloneTasks(tasks), runningPid: next.pid, minVruntime: Math.min(...tasks.map(t => t.vruntime)), tick, srcRef: 'kernel/sched/fair.c:1032 __pick_first_entity()' } as CfsState,
    });

    // Advance vruntime for running task
    const deltaVruntime = (1024 / next.weight) * 4; // 4ms slice
    next.vruntime += deltaVruntime;

    // Preempt: put back to ready
    next.state = 'ready';

    frames.push({
      step: frames.length,
      label: `${next.name} vruntime += ${deltaVruntime.toFixed(1)}`,
      description: `After running for a time slice, ${next.name}'s vruntime increases by ${deltaVruntime.toFixed(1)} (delta = 1024/weight * slice). update_curr() (fair.c:1285) calls calc_delta_fair() (fair.c:290) to compute the weighted delta. With equal weights, all tasks accumulate vruntime at the same rate, creating a fair round-robin.`,
      highlights: [`pid-${next.pid}`],
      data: { tasks: cloneTasks(tasks), runningPid: null, minVruntime: Math.min(...tasks.map(t => t.vruntime)), tick, srcRef: 'kernel/sched/fair.c:1378 update_curr() -> fair.c:297 calc_delta_fair()' } as CfsState,
    });
  }

  return frames;
}

function generateNiceValues(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const tasks: CfsTask[] = [
    { pid: 1, name: 'important', vruntime: 0, weight: 3072, state: 'ready' },  // nice -5
    { pid: 2, name: 'normal', vruntime: 0, weight: 1024, state: 'ready' },     // nice 0
    { pid: 3, name: 'background', vruntime: 0, weight: 335, state: 'ready' },  // nice 5
  ];

  frames.push({
    step: 0,
    label: 'Three tasks with different nice values',
    description: '"important" (nice -5, weight 3072), "normal" (nice 0, weight 1024), "background" (nice 5, weight 335). Higher weight means vruntime grows SLOWER, so the task gets MORE CPU time. Legacy CFS (pre-6.6) uses calc_delta_fair() (fair.c:290) to scale vruntime by inverse weight.',
    highlights: [],
    data: { tasks: cloneTasks(tasks), runningPid: null, minVruntime: 0, tick: 0, srcRef: 'kernel/sched/fair.c:297 calc_delta_fair()' } as CfsState,
  });

  for (let tick = 1; tick <= 12; tick++) {
    const next = pickNext(tasks);
    if (!next) break;

    for (const t of tasks) {
      if (t.pid === next.pid) t.state = 'running';
      else if (t.state === 'running') t.state = 'ready';
    }

    const deltaVruntime = (1024 / next.weight) * 4;

    frames.push({
      step: frames.length,
      label: `Tick ${tick}: ${next.name} runs (vruntime ${next.vruntime.toFixed(1)})`,
      description: `${next.name} has lowest vruntime. update_curr() (fair.c:1285) will advance vruntime by ${deltaVruntime.toFixed(1)} (1024/${next.weight} * 4ms) via calc_delta_fair() (fair.c:290). ${next.weight > 1024 ? 'High weight = slow vruntime growth = more CPU time.' : next.weight < 1024 ? 'Low weight = fast vruntime growth = less CPU time.' : 'Normal weight.'}`,
      highlights: [`pid-${next.pid}`],
      data: { tasks: cloneTasks(tasks), runningPid: next.pid, minVruntime: Math.min(...tasks.map(t => t.vruntime)), tick, srcRef: 'kernel/sched/fair.c:1378 update_curr() -> fair.c:297 calc_delta_fair()' } as CfsState,
    });

    next.vruntime += deltaVruntime;
    next.state = 'ready';
  }

  return frames;
}

function generateTaskWakeup(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const tasks: CfsTask[] = [
    { pid: 1, name: 'worker-A', vruntime: 0, weight: 1024, state: 'ready' },
    { pid: 2, name: 'worker-B', vruntime: 0, weight: 1024, state: 'ready' },
    { pid: 3, name: 'sleeper', vruntime: 0, weight: 1024, state: 'sleeping' },
  ];

  frames.push({
    step: 0,
    label: 'Two running tasks, one sleeping',
    description: '"sleeper" is blocked on I/O (state = sleeping). It is NOT in the red-black tree. "worker-A" and "worker-B" share the CPU. Legacy CFS (pre-6.6) manages the RB-tree with __pick_first_entity() (fair.c:940).',
    highlights: [],
    data: { tasks: cloneTasks(tasks), runningPid: null, minVruntime: 0, tick: 0, srcRef: 'kernel/sched/fair.c:1032 __pick_first_entity()' } as CfsState,
  });

  // Run 4 ticks without sleeper
  for (let tick = 1; tick <= 4; tick++) {
    const next = pickNext(tasks);
    if (!next) break;
    for (const t of tasks) {
      if (t.pid === next.pid) t.state = 'running';
      else if (t.state !== 'sleeping') t.state = 'ready';
    }
    next.vruntime += 4;
    next.state = 'ready';

    frames.push({
      step: frames.length,
      label: `Tick ${tick}: ${next.name} runs`,
      description: `${next.name} runs via update_curr() (fair.c:1285). Meanwhile "sleeper" is still blocked. Its vruntime stays at 0 while others advance.`,
      highlights: [`pid-${next.pid}`],
      data: { tasks: cloneTasks(tasks), runningPid: null, minVruntime: Math.min(...tasks.filter(t => t.state !== 'sleeping').map(t => t.vruntime)), tick, srcRef: 'kernel/sched/fair.c:1378 update_curr()' } as CfsState,
    });
  }

  // Wake up sleeper with min_vruntime
  const minVruntime = Math.min(...tasks.filter(t => t.state !== 'sleeping').map(t => t.vruntime));
  const sleeper = tasks.find(t => t.name === 'sleeper')!;
  sleeper.vruntime = minVruntime;
  sleeper.state = 'ready';

  frames.push({
    step: frames.length,
    label: `Sleeper wakes up! vruntime set to min_vruntime (${minVruntime})`,
    description: `When a task wakes from sleep, place_entity() (fair.c:5164) sets its vruntime to max(its_vruntime, min_vruntime - threshold). In legacy CFS (pre-6.6), this prevents a long-sleeping task from monopolizing the CPU, while still giving it a small bonus for having been asleep.`,
    highlights: ['pid-3'],
    data: { tasks: cloneTasks(tasks), runningPid: null, minVruntime, tick: 5, srcRef: 'kernel/sched/fair.c:5352 place_entity()' } as CfsState,
  });

  // Run a few more ticks to show fair scheduling resumes
  for (let tick = 6; tick <= 8; tick++) {
    const next = pickNext(tasks);
    if (!next) break;
    for (const t of tasks) {
      if (t.pid === next.pid) t.state = 'running';
      else t.state = 'ready';
    }

    frames.push({
      step: frames.length,
      label: `Tick ${tick}: ${next.name} runs (vruntime ${next.vruntime.toFixed(1)})`,
      description: `All three tasks now compete fairly. ${next.name} has the lowest vruntime, picked by __pick_first_entity() (fair.c:940).`,
      highlights: [`pid-${next.pid}`],
      data: { tasks: cloneTasks(tasks), runningPid: next.pid, minVruntime: Math.min(...tasks.map(t => t.vruntime)), tick, srcRef: 'kernel/sched/fair.c:1032 __pick_first_entity()' } as CfsState,
    });

    next.vruntime += 4;
    next.state = 'ready';
  }

  return frames;
}

function generateCrossClassPreempt(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const push = (label: string, description: string, highlights: string[], s: CfsState) => {
    frames.push({ step: frames.length, label, description, highlights, data: cloneState(s) });
  };

  const noFlags: WakeFlags = { ttwu: false, sync: false, fork: false, migrated: false };
  const ttwuFlags: WakeFlags = { ttwu: true, sync: false, fork: false, migrated: false };

  // Initial rq: a CFS task is running; nothing from higher classes yet.
  const tasks: CfsTask[] = [
    { pid: 101, name: 'cfs-current', vruntime: 12.0, weight: 1024, state: 'running' },
    { pid: 102, name: 'cfs-waker', vruntime: 0, weight: 1024, state: 'sleeping' },
    { pid: 201, name: 'rt-waker', vruntime: 0, weight: 1024, state: 'sleeping' },
    { pid: 301, name: 'dl-waker', vruntime: 0, weight: 1024, state: 'sleeping' },
  ];

  let state: CfsState = {
    tasks: cloneTasks(tasks),
    runningPid: 101,
    minVruntime: 12.0,
    tick: 0,
    nextClass: 'fair',
    needResched: false,
    wakeFlags: noFlags,
    callPath: '__schedule -> pick_next_task',
    srcRef: 'kernel/sched/core.c:7105 pick_next_task()',
  };

  // --- Frame 0: initial state, rq->next_class anchored in __schedule() ---
  push(
    'Initial: CFS task runs, rq->next_class = fair_sched_class',
    'A SCHED_NORMAL (CFS) task "cfs-current" is on the CPU. Right after pick_next_task() picked it, __schedule() set rq->next_class = next->sched_class = fair_sched_class (core.c:7105). rq->next_class is the v7.0 cache of "highest-priority class currently relevant to this CPU"; every subsequent wakeup_preempt() will consult it before touching TIF_NEED_RESCHED.',
    ['pid-101'],
    state,
  );

  // --- Frame 1: decision matrix / class priority ladder ---
  state = cloneState(state);
  state.srcRef = 'kernel/sched/core.c:8879 sched_class_above()';
  state.callPath = 'sched_init()';
  push(
    'Decision matrix: sched_class priority ladder (stop > dl > rt > fair > idle)',
    'sched_class_above() is a linker-order comparison; the kernel BUG_ON-asserts the ladder at boot in sched_init(): stop > dl > rt > fair > ext (SCX) > idle. When a task of class A wakes on a CPU running class B, this ordering alone decides whether preemption is even CONSIDERED. Nothing runs at the same priority as stop_class except per-CPU stopper kthreads.',
    [],
    state,
  );

  // --- Frame 2: pre-v7.0 vs v7.0 divergence ---
  state = cloneState(state);
  state.v7Divergence = true;
  state.srcRef = 'kernel/sched/core.c:2243 wakeup_preempt()';
  state.callPath = 'try_to_wake_up -> ttwu_do_activate -> wakeup_preempt';
  push(
    'Pre-v7.0 vs v7.0: the wakeup_preempt() rework',
    'Pre-v7.0: check_preempt_curr() dispatched directly to the CURRENT runner\'s ->wakeup_preempt callback, regardless of the waker\'s class. A cross-class wake paid full cost walking fair/rt/dl comparisons. v7.0: wakeup_preempt() was rewritten (core.c:2243) to cache rq->next_class and split into three branches -- same-class, upgrade, or below-skip. This both avoids wasted work on below-class wakeups and makes the current class explicitly notified during an upgrade so it can flush state before yielding.',
    [],
    state,
  );

  // --- Frame 3: CFS wakes CFS -- try_to_wake_up entry ---
  state = cloneState(state);
  state.wakingTask = { class: 'fair', prio: 120, name: 'cfs-waker' };
  state.wakeFlags = ttwuFlags;
  state.callPath = 'try_to_wake_up';
  state.srcRef = 'kernel/sched/core.c:4152 try_to_wake_up()';
  state.tick = 1;
  push(
    'Scenario A: CFS wakes under CFS -- try_to_wake_up() enters',
    'try_to_wake_up(p, state, wake_flags) OR\'s WF_TTWU into flags at core.c:4157 (kernel/sched/sched.h:2425). It resolves a CPU via select_task_rq(), then calls ttwu_queue() which eventually lands in ttwu_do_activate(). Both waker and wakee are SCHED_NORMAL here, so we expect the fast same-class path.',
    ['pid-102'],
    state,
  );

  // --- Frame 4: ttwu_do_activate -> wakeup_preempt ---
  state = cloneState(state);
  state.callPath = 'try_to_wake_up -> ttwu_do_activate';
  state.srcRef = 'kernel/sched/core.c:3705 ttwu_do_activate()';
  push(
    'ttwu_do_activate() enqueues and calls wakeup_preempt()',
    'ttwu_do_activate() (core.c:3705) runs activate_task() to enqueue p on the rq, then immediately invokes wakeup_preempt(rq, p, wake_flags) at core.c:3726. WF_TTWU is set, WF_SYNC is cleared (no hand-off from waker). rq->next_class is still fair_sched_class.',
    ['pid-102'],
    state,
  );

  // --- Frame 5: wakeup_preempt entry ---
  state = cloneState(state);
  state.callPath = 'ttwu_do_activate -> wakeup_preempt';
  state.srcRef = 'kernel/sched/core.c:2243 wakeup_preempt()';
  push(
    'wakeup_preempt() entry: compare p->sched_class vs rq->next_class',
    'Execution enters wakeup_preempt() (core.c:2243). The first thing it does -- the whole point of the v7.0 rework -- is compare p->sched_class against rq->next_class. Three outcomes are possible: equal (same-class handler), higher (upgrade branch), lower or equal-but-not-equal (below-skip, wakeup_preempt returns doing nothing).',
    ['pid-102'],
    state,
  );

  // --- Frame 6: same-class fast path -> wakeup_preempt_fair ---
  state = cloneState(state);
  state.preemptPath = 'same-class';
  state.classHandler = 'wakeup_preempt_fair';
  state.callPath = 'wakeup_preempt -> wakeup_preempt_fair';
  state.srcRef = 'kernel/sched/core.c:2247 wakeup_preempt() -> fair.c:9026 wakeup_preempt_fair()';
  push(
    'Same-class branch taken: rq->next_class->wakeup_preempt(rq, p, flags)',
    'p->sched_class == rq->next_class == fair_sched_class, so the first if-branch at core.c:2247 fires. rq->next_class->wakeup_preempt is wakeup_preempt_fair (fair.c:9026, wired in fair_sched_class at fair.c:14177). EEVDF compares virtual deadlines; here cfs-current\'s deadline is not yet expired, so no resched.',
    ['pid-102'],
    state,
  );

  // --- Frame 7: no resched, wakeup_preempt returns ---
  state = cloneState(state);
  state.reschedFired = false;
  state.needResched = false;
  state.srcRef = 'kernel/sched/core.c:2261 rq_clock_skip_update()';
  state.callPath = 'wakeup_preempt (return)';
  push(
    'No preempt: TIF_NEED_RESCHED stays clear, cfs-current keeps running',
    'wakeup_preempt_fair() decided NOT to call resched_curr(). Back in wakeup_preempt() (core.c:2260), the tail checks whether a queue event happened while TIF_NEED_RESCHED is set on rq->curr -- if so it skips the next clock update. Here nothing changes: same-class wakeups that do not preempt are cheap.',
    ['pid-101'],
    state,
  );

  // --- Frame 8: Scenario B -- RT wakes under CFS, try_to_wake_up ---
  state = cloneState(state);
  state.wakingTask = { class: 'rt', prio: 50, name: 'rt-waker' };
  state.wakeFlags = ttwuFlags;
  state.preemptPath = undefined;
  state.classHandler = null;
  state.callPath = 'try_to_wake_up';
  state.srcRef = 'kernel/sched/core.c:4152 try_to_wake_up()';
  state.tick = 2;
  push(
    'Scenario B: RT wakes under CFS -- upgrade path expected',
    'An RT SCHED_FIFO task (prio 50, so rt_priority = 49 in POSIX terms) becomes runnable, e.g. from an IRQ handler calling wake_up_process(). try_to_wake_up() sets WF_TTWU and walks the same ttwu_do_activate() path. rq->next_class is still fair_sched_class; the waker is rt_sched_class -- higher.',
    ['pid-201'],
    state,
  );

  // --- Frame 9: ttwu_do_activate ---
  state = cloneState(state);
  state.callPath = 'try_to_wake_up -> ttwu_do_activate';
  state.srcRef = 'kernel/sched/core.c:3726 wakeup_preempt()';
  push(
    'ttwu_do_activate() enqueues rt-waker, calls wakeup_preempt()',
    'Same enqueue path as before, but the enqueue targets the rt runqueue (rq->rt.active) not the CFS rb-tree. ttwu_do_activate() at core.c:3726 calls wakeup_preempt(rq, p, WF_TTWU).',
    ['pid-201'],
    state,
  );

  // --- Frame 10: wakeup_preempt upgrade branch ---
  state = cloneState(state);
  state.preemptPath = 'upgrade';
  state.callPath = 'ttwu_do_activate -> wakeup_preempt';
  state.srcRef = 'kernel/sched/core.c:2250 sched_class_above()';
  push(
    'Upgrade branch: sched_class_above(rt, fair) == true',
    'p->sched_class != rq->next_class, so the same-class branch at core.c:2247 is skipped. The else-if at core.c:2250 evaluates sched_class_above(rt_sched_class, fair_sched_class) -- true by the ladder asserted in sched_init() (core.c:8881). The upgrade path fires.',
    ['pid-201'],
    state,
  );

  // --- Frame 11: v7.0 nuance -- CURRENT class is notified first ---
  state = cloneState(state);
  state.classHandler = 'wakeup_preempt_fair';
  state.v7Divergence = true;
  state.callPath = 'wakeup_preempt -> wakeup_preempt_fair';
  state.srcRef = 'kernel/sched/core.c:2251 wakeup_preempt() -> fair.c:9026 wakeup_preempt_fair()';
  push(
    'v7.0 nuance: CURRENT class (fair) notified BEFORE resched',
    'Inside the upgrade branch, core.c:2251 still calls rq->next_class->wakeup_preempt -- the CURRENT class, not the waker\'s class. wakeup_preempt_fair() runs, but note its first check (fair.c:9037): if (p->sched_class != &fair_sched_class) return. So fair sees the wake happened and can short-circuit; the call exists specifically so the current class gets a chance to update bookkeeping. Pre-v7.0 did not make this call.',
    ['pid-101', 'pid-201'],
    state,
  );

  // --- Frame 12: resched_curr sets TIF_NEED_RESCHED ---
  state = cloneState(state);
  state.reschedFired = true;
  state.needResched = true;
  state.callPath = 'wakeup_preempt -> resched_curr';
  state.srcRef = 'kernel/sched/core.c:2252 resched_curr() -> core.c:1212 resched_curr()';
  push(
    'resched_curr(rq): set TIF_NEED_RESCHED on cfs-current',
    'core.c:2252 calls resched_curr(rq). That function (core.c:1212) delegates to __resched_curr(rq, TIF_NEED_RESCHED), which sets the thread flag on rq->curr and, if curr is running on a different CPU, sends a reschedule IPI. The CPU will call __schedule() at the next preemption point.',
    ['pid-101'],
    state,
  );

  // --- Frame 13: rq->next_class bumped to rt_sched_class ---
  state = cloneState(state);
  state.nextClass = 'rt';
  state.srcRef = 'kernel/sched/core.c:2253 wakeup_preempt()';
  state.callPath = 'wakeup_preempt (update next_class)';
  push(
    'rq->next_class = rt_sched_class (tracked high-watermark raised)',
    'Final step inside the upgrade branch (core.c:2253): rq->next_class = p->sched_class. Future fair wakeups on this CPU will now hit the below-skip path because sched_class_above(fair, rt) is false. rq->next_class acts as a monotonic "highest class seen since last pick_next_task" cache until __schedule() refreshes it.',
    ['pid-201'],
    state,
  );

  // --- Frame 14: __schedule() picks RT ---
  state = cloneState(state);
  state.tasks = state.tasks.map(t => {
    if (t.pid === 101) return { ...t, state: 'ready' };
    if (t.pid === 201) return { ...t, state: 'running' };
    return t;
  });
  state.runningPid = 201;
  state.wakingTask = undefined;
  state.preemptPath = undefined;
  state.classHandler = null;
  state.reschedFired = false;
  state.needResched = false;
  state.nextClass = 'rt';
  state.wakeFlags = noFlags;
  state.callPath = '__schedule -> pick_next_task';
  state.srcRef = 'kernel/sched/core.c:7105 pick_next_task()';
  state.tick = 3;
  push(
    'Context switch: pick_next_task picks rt-waker; rq->next_class refreshed',
    '__schedule() runs at the next preemption point and calls pick_next_task(), which iterates sched_class_highest..idle via for_each_class() and gets rt-waker from pick_next_task_rt(). core.c:7105 then sets rq->next_class = next->sched_class -- the authoritative refresh point. TIF_NEED_RESCHED is consumed.',
    ['pid-201'],
    state,
  );

  // --- Frame 15: CFS wakes under RT -- below-skip ---
  state = cloneState(state);
  state.wakingTask = { class: 'fair', prio: 120, name: 'cfs-waker' };
  state.wakeFlags = ttwuFlags;
  state.preemptPath = 'below-skip';
  state.classHandler = null;
  state.callPath = 'ttwu_do_activate -> wakeup_preempt';
  state.srcRef = 'kernel/sched/core.c:2250 sched_class_above()';
  state.tick = 4;
  push(
    'Scenario C: CFS wakes while RT runs -- below-class fast skip',
    'A fair task wakes. p->sched_class (fair) != rq->next_class (rt), AND sched_class_above(fair, rt) is FALSE. Both core.c:2247 and core.c:2250 branches miss, so wakeup_preempt() returns without calling any ->wakeup_preempt handler and without resched_curr(). Pre-v7.0 still paid for wakeup_preempt_rt()\'s early return (rt.c:1626) per wake; v7.0 skips the call entirely.',
    ['pid-102'],
    state,
  );

  // --- Frame 16: DL wakes under RT -- upgrade to deadline ---
  state = cloneState(state);
  state.wakingTask = { class: 'deadline', prio: -1, name: 'dl-waker' };
  state.wakeFlags = ttwuFlags;
  state.preemptPath = 'upgrade';
  state.classHandler = 'wakeup_preempt_rt';
  state.callPath = 'wakeup_preempt -> wakeup_preempt_rt';
  state.srcRef = 'kernel/sched/core.c:2251 wakeup_preempt() -> rt.c:1619 wakeup_preempt_rt()';
  state.tick = 5;
  push(
    'Scenario D: DL wakes under RT -- upgrade, current rt class notified',
    'A SCHED_DEADLINE task becomes runnable (dl_entity_preempt() pending). sched_class_above(dl, rt) is true, so the upgrade branch fires again. rq->next_class->wakeup_preempt -- now wakeup_preempt_rt (rt.c:1619) -- is invoked. Its first check (rt.c:1626) returns immediately because p is not rt_sched_class, but the call itself is the point: it gives rt a notification hook.',
    ['pid-301'],
    state,
  );

  // --- Frame 17: resched + rq->next_class = dl ---
  state = cloneState(state);
  state.reschedFired = true;
  state.needResched = true;
  state.nextClass = 'deadline';
  state.classHandler = 'wakeup_preempt_dl';
  state.callPath = 'wakeup_preempt -> resched_curr; update next_class';
  state.srcRef = 'kernel/sched/core.c:2253 wakeup_preempt() -> deadline.c:2530 wakeup_preempt_dl()';
  push(
    'resched_curr() + rq->next_class = dl_sched_class',
    'core.c:2252 calls resched_curr(), core.c:2253 sets rq->next_class = dl_sched_class. The deadline class\'s own wakeup_preempt_dl() (deadline.c:2530) is the handler that would have been called had rq->next_class already been dl; it uses dl_entity_preempt() to compare absolute deadlines. After __schedule() runs, pick_next_task_dl() will return dl-waker and core.c:7105 will reaffirm rq->next_class.',
    ['pid-301'],
    state,
  );

  // --- Frame 18: CPU idles -> rq->next_class = idle ---
  state = cloneState(state);
  state.tasks = state.tasks.map(t => ({ ...t, state: t.state === 'running' ? 'sleeping' : t.state }));
  state.runningPid = null;
  state.nextClass = 'idle';
  state.wakingTask = undefined;
  state.preemptPath = undefined;
  state.classHandler = null;
  state.reschedFired = false;
  state.needResched = false;
  state.wakeFlags = noFlags;
  state.callPath = '__schedule (SM_IDLE)';
  state.srcRef = 'kernel/sched/core.c:7085 scx_enabled() (rq->next_class = &idle_sched_class at core.c:7087)';
  state.tick = 6;
  push(
    'CPU idles: rq->next_class reset to idle_sched_class',
    'All runnable tasks blocked or exited. In the SM_IDLE path of __schedule() (core.c:7083) with !rq->nr_running, core.c:7087 sets rq->next_class = &idle_sched_class. Any future wakeup will satisfy sched_class_above(p->sched_class, idle) for every non-idle class, so the upgrade path fires cleanly and the rq reboots its tracked-class cache from the bottom.',
    [],
    state,
  );

  return frames;
}

const NS = 'http://www.w3.org/2000/svg';
const TASK_COLORS = ['#58a6ff', '#3fb950', '#f0883e', '#bc8cff'];

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as CfsState;
  const margin = { top: 20, left: 10, right: 10, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '14');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'CFS Scheduler - Red-Black Tree';
  container.appendChild(title);

  // Draw tasks as bars on a vruntime axis
  const maxVruntime = Math.max(20, ...data.tasks.map(t => t.vruntime)) * 1.2;
  const axisTop = margin.top + 10;
  const axisHeight = 30;
  const barWidth = 50;

  // Axis line
  const axisLine = document.createElementNS(NS, 'line');
  axisLine.setAttribute('x1', String(margin.left));
  axisLine.setAttribute('y1', String(axisTop + axisHeight + 10));
  axisLine.setAttribute('x2', String(width - margin.right));
  axisLine.setAttribute('y2', String(axisTop + axisHeight + 10));
  axisLine.setAttribute('class', 'anim-axis');
  container.appendChild(axisLine);

  // Axis label
  const axisLabel = document.createElementNS(NS, 'text');
  axisLabel.setAttribute('x', String(width / 2));
  axisLabel.setAttribute('y', String(axisTop + axisHeight + 28));
  axisLabel.setAttribute('text-anchor', 'middle');
  axisLabel.setAttribute('class', 'anim-axis-label');
  axisLabel.textContent = 'vruntime -->';
  container.appendChild(axisLabel);

  // "NEXT" indicator label
  const readyTasks = data.tasks.filter(t => t.state !== 'sleeping');
  const lowestVruntime = readyTasks.length > 0 ? Math.min(...readyTasks.map(t => t.vruntime)) : 0;

  // Draw each task
  const sortedTasks = [...data.tasks].sort((a, b) => a.vruntime - b.vruntime);
  for (let i = 0; i < sortedTasks.length; i++) {
    const task = sortedTasks[i];
    const x = margin.left + (task.vruntime / maxVruntime) * (usableWidth - barWidth);
    const y = axisTop;
    const color = TASK_COLORS[task.pid % TASK_COLORS.length];

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(barWidth));
    rect.setAttribute('height', String(axisHeight));
    rect.setAttribute('rx', '4');
    let cls = 'anim-task';
    if (task.state === 'running') cls += ' anim-task-running';
    if (task.state === 'sleeping') cls += ' anim-task-sleeping';
    if (frame.highlights.includes(`pid-${task.pid}`)) cls += ' anim-highlight';
    if (task.vruntime === lowestVruntime && task.state !== 'sleeping') cls += ' anim-task-next';
    rect.setAttribute('class', cls);
    rect.setAttribute('fill', task.state === 'sleeping' ? '#333' : color);
    container.appendChild(rect);

    // Task name
    const nameText = document.createElementNS(NS, 'text');
    nameText.setAttribute('x', String(x + barWidth / 2));
    nameText.setAttribute('y', String(y + axisHeight / 2 + 4));
    nameText.setAttribute('text-anchor', 'middle');
    nameText.setAttribute('class', 'anim-task-name');
    nameText.textContent = task.name;
    container.appendChild(nameText);

    // Vruntime label below
    const vrText = document.createElementNS(NS, 'text');
    vrText.setAttribute('x', String(x + barWidth / 2));
    vrText.setAttribute('y', String(y + axisHeight + 8));
    vrText.setAttribute('text-anchor', 'middle');
    vrText.setAttribute('class', 'anim-vruntime-label');
    vrText.textContent = task.vruntime.toFixed(1);
    container.appendChild(vrText);

    // "NEXT" marker for leftmost ready task
    if (task.vruntime === lowestVruntime && task.state !== 'sleeping' && data.runningPid === null) {
      const nextLabel = document.createElementNS(NS, 'text');
      nextLabel.setAttribute('x', String(x + barWidth / 2));
      nextLabel.setAttribute('y', String(y - 6));
      nextLabel.setAttribute('text-anchor', 'middle');
      nextLabel.setAttribute('class', 'anim-next-label');
      nextLabel.textContent = 'NEXT';
      container.appendChild(nextLabel);
    }
  }

  // Task info table
  const tableTop = axisTop + axisHeight + 50;
  const colWidth = usableWidth / data.tasks.length;

  // Header
  const header = document.createElementNS(NS, 'text');
  header.setAttribute('x', String(margin.left));
  header.setAttribute('y', String(tableTop));
  header.setAttribute('class', 'anim-table-header');
  header.textContent = 'Task Details:';
  container.appendChild(header);

  data.tasks.forEach((task, i) => {
    const tx = margin.left + i * colWidth;
    const color = TASK_COLORS[task.pid % TASK_COLORS.length];

    const info = document.createElementNS(NS, 'text');
    info.setAttribute('x', String(tx));
    info.setAttribute('y', String(tableTop + 18));
    info.setAttribute('class', 'anim-task-info');
    info.setAttribute('fill', color);
    info.textContent = `${task.name} w:${task.weight} vr:${task.vruntime.toFixed(1)}`;
    container.appendChild(info);
  });
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'equal-weight', label: 'Equal Weight Round-Robin' },
  { id: 'nice-values', label: 'Nice Value Priority' },
  { id: 'task-wakeup', label: 'Task Wake-Up' },
  { id: 'cross-class-preempt', label: 'Cross-Class Preemption (v7.0)' },
];

const cfsScheduler: AnimationModule = {
  config: {
    id: 'cfs-scheduler',
    title: 'CFS Scheduler Visualization',
    skillName: 'scheduler-fundamentals',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'nice-values':
        return generateNiceValues();
      case 'task-wakeup':
        return generateTaskWakeup();
      case 'cross-class-preempt':
        return generateCrossClassPreempt();
      case 'equal-weight':
      default:
        return generateEqualWeight();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default cfsScheduler;
