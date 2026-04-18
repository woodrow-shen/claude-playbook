import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

/*
 * EEVDF Scheduler Animation -- traces real kernel code from kernel/sched/fair.c
 *
 * Key functions traced:
 *   avg_vruntime()       -- fair.c:715-749  weighted average of all entities
 *   entity_eligible()    -- fair.c:813-816  lag_i >= 0 => V >= v_i
 *   vruntime_eligible()  -- fair.c:797-811  avoids division: sum_w_vruntime >= (v - zero_vruntime) * sum_weight
 *   __pick_eevdf()       -- fair.c:1010-1079 augmented RB-tree walk with min_vruntime pruning
 *   update_curr()        -- fair.c:1285-1331 advance vruntime, check deadline
 *   update_deadline()    -- fair.c:1117-1139 vd_i = ve_i + r_i/w_i
 *   calc_delta_fair()    -- fair.c:290-296   delta /= w (scaled by NICE_0_LOAD)
 *   place_entity()       -- fair.c:5163-5230 placement with lag preservation
 *   update_entity_lag()  -- fair.c:767-778   vlag = avg_vruntime() - se->vruntime, clamped
 */

export interface EevdfTask {
  id: string;
  name: string;
  weight: number;
  nice: number;
  vruntime: number;
  deadline: number;
  slice: number;
  lag: number;
  state: 'running' | 'eligible' | 'ineligible' | 'sleeping';
}

export interface EevdfTreeNode {
  taskId: string;
  left?: string;
  right?: string;
  color: 'red' | 'black';
  minDeadline: number;
  // Augmented field: minimum vruntime in subtree (used by __pick_eevdf for pruning)
  minVruntime: number;
}

export interface EevdfState {
  tasks: EevdfTask[];
  avgVruntime: number;
  currentTaskId: string | null;
  treeNodes: EevdfTreeNode[];
  srcRef: string;
  /** Which node __pick_eevdf is currently examining (for tree walk visualization) */
  pickCursor?: string;
}

// --- Helpers ---

function cloneTasks(tasks: EevdfTask[]): EevdfTask[] {
  return tasks.map(t => ({ ...t }));
}

/**
 * avg_vruntime() -- fair.c:715-749
 *
 * Real kernel uses:
 *   runtime = cfs_rq->sum_w_vruntime
 *   if (curr on_rq) runtime += entity_key(cfs_rq, curr) * w
 *   delta = div_s64(runtime, weight)
 *   return zero_vruntime + delta
 *
 * We simplify to: sum(vruntime_i * weight_i) / sum(weight_i)
 * This is mathematically equivalent when zero_vruntime=0.
 */
function computeAvgVruntime(tasks: EevdfTask[]): number {
  const active = tasks.filter(t => t.state !== 'sleeping');
  if (active.length === 0) return 0;
  const totalWeight = active.reduce((s, t) => s + t.weight, 0);
  const weightedSum = active.reduce((s, t) => s + t.vruntime * t.weight, 0);
  return weightedSum / totalWeight;
}

/**
 * entity_eligible() -- fair.c:813-816
 * Calls vruntime_eligible() -- fair.c:797-811
 *
 * Real kernel avoids division for precision:
 *   avg >= (vruntime - zero_vruntime) * load
 * where avg = sum_w_vruntime (+ curr contribution if on_rq)
 *
 * Equivalent to: vruntime <= avg_vruntime()
 */
function isEligible(task: EevdfTask, avgVr: number): boolean {
  return task.state !== 'sleeping' && task.vruntime <= avgVr + 0.01;
}

function updateEligibility(tasks: EevdfTask[], avgVr: number, runningId: string | null): void {
  for (const t of tasks) {
    if (t.state === 'sleeping') continue;
    if (t.id === runningId) {
      t.state = 'running';
    } else {
      t.state = isEligible(t, avgVr) ? 'eligible' : 'ineligible';
    }
  }
}

/**
 * update_deadline() -- fair.c:1117-1139
 *   EEVDF: vd_i = ve_i + r_i / w_i
 *   se->deadline = se->vruntime + calc_delta_fair(se->slice, se)
 *
 * calc_delta_fair() -- fair.c:290-296
 *   if (weight != NICE_0_LOAD) delta = __calc_delta(delta, NICE_0_LOAD, &se->load)
 *   Effectively: delta * 1024 / weight
 */
function computeDeadline(task: EevdfTask): number {
  return task.vruntime + (task.slice * 1024) / task.weight;
}

/**
 * __pick_eevdf() -- fair.c:1010-1079
 *
 * Algorithm:
 *   1. If nr_queued==1, return the sole entity (line 1021-1022)
 *   2. Check PICK_BUDDY: if cfs_rq->next is eligible, return it (line 1027-1031)
 *   3. If curr is on_rq and eligible, consider it; check protect_slice (line 1034-1038)
 *   4. Check leftmost entity: if eligible, it's the best (earliest vruntime => earliest deadline
 *      among eligible because tree is augmented) (line 1041-1043)
 *   5. Heap search: walk RB-tree. At each node:
 *      - If left subtree has eligible entities (left->min_vruntime passes vruntime_eligible),
 *        go left (line 1054-1058)
 *      - Check current node for eligibility (line 1067-1069)
 *      - Otherwise go right (line 1072)
 *   6. If best found, check if curr has earlier deadline (line 1075-1076)
 */
function pickEevdf(tasks: EevdfTask[], avgVr: number): EevdfTask | null {
  const eligible = tasks.filter(t => t.state !== 'sleeping' && t.state !== 'ineligible' && isEligible(t, avgVr));
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => a.deadline - b.deadline);
  return eligible[0];
}

