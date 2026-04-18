---
name: io-uring
description: Master the io_uring asynchronous I/O framework and its submission/completion ring design
realm: events
category: async-io
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - epoll-internals
unlocks: []
kernel_files:
  - io_uring/io_uring.c
  - io_uring/io_uring.h
doc_files:
  - Documentation/filesystems/io_uring.rst
badge: Ring Bearer
tags:
  - io-uring
  - sqe
  - cqe
  - async-io
---

# io_uring: The Asynchronous I/O Ring

## Quest Briefing

For decades, Linux I/O was fundamentally synchronous: a process issues a system
call, blocks until the operation completes, and then resumes. Asynchronous
alternatives existed -- POSIX AIO, Linux AIO (io_submit/io_getevents) -- but
they were limited to direct I/O on files, could not handle networking or other
operations, and had significant per-operation overhead from system call
transitions. In 2019, Jens Axboe introduced io_uring, a radical redesign that
eliminates these limitations through shared memory rings.

The core innovation of io_uring is a pair of lock-free ring buffers shared
between kernel and userspace. The submission queue (SQ) lets the application
post I/O requests without a system call for each one. The completion queue (CQ)
lets the kernel deliver results without waking the application for each one.
Combined with kernel-side SQ polling (SQPOLL), io_uring can achieve zero
system call I/O -- the kernel thread polls the SQ for new work and posts
completions to the CQ, while the application polls the CQ for results.

The implementation in io_uring/io_uring.c is the most significant addition to
the Linux I/O subsystem in years. It supports nearly every I/O operation:
read, write, send, recv, accept, connect, openat, close, fsync, fallocate,
poll, timeout, and many more. Understanding io_uring is essential for anyone
building or debugging high-performance I/O systems on modern Linux.


## Learning Objectives

- Describe the shared memory ring buffer architecture: SQ ring, CQ ring, SQE
  array, and their memory barrier requirements.
- Trace the submission path from io_uring_enter through io_submit_sqes to
  individual operation dispatch.
- Explain the completion path from operation finish through CQE posting to
  userspace visibility.
- Understand the io_ring_ctx structure and its role as the central state for
  an io_uring instance.
- Distinguish the three submission modes: default, SQPOLL, and
  IORING_SETUP_DEFER_TASKRUN.


## Core Concepts

### The Ring Buffer Architecture

An io_uring instance consists of three shared memory regions mapped into
userspace:

1. The SQ ring: Contains an array of indices into the SQE array. The
   application writes new indices to the tail, the kernel reads from the head.
   The ring is sized as a power-of-two for efficient masking.

2. The SQE (Submission Queue Entry) array: A contiguous array of struct
   io_uring_sqe entries (64 bytes each, or 128 with IORING_SETUP_SQE128).
   Each SQE describes one I/O operation: opcode, flags, fd, buffer address,
   length, offset, and user_data for correlation.

3. The CQ ring: Contains struct io_uring_cqe entries (16 bytes each, or 32
   with IORING_SETUP_CQE32). Each CQE carries the result of a completed
   operation: user_data (matching the SQE), res (return value), and flags.

