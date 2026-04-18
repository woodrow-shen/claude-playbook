import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface LockdepState {
  lockClasses: Array<{ name: string; key: string; usageMask: number }>;
  dependencyEdges: Array<{ from: string; to: string }>;
  heldLocks: Array<{ className: string; acquireIp: string; irqContext: boolean }>;
  bfsQueue: string[];
  cycleDetected: boolean;
  currentFunction: string;
  phase: 'acquire' | 'lookup-class' | 'register-class' | 'validate-chain' | 'add-dependency' | 'bfs-walk' | 'cycle-found' | 'irq-check' | 'release' | 'clean';
  srcRef: string;
}

function cloneState(s: LockdepState): LockdepState {
  return {
    lockClasses: s.lockClasses.map(lc => ({ ...lc })),
    dependencyEdges: s.dependencyEdges.map(e => ({ ...e })),
    heldLocks: s.heldLocks.map(h => ({ ...h })),
    bfsQueue: [...s.bfsQueue],
    cycleDetected: s.cycleDetected,
    currentFunction: s.currentFunction,
    phase: s.phase,
    srcRef: s.srcRef,
  };
}

function generateLockAcquisitionTracking(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: LockdepState = {
    lockClasses: [],
    dependencyEdges: [],
    heldLocks: [],
    bfsQueue: [],
    cycleDetected: false,
    currentFunction: 'lock_acquire',
    phase: 'acquire',
    srcRef: 'kernel/locking/lockdep.c:5825',
  };

  // Frame 0: lock_acquire() entry for lock A
  frames.push({
    step: 0,
    label: 'lock_acquire() called for lock A',
    description: 'Thread calls spin_lock(&lock_A), which invokes lock_acquire() at kernel/locking/lockdep.c:5825. After checking debug_locks and disabling IRQs with raw_local_irq_save(flags) at line 5864, it calls __lock_acquire() at line 5868 to perform the actual lockdep validation.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 1: __lock_acquire() looks up lock class
  state.currentFunction = '__lock_acquire';
  state.phase = 'lookup-class';
  state.srcRef = 'kernel/locking/lockdep.c:5077';
  frames.push({
    step: 1,
    label: '__lock_acquire() looks up lock class for A',
    description: '__lock_acquire() at kernel/locking/lockdep.c:5077 begins by looking up the lock_class for lock_A. At line 5106, it checks the class_cache[] for a cached result. On a miss (line 5111), it calls register_lock_class() at line 5112 to find or create the class via hash lookup.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 2: register_lock_class() registers class A
  state.currentFunction = 'register_lock_class';
  state.phase = 'register-class';
  state.srcRef = 'kernel/locking/lockdep.c:1285';
  state.lockClasses.push({ name: 'lock_A', key: '&lock_A_key', usageMask: 0 });
  frames.push({
    step: 2,
    label: 'register_lock_class() creates class for lock_A',
    description: 'register_lock_class() at kernel/locking/lockdep.c:1285 first calls look_up_lock_class() at line 1294 (kernel/locking/lockdep.c:887). Class not found, so it hashes the lock_class_key subkey at line 1305-1306, calls graph_lock() at line 1308, and inserts a new lock_class into the hash table. The struct lock_class (include/linux/lockdep_types.h:98) holds locks_after/locks_before lists for dependency edges.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 3: lock A acquired, add to held_locks
  state.currentFunction = '__lock_acquire';
  state.phase = 'acquire';
  state.srcRef = 'kernel/locking/lockdep.c:5237';
  state.heldLocks.push({ className: 'lock_A', acquireIp: '0xffffffff81234560', irqContext: false });
  frames.push({
    step: 3,
    label: 'Lock A acquired -- added to held_locks stack',
    description: '__lock_acquire() calls validate_chain() at kernel/locking/lockdep.c:5237. Since lock_A is the first lock (chain_head=1), check_deadlock() at line 3895 finds no same-class conflicts, and check_prevs_add() is skipped (no previous lock in chain). The held_lock is pushed onto curr->held_locks[] and lockdep_depth incremented at line 5245.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 4: lock_acquire() called for lock B
  state.currentFunction = 'lock_acquire';
  state.phase = 'acquire';
  state.srcRef = 'kernel/locking/lockdep.c:5868';
  frames.push({
    step: 4,
    label: 'lock_acquire() called for lock B (while holding A)',
    description: 'Thread now calls spin_lock(&lock_B) while still holding lock_A. lock_acquire() at kernel/locking/lockdep.c:5825 again disables IRQs and calls __lock_acquire() at line 5868. This time lockdep_depth is 1, so lockdep will validate the A->B ordering.',
    highlights: ['lock_B'],
    data: cloneState(state),
  });

  // Frame 5: register class B, look up
  state.currentFunction = 'register_lock_class';
  state.phase = 'register-class';
  state.srcRef = 'kernel/locking/lockdep.c:1294';
  state.lockClasses.push({ name: 'lock_B', key: '&lock_B_key', usageMask: 0 });
  frames.push({
    step: 5,
    label: 'register_lock_class() creates class for lock_B',
    description: 'register_lock_class() at kernel/locking/lockdep.c:1285 calls look_up_lock_class() at line 1294 (kernel/locking/lockdep.c:887). Class not found in hash, so a new lock_class is allocated with locks_after and locks_before lists initialized empty. The class key is derived from the static lock_class_key embedded in the lock definition.',
    highlights: ['lock_B'],
    data: cloneState(state),
  });

  // Frame 6: validate_chain -> check_prevs_add -> check_prev_add
  state.currentFunction = 'validate_chain';
  state.phase = 'validate-chain';
  state.srcRef = 'kernel/locking/lockdep.c:3861';
  state.heldLocks.push({ className: 'lock_B', acquireIp: '0xffffffff81234580', irqContext: false });
  frames.push({
    step: 6,
    label: 'validate_chain() checks A->B dependency',
    description: 'validate_chain() at kernel/locking/lockdep.c:3861 calls lookup_chain_cache_add() at line 3876 -- new chain, so it proceeds. check_deadlock() at line 3895 finds no same-class held lock. Since chain_head=0 (not first lock), check_prevs_add() is called at line 3908, which iterates held locks and calls check_prev_add() at kernel/locking/lockdep.c:3284 for each previous lock.',
    highlights: ['lock_A', 'lock_B'],
    data: cloneState(state),
  });

  // Frame 7: check_prev_add -> check_noncircular -> add dependency
  state.currentFunction = 'check_prev_add';
  state.phase = 'add-dependency';
  state.srcRef = 'kernel/locking/lockdep.c:3165';
  state.dependencyEdges.push({ from: 'lock_A', to: 'lock_B' });
  frames.push({
    step: 7,
    label: 'check_prev_add() adds A->B dependency edge',
    description: 'check_prev_add() at kernel/locking/lockdep.c:3122 calls check_noncircular(next=B, prev=A) at line 3165, which uses check_path() (line 2160) -> __bfs() at kernel/locking/lockdep.c:1733 to search B\'s locks_after graph for a path back to A. No cycle found (BFS_RNOMATCH). check_irq_usage() at line 3169 passes. The A->B edge is added to lock_A.locks_after and lock_B.locks_before lists.',
    highlights: ['lock_A', 'lock_B', 'edge-lock_A-lock_B'],
    data: cloneState(state),
  });

  // Frame 8: clean state after release
  state.currentFunction = 'lock_release';
  state.phase = 'release';
  state.srcRef = 'kernel/locking/lockdep.c:5875';
  state.heldLocks = [];
  frames.push({
    step: 8,
    label: 'Both locks released -- dependency graph persists',
    description: 'lock_release() at kernel/locking/lockdep.c:5875 calls __lock_release() at line 5511, which finds the held_lock via find_held_lock() at line 5535 and decrements lockdep_depth. The dependency edge A->B remains in the global graph permanently. Future acquisitions of A then B will hit the chain cache and skip validation. But acquiring B then A would trigger deadlock detection.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

function generateDeadlockDetection(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: LockdepState = {
    lockClasses: [],
    dependencyEdges: [],
    heldLocks: [],
    bfsQueue: [],
    cycleDetected: false,
    currentFunction: 'lock_acquire',
    phase: 'acquire',
    srcRef: 'kernel/locking/lockdep.c:5825',
  };

  // Frame 0: setup
  frames.push({
    step: 0,
    label: 'Deadlock scenario: Thread 1 acquires A then B',
    description: 'Two locks: A and B. Thread 1 will acquire A then B, establishing the A->B dependency. Thread 2 will then acquire B then A, creating a B->A dependency. lock_acquire() at kernel/locking/lockdep.c:5825 calls __lock_acquire() at line 5868 for each acquisition.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: Thread 1 acquires A
  state.lockClasses.push({ name: 'lock_A', key: '&lock_A_key', usageMask: 0 });
  state.heldLocks.push({ className: 'lock_A', acquireIp: '0xffffffff81234560', irqContext: false });
  state.currentFunction = '__lock_acquire';
  state.phase = 'acquire';
  state.srcRef = 'kernel/locking/lockdep.c:5112';
  frames.push({
    step: 1,
    label: 'Thread 1: acquires lock A',
    description: '__lock_acquire() at kernel/locking/lockdep.c:5077 calls register_lock_class() at line 5112 to create the lock_class for A. The held_lock struct (include/linux/lockdep_types.h:206) records acquire_ip, class_idx, and irq_context. Lock A is pushed onto Thread 1\'s held_locks stack.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 2: Thread 1 acquires B, A->B edge added
  state.lockClasses.push({ name: 'lock_B', key: '&lock_B_key', usageMask: 0 });
  state.heldLocks.push({ className: 'lock_B', acquireIp: '0xffffffff81234580', irqContext: false });
  state.dependencyEdges.push({ from: 'lock_A', to: 'lock_B' });
  state.currentFunction = 'check_prev_add';
  state.phase = 'add-dependency';
  state.srcRef = 'kernel/locking/lockdep.c:3284';
  frames.push({
    step: 2,
    label: 'Thread 1: acquires lock B -- A->B edge added',
    description: 'validate_chain() at kernel/locking/lockdep.c:3861 triggers check_prevs_add() at line 3908, which calls check_prev_add(A, B) at line 3284. check_noncircular(B, A) at line 3165 runs __bfs() from B -- no existing edges, returns BFS_RNOMATCH. The A->B dependency is added to lock_A.locks_after list. Thread 1 releases both locks.',
    highlights: ['lock_A', 'lock_B', 'edge-lock_A-lock_B'],
    data: cloneState(state),
  });

  // Frame 3: Thread 1 releases, Thread 2 begins
  state.heldLocks = [];
  state.currentFunction = 'lock_acquire';
  state.phase = 'acquire';
  state.srcRef = 'kernel/locking/lockdep.c:5825';
  frames.push({
    step: 3,
    label: 'Thread 2: acquires lock B',
    description: 'Thread 1 releases both locks via lock_release() (kernel/locking/lockdep.c:5875). Thread 2 now calls lock_acquire() for lock_B. The lock_class for B is found in the hash via look_up_lock_class() at kernel/locking/lockdep.c:887. Lock B is the first in Thread 2\'s chain, so no dependency validation needed yet.',
    highlights: ['lock_B'],
    data: cloneState(state),
  });

  // Frame 4: Thread 2 holds B
  state.heldLocks.push({ className: 'lock_B', acquireIp: '0xffffffff81234700', irqContext: false });
  state.currentFunction = '__lock_acquire';
  state.phase = 'acquire';
  state.srcRef = 'kernel/locking/lockdep.c:5237';
  frames.push({
    step: 4,
    label: 'Thread 2: holds B, now tries to acquire A',
    description: '__lock_acquire() at kernel/locking/lockdep.c:5077 for lock_B succeeds. Thread 2 now calls lock_acquire() for lock_A while holding B. __lock_acquire() calls validate_chain() at line 5237 -- this triggers the critical deadlock check.',
    highlights: ['lock_B', 'lock_A'],
    data: cloneState(state),
  });

  // Frame 5: validate_chain -> check_prev_add -> check_noncircular
  state.heldLocks.push({ className: 'lock_A', acquireIp: '0xffffffff81234720', irqContext: false });
  state.currentFunction = 'check_noncircular';
  state.phase = 'validate-chain';
  state.srcRef = 'kernel/locking/lockdep.c:2149';
  frames.push({
    step: 5,
    label: 'check_noncircular() starts BFS from lock A',
    description: 'validate_chain() at kernel/locking/lockdep.c:3861 -> check_prevs_add() at line 3908 -> check_prev_add(B, A) at line 3284 -> check_noncircular(next=A, prev=B) at kernel/locking/lockdep.c:2149. This calls check_path() at line 2160 which invokes __bfs() at kernel/locking/lockdep.c:1733 starting from A\'s lock_list, searching for a path back to B.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 6: BFS walks A -> B (finds the existing edge!)
  state.currentFunction = '__bfs';
  state.phase = 'bfs-walk';
  state.srcRef = 'kernel/locking/lockdep.c:1733';
  state.bfsQueue = ['lock_A', 'lock_B'];
  frames.push({
    step: 6,
    label: '__bfs() walks dependency graph: A -> B found!',
    description: '__bfs() at kernel/locking/lockdep.c:1733 uses a circular_queue (line 1740). It enqueues A via __cq_enqueue() at line 1750. The BFS loop at line 1752 dequeues A, iterates its locks_after list, finds the A->B edge. It checks the match function (hlock_conflict) -- B matches the target (prev lock). BFS returns BFS_RMATCH, meaning a cycle exists: B->A (new) would create B->A->B.',
    highlights: ['lock_A', 'lock_B', 'edge-lock_A-lock_B'],
    data: cloneState(state),
  });

  // Frame 7: cycle detected -> print_circular_bug
  state.currentFunction = 'print_circular_bug';
  state.phase = 'cycle-found';
  state.srcRef = 'kernel/locking/lockdep.c:2005';
  state.bfsQueue = [];
  state.cycleDetected = true;
  state.dependencyEdges.push({ from: 'lock_B', to: 'lock_A' });
  frames.push({
    step: 7,
    label: 'Cycle detected! print_circular_bug() reports deadlock',
    description: 'check_noncircular() at kernel/locking/lockdep.c:2149 sees BFS_RMATCH at line 2162 and calls print_circular_bug() at line 2175 (defined at line 2005). print_circular_bug() calls debug_locks_off_graph_unlock() at line 2015, then print_circular_bug_header() at line 2026, followed by walking the parent chain via get_lock_parent() at line 2028-2033 to print each link. The kernel emits the full lock dependency chain showing A->B->A cycle.',
    highlights: ['lock_A', 'lock_B', 'edge-lock_A-lock_B', 'edge-lock_B-lock_A'],
    data: cloneState(state),
  });

  // Frame 8: aftermath
  state.currentFunction = 'print_circular_bug';
  state.phase = 'cycle-found';
  state.srcRef = 'kernel/locking/lockdep.c:2036';
  frames.push({
    step: 8,
    label: 'Lockdep prints deadlock diagnosis and stack trace',
    description: 'print_circular_bug() continues at kernel/locking/lockdep.c:2036 printing "other info that might help us debug this", calls print_circular_lock_scenario() at line 2037 showing the two conflicting lock orderings, lockdep_print_held_locks() at line 2040 listing all currently held locks, and dump_stack() at line 2043 for a full kernel stack backtrace. The validator has proven a potential deadlock before it actually occurs.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

function generateIrqSafetyCheck(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: LockdepState = {
    lockClasses: [],
    dependencyEdges: [],
    heldLocks: [],
    bfsQueue: [],
    cycleDetected: false,
    currentFunction: 'lock_acquire',
    phase: 'acquire',
    srcRef: 'kernel/locking/lockdep.c:5825',
  };

  // Frame 0: scenario setup
  frames.push({
    step: 0,
    label: 'IRQ safety scenario: lock A (IRQ-safe) and lock B (IRQ-unsafe)',
    description: 'Lock A is taken inside a hardirq handler (IRQ-safe). Lock B is taken in process context without disabling IRQs (IRQ-unsafe). If code acquires B while holding A, an interrupt could fire, try to acquire A, but B is held -- potential deadlock. lock_acquire() at kernel/locking/lockdep.c:5825 tracks IRQ context via irqs_disabled_flags() at line 5869.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: lock A acquired in hardirq context
  state.lockClasses.push({ name: 'lock_A', key: '&lock_A_key', usageMask: 0x2 }); // LOCK_USED_IN_HARDIRQ
  state.heldLocks.push({ className: 'lock_A', acquireIp: '0xffffffff81234560', irqContext: true });
  state.currentFunction = '__lock_acquire';
  state.phase = 'acquire';
  state.srcRef = 'kernel/locking/lockdep.c:5077';
  frames.push({
    step: 1,
    label: 'Lock A acquired in hardirq handler',
    description: '__lock_acquire() at kernel/locking/lockdep.c:5077 receives hardirqs_off=1 (from irqs_disabled_flags at line 5869). The lock_class for A gets its usage_mask updated with LOCK_USED_IN_HARDIRQ bit. The struct lock_class at include/linux/lockdep_types.h:98 stores usage_mask at line 128 and usage_traces at line 129 recording where each usage type was first seen.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 2: lock A released from IRQ
  state.heldLocks = [];
  state.currentFunction = 'lock_release';
  state.phase = 'release';
  state.srcRef = 'kernel/locking/lockdep.c:5875';
  frames.push({
    step: 2,
    label: 'Lock A released from hardirq context',
    description: 'lock_release() at kernel/locking/lockdep.c:5875 calls __lock_release() at line 5511. The held_lock is removed from the stack. But the usage_mask on lock_A\'s class remains -- it permanently records that this lock class has been used in hardirq context. This information is crucial for the IRQ safety analysis.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 3: process context, acquire lock A with IRQs enabled
  state.heldLocks.push({ className: 'lock_A', acquireIp: '0xffffffff81234600', irqContext: false });
  state.currentFunction = '__lock_acquire';
  state.phase = 'acquire';
  state.srcRef = 'kernel/locking/lockdep.c:5237';
  state.lockClasses[0].usageMask = 0x6; // HARDIRQ + ENABLED (both states seen)
  frames.push({
    step: 3,
    label: 'Process context: acquire lock A (IRQs enabled)',
    description: '__lock_acquire() at kernel/locking/lockdep.c:5077 now sees lock_A acquired in process context with IRQs enabled. The usage_mask is updated to include LOCK_ENABLED_HARDIRQ. validate_chain() at line 5237 runs -- A is first in chain, so only check_deadlock() (line 3895) runs. Lock A now has both USED_IN_HARDIRQ and ENABLED_HARDIRQ bits set.',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 4: acquire lock B while holding A
  state.lockClasses.push({ name: 'lock_B', key: '&lock_B_key', usageMask: 0x4 }); // ENABLED only
  state.heldLocks.push({ className: 'lock_B', acquireIp: '0xffffffff81234620', irqContext: false });
  state.currentFunction = 'validate_chain';
  state.phase = 'validate-chain';
  state.srcRef = 'kernel/locking/lockdep.c:3861';
  state.dependencyEdges.push({ from: 'lock_A', to: 'lock_B' });
  frames.push({
    step: 4,
    label: 'Acquire lock B while holding A -- A->B edge added',
    description: 'validate_chain() at kernel/locking/lockdep.c:3861 calls check_prevs_add() at line 3908 -> check_prev_add(A, B) at line 3284. check_noncircular() at line 3165 passes (no cycle). Now check_irq_usage() at kernel/locking/lockdep.c:3169 must verify that adding the A->B dependency does not create an IRQ-safety violation.',
    highlights: ['lock_A', 'lock_B'],
    data: cloneState(state),
  });

  // Frame 5: check_irq_usage begins backward BFS
  state.currentFunction = 'check_irq_usage';
  state.phase = 'irq-check';
  state.srcRef = 'kernel/locking/lockdep.c:2780';
  state.bfsQueue = ['lock_A'];
  frames.push({
    step: 5,
    label: 'check_irq_usage() step 1: backward BFS from lock A',
    description: 'check_irq_usage() at kernel/locking/lockdep.c:2780 performs a multi-step analysis. Step 1 (line 2794-2800): __bfs_backwards() walks backward from A through locks_before, accumulating all IRQ usage bits into usage_mask. Lock A has LOCK_USED_IN_HARDIRQ set, so usage_mask includes LOCKF_USED_IN_IRQ_ALL (checked at line 2802-2803).',
    highlights: ['lock_A'],
    data: cloneState(state),
  });

  // Frame 6: forward BFS from B finds IRQ-unsafe usage
  state.currentFunction = 'check_irq_usage';
  state.phase = 'irq-check';
  state.srcRef = 'kernel/locking/lockdep.c:2810';
  state.bfsQueue = ['lock_B'];
  frames.push({
    step: 6,
    label: 'check_irq_usage() step 2: forward BFS from lock B',
    description: 'Step 2 (line 2810-2820): exclusive_mask() at line 2810 converts IRQ-safe bits to their unsafe counterparts. find_usage_forwards() at line 2814 does a BFS from B through locks_after, looking for any lock class with IRQ-unsafe (LOCK_ENABLED_HARDIRQ) usage. Lock B has LOCK_ENABLED_HARDIRQ set -- it was acquired with IRQs enabled. BFS returns BFS_RMATCH.',
    highlights: ['lock_B'],
    data: cloneState(state),
  });

  // Frame 7: find_exclusive_match reports the violation
  state.currentFunction = 'check_irq_usage';
  state.phase = 'irq-check';
  state.srcRef = 'kernel/locking/lockdep.c:2851';
  state.bfsQueue = [];
  frames.push({
    step: 7,
    label: 'IRQ-safety violation: irq-safe A -> irq-unsafe B',
    description: 'Step 3 (line 2837-2845): find_usage_backwards() confirms the backward path. Step 4 (line 2851-2853): find_exclusive_match() narrows down the exact incompatible usage bits -- backward_bit=LOCK_USED_IN_HARDIRQ, forward_bit=LOCK_ENABLED_HARDIRQ. These are contradictory: lock A is used in hardirq, but B (reachable from A) is used with hardirqs enabled.',
    highlights: ['lock_A', 'lock_B'],
    data: cloneState(state),
  });

  // Frame 8: print_bad_irq_dependency
  state.currentFunction = 'print_bad_irq_dependency';
  state.phase = 'irq-check';
  state.srcRef = 'kernel/locking/lockdep.c:2857';
  state.cycleDetected = true;
  frames.push({
    step: 8,
    label: 'print_bad_irq_dependency() reports the violation',
    description: 'print_bad_irq_dependency() at kernel/locking/lockdep.c:2857 (defined at line 2547) prints the full IRQ inversion dependency chain. It shows: lock_A is IRQ-safe (taken in hardirq), lock_B is IRQ-unsafe (taken with IRQs enabled), and A->B creates a scenario where hardirq fires while B is held, tries to acquire A, but cannot proceed because the thread holding B needs to finish first -- deadlock.',
    highlights: ['lock_A', 'lock_B'],
    data: cloneState(state),
  });

  return frames;
}

const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  'acquire': '#3fb950',
  'lookup-class': '#58a6ff',
  'register-class': '#58a6ff',
  'validate-chain': '#d29922',
  'add-dependency': '#3fb950',
  'bfs-walk': '#f0883e',
  'cycle-found': '#f85149',
  'irq-check': '#bc8cff',
  'release': '#484f58',
  'clean': '#30363d',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as LockdepState;
  const margin = { top: 20, left: 20, right: 20 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '16');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Lockdep Dependency Graph';
  container.appendChild(title);

  // Phase indicator
  const phaseText = document.createElementNS(NS, 'text');
  phaseText.setAttribute('x', String(margin.left));
  phaseText.setAttribute('y', '36');
  phaseText.setAttribute('class', 'anim-phase');
  phaseText.setAttribute('fill', PHASE_COLORS[data.phase] || '#8b949e');
  phaseText.textContent = `Phase: ${data.phase} | ${data.currentFunction}()`;
  container.appendChild(phaseText);

  // Lock class nodes
  const nodeY = margin.top + 50;
  const nodeWidth = Math.min(120, (usableWidth - 40) / Math.max(data.lockClasses.length, 1));
  const nodeHeight = 50;
  const totalNodesWidth = data.lockClasses.length * (nodeWidth + 20) - 20;
  const startX = margin.left + (usableWidth - totalNodesWidth) / 2;

  const nodePositions: Record<string, { x: number; y: number }> = {};

  data.lockClasses.forEach((lc, i) => {
    const cx = startX + i * (nodeWidth + 20);
    nodePositions[lc.name] = { x: cx + nodeWidth / 2, y: nodeY + nodeHeight / 2 };

    const isBfsActive = data.bfsQueue.includes(lc.name);
    const isHighlighted = frame.highlights.includes(lc.name);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(cx));
    rect.setAttribute('y', String(nodeY));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', data.cycleDetected && isHighlighted ? '#f8514930' : '#21262d');
    rect.setAttribute('stroke', isBfsActive ? '#f0883e' : isHighlighted ? '#58a6ff' : '#30363d');
    rect.setAttribute('stroke-width', isBfsActive || isHighlighted ? '2' : '1');
    let cls = 'anim-lock-class';
    if (isBfsActive) cls += ' anim-bfs-active';
    if (isHighlighted) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Lock name
    const nameText = document.createElementNS(NS, 'text');
    nameText.setAttribute('x', String(cx + nodeWidth / 2));
    nameText.setAttribute('y', String(nodeY + 20));
    nameText.setAttribute('text-anchor', 'middle');
    nameText.setAttribute('class', 'anim-lock-name');
    nameText.setAttribute('fill', '#e6edf3');
    nameText.textContent = lc.name;
    container.appendChild(nameText);

    // Usage mask
    const maskText = document.createElementNS(NS, 'text');
    maskText.setAttribute('x', String(cx + nodeWidth / 2));
    maskText.setAttribute('y', String(nodeY + 38));
    maskText.setAttribute('text-anchor', 'middle');
    maskText.setAttribute('class', 'anim-lock-mask');
    maskText.setAttribute('fill', '#8b949e');
    maskText.setAttribute('font-size', '10');
    maskText.textContent = `usage: 0x${lc.usageMask.toString(16)}`;
    container.appendChild(maskText);
  });

  // Dependency edges
  data.dependencyEdges.forEach(edge => {
    const from = nodePositions[edge.from];
    const to = nodePositions[edge.to];
    if (!from || !to) return;

    const edgeId = `edge-${edge.from}-${edge.to}`;
    const isHighlighted = frame.highlights.includes(edgeId);

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y + nodeHeight / 2));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y + nodeHeight / 2));
    line.setAttribute('stroke', isHighlighted ? (data.cycleDetected ? '#f85149' : '#3fb950') : '#484f58');
    line.setAttribute('stroke-width', isHighlighted ? '2' : '1');
    line.setAttribute('class', 'anim-dep-edge');
    container.appendChild(line);

    // Arrow label
    const midX = (from.x + to.x) / 2;
    const midY = from.y + nodeHeight / 2 + 14;
    const arrowLabel = document.createElementNS(NS, 'text');
    arrowLabel.setAttribute('x', String(midX));
    arrowLabel.setAttribute('y', String(midY));
    arrowLabel.setAttribute('text-anchor', 'middle');
    arrowLabel.setAttribute('fill', '#8b949e');
    arrowLabel.setAttribute('font-size', '10');
    arrowLabel.textContent = `${edge.from} -> ${edge.to}`;
    container.appendChild(arrowLabel);
  });

  // Held locks list
  if (data.heldLocks.length > 0) {
    const heldY = nodeY + nodeHeight + 40;
    const heldLabel = document.createElementNS(NS, 'text');
    heldLabel.setAttribute('x', String(margin.left));
    heldLabel.setAttribute('y', String(heldY));
    heldLabel.setAttribute('class', 'anim-held-label');
    heldLabel.setAttribute('fill', '#e6edf3');
    heldLabel.textContent = `Held locks: [${data.heldLocks.map(h => h.className + (h.irqContext ? ' (IRQ)' : '')).join(' -> ')}]`;
    container.appendChild(heldLabel);
  }

  // Cycle detected banner
  if (data.cycleDetected) {
    const bannerY = height - 30;
    const banner = document.createElementNS(NS, 'text');
    banner.setAttribute('x', String(width / 2));
    banner.setAttribute('y', String(bannerY));
    banner.setAttribute('text-anchor', 'middle');
    banner.setAttribute('class', 'anim-cycle-detected');
    banner.setAttribute('fill', '#f85149');
    banner.setAttribute('font-weight', 'bold');
    banner.textContent = 'DEADLOCK DETECTED';
    container.appendChild(banner);
  }

  // Source reference
  const srcY = height - 8;
  const srcText = document.createElementNS(NS, 'text');
  srcText.setAttribute('x', String(width - margin.right));
  srcText.setAttribute('y', String(srcY));
  srcText.setAttribute('text-anchor', 'end');
  srcText.setAttribute('class', 'anim-src-ref');
  srcText.setAttribute('fill', '#484f58');
  srcText.setAttribute('font-size', '9');
  srcText.textContent = data.srcRef;
  container.appendChild(srcText);
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'lock-acquisition-tracking', label: 'Lock Acquisition Tracking (A->B)' },
  { id: 'deadlock-detection', label: 'Deadlock Detection (BFS cycle)' },
  { id: 'irq-safety-check', label: 'IRQ Safety Check' },
];

const lockdepGraph: AnimationModule = {
  config: {
    id: 'lockdep-graph',
    title: 'Lockdep Dependency Graph Visualization',
    skillName: 'lockdep-validation',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'deadlock-detection': return generateDeadlockDetection();
      case 'irq-safety-check': return generateIrqSafetyCheck();
      case 'lock-acquisition-tracking':
      default: return generateLockAcquisitionTracking();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default lockdepGraph;
