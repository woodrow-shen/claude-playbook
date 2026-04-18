import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CPU {
  id: number;
  task: string;
  state: 'running' | 'spinning' | 'sleeping' | 'idle';
  cyclesWasted: number;
}

export interface Lock {
  name: string;
  type: 'spinlock' | 'mutex';
  owner: number | null;
  waitQueue: number[];
}

export interface LockState {
  cpus: CPU[];
  lock: Lock;
  srcRef?: string;
}

function cloneState(s: LockState): LockState {
  return {
    cpus: s.cpus.map(c => ({ ...c })),
    lock: { ...s.lock, waitQueue: [...s.lock.waitQueue] },
    ...(s.srcRef !== undefined && { srcRef: s.srcRef }),
  };
}

function generateSpinlockContention(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: LockState = {
    cpus: [
      { id: 0, task: 'task-A', state: 'idle', cyclesWasted: 0 },
      { id: 1, task: 'task-B', state: 'idle', cyclesWasted: 0 },
      { id: 2, task: 'task-C', state: 'idle', cyclesWasted: 0 },
      { id: 3, task: 'task-D', state: 'idle', cyclesWasted: 0 },
    ],
    lock: { name: 'data_lock', type: 'spinlock', owner: null, waitQueue: [] },
  };

  state.srcRef = 'include/linux/spinlock.h:338';
  frames.push({
    step: 0, label: '4 CPUs, 1 spinlock -- all idle',
    description: 'Four CPUs need to access a shared data structure protected by a spinlock. A spinlock disables preemption and busy-waits (spins) until the lock is free. See spin_lock() API at include/linux/spinlock.h:338.',
    highlights: [], data: cloneState(state),
  });

  // CPU 0 acquires lock
  state.cpus[0].state = 'running';
  state.lock.owner = 0;

  state.srcRef = 'include/linux/spinlock.h:184';
  frames.push({
    step: 1, label: 'CPU 0 acquires spinlock',
    description: 'CPU 0 calls spin_lock() (include/linux/spinlock.h:338) which maps to raw_spin_lock() -> _raw_spin_lock() (kernel/locking/spinlock.c:152). The lock is free, so do_raw_spin_lock() at include/linux/spinlock.h:184 calls arch_spin_lock() at line 187 -- a single atomic instruction. No spinning needed.',
    highlights: ['cpu-0'], data: cloneState(state),
  });

  // CPUs 1,2,3 try to acquire -- spin
  state.cpus[1].state = 'spinning';
  state.cpus[2].state = 'spinning';
  state.cpus[3].state = 'spinning';

  state.srcRef = 'kernel/locking/spinlock.c:67-78';
  frames.push({
    step: 2, label: 'CPUs 1, 2, 3 try to acquire -- SPINNING!',
    description: 'Three other CPUs call spin_lock(). The lock is held by CPU 0. The BUILD_LOCK_OPS macro (kernel/locking/spinlock.c:67-78) generates __raw_spin_lock() which loops: preempt_disable(), do_raw_spin_trylock(), and on failure calls arch_spin_relax() (cpu_relax at line 55) before retrying. They burn CPU cycles doing NOTHING useful.',
    highlights: ['cpu-1', 'cpu-2', 'cpu-3'], data: cloneState(state),
  });

  // Show cycles wasting
  state.cpus[1].cyclesWasted = 5000;
  state.cpus[2].cyclesWasted = 5000;
  state.cpus[3].cyclesWasted = 5000;

  state.srcRef = 'kernel/locking/spinlock.c:70-77';
  frames.push({
    step: 3, label: 'Spinning... wasting CPU cycles',
    description: 'Each spinning CPU burns ~5000 cycles in the for(;;) loop at kernel/locking/spinlock.c:70. Each iteration calls preempt_disable() (line 71), tries do_raw_spin_trylock() (line 72), fails, calls preempt_enable() (line 74), then arch_spin_relax() (line 76). The qspinlock optimization queues waiters to reduce cache-line bouncing.',
    highlights: ['cpu-1', 'cpu-2', 'cpu-3'], data: cloneState(state),
  });

  // CPU 0 releases, CPU 1 acquires
  state.cpus[0].state = 'idle';
  state.cpus[1].state = 'running';
  state.cpus[1].cyclesWasted = 5000; // keep the counter
  state.lock.owner = 1;

  state.srcRef = 'include/linux/spinlock.h:386';
  frames.push({
    step: 4, label: 'CPU 0 releases -- CPU 1 acquires',
    description: 'CPU 0 calls spin_unlock() (include/linux/spinlock.h:386) which calls raw_spin_unlock() -> do_raw_spin_unlock() (line 201) executing arch_spin_unlock(). CPU 1 wins the race -- its do_raw_spin_trylock() at line 72 succeeds first. CPUs 2 and 3 continue spinning. CPU 1 wasted 5000 cycles while waiting.',
    highlights: ['cpu-0', 'cpu-1'], data: cloneState(state),
  });

  // CPU 1 releases, CPU 2 acquires
  state.cpus[1].state = 'idle';
  state.cpus[2].state = 'running';
  state.cpus[2].cyclesWasted = 10000;
  state.cpus[3].cyclesWasted = 10000;
  state.lock.owner = 2;

  state.srcRef = 'kernel/locking/spinlock.c:126';
  frames.push({
    step: 5, label: 'CPU 1 releases -- CPU 2 acquires',
    description: 'The pattern continues. CPU 3 has now wasted 10,000 cycles spinning in the BUILD_LOCK_OPS(spin, raw_spinlock) loop at kernel/locking/spinlock.c:126. Spinlocks are only efficient when hold times are very short (< ~1 microsecond). For longer critical sections, use a mutex (kernel/locking/mutex.c).',
    highlights: ['cpu-2', 'cpu-3'], data: cloneState(state),
  });

  return frames;
}

