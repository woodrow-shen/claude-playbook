---
name: cpu-topology-and-load-balancing
description: Understand NUMA topology and scheduler load balancing across CPUs
realm: scheduler
category: scheduling
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - scheduler-fundamentals
unlocks: []
kernel_files:
  - kernel/sched/topology.c
  - kernel/sched/fair.c
doc_files:
  - Documentation/scheduler/sched-domains.rst
  - Documentation/scheduler/sched-energy.rst
badge: Topology Navigator
tags:
  - numa
  - load-balance
  - sched-domain
---

# CPU Topology and Load Balancing

## Quest Briefing

On a modern server with multiple sockets, each containing many cores with
SMT threads, not all CPUs are equal. Migrating a task between SMT siblings
is nearly free -- they share the same L1 and L2 caches. Moving a task to
a different core on the same socket costs more -- the L2 cache is cold.
Moving between NUMA nodes is expensive -- memory access latency can double.

The Linux scheduler must understand this topology to make intelligent
placement decisions. The scheduler domain (sched_domain) hierarchy in
kernel/sched/topology.c models the CPU topology as a tree of increasingly
inclusive groups. At the bottom are SMT siblings, then physical cores, then
sockets/NUMA nodes. The load balancer in kernel/sched/fair.c periodically
walks this hierarchy, pulling tasks from overloaded CPUs to underloaded ones,
with the cost of migration weighted by the topology level.

This is one of the most complex parts of the scheduler. Getting load balancing
right means the difference between a system that uses all its CPUs efficiently
and one where tasks pile up on a few cores while others sit idle.


## Learning Objectives

- Explain the sched_domain hierarchy and how it models CPU topology.
- Trace the build_sched_domains() function that constructs the hierarchy.
- Describe the periodic load balancing algorithm in sched_balance_rq().
- Understand the idle balancing path in sched_balance_newidle().
- Explain NUMA-aware scheduling and the cost model for task migration.


## Core Concepts

### Scheduler Domains

A scheduler domain (struct sched_domain) represents a level in the CPU
topology hierarchy. The topology.c file defines the domain construction.
The DEFINE_MUTEX(sched_domains_mutex) at line 10 protects the domain
hierarchy during construction and teardown.

Domain levels are built from sched_domain_topology_level descriptors. The
sd_init() function at topology.c:1637 initializes a sched_domain for a given
topology level. Each domain has:

- span: A cpumask of all CPUs in this domain.
- groups: Linked list of sched_group structures, each representing a subset
  of CPUs at the next lower topology level.
- flags: SD_* flags (defined via sd_flag_debug[] at line 38) that control
  balancing behavior. Key flags include SD_BALANCE_NEWIDLE, SD_BALANCE_EXEC,
  SD_BALANCE_FORK, SD_SHARE_CPUCAPACITY (for SMT), and SD_NUMA.
- name: A human-readable level name (e.g., "SMT", "MC", "NUMA").

The hierarchy is visible in the debug output: sched_domain_debug_one() at
line 43 prints each domain's span and level name.

### Building the Domain Hierarchy

build_sched_domains() at topology.c:2556 constructs the complete hierarchy
for a given cpumask. It is called during boot from sched_init_domains() at
line 2761, which calls build_sched_domains(doms_cur[0], NULL) at line 2776.

The construction process:
1. For each topology level (SMT, MC, DIE, NUMA), create a sched_domain.
2. Link domains vertically: each domain's ->child points to the next
   lower level.
3. Create sched_groups within each domain.
4. Calculate group capacities for load balancing math.

The hierarchy is rebuilt when the CPU topology changes (hotplug, cpusets)
via rebuild_sched_domains() and rebuild_sched_domains_energy() at line 262.

### Periodic Load Balancing

The periodic load balancer runs on every CPU via the scheduler tick. It
calls rebalance_domains() which walks the sched_domain hierarchy from
bottom to top. For each domain level, sched_balance_rq() at fair.c:11869
performs the balancing:

1. **Statistics gathering**: update_sd_lb_stats (referenced at fair.c:10119
   for update_cpu_capacity) computes the load of each sched_group in the
   domain. The struct sd_lb_stats (line 10057) collects domain-wide stats.

2. **Find busiest group**: sched_balance_find_dst_group() at line 7444
   identifies the most overloaded group.

3. **Find busiest CPU**: sched_balance_find_dst_cpu() at line 7506 picks
   the specific CPU to pull tasks from.

4. **Pull tasks**: Tasks are migrated from the busiest CPU to the current
   CPU. The number of tasks to move is calculated to equalize load.

The balancing interval increases at higher topology levels -- SMT balancing
happens frequently, while NUMA balancing is less frequent. The
max_load_balance_interval (fair.c:9269) scales with the number of CPUs.

