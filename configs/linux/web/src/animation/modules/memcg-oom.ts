import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PageCounterNode {
  name: string;
  usage: number;
  max: number;
  level: 'child' | 'parent' | 'root';
}

export interface TaskInfo {
  pid: number;
  comm: string;
  rss: number;
  swap: number;
  pgtables: number;
  oomScoreAdj: number;
  score: number | null;
  state: 'running' | 'evaluated' | 'selected' | 'killed' | 'reaped';
}

export interface MemcgOomState {
  pageCounters: PageCounterNode[];
  tasks: TaskInfo[];
  currentFunction: string;
  phase: string;
  chargeNrPages: number;
  chargeSuccess: boolean | null;
  oomTriggered: boolean;
  oomVictim: string | null;
  oomReaperActive: boolean;
  srcRef: string;
  /** v7.0 private memcg ID: allocated via xa_alloc() from mem_cgroup_private_ids. 0 means unassigned. */
  memcgId?: number;
  /** v7.0 refcount_t memcg->id.ref; tracks online-state pin on the memcg ID. */
  memcgIdRef?: number;
  /** True once xa_store() publishes the memcg pointer under its ID so xa_load() lookups resolve. */
  xarrayPublished?: boolean;
}

function cloneState(s: MemcgOomState): MemcgOomState {
  return {
    pageCounters: s.pageCounters.map(pc => ({ ...pc })),
    tasks: s.tasks.map(t => ({ ...t })),
    currentFunction: s.currentFunction,
    phase: s.phase,
    chargeNrPages: s.chargeNrPages,
    chargeSuccess: s.chargeSuccess,
    oomTriggered: s.oomTriggered,
    oomVictim: s.oomVictim,
    oomReaperActive: s.oomReaperActive,
    srcRef: s.srcRef,
    memcgId: s.memcgId,
    memcgIdRef: s.memcgIdRef,
    xarrayPublished: s.xarrayPublished,
  };
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  state: MemcgOomState,
): AnimationFrame {
  return {
    step,
    label,
    description,
    highlights,
    data: cloneState(state),
  };
}

/* ---------- Scenario 1: memcg-charge-hierarchy ---------- */

function generateChargeHierarchyFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: MemcgOomState = {
    pageCounters: [
      { name: 'child (/sys/fs/cgroup/app)', usage: 150, max: 512, level: 'child' },
      { name: 'parent (/sys/fs/cgroup)', usage: 300, max: 1024, level: 'parent' },
      { name: 'root_mem_cgroup', usage: 500, max: 4096, level: 'root' },
    ],
    tasks: [
      { pid: 1234, comm: 'webapp', rss: 100, swap: 10, pgtables: 2, oomScoreAdj: 0, score: null, state: 'running' },
    ],
    currentFunction: '__mem_cgroup_charge',
    phase: 'entry',
    chargeNrPages: 4,
    chargeSuccess: null,
    oomTriggered: false,
    oomVictim: null,
    oomReaperActive: false,
    srcRef: 'mm/memcontrol.c:4815 __mem_cgroup_charge()',
  };

  // Frame 0: __mem_cgroup_charge entry
  frames.push(makeFrame(
    0,
    'Entry: __mem_cgroup_charge()',
    '__mem_cgroup_charge() at mm/memcontrol.c:4755 is called when a folio is charged to a memory cgroup. It calls get_mem_cgroup_from_mm(mm) at line 4760 to look up the memcg associated with the current mm_struct, then delegates to charge_memcg(folio, memcg, gfp) at line 4761. The css reference is put back at line 4762 via css_put(&memcg->css).',
    ['__mem_cgroup_charge'],
    state,
  ));

  // Frame 1: charge_memcg delegates to try_charge
  state.currentFunction = 'charge_memcg';
  state.phase = 'charge_memcg';
  state.srcRef = 'mm/memcontrol.c:4739 charge_memcg()';
  frames.push(makeFrame(
    1,
    'charge_memcg(): delegate to try_charge',
    'charge_memcg() at mm/memcontrol.c:4739 receives the folio, memcg, and gfp flags. It calls try_charge(memcg, gfp, folio_nr_pages(folio)) at line 4744 which routes to try_charge_memcg(). On success, it calls css_get(&memcg->css) at line 4748 and commit_charge(folio, memcg) at line 4749 to finalize the folio-to-memcg association.',
    ['charge_memcg'],
    state,
  ));

  // Frame 2: try_charge_memcg entry, check stock
  state.currentFunction = 'try_charge_memcg';
  state.phase = 'try_charge_entry';
  state.srcRef = 'mm/memcontrol.c:2355 try_charge_memcg()';
  frames.push(makeFrame(
    2,
    'try_charge_memcg(): check per-cpu stock',
    'try_charge_memcg() at mm/memcontrol.c:2355 first sets batch = max(MEMCG_CHARGE_BATCH, nr_pages) at line 2358 to batch charges for efficiency. At line 2371, it calls consume_stock(memcg, nr_pages) to attempt a fast-path charge from per-cpu cached pages. If the stock cache has enough pages, the charge succeeds immediately without any atomic operations on page counters.',
    ['try_charge_memcg', 'consume_stock'],
    state,
  ));

  // Frame 3: stock miss, page_counter_try_charge on memsw
  state.currentFunction = 'page_counter_try_charge';
  state.phase = 'charge_memsw';
  state.srcRef = 'mm/memcontrol.c:2379 page_counter_try_charge(&memcg->memsw)';
  frames.push(makeFrame(
    3,
    'page_counter_try_charge(): charge memsw counter',
    'Stock cache miss. try_charge_memcg() proceeds to the page_counter path. At mm/memcontrol.c:2379, if memsw accounting is enabled (do_memsw_account()), it first charges memcg->memsw via page_counter_try_charge(&memcg->memsw, batch, &counter). This counter tracks memory+swap usage combined and must be charged before the memory-only counter.',
    ['page_counter_try_charge', 'memsw'],
    state,
  ));

  // Frame 4: page_counter_try_charge walks child
  state.phase = 'charge_child';
  state.srcRef = 'mm/page_counter.c:118 page_counter_try_charge()';
  state.pageCounters[0].usage = 154;
  frames.push(makeFrame(
    4,
    'page_counter_try_charge(): charge child counter',
    'page_counter_try_charge() at mm/page_counter.c:118 iterates the hierarchy via for (c = counter; c; c = c->parent) at line 126. For the child cgroup /sys/fs/cgroup/app, it does atomic_long_add_return(nr_pages, &c->usage) at line 142 to speculatively add pages. Then checks if new > c->max at line 143. If the child limit (512 pages) is not exceeded, it updates local_watermark at lines 159-162 and proceeds to the parent.',
    ['page_counter_try_charge', 'child'],
    state,
  ));

  // Frame 5: page_counter_try_charge walks parent
  state.phase = 'charge_parent';
  state.srcRef = 'mm/page_counter.c:126 page_counter_try_charge() -> parent';
  state.pageCounters[1].usage = 304;
  frames.push(makeFrame(
    5,
    'page_counter_try_charge(): charge parent counter',
    'The hierarchy walk continues to the parent cgroup. At mm/page_counter.c:126, c = c->parent moves to the parent node. The same atomic_long_add_return() at line 142 charges the parent counter. The parent limit is 1024 pages and current usage is 304, well within limits. The watermark tracking at lines 159-162 updates if this is a new high-water mark.',
    ['page_counter_try_charge', 'parent'],
    state,
  ));

  // Frame 6: page_counter_try_charge walks root
  state.phase = 'charge_root';
  state.srcRef = 'mm/page_counter.c:126 page_counter_try_charge() -> root';
  state.pageCounters[2].usage = 504;
  frames.push(makeFrame(
    6,
    'page_counter_try_charge(): charge root counter',
    'The hierarchy walk reaches root_mem_cgroup. At mm/page_counter.c:126, c->parent is NULL for the root, so after charging root this iteration completes. The root counter with max=4096 easily accommodates 504 pages. The function returns true at line 165 indicating success. If any ancestor had exceeded its limit, page_counter_cancel() at line 168-169 would roll back charges on all previously charged ancestors.',
    ['page_counter_try_charge', 'root'],
    state,
  ));

  // Frame 7: charge succeeds, restock
  state.currentFunction = 'try_charge_memcg';
  state.phase = 'done_restock';
  state.chargeSuccess = true;
  state.srcRef = 'mm/memcontrol.c:2380 done_restock';
  frames.push(makeFrame(
    7,
    'try_charge_memcg(): charge succeeds, restock',
    'page_counter_try_charge() returned true for memcg->memory at mm/memcontrol.c:2380, so execution jumps to done_restock. The batch leftover (batch - nr_pages) is stored into the per-cpu stock cache for future fast-path charges via refill_stock(). try_charge_memcg() returns 0 (success). Back in charge_memcg(), commit_charge(folio, memcg) at mm/memcontrol.c:4749 stamps the folio with its owning memcg.',
    ['try_charge_memcg', 'done_restock'],
    state,
  ));

  // Frame 8: summary
  state.currentFunction = 'commit_charge';
  state.phase = 'committed';
  state.srcRef = 'mm/memcontrol.c:4749 commit_charge()';
  frames.push(makeFrame(
    8,
    'commit_charge(): folio associated with memcg',
    'commit_charge() stamps the folio with its owning memory cgroup. The hierarchical charge is now complete: child, parent, and root page_counters all had their usage atomically incremented. The folio is fully accounted. If the process later frees this folio, page_counter_uncharge() will walk the same hierarchy in reverse, decrementing each ancestor counter.',
    ['commit_charge'],
    state,
  ));

  return frames;
}

