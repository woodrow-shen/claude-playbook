import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CpuInfo {
  id: number;
  load: number;
  runqueue: number;
  node: number;
}

export interface SchedDomainInfo {
  name: string;
  level: number;
  cpus: number[];
  flags: string;
}

export interface NumaNodeInfo {
  id: number;
  cpus: number[];
  faults: number;
}

export interface CpuLoadBalanceState {
  phase: string;
  cpus: CpuInfo[];
  schedDomains: SchedDomainInfo[];
  migrationPath: number[];
  numaNodes: NumaNodeInfo[];
  srcRef: string;
  currentFunction: string;
}

function cloneState(s: CpuLoadBalanceState): CpuLoadBalanceState {
  return {
    phase: s.phase,
    cpus: s.cpus.map(c => ({ ...c })),
    schedDomains: s.schedDomains.map(d => ({ ...d, cpus: [...d.cpus] })),
    migrationPath: [...s.migrationPath],
    numaNodes: s.numaNodes.map(n => ({ ...n, cpus: [...n.cpus], faults: n.faults })),
    srcRef: s.srcRef,
    currentFunction: s.currentFunction,
  };
}

// ---------------------------------------------------------------------------
// Scenario: sched-domain-hierarchy (default)
// Building the scheduling domain hierarchy from CPU topology
// ---------------------------------------------------------------------------
function generateSchedDomainHierarchy(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CpuLoadBalanceState = {
    phase: 'topology-init',
    cpus: [
      { id: 0, load: 0, runqueue: 0, node: 0 },
      { id: 1, load: 0, runqueue: 0, node: 0 },
      { id: 2, load: 0, runqueue: 0, node: 0 },
      { id: 3, load: 0, runqueue: 0, node: 0 },
      { id: 4, load: 0, runqueue: 0, node: 1 },
      { id: 5, load: 0, runqueue: 0, node: 1 },
      { id: 6, load: 0, runqueue: 0, node: 1 },
      { id: 7, load: 0, runqueue: 0, node: 1 },
    ],
    schedDomains: [],
    migrationPath: [],
    numaNodes: [
      { id: 0, cpus: [0, 1, 2, 3], faults: 0 },
      { id: 1, cpus: [4, 5, 6, 7], faults: 0 },
    ],
    srcRef: '',
    currentFunction: '',
  };

  // Frame 0: CPU topology detection
  state.srcRef = 'kernel/sched/topology.c:2658 (build_sched_domains)';
  state.currentFunction = 'build_sched_domains()';
  frames.push({
    step: 0,
    label: 'CPU topology detected, build_sched_domains called',
    description: 'build_sched_domains() at kernel/sched/topology.c:2658 is called with the cpu_map of online CPUs. It first calls __visit_domain_allocation_hell() at line 2671 to allocate per-CPU sched_domain, sched_group, and sched_group_capacity structures. The system has 8 CPUs across 2 NUMA nodes (0-3 on node 0, 4-7 on node 1).',
    highlights: ['topology'],
    data: cloneState(state),
  });

  // Frame 1: SMT domain level
  state.phase = 'domain-build';
  state.currentFunction = 'sd_init() [SMT level]';
  state.srcRef = 'kernel/sched/topology.c:1661 (sd_init) -> line 1683 (struct init)';
  state.schedDomains.push(
    { name: 'SMT', level: 0, cpus: [0, 1], flags: 'SD_SHARE_CPUCAPACITY' },
  );
  frames.push({
    step: 1,
    label: 'SMT scheduling domain initialized',
    description: 'For each CPU, build_sched_domains() at line 2676-2690 iterates for_each_sd_topology(tl) to build domains bottom-up. sd_init() at kernel/sched/topology.c:1661 initializes a sched_domain: it calls cpumask_and(sd_span, cpu_map, tl->mask(tl, cpu)) at line 1672 to compute the domain span. For the SMT level, tl_smt_mask() returns the sibling thread mask. The domain gets SD_SHARE_CPUCAPACITY flag.',
    highlights: ['domain-smt'],
    data: cloneState(state),
  });

  // Frame 2: MC (multi-core) domain level
  state.currentFunction = 'sd_init() [MC level]';
  state.srcRef = 'kernel/sched/topology.c:1661 (sd_init) -> line 1691-1699 (flags)';
  state.schedDomains.push(
    { name: 'MC', level: 1, cpus: [0, 1, 2, 3], flags: 'SD_SHARE_LLC' },
  );
  frames.push({
    step: 2,
    label: 'MC (multi-core) domain initialized',
    description: 'sd_init() is called again for the MC topology level. tl_mc_mask() returns the package-level mask covering CPUs sharing an LLC. At kernel/sched/topology.c:1691-1699, the flags include SD_BALANCE_NEWIDLE, SD_BALANCE_EXEC, SD_BALANCE_FORK, SD_WAKE_AFFINE, and SD_SHARE_LLC. The child->parent pointer at line 2509 links SMT to MC. sd->level = child->level + 1 at line 2507.',
    highlights: ['domain-mc'],
    data: cloneState(state),
  });

  // Frame 3: build_sched_domain links parent/child
  state.currentFunction = 'build_sched_domain()';
  state.srcRef = 'kernel/sched/topology.c:2500-2526 (build_sched_domain)';
  state.schedDomains.push(
    { name: 'MC', level: 1, cpus: [4, 5, 6, 7], flags: 'SD_SHARE_LLC' },
  );
  frames.push({
    step: 3,
    label: 'Parent/child domain linking',
    description: 'build_sched_domain() at kernel/sched/topology.c:2500 calls sd_init() then links the hierarchy: child->parent = sd at line 2509. It validates cpumask_subset(child_span, sd_span) at line 2511 -- if the child domain is not a subset of the parent, it logs "BUG: arch topology borken" and fixes up at line 2517. set_domain_attribute(sd, attr) at line 2523 applies relax_domain_level.',
    highlights: ['domain-link'],
    data: cloneState(state),
  });

  // Frame 4: NUMA domain level
  state.currentFunction = 'sd_init() [NUMA level]';
  state.srcRef = 'kernel/sched/topology.c:1661 (sd_init) -> SD_NUMA flag';
  state.schedDomains.push(
    { name: 'NUMA', level: 2, cpus: [0, 1, 2, 3, 4, 5, 6, 7], flags: 'SD_NUMA|SD_SERIALIZE' },
  );
  frames.push({
    step: 4,
    label: 'NUMA domain spans all CPUs',
    description: 'The NUMA topology level creates a domain spanning all CPUs across both NUMA nodes. sd_init() sets the SD_NUMA flag and SD_SERIALIZE (only one CPU runs load_balance at this level). The imbalance_pct at line 1687 is 117 -- meaning 17% load imbalance is tolerated before migration. The loop at line 2688 breaks when cpumask_equal(cpu_map, sched_domain_span(sd)) -- the domain covers all CPUs.',
    highlights: ['domain-numa'],
    data: cloneState(state),
  });

  // Frame 5: Build sched_groups for non-NUMA domains
  state.phase = 'group-build';
  state.currentFunction = 'build_sched_groups()';
  state.srcRef = 'kernel/sched/topology.c:2697-2708 (build groups loop)';
  frames.push({
    step: 5,
    label: 'Build sched_groups for MC domains',
    description: 'At kernel/sched/topology.c:2697, for each CPU and domain, sched_group structures are built. For non-NUMA domains (line 2703-2705), build_sched_groups() creates a circular linked list of groups. Each sched_group has a cpumask (group_balance_mask) and a sched_group_capacity tracking the combined compute capacity. sd->span_weight at line 2699 records the number of CPUs in the domain.',
    highlights: ['groups'],
    data: cloneState(state),
  });

  // Frame 6: Build overlap groups for NUMA domains
  state.currentFunction = 'build_overlap_sched_groups()';
  state.srcRef = 'kernel/sched/topology.c:1042 (build_overlap_sched_groups)';
  frames.push({
    step: 6,
    label: 'Build overlapping groups for NUMA domain',
    description: 'For NUMA domains (SD_NUMA flag set), build_overlap_sched_groups() at kernel/sched/topology.c:1042 is used instead. It iterates for_each_cpu_wrap(i, span, cpu) at line 1053, creating groups that may overlap across NUMA boundaries. Each group corresponds to a child domain span. This allows the load balancer to compare load across NUMA nodes while respecting topology distances.',
    highlights: ['groups-numa'],
    data: cloneState(state),
  });

  // Frame 7: SD_SHARE_LLC shared data setup
  state.phase = 'finalize';
  state.currentFunction = 'build_sched_domains() [shared setup]';
  state.srcRef = 'kernel/sched/topology.c:2710-2733 (SD_SHARE_LLC shared setup)';
  frames.push({
    step: 7,
    label: 'LLC shared data and NUMA imbalance tuning',
    description: 'At kernel/sched/topology.c:2710, the topmost SD_SHARE_LLC domain is found for each CPU. sd->shared at line 2722 points to sched_domain_shared containing nr_busy_cpus and has_idle_cores -- used by select_idle_sibling() for fast idle CPU selection. atomic_set(&sd->shared->nr_busy_cpus, sd->span_weight) at line 2723 initializes all CPUs as busy. If NUMA is enabled, adjust_numa_imbalance() at line 2731 tunes the imb_numa_nr threshold.',
    highlights: ['shared'],
    data: cloneState(state),
  });

  // Frame 8: Attach domains to CPUs via rcu_assign_pointer
  state.phase = 'attach';
  state.currentFunction = 'cpu_attach_domain()';
  state.srcRef = 'kernel/sched/topology.c:2735-2758 (attach domains to rq)';
  frames.push({
    step: 8,
    label: 'Attach domain hierarchy to each CPU runqueue',
    description: 'At kernel/sched/topology.c:2735, for_each_cpu(i, cpu_map) calls cpu_attach_domain(sd, rd, i). This uses rcu_assign_pointer(rq->sd, sd) to make the domain hierarchy visible to the scheduler. The old domains are freed via call_rcu() after an RCU grace period. Each CPU rq now has a complete domain hierarchy: SMT -> MC -> NUMA, enabling hierarchical load balancing.',
    highlights: ['attach'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: periodic-load-balance
// Periodic load balancing tick path
// ---------------------------------------------------------------------------
function generatePeriodicLoadBalance(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CpuLoadBalanceState = {
    phase: 'idle',
    cpus: [
      { id: 0, load: 20, runqueue: 1, node: 0 },
      { id: 1, load: 10, runqueue: 1, node: 0 },
      { id: 2, load: 90, runqueue: 5, node: 0 },
      { id: 3, load: 85, runqueue: 4, node: 0 },
      { id: 4, load: 15, runqueue: 1, node: 1 },
      { id: 5, load: 5, runqueue: 0, node: 1 },
      { id: 6, load: 70, runqueue: 3, node: 1 },
      { id: 7, load: 10, runqueue: 1, node: 1 },
    ],
    schedDomains: [
      { name: 'SMT', level: 0, cpus: [0, 1], flags: 'SD_SHARE_CPUCAPACITY' },
      { name: 'MC', level: 1, cpus: [0, 1, 2, 3], flags: 'SD_SHARE_LLC' },
      { name: 'NUMA', level: 2, cpus: [0, 1, 2, 3, 4, 5, 6, 7], flags: 'SD_NUMA|SD_SERIALIZE' },
    ],
    migrationPath: [],
    numaNodes: [
      { id: 0, cpus: [0, 1, 2, 3], faults: 0 },
      { id: 1, cpus: [4, 5, 6, 7], faults: 0 },
    ],
    srcRef: '',
    currentFunction: '',
  };

  // Frame 0: Timer tick triggers balance check
  state.phase = 'balance-tick';
  state.currentFunction = 'sched_balance_trigger()';
  state.srcRef = 'kernel/sched/fair.c:13320 (sched_balance_trigger)';
  frames.push({
    step: 0,
    label: 'Timer tick triggers load balance check',
    description: 'sched_balance_trigger() at kernel/sched/fair.c:13320 is called from the scheduler tick. It checks on_null_domain(rq) at line 13326 and whether the CPU is active. If time_after_eq(jiffies, rq->next_balance) at line 13329, it calls raise_softirq(SCHED_SOFTIRQ) to schedule the balance softirq. nohz_balancer_kick() at line 13332 handles balancing for NOHZ idle CPUs.',
    highlights: ['tick'],
    data: cloneState(state),
  });

  // Frame 1: SCHED_SOFTIRQ fires
  state.currentFunction = 'sched_balance_softirq()';
  state.srcRef = 'kernel/sched/fair.c:13297 (sched_balance_softirq)';
  frames.push({
    step: 1,
    label: 'SCHED_SOFTIRQ handler executes',
    description: 'sched_balance_softirq() at kernel/sched/fair.c:13297 runs in softirq context. It first tries nohz_idle_balance() at line 13309 to balance on behalf of idle CPUs. Then sched_balance_update_blocked_averages() at line 13313 updates PELT (Per-Entity Load Tracking) blocked averages. Finally sched_balance_domains() at line 13314 walks the domain hierarchy. Registered via open_softirq(SCHED_SOFTIRQ, sched_balance_softirq) at line 14269.',
    highlights: ['softirq'],
    data: cloneState(state),
  });

  // Frame 2: Walk domain hierarchy
  state.phase = 'domain-walk';
  state.currentFunction = 'sched_balance_domains()';
  state.srcRef = 'kernel/sched/fair.c:12554 (sched_balance_domains)';
  frames.push({
    step: 2,
    label: 'Walk scheduling domain hierarchy',
    description: 'sched_balance_domains() at kernel/sched/fair.c:12554 iterates for_each_domain(cpu, sd) at line 12568 under rcu_read_lock(). For each domain level (SMT -> MC -> NUMA), it checks get_sd_balance_interval() at line 12587 against time_after_eq(jiffies, sd->last_balance + interval). If the interval has elapsed, sched_balance_rq() at line 12589 is called for that domain.',
    highlights: ['domain-walk'],
    data: cloneState(state),
  });

  // Frame 3: sched_balance_rq begins
  state.phase = 'balance-rq';
  state.currentFunction = 'sched_balance_rq()';
  state.srcRef = 'kernel/sched/fair.c:12065 (sched_balance_rq)';
  frames.push({
    step: 3,
    label: 'sched_balance_rq() checks for imbalance',
    description: 'sched_balance_rq() at kernel/sched/fair.c:12065 sets up lb_env with dst_cpu (this CPU), the domain, and idle state. cpumask_and(cpus, sched_domain_span(sd), cpu_active_mask) at line 12088 limits balancing to active CPUs in this domain. should_we_balance() at line 12093 checks if this CPU is the designated balance CPU for the group (first idle or first CPU).',
    highlights: ['balance-rq'],
    data: cloneState(state),
  });

  // Frame 4: Find busiest group
  state.phase = 'find-busiest';
  state.currentFunction = 'sched_balance_find_src_group()';
  state.srcRef = 'kernel/sched/fair.c:11609 (sched_balance_find_src_group)';
  frames.push({
    step: 4,
    label: 'Find busiest scheduling group',
    description: 'sched_balance_find_src_group() at kernel/sched/fair.c:11609 calls update_sd_lb_stats() at line 11620 to compute load statistics for all groups in the domain. It classifies groups by type (group_has_spare, group_overloaded, group_imbalanced, group_misfit_task). The busiest group is identified at line 11623 via sds.busiest. calculate_imbalance() computes how much load/util/tasks to move.',
    highlights: ['find-group'],
    data: cloneState(state),
  });

  // Frame 5: Find busiest runqueue
  state.currentFunction = 'sched_balance_find_src_rq()';
  state.srcRef = 'kernel/sched/fair.c:11747 (sched_balance_find_src_rq)';
  frames.push({
    step: 5,
    label: 'Find busiest runqueue in group',
    description: 'sched_balance_find_src_rq() at kernel/sched/fair.c:11747 iterates for_each_cpu_and(i, sched_group_span(group), env->cpus) at line 11755. For each CPU runqueue, it compares load (weighted_cpuload), util (cpu_util_cfs), and nr_running. CPU 2 with load=90 and 5 runnable tasks is identified as the busiest. The fbq_classify_rq() at line 11761 filters NUMA-remote tasks.',
    highlights: ['find-rq'],
    data: cloneState(state),
  });

  // Frame 6: Detach tasks from busiest
  state.phase = 'migrate';
  state.currentFunction = 'detach_tasks()';
  state.migrationPath = [2, 1];
  state.srcRef = 'kernel/sched/fair.c:9868 (detach_tasks)';
  frames.push({
    step: 6,
    label: 'Detach tasks from busiest runqueue',
    description: 'detach_tasks() at kernel/sched/fair.c:9868 walks src_rq->cfs_tasks list at line 9870. For each task, it checks can_migrate_task() for CPU affinity (cpumask), cache-hotness (env->sd->cache_nice_tries), and running state. Tasks are moved to env->tasks list. The loop at line 9889 continues until env->imbalance is satisfied or the list is exhausted. LBF_ALL_PINNED at line 9882 is cleared if any task is tested.',
    highlights: ['detach'],
    data: cloneState(state),
  });

  // Frame 7: Attach tasks to destination
  state.currentFunction = 'attach_tasks()';
  state.cpus[2].load = 60;
  state.cpus[2].runqueue = 3;
  state.cpus[1].load = 40;
  state.cpus[1].runqueue = 3;
  state.srcRef = 'kernel/sched/fair.c:10004 (attach_tasks)';
  frames.push({
    step: 7,
    label: 'Attach migrated tasks to destination CPU',
    description: 'attach_tasks() at kernel/sched/fair.c:10004 iterates the detached task list and calls attach_task() for each. This calls activate_task(rq, p, ENQUEUE_NOCLOCK) to enqueue the task on the destination runqueue. The source CPU 2 load drops from 90 to 60, destination CPU 1 load increases from 10 to 40. sched_balance_rq() returns the number of tasks moved at line 12145 via cur_ld_moved.',
    highlights: ['attach'],
    data: cloneState(state),
  });

  // Frame 8: Update statistics
  state.phase = 'stats-update';
  state.currentFunction = 'sched_balance_rq() [stats]';
  state.migrationPath = [];
  state.srcRef = 'kernel/sched/fair.c:12145-12200 (post-balance stats)';
  frames.push({
    step: 8,
    label: 'Update balance statistics and interval',
    description: 'After successful migration, sched_balance_rq() updates schedstat counters: sd->lb_gained[idle] at line 12150. sd->nr_balance_failed is reset to 0. If no tasks moved, nr_balance_failed increments and sd->balance_interval doubles (up to max_load_balance_interval = HZ*num_online_cpus()/10 at line 12479). sd->last_balance = jiffies records when balancing last ran. The next balance check for this domain is scheduled.',
    highlights: ['stats'],
    data: cloneState(state),
  });

  // Frame 9: Balance result summary
  state.phase = 'complete';
  state.currentFunction = 'sched_balance_domains() [next domain]';
  state.srcRef = 'kernel/sched/fair.c:12598 (sd->last_balance = jiffies)';
  frames.push({
    step: 9,
    label: 'Load balance cycle complete',
    description: 'sched_balance_domains() continues to the next domain level (MC -> NUMA). For each level, the interval is computed via get_sd_balance_interval() which applies sd->busy_factor (16x) when CPUs are busy, clamped to max_load_balance_interval. The full periodic path: sched_balance_trigger() (line 13320) -> raise_softirq(SCHED_SOFTIRQ) -> sched_balance_softirq() (line 13297) -> sched_balance_domains() (line 12554) -> sched_balance_rq() (line 12065).',
    highlights: ['complete'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: numa-balancing
// NUMA-aware task migration
// ---------------------------------------------------------------------------
function generateNumaBalancing(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CpuLoadBalanceState = {
    phase: 'idle',
    cpus: [
      { id: 0, load: 50, runqueue: 2, node: 0 },
      { id: 1, load: 40, runqueue: 2, node: 0 },
      { id: 2, load: 30, runqueue: 1, node: 0 },
      { id: 3, load: 20, runqueue: 1, node: 0 },
      { id: 4, load: 60, runqueue: 3, node: 1 },
      { id: 5, load: 10, runqueue: 1, node: 1 },
      { id: 6, load: 15, runqueue: 1, node: 1 },
      { id: 7, load: 5, runqueue: 0, node: 1 },
    ],
    schedDomains: [
      { name: 'MC', level: 1, cpus: [0, 1, 2, 3], flags: 'SD_SHARE_LLC' },
      { name: 'MC', level: 1, cpus: [4, 5, 6, 7], flags: 'SD_SHARE_LLC' },
      { name: 'NUMA', level: 2, cpus: [0, 1, 2, 3, 4, 5, 6, 7], flags: 'SD_NUMA' },
    ],
    migrationPath: [],
    numaNodes: [
      { id: 0, cpus: [0, 1, 2, 3], faults: 120 },
      { id: 1, cpus: [4, 5, 6, 7], faults: 450 },
    ],
    srcRef: '',
    currentFunction: '',
  };

  // Frame 0: NUMA hinting page fault occurs
  state.phase = 'numa-fault';
  state.currentFunction = 'do_numa_page()';
  state.srcRef = 'mm/memory.c (do_numa_page -> task_numa_fault)';
  frames.push({
    step: 0,
    label: 'NUMA hinting fault triggers placement review',
    description: 'The kernel periodically marks PTEs with PROT_NONE via task_numa_work() to generate NUMA hinting faults. When a task on CPU 0 (node 0) accesses memory on node 1, do_numa_page() handles the fault and calls task_numa_fault() to record the access pattern. This NUMA fault tracking drives automatic task and memory placement decisions.',
    highlights: ['numa-fault'],
    data: cloneState(state),
  });

  // Frame 1: task_numa_fault records statistics
  state.currentFunction = 'task_numa_fault()';
  state.srcRef = 'kernel/sched/fair.c:3317 (task_numa_fault)';
  frames.push({
    step: 1,
    label: 'task_numa_fault() records access statistics',
    description: 'task_numa_fault() at kernel/sched/fair.c:3317 records per-node fault statistics. At line 3326 it checks static_branch_likely(&sched_numa_balancing). It allocates p->numa_faults at line 3347 if needed (NR_NUMA_HINT_FAULT_BUCKETS * nr_node_ids entries). Faults are categorized as local (same node) or remote. The cpu_node = task_node(current) at line 3321 identifies the current NUMA node.',
    highlights: ['fault-record'],
    data: cloneState(state),
  });

  // Frame 2: Fault statistics updated, preferred node computed
  state.phase = 'numa-preferred';
  state.currentFunction = 'task_numa_fault() [preferred node]';
  state.srcRef = 'kernel/sched/fair.c:3385 (numa_migrate_preferred)';
  frames.push({
    step: 2,
    label: 'Update preferred NUMA node',
    description: 'After recording fault statistics, task_numa_fault() calls numa_migrate_preferred(p) at kernel/sched/fair.c:3385. The preferred node is determined by which node accumulates the most faults. In this case, the task on node 0 has 450 faults to node 1 memory vs 120 faults to node 0 memory, indicating node 1 is the preferred placement for this workload.',
    highlights: ['preferred'],
    data: cloneState(state),
  });

  // Frame 3: numa_migrate_preferred checks migration need
  state.currentFunction = 'numa_migrate_preferred()';
  state.srcRef = 'kernel/sched/fair.c:2790 (numa_migrate_preferred)';
  frames.push({
    step: 3,
    label: 'numa_migrate_preferred() evaluates migration',
    description: 'numa_migrate_preferred() at kernel/sched/fair.c:2790 checks p->numa_preferred_nid at line 2795. If NUMA_NO_NODE or no fault data, it returns early. The retry interval at line 2799 is min(HZ, scan_period/16). At line 2803, if task_node(p) already equals preferred_nid, migration is unnecessary. Otherwise task_numa_migrate(p) at line 2807 is called to attempt the actual move.',
    highlights: ['migrate-check'],
    data: cloneState(state),
  });

  // Frame 4: task_numa_migrate scans destination nodes
  state.phase = 'numa-scan';
  state.currentFunction = 'task_numa_migrate()';
  state.srcRef = 'kernel/sched/fair.c:2654 (task_numa_migrate)';
  frames.push({
    step: 4,
    label: 'task_numa_migrate() scans for best CPU',
    description: 'task_numa_migrate() at kernel/sched/fair.c:2654 sets up task_numa_env with source/destination node statistics. It iterates candidate destination nodes and calls task_numa_find_cpu() at line 2712 for the preferred node. If no improvement is found on the preferred node, it tries alternative nodes at line 2743 in a for_each_online_node loop. The goal is maximizing taskimp (task improvement score).',
    highlights: ['numa-scan'],
    data: cloneState(state),
  });

  // Frame 5: task_numa_find_cpu evaluates CPUs
  state.currentFunction = 'task_numa_find_cpu()';
  state.srcRef = 'kernel/sched/fair.c:2599 (task_numa_find_cpu)';
  frames.push({
    step: 5,
    label: 'task_numa_find_cpu() picks target CPU',
    description: 'task_numa_find_cpu() at kernel/sched/fair.c:2599 iterates CPUs on the destination node. At line 2609, if dst_stats.node_type == node_has_spare, it checks whether migration would cause load imbalance: src_running - 1 vs dst_running + 1 at lines 2619-2620. adjust_numa_imbalance() at line 2622 applies env->imb_numa_nr threshold. CPU 7 on node 1 (load=5, 0 tasks) is selected as best_cpu.',
    highlights: ['find-cpu'],
    data: cloneState(state),
  });

  // Frame 6: migrate_task_to performs the move
  state.phase = 'numa-migrate';
  state.currentFunction = 'migrate_task_to()';
  state.migrationPath = [0, 7];
  state.srcRef = 'kernel/sched/core.c:8302 (migrate_task_to)';
  frames.push({
    step: 6,
    label: 'migrate_task_to() moves task to node 1',
    description: 'migrate_task_to() at kernel/sched/core.c:8302 is called from task_numa_migrate() at kernel/sched/fair.c:2773. It uses stop_one_cpu() to invoke migration_cpu_stop() on the source CPU, which dequeues the task from CPU 0 runqueue and enqueues it on CPU 7. The task is now on its preferred NUMA node, close to the memory it accesses most frequently.',
    highlights: ['migrate'],
    data: cloneState(state),
  });

  // Frame 7: Post-migration state update
  state.cpus[0].load = 30;
  state.cpus[0].runqueue = 1;
  state.cpus[7].load = 30;
  state.cpus[7].runqueue = 1;
  state.numaNodes[1].faults = 450;
  state.currentFunction = 'task_numa_fault() [post-migration]';
  state.srcRef = 'kernel/sched/fair.c:3317 (task_numa_fault post-migration)';
  frames.push({
    step: 7,
    label: 'Task running on preferred NUMA node',
    description: 'After migration, the task runs on CPU 7 (node 1). Subsequent memory accesses to node 1 are now local, reducing latency. task_numa_fault() continues recording faults -- if the task was migrated (flags & TNF_MIGRATED at line 3320), local fault counts increase. Future faults update p->numa_faults_locality at line 3352 which tracks the ratio of local vs remote accesses.',
    highlights: ['post-migrate'],
    data: cloneState(state),
  });

  // Frame 8: Ongoing NUMA balancing loop
  state.phase = 'numa-steady';
  state.migrationPath = [];
  state.currentFunction = 'task_tick_numa()';
  state.srcRef = 'kernel/sched/fair.c (task_tick_numa -> task_numa_work)';
  frames.push({
    step: 8,
    label: 'Continuous NUMA balancing feedback loop',
    description: 'The NUMA balancing loop continues: task_tick_numa() fires periodically and calls task_numa_work() which scans the task VMAs, marks pages with PROT_NONE to generate future faults. The scan period adapts: p->numa_scan_period increases (up to sysctl_numa_balancing_scan_period_max) when placement is stable, and decreases when migration improves locality. This adaptive feedback ensures tasks stay on optimal nodes.',
    highlights: ['steady'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS_LB = [
  { id: 'balance-tick', label: 'Tick' },
  { id: 'domain-walk', label: 'Domains' },
  { id: 'balance-rq', label: 'Balance' },
  { id: 'find-busiest', label: 'FindSrc' },
  { id: 'migrate', label: 'Migrate' },
  { id: 'stats-update', label: 'Stats' },
  { id: 'complete', label: 'Done' },
];

function getActivePhaseIndex(phase: string): number {
  const idx = PHASE_LABELS_LB.findIndex(p => p.id === phase);
  if (idx >= 0) return idx;
  // Map other phases to closest
  switch (phase) {
    case 'topology-init':
    case 'domain-build': return 1;
    case 'group-build':
    case 'finalize':
    case 'attach': return 2;
    case 'numa-fault':
    case 'numa-preferred':
    case 'numa-scan': return 3;
    case 'numa-migrate': return 4;
    case 'numa-steady': return 6;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as CpuLoadBalanceState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'CPU Topology & Load Balancing';
  container.appendChild(title);

  // --- Phase flow diagram ---
  const flowTop = margin.top + 28;
  const phaseCount = PHASE_LABELS_LB.length;
  const phaseWidth = Math.min(85, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 24;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS_LB.forEach((phase, i) => {
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

  // --- CPU Load Display ---
  const cpuTop = flowTop + phaseHeight + 20;
  const cpuBoxWidth = Math.min(80, (usableWidth - 7 * 8) / 8);
  const cpuBoxHeight = 50;

  data.cpus.forEach((cpu, i) => {
    const cx = margin.left + i * (cpuBoxWidth + 8);
    const loadFrac = cpu.load / 100;
    const fillColor = loadFrac > 0.7 ? '#f85149' : loadFrac > 0.4 ? '#d29922' : '#3fb950';

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(cx));
    rect.setAttribute('y', String(cpuTop));
    rect.setAttribute('width', String(cpuBoxWidth));
    rect.setAttribute('height', String(cpuBoxHeight));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', '#21262d');
    rect.setAttribute('class', 'anim-cpu');
    container.appendChild(rect);

    // Load bar
    const barHeight = cpuBoxHeight * loadFrac;
    const loadRect = document.createElementNS(NS, 'rect');
    loadRect.setAttribute('x', String(cx));
    loadRect.setAttribute('y', String(cpuTop + cpuBoxHeight - barHeight));
    loadRect.setAttribute('width', String(cpuBoxWidth));
    loadRect.setAttribute('height', String(barHeight));
    loadRect.setAttribute('rx', '4');
    loadRect.setAttribute('fill', fillColor);
    loadRect.setAttribute('opacity', '0.6');
    loadRect.setAttribute('class', 'anim-cpu');
    container.appendChild(loadRect);

    // CPU label
    const cpuLabel = document.createElementNS(NS, 'text');
    cpuLabel.setAttribute('x', String(cx + cpuBoxWidth / 2));
    cpuLabel.setAttribute('y', String(cpuTop + 14));
    cpuLabel.setAttribute('text-anchor', 'middle');
    cpuLabel.setAttribute('fill', '#e6edf3');
    cpuLabel.setAttribute('font-size', '10');
    cpuLabel.setAttribute('class', 'anim-cpu-label');
    cpuLabel.textContent = `CPU${cpu.id}`;
    container.appendChild(cpuLabel);

    // Load value
    const loadLabel = document.createElementNS(NS, 'text');
    loadLabel.setAttribute('x', String(cx + cpuBoxWidth / 2));
    loadLabel.setAttribute('y', String(cpuTop + cpuBoxHeight - 4));
    loadLabel.setAttribute('text-anchor', 'middle');
    loadLabel.setAttribute('fill', '#e6edf3');
    loadLabel.setAttribute('font-size', '9');
    loadLabel.setAttribute('class', 'anim-cpu-label');
    loadLabel.textContent = `rq:${cpu.runqueue}`;
    container.appendChild(loadLabel);
  });

  // --- NUMA node labels ---
  if (data.numaNodes.length > 0) {
    const nodeY = cpuTop + cpuBoxHeight + 6;
    data.numaNodes.forEach(node => {
      const firstCpu = node.cpus[0];
      const lastCpu = node.cpus[node.cpus.length - 1];
      const x1 = margin.left + firstCpu * (cpuBoxWidth + 8);
      const x2 = margin.left + lastCpu * (cpuBoxWidth + 8) + cpuBoxWidth;
      const nodeLabel = document.createElementNS(NS, 'text');
      nodeLabel.setAttribute('x', String((x1 + x2) / 2));
      nodeLabel.setAttribute('y', String(nodeY + 10));
      nodeLabel.setAttribute('text-anchor', 'middle');
      nodeLabel.setAttribute('fill', '#8b949e');
      nodeLabel.setAttribute('font-size', '10');
      nodeLabel.setAttribute('class', 'anim-cpu-label');
      nodeLabel.textContent = `Node ${node.id}`;
      container.appendChild(nodeLabel);
    });
  }

  // --- Sched domain hierarchy ---
  const domainTop = cpuTop + cpuBoxHeight + 24;
  data.schedDomains.forEach((sd, i) => {
    const firstCpu = sd.cpus[0];
    const lastCpu = sd.cpus[sd.cpus.length - 1];
    const x1 = margin.left + firstCpu * (cpuBoxWidth + 8);
    const x2 = margin.left + lastCpu * (cpuBoxWidth + 8) + cpuBoxWidth;
    const dy = domainTop + i * 22;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x1));
    rect.setAttribute('y', String(dy));
    rect.setAttribute('width', String(x2 - x1));
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', sd.name === 'NUMA' ? '#58a6ff' : sd.name === 'MC' ? '#3fb950' : '#d29922');
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('class', 'anim-domain');
    container.appendChild(rect);

    const sdLabel = document.createElementNS(NS, 'text');
    sdLabel.setAttribute('x', String(x1 + 4));
    sdLabel.setAttribute('y', String(dy + 13));
    sdLabel.setAttribute('fill', '#e6edf3');
    sdLabel.setAttribute('font-size', '10');
    sdLabel.setAttribute('class', 'anim-domain');
    sdLabel.textContent = `${sd.name} (L${sd.level})`;
    container.appendChild(sdLabel);
  });

  // --- Migration arrows ---
  if (data.migrationPath.length === 2) {
    const [srcCpu, dstCpu] = data.migrationPath;
    const srcX = margin.left + srcCpu * (cpuBoxWidth + 8) + cpuBoxWidth / 2;
    const dstX = margin.left + dstCpu * (cpuBoxWidth + 8) + cpuBoxWidth / 2;
    const arrowY = cpuTop - 8;

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(srcX));
    line.setAttribute('y1', String(arrowY));
    line.setAttribute('x2', String(dstX));
    line.setAttribute('y2', String(arrowY));
    line.setAttribute('stroke', '#f0883e');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', 'url(#arrow)');
    line.setAttribute('class', 'anim-migration');
    container.appendChild(line);

    // Arrow label
    const migLabel = document.createElementNS(NS, 'text');
    migLabel.setAttribute('x', String((srcX + dstX) / 2));
    migLabel.setAttribute('y', String(arrowY - 4));
    migLabel.setAttribute('text-anchor', 'middle');
    migLabel.setAttribute('fill', '#f0883e');
    migLabel.setAttribute('font-size', '10');
    migLabel.setAttribute('class', 'anim-migration');
    migLabel.textContent = `CPU${srcCpu} -> CPU${dstCpu}`;
    container.appendChild(migLabel);
  }

  // --- Current function ---
  const funcTop = domainTop + data.schedDomains.length * 22 + 10;
  const funcText = document.createElementNS(NS, 'text');
  funcText.setAttribute('x', String(margin.left));
  funcText.setAttribute('y', String(funcTop));
  funcText.setAttribute('fill', '#e6edf3');
  funcText.setAttribute('font-size', '12');
  funcText.setAttribute('class', 'anim-cpu-label');
  funcText.textContent = `Current: ${data.currentFunction}`;
  container.appendChild(funcText);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'sched-domain-hierarchy', label: 'Sched Domain Hierarchy' },
  { id: 'periodic-load-balance', label: 'Periodic Load Balance' },
  { id: 'numa-balancing', label: 'NUMA Balancing' },
];

const cpuLoadBalance: AnimationModule = {
  config: {
    id: 'cpu-load-balance',
    title: 'CPU Topology & Load Balancing',
    skillName: 'cpu-topology-and-load-balancing',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'periodic-load-balance': return generatePeriodicLoadBalance();
      case 'numa-balancing': return generateNumaBalancing();
      case 'sched-domain-hierarchy':
      default: return generateSchedDomainHierarchy();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default cpuLoadBalance;
