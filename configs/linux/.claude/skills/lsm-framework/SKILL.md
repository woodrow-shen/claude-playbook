---
name: lsm-framework
description: Explore the Linux Security Modules framework and mandatory access controls
realm: security
category: lsm
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - process-lifecycle
  - vfs-layer
  - capabilities-and-credentials
unlocks:
  - seccomp-filters
  - crypto-api
kernel_files:
  - security/security.c
  - include/linux/lsm_hooks.h
  - security/commoncap.c
  - security/selinux/hooks.c
doc_files:
  - Documentation/security/lsm.rst
  - Documentation/admin-guide/LSM/index.rst
badge: Security Guardian
tags:
  - security
  - lsm
  - selinux
  - apparmor
  - capabilities
---

# LSM Framework

The Linux Security Modules (LSM) framework provides hook points throughout
the kernel where security modules can enforce access control policies. SELinux,
AppArmor, Smack, and TOMOYO all plug into this framework. Understanding LSM
reveals how the kernel enforces security beyond basic Unix permissions.

## Learning Objectives

After completing this skill, you will be able to:

- Describe the LSM hook architecture and how security checks are inserted
- Trace a security check from VFS through the LSM framework to a module
- Explain POSIX capabilities and how they replace the all-or-nothing root model
- Compare SELinux and AppArmor at the architectural level
- Navigate security/security.c and the hook definitions

## Core Concepts

### The LSM Architecture

The kernel has hundreds of security-sensitive operations: opening files, creating
sockets, changing permissions, mounting filesystems, sending signals. LSM inserts
hook points at each of these operations.

When the kernel is about to perform a sensitive operation, it calls the
appropriate security_*() function (e.g., security_file_open()). This function
iterates through all registered LSM modules, calling each module's hook. If
any module denies the operation, it fails.

The hooks are defined in include/linux/lsm_hooks.h and the dispatch logic
is in security/security.c.

### Hook Registration

LSM modules register using the DEFINE_LSM() macro:

```c
DEFINE_LSM(selinux) = {
    .name = "selinux",
    .init = selinux_init,
    .blobs = &selinux_blob_sizes,
};
```

During boot, the LSM framework calls each module's init function, which
registers hook callbacks. The framework stores hooks in security_hook_heads
(a structure of linked lists, one per hook point).

### Security Blobs

LSM modules often need to attach security data to kernel objects (inodes,
files, tasks, etc.). Rather than adding fields to every struct, LSM uses
"security blobs" -- opaque data attached via void pointers:

- task_struct->security
- inode->i_security
- file->f_security
- superblock->s_security

Each module declares how much space it needs, and the framework allocates
a shared blob divided into per-module sections.

### POSIX Capabilities

Before LSM, Linux had the capability system (security/commoncap.c) to break
the monolithic root privilege into fine-grained capabilities:

- CAP_NET_ADMIN: configure networking
- CAP_SYS_ADMIN: catch-all admin capability (unfortunately too broad)
- CAP_DAC_OVERRIDE: bypass file permission checks
- CAP_KILL: send signals to any process
- CAP_NET_RAW: use raw sockets

Capabilities are stored per-task in struct cred->cap_effective. The commoncap
module integrates capabilities with the LSM framework.

### Major LSM Modules

**SELinux** (security/selinux/): Mandatory Access Control using security labels.
Every object (file, process, socket) has a security context (e.g.,
"system_u:system_r:httpd_t:s0"). Policy rules define which contexts can
interact. Type Enforcement is the core mechanism.

Key files:
- security/selinux/hooks.c -- the hook implementations (thousands of lines)
- security/selinux/avc.c -- the Access Vector Cache for fast lookups
- security/selinux/ss/services.c -- the policy engine

**AppArmor** (security/apparmor/): Path-based MAC. Profiles define what
each program can access by pathname. Simpler than SELinux but less granular.

Key files:
- security/apparmor/lsm.c -- hook implementations
- security/apparmor/policy.c -- profile management

### LSM Stacking

Modern Linux supports running multiple LSMs simultaneously. The framework
calls each module's hooks in order. All must approve for the operation to
proceed. This allows combining, for example, SELinux + Landlock + capabilities.

## Code Walkthrough

### Exercise 1: Trace security_file_open()

1. When open() is called, VFS eventually calls security_file_open()
   (in security/security.c)
2. This function calls call_int_hook(file_open, file)
3. The macro iterates security_hook_heads.file_open, calling each
   registered hook
4. For SELinux: selinux_file_open() in security/selinux/hooks.c checks
   the file's security label against the task's security context
5. If the policy allows it, returns 0. Otherwise, returns -EACCES.

### Exercise 2: Read the Hook List

1. Open include/linux/lsm_hooks.h
2. Find the union of security_list_options -- every hook point is listed
3. Count the hook categories: file, inode, task, socket, key, msg, etc.
4. For each category, identify 2-3 specific hooks and when they are called

### Exercise 3: Capability Check Path

1. When a process tries a privileged operation, the kernel calls capable()
2. capable() (kernel/capability.c) calls security_capable()
3. This calls the cap_capable() hook in security/commoncap.c
4. cap_capable() checks the task's effective capability set
5. If the capability is present, the operation is allowed

## Hands-On Challenges

### Challenge 1: LSM Hook Census (XP: 60)

Count all unique hook points defined in include/linux/lsm_hooks.h. Group
them by category (file, inode, task, socket, etc.). Which category has the
most hooks? What does this tell you about where security decisions happen?

### Challenge 2: SELinux Denial Trace (XP: 70)

On a system with SELinux in enforcing mode, trigger an access denial (e.g.,
a confined process trying to read a file it should not access). Read the
audit log entry. Map each field in the denial message to the corresponding
kernel data structure (source context -> task cred, target context -> inode
security label, etc.).

### Challenge 3: Capability Analysis (XP: 70)

List all capabilities defined in include/uapi/linux/capability.h. For the
top 10 most commonly checked capabilities (hint: grep for ns_capable and
capable in kernel source), identify which operations they protect and which
kernel files contain the checks.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain the LSM hook architecture and how modules register
- [ ] Trace a security check from syscall through security_*() to an LSM module
- [ ] Describe POSIX capabilities and name at least 5 common ones
- [ ] Compare SELinux (label-based) vs AppArmor (path-based) at architecture level
- [ ] Explain LSM stacking and how multiple modules cooperate
