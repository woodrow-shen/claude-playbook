---
name: interrupt-handling
description: Master hardware interrupts and deferred work mechanisms in the kernel
realm: devices
category: interrupts
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - spinlocks-and-mutexes
  - kernel-modules
unlocks:
  - block-device-layer
  - timers-and-hrtimers
  - kvm-fundamentals
  - perf-events
kernel_files:
  - kernel/irq/manage.c
  - kernel/softirq.c
  - kernel/workqueue.c
  - include/linux/interrupt.h
  - include/linux/workqueue.h
doc_files:
  - Documentation/core-api/genericirq.rst
badge: Interrupt Handler
tags:
  - interrupts
  - irq
  - softirq
  - workqueue
  - bottom-half
---

# Interrupt Handling

Hardware interrupts are the kernel's event-driven interface to the physical
world. When a network card receives a packet, a disk completes I/O, or a
keyboard key is pressed, an interrupt fires. The kernel must handle it quickly
and correctly, or the system becomes unresponsive.

## Learning Objectives

After completing this skill, you will be able to:

- Explain the top-half/bottom-half interrupt model
- Register an interrupt handler with request_irq()
- Describe softirqs, tasklets, and workqueues as deferred work mechanisms
- Choose the correct deferred work mechanism for a given task
- Read /proc/interrupts to diagnose interrupt distribution

## Core Concepts

### Top Half and Bottom Half

Interrupt handling is split into two parts:

**Top half (hardirq)**: runs immediately when the interrupt fires. Must be
extremely fast because:
- All interrupts on the same line are blocked
- Cannot sleep or call blocking functions
- Should only do the minimum: acknowledge hardware, copy urgent data, schedule
  the bottom half

**Bottom half**: runs later, in a context that allows more work. Three mechanisms:
- Softirqs: fastest, used by networking and block I/O
- Tasklets: built on softirqs, simpler API
- Workqueues: run in process context, can sleep

### Registering an Interrupt Handler

Use request_irq() (include/linux/interrupt.h):

```c
int request_irq(unsigned int irq,
                irq_handler_t handler,
                unsigned long flags,
                const char *name,
                void *dev_id);
```

- irq: the interrupt number
- handler: function called when interrupt fires (returns IRQ_HANDLED or IRQ_NONE)
- flags: IRQF_SHARED (shared line), IRQF_ONESHOT, etc.
- name: shows up in /proc/interrupts
- dev_id: passed to handler, must be unique for shared interrupts

The handler signature:

```c
irqreturn_t my_handler(int irq, void *dev_id)
{
    // acknowledge hardware
    // read urgent data
    // schedule bottom half
    return IRQ_HANDLED;
}
```

Free with free_irq(irq, dev_id) when done.

### Softirqs

Softirqs (kernel/softirq.c) are the fastest deferred work mechanism. They are
statically defined at compile time (limited to ~10 types):

- HI_SOFTIRQ: high-priority tasklets
- TIMER_SOFTIRQ: timer callbacks
- NET_TX_SOFTIRQ: network transmit
- NET_RX_SOFTIRQ: network receive
- BLOCK_SOFTIRQ: block I/O completion
- TASKLET_SOFTIRQ: regular tasklets
- SCHED_SOFTIRQ: scheduler load balancing
- RCU_SOFTIRQ: RCU callbacks

Softirqs run with interrupts enabled but cannot sleep. They can run
concurrently on multiple CPUs (must be reentrant).

### Tasklets

Tasklets are a simpler interface built on softirqs. Unlike raw softirqs:
- Can be created dynamically
- A given tasklet only runs on one CPU at a time (no reentrancy concern)
- Still cannot sleep

```c
void my_tasklet_func(unsigned long data);
DECLARE_TASKLET(my_tasklet, my_tasklet_func);

// In hardirq handler:
tasklet_schedule(&my_tasklet);
```

### Workqueues

Workqueues (kernel/workqueue.c, include/linux/workqueue.h) run deferred work
in process context via kernel threads. They CAN sleep, making them suitable for:
- Operations that need to allocate memory (GFP_KERNEL)
- Operations that need to acquire mutexes
- Any work that may block

```c
void my_work_func(struct work_struct *work);
DECLARE_WORK(my_work, my_work_func);

// Schedule on default workqueue:
schedule_work(&my_work);
```

The system workqueue (system_wq) uses per-CPU kernel threads (kworker/*).
You can also create dedicated workqueues with alloc_workqueue().

### Choosing the Right Mechanism

| Need | Mechanism |
|------|-----------|
| Fastest possible, networking/block | Softirq |
| Per-device deferred work, no sleep | Tasklet |
| May sleep, allocate memory, take mutexes | Workqueue |
| Delayed execution | Workqueue + delayed_work |

### Threaded Interrupts

Modern drivers often use threaded interrupts (request_threaded_irq), which
run the handler in a dedicated kernel thread. This simplifies locking since
the handler runs in process context and can sleep.

## Code Walkthrough

### Exercise 1: Trace an Interrupt

1. Hardware raises IRQ line
2. CPU jumps to arch-specific entry (arch/x86/entry/entry_64.S)
3. do_IRQ() (arch/x86/kernel/irq.c) identifies the interrupt
4. generic_handle_irq() dispatches to the registered handler
5. Your handler runs, returns IRQ_HANDLED
6. If softirqs are pending, do_softirq() runs them before returning

### Exercise 2: Read /proc/interrupts

```
cat /proc/interrupts
```

Each row is an IRQ number. Columns show per-CPU interrupt counts. The last
columns show the IRQ type and registered handler name. Identify:
- Timer interrupt
- Network card interrupt
- Keyboard/mouse interrupts
- How interrupts are distributed across CPUs

### Exercise 3: Trace Workqueue Execution

1. In kernel/workqueue.c, find process_one_work()
2. This is the core loop: kworker thread dequeues work items and executes them
3. Find worker_thread() which is the kworker's main function
4. Note how it manages the pool of worker threads

## Hands-On Challenges

### Challenge 1: Interrupt Statistics (XP: 60)

Monitor /proc/interrupts over 10 seconds. Calculate the interrupt rate per
second for the top 5 interrupt sources. Identify which devices generate the
most interrupts. Explain why some IRQs go to specific CPUs (interrupt affinity).

### Challenge 2: Workqueue Module (XP: 70)

Write a kernel module that:
- Registers a timer (setup_timer or timer_setup)
- The timer callback schedules a work item on the system workqueue
- The work function logs a message and reschedules the timer
- The result: periodic work execution via timer + workqueue

### Challenge 3: Top/Bottom Half Split (XP: 70)

Design and document (pseudocode) an interrupt handler for a hypothetical
network device that:
- Top half: reads the packet length and DMA address from hardware registers
- Schedules a NAPI softirq for packet processing
- Bottom half: allocates sk_buff, copies packet data, passes to network stack
Explain why each operation is in the top or bottom half.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain why interrupt handling is split into top and bottom halves
- [ ] Register and free an interrupt handler with request_irq/free_irq
- [ ] Choose between softirq, tasklet, and workqueue for deferred work
- [ ] Read /proc/interrupts and identify interrupt sources and distribution
- [ ] Describe threaded interrupts and when to use them
