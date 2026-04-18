---
name: page-cache-and-readahead
description: Master the page cache and readahead mechanisms that accelerate filesystem I/O
realm: filesystem
category: caching
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - vfs-layer
unlocks: []
kernel_files:
  - mm/filemap.c
  - mm/readahead.c
  - include/linux/pagemap.h
doc_files:
  - Documentation/filesystems/vfs.rst
  - Documentation/admin-guide/mm/concepts.rst
badge: Cache Curator
tags:
  - page-cache
  - readahead
  - filemap
---

# Page Cache and Readahead

## Quest Briefing

Every time a process reads a file, the kernel faces a decision: fetch data from
slow persistent storage, or serve it from fast RAM? The page cache is the kernel's
answer -- a dynamic, memory-mapped buffer that keeps recently accessed file data
in physical memory. Without it, every read() would hit disk, and modern systems
would grind to a halt.

Readahead takes this further. Instead of waiting for applications to request data
page by page, the kernel predicts sequential access patterns and prefetches pages
before they are needed. The readahead algorithm adapts its window size based on
observed access patterns, doubling the prefetch window when it detects sequential
reads and falling back for random access. Together, the page cache and readahead
form the foundation of filesystem performance -- understanding them is essential
for anyone tuning I/O workloads or building filesystem drivers.

## Learning Objectives

- Explain how the page cache maps file pages to physical memory via address_space
- Trace a read() call from generic_file_read_iter through filemap_read to disk I/O
- Describe the readahead state machine and how it adapts window sizes
- Distinguish between synchronous readahead and asynchronous readahead triggers
- Understand page cache invalidation, writeback, and the folio abstraction

## Core Concepts

### The Page Cache and address_space

The page cache stores file contents as folios (groups of contiguous pages) indexed
by file offset. Each open file's inode has an associated struct address_space
(defined in include/linux/pagemap.h) that acts as the radix tree mapping file
offsets to cached folios. Key operations include:

- filemap_add_folio() in mm/filemap.c inserts a new folio into the page cache
- page_cache_delete() removes a folio during truncation or reclaim
- filemap_get_pages() looks up folios for a given range, triggering readahead
  if needed
- filemap_check_errors() checks for I/O errors on the mapping

The page cache is the "master" of I/O for regular files. When a filesystem
implements ->read_folio() and ->readahead() in its address_space_operations,
the VFS generic path handles all the caching logic automatically.

### The Read Path: filemap_read

When userspace calls read() on a regular file, the typical call chain is:

1. generic_file_read_iter() in mm/filemap.c -- the VFS entry point
2. filemap_read() -- the main loop that iterates over the requested range
3. filemap_get_pages() -- looks up folios in the page cache
4. filemap_readahead() -- triggers async readahead if the readahead flag is set
5. filemap_read_folio() -- calls the filesystem's ->read_folio() for cache misses

The filemap_read() function at line 2768 of mm/filemap.c is the core loop. It
calls filemap_get_pages() to fetch a batch of folios, copies data to userspace
via copy_folio_to_iter(), and advances the file position. If a folio is not yet
in the cache, filemap_get_pages() will allocate it, add it to the page cache,
and submit I/O.

### Readahead: Predicting Sequential Access

The readahead subsystem in mm/readahead.c decides how many pages to prefetch.
The state is tracked in struct file_ra_state (per-file), which records:

- start -- where the current readahead window begins
- size -- total readahead window size
- async_size -- the async portion that triggers the next readahead

Key functions in the readahead pipeline:

- page_cache_sync_ra() -- called on a cache miss; initiates synchronous readahead
- page_cache_async_ra() -- called when hitting a folio with the readahead flag
- do_page_cache_ra() -- calculates window parameters and calls into the filesystem
- page_cache_ra_unbounded() -- the core readahead implementation that allocates
  folios and calls ->readahead()
- page_cache_ra_order() -- handles large-folio readahead for filesystems that
  support it
- read_pages() -- dispatches to the filesystem's ->readahead() or falls back
  to ->read_folio() for individual pages

The readahead window starts small (typically 4 pages) and doubles on each
sequential trigger, up to a maximum set by vm.max_readahead_kb (default 128 KB).
The readahead_expand() function can extend the window beyond the initial request
when the filesystem detects favorable conditions.

### Writeback and Cache Coherence

The page cache is not read-only. When a process writes to a file, the modified
folio is marked dirty. The kernel's writeback mechanisms flush dirty pages to disk:

- filemap_fdatawrite() -- initiates writeback for all dirty pages in a mapping
- filemap_fdatawait_range() -- waits for writeback to complete
- filemap_write_and_wait_range() -- combines both for fsync() operations
- filemap_flush() -- triggers background writeback without waiting

The replace_page_cache_folio() function handles replacing a folio in-place,
used during migration and compaction. The delete_from_page_cache_batch() function
efficiently removes multiple folios during truncation.

## Code Walkthrough

Trace a simple sequential read through the page cache:

1. Userspace calls read(fd, buf, 4096) on a regular file
2. The VFS dispatches to generic_file_read_iter() in mm/filemap.c
3. For buffered I/O, it calls filemap_read() which enters the main loop
4. filemap_get_pages() searches the page cache for the target offset
5. Cache miss: allocates a folio, calls page_cache_sync_ra() in mm/readahead.c
6. page_cache_sync_ra() calculates the readahead window (start at 4 pages)
7. do_page_cache_ra() calls page_cache_ra_unbounded() which:
   - Allocates folios for the entire readahead window
   - Adds them to the page cache via filemap_add_folio()
   - Calls read_pages() which invokes the filesystem's ->readahead()
   - Sets the readahead flag on the first folio of the async section
8. Back in filemap_read(), the data is copied to userspace
9. On the next read, if it hits the readahead-flagged folio,
   filemap_readahead() triggers page_cache_async_ra() with a doubled window
10. The readahead window grows: 4 -> 8 -> 16 -> 32 pages, up to the max

## Hands-On Challenges

### Challenge 1: Trace a Cache Hit vs. Miss (50 XP)

Use ftrace to trace filemap_get_pages and filemap_read_folio while reading
a file. First read should show cache misses; second read should show only cache
hits. Use /sys/kernel/debug/tracing/ to enable function tracing.

### Challenge 2: Observe Readahead Growth (75 XP)

Write a program that reads a large file sequentially in 4KB chunks. Use
/proc/vmstat to monitor pgpgin and ra counters, or trace page_cache_sync_ra
and page_cache_async_ra to observe the readahead window doubling on each
sequential trigger.

### Challenge 3: Defeat Readahead with Random I/O (75 XP)

Write a program that reads random offsets from a large file using pread().
Compare vmstat readahead counters with the sequential case. Then use
posix_fadvise(fd, 0, 0, POSIX_FADV_RANDOM) and observe how it disables
readahead entirely by setting ra_pages to zero.

## Verification Criteria

- [ ] Can explain the role of struct address_space and its xarray index
- [ ] Can trace the call chain from read() through filemap_read to disk I/O
- [ ] Can describe how file_ra_state tracks readahead window progression
- [ ] Can distinguish sync readahead (cache miss) from async readahead (flag trigger)
- [ ] Can explain when and why readahead is disabled (random I/O, O_DIRECT)
- [ ] Can use /proc/vmstat or ftrace to observe page cache and readahead behavior
- [ ] Can explain the folio abstraction and why it replaced raw pages in the cache