/* ---------- Scenario 2: oom-killer-scoring ---------- */

function generateOomScoringFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const tasks: TaskInfo[] = [
    { pid: 100, comm: 'systemd', rss: 20, swap: 0, pgtables: 1, oomScoreAdj: -1000, score: null, state: 'running' },
    { pid: 200, comm: 'webapp', rss: 400, swap: 50, pgtables: 8, oomScoreAdj: 0, score: null, state: 'running' },
    { pid: 300, comm: 'cache-server', rss: 250, swap: 30, pgtables: 5, oomScoreAdj: 0, score: null, state: 'running' },
    { pid: 400, comm: 'logger', rss: 10, swap: 2, pgtables: 1, oomScoreAdj: -500, score: null, state: 'running' },
  ];

  const state: MemcgOomState = {
    pageCounters: [
      { name: 'child (/sys/fs/cgroup/app)', usage: 510, max: 512, level: 'child' },
      { name: 'parent (/sys/fs/cgroup)', usage: 1020, max: 1024, level: 'parent' },
      { name: 'root_mem_cgroup', usage: 3900, max: 4096, level: 'root' },
    ],
    tasks: tasks.map(t => ({ ...t })),
    currentFunction: 'try_charge_memcg',
    phase: 'charge_fail',
    chargeNrPages: 4,
    chargeSuccess: null,
    oomTriggered: false,
    oomVictim: null,
    oomReaperActive: false,
    srcRef: 'mm/memcontrol.c:2404 page_counter_try_charge() fails',
  };

  // Frame 0: charge fails
  frames.push(makeFrame(
    0,
    'page_counter_try_charge() fails: limit exceeded',
    'try_charge_memcg() at mm/memcontrol.c:2355 calls page_counter_try_charge(&memcg->memory, batch, &counter) at line 2380. Inside mm/page_counter.c:143, atomic_long_add_return() returns a value exceeding c->max (512 pages). The counter rolls back via atomic_long_sub() at line 144, sets *fail = c at line 152, and returns false. Back in try_charge_memcg(), mem_over_limit is set via mem_cgroup_from_counter(counter, memory) at line 2384.',
    ['page_counter_try_charge'],
    state,
  ));

  // Frame 1: reclaim attempted
  state.currentFunction = 'try_to_free_mem_cgroup_pages';
  state.phase = 'reclaim_attempt';
  state.srcRef = 'mm/memcontrol.c:2414 try_to_free_mem_cgroup_pages()';
  frames.push(makeFrame(
    1,
    'try_to_free_mem_cgroup_pages(): reclaim attempt',
    'Before invoking OOM, try_charge_memcg() attempts memory reclaim. At mm/memcontrol.c:2414, it calls try_to_free_mem_cgroup_pages(mem_over_limit, nr_pages, gfp_mask, reclaim_options, NULL). This scans the memcg LRU lists for reclaimable pages. After MAX_RECLAIM_RETRIES (16) unsuccessful attempts where mem_cgroup_margin() at line 2418 remains below nr_pages, reclaim is exhausted.',
    ['try_to_free_mem_cgroup_pages'],
    state,
  ));

  // Frame 2: mem_cgroup_oom entry
  state.currentFunction = 'mem_cgroup_oom';
  state.phase = 'oom_entry';
  state.oomTriggered = true;
  state.srcRef = 'mm/memcontrol.c:1706 mem_cgroup_oom()';
  frames.push(makeFrame(
    2,
    'mem_cgroup_oom(): OOM triggered',
    'Reclaim failed. try_charge_memcg() calls mem_cgroup_oom(mem_over_limit, gfp_mask, get_order(nr_pages * PAGE_SIZE)) at mm/memcontrol.c:2456. mem_cgroup_oom() at line 1706 first checks if order > PAGE_ALLOC_COSTLY_ORDER at line 1710 (returns false for huge allocations). It fires memcg_memory_event(memcg, MEMCG_OOM) at line 1713 to update the memory.events OOM counter, then calls memcg1_oom_prepare() at line 1715.',
    ['mem_cgroup_oom'],
    state,
  ));

  // Frame 3: mem_cgroup_out_of_memory
  state.currentFunction = 'mem_cgroup_out_of_memory';
  state.phase = 'oom_control_setup';
  state.srcRef = 'mm/memcontrol.c:1673 mem_cgroup_out_of_memory()';
  frames.push(makeFrame(
    3,
    'mem_cgroup_out_of_memory(): set up oom_control',
    'mem_cgroup_oom() delegates to mem_cgroup_out_of_memory(memcg, mask, order) at mm/memcontrol.c:1718. Defined at line 1673, it initializes struct oom_control with zonelist=NULL, nodemask=NULL, memcg=memcg. It acquires mutex_lock_killable(&oom_lock) at line 1685 to serialize OOM kills. A last-chance check with mem_cgroup_margin(memcg) at line 1688 verifies the limit is still exceeded, then calls out_of_memory(&oc) at line 1695.',
    ['mem_cgroup_out_of_memory'],
    state,
  ));

  // Frame 4: out_of_memory -> constrained_alloc -> select_bad_process
  state.currentFunction = 'out_of_memory';
  state.phase = 'select_start';
  state.srcRef = 'mm/oom_kill.c:1119 out_of_memory()';
  frames.push(makeFrame(
    4,
    'out_of_memory(): begin victim selection',
    'out_of_memory() at mm/oom_kill.c:1119 checks if oom_killer_disabled at line 1123. For memcg OOM (is_memcg_oom(oc) is true), it skips the global OOM notifier chain at line 1126. It calls constrained_alloc(oc) at line 1156 which sets oc->constraint = CONSTRAINT_MEMCG and oc->totalpages = mem_cgroup_get_max(oc->memcg) at line 261. Then select_bad_process(oc) is called at line 1171.',
    ['out_of_memory', 'select_bad_process'],
    state,
  ));

  // Frame 5: select_bad_process -> oom_evaluate_task for each task
  state.currentFunction = 'select_bad_process';
  state.phase = 'scanning_tasks';
  state.srcRef = 'mm/oom_kill.c:365 select_bad_process()';
  frames.push(makeFrame(
    5,
    'select_bad_process(): scan memcg tasks',
    'select_bad_process() at mm/oom_kill.c:365 sets oc->chosen_points = LONG_MIN at line 367. Since is_memcg_oom(oc) is true, it calls mem_cgroup_scan_tasks(oc->memcg, oom_evaluate_task, oc) at line 370 instead of iterating all system processes. This scans only tasks belonging to the over-limit memory cgroup, calling oom_evaluate_task() for each one.',
    ['select_bad_process', 'mem_cgroup_scan_tasks'],
    state,
  ));

  // Frame 6: oom_evaluate_task skips systemd (oom_score_adj = -1000)
  state.currentFunction = 'oom_evaluate_task';
  state.phase = 'evaluate_systemd';
  state.srcRef = 'mm/oom_kill.c:309 oom_evaluate_task()';
  state.tasks[0].state = 'evaluated';
  state.tasks[0].score = -Infinity;
  frames.push(makeFrame(
    6,
    'oom_evaluate_task(): skip systemd (oom_score_adj=-1000)',
    'oom_evaluate_task() at mm/oom_kill.c:309 is called for PID 100 (systemd). It first checks oom_unkillable_task(task) at line 314. Then calls oom_badness(task, oc->totalpages) at line 342. Inside oom_badness() at mm/oom_kill.c:202, adj = p->signal->oom_score_adj at line 219 is -1000 (OOM_SCORE_ADJ_MIN). The check at line 220 matches, so it returns LONG_MIN. Back in oom_evaluate_task(), points == LONG_MIN at line 343, so this task is skipped.',
    ['oom_evaluate_task', 'oom_badness', 'systemd'],
    state,
  ));

  // Frame 7: oom_badness scores webapp
  state.currentFunction = 'oom_badness';
  state.phase = 'evaluate_webapp';
  state.srcRef = 'mm/oom_kill.c:202 oom_badness()';
  const webappScore = 400 + 50 + 8; // rss + swap + pgtables
  state.tasks[1].state = 'evaluated';
  state.tasks[1].score = webappScore;
  frames.push(makeFrame(
    7,
    'oom_badness(): score webapp (PID 200)',
    'oom_badness() at mm/oom_kill.c:202 scores PID 200 (webapp). At line 231, points = get_mm_rss_sum(p->mm) + get_mm_counter_sum(p->mm, MM_SWAPENTS) + mm_pgtables_bytes(p->mm)/PAGE_SIZE = 400 + 50 + 8 = 458. adj = oom_score_adj * totalpages / 1000 at line 236; with oom_score_adj=0, adj=0. Final score = 458. This is the highest so far, so oc->chosen = task and oc->chosen_points = 458 at lines 350-351.',
    ['oom_badness', 'webapp'],
    state,
  ));

  // Frame 8: oom_badness scores cache-server
  state.phase = 'evaluate_cache';
  const cacheScore = 250 + 30 + 5;
  state.tasks[2].state = 'evaluated';
  state.tasks[2].score = cacheScore;
  frames.push(makeFrame(
    8,
    'oom_badness(): score cache-server (PID 300)',
    'oom_badness() scores PID 300 (cache-server). points = 250 + 30 + 5 = 285 at mm/oom_kill.c:231-232. With oom_score_adj=0, final score = 285. At line 343, points (285) < oc->chosen_points (458), so this task does not replace the current chosen victim (webapp PID 200). The goto next at line 344 skips to the next task.',
    ['oom_badness', 'cache-server'],
    state,
  ));

  // Frame 9: oom_badness scores logger with negative adj
  state.phase = 'evaluate_logger';
  const loggerBaseScore = 10 + 2 + 1;
  const loggerAdj = Math.floor(-500 * 1024 / 1000);
  state.tasks[3].state = 'evaluated';
  state.tasks[3].score = loggerBaseScore + loggerAdj;
  frames.push(makeFrame(
    9,
    'oom_badness(): score logger (PID 400, adj=-500)',
    'oom_badness() scores PID 400 (logger). Base points = 10 + 2 + 1 = 13 at mm/oom_kill.c:231-232. adj = -500 * totalpages / 1000 at line 236, giving a large negative adjustment. Final score is negative, well below webapp\'s 458. The logger is protected by its negative oom_score_adj. Scanning completes with webapp (PID 200) as oc->chosen.',
    ['oom_badness', 'logger'],
    state,
  ));

  // Frame 10: victim selected
  state.currentFunction = 'out_of_memory';
  state.phase = 'victim_selected';
  state.oomVictim = 'webapp (PID 200)';
  state.tasks[1].state = 'selected';
  state.srcRef = 'mm/oom_kill.c:1184 oom_kill_process()';
  frames.push(makeFrame(
    10,
    'Victim selected: webapp (PID 200, score 458)',
    'select_bad_process() returns with oc->chosen = webapp (PID 200) and oc->chosen_points = 458. Back in out_of_memory() at mm/oom_kill.c:1184, oc->chosen is non-NULL so oom_kill_process(oc, "Memory cgroup out of memory") is called at line 1185-1186. The task with the highest combined RSS + swap + page table usage, adjusted by oom_score_adj, is selected as the OOM victim.',
    ['out_of_memory', 'oom_kill_process'],
    state,
  ));

  return frames;
}

