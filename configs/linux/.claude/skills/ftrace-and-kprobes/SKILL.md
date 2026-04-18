---
name: ftrace-and-kprobes
description: Master ftrace function tracing and kprobes dynamic instrumentation
realm: tracing
category: tracing
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
- kernel-modules
- system-calls
unlocks:
- ebpf-programs
- perf-events
kernel_files:
- kernel/trace/ftrace.c
- kernel/trace/trace.c
- kernel/kprobes.c
- include/linux/ftrace.h
doc_files:
- Documentation/trace/ftrace.rst
- Documentation/trace/kprobes.rst
badge: Trace Master
tags:
- ftrace
- kprobes
- tracing
- tracefs
---


# Ftrace and Kprobes

## Quest Briefing

When a kernel misbehaves -- a function takes too long, a lock is held for
ages, or a code path runs when it should not -- you need to see inside the
running kernel without stopping it. Ftrace is the kernel's built-in function
tracer. It can record every function call, measure latencies, and trace
specific events, all with minimal overhead. It works by patching function
prologues at runtime using the infrastructure that gcc's -pg flag and
-fentry provide.

Kprobes takes instrumentation further. Where ftrace traces function entry
and exit, kprobes can insert a breakpoint at nearly any instruction in the
kernel. When that instruction executes, your handler runs, giving you access
to register state and function arguments. Kretprobes extend this to capture
return values. Together, ftrace and kprobes form the foundation upon which
higher-level tools like BPF tracing programs are built.


## Learning Objectives

- Explain how ftrace patches function prologues using -fentry NOPs.
- Trace the ftrace_ops registration path through __register_ftrace_function().
- Describe the kprobe lifecycle: register, arm, hit, single-step, disarm.
- Use tracefs to enable function tracing, set filters, and read trace output.
- Understand the ring buffer architecture in kernel/trace/ring_buffer.c.


## Core Concepts

### Ftrace Architecture

Ftrace leverages the compiler's -fentry option, which inserts a call to
__fentry__ at the beginning of every function. At boot, these call sites
are patched to NOPs by ftrace_init() in kernel/trace/ftrace.c. When
tracing is enabled, ftrace patches selected NOPs back to calls that jump
to the ftrace trampoline.

The central data structure is struct ftrace_ops (include/linux/ftrace.h),
which holds a callback function pointer and a filter hash. Multiple
ftrace_ops can be active simultaneously. The global list is
ftrace_ops_list at ftrace.c:124.

Registration happens through __register_ftrace_function() at ftrace.c:330,
which adds the ops to the list and calls ftrace_update_trampoline() to
set up the per-ops trampoline code. The actual NOP-to-call patching is
done by ftrace_replace_code() which walks the ftrace_pages and patches
each recorded call site.

### The Ring Buffer

Ftrace events are stored in a per-CPU ring buffer implemented in
kernel/trace/ring_buffer.c. Each CPU has its own buffer to avoid cache
bouncing. Events are written with rb_reserve_next_event() and committed
with rb_commit(). The reader side uses ring_buffer_peek() and
ring_buffer_consume().

The trace output is exposed through tracefs (typically mounted at
/sys/kernel/tracing). The trace file streams events from all CPU buffers
merged in timestamp order. trace_pipe provides a blocking read interface.

### Kprobes

Kprobes allow inserting breakpoints at arbitrary kernel addresses.
register_kprobe() at kernel/kprobes.c:1708 is the entry point. It:

1. Looks up the symbol or address for the probe point.
2. Calls arch_prepare_kprobe() to save the original instruction and
   prepare the breakpoint instruction.
3. Arms the probe by writing the breakpoint (int3 on x86) over the
   original instruction.

When the breakpoint fires, the kprobe_handler runs in the int3 exception
path. It calls the user's pre_handler callback (if set), single-steps the
saved original instruction, then calls the post_handler. The function
aggr_pre_handler() at kprobes.c:1260 handles multiplexing when multiple
probes exist at the same address.

