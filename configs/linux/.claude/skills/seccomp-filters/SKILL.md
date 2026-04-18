---
name: seccomp-filters
description: Learn seccomp-BPF system call filtering for application sandboxing
realm: security
category: seccomp
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
- lsm-framework
- system-calls
unlocks: []
kernel_files:
- kernel/seccomp.c
- include/linux/seccomp.h
doc_files:
- Documentation/userspace-api/seccomp_filter.rst
badge: Filter Guardian
tags:
- seccomp
- bpf
- sandbox
---


# Seccomp Filters

Seccomp (Secure Computing) is the kernel's system call filtering mechanism. In
its simplest form (mode 1, strict), it restricts a process to only read(),
write(), _exit(), and sigreturn(). In its powerful filter mode (mode 2), it
uses BPF programs to make per-syscall allow/deny/trace decisions. This is the
foundation of application sandboxing in Chrome, Firefox, Docker, systemd, and
virtually every security-conscious Linux application.

Seccomp is unique because it operates at the system call boundary -- the exact
point where userspace requests kernel services. By filtering here, you can
prevent an exploited application from escalating privileges, accessing files,
or opening network connections, even if the application code itself is
compromised.

## Quest Briefing

Every major application sandbox on Linux uses seccomp. Chrome uses it to
isolate renderer processes. Docker uses it to restrict container system calls.
Systemd uses it to confine services. Understanding how seccomp works inside the
kernel -- from BPF program installation to per-syscall filtering -- is essential
for anyone building or auditing secure systems.

## Learning Objectives

After completing this skill, you will be able to:

- Explain seccomp mode 1 (strict) and mode 2 (filter) operation
- Describe how BPF filter programs are installed and evaluated
- Trace the seccomp check path in the system call entry code
- Understand the seccomp notification mechanism for user-space policy decisions
- Write and analyze seccomp-BPF filter programs

## Core Concepts

### Seccomp Modes

Seccomp supports three modes defined in kernel/seccomp.c:

**SECCOMP_MODE_STRICT** (mode 1): The original seccomp mode. Only four system
calls are allowed: read, write, _exit, and sigreturn. Any other syscall
triggers SIGKILL. Enabled via prctl(PR_SET_SECCOMP, SECCOMP_MODE_STRICT).

The strict mode check is in __secure_computing_strict() (line 1067):
- Compares the syscall number against the allowed list
- If not allowed, calls do_exit(SIGKILL) immediately

**SECCOMP_MODE_FILTER** (mode 2): BPF-based filtering. A classic BPF program
examines the syscall number, arguments, and architecture, returning an action:
- SECCOMP_RET_ALLOW: permit the syscall
- SECCOMP_RET_KILL_THREAD / SECCOMP_RET_KILL_PROCESS: terminate
- SECCOMP_RET_TRAP: send SIGSYS to the task
- SECCOMP_RET_ERRNO: return an error code without executing the syscall
- SECCOMP_RET_TRACE: notify a ptrace tracer
- SECCOMP_RET_USER_NOTIF: notify a userspace supervisor
- SECCOMP_RET_LOG: allow but log the syscall

**SECCOMP_MODE_DEAD**: internal state after the task's seccomp state is freed.

### Installing Filters

Filters are installed via the seccomp() syscall or prctl():

The SYSCALL_DEFINE3(seccomp, ...) (line 2126) dispatches to do_seccomp()
(line 2101) which handles:
- SECCOMP_SET_MODE_STRICT: calls seccomp_set_mode_strict() (line 1428)
- SECCOMP_SET_MODE_FILTER: calls seccomp_set_mode_filter() (line 1956)

prctl_set_seccomp() (line 2139) is the prctl interface that also dispatches
to do_seccomp().

seccomp_set_mode_filter() performs:
1. seccomp_prepare_filter() (line 669): allocates and validates the BPF program
2. seccomp_check_filter() (line 278): validates BPF instructions are safe
3. seccomp_attach_filter() (line 921): chains the filter to the task's filter
   list (filters stack -- all must allow for the syscall to proceed)

### Filter Evaluation

When a system call is invoked, __secure_computing() (line 1103) is called:

For filter mode, __seccomp_filter() (line 1259) runs:
1. populate_seccomp_data() (line 244) fills struct seccomp_data with the
   syscall number, architecture, instruction pointer, and arguments
2. seccomp_run_filters() (line 404) executes each BPF filter in the chain
   from newest to oldest, taking the highest-priority action
3. The cache optimization: seccomp_cache_check_allow() (line 367) uses a
   bitmap to fast-path syscalls that all filters unconditionally allow

