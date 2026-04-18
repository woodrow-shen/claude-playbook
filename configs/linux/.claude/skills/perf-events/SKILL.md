---
name: perf-events
description: Understand the perf_event subsystem, PMU abstraction, sampling, and ring buffer
realm: tracing
category: profiling
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - ftrace-and-kprobes
  - interrupt-handling
unlocks: []
kernel_files:
  - kernel/events/core.c
  - kernel/events/ring_buffer.c
  - include/linux/perf_event.h
doc_files:
  - Documentation/admin-guide/perf-security.rst
badge: Perf Analyst
tags:
  - perf
  - pmu
  - sampling
  - profiling
---

# Perf Events

## Quest Briefing

The perf_event subsystem is the kernel's unified interface for performance
monitoring. It abstracts hardware performance counters (CPU cycles, cache
misses, branch mispredictions), software events (context switches, page
faults), and tracepoints into a single framework. The userspace perf tool
builds on this to provide profiling, tracing, and statistical analysis.

At its core, perf_event provides two capabilities: counting (how many times
did event X happen?) and sampling (every N occurrences of event X, capture
a snapshot of the system state). Sampling is what makes profiling work --
by periodically capturing instruction pointers, call stacks, and register
state, perf builds a statistical picture of where time is spent.

The subsystem is also the backbone for hardware breakpoints, uprobe events,
and BPF-based profiling. Understanding it means understanding how the
kernel interacts with CPU performance monitoring hardware.


## Learning Objectives

- Explain the perf_event_open() syscall and event configuration.
- Trace event creation through kernel/events/core.c.
- Describe the PMU (Performance Monitoring Unit) abstraction.
- Understand the perf ring buffer for sample delivery to userspace.
- Explain sampling, overflow interrupts, and callchain capture.


## Core Concepts

### The perf_event_open() Syscall

perf_event_open() is the entry point, defined via SYSCALL_DEFINE5 in
kernel/events/core.c. It takes a struct perf_event_attr describing the
event (type, config, sample_period, sample_type) and returns a file
descriptor. The attr structure is defined in include/uapi/linux/perf_event.h.

Event types include:
- PERF_TYPE_HARDWARE: CPU PMU events (cycles, instructions, cache refs)
- PERF_TYPE_SOFTWARE: kernel software events (task-clock, page-faults)
- PERF_TYPE_TRACEPOINT: ftrace tracepoint events
- PERF_TYPE_RAW: raw PMU event codes
- PERF_TYPE_BREAKPOINT: hardware breakpoint events

### PMU Abstraction

Each event source registers a struct pmu (include/linux/perf_event.h)
with callbacks: event_init, add, del, start, stop, read. Hardware PMUs
register through perf_pmu_register(). The x86 PMU is in
arch/x86/events/core.c.

When a perf event is created, perf_init_event() in core.c iterates
through registered PMUs to find one that accepts the event configuration.
The matching PMU's event_init callback validates and configures the event.

### Event Scheduling

The kernel may have more active events than physical PMU counters. The
perf scheduler in kernel/events/core.c multiplexes events: it rotates
which events are on the hardware counters using a round-robin scheme.
perf_event_context_sched_in() and perf_event_context_sched_out() handle
context switches, ensuring events follow their target task.

### The Ring Buffer

Perf uses a memory-mapped ring buffer (kernel/events/ring_buffer.c) to
deliver samples to userspace. The buffer is a set of pages shared between
kernel and userspace via mmap(). The kernel writes sample records using
perf_output_begin() / perf_output_end(). Userspace reads them by tracking
the data_head and data_tail pointers in the mmap header (struct
perf_event_mmap_page).

When an overflow interrupt fires (the PMU counter wraps), the interrupt
handler calls perf_event_overflow(), which writes a sample record
containing the requested fields (IP, callchain, registers, time, CPU)
into the ring buffer. If the buffer is full, samples are lost and the
lost count is incremented.

### Callchain Capture

For profiling, the most important sample field is the callchain -- the
stack of return addresses showing how execution arrived at the current
point. perf_callchain() in core.c captures both kernel and user
callchains. The kernel side walks the stack frame pointers (or uses
ORC unwinding on x86). The user side captures frame pointers from the
user stack.


## Code Walkthrough

Trace perf record -e cycles -g capturing a CPU profile:

1. **perf_event_open()** -- Userspace opens a PERF_TYPE_HARDWARE event
   with config=PERF_COUNT_HW_CPU_CYCLES, sample_period=N, and
   PERF_SAMPLE_CALLCHAIN. The syscall in core.c creates a struct
   perf_event and initializes it with the x86 PMU.

2. **mmap()** -- The perf tool mmaps the event fd to create the shared
   ring buffer. rb_alloc() in ring_buffer.c allocates the pages.

3. **ioctl(PERF_EVENT_IOC_ENABLE)** -- Enables the event. The PMU's
   add() callback programs the hardware counter with the cycle event
   and overflow threshold.

4. **PMU overflow interrupt** -- After N cycles, the counter overflows
   and triggers a PMI (Performance Monitoring Interrupt). The interrupt
   handler calls perf_event_overflow(), which calls
   __perf_event_output() to write a sample record into the ring buffer.

5. **Callchain capture** -- perf_callchain() walks the kernel stack
   (using ORC or frame pointers) and user stack (reading frame pointers
   from user memory) to build the return address chain.

6. **Userspace reads samples** -- The perf tool polls the ring buffer,
   reads sample records, resolves addresses to symbols using the binary's
   debug info, and builds the profile.


## Hands-On Challenges

### Challenge 1: PMU Discovery (75 XP)

Explore the PMU subsystem:
1. List all registered PMUs from /sys/bus/event_source/devices/.
2. Find perf_pmu_register() in core.c and trace how x86 PMU registers.
3. Read the x86 PMU's event_init callback and explain how it validates
   a hardware event config.

Verification: Show the PMU list and explain hardware counter programming.

### Challenge 2: Ring Buffer Protocol (100 XP)

Read kernel/events/ring_buffer.c and answer:
1. How does perf_output_begin() reserve space in the ring?
2. What is the role of data_head vs data_tail in the mmap page?
3. How does the kernel detect that userspace has consumed samples?
4. What happens when the ring buffer is full (overwrite vs non-overwrite)?

Verification: Diagram the ring buffer protocol with head/tail pointer
advancement.

### Challenge 3: Profile the Kernel (125 XP)

Use perf to profile a workload:
1. Run perf record -e cycles:k -g on a CPU-intensive task.
2. Use perf report to find the hottest kernel functions.
3. For the top function, find its source in the kernel tree.
4. Trace back through the perf subsystem: how did the sample for that
   function get captured? What was the overflow path?

Verification: Show perf report output with annotated kernel source.


## Verification Criteria

- [ ] Explain perf_event_open() parameters and event types.
- [ ] Trace event creation through core.c from syscall to PMU init.
- [ ] Describe the PMU abstraction and perf_pmu_register().
- [ ] Explain the ring buffer mmap protocol with head/tail pointers.
- [ ] Describe how overflow interrupts trigger sample capture.
- [ ] Explain callchain capture for both kernel and user stacks.
- [ ] Describe event multiplexing when counters are oversubscribed.
