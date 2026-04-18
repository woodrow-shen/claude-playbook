import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface FutexState {
  threads: Array<{ tid: number; name: string; state: 'running' | 'waiting' | 'waking'; priority: number }>;
  futexAddr: string;
  futexValue: number;
  hashBucket: number;
  waitQueue: number[];
  currentFunction: string;
  phase: 'fast-path' | 'syscall-entry' | 'get-key' | 'hash-lookup' | 'value-check' | 'enqueue' | 'schedule' | 'wake-lookup' | 'wake-mark' | 'pi-chain' | 'resumed';
  srcRef: string;
}

function cloneState(s: FutexState): FutexState {
  return {
    threads: s.threads.map(t => ({ ...t })),
    futexAddr: s.futexAddr,
    futexValue: s.futexValue,
    hashBucket: s.hashBucket,
    waitQueue: [...s.waitQueue],
    currentFunction: s.currentFunction,
    phase: s.phase,
    srcRef: s.srcRef,
  };
}

function generateFutexWaitWake(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: FutexState = {
    threads: [
      { tid: 1000, name: 'Thread-A', state: 'running', priority: 120 },
      { tid: 1001, name: 'Thread-B', state: 'running', priority: 120 },
    ],
    futexAddr: '0x7ffd0040',
    futexValue: 0,
    hashBucket: -1,
    waitQueue: [],
    currentFunction: '',
    phase: 'syscall-entry',
    srcRef: 'kernel/futex/syscalls.c:188',
  };

  // Frame 0: Setup
  frames.push({
    step: 0,
    label: 'Thread A calls futex(FUTEX_WAIT)',
    description: 'Thread A (tid 1000) calls the futex syscall with FUTEX_WAIT. The entry point is SYSCALL_DEFINE6(futex, ...) at kernel/futex/syscalls.c:188, which calls do_futex() at line 112. The switch on FUTEX_WAIT at line 126 dispatches to futex_wait() at kernel/futex/waitwake.c:706.',
    highlights: ['thread-1000'],
    data: cloneState(state),
  });

  // Frame 1: futex_wait entry
  state.currentFunction = 'futex_wait';
  state.srcRef = 'kernel/futex/waitwake.c:706';
  frames.push({
    step: 1,
    label: 'futex_wait() entry',
    description: 'futex_wait() at kernel/futex/waitwake.c:706 calls futex_setup_timer() at line 712 for optional timeout handling (kernel/futex/core.c:463), then calls __futex_wait() at line 715 which invokes futex_wait_setup() at line 682.',
    highlights: ['thread-1000'],
    data: cloneState(state),
  });

  // Frame 2: get_futex_key
  state.phase = 'get-key';
  state.currentFunction = 'get_futex_key';
  state.srcRef = 'kernel/futex/core.c:548';
  frames.push({
    step: 2,
    label: 'get_futex_key() computes the futex identity',
    description: 'futex_wait_setup() at kernel/futex/waitwake.c:591 calls get_futex_key() at line 617 (defined at kernel/futex/core.c:548). This function computes a unique key from the futex address: for private futexes it uses (current->mm, address, 0), for shared futexes it maps to (inode, page_offset, 0). The key identifies which hash bucket to use.',
    highlights: ['thread-1000'],
    data: cloneState(state),
  });

  // Frame 3: hash lookup
  state.phase = 'hash-lookup';
  state.hashBucket = 42;
  state.currentFunction = '__futex_hash';
  state.srcRef = 'kernel/futex/core.c:414';
  frames.push({
    step: 3,
    label: 'Hash lookup finds bucket 42',
    description: '__futex_hash() at kernel/futex/core.c:414 computes the hash bucket using jhash2() at line 428. For private futexes it first checks __futex_hash_private() at line 423. futex_q_lock() at core.c:866 increments the waiters count (futex_hb_waiters_inc at line 877) and acquires spin_lock(&hb->lock) at line 881. This serializes with concurrent wakers.',
    highlights: ['hash-bucket-42'],
    data: cloneState(state),
  });

  // Frame 4: value check
  state.phase = 'value-check';
  state.currentFunction = 'futex_get_value_locked';
  state.srcRef = 'kernel/futex/waitwake.c:627';
  frames.push({
    step: 4,
    label: 'Value check: *uaddr == expected?',
    description: 'With hb->lock held, futex_wait_setup() reads the futex value via futex_get_value_locked() at kernel/futex/waitwake.c:627. If uval != val (line 642), it returns -EWOULDBLOCK and the wait is aborted. This atomic check-and-enqueue prevents the lost-wakeup race: the lock ensures we cannot miss a concurrent futex_wake() between reading and enqueuing.',
    highlights: ['thread-1000'],
    data: cloneState(state),
  });

  // Frame 5: enqueue
  state.phase = 'enqueue';
  state.threads[0].state = 'waiting';
  state.waitQueue = [1000];
  state.currentFunction = 'futex_queue';
  state.srcRef = 'kernel/futex/futex.h:311';
  frames.push({
    step: 5,
    label: 'Thread A enqueued in hash bucket wait queue',
    description: 'futex_queue() (inline at kernel/futex/futex.h:311) calls __futex_queue() at kernel/futex/core.c:891, which adds the futex_q to the hash bucket plist via plist_add(). set_current_state(TASK_INTERRUPTIBLE|TASK_FREEZABLE) at kernel/futex/waitwake.c:659 marks the task as sleeping. The hb->lock is released by spin_unlock() inside futex_queue().',
    highlights: ['thread-1000', 'hash-bucket-42'],
    data: cloneState(state),
  });

  // Frame 6: schedule
  state.phase = 'schedule';
  state.currentFunction = 'schedule';
  state.srcRef = 'kernel/futex/waitwake.c:341';
  frames.push({
    step: 6,
    label: 'Thread A calls schedule() and sleeps',
    description: 'futex_do_wait() at kernel/futex/waitwake.c:341 checks that the futex_q is still on the hash list via plist_node_empty() at line 351. If still enqueued, it calls schedule() at line 358, which context-switches Thread A off the CPU. Thread A is now blocked in TASK_INTERRUPTIBLE state, waiting for a futex_wake() or signal.',
    highlights: ['thread-1000'],
    data: cloneState(state),
  });

  // Frame 7: Thread B calls futex_wake
  state.phase = 'wake-lookup';
  state.futexValue = 1;
  state.currentFunction = 'futex_wake';
  state.srcRef = 'kernel/futex/waitwake.c:155';
  frames.push({
    step: 7,
    label: 'Thread B calls futex(FUTEX_WAKE)',
    description: 'Thread B writes a new value to the futex address, then calls futex(FUTEX_WAKE). futex_wake() at kernel/futex/waitwake.c:155 calls get_futex_key() at line 165, checks futex_hb_waiters_pending() at line 175, then acquires spin_lock(&hb->lock) at line 178. It iterates the hash bucket plist with plist_for_each_entry_safe() at line 180, matching keys via futex_match() at line 181.',
    highlights: ['thread-1001'],
    data: cloneState(state),
  });

  // Frame 8: wake mark
  state.phase = 'wake-mark';
  state.threads[0].state = 'waking';
  state.currentFunction = 'futex_wake_mark';
  state.srcRef = 'kernel/futex/waitwake.c:134';
  frames.push({
    step: 8,
    label: 'futex_wake_mark() dequeues Thread A',
    description: 'For each matching waiter, this->wake() calls futex_wake_mark() at kernel/futex/waitwake.c:134, which calls get_task_struct(p) at line 138, then __futex_wake_mark() at line 110. __futex_wake_mark() calls __futex_unqueue() to remove from the plist, then smp_store_release(&q->lock_ptr, NULL) at line 123. wake_q_add_safe() at line 149 queues the task for wakeup.',
    highlights: ['thread-1000', 'thread-1001'],
    data: cloneState(state),
  });

  // Frame 9: wake_up_q and resume
  state.phase = 'resumed';
  state.threads[0].state = 'running';
  state.waitQueue = [];
  state.currentFunction = 'wake_up_q';
  state.srcRef = 'kernel/futex/waitwake.c:198';
  frames.push({
    step: 9,
    label: 'Thread A wakes up and resumes',
    description: 'After spin_unlock(&hb->lock) at kernel/futex/waitwake.c:197, wake_up_q() at line 198 calls wake_up_process() for each queued task, transitioning Thread A from TASK_INTERRUPTIBLE to TASK_RUNNING. Back in __futex_wait() at line 690, futex_unqueue() returns 0 (already dequeued by waker), so the wait succeeds and the syscall returns 0.',
    highlights: ['thread-1000'],
    data: cloneState(state),
  });

  return frames;
}