/** Build an RB-tree representation sorted by vruntime with augmented min_vruntime */
function buildTreeNodes(tasks: EevdfTask[]): EevdfTreeNode[] {
  const active = tasks.filter(t => t.state !== 'sleeping').sort((a, b) => a.vruntime - b.vruntime);
  if (active.length === 0) return [];

  const nodes: EevdfTreeNode[] = [];

  function buildSubtree(items: EevdfTask[], depth: number): string | undefined {
    if (items.length === 0) return undefined;
    const mid = Math.floor(items.length / 2);
    const task = items[mid];
    const left = buildSubtree(items.slice(0, mid), depth + 1);
    const right = buildSubtree(items.slice(mid + 1), depth + 1);

    // Compute min_vruntime for this subtree (augmented field)
    let minVr = task.vruntime;
    const leftNode = nodes.find(n => n.taskId === left);
    const rightNode = nodes.find(n => n.taskId === right);
    if (leftNode) minVr = Math.min(minVr, leftNode.minVruntime);
    if (rightNode) minVr = Math.min(minVr, rightNode.minVruntime);

    // Compute min deadline for subtree
    let minDl = task.deadline;
    if (leftNode) minDl = Math.min(minDl, leftNode.minDeadline);
    if (rightNode) minDl = Math.min(minDl, rightNode.minDeadline);

    nodes.push({
      taskId: task.id,
      left,
      right,
      color: depth === 0 ? 'black' : (depth % 2 === 0 ? 'black' : 'red'),
      minDeadline: minDl,
      minVruntime: minVr,
    });
    return task.id;
  }

  buildSubtree(active, 0);
  return nodes;
}

// Nice-to-weight mapping (from kernel's sched_prio_to_weight[] array, kernel/sched/core.c)
const NICE_TO_WEIGHT: Record<number, number> = {
  '-10': 9548, '-5': 3121, '-3': 1820, '-2': 1515,
  '0': 1024, '2': 694, '3': 586, '5': 335, '10': 110,
};

function weightForNice(nice: number): number {
  return NICE_TO_WEIGHT[nice] ?? 1024;
}

// --- Scenario generators ---

function makeState(tasks: EevdfTask[], avgVr: number, currentId: string | null, srcRef: string, pickCursor?: string): EevdfState {
  return {
    tasks: cloneTasks(tasks),
    avgVruntime: avgVr,
    currentTaskId: currentId,
    treeNodes: buildTreeNodes(tasks),
    srcRef,
    pickCursor,
  };
}

