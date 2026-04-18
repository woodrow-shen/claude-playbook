---
name: kernel-modules
description: Build and load kernel modules to extend kernel functionality at runtime
realm: foundations
category: modules
difficulty: beginner
xp: 130
estimated_minutes: 75
prerequisites:
- boot-and-init
unlocks:
- character-devices
- device-model-and-sysfs
- ftrace-and-kprobes
- interrupt-handling
kernel_files:
- kernel/module/main.c
- include/linux/module.h
- include/linux/init.h
doc_files:
- Documentation/kbuild/modules.rst
badge: Module Crafter
tags:
- modules
- kbuild
- insmod
- modprobe
---


# Kernel Modules

## Quest Briefing

The Linux kernel is not a single monolithic block that must be rebuilt every
time you need new functionality. It supports loadable kernel modules -- chunks
of code that can be inserted into a running kernel and removed again without
rebooting. Drivers, filesystems, network protocols, and security modules can
all be built as modules. This mechanism is what makes Linux practical on
millions of different hardware configurations: the base kernel stays small,
and modules load on demand for the specific hardware present. Learning to
write and load modules is your first step toward modifying the kernel itself.


## Learning Objectives

- Explain what a kernel module is and how it differs from built-in kernel
  code.
- Write a minimal kernel module with module_init() and module_exit()
  functions.
- Describe the module loading process from userspace (insmod/modprobe)
  through load_module() in the kernel.
- Understand symbol export with EXPORT_SYMBOL and EXPORT_SYMBOL_GPL.
- Use the kbuild system to compile an out-of-tree module.


## Core Concepts

### What is a Kernel Module?

A kernel module is a compiled object file (.ko) that can be dynamically linked
into the running kernel. It runs in kernel space with full privileges -- the
same address space, the same access to hardware, the same ability to crash
the system as any built-in kernel code. The difference is purely about when
the code is linked:

- Built-in: linked at kernel compile time, always present.
- Module: compiled separately, loaded at runtime via insmod or modprobe.

The kernel's config system (Kconfig) allows most features to be configured as
y (built-in), m (module), or n (excluded). The choice between y and m affects
only when the code is linked, not how it runs.

### The Module Lifecycle Macros

Defined in include/linux/module.h and include/linux/init.h, two macros form
the skeleton of every module:

    module_init(my_init_function);
    module_exit(my_cleanup_function);

- module_init() registers a function to be called when the module loads.
  For built-in code, this function runs during boot. For loadable modules,
  it runs when insmod or modprobe loads the .ko file.

- module_exit() registers a function to be called when the module unloads
  (rmmod). This function must undo everything the init function did: unregister
  devices, free memory, remove procfs entries.

Additional metadata macros:
- MODULE_LICENSE("GPL") -- declares the license. Required. Modules without
  GPL-compatible licenses cannot use EXPORT_SYMBOL_GPL symbols.
- MODULE_AUTHOR("name") -- optional author string.
- MODULE_DESCRIPTION("text") -- optional description.
- MODULE_VERSION("version") -- optional version string.

### The Module Loader: load_module()

When userspace calls init_module() or finit_module() (the syscalls behind
insmod), the kernel invokes load_module() at kernel/module/main.c:3358.
This function performs a complex sequence:

1. Copies the ELF .ko file from userspace into kernel memory.
2. Parses the ELF headers: finds sections for code, data, symbol tables,
   relocation entries, and module metadata.
3. Allocates memory for the module's code and data sections using the
   module memory allocator.
4. Applies relocations: patches addresses in the module code to point at
   the correct kernel symbols.
5. Resolves symbols: the module may reference functions or variables from
   the core kernel or other modules. These are looked up in the kernel
   symbol table.
6. Calls the module's init function (the one registered with module_init).
7. If init succeeds, the module is added to the global modules list.
   If init fails, everything is unwound and memory is freed.

### Symbol Export

Kernel code can make functions and variables available to modules using:

- EXPORT_SYMBOL(name) -- exports the symbol to all modules regardless of
  license.
- EXPORT_SYMBOL_GPL(name) -- exports the symbol only to modules with
  GPL-compatible licenses.

These macros place entries in a special ELF section that the module loader
reads during symbol resolution. Without export, a symbol is invisible to
modules even though it exists in the kernel image.

