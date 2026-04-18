---
name: cgroups-v2
description: Master cgroups v2 resource control and the unified hierarchy
realm: containers
category: resource-control
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
- process-lifecycle
unlocks:
- cgroups-and-namespaces
- memcg-and-oom
kernel_files:
- kernel/cgroup/cgroup.c
- kernel/cgroup/cgroup-internal.h
- kernel/cgroup/cpuset.c
- include/linux/cgroup.h
doc_files:
- Documentation/admin-guide/cgroup-v2.rst
badge: Cgroup Commander
tags:
- cgroup
- cgroup-v2
- resource-control
---


# Cgroups v2

## Quest Briefing

Control groups (cgroups) are the kernel mechanism for organizing processes into
hierarchical groups and applying resource limits, accounting, and control policies.
While namespaces isolate what a process can see, cgroups control what a process can
use -- CPU time, memory, I/O bandwidth, and more. Every container runtime depends
on cgroups to enforce resource limits and prevent a single container from starving
the host.

Cgroups v2 replaced the original cgroups v1 with a unified hierarchy: a single
tree of cgroups where all controllers (cpu, memory, io, pids, etc.) are managed
together. The v2 design eliminates the confusion of multiple parallel hierarchies
and enforces a strict "no internal processes" rule that makes resource distribution
predictable. The kernel source for the cgroup core lives in kernel/cgroup/cgroup.c
-- one of the largest files in the kernel at over 6000 lines.

Understanding cgroups v2 means understanding how the kernel organizes processes
into groups, attaches resource controllers, and enforces limits through the
unified hierarchy mounted at /sys/fs/cgroup.


## Learning Objectives

- Explain the cgroups v2 unified hierarchy model and the "no internal processes"
  rule.
- Trace the core data structures: struct cgroup, struct cgroup_root, struct css_set,
  and struct cgroup_subsys.
- Follow cgroup creation through cgroup_mkdir() at kernel/cgroup/cgroup.c line 5994
  and understand how controllers are enabled.
- Describe how processes are migrated between cgroups via cgroup_attach_task() and
  the cgroup_migrate() machinery.
- Understand the cpuset controller as implemented in kernel/cgroup/cpuset.c and
  its role in CPU/memory node affinity.


## Core Concepts

### The Unified Hierarchy

Cgroups v2 uses a single hierarchy rooted at cgrp_dfl_root, declared in
include/linux/cgroup.h line 77. This root is the default cgroup hierarchy mounted
at /sys/fs/cgroup. The global cgroup_mutex at kernel/cgroup/cgroup.c line 89
protects all modifications to the hierarchy.

The subsystem array at line 156 maps controller IDs to their cgroup_subsys
structures:

    struct cgroup_subsys *cgroup_subsys[] = {
    #include <linux/cgroup_subsys.h>
    };

Each entry (cpu, memory, io, pids, cpuset, etc.) is a controller that can be
enabled on cgroups in the hierarchy. The css_set_lock spinlock at line 90 protects
the mapping between tasks and their cgroup membership.

### Core Data Structures

**struct cgroup** represents a node in the hierarchy. It contains:
- self: a struct cgroup_subsys_state (css) that links the cgroup to the subsystem
  hierarchy.
- kn: a kernfs_node for the sysfs representation at /sys/fs/cgroup.
- ancestors[]: an array for quick ancestor lookups.

**struct css_set** represents the set of cgroups a task belongs to across all
controllers. Tasks with identical cgroup memberships share a css_set. The global
init_css_set (include/linux/cgroup.h line 78) is the initial set for PID 1.

**struct cgroup_subsys** represents a controller (cpu, memory, io, etc.). Each has
callbacks: css_alloc, css_online, css_offline, css_free, attach, fork, exit.

**struct cgroup_fs_context** at kernel/cgroup/cgroup-internal.h line 45 holds the
filesystem mount context, including the cgroup_root and namespace pointers.

### Creating Cgroups: cgroup_mkdir()

When userspace does mkdir /sys/fs/cgroup/mygroup, the kernel calls cgroup_mkdir()
at kernel/cgroup/cgroup.c line 5994:

    int cgroup_mkdir(struct kernfs_node *parent_kn, const char *name, umode_t mode)

The function:
1. Calls cgroup_kn_lock_live() to lock the parent cgroup.
2. Checks hierarchy depth limits via cgroup_check_hierarchy_limits().
3. Calls cgroup_create() to allocate and initialize the new struct cgroup.
4. Calls css_populate_dir() at line 6024 to create the control files
   (cgroup.procs, cgroup.controllers, cgroup.subtree_control, etc.).
5. Calls cgroup_apply_control_enable() at line 6028 to activate controllers
   that are enabled in the parent's subtree_control.
6. Calls kernfs_activate() to make the directory visible.

Removal is handled by cgroup_rmdir() at line 6300, which calls
cgroup_destroy_locked() after verifying the cgroup has no children and no tasks.

### Process Migration

Moving a process between cgroups involves the cgroup_migrate() machinery starting
at line 2990. The sequence:

1. cgroup_procs_write_start() at line 3050 reads a PID from the cgroup.procs file
   and finds the target task.
