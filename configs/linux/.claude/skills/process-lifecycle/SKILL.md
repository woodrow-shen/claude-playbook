---
name: process-lifecycle
description: Trace a process from fork through execve to exit in the kernel
realm: foundations
category: processes
difficulty: beginner
xp: 150
estimated_minutes: 90
prerequisites:
- system-calls
unlocks:
- scheduler-fundamentals
- page-allocation
- vfs-layer
- spinlocks-and-mutexes
- signals-and-ipc
- capabilities-and-credentials
- waitqueue-and-completion
- namespaces
- cgroups-v2
- lsm-framework
- socket-layer
kernel_files:
- kernel/fork.c
- kernel/exit.c
- fs/exec.c
- include/linux/sched.h
doc_files:
- Documentation/process/howto.rst
badge: Process Wrangler
tags:
- processes
- fork
- exec
- task_struct
---


# Process Lifecycle

## Quest Briefing

Every program you have ever run on Linux -- every shell command, every daemon,
every container process -- was born the same way: an existing process called
fork(), creating a near-perfect copy of itself. That clone then typically
called execve() to replace its memory image with a new program. And when the
work was done, it called exit(). This three-act structure -- fork, exec, exit
-- is the fundamental lifecycle of every process in the system. The kernel
code that implements it is some of the most critical in the entire tree.


## Learning Objectives

- Explain the fork/exec/exit model and why Linux uses copy-on-write.
- Trace the kernel_clone() call path from the fork() syscall through
  copy_process() and back.
- Describe the key fields of struct task_struct and their roles.
- Follow the execve() path through do_execveat_common() and binary handler
  loading.
- Understand process termination through do_exit() and zombie reaping.


## Core Concepts

### struct task_struct: The Process Descriptor

Defined in include/linux/sched.h, this is the kernel's representation of a
process (or thread -- Linux treats them uniformly). It is one of the largest
structures in the kernel, containing:

- Identity: pid, tgid (thread group ID, what userspace calls PID),
  comm (process name, 16 chars).
- State: __state field tracks whether the task is running, sleeping,
  stopped, or dead.
- Scheduling: prio, static_prio, normal_prio, policy,
  sched_entity for the scheduler.
- Memory: mm pointer to struct mm_struct, which owns the process
  address space.
- Files: files pointer to struct files_struct, the file descriptor
  table.
- Credentials: cred pointer for UID, GID, capabilities.
- Parent/child: parent, children, sibling list heads for the
  process tree.

Every task in the system has one. The idle task, kernel threads, and userspace
processes all have a task_struct.

### Fork: Creating a New Process

The fork() system call is defined at kernel/fork.c:2733 as
SYSCALL_DEFINE0(fork). It calls kernel_clone() at line 2612.

The kernel_clone() function is the unified implementation behind fork(),
vfork(), and clone(). Its core operation:

1. Calls copy_process() to create the new task_struct and duplicate (or
   share) resources from the parent.
2. copy_process() calls a chain of copy_* functions:
   - copy_creds() -- duplicate credentials
   - copy_semundo() -- SysV semaphore undo state
   - copy_files() -- duplicate or share the file descriptor table
   - copy_fs() -- filesystem context (cwd, root)
   - copy_sighand() -- signal handlers
   - copy_signal() -- signal state
   - copy_mm() -- the address space (this is where COW happens)
   - copy_namespaces() -- namespace membership
   - copy_thread() -- arch-specific thread state (registers, etc.)
3. After copy_process() returns the new task_struct, kernel_clone() calls
   wake_up_new_task() to place it on the run queue.
4. Returns the new PID to the parent, 0 to the child.

Copy-on-write (COW) is the critical optimization: copy_mm() does not
actually copy page contents. Instead, it marks all writable pages as
read-only in both parent and child. When either process writes to a page,
the page fault handler allocates a new physical page and copies the content.

### Exec: Replacing the Program

The execve() system call leads to do_execveat_common() at
fs/exec.c:1778. This function:

1. Opens the executable file and reads its first bytes.
2. Searches through formats (the list of registered binary formats) to find
   a handler. The most common is load_elf_binary() in fs/binfmt_elf.c.
3. The binary format handler:
   - Flushes the old address space (exec_mmap() replaces mm_struct).
   - Maps the new executable's segments into memory.
   - Sets up the stack with argv, envp, and the ELF auxiliary vector.
   - Sets the new instruction pointer to the program entry point.