### Idle Balancing

When a CPU goes idle, sched_balance_newidle() at fair.c:12926 (also at
line 4844) performs immediate load balancing without waiting for the periodic
timer. This is critical for keeping CPUs busy:

1. The idle CPU checks each sched_domain level for work to steal.
2. It calls sched_balance_rq() (fair.c:12131) for each domain.
3. It can pull tasks from busy CPUs in the same domain.

The working cpumask for load balancing is defined with
DEFINE_PER_CPU(cpumask_var_t, load_balance_mask) at fair.c:7210.

### Wake-Up Balancing and CPU Selection

When a task wakes up, the scheduler must decide which CPU to place it on.
select_idle_cpu() at fair.c:7705 searches for an idle CPU within the
appropriate sched_domain:

1. wake_affine() at line 7423 checks if the task should stay on the
   same CPU or move to the waking CPU.
2. select_idle_smt() at line 7657 checks SMT siblings first (cheapest).
3. select_idle_cpu() at line 7705 searches the domain for idle CPUs.
4. select_idle_capacity() at line 7775 considers CPU capacity for
   heterogeneous systems.

Energy-aware scheduling (line 8409) integrates with the domain hierarchy
to minimize power consumption on systems with different CPU types (big.LITTLE).


## Code Walkthrough

Trace a load balancing event on a 2-socket NUMA system:

1. **CPU 0 is idle**: The idle loop calls schedule(), which calls
   sched_balance_newidle() at fair.c:12926.

2. **Check SMT domain**: CPU 0 checks its SMT sibling (CPU 1). If CPU 1
   has excess tasks, pull one. Cost is very low (shared L1/L2).

3. **Check MC (multi-core) domain**: If no work at SMT level, check the
   physical package. sched_balance_rq() examines all cores on socket 0.

4. **Check NUMA domain**: If the socket is idle, check the other socket.
   The load balancer uses sd_lb_stats (fair.c:10057) to compare socket loads.

5. **Migration decision**: If socket 1 is overloaded, pull a task. The
   NUMA domain has a higher balance_interval and migration cost, so the
   imbalance must be significant to justify the move.

6. **Task runs on CPU 0**: The pulled task starts running. Its cache is
   cold and NUMA-remote memory accesses may be slower until data migrates.


## Hands-On Challenges

### Challenge 1: Visualize Your Sched Domain Hierarchy (100 XP)

On your system, read /proc/sys/kernel/sched_domain/ and reconstruct the
complete domain hierarchy. For each domain level, document:
- The cpumask span.
- The SD_* flags (reference sd_flag_debug at topology.c:38).
- The balance_interval and imbalance_pct parameters.
- The groups and their members.

Draw a tree diagram of the hierarchy from SMT to NUMA.

Verification: Show the complete hierarchy with accurate cpumasks and flags
matching your system's /proc output.

### Challenge 2: Observe Load Balancing with ftrace (100 XP)

Enable ftrace events for sched_migrate_task and sched_balance. Run a
workload with more threads than CPUs on one NUMA node, then observe:
- The load balancer detecting the imbalance.
- Tasks being migrated to the other node.
- The balancing interval at each domain level.

Reference sched_balance_rq() at fair.c:11869 and the statistics at
sd_lb_stats (line 10057).

Verification: Show ftrace output demonstrating at least 5 migrations with
annotated source code references for each decision point.

### Challenge 3: NUMA Placement Benchmark (100 XP)

Write a multi-threaded program where each thread allocates and accesses
a large array. Measure:
- Performance when all threads are on one NUMA node.
- Performance when threads are spread across nodes.
- Performance with numactl --interleave vs --membind.

Explain the results in terms of the scheduler's NUMA balancing and the
topology hierarchy. Reference select_idle_cpu() at fair.c:7705 and the
NUMA domain's balancing parameters.

Verification: Show performance numbers for at least 3 configurations with
explanations referencing scheduler source code.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Describe the sched_domain hierarchy and how sd_init() at
      topology.c:1637 constructs each level.
- [ ] Trace build_sched_domains() at topology.c:2556 and explain how it
      builds the complete domain tree.
- [ ] Explain the periodic load balancing in sched_balance_rq() at
      fair.c:11869 including statistics gathering and task pulling.
- [ ] Describe idle balancing via sched_balance_newidle() at fair.c:12926
      and why it is critical for CPU utilization.
- [ ] Explain the wake-up CPU selection path through select_idle_cpu()
      (fair.c:7705) and wake_affine() (fair.c:7423).
- [ ] Read /proc/sys/kernel/sched_domain/ and interpret every parameter
      in terms of the source code.
- [ ] Describe the cost model for task migration at different topology
      levels (SMT, core, socket, NUMA).
