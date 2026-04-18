---
name: block-device-layer
description: Understand the block I/O subsystem from bio submission through multi-queue dispatch
realm: devices
category: block
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - interrupt-handling
unlocks: []
kernel_files:
  - block/blk-core.c
  - block/blk-mq.c
  - block/bio.c
  - include/linux/blk-mq.h
doc_files:
  - Documentation/block/blk-mq.rst
badge: Block Commander
tags:
  - block
  - bio
  - blk-mq
  - io-scheduler
---

# Block Device Layer

Every time you read a file, swap a page, or write to a database, the block layer
orchestrates the journey from a high-level I/O request down to the physical
storage device. The modern Linux block layer is built around the multi-queue
(blk-mq) architecture, which maps software queues to hardware submission queues
for maximum parallelism on modern NVMe and multi-queue SCSI devices.

Understanding the block layer is essential for anyone who wants to write storage
drivers, tune I/O performance, or debug disk latency issues. The bio and request
structures are the fundamental currency of block I/O, and following their
lifecycle reveals how Linux transforms abstract reads and writes into physical
device operations.

## Quest Briefing

The block layer sits between filesystems and storage hardware. When a filesystem
needs to read or write data, it constructs a bio (block I/O) descriptor and
submits it to the block layer. The block layer then merges, schedules, and
dispatches these requests to the hardware through multi-queue paths designed for
modern high-IOPS devices.

## Learning Objectives

After completing this skill, you will be able to:

- Describe the lifecycle of a block I/O request from submission to completion
- Explain the role of struct bio and struct request in the block layer
- Trace code through the blk-mq multi-queue dispatch path
- Understand how software queues map to hardware dispatch queues
- Read and interpret block layer tracepoints for performance analysis

## Core Concepts

### The bio Structure

A bio (block/bio.c) is the fundamental unit of block I/O. It describes a
contiguous range of sectors on a block device using a scatter-gather list of
memory pages (bio_vec entries).

Key fields in struct bio (include/linux/blk_types.h):
- bi_opf: operation type (REQ_OP_READ, REQ_OP_WRITE) and flags
- bi_iter: tracks the current sector, size, and progress through the bio
- bi_io_vec: array of bio_vec entries (page, offset, length)
- bi_end_io: completion callback invoked when I/O finishes

Bio allocation uses a slab cache with per-CPU caching for performance. The
bio_alloc_bioset() function in block/bio.c handles allocation from a bio_set,
while bio_alloc_percpu_cache() serves the fast path. The biovec_slab array
provides slabs for different bio_vec counts (16, 64, 128, and BIO_MAX_VECS).

### Submitting I/O: The submit_bio Path

When the filesystem or page cache issues I/O, it calls submit_bio_noacct()
(block/blk-core.c). This function:

1. Validates the bio (checks read-only, end-of-device via bio_check_eod)
2. Remaps partition-relative sectors to whole-disk sectors (blk_partition_remap)
3. Calls __submit_bio() which dispatches to either blk_mq_submit_bio() for
   multi-queue devices or the device's fops->submit_bio for stacked devices

The __submit_bio_noacct() function handles recursion by maintaining a per-task
bio_list. Only one __submit_bio() runs at a time per task; new bios are queued
and processed iteratively to prevent deep stack recursion.

### Multi-Queue Architecture (blk-mq)

The blk-mq framework (block/blk-mq.c) replaced the legacy single-queue
elevator model. It introduces two queue levels:

**Software staging queues (ctx)**: Per-CPU queues where bios are merged and
coalesced into requests. Each CPU submits to its own queue without contention.

**Hardware dispatch queues (hctx)**: Map to actual hardware submission queues.
A blk_mq_hw_ctx represents one hardware queue. The driver provides a
blk_mq_ops structure with a queue_rq callback to submit requests to hardware.

