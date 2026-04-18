import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface RtTask {
  pid: number;
  name: string;
  priority: number;
  policy: 'SCHED_FIFO' | 'SCHED_RR' | 'SCHED_DEADLINE' | 'SCHED_OTHER';
  state: 'running' | 'ready' | 'throttled' | 'sleeping';
  runtime?: number;
  deadline?: number;
  period?: number;
  usedRuntime?: number;
}

export interface RtDeadlineState {
  tasks: RtTask[];
  runningPid: number | null;
  rtBitmap: number[];
  tick: number;
  srcRef: string;
  throttled?: boolean;
  rtTimeUsed?: number;
  rtTimeQuota?: number;
}

function cloneTasks(tasks: RtTask[]): RtTask[] {
  return tasks.map(t => ({ ...t }));
}

// ---- Scenario 1: RT FIFO Preemption ----

function generateRtFifoPreemption(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const tasks: RtTask[] = [
    { pid: 1, name: 'rt-high', priority: 10, policy: 'SCHED_FIFO', state: 'sleeping' },
    { pid: 2, name: 'rt-mid', priority: 50, policy: 'SCHED_FIFO', state: 'ready' },
    { pid: 3, name: 'rt-low', priority: 80, policy: 'SCHED_FIFO', state: 'ready' },
    { pid: 4, name: 'cfs-task', priority: 120, policy: 'SCHED_OTHER', state: 'ready' },
  ];

  // Frame 0: Initial state
  frames.push({
    step: 0,
    label: 'Initial RT runqueue state',
    description: 'The RT scheduler uses a priority array (rt_prio_array) with a 100-bit bitmap and 100 linked lists, one per priority level (0-99, lower number = higher priority). rt-mid (prio 50) and rt-low (prio 80) are on the runqueue. Bits 50 and 80 are set in the bitmap. rt-high (prio 10) is sleeping. cfs-task is a normal SCHED_OTHER task.',
    highlights: [],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: null,
      rtBitmap: [50, 80],
      tick: 0,
      srcRef: 'kernel/sched/rt.c:1331 __enqueue_rt_entity() -- list_add_tail() + __set_bit()',
    } as RtDeadlineState,
  });

  // Frame 1: pick_next_task_rt selects rt-mid (highest prio on queue)
  tasks[1].state = 'running';
  frames.push({
    step: 1,
    label: 'pick_next_rt_entity() selects rt-mid (prio 50)',
    description: 'pick_next_rt_entity() (rt.c:1671) calls sched_find_first_bit(array->bitmap) to find the lowest set bit (highest priority). Bit 50 is the lowest set bit. It then takes the first element from array->queue[50]. _pick_next_task_rt() (rt.c:1689) walks group hierarchy. rt-mid begins executing.',
    highlights: ['pid-2'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 2,
      rtBitmap: [50, 80],
      tick: 1,
      srcRef: 'kernel/sched/rt.c:1676 pick_next_rt_entity() -> rt.c:1683 sched_find_first_bit()',
    } as RtDeadlineState,
  });

  // Frame 2: rt-mid is running
  frames.push({
    step: 2,
    label: 'rt-mid runs: update_curr_rt() tracks runtime',
    description: 'While rt-mid executes, update_curr_rt() (rt.c:974) is called on each scheduler tick. It invokes update_curr_common() (rt.c:982) to account delta_exec. Under CONFIG_RT_GROUP_SCHED, it also accumulates rt_rq->rt_time for bandwidth enforcement.',
    highlights: ['pid-2'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 2,
      rtBitmap: [50, 80],
      tick: 2,
      srcRef: 'kernel/sched/rt.c:974 update_curr_rt() -> rt.c:982 update_curr_common()',
    } as RtDeadlineState,
  });

  // Frame 3: rt-high wakes up
  tasks[0].state = 'ready';
  frames.push({
    step: 3,
    label: 'rt-high (prio 10) wakes up: enqueue_task_rt()',
    description: 'rt-high wakes from sleep. enqueue_task_rt() (rt.c:1431) is called, which invokes enqueue_rt_entity() (rt.c:1398). __enqueue_rt_entity() (rt.c:1326) adds it to array->queue[10] via list_add_tail() (rt.c:1350) and sets bit 10 in the bitmap via __set_bit() (rt.c:1352). The bitmap now has bits {10, 50, 80}.',
    highlights: ['pid-1'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 2,
      rtBitmap: [10, 50, 80],
      tick: 3,
      srcRef: 'kernel/sched/rt.c:1436 enqueue_task_rt() -> rt.c:1331 __enqueue_rt_entity() -> rt.c:1357 __set_bit()',
    } as RtDeadlineState,
  });

  // Frame 4: wakeup_preempt_rt triggers preemption
  frames.push({
    step: 4,
    label: 'wakeup_preempt_rt() preempts rt-mid',
    description: 'wakeup_preempt_rt() (rt.c:1614) compares the woken task priority with the current donor. Since rt-high->prio (10) < donor->prio (50), it calls resched_curr(rq) (rt.c:1625) to set TIF_NEED_RESCHED on rt-mid, triggering a reschedule at the next opportunity.',
    highlights: ['pid-1', 'pid-2'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 2,
      rtBitmap: [10, 50, 80],
      tick: 4,
      srcRef: 'kernel/sched/rt.c:1619 wakeup_preempt_rt() -> rt.c:1630 resched_curr()',
    } as RtDeadlineState,
  });

  // Frame 5: Context switch to rt-high
  tasks[1].state = 'ready';
  tasks[0].state = 'running';
  frames.push({
    step: 5,
    label: 'Context switch: rt-high (prio 10) now runs',
    description: 'schedule() calls pick_next_task() which invokes pick_task_rt() (rt.c:1704). sched_find_first_bit() finds bit 10 (lowest set = highest priority). rt-high is dequeued from queue[10] and begins executing. rt-mid returns to queue[50] as ready.',
    highlights: ['pid-1'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 1,
      rtBitmap: [50, 80],
      tick: 5,
      srcRef: 'kernel/sched/rt.c:1709 pick_task_rt() -> rt.c:1676 pick_next_rt_entity()',
    } as RtDeadlineState,
  });

  // Frame 6: SCHED_FIFO means no timeslice preemption
  frames.push({
    step: 6,
    label: 'SCHED_FIFO: rt-high runs until it yields or blocks',
    description: 'Under SCHED_FIFO policy, there is NO timeslice. rt-high will continue running until it voluntarily yields (sched_yield), blocks on I/O, or a higher-priority RT task wakes up. rt-low (prio 80) and cfs-task (SCHED_OTHER) are completely starved. This is by design: RT tasks have strict priority-based preemption.',
    highlights: ['pid-1'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 1,
      rtBitmap: [50, 80],
      tick: 6,
      srcRef: 'kernel/sched/rt.c:1619 wakeup_preempt_rt() -- SCHED_FIFO has no timeslice',
    } as RtDeadlineState,
  });

  // Frame 7: rt-high blocks, rt-mid resumes
  tasks[0].state = 'sleeping';
  tasks[1].state = 'running';
  frames.push({
    step: 7,
    label: 'rt-high blocks: dequeue_task_rt(), rt-mid resumes',
    description: 'rt-high blocks on I/O. dequeue_task_rt() (rt.c:1450) calls update_curr_rt() (rt.c:1454) then dequeue_rt_entity() (rt.c:1455). Bit 10 is cleared from the bitmap. pick_next_rt_entity() (rt.c:1671) now finds bit 50 as the lowest set bit, so rt-mid resumes execution.',
    highlights: ['pid-2'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 2,
      rtBitmap: [50, 80],
      tick: 7,
      srcRef: 'kernel/sched/rt.c:1455 dequeue_task_rt() -> rt.c:1676 pick_next_rt_entity()',
    } as RtDeadlineState,
  });

  // Frame 8: Summary bitmap visualization
  frames.push({
    step: 8,
    label: 'RT priority bitmap summary',
    description: 'The RT scheduler bitmap provides O(1) scheduling: sched_find_first_bit() (rt.c:1678) scans a 100-bit bitmap to find the highest-priority runnable task. Each bit maps to a linked list of tasks at that priority. enqueue_task_rt() (rt.c:1431) sets bits; dequeue clears them. SCHED_FIFO tasks run in FIFO order within same priority.',
    highlights: [],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 2,
      rtBitmap: [50, 80],
      tick: 8,
      srcRef: 'kernel/sched/rt.c:1683 sched_find_first_bit() -- O(1) bitmap scan for MAX_RT_PRIO=100',
    } as RtDeadlineState,
  });

  return frames;
}

