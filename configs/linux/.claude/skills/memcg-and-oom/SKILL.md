---
name: memcg-and-oom
description: Understand memory cgroup accounting, limits, and the OOM killer
realm: memory
category: cgroup-memory
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - page-reclaim-and-swap
  - cgroups-v2
unlocks: []
kernel_files:
  - mm/memcontrol.c
  - mm/oom_kill.c
doc_files:
  - Documentation/admin-guide/cgroup-v2.rst
badge: OOM Arbiter
tags:
  - memcg
  - oom
  - cgroup-memory
---

# Memory Cgroups and OOM Killer

## Quest Briefing

In a modern Linux system, memory is not just a shared pool -- it is
partitioned, accounted, and limited per workload through memory cgroups
(memcg). Containers, systemd services, and orchestrators like Kubernetes
all rely on memcg to enforce memory budgets and prevent one workload from
starving others. When a memory cgroup exceeds its limit and reclaim cannot
free enough pages, the OOM (Out of Memory) killer steps in to terminate
a process and reclaim its memory.

The OOM killer is the kernel's last line of defense against memory
exhaustion. It must make a difficult decision: which process to kill to
free the most memory with the least impact. Understanding its scoring
algorithm, the memcg OOM path, and the system-wide OOM path is essential
for anyone operating production Linux systems.

This skill connects the page reclaim pipeline you learned previously to
the cgroup resource control framework. You will understand how every page
allocation is charged to a memcg, how limits trigger reclaim, and what
happens when reclaim fails. This knowledge is critical for debugging
container OOM kills, tuning memory limits, and understanding why the
kernel killed a particular process.


## Learning Objectives

- Explain how struct mem_cgroup tracks memory usage with page_counter
  hierarchical accounting.
- Trace how page charges flow through the memcg accounting path during
  allocation and fault handling.
- Describe the memcg reclaim trigger: what happens when a cgroup hits
  its memory.max limit.
- Explain the OOM scoring algorithm in oom_badness() and how
  oom_score_adj influences victim selection.
- Trace the full OOM kill path from out_of_memory() through
  select_bad_process() to oom_kill_process().


## Core Concepts

### struct mem_cgroup: The Memory Controller

Defined at include/linux/memcontrol.h:190, struct mem_cgroup is the
kernel's representation of a memory cgroup. Key fields:

- css (line 191): The cgroup_subsys_state, linking this memcg to the
  cgroup hierarchy.
- memory (line 197): A struct page_counter tracking memory usage. This
  is the primary counter, corresponding to the memory.current file in
  cgroupfs. It includes a hierarchical limit (memory.max).
- swap/memsw (lines 200-201): Counters for swap usage. In cgroup v2,
  swap is tracked separately; in v1, memsw tracks memory+swap combined.
- high_work (line 210): A work_struct for handling memory.high
  threshold enforcement asynchronously.
- memory_peaks and swap_peaks (lines 205-206): Lists of peak memory
  watermark watchers.

The page_counter structure provides hierarchical accounting: when a
child memcg is charged, all ancestors up to the root are also charged.
This ensures that a parent cgroup's limit applies to the sum of all
its children.

### Memory Charging

Every page allocation that is attributed to a userspace process is
charged to its memcg. The charge path integrates with the page fault
handler: in handle_mm_fault() at mm/memory.c:6589, line 6617 calls
mem_cgroup_enter_user_fault() to enter the memcg OOM context.

When a page is allocated for a user process, mem_cgroup_charge() (or
related functions) attempts to charge the page to the task's memcg.
If the charge would exceed the memcg's memory.max limit:

1. Memcg-specific reclaim is triggered: the kernel tries to reclaim
   pages belonging to this cgroup.
2. If reclaim fails, mem_cgroup_oom() is called.

### mem_cgroup_oom(): The Memcg OOM Path

Defined at mm/memcontrol.c:1706, mem_cgroup_oom() is called when a
memcg has exhausted its memory limit and reclaim cannot help:

1. Line 1710: Rejects orders above PAGE_ALLOC_COSTLY_ORDER (order 3),
   as large allocations failing is expected.
2. Line 1713: Records a MEMCG_OOM memory event for the cgroup.
3. Line 1715: Calls memcg1_oom_prepare() to set up OOM state.
4. Line 1718: Calls mem_cgroup_out_of_memory() to invoke the OOM
   killer scoped to this cgroup.
5. Line 1720: Calls memcg1_oom_finish() to clean up.

mem_cgroup_out_of_memory() at mm/memcontrol.c:1673 builds an
oom_control structure with the memcg set (line 1679) and calls
out_of_memory() -- the same function used for system-wide OOM, but
constrained to the memcg.

### The OOM Scoring Algorithm: oom_badness()

Defined at mm/oom_kill.c:202, oom_badness() calculates a score for
each candidate process. The process with the highest score is killed.

The algorithm:
1. Line 207: Unkillable tasks (kernel threads, init) get LONG_MIN
   (never selected).
2. Line 210: find_lock_task_mm() gets the task's mm_struct.
3. Lines 220-222: Tasks with oom_score_adj == OOM_SCORE_ADJ_MIN (-1000),
   tasks already marked for OOM skip, or tasks in vfork get LONG_MIN.
4. Lines 231-232: The baseline score is the sum of:
   - RSS (resident set size): get_mm_rss_sum()
   - Swap entries: get_mm_counter_sum(MM_SWAPENTS)
   - Page table pages: mm_pgtables_bytes() / PAGE_SIZE
5. Lines 236-237: The oom_score_adj value is applied:
   adj *= totalpages / 1000, then points += adj.
   An oom_score_adj of +1000 makes the task very likely to be killed;
   -1000 makes it immune.

This means the OOM killer primarily targets the process using the most
memory, adjusted by the administrator-set oom_score_adj value.

### out_of_memory(): The OOM Decision

Defined at mm/oom_kill.c:1119, this is the central OOM function:

1. Line 1123: If the OOM killer is disabled, return false.
2. Lines 1126-1131: For non-memcg OOM, notifies OOM watchers. If any
   freed memory, return (avoid killing if memory became available).
3. Lines 1138-1142: If the current task is already exiting, mark it as
   an OOM victim and queue the OOM reaper. No need to kill another.
4. Line 1156: Calls constrained_alloc() to determine if this is a
   NUMA, memcg, or cpuset constrained OOM.
5. Line 1159: check_panic_on_oom() handles the panic_on_oom sysctl.
6. Lines 1161-1168: If sysctl_oom_kill_allocating_task is set, kill
   the current (allocating) task directly.
7. Line 1171: Calls select_bad_process() to find the best victim.

select_bad_process() at mm/oom_kill.c:365 iterates all tasks (or all
tasks in the memcg for memcg OOM) and calls oom_evaluate_task()
(line 309) for each, which calls oom_badness(). The task with the
highest score becomes oc->chosen.

### oom_kill_process(): The Kill

Defined at mm/oom_kill.c:1024, this function kills the selected victim:

1. Line 1037: If the victim is already exiting, just mark it as OOM
   victim and queue the OOM reaper (fast path).
2. Line 1047: Dumps OOM diagnostic headers (dump_header at line 459).
3. Line 1056: Checks if the entire memory cgroup should be killed
   (oom_group feature) via mem_cgroup_get_oom_group().
4. Line 1058: Calls __oom_kill_process() which sends SIGKILL to the
   victim and all processes sharing its mm_struct.
5. Lines 1063-1068: If oom_group is set, scans all tasks in the cgroup
   and kills them (oom_kill_memcg_member).


## Code Walkthrough

Trace what happens when a container (memory cgroup) hits its memory.max
limit of 512 MB:

1. **Allocation attempt** -- A process in the cgroup allocates a page.
   The memcg charge path checks page_counter: the current usage (512 MB)
   equals the limit.

2. **Memcg reclaim** -- The kernel attempts to reclaim pages belonging
   to this cgroup. shrink_node() is called with the memcg set in
   scan_control, restricting reclaim to this cgroup's pages.