/* ---------- Scenario 3: oom-kill-execution ---------- */

function generateOomKillExecutionFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const tasks: TaskInfo[] = [
    { pid: 200, comm: 'webapp', rss: 400, swap: 50, pgtables: 8, oomScoreAdj: 0, score: 458, state: 'selected' },
    { pid: 201, comm: 'webapp-worker', rss: 100, swap: 10, pgtables: 2, oomScoreAdj: 0, score: null, state: 'running' },
  ];

  const state: MemcgOomState = {
    pageCounters: [
      { name: 'child (/sys/fs/cgroup/app)', usage: 512, max: 512, level: 'child' },
      { name: 'parent (/sys/fs/cgroup)', usage: 1024, max: 1024, level: 'parent' },
      { name: 'root_mem_cgroup', usage: 3900, max: 4096, level: 'root' },
    ],
    tasks: tasks.map(t => ({ ...t })),
    currentFunction: 'oom_kill_process',
    phase: 'kill_entry',
    chargeNrPages: 4,
    chargeSuccess: false,
    oomTriggered: true,
    oomVictim: 'webapp (PID 200)',
    oomReaperActive: false,
    srcRef: 'mm/oom_kill.c:1008 oom_kill_process()',
  };

  // Frame 0: oom_kill_process entry
  frames.push(makeFrame(
    0,
    'oom_kill_process(): begin kill sequence',
    'oom_kill_process() at mm/oom_kill.c:1024 receives oc->chosen = webapp (PID 200). At line 1036, it calls task_lock(victim) then checks task_will_free_mem(victim) at line 1037. If the victim is already exiting, mark_oom_victim() and queue_oom_reaper() are called at lines 1038-1039 and the function returns early. Otherwise, task_unlock(victim) at line 1044 proceeds with the kill.',
    ['oom_kill_process'],
    state,
  ));

  // Frame 1: check oom_group
  state.currentFunction = 'mem_cgroup_get_oom_group';
  state.phase = 'check_oom_group';
  state.srcRef = 'mm/oom_kill.c:1056 mem_cgroup_get_oom_group()';
  frames.push(makeFrame(
    1,
    'mem_cgroup_get_oom_group(): check group kill',
    'At mm/oom_kill.c:1056, oom_kill_process() calls mem_cgroup_get_oom_group(victim, oc->memcg) to check if memory.oom.group is set on this cgroup or any ancestor. If set, the entire cgroup hierarchy must be killed (not just the single victim). This enables cgroup-level OOM guarantees where all tasks in a group are killed together for clean teardown.',
    ['mem_cgroup_get_oom_group'],
    state,
  ));

  // Frame 2: __oom_kill_process entry
  state.currentFunction = '__oom_kill_process';
  state.phase = 'inner_kill';
  state.srcRef = 'mm/oom_kill.c:928 __oom_kill_process()';
  frames.push(makeFrame(
    2,
    '__oom_kill_process(): send SIGKILL',
    '__oom_kill_process() at mm/oom_kill.c:928 is called at line 1058. It calls find_lock_task_mm(victim) at line 934 to ensure the task still has a valid mm. At line 947, mm = victim->mm is grabbed with mmgrab(mm) at line 948. count_vm_event(OOM_KILL) at line 951 increments the global OOM kill counter. memcg_memory_event_mm(mm, MEMCG_OOM_KILL) at line 952 increments the memcg-specific kill counter.',
    ['__oom_kill_process', 'find_lock_task_mm'],
    state,
  ));

  // Frame 3: SIGKILL sent
  state.phase = 'sigkill_sent';
  state.srcRef = 'mm/oom_kill.c:959 do_send_sig_info(SIGKILL)';
  state.tasks[0].state = 'killed';
  frames.push(makeFrame(
    3,
    'do_send_sig_info(SIGKILL): kill signal delivered',
    'At mm/oom_kill.c:959, do_send_sig_info(SIGKILL, SEND_SIG_PRIV, victim, PIDTYPE_TGID) sends SIGKILL to the entire thread group. SIGKILL is sent BEFORE granting memory reserves to prevent the victim from depleting reserves. Then mark_oom_victim(victim) at line 960 sets TIF_MEMDIE on the victim thread (mm/oom_kill.c:774: test_and_set_tsk_thread_flag(tsk, TIF_MEMDIE)), granting it priority access to memory reserves for a clean exit.',
    ['do_send_sig_info', 'mark_oom_victim', 'TIF_MEMDIE'],
    state,
  ));

  // Frame 4: kill sibling threads sharing mm
  state.phase = 'kill_siblings';
  state.srcRef = 'mm/oom_kill.c:980 for_each_process()';
  state.tasks[1].state = 'killed';
  frames.push(makeFrame(
    4,
    'Kill sibling processes sharing victim mm',
    'At mm/oom_kill.c:980, __oom_kill_process() iterates for_each_process(p) to find all processes sharing the victim\'s mm_struct. process_shares_mm(p, mm) at line 981 checks if another process uses the same address space. If found (and not same_thread_group at line 983, not is_global_init at line 985), do_send_sig_info(SIGKILL) at line 999 kills them too. This prevents mm->mmap_lock livelock where a thread holds the lock while the victim tries to exit.',
    ['for_each_process', 'process_shares_mm'],
    state,
  ));

  // Frame 5: queue_oom_reaper
  state.currentFunction = 'queue_oom_reaper';
  state.phase = 'queue_reaper';
  state.srcRef = 'mm/oom_kill.c:702 queue_oom_reaper()';
  frames.push(makeFrame(
    5,
    'queue_oom_reaper(): schedule async memory reclaim',
    'At mm/oom_kill.c:1003-1004, if can_oom_reap is true (no global init sharing mm), queue_oom_reaper(victim) is called. Defined at line 702, it checks MMF_OOM_REAP_QUEUED at line 705 to avoid double-queuing. It calls get_task_struct(tsk) at line 708, then sets up a timer with timer_setup(&tsk->oom_reaper_timer, wake_oom_reaper, 0) at line 709. The timer expires after OOM_REAPER_DELAY (2*HZ = 2 seconds) at line 710, giving the victim time to exit naturally.',
    ['queue_oom_reaper', 'OOM_REAPER_DELAY'],
    state,
  ));

  // Frame 6: wake_oom_reaper
  state.currentFunction = 'wake_oom_reaper';
  state.phase = 'wake_reaper';
  state.srcRef = 'mm/oom_kill.c:672 wake_oom_reaper()';
  frames.push(makeFrame(
    6,
    'wake_oom_reaper(): timer fires, wake reaper thread',
    'After OOM_REAPER_DELAY, the timer callback wake_oom_reaper() at mm/oom_kill.c:672 fires. It checks MMF_OOM_SKIP at line 680 in case the victim already exited. If not, it acquires oom_reaper_lock at line 685, adds the task to oom_reaper_list at lines 686-687, and calls wake_up(&oom_reaper_wait) at line 690 to wake the oom_reaper kernel thread.',
    ['wake_oom_reaper', 'oom_reaper_list'],
    state,
  ));

  // Frame 7: oom_reaper thread runs
  state.currentFunction = 'oom_reaper';
  state.phase = 'reaper_running';
  state.oomReaperActive = true;
  state.srcRef = 'mm/oom_kill.c:650 oom_reaper()';
  frames.push(makeFrame(
    7,
    'oom_reaper(): kernel thread reclaims victim memory',
    'The oom_reaper() kernel thread at mm/oom_kill.c:650 runs in an infinite loop. At line 657, wait_event_freezable(oom_reaper_wait, oom_reaper_list != NULL) unblocks. It dequeues the task under oom_reaper_lock at lines 658-663 and calls oom_reap_task(tsk) at line 666. This calls __oom_reap_task_mm(mm) at mm/oom_kill.c:516 which iterates VMAs via mas_for_each_rev() at line 536, unmapping anonymous pages with unmap_page_range() at line 563.',
    ['oom_reaper', '__oom_reap_task_mm', 'unmap_page_range'],
    state,
  ));

  // Frame 8: memory reclaimed
  state.currentFunction = '__oom_reap_task_mm';
  state.phase = 'memory_reaped';
  state.srcRef = 'mm/oom_kill.c:516 __oom_reap_task_mm()';
  state.tasks[0].state = 'reaped';
  state.tasks[0].rss = 0;
  state.pageCounters[0].usage = 112;
  state.pageCounters[1].usage = 624;
  state.pageCounters[2].usage = 3500;
  frames.push(makeFrame(
    8,
    '__oom_reap_task_mm(): victim memory freed',
    '__oom_reap_task_mm() at mm/oom_kill.c:516 sets MMF_UNSTABLE at line 528 to warn userspace accessors. It iterates VMAs in reverse via mas_for_each_rev(&mas, vma, 0) at line 536, skipping VM_HUGETLB|VM_PFNMAP at line 537. For anonymous or non-shared VMAs (line 550), it sets up mmu_notifier_range, calls tlb_gather_mmu() at line 557, and unmap_page_range() at line 563 to release the pages. The page counters are decremented as pages are freed.',
    ['__oom_reap_task_mm', 'MMF_UNSTABLE', 'unmap_page_range'],
    state,
  ));

  // Frame 9: oom_reaper marks MMF_OOM_SKIP
  state.currentFunction = 'oom_reap_task';
  state.phase = 'oom_skip';
  state.srcRef = 'mm/oom_kill.c:644 mm_flags_set(MMF_OOM_SKIP)';
  state.tasks[0].state = 'reaped';
  frames.push(makeFrame(
    9,
    'MMF_OOM_SKIP: reaping complete',
    'After __oom_reap_task_mm() returns, oom_reap_task() at mm/oom_kill.c:638 sets tsk->oom_reaper_list = NULL. At line 644, mm_flags_set(MMF_OOM_SKIP, mm) marks the mm so future OOM scans skip this already-reaped task (checked in oom_badness() at line 221). put_task_struct(tsk) at line 646 drops the reference taken by queue_oom_reaper(). The victim process continues to exit via exit_oom_victim() which clears TIF_MEMDIE at mm/oom_kill.c:799.',
    ['MMF_OOM_SKIP', 'exit_oom_victim', 'TIF_MEMDIE'],
    state,
  ));

  return frames;
}

