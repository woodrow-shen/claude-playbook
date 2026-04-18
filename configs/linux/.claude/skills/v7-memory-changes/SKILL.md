---
name: v7-memory-changes
description: Study Linux 7.0 memory-management changes -- vma_flags_t, batched folio unmap, private memcg IDs, PCP lock rework
realm: kernel-7
category: release-features
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
- virtual-memory-areas
- page-allocation
- page-reclaim-and-swap
- memcg-and-oom
unlocks: []
kernel_files:
- include/linux/mm_types.h
- mm/vma.c
- mm/vmscan.c
- mm/memcontrol.c
- mm/page_alloc.c
badge: Memory Modernizer
tags:
- linux-7.0
- vma-flags-t
- unmap-desc
- folio
- memcg
- pcp
- release-notes
---


# Linux 7.0 Memory Changes

## Quest Briefing

Linux 7.0 refactored four pieces of the memory subsystem that had
accumulated significant technical debt:

1. VMA flags moved from a bare scalar bitmap (`vm_flags_t`) to a structured
   `vma_flags_t` type, enabling safer flag manipulation and future flag
   growth without breaking ABI.
2. `unmap_region()` was simplified: the half-dozen pointer/range arguments
   it used to take are now packed into a `struct unmap_desc`.
3. Reclaim now batches large-folio unmaps so a single `try_to_unmap` call
   produces one TLB flush instead of N per-PTE flushes.
4. `mem_cgroup_id` got a private API built on xarray, replacing the
   legacy idr-based allocator and removing a scalability ceiling.
5. The per-CPU page (PCP) allocator dropped the local-irq save/restore
   dance on the free path, using `pcp_spin_trylock()` plus the new
   `FPI_TRYLOCK` hint.

Each of these is individually small, but together they shift how code
that touches the mm subsystem should be read on 7.0. If you write or
audit mm code, this is the 7.0 survival kit.


## Learning Objectives

- Read the `vma_flags_t` typedef at `include/linux/mm_types.h:880` and
  the `vma_flags` field at mm_types.h:909. Explain why a struct type
  is safer than a bare bitmask.
- Trace how `unmap_region()` at `mm/vma.c:481` consumes a
  `struct unmap_desc`, and how its callers at `mm/vma.c:1278` and
  `mm/mmap.c:1279` build the descriptor.
- Explain the v7.0 batched-unmap path: `shrink_folio_list` ->
  `try_to_unmap(folio, TTU_BATCH_FLUSH | TTU_SYNC)` ->
  `try_to_unmap_flush_dirty()`, with only one invalidation per batch.
- Walk the private memcg ID lifecycle: `mem_cgroup_css_alloc()` at
  `mm/memcontrol.c:3882` reserves an xarray slot via `xa_alloc()`;
  `mem_cgroup_css_online()` stores the pointer at xa_store (line 3969);
  `mem_cgroup_private_id_put()` releases via xa_erase (line 3681).
- Explain the PCP lock optimization: pre-7.0 IRQ-save versus 7.0's
  `pcp_spin_trylock()` + `FPI_TRYLOCK` bailout in
  `mm/page_alloc.c:1550`.


## Core Concepts

### vma_flags_t: Structured Flag Storage

Pre-7.0, `vma->vm_flags` was a bare `vm_flags_t` (typically `unsigned
long`). Code could set and clear bits freely; there was no audit trail
for which bit meant what beyond a sea of `VM_*` macros.

7.0 introduces a typedef'd struct at mm_types.h:880 -- `vma_flags_t`.
The vm_area_struct field at mm_types.h:909 now reads
`vma_flags_t vma_flags;`. Helpers supply the operations:

- `vma_flags_clear_all()` at mm_types.h:1078 replaces raw assignment of
  zero.
- `vma_flags_to_legacy()` at mm_types.h:1090 converts to the scalar
  `vm_flags_t` for APIs that haven't migrated yet (most still consume
  a scalar).

The practical effect: when you read mm code on 7.0, expect
`vma_flags_foo(vma, VM_FOO)` helpers rather than raw `vma->vm_flags |=`.

### struct unmap_desc: Packing Unmap Arguments

`unmap_region()` at mm/vma.c:481 used to take a mm, a range, a set of
VMAs, and several flags as separate arguments. 7.0 bundles these into
`struct unmap_desc`. Callers build one on the stack:

- `mm/vma.c:1278` in the main unmap path.
- `mm/mmap.c:1279` in the `do_munmap`-style caller.

The refactor has two wins: fewer argument-shuffle bugs, and adding a
new unmap option in the future means a new struct field rather than a
breaking signature change.

### Batched Large-Folio Unmap

Pre-7.0 reclaim would walk a large folio's PTEs and issue a TLB
invalidation per page table entry. That's fine for 4K pages but hurts
hugely for 2M+ folios where dozens of PTEs need clearing.

In 7.0, `shrink_folio_list` at mm/vmscan.c:1083 passes
`TTU_BATCH_FLUSH | TTU_SYNC` to `try_to_unmap()`. Inside
`try_to_unmap_one()` at mm/rmap.c:1984, the batched variant accumulates
cleared PTEs into a per-cpu batch. Once the batch is full (or the
caller explicitly drains it via `try_to_unmap_flush()` at
mm/vmscan.c:1561), a single invalidation fires via
`try_to_unmap_flush_dirty()` at mm/vmscan.c:1535.