function generatePickNextTask(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const SLICE = 4; // sysctl_sched_base_slice (in ms for our animation; kernel uses ns)

  const tasks: EevdfTask[] = [
    { id: 'T1', name: 'httpd', weight: 1024, nice: 0, vruntime: 6, deadline: 0, slice: SLICE, lag: 0, state: 'eligible' },
    { id: 'T2', name: 'bash', weight: 1024, nice: 0, vruntime: 2, deadline: 0, slice: SLICE, lag: 0, state: 'eligible' },
    { id: 'T3', name: 'compile', weight: 3121, nice: -5, vruntime: 4, deadline: 0, slice: SLICE, lag: 0, state: 'eligible' },
    { id: 'T4', name: 'vim', weight: 335, nice: 5, vruntime: 8, deadline: 0, slice: SLICE, lag: 0, state: 'eligible' },
  ];

  // Compute initial deadlines: update_deadline() fair.c:1133
  // se->deadline = se->vruntime + calc_delta_fair(se->slice, se)
  for (const t of tasks) {
    t.deadline = computeDeadline(t);
  }

  let avgVr = computeAvgVruntime(tasks);
  updateEligibility(tasks, avgVr, null);

  // Frame 0: Overview with struct cfs_rq context
  frames.push({
    step: 0,
    label: 'EEVDF: 4 entities in cfs_rq->tasks_timeline',
    description: 'The EEVDF scheduler (Earliest Eligible Virtual Deadline First, merged in Linux 6.6) stores sched_entity structs in an augmented RB-tree (cfs_rq->tasks_timeline) keyed by se->vruntime. Each node also tracks se->min_vruntime (minimum vruntime in subtree) for eligibility pruning, and se->deadline for EEVDF picking. The tree is defined in kernel/sched/sched.h: struct cfs_rq.',
    highlights: [],
    data: makeState(tasks, avgVr, null, 'kernel/sched/sched.h: struct cfs_rq { struct rb_root_cached tasks_timeline; }'),
  });

  // Frame 1: avg_vruntime() computation -- fair.c:715-749
  frames.push({
    step: 1,
    label: `avg_vruntime() = ${avgVr.toFixed(1)}`,
    description: `fair.c:715 avg_vruntime(cfs_rq): computes V = zero_vruntime + div_s64(sum_w_vruntime, sum_weight). The kernel maintains cfs_rq->sum_w_vruntime incrementally via avg_vruntime_add()/sub() on enqueue/dequeue (fair.c:672-701). If curr is on_rq, its contribution is added dynamically (line 727-731). The division at line 738 uses div_s64 with a left-bias floor for negative values (line 735-736).`,
    highlights: [],
    data: makeState(tasks, avgVr, null, 'fair.c:715-749 avg_vruntime()'),
  });

  // Frame 2: entity_eligible() check -- fair.c:813-816 -> vruntime_eligible() fair.c:797-811
  const eligibleNames = tasks.filter(t => t.state === 'eligible').map(t => t.name);
  const ineligibleNames = tasks.filter(t => t.state === 'ineligible').map(t => t.name);
  frames.push({
    step: 2,
    label: 'entity_eligible(): V >= v_i means lag >= 0',
    description: `fair.c:813 entity_eligible(cfs_rq, se) calls vruntime_eligible(cfs_rq, se->vruntime) at line 797. To avoid precision loss from division, the kernel checks: sum_w_vruntime >= (vruntime - zero_vruntime) * sum_weight (line 810). This is equivalent to avg_vruntime >= vruntime. Eligible (lag >= 0): [${eligibleNames.join(', ')}]. Ineligible (lag < 0): [${ineligibleNames.join(', ')}]. Eligibility gates scheduling: only tasks that received LESS than their fair share can be picked.`,
    highlights: eligibleNames.map(n => tasks.find(t => t.name === n)!.id),
    data: makeState(tasks, avgVr, null, 'fair.c:797-816 vruntime_eligible() + entity_eligible()'),
  });

  // Frames 3-5: __pick_eevdf() tree walk -- fair.c:1010-1079
  // Step 1: Check if nr_queued==1 (line 1021) -- no, we have 4
  // Step 2: Check PICK_BUDDY (line 1027) -- skip for demo
  // Step 3: Check leftmost entity (line 1041)
  const sortedByVr = [...tasks].filter(t => t.state !== 'sleeping').sort((a, b) => a.vruntime - b.vruntime);
  const leftmost = sortedByVr[0]; // bash with vruntime=2

  frames.push({
    step: 3,
    label: `__pick_eevdf: check leftmost = ${leftmost.name} (vr=${leftmost.vruntime.toFixed(1)})`,
    description: `fair.c:1010 __pick_eevdf(cfs_rq, protect=true). First: nr_queued=4, so skip single-entity shortcut (line 1021). PICK_BUDDY check skipped (line 1027). Check curr eligibility (line 1034). Then line 1041: se = __pick_first_entity(cfs_rq) -- the leftmost node. If entity_eligible(cfs_rq, se), then best=se and goto found. ${leftmost.name} has vruntime=${leftmost.vruntime.toFixed(1)} <= avg=${avgVr.toFixed(1)}, so it IS eligible.`,
    highlights: [leftmost.id],
    data: makeState(tasks, avgVr, null, 'fair.c:1041-1043 if (se && entity_eligible(cfs_rq, se)) { best = se; goto found; }', leftmost.id),
  });

  // The leftmost eligible entity is best, but __pick_eevdf also checks curr
  frames.push({
    step: 4,
    label: `__pick_eevdf: best=${leftmost.name}, check deadline`,
    description: `fair.c:1074-1076: After finding best via the leftmost shortcut, __pick_eevdf checks: if curr exists and entity_before(curr, best), prefer curr. entity_before() compares deadlines (fair.c:370). This prefers the task with the earlier virtual deadline. ${leftmost.name}'s deadline=${leftmost.deadline.toFixed(1)}.`,
    highlights: [leftmost.id],
    data: makeState(tasks, avgVr, null, 'fair.c:1075-1076 if (!best || (curr && entity_before(curr, best))) best = curr'),
  });

  // Pick winner: among eligible, earliest deadline
  const eligible = tasks.filter(t => t.state === 'eligible').sort((a, b) => a.deadline - b.deadline);
  const winner = eligible[0];
  winner.state = 'running';
  frames.push({
    step: 5,
    label: `PICKED: ${winner.name} (deadline=${winner.deadline.toFixed(1)})`,
    description: `__pick_eevdf returns ${winner.name} -- the eligible entity with the earliest virtual deadline. Unlike old CFS which picked the leftmost (lowest vruntime), EEVDF picks by deadline among eligible tasks. This is the key improvement: tasks with shorter slices get earlier deadlines and thus better latency, providing formal latency guarantees (bounded lag theorem).`,
    highlights: [winner.id],
    data: makeState(tasks, avgVr, winner.id, 'fair.c:1078 return best (pick_eevdf complete)'),
  });

  // Frame: update_curr() -- fair.c:1285-1331
  const delta = (1024 / winner.weight) * SLICE;
  winner.vruntime += delta;
  // update_deadline() -- fair.c:1117-1139
  winner.deadline = computeDeadline(winner);
  winner.lag = -delta;
  avgVr = computeAvgVruntime(tasks);
  updateEligibility(tasks, avgVr, winner.id);

  frames.push({
    step: 6,
    label: `update_curr: vruntime += ${delta.toFixed(1)}`,
    description: `fair.c:1285 update_curr(cfs_rq): delta_exec = update_se(rq, curr) gets wall-clock ns since last update. Line 1305: curr->vruntime += calc_delta_fair(delta_exec, curr). calc_delta_fair (line 290) divides by weight: delta * NICE_0_LOAD / se->load.weight = ${SLICE} * 1024 / ${winner.weight} = ${delta.toFixed(1)}. Line 1306: resched = update_deadline(cfs_rq, curr) -- checks if vruntime >= deadline (line 1119). If so, computes new deadline: se->deadline = se->vruntime + calc_delta_fair(se->slice, se) (line 1133).`,
    highlights: [winner.id],
    data: makeState(tasks, avgVr, winner.id, 'fair.c:1285-1331 update_curr() + fair.c:1117-1139 update_deadline()'),
  });

  // Frame: slice expires, resched_curr_lazy
  frames.push({
    step: 7,
    label: 'update_deadline returns true: reschedule',
    description: `fair.c:1117-1139: update_deadline() returns true when vruntime >= deadline (the slice is exhausted). Line 1327-1329: if (resched || !protect_slice(curr)) { resched_curr_lazy(rq); clear_buddies(cfs_rq, curr); }. resched_curr_lazy sets TIF_NEED_RESCHED_LAZY, deferring the actual reschedule to a safe preemption point. The task stays in the RB-tree with updated vruntime.`,
    highlights: [winner.id],
    data: makeState(tasks, avgVr, winner.id, 'fair.c:1327-1329 resched_curr_lazy(rq)'),
  });

  // Frame: re-pick
  winner.state = 'eligible';
  updateEligibility(tasks, avgVr, null);
  const next = pickEevdf(tasks, avgVr);
  if (next) {
    next.state = 'running';
    frames.push({
      step: 8,
      label: `Re-pick: ${next.name} (deadline=${next.deadline.toFixed(1)})`,
      description: `schedule() -> pick_next_task_fair() -> pick_eevdf(cfs_rq). Eligibility recalculated: avg_vruntime=${avgVr.toFixed(1)}. ${next.name} has the earliest deadline among eligible tasks. The cycle repeats: pick -> run -> update_curr -> update_deadline -> reschedule. This loop runs thousands of times per second (driven by timer tick at HZ frequency, typically 250-1000Hz).`,
      highlights: [next.id],
      data: makeState(tasks, avgVr, next.id, 'fair.c:5546 se = pick_eevdf(cfs_rq)'),
    });
  }

  // Frame: summary
  frames.push({
    step: frames.length,
    label: 'EEVDF: eligible + earliest deadline = fairness + latency',
    description: 'The EEVDF algorithm provides two guarantees: (1) FAIRNESS via eligibility -- entity_eligible() (fair.c:813) ensures only tasks with lag >= 0 (received less than fair share) can run. (2) LATENCY via deadlines -- among eligible tasks, __pick_eevdf() (fair.c:1010) picks the earliest deadline, giving short-slice/interactive tasks priority. The augmented RB-tree with min_vruntime enables O(log n) pruning of ineligible subtrees.',
    highlights: [],
    data: makeState(tasks, avgVr, null, 'fair.c:1010-1079 __pick_eevdf() summary'),
  });

  return frames;
}