/* ---------- Scenario 4: memcg-id-api (v7.0) ---------- */

function generateMemcgIdApi(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: MemcgOomState = {
    pageCounters: [
      { name: 'parent (/sys/fs/cgroup)', usage: 300, max: 1024, level: 'parent' },
      { name: 'root_mem_cgroup', usage: 500, max: 4096, level: 'root' },
    ],
    tasks: [],
    currentFunction: 'mem_cgroup_css_alloc',
    phase: 'css_alloc_entry',
    chargeNrPages: 0,
    chargeSuccess: null,
    oomTriggered: false,
    oomVictim: null,
    oomReaperActive: false,
    srcRef: 'mm/memcontrol.c:3882 mem_cgroup_css_alloc()',
    memcgId: 0,
    memcgIdRef: 0,
    xarrayPublished: false,
  };

  // Frame 0: cgroup_mkdir triggers mem_cgroup_css_alloc
  frames.push(makeFrame(
    0,
    'cgroup_mkdir -> mem_cgroup_css_alloc()',
    'Userspace creates a new memory cgroup via mkdir(/sys/fs/cgroup/app2). The cgroup core invokes mem_cgroup_css_alloc() at mm/memcontrol.c:3882 to allocate the memcg struct. This function in turn calls mem_cgroup_alloc(parent) at line 3890, which is the routine that performs the ID allocation via the v7.0 private xarray API.',
    ['mem_cgroup_css_alloc'],
    state,
  ));

  // Frame 1: xa_alloc() allocates ID from mem_cgroup_private_ids
  state.currentFunction = 'mem_cgroup_alloc';
  state.phase = 'xa_alloc';
  state.memcgId = 42;
  state.srcRef = 'mm/memcontrol.c:3818 xa_alloc()';
  frames.push(makeFrame(
    1,
    'xa_alloc(): allocate private memcg ID',
    'mem_cgroup_alloc() at mm/memcontrol.c:3818 calls xa_alloc(&mem_cgroup_private_ids, &memcg->id.id, NULL, XA_LIMIT(1, MEM_CGROUP_ID_MAX), GFP_KERNEL). The xarray walks its radix tree to find the first unused ID in [1, MEM_CGROUP_ID_MAX], stores NULL as a placeholder to reserve the slot, and writes the chosen ID into memcg->id.id. Unlike the old idr_alloc API (pre-v7.0), the xarray provides lockless RCU reads and finer-grained internal locking.',
    ['xa_alloc', 'mem_cgroup_private_ids'],
    state,
  ));

  // Frame 2: id.id holds allocated value, id.ref is still uninit/zero
  state.phase = 'id_reserved';
  state.srcRef = 'mm/memcontrol.c:3818 xa_alloc()';
  frames.push(makeFrame(
    2,
    'memcg->id.id = 42; id.ref uninitialised',
    'xa_alloc() returned 0 (success). memcg->id.id now holds 42. Crucially, the slot in mem_cgroup_private_ids currently contains NULL, not the memcg pointer, so xa_load() by ID still returns NULL. The refcount memcg->id.ref is also uninitialised at this point. Any concurrent ID-based lookup will not yet see this memcg until css_online publishes it.',
    ['memcg_id', 'id.ref'],
    state,
  ));

  // Frame 3: cgroup core transitions to css_online
  state.currentFunction = 'mem_cgroup_css_online';
  state.phase = 'css_online_entry';
  state.srcRef = 'mm/memcontrol.c:3935 mem_cgroup_css_online()';
  frames.push(makeFrame(
    3,
    'mem_cgroup_css_online(): online transition',
    'After css_alloc returns a valid css, the cgroup core invokes mem_cgroup_css_online() at mm/memcontrol.c:3935. This is where the memcg moves from "allocated" to "discoverable". It first runs memcg_online_kmem() and alloc_shrinker_info(), then performs the two steps that the xarray-based private ID API requires: arm the refcount (refcount_set) and publish the pointer (xa_store).',
    ['mem_cgroup_css_online'],
    state,
  ));

  // Frame 4: refcount_set initialises id.ref to 1
  state.phase = 'refcount_init';
  state.memcgIdRef = 1;
  state.srcRef = 'mm/memcontrol.c:3956 refcount_set()';
  frames.push(makeFrame(
    4,
    'refcount_set(&memcg->id.ref, 1)',
    'At mm/memcontrol.c:3956, mem_cgroup_css_online() calls refcount_set(&memcg->id.ref, 1). This is the online-state pin: while the memcg is online, at least one refcount is held on its ID. The refcount_t protocol ensures saturation semantics — underflow or overflow trip WARN and leave the counter saturated, preventing use-after-free bugs if the pin is mishandled. css_get(css) at line 3957 then takes the matching css reference that the ID pins.',
    ['refcount_set', 'id.ref'],
    state,
  ));

  // Frame 5: xa_store publishes memcg pointer under its ID
  state.phase = 'xa_store_publish';
  state.xarrayPublished = true;
  state.srcRef = 'mm/memcontrol.c:3969 xa_store()';
  frames.push(makeFrame(
    5,
    'xa_store(): publish memcg under its ID',
    'At mm/memcontrol.c:3969, xa_store(&mem_cgroup_private_ids, memcg->id.id, memcg, GFP_KERNEL) overwrites the NULL placeholder with the actual memcg pointer. The store is the release barrier that publishes the fully-initialised memcg; after this, mem_cgroup_from_private_id() -> xa_load() will resolve the ID to this memcg under rcu_read_lock(). This ordering (refcount_set first, then xa_store) means every discoverable ID already has a non-zero id.ref, so id_get_online can safely use refcount_add_not_zero.',
    ['xa_store', 'mem_cgroup_private_ids'],
    state,
  ));

  // Frame 6: kmemcg_id mirrors memcg->id.id
  state.currentFunction = 'memcg_online_kmem';
  state.phase = 'kmemcg_id_set';
  state.srcRef = 'mm/memcontrol.c:3410 memcg_online_kmem()';
  frames.push(makeFrame(
    6,
    'memcg->kmemcg_id = memcg->id.id',
    'Earlier in mem_cgroup_css_online(), memcg_online_kmem() ran and at mm/memcontrol.c:3410 set memcg->kmemcg_id = memcg->id.id. Kernel memory (kmem) accounting reuses the same private ID space as the memcg, so slab objects tagged with kmemcg_id can be mapped back to this memcg through the same xarray. Keeping a single ID namespace avoids a second allocator and ensures slab/objcg consumers and memcg lookups stay in sync.',
    ['memcg_online_kmem', 'kmemcg_id'],
    state,
  ));

  // Frame 7: another task looks up memcg via xa_load (O(log n))
  state.currentFunction = 'mem_cgroup_from_private_id';
  state.phase = 'xa_load_lookup';
  state.srcRef = 'mm/memcontrol.c:3720 mem_cgroup_from_private_id()';
  frames.push(makeFrame(
    7,
    'xa_load(): O(log n) ID -> memcg lookup',
    'A consumer (e.g. workingset or objcg reclaim) wants to resolve an ID back to a memcg. Under rcu_read_lock(), mem_cgroup_from_private_id() at mm/memcontrol.c:3720 calls xa_load(&mem_cgroup_private_ids, id). The xarray walk is O(log n) through its radix nodes and is fully lockless on the read side. Because the memcg pointer was published via xa_store after refcount_set, the caller is guaranteed to see a fully-initialised memcg with id.ref > 0.',
    ['mem_cgroup_from_private_id', 'xa_load'],
    state,
  ));

  // Frame 8: rmdir -> refcount_sub_and_test drops the online pin
  state.currentFunction = 'mem_cgroup_private_id_put';
  state.phase = 'refcount_drop';
  state.memcgIdRef = 0;
  state.srcRef = 'mm/memcontrol.c:3688 refcount_sub_and_test()';
  frames.push(makeFrame(
    8,
    'refcount_sub_and_test(): drop online pin',
    'Userspace rmdir()s the cgroup. mem_cgroup_css_offline() drops the online-state pin via mem_cgroup_private_id_put(), which at mm/memcontrol.c:3688 calls refcount_sub_and_test(n, &memcg->id.ref). If the refcount reaches zero, the branch is taken and mem_cgroup_private_id_remove() is invoked. Using refcount_t instead of atomic_t gives saturating semantics and WARN on misuse, hardening the offline path against double-puts.',
    ['refcount_sub_and_test', 'id.ref'],
    state,
  ));

  // Frame 9: xa_erase releases ID back to the pool
  state.currentFunction = 'mem_cgroup_private_id_remove';
  state.phase = 'xa_erase';
  state.memcgId = 0;
  state.xarrayPublished = false;
  state.srcRef = 'mm/memcontrol.c:3681 xa_erase()';
  frames.push(makeFrame(
    9,
    'xa_erase(): release ID back to pool',
    'mem_cgroup_private_id_remove() at mm/memcontrol.c:3681 calls xa_erase(&mem_cgroup_private_ids, memcg->id.id) to remove the entry and free the ID back to the xarray for reuse, then sets memcg->id.id = 0. After this point any racing xa_load() will see NULL. The final css_put(&memcg->css) at line 3692 drops the reference the ID was holding, allowing the css to be freed.',
    ['xa_erase', 'mem_cgroup_private_id_remove'],
    state,
  ));

  // Frame 10: contrast with pre-v7.0 idr_alloc-based API
  state.currentFunction = 'xa_alloc';
  state.phase = 'summary';
  state.srcRef = 'mm/memcontrol.c:3676 mem_cgroup_private_ids (xarray)';
  frames.push(makeFrame(
    10,
    'v7.0 xarray vs pre-v7.0 idr: what changed',
    'Pre-v7.0 used idr_alloc()/idr_remove() with an idr_lock spinlock guarding a radix-tree-like idr. v7.0 switched to a private DEFINE_XARRAY_ALLOC1(mem_cgroup_private_ids) at mm/memcontrol.c:3676, giving three wins: (1) lockless RCU reads via xa_load, (2) finer-grained internal xa_lock on modifications, (3) built-in ID allocation via xa_alloc/XA_LIMIT without an auxiliary bitmap. The online protocol (xa_alloc placeholder -> refcount_set -> xa_store pointer -> xa_erase on release) makes the publish/retire races explicit.',
    ['xa_alloc', 'xarray', 'idr'],
    state,
  ));

  return frames;
}

