import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

/**
 * timer-hrtimer Animation Module
 *
 * Traces the EXACT implementation from kernel/time/timer.c and kernel/time/hrtimer.c:
 *
 * Low-resolution timer wheel (kernel/time/timer.c):
 *   - add_timer() (line 1245) -> __mod_timer() (line 1018) -> internal_add_timer() (line 639)
 *   - calc_wheel_index() (line 541) maps expiry to hierarchical wheel level and bucket
 *   - enqueue_timer() (line 612) inserts into hash bucket and sets pending_map bit
 *   - run_timer_softirq() (line 2400) -> __run_timers() (line 2343) -> expire_timers() (line 1766)
 *
 * High-resolution hrtimer (kernel/time/hrtimer.c):
 *   - hrtimer_start_range_ns() (line 1312) -> __hrtimer_start_range_ns() (line 1218)
 *   - enqueue_hrtimer() (line 1086) inserts into timerqueue (rb-tree)
 *   - hrtimer_reprogram() (line 811) -> __hrtimer_reprogram() (line 660) programs hardware
 *   - hrtimer_interrupt() (line 1881) -> __hrtimer_run_queues() (line 1817) -> __run_hrtimer() (line 1742)
 *
 * Nanosleep (kernel/time/hrtimer.c):
 *   - SYSCALL_DEFINE2(nanosleep) (line 2192) -> hrtimer_nanosleep() (line 2162)
 *   - do_nanosleep() (line 2115) -> hrtimer_sleeper_start_expires() + schedule()
 *   - hrtimer_wakeup() (line 2013) callback wakes the sleeping task
 *
 * Key data structures:
 *   struct timer_base (kernel/time/timer.c): per-CPU base with vectors[] hash table, pending_map bitmap
 *   struct timer_list: low-res timer with expires (jiffies), function callback, flags encoding wheel index
 *   struct hrtimer_cpu_base (kernel/time/hrtimer.c): per-CPU base with clock_base[] array
 *   struct hrtimer: high-res timer with ktime expiry, rb-tree node, callback function
 *   Wheel: LVL_BITS=6 -> 64 buckets per level, LVL_DEPTH=8 or 9 levels, LVL_CLK_SHIFT=3
 */

/* ---------- State interface ---------- */

export interface TimerHrtimerState {
  currentFunction: string;
  phase: 'enqueue' | 'wheel-index' | 'expire' | 'softirq' | 'hrtimer-enqueue' | 'hrtimer-reprogram' | 'hrtimer-interrupt' | 'hrtimer-run' | 'nanosleep-entry' | 'nanosleep-sleep' | 'nanosleep-wakeup' | 'return';
  wheelBuckets: Array<{ level: number; index: number; timerName: string; expires: string }>;
  rbTreeNodes: Array<{ timerName: string; expires: string; clockBase: string }>;
  taskState: 'running' | 'sleeping' | 'woken' | 'none';
  nextExpiry: string;
  srcRef: string;
}

/* ---------- Helpers ---------- */

function cloneState(s: TimerHrtimerState): TimerHrtimerState {
  return {
    currentFunction: s.currentFunction,
    phase: s.phase,
    wheelBuckets: s.wheelBuckets.map(b => ({ ...b })),
    rbTreeNodes: s.rbTreeNodes.map(n => ({ ...n })),
    taskState: s.taskState,
    nextExpiry: s.nextExpiry,
    srcRef: s.srcRef,
  };
}

function makeInitialState(): TimerHrtimerState {
  return {
    currentFunction: '',
    phase: 'enqueue',
    wheelBuckets: [],
    rbTreeNodes: [],
    taskState: 'none',
    nextExpiry: '',
    srcRef: '',
  };
}

/* ========================================================================
 * Scenario 1: timer-wheel
 *
 * Traces: add_timer() -> __mod_timer() -> internal_add_timer() ->
 *         calc_wheel_index() maps expiry to wheel level and bucket.
 *         run_timer_softirq() -> __run_timers() -> expire_timers()
 *         fires expired callbacks.
 * ======================================================================== */