function generateSliceExpiry(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const SLICE = 4;

  const tasks: EevdfTask[] = [
    { id: 'T1', name: 'httpd', weight: 1024, nice: 0, vruntime: 3, deadline: 0, slice: SLICE, lag: 1, state: 'eligible' },
    { id: 'T2', name: 'bash', weight: 1024, nice: 0, vruntime: 5, deadline: 0, slice: SLICE, lag: -1, state: 'eligible' },
    { id: 'T3', name: 'cron', weight: 1024, nice: 0, vruntime: 7, deadline: 0, slice: SLICE, lag: -2, state: 'eligible' },
  ];

  for (const t of tasks) t.deadline = computeDeadline(t);
  let avgVr = computeAvgVruntime(tasks);

  tasks[0].state = 'running';
  updateEligibility(tasks, avgVr, 'T1');

  // Frame 0: httpd is curr
  frames.push({
    step: 0,
    label: 'httpd is cfs_rq->curr',
    description: 'httpd is the current sched_entity on this CPU (cfs_rq->curr). It was selected by pick_eevdf() because it had the earliest eligible deadline. The kernel tracks execution time via update_se() which reads the hardware clock. Each timer interrupt triggers scheduler_tick() -> entity_tick() -> update_curr().',
    highlights: ['T1'],
    data: makeState(tasks, avgVr, 'T1', 'kernel/sched/fair.c: cfs_rq->curr = httpd'),
  });

  // Half-slice: update_curr advances vruntime
  const running = tasks[0];
  const halfDelta = (1024 / running.weight) * (SLICE / 2);

  running.vruntime += halfDelta;
  running.deadline = computeDeadline(running);
  running.lag -= halfDelta;
  avgVr = computeAvgVruntime(tasks);
  updateEligibility(tasks, avgVr, 'T1');

  frames.push({
    step: 1,
    label: `update_curr: vruntime += ${halfDelta.toFixed(1)} (half slice)`,
    description: `fair.c:1285 update_curr(): delta_exec = update_se(rq, curr) returns ns since last call. Line 1305: curr->vruntime += calc_delta_fair(delta_exec, curr). After half the slice, vruntime=${running.vruntime.toFixed(1)}. Line 1306: update_deadline() checks vruntime < deadline (${running.deadline.toFixed(1)}) -- returns false, slice not yet exhausted. No reschedule triggered.`,
    highlights: ['T1'],
    data: makeState(tasks, avgVr, 'T1', 'fair.c:1305 curr->vruntime += calc_delta_fair(delta_exec, curr)'),
  });

  // Slice expires
  running.vruntime += halfDelta;
  running.deadline = computeDeadline(running);
  running.lag -= halfDelta;
  avgVr = computeAvgVruntime(tasks);
  updateEligibility(tasks, avgVr, 'T1');

  frames.push({
    step: 2,
    label: 'Slice expired! vruntime >= old deadline',
    description: `fair.c:1117-1119: update_deadline(cfs_rq, se) checks: vruntime_cmp(se->vruntime, "<", se->deadline). Now vruntime=${running.vruntime.toFixed(1)} >= deadline, so the comparison returns FALSE. The function proceeds to line 1127-1128: if (!se->custom_slice) se->slice = sysctl_sched_base_slice. Then line 1133: se->deadline = se->vruntime + calc_delta_fair(se->slice, se). Returns TRUE (line 1138), triggering reschedule.`,
    highlights: ['T1'],
    data: makeState(tasks, avgVr, 'T1', 'fair.c:1117-1139 update_deadline() returns true'),
  });

  // New deadline computed
  frames.push({
    step: 3,
    label: `New deadline: ${running.deadline.toFixed(1)}`,
    description: `fair.c:1133 se->deadline = se->vruntime + calc_delta_fair(se->slice, se) = ${running.vruntime.toFixed(1)} + calc_delta_fair(${SLICE}, se) = ${running.deadline.toFixed(1)}. calc_delta_fair (line 290-296): if weight != NICE_0_LOAD, uses __calc_delta(delta, NICE_0_LOAD, &se->load). For weight=1024 (nice 0), NICE_0_LOAD=1024, so delta passes through unchanged. The task is NOT removed from the tree -- it stays with updated vruntime.`,
    highlights: ['T1'],
    data: makeState(tasks, avgVr, null, 'fair.c:1133 se->deadline = se->vruntime + calc_delta_fair(se->slice, se)'),
  });

  // Reschedule path
  frames.push({
    step: 4,
    label: 'resched_curr_lazy: set TIF_NEED_RESCHED',
    description: `fair.c:1327-1329: Back in update_curr(), since update_deadline returned true (resched=true), the kernel calls resched_curr_lazy(rq) and clear_buddies(cfs_rq, curr). This sets TIF_NEED_RESCHED_LAZY on the current thread. At the next preemption point (syscall return, interrupt return, cond_resched()), __schedule() is called. It invokes pick_next_task_fair() which calls pick_eevdf(cfs_rq).`,
    highlights: [],
    data: makeState(tasks, avgVr, null, 'fair.c:1327-1329 resched_curr_lazy(rq); clear_buddies(cfs_rq, curr)'),
  });

  // Re-check eligibility
  running.state = 'eligible';
  updateEligibility(tasks, avgVr, null);

  const eligibleList = tasks.filter(t => t.state === 'eligible').map(t => t.name);
  frames.push({
    step: 5,
    label: `Eligibility recheck: avg_vruntime = ${avgVr.toFixed(1)}`,
    description: `avg_vruntime() is called during pick_eevdf (indirectly via entity_eligible). With httpd's vruntime now ${running.vruntime.toFixed(1)}, the weighted average shifts to ${avgVr.toFixed(1)}. Eligible: [${eligibleList.join(', ')}]. Tasks with vruntime > avg become ineligible (negative lag). This mechanism (fair.c:813) prevents any task from monopolizing the CPU.`,
    highlights: eligibleList.map(n => tasks.find(t => t.name === n)!.id),
    data: makeState(tasks, avgVr, null, 'fair.c:813-816 entity_eligible() recheck'),
  });

  // pick_eevdf selects next
  const next = pickEevdf(tasks, avgVr);
  if (next) {
    next.state = 'running';
    frames.push({
      step: 6,
      label: `pick_eevdf -> ${next.name} (deadline=${next.deadline.toFixed(1)})`,
      description: `fair.c:1081 pick_eevdf(cfs_rq) calls __pick_eevdf(cfs_rq, true). Among eligible tasks, ${next.name} has the earliest deadline. Context switch: the kernel saves httpd's register state (switch_to macro) and loads ${next.name}'s. The entire flow: entity_tick -> update_curr -> update_deadline(true) -> resched_curr_lazy -> __schedule -> pick_eevdf -> context_switch.`,
      highlights: [next.id],
      data: makeState(tasks, avgVr, next.id, 'fair.c:1081-1083 pick_eevdf(cfs_rq) -> __pick_eevdf(cfs_rq, true)'),
    });

    const nextDelta = (1024 / next.weight) * SLICE;
    next.vruntime += nextDelta;
    next.deadline = computeDeadline(next);
    avgVr = computeAvgVruntime(tasks);
    updateEligibility(tasks, avgVr, next.id);

    frames.push({
      step: 7,
      label: `${next.name} runs: vruntime += ${nextDelta.toFixed(1)}`,
      description: `${next.name} consumes its slice. update_curr advances vruntime by calc_delta_fair(delta_exec, se) = ${nextDelta.toFixed(1)}. Each task gets CPU proportional to weight. Over many rounds, all tasks' vruntimes converge (when normalized by weight), ensuring proportional fairness.`,
      highlights: [next.id],
      data: makeState(tasks, avgVr, next.id, 'fair.c:1305 curr->vruntime += calc_delta_fair(delta_exec, curr)'),
    });
  }

  // Pick once more
  if (next) next.state = 'eligible';
  updateEligibility(tasks, avgVr, null);
  const third = pickEevdf(tasks, avgVr);
  if (third) {
    third.state = 'running';
    frames.push({
      step: frames.length,
      label: `Next: ${third.name} (deadline=${third.deadline.toFixed(1)})`,
      description: `The cycle continues. ${third.name} has the earliest eligible deadline. The scheduler period (nr_queued * sysctl_sched_base_slice, clamped) determines how long before every task gets a turn. With 3 equal-weight tasks at base_slice=4ms, the period is ~12ms -- each task runs every 12ms.`,
      highlights: [third.id],
      data: makeState(tasks, avgVr, third.id, 'fair.c:5546 se = pick_eevdf(cfs_rq)'),
    });
  }

  // Summary
  frames.push({
    step: frames.length,
    label: 'Slice expiry drives the scheduling loop',
    description: 'The core loop: (1) scheduler_tick() -> entity_tick() -> update_curr() advances vruntime (fair.c:1305). (2) update_deadline() detects slice exhaustion (fair.c:1119). (3) resched_curr_lazy() sets TIF_NEED_RESCHED (fair.c:1328). (4) __schedule() -> pick_eevdf() selects next task (fair.c:1081). (5) context_switch() runs the new task. sysctl_sched_base_slice controls the base time slice (default 3ms).',
    highlights: [],
    data: makeState(tasks, avgVr, null, 'fair.c:1285 update_curr() -> fair.c:1117 update_deadline() -> fair.c:1081 pick_eevdf()'),
  });

  return frames;
}

