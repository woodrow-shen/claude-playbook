---
name: kbuild-and-kconfig
description: Understand the Linux kernel build system and configuration infrastructure
realm: foundations
category: build
difficulty: beginner
xp: 100
estimated_minutes: 60
prerequisites:
  - boot-and-init
unlocks: []
kernel_files:
  - scripts/kconfig/conf.c
  - scripts/Makefile.build
  - Makefile
doc_files:
  - Documentation/kbuild/kconfig-language.rst
  - Documentation/kbuild/makefiles.rst
badge: Build Master
tags:
  - kbuild
  - kconfig
  - make
---

# Kbuild and Kconfig

## Quest Briefing

The Linux kernel is one of the most configurable software projects ever
created. With thousands of configuration options controlling which drivers,
filesystems, and features are compiled in, compiled as modules, or excluded
entirely, the build system must be both powerful and maintainable. This is
the job of two interconnected systems: Kconfig for configuration and Kbuild
for compilation.

Before you can hack on any kernel subsystem, you need to understand how the
kernel is configured and built. Every Kconfig symbol you enable or disable
controls which source files are compiled, which features are available, and
how the final vmlinux binary is linked. Kbuild, the kernel's custom build
system built on GNU Make, handles the recursive descent through thousands
of directories, compiling only what is needed based on the configuration.

Understanding Kbuild and Kconfig is foundational because every kernel
developer interacts with them daily. Whether you are adding a new driver,
enabling a debug option, or building a minimal kernel for testing, these
systems are your gateway.


## Learning Objectives

- Explain the role of Kconfig files, .config, and auto.conf in the kernel
  build process.
- Navigate the Kconfig language: config, menuconfig, depends on, select,
  tristate, and default values.
- Trace how a CONFIG_* symbol propagates from .config through auto.conf
  to the C preprocessor and Makefile conditionals.
- Understand the Kbuild Makefile variables obj-y, obj-m, and how
  scripts/Makefile.build processes them.
- Run make menuconfig, make defconfig, and make with understanding of
  what each step does internally.


## Core Concepts

### The Top-Level Makefile

The kernel's root Makefile at the repository top level defines the version
(VERSION=7, PATCHLEVEL=0 as of this tree), sets up the build environment,
and orchestrates the entire build. Key aspects:

- Lines 1-5: VERSION, PATCHLEVEL, SUBLEVEL, EXTRAVERSION define the kernel
  version string (currently 7.0.0-rc6).
- It requires GNU Make >= 4.0 (checked at line 14 via output-sync feature
  detection).
- The default target is __all (line 22), which eventually builds vmlinux.
- It sets MAKEFLAGS += -rR (line 49) to disable built-in rules and
  variables for performance.
- The recursive build system descends into subdirectories, with each
  subdirectory's Makefile specifying what to build.

### Kconfig: The Configuration System

Kconfig files (named Kconfig) exist in nearly every kernel directory. They
define configuration symbols using a domain-specific language. The tool
that processes them is scripts/kconfig/conf.c.

The conf.c program (scripts/kconfig/conf.c) supports multiple input modes
defined in the enum input_mode at line 23:
- oldaskconfig: prompts for new symbols (the default, line 41)
- syncconfig: updates config silently
- oldconfig: prompts only for new/changed symbols
- allnoconfig/allyesconfig: sets all symbols to n/y
- allmodconfig: sets all tristate symbols to m
- defconfig: loads a default configuration
- randconfig: randomizes all symbols
- savedefconfig: saves a minimal config
- yes2modconfig/mod2yesconfig/mod2noconfig: bulk symbol conversion

The conf() function at line 20 (declared static) recursively walks the
menu tree to process each config symbol. The check_conf() function
(also line 21) validates that all required symbols have values.

When you run "make menuconfig", it invokes scripts/kconfig/mconf (the
ncurses frontend) which reads all Kconfig files starting from the root
Kconfig, presents the menu, and writes the result to .config.