/* ---------- SVG Rendering ---------- */

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function svgText(x: number, y: number, text: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = svgEl('text', { x, y, 'font-size': 12, fill: '#e0e0e0', ...attrs });
  el.textContent = text;
  return el;
}

function renderPageCounters(
  container: SVGGElement,
  counters: PageCounterNode[],
  highlights: string[],
  width: number,
): void {
  const barWidth = width * 0.6;
  const barHeight = 28;
  const startX = width * 0.2;
  let y = 40;

  container.appendChild(svgText(width / 2, 20, 'Page Counter Hierarchy', {
    'text-anchor': 'middle', 'font-size': 16, 'font-weight': 'bold', fill: '#ffffff',
  }));

  for (const pc of counters) {
    const isHighlighted = highlights.some(h => h.includes(pc.level) || h.includes(pc.name));
    const fillRatio = pc.max > 0 ? pc.usage / pc.max : 0;
    const fillColor = fillRatio > 0.9 ? '#ef4444' : fillRatio > 0.7 ? '#f59e0b' : '#22c55e';

    // Background bar
    const bg = svgEl('rect', { x: startX, y, width: barWidth, height: barHeight, rx: 4, fill: '#374151' });
    if (isHighlighted) bg.setAttribute('class', 'anim-highlight');
    container.appendChild(bg);

    // Fill bar
    container.appendChild(svgEl('rect', {
      x: startX, y, width: barWidth * fillRatio, height: barHeight, rx: 4, fill: fillColor,
    }));

    // Label
    container.appendChild(svgText(startX - 5, y + 18, pc.name, { 'text-anchor': 'end', 'font-size': 10 }));

    // Usage text
    container.appendChild(svgText(startX + barWidth / 2, y + 18, `${pc.usage} / ${pc.max}`, {
      'text-anchor': 'middle', 'font-size': 11, fill: '#ffffff',
    }));

    y += barHeight + 12;
  }
}