function generateWeightFairness(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const SLICE = 4;

  const tasks: EevdfTask[] = [
    { id: 'T1', name: 'important', weight: weightForNice(-5), nice: -5, vruntime: 0, deadline: 0, slice: SLICE, lag: 0, state: 'eligible' },
    { id: 'T2', name: 'normal', weight: weightForNice(0), nice: 0, vruntime: 0, deadline: 0, slice: SLICE, lag: 0, state: 'eligible' },
    { id: 'T3', name: 'background', weight: weightForNice(5), nice: 5, vruntime: 0, deadline: 0, slice: SLICE, lag: 0, state: 'eligible' },
  ];

  for (const t of tasks) t.deadline = computeDeadline(t);
  let avgVr = computeAvgVruntime(tasks);
  updateEligibility(tasks, avgVr, null);

  frames.push({
    step: 0,
    label: '3 tasks with different nice values',
    description: `Weights from sched_prio_to_weight[] (kernel/sched/core.c): "important" (nice -5, weight ${tasks[0].weight}), "normal" (nice 0, weight ${tasks[1].weight}), "background" (nice 5, weight ${tasks[2].weight}). Each nice level changes weight by ~1.25x. Weight affects calc_delta_fair (fair.c:290): delta * NICE_0_LOAD / weight. Higher weight = slower vruntime growth = more CPU time before becoming ineligible.`,
    highlights: [],
    data: makeState(tasks, avgVr, null, 'kernel/sched/core.c: sched_prio_to_weight[] + fair.c:290 calc_delta_fair()'),
  });

  // Show deadline differences: update_deadline fair.c:1133
  frames.push({
    step: 1,
    label: 'Deadline distances differ by weight',
    description: `fair.c:1133 se->deadline = se->vruntime + calc_delta_fair(se->slice, se). For same slice=${SLICE}: important deadline=${tasks[0].deadline.toFixed(2)} (distance=${(tasks[0].deadline - tasks[0].vruntime).toFixed(2)}), normal=${tasks[1].deadline.toFixed(2)} (distance=${(tasks[1].deadline - tasks[1].vruntime).toFixed(2)}), background=${tasks[2].deadline.toFixed(2)} (distance=${(tasks[2].deadline - tasks[2].vruntime).toFixed(2)}). Higher weight -> smaller vruntime-to-deadline distance because calc_delta_fair divides by weight. But the task also accumulates vruntime slower, so it runs longer before hitting the deadline.`,
    highlights: [],
    data: makeState(tasks, avgVr, null, 'fair.c:1133 se->deadline = se->vruntime + calc_delta_fair(se->slice, se)'),
  });

  // Simulate several rounds showing weight-proportional CPU allocation
  const runCounts: Record<string, number> = { T1: 0, T2: 0, T3: 0 };

  for (let round = 0; round < 8; round++) {
    avgVr = computeAvgVruntime(tasks);
    updateEligibility(tasks, avgVr, null);
    const next = pickEevdf(tasks, avgVr);
    if (!next) break;

    next.state = 'running';
    runCounts[next.id]++;

    // calc_delta_fair: delta * NICE_0_LOAD / weight
    const delta = (1024 / next.weight) * SLICE;

    frames.push({
      step: frames.length,
      label: `Round ${round + 1}: ${next.name} (delta=${delta.toFixed(2)})`,
      description: `pick_eevdf selects ${next.name} (weight ${next.weight}). calc_delta_fair(fair.c:290): delta_exec * 1024 / ${next.weight} = ${SLICE} * 1024 / ${next.weight} = ${delta.toFixed(2)}. ${next.weight > 1024 ? 'HIGH weight: vruntime grows slowly (delta ' + delta.toFixed(2) + ' < slice ' + SLICE + '). Stays eligible longer, gets picked more often.' : next.weight < 1024 ? 'LOW weight: vruntime grows fast (delta ' + delta.toFixed(2) + ' > slice ' + SLICE + '). Becomes ineligible sooner, fewer picks.' : 'NORMAL weight: delta equals slice.'} Runs: important=${runCounts.T1}, normal=${runCounts.T2}, bg=${runCounts.T3}.`,
      highlights: [next.id],
      data: makeState(tasks, avgVr, next.id, 'fair.c:290-296 calc_delta_fair(delta_exec, curr)'),
    });

    next.vruntime += delta;
    next.deadline = computeDeadline(next);
    next.lag -= delta;
    next.state = 'eligible';
  }

  // Summary
  avgVr = computeAvgVruntime(tasks);
  updateEligibility(tasks, avgVr, null);

  const totalRuns = Object.values(runCounts).reduce((a, b) => a + b, 0);
  frames.push({
    step: frames.length,
    label: `Result: important=${runCounts.T1}, normal=${runCounts.T2}, bg=${runCounts.T3}`,
    description: `After ${totalRuns} rounds: "important" (weight ${tasks[0].weight}) ran ${runCounts.T1}x, "normal" (weight ${tasks[1].weight}) ran ${runCounts.T2}x, "background" (weight ${tasks[2].weight}) ran ${runCounts.T3}x. CPU share is proportional to weight. The mechanism: calc_delta_fair() (fair.c:290) makes higher-weight tasks accumulate vruntime slower, so they stay in the eligible zone (vruntime <= avg_vruntime) longer and get picked more by __pick_eevdf(). This is the fundamental EEVDF fairness guarantee.`,
    highlights: [],
    data: makeState(tasks, avgVr, null, 'EEVDF weight-proportional fairness via calc_delta_fair (fair.c:290)'),
  });

  return frames;
}

