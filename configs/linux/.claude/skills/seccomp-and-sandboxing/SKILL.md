---
name: seccomp-and-sandboxing
description: Learn seccomp-BPF filtering and kernel sandboxing for container security
realm: containers
category: security
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - cgroups-and-namespaces
  - system-calls
unlocks: []
kernel_files:
  - kernel/seccomp.c
  - kernel/cred.c
  - kernel/nsproxy.c
doc_files:
  - Documentation/userspace-api/seccomp_filter.rst
badge: Sandbox Warden
tags:
  - sandbox
  - seccomp
  - containers
  - security
---

# Seccomp and Sandboxing

## Quest Briefing

Even with namespaces and cgroups providing isolation and resource control, a
container still shares the host kernel. Every system call a container process
makes is handled by the same kernel that serves all other processes on the host.
A kernel vulnerability triggered through any system call could compromise the
entire system. Seccomp (secure computing mode) addresses this by restricting
which system calls a process can make, drastically reducing the kernel's attack
surface.

Seccomp operates in two modes. Mode 1 (strict) limits a process to read(),
write(), _exit(), and sigreturn() -- nothing else. Mode 2 (filter) allows
user-defined BPF programs to inspect each system call and its arguments, returning
allow, deny, kill, or trace decisions. Every major container runtime installs a
seccomp filter by default: Docker's default profile blocks roughly 50 of the 300+
system calls, preventing containers from loading kernel modules, rebooting the
host, or accessing dangerous interfaces.

The seccomp filter implementation lives in kernel/seccomp.c. Filters are BPF
programs compiled against struct seccomp_data, which contains the syscall number,
architecture, and arguments. Filters form a tree linked through the prev pointer,
inherited across fork() and preserved across exec(). This skill traces the
complete seccomp implementation from filter installation through syscall
interception to the notification mechanism.


## Learning Objectives

- Explain the two seccomp modes and when each is appropriate.
- Trace the seccomp filter data structures: struct seccomp_filter, struct
  seccomp_data, and the filter tree linked via prev pointers.
- Follow the syscall interception path through __secure_computing() and
  seccomp_run_filters() in kernel/seccomp.c.
- Understand seccomp filter installation via do_seccomp() and the
  SECCOMP_SET_MODE_FILTER operation.
- Describe the seccomp user notification mechanism and how it enables
  supervisor processes to handle blocked syscalls.


## Core Concepts

### Seccomp Modes and Entry Points

Seccomp is configured through two interfaces: the prctl() system call and the
seccomp() system call. Both converge at do_seccomp() at kernel/seccomp.c
line 2101:

    static long do_seccomp(unsigned int op, unsigned int flags,
                           void __user *uargs)

The function handles three operations:
- SECCOMP_SET_MODE_STRICT: enters strict mode via seccomp_set_mode_strict()
- SECCOMP_SET_MODE_FILTER: installs a BPF filter via seccomp_set_mode_filter()
- SECCOMP_GET_ACTION_AVAIL: queries supported actions

The seccomp() syscall is defined at line 2126:

    SYSCALL_DEFINE3(seccomp, unsigned int, op, unsigned int, flags,
                    void __user *, uargs)

The prctl() interface goes through prctl_set_seccomp() at line 2139, which
translates the prctl-style arguments into do_seccomp() operations.

### struct seccomp_filter: The Filter Tree

Each seccomp filter is represented by struct seccomp_filter at line 224:

    struct seccomp_filter {
        refcount_t refs;
        refcount_t users;
        bool log;
        bool wait_killable_recv;
        struct action_cache cache;
        struct seccomp_filter *prev;
        struct bpf_prog *prog;
        struct notification *notif;
        struct mutex notify_lock;
        wait_queue_head_t wqh;
    };

The prev pointer links filters into a singly-linked chain. When a process installs
a new filter, it becomes the head of the chain. The existing filters remain linked
as predecessors. On fork(), the child inherits the parent's filter chain by
incrementing reference counts. This creates a tree in memory where multiple tasks
may share common filter prefixes.