The .config file is then processed by syncconfig to generate:
- include/config/auto.conf: Makefile-format variables (CONFIG_FOO=y)
- include/generated/autoconf.h: C preprocessor defines (#define CONFIG_FOO 1)
- include/config/auto.conf.cmd: dependency tracking

### Kbuild: Building the Kernel

The actual compilation is handled by scripts/Makefile.build, which is
included recursively for each subdirectory. At lines 14-27, it initializes
the key variables to empty values:

- obj-y: objects to build into the kernel (vmlinux built-in)
- obj-m: objects to build as loadable modules
- lib-y/lib-m: library objects
- always-y/always-m: objects always built regardless of config
- subdir-y/subdir-m: subdirectories to descend into
- asflags-y, ccflags-y, rustflags-y, cppflags-y, ldflags-y: per-directory
  compiler and linker flags

Each subdirectory's Kbuild or Makefile populates these variables
conditionally based on CONFIG_* symbols. For example:

```make
obj-$(CONFIG_EXT4_FS) += ext4/
```

This evaluates to obj-y if CONFIG_EXT4_FS=y (built-in), obj-m if =m
(module), or nothing if not set.

At line 33, auto.conf is included to make CONFIG_* values available:

```make
-include $(objtree)/include/config/auto.conf
```

At lines 35-38, the common build infrastructure is pulled in:

```make
include $(srctree)/scripts/Kbuild.include
include $(srctree)/scripts/Makefile.compiler
include $(kbuild-file)
include $(srctree)/scripts/Makefile.lib
```

Line 50 handles conflicts with `obj-m := $(filter-out $(obj-y),$(obj-m))`, <!-- safe: Makefile pattern quoted inline, not shell -->
meaning if an object appears in both obj-y and obj-m, the built-in
version wins and it is removed from the module list.

Line 54 filters library objects already in obj-y from lib-y.

Lines 57-58 compute subdir-ym, the union of all subdirectories to
descend into. Lines 74-76 transform directory entries: if need-builtin
is set, "foo/" becomes "foo/built-in.a" for linking.

### From Config to Binary

The full pipeline:
1. make menuconfig -> writes .config
2. make syncconfig -> generates auto.conf and autoconf.h
3. make -> recursive descent via scripts/Makefile.build
4. Each directory: obj-y objects compiled to .o, archived into built-in.a
5. Top level: all built-in.a archives linked into vmlinux
6. obj-m objects compiled and linked into .ko module files


## Code Walkthrough

Trace what happens when you run "make defconfig && make" on an x86 system:

1. **make defconfig** -- The top-level Makefile invokes
   scripts/kconfig/conf with --defconfig flag. The conf.c program
   (line 41: input_mode defaults to oldaskconfig) switches to defconfig
   mode. It reads arch/x86/configs/x86_64_defconfig, which contains a
   minimal set of CONFIG_*=y lines.

2. **syncconfig runs** -- Before compilation starts, make triggers
   syncconfig which reads .config and generates include/config/auto.conf
   (CONFIG_* as Make variables) and include/generated/autoconf.h
   (CONFIG_* as C #defines).

3. **Recursive build begins** -- The top-level Makefile descends into
   each directory listed in the kernel's directory structure.

4. **scripts/Makefile.build processes each directory** -- For example,
   in mm/, the Kbuild file contains lines like:

   ```make
   obj-y := filemap.o mempool.o oom_kill.o ...
   obj-$(CONFIG_SWAP) += page_io.o swap_state.o swapfile.o ...
   ```

   Since CONFIG_SWAP=y in the defconfig, the swap files are added to
   obj-y.

5. **Compilation** -- Each .c file in obj-y is compiled to .o using
   the compiler flags accumulated from Makefile.compiler and the
   directory's ccflags-y.

6. **Archiving** -- The .o files in each directory are archived into
   built-in.a by scripts/Makefile.build.

7. **Linking** -- All built-in.a archives are linked together with
   the linker script to produce vmlinux.


## Hands-On Challenges

### Challenge 1: Trace a CONFIG Symbol (30 XP)

Pick CONFIG_IKCONFIG (the option to embed .config in the kernel).
- Find its Kconfig definition (use grep to locate it).
- Check your .config to see if it is set.
- Find the Makefile line that conditionally compiles its source.
- Verify the generated auto.conf and autoconf.h entries match.

Verification: Show the Kconfig definition, the Makefile line, and the
generated files all referencing the same symbol.

### Challenge 2: Add a Custom Config Option (40 XP)

Create a new Kconfig symbol CONFIG_MY_TEST in the init/Kconfig file:
- Define it as a bool with a help text.
- Make it depend on CONFIG_EXPERT.
- Run make menuconfig and find your new option.
- Add a conditional printk in init/main.c that prints a message when
  CONFIG_MY_TEST is enabled.
- Build the kernel and verify the message appears (or does not).

Verification: Show the Kconfig definition, the C code with #ifdef, and
build output confirming correct conditional compilation.

### Challenge 3: Understand obj-y vs obj-m (30 XP)

Read scripts/Makefile.build lines 14-78 and answer:
- What happens when the same object appears in both obj-y and obj-m?
  (line 50)
- How does line 75 transform directory entries like "foo/" into
  "foo/built-in.a"?
- What is the purpose of the need-builtin and need-modorder guards
  at lines 68-78?

Verification: Write a short explanation with exact line number references
from scripts/Makefile.build.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain the three-stage build: configure (.config), generate
      (auto.conf/autoconf.h), compile (recursive make).
- [ ] Navigate scripts/kconfig/conf.c and identify the input_mode enum
      at line 23 that controls configuration behavior.
- [ ] Read a Kconfig file and explain config, menuconfig, depends on,
      select, tristate, and default directives.
- [ ] Explain how obj-y and obj-m in scripts/Makefile.build (lines 14-27)
      control what gets built into vmlinux vs loadable modules.
- [ ] Trace how auto.conf (included at scripts/Makefile.build line 33)
      makes CONFIG_* symbols available to Makefiles.
- [ ] Run make with V=1 and interpret the verbose output to understand
      what the build system is doing.
