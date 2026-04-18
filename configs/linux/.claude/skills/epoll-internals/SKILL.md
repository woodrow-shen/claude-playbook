---
name: epoll-internals
description: Explore the epoll event notification mechanism and its kernel implementation
realm: events
category: event-notification
difficulty: intermediate
xp: 200
estimated_minutes: 120
prerequisites:
  - waitqueue-and-completion
  - vfs-layer
unlocks:
  - io-uring
kernel_files:
  - fs/eventpoll.c
  - include/linux/eventpoll.h
doc_files:
  - Documentation/filesystems/files.rst
badge: Event Sentinel
tags:
  - epoll
  - eventpoll
  - ready-list
---

# Epoll Internals

## Quest Briefing

Every high-performance network server -- nginx, Redis, Node.js, every modern
event loop -- depends on epoll to efficiently monitor thousands of file
descriptors simultaneously. The poll() and select() system calls that came
before it require the kernel to scan every monitored descriptor on every call,
giving them O(n) complexity that collapses under load. Epoll solved this by
inverting the model: instead of the application polling the kernel, the kernel
notifies a persistent data structure when descriptors become ready.

The implementation in fs/eventpoll.c is one of the more intricate pieces of
kernel code. It combines red-black trees for O(log n) descriptor lookup, a
ready list for O(1) event delivery, a three-level locking scheme to handle
concurrent access from both process context and IRQ context, and careful
handling of edge-triggered versus level-triggered semantics. Understanding
how epoll works internally reveals the design patterns that make Linux the
dominant platform for high-concurrency servers.

This skill builds directly on wait queues -- epoll uses them to both sleep
in epoll_wait() and to receive wakeup callbacks when monitored file descriptors
become ready.


## Learning Objectives

- Describe the three core data structures (eventpoll, epitem, eppoll_entry)
  and how they interconnect via the RB tree and ready list.
- Trace the ep_insert() path that registers a new file descriptor and hooks
  into the target file's wait queue.
- Explain the three-level locking hierarchy (epnested_mutex, ep->mtx, ep->lock)
  and why each level exists.
- Follow the wakeup callback path from a file becoming ready through to the
  ready list insertion and epoll_wait() return.
- Distinguish edge-triggered (EPOLLET) from level-triggered behavior in the
  ep_send_events() implementation.


## Core Concepts

### The Eventpoll Data Structures

The central structure is struct eventpoll (fs/eventpoll.c line 179), which
represents an epoll instance. Its key fields include:

- mtx: A mutex held during event collection and ctl operations.
- wq: A wait_queue_head where epoll_wait() callers sleep.
- poll_wait: A wait_queue_head used when the epoll fd itself is polled.
- rdllist: A list_head forming the ready list of descriptors with pending events.
- lock: A spinlock protecting rdllist and ovflist, necessary because wakeup
  callbacks can fire from IRQ context.
- rbr: A red-black tree root (struct rb_root_cached) storing all monitored
  descriptors for O(log n) lookup.
- ovflist: An overflow list -- a single-linked chain of epitems that became
  ready while events were being transferred to userspace with the lock dropped.

Each monitored file descriptor is represented by struct epitem (line 131):

- rbn: The RB tree node linking it into ep->rbr.
- rdllink: The list_head linking it into ep->rdllist when ready.
- ffd: An epoll_filefd containing the struct file pointer and fd number.
- pwqlist: Head of the poll wait queue entries for this item.
- ep: Back-pointer to the containing eventpoll.
- event: The struct epoll_event with the user-requested event mask and data.

The poll hook structure is struct eppoll_entry (line 108), which contains a
wait_queue_entry (wait) that gets inserted into the target file's wait queue.
Its base pointer links back to the owning epitem.

### Inserting a File Descriptor: ep_insert()

When userspace calls epoll_ctl(EPOLL_CTL_ADD), the kernel reaches ep_insert()
at line 1564. This function:

1. Checks the per-user watch limit via percpu_counter_compare against
   max_user_watches (line 1578).