// --- SVG Rendering ---

const NS = 'http://www.w3.org/2000/svg';

const TASK_COLORS: Record<string, string> = {
  T1: '#58a6ff',
  T2: '#3fb950',
  T3: '#f0883e',
  T4: '#bc8cff',
};

function getTaskColor(id: string): string {
  return TASK_COLORS[id] ?? '#888';
}

interface TreePosition {
  taskId: string;
  x: number;
  y: number;
  left?: string;
  right?: string;
  color: 'red' | 'black';
}

function layoutTree(nodes: EevdfTreeNode[]): TreePosition[] {
  if (nodes.length === 0) return [];

  const root = nodes[nodes.length - 1];
  const positions: TreePosition[] = [];
  const treeWidth = 280;
  const treeHeight = 120;
  const startX = treeWidth / 2;
  const startY = 30;

  function layout(taskId: string | undefined, x: number, y: number, spread: number): void {
    if (!taskId) return;
    const node = nodes.find(n => n.taskId === taskId);
    if (!node) return;

    positions.push({ taskId: node.taskId, x, y, left: node.left, right: node.right, color: node.color });

    const nextSpread = spread * 0.55;
    const nextY = y + treeHeight / 3;
    if (node.left) layout(node.left, x - spread, nextY, nextSpread);
    if (node.right) layout(node.right, x + spread, nextY, nextSpread);
  }

  layout(root.taskId, startX, startY, treeWidth / 3.5);
  return positions;
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as EevdfState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };

  // --- Title ---
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '16');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'EEVDF Scheduler (Linux 6.6+)';
  container.appendChild(title);

  // --- Source reference ---
  if (data.srcRef) {
    const srcText = document.createElementNS(NS, 'text');
    srcText.setAttribute('x', String(width - margin.right));
    srcText.setAttribute('y', '16');
    srcText.setAttribute('text-anchor', 'end');
    srcText.setAttribute('class', 'anim-src-ref');
    srcText.setAttribute('font-size', '9');
    srcText.setAttribute('fill', '#8b949e');
    srcText.textContent = data.srcRef.length > 80 ? data.srcRef.slice(0, 77) + '...' : data.srcRef;
    container.appendChild(srcText);
  }

  // --- Top-left: RB-tree visualization ---
  const treeOffsetX = margin.left;
  const treeOffsetY = 30;
  const treePositions = layoutTree(data.treeNodes);

  const treeLabel = document.createElementNS(NS, 'text');
  treeLabel.setAttribute('x', String(treeOffsetX + 140));
  treeLabel.setAttribute('y', String(treeOffsetY));
  treeLabel.setAttribute('text-anchor', 'middle');
  treeLabel.setAttribute('class', 'anim-axis-label');
  treeLabel.textContent = 'RB-Tree (keyed by vruntime, augmented min_vruntime)';
  container.appendChild(treeLabel);

  // Draw edges
  for (const pos of treePositions) {
    for (const childId of [pos.left, pos.right]) {
      if (!childId) continue;
      const child = treePositions.find(p => p.taskId === childId);
      if (!child) continue;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(treeOffsetX + pos.x));
      line.setAttribute('y1', String(treeOffsetY + pos.y));
      line.setAttribute('x2', String(treeOffsetX + child.x));
      line.setAttribute('y2', String(treeOffsetY + child.y));
      line.setAttribute('stroke', '#555');
      line.setAttribute('stroke-width', '1.5');
      container.appendChild(line);
    }
  }

  // Draw nodes
  const NODE_R = 18;
  for (const pos of treePositions) {
    const task = data.tasks.find(t => t.id === pos.taskId);
    const isHighlighted = frame.highlights.includes(pos.taskId);
    const isRunning = data.currentTaskId === pos.taskId;
    const isPicked = data.pickCursor === pos.taskId;

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', String(treeOffsetX + pos.x));
    circle.setAttribute('cy', String(treeOffsetY + pos.y));
    circle.setAttribute('r', String(NODE_R));
    circle.setAttribute('fill', pos.color === 'red' ? '#c9453a' : '#333');
    circle.setAttribute('stroke', isRunning ? '#fff' : isPicked ? '#ff6' : isHighlighted ? '#f0d060' : getTaskColor(pos.taskId));
    circle.setAttribute('stroke-width', isHighlighted || isRunning || isPicked ? '3' : '1.5');
    let cls = 'anim-task';
    if (isRunning) cls += ' anim-task-running';
    if (isHighlighted) cls += ' anim-highlight';
    circle.setAttribute('class', cls);
    container.appendChild(circle);

    if (task) {
      const nodeText = document.createElementNS(NS, 'text');
      nodeText.setAttribute('x', String(treeOffsetX + pos.x));
      nodeText.setAttribute('y', String(treeOffsetY + pos.y + 4));
      nodeText.setAttribute('text-anchor', 'middle');
      nodeText.setAttribute('class', 'anim-task-name');
      nodeText.setAttribute('fill', '#fff');
      nodeText.setAttribute('font-size', '10');
      nodeText.textContent = task.name;
      container.appendChild(nodeText);
    }
  }

  // --- Top-right: Task info table ---
  const tableX = 340;
  const tableY = 35;

  const tableHeader = document.createElementNS(NS, 'text');
  tableHeader.setAttribute('x', String(tableX));
  tableHeader.setAttribute('y', String(tableY));
  tableHeader.setAttribute('class', 'anim-table-header');
  tableHeader.setAttribute('font-size', '11');
  tableHeader.textContent = 'Task     Weight   vruntime  Deadline  Lag    State';
  container.appendChild(tableHeader);

  data.tasks.forEach((task, i) => {
    const ty = tableY + 16 + i * 16;
    const info = document.createElementNS(NS, 'text');
    info.setAttribute('x', String(tableX));
    info.setAttribute('y', String(ty));
    info.setAttribute('class', 'anim-task-info');
    info.setAttribute('fill', getTaskColor(task.id));
    info.setAttribute('font-size', '10');
    const pad = (s: string, len: number) => s.padEnd(len);
    info.textContent = `${pad(task.name, 9)}${pad(String(task.weight), 9)}${pad(task.vruntime.toFixed(1), 10)}${pad(task.deadline.toFixed(1), 10)}${pad(task.lag.toFixed(1), 7)}${task.state}`;
    container.appendChild(info);
  });

  // --- Middle: Timeline bar with eligibility zone ---
  const timelineY = 210;
  const timelineH = 50;
  const timelineLeft = margin.left + 40;
  const timelineRight = width - margin.right - 20;
  const timelineW = timelineRight - timelineLeft;

  const tlLabel = document.createElementNS(NS, 'text');
  tlLabel.setAttribute('x', String(timelineLeft - 5));
  tlLabel.setAttribute('y', String(timelineY - 8));
  tlLabel.setAttribute('class', 'anim-axis-label');
  tlLabel.setAttribute('font-size', '11');
  tlLabel.textContent = 'vruntime axis (eligible zone: vruntime <= avg_vruntime)';
  container.appendChild(tlLabel);

  const axisLine = document.createElementNS(NS, 'line');
  axisLine.setAttribute('x1', String(timelineLeft));
  axisLine.setAttribute('y1', String(timelineY + timelineH / 2));
  axisLine.setAttribute('x2', String(timelineRight));
  axisLine.setAttribute('y2', String(timelineY + timelineH / 2));
  axisLine.setAttribute('class', 'anim-axis');
  container.appendChild(axisLine);

  const allVr = data.tasks.filter(t => t.state !== 'sleeping').map(t => t.vruntime);
  const minVr = Math.min(0, ...allVr);
  const maxVr = Math.max(20, ...allVr) * 1.3;
  const vrScale = (vr: number) => timelineLeft + ((vr - minVr) / (maxVr - minVr)) * timelineW;

  // Eligible zone
  const eligZoneRight = vrScale(data.avgVruntime);
  if (eligZoneRight > timelineLeft) {
    const eligRect = document.createElementNS(NS, 'rect');
    eligRect.setAttribute('x', String(timelineLeft));
    eligRect.setAttribute('y', String(timelineY));
    eligRect.setAttribute('width', String(Math.max(0, eligZoneRight - timelineLeft)));
    eligRect.setAttribute('height', String(timelineH));
    eligRect.setAttribute('fill', 'rgba(63, 185, 80, 0.15)');
    eligRect.setAttribute('rx', '4');
    container.appendChild(eligRect);
  }

  // avg_vruntime line
  const avgX = vrScale(data.avgVruntime);
  const avgLine = document.createElementNS(NS, 'line');
  avgLine.setAttribute('x1', String(avgX));
  avgLine.setAttribute('y1', String(timelineY - 5));
  avgLine.setAttribute('x2', String(avgX));
  avgLine.setAttribute('y2', String(timelineY + timelineH + 5));
  avgLine.setAttribute('stroke', '#f0d060');
  avgLine.setAttribute('stroke-width', '2');
  avgLine.setAttribute('stroke-dasharray', '4,3');
  container.appendChild(avgLine);

  const avgLabel = document.createElementNS(NS, 'text');
  avgLabel.setAttribute('x', String(avgX));
  avgLabel.setAttribute('y', String(timelineY + timelineH + 18));
  avgLabel.setAttribute('text-anchor', 'middle');
  avgLabel.setAttribute('class', 'anim-axis-label');
  avgLabel.setAttribute('font-size', '10');
  avgLabel.textContent = `V=${data.avgVruntime.toFixed(1)} (fair.c:715)`;
  container.appendChild(avgLabel);

  // Task markers
  for (const task of data.tasks) {
    if (task.state === 'sleeping') continue;
    const tx = vrScale(task.vruntime);
    const ty = timelineY + timelineH / 2;
    const isHighlighted = frame.highlights.includes(task.id);
    const isRunning = data.currentTaskId === task.id;

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', String(tx));
    dot.setAttribute('cy', String(ty));
    dot.setAttribute('r', isHighlighted || isRunning ? '8' : '6');
    dot.setAttribute('fill', getTaskColor(task.id));
    dot.setAttribute('stroke', task.state === 'ineligible' ? '#666' : '#fff');
    dot.setAttribute('stroke-width', '1.5');
    dot.setAttribute('opacity', task.state === 'ineligible' ? '0.5' : '1');
    container.appendChild(dot);

    const nameLabel = document.createElementNS(NS, 'text');
    nameLabel.setAttribute('x', String(tx));
    nameLabel.setAttribute('y', String(ty - 12));
    nameLabel.setAttribute('text-anchor', 'middle');
    nameLabel.setAttribute('class', 'anim-task-name');
    nameLabel.setAttribute('font-size', '9');
    nameLabel.setAttribute('fill', getTaskColor(task.id));
    nameLabel.textContent = task.name;
    container.appendChild(nameLabel);
  }

  // --- Bottom: State description ---
  const stateY = timelineY + timelineH + 40;
  const stateText = document.createElementNS(NS, 'text');
  stateText.setAttribute('x', String(width / 2));
  stateText.setAttribute('y', String(stateY));
  stateText.setAttribute('text-anchor', 'middle');
  stateText.setAttribute('class', 'anim-axis-label');
  stateText.setAttribute('font-size', '11');
  stateText.textContent = frame.label;
  container.appendChild(stateText);
}

// --- Module definition ---

const SCENARIOS: AnimationScenario[] = [
  { id: 'pick-next-task', label: 'Pick Next Task (__pick_eevdf, fair.c:1010)' },
  { id: 'slice-expiry', label: 'Slice Expiry (update_deadline, fair.c:1117)' },
  { id: 'weight-fairness', label: 'Weight Fairness (calc_delta_fair, fair.c:290)' },
];

const eevdfScheduler: AnimationModule = {
  config: {
    id: 'eevdf-scheduler',
    title: 'EEVDF Scheduler (Linux 6.6+)',
    skillName: 'scheduler-fundamentals',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'slice-expiry':
        return generateSliceExpiry();
      case 'weight-fairness':
        return generateWeightFairness();
      case 'pick-next-task':
      default:
        return generatePickNextTask();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default eevdfScheduler;
