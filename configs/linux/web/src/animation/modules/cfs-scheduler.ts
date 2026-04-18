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
    srcRef: 'kernel/sched/core.c:7105 rq->next_class = next->sched_class',
  };

  // Frame 1: Initial state
  frames.push({
    step: 0,
    label: 'Initial: CFS task runs, rq->next_class = fair_sched_class',
    description: 'A SCHED_NORMAL (CFS) task "cfs-current" is on the CPU. The runqueue tracks rq->next_class = fair_sched_class, set after the most recent pick_next_task() in __schedule(). In v7.0 this field records the highest-priority sched_class currently relevant to this rq, and is used to short-circuit wakeup_preempt() for cross-class wakeups.',
    highlights: ['pid-101'],
    data: cloneState(state),
  });

  // Frame 2: CFS task wakes up -> wakeup_preempt() entry
  state = cloneState(state);
  state.wakingTask = { class: 'fair', prio: 120, name: 'cfs-waker' };
  state.srcRef = 'kernel/sched/core.c:2243 wakeup_preempt()';
  state.tick = 1;
  frames.push({
    step: 1,
    label: 'CFS task wakes up: wakeup_preempt() entry',
    description: 'try_to_wake_up() has enqueued "cfs-waker" on this rq and called wakeup_preempt(rq, p, flags). Execution enters wakeup_preempt() in kernel/sched/core.c. The function will compare p->sched_class against rq->next_class to decide whether to consult the current class or upgrade.',
    highlights: ['pid-102'],
    data: cloneState(state),
  });

  // Frame 3: Same-class fast path taken
  state = cloneState(state);
  state.srcRef = 'kernel/sched/core.c:2247 if (p->sched_class == rq->next_class)';
  frames.push({
    step: 2,
    label: 'Same-class fast path: p->sched_class == rq->next_class',
    description: 'Both the waker and rq->next_class are fair_sched_class, so the first branch is taken. The call becomes rq->next_class->wakeup_preempt(rq, p, flags), which dispatches to check_preempt_wakeup_fair() inside kernel/sched/fair.c. EEVDF/CFS decides based on virtual deadlines; cfs-current keeps running in this example.',
    highlights: ['pid-102'],
    data: cloneState(state),
  });

  // Frame 4: RT task wakes up -> wakeup_preempt() re-entered
  state = cloneState(state);
  state.wakingTask = { class: 'rt', prio: 50, name: 'rt-waker' };
  state.srcRef = 'kernel/sched/core.c:2243 wakeup_preempt()';
  state.tick = 2;
  frames.push({
    step: 3,
    label: 'RT task wakes up: wakeup_preempt() re-entered',
    description: 'An RT task "rt-waker" becomes runnable (e.g., an IRQ-driven wake). wakeup_preempt() runs again. Now p->sched_class is rt_sched_class while rq->next_class is still fair_sched_class, so the same-class branch is skipped.',
    highlights: ['pid-201'],
    data: cloneState(state),
  });

  // Frame 5: sched_class_above(rt, fair) is true -> upgrade path
  state = cloneState(state);
  state.srcRef = 'kernel/sched/core.c:2250 if (sched_class_above(p->sched_class, rq->next_class))';
  frames.push({
    step: 4,
    label: 'sched_class_above(rt, fair) is true: upgrade branch',
    description: 'sched_class_above() compares the linker-ordered sched_class entries. rt_sched_class is above fair_sched_class, so the else-if branch fires. This is the cross-class upgrade path introduced in v7.0 to fix wakeup_preempt() not asking the current class whether it wants to yield.',
    highlights: ['pid-201'],
    data: cloneState(state),
  });

  // Frame 6: ask the CURRENT class first
  state = cloneState(state);
  state.srcRef = 'kernel/sched/core.c:2251 rq->next_class->wakeup_preempt(rq, p, flags)';
  frames.push({
    step: 5,
    label: 'Ask the CURRENT class: rq->next_class->wakeup_preempt(rq, p, flags)',
    description: 'Key insight of the v7.0 rework: before marking the CPU for preemption, wakeup_preempt() first invokes the CURRENT tracked class\'s handler (here fair). This gives CFS/EEVDF a chance to update internal state (e.g., vlag/deadline bookkeeping) even though a higher class is about to take over. Previous kernels skipped this call, leaving stale state.',
    highlights: ['pid-101', 'pid-201'],
    data: cloneState(state),
  });

  // Frame 7: resched_curr + rq->next_class = p->sched_class
  state = cloneState(state);
  // Conceptual: rt-waker will run next after resched; tracked class becomes rt.
  state.nextClass = 'rt';
  state.srcRef = 'kernel/sched/core.c:2253 rq->next_class = p->sched_class';
  frames.push({
    step: 6,
    label: 'Upgrade: resched_curr() then rq->next_class = rt_sched_class',
    description: 'resched_curr(rq) sets TIF_NEED_RESCHED so the next preemption point calls __schedule(). Crucially, rq->next_class is then bumped to p->sched_class (rt_sched_class). Future wakeups from fair_sched_class will now hit the fast-skip path because they are BELOW the tracked class and cannot preempt rt.',
    highlights: ['pid-201'],
    data: cloneState(state),
  });

  // Frame 8: Context switch: pick_next_task + rq->next_class = next->sched_class
  state = cloneState(state);
  state.tasks = state.tasks.map(t => {
    if (t.pid === 101) return { ...t, state: 'ready' };
    if (t.pid === 201) return { ...t, state: 'running' };
    return t;
  });
  state.runningPid = 201;
  state.wakingTask = undefined;
  state.nextClass = 'rt';
  state.srcRef = 'kernel/sched/core.c:7105 rq->next_class = next->sched_class';
  state.tick = 3;
  frames.push({
    step: 7,
    label: 'Context switch: pick_next_task picks rt-waker, rq->next_class refreshed',
    description: '__schedule() calls pick_next_task(), which iterates sched_class_highest..idle and returns rt-waker from pick_next_task_rt(). Immediately after, rq->next_class = next->sched_class re-anchors the tracked class to whatever actually got picked. This is the authoritative update point for rq->next_class.',
    highlights: ['pid-201'],
    data: cloneState(state),
  });

  // Frame 9: CFS task wakes up while RT is running -> class-below fast skip
  state = cloneState(state);
  state.wakingTask = { class: 'fair', prio: 120, name: 'cfs-waker' };
  state.srcRef = 'kernel/sched/core.c:2250 if (sched_class_above(p->sched_class, rq->next_class))';
  state.tick = 4;
  frames.push({
    step: 8,
    label: 'CFS wakes while RT runs: below rq->next_class, no preempt check',
    description: 'Another fair task wakes up. p->sched_class (fair) is NOT equal to rq->next_class (rt), and sched_class_above(fair, rt) is FALSE. Both branches are skipped, so wakeup_preempt() returns without calling any class handler or resched_curr(). This is the v7.0 optimization: a lower-class wakeup cannot preempt a higher-class runner, so skip the work entirely.',
    highlights: ['pid-102'],
    data: cloneState(state),
  });

  // Frame 10 (optional): Deadline task wakes up -> upgrade rt -> deadline
  state = cloneState(state);
  state.wakingTask = { class: 'deadline', prio: -1, name: 'dl-waker' };
  state.srcRef = 'kernel/sched/core.c:2250 if (sched_class_above(p->sched_class, rq->next_class))';
  state.tick = 5;
  frames.push({
    step: 9,
    label: 'Deadline task wakes: sched_class_above(deadline, rt) = true',
    description: 'A SCHED_DEADLINE task becomes runnable. dl_sched_class is above rt_sched_class, so the upgrade branch fires again: rq->next_class->wakeup_preempt() notifies rt, resched_curr() marks the CPU, and rq->next_class is raised to dl_sched_class. The same pattern composes cleanly across every class boundary.',
    highlights: ['pid-301'],
    data: cloneState(state),
  });

  // Frame 11: Upgrade to deadline
  state = cloneState(state);
  state.nextClass = 'deadline';
  state.srcRef = 'kernel/sched/core.c:2253 rq->next_class = p->sched_class';
  frames.push({
    step: 10,
    label: 'rq->next_class = dl_sched_class (highest tracked so far)',
    description: 'rq->next_class now tracks deadline. Subsequent wakeups from rt, fair, or idle classes will all hit the below-class skip. When the CPU finally idles, __schedule() will reset rq->next_class = &idle_sched_class so the next wakeup starts fresh.',
    highlights: ['pid-301'],
    data: cloneState(state),
  });

  // Frame 12: CPU goes idle -> reset to idle_sched_class
  state = cloneState(state);
  state.tasks = state.tasks.map(t => ({ ...t, state: t.state === 'running' ? 'sleeping' : t.state }));
  state.runningPid = null;
  state.nextClass = 'idle';
  state.wakingTask = undefined;
  state.srcRef = 'kernel/sched/core.c:7087 rq->next_class = &idle_sched_class';
  state.tick = 6;
  frames.push({
    step: 11,
    label: 'CPU idles: rq->next_class reset to idle_sched_class',
    description: 'All runnable tasks have blocked or finished. In the SM_IDLE path of __schedule(), with !rq->nr_running, the kernel sets rq->next_class = &idle_sched_class. Any future wakeup will satisfy sched_class_above(p->sched_class, idle) for every non-idle class, triggering the upgrade path cleanly.',
    highlights: [],
    data: cloneState(state),
  });

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