function renderTasks(
  container: SVGGElement,
  tasks: TaskInfo[],
  highlights: string[],
  width: number,
  yOffset: number,
): void {
  container.appendChild(svgText(width / 2, yOffset, 'Tasks', {
    'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold', fill: '#ffffff',
  }));

  const colW = Math.min(160, (width - 40) / tasks.length);
  const startX = (width - colW * tasks.length) / 2;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const x = startX + i * colW;
    const y = yOffset + 15;
    const isHighlighted = highlights.some(h => h.includes(t.comm));

    const stateColors: Record<string, string> = {
      running: '#3b82f6',
      evaluated: '#8b5cf6',
      selected: '#f59e0b',
      killed: '#ef4444',
      reaped: '#6b7280',
    };

    const rect = svgEl('rect', {
      x, y, width: colW - 8, height: 70, rx: 4,
      fill: stateColors[t.state] || '#374151',
      stroke: isHighlighted ? '#ffffff' : 'none',
      'stroke-width': isHighlighted ? 2 : 0,
    });
    if (isHighlighted) rect.setAttribute('class', 'anim-highlight');
    container.appendChild(rect);

    container.appendChild(svgText(x + (colW - 8) / 2, y + 16, `${t.comm}`, { 'text-anchor': 'middle', 'font-size': 10, fill: '#ffffff' }));
    container.appendChild(svgText(x + (colW - 8) / 2, y + 30, `PID ${t.pid}`, { 'text-anchor': 'middle', 'font-size': 9, fill: '#d1d5db' }));
    container.appendChild(svgText(x + (colW - 8) / 2, y + 44, `RSS:${t.rss} Swap:${t.swap}`, { 'text-anchor': 'middle', 'font-size': 9, fill: '#d1d5db' }));
    if (t.score !== null) {
      container.appendChild(svgText(x + (colW - 8) / 2, y + 58, `Score: ${t.score}`, { 'text-anchor': 'middle', 'font-size': 9, fill: '#fbbf24' }));
    } else {
      container.appendChild(svgText(x + (colW - 8) / 2, y + 58, t.state, { 'text-anchor': 'middle', 'font-size': 9, fill: '#9ca3af' }));
    }
  }
}

