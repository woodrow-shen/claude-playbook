---
name: system-calls
description: Learn how userspace communicates with the kernel through system calls
realm: foundations
category: syscalls
difficulty: beginner
xp: 120
estimated_minutes: 75
prerequisites:
- boot-and-init
unlocks:
- process-lifecycle
- ftrace-and-kprobes
- kvm-fundamentals
- seccomp-filters
- seccomp-and-sandboxing
kernel_files:
- arch/x86/entry/entry_64.S
- arch/x86/entry/syscalls/syscall_64.tbl
- include/linux/syscalls.h
- arch/x86/entry/syscall_64.c
doc_files:
- Documentation/process/adding-syscalls.rst
badge: Gateway Keeper
tags:
- syscalls
- entry
- userspace-kernel-boundary
---


# System Calls

The system call interface is the gateway between userspace and kernel space. Every
time a program reads a file, creates a process, or sends network data, it crosses
this boundary. Understanding syscalls is fundamental to everything else in the kernel.

## Learning Objectives

After completing this skill, you will be able to:

- Explain the x86-64 syscall entry mechanism (SYSCALL instruction)
- Trace a system call from userspace through the kernel entry point to the handler
- Read the syscall table and understand syscall numbering
- Use the SYSCALL_DEFINEn() macro to understand syscall declarations
- Describe how the kernel preserves and restores userspace register state

## Core Concepts

### The SYSCALL Instruction

On x86-64, userspace triggers a syscall with the SYSCALL instruction. The CPU:

1. Saves the return address (RIP) into RCX
2. Saves RFLAGS into R11
3. Loads the kernel entry point from the MSR_LSTAR register
4. Switches to kernel mode (CPL 0)

The kernel entry point is entry_SYSCALL_64 in arch/x86/entry/entry_64.S.

### Syscall Number Convention

The syscall number is passed in RAX. Arguments go in: RDI, RSI, RDX, R10, R8, R9
(note: R10 instead of RCX, because SYSCALL clobbers RCX).

The return value comes back in RAX. A negative value indicates an error (negated
errno).

### The Syscall Table

arch/x86/entry/syscalls/syscall_64.tbl maps numbers to handler functions:

```
0    common   read             sys_read
1    common   write            sys_write
2    common   open             sys_open
3    common   close            sys_close
...
56   common   clone            sys_clone
57   common   fork             sys_fork
59   common   execve           sys_execve
```

Each line: number, ABI (common/64/x32), name, entry point.

### SYSCALL_DEFINEn Macros

Syscall handlers are declared with SYSCALL_DEFINEn() macros from
include/linux/syscalls.h. The 'n' is the argument count:

```c
SYSCALL_DEFINE3(read, unsigned int, fd, char __user *, buf, size_t, count)
{
    // This expands to: asmlinkage long sys_read(unsigned int fd,
    //                      char __user *buf, size_t count)
    ...
}
```

The macro generates type-safe wrappers and prevents sign-extension bugs on 64-bit.

### do_syscall_64

The C dispatcher lives in arch/x86/entry/common.c. do_syscall_64() takes the
saved register state (struct pt_regs) and the syscall number, looks up the handler
in sys_call_table[], and calls it.

## Code Walkthrough

### Exercise 1: Trace a write() Syscall

Follow the path of write(1, "hello", 5) from userspace to kernel:

1. libc's write() wrapper puts syscall number 1 in RAX, fd in RDI, buf in RSI,
   count in RDX, then executes SYSCALL
2. CPU jumps to entry_SYSCALL_64 (arch/x86/entry/entry_64.S)
3. The entry code saves registers into struct pt_regs on the kernel stack
4. Calls do_syscall_64() (arch/x86/entry/common.c)
5. Looks up sys_call_table[1] which is sys_write (fs/read_write.c)
6. sys_write calls ksys_write -> vfs_write -> the file's .write method
7. Return value travels back through RAX

### Exercise 2: Read the Syscall Table

Open arch/x86/entry/syscalls/syscall_64.tbl:

1. Count how many syscalls exist (the last entry number)
2. Find the entry for clone (number 56) and clone3 (number 435)
3. Notice the "common" vs "64" vs "x32" ABI column -- this handles compatibility

### Exercise 3: Examine Entry Assembly

Open arch/x86/entry/entry_64.S and find entry_SYSCALL_64:

1. Observe how SWAPGS switches from user GS to kernel GS
2. Note the stack switch to the per-CPU kernel stack
3. Find where pt_regs is constructed by pushing registers
4. Trace to the call to do_syscall_64

## Hands-On Challenges

### Challenge 1: Syscall Census (XP: 30)

Count the total number of syscalls in syscall_64.tbl. Group them by category
(file I/O, process management, memory, networking, signals, misc). Which category
has the most?

### Challenge 2: Strace a Program (XP: 40)

Run `strace ls /tmp` and identify every unique syscall. For each one, find its
handler function in the kernel source. Which file contains the most syscall
implementations?

### Challenge 3: The __user Annotation (XP: 50)

Find 5 syscall handlers that use __user pointers. Trace how copy_from_user() and
copy_to_user() (in include/linux/uaccess.h and arch/x86/lib/usercopy_64.c) safely
transfer data across the user/kernel boundary. What happens if the userspace
pointer is invalid?

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain the x86-64 SYSCALL instruction and register conventions
- [ ] Find any syscall handler given its number or name
- [ ] Describe the path from SYSCALL instruction to the C handler function
- [ ] Explain why SYSCALL_DEFINEn macros exist instead of plain function declarations
- [ ] Describe how the kernel safely accesses userspace memory (__user, copy_from_user)