The prog field holds the compiled BPF program. The cache field provides a fast-path
bitmap (struct action_cache at line 168) that maps syscall numbers to allow
decisions, avoiding BPF execution for commonly allowed syscalls.

### Syscall Interception: __secure_computing()

On every system call entry, the kernel checks whether seccomp is active. The main
entry point is __secure_computing() at line 1103. For filter mode, this calls
__seccomp_filter() at line 1259:

    static int __seccomp_filter(int this_syscall,
                                const bool recheck_after_trace)

The function:
1. Calls populate_seccomp_data() at line 244 to fill a struct seccomp_data with
   the syscall number (sd->nr), architecture (sd->arch), arguments (sd->args[]),
   and instruction pointer (sd->instruction_pointer).
2. Calls seccomp_run_filters() at line 1274 (defined at line 404) to evaluate
   all filters in the chain against the seccomp_data.
3. Processes the result:
   - SECCOMP_RET_ALLOW: syscall proceeds normally.
   - SECCOMP_RET_KILL_THREAD / SECCOMP_RET_KILL_PROCESS: task is killed.
   - SECCOMP_RET_TRAP: sends SIGSYS to the process.
   - SECCOMP_RET_ERRNO: returns an error code without executing the syscall.
   - SECCOMP_RET_USER_NOTIF: sends the syscall to a supervisor via the
     notification mechanism.
   - SECCOMP_RET_TRACE: notifies a ptrace tracer. <!-- safe: kernel API doc, references seccomp return code -->
   - SECCOMP_RET_LOG: allows but logs the syscall.

For strict mode, __secure_computing_strict() at line 1067 checks against a
hardcoded list of allowed syscalls (mode1_syscalls). If the syscall is not in the
list, the process is killed with SIGKILL.

### Filter Installation

seccomp_set_mode_filter() installs a new BPF filter. The user provides a struct
sock_fprog containing classic BPF instructions. The kernel:

1. Validates the filter via seccomp_check_filter() at line 278, which verifies
   each instruction is from the allowed set. Instructions that load sk_buff data
   are rewritten to load seccomp_data instead.
2. Compiles the classic BPF into the internal BPF representation.
3. Allocates a new seccomp_filter, sets its prev pointer to the current filter
   chain, and attaches it to current->seccomp.filter.

The MAX_INSNS_PER_PATH limit at line 238 caps the total instruction count across
the entire filter chain to 256KB worth of instructions, preventing excessive
overhead on every syscall.

### Credentials and Sandboxing

The credential system at kernel/cred.c interacts with seccomp in the broader
sandboxing picture. Credentials (struct cred) hold the process identity: UIDs,
GIDs, capabilities, and the user namespace. put_cred_rcu() at line 41 is the
RCU callback that destroys credentials, calling security_cred_free() and
releasing the user_ns reference.

The no_new_privs flag (set via prctl(PR_SET_NO_NEW_PRIVS)) prevents a process
from gaining privileges through exec(). Seccomp filter mode requires either
CAP_SYS_ADMIN or no_new_privs to be set, because filters persist across exec()
and could otherwise be used to confuse a SUID binary into making unexpected
decisions.

### User Notifications

The SECCOMP_RET_USER_NOTIF action enables a supervisor process to intercept and
handle blocked syscalls on behalf of the filtered process. The notification
infrastructure uses struct seccomp_knotif at line 61:

    struct seccomp_knotif {
        struct task_struct *task;
        u64 id;
        const struct seccomp_data *data;
        enum notify_state state;
        ...
    };

The supervisor receives notifications through a file descriptor returned by
SECCOMP_FILTER_FLAG_NEW_LISTENER. When a filtered process hits a USER_NOTIF
action, it blocks in __seccomp_filter() while the supervisor reads the
notification, inspects the syscall data, and sends a response. This mechanism
is used by container runtimes to emulate blocked syscalls without allowing
direct kernel access.


## Code Walkthrough

Trace a container process making a blocked syscall:

1. **Container runtime installs seccomp filter** -- The runtime calls
   seccomp(SECCOMP_SET_MODE_FILTER, flags, &prog). This enters do_seccomp()
   at kernel/seccomp.c line 2101, which calls seccomp_set_mode_filter().