function generateFutexFastPath(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: FutexState = {
    threads: [
      { tid: 2000, name: 'Thread-X', state: 'running', priority: 120 },
      { tid: 2001, name: 'Thread-Y', state: 'running', priority: 120 },
    ],
    futexAddr: '0x7ffd0080',
    futexValue: 0,
    hashBucket: -1,
    waitQueue: [],
    currentFunction: '',
    phase: 'fast-path',
    srcRef: 'nptl/lowlevellock.h',
  };

  // Frame 0: Userspace mutex structure
  frames.push({
    step: 0,
    label: 'Userspace mutex: the futex integer',
    description: 'A pthread_mutex_t uses a futex integer in userspace. Value 0 means unlocked, 1 means locked (no waiters), 2 means locked with waiters. The glibc nptl implementation in nptl/lowlevellock.h defines the fast path: an atomic compare-and-swap (CAS) in userspace, no syscall needed.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: Thread X fast path lock - CAS succeeds
  state.futexValue = 1;
  state.currentFunction = 'atomic_compare_exchange';
  state.srcRef = 'nptl/lowlevellock.h';
  frames.push({
    step: 1,
    label: 'Thread X: fast path CAS(0 -> 1) succeeds',
    description: 'Thread X calls pthread_mutex_lock(). The fast path uses atomic_compare_exchange_weak_acquire(&mutex->__data.__lock, 0, 1). The futex value is 0 (unlocked), so CAS atomically sets it to 1. No kernel syscall needed -- this is a single atomic instruction, typically 10-20 nanoseconds on modern hardware.',
    highlights: ['thread-2000'],
    data: cloneState(state),
  });

  // Frame 2: Thread X holds lock, does work
  state.currentFunction = 'critical_section';
  state.srcRef = 'nptl/lowlevellock.h';
  frames.push({
    step: 2,
    label: 'Thread X holds lock (fast path, no syscall)',
    description: 'Thread X now holds the mutex. The entire lock acquisition happened in userspace with zero kernel involvement. This is the key insight of futexes: the FAST path (uncontended case) is purely userspace. The kernel is only involved in the SLOW path when contention occurs.',
    highlights: ['thread-2000'],
    data: cloneState(state),
  });

  // Frame 3: Thread Y tries CAS, fails
  state.futexValue = 2;
  state.phase = 'fast-path';
  state.currentFunction = 'atomic_compare_exchange (fail)';
  state.srcRef = 'nptl/lowlevellock.h';
  frames.push({
    step: 3,
    label: 'Thread Y: fast path CAS(0 -> 1) FAILS',
    description: 'Thread Y calls pthread_mutex_lock() and attempts CAS(0 -> 1), but the futex value is 1 (held by Thread X), so CAS fails. Thread Y sets the futex value to 2 using atomic_exchange_acquire(&mutex->__data.__lock, 2), indicating waiters are present. This transitions to the slow path.',
    highlights: ['thread-2001'],
    data: cloneState(state),
  });

  // Frame 4: Slow path - FUTEX_WAIT syscall
  state.phase = 'syscall-entry';
  state.currentFunction = 'futex_wait';
  state.srcRef = 'kernel/futex/syscalls.c:188';
  frames.push({
    step: 4,
    label: 'Thread Y: slow path -- futex(FUTEX_WAIT, addr, 2)',
    description: 'Thread Y enters the kernel via syscall(SYS_futex, addr, FUTEX_WAIT, 2, ...). SYSCALL_DEFINE6(futex) at kernel/futex/syscalls.c:188 dispatches to do_futex() at line 112, then futex_wait() at kernel/futex/waitwake.c:706. The expected value is 2 (locked with waiters).',
    highlights: ['thread-2001'],
    data: cloneState(state),
  });

  // Frame 5: get_futex_key and hash
  state.phase = 'get-key';
  state.hashBucket = 17;
  state.currentFunction = 'get_futex_key';
  state.srcRef = 'kernel/futex/core.c:548';
  frames.push({
    step: 5,
    label: 'Kernel: get_futex_key() and hash lookup',
    description: 'futex_wait_setup() at kernel/futex/waitwake.c:591 calls get_futex_key() at line 617 (kernel/futex/core.c:548) to compute the futex identity from the userspace address. __futex_hash() at core.c:414 maps the key to hash bucket 17. futex_q_lock() at core.c:866 acquires the bucket lock.',
    highlights: ['hash-bucket-17'],
    data: cloneState(state),
  });

  // Frame 6: Value check and enqueue
  state.phase = 'enqueue';
  state.threads[1].state = 'waiting';
  state.waitQueue = [2001];
  state.currentFunction = 'futex_queue';
  state.srcRef = 'kernel/futex/waitwake.c:660';
  frames.push({
    step: 6,
    label: 'Value matches: Thread Y enqueued and sleeps',
    description: 'futex_get_value_locked() at kernel/futex/waitwake.c:627 reads *uaddr = 2, which matches the expected value. set_current_state(TASK_INTERRUPTIBLE|TASK_FREEZABLE) at line 659, then futex_queue() at line 660 enqueues Thread Y. schedule() at waitwake.c:358 (via futex_do_wait at line 341) puts Thread Y to sleep.',
    highlights: ['thread-2001'],
    data: cloneState(state),
  });

  // Frame 7: Thread X unlocks - fast path attempt
  state.phase = 'fast-path';
  state.currentFunction = 'atomic_exchange';
  state.srcRef = 'nptl/lowlevellock.h';
  frames.push({
    step: 7,
    label: 'Thread X unlocks: atomic_exchange -> sees waiters',
    description: 'Thread X calls pthread_mutex_unlock(). It does atomic_exchange_release(&mutex->__data.__lock, 0), which returns the old value 2. Since old value != 1 (there are waiters), Thread X must call futex(FUTEX_WAKE, addr, 1) to wake one waiter. If the old value were 1, the unlock would complete entirely in userspace (fast path).',
    highlights: ['thread-2000'],
    data: cloneState(state),
  });

  // Frame 8: FUTEX_WAKE and Thread Y resumes
  state.phase = 'resumed';
  state.threads[1].state = 'running';
  state.waitQueue = [];
  state.futexValue = 0;
  state.currentFunction = 'futex_wake';
  state.srcRef = 'kernel/futex/waitwake.c:155';
  frames.push({
    step: 8,
    label: 'FUTEX_WAKE: Thread Y resumes with the lock',
    description: 'futex_wake() at kernel/futex/waitwake.c:155 finds Thread Y in hash bucket 17, calls futex_wake_mark() at line 191 (via this->wake callback), then wake_up_q() at line 198. Thread Y wakes, retries the CAS in userspace, and acquires the mutex. The futex slow path adds ~1-5 microseconds vs ~10-20 nanoseconds for the fast path.',
    highlights: ['thread-2001'],
    data: cloneState(state),
  });

  return frames;
}

function generateFutexPi(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: FutexState = {
    threads: [
      { tid: 3000, name: 'Low-Prio', state: 'running', priority: 130 },
      { tid: 3001, name: 'High-Prio', state: 'running', priority: 10 },
      { tid: 3002, name: 'Mid-Prio', state: 'running', priority: 80 },
    ],
    futexAddr: '0x7ffd00c0',
    futexValue: 0,
    hashBucket: -1,
    waitQueue: [],
    currentFunction: '',
    phase: 'syscall-entry',
    srcRef: 'kernel/futex/pi.c:918',
  };

  // Frame 0: Setup
  frames.push({
    step: 0,
    label: 'PI futex scenario: 3 threads, different priorities',
    description: 'Three threads with different priorities: Low-Prio (nice 10, priority 130), Mid-Prio (RT priority 80), High-Prio (RT priority 10, highest). PI (Priority Inheritance) futexes use futex_lock_pi() at kernel/futex/pi.c:918, which integrates with the rt_mutex subsystem to prevent priority inversion.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: Low-prio acquires the PI futex
  state.futexValue = 3000;
  state.threads[0].state = 'running';
  state.currentFunction = 'futex_lock_pi';
  state.phase = 'syscall-entry';
  state.srcRef = 'kernel/futex/pi.c:918';
  frames.push({
    step: 1,
    label: 'Low-Prio calls futex_lock_pi()',
    description: 'Low-Prio calls futex(FUTEX_LOCK_PI). futex_lock_pi() at kernel/futex/pi.c:918 calls refill_pi_state_cache() at line 930, then get_futex_key() at line 937. futex_lock_pi_atomic() at line 947 (defined at pi.c:515) reads the futex value. If 0 (unlocked), it atomically writes the TID (3000) to the futex word, creating ownership.',
    highlights: ['thread-3000'],
    data: cloneState(state),
  });

  // Frame 2: Low-prio holds lock, mid-prio runs
  state.currentFunction = 'critical_section';
  state.srcRef = 'kernel/futex/pi.c:515';
  frames.push({
    step: 2,
    label: 'Low-Prio holds PI lock, Mid-Prio runs CPU-bound work',
    description: 'Low-Prio acquired the lock. The futex value in userspace now contains TID 3000. futex_lock_pi_atomic() at kernel/futex/pi.c:515 checks the TID mask at line 539: (uval & FUTEX_TID_MASK) == vpid would be a deadlock. Since the lock was free, it sets the TID atomically and returns 1 (success) at line 955-957. Mid-Prio runs unrelated work.',
    highlights: ['thread-3000', 'thread-3002'],
    data: cloneState(state),
  });

  // Frame 3: High-prio tries to lock - contention
  state.phase = 'get-key';
  state.hashBucket = 31;
  state.currentFunction = 'futex_lock_pi_atomic';
  state.srcRef = 'kernel/futex/pi.c:947';
  frames.push({
    step: 3,
    label: 'High-Prio calls futex_lock_pi() -- contention!',
    description: 'High-Prio (priority 10) calls futex(FUTEX_LOCK_PI). futex_lock_pi() at pi.c:918 calls get_futex_key() at line 937, then futex_q_lock() at line 945. futex_lock_pi_atomic() at line 947 reads *uaddr = 3000 (Low-Prio TID), so the lock is held. It attaches a pi_state via attach_to_pi_owner() which links High-Prio to Low-Prio\'s task.',
    highlights: ['thread-3001'],
    data: cloneState(state),
  });

  // Frame 4: Queue on rt_mutex
  state.phase = 'enqueue';
  state.threads[1].state = 'waiting';
  state.waitQueue = [3001];
  state.currentFunction = '__rt_mutex_start_proxy_lock';
  state.srcRef = 'kernel/futex/pi.c:1035';
  frames.push({
    step: 4,
    label: 'High-Prio enqueued on rt_mutex',
    description: '__futex_queue() at kernel/futex/pi.c:988 adds High-Prio to the hash bucket. Then __rt_mutex_start_proxy_lock() at line 1035 enqueues the rt_waiter on the pi_state->pi_mutex. The rt_mutex tracks waiters in priority order. High-Prio (priority 10) goes to sleep via rt_mutex_wait_proxy_lock() at line 1047.',
    highlights: ['thread-3001', 'hash-bucket-31'],
    data: cloneState(state),
  });

  // Frame 5: Priority inversion detected - PI chain
  state.phase = 'pi-chain';
  state.threads[0].priority = 10;
  state.currentFunction = 'rt_mutex_adjust_prio_chain';
  state.srcRef = 'kernel/locking/rtmutex.c:678';
  frames.push({
    step: 5,
    label: 'Priority inheritance: Low-Prio boosted!',
    description: 'The rt_mutex subsystem detects that High-Prio (priority 10) is blocked on a lock held by Low-Prio (priority 130). rt_mutex_adjust_prio_chain() at kernel/locking/rtmutex.c:678 walks the PI chain: it boosts Low-Prio\'s effective priority from 130 to 10, matching the highest-priority waiter. rt_mutex_setprio() at rtmutex.c:539 updates the scheduler priority.',
    highlights: ['thread-3000', 'thread-3001'],
    data: cloneState(state),
  });

  // Frame 6: Low-prio can now preempt mid-prio
  state.currentFunction = 'schedule';
  state.srcRef = 'kernel/sched/core.c';
  frames.push({
    step: 6,
    label: 'Boosted Low-Prio preempts Mid-Prio',
    description: 'With boosted priority 10, Low-Prio now has higher priority than Mid-Prio (priority 80). The scheduler preempts Mid-Prio and lets Low-Prio run. Without PI, Low-Prio (130) would be unable to run while Mid-Prio (80) runs, and High-Prio (10) would be blocked indefinitely -- classic priority inversion.',
    highlights: ['thread-3000', 'thread-3002'],
    data: cloneState(state),
  });

  // Frame 7: Low-prio unlocks PI futex
  state.phase = 'wake-mark';
  state.currentFunction = 'futex_unlock_pi';
  state.threads[0].priority = 130;
  state.srcRef = 'kernel/futex/pi.c:1133';
  frames.push({
    step: 7,
    label: 'Low-Prio calls futex_unlock_pi()',
    description: 'Low-Prio finishes its critical section and calls futex(FUTEX_UNLOCK_PI). futex_unlock_pi() at kernel/futex/pi.c:1133 verifies ownership at line 1149 ((uval & FUTEX_TID_MASK) != vpid -> -EPERM). It calls get_futex_key() at line 1152, acquires hb->lock at line 1157, finds the top_waiter, and hands off the rt_mutex to High-Prio. Low-Prio\'s priority drops back to 130.',
    highlights: ['thread-3000'],
    data: cloneState(state),
  });

  // Frame 8: High-prio wakes and acquires
  state.phase = 'resumed';
  state.threads[1].state = 'running';
  state.threads[0].state = 'running';
  state.waitQueue = [];
  state.futexValue = 3001;
  state.currentFunction = 'rt_mutex_wake';
  state.srcRef = 'kernel/futex/pi.c:1035';
  frames.push({
    step: 8,
    label: 'High-Prio wakes and acquires the PI lock',
    description: 'The rt_mutex handoff wakes High-Prio. rt_mutex_wait_proxy_lock() at kernel/futex/pi.c:1047 returns 0 (success). High-Prio now owns the futex (userspace value = TID 3001). The pi_state ownership is updated via pi_state_update_owner() at pi.c:46. The PI chain is resolved -- no thread was blocked by a lower-priority thread.',
    highlights: ['thread-3001'],
    data: cloneState(state),
  });

  return frames;
}

const NS = 'http://www.w3.org/2000/svg';
const THREAD_COLORS: Record<string, string> = {
  running: '#3fb950',
  waiting: '#484f58',
  waking: '#d29922',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as FutexState;
  const margin = { top: 20, left: 10, right: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '14');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Futex Wait/Wake';
  container.appendChild(title);

  // Thread boxes
  const threadWidth = Math.min(120, (usableWidth - 20) / data.threads.length);
  const threadHeight = 50;
  const threadTop = margin.top + 10;

  data.threads.forEach((thread, i) => {
    const tx = margin.left + i * (threadWidth + 10);
    const color = THREAD_COLORS[thread.state];

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(tx));
    rect.setAttribute('y', String(threadTop));
    rect.setAttribute('width', String(threadWidth));
    rect.setAttribute('height', String(threadHeight));
    rect.setAttribute('rx', '5');
    rect.setAttribute('fill', color);
    let cls = `anim-thread anim-thread-${thread.state}`;
    if (frame.highlights.includes(`thread-${thread.tid}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Thread label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(tx + threadWidth / 2));
    label.setAttribute('y', String(threadTop + 16));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-thread-label');
    label.textContent = `${thread.name} (${thread.tid})`;
    container.appendChild(label);

    // State
    const stateText = document.createElementNS(NS, 'text');
    stateText.setAttribute('x', String(tx + threadWidth / 2));
    stateText.setAttribute('y', String(threadTop + 34));
    stateText.setAttribute('text-anchor', 'middle');
    stateText.setAttribute('class', `anim-thread-state anim-state-${thread.state}`);
    stateText.textContent = thread.state.toUpperCase();
    container.appendChild(stateText);

    // Priority
    const prioText = document.createElementNS(NS, 'text');
    prioText.setAttribute('x', String(tx + threadWidth / 2));
    prioText.setAttribute('y', String(threadTop + 46));
    prioText.setAttribute('text-anchor', 'middle');
    prioText.setAttribute('class', 'anim-thread-prio');
    prioText.textContent = `prio: ${thread.priority}`;
    container.appendChild(prioText);
  });

  // Futex address and value
  const futexTop = threadTop + threadHeight + 25;
  const futexText = document.createElementNS(NS, 'text');
  futexText.setAttribute('x', String(margin.left));
  futexText.setAttribute('y', String(futexTop));
  futexText.setAttribute('class', 'anim-futex-addr');
  futexText.textContent = `Futex @ ${data.futexAddr} = ${data.futexValue}`;
  container.appendChild(futexText);

  // Hash bucket
  if (data.hashBucket >= 0) {
    const hbTop = futexTop + 20;
    const hbRect = document.createElementNS(NS, 'rect');
    hbRect.setAttribute('x', String(margin.left));
    hbRect.setAttribute('y', String(hbTop));
    hbRect.setAttribute('width', String(usableWidth * 0.5));
    hbRect.setAttribute('height', '30');
    hbRect.setAttribute('rx', '4');
    hbRect.setAttribute('class', `anim-hash-bucket`);
    container.appendChild(hbRect);

    const hbText = document.createElementNS(NS, 'text');
    hbText.setAttribute('x', String(margin.left + 8));
    hbText.setAttribute('y', String(hbTop + 20));
    hbText.setAttribute('class', 'anim-hash-bucket-text');
    hbText.textContent = `Hash Bucket ${data.hashBucket}`;
    container.appendChild(hbText);
  }

  // Wait queue
  if (data.waitQueue.length > 0) {
    const wqTop = futexTop + 60;
    const wqLabel = document.createElementNS(NS, 'text');
    wqLabel.setAttribute('x', String(margin.left));
    wqLabel.setAttribute('y', String(wqTop));
    wqLabel.setAttribute('class', 'anim-wait-queue');
    wqLabel.textContent = `Wait Queue: [${data.waitQueue.map(tid => `tid ${tid}`).join(' -> ')}]`;
    container.appendChild(wqLabel);
  }

  // Source reference
  if (data.srcRef) {
    const srcTop = height - 10;
    const srcText = document.createElementNS(NS, 'text');
    srcText.setAttribute('x', String(margin.left));
    srcText.setAttribute('y', String(srcTop));
    srcText.setAttribute('class', 'anim-src-ref');
    srcText.textContent = data.srcRef;
    container.appendChild(srcText);
  }
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'futex-wait-wake', label: 'Futex Wait/Wake (FUTEX_WAIT + FUTEX_WAKE)' },
  { id: 'futex-fast-path', label: 'Futex Fast Path (Userspace CAS)' },
  { id: 'futex-pi', label: 'Priority Inheritance Futex (FUTEX_LOCK_PI)' },
];

const futexWaitWake: AnimationModule = {
  config: {
    id: 'futex-wait-wake',
    title: 'Futex Wait/Wake Visualization',
    skillName: 'futex-and-locking',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'futex-fast-path': return generateFutexFastPath();
      case 'futex-pi': return generateFutexPi();
      case 'futex-wait-wake':
      default: return generateFutexWaitWake();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default futexWaitWake;
