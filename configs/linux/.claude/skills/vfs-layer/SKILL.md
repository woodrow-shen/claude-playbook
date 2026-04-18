---
name: vfs-layer
description: Understand the Virtual Filesystem Switch that abstracts all filesystem operations
realm: filesystem
category: vfs
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - process-lifecycle
unlocks:
  - socket-layer
  - lsm-framework
  - character-devices
  - page-cache-and-readahead
  - ext4-internals
  - dcache-and-inode-cache
  - pipe-and-fifo
  - epoll-internals
kernel_files:
  - fs/namei.c
  - fs/inode.c
  - fs/super.c
  - fs/open.c
  - include/linux/fs.h
  - include/linux/dcache.h
doc_files:
  - Documentation/filesystems/vfs.rst
  - Documentation/filesystems/path-lookup.rst
badge: Pathfinder
tags:
  - vfs
  - filesystems
  - namei
  - dentry
  - inode
---

# VFS Layer

The VFS (Virtual Filesystem Switch) is the kernel's answer to a fundamental
problem: how do you support dozens of different filesystem implementations
behind a single unified API? Every open(), read(), write(), and stat() call
goes through VFS, which dispatches to the correct filesystem driver.

## Learning Objectives

After completing this skill, you will be able to:

- Describe the VFS object model: superblock, inode, dentry, file
- Trace an open() call from syscall through path lookup to filesystem
- Explain the dentry cache and its role in path lookup performance
- Distinguish between RCU-walk and ref-walk path lookup modes
- Navigate the key VFS source files

## Core Concepts

### The Four VFS Objects

VFS defines four fundamental objects, all in include/linux/fs.h:

**struct super_block**: represents a mounted filesystem instance.
- s_type: the filesystem type (ext4, tmpfs, etc.)
- s_op: superblock operations (alloc_inode, destroy_inode, sync_fs)
- s_root: the root dentry of this filesystem

**struct inode**: represents a file on disk (metadata, not data).
- i_mode: file type and permissions
- i_op: inode operations (lookup, create, link, unlink, mkdir)
- i_fop: default file operations for this inode type
- i_mapping: the address_space for page cache

**struct dentry**: a directory entry (name-to-inode binding).
- d_name: the filename component
- d_inode: pointer to the inode
- d_parent: parent dentry
- d_subdirs: children list

Dentries form a tree mirroring the directory hierarchy and are cached in the
dentry cache (dcache) for fast path lookup.

**struct file**: an open file (a process's view of a file).
- f_path: the dentry and mount point
- f_op: file operations (read, write, llseek, mmap, ioctl)
- f_pos: current file position

### Relationship

```
Process -> fd table -> struct file -> struct dentry -> struct inode
                                          |
                                   struct super_block
```

Multiple processes can have different struct file objects pointing to the same
dentry/inode. Each file tracks its own position (f_pos).

### Path Lookup (fs/namei.c)

Path lookup resolves a pathname string ("/home/user/file.txt") to a dentry.
Implemented in fs/namei.c (originally by Linus Torvalds 1991, rewritten in
1997 and 2000).

The core function is path_openat() which calls link_path_walk() to process
path components one by one:

1. Start from root dentry (/) or cwd (relative path)
2. For each component ("home", "user", "file.txt"):
   a. Look up in the parent's dentry cache
   b. If not cached, call filesystem's lookup() inode operation
   c. Follow mount points and symlinks as needed
   d. Check permissions at each step

### RCU-walk vs ref-walk

Path lookup has two modes (optimization since Linux 2.6.38):

**RCU-walk**: the fast path. Walks without reference counts or locks. Uses
RCU to safely read dentries. Falls back to ref-walk if anything complex
happens (mount traversal, symlinks, deleted dentries).

**ref-walk**: the safe fallback. Takes reference counts and locks. Handles
all cases correctly but is slower.

Most lookups succeed entirely in RCU-walk mode.

### The Dentry Cache (dcache)

The dcache (include/linux/dcache.h) caches directory lookup results. Benefits:
- Avoids disk I/O for repeated path lookups
- Negative dentries cache "file not found" results
- Dentries hashed by (parent, name) for O(1) lookup

## Code Walkthrough

### Exercise 1: Trace open("/etc/passwd", O_RDONLY)

1. sys_openat2 (fs/open.c) calls do_filp_open()
2. do_filp_open() creates nameidata, calls path_openat()
3. path_openat() calls link_path_walk() with "etc/passwd"
4. link_path_walk() processes "etc": dcache lookup in root's children
5. Then "passwd": dcache lookup in /etc's children
6. do_open() allocates struct file, connects to dentry/inode
7. File installed in process's fd table, fd returned to userspace

### Exercise 2: Filesystem Registration

1. Find register_filesystem() in fs/filesystems.c
2. Each filesystem calls this during init (e.g., ext4_init_fs)
3. It registers a struct file_system_type with a mount callback
4. On mount, the filesystem creates super_block and root inode
5. Find ext4 inode_operations in fs/ext4/namei.c

### Exercise 3: The Dentry Cache

1. In include/linux/dcache.h, find struct dentry
2. Find d_lookup() in fs/dcache.c -- hash table lookup
3. Note the hash function: parent pointer + name hash
4. Check /proc/sys/fs/dentry-state for dcache statistics

## Hands-On Challenges

### Challenge 1: VFS Object Map (XP: 60)

For a single open + read + close operation, trace which VFS objects are
created, used, and destroyed. Draw the relationships between super_block,
inode, dentry, and file at each stage.

### Challenge 2: Filesystem Operations Comparison (XP: 70)

Compare inode_operations for ext4 (fs/ext4/namei.c) and tmpfs (mm/shmem.c).
List which operations each implements. What does tmpfs skip and why?

### Challenge 3: Dcache Performance (XP: 70)

Read /proc/sys/fs/dentry-state. Run a workload that creates and accesses many
files. Compare values before and after. Calculate the dcache hit rate.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Draw the VFS object hierarchy (super_block -> inode -> dentry -> file)
- [ ] Trace open() from syscall through VFS to filesystem's lookup operation
- [ ] Explain RCU-walk and why it makes path lookup fast
- [ ] Describe the dentry cache and negative dentries
- [ ] Identify file_operations for a specific filesystem from source