2. Allocates an epitem from the epi_cache slab (line 1583).
3. Initializes the epitem: sets up rdllink, stores the file/fd pair via
   ep_set_ffd(), copies the event mask (lines 1589-1593).
4. Attaches the epitem to the target file's f_ep list via attach_epitem()
   (line 1598).
5. Inserts into the RB tree with ep_rbtree_insert() (line 1613).
6. Calls ep_item_poll() to check if the file is already ready. If events are
   pending immediately, the epitem is added to the ready list and any
   epoll_wait() sleepers are woken.

The critical step is the poll hook setup. During ep_item_poll(), the file's
poll method calls poll_wait(), which invokes ep_ptable_queue_proc(). This
function allocates an eppoll_entry and inserts its wait_queue_entry into the
file's wait queue with the callback set to ep_poll_callback. This callback is
how the kernel is notified when the file descriptor becomes ready.

### The Wakeup Path: ep_poll_callback()

When a monitored file becomes ready (e.g., data arrives on a socket), the
file's code calls wake_up() on its wait queue. Because ep_insert() placed an
eppoll_entry with callback ep_poll_callback on that wait queue, the wakeup
reaches epoll.

ep_poll_callback() executes in potentially atomic context (it may be called
from IRQ handlers). It:

1. Acquires ep->lock (the spinlock, safe in IRQ context).
2. Checks if the reported events match the epitem's interest mask.
3. If the ovflist is active (meaning ep_send_events is running), chains the
   epitem onto the overflow list instead of rdllist.
4. Otherwise, adds the epitem to rdllist via list_add_tail(&epi->rdllink,
   &ep->rdllist).
5. Wakes up tasks sleeping in epoll_wait() via wake_up(&ep->wq).

### Collecting Events: ep_poll() and ep_send_events()

The epoll_wait() system call (line 2465) calls ep_poll() at line 1936. This
function:

1. Checks if the ready list is non-empty. If events are available, it proceeds
   directly to event delivery.
2. If no events are ready, it sleeps on ep->wq using the standard
   prepare_to_wait_exclusive / schedule / finish_wait pattern. The exclusive
   flag prevents thundering herd when multiple threads call epoll_wait() on
   the same epoll fd.
3. When woken, it calls ep_send_events() at line 1763.

ep_send_events() acquires ep->mtx, then calls ep_start_scan() to splice the
entire rdllist into a local txlist. It then iterates this txlist:

1. For each epitem, calls ep_item_poll() to recheck the current event state
   (line 1818).
2. If events are present, copies the event to userspace via epoll_put_uevent()
   (line 1822).
3. For level-triggered mode (the default): if the epitem still has pending
   events after delivery, it is re-added to rdllist (line 1833-1843). This
   ensures the next epoll_wait() will report it again.
4. For edge-triggered mode (EPOLLET): the epitem is NOT re-added. The
   application must drain all data before it will be notified again.
5. For EPOLLONESHOT: the event mask is cleared to private bits only (line 1832),
   disabling the descriptor until re-armed with epoll_ctl(EPOLL_CTL_MOD).

### The Locking Hierarchy

Epoll uses three levels of locking, documented in the comment at line 44:

1. epnested_mutex (global mutex): Acquired only when adding an epoll fd to
   another epoll fd. Prevents cycles in the epoll graph that could cause
   deadlocks. The kernel walks the tree to verify no cycle exists.
2. ep->mtx (per-instance mutex): Held during event collection, EPOLL_CTL_DEL,
   and file release. Allows sleeping (needed for copy_to_user).
3. ep->lock (per-instance spinlock): Protects rdllist and ovflist. Must be a
   spinlock because ep_poll_callback() can be called from IRQ context.

The acquire order is always 1 -> 2 -> 3. Violating this order would deadlock.


## Code Walkthrough

Trace the lifecycle of monitoring a socket with epoll:

