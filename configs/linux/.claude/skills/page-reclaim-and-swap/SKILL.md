---
name: page-reclaim-and-swap
description: Master the page reclaim framework, LRU lists, kswapd, and swap mechanics
realm: memory
category: reclaim
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
- page-fault-handling
unlocks:
- memcg-and-oom
kernel_files:
- mm/vmscan.c
- mm/swap.c
- mm/swapfile.c
- mm/swap_state.c
doc_files:
- Documentation/mm/page_reclaim.rst
badge: Reclaim Sovereign
tags:
- reclaim
- swap
- kswapd
- lru
---


# Page Reclaim and Swap

## Quest Briefing

Physical memory is finite. When the system runs low on free pages, the
kernel must reclaim memory from existing users to satisfy new allocation
requests. This is the job of the page reclaim subsystem -- one of the most
complex and performance-critical parts of the kernel.

The kernel maintains LRU (Least Recently Used) lists to track which pages
are good candidates for reclaim. Clean file-backed pages can simply be
dropped (they can be re-read from disk). Dirty file-backed pages must be
written back first. Anonymous pages (heap, stack) have nowhere to go unless
swap is configured, in which case they are written to swap space and their
page table entries are converted to swap entries.

The reclaim system operates at multiple levels: kswapd runs as a background
daemon to keep free memory above watermarks, direct reclaim runs in the
context of allocating processes when kswapd cannot keep up, and the OOM
killer is the last resort when all else fails. Understanding this pipeline
is essential for diagnosing memory pressure, swap storms, and OOM events.


## Learning Objectives

- Explain the LRU list organization and how pages move between active
  and inactive lists.
- Trace the kswapd daemon's main loop and understand watermark-based
  reclaim triggering.
- Describe the shrink_folio_list() function and the decision logic for
  reclaiming individual pages.
- Explain how anonymous pages are swapped out: PTE conversion, swap
  slot allocation, and writeback.
- Understand the swapon/swapoff syscalls and swap area management in
  mm/swapfile.c.


## Core Concepts

### LRU Lists and Page Aging

The kernel organizes reclaimable pages into LRU lists maintained per
memory cgroup and per NUMA node (struct lruvec). The traditional lists
are:

- LRU_INACTIVE_ANON: Anonymous pages not recently accessed.
- LRU_ACTIVE_ANON: Anonymous pages recently accessed.
- LRU_INACTIVE_FILE: File-backed pages not recently accessed.
- LRU_ACTIVE_FILE: File-backed pages recently accessed.
- LRU_UNEVICTABLE: Pages that cannot be reclaimed (e.g., mlock'd).

Pages are promoted from inactive to active when accessed (the "second
chance" algorithm). The shrink_active_list() function at
mm/vmscan.c:2098 moves pages from the active list to the inactive list
based on reference bits, implementing the clock/aging algorithm.

Modern kernels also support Multi-Gen LRU (MGLRU), which replaces the
two-list active/inactive model with multiple generations for more
accurate age tracking.

### kswapd: The Background Reclaim Daemon

The kswapd kernel thread, defined at mm/vmscan.c:7280, is the primary
background reclaim mechanism. One kswapd thread runs per NUMA node.

The main loop (line 7305: for ( ; ; )) works as follows:
1. kswapd_try_to_sleep() (line 7313) puts the thread to sleep until
   woken by a memory allocator that detects free pages falling below
   the low watermark.
2. On wakeup, it reads the requested allocation order and highest zone
   index (lines 7317-7318).
3. Calls balance_pgdat() (mm/vmscan.c:6950) to perform the actual
   reclaim work for the NUMA node.
4. The thread sets PF_MEMALLOC | PF_KSWAPD flags (line 7299) so it
   can access memory reserves during reclaim.

balance_pgdat() calls shrink_node() (line 6039) which calls
shrink_node_memcgs() (line 5960) to iterate over memory cgroups,
calling shrink_lruvec() (line 5772) for each. shrink_lruvec() scans
the LRU lists and calls shrink_folio_list() to evaluate individual
pages.

### shrink_folio_list(): Per-Page Reclaim Decisions

Defined at mm/vmscan.c:1083, this is the core function that decides
the fate of each candidate page (folio). It iterates through a list
of folios (line 1102: while (!list_empty(folio_list))) and for each:

1. Tries to lock the folio (line 1114: folio_trylock). If it cannot
   lock it, the folio is kept.
2. Checks for hardware poison (line 1117).
3. Checks references via folio_check_references() to determine if the
   page was recently accessed. Referenced pages may be rotated back to
   the active list (FOLIOREF_ACTIVATE).
4. For anonymous folios: checks if swap space is available. If so,
   initiates writeback to swap via add_to_swap() and swap_writepage().
5. For dirty file-backed folios: initiates writeback via pageout().
6. For clean, unreferenced folios: unmaps from all page tables via
   try_to_unmap(), then frees the page.

### try_to_free_pages(): Direct Reclaim

When kswapd cannot keep up and an allocator is about to fail,
try_to_free_pages() at mm/vmscan.c:6566 is called in the allocating
process's context. This is "direct reclaim" -- the process must reclaim
memory itself before it can proceed. It calls do_try_to_free_pages()
which iterates through zones and calls shrink_node(), the same function
used by kswapd.

### Swap Space Management

Swap areas are managed by mm/swapfile.c. The swapon() syscall at
line 3328 (SYSCALL_DEFINE2(swapon)) initializes a swap area from a
file or partition. The swapoff() syscall at line 2769
(SYSCALL_DEFINE1(swapoff)) deactivates a swap area, which requires
swapping all pages back into RAM first.

Each swap area is described by a struct swap_info_struct, which tracks:
- The backing block device or file.
- A bitmap of free/used swap slots.
- Priority for multi-device swap configurations.

When a page is swapped out, get_swap_page() allocates a swap slot,
the page contents are written to the swap device, and the PTE is
replaced with a swap entry (swp_entry_t) that encodes the swap device
and offset. When the page is faulted back in, do_swap_page() at
mm/memory.c:4706 reads the swap entry from the PTE, looks up (or reads
from disk) the page, and reinstalls it in the page table.

The swap cache (mm/swap_state.c) is an intermediate cache that holds
pages being swapped in or out. It prevents duplicate I/O when multiple
processes fault on the same swapped page simultaneously.


## Code Walkthrough

Trace what happens when the system runs low on memory and kswapd
reclaims an anonymous page:

1. **Watermark crossed** -- An allocation in __alloc_pages() detects
   that free pages are below the low watermark. It calls
   wakeup_kswapd() which wakes the kswapd thread for the NUMA node.

2. **kswapd wakes** -- mm/vmscan.c:7280: The kswapd main loop reads
   the requested order (line 7308) and calls balance_pgdat() at
   line 6950.

3. **balance_pgdat()** -- Iterates through zones from highest to
   lowest, checking if each zone's free pages are below the high
   watermark. For zones needing reclaim, calls shrink_node().

4. **shrink_node()** -- mm/vmscan.c:6039: Determines the scan
   balance between anonymous and file pages, then calls
   shrink_node_memcgs() (line 5960) to iterate memory cgroups.

5. **shrink_lruvec()** -- mm/vmscan.c:5772: Scans the inactive LRU
   lists. For the anonymous inactive list, calls
   isolate_lru_folios() (line 1710) to remove candidate folios from
   the LRU, then passes them to shrink_folio_list().

6. **shrink_folio_list()** -- mm/vmscan.c:1083: For an anonymous
   folio that is unreferenced:
   - Calls add_to_swap() to allocate a swap slot and add the folio
     to the swap cache.
   - Calls try_to_unmap() to remove all page table mappings, replacing
     PTEs with swap entries.
   - Initiates I/O to write the page to the swap device.
   - Once I/O completes, the folio is freed back to the buddy allocator.

7. **Later: do_swap_page()** -- mm/memory.c:4706: When the process
   accesses the swapped page again, a page fault occurs. The PTE
   contains a swap entry. do_swap_page() allocates a new page, reads
   the data from swap, installs the PTE, and removes the swap entry.


## Hands-On Challenges

### Challenge 1: Monitor Reclaim Activity (100 XP)

Use /proc/vmstat to observe reclaim counters before and after
triggering memory pressure:
1. Record initial values of pgsteal_kswapd, pgsteal_direct,
   pgscan_kswapd, pgscan_direct, pgactivate, pgdeactivate.
2. Run a memory-intensive program that allocates more than available
   RAM.
3. Record final counter values and compute deltas.
4. Read mm/vmscan.c and identify where each counter is incremented.

Verification: Show the counter deltas and map each to its source
location in mm/vmscan.c.

### Challenge 2: Trace kswapd (100 XP)

Enable ftrace on the kswapd function at mm/vmscan.c:7280 and on
balance_pgdat() at line 6950:
1. Configure swap on a small device or file.
2. Trigger memory pressure to wake kswapd.
3. Capture the trace showing kswapd's main loop iteration.
4. Identify the call chain: kswapd -> balance_pgdat -> shrink_node
   -> shrink_lruvec -> shrink_folio_list.

Verification: Show the ftrace function_graph output with annotations.

### Challenge 3: Swap Lifecycle (100 XP)

Read mm/swapfile.c and trace the swapon() syscall at line 3328:
1. Identify how the swap area is initialized (swap_info_struct).
2. Find where the swap header is read and validated.
3. Explain how swap slots are allocated (the cluster allocator).
4. Write a program that uses mlockall() to pin memory, then observe
   that those pages are never swapped.

Verification: Document the swapon code path and show mlock preventing
swap with /proc/self/status VmLck field.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain the five LRU lists (inactive/active for anon/file plus
      unevictable) and how pages move between them.
- [ ] Trace kswapd's main loop at mm/vmscan.c:7280 through
      balance_pgdat() at line 6950 to shrink_node() at line 6039.
- [ ] Describe how shrink_folio_list() at mm/vmscan.c:1083 evaluates
      each folio for reclaim vs. keep vs. activate.
- [ ] Explain the difference between kswapd (background) and direct
      reclaim via try_to_free_pages() at line 6566.
- [ ] Describe the swap-out path: add_to_swap -> try_to_unmap ->
      swap_writepage -> free_page.
- [ ] Explain the swap-in path via do_swap_page() at mm/memory.c:4706.
- [ ] Identify the swapon syscall at mm/swapfile.c:3328 and explain
      how swap areas are managed.
