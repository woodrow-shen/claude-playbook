---
name: capabilities-and-credentials
description: Understand Linux process credentials and the POSIX capabilities system
realm: security
category: credentials
difficulty: beginner
xp: 150
estimated_minutes: 75
prerequisites:
  - process-lifecycle
unlocks:
  - lsm-framework
kernel_files:
  - kernel/cred.c
  - security/commoncap.c
  - include/linux/cred.h
  - kernel/capability.c
doc_files:
  - Documentation/security/credentials.rst
badge: Credential Keeper
tags:
  - capabilities
  - credentials
  - uid
  - gid
---

# Capabilities and Credentials

Every process in Linux carries a set of credentials that determine what it can
access. These credentials include user and group IDs, a set of POSIX
capabilities, keyrings, and security labels. The traditional UNIX model grants
all-or-nothing root power via UID 0, but capabilities break root privilege into
fine-grained units: CAP_NET_ADMIN for network configuration, CAP_SYS_PTRACE
for debugging other processes, CAP_DAC_OVERRIDE to bypass file permissions.

Understanding credentials is fundamental to Linux security. Every permission
check in the kernel ultimately consults the calling task's struct cred. When a
process forks, execs a setuid binary, or drops privileges, the credential
system manages the transition safely and atomically.

## Quest Briefing

Credentials are the kernel's answer to "who is asking?" Every system call that
touches a file, sends a signal, or binds a network port checks the caller's
credentials. The old model of root-vs-non-root is crude; capabilities let you
grant only the specific privileges a program needs. This skill teaches you how
the kernel tracks, copies, and checks credentials at every security boundary.

## Learning Objectives

After completing this skill, you will be able to:

- Describe the fields of struct cred and how they control access
- Trace credential inheritance through fork and exec
- Explain POSIX capabilities and how they replace monolithic root privilege
- Follow the prepare_creds / commit_creds pattern for credential changes
- Understand how capability checks traverse user namespaces

## Core Concepts

### The struct cred

The struct cred (include/linux/cred.h) is the central credentials structure.
Each task has two credential pointers:
- task->real_cred: the objective credentials (who the task really is)
- task->cred: the subjective credentials (what the task is acting as)

Key fields in struct cred:
- uid, gid: real user/group ID
- suid, sgid: saved user/group ID
- euid, egid: effective user/group ID (used for permission checks)
- fsuid, fsgid: filesystem user/group ID (used for file access)
- cap_inheritable, cap_permitted, cap_effective: capability sets
- cap_bset: capability bounding set (limits what can be gained)
- cap_ambient: ambient capabilities (survive execve without setuid)
- user_ns: the user namespace this credential belongs to
- group_info: supplementary group list
- security: LSM security blob

### Credential Lifecycle

Credentials are reference-counted and freed via RCU (kernel/cred.c):

**Allocation**: cred_alloc_blank() allocates a zeroed cred from the cred_jar
slab cache. prepare_creds() (line 179) duplicates the current task's
credentials, incrementing reference counts on all shared objects (keyrings,
user struct, group_info).

**Modification**: The copy-on-write pattern:
1. new = prepare_creds() -- duplicate current creds
2. Modify the new cred (change uid, add capability, etc.)
3. commit_creds(new) -- atomically install the new cred

commit_creds() (line 368) is the critical function that:
- Swaps task->real_cred and task->cred to the new credentials
- Updates per-user process counts if uid changed
- Notifies via proc_id_connector if real uid/gid changed
- Calls security_commit_creds() for LSM notification
- Drops the reference on the old credentials

**Abort**: abort_creds() (line 448) discards credentials that were prepared
but not committed.

**Cleanup**: exit_creds() (line 90) releases both real_cred and cred when a
task exits. put_cred_rcu() (line 41) is the RCU callback that frees the
cred_jar allocation, releases keyrings, group_info, user struct, and user_ns.

### Fork and Exec Credential Handling

**Fork**: copy_creds() (line 263) handles credential inheritance. For normal
forks, it simply shares the parent's credentials (incrementing the refcount).
For CLONE_NEWUSER, it creates new credentials in a new user namespace.

