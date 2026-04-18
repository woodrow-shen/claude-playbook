---
name: page-allocation
description: Master the buddy allocator and physical page management in the kernel
realm: memory
category: page-allocator
difficulty: beginner
xp: 150
estimated_minutes: 90
prerequisites:
- process-lifecycle
unlocks:
- slab-allocator
- virtual-memory-areas
- pci-and-dma
kernel_files:
- mm/page_alloc.c
- include/linux/gfp.h
- include/linux/mmzone.h
- mm/internal.h
doc_files:
- Documentation/mm/page_alloc.rst
- Documentation/admin-guide/sysctl/vm.rst
badge: Memory Initiate
tags:
- memory
- buddy-allocator
- pages
- gfp-flags
---


# Page Allocation

The kernel manages physical memory in units of pages (typically 4KB on x86-64).
The buddy allocator is the foundation of all kernel memory management -- every
kmalloc, every page cache page, every process address space ultimately gets its
physical memory from this allocator.

## Learning Objectives

After completing this skill, you will be able to:

- Explain the buddy allocator algorithm and its power-of-2 free lists
- Describe memory zones (DMA, DMA32, Normal, HighMem) and their purpose
- Read and interpret GFP flags that control allocation behavior
- Trace an allocation through __alloc_pages and get_page_from_freelist
- Use /proc/buddyinfo and /proc/zoneinfo to observe allocator state

## Core Concepts

### Pages and Page Frames

Physical memory is divided into fixed-size frames (4KB by default). Each frame
is tracked by a struct page (include/linux/mm_types.h). The kernel never works
with raw physical addresses for allocation -- it works with struct page pointers.

struct page is extremely space-optimized because there is one per physical page
frame (millions on a typical system). It uses unions heavily to overlay different
use cases (page cache, slab, compound pages, etc.).

### The Buddy System

The buddy allocator groups free pages into lists by order (power of 2):

- Order 0: single pages (4KB)
- Order 1: pairs of pages (8KB)
- Order 2: groups of 4 pages (16KB)
- ...
- Order MAX_PAGE_ORDER: largest contiguous allocation

When allocating order-N pages:
1. Check the order-N free list
2. If empty, split a block from order-(N+1): one half satisfies the request,
   the other half ("buddy") goes on the order-N free list
3. Repeat upward if needed

When freeing:
1. Check if the buddy block is also free
2. If so, merge them into an order-(N+1) block
3. Repeat upward (coalescing)

This is implemented in mm/page_alloc.c (copyright Linus Torvalds, 1991).

### Memory Zones

Not all physical memory is equal. The kernel divides memory into zones:

- ZONE_DMA (0-16MB): legacy ISA DMA devices need addresses below 16MB
- ZONE_DMA32 (0-4GB): 32-bit DMA devices need addresses below 4GB
- ZONE_NORMAL (above 4GB): regular memory, no constraints
- ZONE_HIGHMEM (32-bit only): memory not directly mapped into kernel space

Each zone has its own set of buddy free lists. Defined in include/linux/mmzone.h.

### GFP Flags

GFP (Get Free Pages) flags control allocation behavior. Defined in
include/linux/gfp.h:

- GFP_KERNEL: the most common flag. Allows sleeping, I/O, filesystem operations
  to reclaim memory. Used in process context.
- GFP_ATOMIC: cannot sleep. Used in interrupt context or while holding spinlocks.
  Dips into emergency reserves if needed.
- GFP_USER: for userspace allocations. Similar to GFP_KERNEL with additional
  hardening.
- __GFP_DMA, __GFP_DMA32: restrict allocation to specific zones.
- __GFP_NOWARN: suppress allocation failure warnings.
- __GFP_ZERO: zero the allocated pages before returning.

### The Allocation Path

The core allocation function is __alloc_pages_noprof() in mm/page_alloc.c:

1. get_page_from_freelist() -- the fast path. Walks the zonelist, checks
   watermarks, and tries to grab pages from the buddy free lists.
2. If the fast path fails, the slow path kicks in:
   - Wake up kswapd to start background reclaim
   - Try direct reclaim (synchronously free cached pages)
   - Try compaction (move pages to create contiguous free blocks)
   - As a last resort, invoke the OOM killer

### Watermarks

Each zone has three watermarks (min, low, high) that control when reclaim
starts:

- Above high: allocation proceeds freely
- Below low: kswapd wakes up to reclaim in the background
- Below min: only GFP_ATOMIC and emergency allocations succeed

Watermarks are visible in /proc/zoneinfo.

## Code Walkthrough

### Exercise 1: Trace a GFP_KERNEL Allocation

1. Start at mm/page_alloc.c and find __alloc_pages_noprof()
2. It calls prepare_alloc_pages() to set up the allocation context
3. Then calls get_page_from_freelist() -- read this function carefully
4. get_page_from_freelist() iterates zones, checks watermarks via
   zone_watermark_fast(), and calls rmqueue() to pull from the buddy lists
5. rmqueue() calls __rmqueue() which walks the free lists from the
   requested order upward, splitting larger blocks as needed

### Exercise 2: Observe Buddy State

On a running system:

1. Read /proc/buddyinfo -- each row shows a zone and the number of free
   blocks at each order (0 through MAX_PAGE_ORDER)
2. Read /proc/zoneinfo -- shows detailed zone stats including watermarks,
   free pages, and reclaim statistics
3. Allocate a large block (e.g., via a test module) and watch buddyinfo change

### Exercise 3: The OOM Path

1. In mm/page_alloc.c, find __alloc_pages_slowpath()
2. Trace through: wake_all_kswapds(), __alloc_pages_direct_reclaim(),
   __alloc_pages_direct_compact(), __alloc_pages_may_oom()
3. In mm/oom_kill.c, find out_of_memory() which selects a victim process

## Hands-On Challenges

### Challenge 1: Buddy Allocator Visualization (XP: 50)

Read /proc/buddyinfo on your system. For each zone, calculate the total free
memory by summing (count * 2^order * PAGE_SIZE) across all orders. Compare
this with the total free memory reported by /proc/meminfo.

### Challenge 2: GFP Flag Analysis (XP: 50)

Open include/linux/gfp.h and list all compound GFP flags (GFP_KERNEL,
GFP_ATOMIC, GFP_USER, etc.). For each, identify which individual __GFP_*
bits it includes. Create a comparison table showing which flags allow sleeping,
I/O, and filesystem access.

### Challenge 3: Zone Watermark Experiment (XP: 50)

Read /proc/zoneinfo for the Normal zone. Record the min, low, and high
watermarks. Calculate the percentage of zone memory each represents. Then
find where these watermarks are calculated in mm/page_alloc.c
(setup_per_zone_wmarks).

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain the buddy algorithm's split and coalesce operations
- [ ] Name all memory zones and why each exists
- [ ] Choose the correct GFP flag for a given allocation context
- [ ] Read /proc/buddyinfo and calculate total free memory per zone
- [ ] Describe the fallback path when the fast allocation path fails
