import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface RcuCpu {
  id: number;
  inReadSide: boolean;
  passedQS: boolean;
  state: 'running' | 'idle' | 'context-switch' | 'usermode';
  currentTask: string;
}

export interface RcuNode {
  id: string;
  level: number;
  qsmask: number;
  children: string[];
  state: 'waiting' | 'partial' | 'complete';
}

export interface RcuCallback {
  id: string;
  label: string;
  state: 'pending' | 'waiting-gp' | 'ready' | 'invoked';
}

export interface RcuState {
  cpus: RcuCpu[];
  nodeTree: RcuNode[];
  callbacks: RcuCallback[];
  gracePeriodNum: number;
  phase: 'idle' | 'gp-start' | 'waiting-qs' | 'propagating' | 'gp-complete' | 'invoking-callbacks';
  dataPointer: { old: string; new: string; current: 'old' | 'new' };
  srcRef: string;
}

function cloneState(s: RcuState): RcuState {
  return {
    cpus: s.cpus.map(c => ({ ...c })),
    nodeTree: s.nodeTree.map(n => ({ ...n, children: [...n.children] })),
    callbacks: s.callbacks.map(cb => ({ ...cb })),
    gracePeriodNum: s.gracePeriodNum,
    phase: s.phase,
    dataPointer: { ...s.dataPointer },
    srcRef: s.srcRef,
  };
}

function makeDefaultTree(): RcuNode[] {
  return [
    { id: 'root', level: 0, qsmask: 0b11, children: ['node-L', 'node-R'], state: 'waiting' },
    { id: 'node-L', level: 1, qsmask: 0b11, children: ['cpu-0', 'cpu-1'], state: 'waiting' },
    { id: 'node-R', level: 1, qsmask: 0b11, children: ['cpu-2', 'cpu-3'], state: 'waiting' },
  ];
}

function make4Cpus(): RcuCpu[] {
  return [
    { id: 0, inReadSide: false, passedQS: false, state: 'running', currentTask: 'task-A' },
    { id: 1, inReadSide: false, passedQS: false, state: 'running', currentTask: 'task-B' },
    { id: 2, inReadSide: false, passedQS: false, state: 'running', currentTask: 'task-C' },
    { id: 3, inReadSide: false, passedQS: false, state: 'running', currentTask: 'task-D' },
  ];
}

