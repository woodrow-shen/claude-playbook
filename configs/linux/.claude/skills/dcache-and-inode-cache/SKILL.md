---
name: dcache-and-inode-cache
description: Understand the dentry cache and inode cache that accelerate path lookup and metadata access
realm: filesystem
category: caching
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - vfs-layer
unlocks: []
kernel_files:
  - fs/dcache.c
  - fs/inode.c
  - include/linux/dcache.h
doc_files:
  - Documentation/filesystems/vfs.rst
  - Documentation/filesystems/path-lookup.rst
badge: Dentry Keeper
tags:
  - dcache
  - inode-cache
  - dentry
---

# Dentry Cache and Inode Cache

## Quest Briefing

Every time a process opens a file, the kernel must resolve a path like
/home/user/document.txt into an inode. Without caching, this would require
reading directory entries from disk for each path component -- an operation
that would make even simple shell commands painfully slow. The dentry cache
(dcache) and inode cache are the kernel's solution to this problem.

The dcache is one of the most performance-critical data structures in the
entire kernel. It caches the mapping from (parent directory, name) to inode,
allowing path lookup to skip disk I/O entirely for frequently accessed paths.
The inode cache complements it by keeping recently used inodes in memory with
their metadata (permissions, size, timestamps) ready for instant access.

Together, these caches transform what would be O(path_depth * disk_latency)
operations into O(path_depth * hash_lookup) operations in RAM. Understanding
their design -- the hash tables, the LRU lists, the RCU-protected lockless
lookups -- is essential for anyone working on filesystem performance or
implementing a new filesystem driver.

## Learning Objectives

- Describe the dentry structure and how it connects names to inodes
- Explain the dcache hash table and its role in O(1) name lookup
- Trace a path lookup through the dcache from d_lookup to dentry resolution
- Understand dentry lifecycle: allocation, hashing, LRU management, and pruning
- Explain inode cache organization, allocation via slab, and reclaim under pressure

## Core Concepts

### The Dentry Structure

A struct dentry (defined in include/linux/dcache.h) represents one component
of a path. Key fields:

- d_name -- the name of this path component (struct qstr)
- d_inode -- pointer to the associated inode (NULL for negative dentries)
- d_parent -- pointer to the parent directory's dentry
- d_flags -- state flags (DCACHE_REFERENCED, DCACHE_LRU_LIST, etc.)
- d_lockref -- combined lock and reference count for efficient atomic operations

The dcache has a global hash table for fast lookup. In fs/dcache.c:

- __dentry_cache at line 89 -- the slab cache for allocating dentries
- rename_lock at line 85 -- global seqlock protecting rename operations
- sysctl_vfs_cache_pressure at line 76 -- tunable controlling reclaim aggressiveness
- vfs_pressure_ratio() at line 79 -- scales reclaim based on cache_pressure

Negative dentries (where d_inode is NULL) cache lookup failures. This prevents
repeated disk lookups for files that do not exist, which is common during PATH
searches and library loading.

### Dentry Operations and Lifecycle

The dentry lifecycle involves several key functions in fs/dcache.c:

- dentry_free() at line 429 -- frees a dentry via RCU callback
- dentry_unlink_inode() at line 450 -- detaches a dentry from its inode
- d_drop() at line 600 -- unhashes a dentry from the hash table
- dput() at line 918 -- decrements reference count; may trigger reclaim
- d_lru_add() at line 490 -- adds unreferenced dentries to the LRU list
- d_lru_del() at line 501 -- removes a dentry from the LRU list
- d_make_discardable() at line 932 -- marks a dentry eligible for reclaim
- d_prune_aliases() at line 1130 -- prunes all aliases of an inode
- shrink_dentry_list() at line 1155 -- reclaims a list of unused dentries
- prune_dcache_sb() at line 1249 -- per-superblock dcache shrinker

The locking hierarchy documented at the top of fs/dcache.c is critical:
dentry->d_inode->i_lock -> dentry->d_lock -> s_dentry_lru_lock -> hash
bucket lock. Violating this ordering leads to deadlocks.

### The Inode Cache

