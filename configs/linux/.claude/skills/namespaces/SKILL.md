---
name: namespaces
description: Understand Linux namespaces and how they isolate process resources
realm: containers
category: isolation
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - process-lifecycle
unlocks:
  - cgroups-and-namespaces
kernel_files:
  - kernel/nsproxy.c
  - kernel/pid_namespace.c
  - kernel/user_namespace.c
  - net/core/net_namespace.c
  - include/linux/nsproxy.h
doc_files:
  - Documentation/admin-guide/namespaces/compatibility-list.rst
badge: Namespace Weaver
tags:
  - namespace
  - pid-ns
  - net-ns
  - isolation
---

# Namespaces

## Quest Briefing

Namespaces are the foundation of container isolation in the Linux kernel. Every
container runtime -- Docker, Podman, LXC -- relies on namespaces to give each
container the illusion of having its own system. A process inside a PID namespace
sees itself as PID 1, unaware of the thousands of other processes on the host. A
process in its own network namespace has its own routing table, firewall rules, and
network interfaces.

The kernel implements eight namespace types: mount (mnt), UTS (hostname), IPC
(System V IPC), PID, network, user, cgroup, and time. Each one virtualizes a
different global resource. The nsproxy structure ties them together, giving every
task a pointer to the set of namespaces it belongs to. Understanding namespaces
means understanding how the kernel draws isolation boundaries without hardware
virtualization.

When a process calls clone() with CLONE_NEWPID or unshare(CLONE_NEWNET), the kernel
creates new namespace instances and attaches them to the calling task. This skill
traces exactly how that works at the source level, from the nsproxy structure
through the per-namespace creation functions.


## Learning Objectives

- Describe the eight Linux namespace types and what global resource each virtualizes.
- Trace the nsproxy structure in include/linux/nsproxy.h and explain how tasks
  share or isolate namespaces.
- Follow the create_new_namespaces() call chain in kernel/nsproxy.c through each
  copy_*_ns() function.
- Explain how PID namespaces are hierarchical and how create_pid_namespace() in
  kernel/pid_namespace.c manages levels.
- Understand user namespaces and how create_user_ns() in kernel/user_namespace.c
  remaps UID/GID and grants capabilities within the namespace.


## Core Concepts

### struct nsproxy: The Namespace Proxy

Defined in include/linux/nsproxy.h at line 32, struct nsproxy holds pointers to
all per-process namespaces:

- uts_ns: hostname and domain name (struct uts_namespace)
- ipc_ns: System V IPC objects (struct ipc_namespace)
- mnt_ns: mount points (struct mnt_namespace)
- pid_ns_for_children: PID namespace for new children (struct pid_namespace)
- net_ns: network stack (struct net)
- time_ns / time_ns_for_children: clock offsets (struct time_namespace)
- cgroup_ns: cgroup root view (struct cgroup_namespace)

The global init_nsproxy at kernel/nsproxy.c line 33 is the initial namespace set
used by PID 1. Its members point to init_uts_ns, init_ipc_ns, init_pid_ns,
init_net, init_cgroup_ns, and init_time_ns.

Tasks that share all namespaces share a single nsproxy (reference-counted via
refcount_t count). As soon as any single namespace is cloned or unshared, the
kernel copies the entire nsproxy via create_nsproxy() at line 53, which allocates
from nsproxy_cachep using kmem_cache_alloc().

### Creating New Namespaces: The Clone Path

When a process calls clone() with namespace flags, copy_namespaces() at
kernel/nsproxy.c line 167 is invoked. It checks the CLONE_NEW* flags:

    if (likely(!(flags & (CLONE_NEWNS | CLONE_NEWUTS | CLONE_NEWIPC |
                          CLONE_NEWPID | CLONE_NEWNET |
                          CLONE_NEWCGROUP | CLONE_NEWTIME)))) {
        get_nsproxy(old_ns);
        return 0;
    }

If no namespace flags are set, the child shares the parent's nsproxy (fast path).
Otherwise, ns_capable(user_ns, CAP_SYS_ADMIN) is checked, and create_new_namespaces()
at line 87 is called. This function allocates a new nsproxy and then calls each
copy function in sequence:

1. copy_mnt_ns() -- mount namespace
2. copy_utsname() -- UTS namespace
3. copy_ipcs() -- IPC namespace
4. copy_pid_ns() -- PID namespace
5. copy_cgroup_ns() -- cgroup namespace
6. copy_net_ns() -- network namespace
7. copy_time_ns() -- time namespace

Each copy function checks whether its CLONE_NEW* flag is set. If not, it increments
the reference count on the existing namespace. If set, it creates a fresh namespace
instance.

### PID Namespace Hierarchy

PID namespaces are hierarchical. Each new PID namespace has a level one greater
than its parent. create_pid_namespace() at kernel/pid_namespace.c line 76 enforces
this:

    unsigned int level = parent_pid_ns->level + 1;

The maximum nesting depth is MAX_PID_NS_LEVEL. Each level gets its own kmem_cache
for struct pid allocation via create_pid_cachep(). A process is visible in its
own PID namespace and all ancestor namespaces, but not in sibling or descendant
namespaces.