function generateMutexSleep(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: LockState = {
    cpus: [
      { id: 0, task: 'task-A', state: 'idle', cyclesWasted: 0 },
      { id: 1, task: 'task-B', state: 'idle', cyclesWasted: 0 },
      { id: 2, task: 'task-C', state: 'idle', cyclesWasted: 0 },
      { id: 3, task: 'task-D', state: 'idle', cyclesWasted: 0 },
    ],
    lock: { name: 'file_lock', type: 'mutex', owner: null, waitQueue: [] },
  };

  state.srcRef = 'include/linux/mutex.h:214';
  frames.push({
    step: 0, label: '4 CPUs, 1 mutex -- all idle',
    description: 'Same scenario but with a mutex instead of spinlock. mutex_lock() is declared at include/linux/mutex.h:214 and defined at kernel/locking/mutex.c:285. Mutexes allow waiters to SLEEP instead of spinning, freeing the CPU for other work.',
    highlights: [], data: cloneState(state),
  });

  // CPU 0 acquires
  state.cpus[0].state = 'running';
  state.lock.owner = 0;

  state.srcRef = 'kernel/locking/mutex.c:285-291';
  frames.push({
    step: 1, label: 'CPU 0 acquires mutex (fast path)',
    description: 'CPU 0 calls mutex_lock() at kernel/locking/mutex.c:285. The fast path at line 289 calls __mutex_trylock_fast() which uses atomic_long_try_cmpxchg_acquire() -- a single atomic instruction. The mutex is free, so it succeeds without entering __mutex_lock_slowpath(). Just as fast as a spinlock when uncontended.',
    highlights: ['cpu-0'], data: cloneState(state),
  });

  // Others try -- go to sleep
  state.cpus[1].state = 'sleeping';
  state.cpus[2].state = 'sleeping';
  state.cpus[3].state = 'sleeping';
  state.lock.waitQueue = [1, 2, 3];

  state.srcRef = 'kernel/locking/mutex.c:648-692';
  frames.push({
    step: 2, label: 'CPUs 1, 2, 3 contend -- they SLEEP',
    description: 'mutex_lock() enters __mutex_lock_slowpath() (kernel/locking/mutex.c:1063). First it tries mutex_optimistic_spin() (line 618), spinning briefly if the owner is running on another CPU. If that fails, each task is added to the wait_list at line 648 via __mutex_add_waiter() (FIFO order), then set_current_state(TASK_UNINTERRUPTIBLE) at line 660, and schedule_preempt_disabled() at line 692 puts them to sleep.',
    highlights: ['cpu-1', 'cpu-2', 'cpu-3'], data: cloneState(state),
  });

  state.srcRef = 'kernel/locking/mutex.c:445-518';
  frames.push({
    step: 3, label: 'Sleeping waiters use ZERO CPU',
    description: 'Unlike spinlocks, sleeping waiters consume NO CPU cycles. The mutex_optimistic_spin() path (kernel/locking/mutex.c:445-518) first tries a brief adaptive spin using an MCS/OSQ lock (line 464) to avoid the context switch overhead. But once a task truly sleeps via schedule_preempt_disabled(), the CPU is free. The tradeoff: context switches have overhead (~1-5 microseconds each).',
    highlights: [], data: cloneState(state),
  });

  // Release and wake first waiter
  state.cpus[0].state = 'idle';
  state.cpus[1].state = 'running';
  state.lock.owner = 1;
  state.lock.waitQueue = [2, 3];

  state.srcRef = 'kernel/locking/mutex.c:931-982';
  frames.push({
    step: 4, label: 'CPU 0 releases -- wakes CPU 1',
    description: 'mutex_unlock() at kernel/locking/mutex.c:546 tries the fast path via __mutex_unlock_fast() (line 549). On contention it enters __mutex_unlock_slowpath() at line 931, which takes wait_lock (line 963), gets the first waiter from wait_list (line 967-968 via list_first_entry), and calls wake_q_add() at line 975. FIFO order -- fair! CPUs 2 and 3 remain sleeping.',
    highlights: ['cpu-0', 'cpu-1'], data: cloneState(state),
  });

  // Continue
  state.cpus[1].state = 'idle';
  state.cpus[2].state = 'running';
  state.lock.owner = 2;
  state.lock.waitQueue = [3];

  state.srcRef = 'kernel/locking/mutex.c:965-975';
  frames.push({
    step: 5, label: 'CPU 1 releases -- wakes CPU 2',
    description: 'FIFO wake-up continues via list_first_entry(&lock->wait_list) at kernel/locking/mutex.c:968. Unlike spinlocks where the "winner" is random (cache-line race), mutexes guarantee fairness through the ordered wait_list. The handoff mechanism (MUTEX_FLAG_HANDOFF at line 952) ensures no starvation possible.',
    highlights: ['cpu-1', 'cpu-2'], data: cloneState(state),
  });

  return frames;
}