**Exec**: prepare_exec_creds() (line 230) creates fresh credentials for exec.
The execve path then applies:
- Setuid/setgid bits from the binary
- File capabilities from extended attributes
- cap_bprm_creds_from_file() (security/commoncap.c line 919) computes the
  new capability sets based on the file's capabilities and setuid status

### POSIX Capabilities

The capability check path in security/commoncap.c:

cap_capable() (line 124) is the core check. It calls cap_capable_helper()
(line 68) which walks the user namespace hierarchy:
1. Check if cred's user_ns matches the target namespace
2. If yes, check cap_raised(cred->cap_effective, cap)
3. If not, walk up through parent namespaces
4. The owner of a child user namespace has all capabilities in it

Key capability functions:
- cap_capget() (line 230): retrieves a task's capability sets
- cap_capset() (line 272): validates and sets new capability sets
- cap_inh_is_capped() (line 249): checks if inheritable caps are restricted
- cap_ptrace_access_check() (line 164): capability check for ptrace
- handle_privileged_root() (line 828): handles setuid-root exec

### Credential Comparison

cred_fscmp() (line 472) compares two credentials for filesystem purposes,
checking fsuid, fsgid, and group_info. This is used by the filesystem layer
to determine if cached permission checks are still valid.

## Code Walkthrough

### Tracing a setuid Binary Execution

1. User runs /usr/bin/passwd (owned by root, setuid bit set)
2. do_execveat_common() calls prepare_exec_creds()
3. cap_bprm_creds_from_file() detects the setuid bit
4. handle_privileged_root() raises capabilities if secure_noroot is not set
5. If the binary also has file capabilities, get_file_caps() reads them
   from the security.capability xattr
6. get_vfs_caps_from_disk() (line 675) parses the VFS capability data
7. bprm_caps_from_vfs_caps() (line 626) merges file caps into the new cred
8. commit_creds() installs the elevated credentials
9. The process now runs with euid=0 and the computed capability set
10. When passwd finishes, exit_creds() cleans up

### Checking a Capability

When a syscall checks ns_capable(CAP_NET_ADMIN):
1. security_capable() calls the LSM chain
2. cap_capable() is the commoncap hook
3. cap_capable_helper() checks cred->cap_effective for CAP_NET_ADMIN
4. If the check is in a non-init user namespace, the function walks parents
5. Returns 0 (success) or -EPERM (denied)

## Hands-On Challenges

### Challenge 1: Credential Inspection (XP: 40)

Use /proc/self/status to examine your shell's credentials:
- Find Uid, Gid lines (real, effective, saved, filesystem)
- Find CapInh, CapPrm, CapEff, CapBnd, CapAmb lines
- Decode the hex capability masks using capsh --decode
- Explain why a normal user has empty CapEff but full CapBnd

### Challenge 2: Capability-Aware Program (XP: 50)

Write a C program that:
- Starts as root (or with CAP_NET_BIND_SERVICE via setcap)
- Binds to port 80 (requires CAP_NET_BIND_SERVICE)
- Drops all capabilities using capset() or prctl(PR_SET_KEEPCAPS)
- Verifies it can no longer bind to privileged ports
- Explain the ambient capability mechanism as an alternative approach

### Challenge 3: Credential Flow Trace (XP: 60)

Trace the credential flow through a fork-execve sequence using ftrace:
```
echo 1 > /sys/kernel/debug/tracing/events/cred/enable
# run a setuid binary
cat /sys/kernel/debug/tracing/trace
```
Identify the copy_creds, prepare_exec_creds, and commit_creds events.
Map each event to the code path in kernel/cred.c.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Describe the key fields of struct cred and their roles
- [ ] Explain the prepare_creds / commit_creds pattern for atomic updates
- [ ] Trace credential inheritance through fork (copy_creds)
- [ ] Trace credential transformation through execve (prepare_exec_creds)
- [ ] Explain how cap_capable() checks capabilities across user namespaces
- [ ] Decode capability masks from /proc/self/status
- [ ] Describe how file capabilities and setuid interact during exec