// ---------------------------------------------------------------------------
// Scenario 1: grace-period-basic
// Traces the full grace period lifecycle through kernel/rcu/tree.c
// ---------------------------------------------------------------------------
function generateGracePeriodBasic(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RcuState = {
    cpus: make4Cpus(),
    nodeTree: makeDefaultTree(),
    callbacks: [],
    gracePeriodNum: 0,
    phase: 'idle',
    dataPointer: { old: 'struct foo v1', new: 'struct foo v2', current: 'old' },
    srcRef: '',
  };

  // Frame 0: initial state -- rcu_node hierarchy from tree.h
  state.srcRef = 'kernel/rcu/tree.h:41 struct rcu_node; tree.h:48 qsmask';
  frames.push({
    step: 0,
    label: 'System idle -- 4 CPUs, rcu_node hierarchy initialized',
    description: 'Four CPUs are running tasks. The RCU subsystem maintains a hierarchy of rcu_node structures (tree.h:41) where each node tracks outstanding quiescent states via its qsmask field (tree.h:48). Per-CPU rcu_data structures (tree.h:189) link each CPU to its leaf rcu_node. This hierarchy allows RCU to scale to thousands of CPUs by aggregating QS reports level by level.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: writer publishes new data via rcu_assign_pointer()
  state.dataPointer.current = 'new';
  state.srcRef = 'include/linux/rcupdate.h:570 rcu_assign_pointer()';
  frames.push({
    step: 1,
    label: 'Writer calls rcu_assign_pointer()',
    description: 'A writer publishes new data with rcu_assign_pointer() (rcupdate.h:570), which expands to smp_store_release() -- a write memory barrier followed by a store. New readers will see the updated pointer. Existing readers may still hold the old pointer, which is safe because RCU guarantees the old data survives until the grace period ends.',
    highlights: ['data-ptr'],
    data: cloneState(state),
  });

  // Frame 2: call_rcu() registers a callback -- tree.c:3249
  state.callbacks.push({ id: 'cb-free-old', label: 'kfree_rcu(old)', state: 'pending' });
  state.phase = 'gp-start';
  state.gracePeriodNum = 1;
  state.srcRef = 'kernel/rcu/tree.c:3249 call_rcu()';
  frames.push({
    step: 2,
    label: 'Writer calls call_rcu() to free old data',
    description: 'call_rcu() (tree.c:3249) enqueues a callback onto the per-CPU rcu_data.cblist segmented callback list (tree.h:210). The callback is non-blocking -- the writer returns immediately. When enough callbacks accumulate or the rcuog kthread notices pending work, rcu_gp_kthread() (tree.c:2271) is woken to start a new grace period.',
    highlights: ['cb-free-old'],
    data: cloneState(state),
  });

  // Frame 3: rcu_gp_init() initializes the qsmask tree -- tree.c:1804
  state.phase = 'waiting-qs';
  state.callbacks[0].state = 'waiting-gp';
  state.srcRef = 'kernel/rcu/tree.c:1804 rcu_gp_init(); tree.c:2271 rcu_gp_kthread()';
  frames.push({
    step: 3,
    label: 'Grace period #1 starts -- rcu_gp_init() sets qsmask tree',
    description: 'rcu_gp_kthread() (tree.c:2271) calls rcu_gp_init() (tree.c:1804) which walks the rcu_node tree and initializes each node\'s qsmask from qsmaskinit (tree.h:55). Each leaf rcu_node gets a bitmask of its online CPUs that must report a quiescent state. The root qsmask=0b11 (both children pending), each leaf qsmask=0b11 (both CPUs pending). The grace period cannot end until all bits are cleared.',
    highlights: ['root', 'node-L', 'node-R'],
    data: cloneState(state),
  });

  // Frame 4: CPU 0 context-switches, reports QS via rcu_note_context_switch()
  state.cpus[0].passedQS = true;
  state.cpus[0].state = 'context-switch';
  state.nodeTree[1].qsmask = 0b10; // node-L: CPU 0 cleared, CPU 1 pending
  state.nodeTree[1].state = 'partial';
  state.srcRef = 'kernel/rcu/tree_plugin.h:995 rcu_note_context_switch(); tree.c:2443 rcu_report_qs_rdp()';
  frames.push({
    step: 4,
    label: 'CPU 0 context-switches -- rcu_note_context_switch()',
    description: 'CPU 0 performs a context switch. The scheduler calls rcu_note_context_switch() (tree_plugin.h:995), which detects the quiescent state. Later, rcu_report_qs_rdp() (tree.c:2443) clears CPU 0\'s bit in node-L\'s qsmask (now 0b10). node-L is not fully clear yet -- CPU 1 is still pending.',
    highlights: ['cpu-0', 'node-L'],
    data: cloneState(state),
  });

  // Frame 5: CPU 1 goes idle -- QS reported, node-L propagates up
  state.cpus[1].passedQS = true;
  state.cpus[1].state = 'idle';
  state.nodeTree[1].qsmask = 0b00;
  state.nodeTree[1].state = 'complete';
  state.nodeTree[0].qsmask = 0b10; // root: node-L clear, node-R pending
  state.nodeTree[0].state = 'partial';
  state.phase = 'propagating';
  state.srcRef = 'kernel/rcu/tree.c:2339 rcu_report_qs_rnp(); tree.c:2443 rcu_report_qs_rdp()';
  frames.push({
    step: 5,
    label: 'CPU 1 goes idle -- node-L clears, rcu_report_qs_rnp() propagates',
    description: 'CPU 1 enters idle, triggering a QS report through rcu_report_qs_rdp() (tree.c:2443). node-L qsmask clears to 0b00. rcu_report_qs_rnp() (tree.c:2339) walks up the tree: it acquires the parent rcu_node lock, clears node-L\'s bit in the root qsmask (now 0b10), then releases. This hierarchical propagation is how RCU scales -- each level aggregates, reducing lock contention on the root.',
    highlights: ['cpu-1', 'node-L', 'root'],
    data: cloneState(state),
  });

  // Frame 6: CPU 2 returns to usermode -- QS
  state.cpus[2].passedQS = true;
  state.cpus[2].state = 'usermode';
  state.nodeTree[2].qsmask = 0b10; // node-R: CPU 2 clear, CPU 3 pending
  state.nodeTree[2].state = 'partial';
  state.srcRef = 'kernel/rcu/tree.c:2443 rcu_report_qs_rdp()';
  frames.push({
    step: 6,
    label: 'CPU 2 returns to usermode -- reports QS',
    description: 'CPU 2 returns to userspace. Usermode execution is a quiescent state because no kernel RCU read-side critical section (rcu_read_lock, rcupdate.h:845) can span the user/kernel boundary. rcu_report_qs_rdp() (tree.c:2443) clears CPU 2\'s bit in node-R (now 0b10). One CPU remaining.',
    highlights: ['cpu-2', 'node-R'],
    data: cloneState(state),
  });

  // Frame 7: CPU 3 context-switches -- final QS, root clears
  state.cpus[3].passedQS = true;
  state.cpus[3].state = 'context-switch';
  state.nodeTree[2].qsmask = 0b00;
  state.nodeTree[2].state = 'complete';
  state.nodeTree[0].qsmask = 0b00;
  state.nodeTree[0].state = 'complete';
  state.srcRef = 'kernel/rcu/tree.c:2339 rcu_report_qs_rnp(); tree.c:2271 rcu_gp_kthread()';
  frames.push({
    step: 7,
    label: 'CPU 3 context-switches -- root qsmask clears to 0b00',
    description: 'CPU 3 reports QS. node-R qsmask clears to 0b00. rcu_report_qs_rnp() (tree.c:2339) propagates to root, clearing its last bit. Root qsmask is now 0b00 -- all CPUs have passed through a quiescent state. rcu_gp_kthread() (tree.c:2271) detects the completed root and proceeds to rcu_gp_cleanup() (tree.c:2150).',
    highlights: ['cpu-3', 'node-R', 'root'],
    data: cloneState(state),
  });

  // Frame 8: rcu_gp_cleanup() marks GP complete -- tree.c:2150
  state.phase = 'gp-complete';
  state.callbacks[0].state = 'ready';
  state.srcRef = 'kernel/rcu/tree.c:2150 rcu_gp_cleanup(); tree.c:1322 note_gp_changes()';
  frames.push({
    step: 8,
    label: 'rcu_gp_cleanup() -- grace period #1 complete',
    description: 'rcu_gp_cleanup() (tree.c:2150) finalizes the grace period: it updates the global gp_seq, walks the rcu_node tree to propagate completion, and then note_gp_changes() (tree.c:1322) advances each CPU\'s segmented callback list. Callbacks in the "waiting" segment move to "ready" (done). The fundamental RCU guarantee holds: every CPU passed a quiescent state, so no CPU can still reference the old data.',
    highlights: ['root'],
    data: cloneState(state),
  });

  // Frame 9: rcu_do_batch() invokes callbacks -- tree.c:2540
  state.phase = 'invoking-callbacks';
  state.callbacks[0].state = 'invoked';
  state.srcRef = 'kernel/rcu/tree.c:2835 rcu_core(); tree.c:2540 rcu_do_batch()';
  frames.push({
    step: 9,
    label: 'rcu_core() -> rcu_do_batch() invokes kfree_rcu()',
    description: 'The rcu_core() softirq handler (tree.c:2835) calls rcu_do_batch() (tree.c:2540) which iterates the "done" segment of the per-CPU segcblist and invokes each callback. kfree_rcu() frees the old data structure. On the reader side, rcu_read_lock() (rcupdate.h:845) was just preempt_disable() -- zero atomic operations, zero cache-line bouncing.',
    highlights: ['cb-free-old'],
    data: cloneState(state),
  });

  // Frame 10: summary
  state.srcRef = 'kernel/rcu/tree.c (full grace period path)';
  frames.push({
    step: 10,
    label: 'RCU grace period summary',
    description: 'The full path: call_rcu() (tree.c:3249) enqueues a callback. rcu_gp_kthread() (tree.c:2271) calls rcu_gp_init() (tree.c:1804) to set qsmask bits. Each CPU reports QS through rcu_report_qs_rdp() (tree.c:2443) which propagates via rcu_report_qs_rnp() (tree.c:2339). Once the root clears, rcu_gp_cleanup() (tree.c:2150) finalizes. rcu_core() (tree.c:2835) invokes ready callbacks via rcu_do_batch() (tree.c:2540). Writers never block readers. Readers never block writers.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 2: reader-protection
// Traces rcu_read_lock/unlock from include/linux/rcupdate.h
// ---------------------------------------------------------------------------
function generateReaderProtection(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RcuState = {
    cpus: make4Cpus(),
    nodeTree: makeDefaultTree(),
    callbacks: [],
    gracePeriodNum: 0,
    phase: 'idle',
    dataPointer: { old: 'struct entry v1', new: 'struct entry v2', current: 'old' },
    srcRef: '',
  };

  // Frame 0
  state.srcRef = 'kernel/rcu/tree.h:189 struct rcu_data';
  frames.push({
    step: 0,
    label: 'Setup: reader and writer on separate CPUs',
    description: 'CPU 0 will be an RCU reader. CPU 1 will be the writer. Each CPU has a per-CPU rcu_data structure (tree.h:189) that tracks its quiescent-state reporting and callback list. We will show how rcu_read_lock() (rcupdate.h:845) protects the reader while the writer updates concurrently.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: rcu_read_lock() -- rcupdate.h:845
  state.cpus[0].inReadSide = true;
  state.cpus[0].currentTask = 'reader (rcu_read_lock)';
  state.srcRef = 'include/linux/rcupdate.h:845 rcu_read_lock(); rcupdate.h:101 __rcu_read_lock()';
  frames.push({
    step: 1,
    label: 'CPU 0: rcu_read_lock() -- enters read-side critical section',
    description: 'rcu_read_lock() (rcupdate.h:845) calls __rcu_read_lock() (rcupdate.h:101) which in non-PREEMPT_RCU is simply preempt_disable(). No atomic instructions, no memory barriers, no cache-line bouncing. In PREEMPT_RCU it increments a per-task nesting counter. Either way, the cost is negligible -- this is why RCU readers are essentially free.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 2: rcu_dereference() -- rcupdate.h:752
  state.srcRef = 'include/linux/rcupdate.h:752 rcu_dereference()';
  frames.push({
    step: 2,
    label: 'CPU 0: p = rcu_dereference(gptr)',
    description: 'The reader uses rcu_dereference() (rcupdate.h:752) to load the pointer. On most architectures this compiles to a plain load with a compiler barrier (or smp_load_acquire on Alpha). The reader now holds a reference to v1 data. This pointer remains valid for the duration of the rcu_read_lock()/rcu_read_unlock() critical section.',
    highlights: ['cpu-0', 'data-ptr'],
    data: cloneState(state),
  });

  // Frame 3: writer prepares new version
  state.cpus[1].currentTask = 'writer (preparing v2)';
  state.srcRef = '(userspace allocation -- no specific tree.c line)';
  frames.push({
    step: 3,
    label: 'CPU 1: writer allocates and prepares new data (v2)',
    description: 'The writer allocates a new copy of the data structure and fills it in. The old version (v1) is untouched -- the reader on CPU 0 still safely reads it. This is the "Copy" in Read-Copy-Update. The writer can use any allocation method (kmalloc, kmem_cache_alloc, etc.).',
    highlights: ['cpu-1'],
    data: cloneState(state),
  });

  // Frame 4: rcu_assign_pointer() -- rcupdate.h:570
  state.dataPointer.current = 'new';
  state.cpus[1].currentTask = 'writer (rcu_assign_pointer)';
  state.srcRef = 'include/linux/rcupdate.h:570 rcu_assign_pointer()';
  frames.push({
    step: 4,
    label: 'CPU 1: rcu_assign_pointer() -- publishes v2',
    description: 'rcu_assign_pointer() (rcupdate.h:570) atomically updates the global pointer from v1 to v2 with smp_store_release(). New readers calling rcu_dereference() will see v2. But the reader on CPU 0 already loaded the v1 pointer in step 2 -- it continues reading v1 safely. Both versions coexist in memory.',
    highlights: ['cpu-1', 'data-ptr'],
    data: cloneState(state),
  });

  // Frame 5: call_rcu() -- tree.c:3249
  state.callbacks.push({ id: 'cb-free-v1', label: 'kfree(v1)', state: 'pending' });
  state.phase = 'gp-start';
  state.gracePeriodNum = 1;
  state.cpus[1].currentTask = 'writer (call_rcu)';
  state.srcRef = 'kernel/rcu/tree.c:3249 call_rcu()';
  frames.push({
    step: 5,
    label: 'CPU 1: call_rcu() -- defer freeing v1',
    description: 'The writer cannot free v1 immediately because CPU 0 is still reading it. call_rcu() (tree.c:3249) enqueues a callback onto the per-CPU rcu_data.cblist (tree.h:210). The writer returns immediately -- it is NOT blocked. The callback will fire only after a full grace period ensures no reader can still reference v1.',
    highlights: ['cpu-1', 'cb-free-v1'],
    data: cloneState(state),
  });

  // Frame 6: grace period starts, reader still in critical section
  state.phase = 'waiting-qs';
  state.callbacks[0].state = 'waiting-gp';
  state.srcRef = 'kernel/rcu/tree.c:1804 rcu_gp_init(); tree.h:48 qsmask';
  frames.push({
    step: 6,
    label: 'Grace period starts -- CPU 0 still in rcu_read_lock()',
    description: 'rcu_gp_init() (tree.c:1804) sets qsmask bits in the rcu_node tree (tree.h:48). CPU 0 is still inside its rcu_read_lock()/rcu_read_unlock() critical section -- it has NOT passed a quiescent state. The qsmask tree cannot clear CPU 0\'s bit. v1 is SAFE because the grace period cannot end while any pre-existing reader holds a reference.',
    highlights: ['cpu-0', 'node-L'],
    data: cloneState(state),
  });

  // Frame 7: other CPUs report QS
  state.cpus[1].passedQS = true;
  state.cpus[1].state = 'context-switch';
  state.cpus[2].passedQS = true;
  state.cpus[2].state = 'idle';
  state.cpus[3].passedQS = true;
  state.cpus[3].state = 'usermode';
  state.nodeTree[1].qsmask = 0b01; // node-L: CPU 1 clear, CPU 0 still pending
  state.nodeTree[1].state = 'partial';
  state.nodeTree[2].qsmask = 0b00; // node-R: both clear
  state.nodeTree[2].state = 'complete';
  state.nodeTree[0].qsmask = 0b01; // root: node-R clear, node-L pending
  state.nodeTree[0].state = 'partial';
  state.phase = 'propagating';
  state.srcRef = 'kernel/rcu/tree.c:2339 rcu_report_qs_rnp(); tree.c:2443 rcu_report_qs_rdp()';
  frames.push({
    step: 7,
    label: 'CPUs 1-3 pass QS -- CPU 0 blocks grace period',
    description: 'CPUs 1-3 report quiescent states through rcu_report_qs_rdp() (tree.c:2443). node-R fully clears and rcu_report_qs_rnp() (tree.c:2339) propagates to the root. But node-L still has bit 0 set (CPU 0 is inside rcu_read_lock). The grace period CANNOT end. v1 remains allocated. This is the RCU guarantee: old data survives as long as any pre-existing reader needs it.',
    highlights: ['cpu-1', 'cpu-2', 'cpu-3', 'node-L'],
    data: cloneState(state),
  });

  // Frame 8: rcu_read_unlock() -- rcupdate.h:876
  state.cpus[0].inReadSide = false;
  state.cpus[0].currentTask = 'task-A';
  state.cpus[0].state = 'context-switch';
  state.srcRef = 'include/linux/rcupdate.h:876 rcu_read_unlock()';
  frames.push({
    step: 8,
    label: 'CPU 0: rcu_read_unlock() -- reader exits critical section',
    description: 'rcu_read_unlock() (rcupdate.h:876) calls __rcu_read_unlock() (rcupdate.h:106) which is preempt_enable() in non-PREEMPT_RCU. The reader has finished with v1. On the next context switch, rcu_note_context_switch() (tree_plugin.h:995) will notice CPU 0 passed a quiescent state. Note: rcu_read_unlock() itself does NOT report QS -- the scheduler does.',
    highlights: ['cpu-0'],
    data: cloneState(state),
  });

  // Frame 9: CPU 0 reports QS, GP completes
  state.cpus[0].passedQS = true;
  state.nodeTree[1].qsmask = 0b00;
  state.nodeTree[1].state = 'complete';
  state.nodeTree[0].qsmask = 0b00;
  state.nodeTree[0].state = 'complete';
  state.phase = 'gp-complete';
  state.callbacks[0].state = 'ready';
  state.srcRef = 'kernel/rcu/tree.c:2150 rcu_gp_cleanup(); tree.c:1322 note_gp_changes()';
  frames.push({
    step: 9,
    label: 'CPU 0 reports QS -- rcu_gp_cleanup() completes GP',
    description: 'CPU 0 context-switches; rcu_note_context_switch() (tree_plugin.h:995) triggers rcu_report_qs_rdp() (tree.c:2443). node-L clears, rcu_report_qs_rnp() (tree.c:2339) clears root. rcu_gp_cleanup() (tree.c:2150) finalizes the grace period. note_gp_changes() (tree.c:1322) advances the segcblist. Since ALL pre-existing readers have finished, it is now safe to free v1.',
    highlights: ['cpu-0', 'node-L', 'root'],
    data: cloneState(state),
  });

  // Frame 10: callback invoked via rcu_do_batch()
  state.phase = 'invoking-callbacks';
  state.callbacks[0].state = 'invoked';
  state.srcRef = 'kernel/rcu/tree.c:2835 rcu_core(); tree.c:2540 rcu_do_batch()';
  frames.push({
    step: 10,
    label: 'v1 freed safely -- rcu_do_batch() invokes kfree()',
    description: 'rcu_core() (tree.c:2835) triggers rcu_do_batch() (tree.c:2540) which invokes kfree(v1). The old data is reclaimed. The reader on CPU 0 was never blocked, never took a lock, never executed an atomic instruction (rcu_read_lock is preempt_disable at rcupdate.h:845). The writer was never blocked either. Both proceeded at full speed. This is the power of RCU.',
    highlights: ['cb-free-v1'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 3: callback-batching
// Traces the segcblist and rcu_do_batch() batching from tree.c
// ---------------------------------------------------------------------------
function generateCallbackBatching(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RcuState = {
    cpus: make4Cpus(),
    nodeTree: makeDefaultTree(),
    callbacks: [],
    gracePeriodNum: 0,
    phase: 'idle',
    dataPointer: { old: 'data-A', new: 'data-B', current: 'old' },
    srcRef: '',
  };

  // Frame 0
  state.srcRef = 'kernel/rcu/tree.h:210 rcu_data.cblist (rcu_segcblist)';
  frames.push({
    step: 0,
    label: 'Multiple writers will queue callbacks',
    description: 'RCU batches callbacks to amortize grace period cost. The per-CPU rcu_data.cblist (tree.h:210) is a segmented callback list (rcu_segcblist) with segments: done, wait, next-ready, next. call_rcu() (tree.c:3249) appends to "next". When a GP starts, "next" callbacks advance to "wait". When the GP ends, "wait" becomes "done". rcu_do_batch() (tree.c:2540) invokes "done" callbacks.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: first call_rcu -- tree.c:3249
  state.callbacks.push({ id: 'cb-1', label: 'kfree(obj-A)', state: 'pending' });
  state.srcRef = 'kernel/rcu/tree.c:3249 call_rcu()';
  frames.push({
    step: 1,
    label: 'call_rcu(cb1) -- first callback queued',
    description: 'The first call_rcu() (tree.c:3249) appends a callback to the "next" segment of the per-CPU rcu_data.cblist (tree.h:210). No grace period is running yet. The callback sits in the pending state until rcu_gp_kthread() (tree.c:2271) starts a new grace period.',
    highlights: ['cb-1'],
    data: cloneState(state),
  });

  // Frame 2: second call_rcu
  state.callbacks.push({ id: 'cb-2', label: 'kfree(obj-B)', state: 'pending' });
  state.srcRef = 'kernel/rcu/tree.c:3249 call_rcu()';
  frames.push({
    step: 2,
    label: 'call_rcu(cb2) -- second callback queued',
    description: 'Another call_rcu() (tree.c:3249) appends to the same "next" segment. Both callbacks are pending. RCU\'s batching means both will be satisfied by a single grace period rather than requiring separate ones -- a critical optimization for high-throughput workloads.',
    highlights: ['cb-2'],
    data: cloneState(state),
  });

  // Frame 3: third call_rcu
  state.callbacks.push({ id: 'cb-3', label: 'free_netdev(dev)', state: 'pending' });
  state.srcRef = 'kernel/rcu/tree.c:3249 call_rcu()';
  frames.push({
    step: 3,
    label: 'call_rcu(cb3) -- third callback queued',
    description: 'A third callback from the networking subsystem queued via call_rcu() (tree.c:3249). In a busy system, thousands of callbacks can accumulate. The kernel tunes grace period frequency to balance memory pressure (too many pending callbacks) against overhead. rcu_do_batch() (tree.c:2540) limits invocations per batch to avoid excessive softirq time.',
    highlights: ['cb-3'],
    data: cloneState(state),
  });

  // Frame 4: GP starts -- rcu_gp_init() advances segcblist
  state.phase = 'gp-start';
  state.gracePeriodNum = 1;
  state.callbacks.forEach(cb => cb.state = 'waiting-gp');
  state.srcRef = 'kernel/rcu/tree.c:1804 rcu_gp_init(); tree.c:1322 note_gp_changes()';
  frames.push({
    step: 4,
    label: 'GP #1 starts -- rcu_gp_init() advances segcblist',
    description: 'rcu_gp_kthread() (tree.c:2271) calls rcu_gp_init() (tree.c:1804) to start grace period #1. note_gp_changes() (tree.c:1322) advances each CPU\'s segcblist: "next" callbacks move to the "wait" segment, associated with this GP. If new call_rcu() calls arrive, those go to a fresh "next" segment for the NEXT grace period.',
    highlights: ['cb-1', 'cb-2', 'cb-3'],
    data: cloneState(state),
  });

  // Frame 5: new callback arrives mid-GP
  state.phase = 'waiting-qs';
  state.callbacks.push({ id: 'cb-4', label: 'kfree(obj-C)', state: 'pending' });
  state.srcRef = 'kernel/rcu/tree.c:3249 call_rcu() (during active GP)';
  frames.push({
    step: 5,
    label: 'New call_rcu(cb4) arrives during grace period',
    description: 'A fourth callback arrives via call_rcu() (tree.c:3249) while GP #1 is running. It goes to the "next" segment, NOT the "wait" segment. cb4 must wait for GP #2 -- it cannot batch with cb1-3 because pre-existing readers at GP #1 start might not have seen the update cb4 protects. The segcblist design (tree.h:210) enforces this separation.',
    highlights: ['cb-4'],
    data: cloneState(state),
  });

  // Frame 6: all CPUs pass QS -- rcu_gp_fqs() may force
  state.cpus.forEach(c => { c.passedQS = true; c.state = 'context-switch'; });
  state.nodeTree.forEach(n => { n.qsmask = 0b00; n.state = 'complete'; });
  state.phase = 'propagating';
  state.srcRef = 'kernel/rcu/tree.c:2028 rcu_gp_fqs(); tree.c:2339 rcu_report_qs_rnp()';
  frames.push({
    step: 6,
    label: 'All CPUs pass quiescent states',
    description: 'All four CPUs pass through quiescent states. If any CPU is slow, rcu_gp_fqs() (tree.c:2028) can force quiescent-state detection by sending IPIs or checking dyntick counters. rcu_report_qs_rnp() (tree.c:2339) propagates each report up the tree. The qsmask tree clears completely -- GP #1 detection is complete.',
    highlights: ['cpu-0', 'cpu-1', 'cpu-2', 'cpu-3'],
    data: cloneState(state),
  });

  // Frame 7: rcu_gp_cleanup() -- first 3 callbacks ready
  state.phase = 'gp-complete';
  state.callbacks[0].state = 'ready';
  state.callbacks[1].state = 'ready';
  state.callbacks[2].state = 'ready';
  state.srcRef = 'kernel/rcu/tree.c:2150 rcu_gp_cleanup(); tree.c:1322 note_gp_changes()';
  frames.push({
    step: 7,
    label: 'rcu_gp_cleanup() -- cb1, cb2, cb3 ready',
    description: 'rcu_gp_cleanup() (tree.c:2150) finalizes GP #1. note_gp_changes() (tree.c:1322) advances segcblist: callbacks in "wait" move to "done" (ready). cb1-3 are now invocable. cb4 remains in "next" pending -- it needs its own grace period. The segcblist advancement is: done <- wait <- next-ready <- next.',
    highlights: ['cb-1', 'cb-2', 'cb-3'],
    data: cloneState(state),
  });

  // Frame 8: rcu_do_batch() invokes cb1-3
  state.phase = 'invoking-callbacks';
  state.callbacks[0].state = 'invoked';
  state.callbacks[1].state = 'invoked';
  state.callbacks[2].state = 'invoked';
  state.srcRef = 'kernel/rcu/tree.c:2835 rcu_core(); tree.c:2540 rcu_do_batch()';
  frames.push({
    step: 8,
    label: 'rcu_core() -> rcu_do_batch() invokes cb1-3',
    description: 'rcu_core() (tree.c:2835) calls rcu_do_batch() (tree.c:2540) which iterates the "done" segment, invoking each callback in order. Three objects freed in one batch. Without batching, each would have required a separate grace period -- 3x the overhead. rcu_do_batch() respects a per-batch limit to avoid monopolizing the CPU.',
    highlights: ['cb-1', 'cb-2', 'cb-3'],
    data: cloneState(state),
  });

  // Frame 9: GP #2 starts for cb4
  state.phase = 'gp-start';
  state.gracePeriodNum = 2;
  state.callbacks[3].state = 'waiting-gp';
  state.cpus.forEach(c => { c.passedQS = false; c.state = 'running'; });
  state.nodeTree = makeDefaultTree();
  state.srcRef = 'kernel/rcu/tree.c:1804 rcu_gp_init(); tree.c:2271 rcu_gp_kthread()';
  frames.push({
    step: 9,
    label: 'GP #2 starts -- rcu_gp_init() reinitializes qsmask tree',
    description: 'rcu_gp_kthread() (tree.c:2271) starts GP #2 immediately since cb4 is pending. rcu_gp_init() (tree.c:1804) reinitializes the qsmask tree from each rcu_node\'s qsmaskinit (tree.h:55). The cycle repeats. In practice, the kernel starts a new GP immediately when callbacks are pending, minimizing memory accumulation.',
    highlights: ['cb-4'],
    data: cloneState(state),
  });

  // Frame 10: GP #2 completes quickly
  state.cpus.forEach(c => { c.passedQS = true; c.state = 'idle'; });
  state.nodeTree.forEach(n => { n.qsmask = 0b00; n.state = 'complete'; });
  state.phase = 'gp-complete';
  state.callbacks[3].state = 'ready';
  state.srcRef = 'kernel/rcu/tree.c:2150 rcu_gp_cleanup()';
  frames.push({
    step: 10,
    label: 'GP #2 complete -- rcu_gp_cleanup() readies cb4',
    description: 'All CPUs pass QS. rcu_gp_cleanup() (tree.c:2150) completes GP #2. cb4 moves from "wait" to "done" (ready). note_gp_changes() (tree.c:1322) handles the segcblist advancement.',
    highlights: ['cb-4'],
    data: cloneState(state),
  });

  // Frame 11: cb4 invoked
  state.phase = 'invoking-callbacks';
  state.callbacks[3].state = 'invoked';
  state.srcRef = 'kernel/rcu/tree.c:2540 rcu_do_batch()';
  frames.push({
    step: 11,
    label: 'rcu_do_batch() invokes cb4 -- all callbacks complete',
    description: 'rcu_do_batch() (tree.c:2540) invokes cb4. All four callbacks processed across two grace periods. The segcblist batching reduced grace periods from 4 (one per callback) to 2. In real workloads with thousands of callbacks per second, this optimization is critical for RCU scalability.',
    highlights: ['cb-4'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const CPU_COLORS: Record<string, string> = {
  running: '#3fb950',
  idle: '#484f58',
  'context-switch': '#d29922',
  usermode: '#58a6ff',
};

const NODE_COLORS: Record<string, string> = {
  waiting: '#f85149',
  partial: '#d29922',
  complete: '#3fb950',
};

const CB_COLORS: Record<string, string> = {
  pending: '#6e7681',
  'waiting-gp': '#d29922',
  ready: '#3fb950',
  invoked: '#484f58',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as RcuState;
  const margin = { top: 10, left: 10, right: 10, bottom: 10 };

  // -- Phase label and GP number --
  const phaseText = document.createElementNS(NS, 'text');
  phaseText.setAttribute('x', String(width / 2));
  phaseText.setAttribute('y', '16');
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.setAttribute('class', 'anim-rcu-phase anim-title');
  phaseText.textContent = `GP #${data.gracePeriodNum}  |  Phase: ${data.phase}`;
  container.appendChild(phaseText);

  // Layout regions
  const topY = 30; // data pointers
  const treeTopY = 100; // qsmask tree
  const cpuTopY = height - 100; // CPU boxes
  const cbX = width - 170; // callback queue right side

  // -- Data pointer visualization (top) --
  const ptrBoxW = 120;
  const ptrBoxH = 30;
  const oldX = margin.left + 40;
  const newX = oldX + ptrBoxW + 60;

  // Old data box
  const oldRect = document.createElementNS(NS, 'rect');
  oldRect.setAttribute('x', String(oldX));
  oldRect.setAttribute('y', String(topY));
  oldRect.setAttribute('width', String(ptrBoxW));
  oldRect.setAttribute('height', String(ptrBoxH));
  oldRect.setAttribute('rx', '4');
  oldRect.setAttribute('fill', data.dataPointer.current === 'old' ? '#3fb950' : '#484f58');
  oldRect.setAttribute('class', 'anim-rcu-pointer');
  container.appendChild(oldRect);

  const oldLabel = document.createElementNS(NS, 'text');
  oldLabel.setAttribute('x', String(oldX + ptrBoxW / 2));
  oldLabel.setAttribute('y', String(topY + 20));
  oldLabel.setAttribute('text-anchor', 'middle');
  oldLabel.setAttribute('class', 'anim-rcu-pointer anim-cpu-label');
  oldLabel.textContent = data.dataPointer.old;
  container.appendChild(oldLabel);

  // New data box
  const newRect = document.createElementNS(NS, 'rect');
  newRect.setAttribute('x', String(newX));
  newRect.setAttribute('y', String(topY));
  newRect.setAttribute('width', String(ptrBoxW));
  newRect.setAttribute('height', String(ptrBoxH));
  newRect.setAttribute('rx', '4');
  newRect.setAttribute('fill', data.dataPointer.current === 'new' ? '#3fb950' : '#30363d');
  newRect.setAttribute('class', 'anim-rcu-pointer');
  container.appendChild(newRect);

  const newLabel = document.createElementNS(NS, 'text');
  newLabel.setAttribute('x', String(newX + ptrBoxW / 2));
  newLabel.setAttribute('y', String(topY + 20));
  newLabel.setAttribute('text-anchor', 'middle');
  newLabel.setAttribute('class', 'anim-rcu-pointer anim-cpu-label');
  newLabel.textContent = data.dataPointer.new;
  container.appendChild(newLabel);

  // Pointer arrow label
  const arrowLabel = document.createElementNS(NS, 'text');
  arrowLabel.setAttribute('x', String(oldX + ptrBoxW + 30));
  arrowLabel.setAttribute('y', String(topY - 4));
  arrowLabel.setAttribute('text-anchor', 'middle');
  arrowLabel.setAttribute('class', 'anim-cpu-label');
  arrowLabel.textContent = data.dataPointer.current === 'new' ? 'ptr -> new' : 'ptr -> old';
  container.appendChild(arrowLabel);

  // -- Source reference label --
  if (data.srcRef) {
    const srcText = document.createElementNS(NS, 'text');
    srcText.setAttribute('x', String(margin.left));
    srcText.setAttribute('y', String(topY + ptrBoxH + 20));
    srcText.setAttribute('class', 'anim-rcu-srcref anim-cpu-label');
    srcText.textContent = data.srcRef;
    container.appendChild(srcText);
  }

  // -- qsmask tree (center) --
  const treeNodes = data.nodeTree;
  const nodeW = 80;
  const nodeH = 30;
  const levelGap = 45;

  treeNodes.forEach(node => {
    let nx: number, ny: number;
    if (node.level === 0) {
      // root
      nx = (cbX - margin.left) / 2 - nodeW / 2 + margin.left;
      ny = treeTopY;
    } else {
      // leaves
      const idx = node.id === 'node-L' ? 0 : 1;
      const areaW = cbX - margin.left;
      nx = margin.left + areaW * (idx + 0.5) / 2 - nodeW / 2;
      ny = treeTopY + levelGap;
    }

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(nx));
    rect.setAttribute('y', String(ny));
    rect.setAttribute('width', String(nodeW));
    rect.setAttribute('height', String(nodeH));
    rect.setAttribute('rx', '5');
    rect.setAttribute('fill', NODE_COLORS[node.state]);
    let cls = 'anim-rcu-node anim-block';
    if (frame.highlights.includes(node.id)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(nx + nodeW / 2));
    label.setAttribute('y', String(ny + 14));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = node.id;
    container.appendChild(label);

    const maskLabel = document.createElementNS(NS, 'text');
    maskLabel.setAttribute('x', String(nx + nodeW / 2));
    maskLabel.setAttribute('y', String(ny + 26));
    maskLabel.setAttribute('text-anchor', 'middle');
    maskLabel.setAttribute('class', 'anim-cpu-label');
    maskLabel.textContent = `qsmask: 0b${node.qsmask.toString(2).padStart(2, '0')}`;
    container.appendChild(maskLabel);
  });

  // -- CPU boxes (bottom) --
  const cpuAreaW = cbX - margin.left - 20;
  const cpuW = Math.min(110, (cpuAreaW - 15) / data.cpus.length);
  const cpuH = 55;

  data.cpus.forEach((cpu, i) => {
    const cx = margin.left + i * (cpuW + 5);
    const cy = cpuTopY;
    const color = CPU_COLORS[cpu.state];

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(cx));
    rect.setAttribute('y', String(cy));
    rect.setAttribute('width', String(cpuW));
    rect.setAttribute('height', String(cpuH));
    rect.setAttribute('rx', '5');
    rect.setAttribute('fill', color);
    let cls = 'anim-cpu';
    if (frame.highlights.includes(`cpu-${cpu.id}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // CPU label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(cx + cpuW / 2));
    label.setAttribute('y', String(cy + 14));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = `CPU ${cpu.id}`;
    container.appendChild(label);

    // State
    const stText = document.createElementNS(NS, 'text');
    stText.setAttribute('x', String(cx + cpuW / 2));
    stText.setAttribute('y', String(cy + 30));
    stText.setAttribute('text-anchor', 'middle');
    stText.setAttribute('class', 'anim-cpu-label');
    stText.textContent = cpu.state;
    container.appendChild(stText);

    // QS / RCU-read indicator
    const indicator = document.createElementNS(NS, 'text');
    indicator.setAttribute('x', String(cx + cpuW / 2));
    indicator.setAttribute('y', String(cy + 46));
    indicator.setAttribute('text-anchor', 'middle');
    indicator.setAttribute('class', 'anim-cpu-label');
    if (cpu.inReadSide) {
      indicator.textContent = 'RCU-READ';
    } else if (cpu.passedQS) {
      indicator.textContent = 'QS';
    } else {
      indicator.textContent = '';
    }
    container.appendChild(indicator);
  });

  // -- Callback queue (right side) --
  if (data.callbacks.length > 0) {
    const cbLabelText = document.createElementNS(NS, 'text');
    cbLabelText.setAttribute('x', String(cbX + 10));
    cbLabelText.setAttribute('y', String(treeTopY - 4));
    cbLabelText.setAttribute('class', 'anim-cpu-label');
    cbLabelText.textContent = 'Callbacks';
    container.appendChild(cbLabelText);

    data.callbacks.forEach((cb, i) => {
      const cy = treeTopY + 6 + i * 34;
      const cbW = 150;
      const cbH = 28;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(cbX));
      rect.setAttribute('y', String(cy));
      rect.setAttribute('width', String(cbW));
      rect.setAttribute('height', String(cbH));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', CB_COLORS[cb.state]);
      let cls = 'anim-rcu-callback';
      if (frame.highlights.includes(cb.id)) cls += ' anim-highlight';
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      const cbText = document.createElementNS(NS, 'text');
      cbText.setAttribute('x', String(cbX + cbW / 2));
      cbText.setAttribute('y', String(cy + 14));
      cbText.setAttribute('text-anchor', 'middle');
      cbText.setAttribute('class', 'anim-cpu-label');
      cbText.textContent = cb.label;
      container.appendChild(cbText);

      const stateText = document.createElementNS(NS, 'text');
      stateText.setAttribute('x', String(cbX + cbW / 2));
      stateText.setAttribute('y', String(cy + 25));
      stateText.setAttribute('text-anchor', 'middle');
      stateText.setAttribute('class', 'anim-cpu-label');
      stateText.textContent = cb.state;
      container.appendChild(stateText);
    });
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'grace-period-basic', label: 'Grace Period (4 CPUs)' },
  { id: 'reader-protection', label: 'Reader Protection (Publish-Subscribe)' },
  { id: 'callback-batching', label: 'Callback Batching (segcblist)' },
];

const rcuGracePeriod: AnimationModule = {
  config: {
    id: 'rcu-grace-period',
    title: 'RCU Grace Period Mechanism',
    skillName: 'rcu-fundamentals',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'reader-protection': return generateReaderProtection();
      case 'callback-batching': return generateCallbackBatching();
      case 'grace-period-basic':
      default: return generateGracePeriodBasic();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default rcuGracePeriod;