1. **epoll_create1()** -- fs/eventpoll.c:2198:
   SYSCALL_DEFINE1(epoll_create1) allocates a struct eventpoll, initializes
   the mutex, wait queues, ready list, RB tree root, and spinlock. It creates
   an anonymous inode file descriptor backed by the eventpoll_fops operations.

2. **epoll_ctl(EPOLL_CTL_ADD)** -- fs/eventpoll.c:2383:
   SYSCALL_DEFINE4(epoll_ctl) looks up both the epoll file and target file,
   searches the RB tree for an existing epitem, and calls ep_insert() to
   create and register a new one.

3. **Socket receives data, triggers wakeup** --
   The network stack calls sk->sk_data_ready(), which calls wake_up_interruptible()
   on the socket's wait queue. The eppoll_entry's wait callback ep_poll_callback
   fires: it acquires ep->lock, adds the epitem to ep->rdllist, and calls
   wake_up(&ep->wq).

4. **epoll_wait() returns** -- fs/eventpoll.c:2465:
   The task sleeping in ep_poll() is woken. ep_send_events() splices rdllist
   into a local list, calls ep_item_poll() to confirm EPOLLIN is set, copies
   the event to userspace, and increments the result count.

5. **Level-triggered re-arming** --
   Because EPOLLET was not set, ep_send_events() re-adds the epitem to rdllist
   (line 1833). If the application calls epoll_wait() again without reading the
   socket data, it will immediately get the same event again.

6. **epoll_ctl(EPOLL_CTL_DEL)** --
   The kernel searches the RB tree, removes the epitem, unhooks the
   eppoll_entry from the target file's wait queue, and frees the structures.


## Hands-On Challenges

### Challenge 1: Trace the Ready List (75 XP)

Using ftrace or bpftrace, hook ep_poll_callback and ep_send_events. Create a
simple TCP echo server using epoll with 10 concurrent clients. For each
epoll_wait() call, record: (a) how many items were on rdllist, (b) how many
events were delivered to userspace, (c) whether any items used the ovflist
overflow path.

Verification: Produce a log showing callback-to-delivery latency for at least
50 events and explain any cases where rdllist count exceeded delivered count.

### Challenge 2: Edge vs Level Triggered Behavior (75 XP)

Write two versions of an epoll-based TCP server: one using level-triggered
mode, one using EPOLLET. In both versions, intentionally read only half the
available data from the socket on each event. Document the behavioral
difference: the LT version should keep firing events, while the ET version
stops after one notification until new data arrives.

Verification: Show strace output demonstrating the different epoll_wait()
return patterns. Explain exactly which code path in ep_send_events() causes
the re-addition for LT mode (line 1833).

### Challenge 3: Epoll Nesting Limits (50 XP)

Create a chain of epoll file descriptors: epfd1 monitors a pipe, epfd2
monitors epfd1, epfd3 monitors epfd2, and so on up to EP_MAX_NESTS (4). Try
adding a fifth level and observe the EINVAL error. Read the cycle detection
code in ep_loop_check_proc() and explain how the kernel prevents deadlock
from circular epoll references.

Verification: Show the errno from the fifth-level add and trace the code
path that rejects it.


## Verification Criteria

- [ ] Can draw the relationship between eventpoll, epitem, and eppoll_entry
      structures and their linking via RB tree, ready list, and wait queues.
- [ ] Can trace ep_insert() from epoll_ctl through RB tree insertion, poll
      hook setup, and initial readiness check.
- [ ] Can explain the three-level locking hierarchy and why a spinlock is
      needed for ep_poll_callback().
- [ ] Can trace the wakeup path from a file's wake_up() through
      ep_poll_callback() to ready list insertion and epoll_wait() return.
- [ ] Can explain the difference between edge-triggered and level-triggered
      behavior by referencing the re-addition logic in ep_send_events().
- [ ] Can describe the overflow list (ovflist) mechanism and when it is used.
- [ ] Can explain why EP_MAX_NESTS exists and how cycle detection works.