// ---- Scenario 2: Deadline EDF ----

function generateDeadlineEdf(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const tasks: RtTask[] = [
    { pid: 10, name: 'dl-video', priority: -1, policy: 'SCHED_DEADLINE', state: 'ready',
      runtime: 10, deadline: 33, period: 33, usedRuntime: 0 },
    { pid: 11, name: 'dl-audio', priority: -1, policy: 'SCHED_DEADLINE', state: 'ready',
      runtime: 5, deadline: 20, period: 20, usedRuntime: 0 },
    { pid: 12, name: 'dl-sensor', priority: -1, policy: 'SCHED_DEADLINE', state: 'ready',
      runtime: 2, deadline: 50, period: 50, usedRuntime: 0 },
  ];

  // Frame 0: Setup
  frames.push({
    step: 0,
    label: 'SCHED_DEADLINE tasks with (runtime, deadline, period)',
    description: 'Three SCHED_DEADLINE tasks configured via sched_setattr(). dl-video: (10ms runtime, 33ms deadline, 33ms period), dl-audio: (5ms, 20ms, 20ms), dl-sensor: (2ms, 50ms, 50ms). The kernel uses the CBS (Constant Bandwidth Server) algorithm to enforce temporal isolation. Each task is a "bandwidth server" with guaranteed CPU reservation.',
    highlights: [],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: null,
      rtBitmap: [],
      tick: 0,
      srcRef: 'kernel/sched/syscalls.c:493 __sched_setscheduler() -- sets p->policy, p->dl.dl_runtime/deadline/period',
    } as RtDeadlineState,
  });

  // Frame 1: enqueue into rb-tree
  frames.push({
    step: 1,
    label: 'enqueue_task_dl() inserts tasks into rb-tree by deadline',
    description: 'enqueue_task_dl() (deadline.c:2292) calls enqueue_dl_entity() which inserts each sched_dl_entity into dl_rq->root, a red-black tree ordered by absolute deadline. dl-audio has the earliest absolute deadline (now+20ms), so it becomes the leftmost node. The rb-tree ensures O(log n) insertion and O(1) pick-next.',
    highlights: ['pid-11'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: null,
      rtBitmap: [],
      tick: 1,
      srcRef: 'kernel/sched/deadline.c:2293 enqueue_task_dl() -> rb_first_cached(&dl_rq->root)',
    } as RtDeadlineState,
  });

  // Frame 2: pick earliest deadline
  tasks[1].state = 'running';
  frames.push({
    step: 2,
    label: 'pick_next_dl_entity() selects dl-audio (earliest deadline)',
    description: 'pick_next_dl_entity() (deadline.c:2588) reads rb_first_cached(&dl_rq->root) to get the leftmost rb-tree node -- the task with the earliest absolute deadline. This is the EDF (Earliest Deadline First) policy. dl-audio (deadline at now+20ms) is selected. __pick_task_dl() (deadline.c:2602) returns the task_struct.',
    highlights: ['pid-11'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 11,
      rtBitmap: [],
      tick: 2,
      srcRef: 'kernel/sched/deadline.c:2589 pick_next_dl_entity() -> deadline.c:2591 rb_first_cached()',
    } as RtDeadlineState,
  });

  // Frame 3: dl-audio runs, runtime consumed
  tasks[1].usedRuntime = 3;
  frames.push({
    step: 3,
    label: 'dl-audio runs: update_curr_dl() tracks runtime consumption',
    description: 'As dl-audio executes, update_curr_dl() (deadline.c:1939) calls update_curr_dl_se() (deadline.c:1425). Line 1446 decrements dl_se->runtime by the scaled delta_exec: dl_se->runtime -= scaled_delta_exec. The CBS algorithm monitors how much budget remains. dl-audio has used 3ms of its 5ms budget.',
    highlights: ['pid-11'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 11,
      rtBitmap: [],
      tick: 3,
      srcRef: 'kernel/sched/deadline.c:1416 update_curr_dl_se() -> deadline.c:1446 dl_se->runtime -= scaled_delta_exec',
    } as RtDeadlineState,
  });

  // Frame 4: dl-audio exhausts runtime
  tasks[1].usedRuntime = 5;
  tasks[1].state = 'throttled';
  frames.push({
    step: 4,
    label: 'dl-audio exhausts runtime: throttled by CBS',
    description: 'dl-audio has consumed all 5ms of its runtime budget. update_curr_dl_se() (deadline.c:1425) detects dl_runtime_exceeded(). The CBS (Constant Bandwidth Server) algorithm throttles the task to prevent it from exceeding its bandwidth reservation (5ms/20ms = 25% CPU). start_dl_timer() (deadline.c:1071) arms dl_se->dl_timer to fire at the next period boundary.',
    highlights: ['pid-11'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: null,
      rtBitmap: [],
      tick: 4,
      srcRef: 'kernel/sched/deadline.c:1061 start_dl_timer() -> deadline.c:1309 hrtimer_setup(dl_task_timer)',
    } as RtDeadlineState,
  });

  // Frame 5: dl-video now selected (next earliest deadline)
  tasks[0].state = 'running';
  frames.push({
    step: 5,
    label: 'pick_next_dl_entity() selects dl-video (next earliest deadline)',
    description: 'With dl-audio throttled and removed from the rb-tree, pick_next_dl_entity() (deadline.c:2588) picks dl-video (deadline at now+33ms), which is now the leftmost node. EDF scheduling dynamically adapts: the task with the closest deadline always runs next. dl-video begins consuming its 10ms budget.',
    highlights: ['pid-10'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 10,
      rtBitmap: [],
      tick: 5,
      srcRef: 'kernel/sched/deadline.c:2589 pick_next_dl_entity() -> deadline.c:2603 __pick_task_dl()',
    } as RtDeadlineState,
  });

  // Frame 6: dl_task_timer fires for dl-audio, replenishment
  tasks[1].state = 'ready';
  tasks[1].usedRuntime = 0;
  frames.push({
    step: 6,
    label: 'dl_task_timer() fires: replenish_dl_entity() starts new period',
    description: 'The hrtimer set by start_dl_timer() fires, invoking dl_task_timer() (deadline.c:1220). Since dl-audio is a valid DL task (not boosted, not switched away), it calls replenish_dl_entity() (deadline.c:795, line 1274). This sets dl_se->deadline += dl_period and dl_se->runtime = dl_runtime (deadline.c:814-815), giving dl-audio a fresh 5ms budget in its new period. enqueue_task_dl() (deadline.c:1295) re-inserts it into the rb-tree.',
    highlights: ['pid-11'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 10,
      rtBitmap: [],
      tick: 6,
      srcRef: 'kernel/sched/deadline.c:1210 dl_task_timer() -> deadline.c:1264 replenish_dl_entity() -> deadline.c:1285 enqueue_task_dl()',
    } as RtDeadlineState,
  });

  // Frame 7: EDF may preempt dl-video if dl-audio has earlier new deadline
  tasks[0].state = 'ready';
  tasks[1].state = 'running';
  frames.push({
    step: 7,
    label: 'EDF preemption: dl-audio new deadline may be earlier',
    description: 'After replenishment, dl-audio gets a new absolute deadline. If this new deadline (now + 20ms) is earlier than dl-video remaining deadline, wakeup_preempt_dl() calls resched_curr() (deadline.c:1297) to preempt dl-video. EDF guarantees the task closest to missing its deadline always runs. This is optimal for uniprocessor scheduling.',
    highlights: ['pid-11', 'pid-10'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 11,
      rtBitmap: [],
      tick: 7,
      srcRef: 'kernel/sched/deadline.c:1285 enqueue_task_dl(ENQUEUE_REPLENISH) -> deadline.c:1287 wakeup_preempt_dl()',
    } as RtDeadlineState,
  });

  // Frame 8: CBS summary
  frames.push({
    step: 8,
    label: 'CBS algorithm summary: temporal isolation via bandwidth servers',
    description: 'The CBS (Constant Bandwidth Server) algorithm guarantees each SCHED_DEADLINE task receives its reserved bandwidth (runtime/period) without affecting others. dl-audio: 5/20 = 25%, dl-video: 10/33 = 30%, dl-sensor: 2/50 = 4%. Total = 59% CPU. The admission test in __sched_setscheduler() rejects tasks if total bandwidth would exceed the configurable limit. EDF + CBS provides hard real-time guarantees with temporal isolation.',
    highlights: [],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 11,
      rtBitmap: [],
      tick: 8,
      srcRef: 'kernel/sched/deadline.c:799 replenish_dl_entity() -- CBS: deadline += period, runtime = dl_runtime',
    } as RtDeadlineState,
  });

  return frames;
}