Kretprobes work by replacing the return address on the stack with a
trampoline. When the function returns, the trampoline fires, calling the
user's handler with the return value, then jumping to the real return
address.

### Ftrace-Based Kprobes

Modern kernels can implement kprobes using ftrace instead of int3
breakpoints. When the probe target is at a function entry (where the
ftrace NOP lives), arch_prepare_kprobe_ftrace() is used instead of
int3 insertion. This is faster because it avoids the debug exception path
and piggybacks on ftrace's call-site patching infrastructure.


## Code Walkthrough

Trace enabling function_graph tracer via tracefs:

1. **Write to current_tracer** -- Writing "function_graph" to
   /sys/kernel/tracing/current_tracer triggers tracing_set_tracer() in
   kernel/trace/trace.c. This finds the tracer struct by name and calls
   its init callback.

2. **Function graph tracer init** -- The function_graph tracer registers
   two ftrace_ops: one for function entry (recording the call) and one
   for function return (recording duration). It calls
   register_ftrace_function() which leads to __register_ftrace_function()
   at ftrace.c:330.

3. **Patching call sites** -- ftrace_startup() calls
   ftrace_hash_rec_enable() to mark which call sites should be traced
   (based on set_ftrace_filter), then ftrace_run_update_code() patches
   the NOPs to calls.

4. **Tracing in action** -- When a traced function is called, the
   patched-in call jumps to the ftrace trampoline, which calls the
   registered ftrace_ops callbacks. The callback writes an event to the
   per-CPU ring buffer.

5. **Reading output** -- Reading /sys/kernel/tracing/trace calls
   s_show() in kernel/trace/trace.c, which iterates the ring buffer
   entries across all CPUs, sorted by timestamp.


## Hands-On Challenges

### Challenge 1: Function Tracer Exploration (50 XP)

Enable ftrace function tracing and trace all functions in a specific
module. Steps:
1. Mount tracefs if not mounted.
2. Set current_tracer to "function".
3. Set set_ftrace_filter to "ext4_*" (or another subsystem).
4. Read trace output and identify the call chain.
5. Find __register_ftrace_function() in ftrace.c and trace the
   registration path.

Verification: Show the trace output with at least 10 distinct function
calls and map 3 of them to their source locations.

### Challenge 2: Write a Kprobe Module (75 XP)

Write a kernel module that registers a kprobe on do_sys_openat2().
The pre_handler should print the filename argument. Steps:
1. Use register_kprobe() to install the probe.
2. In your pre_handler, extract the filename from pt_regs.
3. Load the module and open a file to see the probe fire.
4. Trace the register_kprobe() path at kprobes.c:1708.

Verification: Show dmesg output with filename captures and explain
the arch_prepare_kprobe() step.

### Challenge 3: Ring Buffer Deep Dive (75 XP)

Read kernel/trace/ring_buffer.c and answer:
1. How does rb_reserve_next_event() handle the case where the buffer
   is full? What is the overwrite vs no-overwrite policy?
2. How are per-CPU buffers merged for the trace output file?
3. What is the purpose of the commit page vs the reader page?

Verification: Explain the ring buffer page management with specific
function names and line numbers.


## Verification Criteria

- [ ] Explain how ftrace patches function entries using -fentry NOPs.
- [ ] Trace __register_ftrace_function() at ftrace.c:330 through
      trampoline setup and call site patching.
- [ ] Describe the kprobe lifecycle: register_kprobe() at kprobes.c:1708,
      arch_prepare_kprobe(), breakpoint hit, pre_handler, single-step.
- [ ] Explain the per-CPU ring buffer architecture and event writing.
- [ ] Use tracefs to enable tracing, set filters, and read output.
- [ ] Describe how kretprobes replace the return address on the stack.
- [ ] Explain when ftrace-based kprobes are used instead of int3.