4. When the function returns, the process is now running the new program.

This is why fork+execve is the pattern: fork creates the process, execve replaces
its content. The process identity (PID, open file descriptors, etc.) is
preserved across execve, but the address space is replaced.

### Exit: Process Termination

When a process terminates, the kernel calls do_exit() at
kernel/exit.c:896. This function:

1. Sets the task state to TASK_DEAD.
2. Releases resources: files, memory, semaphores, signal handlers.
3. Calls exit_notify() to inform the parent (sends SIGCHLD).
4. The task becomes a zombie: its task_struct remains allocated until the
   parent calls wait()/waitpid() to collect the exit status.
5. schedule() is called and the task never runs again.

Zombie processes are not a bug -- they are a necessary holding state. The
kernel must keep the task_struct around so the parent can retrieve the exit
code. If the parent exits first, the orphaned child is reparented to the
init process (PID 1), which is expected to call wait() regularly.


## Code Walkthrough

Trace the complete lifecycle of running /bin/ls from a shell:

1. **Shell calls fork()** -- kernel/fork.c:2733:
   SYSCALL_DEFINE0(fork) builds a kernel_clone_args struct with default
   flags and calls kernel_clone() at line 2612.

2. **kernel_clone() runs copy_process()** -- kernel/fork.c:
   copy_process() allocates a new task_struct via dup_task_struct(),
   copies credentials, files, memory (with COW), and signal handlers.
   Returns the new task_struct pointer.

3. **Child is made runnable** -- kernel/fork.c:
   wake_up_new_task() places the child on the scheduler's run queue.
   The child now exists as a copy of the shell.

4. **Child calls execve("/bin/ls")** -- fs/exec.c:1778:
   do_execveat_common() opens /bin/ls, identifies it as an ELF binary,
   calls load_elf_binary() which replaces the address space.

5. **ls runs and exits** -- kernel/exit.c:896:
   When ls finishes, it calls exit(), which triggers do_exit(). Resources
   are released, SIGCHLD is sent to the shell. The task becomes a zombie.

6. **Shell reaps the child** -- The shell calls waitpid(), which collects
   the exit status and frees the zombie's task_struct. The process is now
   fully gone.


## Hands-On Challenges

### Challenge 1: Map copy_process() (50 XP)

Read kernel/fork.c and find the copy_process() function. List every
copy_* function it calls, in order. For each one, write:
- What resource it duplicates or shares.
- Whether the CLONE_* flag causes sharing vs copying.
- The file where the copy function is implemented.

Verification: Your list should contain at least 10 copy operations with
accurate file paths.

### Challenge 2: Watch Fork in Action (50 XP)

Write a C program that:
1. Calls fork().
2. In the child, prints its PID and parent PID, then calls execve() on
   /bin/echo with a custom message.
3. In the parent, calls waitpid() and prints the child's exit status.

Compile it, then trace it with strace -f to see every syscall. Correlate
the strace output with the kernel code paths described above. Document at
least 5 kernel functions that were invoked.

Verification: Show strace output with annotations mapping to kernel source
locations.

### Challenge 3: Zombie Forensics (50 XP)

Write a program that deliberately creates a zombie process by forking a child
that exits immediately while the parent sleeps. Use ps aux to observe the
zombie state (Z). Then:
- Read kernel/exit.c and explain why the zombie exists.
- Identify the exact line where the task state is set to TASK_DEAD.
- Modify the program to properly reap the zombie and verify it disappears.

Verification: Show ps output with the zombie, the relevant kernel source
lines, and the fixed program.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain the fork/exec/exit lifecycle and why Linux separates fork from
      exec.
- [ ] Name at least 8 fields of struct task_struct and their purpose.
- [ ] Trace the fork() syscall from SYSCALL_DEFINE0(fork) at kernel/fork.c:2733
      through kernel_clone() at line 2612 to copy_process() and back.
- [ ] Explain copy-on-write and identify where it is implemented in copy_mm().
- [ ] Describe what do_execveat_common() at fs/exec.c:1778 does to load a new
      binary.
- [ ] Explain the zombie state and why task_struct persists after do_exit()
      at kernel/exit.c:896.
- [ ] Describe the reparenting mechanism when a parent exits before its
      children.
