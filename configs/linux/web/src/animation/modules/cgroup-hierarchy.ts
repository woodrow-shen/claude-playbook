import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CgroupState {
  hierarchy: Array<{
    name: string;
    path: string;
    controllers: string[];
    processes: number[];
    limits: Record<string, string>;
  }>;
  currentCgroup: string;
  currentFunction: string;
  phase: 'mkdir' | 'create' | 'enable-controllers' | 'attach-write' | 'migrate' | 'css-set-move' | 'charge' | 'limit-check' | 'reclaim' | 'cpu-alloc' | 'cpu-attach' | 'running';
  chargeAmount: number | null;
  srcRef: string;
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  state: CgroupState,
): AnimationFrame {
  return {
    step,
    label,
    description,
    highlights,
    data: {
      hierarchy: state.hierarchy.map(h => ({
        ...h,
        controllers: [...h.controllers],
        processes: [...h.processes],
        limits: { ...h.limits },
      })),
      currentCgroup: state.currentCgroup,
      currentFunction: state.currentFunction,
      phase: state.phase,
      chargeAmount: state.chargeAmount,
      srcRef: state.srcRef,
    } satisfies CgroupState,
  };
}

function generateCreationAndAttachFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Frame 0: cgroup_mkdir entry
  const state: CgroupState = {
    hierarchy: [
      { name: '/', path: '/sys/fs/cgroup', controllers: ['cpu', 'memory', 'io', 'pids'], processes: [1, 100, 200], limits: {} },
    ],
    currentCgroup: '/',
    currentFunction: 'cgroup_mkdir',
    phase: 'mkdir',
    chargeAmount: null,
    srcRef: 'kernel/cgroup/cgroup.c:5942 cgroup_mkdir()',
  };
  frames.push(makeFrame(
    0,
    'Entry: cgroup_mkdir()',
    'When userspace runs mkdir /sys/fs/cgroup/mygroup, the kernfs filesystem triggers cgroup_mkdir() at kernel/cgroup/cgroup.c:5994. The function first rejects names containing newlines at line 6000 to keep /proc/<pid>/cgroup parsable. It then acquires the parent cgroup via cgroup_kn_lock_live(parent_kn, false) at line 6003 and checks hierarchy depth limits with cgroup_check_hierarchy_limits(parent) at line 6007. If limits are exceeded, it returns -EAGAIN.',
    ['cgroup_mkdir'],
    state,
  ));

  // Frame 1: cgroup_create allocates the cgroup
  state.currentFunction = 'cgroup_create';
  state.phase = 'create';
  state.srcRef = 'kernel/cgroup/cgroup.c:5845 cgroup_create()';
  frames.push(makeFrame(
    1,
    'cgroup_create(): allocate cgroup struct',
    'cgroup_mkdir() calls cgroup_create(parent, name, mode) at kernel/cgroup/cgroup.c:6012. Defined at line 5845, cgroup_create() allocates the cgroup struct via kzalloc_flex() at line 5855, with space for ancestor pointers up to the current level. It initializes percpu_ref for the css refcount at line 5859, creates the kernfs directory via kernfs_create_dir_ns() at line 5864, and calls init_cgroup_housekeeping(cgrp) at line 5873. The parent link is set at line 5875 (cgrp->self.parent = &parent->self) and the level at line 5877.',
    ['cgroup_create'],
    state,
  ));

  // Frame 2: cgroup directory populated and controllers enabled
  state.hierarchy.push({
    name: 'mygroup',
    path: '/sys/fs/cgroup/mygroup',
    controllers: ['cpu', 'memory', 'io', 'pids'],
    processes: [],
    limits: {},
  });
  state.currentCgroup = '/mygroup';
  state.currentFunction = 'cgroup_apply_control_enable';
  state.phase = 'enable-controllers';
  state.srcRef = 'kernel/cgroup/cgroup.c:3375 cgroup_apply_control_enable()';
  frames.push(makeFrame(
    2,
    'cgroup_apply_control_enable(): enable controllers',
    'After cgroup_create() returns, cgroup_mkdir() calls css_populate_dir(&cgrp->self) at line 6024 to create the standard cgroup interface files (cgroup.procs, cgroup.controllers, etc). Then cgroup_apply_control_enable(cgrp) at line 6028 iterates all live descendants via cgroup_for_each_live_descendant_pre() at line 3382. For each enabled subsystem (checked via cgroup_ss_mask at line 3386), it calls css_create(dsct, ss) at line 3390 to allocate a cgroup_subsys_state. If the css is visible, css_populate_dir(css) at line 3398 creates the controller-specific files (memory.max, cpu.max, etc).',
    ['cgroup_apply_control_enable', 'css_create'],
    state,
  ));

  // Frame 3: cgroup_mkdir completes
  state.currentFunction = 'cgroup_mkdir';
  state.srcRef = 'kernel/cgroup/cgroup.c:6032 cgroup_mkdir() completion';
  frames.push(makeFrame(
    3,
    'cgroup_mkdir(): directory creation complete',
    'cgroup_mkdir() emits TRACE_CGROUP_PATH(mkdir, cgrp) at line 6032 for ftrace, then calls cgroup_kn_unlock(parent_kn) at line 6040 to release the parent lock. The new cgroup /sys/fs/cgroup/mygroup is now visible in the filesystem with all inherited controllers enabled. The kernfs directory node was pinned with kernfs_get(cgrp->kn) at line 6022 to ensure it remains accessible until css_free_rwork_fn() releases it during cgroup destruction.',
    ['cgroup_mkdir', 'mygroup'],
    state,
  ));

  // Frame 4: cgroup_procs_write entry (echo PID > cgroup.procs)
  state.currentFunction = 'cgroup_procs_write';
  state.phase = 'attach-write';
  state.srcRef = 'kernel/cgroup/cgroup.c:5411 cgroup_procs_write()';
  frames.push(makeFrame(
    4,
    'cgroup_procs_write(): attach process',
    'When userspace writes a PID to cgroup.procs (echo 200 > /sys/fs/cgroup/mygroup/cgroup.procs), cgroup_procs_write() at kernel/cgroup/cgroup.c:5411 dispatches to __cgroup_procs_write(of, buf, true) at line 5414. Defined at line 5366, __cgroup_procs_write() locks the destination cgroup via cgroup_kn_lock_live() at line 5375, looks up the task via cgroup_procs_write_start() at line 5379, finds the source cgroup via task_cgroup_from_root() at line 5386 under css_set_lock, and checks permissions with cgroup_attach_permissions() at line 5395.',
    ['cgroup_procs_write', '__cgroup_procs_write'],
    state,
  ));

  // Frame 5: cgroup_attach_task
  state.currentFunction = 'cgroup_attach_task';
  state.srcRef = 'kernel/cgroup/cgroup.c:3020 cgroup_attach_task()';
  frames.push(makeFrame(
    5,
    'cgroup_attach_task(): prepare migration',
    '__cgroup_procs_write() calls cgroup_attach_task(dst_cgrp, task, threadgroup) at line 5401. Defined at kernel/cgroup/cgroup.c:3020, cgroup_attach_task() first iterates the task (or all threads if threadgroup=true) under css_set_lock at line 3028-3034, calling cgroup_migrate_add_src() at line 3031 to record each source css_set. It then calls cgroup_migrate_prepare_dst(&mgctx) at line 3038 to find or create destination css_sets that match the new cgroup assignment, and proceeds to cgroup_migrate() at line 3040.',
    ['cgroup_attach_task', 'cgroup_migrate_add_src'],
    state,
  ));

  // Frame 6: cgroup_migrate
  state.currentFunction = 'cgroup_migrate';
  state.phase = 'migrate';
  state.srcRef = 'kernel/cgroup/cgroup.c:2990 cgroup_migrate()';
  frames.push(makeFrame(
    6,
    'cgroup_migrate(): execute task migration',
    'cgroup_migrate() at kernel/cgroup/cgroup.c:2990 acquires css_set_lock at line 3000, iterates the task or threadgroup calling cgroup_migrate_add_task(task, mgctx) at line 3003 for each thread. This adds the task to the migration context. Then cgroup_migrate_execute(mgctx) at line 3009 performs the actual migration: for each task, it calls css_set_move_task() to move the task between css_sets, invokes the subsystem attach callbacks (ss->attach()), and updates the task css_set pointer.',
    ['cgroup_migrate', 'cgroup_migrate_execute'],
    state,
  ));

  // Frame 7: css_set_move_task
  state.currentFunction = 'css_set_move_task';
  state.phase = 'css-set-move';
  state.srcRef = 'kernel/cgroup/cgroup.c:919 css_set_move_task()';
  state.hierarchy[1].processes.push(200);
  state.hierarchy[0].processes = [1, 100];
  frames.push(makeFrame(
    7,
    'css_set_move_task(): update css_set linkage',
    'css_set_move_task() at kernel/cgroup/cgroup.c:919 performs the actual task movement between css_sets under css_set_lock (asserted at line 923). If the destination css_set was unpopulated, css_set_update_populated(to_cset, true) is called at line 926 to mark it populated and trigger cgroup.events notifications. The task is removed from the source css_set task list via list_del_init(&task->cg_list) at line 932, and css_set_skip_task_iters() at line 931 ensures concurrent iterators skip the moved task. The task is then added to the destination via cgroup_move_task() at line 948 and list_add_tail() at line 949.',
    ['css_set_move_task', 'cgroup_move_task'],
    state,
  ));

  // Frame 8: Migration complete, task in new cgroup
  state.currentFunction = 'cgroup_attach_task';
  state.phase = 'running';
  state.srcRef = 'kernel/cgroup/cgroup.c:3044 cgroup_attach_task() completion';
  frames.push(makeFrame(
    8,
    'Task attached to new cgroup',
    'cgroup_attach_task() completes with cgroup_migrate_finish(&mgctx) at line 3042, which releases migration resources. On success, TRACE_CGROUP_PATH(attach_task, dst_cgrp, leader, threadgroup) at line 3045 emits a trace event. The task (PID 200) is now in /sys/fs/cgroup/mygroup and subject to all controllers enabled on that cgroup. The task css_set now points to the css_set associated with the destination cgroup, linking the task to the correct cgroup_subsys_state for each controller (memory, cpu, io, pids).',
    ['complete', 'mygroup'],
    state,
  ));

  return frames;
}

function generateMemoryLimitFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: CgroupState = {
    hierarchy: [
      { name: '/', path: '/sys/fs/cgroup', controllers: ['memory'], processes: [1], limits: {} },
      { name: 'app', path: '/sys/fs/cgroup/app', controllers: ['memory'], processes: [500], limits: {} },
    ],
    currentCgroup: '/app',
    currentFunction: 'memory_max_write',
    phase: 'limit-check',
    chargeAmount: null,
    srcRef: 'mm/memcontrol.c:4502 memory_max_write()',
  };

  // Frame 0: Set memory.max
  frames.push(makeFrame(
    0,
    'memory_max_write(): set memory.max limit',
    'Writing to memory.max triggers memory_max_write() at mm/memcontrol.c:4442. The function parses the limit value via page_counter_memparse(buf, "max", &max) at line 4452 and stores it with xchg(&memcg->memory.max, max) at line 4456. If the file was not opened with O_NONBLOCK, the function enters a reclaim loop at line 4461: it reads current usage with page_counter_read(&memcg->memory) at line 4462 and if usage exceeds the new limit, it first calls drain_all_stock(memcg) at line 4471 to flush per-cpu charge caches, then tries try_to_free_mem_cgroup_pages() at line 4477.',
    ['memory_max_write', 'page_counter'],
    state,
  ));

  // Frame 1: mem_cgroup_css_alloc (how the memory controller was set up)
  state.currentFunction = 'mem_cgroup_css_alloc';
  state.hierarchy[1].limits = { 'memory.max': '256M' };
  state.srcRef = 'mm/memcontrol.c:3823 mem_cgroup_css_alloc()';
  frames.push(makeFrame(
    1,
    'mem_cgroup_css_alloc(): memory controller setup',
    'When the memory controller is enabled for a cgroup, cgroup_apply_control_enable() calls css_create() which invokes mem_cgroup_css_alloc() at mm/memcontrol.c:3823. It allocates a mem_cgroup via mem_cgroup_alloc(parent) at line 3830, initializes memory.high to PAGE_COUNTER_MAX at line 3835, and sets up hierarchical page counters via page_counter_init(&memcg->memory, &parent->memory, memcg_on_dfl) at line 3845. The parent pointer enables hierarchical limit checking: charges propagate up the tree through the page_counter parent chain.',
    ['mem_cgroup_css_alloc', 'page_counter_init'],
    state,
  ));

  // Frame 2: Process allocates memory, __mem_cgroup_charge entry
  state.currentFunction = '__mem_cgroup_charge';
  state.phase = 'charge';
  state.chargeAmount = 4096;
  state.srcRef = 'mm/memcontrol.c:4755 __mem_cgroup_charge()';
  frames.push(makeFrame(
    2,
    '__mem_cgroup_charge(): charge page to cgroup',
    'When a process in the cgroup allocates a page (e.g., via page fault), the page allocator calls __mem_cgroup_charge(folio, mm, gfp) at mm/memcontrol.c:4755. It resolves the target memcg via get_mem_cgroup_from_mm(mm) at line 4760, which walks the task css_set to find the memory cgroup_subsys_state. Then charge_memcg(folio, memcg, gfp) at line 4761 performs the actual charge: it calls try_charge(memcg, gfp, folio_nr_pages(folio)) at mm/memcontrol.c:4744 to account the pages.',
    ['__mem_cgroup_charge', 'charge_memcg'],
    state,
  ));

  // Frame 3: try_charge_memcg - the core charging logic
  state.currentFunction = 'try_charge_memcg';
  state.srcRef = 'mm/memcontrol.c:2355 try_charge_memcg()';
  frames.push(makeFrame(
    3,
    'try_charge_memcg(): hierarchical charge accounting',
    'try_charge_memcg() at mm/memcontrol.c:2355 is the core charge path. It first attempts consume_stock(memcg, nr_pages) at line 2371 to use per-cpu cached charges for fast-path. If the stock is empty, it tries page_counter_try_charge(&memcg->memory, batch, &counter) at line 2380, which walks up the page_counter parent chain checking each ancestor memory.max limit. If the charge succeeds at all levels, it jumps to done_restock at line 2381. If it fails, mem_over_limit is set to the first ancestor whose limit was exceeded at line 2384.',
    ['try_charge_memcg', 'page_counter_try_charge', 'consume_stock'],
    state,
  ));

  // Frame 4: Charge succeeds under limit
  state.currentFunction = 'try_charge_memcg';
  state.phase = 'charge';
  state.srcRef = 'mm/memcontrol.c:2380 page_counter_try_charge()';
  frames.push(makeFrame(
    4,
    'page_counter_try_charge(): within memory.max',
    'When the total charged pages (including the new charge) remain below memory.max for this cgroup and all ancestors, page_counter_try_charge() at line 2380 succeeds. The counter is incremented atomically. Back in try_charge_memcg(), execution reaches done_restock at line 2381. If the batch was larger than nr_pages, the excess is stored in the per-cpu stock via refill_stock(memcg, batch - nr_pages) for subsequent fast-path charges. charge_memcg() then calls commit_charge(folio, memcg) at mm/memcontrol.c:4749 to stamp the folio with the memcg owner.',
    ['page_counter_try_charge', 'commit_charge'],
    state,
  ));

  // Frame 5: Charge fails, over limit - reclaim path
  state.currentFunction = 'try_charge_memcg';
  state.phase = 'limit-check';
  state.chargeAmount = 65536;
  state.srcRef = 'mm/memcontrol.c:2384 mem_over_limit path';
  frames.push(makeFrame(
    5,
    'Over memory.max: reclaim triggered',
    'When page_counter_try_charge() fails because the charge would exceed memory.max, mem_over_limit is set to the cgroup that hit its limit at mm/memcontrol.c:2384. The function emits __memcg_memory_event(mem_over_limit, MEMCG_MAX) at line 2410 to notify userspace watchers. It then enters the reclaim path: psi_memstall_enter() at line 2413 records memory pressure, and try_to_free_mem_cgroup_pages(mem_over_limit, nr_pages, gfp_mask, reclaim_options, NULL) at line 2414 attempts to reclaim pages by scanning the LRU lists within the cgroup.',
    ['try_charge_memcg', 'try_to_free_mem_cgroup_pages'],
    state,
  ));

  // Frame 6: Reclaim fails, OOM path
  state.currentFunction = 'mem_cgroup_oom';
  state.phase = 'reclaim';
  state.srcRef = 'mm/memcontrol.c:1706 mem_cgroup_oom()';
  frames.push(makeFrame(
    6,
    'mem_cgroup_oom(): OOM killer invoked',
    'If reclaim cannot free enough pages after MAX_RECLAIM_RETRIES (line 2359) attempts, and the charge still fails, try_charge_memcg() calls mem_cgroup_oom(mem_over_limit, gfp_mask, get_order(nr_pages * PAGE_SIZE)) at line 2456. Defined at mm/memcontrol.c:1706, mem_cgroup_oom() calls mem_cgroup_out_of_memory(memcg, mask, order) at line 1718. mem_cgroup_out_of_memory() at line 1673 acquires oom_lock at line 1685, checks margin one more time at line 1688, and calls out_of_memory(&oc) at line 1695 to select and kill a victim process within the cgroup.',
    ['mem_cgroup_oom', 'mem_cgroup_out_of_memory', 'out_of_memory'],
    state,
  ));

  // Frame 7: memory_high_write and high limit enforcement
  state.currentFunction = 'memory_high_write';
  state.phase = 'limit-check';
  state.chargeAmount = null;
  state.srcRef = 'mm/memcontrol.c:4390 memory_high_write()';
  frames.push(makeFrame(
    7,
    'memory_high_write(): soft throttling via memory.high',
    'The memory.high limit provides soft throttling before hitting the hard memory.max. memory_high_write() at mm/memcontrol.c:4390 parses the value and sets it via page_counter_set_high(&memcg->memory, high) at line 4404. When usage exceeds memory.high during charging, the task is throttled with direct reclaim. The reclaim loop at line 4409 calls try_to_free_mem_cgroup_pages() at line 4425. Unlike memory.max which triggers OOM, memory.high applies backpressure by slowing allocating tasks, giving them time to reduce their memory footprint.',
    ['memory_high_write', 'page_counter_set_high'],
    state,
  ));

  // Frame 8: Hierarchical accounting summary
  state.currentFunction = 'page_counter_try_charge';
  state.phase = 'running';
  state.srcRef = 'mm/memcontrol.c:2380 hierarchical page_counter chain';
  frames.push(makeFrame(
    8,
    'Hierarchical memory accounting complete',
    'The memory controller enforces limits hierarchically through the page_counter parent chain initialized in mem_cgroup_css_alloc(). When page_counter_try_charge() walks up from a child memcg, it checks memory.max at every ancestor level. A child cgroup with memory.max=256M inside a parent with memory.max=1G is effectively limited to 256M, but the parent 1G limit also constrains the aggregate usage of all children. The charge accounting uses per-cpu batching (MEMCG_CHARGE_BATCH at line 2358) for performance, with periodic synchronization via drain_all_stock().',
    ['hierarchical', 'page_counter'],
    state,
  ));

  return frames;
}

function generateCpuControllerFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: CgroupState = {
    hierarchy: [
      { name: '/', path: '/sys/fs/cgroup', controllers: ['cpu', 'memory'], processes: [1], limits: {} },
    ],
    currentCgroup: '/',
    currentFunction: 'cgroup_apply_control_enable',
    phase: 'enable-controllers',
    chargeAmount: null,
    srcRef: 'kernel/cgroup/cgroup.c:3411 cgroup_apply_control_enable()',
  };

  // Frame 0: Enable cpu controller on a child cgroup
  frames.push(makeFrame(
    0,
    'Enable cpu controller on cgroup',
    'To enable the cpu controller on a child cgroup, userspace writes "+cpu" to cgroup.subtree_control. This triggers cgroup_apply_control_enable() at kernel/cgroup/cgroup.c:3375, which iterates live descendants at line 3382 via cgroup_for_each_live_descendant_pre(). For each cgroup where the cpu subsystem is in the control mask (checked at line 3386), it calls css_create(dsct, ss) at line 3390 to allocate a cgroup_subsys_state. The css_create() function invokes the subsystem css_alloc callback, which for the cpu controller is cpu_cgroup_css_alloc().',
    ['cgroup_apply_control_enable', 'css_create'],
    state,
  ));

  // Frame 1: cpu_cgroup_css_alloc creates task_group
  state.hierarchy.push({
    name: 'app',
    path: '/sys/fs/cgroup/app',
    controllers: ['cpu'],
    processes: [],
    limits: {},
  });
  state.currentCgroup = '/app';
  state.currentFunction = 'cpu_cgroup_css_alloc';
  state.phase = 'cpu-alloc';
  state.srcRef = 'kernel/sched/core.c:9197 cpu_cgroup_css_alloc()';
  frames.push(makeFrame(
    1,
    'cpu_cgroup_css_alloc(): create task_group',
    'cpu_cgroup_css_alloc() at kernel/sched/core.c:9197 is the css_alloc callback for the cpu controller. It extracts the parent task_group via css_tg(parent_css) at line 9199. If parent is NULL (root cgroup), it returns the root_task_group at line 9204. Otherwise, it calls sched_create_group(parent) at line 9207 (defined at kernel/sched/core.c:9062) to allocate a new task_group. sched_create_group() allocates per-cpu CFS run queues (cfs_rq) and scheduling entities (se) for the group, linking them into the scheduler hierarchy.',
    ['cpu_cgroup_css_alloc', 'sched_create_group'],
    state,
  ));

  // Frame 2: cpu_cgroup_css_online
  state.currentFunction = 'cpu_cgroup_css_online';
  state.srcRef = 'kernel/sched/core.c:9215 cpu_cgroup_css_online()';
  frames.push(makeFrame(
    2,
    'cpu_cgroup_css_online(): activate task_group',
    'After css_alloc(), the cgroup core calls cpu_cgroup_css_online() at kernel/sched/core.c:9215. It first calls scx_tg_online(tg) at line 9221 to notify the sched_ext BPF scheduler framework. Then sched_online_group(tg, parent) at line 9226 activates the task_group by inserting its per-cpu CFS scheduling entities into the parent CFS run queue hierarchy. This makes the group visible to the CFS scheduler for bandwidth allocation and load balancing.',
    ['cpu_cgroup_css_online', 'sched_online_group'],
    state,
  ));

  // Frame 3: cpu_max_write sets CFS bandwidth
  state.currentFunction = 'cpu_max_write';
  state.hierarchy[1].limits = { 'cpu.max': '50000 100000' };
  state.srcRef = 'kernel/sched/core.c:10177 cpu_max_write()';
  frames.push(makeFrame(
    3,
    'cpu_max_write(): set CFS bandwidth quota',
    'Writing "50000 100000" to cpu.max triggers cpu_max_write() at kernel/sched/core.c:10177. This means 50ms quota per 100ms period (50% CPU). The function extracts the current period via tg_bandwidth(tg, &period_us, NULL, &burst_us) at line 10184, parses the new values with cpu_period_quota_parse(buf, &period_us, &quota_us) at line 10185, then calls tg_set_bandwidth(tg, period_us, quota_us, burst_us) at line 10187. tg_set_bandwidth() at line 9775 validates the values (minimum period at line 9795, maximum at line 9804) and configures the CFS bandwidth timer.',
    ['cpu_max_write', 'tg_set_bandwidth'],
    state,
  ));

  // Frame 4: tg_set_bandwidth configures CFS bandwidth throttling
  state.currentFunction = 'tg_set_bandwidth';
  state.srcRef = 'kernel/sched/core.c:9775 tg_set_bandwidth()';
  frames.push(makeFrame(
    4,
    'tg_set_bandwidth(): configure bandwidth throttling',
    'tg_set_bandwidth() at kernel/sched/core.c:9775 validates that the task_group is not root at line 9781 (root cannot have bandwidth limits). It checks period and quota values survive conversion to nanoseconds at line 9785 and enforces minimum values at line 9795. The function configures the CFS bandwidth structure (cfs_bandwidth) which tracks the quota remaining in the current period. When a cfs_rq exhausts its quota, CFS throttles it by dequeuing its scheduling entity, preventing the group from running until the bandwidth timer replenishes the quota at the start of the next period.',
    ['tg_set_bandwidth', 'cfs_bandwidth'],
    state,
  ));

  // Frame 5: Attach a task to the cpu-controlled cgroup
  state.currentFunction = 'cgroup_attach_task';
  state.phase = 'cpu-attach';
  state.srcRef = 'kernel/cgroup/cgroup.c:3020 cgroup_attach_task()';
  frames.push(makeFrame(
    5,
    'cgroup_attach_task(): move task to cpu cgroup',
    'When a task is moved into the cgroup via echo PID > cgroup.procs, cgroup_attach_task() at kernel/cgroup/cgroup.c:3020 runs the migration flow. After css_set_move_task() updates the css_set linkage, the cgroup core calls each subsystem attach callback. For the cpu controller, this triggers cpu_cgroup_attach() which moves the task into the new task_group scheduling hierarchy, changing which CFS run queue the task is enqueued on.',
    ['cgroup_attach_task', 'cpu_cgroup_attach'],
    state,
  ));

  // Frame 6: cpu_cgroup_attach calls sched_move_task
  state.currentFunction = 'cpu_cgroup_attach';
  state.hierarchy[1].processes.push(300);
  state.srcRef = 'kernel/sched/core.c:9280 cpu_cgroup_attach()';
  frames.push(makeFrame(
    6,
    'cpu_cgroup_attach(): trigger sched_move_task()',
    'cpu_cgroup_attach() at kernel/sched/core.c:9280 iterates all tasks in the migration set via cgroup_taskset_for_each(task, css, tset) at line 9285, calling sched_move_task(task, false) at line 9286 for each one. The false argument indicates this is not an autogroup move. This is the critical bridge between the cgroup subsystem and the scheduler: it ensures the task scheduling entity is moved to the correct CFS run queue hierarchy.',
    ['cpu_cgroup_attach', 'sched_move_task'],
    state,
  ));

  // Frame 7: sched_move_task re-enqueues the task
  state.currentFunction = 'sched_move_task';
  state.srcRef = 'kernel/sched/core.c:9169 sched_move_task()';
  frames.push(makeFrame(
    7,
    'sched_move_task(): re-enqueue in new task_group',
    'sched_move_task() at kernel/sched/core.c:9169 acquires the task rq lock at line 9176 and enters a sched_change scope at line 9179 which dequeues the task with DEQUEUE_SAVE|DEQUEUE_MOVE flags (line 9171). Inside the scope, sched_change_group(tsk) at line 9180 updates the task scheduling entity to point to the new task_group CFS run queue. scx_cgroup_move_task(tsk) at line 9182 notifies sched_ext. When the scope exits, the task is re-enqueued on the new CFS run queue. If it was running, resched_curr(rq) at line 9189 triggers a reschedule.',
    ['sched_move_task', 'sched_change_group'],
    state,
  ));

  // Frame 8: Task running under cpu.max bandwidth control
  state.currentFunction = 'cpu_cgroup_attach';
  state.phase = 'running';
  state.srcRef = 'kernel/sched/core.c:9280 cpu_cgroup_attach() completion';
  frames.push(makeFrame(
    8,
    'Task running under CFS bandwidth control',
    'The task is now running in the /app cgroup with cpu.max set to "50000 100000" (50% CPU bandwidth). The CFS scheduler tracks the task_group quota consumption: each time the task runs, its consumed time is charged against the group cfs_bandwidth quota. When the 50ms quota is exhausted within the 100ms period, the CFS run queue is throttled (dequeued from the parent), and the task cannot run until the bandwidth timer fires at the next period boundary to replenish the quota. This provides hard CPU bandwidth limiting for container workloads.',
    ['complete', 'cfs_bandwidth', 'throttle'],
    state,
  ));

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'cgroup-creation-and-attach', label: 'mkdir + echo PID > cgroup.procs: Create Cgroup and Attach Task' },
  { id: 'memory-limit-enforcement', label: 'memory.max Enforcement: Charge, Reclaim, and OOM' },
  { id: 'cpu-controller', label: 'CPU Controller: Bandwidth Throttling with cpu.max' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as CgroupState;
  const margin = { top: 24, right: 16, bottom: 16, left: 16 };
  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'Cgroup v2 Hierarchy';
  container.appendChild(titleEl);

  // Draw cgroup hierarchy as nested boxes
  const cgroupCount = data.hierarchy.length;
  const boxHeight = Math.min(50, (usableHeight * 0.6) / Math.max(cgroupCount, 1));
  const boxWidth = usableWidth * 0.8;
  const boxX = margin.left + (usableWidth - boxWidth) / 2;

  for (let i = 0; i < cgroupCount; i++) {
    const cg = data.hierarchy[i];
    const y = margin.top + i * (boxHeight + 6);
    const indent = i * 16;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(boxX + indent));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxWidth - indent * 2));
    rect.setAttribute('height', String(boxHeight));
    rect.setAttribute('rx', '4');
    const isCurrent = cg.path.endsWith(data.currentCgroup) || data.currentCgroup === cg.name;
    const cls = isCurrent
      ? 'anim-phase anim-phase-active anim-highlight'
      : 'anim-phase anim-phase-completed';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Cgroup name and path
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(boxX + indent + 8));
    label.setAttribute('y', String(y + 16));
    label.setAttribute('class', 'anim-function');
    label.textContent = `${cg.path} [${cg.controllers.join(', ')}]`;
    container.appendChild(label);

    // Processes
    if (cg.processes.length > 0) {
      const procLabel = document.createElementNS(NS, 'text');
      procLabel.setAttribute('x', String(boxX + indent + 8));
      procLabel.setAttribute('y', String(y + 32));
      procLabel.setAttribute('class', 'anim-srcref');
      procLabel.textContent = `PIDs: ${cg.processes.join(', ')}`;
      container.appendChild(procLabel);
    }

    // Limits
    const limitEntries = Object.entries(cg.limits);
    if (limitEntries.length > 0) {
      const limitLabel = document.createElementNS(NS, 'text');
      limitLabel.setAttribute('x', String(boxX + indent + 8));
      limitLabel.setAttribute('y', String(y + boxHeight - 4));
      limitLabel.setAttribute('class', 'anim-srcref');
      limitLabel.textContent = limitEntries.map(([k, v]) => `${k}=${v}`).join(' ');
      container.appendChild(limitLabel);
    }
  }

  // Current function and srcRef at bottom
  const infoY = margin.top + cgroupCount * (boxHeight + 6) + 16;
  const fnLabel = document.createElementNS(NS, 'text');
  fnLabel.setAttribute('x', String(margin.left));
  fnLabel.setAttribute('y', String(Math.min(infoY, height - margin.bottom - 20)));
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.textContent = `Current: ${data.currentFunction}()`;
  container.appendChild(fnLabel);

  const srcLabel = document.createElementNS(NS, 'text');
  srcLabel.setAttribute('x', String(margin.left));
  srcLabel.setAttribute('y', String(Math.min(infoY + 14, height - margin.bottom - 6)));
  srcLabel.setAttribute('class', 'anim-srcref');
  srcLabel.textContent = data.srcRef;
  container.appendChild(srcLabel);

  // Charge amount indicator for memory scenario
  if (data.chargeAmount !== null) {
    const chargeLabel = document.createElementNS(NS, 'text');
    chargeLabel.setAttribute('x', String(width - margin.right));
    chargeLabel.setAttribute('y', String(Math.min(infoY, height - margin.bottom - 20)));
    chargeLabel.setAttribute('text-anchor', 'end');
    chargeLabel.setAttribute('class', 'anim-function');
    chargeLabel.textContent = `Charge: ${data.chargeAmount} bytes`;
    container.appendChild(chargeLabel);
  }
}

const cgroupHierarchy: AnimationModule = {
  config: {
    id: 'cgroup-hierarchy',
    title: 'Cgroup v2 Hierarchy and Controllers',
    skillName: 'cgroups-v2',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'memory-limit-enforcement':
        return generateMemoryLimitFrames();
      case 'cpu-controller':
        return generateCpuControllerFrames();
      case 'cgroup-creation-and-attach':
      default:
        return generateCreationAndAttachFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default cgroupHierarchy;
