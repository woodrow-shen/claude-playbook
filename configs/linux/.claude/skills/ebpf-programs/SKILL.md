---
name: ebpf-programs
description: Understand the eBPF virtual machine, verifier, JIT, and program types
realm: tracing
category: ebpf
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - ftrace-and-kprobes
unlocks:
  - ebpf-maps-and-helpers
  - sched-ext
kernel_files:
  - kernel/bpf/core.c
  - kernel/bpf/verifier.c
  - kernel/bpf/syscall.c
  - include/linux/bpf.h
doc_files:
  - Documentation/bpf/index.rst
  - Documentation/bpf/verifier.rst
badge: BPF Initiate
tags:
  - ebpf
  - bpf
  - verifier
  - jit
---

# eBPF Programs

## Quest Briefing

eBPF (extended Berkeley Packet Filter) is arguably the most transformative
technology added to the Linux kernel in the past decade. It provides a
safe, sandboxed virtual machine inside the kernel that can run user-supplied
programs at nearly native speed. Originally designed for packet filtering,
eBPF now powers tracing (replacing kprobes scripts), security policies
(replacing some LSM hooks), networking (XDP, TC), and even scheduling
(sched_ext).

The key innovation is the verifier: before any BPF program runs, the kernel
statically analyzes every possible execution path to prove the program is
safe -- no infinite loops, no out-of-bounds memory access, no invalid
pointer dereferences. This allows unprivileged code to run safely in kernel
context. Understanding the verifier is understanding the heart of eBPF.


## Learning Objectives

- Explain the eBPF instruction set and register model.
- Trace the bpf() syscall path through kernel/bpf/syscall.c.
- Describe the verifier's abstract interpretation in do_check().
- Understand JIT compilation from BPF bytecode to native instructions.
- List the major BPF program types and their attach points.


## Core Concepts

### The BPF Instruction Set

eBPF uses a RISC-like instruction set with 11 64-bit registers (r0-r10),
where r10 is the read-only frame pointer. Instructions are 8 bytes each
(struct bpf_insn in include/linux/filter.h). The ISA supports:
- Arithmetic: add, sub, mul, div, mod, and, or, xor, shifts
- Memory: load/store with various sizes (1/2/4/8 bytes)
- Branches: conditional jumps, function calls
- Atomic: atomic add, cmpxchg, xchg

The interpreter is ___bpf_prog_run() at kernel/bpf/core.c:1775, a giant
switch-based dispatch loop (or computed goto with CONFIG_BPF_JIT_ALWAYS_ON
disabled). Each opcode is a case that reads operands from regs[] and the
insn stream.

### The bpf() System Call

All BPF operations go through the bpf() syscall, handled by
__sys_bpf() in kernel/bpf/syscall.c. Key commands:
- BPF_PROG_LOAD: load and verify a program
- BPF_MAP_CREATE: create a BPF map
- BPF_PROG_ATTACH: attach program to a hook point
- BPF_LINK_CREATE: create a BPF link (modern attach mechanism)

BPF_PROG_LOAD calls bpf_prog_load() which allocates the program,
copies instructions from userspace, then calls bpf_check() to run the
verifier.

### The Verifier

bpf_check() at kernel/bpf/verifier.c:25954 is the entry point. It:

1. Calls check_subprogs() to identify all subprograms.
2. Calls do_check_subprogs() at verifier.c:24722 for global functions.
3. Calls do_check_main() at verifier.c:24772 for the main program.

do_check() at verifier.c:21244 is the core loop. It performs abstract
interpretation: for each instruction, it tracks the type and value range
of every register using struct bpf_reg_state. Key checks include:

- check_mem_access() at verifier.c:7702 validates all memory accesses
  (stack, map values, packet data, context fields).
- check_helper_call() at verifier.c:11640 validates BPF helper function
  calls against their prototypes.