Large folios under reclaim are no longer pessimized by per-PTE flushes.

### Private memcg IDs (xarray-based)

Memory cgroups need unique integer IDs so kmem accounting structures
can reference a memcg by ID without holding a strong reference.
Pre-7.0 used `idr_alloc`. 7.0 migrates to xarray:

- `mem_cgroup_css_alloc()` at mm/memcontrol.c:3882 allocates a private
  ID via `xa_alloc()` (line 3818) against the global
  `mem_cgroup_private_ids` xarray (defined at line 3676).
- `mem_cgroup_css_online()` at line 3935 publishes the memcg pointer
  into the xarray via `xa_store()` at line 3969 and bumps a refcount
  at line 3956.
- `mem_cgroup_from_private_id()` at line 3720 is the lookup path
  (`xa_load`).
- Release at `mem_cgroup_private_id_put()` drops the refcount at
  line 3688, and on the final put calls `xa_erase()` at line 3681.

xarray scales better than idr under contention and exposes
cleaner RCU-safe lookup semantics.

### PCP Lock Optimization and FPI_TRYLOCK

The per-CPU page lists (PCP) used to save/restore IRQs around every
free, because the free path could be reached from IRQ context.
7.0 replaces this with `pcp_spin_trylock()` (macro defined around
mm/page_alloc.c:119, unlock at 131, nopin variant at 144-155).

The fast path at mm/page_alloc.c:1408 skips debug helpers; the trylock
attempt at line 1550 either succeeds (free to PCP) or the caller falls
back to the buddy path. The new `FPI_TRYLOCK` flag tells the allocator
"bail if the PCP lock is contended" -- at line 1561, a held llist is
drained only if the trylock wins.

On UP builds the trylock is a compile-time no-op; on SMP it's the
cheaper path whenever the PCP lock is uncontended, which is the common
case.


## Code Walkthrough

The 7.0 batched large-folio unmap end-to-end:

1. `shrink_folio_list` at mm/vmscan.c:1083 iterates reclaim candidates.
2. On reaching a large folio, the call is
   `try_to_unmap(folio, TTU_BATCH_FLUSH | TTU_SYNC)` at mm/vmscan.c:1367.
3. `try_to_unmap_one()` (mm/rmap.c:1984) visits each mapping, using
   `folio_unmap_pte_batch` (mm/rmap.c:711) to accumulate cleared PTEs.
4. `try_to_unmap_flush_dirty()` at mm/vmscan.c:1535 fires one
   invalidation for the whole batch.
5. Folio is freed (all 16 pages if this is a 16-way large folio)
   in a single `free_folios` add.
6. `try_to_unmap_flush()` at mm/vmscan.c:1561 drains any pending
   invalidations when the reclaim batch ends.
7. Final flush at function exit (mm/vmscan.c:1604) guarantees no
   stale TLB entries leak out of reclaim.


## Hands-On Challenges

### Challenge 1: Flag-Type Audit (75 XP)

Pick five `VM_*` flags. Find a v6.17 example of each being manipulated
via raw `vma->vm_flags |= VM_FOO`, and the 7.0 equivalent via the new
helpers. Produce a diff-style side-by-side.

Verification: Five side-by-sides with file:line citations in both trees.

### Challenge 2: Measure Batched Unmap Impact (100 XP)

Build a small reproducer that allocates many large folios (via
transparent huge pages) and then reclaims them under memory pressure.
Measure the number of TLB invalidations issued via perf counters on
both a pre-7.0 kernel and 7.0.

Verification: perf counter deltas plus a writeup explaining the
ratio in terms of folio size.

### Challenge 3: memcg ID Scaling (75 XP)

Create 10000 memory cgroups in rapid succession on both kernels and
measure the time. Identify which code path is faster and why by
reading `xa_alloc()` vs `idr_alloc_cyclic()`.

Verification: Timings plus a short writeup on xarray vs idr scaling.

### Challenge 4: FPI_TRYLOCK Behavior (50 XP)

Read the PCP free fast path at mm/page_alloc.c:1550 and explain:
what does the caller do when the trylock fails? Is correctness
preserved, or is there a regression under contention?

Verification: 300-word writeup citing the exact fallback path.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain `vma_flags_t` (mm_types.h:880) and the difference between
      it and the legacy scalar `vm_flags_t`.
- [ ] Trace how `unmap_region()` (mm/vma.c:481) consumes a
      `struct unmap_desc` built by callers at mm/vma.c:1278 and
      mm/mmap.c:1279.
- [ ] Walk the batched large-folio unmap path end-to-end with at
      least six srcRef-style citations.
- [ ] Describe the private memcg ID API lifecycle and cite the
      `xa_alloc` / `xa_store` / `xa_erase` anchor lines
      (mm/memcontrol.c:3818/3969/3681).
- [ ] Explain the PCP lock optimization and the role of
      `FPI_TRYLOCK`, citing mm/page_alloc.c:1408, 1550, and 1561.
