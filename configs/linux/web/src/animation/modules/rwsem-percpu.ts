import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface WaitQueueEntry {
  task: string;
  type: 'reader' | 'writer';
  handoffSet: boolean;
}

export interface RwsemPercpuState {
  phase: 'init' | 'read-acquire' | 'read-slowpath' | 'write-acquire' | 'write-slowpath' |
         'contention' | 'handoff' | 'wake' | 'unlock' |
         'percpu-read' | 'percpu-write' | 'percpu-sync' | 'percpu-drain';
  lockState: 'unlocked' | 'reader-locked' | 'writer-locked' | 'contended';
  readers: string[];
  writers: string[];
  waitQueue: WaitQueueEntry[];
  perCpuCounters: number[];
  srcRef: string;
}

function cloneState(s: RwsemPercpuState): RwsemPercpuState {
  return {
    phase: s.phase,
    lockState: s.lockState,
    readers: [...s.readers],
    writers: [...s.writers],
    waitQueue: s.waitQueue.map(w => ({ ...w })),
    perCpuCounters: [...s.perCpuCounters],
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: rwsem-read-write
// Reader-writer semaphore acquisition with reader bias
// ---------------------------------------------------------------------------
function generateRwsemReadWrite(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RwsemPercpuState = {
    phase: 'init',
    lockState: 'unlocked',
    readers: [],
    writers: [],
    waitQueue: [],
    perCpuCounters: [0, 0, 0, 0],
    srcRef: '',
  };

  // Frame 0: rwsem structure initialization
  state.srcRef = 'kernel/locking/rwsem.c:309-331 (__init_rwsem)';
  frames.push({
    step: 0,
    label: 'Initialize rw_semaphore',
    description: '__init_rwsem() at kernel/locking/rwsem.c:309 sets count to RWSEM_UNLOCKED_VALUE (0) at line 322, owner to 0 at line 323, initializes wait_lock (line 324), and sets first_waiter to NULL (line 325). On CONFIG_RWSEM_SPIN_ON_OWNER, osq_lock_init() at line 328 prepares the MCS-based optimistic spin queue. The struct rw_semaphore is defined in include/linux/rwsem.h:48 with count and owner on the same cacheline for performance.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 1: Reader A calls down_read() - fast path
  state.phase = 'read-acquire';
  state.lockState = 'reader-locked';
  state.readers = ['Reader-A'];
  state.srcRef = 'kernel/locking/rwsem.c:1564-1571 (down_read)';
  frames.push({
    step: 1,
    label: 'Reader A: down_read() fast path',
    description: 'Reader A calls down_read() at kernel/locking/rwsem.c:1564. After lockdep annotation (rwsem_acquire_read at line 1568), it enters __down_read() at line 1302 via LOCK_CONTENDED at line 1570. __down_read_common() at line 1284 disables preemption and calls rwsem_read_trylock() at line 1290. rwsem_read_trylock() at line 249 does atomic_long_add_return_acquire(RWSEM_READER_BIAS, &sem->count). Since count has no RWSEM_READ_FAILED_MASK bits set, the fast path succeeds and rwsem_set_reader_owned() at line 257 records the owner.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 2: Reader B joins - concurrent readers
  state.readers = ['Reader-A', 'Reader-B'];
  state.srcRef = 'kernel/locking/rwsem.c:249-262 (rwsem_read_trylock)';
  frames.push({
    step: 2,
    label: 'Reader B: concurrent read lock',
    description: 'Reader B also calls down_read(). rwsem_read_trylock() at kernel/locking/rwsem.c:249 atomically adds RWSEM_READER_BIAS (1 << 8 = 256) to count via atomic_long_add_return_acquire at line 251. Count was 0x100 (one reader), now becomes 0x200 (two readers). Bits 8-62 hold the reader count. The RWSEM_READ_FAILED_MASK check at line 256 passes since no writer is locked and no handoff is set. Multiple readers hold the lock concurrently.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 3: Writer tries down_write() - blocked
  state.phase = 'write-slowpath';
  state.lockState = 'contended';
  state.waitQueue = [{ task: 'Writer-X', type: 'writer', handoffSet: false }];
  state.srcRef = 'kernel/locking/rwsem.c:1621-1627 (down_write) -> 1341-1352 (__down_write_common)';
  frames.push({
    step: 3,
    label: 'Writer X: down_write() contention',
    description: 'Writer X calls down_write() at kernel/locking/rwsem.c:1621. __down_write_common() at line 1341 disables preemption and calls rwsem_write_trylock() at line 1346. rwsem_write_trylock() at line 264 attempts atomic_long_try_cmpxchg_acquire(&sem->count, &tmp, RWSEM_WRITER_LOCKED) at line 268 but fails because count is 0x200 (readers present). The writer enters rwsem_down_write_slowpath() at line 1347.',
    highlights: ['wait-queue'],
    data: cloneState(state),
  });

  // Frame 4: Writer enters slowpath, tries optimistic spinning
  state.srcRef = 'kernel/locking/rwsem.c:1139-1148 (rwsem_down_write_slowpath)';
  frames.push({
    step: 4,
    label: 'Writer X: optimistic spinning',
    description: 'rwsem_down_write_slowpath() at kernel/locking/rwsem.c:1139 first tries optimistic spinning. rwsem_can_spin_on_owner() at line 1145 checks if need_resched() is false (line 734) and if the owner is running (via owner task_struct). If the owner is a reader (RWSEM_READER_OWNED bit set), rwsem_optimistic_spin() spins on the owner field. The writer spins without sleeping, hoping readers will release quickly. If spinning fails or times out, it proceeds to the wait queue.',
    highlights: ['wait-queue'],
    data: cloneState(state),
  });

  // Frame 5: Writer queued, sets RWSEM_FLAG_WAITERS
  state.srcRef = 'kernel/locking/rwsem.c:1154-1179 (rwsem_down_write_slowpath queue)';
  frames.push({
    step: 5,
    label: 'Writer X: queued in wait_list',
    description: 'Spinning failed. rwsem_down_write_slowpath() at kernel/locking/rwsem.c:1154 initializes a rwsem_waiter struct (type=RWSEM_WAITING_FOR_WRITE at line 1155, timeout=jiffies+RWSEM_WAIT_TIMEOUT at line 1156). It acquires wait_lock (line 1159), adds the waiter to the list (line 1163 or sets first_waiter at line 1177), and sets RWSEM_FLAG_WAITERS in count at line 1178. Then enters the blocking loop at line 1188, calling rwsem_try_write_lock() each iteration.',
    highlights: ['wait-queue'],
    data: cloneState(state),
  });

  // Frame 6: Readers release, rwsem_down_read_slowpath explained
  state.phase = 'read-slowpath';
  state.readers = [];
  state.lockState = 'contended';
  state.srcRef = 'kernel/locking/rwsem.c:1017-1053 (rwsem_down_read_slowpath)';
  frames.push({
    step: 6,
    label: 'Readers release, slowpath overview',
    description: 'Readers A and B call up_read(). __up_read() at kernel/locking/rwsem.c:1379 subtracts RWSEM_READER_BIAS at line 1387. When count reaches RWSEM_FLAG_WAITERS (waiters present, no readers), rwsem_wake() is called at line 1394. Meanwhile, any new reader calling down_read() would enter rwsem_down_read_slowpath() at line 1017. At line 1036, if no RWSEM_WRITER_LOCKED or RWSEM_FLAG_HANDOFF is set, reader optimistic lock stealing succeeds. Otherwise the reader queues behind the writer.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 7: Writer woken, acquires lock
  state.phase = 'write-acquire';
  state.lockState = 'writer-locked';
  state.writers = ['Writer-X'];
  state.waitQueue = [];
  state.srcRef = 'kernel/locking/rwsem.c:1244-1258 (rwsem_wake) -> 625-689 (rwsem_try_write_lock)';
  frames.push({
    step: 7,
    label: 'Writer X acquires the lock',
    description: 'rwsem_wake() at kernel/locking/rwsem.c:1244 acquires wait_lock at line 1249, calls rwsem_mark_wake(RWSEM_WAKE_ANY) at line 1252 which wakes the writer via wake_q_add() at line 454. The writer wakes and calls rwsem_try_write_lock() at line 1189. At line 662, it sets RWSEM_WRITER_LOCKED via cmpxchg. __rwsem_del_waiter() at line 685 removes it from the wait list. rwsem_set_owner() at line 687 stores current task_struct pointer in sem->owner.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 8: Writer releases
  state.phase = 'unlock';
  state.lockState = 'unlocked';
  state.writers = [];
  state.srcRef = 'kernel/locking/rwsem.c:1678-1683 (up_write) -> 1401 (__up_write)';
  frames.push({
    step: 8,
    label: 'Writer X: up_write() releases lock',
    description: 'Writer X calls up_write() at kernel/locking/rwsem.c:1678. __up_write() at line 1401 calls rwsem_clear_owner() at line 1407 to zero the owner field. Then atomic_long_fetch_add_release(-RWSEM_WRITER_LOCKED) at line 1409 clears the writer-locked bit with release semantics. If waiters remain (tmp & RWSEM_FLAG_WAITERS at line 1411), rwsem_wake() is called to wake the next waiter. The rwsem is now free for the next reader or writer.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: rwsem-writer-starvation
// How handoff prevents writer starvation
// ---------------------------------------------------------------------------
function generateWriterStarvation(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RwsemPercpuState = {
    phase: 'init',
    lockState: 'unlocked',
    readers: [],
    writers: [],
    waitQueue: [],
    perCpuCounters: [0, 0, 0, 0],
    srcRef: '',
  };

  // Frame 0: Setup - readers hold the lock
  state.lockState = 'reader-locked';
  state.readers = ['Reader-A', 'Reader-B'];
  state.srcRef = 'kernel/locking/rwsem.c:82-129 (count bit definitions)';
  frames.push({
    step: 0,
    label: 'Readers hold lock, count bits explained',
    description: 'Two readers hold the rwsem. The count field (kernel/locking/rwsem.c:82-129) encodes: bit 0 = RWSEM_WRITER_LOCKED, bit 1 = RWSEM_FLAG_WAITERS, bit 2 = RWSEM_FLAG_HANDOFF (line 120), bits 8-62 = reader count, bit 63 = read fail bit. Current count is 0x200 (two readers, no flags). The RWSEM_FLAG_HANDOFF at bit 2 is the key anti-starvation mechanism.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 1: Writer arrives, enters wait queue
  state.phase = 'write-slowpath';
  state.lockState = 'contended';
  state.waitQueue = [{ task: 'Writer-X', type: 'writer', handoffSet: false }];
  state.srcRef = 'kernel/locking/rwsem.c:1139-1179 (rwsem_down_write_slowpath queuing)';
  frames.push({
    step: 1,
    label: 'Writer X enters wait queue',
    description: 'Writer X calls down_write(). rwsem_write_trylock() at kernel/locking/rwsem.c:264 fails (readers present). rwsem_down_write_slowpath() at line 1139 tries optimistic spinning but times out. The writer is queued: waiter.type=RWSEM_WAITING_FOR_WRITE (line 1155), waiter.timeout=jiffies+RWSEM_WAIT_TIMEOUT (line 1156, ~4ms). RWSEM_FLAG_WAITERS is set in count at line 1178. New count: 0x202 (2 readers + waiters bit).',
    highlights: ['wait-queue'],
    data: cloneState(state),
  });

  // Frame 2: New readers keep arriving (starvation scenario)
  state.phase = 'contention';
  state.readers = ['Reader-A', 'Reader-B', 'Reader-C'];
  state.srcRef = 'kernel/locking/rwsem.c:1017-1053 (rwsem_down_read_slowpath reader stealing)';
  frames.push({
    step: 2,
    label: 'Reader C steals the lock',
    description: 'Reader C calls down_read(). rwsem_read_trylock() at kernel/locking/rwsem.c:249 adds RWSEM_READER_BIAS. The RWSEM_READ_FAILED_MASK check at line 256 includes RWSEM_FLAG_WAITERS, so the fast path fails. Reader enters rwsem_down_read_slowpath() at line 1017. At line 1036, since RWSEM_WRITER_LOCKED and RWSEM_FLAG_HANDOFF are NOT set, the reader performs lock stealing: rwsem_set_reader_owned() at line 1037. Writer X continues waiting.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 3: Writer timeout expires, handoff requested
  state.phase = 'handoff';
  state.waitQueue = [{ task: 'Writer-X', type: 'writer', handoffSet: true }];
  state.srcRef = 'kernel/locking/rwsem.c:625-678 (rwsem_try_write_lock handoff)';
  frames.push({
    step: 3,
    label: 'RWSEM_FLAG_HANDOFF set (anti-starvation)',
    description: 'Writer X has waited longer than RWSEM_WAIT_TIMEOUT (~4ms, line 357). In the blocking loop at kernel/locking/rwsem.c:1188, rwsem_try_write_lock() is called at line 1189. At line 650, count & RWSEM_LOCK_MASK is nonzero (readers present). At line 656, time_after(jiffies, waiter->timeout) is true. Line 660 sets RWSEM_FLAG_HANDOFF in count via cmpxchg at line 668. At line 676, first->handoff_set = true. This prevents further reader lock stealing.',
    highlights: ['wait-queue'],
    data: cloneState(state),
  });

  // Frame 4: New readers blocked by handoff
  state.waitQueue = [
    { task: 'Writer-X', type: 'writer', handoffSet: true },
    { task: 'Reader-D', type: 'reader', handoffSet: false },
  ];
  state.srcRef = 'kernel/locking/rwsem.c:1036 (reader lock stealing blocked by HANDOFF)';
  frames.push({
    step: 4,
    label: 'Reader D blocked by HANDOFF flag',
    description: 'Reader D calls down_read(). In rwsem_down_read_slowpath() at kernel/locking/rwsem.c:1017, the optimistic stealing check at line 1036 tests !(count & (RWSEM_WRITER_LOCKED | RWSEM_FLAG_HANDOFF)). With RWSEM_FLAG_HANDOFF set, this check FAILS. Reader D cannot steal the lock and must queue behind Writer X at line 1055-1061. The handoff flag ensures the writer will be served next, preventing starvation by a continuous stream of readers.',
    highlights: ['wait-queue'],
    data: cloneState(state),
  });

  // Frame 5: Existing readers drain
  state.readers = [];
  state.srcRef = 'kernel/locking/rwsem.c:1379-1397 (__up_read)';
  frames.push({
    step: 5,
    label: 'Existing readers release the lock',
    description: 'Readers A, B, and C call up_read(). __up_read() at kernel/locking/rwsem.c:1379 subtracts RWSEM_READER_BIAS from count at line 1387 via atomic_long_add_return_release(-RWSEM_READER_BIAS). When the last reader releases, count becomes RWSEM_FLAG_WAITERS | RWSEM_FLAG_HANDOFF (0x6). The condition at line 1394 detects waiters and calls rwsem_wake() at line 1394. No new readers can steal due to HANDOFF.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 6: rwsem_wake wakes the writer
  state.phase = 'wake';
  state.lockState = 'writer-locked';
  state.writers = ['Writer-X'];
  state.waitQueue = [{ task: 'Reader-D', type: 'reader', handoffSet: false }];
  state.srcRef = 'kernel/locking/rwsem.c:1244-1258 (rwsem_wake) -> 429-459 (rwsem_mark_wake)';
  frames.push({
    step: 6,
    label: 'rwsem_wake() wakes Writer X',
    description: 'rwsem_wake() at kernel/locking/rwsem.c:1244 acquires wait_lock (line 1249) and calls rwsem_mark_wake(RWSEM_WAKE_ANY) at line 1252. rwsem_mark_wake() at line 429 sees the first waiter is type RWSEM_WAITING_FOR_WRITE (line 445). For RWSEM_WAKE_ANY at line 446, it calls wake_q_add() at line 454 to queue the writer for wakeup. Writer X wakes, rwsem_try_write_lock() at line 1189 succeeds: handoff_set is true, count is clear, so RWSEM_WRITER_LOCKED is set at line 662 and RWSEM_FLAG_HANDOFF is cleared at line 663.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 7: Writer completes, readers wake
  state.phase = 'unlock';
  state.lockState = 'reader-locked';
  state.writers = [];
  state.readers = ['Reader-D'];
  state.waitQueue = [];
  state.srcRef = 'kernel/locking/rwsem.c:1678-1683 (up_write) -> 1244 (rwsem_wake wakes Reader D)';
  frames.push({
    step: 7,
    label: 'Writer releases, Reader D wakes',
    description: 'Writer X calls up_write() at kernel/locking/rwsem.c:1678. __up_write() clears owner at line 1407, clears RWSEM_WRITER_LOCKED via atomic_long_fetch_add_release at line 1409. RWSEM_FLAG_WAITERS is set, so rwsem_wake() at line 1411 wakes Reader D. rwsem_mark_wake() at line 429 sees a reader at the queue head, adds RWSEM_READER_BIAS at line 476, and wakes all consecutive readers from the queue. Reader D acquires the lock.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 8: Summary
  state.phase = 'unlock';
  state.lockState = 'unlocked';
  state.readers = [];
  state.srcRef = 'kernel/locking/rwsem.c:110-112 (handoff bit overview)';
  frames.push({
    step: 8,
    label: 'Handoff mechanism summary',
    description: 'The RWSEM_FLAG_HANDOFF mechanism (kernel/locking/rwsem.c:110-112) prevents writer starvation by three rules: (1) rwsem_mark_wake() at line 429 can set handoff for readers. (2) rwsem_try_write_lock() at line 625 can set handoff for writers. (3) rwsem_del_waiter() at line 394 can clear handoff. When handoff is set, the first waiter in the queue is guaranteed to acquire the lock next. The RWSEM_WAIT_TIMEOUT at line 357 (~4ms) balances fairness vs. throughput.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: percpu-rwsem-flip
// Per-CPU rwsem with read-side fast path and slow synchronize
// ---------------------------------------------------------------------------
function generatePercpuRwsemFlip(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RwsemPercpuState = {
    phase: 'init',
    lockState: 'unlocked',
    readers: [],
    writers: [],
    waitQueue: [],
    perCpuCounters: [0, 0, 0, 0],
    srcRef: '',
  };

  // Frame 0: percpu_rw_semaphore structure
  state.srcRef = 'include/linux/percpu-rwsem.h:13-22 (struct percpu_rw_semaphore)';
  frames.push({
    step: 0,
    label: 'percpu_rw_semaphore structure',
    description: 'struct percpu_rw_semaphore at include/linux/percpu-rwsem.h:13 contains: rcu_sync rss (line 14) for tracking RCU grace period state, unsigned int __percpu *read_count (line 15) as per-CPU reader counters, rcuwait writer (line 16) for the write-side wait, wait_queue_head_t waiters (line 17), and atomic_t block (line 18). Unlike rw_semaphore, readers use per-CPU counters to avoid cache-line bouncing.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 1: percpu_down_read fast path
  state.phase = 'percpu-read';
  state.lockState = 'reader-locked';
  state.readers = ['Reader-A (CPU 0)'];
  state.perCpuCounters = [1, 0, 0, 0];
  state.srcRef = 'include/linux/percpu-rwsem.h:48-73 (percpu_down_read_internal)';
  frames.push({
    step: 1,
    label: 'Reader A: percpu_down_read() fast path',
    description: 'Reader A calls percpu_down_read() at include/linux/percpu-rwsem.h:75, which calls percpu_down_read_internal() at line 48. After might_sleep() at line 51 and lockdep annotation at line 53, preempt_disable() at line 55 enters an RCU-sched read-side critical section. At line 64, rcu_sync_is_idle(&sem->rss) checks if no writer is active. Since it returns true (fast path), this_cpu_inc(*sem->read_count) at line 65 increments the per-CPU counter. No atomic operations, no cache bouncing.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 2: Multiple readers on different CPUs
  state.readers = ['Reader-A (CPU 0)', 'Reader-B (CPU 2)'];
  state.perCpuCounters = [1, 0, 1, 0];
  state.srcRef = 'include/linux/percpu-rwsem.h:64-65 (per-CPU fast path)';
  frames.push({
    step: 2,
    label: 'Reader B: fast path on CPU 2',
    description: 'Reader B on CPU 2 calls percpu_down_read(). rcu_sync_is_idle() is still true. this_cpu_inc(*sem->read_count) at include/linux/percpu-rwsem.h:65 increments CPU 2\'s counter. Each CPU has its own counter, so Reader A on CPU 0 and Reader B on CPU 2 never contend on the same cache line. This is the key advantage of percpu-rwsem: read-side acquisition is a simple per-CPU increment with no cross-CPU traffic.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 3: Writer calls percpu_down_write, rcu_sync_enter
  state.phase = 'percpu-write';
  state.lockState = 'contended';
  state.srcRef = 'kernel/locking/percpu-rwsem.c:227-235 (percpu_down_write rcu_sync_enter)';
  frames.push({
    step: 3,
    label: 'Writer: percpu_down_write() begins',
    description: 'Writer calls percpu_down_write() at kernel/locking/percpu-rwsem.c:227. After might_sleep() (line 231) and lockdep annotation (line 232), rcu_sync_enter(&sem->rss) is called at line 235. This transitions the rcu_sync state so that subsequent percpu_down_read() calls see rcu_sync_is_idle() return false, forcing them into the slow path (__percpu_down_read at include/linux/percpu-rwsem.h:67). This is the "flip" -- readers are redirected from fast path to slow path.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 4: Writer sets sem->block
  state.srcRef = 'kernel/locking/percpu-rwsem.c:241-245 (__percpu_down_write_trylock sets block)';
  frames.push({
    step: 4,
    label: 'Writer sets sem->block',
    description: '__percpu_down_write_trylock() at kernel/locking/percpu-rwsem.c:84 uses atomic_xchg(&sem->block, 1) at line 89 to set the block flag. At line 241, if this fails (another writer), the writer enters percpu_rwsem_wait() at line 243. Once block is set, new readers calling __percpu_down_read_trylock() at line 48 will see atomic_read_acquire(&sem->block) at line 73 return true, causing them to decrement their per-CPU counter (line 76) and fall into the wait queue.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 5: New reader enters slow path
  state.waitQueue = [{ task: 'Reader-C', type: 'reader', handoffSet: false }];
  state.srcRef = 'kernel/locking/percpu-rwsem.c:169-185 (__percpu_down_read)';
  frames.push({
    step: 5,
    label: 'Reader C: slow path via __percpu_down_read()',
    description: 'Reader C calls percpu_down_read(). rcu_sync_is_idle() returns false (writer flipped it), so __percpu_down_read() at kernel/locking/percpu-rwsem.c:169 is called. __percpu_down_read_trylock() at line 172 increments the per-CPU counter (line 50), hits smp_mb() (line 67), then sees sem->block is set (line 73). It decrements the counter (line 76) and wakes the writer via rcuwait_wake_up() (line 79). percpu_rwsem_wait() at line 180 adds Reader C to the waiters queue.',
    highlights: ['wait-queue'],
    data: cloneState(state),
  });

  // Frame 6: Writer drains existing readers
  state.phase = 'percpu-drain';
  state.srcRef = 'kernel/locking/percpu-rwsem.c:212-225 (readers_active_check) -> 256 (rcuwait_wait_event)';
  frames.push({
    step: 6,
    label: 'Writer waits for existing readers to drain',
    description: 'percpu_down_write() at kernel/locking/percpu-rwsem.c:256 calls rcuwait_wait_event(&sem->writer, readers_active_check(sem)). readers_active_check() at line 212 computes per_cpu_sum(*sem->read_count) at line 214 -- it iterates all CPUs, summing their read_count values. While Readers A and B hold their locks (counters > 0), the sum is nonzero and the writer sleeps. When both readers call percpu_up_read() and decrement their counters, the sum reaches 0 and smp_mb() at line 222 ensures visibility.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 7: Writer has exclusive access
  state.phase = 'percpu-write';
  state.lockState = 'writer-locked';
  state.readers = [];
  state.writers = ['Writer-X'];
  state.perCpuCounters = [0, 0, 0, 0];
  state.srcRef = 'kernel/locking/percpu-rwsem.c:247-259 (writer critical section)';
  frames.push({
    step: 7,
    label: 'Writer has exclusive access',
    description: 'All per-CPU read_count values are 0. rcuwait_wait_event returns at kernel/locking/percpu-rwsem.c:256. The writer now has exclusive access. The memory barrier from __percpu_down_write_trylock() (line 247, "D matches A") ensures the writer sees all data written by previous readers. The writer can safely modify shared data. New readers are blocked in the wait queue.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 8: Writer releases via percpu_up_write
  state.phase = 'unlock';
  state.lockState = 'reader-locked';
  state.writers = [];
  state.readers = ['Reader-C'];
  state.waitQueue = [];
  state.perCpuCounters = [0, 0, 0, 0];
  state.srcRef = 'kernel/locking/percpu-rwsem.c:262-290 (percpu_up_write)';
  frames.push({
    step: 8,
    label: 'percpu_up_write() releases and wakes waiters',
    description: 'percpu_up_write() at kernel/locking/percpu-rwsem.c:262 first does lockdep release (line 264). atomic_set_release(&sem->block, 0) at line 276 clears the block flag with release semantics. __wake_up() at line 281 wakes pending waiters (Reader C). percpu_rwsem_wake_function() at line 119 calls __percpu_rwsem_trylock() for each waiter. Finally, rcu_sync_exit() at line 288 schedules an RCU grace period, after which the fast path (this_cpu_inc) is available again for future readers.',
    highlights: ['lock-state'],
    data: cloneState(state),
  });

  // Frame 9: Summary - fast path restored
  state.phase = 'percpu-read';
  state.lockState = 'unlocked';
  state.readers = [];
  state.perCpuCounters = [0, 0, 0, 0];
  state.srcRef = 'include/linux/percpu-rwsem.h:64 (rcu_sync_is_idle restores fast path)';
  frames.push({
    step: 9,
    label: 'Fast path restored after grace period',
    description: 'After rcu_sync_exit() completes (at least one RCU grace period), rcu_sync_is_idle(&sem->rss) returns true again. Future percpu_down_read() calls take the fast path: a simple this_cpu_inc() with no atomics. The percpu-rwsem design trades expensive write-side operations (RCU grace period, per-CPU sum) for near-zero-cost read-side operations. Used in the kernel for infrequently-written, frequently-read structures like mount namespace locks (fs/namespace.c).',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const LOCK_STATE_COLORS: Record<string, string> = {
  unlocked: '#3fb950',
  'reader-locked': '#58a6ff',
  'writer-locked': '#f0883e',
  contended: '#f85149',
};

const PHASE_LABELS = [
  { id: 'init', label: 'Init' },
  { id: 'read-acquire', label: 'Read' },
  { id: 'write-acquire', label: 'Write' },
  { id: 'contention', label: 'Contend' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'wake', label: 'Wake' },
  { id: 'unlock', label: 'Unlock' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'init': return 0;
    case 'read-acquire': case 'read-slowpath': case 'percpu-read': return 1;
    case 'write-acquire': case 'write-slowpath': case 'percpu-write': return 2;
    case 'contention': case 'percpu-drain': return 3;
    case 'handoff': case 'percpu-sync': return 4;
    case 'wake': return 5;
    case 'unlock': return 6;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as RwsemPercpuState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Reader-Writer Semaphores & Per-CPU Data';
  container.appendChild(title);

  // --- Lock state indicator ---
  const stateTop = margin.top + 28;
  const stateWidth = 220;
  const stateHeight = 30;
  const stateColor = LOCK_STATE_COLORS[data.lockState] || '#30363d';

  const stateRect = document.createElementNS(NS, 'rect');
  stateRect.setAttribute('x', String(margin.left));
  stateRect.setAttribute('y', String(stateTop));
  stateRect.setAttribute('width', String(stateWidth));
  stateRect.setAttribute('height', String(stateHeight));
  stateRect.setAttribute('rx', '6');
  stateRect.setAttribute('fill', stateColor);
  let stateCls = 'anim-lock-state';
  if (frame.highlights.includes('lock-state')) stateCls += ' anim-highlight';
  stateRect.setAttribute('class', stateCls);
  container.appendChild(stateRect);

  const stateText = document.createElementNS(NS, 'text');
  stateText.setAttribute('x', String(margin.left + stateWidth / 2));
  stateText.setAttribute('y', String(stateTop + 20));
  stateText.setAttribute('text-anchor', 'middle');
  stateText.setAttribute('class', 'anim-lock-state');
  stateText.setAttribute('fill', '#e6edf3');
  stateText.textContent = data.lockState.toUpperCase();
  container.appendChild(stateText);

  // --- Readers and Writers (actors) ---
  const actorTop = stateTop;
  const actorLeft = margin.left + stateWidth + 20;

  const allActors = [
    ...data.readers.map(r => ({ name: r, type: 'reader' })),
    ...data.writers.map(w => ({ name: w, type: 'writer' })),
  ];

  allActors.forEach((actor, i) => {
    const ax = actorLeft + i * 110;
    const ay = actorTop;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(ax));
    rect.setAttribute('y', String(ay));
    rect.setAttribute('width', '100');
    rect.setAttribute('height', '28');
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', actor.type === 'reader' ? '#1f4068' : '#5a3a1a');
    rect.setAttribute('class', 'anim-actor');
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(ax + 50));
    label.setAttribute('y', String(ay + 18));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#e6edf3');
    label.setAttribute('font-size', '10');
    label.setAttribute('class', 'anim-actor');
    label.textContent = actor.name;
    container.appendChild(label);
  });

  // --- Phase flow diagram ---
  const flowTop = stateTop + stateHeight + 25;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(85, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isActive) {
      blockClass += ' anim-block-allocated anim-highlight';
    } else if (isPast) {
      blockClass += ' anim-block-allocated';
    } else {
      blockClass += ' anim-block-free';
    }
    rect.setAttribute('class', blockClass);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(px + phaseWidth / 2));
    label.setAttribute('y', String(flowTop + phaseHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = phase.label;
    container.appendChild(label);

    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = flowTop + phaseHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 6));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);
    }
  });

  // --- Wait queue ---
  const queueTop = flowTop + phaseHeight + 18;
  if (data.waitQueue.length > 0) {
    const queueLabel = document.createElementNS(NS, 'text');
    queueLabel.setAttribute('x', String(margin.left));
    queueLabel.setAttribute('y', String(queueTop));
    queueLabel.setAttribute('class', 'anim-cpu-label');
    queueLabel.textContent = 'Wait Queue:';
    container.appendChild(queueLabel);

    data.waitQueue.forEach((entry, i) => {
      const ey = queueTop + 8 + i * 24;
      const ex = margin.left + 10;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(ex));
      rect.setAttribute('y', String(ey));
      rect.setAttribute('width', '200');
      rect.setAttribute('height', '20');
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', entry.type === 'writer' ? '#5a3a1a' : '#1f4068');
      rect.setAttribute('opacity', '0.8');
      let entryCls = 'anim-wait-entry';
      if (frame.highlights.includes('wait-queue')) entryCls += ' anim-highlight';
      rect.setAttribute('class', entryCls);
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(ex + 6));
      text.setAttribute('y', String(ey + 14));
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '10');
      text.setAttribute('class', 'anim-wait-entry');
      text.textContent = `${entry.task} (${entry.type})${entry.handoffSet ? ' [HANDOFF]' : ''}`;
      container.appendChild(text);
    });
  }

  // --- Per-CPU counters ---
  const pcpuTop = data.waitQueue.length > 0
    ? queueTop + 8 + data.waitQueue.length * 24 + 16
    : queueTop + 16;

  if (data.perCpuCounters.some(c => c > 0) || data.phase.startsWith('percpu')) {
    const pcpuLabel = document.createElementNS(NS, 'text');
    pcpuLabel.setAttribute('x', String(margin.left));
    pcpuLabel.setAttribute('y', String(pcpuTop));
    pcpuLabel.setAttribute('class', 'anim-cpu-label');
    pcpuLabel.textContent = 'Per-CPU read_count:';
    container.appendChild(pcpuLabel);

    data.perCpuCounters.forEach((count, i) => {
      const cx = margin.left + i * 80;
      const cy = pcpuTop + 8;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(cx));
      rect.setAttribute('y', String(cy));
      rect.setAttribute('width', '70');
      rect.setAttribute('height', '22');
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', count > 0 ? '#1f6feb' : '#21262d');
      rect.setAttribute('class', 'anim-percpu-counter');
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(cx + 35));
      text.setAttribute('y', String(cy + 15));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '10');
      text.setAttribute('class', 'anim-percpu-counter');
      text.textContent = `CPU${i}: ${count}`;
      container.appendChild(text);
    });
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'rwsem-read-write', label: 'Reader-Writer Semaphore Acquisition' },
  { id: 'rwsem-writer-starvation', label: 'Writer Starvation & Handoff' },
  { id: 'percpu-rwsem-flip', label: 'Per-CPU RWSem Fast Path Flip' },
];

const rwsemPercpu: AnimationModule = {
  config: {
    id: 'rwsem-percpu',
    title: 'Reader-Writer Semaphores & Per-CPU Data',
    skillName: 'rwsem-and-percpu',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'rwsem-writer-starvation': return generateWriterStarvation();
      case 'percpu-rwsem-flip': return generatePercpuRwsemFlip();
      case 'rwsem-read-write':
      default: return generateRwsemReadWrite();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default rwsemPercpu;