function generateTimerWheel(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();

  // Frame 0: add_timer entry
  state.currentFunction = 'add_timer';
  state.phase = 'enqueue';
  state.srcRef = 'kernel/time/timer.c:1245-1250 add_timer(timer) -> WARN_ON_ONCE(timer_pending(timer)) -> __mod_timer(timer, timer->expires, MOD_TIMER_NOTPENDING)';
  frames.push({
    step: 0,
    label: 'add_timer() starts a new low-resolution timer',
    description: 'A kernel subsystem calls add_timer(timer) at kernel/time/timer.c:1245 to start a low-resolution timer. add_timer() first checks WARN_ON_ONCE(timer_pending(timer)) at line 1247 to ensure the timer is not already active. If valid, it delegates to __mod_timer(timer, timer->expires, MOD_TIMER_NOTPENDING) at line 1249. The timer->expires field must be set beforehand as an absolute jiffies value. The timer->function callback will fire from softirq context when the timer expires.',
    highlights: ['add-timer'],
    data: cloneState(state),
  });

  // Frame 1: __mod_timer locks base and calculates wheel index
  state.currentFunction = '__mod_timer';
  state.srcRef = 'kernel/time/timer.c:1018-1069 __mod_timer(): lock_timer_base() -> forward_timer_base() -> calc_wheel_index(expires, clk, &bucket_expiry)';
  frames.push({
    step: 1,
    label: '__mod_timer() locks base and computes wheel position',
    description: '__mod_timer() at kernel/time/timer.c:1018 is the core timer modification function. Since MOD_TIMER_NOTPENDING is set, it takes the else branch at line 1084, calling lock_timer_base(timer, &flags) at line 1085 to acquire the per-CPU timer_base spinlock. It checks timer->function != NULL (line 1091) for shutdown safety. forward_timer_base(base) at line 1094 advances base->clk to keep up with jiffies. Then get_timer_this_cpu_base() at line 1101 determines the target CPU base. timer->expires is set at line 1126.',
    highlights: ['mod-timer-lock'],
    data: cloneState(state),
  });

  // Frame 2: calc_wheel_index determines level and bucket
  state.currentFunction = 'calc_wheel_index';
  state.phase = 'wheel-index';
  state.srcRef = 'kernel/time/timer.c:541-577 calc_wheel_index(): delta = expires - clk, selects level 0-7 based on delta range via LVL_START(n) thresholds';
  frames.push({
    step: 2,
    label: 'calc_wheel_index() maps expiry to hierarchical wheel level',
    description: 'calc_wheel_index() at kernel/time/timer.c:541 computes delta = expires - clk (line 544). The hierarchical timer wheel has 8-9 levels (LVL_DEPTH, line 174), each with 64 buckets (LVL_BITS=6, line 167). Each level has coarser granularity: level 0 covers 1-63 jiffies (1ms at HZ=1000), level 1 covers 64-511 jiffies (8x coarser due to LVL_CLK_SHIFT=3, line 153). The cascade of if/else at lines 547-574 selects the appropriate level via LVL_START(n) thresholds, then calc_index() returns LVL_OFFS(lvl) + (expires & LVL_MASK) as the flat bucket index.',
    highlights: ['calc-wheel-index'],
    data: cloneState(state),
  });

  // Frame 3: internal_add_timer and enqueue_timer
  state.currentFunction = 'internal_add_timer';
  state.phase = 'enqueue';
  state.wheelBuckets.push({ level: 0, index: 12, timerName: 'timer_A', expires: 'jiffies+10' });
  state.srcRef = 'kernel/time/timer.c:639-646 internal_add_timer() -> calc_wheel_index() -> enqueue_timer(base, timer, idx, bucket_expiry)';
  frames.push({
    step: 3,
    label: 'internal_add_timer() enqueues timer into wheel bucket',
    description: 'internal_add_timer() at kernel/time/timer.c:639 calls calc_wheel_index(timer->expires, base->clk, &bucket_expiry) at line 644 to get the flat index, then enqueue_timer() at line 645. enqueue_timer() at line 612 does: hlist_add_head(&timer->entry, base->vectors + idx) at line 616 to insert into the hash bucket, __set_bit(idx, base->pending_map) at line 617 to mark the bucket occupied, timer_set_idx(timer, idx) at line 618 stores the index in timer flags. If bucket_expiry < base->next_expiry (line 627), it updates WRITE_ONCE(base->next_expiry, bucket_expiry) and calls trigger_dyntick_cpu() to wake idle CPUs.',
    highlights: ['enqueue-timer', 'wheel-bucket'],
    data: cloneState(state),
  });

  // Frame 4: Add second timer at different level
  state.currentFunction = '__mod_timer';
  state.wheelBuckets.push({ level: 2, index: 135, timerName: 'timer_B', expires: 'jiffies+5000' });
  state.srcRef = 'kernel/time/timer.c:1133-1136 __mod_timer(): if (idx != UINT_MAX && clk == base->clk) enqueue_timer(); else internal_add_timer(base, timer)';
  frames.push({
    step: 4,
    label: 'Second timer enqueued at wheel level 2 (coarser granularity)',
    description: 'A second timer with expires=jiffies+5000 is added. __mod_timer() at line 1133 checks whether the previously computed idx is still valid (clk unchanged). If base migration occurred (base != new_base, line 1103), the timer flags are updated with the new CPU at line 1118-1119 and forward_timer_base() is called again. The final enqueue at line 1136 calls internal_add_timer(base, timer), which computes calc_wheel_index() yielding level 2 (delta 5000 falls in LVL_START(2)..LVL_START(3) range). Level 2 has granularity of 64 jiffies (LVL_GRAN(2) = 1 << 6 = 64).',
    highlights: ['enqueue-timer', 'wheel-level-2'],
    data: cloneState(state),
  });

  // Frame 5: run_timer_softirq fires
  state.currentFunction = 'run_timer_softirq';
  state.phase = 'softirq';
  state.srcRef = 'kernel/time/timer.c:2400-2409 run_timer_softirq() -> run_timer_base(BASE_LOCAL) -> __run_timer_base() -> __run_timers()';
  frames.push({
    step: 5,
    label: 'run_timer_softirq() triggers expired timer processing',
    description: 'When TIMER_SOFTIRQ is raised (typically from the tick interrupt), run_timer_softirq() at kernel/time/timer.c:2400 is invoked. It calls run_timer_base(BASE_LOCAL) at line 2402, which calls __run_timer_base(base) at line 2377. __run_timer_base() checks time_before(jiffies, READ_ONCE(base->next_expiry)) at line 2380 for early exit. If expired timers exist, it acquires timer_base_lock_expiry(base) at line 2383, then raw_spin_lock_irq(&base->lock) at line 2384, and calls __run_timers(base) at line 2385. With CONFIG_NO_HZ_COMMON, BASE_GLOBAL and BASE_DEF are also processed (lines 2403-2405).',
    highlights: ['softirq-entry'],
    data: cloneState(state),
  });

  // Frame 6: __run_timers collects and expires
  state.currentFunction = '__run_timers';
  state.phase = 'expire';
  state.srcRef = 'kernel/time/timer.c:2343-2375 __run_timers(): while (time_after_eq(jiffies, base->clk)) { collect_expired_timers() -> expire_timers(base, heads + levels) }';
  frames.push({
    step: 6,
    label: '__run_timers() collects expired buckets and fires callbacks',
    description: '__run_timers() at kernel/time/timer.c:2343 loops while time_after_eq(jiffies, base->clk) && time_after_eq(jiffies, base->next_expiry) at lines 2353-2354. collect_expired_timers() at line 2355 advances base->clk to base->next_expiry (line 1810 in collect_expired_timers), then iterates all LVL_DEPTH levels at line 1815: for each level, idx = (clk & LVL_MASK) + i * LVL_SIZE computes the current bucket. If __test_and_clear_bit(idx, base->pending_map) at line 1818 finds pending timers, the hash list head is moved to heads[]. After collection, base->clk++ at line 2369, timer_recalc_next_expiry() at line 2370, then while (levels--) expire_timers(base, heads + levels) at lines 2372-2373 fires callbacks.',
    highlights: ['run-timers-loop', 'collect-expired'],
    data: cloneState(state),
  });

  // Frame 7: expire_timers fires callbacks
  state.currentFunction = 'expire_timers';
  state.wheelBuckets = [{ level: 2, index: 135, timerName: 'timer_B', expires: 'jiffies+5000' }];
  state.srcRef = 'kernel/time/timer.c:1766-1805 expire_timers(): while (!hlist_empty(head)) { detach_timer() -> fn = timer->function -> call_timer_fn(timer, fn, baseclk) }';
  frames.push({
    step: 7,
    label: 'expire_timers() detaches and calls each expired timer callback',
    description: 'expire_timers() at kernel/time/timer.c:1766 processes all timers in a collected bucket. It iterates while (!hlist_empty(head)) at line 1775: hlist_entry(head->first, struct timer_list, entry) gets the timer at line 1779, base->running_timer = timer at line 1781 marks it active, detach_timer(timer, true) at line 1782 removes it from the hash bucket. fn = timer->function at line 1784 gets the callback. For TIMER_IRQSAFE timers (line 1792), the lock is dropped briefly with raw_spin_unlock(&base->lock) before call_timer_fn(timer, fn, baseclk) at line 1794. Otherwise raw_spin_unlock_irq at line 1798 enables IRQs during the callback. timer_A has fired and been removed from the wheel; timer_B remains at level 2.',
    highlights: ['expire-callback'],
    data: cloneState(state),
  });

  // Frame 8: Summary of timer wheel architecture
  state.currentFunction = 'timer_wheel_summary';
  state.phase = 'return';
  state.srcRef = 'kernel/time/timer.c:150-187 Wheel constants: LVL_CLK_SHIFT=3, LVL_BITS=6, LVL_SIZE=64, LVL_DEPTH=8/9, WHEEL_SIZE=LVL_SIZE*LVL_DEPTH';
  frames.push({
    step: 8,
    label: 'Summary: Hierarchical timer wheel with O(1) insert and expiry',
    description: 'The Linux timer wheel (kernel/time/timer.c:150-187) uses a hierarchical design: LVL_BITS=6 gives 64 buckets per level, LVL_CLK_SHIFT=3 means each level is 8x coarser than the previous. LVL_DEPTH=8 (or 9 for HZ>100, line 174) gives WHEEL_SIZE=512 total buckets. Level 0: 1ms granularity (1 jiffy at HZ=1000). Level 1: 8ms. Level 2: 64ms. Level 7: ~2M jiffies (~35 minutes). add_timer() -> __mod_timer() -> internal_add_timer() -> calc_wheel_index() is O(1) insertion. run_timer_softirq() -> __run_timers() -> collect_expired_timers() -> expire_timers() is O(1) per expired timer since pending_map bitmap enables fast lookup.',
    highlights: ['summary'],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 2: hrtimer-rb-tree
 *
 * Traces: hrtimer_start_range_ns() -> __hrtimer_start_range_ns() ->
 *         enqueue_hrtimer() inserts into timerqueue (rb-tree).
 *         hrtimer_reprogram() programs next hardware event.
 *         hrtimer_interrupt() -> __hrtimer_run_queues() -> __run_hrtimer()
 * ======================================================================== */

function generateHrtimerRbTree(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();

  // Frame 0: hrtimer_start_range_ns entry
  state.currentFunction = 'hrtimer_start_range_ns';
  state.phase = 'hrtimer-enqueue';
  state.srcRef = 'kernel/time/hrtimer.c:1312-1335 hrtimer_start_range_ns(timer, tim, delta_ns, mode) -> lock_hrtimer_base() -> __hrtimer_start_range_ns()';
  frames.push({
    step: 0,
    label: 'hrtimer_start_range_ns() begins high-resolution timer setup',
    description: 'A kernel subsystem calls hrtimer_start_range_ns() at kernel/time/hrtimer.c:1312 to start a nanosecond-precision timer. It validates the mode (HRTIMER_MODE_SOFT vs HRTIMER_MODE_HARD, lines 1323-1326) matching timer->is_soft/is_hard. lock_hrtimer_base(timer, &flags) at line 1328 acquires the per-CPU hrtimer_cpu_base lock. Then __hrtimer_start_range_ns(timer, tim, delta_ns, mode, base) at line 1330 does the actual work. If it returns true (timer is the new earliest), hrtimer_reprogram(timer, true) at line 1331 reprograms the clock event device.',
    highlights: ['hrtimer-start'],
    data: cloneState(state),
  });

  // Frame 1: __hrtimer_start_range_ns removes old, sets expiry
  state.currentFunction = '__hrtimer_start_range_ns';
  state.srcRef = 'kernel/time/hrtimer.c:1218-1301 __hrtimer_start_range_ns(): remove_hrtimer() -> ktime_add_safe() for REL mode -> hrtimer_set_expires_range_ns() -> enqueue_hrtimer()';
  frames.push({
    step: 1,
    label: '__hrtimer_start_range_ns() prepares and enqueues the timer',
    description: '__hrtimer_start_range_ns() at kernel/time/hrtimer.c:1218 first checks force_local optimization: if the timer is on the current CPU and is the next-to-fire timer (lines 1234-1235), it avoids double hardware reprogramming. remove_hrtimer(timer, base, true, force_local) at line 1254 dequeues any existing entry. For HRTIMER_MODE_REL, tim = ktime_add_safe(tim, __hrtimer_cb_get_time(base->clockid)) at line 1257 converts relative to absolute. hrtimer_set_expires_range_ns(timer, tim, delta_ns) at line 1261 sets the soft/hard expiry range. switch_hrtimer_base() at line 1265 may migrate the timer to another CPU.',
    highlights: ['hrtimer-start-range'],
    data: cloneState(state),
  });

  // Frame 2: enqueue_hrtimer inserts into timerqueue rb-tree
  state.currentFunction = 'enqueue_hrtimer';
  state.rbTreeNodes.push({ timerName: 'hrtimer_A', expires: 'now+5ms', clockBase: 'CLOCK_MONOTONIC' });
  state.srcRef = 'kernel/time/hrtimer.c:1086-1098 enqueue_hrtimer(): WRITE_ONCE(timer->state, HRTIMER_STATE_ENQUEUED) -> timerqueue_add(&base->active, &timer->node)';
  frames.push({
    step: 2,
    label: 'enqueue_hrtimer() inserts timer into timerqueue rb-tree',
    description: 'enqueue_hrtimer() at kernel/time/hrtimer.c:1086 is called with the base lock held. It sets cpu_base->active_bases |= 1 << base->index at line 1092 to mark this clock base active. WRITE_ONCE(timer->state, HRTIMER_STATE_ENQUEUED) at line 1095 atomically sets the timer state. timerqueue_add(&base->active, &timer->node) at line 1097 inserts the hrtimer node into the red-black tree ordered by expiry time. This is O(log n) insertion. The function returns true if this timer is now the leftmost (earliest) node in the tree, indicating the hardware clock event may need reprogramming.',
    highlights: ['enqueue-hrtimer', 'rb-tree-insert'],
    data: cloneState(state),
  });

  // Frame 3: hrtimer_reprogram programs hardware
  state.currentFunction = 'hrtimer_reprogram';
  state.phase = 'hrtimer-reprogram';
  state.nextExpiry = 'now+5ms';
  state.srcRef = 'kernel/time/hrtimer.c:811-870 hrtimer_reprogram(): expires = ktime_sub(hrtimer_get_expires(timer), base->offset) -> __hrtimer_reprogram(cpu_base, timer, expires)';
  frames.push({
    step: 3,
    label: 'hrtimer_reprogram() programs the next hardware timer event',
    description: 'hrtimer_reprogram() at kernel/time/hrtimer.c:811 is called when a newly enqueued timer is the earliest to expire. It computes expires = ktime_sub(hrtimer_get_expires(timer), base->offset) at line 815 to get the hardware-relative expiry time. For soft hrtimers (line 826), it updates cpu_base->softirq_next_timer and softirq_expires_next (lines 842-843) without hardware programming. For hard hrtimers, if expires < cpu_base->expires_next (line 857) and we are not inside hrtimer_interrupt (line 864), it sets cpu_base->next_timer = timer at line 867 and calls __hrtimer_reprogram(cpu_base, timer, expires) at line 869, which calls tick_program_event(expires_next, 1) at hrtimer.c:686 to reprogram the clock event device hardware.',
    highlights: ['reprogram-hardware'],
    data: cloneState(state),
  });

  // Frame 4: Add second hrtimer
  state.currentFunction = 'enqueue_hrtimer';
  state.phase = 'hrtimer-enqueue';
  state.rbTreeNodes.push({ timerName: 'hrtimer_B', expires: 'now+20ms', clockBase: 'CLOCK_MONOTONIC' });
  state.srcRef = 'kernel/time/hrtimer.c:1271 first = enqueue_hrtimer(timer, new_base, mode) -- second timer inserted right of existing node in rb-tree';
  frames.push({
    step: 4,
    label: 'Second hrtimer enqueued at now+20ms (right of hrtimer_A in rb-tree)',
    description: 'A second hrtimer with expiry now+20ms is started via hrtimer_start_range_ns(). __hrtimer_start_range_ns() calls enqueue_hrtimer(timer, new_base, mode) at line 1271. timerqueue_add() inserts this node into the rb-tree. Since now+20ms > now+5ms, it goes to the right of hrtimer_A. enqueue_hrtimer() returns false (not the new leftmost), so hrtimer_reprogram() is NOT called -- the hardware clock event already points at the earlier hrtimer_A expiry. The rb-tree now has two nodes: hrtimer_A (leftmost, earliest) and hrtimer_B.',
    highlights: ['rb-tree-insert', 'no-reprogram'],
    data: cloneState(state),
  });

  // Frame 5: hrtimer_interrupt fires
  state.currentFunction = 'hrtimer_interrupt';
  state.phase = 'hrtimer-interrupt';
  state.srcRef = 'kernel/time/hrtimer.c:1881-1911 hrtimer_interrupt(dev): raw_spin_lock_irqsave() -> cpu_base->in_hrtirq = 1 -> expires_next = KTIME_MAX -> __hrtimer_run_queues()';
  frames.push({
    step: 5,
    label: 'hrtimer_interrupt() fires when clock event device triggers',
    description: 'When the programmed hardware timer fires, hrtimer_interrupt() at kernel/time/hrtimer.c:1881 is called from the clock event device interrupt handler. It acquires raw_spin_lock_irqsave(&cpu_base->lock, flags) at line 1892, sets now = hrtimer_update_base(cpu_base) at line 1893. At line 1895, cpu_base->in_hrtirq = 1 prevents re-entrant reprogramming. cpu_base->expires_next = KTIME_MAX at line 1903 prevents migration code from enqueuing timers. If softirq timers are due (line 1905), raise_timer_softirq(HRTIMER_SOFTIRQ) at line 1908 defers them. __hrtimer_run_queues(cpu_base, now, flags, HRTIMER_ACTIVE_HARD) at line 1911 processes hard-deadline timers.',
    highlights: ['hrtimer-interrupt'],
    data: cloneState(state),
  });

  // Frame 6: __hrtimer_run_queues iterates expired timers
  state.currentFunction = '__hrtimer_run_queues';
  state.phase = 'hrtimer-run';
  state.srcRef = 'kernel/time/hrtimer.c:1817-1854 __hrtimer_run_queues(): for_each_active_base -> while (node = timerqueue_getnext()) -> if (basenow < softexpires) break -> __run_hrtimer()';
  frames.push({
    step: 6,
    label: '__hrtimer_run_queues() walks rb-tree leftmost nodes',
    description: '__hrtimer_run_queues() at kernel/time/hrtimer.c:1817 filters bases by active_mask (cpu_base->active_bases & active_mask at line 1821). for_each_active_base() iterates active clock bases (line 1823). For each base, basenow = ktime_add(now, base->offset) at line 1827. The inner while loop at line 1829 calls timerqueue_getnext(&base->active) to get the leftmost rb-tree node, then container_of() at line 1832 converts to struct hrtimer. If basenow < hrtimer_get_softexpires(timer) at line 1846, the loop breaks -- all remaining timers expire later. Otherwise __run_hrtimer() at line 1849 fires the callback.',
    highlights: ['run-queues-loop'],
    data: cloneState(state),
  });

  // Frame 7: __run_hrtimer fires callback
  state.currentFunction = '__run_hrtimer';
  state.rbTreeNodes = [{ timerName: 'hrtimer_B', expires: 'now+20ms', clockBase: 'CLOCK_MONOTONIC' }];
  state.srcRef = 'kernel/time/hrtimer.c:1742-1815 __run_hrtimer(): __remove_hrtimer(INACTIVE) -> fn = timer->function -> raw_spin_unlock_irqrestore() -> restart = fn(timer) -> re-enqueue if HRTIMER_RESTART';
  frames.push({
    step: 7,
    label: '__run_hrtimer() removes timer and invokes callback',
    description: '__run_hrtimer() at kernel/time/hrtimer.c:1742 sets base->running = timer at line 1754. raw_write_seqcount_barrier(&base->seq) at line 1763 ensures ordering for hrtimer_active() readers. __remove_hrtimer(timer, base, HRTIMER_STATE_INACTIVE, 0) at line 1765 removes the node from the rb-tree via timerqueue_del(). fn = ACCESS_PRIVATE(timer, function) at line 1766 gets the callback. The base lock is dropped at line 1781 (raw_spin_unlock_irqrestore) before calling restart = fn(timer) at line 1785. If restart == HRTIMER_RESTART and the timer was not re-enqueued during the callback, enqueue_hrtimer(timer, base, HRTIMER_MODE_ABS) at line 1802 re-inserts it. hrtimer_A has fired; hrtimer_B remains in the rb-tree.',
    highlights: ['run-hrtimer-callback'],
    data: cloneState(state),
  });

  // Frame 8: Post-interrupt reprogram
  state.currentFunction = 'hrtimer_interrupt';
  state.phase = 'hrtimer-reprogram';
  state.nextExpiry = 'now+20ms';
  state.srcRef = 'kernel/time/hrtimer.c:1914-1920 hrtimer_interrupt(): expires_next = hrtimer_update_next_event() -> __hrtimer_reprogram(cpu_base, next_timer, expires_next)';
  frames.push({
    step: 8,
    label: 'hrtimer_interrupt() reprograms hardware for next expiry',
    description: 'After __hrtimer_run_queues() returns, hrtimer_interrupt() evaluates the next event at line 1914: expires_next = hrtimer_update_next_event(cpu_base). This scans all active clock bases to find the earliest pending hrtimer (now hrtimer_B at now+20ms). cpu_base->in_hrtirq = 0 is cleared, and __hrtimer_reprogram(cpu_base, cpu_base->next_timer, expires_next) at line 704 (via hrtimer_force_reprogram) calls tick_program_event(expires_next, 1) at line 686 to set the hardware clock event device for the next interrupt. The cycle repeats when hrtimer_B expires.',
    highlights: ['reprogram-next'],
    data: cloneState(state),
  });

  return frames;
}

/* ========================================================================
 * Scenario 3: nanosleep-implementation
 *
 * Traces: SYSCALL_DEFINE2(nanosleep) -> hrtimer_nanosleep() ->
 *         do_nanosleep() -> hrtimer_sleeper_start_expires() + schedule()
 *         hrtimer_wakeup() callback wakes the sleeping task.
 * ======================================================================== */

function generateNanosleepImplementation(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state = makeInitialState();

  // Frame 0: nanosleep syscall entry
  state.currentFunction = 'SYSCALL_DEFINE2(nanosleep)';
  state.phase = 'nanosleep-entry';
  state.taskState = 'running';
  state.srcRef = 'kernel/time/hrtimer.c:2192-2208 SYSCALL_DEFINE2(nanosleep, rqtp, rmtp): get_timespec64() -> timespec64_valid() -> hrtimer_nanosleep(timespec64_to_ktime(tu), HRTIMER_MODE_REL, CLOCK_MONOTONIC)';
  frames.push({
    step: 0,
    label: 'nanosleep() syscall entry from userspace',
    description: 'Userspace calls nanosleep(&req, &rem). SYSCALL_DEFINE2(nanosleep) at kernel/time/hrtimer.c:2192 copies the timespec from userspace via get_timespec64(&tu, rqtp) at line 2197. timespec64_valid(&tu) at line 2200 validates the value. current->restart_block is initialized at lines 2203-2205 for signal restart handling (TT_NATIVE if rmtp provided). Finally hrtimer_nanosleep(timespec64_to_ktime(tu), HRTIMER_MODE_REL, CLOCK_MONOTONIC) at line 2206 converts the timespec to ktime_t and delegates to the hrtimer sleep machinery.',
    highlights: ['syscall-entry'],
    data: cloneState(state),
  });

  // Frame 1: hrtimer_nanosleep sets up sleeper
  state.currentFunction = 'hrtimer_nanosleep';
  state.srcRef = 'kernel/time/hrtimer.c:2162-2188 hrtimer_nanosleep(): hrtimer_setup_sleeper_on_stack(&t, clockid, mode) -> hrtimer_set_expires_range_ns(&t.timer, rqtp, current->timer_slack_ns) -> do_nanosleep(&t, mode)';
  frames.push({
    step: 1,
    label: 'hrtimer_nanosleep() initializes hrtimer_sleeper on stack',
    description: 'hrtimer_nanosleep() at kernel/time/hrtimer.c:2162 allocates struct hrtimer_sleeper on the stack. hrtimer_setup_sleeper_on_stack(&t, clockid, mode) at line 2169 calls __hrtimer_setup_sleeper() which at line 2078 does __hrtimer_setup(&sl->timer, hrtimer_wakeup, clock_id, mode) to wire the hrtimer callback to hrtimer_wakeup, and sl->task = current at line 2079 records the sleeping task. hrtimer_set_expires_range_ns(&t.timer, rqtp, current->timer_slack_ns) at line 2170 sets the expiry with timer_slack_ns allowing some range for power-saving timer coalescing. Then do_nanosleep(&t, mode) at line 2171 enters the sleep loop.',
    highlights: ['setup-sleeper'],
    data: cloneState(state),
  });

  // Frame 2: do_nanosleep sets task state and starts timer
  state.currentFunction = 'do_nanosleep';
  state.phase = 'nanosleep-sleep';
  state.srcRef = 'kernel/time/hrtimer.c:2115-2131 do_nanosleep(): set_current_state(TASK_INTERRUPTIBLE|TASK_FREEZABLE) -> hrtimer_sleeper_start_expires(t, mode) -> schedule()';
  frames.push({
    step: 2,
    label: 'do_nanosleep() arms timer and prepares to sleep',
    description: 'do_nanosleep() at kernel/time/hrtimer.c:2115 enters a do-while loop (line 2119). set_current_state(TASK_INTERRUPTIBLE|TASK_FREEZABLE) at line 2120 marks the current task as sleeping and interruptible by signals. hrtimer_sleeper_start_expires(t, mode) at line 2121 calls hrtimer_start_expires(&sl->timer, mode) at line 2047, which internally calls hrtimer_start_range_ns() to enqueue the hrtimer into the rb-tree and potentially reprogram hardware. The timer is now armed.',
    highlights: ['set-task-state', 'arm-timer'],
    data: cloneState(state),
  });

  // Frame 3: enqueue_hrtimer inserts nanosleep timer
  state.currentFunction = 'enqueue_hrtimer';
  state.rbTreeNodes.push({ timerName: 'nanosleep_timer', expires: 'now+100ms', clockBase: 'CLOCK_MONOTONIC' });
  state.srcRef = 'kernel/time/hrtimer.c:1086-1097 enqueue_hrtimer(): WRITE_ONCE(timer->state, HRTIMER_STATE_ENQUEUED) -> timerqueue_add(&base->active, &timer->node)';
  frames.push({
    step: 3,
    label: 'enqueue_hrtimer() inserts nanosleep timer into rb-tree',
    description: 'The hrtimer_start_range_ns() -> __hrtimer_start_range_ns() path reaches enqueue_hrtimer() at kernel/time/hrtimer.c:1086. The nanosleep timer is inserted into the per-CPU timerqueue rb-tree with WRITE_ONCE(timer->state, HRTIMER_STATE_ENQUEUED) at line 1095 and timerqueue_add() at line 1097. If this is the earliest timer, hrtimer_reprogram() at hrtimer.c:811 programs the clock event device via __hrtimer_reprogram() -> tick_program_event() at line 686. The hardware will generate an interrupt when the expiry time is reached.',
    highlights: ['enqueue-nanosleep'],
    data: cloneState(state),
  });

  // Frame 4: schedule() puts task to sleep
  state.currentFunction = 'schedule';
  state.taskState = 'sleeping';
  state.srcRef = 'kernel/time/hrtimer.c:2123-2124 if (likely(t->task)) schedule(); -- task sleeps until hrtimer_wakeup() fires or signal arrives';
  frames.push({
    step: 4,
    label: 'schedule() context-switches away from sleeping task',
    description: 'Back in do_nanosleep(), if (likely(t->task)) at line 2123 checks that the timer has not already fired (hrtimer_wakeup sets t->task = NULL). Since the timer is still pending, schedule() at line 2124 is called. The scheduler sees the task in TASK_INTERRUPTIBLE state and removes it from the run queue. A context switch occurs to another runnable task. The sleeping task will not run again until either: (1) hrtimer_wakeup() fires and calls wake_up_process(), or (2) a signal is delivered.',
    highlights: ['schedule-sleep'],
    data: cloneState(state),
  });

  // Frame 5: hrtimer_interrupt fires the nanosleep timer
  state.currentFunction = 'hrtimer_interrupt';
  state.phase = 'nanosleep-wakeup';
  state.srcRef = 'kernel/time/hrtimer.c:1881-1911 hrtimer_interrupt() -> __hrtimer_run_queues(HRTIMER_ACTIVE_HARD) -> __run_hrtimer() for expired nanosleep timer';
  frames.push({
    step: 5,
    label: 'hrtimer_interrupt() processes expired nanosleep timer',
    description: 'When the clock event device fires at the programmed expiry, hrtimer_interrupt() at kernel/time/hrtimer.c:1881 runs in hard IRQ context. After acquiring the lock and updating base time (lines 1892-1893), __hrtimer_run_queues(cpu_base, now, flags, HRTIMER_ACTIVE_HARD) at line 1911 iterates the rb-tree. The nanosleep timer is the leftmost node and has expired (basenow >= softexpires at line 1846). __run_hrtimer() at line 1849 is called: it removes the timer from the rb-tree via __remove_hrtimer() and invokes the callback function.',
    highlights: ['interrupt-fire'],
    data: cloneState(state),
  });

  // Frame 6: hrtimer_wakeup callback
  state.currentFunction = 'hrtimer_wakeup';
  state.rbTreeNodes = [];
  state.taskState = 'woken';
  state.srcRef = 'kernel/time/hrtimer.c:2013-2024 hrtimer_wakeup(timer): t->task = NULL -> wake_up_process(task) -> returns HRTIMER_NORESTART';
  frames.push({
    step: 6,
    label: 'hrtimer_wakeup() clears task pointer and wakes the sleeper',
    description: 'hrtimer_wakeup() at kernel/time/hrtimer.c:2013 is the callback registered by __hrtimer_setup_sleeper(). It retrieves the hrtimer_sleeper via container_of(timer, struct hrtimer_sleeper, timer) at line 2015-2016, then task = t->task at line 2017. t->task = NULL at line 2019 signals to do_nanosleep() that the timer has completed. if (task) wake_up_process(task) at lines 2020-2021 moves the sleeping task from TASK_INTERRUPTIBLE back to TASK_RUNNING on the run queue. The function returns HRTIMER_NORESTART at line 2023, so __run_hrtimer() will NOT re-enqueue the timer (line 1800-1802 check).',
    highlights: ['wakeup-callback'],
    data: cloneState(state),
  });

  // Frame 7: do_nanosleep wakes up and checks completion
  state.currentFunction = 'do_nanosleep';
  state.phase = 'return';
  state.taskState = 'running';
  state.srcRef = 'kernel/time/hrtimer.c:2126-2134 do_nanosleep(): hrtimer_cancel(&t->timer) -> while (t->task && !signal_pending) loop exits -> __set_current_state(TASK_RUNNING) -> return 0';
  frames.push({
    step: 7,
    label: 'do_nanosleep() resumes: timer completed, task returns',
    description: 'When the woken task is scheduled again, do_nanosleep() continues after schedule() at line 2124. hrtimer_cancel(&t->timer) at line 2126 ensures the timer is fully dequeued. The do-while condition at line 2129 checks t->task (NULL since hrtimer_wakeup cleared it) AND !signal_pending(current). Since t->task is NULL, the loop exits. __set_current_state(TASK_RUNNING) at line 2131 restores the task state. The check !t->task at line 2133 returns 0 (success). If a signal interrupted the sleep before the timer fired, t->task would still be set, and nanosleep_copyout() would report the remaining time.',
    highlights: ['wake-return'],
    data: cloneState(state),
  });

  // Frame 8: hrtimer_nanosleep cleanup and return to userspace
  state.currentFunction = 'hrtimer_nanosleep';
  state.srcRef = 'kernel/time/hrtimer.c:2171-2187 hrtimer_nanosleep(): ret = do_nanosleep() -> if (ret != -ERESTART_RESTARTBLOCK) goto out -> destroy_hrtimer_on_stack(&t.timer) -> return ret';
  frames.push({
    step: 8,
    label: 'hrtimer_nanosleep() destroys stack timer and returns to userspace',
    description: 'Back in hrtimer_nanosleep() at kernel/time/hrtimer.c:2162, ret = do_nanosleep(&t, mode) at line 2171 returned 0 (sleep completed). Since ret != -ERESTART_RESTARTBLOCK, it jumps to out: at line 2185 where destroy_hrtimer_on_stack(&t.timer) at line 2186 cleans up the stack-allocated hrtimer (debug tracking). The function returns 0 to SYSCALL_DEFINE2(nanosleep) which returns to userspace. If the sleep was interrupted by a signal, hrtimer_nanosleep() would set up restart_block at lines 2181-2184 with hrtimer_nanosleep_restart as the restart function, enabling transparent restart via -ERESTART_RESTARTBLOCK.',
    highlights: ['cleanup-return'],
    data: cloneState(state),
  });

  return frames;
}

/* ---------- SVG Rendering ---------- */

const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  'enqueue': '#3fb950',
  'wheel-index': '#d29922',
  'expire': '#f85149',
  'softirq': '#f0883e',
  'hrtimer-enqueue': '#6e40c9',
  'hrtimer-reprogram': '#58a6ff',
  'hrtimer-interrupt': '#f0883e',
  'hrtimer-run': '#f85149',
  'nanosleep-entry': '#6e40c9',
  'nanosleep-sleep': '#484f58',
  'nanosleep-wakeup': '#3fb950',
  'return': '#8b949e',
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
  el.setAttribute('fill', fill);
  el.setAttribute('rx', String(rx));
  el.setAttribute('class', cls);
  return el;
}

function renderWheelBuckets(container: SVGGElement, buckets: TimerHrtimerState['wheelBuckets'], width: number, y: number): void {
  container.appendChild(createText(width / 2, y, 'Timer Wheel (base->vectors[])', 'anim-section-label'));

  if (buckets.length === 0) {
    container.appendChild(createText(width / 2, y + 30, '(empty)', 'anim-addr-marker'));
    return;
  }

  const itemW = Math.min(140, (width - 40) / Math.max(buckets.length, 1));
  const startX = (width - buckets.length * (itemW + 8)) / 2;

  buckets.forEach((b, i) => {
    const x = startX + i * (itemW + 8);
    container.appendChild(createRect(x, y + 12, itemW, 36, '#3fb950', 'anim-wheel-bucket', 4));
    container.appendChild(createText(x + itemW / 2, y + 28, `L${b.level}[${b.index}]`, 'anim-addr-marker'));
    container.appendChild(createText(x + itemW / 2, y + 42, b.timerName, 'anim-addr-marker'));
  });
}

function renderRbTreeNodes(container: SVGGElement, nodes: TimerHrtimerState['rbTreeNodes'], width: number, y: number): void {
  container.appendChild(createText(width / 2, y, 'hrtimer timerqueue (rb-tree)', 'anim-section-label'));

  if (nodes.length === 0) {
    container.appendChild(createText(width / 2, y + 30, '(empty)', 'anim-addr-marker'));
    return;
  }

  const itemW = Math.min(140, (width - 40) / Math.max(nodes.length, 1));
  const startX = (width - nodes.length * (itemW + 8)) / 2;

  nodes.forEach((n, i) => {
    const x = startX + i * (itemW + 8);
    container.appendChild(createRect(x, y + 12, itemW, 36, '#6e40c9', 'anim-rb-node', 4));
    container.appendChild(createText(x + itemW / 2, y + 28, n.timerName, 'anim-addr-marker'));
    container.appendChild(createText(x + itemW / 2, y + 42, n.expires, 'anim-addr-marker'));
  });
}

function renderPhase(container: SVGGElement, data: TimerHrtimerState, width: number, y: number): void {
  const color = PHASE_COLORS[data.phase] || '#484f58';
  const phaseW = 220;
  const x = (width - phaseW) / 2;
  container.appendChild(createRect(x, y, phaseW, 24, color, 'anim-phase-box', 6));
  container.appendChild(createText(width / 2, y + 16, `${data.currentFunction}()`, 'anim-addr-marker'));
}

function renderTaskState(container: SVGGElement, data: TimerHrtimerState, width: number, y: number): void {
  if (data.taskState === 'none') return;

  const stateColors: Record<string, string> = {
    'running': '#3fb950',
    'sleeping': '#484f58',
    'woken': '#f0883e',
  };
  const color = stateColors[data.taskState] || '#484f58';
  const label = `Task: ${data.taskState.toUpperCase()}`;
  container.appendChild(createRect((width - 120) / 2, y, 120, 22, color, 'anim-task-state', 4));
  container.appendChild(createText(width / 2, y + 15, label, 'anim-addr-marker'));
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as TimerHrtimerState;

  renderPhase(container, data, width, 16);
  renderWheelBuckets(container, data.wheelBuckets, width, 60);
  renderRbTreeNodes(container, data.rbTreeNodes, width, 140);
  renderTaskState(container, data, width, 210);

  // Next expiry
  if (data.nextExpiry) {
    container.appendChild(
      createText(width / 2, 250, `Next expiry: ${data.nextExpiry}`, 'anim-addr-marker'),
    );
  }

  // Source reference
  if (data.srcRef) {
    container.appendChild(createText(width / 2, height - 8, data.srcRef, 'anim-addr-marker'));
  }
}

/* ---------- Module export ---------- */

const SCENARIOS: AnimationScenario[] = [
  { id: 'timer-wheel', label: 'Timer Wheel: add_timer -> __run_timers -> expire_timers' },
  { id: 'hrtimer-rb-tree', label: 'hrtimer rb-tree: hrtimer_start -> hrtimer_interrupt -> __run_hrtimer' },
  { id: 'nanosleep-implementation', label: 'nanosleep(): hrtimer_nanosleep -> do_nanosleep -> hrtimer_wakeup' },
];

const timerHrtimerModule: AnimationModule = {
  config: {
    id: 'timer-hrtimer',
    title: 'Timers and hrtimers: Timer Wheel, rb-tree, and Kernel Timekeeping',
    skillName: 'timers-and-hrtimers',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'hrtimer-rb-tree': return generateHrtimerRbTree();
      case 'nanosleep-implementation': return generateNanosleepImplementation();
      case 'timer-wheel':
      default: return generateTimerWheel();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export type { TimerHrtimerState };
export default timerHrtimerModule;
