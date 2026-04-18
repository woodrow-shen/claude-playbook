import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

/**
 * qspinlock Animation Module
 *
 * Traces the EXACT algorithm from kernel/locking/qspinlock.c:
 *   queued_spin_lock_slowpath() -- lines 130-381
 *
 * State transition diagram (from the kernel source, lines 116-128):
 *
 *              fast     :    slow                                  :    unlock
 *                       :                                          :
 * uncontended  (0,0,0) -:--> (0,0,1) ------------------------------:--> (*,*,0)
 *                       :       | ^--------.------.             /  :
 *                       :       v           \      \            |  :
 * pending               :    (0,1,1) +--> (0,1,0)   \           |  :
 *                       :       | ^--'              |           |  :
 *                       :       v                   |           |  :
 * uncontended           :    (n,x,y) +--> (n,0,0) --'           |  :
 *   queue               :       | ^--'                          |  :
 *                       :       v                               |  :
 * contended             :    (*,x,y) +--> (*,0,0) ---> (*,0,1) -'  :
 *   queue               :         ^--'                             :
 *
 * Lock word layout (32 bits, include/asm-generic/qspinlock_types.h):
 *   Bit  0     : locked  (1 = held)
 *   Bit  1     : pending (1 = first waiter using pending optimization)
 *   Bits 2-3   : tail_idx (nesting context: 0=task,1=softirq,2=hardirq,3=nmi)
 *   Bits 4-31  : tail_cpu (cpu+1, 0 means no tail)
 */

/* ---------- Data structures ---------- */

export interface LockWord {
  locked: boolean;
  pending: boolean;
  tailCpu: number | null;
  tailIdx: number;
  raw: number;
}

export interface McsNode {
  cpuId: number;
  locked: number;  // 0 = "go ahead", 1 = "keep spinning"
  next: number | null;
  state: 'idle' | 'spinning-local' | 'head-spinning-lock' | 'acquired' | 'unlocking';
}

export interface QspinlockCpu {
  id: number;
  state: 'running' | 'trying-lock' | 'fast-path' | 'pending-set' | 'pending-spin-locked' | 'pending-acquired' | 'mcs-init' | 'mcs-enqueued' | 'mcs-spinning-local' | 'mcs-head-spinning' | 'mcs-head-acquired' | 'holding' | 'unlocking' | 'done';
  cacheLine: string;
}

export interface QspinlockState {
  lockWord: LockWord;
  cpus: QspinlockCpu[];
  mcsQueue: McsNode[];
  phase: string;
  cacheLineActivity: Array<{ line: string; accessCount: number; state: 'cold' | 'warm' | 'hot' }>;
  /** Source reference for current step */
  srcRef: string;
}

/* ---------- Helpers ---------- */

function makeLockWord(locked: boolean, pending: boolean, tailCpu: number | null, tailIdx: number): LockWord {
  let raw = 0;
  if (locked) raw |= 1;           // _Q_LOCKED_VAL = 1 << 0
  if (pending) raw |= (1 << 1);   // _Q_PENDING_VAL = 1 << 1
  if (tailCpu !== null) {
    raw |= ((tailCpu + 1) << 4);  // tail_cpu encoded as cpu+1
    raw |= (tailIdx << 2);        // tail_idx in bits 2-3
  }
  return { locked, pending, tailCpu, tailIdx, raw };
}

function lockWordStr(lw: LockWord): string {
  const t = lw.tailCpu !== null ? `CPU${lw.tailCpu}` : '0';
  return `(tail=${t}, pending=${lw.pending ? 1 : 0}, locked=${lw.locked ? 1 : 0})`;
}

function cloneState(s: QspinlockState): QspinlockState {
  return {
    lockWord: { ...s.lockWord },
    cpus: s.cpus.map(c => ({ ...c })),
    mcsQueue: s.mcsQueue.map(n => ({ ...n })),
    phase: s.phase,
    cacheLineActivity: s.cacheLineActivity.map(c => ({ ...c })),
    srcRef: s.srcRef,
  };
}

/* ========================================================================
 * Scenario 1: Fast Path (uncontended)
 *
 * queued_spin_lock() in include/asm-generic/qspinlock.h:
 *   if (atomic_try_cmpxchg_acquire(&lock->val, &zero, _Q_LOCKED_VAL))
 *       return;     // fast path: (0,0,0) -> (0,0,1)
 *   queued_spin_lock_slowpath(lock, val);
 *
 * queued_spin_unlock():
 *   smp_store_release(&lock->locked, 0);
 * ======================================================================== */

