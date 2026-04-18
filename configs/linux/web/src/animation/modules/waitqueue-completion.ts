import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface WaiterEntry {
  name: string;
  state: string;
  exclusive: boolean;
}

export interface WaitqueueState {
  phase: 'init' | 'prepare' | 'enqueue' | 'sleeping' | 'wakeup' | 'finish' | 'running';
  waiters: WaiterEntry[];
  wakeSource: string;
  taskStates: Record<string, string>;
  completionDone: number;
  exclusiveCount: number;
  srcRef: string;
}

function cloneState(s: WaitqueueState): WaitqueueState {
  return {
    phase: s.phase,
    waiters: s.waiters.map(w => ({ ...w })),
    wakeSource: s.wakeSource,
    taskStates: { ...s.taskStates },
    completionDone: s.completionDone,
    exclusiveCount: s.exclusiveCount,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: wait-event-wakeup (default)
// Basic wait queue sleep/wakeup cycle with prepare_to_wait_event / schedule / wake_up
// ---------------------------------------------------------------------------
function generateWaitEventWakeup(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: WaitqueueState = {
    phase: 'init',
    waiters: [],
    wakeSource: '',
    taskStates: { TaskA: 'TASK_RUNNING' },
    completionDone: 0,
    exclusiveCount: 0,
    srcRef: '',
  };

  // Frame 0: Initialize wait queue head
  state.srcRef = 'kernel/sched/wait.c:9 (__init_waitqueue_head)';
  frames.push({
    step: 0,
    label: 'Initialize wait queue head',
    description: '__init_waitqueue_head() at kernel/sched/wait.c:9 initializes a wait_queue_head_t. It calls spin_lock_init() on wq_head->lock (line 11), sets up lockdep class and name (line 12), and INIT_LIST_HEAD(&wq_head->head) at line 13 to create an empty doubly-linked list. The macro init_waitqueue_head() at include/linux/wait.h:64 wraps this with a static lock_class_key for lockdep.',
    highlights: ['wq-head'],
    data: cloneState(state),
  });

  // Frame 1: init_wait_entry
  state.phase = 'prepare';
  state.srcRef = 'kernel/sched/wait.c:280 (init_wait_entry)';
  frames.push({
    step: 1,
    label: 'init_wait_entry() creates wait entry',
    description: 'init_wait_entry() at kernel/sched/wait.c:280 initializes a wait_queue_entry. It sets wq_entry->flags (line 282), wq_entry->private = current (line 283, storing the task_struct pointer), and wq_entry->func = autoremove_wake_function (line 284), the default callback that wakes the task and removes it from the queue. INIT_LIST_HEAD at line 285 initializes the list node.',
    highlights: ['wait-entry'],
    data: cloneState(state),
  });

  // Frame 2: prepare_to_wait_event
  state.srcRef = 'kernel/sched/wait.c:289 (prepare_to_wait_event)';
  state.waiters.push({ name: 'TaskA', state: 'TASK_INTERRUPTIBLE', exclusive: false });
  state.taskStates['TaskA'] = 'TASK_INTERRUPTIBLE';
  frames.push({
    step: 2,
    label: 'prepare_to_wait_event() adds to queue',
    description: 'prepare_to_wait_event() at kernel/sched/wait.c:289 acquires spin_lock_irqsave(&wq_head->lock) at line 294. It checks signal_pending_state(state, current) at line 295 -- if a signal is pending for TASK_INTERRUPTIBLE, it returns -ERESTARTSYS (line 309). Otherwise at line 311-316, if the entry is not yet on the list, non-exclusive waiters go to the head via __add_wait_queue() (line 315), exclusive ones to the tail. set_current_state(TASK_INTERRUPTIBLE) at line 317 sets the task state with a write memory barrier.',
    highlights: ['wait-entry', 'task-state'],
    data: cloneState(state),
  });

  // Frame 3: Check condition before schedule
  state.srcRef = 'include/linux/wait.h:305-330 (___wait_event macro)';
  frames.push({
    step: 3,
    label: 'Check condition before sleeping',
    description: 'The wait_event() macro at include/linux/wait.h:305-330 wraps the wait loop: for (;;) { prepare_to_wait_event(); if (condition) break; schedule(); }. The condition is checked AFTER setting TASK_INTERRUPTIBLE but BEFORE calling schedule(). This ordering with the memory barrier in set_current_state() ensures no wakeup is lost: if the condition becomes true and wake_up() runs between set_current_state() and the check, the task state prevents it from sleeping.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 4: schedule() -- task sleeps
  state.phase = 'sleeping';
  state.srcRef = 'kernel/sched/core.c:6782 (schedule -> __schedule)';
  frames.push({
    step: 4,
    label: 'schedule() -- task goes to sleep',
    description: 'The condition is false, so schedule() is called at kernel/sched/core.c:6782. Since current->__state is TASK_INTERRUPTIBLE (not TASK_RUNNING), __schedule() at line 6714 dequeues the task from the runqueue via deactivate_task() (line 6752). The task is now off the CPU and will not run until woken up. The scheduler picks the next runnable task via pick_next_task() (line 6760) and performs a context switch.',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 5: Producer calls wake_up
  state.phase = 'wakeup';
  state.wakeSource = 'wake_up()';
  state.srcRef = 'kernel/sched/wait.c:143 (__wake_up)';
  frames.push({
    step: 5,
    label: 'Producer calls wake_up()',
    description: 'Another context (interrupt handler, another task) calls wake_up(wq_head) which expands to __wake_up(wq_head, TASK_NORMAL, 1, NULL) at include/linux/wait.h:221. __wake_up() at kernel/sched/wait.c:143 calls __wake_up_common_lock() at line 118, which acquires spin_lock_irqsave(&wq_head->lock) at line 124 and calls __wake_up_common() at line 125 with nr_exclusive=1.',
    highlights: ['wq-head'],
    data: cloneState(state),
  });

  // Frame 6: __wake_up_common iterates the queue
  state.srcRef = 'kernel/sched/wait.c:92-116 (__wake_up_common)';
  frames.push({
    step: 6,
    label: '__wake_up_common() invokes wake function',
    description: '__wake_up_common() at kernel/sched/wait.c:92 iterates the wait queue via list_for_each_entry_safe_from() at line 104. For each entry, it calls curr->func(curr, mode, wake_flags, key) at line 108 -- which is autoremove_wake_function(). This calls default_wake_function() which invokes try_to_wake_up() to set the task back to TASK_RUNNING and enqueue it on the runqueue. autoremove_wake_function also removes the entry from the wait queue via list_del_init().',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 7: try_to_wake_up makes task runnable
  state.taskStates['TaskA'] = 'TASK_RUNNING';
  state.waiters[0].state = 'TASK_RUNNING';
  state.srcRef = 'kernel/sched/core.c:4193 (try_to_wake_up)';
  frames.push({
    step: 7,
    label: 'try_to_wake_up() restores TASK_RUNNING',
    description: 'try_to_wake_up() at kernel/sched/core.c:4193 is the core wakeup function. It acquires the task rq lock, sets p->__state = TASK_RUNNING, and calls activate_task() to place the task back on the runqueue. If the target task is on a different CPU, an IPI (inter-processor interrupt) is sent via smp_send_reschedule() to trigger rescheduling on that CPU. The woken task will resume execution inside schedule() where it left off.',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 8: finish_wait and condition re-check
  state.phase = 'finish';
  state.waiters = [];
  state.srcRef = 'kernel/sched/wait.c:375 (finish_wait)';
  frames.push({
    step: 8,
    label: 'finish_wait() cleans up, condition true',
    description: 'The task resumes in the wait_event loop. The condition is re-checked and is now true, so the loop breaks. finish_wait() at kernel/sched/wait.c:375 calls __set_current_state(TASK_RUNNING) at line 379 to ensure the task is marked running. If the entry is still on the wait queue (wasn\'t auto-removed), it takes the lock and calls list_del_init() to remove it. The task continues normal execution.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 9: Task continues running
  state.phase = 'running';
  state.wakeSource = '';
  state.srcRef = 'kernel/sched/wait.c:375 (finish_wait completed)';
  frames.push({
    step: 9,
    label: 'Task resumes execution',
    description: 'TaskA is now TASK_RUNNING and removed from the wait queue. The wait_event() macro returns and the caller continues. The complete cycle: init_waitqueue_head() -> prepare_to_wait_event() (kernel/sched/wait.c:289) with TASK_INTERRUPTIBLE -> schedule() sleeps -> wake_up() -> __wake_up_common() (line 92) -> try_to_wake_up() -> finish_wait() (line 375) -> task resumes. The memory barriers in set_current_state() and try_to_wake_up() guarantee no wakeup is lost.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: exclusive-wakeup
// Exclusive vs non-exclusive wakeup (thundering herd prevention)
// ---------------------------------------------------------------------------
function generateExclusiveWakeup(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: WaitqueueState = {
    phase: 'init',
    waiters: [],
    wakeSource: '',
    taskStates: { TaskA: 'TASK_RUNNING', TaskB: 'TASK_RUNNING', TaskC: 'TASK_RUNNING', TaskD: 'TASK_RUNNING' },
    completionDone: 0,
    exclusiveCount: 0,
    srcRef: '',
  };

  // Frame 0: Setup scenario with multiple waiters
  state.srcRef = 'include/linux/wait.h:19 (WQ_FLAG_EXCLUSIVE 0x01)';
  frames.push({
    step: 0,
    label: 'Thundering herd problem setup',
    description: 'Four tasks will wait on the same event (e.g., incoming network connection on a listening socket). Without exclusive wakeup, wake_up() would wake ALL waiters -- the thundering herd problem -- even though only one can handle the event. WQ_FLAG_EXCLUSIVE at include/linux/wait.h:19 (value 0x01) solves this. The wait_queue_head struct at include/linux/wait.h:35-38 contains a spinlock and a doubly-linked list head.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: Non-exclusive waiter added (TaskA)
  state.phase = 'prepare';
  state.waiters.push({ name: 'TaskA', state: 'TASK_INTERRUPTIBLE', exclusive: false });
  state.taskStates['TaskA'] = 'TASK_INTERRUPTIBLE';
  state.srcRef = 'kernel/sched/wait.c:18 (add_wait_queue)';
  frames.push({
    step: 1,
    label: 'TaskA added as non-exclusive waiter',
    description: 'add_wait_queue() at kernel/sched/wait.c:18 adds TaskA without WQ_FLAG_EXCLUSIVE. Line 22 clears the exclusive flag: wq_entry->flags &= ~WQ_FLAG_EXCLUSIVE. It acquires spin_lock_irqsave() at line 23 and calls __add_wait_queue() at line 24, which inserts at the HEAD of the list (after any priority entries). Non-exclusive waiters are always woken by wake_up().',
    highlights: ['wait-entry'],
    data: cloneState(state),
  });

  // Frame 2: Exclusive waiters added (TaskB, TaskC, TaskD)
  state.waiters.push({ name: 'TaskB', state: 'TASK_INTERRUPTIBLE', exclusive: true });
  state.waiters.push({ name: 'TaskC', state: 'TASK_INTERRUPTIBLE', exclusive: true });
  state.waiters.push({ name: 'TaskD', state: 'TASK_INTERRUPTIBLE', exclusive: true });
  state.taskStates['TaskB'] = 'TASK_INTERRUPTIBLE';
  state.taskStates['TaskC'] = 'TASK_INTERRUPTIBLE';
  state.taskStates['TaskD'] = 'TASK_INTERRUPTIBLE';
  state.srcRef = 'kernel/sched/wait.c:29 (add_wait_queue_exclusive)';
  frames.push({
    step: 2,
    label: 'TaskB/C/D added as exclusive waiters',
    description: 'add_wait_queue_exclusive() at kernel/sched/wait.c:29 sets wq_entry->flags |= WQ_FLAG_EXCLUSIVE at line 33. It calls __add_wait_queue_entry_tail() at line 35, inserting at the TAIL of the list. This FIFO ordering ensures exclusive waiters are at the end, after non-exclusive ones. Queue order: [TaskA(non-excl)] -> [TaskB(excl)] -> [TaskC(excl)] -> [TaskD(excl)].',
    highlights: ['wait-entry'],
    data: cloneState(state),
  });

  // Frame 3: All tasks sleep
  state.phase = 'sleeping';
  state.srcRef = 'kernel/sched/core.c:6782 (schedule)';
  frames.push({
    step: 3,
    label: 'All four tasks sleeping',
    description: 'All four tasks call schedule() and go to sleep. They are in TASK_INTERRUPTIBLE state and dequeued from the CPU runqueue. The wait queue now has 4 entries: 1 non-exclusive (TaskA at head) and 3 exclusive (TaskB, TaskC, TaskD at tail). When an event occurs, __wake_up_common() at kernel/sched/wait.c:92 will iterate this list from head to tail.',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 4: wake_up() with nr_exclusive=1
  state.phase = 'wakeup';
  state.wakeSource = 'wake_up()';
  state.exclusiveCount = 1;
  state.srcRef = 'include/linux/wait.h:221 (wake_up -> __wake_up with nr_exclusive=1)';
  frames.push({
    step: 4,
    label: 'wake_up() called -- nr_exclusive=1',
    description: 'wake_up(wq_head) expands to __wake_up(wq_head, TASK_NORMAL, 1, NULL) at include/linux/wait.h:221. The third argument 1 is nr_exclusive: wake at most 1 exclusive waiter. __wake_up() at kernel/sched/wait.c:143 calls __wake_up_common_lock() at line 146, which acquires the queue lock and invokes __wake_up_common() at line 125.',
    highlights: ['wq-head'],
    data: cloneState(state),
  });

  // Frame 5: __wake_up_common iterates -- wakes TaskA (non-excl) + TaskB (first excl)
  state.taskStates['TaskA'] = 'TASK_RUNNING';
  state.taskStates['TaskB'] = 'TASK_RUNNING';
  state.waiters[0].state = 'TASK_RUNNING';
  state.waiters[1].state = 'TASK_RUNNING';
  state.srcRef = 'kernel/sched/wait.c:92-116 (__wake_up_common)';
  frames.push({
    step: 5,
    label: '__wake_up_common() wakes TaskA + TaskB only',
    description: '__wake_up_common() at kernel/sched/wait.c:92 iterates list_for_each_entry_safe_from at line 104. For TaskA: curr->func() returns 1 (success), but flags has no WQ_FLAG_EXCLUSIVE, so the nr_exclusive check at line 111 does not decrement. Loop continues. For TaskB: curr->func() returns 1, flags HAS WQ_FLAG_EXCLUSIVE, so !--nr_exclusive becomes true (1->0) at line 111, and the loop breaks. TaskC and TaskD remain sleeping. Only 2 of 4 tasks woken.',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 6: Compare with wake_up_all
  state.srcRef = 'include/linux/wait.h:223 (wake_up_all -> __wake_up with nr_exclusive=0)';
  frames.push({
    step: 6,
    label: 'Compare: wake_up_all() would wake everyone',
    description: 'wake_up_all() at include/linux/wait.h:223 passes nr_exclusive=0, meaning __wake_up_common() never decrements nr_exclusive (the !--nr_exclusive check at line 111 is 0->-1, which is nonzero, so the loop never breaks on exclusive count). ALL waiters are woken -- the thundering herd. This is why accept() on listening sockets uses exclusive waiters via prepare_to_wait_exclusive() at kernel/sched/wait.c:263 to avoid waking all waiting accept() callers.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 7: TaskC and TaskD still sleeping
  state.phase = 'finish';
  state.srcRef = 'kernel/sched/wait.c:375 (finish_wait for woken tasks)';
  frames.push({
    step: 7,
    label: 'TaskC and TaskD remain asleep',
    description: 'TaskC and TaskD are still in TASK_INTERRUPTIBLE state on the wait queue. They were never iterated by __wake_up_common() because the loop broke after waking TaskB (the first exclusive waiter). finish_wait() at kernel/sched/wait.c:375 runs for TaskA and TaskB, setting them to TASK_RUNNING and removing them from the queue. The queue now contains only [TaskC(excl)] -> [TaskD(excl)].',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 8: Summary of exclusive wakeup semantics
  state.phase = 'running';
  state.waiters = [
    { name: 'TaskC', state: 'TASK_INTERRUPTIBLE', exclusive: true },
    { name: 'TaskD', state: 'TASK_INTERRUPTIBLE', exclusive: true },
  ];
  state.srcRef = 'kernel/sched/wait.c:79-86 (__wake_up_common comment)';
  frames.push({
    step: 8,
    label: 'Exclusive wakeup prevents thundering herd',
    description: 'The comment at kernel/sched/wait.c:79-86 explains: "Non-exclusive wakeups (nr_exclusive == 0) just wake everything up. If it\'s an exclusive wakeup (nr_exclusive == small +ve number) then we wake that number of exclusive tasks, and potentially all the non-exclusive tasks." Queue layout: non-exclusive at head (always woken), exclusive at tail (FIFO, limited by nr_exclusive). This pattern is used in accept(), poll(), and epoll to prevent thundering herd.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: completion-wait
// Completion mechanism for one-shot synchronization
// ---------------------------------------------------------------------------
function generateCompletionWait(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: WaitqueueState = {
    phase: 'init',
    waiters: [],
    wakeSource: '',
    taskStates: { Waiter: 'TASK_RUNNING', Producer: 'TASK_RUNNING' },
    completionDone: 0,
    exclusiveCount: 0,
    srcRef: '',
  };

  // Frame 0: Completion structure
  state.srcRef = 'include/linux/completion.h:26-29 (struct completion)';
  frames.push({
    step: 0,
    label: 'struct completion -- one-shot sync',
    description: 'struct completion at include/linux/completion.h:26-29 contains two fields: unsigned int done (a counter, initially 0) and struct swait_queue_head wait (a simple wait queue). Unlike semaphores, completions default to blocking (done starts at 0). The comment at kernel/sched/completion.c:7-14 explains: completions document synchronization points rather than exclusion, avoiding the priority inversion issues of semaphores.',
    highlights: ['completion'],
    data: cloneState(state),
  });

  // Frame 1: init_completion
  state.srcRef = 'include/linux/completion.h:35-36 (COMPLETION_INITIALIZER) + line 77 (init_completion)';
  frames.push({
    step: 1,
    label: 'init_completion() sets done=0',
    description: 'init_completion() at include/linux/completion.h:77 (or DECLARE_COMPLETION macro at line 52) initializes done=0 and the swait_queue_head. COMPLETION_INITIALIZER at line 35-36 sets {0, __SWAIT_QUEUE_HEAD_INITIALIZER}. The done counter is the key: 0 means "not yet completed." wait_for_completion() will block until done > 0. reinit_completion() at line 93 resets done=0 for reuse.',
    highlights: ['completion'],
    data: cloneState(state),
  });

  // Frame 2: wait_for_completion enters
  state.phase = 'prepare';
  state.taskStates['Waiter'] = 'TASK_UNINTERRUPTIBLE';
  state.waiters.push({ name: 'Waiter', state: 'TASK_UNINTERRUPTIBLE', exclusive: false });
  state.srcRef = 'kernel/sched/completion.c:151 (wait_for_completion)';
  frames.push({
    step: 2,
    label: 'wait_for_completion() blocks waiter',
    description: 'wait_for_completion() at kernel/sched/completion.c:151 calls wait_for_common(x, MAX_SCHEDULE_TIMEOUT, TASK_UNINTERRUPTIBLE) at line 153. This calls __wait_for_common() at line 113 which acquires raw_spin_lock_irq(&x->wait.lock) at line 120 and enters do_wait_for_common() at line 121. Since x->done == 0 (line 89), it enters the wait loop.',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 3: do_wait_for_common loop
  state.phase = 'sleeping';
  state.srcRef = 'kernel/sched/completion.c:85-110 (do_wait_for_common)';
  frames.push({
    step: 3,
    label: 'do_wait_for_common() sleep loop',
    description: 'do_wait_for_common() at kernel/sched/completion.c:85 enters a do-while loop at line 92. It calls __prepare_to_swait() at line 97 to add the task to the simple wait queue, __set_current_state(TASK_UNINTERRUPTIBLE) at line 98, releases the lock via raw_spin_unlock_irq() at line 99, and calls schedule_timeout() at line 100 (the action function). The task sleeps until woken. After waking, it re-acquires the lock at line 101 and checks x->done at line 102.',
    highlights: ['task-state'],
    data: cloneState(state),
  });

  // Frame 4: Producer calls complete()
  state.phase = 'wakeup';
  state.wakeSource = 'complete()';
  state.completionDone = 1;
  state.srcRef = 'kernel/sched/completion.c:50 (complete)';
  frames.push({
    step: 4,
    label: 'Producer calls complete()',
    description: 'The producer calls complete(x) at kernel/sched/completion.c:50, which calls complete_with_flags(x, 0) at line 52. complete_with_flags() at line 21 acquires raw_spin_lock_irqsave(&x->wait.lock) at line 25. It checks x->done != UINT_MAX at line 27 (guard against overflow after complete_all), then increments x->done++ at line 28. swake_up_locked() at line 29 wakes one waiter from the simple wait queue. The done counter is now 1.',
    highlights: ['completion'],
    data: cloneState(state),
  });

  // Frame 5: Waiter wakes and checks done
  state.taskStates['Waiter'] = 'TASK_RUNNING';
  state.waiters[0].state = 'TASK_RUNNING';
  state.srcRef = 'kernel/sched/completion.c:102-109 (do_wait_for_common done check)';
  frames.push({
    step: 5,
    label: 'Waiter wakes, done > 0',
    description: 'The waiter is woken by swake_up_locked(). Back in the do-while loop at kernel/sched/completion.c:102, x->done is now 1, so the loop exits. __finish_swait() at line 103 removes the task from the wait queue. Since x->done != UINT_MAX (line 107), it decrements x->done-- at line 108 (1->0, consuming the completion). The function returns timeout (positive, indicating success).',
    highlights: ['task-state', 'completion'],
    data: cloneState(state),
  });

  // Frame 6: complete_all for multiple waiters
  state.phase = 'finish';
  state.completionDone = 4294967295; // UINT_MAX
  state.srcRef = 'kernel/sched/completion.c:72 (complete_all)';
  frames.push({
    step: 6,
    label: 'complete_all() wakes all waiters',
    description: 'complete_all() at kernel/sched/completion.c:72 sets x->done = UINT_MAX at line 79 (a sentinel value meaning "permanently completed"). It calls swake_up_all_locked() at line 80 to wake ALL waiters, not just one. After complete_all(), any future wait_for_completion() returns immediately because do_wait_for_common() checks x->done at line 89 and finds it non-zero. Note: reinit_completion() must be called before reuse. The done != UINT_MAX check at line 107 skips the decrement.',
    highlights: ['completion'],
    data: cloneState(state),
  });

  // Frame 7: Completion vs semaphore comparison
  state.srcRef = 'kernel/sched/completion.c:7-14 (header comment)';
  frames.push({
    step: 7,
    label: 'Completion vs semaphore semantics',
    description: 'The comment at kernel/sched/completion.c:7-14 explains the key difference: semaphores default to non-blocking (initialized with count > 0 for exclusion), while completions default to blocking (done=0, waiting for a signal). Completions document synchronization intent and avoid priority inversion. complete() wakes ONE waiter (FIFO order). complete_all() wakes ALL and sets done=UINT_MAX for future callers. Common uses: module_init synchronization, firmware loading, device probe ordering.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 8: Waiter continues
  state.phase = 'running';
  state.waiters = [];
  state.wakeSource = '';
  state.completionDone = 0;
  state.srcRef = 'kernel/sched/completion.c:123-127 (__wait_for_common returns)';
  frames.push({
    step: 8,
    label: 'Synchronization complete, task continues',
    description: '__wait_for_common() at kernel/sched/completion.c:123 releases raw_spin_unlock_irq(&x->wait.lock) and calls complete_release() at line 124. wait_for_completion() returns and the waiter continues execution. The full cycle: init_completion() (include/linux/completion.h:77) -> wait_for_completion() (kernel/sched/completion.c:151) -> do_wait_for_common() sleep loop (line 85) -> complete() increments done (line 50) -> waiter wakes and decrements done (line 108) -> returns.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS = [
  { id: 'init', label: 'Init' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'enqueue', label: 'Enqueue' },
  { id: 'sleeping', label: 'Sleep' },
  { id: 'wakeup', label: 'Wakeup' },
  { id: 'finish', label: 'Finish' },
  { id: 'running', label: 'Running' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'init': return 0;
    case 'prepare': return 1;
    case 'enqueue': return 2;
    case 'sleeping': return 3;
    case 'wakeup': return 4;
    case 'finish': return 5;
    case 'running': return 6;
    default: return -1;
  }
}

const STATE_COLORS: Record<string, string> = {
  TASK_RUNNING: '#3fb950',
  TASK_INTERRUPTIBLE: '#d29922',
  TASK_UNINTERRUPTIBLE: '#f85149',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as WaitqueueState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Wait Queues & Completions';
  container.appendChild(title);

  // --- Phase flow diagram ---
  const phaseTop = margin.top + 30;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(90, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(phaseTop));
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
    label.setAttribute('y', String(phaseTop + phaseHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = phase.label;
    container.appendChild(label);

    // Arrow between phases
    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = phaseTop + phaseHeight / 2;
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

  // --- Task states ---
  const taskTop = phaseTop + phaseHeight + 25;
  const taskLabel = document.createElementNS(NS, 'text');
  taskLabel.setAttribute('x', String(margin.left));
  taskLabel.setAttribute('y', String(taskTop));
  taskLabel.setAttribute('class', 'anim-cpu-label');
  taskLabel.textContent = 'Task States:';
  container.appendChild(taskLabel);

  const taskEntries = Object.entries(data.taskStates);
  taskEntries.forEach(([name, taskState], i) => {
    const ty = taskTop + 8 + i * 22;
    const color = STATE_COLORS[taskState] || '#8b949e';

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left));
    rect.setAttribute('y', String(ty));
    rect.setAttribute('width', '240');
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', color);
    rect.setAttribute('opacity', '0.3');
    let cls = 'anim-task-state';
    if (frame.highlights.includes('task-state')) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 6));
    text.setAttribute('y', String(ty + 13));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-task-state');
    text.textContent = `${name}: ${taskState}`;
    container.appendChild(text);
  });

  // --- Wait queue entries ---
  const wqTop = taskTop + 8 + taskEntries.length * 22 + 15;
  const wqLabel = document.createElementNS(NS, 'text');
  wqLabel.setAttribute('x', String(margin.left));
  wqLabel.setAttribute('y', String(wqTop));
  wqLabel.setAttribute('class', 'anim-cpu-label');
  wqLabel.textContent = `Wait Queue (${data.waiters.length} entries):`;
  container.appendChild(wqLabel);

  data.waiters.forEach((waiter, i) => {
    const wy = wqTop + 8 + i * 24;
    const isExcl = waiter.exclusive;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left + 10));
    rect.setAttribute('y', String(wy));
    rect.setAttribute('width', '260');
    rect.setAttribute('height', '20');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', isExcl ? '#1f4068' : '#1a3a1a');
    rect.setAttribute('opacity', '0.8');
    let waiterCls = 'anim-waiter';
    if (frame.highlights.includes('wait-entry')) waiterCls += ' anim-highlight';
    rect.setAttribute('class', waiterCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 16));
    text.setAttribute('y', String(wy + 14));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-waiter');
    text.textContent = `${waiter.name} [${waiter.state}]${isExcl ? ' (EXCLUSIVE)' : ''}`;
    container.appendChild(text);
  });

  // --- Completion done counter ---
  const compTop = wqTop + 8 + data.waiters.length * 24 + 15;
  const compRect = document.createElementNS(NS, 'rect');
  compRect.setAttribute('x', String(width - margin.right - 200));
  compRect.setAttribute('y', String(phaseTop + phaseHeight + 25));
  compRect.setAttribute('width', '190');
  compRect.setAttribute('height', '24');
  compRect.setAttribute('rx', '4');
  compRect.setAttribute('fill', data.completionDone > 0 ? '#238636' : '#21262d');
  let compCls = 'anim-completion';
  if (frame.highlights.includes('completion')) compCls += ' anim-highlight';
  compRect.setAttribute('class', compCls);
  container.appendChild(compRect);

  const compText = document.createElementNS(NS, 'text');
  compText.setAttribute('x', String(width - margin.right - 105));
  compText.setAttribute('y', String(phaseTop + phaseHeight + 42));
  compText.setAttribute('text-anchor', 'middle');
  compText.setAttribute('fill', '#e6edf3');
  compText.setAttribute('font-size', '11');
  compText.setAttribute('class', 'anim-completion');
  const doneDisplay = data.completionDone === 4294967295 ? 'UINT_MAX' : String(data.completionDone);
  compText.textContent = `completion.done = ${doneDisplay}`;
  container.appendChild(compText);

  // --- Wake source ---
  if (data.wakeSource) {
    const wsText = document.createElementNS(NS, 'text');
    wsText.setAttribute('x', String(width - margin.right - 105));
    wsText.setAttribute('y', String(phaseTop + phaseHeight + 68));
    wsText.setAttribute('text-anchor', 'middle');
    wsText.setAttribute('fill', '#58a6ff');
    wsText.setAttribute('font-size', '11');
    wsText.setAttribute('class', 'anim-cpu-label');
    wsText.textContent = `Wake source: ${data.wakeSource}`;
    container.appendChild(wsText);
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'wait-event-wakeup', label: 'Wait Event Sleep/Wakeup' },
  { id: 'exclusive-wakeup', label: 'Exclusive Wakeup (Thundering Herd)' },
  { id: 'completion-wait', label: 'Completion Mechanism' },
];

const waitqueueCompletion: AnimationModule = {
  config: {
    id: 'waitqueue-completion',
    title: 'Wait Queues & Completions',
    skillName: 'waitqueue-and-completion',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'exclusive-wakeup': return generateExclusiveWakeup();
      case 'completion-wait': return generateCompletionWait();
      case 'wait-event-wakeup':
      default: return generateWaitEventWakeup();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default waitqueueCompletion;
