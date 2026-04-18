---
name: cgroups-and-namespaces
description: Combine cgroups and namespaces to build container isolation primitives
realm: containers
category: containers
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
- namespaces
- cgroups-v2
unlocks:
- seccomp-and-sandboxing
kernel_files:
- kernel/nsproxy.c
- kernel/cgroup/namespace.c
- kernel/cgroup/cgroup.c
doc_files:
- Documentation/admin-guide/cgroup-v2.rst
- Documentation/admin-guide/namespaces/compatibility-list.rst
badge: Container Architect
tags:
- containers
- isolation
- runtime
---


# Cgroups and Namespaces

## Quest Briefing

A Linux container is not a single kernel feature -- it is the combination of
namespaces for isolation and cgroups for resource control. Namespaces give a
process its own view of the system (its own PID tree, network stack, mount points),
while cgroups limit how much of the host's resources that process can consume.
Together, they form the containment boundary that every container runtime builds
upon.

The kernel ties these two subsystems together through the nsproxy structure and the
cgroup namespace. The cgroup namespace, implemented in kernel/cgroup/namespace.c,
virtualizes the cgroup hierarchy so that a process inside a container sees its
own cgroup as the root. This prevents containers from observing or manipulating
the host's cgroup tree. Meanwhile, copy_namespaces() in kernel/nsproxy.c handles
cloning both traditional namespaces and the cgroup namespace in a single
create_new_namespaces() call.

This skill brings together what you learned about namespaces and cgroups v2 and
shows how they interact at the kernel level to create the full container primitive.
You will trace the code paths that container runtimes like runc exercise when
setting up a new container.


## Learning Objectives

- Explain how the cgroup namespace virtualizes the cgroup hierarchy for
  containerized processes.
- Trace the copy_cgroup_ns() path in kernel/cgroup/namespace.c and understand
  how the root css_set is captured.
- Describe the full container setup sequence: user namespace, PID namespace,
  mount namespace, network namespace, cgroup namespace, and cgroup resource limits.
- Follow the nsproxy creation path when multiple CLONE_NEW* flags are combined.
- Understand how /proc/self/cgroup is virtualized inside a cgroup namespace.


## Core Concepts

### The Cgroup Namespace

The cgroup namespace, implemented in kernel/cgroup/namespace.c, controls what a
process sees as the root of the cgroup hierarchy. The key function is
copy_cgroup_ns() at line 48:

    struct cgroup_namespace *copy_cgroup_ns(u64 flags,
                                            struct user_namespace *user_ns,
                                            struct cgroup_namespace *old_ns)

When CLONE_NEWCGROUP is not set, the function simply increments the reference
count on the existing namespace via get_cgroup_ns(). When the flag is set, it:

1. Checks ns_capable(user_ns, CAP_SYS_ADMIN) at line 64.
2. Calls inc_cgroup_namespaces() at line 67 to account the namespace.
3. Acquires css_set_lock and captures the current task's css_set via
   task_css_set(current) at line 73. This css_set becomes the root view for
   the new namespace.
4. Allocates a new cgroup_namespace via alloc_cgroup_ns() at line 77.
5. Stores the captured css_set as ns->root_cset.

The root_cset field is the crucial piece: when a process inside the cgroup
namespace reads /proc/self/cgroup, the kernel shows paths relative to the
cgroup that was current when the namespace was created. The container sees
itself at "/" in the cgroup hierarchy.

### How nsproxy Ties Everything Together

The nsproxy structure at include/linux/nsproxy.h line 32 holds pointers to all
namespace types including cgroup_ns. When clone() or unshare() is called with
multiple CLONE_NEW* flags, create_new_namespaces() at kernel/nsproxy.c line 87
processes them all in sequence:

1. copy_mnt_ns() -- mount isolation
2. copy_utsname() -- hostname isolation
3. copy_ipcs() -- IPC isolation
4. copy_pid_ns() -- PID isolation
5. copy_cgroup_ns() -- cgroup view isolation (line 123)
6. copy_net_ns() -- network isolation
7. copy_time_ns() -- clock isolation

The order matters. The cgroup namespace is created after the PID namespace but
before the network namespace. Each copy function either shares (reference count
increment) or creates a new namespace based on its corresponding CLONE_NEW* flag.

The nsproxy_free() function at line 63 releases all namespaces when the nsproxy
reference count drops to zero, calling put_cgroup_ns(), put_pid_ns(), put_net(),
and the others.

### Container Setup Sequence

A typical container runtime (runc, crun) creates a container through this sequence
of kernel operations:

1. clone(CLONE_NEWUSER) or unshare(CLONE_NEWUSER) -- Create a user namespace.
   create_user_ns() at kernel/user_namespace.c line 83 gives the process full
   capabilities within the new namespace.

2. Write UID/GID maps -- /proc/PID/uid_map and gid_map establish the identity
   mapping between the container's UIDs and the host's UIDs.

3. unshare(CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWIPC |
   CLONE_NEWUTS | CLONE_NEWCGROUP) -- Create all remaining namespaces.
   This triggers create_new_namespaces() which calls each copy function.

4. Set up cgroup limits -- The runtime creates a cgroup under
   /sys/fs/cgroup/system.slice/container-X, enables controllers (memory, cpu,
   pids), and writes limits. This uses cgroup_mkdir() at
   kernel/cgroup/cgroup.c line 5994 and the cgroup_procs write path.

5. pivot_root() -- Switch the container's root filesystem. This operates within
   the mount namespace created in step 3.