Key functions in the dispatch path:
- blk_mq_submit_bio(): entry point for multi-queue submission
- blk_mq_insert_request(): places a request into the software queue
- blk_mq_hctx_has_pending(): checks if a hardware context has queued work
- blk_mq_hctx_mark_pending() / blk_mq_hctx_clear_pending(): manage the
  per-hctx bitmap tracking which software queues have pending requests

### Request Queues and Lifecycle

A struct request_queue is allocated via blk_alloc_queue() (block/blk-core.c),
which sets up the queue limits, allocates the IDA identifier, initializes
timers for request timeouts (blk_rq_timed_out_timer), and creates the
debugfs entries.

Queue lifecycle management:
- blk_get_queue() / blk_put_queue(): reference counting
- blk_queue_enter() / blk_queue_exit(): track active I/O for freeze/drain
- blk_freeze_queue_start() / blk_mq_unfreeze_queue(): quiesce all I/O
- blk_mq_quiesce_queue(): wait for in-flight dispatch to complete

The kblockd_workqueue handles asynchronous block layer work items.

## Code Walkthrough

### Tracing a Read Request

1. Filesystem calls submit_bio_noacct() with a REQ_OP_READ bio
2. __submit_bio_noacct() adds to bio_list for iterative processing
3. __submit_bio() calls blk_mq_submit_bio() for blk-mq devices
4. blk-mq merges the bio into an existing request or allocates a new one
5. The request is inserted into the per-CPU software queue
6. blk_mq_try_issue_list_directly() attempts direct dispatch to hardware
7. The driver's queue_rq callback programs the hardware (e.g., NVMe doorbell)
8. Hardware completes the I/O and raises an interrupt
9. blk_mq_complete_request() triggers the completion path
10. The bio's bi_end_io callback notifies the original submitter

### Examining Queue Freeze

Queue freezing prevents new I/O submission while draining in-flight requests.
This is critical for partition changes, queue reconfiguration, or device removal.

1. blk_freeze_queue_start() increments the freeze depth via percpu_ref_kill
2. blk_mq_freeze_queue_wait() blocks until all in-flight requests complete
3. The queue is now quiesced; modifications are safe
4. blk_mq_unfreeze_queue() restores the percpu_ref and wakes blocked submitters

## Hands-On Challenges

### Challenge 1: Bio Anatomy (XP: 60)

Read the definition of struct bio in include/linux/blk_types.h. Draw a diagram
showing how bi_io_vec points to an array of bio_vec entries, each referencing
a page. Then trace bio_alloc_bioset() in block/bio.c and explain:
- How the inline bio_vec optimization works for small I/Os
- When the biovec slab allocator is used
- How the bio_alloc_cache provides per-CPU fast-path allocation

### Challenge 2: Trace blk-mq Dispatch (XP: 70)

Enable block layer tracepoints and submit a 4KB read:
```
echo 1 > /sys/kernel/debug/tracing/events/block/enable
dd if=/dev/sda of=/dev/null bs=4k count=1 iflag=direct
cat /sys/kernel/debug/tracing/trace
```
Identify the block_bio_queue, block_rq_insert, block_rq_issue, and
block_rq_complete events. Calculate the latency from queue to complete.

### Challenge 3: Queue Internals (XP: 70)

Write a kernel module that:
- Opens a block device with blkdev_get_by_path()
- Prints the number of hardware queues (nr_hw_queues from the tag_set)
- For each hardware queue, prints the CPU mapping
- Releases the device on module unload
Explain how the CPU-to-hctx mapping affects I/O parallelism.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Describe the structure of a bio and its bio_vec scatter-gather list
- [ ] Trace the submit_bio path from filesystem through blk-mq to hardware
- [ ] Explain the two-level queue architecture (software ctx, hardware hctx)
- [ ] Use block tracepoints to measure I/O latency at each stage
- [ ] Explain queue freezing and when it is needed
- [ ] Identify the blk_mq_ops callbacks a block driver must implement
- [ ] Describe how request merging reduces the number of hardware operations