// ---- Scenario 3: RT Throttling ----

function generateRtThrottling(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const tasks: RtTask[] = [
    { pid: 20, name: 'rt-worker', priority: 10, policy: 'SCHED_FIFO', state: 'ready' },
    { pid: 21, name: 'rt-logger', priority: 50, policy: 'SCHED_FIFO', state: 'ready' },
    { pid: 22, name: 'cfs-web', priority: 120, policy: 'SCHED_OTHER', state: 'ready' },
  ];

  // Frame 0: RT bandwidth parameters
  frames.push({
    step: 0,
    label: 'RT bandwidth throttling: default 950ms per 1000ms',
    description: 'Linux limits RT tasks to a configurable bandwidth quota to prevent them from starving all other tasks. Default: rt_runtime = 950000us (0.95s) per rt_period = 1000000us (1s). Controlled via /proc/sys/kernel/sched_rt_runtime_us and sched_rt_period_us. The sched_rt_period_timer (rt.c:101) is an hrtimer that fires every period to replenish the quota.',
    highlights: [],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: null,
      rtBitmap: [10, 50],
      tick: 0,
      srcRef: 'kernel/sched/rt.c:101 sched_rt_period_timer() -> rt.c:132 hrtimer_setup()',
      throttled: false,
      rtTimeUsed: 0,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 1: RT tasks running, accumulating time
  tasks[0].state = 'running';
  frames.push({
    step: 1,
    label: 'rt-worker (prio 10) runs: update_curr_rt() accumulates rt_time',
    description: 'rt-worker runs as the highest-priority RT task. On each tick, update_curr_rt() (rt.c:974) adds delta_exec to rt_rq->rt_time (rt.c:998). Under CONFIG_RT_GROUP_SCHED, for_each_sched_rt_entity() iterates the hierarchy. The rt_time counter tracks total CPU consumed by all RT tasks in this period.',
    highlights: ['pid-20'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 20,
      rtBitmap: [10, 50],
      tick: 1,
      srcRef: 'kernel/sched/rt.c:974 update_curr_rt() -> rt.c:998 rt_rq->rt_time += delta_exec',
      throttled: false,
      rtTimeUsed: 200000,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 2: Approaching the limit
  frames.push({
    step: 2,
    label: 'RT time accumulating: 500ms of 950ms used',
    description: 'update_curr_rt() (rt.c:974) continues accounting. Each call acquires raw_spin_lock(&rt_rq->rt_runtime_lock) (rt.c:997) before updating rt_time. It then calls sched_rt_runtime_exceeded() (rt.c:999) to check if the quota is exceeded. balance_runtime() (rt.c:873) may borrow unused quota from other CPUs before throttling.',
    highlights: ['pid-20'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 20,
      rtBitmap: [10, 50],
      tick: 2,
      srcRef: 'kernel/sched/rt.c:997 raw_spin_lock(&rt_rq->rt_runtime_lock) -> rt.c:999 sched_rt_runtime_exceeded()',
      throttled: false,
      rtTimeUsed: 500000,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 3: Close to limit
  frames.push({
    step: 3,
    label: 'RT time critical: 900ms of 950ms quota consumed',
    description: 'rt-worker has consumed most of the RT group bandwidth. sched_rt_runtime_exceeded() (rt.c:863) checks: if rt_rq->rt_time > runtime (rt.c:878). The runtime value comes from sched_rt_runtime() which reads the configured limit. balance_runtime() (rt.c:873) attempts to borrow unused time from sibling CPUs but the total is nearly exhausted.',
    highlights: ['pid-20'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 20,
      rtBitmap: [10, 50],
      tick: 3,
      srcRef: 'kernel/sched/rt.c:863 sched_rt_runtime_exceeded() -> rt.c:878 if (rt_rq->rt_time > runtime)',
      throttled: false,
      rtTimeUsed: 900000,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 4: Throttle!
  tasks[0].state = 'throttled';
  tasks[1].state = 'throttled';
  tasks[2].state = 'running';
  frames.push({
    step: 4,
    label: 'THROTTLED! sched_rt_runtime_exceeded() returns 1',
    description: 'rt_rq->rt_time (950ms) exceeds sched_rt_runtime (950000us). sched_rt_runtime_exceeded() (rt.c:863) sets rt_rq->rt_throttled = 1 (rt.c:886) and prints "sched: RT throttling activated" (rt.c:887). resched_curr(rq) (rt.c:1001) forces a reschedule. ALL RT tasks in this rt_rq are now blocked. The CFS fair scheduler takes over -- cfs-web finally gets CPU time.',
    highlights: ['pid-22'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 22,
      rtBitmap: [],
      tick: 4,
      srcRef: 'kernel/sched/rt.c:886 rt_rq->rt_throttled = 1 -> kernel/sched/rt.c:887 printk_deferred_once("sched: RT throttling activated")',
      throttled: true,
      rtTimeUsed: 950000,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 5: CFS runs while RT is throttled
  frames.push({
    step: 5,
    label: 'CFS tasks run during RT throttle window',
    description: 'With RT throttled, pick_task_rt() (rt.c:1704) calls sched_rt_runnable() which returns false because rt_rq_throttled() is true. The scheduler falls through to CFS. cfs-web (SCHED_OTHER) now runs for the remaining 50ms of the period. This 5% CFS reservation prevents RT tasks from completely starving the system.',
    highlights: ['pid-22'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 22,
      rtBitmap: [],
      tick: 5,
      srcRef: 'kernel/sched/rt.c:1709 pick_task_rt() -> sched_rt_runnable() returns false when throttled',
      throttled: true,
      rtTimeUsed: 950000,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 6: Period timer fires
  frames.push({
    step: 6,
    label: 'sched_rt_period_timer() fires: new period begins',
    description: 'The hrtimer sched_rt_period_timer() (rt.c:101) fires at the period boundary. It calls do_sched_rt_period_timer() (rt.c:778) which iterates all CPUs. For each throttled rt_rq, it resets rt_rq->rt_time, clears rt_rq->rt_throttled, and re-enqueues the RT scheduling entity. The 950ms quota is fully replenished for the new period.',
    highlights: [],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 22,
      rtBitmap: [],
      tick: 6,
      srcRef: 'kernel/sched/rt.c:101 sched_rt_period_timer() -> rt.c:778 do_sched_rt_period_timer()',
      throttled: true,
      rtTimeUsed: 950000,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 7: RT unthrottled
  tasks[0].state = 'running';
  tasks[1].state = 'ready';
  tasks[2].state = 'ready';
  frames.push({
    step: 7,
    label: 'RT unthrottled: rt-worker resumes execution',
    description: 'do_sched_rt_period_timer() (rt.c:778) clears the throttle: rt_rq->rt_throttled = 0, rt_rq->rt_time = 0. It calls sched_rt_rq_enqueue() to re-add the RT entity to the parent runqueue. RT tasks immediately preempt CFS. rt-worker (prio 10) is again the highest-priority runnable task and resumes. The cycle repeats: 950ms RT, 50ms CFS, every second.',
    highlights: ['pid-20'],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 20,
      rtBitmap: [10, 50],
      tick: 7,
      srcRef: 'kernel/sched/rt.c:778 do_sched_rt_period_timer() -- clears rt_throttled, replenishes rt_time',
      throttled: false,
      rtTimeUsed: 0,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  // Frame 8: Summary
  frames.push({
    step: 8,
    label: 'RT bandwidth throttling summary',
    description: 'RT bandwidth throttling protects the system from runaway RT tasks. update_curr_rt() (rt.c:974) accumulates rt_time per tick. sched_rt_runtime_exceeded() (rt.c:863) checks against the 0.95s per 1s default quota. When exceeded, rt_rq->rt_throttled = 1 blocks all RT tasks, letting CFS/fair tasks run. sched_rt_period_timer() (rt.c:101) replenishes the quota each period. Disable with: echo -1 > /proc/sys/kernel/sched_rt_runtime_us.',
    highlights: [],
    data: {
      tasks: cloneTasks(tasks),
      runningPid: 20,
      rtBitmap: [10, 50],
      tick: 8,
      srcRef: 'kernel/sched/rt.c:863 sched_rt_runtime_exceeded() -> rt.c:101 sched_rt_period_timer()',
      throttled: false,
      rtTimeUsed: 0,
      rtTimeQuota: 950000,
    } as RtDeadlineState,
  });

  return frames;
}

// ---- Renderer ----

const NS = 'http://www.w3.org/2000/svg';

const POLICY_COLORS: Record<string, string> = {
  'SCHED_FIFO': '#f47067',
  'SCHED_RR': '#f0883e',
  'SCHED_DEADLINE': '#bc8cff',
  'SCHED_OTHER': '#58a6ff',
};

const STATE_COLORS: Record<string, string> = {
  'running': '#3fb950',
  'ready': '#58a6ff',
  'throttled': '#f47067',
  'sleeping': '#484f58',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as RtDeadlineState;
  const margin = { top: 20, left: 10, right: 10, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '14');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'RT / Deadline Scheduling';
  container.appendChild(title);

  // Draw tasks as boxes
  const taskWidth = Math.min(90, (usableWidth - 20) / data.tasks.length);
  const taskHeight = 40;
  const taskTop = margin.top + 15;

  data.tasks.forEach((task, i) => {
    const x = margin.left + i * (taskWidth + 8);
    const y = taskTop;

    // Task rectangle
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(taskWidth));
    rect.setAttribute('height', String(taskHeight));
    rect.setAttribute('rx', '4');

    const fillColor = task.state === 'running' ? STATE_COLORS['running']
      : task.state === 'throttled' ? STATE_COLORS['throttled']
      : POLICY_COLORS[task.policy] || '#666';

    let cls = 'anim-task';
    if (frame.highlights.includes(`pid-${task.pid}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    rect.setAttribute('fill', fillColor);
    rect.setAttribute('stroke', data.runningPid === task.pid ? '#fff' : '#555');
    rect.setAttribute('stroke-width', data.runningPid === task.pid ? '2' : '1');
    container.appendChild(rect);

    // Task name
    const nameText = document.createElementNS(NS, 'text');
    nameText.setAttribute('x', String(x + taskWidth / 2));
    nameText.setAttribute('y', String(y + 16));
    nameText.setAttribute('text-anchor', 'middle');
    nameText.setAttribute('class', 'anim-task-name');
    nameText.setAttribute('fill', '#e6edf3');
    nameText.setAttribute('font-size', '10');
    nameText.textContent = task.name;
    container.appendChild(nameText);

    // Policy + state
    const infoText = document.createElementNS(NS, 'text');
    infoText.setAttribute('x', String(x + taskWidth / 2));
    infoText.setAttribute('y', String(y + 30));
    infoText.setAttribute('text-anchor', 'middle');
    infoText.setAttribute('class', 'anim-task-info');
    infoText.setAttribute('fill', '#8b949e');
    infoText.setAttribute('font-size', '8');
    infoText.textContent = `${task.policy.replace('SCHED_', '')} [${task.state}]`;
    container.appendChild(infoText);
  });

  // Bitmap visualization (for RT scenarios)
  if (data.rtBitmap.length > 0) {
    const bitmapTop = taskTop + taskHeight + 20;
    const bitmapLabel = document.createElementNS(NS, 'text');
    bitmapLabel.setAttribute('x', String(margin.left));
    bitmapLabel.setAttribute('y', String(bitmapTop));
    bitmapLabel.setAttribute('class', 'anim-table-header');
    bitmapLabel.setAttribute('fill', '#8b949e');
    bitmapLabel.setAttribute('font-size', '10');
    bitmapLabel.textContent = 'RT Bitmap: [' + data.rtBitmap.map(b => `bit ${b}`).join(', ') + ']';
    container.appendChild(bitmapLabel);
  }

  // Throttle bar (for rt-throttling scenario)
  if (data.rtTimeQuota !== undefined && data.rtTimeQuota > 0) {
    const barTop = taskTop + taskHeight + 40;
    const barHeight = 14;
    const barWidth = usableWidth - 20;
    const fillRatio = Math.min(1, (data.rtTimeUsed || 0) / data.rtTimeQuota);

    // Background bar
    const bgBar = document.createElementNS(NS, 'rect');
    bgBar.setAttribute('x', String(margin.left));
    bgBar.setAttribute('y', String(barTop));
    bgBar.setAttribute('width', String(barWidth));
    bgBar.setAttribute('height', String(barHeight));
    bgBar.setAttribute('rx', '3');
    bgBar.setAttribute('fill', '#21262d');
    bgBar.setAttribute('stroke', '#30363d');
    container.appendChild(bgBar);

    // Fill bar
    const fillBar = document.createElementNS(NS, 'rect');
    fillBar.setAttribute('x', String(margin.left));
    fillBar.setAttribute('y', String(barTop));
    fillBar.setAttribute('width', String(barWidth * fillRatio));
    fillBar.setAttribute('height', String(barHeight));
    fillBar.setAttribute('rx', '3');
    fillBar.setAttribute('fill', data.throttled ? '#f47067' : '#f0883e');
    container.appendChild(fillBar);

    // Label
    const barLabel = document.createElementNS(NS, 'text');
    barLabel.setAttribute('x', String(margin.left + barWidth / 2));
    barLabel.setAttribute('y', String(barTop + 11));
    barLabel.setAttribute('text-anchor', 'middle');
    barLabel.setAttribute('fill', '#e6edf3');
    barLabel.setAttribute('font-size', '9');
    barLabel.textContent = `RT time: ${((data.rtTimeUsed || 0) / 1000).toFixed(0)}ms / ${(data.rtTimeQuota / 1000).toFixed(0)}ms${data.throttled ? ' THROTTLED' : ''}`;
    container.appendChild(barLabel);
  }
}

// ---- Module Export ----

const SCENARIOS: AnimationScenario[] = [
  { id: 'rt-fifo-preemption', label: 'SCHED_FIFO Preemption' },
  { id: 'deadline-edf', label: 'SCHED_DEADLINE EDF Scheduling' },
  { id: 'rt-throttling', label: 'RT Bandwidth Throttling' },
];

const rtDeadlineSched: AnimationModule = {
  config: {
    id: 'rt-deadline-sched',
    title: 'RT & Deadline Scheduling',
    skillName: 'rt-and-deadline-scheduling',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'deadline-edf':
        return generateDeadlineEdf();
      case 'rt-throttling':
        return generateRtThrottling();
      case 'rt-fifo-preemption':
      default:
        return generateRtFifoPreemption();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default rtDeadlineSched;