function generatePriorityInversion(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: LockState = {
    cpus: [
      { id: 0, task: 'low-prio', state: 'idle', cyclesWasted: 0 },
      { id: 1, task: 'mid-prio', state: 'idle', cyclesWasted: 0 },
      { id: 2, task: 'high-prio', state: 'idle', cyclesWasted: 0 },
    ],
    lock: { name: 'shared_lock', type: 'mutex', owner: null, waitQueue: [] },
  };

  state.srcRef = 'kernel/locking/mutex.c:285';
  frames.push({
    step: 0, label: 'Priority inversion scenario',
    description: 'Three tasks with LOW, MEDIUM, and HIGH priority. The low-priority task will acquire a mutex (kernel/locking/mutex.c:285). The high-priority task will need the same lock. Watch what happens when priorities and locking collide.',
    highlights: [], data: cloneState(state),
  });

  // Low acquires lock
  state.cpus[0].state = 'running';
  state.lock.owner = 0;

  state.srcRef = 'kernel/locking/mutex.c:289';
  frames.push({
    step: 1, label: 'Low-prio acquires the lock',
    description: 'The low-priority task acquires the mutex via __mutex_trylock_fast() at kernel/locking/mutex.c:289. This is fine -- low-prio tasks can hold locks. The owner field stores the current task pointer.',
    highlights: ['cpu-0'], data: cloneState(state),
  });

  // Mid-prio runs on CPU 1
  state.cpus[1].state = 'running';

  state.srcRef = 'kernel/sched/core.c';
  frames.push({
    step: 2, label: 'Mid-prio task starts running',
    description: 'A medium-priority task starts running via the CFS scheduler (kernel/sched/core.c). It does NOT need the lock -- it is doing unrelated CPU-intensive work. Its higher priority means it preempts low-prio.',
    highlights: ['cpu-1'], data: cloneState(state),
  });

  // High-prio needs lock -- blocks
  state.cpus[2].state = 'sleeping';
  state.lock.waitQueue = [2];

  state.srcRef = 'kernel/locking/mutex.c:648-692';
  frames.push({
    step: 3, label: 'High-prio needs lock -- BLOCKED!',
    description: 'The high-priority task calls mutex_lock(), enters __mutex_lock_slowpath() (kernel/locking/mutex.c:1063), and sleeps in the wait_list (line 648) with schedule_preempt_disabled() at line 692. But low-prio cannot run because mid-prio has higher priority. High-prio is effectively blocked by mid-prio -- PRIORITY INVERSION!',
    highlights: ['cpu-2', 'cpu-0'], data: cloneState(state),
  });

  // Priority inheritance kicks in
  state.cpus[0].task = 'low-prio (boosted!)';

  state.srcRef = 'kernel/locking/rtmutex.c';
  frames.push({
    step: 4, label: 'Priority inheritance to the rescue',
    description: 'The kernel detects the inversion and temporarily BOOSTS low-prio\'s priority to match high-prio. The rt_mutex implementation in kernel/locking/rtmutex.c uses rt_mutex_adjust_prio_chain() to walk the lock dependency chain and propagate priority. Now low-prio can preempt mid-prio, finish its critical section, and release the lock.',
    highlights: ['cpu-0'], data: cloneState(state),
  });

  // Lock released, high-prio runs
  state.cpus[0].state = 'idle';
  state.cpus[0].task = 'low-prio';
  state.cpus[2].state = 'running';
  state.lock.owner = 2;
  state.lock.waitQueue = [];

  state.srcRef = 'kernel/locking/mutex.c:546-554';
  frames.push({
    step: 5, label: 'High-prio acquires the lock',
    description: 'Low-prio calls mutex_unlock() (kernel/locking/mutex.c:546), which enters __mutex_unlock_slowpath() at line 931. The first waiter (high-prio) is woken via wake_q_add() at line 975. Low-prio\'s priority drops back to normal. The inversion is resolved. Without priority inheritance (rt_mutex), high-prio could be blocked indefinitely.',
    highlights: ['cpu-2'], data: cloneState(state),
  });

  return frames;
}

