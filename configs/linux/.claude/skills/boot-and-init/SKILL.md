---
name: boot-and-init
description: Understand how the Linux kernel boots from start_kernel to userspace
realm: foundations
category: boot
difficulty: beginner
xp: 100
estimated_minutes: 60
prerequisites: []
unlocks:
- system-calls
- kernel-modules
- kbuild-and-kconfig
kernel_files:
- init/main.c
- arch/x86/boot/header.S
- arch/x86/kernel/head_64.S
doc_files:
- Documentation/admin-guide/kernel-parameters.txt
- Documentation/process/howto.rst
badge: First Boot
tags:
- boot
- initialization
- start_kernel
---


# Boot and Initialization

Welcome to the first quest. Every journey through the kernel begins at the same
place: the boot sequence. Before a single userspace process runs, the kernel must
bootstrap an entire operating environment from nothing.

## Learning Objectives

After completing this skill, you will be able to:

- Trace the kernel boot sequence from firmware handoff to start_kernel()
- Identify the key initialization stages inside start_kernel()
- Explain how the kernel transitions from architecture-specific assembly to C code
- Describe how the init process (PID 1) is launched
- Read and interpret kernel boot messages via dmesg

## Core Concepts

### The Boot Chain

When a machine powers on, firmware (BIOS/UEFI) loads the bootloader (GRUB),
which loads the compressed kernel image (vmlinuz). The kernel decompresses itself,
then executes architecture-specific assembly code before reaching C.

On x86-64, the chain is:

1. arch/x86/boot/header.S -- real-mode entry, sets up for protected mode
2. arch/x86/boot/compressed/head_64.S -- decompression and 64-bit mode setup
3. arch/x86/kernel/head_64.S -- early page tables, GDT, jump to C
4. init/main.c:start_kernel() -- the first C function

### start_kernel()

The heart of kernel initialization lives in init/main.c at line 1008. This single
function orchestrates the entire boot:

```
start_kernel() {
    set_task_stack_end_magic(&init_task)  // canary for stack overflow detection
    smp_setup_processor_id()              // identify the boot CPU
    cgroup_init_early()                   // early cgroup setup
    local_irq_disable()                   // interrupts OFF during early boot
    boot_cpu_init()                       // mark boot CPU as online
    page_address_init()                   // high memory page tracking
    setup_arch(&command_line)             // arch-specific init (huge function)
    mm_core_init_early()                  // early memory management
    early_security_init()                 // LSM framework bootstrap
    setup_command_line()                  // parse kernel command line
    setup_per_cpu_areas()                 // per-CPU variable regions
    smp_prepare_boot_cpu()               // arch-specific boot CPU hooks
    ...
    rest_init()                          // launches kernel threads, then idle
}
```

### The init_task

The kernel has a special statically-allocated task called init_task (the "swapper"
or idle task for CPU 0). It is the ancestor of all processes. Defined in
init/init_task.c, it never exits.

### rest_init() and the Birth of PID 1

At the end of start_kernel(), rest_init() is called. It creates two kernel threads:

1. kernel_init (becomes PID 1) -- eventually calls run_init_process() which
   exec's /sbin/init, /etc/init, /bin/init, or /bin/sh
2. kthreadd (PID 2) -- the kernel thread daemon that spawns all other kthreads

After spawning these, the boot CPU enters the idle loop (cpu_idle_loop).

## Code Walkthrough

### Exercise 1: Read start_kernel()

Open init/main.c and find start_kernel() at line 1008.

1. Note the first call: set_task_stack_end_magic(&init_task). This writes a magic
   value at the bottom of init_task's kernel stack to detect overflow.
2. Follow the pr_notice("%s", linux_banner) call at line 1029. This prints the
   kernel version string you see in dmesg.
3. Find setup_arch(&command_line) at line 1030. This is a massive function that
   varies by architecture. On x86 it lives in arch/x86/kernel/setup.c.

### Exercise 2: Trace the init Process

1. In init/main.c, find rest_init() (near the end of the file).
2. It calls kernel_thread(kernel_init, ...) to create PID 1.
3. Find kernel_init() in the same file. It calls kernel_init_freeable() which
   eventually calls run_init_process().
4. run_init_process() calls kernel_execve() to replace the kernel thread with
   the userspace init binary.

### Exercise 3: Boot Messages

Run `dmesg | head -50` on a running Linux system. Match the messages to the
initialization calls in start_kernel():

- "Linux version..." corresponds to pr_notice("%s", linux_banner)
- "Command line:" comes from print_kernel_cmdline()
- CPU and memory messages come from setup_arch()

## Hands-On Challenges

### Challenge 1: Map the Boot Sequence (XP: 30)

Create a timeline of the first 20 function calls in start_kernel(). For each,
write one sentence describing what it does. Use init/main.c as your source.

### Challenge 2: Find the Init Binary (XP: 40)

Trace the code path from rest_init() to the point where /sbin/init is executed.
List every function call in the chain. Hint: look for try_to_run_init_process()
and kernel_execve().

### Challenge 3: Boot Parameter Parsing (XP: 30)

Find where the kernel parses boot parameters like "quiet", "debug", or "root=".
Start at parse_early_param() in init/main.c, then trace into
include/linux/init.h to understand the __setup() macro and early_param() macro.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Describe the 4-stage boot chain from firmware to start_kernel()
- [ ] Name at least 10 subsystems initialized in start_kernel() in order
- [ ] Explain the role of init_task and how PID 1 is created
- [ ] Find and read boot messages in dmesg, matching them to kernel source
- [ ] Explain what happens if the init binary (/sbin/init) cannot be found