function renderOomReaperIndicator(
  container: SVGGElement,
  active: boolean,
  width: number,
  yOffset: number,
): void {
  if (!active) return;
  const rect = svgEl('rect', {
    x: width / 2 - 100, y: yOffset, width: 200, height: 30, rx: 4, fill: '#dc2626',
  });
  rect.setAttribute('class', 'anim-highlight');
  container.appendChild(rect);
  container.appendChild(svgText(width / 2, yOffset + 20, 'OOM Reaper Active (oom_reaper kthread)', {
    'text-anchor': 'middle', 'font-size': 11, fill: '#ffffff', 'font-weight': 'bold',
  }));
}

/* ---------- Module export ---------- */

const memcgOomModule: AnimationModule = {
  config: {
    id: 'memcg-oom',
    title: 'Memory Cgroup Charging & OOM Killer',
    skillName: 'memcg-and-oom',
  },

  getScenarios(): AnimationScenario[] {
    return [
      { id: 'memcg-charge-hierarchy', label: 'Memcg Hierarchical Charge' },
      { id: 'oom-killer-scoring', label: 'OOM Killer Scoring' },
      { id: 'oom-kill-execution', label: 'OOM Kill Execution' },
      { id: 'memcg-id-api', label: 'Private memcg ID API (v7.0)' },
    ];
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario ?? 'memcg-charge-hierarchy') {
      case 'memcg-charge-hierarchy':
        return generateChargeHierarchyFrames();
      case 'oom-killer-scoring':
        return generateOomScoringFrames();
      case 'oom-kill-execution':
        return generateOomKillExecutionFrames();
      case 'memcg-id-api':
        return generateMemcgIdApi();
      default:
        return generateChargeHierarchyFrames();
    }
  },

  renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
    container.innerHTML = '';
    const data = frame.data as MemcgOomState;

    // Header: current function
    const headerEl = svgText(width / 2, 16, data.currentFunction + '()', {
      'text-anchor': 'middle', 'font-size': 13, fill: '#60a5fa', 'font-weight': 'bold',
    });
    if (frame.highlights.length > 0) {
      headerEl.setAttribute('class', 'anim-highlight');
    }
    container.appendChild(headerEl);

    // Page counters
    if (data.pageCounters.length > 0) {
      renderPageCounters(container, data.pageCounters, frame.highlights, width);
    }

    // Tasks
    if (data.tasks.length > 0) {
      const taskY = data.pageCounters.length > 0 ? 180 : 40;
      renderTasks(container, data.tasks, frame.highlights, width, taskY);
    }

    // OOM reaper indicator
    renderOomReaperIndicator(container, data.oomReaperActive, width, height - 50);

    // Source reference
    container.appendChild(svgText(10, height - 8, data.srcRef, { 'font-size': 9, fill: '#9ca3af' }));
  },
};

export default memcgOomModule;
