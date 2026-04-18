---
name: signals-and-ipc
description: Master POSIX signals and System V IPC mechanisms in the Linux kernel
realm: foundations
category: ipc
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - process-lifecycle
unlocks:
  - futex-and-locking
kernel_files:
  - kernel/signal.c
  - ipc/msg.c
  - ipc/sem.c
  - ipc/shm.c
doc_files:
  - Documentation/admin-guide/sysctl/kernel.rst
badge: Signal Courier
tags:
  - signals
  - ipc
  - posix
---

# Signals and IPC

## Quest Briefing

Processes do not exist in isolation. They must communicate -- to coordinate
work, to notify each other of events, and to share data. The Linux kernel
provides two fundamental families of inter-process communication: POSIX
signals and System V IPC (message queues, semaphores, and shared memory).

Signals are the oldest form of IPC in Unix. When you press Ctrl+C, the
terminal sends SIGINT. When a child process exits, the kernel sends SIGCHLD
to its parent. When a process accesses invalid memory, SIGSEGV terminates
it. Understanding signal delivery is essential because signals interact with
nearly every kernel subsystem -- scheduling, memory management, process
lifecycle, and security.

System V IPC predates POSIX and remains widely used. Message queues allow
typed message passing between unrelated processes. Semaphores provide
counting synchronization primitives. Shared memory segments let processes
map the same physical pages into their address spaces. Each mechanism has
a kernel-side data structure, permission model, and namespace support.


## Learning Objectives

- Trace the path of a signal from kill() syscall through delivery to a
  userspace signal handler.
- Explain the difference between shared pending and per-thread pending
  signal queues.
- Describe how the kernel selects which thread receives a process-directed
  signal.
- Map the System V IPC syscalls (msgget/msgsnd/msgrcv, semget/semop,
  shmget/shmat/shmdt) to their kernel implementations.
- Explain how IPC namespaces isolate System V IPC objects between
  containers.


## Core Concepts

### Signal Data Structures

Every task has two signal queues. The per-thread queue is stored in
task_struct->pending (a struct sigpending). The process-wide shared queue
is in task_struct->signal->shared_pending. Each sigpending contains a
sigset_t bitmask for standard signals and a linked list of struct sigqueue
entries for queued (real-time) signals.

Signal handlers are stored in task_struct->sighand->action[], an array of
struct k_sigaction indexed by signal number minus one. The handler pointer
is accessed via sighand->action[sig - 1].sa.sa_handler, as seen at
kernel/signal.c:73 in the sig_handler() helper function.

The sighand_struct is shared between threads in the same thread group
(created with CLONE_SIGHAND), which is why signal handlers are
process-wide but signal masks are per-thread.

### Signal Sending: From kill() to Queue

The kill() syscall is defined at kernel/signal.c:3947 as
SYSCALL_DEFINE2(kill, pid_t, pid, int, sig). It constructs a
kernel_siginfo structure and calls kill_something_info(), which
routes to either a single process (kill_proc_info) or a process group.

The core sending logic lives in __send_signal_locked() at
kernel/signal.c:1042. This function:

1. Calls prepare_signal() (line 871) to check whether the signal should
   be delivered at all. For example, SIGCONT flushes all pending stop
   signals, and stop signals flush pending SIGCONT.
2. Selects the appropriate pending queue: shared_pending for
   process-directed signals (type != PIDTYPE_PID), or the thread's
   personal pending queue otherwise (line 1056).
3. For standard (non-real-time) signals, legacy_queue() checks if the
   signal bit is already set and skips queuing if so (line 1063) --
   standard signals do not queue.
4. Allocates a sigqueue structure from the sigqueue SLAB cache via
   sigqueue_alloc() (line 1087) and adds it to the pending list.
5. Sets the signal bit in the pending sigset_t via sigaddset().
6. Calls complete_signal() (line 963) to select a target thread and
   wake it up.

### Signal Delivery: get_signal()

Signals are not delivered instantly. Instead, the kernel checks for
pending signals when returning to userspace. The function get_signal()
at kernel/signal.c:2799 is called from the architecture-specific
return-to-userspace path.

get_signal() dequeues the next pending signal via dequeue_signal(),
which checks the per-thread pending queue first, then the shared
pending queue. It then dispatches based on the signal:

- If the handler is SIG_IGN, the signal is discarded.
- If the handler is SIG_DFL, the default action runs: terminate,
  core dump, stop, or ignore depending on the signal number.
- If a userspace handler is registered, the kernel sets up a signal
  frame on the user stack and redirects execution to the handler.

The complete_signal() function at kernel/signal.c:963 selects which
thread should be woken to handle a process-directed signal. It iterates
through threads via signal->curr_target, looking for one where
wants_signal() returns true (the signal is not blocked by that thread's
signal mask).

### System V IPC: Message Queues, Semaphores, Shared Memory

All three System V IPC mechanisms share a common permission structure
(struct kern_ipc_perm) and are organized per IPC namespace.

