---
name: pipe-and-fifo
description: Learn how pipes and FIFOs enable inter-process communication through the kernel
realm: filesystem
category: ipc
difficulty: beginner
xp: 150
estimated_minutes: 75
prerequisites:
  - vfs-layer
unlocks: []
kernel_files:
  - fs/pipe.c
  - fs/splice.c
  - include/linux/pipe_fs_i.h
doc_files:
  - Documentation/filesystems/fifo.rst
badge: Pipe Plumber
tags:
  - pipe
  - fifo
  - splice
---

# Pipes and FIFOs

## Quest Briefing

Pipes are the oldest and simplest form of inter-process communication in Unix.
When you run "ls | grep foo" in a shell, a pipe connects the stdout of ls to
the stdin of grep, allowing data to flow between processes without touching
the filesystem. FIFOs (named pipes) extend this concept by giving pipes a
name in the filesystem, allowing unrelated processes to communicate.

Despite their apparent simplicity, the kernel's pipe implementation involves
a circular buffer of pages, careful synchronization between readers and
writers, and integration with the VFS layer through a dedicated pipefs
pseudo-filesystem. The splice system call takes pipes further, enabling
zero-copy data transfer between pipes and file descriptors by moving page
references instead of copying data.

Understanding pipes teaches fundamental kernel concepts: ring buffers,
wait queues, file operations, and the boundary between user and kernel
space. They are also the building blocks for shell scripting, job servers
(like GNU make's jobserver protocol), and high-performance data pipelines.

## Learning Objectives

- Describe the pipe ring buffer structure and how head/tail indices work
- Trace the data flow through anon_pipe_write() and anon_pipe_read()
- Explain how pipes integrate with the VFS through pipefs
- Understand FIFO open semantics and the partner wakeup protocol
- Describe the splice mechanism for zero-copy pipe I/O

## Core Concepts

### The Pipe Ring Buffer

A pipe is backed by struct pipe_inode_info (defined in include/linux/pipe_fs_i.h)
which contains a circular ring of struct pipe_buffer entries. Each pipe_buffer
holds a reference to a page, an offset within that page, and a length. In
fs/pipe.c:

- PIPE_DEF_BUFFERS defines the default ring size (typically 16 buffers)
- PIPE_MIN_DEF_BUFFERS at line 49 is the minimum (2 buffers) for quota-limited users
- pipe_max_size at line 55 is the max non-root pipe size (default 1 MB)
- pipe_user_pages_soft at line 61 tracks per-user soft quota

The ring uses head and tail indices that wrap naturally without masking (as
noted by David Howells in the source comments at line 65). The actual buffer
slot is obtained by masking: pipe->bufs[head & (pipe->ring_size - 1)]. The
ring size must be a power of two.

### Reading and Writing Pipes

The core I/O functions in fs/pipe.c:

anon_pipe_write() at line 431:
1. Checks if there are readers (otherwise returns EPIPE/SIGPIPE)
2. Tries to merge data into the last buffer if there is space
3. If the last buffer is full, allocates a new page for the next slot
4. Copies data from userspace via copy_page_from_iter()
5. Advances the head index and wakes up waiting readers
6. If the ring is full, sleeps on pipe->wr_wait until space is available

anon_pipe_read() at line 269:
1. Checks if the pipe is readable via pipe_readable() at line 230
2. Iterates over buffers from tail to head
3. Copies data to userspace via copy_page_to_iter()
4. When a buffer is fully consumed, calls buf->ops->release() to free it
5. Advances the tail index and wakes up waiting writers
6. If no data is available, sleeps on pipe->rd_wait

FIFO variants fifo_pipe_read() at line 407 and fifo_pipe_write() at line 604
wrap the anonymous pipe functions with additional FIFO-specific behavior.

### Pipe Lifecycle and pipefs

Pipes live on a pseudo-filesystem called pipefs:

- pipefs_init_fs_context() at line 1466 initializes the filesystem context
- create_pipe_files() at line 926 creates the read and write file descriptors
- free_pipe_info() at line 841 tears down a pipe when all references are gone
- do_pipe2() at line 1032 implements the pipe2() system call

The pipe() system call allocates a pipe_inode_info, creates two file structs
(one for reading, one for writing), and returns two file descriptors. The pipe
exists purely in memory -- it has an inode on pipefs but no persistent storage.

pipe_resize_ring() at line 1291 handles F_SETPIPE_SZ to change the ring size.
pipe_set_size() at line 1363 validates the request against per-user quotas
checked by too_many_pipe_buffers_hard() and too_many_pipe_buffers_soft().

### FIFOs: Named Pipes

FIFOs are created with mkfifo() or mknod() and exist as filesystem entries. <!-- safe: mkfifo is the POSIX API name referenced in kernel documentation -->
The fifo_open() function at line 1121 handles the complex open semantics:

- A reader opening a FIFO blocks until a writer opens it (and vice versa)
- wait_for_partner() at line 1099 implements this blocking coordination
- wake_up_partner() at line 1116 signals the other side
- O_NONBLOCK changes this behavior: readers succeed immediately, writers
  get ENXIO if no reader exists

### Splice: Zero-Copy Pipe I/O

The splice system call in fs/splice.c moves data between a pipe and a file
descriptor without copying through userspace:

- splice_to_pipe() at line 197 moves data from a source into a pipe
- splice_from_pipe() at line 628 moves data from a pipe to a destination
- copy_splice_read() at line 318 handles the generic splice-read path
- splice_to_socket() at line 795 sends pipe data directly to a socket
- add_to_pipe() at line 245 adds a single buffer to a pipe

Splice works by transferring page references rather than copying data. The
pipe_buffer's ops (try_steal, release, get) manage the page lifecycle. The
generic_pipe_buf_try_steal() function at line 174 attempts to take ownership
of a page from the page cache for zero-copy transfer.

## Code Walkthrough

Trace "echo hello | cat" through the kernel:

1. The shell calls pipe2() which enters do_pipe2() at line 1032
2. do_pipe2() calls create_pipe_files() which allocates pipe_inode_info
3. The shell forks twice: echo gets the write fd, cat gets the read fd
4. echo writes "hello\n": anon_pipe_write() allocates a page, copies 6 bytes
5. The write advances pipe->head and calls wake_up_interruptible() on rd_wait
6. cat's read unblocks: anon_pipe_read() copies data from the pipe buffer
7. After copying, the buffer is released and pipe->tail advances
8. echo exits, closing the write fd. The pipe's writer count drops to zero
9. cat's next read returns 0 (EOF) because pipe_readable() detects no writers
10. cat exits, the last fd closes, and free_pipe_info() reclaims the pipe

## Hands-On Challenges

### Challenge 1: Measure Pipe Throughput (50 XP)

Write a program that creates a pipe and transfers 1 GB between two threads.
Measure throughput in MB/s. Then compare with different pipe buffer sizes
using fcntl(F_SETPIPE_SZ). Observe how the default 64KB pipe (16 x 4KB
buffers) compares to a 1MB pipe.

### Challenge 2: Observe Pipe Blocking Behavior (50 XP)

Write a program where a writer fills a pipe completely without any reader.
Use strace to observe the write() call blocking. Then use fcntl(F_GETPIPE_SZ)
to check the pipe capacity, and verify the writer unblocks once a reader
consumes some data.

### Challenge 3: Zero-Copy Splice Transfer (50 XP)

Write a program that uses splice() to transfer a file to a socket via a pipe
without any userspace copies. Compare the performance (using perf stat to count
page faults and cache misses) against a traditional read()+write() loop.
Verify with ftrace that splice_to_socket() is called.

## Verification Criteria

- [ ] Can describe the pipe ring buffer and how head/tail indices work
- [ ] Can trace data flow through anon_pipe_write and anon_pipe_read
- [ ] Can explain the FIFO open protocol and wait_for_partner synchronization
- [ ] Can describe how pipe2() creates a pipe through the pipefs pseudo-filesystem
- [ ] Can explain splice zero-copy semantics and page reference transfers
- [ ] Can use strace and /proc/pid/fdinfo to inspect pipe state
- [ ] Can explain pipe capacity limits and the F_SETPIPE_SZ mechanism