The distinction between EXPORT_SYMBOL and EXPORT_SYMBOL_GPL is a licensing
enforcement mechanism. Core kernel interfaces that are considered derived
work are exported with _GPL. Modules without GPL-compatible licenses cannot
use them and will fail to load.

### The kbuild System

Out-of-tree modules are compiled using the kernel's own build system. A
minimal Makefile looks like:

    obj-m += mymodule.o

Invoked with:

```sh
make -C /lib/modules/$(uname -r)/build M=$(pwd) modules
```

This tells kbuild to enter the kernel build tree, compile mymodule.c into
mymodule.ko using the same compiler flags, include paths, and configuration
as the kernel itself. This ensures ABI compatibility.


## Code Walkthrough

Trace the lifecycle of a simple "hello world" module:

1. **Write the module** -- Create hello.c with:
   - An init function that calls pr_info("Hello, kernel\n").
   - An exit function that calls pr_info("Goodbye, kernel\n").
   - module_init() and module_exit() macros.
   - MODULE_LICENSE("GPL").

2. **Compile** -- The kbuild Makefile compiles hello.c into hello.ko. The
   .ko file is an ELF relocatable object with special sections for module
   metadata.

3. **Load with insmod** -- insmod calls the finit_module() syscall, which
   enters the kernel at kernel/module/main.c. The kernel calls load_module()
   at line 3358.

4. **ELF parsing** -- load_module() reads the ELF sections. It finds the
   .init.text section containing the init function, the .modinfo section
   containing MODULE_LICENSE, and relocation sections.

5. **Symbol resolution** -- The pr_info call (which expands to printk) must
   be resolved. The loader looks up printk in the kernel symbol table and
   patches the call instruction.

6. **Init execution** -- The init function runs. pr_info writes "Hello,
   kernel" to the kernel log. If this returns 0, the module is successfully
   loaded.

7. **Runtime** -- The module appears in /proc/modules and lsmod output. Its
   symbols (if exported) are available to other modules.

8. **Unload with rmmod** -- rmmod calls the delete_module() syscall. The
   kernel checks the module's reference count, calls the exit function
   (which prints "Goodbye, kernel"), and frees all module memory.


## Hands-On Challenges

### Challenge 1: Hello Kernel Module (40 XP)

Write, compile, and load a kernel module that:
- Prints a custom message on load (visible in dmesg).
- Accepts a module parameter (an integer) using module_param().
- Prints the parameter value during init.
- Prints a farewell message on unload.

Build it against your running kernel and test with insmod, lsmod, and rmmod.

Verification: Show dmesg output with your messages, lsmod showing your
module, and successful rmmod.

### Challenge 2: Trace load_module() (45 XP)

Read kernel/module/main.c starting at load_module() (line 3358). Document
the major steps in order:
- List each significant function called within load_module().
- For each step, explain what failure would cause and how it is handled.
- Identify where the module's init function is actually called.

Verification: Your walkthrough should cover at least 8 distinct steps with
accurate function names and line references.

### Challenge 3: Symbol Export Investigation (45 XP)

Find 5 examples each of EXPORT_SYMBOL and EXPORT_SYMBOL_GPL in the kernel
source tree. For each:
- Note the file and function/variable being exported.
- Explain why one uses _GPL and the other does not (or hypothesize based on
  the function's role).

Then write a two-module system: module A exports a function with
EXPORT_SYMBOL_GPL, and module B calls it. Demonstrate that module B fails to
load if its MODULE_LICENSE is changed to a non-GPL license.

Verification: Show the source for both modules, successful loading with GPL
license, and the error message when loading with a non-GPL license.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Write a minimal kernel module with module_init(), module_exit(), and
      MODULE_LICENSE().
- [ ] Compile an out-of-tree module using the kbuild system.
- [ ] Load and unload a module with insmod/rmmod and verify with lsmod and
      dmesg.
- [ ] Explain what load_module() does at kernel/module/main.c:3358 at a
      high level.
- [ ] Describe the difference between EXPORT_SYMBOL and EXPORT_SYMBOL_GPL
      and the licensing implications.
- [ ] Use module_param() to pass parameters to a module at load time.
- [ ] Explain why a module's init function returning non-zero causes the
      module load to fail and what cleanup occurs.