function generateFastPath(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: QspinlockState = {
    lockWord: makeLockWord(false, false, null, 0),
    cpus: [{ id: 0, state: 'running', cacheLine: 'none' }],
    mcsQueue: [],
    phase: 'init',
    cacheLineActivity: [],
    srcRef: '',
  };

  // Frame 0
  state.srcRef = 'include/asm-generic/qspinlock.h: queued_spin_lock()';
  frames.push({
    step: 0,
    label: 'Lock is free: val == 0 (0,0,0)',
    description: 'The qspinlock is a single u32. All bits zero: tail=0, pending=0, locked=0. This is the unlocked state. CPU 0 calls queued_spin_lock(&lock), which tries the fast path: atomic_try_cmpxchg_acquire(&lock->val, &zero, _Q_LOCKED_VAL).',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: CAS succeeds
  state.lockWord = makeLockWord(true, false, null, 0);
  state.cpus[0].state = 'holding';
  state.cpus[0].cacheLine = 'lock_word';
  state.phase = 'fast-acquired';
  state.srcRef = 'qspinlock.h: atomic_try_cmpxchg_acquire(&lock->val, &zero, _Q_LOCKED_VAL)';
  frames.push({
    step: 1,
    label: 'CAS(0 -> 1) succeeds: (0,0,0) -> (0,0,1)',
    description: 'The cmpxchg succeeds because val==0. Lock word transitions from (0,0,0) to (0,0,1) in a single atomic instruction. This is the fast path -- no slowpath entry, no MCS queue, no pending bit. Just one atomic op. The acquire semantics ensure subsequent memory accesses are ordered after lock acquisition.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 2: In critical section
  state.phase = 'critical-section';
  state.srcRef = '';
  frames.push({
    step: 2,
    label: 'CPU 0 in critical section',
    description: 'CPU 0 holds the lock. Lock word = 0x00000001 (locked=1, pending=0, tail=0). No other CPU is waiting. This uncontended case is the common path in well-designed kernel code. The lock fits in 4 bytes (sizeof(spinlock_t)).',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 3: Unlock
  state.cpus[0].state = 'unlocking';
  state.phase = 'unlocking';
  state.srcRef = 'include/asm-generic/qspinlock.h: queued_spin_unlock()';
  frames.push({
    step: 3,
    label: 'queued_spin_unlock: smp_store_release(&lock->locked, 0)',
    description: 'CPU 0 finishes the critical section and calls queued_spin_unlock(). This is a single store-release to the locked byte: smp_store_release(&lock->locked, 0). The release semantics ensure all stores in the critical section are visible before the unlock. Transition: (*,*,1) -> (*,*,0).',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 4: Released
  state.lockWord = makeLockWord(false, false, null, 0);
  state.cpus[0].state = 'done';
  state.cpus[0].cacheLine = 'none';
  state.phase = 'released';
  state.srcRef = '';
  frames.push({
    step: 4,
    label: 'Lock released: back to (0,0,0)',
    description: 'Lock is free again. The entire acquire-release used exactly two atomic operations: one cmpxchg to acquire, one store-release to unlock. Total bus traffic: 2 cache-line transactions. This is optimal.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 5: Summary
  frames.push({
    step: 5,
    label: 'Fast path summary',
    description: 'The fast path in queued_spin_lock() handles the uncontended case with atomic_try_cmpxchg_acquire(lock, 0, _Q_LOCKED_VAL). If it fails (val != 0), execution falls through to queued_spin_lock_slowpath(lock, val) which implements the pending and MCS queue paths.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 2: Pending Path (2-waiter optimization)
 *
 * From queued_spin_lock_slowpath() lines 130-206:
 *
 * 1. If val == _Q_PENDING_VAL (pending->locked in progress), spin briefly
 * 2. If val & ~_Q_LOCKED_MASK (contention besides locked bit): goto queue
 * 3. Otherwise: queued_fetch_set_pending_acquire(lock) to set pending bit
 * 4. If race detected (someone else set pending/tail): undo, goto queue
 * 5. Spin on locked byte: smp_cond_load_acquire(&lock->locked, !VAL)
 * 6. clear_pending_set_locked(lock): (0,1,0) -> (0,0,1)
 * ======================================================================== */

function generatePendingPath(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: QspinlockState = {
    lockWord: makeLockWord(false, false, null, 0),
    cpus: [
      { id: 0, state: 'running', cacheLine: 'none' },
      { id: 1, state: 'running', cacheLine: 'none' },
    ],
    mcsQueue: [],
    phase: 'init',
    cacheLineActivity: [{ line: 'lock_word', accessCount: 0, state: 'cold' }],
    srcRef: '',
  };

  // Frame 0: CPU 0 holds lock
  state.lockWord = makeLockWord(true, false, null, 0);
  state.cpus[0].state = 'holding';
  state.cpus[0].cacheLine = 'lock_word';
  state.cacheLineActivity[0].accessCount = 1;
  state.cacheLineActivity[0].state = 'warm';
  state.srcRef = 'qspinlock.c:130 queued_spin_lock_slowpath(lock, val)';
  frames.push({
    step: 0,
    label: 'CPU 0 holds lock: (0,0,1)',
    description: 'CPU 0 holds the lock via fast path. Lock word = (tail=0, pending=0, locked=1). CPU 1 now attempts to acquire. Its fast-path CAS fails because val=1 != 0. CPU 1 enters queued_spin_lock_slowpath(lock, val=1).',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 1: CPU 1 enters slowpath, checks val
  state.cpus[1].state = 'trying-lock';
  state.cpus[1].cacheLine = 'lock_word';
  state.phase = 'slowpath-entry';
  state.srcRef = 'qspinlock.c:150 if (val == _Q_PENDING_VAL)';
  frames.push({
    step: 1,
    label: 'CPU 1 enters slowpath: val=1 (only locked)',
    description: 'queued_spin_lock_slowpath() first checks if val == _Q_PENDING_VAL (line 150). It\'s not -- val has locked=1, pending=0. Then checks val & ~_Q_LOCKED_MASK (line 159): this is 0 because only the locked bit is set, no pending or tail. Since there\'s no contention BEYOND the lock holder, CPU 1 can use the pending path optimization.',
    highlights: ['cpu-1'],
    data: cloneState(state),
  });

  // Frame 2: CPU 1 atomically sets pending
  state.lockWord = makeLockWord(true, true, null, 0);
  state.cpus[1].state = 'pending-set';
  state.phase = 'pending-set';
  state.cacheLineActivity[0].accessCount = 2;
  state.cacheLineActivity[0].state = 'hot';
  state.srcRef = 'qspinlock.c:167 val = queued_fetch_set_pending_acquire(lock)';
  frames.push({
    step: 2,
    label: 'queued_fetch_set_pending_acquire: (0,0,1) -> (0,1,1)',
    description: 'CPU 1 atomically sets the pending bit: val = queued_fetch_set_pending_acquire(lock). This is an atomic fetch-and-or that sets _Q_PENDING_VAL and returns the OLD value. Line 176 checks if the old val had any bits besides locked set (val & ~_Q_LOCKED_MASK). If someone else snuck in a tail or pending, CPU 1 must undo and go to MCS queue. Here old_val=1 (just locked), so the pending set is valid.',
    highlights: ['cpu-1'],
    data: cloneState(state),
  });

  // Frame 3: CPU 1 spins on locked byte
  state.cpus[1].state = 'pending-spin-locked';
  state.phase = 'pending-spin';
  state.srcRef = 'qspinlock.c:196-197 smp_cond_load_acquire(&lock->locked, !VAL)';
  frames.push({
    step: 3,
    label: 'Spin on locked byte: smp_cond_load_acquire(&lock->locked, !VAL)',
    description: 'Lock word = (0,1,1). CPU 1 now spins on the locked BYTE specifically (not the full word): smp_cond_load_acquire(&lock->locked, !VAL). This uses load-acquire semantics for proper ordering. CPU 1 waits for CPU 0 to set locked=0. Note: CPU 1 spins on the same cache line as the lock word -- this is fine for 2 CPUs.',
    highlights: ['cpu-1'],
    data: cloneState(state),
  });

  // Frame 4: CPU 0 releases, CPU 1 sees locked=0
  state.lockWord = makeLockWord(false, true, null, 0);
  state.cpus[0].state = 'done';
  state.cpus[0].cacheLine = 'none';
  state.phase = 'holder-released';
  state.srcRef = 'qspinlock.c:204 clear_pending_set_locked(lock)';
  frames.push({
    step: 4,
    label: 'CPU 0 releases: (0,1,1) -> (0,1,0)',
    description: 'CPU 0 stores 0 to the locked byte. Lock word transitions to (0,1,0). CPU 1\'s smp_cond_load_acquire sees !locked and exits the spin. Now CPU 1 must atomically transition: clear pending, set locked.',
    highlights: ['cpu-0', 'cpu-1'],
    data: cloneState(state),
  });

  // Frame 5: CPU 1 clears pending, sets locked
  state.lockWord = makeLockWord(true, false, null, 0);
  state.cpus[1].state = 'holding';
  state.phase = 'pending-to-locked';
  state.srcRef = 'qspinlock.c:204 clear_pending_set_locked(lock) -> (0,0,1)';
  frames.push({
    step: 5,
    label: 'clear_pending_set_locked: (0,1,0) -> (0,0,1)',
    description: 'CPU 1 calls clear_pending_set_locked(lock) which atomically clears the pending bit and sets the locked bit. Lock word: (0,0,1). CPU 1 now owns the lock. The entire handoff avoided creating ANY MCS queue node. This is the key optimization: the 2-waiter case (the most common contention pattern) is handled with just bit manipulation.',
    highlights: ['cpu-1'],
    data: cloneState(state),
  });

  // Frame 6: summary
  state.cpus[1].state = 'done';
  state.lockWord = makeLockWord(false, false, null, 0);
  state.phase = 'done';
  state.srcRef = '';
  frames.push({
    step: 6,
    label: 'Pending path summary',
    description: 'The pending path handles the common 2-waiter case without MCS queue overhead. Key code path: queued_fetch_set_pending_acquire() sets pending (line 167), smp_cond_load_acquire(&lock->locked, !VAL) spins on locked byte (line 197), clear_pending_set_locked() claims ownership (line 204). If a THIRD contender appears while pending is set, it sees val & ~_Q_LOCKED_MASK != 0 and goes to the MCS queue.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 3: MCS Queue (3+ contenders)
 *
 * From queued_spin_lock_slowpath() lines 212-380:
 *
 * queue:
 *   node = this_cpu_ptr(&qnodes[0].mcs)  // per-CPU MCS node
 *   idx = node->count++                    // nesting level (task/softirq/hardirq/nmi)
 *   tail = encode_tail(smp_processor_id(), idx)
 *   node->locked = 0; node->next = NULL
 *   if (queued_spin_trylock(lock)) goto release  // retry after touching cold cacheline
 *   old = xchg_tail(lock, tail)            // atomically set tail, get old tail
 *   if (old & _Q_TAIL_MASK):               // there IS a predecessor
 *     prev = decode_tail(old)
 *     WRITE_ONCE(prev->next, node)         // link into queue
 *     arch_mcs_spin_lock_contended(&node->locked)  // spin on LOCAL node
 *   // Now we're the head of the queue
 *   val = atomic_cond_read_acquire(&lock->val, !(VAL & _Q_LOCKED_PENDING_MASK))
 *   if ((val & _Q_TAIL_MASK) == tail):     // we're the only one in queue
 *     if (atomic_try_cmpxchg_relaxed(&lock->val, &val, _Q_LOCKED_VAL))
 *       goto release                       // uncontended: (n,0,0) -> (0,0,1)
 *   set_locked(lock)                       // contended: (*,0,0) -> (*,0,1)
 *   next = smp_cond_load_relaxed(&node->next, (VAL))
 *   arch_mcs_spin_unlock_contended(&next->locked)  // wake next in queue
 * ======================================================================== */

function generateMcsQueueContention(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: QspinlockState = {
    lockWord: makeLockWord(true, true, null, 0),
    cpus: [
      { id: 0, state: 'holding', cacheLine: 'lock_word' },
      { id: 1, state: 'pending-spin-locked', cacheLine: 'lock_word' },
      { id: 2, state: 'running', cacheLine: 'none' },
      { id: 3, state: 'running', cacheLine: 'none' },
    ],
    mcsQueue: [],
    phase: 'init',
    cacheLineActivity: [
      { line: 'lock_word', accessCount: 2, state: 'warm' },
    ],
    srcRef: '',
  };

  // Frame 0: Initial state
  state.srcRef = 'qspinlock.c:159 if (val & ~_Q_LOCKED_MASK) goto queue';
  frames.push({
    step: 0,
    label: 'CPU 0 holds, CPU 1 pending: (0,1,1)',
    description: 'CPU 0 holds (locked=1), CPU 1 set pending=1 and spins on locked byte. CPU 2 tries to acquire. Its fast-path CAS fails. In slowpath, it reads val=(0,1,1). Line 159 checks val & ~_Q_LOCKED_MASK: pending bit IS set, so this is non-zero. CPU 2 CANNOT use the pending path -- it must goto queue (MCS slow path).',
    highlights: ['cpu-0', 'cpu-1'],
    data: cloneState(state),
  });

  // Frame 1: CPU 2 initializes MCS node
  state.cpus[2].state = 'mcs-init';
  state.cpus[2].cacheLine = 'qnodes[CPU2]';
  state.phase = 'cpu2-init-node';
  state.srcRef = 'qspinlock.c:215-253 node=this_cpu_ptr(&qnodes[0].mcs); node->locked=0; node->next=NULL';
  state.cacheLineActivity.push({ line: 'qnodes[CPU2]', accessCount: 1, state: 'cold' });
  frames.push({
    step: 1,
    label: 'CPU 2: init per-CPU MCS node',
    description: 'CPU 2 enters the queue path. It grabs its per-CPU qnode: node = this_cpu_ptr(&qnodes[0].mcs). Sets node->locked=0, node->next=NULL. idx = node->count++ gives the nesting level (0=task context). tail = encode_tail(cpu=2, idx=0). Line 260: before publishing to the queue, it tries one more CAS: queued_spin_trylock(lock). This exploits the fact that we just touched a possibly-cold qnode cacheline -- maybe someone unlocked while we waited.',
    highlights: ['cpu-2'],
    data: cloneState(state),
  });

  // Frame 2: CPU 2 xchg_tail, becomes queue tail
  state.mcsQueue.push({ cpuId: 2, locked: 0, next: null, state: 'head-spinning-lock' });
  state.lockWord = makeLockWord(true, true, 2, 0);
  state.cpus[2].state = 'mcs-enqueued';
  state.phase = 'cpu2-xchg-tail';
  state.cacheLineActivity[0].accessCount = 3;
  state.srcRef = 'qspinlock.c:277 old = xchg_tail(lock, tail)';
  frames.push({
    step: 2,
    label: 'CPU 2: xchg_tail(lock, tail) -- becomes queue tail',
    description: 'Trylock failed (lock still held). CPU 2 publishes its tail: old = xchg_tail(lock, tail). This atomically swaps the tail field in the lock word. old=0 (no previous tail). Since old & _Q_TAIL_MASK == 0, there is NO predecessor. CPU 2 is both the head and tail of the MCS queue. It skips the MCS spin and goes directly to spinning on the global lock: atomic_cond_read_acquire(&lock->val, !(VAL & _Q_LOCKED_PENDING_MASK)).',
    highlights: ['cpu-2'],
    data: cloneState(state),
  });

  // Frame 3: CPU 3 arrives, links behind CPU 2
  state.cpus[3].state = 'mcs-init';
  state.cpus[3].cacheLine = 'qnodes[CPU3]';
  state.mcsQueue[0].next = 3;
  state.mcsQueue[0].locked = 0;
  state.mcsQueue.push({ cpuId: 3, locked: 1, next: null, state: 'spinning-local' });
  state.lockWord = makeLockWord(true, true, 3, 0);
  state.cpus[3].state = 'mcs-spinning-local';
  state.phase = 'cpu3-enqueues';
  state.cacheLineActivity.push({ line: 'qnodes[CPU3]', accessCount: 1, state: 'warm' });
  state.srcRef = 'qspinlock.c:284-291 prev=decode_tail(old); WRITE_ONCE(prev->next, node); arch_mcs_spin_lock_contended(&node->locked)';
  frames.push({
    step: 3,
    label: 'CPU 3: links behind CPU 2, spins on OWN node',
    description: 'CPU 3 does xchg_tail, getting old tail = CPU 2. Since old & _Q_TAIL_MASK != 0, CPU 3 HAS a predecessor. It does: prev = decode_tail(old) -> CPU 2\'s node. WRITE_ONCE(prev->next, node) links CPU 3 after CPU 2. Then arch_mcs_spin_lock_contended(&node->locked): CPU 3 spins on its OWN per-CPU node (smp_cond_load_acquire), NOT on the global lock. This is the MCS key insight: local spinning eliminates cache-line bouncing.',
    highlights: ['cpu-3'],
    data: cloneState(state),
  });

  // Frame 4: Show cache line isolation
  state.cacheLineActivity = [
    { line: 'lock_word', accessCount: 3, state: 'warm' },
    { line: 'qnodes[CPU2]', accessCount: 8, state: 'hot' },
    { line: 'qnodes[CPU3]', accessCount: 8, state: 'hot' },
  ];
  state.cpus[2].state = 'mcs-head-spinning';
  state.phase = 'cache-line-isolation';
  state.srcRef = 'qspinlock.c:328 atomic_cond_read_acquire(&lock->val, !(VAL & _Q_LOCKED_PENDING_MASK))';
  frames.push({
    step: 4,
    label: 'Cache line isolation: each CPU spins locally',
    description: 'CPU 2 (queue head) spins on lock_word: atomic_cond_read_acquire(&lock->val, !(VAL & _Q_LOCKED_PENDING_MASK)) waiting for BOTH locked AND pending to clear. CPU 3 spins on qnodes[CPU3].locked. Classic test-and-set: ALL N CPUs bounce the same cache line -> O(N) invalidations per release. MCS queue: each waiter spins on its own cache line -> O(1) traffic per handoff. This scales to thousands of CPUs.',
    highlights: ['cpu-2', 'cpu-3'],
    data: cloneState(state),
  });

  // Frame 5: CPU 0 releases -> CPU 1 (pending) gets lock -> CPU 1 releases
  state.lockWord = makeLockWord(true, false, 3, 0);
  state.cpus[0].state = 'done';
  state.cpus[0].cacheLine = 'none';
  state.cpus[1].state = 'holding';
  state.phase = 'pending-handoff';
  state.srcRef = 'qspinlock.c:204 clear_pending_set_locked -> CPU 1 owns lock';
  frames.push({
    step: 5,
    label: 'CPU 0 releases -> CPU 1 (pending) acquires',
    description: 'CPU 0 clears locked byte. CPU 1 (pending waiter) detects this, calls clear_pending_set_locked(): (tail,1,0) -> (tail,0,1). CPU 1 now holds the lock. The MCS queue (CPU 2, CPU 3) is completely undisturbed -- CPU 2 still spins on lock_word waiting for locked+pending to both be 0.',
    highlights: ['cpu-1'],
    data: cloneState(state),
  });

  // Frame 6: CPU 1 releases -> queue head (CPU 2) acquires
  state.lockWord = makeLockWord(false, false, 3, 0);
  state.cpus[1].state = 'done';
  state.cpus[1].cacheLine = 'none';
  state.phase = 'head-acquires';
  state.srcRef = 'qspinlock.c:352-362 set_locked(lock); arch_mcs_spin_unlock_contended(&next->locked)';
  frames.push({
    step: 6,
    label: 'CPU 1 releases -> CPU 2 (MCS head) sees locked+pending=0',
    description: 'CPU 1 stores 0 to locked byte. CPU 2\'s spin (line 328) sees !(val & _Q_LOCKED_PENDING_MASK) is true: both locked and pending are 0. CPU 2 checks: (val & _Q_TAIL_MASK) == my_tail? NO -- tail points to CPU 3, not CPU 2. So this is the CONTENDED case (someone else is queued behind). CPU 2 calls set_locked(lock) to claim the lock: (*,0,0) -> (*,0,1). Then it must wake CPU 3.',
    highlights: ['cpu-2'],
    data: cloneState(state),
  });

  // Frame 7: CPU 2 holds lock, wakes CPU 3 via node->locked
  state.lockWord = makeLockWord(true, false, 3, 0);
  state.cpus[2].state = 'holding';
  state.cpus[2].cacheLine = 'lock_word';
  state.mcsQueue = [{ cpuId: 3, locked: 0, next: null, state: 'head-spinning-lock' }];
  state.cpus[3].state = 'mcs-head-spinning';
  state.cpus[3].cacheLine = 'lock_word';
  state.phase = 'cpu2-holds-wakes-cpu3';
  state.srcRef = 'qspinlock.c:370 arch_mcs_spin_unlock_contended(&next->locked)';
  frames.push({
    step: 7,
    label: 'CPU 2 holds lock, wakes CPU 3 via arch_mcs_spin_unlock_contended',
    description: 'CPU 2 now holds the lock. It must hand off the MCS queue head to CPU 3. Line 367-368: if next is not yet known, spin: next = smp_cond_load_relaxed(&node->next, (VAL)). Line 370: arch_mcs_spin_unlock_contended(&next->locked) stores 1 to CPU 3\'s node->locked field via smp_store_release. CPU 3\'s spin loop (arch_mcs_spin_lock_contended) detects this and wakes. CPU 3 is now the queue head, spinning on the global lock.',
    highlights: ['cpu-2', 'cpu-3'],
    data: cloneState(state),
  });

  // Frame 8: CPU 2 releases -> CPU 3 acquires (uncontended queue)
  state.lockWord = makeLockWord(true, false, null, 0);
  state.cpus[2].state = 'done';
  state.cpus[2].cacheLine = 'none';
  state.cpus[3].state = 'holding';
  state.cpus[3].cacheLine = 'lock_word';
  state.mcsQueue = [];
  state.phase = 'cpu3-acquires-uncontended';
  state.srcRef = 'qspinlock.c:352-354 if ((val & _Q_TAIL_MASK) == tail) atomic_try_cmpxchg_relaxed(&lock->val, &val, _Q_LOCKED_VAL)';
  frames.push({
    step: 8,
    label: 'CPU 2 releases -> CPU 3 acquires (uncontended: tail==me)',
    description: 'CPU 2 releases. CPU 3 was spinning on lock_word. It sees locked+pending=0. Now checks: (val & _Q_TAIL_MASK) == my_tail? YES -- CPU 3 is the tail, meaning nobody is queued behind it. This is the UNCONTENDED queue case (line 352). CPU 3 does atomic_try_cmpxchg_relaxed(&lock->val, &val, _Q_LOCKED_VAL): clears the tail and sets locked in one atomic CAS. Transition: (n,0,0) -> (0,0,1). No MCS unlock needed since no successor exists.',
    highlights: ['cpu-3'],
    data: cloneState(state),
  });

  // Frame 9: summary
  state.lockWord = makeLockWord(false, false, null, 0);
  state.cpus[3].state = 'done';
  state.cpus[3].cacheLine = 'none';
  state.phase = 'done';
  state.cacheLineActivity = [];
  state.srcRef = '';
  frames.push({
    step: 9,
    label: 'qspinlock MCS queue summary',
    description: 'The full qspinlock slowpath (kernel/locking/qspinlock.c lines 130-381) has three tiers: (1) Fast path: uncontended CAS. (2) Pending path: 2-waiter optimization, spin on locked byte. (3) MCS queue: N-waiter scalability, each CPU spins on its own per-CPU qnode. The 32-bit lock word packs {locked:1, pending:1, tail_idx:2, tail_cpu:28} -- enough to encode the entire queue tail while keeping spinlock_t at 4 bytes. MCS handoff: arch_mcs_spin_unlock_contended(&next->locked) stores to the successor\'s LOCAL cacheline, avoiding thundering herd.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

/* ---------- SVG Rendering ---------- */

const NS = 'http://www.w3.org/2000/svg';

const CPU_STATE_COLORS: Record<string, string> = {
  'running': '#484f58',
  'trying-lock': '#d29922',
  'fast-path': '#3fb950',
  'pending-set': '#d29922',
  'pending-spin-locked': '#d29922',
  'pending-acquired': '#3fb950',
  'mcs-init': '#6e40c9',
  'mcs-enqueued': '#6e40c9',
  'mcs-spinning-local': '#f0883e',
  'mcs-head-spinning': '#d29922',
  'mcs-head-acquired': '#3fb950',
  'holding': '#3fb950',
  'unlocking': '#8b949e',
  'done': '#30363d',
};

const MCS_NODE_COLORS: Record<string, string> = {
  'idle': '#30363d',
  'spinning-local': '#f0883e',
  'head-spinning-lock': '#d29922',
  'acquired': '#3fb950',
  'unlocking': '#8b949e',
};

const CACHE_STATE_COLORS: Record<string, string> = {
  'cold': '#30363d',
  'warm': '#d29922',
  'hot': '#f85149',
};

function createText(
  x: number, y: number, text: string, cls: string, anchor: string = 'middle',
): SVGTextElement {
  const el = document.createElementNS(NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', anchor);
  el.setAttribute('class', cls);
  el.textContent = text;
  return el;
}

function createRect(
  x: number, y: number, w: number, h: number, fill: string, cls: string, rx: number = 4,
): SVGRectElement {
  const el = document.createElementNS(NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  el.setAttribute('rx', String(rx));
  el.setAttribute('fill', fill);
  el.setAttribute('class', cls);
  return el;
}

function renderLockWord(container: SVGGElement, lockWord: LockWord, width: number, topY: number): void {
  const group = document.createElementNS(NS, 'g');

  group.appendChild(createText(width / 2, topY, 'Lock Word (32 bits)', 'anim-title'));

  const fieldY = topY + 12;
  const fieldH = 28;
  const totalW = Math.min(500, width - 40);
  const startX = (width - totalW) / 2;

  const fields = [
    { label: 'locked', bits: 1, value: lockWord.locked ? '1' : '0', color: lockWord.locked ? '#f85149' : '#238636' },
    { label: 'pending', bits: 1, value: lockWord.pending ? '1' : '0', color: lockWord.pending ? '#d29922' : '#238636' },
    { label: 'tail_idx', bits: 2, value: String(lockWord.tailIdx), color: '#484f58' },
    { label: 'tail_cpu', bits: 28, value: lockWord.tailCpu !== null ? `CPU${lockWord.tailCpu}+1` : '0', color: lockWord.tailCpu !== null ? '#6e40c9' : '#484f58' },
  ];

  const totalBits = 32;
  let cx = startX;
  for (const field of fields) {
    const fw = (field.bits / totalBits) * totalW;
    const displayW = Math.max(fw, 50);
    group.appendChild(createRect(cx, fieldY, displayW, fieldH, field.color, 'anim-lockword-bit'));
    group.appendChild(createText(cx + displayW / 2, fieldY + 12, field.label, 'anim-lockword'));
    group.appendChild(createText(cx + displayW / 2, fieldY + 24, field.value, 'anim-lockword'));
    cx += displayW + 2;
  }

  const hexStr = '0x' + lockWord.raw.toString(16).padStart(8, '0');
  group.appendChild(createText(width / 2, fieldY + fieldH + 16, `raw: ${hexStr}  ${lockWordStr(lockWord)}`, 'anim-lockword'));

  container.appendChild(group);
}

function renderCpus(
  container: SVGGElement, cpus: QspinlockCpu[], highlights: string[], width: number, topY: number,
): void {
  const margin = 20;
  const usableW = width - 2 * margin;
  const cpuW = Math.min(140, (usableW - (cpus.length - 1) * 8) / cpus.length);
  const cpuH = 54;
  const totalCpuW = cpus.length * cpuW + (cpus.length - 1) * 8;
  const startX = (width - totalCpuW) / 2;

  cpus.forEach((cpu, i) => {
    const cx = startX + i * (cpuW + 8);
    const color = CPU_STATE_COLORS[cpu.state] || '#30363d';
    let cls = 'anim-cpu';
    if (highlights.includes(`cpu-${cpu.id}`)) cls += ' anim-highlight';

    container.appendChild(createRect(cx, topY, cpuW, cpuH, color, cls));
    container.appendChild(createText(cx + cpuW / 2, topY + 16, `CPU ${cpu.id}`, 'anim-cpu-label'));

    const stateLabel = cpu.state.replace(/-/g, ' ');
    container.appendChild(createText(cx + cpuW / 2, topY + 32, stateLabel, 'anim-cpu-state'));

    if (cpu.cacheLine !== 'none') {
      container.appendChild(createText(cx + cpuW / 2, topY + 48, `spin: ${cpu.cacheLine}`, 'anim-vruntime-label'));
    }
  });
}

function renderMcsQueue(
  container: SVGGElement, mcsQueue: McsNode[], width: number, topY: number,
): void {
  if (mcsQueue.length === 0) return;

  container.appendChild(createText(width / 2, topY, 'MCS Queue (per-CPU qnodes, each on own cacheline)', 'anim-freelist-title'));

  const nodeW = 130;
  const nodeH = 55;
  const gap = 40;
  const totalW = mcsQueue.length * nodeW + (mcsQueue.length - 1) * gap;
  const startX = (width - totalW) / 2;
  const nodeY = topY + 10;

  mcsQueue.forEach((node, i) => {
    const nx = startX + i * (nodeW + gap);
    const color = MCS_NODE_COLORS[node.state] || '#30363d';

    container.appendChild(createRect(nx, nodeY, nodeW, nodeH, color, 'anim-mcs-node'));
    container.appendChild(createText(nx + nodeW / 2, nodeY + 16, `CPU ${node.cpuId} node`, 'anim-cpu-label'));

    const lockedText = `node->locked = ${node.locked}`;
    container.appendChild(createText(nx + nodeW / 2, nodeY + 32, lockedText, 'anim-lockword'));

    container.appendChild(createText(nx + nodeW / 2, nodeY + 48, node.state, 'anim-cpu-state'));

    if (node.next !== null && i < mcsQueue.length - 1) {
      const arrowStartX = nx + nodeW;
      const arrowEndX = nx + nodeW + gap;
      const arrowY = nodeY + nodeH / 2;

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowStartX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowEndX - 8));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);

      const arrow = document.createElementNS(NS, 'polygon');
      arrow.setAttribute('points', `${arrowEndX - 8},${arrowY - 4} ${arrowEndX},${arrowY} ${arrowEndX - 8},${arrowY + 4}`);
      arrow.setAttribute('fill', '#8b949e');
      container.appendChild(arrow);
    }
  });
}

function renderCacheLines(
  container: SVGGElement, cacheActivity: Array<{ line: string; accessCount: number; state: 'cold' | 'warm' | 'hot' }>, width: number, topY: number,
): void {
  if (cacheActivity.length === 0) return;

  container.appendChild(createText(width / 2, topY, 'Cache Line Activity', 'anim-freelist-title'));

  const barH = 16;
  const barMaxW = 200;
  const startX = 120;
  const barY = topY + 8;
  const maxAccess = Math.max(...cacheActivity.map(c => c.accessCount), 1);

  cacheActivity.forEach((cl, i) => {
    const y = barY + i * (barH + 4);
    const barW = Math.max(20, (cl.accessCount / maxAccess) * barMaxW);
    const color = CACHE_STATE_COLORS[cl.state] || '#30363d';

    container.appendChild(createText(startX - 4, y + 12, cl.line, 'anim-addr-marker', 'end'));
    container.appendChild(createRect(startX, y, barW, barH, color, 'anim-cacheline anim-cacheline-' + cl.state, 3));
    container.appendChild(createText(startX + barW + 6, y + 12, `${cl.accessCount}x`, 'anim-addr-marker', 'start'));
  });
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as QspinlockState;

  renderLockWord(container, data.lockWord, width, 16);
  renderCpus(container, data.cpus, frame.highlights, width, 90);
  const mcsY = 175;
  renderMcsQueue(container, data.mcsQueue, width, mcsY);
  const cacheY = data.mcsQueue.length > 0 ? 305 : 210;
  renderCacheLines(container, data.cacheLineActivity, width, cacheY);

  // Source reference
  if (data.srcRef) {
    container.appendChild(createText(width / 2, height - 8, data.srcRef, 'anim-addr-marker'));
  }
}

/* ---------- Module export ---------- */

const SCENARIOS: AnimationScenario[] = [
  { id: 'fast-path', label: 'Fast Path (Uncontended CAS)' },
  { id: 'pending-path', label: 'Pending Path (2-Waiter, line 150-206)' },
  { id: 'mcs-queue-contention', label: 'MCS Queue (3+ Contenders, line 212-380)' },
];

const qspinlockModule: AnimationModule = {
  config: {
    id: 'qspinlock',
    title: 'qspinlock MCS Queue',
    skillName: 'spinlocks-and-mutexes',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'pending-path': return generatePendingPath();
      case 'mcs-queue-contention': return generateMcsQueueContention();
      case 'fast-path':
      default: return generateFastPath();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default qspinlockModule;