3. **Reclaim fails** -- All pages are actively referenced or dirty with
   pending I/O. Reclaim cannot free enough memory.

4. **mem_cgroup_oom()** -- mm/memcontrol.c:1706: Records MEMCG_OOM
   event (visible in memory.events). Calls mem_cgroup_out_of_memory()
   at line 1673.

5. **out_of_memory()** -- mm/oom_kill.c:1119: Since this is a memcg
   OOM (is_memcg_oom returns true), constrained_alloc() at line 1156
   returns CONSTRAINT_MEMCG. select_bad_process() iterates only tasks
   in this cgroup.

6. **oom_badness() scores tasks** -- mm/oom_kill.c:202: For each task
   in the cgroup, computes RSS + swap + page tables, adjusted by
   oom_score_adj. The largest consumer scores highest.

7. **oom_kill_process()** -- mm/oom_kill.c:1024: The victim receives
   SIGKILL. The OOM reaper (a kernel thread) asynchronously reclaims
   the victim's address space even before the process fully exits.

8. **Memory freed** -- The victim's pages are freed. The memcg's
   page_counter decreases. Other processes in the cgroup can now
   allocate.


## Hands-On Challenges

### Challenge 1: Trigger and Analyze a Memcg OOM (100 XP)

Create a memory cgroup with a 64 MB limit and run a program that
allocates beyond it:
1. mkdir /sys/fs/cgroup/test && echo 67108864 > .../test/memory.max
2. Run a program in the cgroup that allocates and touches 128 MB.
3. Read memory.events to see the oom counter increment.
4. Read dmesg for the OOM kill log and identify:
   - The victim process and its oom_badness score.
   - The memcg hierarchy information.
   - The memory usage breakdown.

Then trace the code path from mem_cgroup_oom() at mm/memcontrol.c:1706
through out_of_memory() at mm/oom_kill.c:1119.

Verification: Show memory.events, dmesg output, and annotated code path.

### Challenge 2: Understand oom_score_adj (100 XP)

Write three programs with different memory footprints (10 MB, 50 MB,
100 MB) in a cgroup:
1. Set oom_score_adj to different values via /proc/PID/oom_score_adj.
2. Trigger OOM and observe which process is killed.
3. Read oom_badness() at mm/oom_kill.c:202 and manually compute the
   expected scores using the formula: RSS + swap + pgtables + adj.
4. Repeat with different oom_score_adj values and predict the victim.

Verification: Show computed scores matching the kernel's selection.

### Challenge 3: OOM Reaper and Group Kill (100 XP)

Read mm/oom_kill.c and answer:
1. What does the OOM reaper do and why is it necessary? (Find
   queue_oom_reaper at line 1039.)
2. How does the oom_group feature at line 1056 work? What cgroup
   setting enables it (memory.oom.group)?
3. What happens when panic_on_oom is set? (Find check_panic_on_oom.)

Set up a test with memory.oom.group = 1 and verify that all processes
in the cgroup are killed, not just one.

Verification: Show the group kill behavior and annotated source paths.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Describe struct mem_cgroup at include/linux/memcontrol.h:190 and
      the page_counter hierarchy for memory accounting.
- [ ] Explain how mem_cgroup_oom() at mm/memcontrol.c:1706 triggers
      when a cgroup exceeds memory.max.
- [ ] Trace mem_cgroup_out_of_memory() at line 1673 calling
      out_of_memory() at mm/oom_kill.c:1119 with memcg constraints.
- [ ] Calculate oom_badness() scores at mm/oom_kill.c:202 using the
      RSS + swap + pgtables + adj formula.
- [ ] Describe select_bad_process() at line 365 iterating tasks and
      oom_evaluate_task() at line 309 comparing scores.
- [ ] Explain oom_kill_process() at mm/oom_kill.c:1024 including the
      oom_group cgroup kill feature at line 1056.
- [ ] Describe the difference between system-wide OOM (all tasks
      eligible) and memcg OOM (only cgroup tasks eligible).