The memory barrier protocol is documented in the comment at the top of
io_uring/io_uring.c (lines 7-41). The application must use smp_store_release
when updating the SQ tail (pairing with smp_load_acquire in io_get_sqe), and
smp_load_acquire when reading the CQ tail (pairing with smp_store_release in
the kernel's CQE posting). This ordering ensures that the kernel sees fully
written SQEs and the application sees fully written CQEs.

### The io_ring_ctx Structure

The central state for an io_uring instance is struct io_ring_ctx, allocated
by io_ring_ctx_alloc() at io_uring/io_uring.c line 223. Key fields include:

- sq_entries / cq_entries: The number of SQ and CQ slots.
- sq_sqes: Pointer to the SQE array mapped into both kernel and userspace.
- rings: Pointer to the shared struct io_rings containing the SQ and CQ
  head/tail pointers and flags.
- uring_lock: A mutex protecting submission-side state.
- completion_lock: A spinlock protecting CQ ring updates.
- submit_state: Per-submission batch state including the free_list of
  recycled io_kiocb request structures.
- flags: Setup flags from io_uring_params (IORING_SETUP_SQPOLL,
  IORING_SETUP_IOPOLL, etc.).
- refs: A percpu_ref for lifetime management. When it reaches zero,
  io_ring_ctx_ref_free() (line 184) signals completion via
  complete(&ctx->ref_comp).

The request structure is struct io_kiocb (defined in io_uring_types.h), which
tracks the state of a single in-flight operation. Requests are allocated from
a slab cache (req_cachep at line 124) and recycled through a per-ctx free
list for amortized allocation cost.

### Submission Path: io_uring_enter and io_submit_sqes

The primary submission entry point is the io_uring_enter system call at
line 2542: SYSCALL_DEFINE6(io_uring_enter). When to_submit is nonzero, it
calls io_submit_sqes() to process pending SQEs.

io_submit_sqes() at line 2008 is the core submission loop:

1. Reads the number of available entries from the SQ ring via
   __io_sqring_entries() (line 2018).
2. Takes the minimum of the requested count and available entries.
3. Calls io_get_task_refs() to batch task reference counting.
4. Loops over each entry:
   a. Allocates an io_kiocb via io_alloc_req() (line 2032).
   b. Reads the SQE via io_get_sqe() at line 1976, which indexes into
      ctx->sq_sqes using the cached SQ head, masked by (sq_entries - 1).
   c. Calls io_submit_sqe() to validate the SQE and dispatch the operation.

io_get_sqe() (line 1976) handles both the direct SQE array path (when
IORING_SETUP_NO_SQARRAY is set) and the indirect path through the SQ array.
The SQ array indirection exists for compatibility -- it lets the application
submit SQEs in any order without copying.

### Completion Path: CQE Posting

When an operation completes, the kernel must post a CQE to the completion
ring. The primary function is io_fill_cqe_req(), which writes the result into
the next CQ ring slot.

The CQE posting path:

1. Acquires ctx->completion_lock if not already held.
2. Loads the CQ tail, calculates the slot address.
3. Writes user_data, res, and flags into the CQE slot.
4. Advances the CQ tail with a store-release barrier.
5. If IORING_SETUP_DEFER_TASKRUN is set, completions are batched as
   task_work and delivered when the application enters the kernel.

The io_fill_cqe_aux() function at line 763 handles auxiliary CQEs for
operations that produce extra completion information (e.g., multishot
receives). If the CQ ring is full, events may be dropped unless
IORING_FEAT_NODROP was negotiated, in which case the kernel uses an overflow
list.

Completion batching is managed through IO_COMPL_BATCH (32 at line 113).
io_submit_flush_completions() processes batched completions, posting multiple
CQEs under a single lock acquisition for efficiency.

### SQPOLL: Kernel-Side Submission Polling

When IORING_SETUP_SQPOLL is set, the kernel creates a dedicated thread
(io_sq_thread in sqpoll.c) that polls the SQ ring for new submissions. The
application writes SQEs and updates the SQ tail without making any system
call. The kernel thread:

1. Spins checking the SQ tail for new entries.
2. When entries are found, calls io_submit_sqes() to process them.
3. If idle for too long, parks itself and sets IORING_SQ_NEED_WAKEUP in the
   shared flags. The application sees this flag and calls io_uring_enter()
   with IORING_ENTER_SQ_WAKEUP to restart the thread.

This mode achieves the theoretical minimum latency: zero system calls in the
fast path. The tradeoff is a dedicated kernel thread consuming CPU even when
idle.

### Request Lifecycle and Caching

Request allocation is a critical hot path. io_uring maintains a per-ctx
free list (ctx->submit_state.free_list) of recycled io_kiocb structures.
io_req_add_to_cache() at line 177 pushes completed requests onto this list,
and io_alloc_req() pops from it. Only when the cache is empty does the kernel
fall back to the slab allocator (req_cachep).

Additional per-operation caches exist for frequently used resources:
io_alloc_cache structures for poll requests (apoll_cache), network messages
(netmsg_cache), read/write state (rw_cache), and uring_cmd state (cmd_cache).
These are freed during context teardown by io_free_alloc_caches() (line 213).

When CONFIG_KASAN is enabled, io_poison_cached_req() (line 151) poisons
recycled request fields to detect use-after-free bugs.


## Code Walkthrough

Trace a complete read operation through io_uring:

1. **Setup: io_uring_setup()** -- io_uring/io_uring.c:3104:
   SYSCALL_DEFINE2(io_uring_setup) calls io_ring_ctx_alloc() to create the
   context, allocates the SQ/CQ rings and SQE array, and maps them into
   userspace via mmap. Returns a file descriptor for the io_uring instance.

2. **Application prepares an SQE** -- In userspace, the application writes
   a IORING_OP_READ SQE into the SQE array: sets the opcode, fd, buf addr,
   len, offset, and user_data. Then advances the SQ tail with a store-release.

3. **io_uring_enter() triggers submission** -- io_uring/io_uring.c:2542:
   The application calls io_uring_enter(fd, 1, 0, 0). The kernel calls
   io_submit_sqes(ctx, 1).

4. **io_submit_sqes processes the SQE** -- Line 2008:
   io_alloc_req() gets a request from the free list. io_get_sqe() reads the
   SQE at index ctx->cached_sq_head (line 1979). io_submit_sqe() decodes the
   opcode and dispatches to the read handler.

5. **Read completes** -- The VFS or block layer completes the read. The
   io_uring completion path calls io_fill_cqe_req() to post a CQE with the
   bytes-read count as res and the original user_data.

6. **Application reads the CQE** -- In userspace, the application reads the
   CQ tail with a load-acquire, finds the new CQE, reads res and user_data,
   and advances the CQ head.

7. **Request recycled** -- io_req_add_to_cache() (line 177) pushes the
   completed io_kiocb onto the free list via wq_stack_add_head(), ready for
   the next submission.


## Hands-On Challenges

### Challenge 1: Raw Ring Buffer Inspection (100 XP)

Write a C program using liburing that submits 10 IORING_OP_NOP operations and
collects their completions. After setup, use /proc/self/maps to find the SQ
and CQ ring mappings. Before and after each io_uring_enter call, read the raw
SQ head, SQ tail, CQ head, and CQ tail values from the shared rings structure.
Print a timeline showing how the head/tail pointers advance.

Verification: The SQ tail advances by 10 after submission. After
io_uring_enter, the SQ head catches up. The CQ tail advances by 10 as
completions are posted. Document the memory barrier pairs observed.

### Challenge 2: SQPOLL Latency Benchmark (100 XP)

Write a benchmark comparing three modes: (a) normal io_uring_enter per
submission, (b) batched submission of 32 SQEs per enter call, (c) SQPOLL mode
with no enter calls. Use IORING_OP_NOP to isolate the submission overhead.
Measure operations per second and per-operation latency for each mode over
1 million operations.

Verification: SQPOLL should show the lowest per-op latency. Batched mode
should show the highest throughput. Document the system call count for each
mode using strace -c.

### Challenge 3: Linked Request Chain (100 XP)

Create a chain of three linked io_uring operations: (1) IORING_OP_OPENAT to
open a file, (2) IORING_OP_READ to read its contents using IOSQE_IO_LINK and
a fixed buffer, (3) IORING_OP_CLOSE to close the fd. Submit all three as a
single linked chain. Verify that they execute in order and that failure of any
operation cancels subsequent ones.

Verification: All three CQEs are received with correct user_data values. If
the file does not exist, only the OPENAT CQE shows an error; the READ and
CLOSE CQEs show -ECANCELED. Trace the IO_REQ_LINK_FLAGS handling in the
kernel source.


## Verification Criteria

- [ ] Can draw the SQ ring, SQE array, and CQ ring layout and explain the
      head/tail pointer protocol with memory barriers.
- [ ] Can trace io_uring_enter -> io_submit_sqes -> io_get_sqe -> io_submit_sqe
      through the kernel source.
- [ ] Can explain how io_fill_cqe_req posts a completion and how the CQ tail
      advance is made visible to userspace.
- [ ] Can describe the io_ring_ctx structure and its key fields: sq_entries,
      rings, uring_lock, completion_lock, submit_state.
- [ ] Can explain SQPOLL mode and the IORING_SQ_NEED_WAKEUP protocol.
- [ ] Can describe the request caching mechanism and why io_poison_cached_req
      exists under KASAN.
- [ ] Can implement a basic io_uring program using liburing that submits and
      reaps at least 3 different operation types.