The pid_ns_for_children field in nsproxy determines which PID namespace new children
will be created in. This is why unshare(CLONE_NEWPID) affects children, not the
calling process itself.

### User Namespaces and Capability Remapping

User namespaces are unique: they are the only namespace type that an unprivileged
process can create. create_user_ns() at kernel/user_namespace.c line 83 creates a
new user namespace where the creator gets a full set of capabilities:

    cred->cap_permitted = CAP_FULL_SET;
    cred->cap_effective = CAP_FULL_SET;

This happens via set_cred_user_ns() at line 44. The new namespace has a level one
greater than its parent (max depth 32). UID/GID mappings are written through
/proc/PID/uid_map and /proc/PID/gid_map, validated by new_idmap_permitted().

The user namespace is the owner of all other namespaces. When creating a PID or
network namespace, the kernel checks ns_capable(user_ns, CAP_SYS_ADMIN) -- the
capability check is against the user namespace, not the global root.


## Code Walkthrough

Trace creating a new PID + network namespace via clone():

1. **Userspace calls clone(CLONE_NEWPID | CLONE_NEWNET)** -- This enters
   kernel_clone() at kernel/fork.c, which calls copy_process().

2. **copy_process() calls copy_namespaces()** -- kernel/nsproxy.c line 167.
   The flags include CLONE_NEWPID and CLONE_NEWNET, so the fast-path sharing
   is skipped.

3. **ns_capable() check** -- Line 181 verifies CAP_SYS_ADMIN in the task's
   user namespace. Without it, -EPERM is returned.

4. **create_new_namespaces() at line 87** -- Allocates a new nsproxy via
   create_nsproxy() (kmem_cache_alloc from nsproxy_cachep). Then calls each
   copy function.

5. **copy_pid_ns() creates a new PID namespace** -- Since CLONE_NEWPID is set,
   create_pid_namespace() at kernel/pid_namespace.c line 76 allocates from
   pid_ns_cachep. Sets level = parent->level + 1, initializes the IDR for PID
   allocation, and calls ns_tree_add().

6. **copy_net_ns() creates a new network namespace** -- Since CLONE_NEWNET is
   set, a new struct net is allocated at net/core/net_namespace.c. The
   net_namespace_list tracks all network namespaces. pernet_ops callbacks
   initialize per-namespace subsystem state.

7. **Other namespaces are shared** -- copy_mnt_ns(), copy_utsname(),
   copy_ipcs(), copy_cgroup_ns(), and copy_time_ns() all see their flags
   are not set and simply increment reference counts on the parent's namespaces.

8. **nsproxy_ns_active_get() and assignment** -- Back in copy_namespaces() at
   line 202, the new nsproxy is activated and assigned to tsk->nsproxy.


## Hands-On Challenges

### Challenge 1: Map the Namespace Types (60 XP)

Read include/linux/nsproxy.h and kernel/nsproxy.c. For each of the eight namespace
types, document:
- The struct nsproxy field name
- The CLONE_NEW* flag that triggers creation
- The copy function called in create_new_namespaces()
- The source file where the namespace is implemented

Verification: Your table should have exactly 8 rows covering mnt, uts, ipc, pid,
net, cgroup, time, and user (user is special -- handled via copy_creds, not nsproxy).

### Challenge 2: PID Namespace Exploration (70 XP)

Write a C program that:
1. Calls unshare(CLONE_NEWUSER | CLONE_NEWPID) to create new user and PID namespaces.
2. Forks a child process.
3. The child prints its PID (it should be 1 inside the new PID namespace).
4. The parent prints the child's PID as seen from the original namespace.

Then read kernel/pid_namespace.c and trace how create_pid_namespace() sets up the
new namespace with level = parent->level + 1. Explain why the child sees PID 1.

Verification: Show program output demonstrating PID 1 inside the namespace, with
annotated kernel source references.

### Challenge 3: Network Namespace Isolation (70 XP)

Use ip netns or unshare --net to create a new network namespace. From inside:
1. Run ip link show and observe only the loopback interface exists.
2. Explain why, referencing net/core/net_namespace.c and how the pernet_ops
   list initializes subsystem state for new network namespaces.
3. Create a veth pair spanning the host and container namespaces and verify
   connectivity.

Verification: Show command output and kernel source references explaining the
pernet_list registration mechanism and init_net initialization.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Name all eight Linux namespace types and the CLONE_NEW* flag for each.
- [ ] Describe struct nsproxy at include/linux/nsproxy.h line 32 and explain
      reference counting via get_nsproxy()/put_nsproxy().
- [ ] Trace copy_namespaces() at kernel/nsproxy.c line 167 through the
      create_new_namespaces() call chain.
- [ ] Explain PID namespace hierarchy and the role of pid_ns_for_children.
- [ ] Describe how create_pid_namespace() at kernel/pid_namespace.c line 76
      allocates and initializes a new PID namespace.
- [ ] Explain user namespace capability remapping via set_cred_user_ns() at
      kernel/user_namespace.c line 44.
- [ ] Describe the unshare() path through unshare_nsproxy_namespaces() at
      kernel/nsproxy.c line 211.
