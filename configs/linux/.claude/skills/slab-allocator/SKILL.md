---
name: slab-allocator
description: Understand SLUB slab allocation for efficient kernel object caching
realm: memory
category: slab
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - page-allocation
unlocks: []
kernel_files:
  - mm/slub.c
  - include/linux/slab.h
  - mm/slab_common.c
doc_files:
  - Documentation/mm/slub.rst
badge: Slab Master
tags:
  - memory
  - slab
  - slub
  - kmalloc
  - kmem_cache
---

# Slab Allocator

The buddy allocator works in page granularity, but most kernel allocations are
much smaller (a struct inode is ~600 bytes, a struct dentry is ~192 bytes). The
slab allocator sits on top of the buddy allocator and provides efficient
allocation of small, fixed-size objects. SLUB is the default implementation.

## Learning Objectives

After completing this skill, you will be able to:

- Explain why a slab layer exists on top of the buddy allocator
- Describe how SLUB organizes objects into slabs backed by page groups
- Use kmalloc() and kmem_cache_create() correctly
- Navigate the SLUB code in mm/slub.c
- Use /proc/slabinfo and slub_debug to diagnose memory issues

## Core Concepts

### The Problem

The buddy allocator's minimum allocation is one page (4KB). But the kernel
constantly allocates objects far smaller than a page: task_struct, inode,
dentry, skb, and thousands of others. Allocating a full page for each 200-byte
object would waste over 95% of memory.

The slab allocator solves this by:
1. Getting pages from the buddy allocator
2. Subdividing them into fixed-size object slots
3. Maintaining per-CPU free lists for fast allocation

### SLUB Architecture

SLUB (the Unqueued Slab Allocator, mm/slub.c) is the default since Linux 2.6.23.
Key structures:

struct kmem_cache (include/linux/slab.h): represents a cache for one object type.
Fields include:
- size: the object size (including alignment and metadata)
- object_size: the requested object size
- offset: offset to the free pointer within free objects
- cpu_slab: per-CPU slab pointer for fast allocation
- min_partial: minimum number of partial slabs to keep

Each kmem_cache has:
- Per-CPU slabs (struct kmem_cache_cpu): one active slab per CPU for lockless
  allocation. The freelist pointer chains free objects.
- Partial lists (struct kmem_cache_node): slabs with some free objects, shared
  across CPUs.
- Full slabs: no free objects, not tracked (just freed pages).

### kmalloc() -- General Purpose Allocation

kmalloc() is the most common kernel allocation function. It uses a set of
pre-created slab caches for power-of-2 sizes:

kmalloc-8, kmalloc-16, kmalloc-32, ..., kmalloc-8192

When you call kmalloc(200, GFP_KERNEL), it rounds up to the nearest cache
(kmalloc-256) and allocates from that cache. This wastes at most ~50% per
object but avoids the overhead of creating a custom cache.

For allocations larger than 8KB (or the configured limit), kmalloc falls
through to the buddy allocator directly.

### kmem_cache_create() -- Dedicated Caches

For objects allocated frequently and of known size, a dedicated cache is
more efficient:

```c
struct kmem_cache *my_cache;

my_cache = kmem_cache_create("my_objects",
                             sizeof(struct my_object),
                             0,        // align
                             0,        // flags
                             NULL);    // constructor

struct my_object *obj = kmem_cache_alloc(my_cache, GFP_KERNEL);
kmem_cache_free(my_cache, obj);
kmem_cache_destroy(my_cache);
```

Benefits of dedicated caches:
- No size rounding waste (exactly sized)
- Objects are grouped together (cache locality)
- Debugging: each cache is tracked separately in /proc/slabinfo
- Optional constructor function runs on each new object

### The Fast Path

SLUB's allocation fast path (in mm/slub.c) is extremely optimized:

1. Read the per-CPU freelist pointer (cpu_slab->freelist)
2. If non-NULL, grab the first object and advance the freelist
3. This path uses no locks -- just a cmpxchg on the per-CPU pointer

If the per-CPU slab is exhausted:
1. Check the per-CPU partial list
2. If empty, check the node's partial list (requires a lock)
3. If no partials available, allocate new pages from the buddy allocator

### SLUB Debugging

Enable CONFIG_SLUB_DEBUG for:
- Red zones: guard bytes around objects to detect buffer overflows
- Poisoning: fill freed objects with 0x6b to detect use-after-free
- Object tracking: record allocation/free call stacks

Boot with slub_debug=FZPU to enable all checks (F=sanity, Z=red zones,
P=poisoning, U=user tracking).

## Code Walkthrough

### Exercise 1: Trace kmalloc

1. Start at include/linux/slab.h and find the kmalloc() inline function
2. It calls __kmalloc() or uses kmalloc_caches[] for known-constant sizes
3. In mm/slub.c, find slab_alloc_node() -- the core allocation function
4. Trace the fast path: it reads cpu_slab->freelist and tries cmpxchg
5. If fast path fails, trace __slab_alloc() for the slow path

### Exercise 2: Examine /proc/slabinfo

On a running system:

```
cat /proc/slabinfo | head -20
```

Each line shows: cache name, active objects, total objects, object size,
objects per slab, pages per slab, and various statistics. Find the caches
for task_struct, dentry, and inode. Note their object sizes and utilization.

### Exercise 3: Dedicated Cache Lifecycle

1. In mm/slab_common.c, find kmem_cache_create() (the public API)
2. It calls __kmem_cache_create_args() which calls __kmem_cache_create()
3. In mm/slub.c, find __kmem_cache_create() -- SLUB's implementation
4. Trace how it calculates object layout: size, alignment, freelist pointer
   offset, objects per slab

## Hands-On Challenges

### Challenge 1: Slab Census (XP: 60)

Parse /proc/slabinfo and find the top 10 caches by total memory usage
(active_objs * objsize). For each, identify which kernel subsystem creates
it (e.g., dentry -> VFS, task_struct -> scheduler).

### Challenge 2: kmalloc Size Buckets (XP: 70)

Find the kmalloc cache size array in mm/slab_common.c (kmalloc_info[]).
List all bucket sizes. Then write a table showing: for each common kernel
object (task_struct, inode, dentry, sk_buff, file), its actual size and
which kmalloc bucket it would land in if allocated via kmalloc.

### Challenge 3: Fragmentation Analysis (XP: 70)

Read /proc/slabinfo and calculate the internal fragmentation for each
kmalloc-N cache: (objsize - average_actual_alloc_size) / objsize. Which
caches have the worst fragmentation? What does this tell you about kernel
allocation patterns?

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain why the slab layer exists and what problem it solves
- [ ] Describe SLUB's per-CPU freelist fast path allocation
- [ ] Choose between kmalloc() and kmem_cache_create() for a given use case
- [ ] Read /proc/slabinfo and identify the largest caches
- [ ] Explain red zones, poisoning, and how slub_debug helps find memory bugs
