---
name: rmap-and-folio
description: Understand reverse mappings, the folio abstraction, and transparent huge pages
realm: memory
category: rmap
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - page-fault-handling
unlocks: []
kernel_files:
  - mm/rmap.c
  - include/linux/rmap.h
  - mm/huge_memory.c
doc_files:
  - Documentation/mm/rmap.rst
  - Documentation/mm/transhuge.rst
badge: Reverse Mapper
tags:
  - rmap
  - folio
  - thp
---

# Reverse Mappings and Folios

## Quest Briefing

In a typical system, the same physical page can be mapped into multiple
process address spaces -- shared libraries, forked processes with
copy-on-write pages, and memory-mapped files all create this situation.
When the kernel needs to reclaim a page, migrate it to another NUMA node,
or change its attributes, it must find and update every page table entry
that points to that page. This is the reverse mapping (rmap) problem.

The reverse mapping infrastructure answers a critical question: "Given a
physical page, which processes have it mapped and where?" Without rmap,
the kernel would need to scan every page table in the system to find
mappings -- an O(n) operation that does not scale. With rmap, the kernel
can efficiently walk from a page to all its mappings.

Alongside rmap, this skill covers the folio abstraction -- the modern
replacement for struct page that represents a contiguous group of pages
(potentially a compound page or a transparent huge page). Folios simplify
the memory management code by providing a natural unit for operations on
multi-page allocations.


## Learning Objectives

- Explain the anon_vma and anon_vma_chain structures that enable reverse
  mapping for anonymous pages.
- Trace how folio_add_anon_rmap_ptes() and folio_add_new_anon_rmap()
  register mappings in the rmap system.
- Describe how try_to_unmap() walks all reverse mappings to remove page
  table entries during reclaim.
- Understand the folio abstraction and how it relates to struct page and
  compound pages.
- Explain transparent huge pages (THP) and how the kernel promotes and
  splits them.


## Core Concepts

### The Reverse Mapping Problem

Forward mapping (virtual -> physical) is solved by page tables. But the
kernel frequently needs the reverse direction:

- **Page reclaim**: To free a physical page, all PTEs pointing to it
  must be updated (either cleared or converted to swap entries).
- **Page migration**: Moving a page to a different NUMA node requires
  updating all PTEs.
- **KSM (Kernel Samepage Merging)**: Deduplicating identical pages
  requires knowing all mappings.
- **Memory compaction**: Rearranging pages to create large contiguous
  free regions.

File-backed pages use the mapping->i_mmap interval tree (vma_interval_tree)
to find all VMAs mapping a given file offset. Anonymous pages use a
different structure: the anon_vma.

### anon_vma and anon_vma_chain

Defined at include/linux/rmap.h:32, struct anon_vma represents a group
of VMAs that may share anonymous pages (typically due to fork). Key fields:

- root (line 33): Points to the root of the anon_vma tree. After fork(),
  child anon_vmas point to the parent's anon_vma as root.
- rwsem (line 34): Read-write semaphore protecting the structure.
  Writers (modification) take it exclusively; walkers (rmap traversal)
  take it shared.
- refcount (line 42): Reference count for lifetime management.
- num_children (line 51): Count of child anon_vmas, used to decide
  whether to reuse or clone the anon_vma during fork.
- num_active_vmas (line 53): Count of VMAs pointing to this anon_vma.

The struct anon_vma_chain at include/linux/rmap.h:83 links a VMA to an
anon_vma. Each VMA has a list of anon_vma_chains (linked via same_vma,
line 86), and each anon_vma has an rb-tree of chains (linked via rb,
line 87). This many-to-many relationship allows efficient lookup in
both directions.

When a process forks, the child's VMAs get new anon_vma_chains that
link to both the child's new anon_vma and the parent's anon_vma. This
way, when the parent's page is shared with the child via COW, the rmap
system can find both processes' PTEs.

### Adding Reverse Mappings

When a new anonymous page is allocated (e.g., during a page fault),
it must be registered with the rmap system.