const NS = 'http://www.w3.org/2000/svg';
const CPU_COLORS: Record<string, string> = {
  running: '#3fb950',
  spinning: '#f85149',
  sleeping: '#484f58',
  idle: '#30363d',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as LockState;
  const margin = { top: 20, left: 10, right: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '14');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = `${data.lock.type === 'spinlock' ? 'Spinlock' : 'Mutex'} Contention`;
  container.appendChild(title);

  // CPU boxes
  const cpuWidth = Math.min(90, (usableWidth - 20) / data.cpus.length);
  const cpuHeight = 50;
  const cpuTop = margin.top + 10;

  data.cpus.forEach((cpu, i) => {
    const cx = margin.left + i * (cpuWidth + 5);
    const color = CPU_COLORS[cpu.state];

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(cx));
    rect.setAttribute('y', String(cpuTop));
    rect.setAttribute('width', String(cpuWidth));
    rect.setAttribute('height', String(cpuHeight));
    rect.setAttribute('rx', '5');
    rect.setAttribute('fill', color);
    let cls = `anim-cpu anim-cpu-${cpu.state}`;
    if (frame.highlights.includes(`cpu-${cpu.id}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // CPU label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(cx + cpuWidth / 2));
    label.setAttribute('y', String(cpuTop + 16));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = `CPU ${cpu.id}`;
    container.appendChild(label);

    // Task name
    const taskText = document.createElementNS(NS, 'text');
    taskText.setAttribute('x', String(cx + cpuWidth / 2));
    taskText.setAttribute('y', String(cpuTop + 32));
    taskText.setAttribute('text-anchor', 'middle');
    taskText.setAttribute('class', 'anim-cpu-task');
    taskText.textContent = cpu.task;
    container.appendChild(taskText);

    // State label
    const stateText = document.createElementNS(NS, 'text');
    stateText.setAttribute('x', String(cx + cpuWidth / 2));
    stateText.setAttribute('y', String(cpuTop + 46));
    stateText.setAttribute('text-anchor', 'middle');
    stateText.setAttribute('class', `anim-cpu-state anim-state-${cpu.state}`);
    stateText.textContent = cpu.state.toUpperCase();
    container.appendChild(stateText);
  });

  // Lock icon
  const lockTop = cpuTop + cpuHeight + 30;
  const lockX = width / 2 - 30;
  const lockRect = document.createElementNS(NS, 'rect');
  lockRect.setAttribute('x', String(lockX));
  lockRect.setAttribute('y', String(lockTop));
  lockRect.setAttribute('width', '60');
  lockRect.setAttribute('height', '30');
  lockRect.setAttribute('rx', '4');
  lockRect.setAttribute('class', `anim-lock ${data.lock.owner !== null ? 'anim-lock-held' : 'anim-lock-free'}`);
  container.appendChild(lockRect);

  const lockText = document.createElementNS(NS, 'text');
  lockText.setAttribute('x', String(width / 2));
  lockText.setAttribute('y', String(lockTop + 20));
  lockText.setAttribute('text-anchor', 'middle');
  lockText.setAttribute('class', 'anim-lock-text');
  lockText.textContent = data.lock.owner !== null ? `Held: CPU ${data.lock.owner}` : 'FREE';
  container.appendChild(lockText);

  // Wait queue
  if (data.lock.waitQueue.length > 0) {
    const wqTop = lockTop + 40;
    const wqLabel = document.createElementNS(NS, 'text');
    wqLabel.setAttribute('x', String(margin.left));
    wqLabel.setAttribute('y', String(wqTop));
    wqLabel.setAttribute('class', 'anim-wq-label');
    wqLabel.textContent = `Wait queue: [${data.lock.waitQueue.map(id => `CPU ${id}`).join(' -> ')}]`;
    container.appendChild(wqLabel);
  }

  // Cycles wasted counter (for spinlocks)
  const totalWasted = data.cpus.reduce((s, c) => s + c.cyclesWasted, 0);
  if (totalWasted > 0) {
    const cwTop = lockTop + 60;
    const cwText = document.createElementNS(NS, 'text');
    cwText.setAttribute('x', String(margin.left));
    cwText.setAttribute('y', String(cwTop));
    cwText.setAttribute('class', 'anim-wasted-cycles');
    cwText.textContent = `Total cycles wasted spinning: ${totalWasted.toLocaleString()}`;
    container.appendChild(cwText);
  }
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'spinlock-contention', label: 'Spinlock Contention (4 CPUs)' },
  { id: 'mutex-sleep', label: 'Mutex with Sleep' },
  { id: 'priority-inversion', label: 'Priority Inversion' },
];

const spinlockMutex: AnimationModule = {
  config: {
    id: 'spinlock-mutex',
    title: 'Spinlock vs Mutex Visualization',
    skillName: 'spinlocks-and-mutexes',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'mutex-sleep': return generateMutexSleep();
      case 'priority-inversion': return generatePriorityInversion();
      case 'spinlock-contention':
      default: return generateSpinlockContention();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default spinlockMutex;