The inode cache in fs/inode.c keeps VFS inodes in memory. Key functions:

- inode_init_always_gfp() at line 228 -- initializes a newly allocated inode
- __destroy_inode() at line 368 -- tears down inode state
- ihold() at line 528 -- increments the inode reference count
- inode_sb_list_add() at line 654 -- adds an inode to the superblock list
- __insert_inode_hash() at line 693 -- inserts into the global hash table
- __remove_inode_hash() at line 711 -- removes from the hash table
- inode_lru_list_add() at line 593 -- adds unreferenced inodes to LRU
- inode_lru_list_del() at line 598 -- removes from LRU
- address_space_init_once() at line 492 -- initializes the page cache mapping

The get_nr_inodes() and get_nr_dirty_inodes() functions at lines 82 and 100
provide the statistics visible in /proc/sys/fs/inode-nr.

### Cache Reclaim Under Memory Pressure

When memory is scarce, the kernel reclaims cached dentries and inodes via the
shrinker interface. The vfs_cache_pressure sysctl (default 100) controls how
aggressively the kernel reclaims VFS caches relative to page cache pages:

- vfs_cache_pressure = 0 -- never reclaim dentries/inodes (risky)
- vfs_cache_pressure = 100 -- fair balance with page cache
- vfs_cache_pressure = 200 -- aggressively reclaim VFS caches

The dcache is the "master of the icache" as noted in the source comments:
whenever a dcache entry exists, its inode will always exist. Dentries are
reclaimed via d_lru_isolate() at line 534 and d_lru_shrink_move() at line 544,
which isolate candidates from the LRU for batch freeing.

## Code Walkthrough

Trace a path lookup for /tmp/test.txt through the dcache:

1. filename_lookup() in fs/namei.c begins path resolution
2. For each component, lookup_fast() calls __d_lookup_rcu() for lockless
   RCU-walk lookup in the dcache hash table
3. The hash is computed from (parent dentry, name) using full_name_hash()
4. The hash bucket is searched for a matching dentry with the same parent
5. If found (cache hit): the dentry's d_inode is used directly -- no disk I/O
6. If not found (cache miss): falls back to lookup_slow() which calls the
   filesystem's ->lookup() method to read the directory from disk
7. The filesystem creates a new dentry via d_alloc() and connects it to the
   inode via d_splice_alias()
8. The new dentry is inserted into the hash table for future lookups
9. When the file is closed and reference count drops to zero, dput() places
   it on the LRU list rather than freeing it
10. The dentry remains cached until memory pressure triggers prune_dcache_sb()

## Hands-On Challenges

### Challenge 1: Measure dcache Hit Rate (75 XP)

Use /proc/sys/fs/dentry-state to read dcache statistics. Write a script
that repeatedly accesses the same file paths and observe how the numbers
change. Compare the dentry count before and after running
"echo 2 > /proc/sys/vm/drop_caches" to force dcache reclaim.

### Challenge 2: Observe Negative Dentry Caching (50 XP)

Use ftrace to trace d_lookup and d_alloc. Run "stat /nonexistent/path"
twice. On the first call, observe the filesystem lookup. On the second call,
observe that the negative dentry is found in the cache, avoiding disk I/O.
Verify with /proc/sys/fs/dentry-state.

### Challenge 3: Tune vfs_cache_pressure (75 XP)

Set up a memory-constrained environment (cgroup with limited memory). Run a
workload that accesses many unique file paths. Measure path lookup latency
(using perf stat on d_lookup) with vfs_cache_pressure set to 50, 100,
and 500. Document the tradeoff between memory usage and lookup performance.

## Verification Criteria

- [ ] Can describe the dentry structure fields and their roles
- [ ] Can explain the dcache hash table lookup algorithm
- [ ] Can trace a path lookup from d_lookup through RCU-walk to resolution
- [ ] Can explain negative dentry caching and why it matters for performance
- [ ] Can describe the inode cache lifecycle from allocation through LRU reclaim
- [ ] Can explain how vfs_cache_pressure controls dcache/icache reclaim
- [ ] Can use /proc/sys/fs/dentry-state and drop_caches to observe dcache behavior