folio_add_new_anon_rmap() at mm/rmap.c:1636 is called for freshly
allocated anonymous pages. It:
1. Sets the folio's swap-backed flag if appropriate (line 1649-1650).
2. Calls __folio_set_anon() (line 1651) to record the VMA and virtual
   address in the folio's mapping field (encoded with PAGE_MAPPING_ANON).
3. For small (non-large) folios, sets the mapcount to 0 (line 1655),
   indicating one mapping.
4. If the mapping is exclusive (RMAP_EXCLUSIVE), sets the
   PageAnonExclusive flag (line 1657).

folio_add_anon_rmap_ptes() at mm/rmap.c:1589 is called when an
existing page gains additional PTE mappings (e.g., after fork or
when KSM merges pages). It calls __folio_add_anon_rmap() with
PGTABLE_LEVEL_PTE.

folio_add_anon_rmap_pmd() at mm/rmap.c:1610 handles PMD-level
(transparent huge page) mappings, calling __folio_add_anon_rmap()
with PGTABLE_LEVEL_PMD.

### try_to_unmap(): Removing All Mappings

When the kernel needs to reclaim a page, try_to_unmap() at
mm/rmap.c:2386 removes all page table mappings. It uses the rmap
infrastructure to walk all processes mapping the folio.

The actual work happens in try_to_unmap_one() at mm/rmap.c:1978,
which is called for each VMA/address pair. This function:

1. Initializes a page_vma_mapped_walk (PVMW) structure (line 1982)
   to iterate through page table entries.
2. Sets up an MMU notifier range (lines 2011-2013) to inform
   secondary MMUs (like GPUs) about the unmapping.
3. Iterates with page_vma_mapped_walk() (line 2026) to find each
   PTE mapping the folio.
4. For each PTE: clears it, flushes TLB entries, updates RSS counters,
   and for anonymous pages being swapped, installs a swap entry.

For batch TLB flushing efficiency, try_to_unmap_flush() at
mm/rmap.c:711 and try_to_unmap_flush_dirty() at line 724 are used
to defer TLB flushes until all PTEs are processed.

rmap_walk() at mm/rmap.c:3093 dispatches to either rmap_walk_anon()
(line 2956) for anonymous folios or rmap_walk_file() (line 3075) for
file-backed folios.

### The Folio Abstraction

A folio is a contiguous, naturally-aligned group of pages. It may be
a single base page (4 KB on x86) or a compound page (e.g., 2 MB for
a transparent huge page). The folio abstraction, centered on struct
folio (which wraps the first struct page), provides:

- A natural unit for I/O operations (read/write a whole folio).
- Cleaner APIs that avoid confusion about whether a struct page
  pointer refers to a head page or a tail page.
- Simplified reference counting and locking.

Key folio operations in the rmap context:
- folio_test_anon(): Is this an anonymous folio?
- folio_test_large(): Is this a multi-page (compound) folio?
- folio_test_pmd_mappable(): Can this folio be mapped by a single PMD?
- folio_mapcount(): How many page table entries point to this folio?

### Transparent Huge Pages (THP)

Transparent huge pages allow the kernel to use 2 MB pages (on x86)
without application awareness. The code in mm/huge_memory.c manages
THP allocation, faulting, and splitting.

do_huge_pmd_anonymous_page() at mm/huge_memory.c:1461 handles the
first fault on an anonymous mapping that is eligible for a huge page.
It attempts to allocate a compound folio of order HPAGE_PMD_ORDER (9,
meaning 512 pages = 2 MB) and map it with a single PMD entry.

__do_huge_pmd_anonymous_page() at line 1323 does the actual work:
allocating the huge folio, zeroing it, and installing the PMD entry.

do_huge_pmd_wp_page() at line 2060 handles copy-on-write for
transparent huge pages. If the huge page must be copied, it allocates
a new 2 MB page and copies 2 MB of data.

When the kernel needs to reclaim part of a THP or when a VMA is split
across a huge page boundary, __folio_split() at mm/huge_memory.c:3944
splits the compound folio into smaller folios. Each resulting folio
gets its own set of rmap entries.


## Code Walkthrough