**Message Queues** (ipc/msg.c): The struct msg_queue (line 49) holds the
queue state including message lists (q_messages), waiting receivers
(q_receivers), and waiting senders (q_senders). The msgsnd syscall at
line 971 calls do_msgsnd() (line 848), which allocates a msg_msg
structure and either delivers it directly to a waiting receiver or
appends it to the queue. The msgrcv syscall at line 1270 calls
do_msgrcv() (line 1098), which either finds a matching message or
puts the caller to sleep on q_receivers.

**Semaphores** (ipc/sem.c): The semop() syscall at line 2296 calls
do_semtimedop() (line 2222), which performs an array of semaphore
operations atomically. If any operation would block, the caller sleeps.
When a semaphore value changes, update_queue() scans sleeping tasks
to complete any operations that can now succeed. FIFO ordering is
maintained but starvation is not guaranteed.

**Shared Memory** (ipc/shm.c): The shmget() syscall at line 847 creates
or finds a shared memory segment, backed by struct shmid_kernel (line 54).
The shmat() syscall at line 1693 maps the segment into the calling
process's address space via do_mmap(). The shmdt() syscall at line 1834
calls ksys_shmdt() (line 1728) to unmap it.


## Code Walkthrough

Trace what happens when Process A sends SIGTERM to Process B:

1. **Process A calls kill(pid_B, SIGTERM)** -- kernel/signal.c:3947:
   SYSCALL_DEFINE2(kill) builds a kernel_siginfo with si_signo=SIGTERM,
   si_code=SI_USER, si_pid=pid_A, si_uid=uid_A.

2. **Route to target** -- kill_something_info() determines this is a
   single-process kill (pid > 0) and calls kill_proc_info(), which
   finds the task_struct for pid_B and calls group_send_sig_info().

3. **Permission check** -- check_kill_permission() verifies that
   Process A has permission to signal Process B (same UID or
   CAP_KILL capability).

4. **Queue the signal** -- __send_signal_locked() at line 1042:
   prepare_signal() returns true (SIGTERM is not being suppressed).
   The signal is added to signal->shared_pending (process-directed).
   A sigqueue is allocated and linked into the pending list.

5. **Select target thread** -- complete_signal() at line 963:
   Since SIGTERM is fatal and not blocked, the function finds a
   thread that wants the signal and calls signal_wake_up_state()
   (line 721) to set TIF_SIGPENDING and wake the thread.

6. **Process B returns to userspace** -- The target thread, on its
   next return from kernel mode, checks TIF_SIGPENDING and calls
   get_signal() at line 2799. SIGTERM with SIG_DFL action triggers
   do_group_exit(), terminating the entire thread group.


## Hands-On Challenges

### Challenge 1: Trace the Signal Path (75 XP)

Read kernel/signal.c and trace the complete code path for sending
SIGUSR1 from one process to another. Document:
- Every function called from SYSCALL_DEFINE2(kill) at line 3947 through
  to the signal appearing in the target's pending queue.
- The exact line where the sigqueue is allocated.
- How complete_signal() selects the target thread.

Verification: Your trace should identify at least 6 kernel functions
with accurate line numbers.

### Challenge 2: IPC Message Queue Lifecycle (75 XP)

Write two C programs: a sender that creates a message queue with
msgget(), sends 5 typed messages with msgsnd(), and a receiver that
uses msgrcv() with type filtering. Then:
- Read ipc/msg.c and find the do_msgsnd() function at line 848.
- Identify how a waiting receiver is woken directly without the message
  being added to q_messages (the fast path).
- Explain the role of the wake_q mechanism in batching wakeups.

Verification: Show the programs running, annotated with the kernel
code paths executed.

### Challenge 3: Shared Memory Mapping (50 XP)

Create a shared memory segment with shmget(), attach it in two
processes with shmat(), write data in one, and read it in the other.
- Read ipc/shm.c and trace how shmat() at line 1693 calls
  do_mmap() to map the segment.
- Identify the struct shmid_kernel fields at line 54 that track
  attachment count (shm_nattch) and the backing file (shm_file).
- Explain why shared memory is backed by a shmem/tmpfs file.

Verification: Show the data transfer working and the kernel code path
from shmat to the VMA creation.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Trace SYSCALL_DEFINE2(kill) at kernel/signal.c:3947 through
      __send_signal_locked() at line 1042 to complete_signal() at
      line 963.
- [ ] Explain the difference between task->pending and
      task->signal->shared_pending and when each is used.
- [ ] Describe how get_signal() at line 2799 dequeues and dispatches
      signals on return to userspace.
- [ ] Explain why standard signals do not queue (legacy_queue check
      at line 1063) while real-time signals do.
- [ ] Map the msgsnd/msgrcv syscalls to do_msgsnd() at ipc/msg.c:848
      and do_msgrcv() at ipc/msg.c:1098.
- [ ] Describe the semaphore update_queue() wakeup mechanism in
      ipc/sem.c.
- [ ] Explain how shmat() maps shared memory via do_mmap() and why
      shmid_kernel at ipc/shm.c:54 references a backing file.