- Type tracking: each register has a type (SCALAR, PTR_TO_MAP_VALUE,
  PTR_TO_CTX, PTR_TO_STACK, etc.) and a value range [smin, smax, umin, umax].

The verifier rejects programs with: unbounded loops (unless bounded by
the prover), out-of-bounds access, type mismatches, leaked references,
or unreachable code.

### JIT Compilation

After verification, bpf_prog_select_runtime() in core.c decides whether
to JIT-compile the program. On x86, arch/x86/net/bpf_jit_comp.c
translates each BPF instruction to native x86 instructions. JIT is
essentially a 1:1 mapping with register allocation (BPF r0-r5 map to
rax, rdi, rsi, rdx, rcx, r8).


## Code Walkthrough

Trace loading a simple BPF tracepoint program:

1. **Userspace calls bpf(BPF_PROG_LOAD)** -- The libbpf library prepares
   a bpf_attr with program type, instructions, and license string. The
   syscall enters __sys_bpf() in kernel/bpf/syscall.c.

2. **bpf_prog_load()** allocates struct bpf_prog, copies the instruction
   array from userspace, and calls bpf_check().

3. **bpf_check()** at verifier.c:25954 initializes the verifier
   environment, calls check_cfg() to verify the control flow graph has
   no unreachable instructions, then enters do_check_main().

4. **do_check()** at verifier.c:21244 walks instructions one by one.
   For each instruction, do_check_insn() at verifier.c:21076 dispatches
   to the appropriate checker. ALU ops update register value ranges.
   Memory ops call check_mem_access(). Calls go to check_helper_call().

5. **Verification succeeds** -- bpf_check() returns 0. Back in
   bpf_prog_load(), bpf_prog_select_runtime() JIT-compiles the program.
   A file descriptor is returned to userspace.

6. **Attach** -- Userspace calls bpf(BPF_LINK_CREATE) to attach the
   program to a tracepoint, kprobe, or other hook. The kernel installs
   the BPF program as a callback at the attachment point.


## Hands-On Challenges

### Challenge 1: Trace the Verifier (75 XP)

Read kernel/bpf/verifier.c and answer:
1. What does bpf_check() do before calling do_check_main()?
2. In do_check(), how does the verifier handle conditional branches?
   (Hint: look for push_stack and pop_stack.)
3. What types can a register hold? List at least 8 from enum bpf_reg_type.

Verification: Annotate the verifier's main loop with register state
tracking for a 5-instruction program.

### Challenge 2: BPF Instruction Decoder (50 XP)

Read the ___bpf_prog_run() interpreter at core.c:1775 and:
1. List the opcodes for: 64-bit add, load from memory, conditional jump
   if equal, function call.
2. Explain how the interpreter dispatches to each opcode handler.
3. Find where BPF_CALL is handled and how it resolves the helper
   function pointer.

Verification: Decode a raw BPF instruction hex sequence into human-readable
operations.

### Challenge 3: Write a BPF Program (75 XP)

Using libbpf or bpftool, write a BPF program that:
1. Attaches to the sys_enter_openat tracepoint.
2. Reads the filename argument from the tracepoint context.
3. Stores a count in a BPF hash map keyed by filename.
4. Run the program and verify counts with bpftool map dump.

Verification: Show the program source, verifier log (bpftool prog load
with -d), and map dump output.


## Verification Criteria

- [ ] Explain the BPF register model (r0-r10) and instruction format.
- [ ] Trace bpf(BPF_PROG_LOAD) from __sys_bpf() through bpf_check()
      at verifier.c:25954 to JIT compilation.
- [ ] Describe do_check()'s abstract interpretation loop at verifier.c:21244.
- [ ] Explain how check_mem_access() at verifier.c:7702 validates memory.
- [ ] List at least 5 BPF program types and their use cases.
- [ ] Describe how JIT maps BPF registers to x86 registers.
- [ ] Explain what makes a BPF program "safe" (bounded, no OOB, typed).