Based on the returned action, the kernel:
- Allows the syscall (SECCOMP_RET_ALLOW)
- Kills the thread/process (SECCOMP_RET_KILL_*)
- Sends SIGSYS (SECCOMP_RET_TRAP)
- Returns an errno (SECCOMP_RET_ERRNO)
- Notifies userspace (SECCOMP_RET_USER_NOTIF)

### Filter Inheritance

Seccomp filters are inherited across fork() and preserved across execve().
This is critical for sandboxing: a parent can install a filter before
fork/exec, and the child is permanently constrained.

seccomp_filter_release() (line 570) cleans up filters when a task exits.
__seccomp_filter_release() (line 551) walks the filter chain and calls
__put_seccomp_filter() which decrements refcounts. __seccomp_filter_orphan()
(line 532) handles the case where a filter's creator has exited but the
filter is still in use by child tasks.

### User Notification

SECCOMP_RET_USER_NOTIF enables a supervisor process to intercept and decide
on system calls. The struct seccomp_knotif (line 61) tracks each pending
notification with:
- task: the blocked task
- id: unique notification cookie
- data: pointer to the seccomp_data
- state: SECCOMP_NOTIFY_INIT -> SECCOMP_NOTIFY_SENT -> SECCOMP_NOTIFY_REPLIED

seccomp_do_user_notification() (line 1163) blocks the calling task and waits
for the supervisor to respond via the notification file descriptor.

### Performance: The Seccomp Cache

To avoid running BPF programs on every syscall, the kernel maintains a bitmap
cache. seccomp_cache_prepare() (line 889) analyzes the installed filters:
- seccomp_is_const_allow() (line 770) checks if a filter always returns
  ALLOW for a given syscall regardless of arguments
- seccomp_cache_prepare_bitmap() (line 847) sets bits for always-allowed
  syscalls
- At runtime, seccomp_cache_check_allow_bitmap() (line 349) checks the
  bitmap before running the BPF program

## Code Walkthrough

### Tracing a Filtered System Call

1. Userspace installs a filter: seccomp(SECCOMP_SET_MODE_FILTER, 0, &prog)
2. do_seccomp() -> seccomp_set_mode_filter()
3. seccomp_prepare_filter() validates the BPF program
4. seccomp_attach_filter() chains it to current->seccomp.filter
5. seccomp_cache_prepare() builds the allow bitmap
6. Later, userspace calls open()
7. System call entry invokes __secure_computing()
8. seccomp_cache_check_allow() checks bitmap -- miss for open()
9. seccomp_run_filters() evaluates each BPF filter
10. If all filters return ALLOW, the syscall proceeds normally
11. If any filter returns KILL, the task receives SIGKILL

### The seccomp_data Structure

The BPF filter operates on struct seccomp_data:
```c
struct seccomp_data {
    int   nr;          /* system call number */
    __u32 arch;        /* AUDIT_ARCH_* value */
    __u64 instruction_pointer;
    __u64 args[6];     /* system call arguments */
};
```

populate_seccomp_data() fills this from the task's registers at syscall entry.
The BPF program uses BPF_LD instructions to load fields from this structure.

## Hands-On Challenges

### Challenge 1: Strict Mode Experiment (XP: 60)

Write a C program that:
- Enters SECCOMP_MODE_STRICT via prctl(PR_SET_SECCOMP, 1)
- Attempts write() to stdout (should succeed)
- Attempts open() (should be killed with SIGKILL)
- Run under strace and observe the kernel's response
Explain why strict mode is too restrictive for most applications.

### Challenge 2: BPF Filter Construction (XP: 70)

Write a seccomp-BPF filter that:
- Allows read, write, exit, exit_group, sigreturn, and rt_sigreturn
- Blocks open, openat, socket, and connect with EACCES
- Allows all other syscalls (permissive deny-list approach)
Test it by running a program that tries to open a file and connect to a network.
Then rewrite it as an allow-list (block everything not explicitly allowed).

### Challenge 3: Notification Handler (XP: 70)

Write a supervisor and worker process pair:
- Worker installs a filter returning SECCOMP_RET_USER_NOTIF for mkdir()
- Supervisor reads notifications from the seccomp fd
- Supervisor logs the mkdir path and responds with ALLOW or DENY
- Test with the worker attempting mkdir() in allowed and denied directories
Trace the kernel path through seccomp_do_user_notification().

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain the difference between seccomp strict mode and filter mode
- [ ] Describe how BPF filter programs are validated and installed
- [ ] Trace the __secure_computing() path on system call entry
- [ ] Explain filter chaining and inheritance across fork/exec
- [ ] Write a seccomp-BPF filter using struct sock_fprog
- [ ] Describe the seccomp cache optimization and when it applies
- [ ] Explain SECCOMP_RET_USER_NOTIF and the notification fd mechanism