2. **Filter is validated** -- seccomp_check_filter() at line 278 walks
   each BPF instruction, verifying it is from the allowed instruction set.
   Load instructions are rewritten to reference seccomp_data offsets.

3. **Filter is attached** -- A new seccomp_filter is allocated, its prog is
   set to the compiled BPF, and it is linked as the head of the filter chain
   via the prev pointer. current->seccomp.filter now points to it.

4. **Container process makes a syscall** -- On syscall entry, the kernel calls
   __secure_computing() at line 1103. Since the mode is SECCOMP_MODE_FILTER,
   it calls __seccomp_filter() at line 1259.

5. **populate_seccomp_data() at line 244** -- Fills struct seccomp_data from
   the current registers: syscall number, architecture, all 6 arguments, and
   the instruction pointer.

6. **seccomp_run_filters() at line 404** -- Walks the filter chain from newest
   to oldest. For each filter, runs the BPF program against the seccomp_data.
   Returns the most restrictive action across all filters.

7. **Action processing** -- If the result is SECCOMP_RET_ERRNO, the kernel
   sets the syscall return value to the error code embedded in the filter
   result and skips the actual syscall. The process receives -EPERM (or
   whatever error the filter specified).

8. **Logging** -- If the log flag is set on the filter or the action requires
   it, seccomp_log() records the event for audit purposes.


## Hands-On Challenges

### Challenge 1: Write a Seccomp Filter (100 XP)

Write a C program that:
1. Sets PR_SET_NO_NEW_PRIVS via prctl().
2. Installs a seccomp BPF filter that blocks the mkdir() syscall with EPERM.
3. Attempts to call mkdir() and prints the error.
4. Verifies that other syscalls (write, read, exit) still work.

Then trace the kernel path: do_seccomp() at line 2101 -> seccomp_set_mode_filter()
-> seccomp_check_filter() at line 278. Explain how the BPF program is validated
and attached.

Verification: Show the program, its output, and annotated source references
through the filter installation path.

### Challenge 2: Seccomp Cache Analysis (100 XP)

Read the struct action_cache at kernel/seccomp.c line 168 and the
seccomp_cache_check_allow() function at line 367. Explain:
1. How the bitmap caches allow decisions per syscall number.
2. When seccomp_cache_prepare() populates the cache.
3. How the fast path at line 367 avoids running the BPF program for cached
   syscalls.
4. What happens when a new filter is installed (does the cache need to be
   invalidated?).

Verification: Source-annotated explanation of the cache mechanism with function
references.

### Challenge 3: User Notification Supervisor (100 XP)

Write a program pair:
1. A supervisor that creates a seccomp listener FD, reads notifications, and
   responds with allow/deny decisions.
2. A worker that installs a USER_NOTIF filter and attempts a blocked syscall.

Trace the kernel path when USER_NOTIF is returned: the worker blocks in
__seccomp_filter() while the supervisor reads via the notification FD. The
struct seccomp_knotif at line 61 tracks the request state (INIT -> SENT ->
REPLIED).

Verification: Show both programs, their output, and the kernel data flow through
the notification mechanism.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain seccomp strict mode vs filter mode and when each is used.
- [ ] Describe struct seccomp_filter at kernel/seccomp.c line 224 and how
      the prev pointer creates a filter tree.
- [ ] Trace __secure_computing() at line 1103 through __seccomp_filter() at
      line 1259 and seccomp_run_filters() at line 404.
- [ ] Explain populate_seccomp_data() at line 244 and the struct seccomp_data
      fields: nr, arch, args[], instruction_pointer.
- [ ] Describe do_seccomp() at line 2101 and the filter installation path
      including seccomp_check_filter() validation at line 278.
- [ ] Explain the no_new_privs requirement and its relationship to credentials
      in kernel/cred.c.
- [ ] Describe the SECCOMP_RET_USER_NOTIF mechanism and how struct seccomp_knotif
      at line 61 tracks notification state.