2. cgroup_attach_task() at line 3020 sets up the migration context.
3. cgroup_migrate_add_src() at line 2876 records the source css_sets.
4. cgroup_migrate_prepare_dst() at line 2923 finds or creates destination css_sets.
5. cgroup_migrate_execute() at line 2693 performs the actual migration: it moves
   tasks to new css_sets and calls the attach() callback on each controller.

The attach callbacks allow controllers to react -- for example, the cpu controller
updates scheduling parameters, and the memory controller may charge pages to the
new cgroup.

### The cpuset Controller

The cpuset controller at kernel/cgroup/cpuset.c assigns CPU cores and memory nodes
to cgroups. Key constants:

    DEFINE_STATIC_KEY_FALSE(cpusets_enabled_key);
    DEFINE_STATIC_KEY_FALSE(cpusets_insane_config_key);

cpuset uses static keys for zero-cost checking when cpusets are disabled. When
enabled, it constrains which CPUs a task can run on (cpuset.cpus) and which NUMA
nodes it can allocate memory from (cpuset.mems). Partition roots allow exclusive
CPU assignment where a set of CPUs is carved out for a subtree.


## Code Walkthrough

Trace creating a cgroup, enabling the memory controller, and moving a process:

1. **Mount the cgroup filesystem** -- Typically at boot, systemd mounts cgroup2
   at /sys/fs/cgroup. The kernel calls cgroup_init_fs_context() at line 2350,
   which sets up the default root cgrp_dfl_root via cgroup_setup_root() at
   line 2153.

2. **mkdir /sys/fs/cgroup/myapp** -- Triggers cgroup_mkdir() at line 5994.
   cgroup_create() allocates a new struct cgroup, links it as a child of the
   root cgroup, and initializes its kernfs directory.

3. **Enable memory controller** -- Writing "+memory" to
   /sys/fs/cgroup/cgroup.subtree_control triggers cgroup_subtree_control_write().
   This calls cgroup_apply_control() at line 3466, which calls
   cgroup_apply_control_enable() at line 3375 to create the memory controller's
   css (cgroup_subsys_state) for child cgroups.

4. **Set memory limit** -- Writing "100M" to
   /sys/fs/cgroup/myapp/memory.max triggers the memory controller's write
   callback, setting the page limit for the cgroup.

5. **Move process** -- Writing a PID to /sys/fs/cgroup/myapp/cgroup.procs
   triggers __cgroup_procs_write() at line 5366. It calls cgroup_attach_task()
   at line 3020, which runs through the migrate machinery:
   cgroup_migrate_add_src() -> cgroup_migrate_prepare_dst() ->
   cgroup_migrate_execute().

6. **Controller reacts** -- During cgroup_migrate_execute() at line 2693, the
   memory controller's attach() callback is invoked. It charges the task's
   existing memory usage to the new cgroup.


## Hands-On Challenges

### Challenge 1: Explore the Hierarchy (60 XP)

On a system with cgroups v2 (check for /sys/fs/cgroup/cgroup.controllers):
1. List all available controllers in the root cgroup.
2. Create a new cgroup directory.
3. Read the cgroup.controllers and cgroup.subtree_control files.
4. Enable the pids controller and set pids.max to 10.
5. Fork-bomb inside the cgroup and observe the pids.current counter.

Then read kernel/cgroup/cgroup.c and trace cgroup_mkdir() at line 5994. Identify
where css_populate_dir() creates each control file.

Verification: Show the commands, file contents, and annotated source references.

### Challenge 2: Memory Controller Limits (70 XP)

Create a cgroup with the memory controller enabled. Set memory.max to 50M. Write a
C program that allocates memory in a loop until the OOM killer triggers. Observe:
1. The memory.current value as allocations proceed.
2. The memory.events file showing oom events.
3. The kernel log (dmesg) showing the OOM kill.

Then read the cgroup_migrate() path at kernel/cgroup/cgroup.c line 2990 and explain
how the memory controller's attach callback works.

Verification: Show allocation output, cgroup stats, OOM log entries, and source
references.

### Challenge 3: Data Structure Mapping (70 XP)

Read kernel/cgroup/cgroup-internal.h and include/linux/cgroup.h. Draw the
relationship between:
- struct cgroup_root (cgrp_dfl_root) and its root struct cgroup
- struct cgroup_subsys entries in the cgroup_subsys[] array
- struct css_set and how it links tasks to their cgroup membership
- struct cgroup_subsys_state as the per-cgroup, per-controller state

Identify init_css_set and explain what it contains and who uses it.

Verification: Diagram with accurate struct names and field references from the
source code.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain the cgroups v2 unified hierarchy and contrast it with v1's
      per-controller hierarchies.
- [ ] Describe struct cgroup, struct css_set, and struct cgroup_subsys and how
      they interrelate.
- [ ] Trace cgroup_mkdir() at kernel/cgroup/cgroup.c line 5994 through
      cgroup_create() to css_populate_dir().
- [ ] Explain how cgroup_migrate_execute() at line 2693 moves tasks between
      cgroups and triggers controller attach callbacks.
- [ ] Describe cgroup_setup_root() at line 2153 and how the default hierarchy
      is initialized.
- [ ] Explain the role of cgroup_mutex and css_set_lock in protecting the
      hierarchy.
- [ ] Describe how the cpuset controller at kernel/cgroup/cpuset.c constrains
      CPU and memory node affinity.