6. exec() -- Replace the setup process with the container's init process. Inside
   the container, the process sees PID 1, an isolated network stack, and its
   cgroup as the hierarchy root.

### Interaction Points Between Cgroups and Namespaces

The cgroup and namespace subsystems interact at several points in the kernel:

**copy_namespaces() includes cgroup_ns** -- kernel/nsproxy.c line 123 calls
copy_cgroup_ns() as part of the namespace creation chain.

**cgroup_fs_context holds ns** -- kernel/cgroup/cgroup-internal.h line 48 stores
the cgroup_namespace in the filesystem context, ensuring the cgroup filesystem
mount respects the namespace boundaries.

**css_set links tasks to cgroups** -- The css_set captured by copy_cgroup_ns()
determines the root view. When a task moves between cgroups via
cgroup_migrate_execute() at kernel/cgroup/cgroup.c line 2693, the migration
respects namespace boundaries.

**Namespace cleanup** -- free_cgroup_ns() at kernel/cgroup/namespace.c line 36
releases the root_cset, decrements namespace counts, and frees the user namespace
reference.


## Code Walkthrough

Trace the complete container creation as done by runc:

1. **Create user namespace** -- unshare(CLONE_NEWUSER) triggers
   copy_namespaces() at kernel/nsproxy.c line 167. Since only CLONE_NEWUSER
   is relevant for credentials, the user namespace is created via copy_creds()
   which calls create_user_ns() at kernel/user_namespace.c line 83.

2. **Create remaining namespaces** -- clone() with CLONE_NEWPID | CLONE_NEWNS |
   CLONE_NEWNET | CLONE_NEWIPC | CLONE_NEWUTS | CLONE_NEWCGROUP enters
   copy_namespaces(). The ns_capable() check at line 181 passes because the
   process has CAP_SYS_ADMIN in its user namespace.

3. **create_new_namespaces() at line 87** -- Allocates a new nsproxy. Calls
   each copy function. For copy_cgroup_ns() at line 123, since CLONE_NEWCGROUP
   is set, it enters the creation path in kernel/cgroup/namespace.c.

4. **copy_cgroup_ns() at namespace.c line 48** -- Acquires css_set_lock,
   snapshots the current css_set, allocates a new cgroup_namespace, and
   stores the css_set as root_cset. This freezes the cgroup root view.

5. **Set up cgroup limits** -- The runtime writes to cgroup control files.
   cgroup_mkdir() creates the container cgroup. __cgroup_procs_write() at
   kernel/cgroup/cgroup.c line 5366 moves the container process into it.

6. **Process sees isolated view** -- When the containerized process reads
   /proc/self/cgroup, the kernel computes paths relative to root_cset. The
   process sees "/" as its cgroup root, unaware of the host hierarchy above.


## Hands-On Challenges

### Challenge 1: Build a Minimal Container (100 XP)

Write a C program that creates a container-like environment by:
1. Calling unshare() with CLONE_NEWUSER | CLONE_NEWPID | CLONE_NEWNS |
   CLONE_NEWCGROUP.
2. Writing UID/GID maps to /proc/self/uid_map and gid_map.
3. Forking a child (which becomes PID 1 in the new PID namespace).
4. The child reads /proc/self/cgroup and prints the output.

Compare the cgroup view inside vs outside. Trace the kernel path through
copy_cgroup_ns() at kernel/cgroup/namespace.c line 48.

Verification: Show the program, its output, and annotated kernel source tracing.

### Challenge 2: Cgroup Namespace Virtualization (100 XP)

Demonstrate cgroup namespace virtualization:
1. Create a cgroup /sys/fs/cgroup/test-container.
2. Move the current shell into it.
3. Create a new cgroup namespace with unshare --cgroup.
4. Inside the new namespace, cat /proc/self/cgroup and observe the path is
   now "/" instead of "/test-container".
5. Verify you cannot escape the namespace's cgroup root view.

Read kernel/cgroup/namespace.c and explain how root_cset stored at line 73-74
determines the virtualized path.

Verification: Show commands, output, and source references explaining the
root_cset mechanism.

### Challenge 3: Full Container Teardown Analysis (100 XP)

When a container exits, all its namespaces and cgroup memberships must be cleaned
up. Trace the teardown path:
1. Read kernel/nsproxy.c and find deactivate_nsproxy() at line 76. List every
   put_* function called by nsproxy_free().
2. Read kernel/cgroup/namespace.c and trace free_cgroup_ns() at line 36.
   Explain what put_css_set() does when the last reference is dropped.
3. Read kernel/cgroup/cgroup.c and find where empty cgroups are reaped
   after all tasks leave.

Verification: Annotated call chain from task exit through namespace cleanup
to cgroup destruction.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain the cgroup namespace and how copy_cgroup_ns() at
      kernel/cgroup/namespace.c line 48 captures the root css_set.
- [ ] Describe how root_cset virtualizes /proc/self/cgroup inside a container.
- [ ] Trace the full nsproxy creation path in create_new_namespaces() at
      kernel/nsproxy.c line 87 when multiple CLONE_NEW* flags are set.
- [ ] List the order in which copy functions are called and explain why order
      matters.
- [ ] Describe the container setup sequence: user namespace, PID namespace,
      mount, network, cgroup namespace, and resource limits.
- [ ] Explain free_cgroup_ns() at kernel/cgroup/namespace.c line 36 and the
      cleanup of root_cset and user_ns references.
- [ ] Describe how nsproxy_free() at kernel/nsproxy.c line 63 releases all
      namespaces when a task exits.