Trace what happens when the reclaim system encounters a shared
anonymous page mapped in two processes (parent and child after fork):

1. **shrink_folio_list() identifies the folio** -- mm/vmscan.c:1083:
   The folio is on the inactive anonymous LRU. It is unreferenced
   and a candidate for reclaim.

2. **try_to_unmap() called** -- mm/rmap.c:2386:
   The TTU_BATCH_FLUSH flag enables batched TLB flushing. rmap_walk()
   at line 3093 calls rmap_walk_anon() at line 2956.

3. **rmap_walk_anon() traverses the anon_vma** -- Starting at the
   folio's anon_vma, it walks the rb-tree of anon_vma_chains to find
   all VMAs. It finds two: one in the parent process, one in the child.

4. **try_to_unmap_one() for the parent** -- mm/rmap.c:1978:
   page_vma_mapped_walk() locates the PTE in the parent's page table.
   The PTE is cleared and replaced with a swap entry (since the page
   is being swapped). The parent's RSS is decremented.

5. **try_to_unmap_one() for the child** -- Same process for the
   child's PTE. After both PTEs are cleared, the folio's mapcount
   drops to zero.

6. **Swap writeback** -- The folio is written to the swap device.
   Once I/O completes, the folio is freed. Both processes now have
   swap entries in their page tables.

7. **Later fault** -- When either process accesses the page,
   do_swap_page() allocates a new folio, reads from swap, and
   installs a new PTE. folio_add_anon_rmap_ptes() registers the
   new mapping.


## Hands-On Challenges

### Challenge 1: Visualize anon_vma Trees (100 XP)

Write a program that forks 3 levels deep (parent -> child -> grandchild)
with each level touching shared memory pages. Then:
- Read include/linux/rmap.h and diagram the anon_vma tree structure
  (root, parent, children).
- Explain how anon_vma_chain links VMAs to anon_vmas.
- Use /proc/PID/smaps to compare Shared_Clean, Shared_Dirty,
  Private_Clean, Private_Dirty across the three processes.

Verification: Show the anon_vma tree diagram and smaps comparison.

### Challenge 2: Trace try_to_unmap (100 XP)

Enable ftrace on try_to_unmap at mm/rmap.c:2386 and trigger page
reclaim by filling memory. Capture the trace showing:
- The rmap_walk dispatching to rmap_walk_anon or rmap_walk_file.
- The try_to_unmap_one calls for each VMA.
- The TLB flush via try_to_unmap_flush.

Read mm/rmap.c and annotate the trace with source line numbers.

Verification: Show ftrace output with source annotations.

### Challenge 3: THP Split Observation (100 XP)

Read mm/huge_memory.c and find __folio_split() at line 3944. Then:
- Enable THP (echo always > /sys/kernel/mm/transparent_hugepage/enabled).
- Write a program that allocates 2 MB aligned memory and verifies
  it gets a huge page (/proc/PID/smaps AnonHugePages).
- Call mprotect() on a 4 KB sub-region to force a THP split.
- Check smaps again to verify the huge page was split.
- Trace the split in the kernel source.

Verification: Show smaps before and after the split, with the
kernel code path documented.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain struct anon_vma at include/linux/rmap.h:32 and how its
      tree structure supports fork-based page sharing.
- [ ] Describe struct anon_vma_chain at line 83 and the many-to-many
      relationship between VMAs and anon_vmas.
- [ ] Trace folio_add_new_anon_rmap() at mm/rmap.c:1636 and explain
      how new anonymous pages are registered.
- [ ] Explain try_to_unmap() at mm/rmap.c:2386 and how it walks all
      mappings via rmap_walk() at line 3093.
- [ ] Describe try_to_unmap_one() at mm/rmap.c:1978 and how it
      clears PTEs and installs swap entries.
- [ ] Explain the folio abstraction and how folio_test_large(),
      folio_mapcount(), and folio_test_anon() work.
- [ ] Describe THP allocation via do_huge_pmd_anonymous_page() at
      mm/huge_memory.c:1461 and splitting via __folio_split() at
      line 3944.
