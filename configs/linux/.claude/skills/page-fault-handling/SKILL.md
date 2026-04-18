---
name: page-fault-handling
description: Master the page fault path from hardware exception to page table update
realm: memory
category: virtual-memory
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
- virtual-memory-areas
unlocks:
- page-reclaim-and-swap
- rmap-and-folio
- kvm-memory-virtualization
kernel_files:
- mm/memory.c
- arch/x86/mm/fault.c
doc_files:
- Documentation/mm/page_tables.rst
badge: Fault Finder
tags:
- page-fault
- pte
- demand-paging
---


# Page Fault Handling

## Quest Briefing

When a process accesses a virtual address that has no corresponding physical
page, the CPU raises a page fault exception. This is not an error -- it is
the fundamental mechanism that makes demand paging, copy-on-write, swap,
and memory-mapped files work. The page fault handler is one of the most
critical and frequently executed code paths in the kernel.

Every time you run a program, hundreds or thousands of page faults occur:
the first access to each code page triggers a fault that loads it from
disk. The first write to a forked process's page triggers a copy-on-write
fault. Accessing swapped-out memory triggers a swap-in fault. Each of these
scenarios follows a different path through the same fault handling
infrastructure.

Understanding page faults connects the VMA layer (what *should* be mapped)
to the physical page layer (what *is* mapped). It is the bridge between
the virtual address space abstraction and the hardware page tables that the
MMU walks on every memory access.


## Learning Objectives

- Trace a page fault from the x86 hardware exception through the
  architecture-specific handler to the generic mm fault handler.
- Explain the four-level page table walk (PGD -> P4D -> PUD -> PMD -> PTE)
  and how the kernel fills in missing levels.
- Distinguish between anonymous page faults, file-backed faults, and
  copy-on-write faults and the code paths for each.
- Describe how do_anonymous_page() allocates a zero page on read and a
  real page on write.
- Explain swap page faults and how do_swap_page() restores pages from
  swap space.


## Core Concepts

### The x86 Page Fault Entry Point

On x86, when the MMU cannot translate a virtual address, it pushes an
error code onto the stack and calls the page fault handler. The
architecture-specific entry point is do_user_addr_fault() at
arch/x86/mm/fault.c:1207.

This function receives the faulting address and an error code with bits:
- X86_PF_PROT: Protection violation (page present but wrong permissions)
- X86_PF_WRITE: Write access fault
- X86_PF_USER: Fault from user mode
- X86_PF_RSVD: Reserved bit set in page table
- X86_PF_INSTR: Instruction fetch fault

do_user_addr_fault() performs several checks:
1. Line 1220: Detects kernel code trying to execute from user memory.
2. Line 1243: Handles reserved bit violations (pgtable_bad).
3. Line 1253: Enforces SMAP (Supervisor Mode Access Prevention).
4. Line 1268: Rejects faults in interrupt context or with no mm_struct.
5. Line 1279: Enables local interrupts.
6. Line 1281: Records the page fault as a perf software event.

After validation, it looks up the VMA for the faulting address and calls
handle_mm_fault() -- the generic, architecture-independent fault handler.

### handle_mm_fault(): The Generic Entry Point

Defined at mm/memory.c:6589, handle_mm_fault() is called by all
architectures. It:

1. Sets current task state to TASK_RUNNING (line 6597).
2. Sanitizes fault flags via sanitize_fault_flags() (line 6599).
3. Checks VMA access permissions via arch_vma_access_permitted()
   (line 6603) -- returns VM_FAULT_SIGSEGV if denied.
4. Enters the memcg OOM context for user faults (line 6617):
   mem_cgroup_enter_user_fault().
5. Enters LRU generation fault tracking (line 6619):
   lru_gen_enter_fault().
6. For hugetlb pages, calls hugetlb_fault() (line 6622).
7. For normal pages, calls __handle_mm_fault() (line 6624).

### __handle_mm_fault(): The Page Table Walk

Defined at mm/memory.c:6355, this function walks the four-level page
table hierarchy, allocating missing levels as needed:

1. Initializes a struct vm_fault (line 6358) with the faulting VMA,
   address, and flags.
2. Walks PGD (page global directory) -- always present.
3. Allocates P4D (page 4-level directory) if missing.
4. Allocates PUD (page upper directory) if missing, handling huge PUD
   pages.
5. Allocates PMD (page middle directory) if missing, handling
   transparent huge pages via do_huge_pmd_anonymous_page().
6. Calls handle_pte_fault() for the final PTE-level resolution.

### handle_pte_fault(): The Decision Point

Defined at mm/memory.c:6273, this is where the kernel decides what
type of fault occurred and dispatches to the appropriate handler:

1. Lines 6277-6313: Maps the PTE. If the PMD is empty (pmd_none),
   the PTE pointer is set to NULL. Otherwise, the PTE is read
   locklessly via ptep_get_lockless().

2. Line 6316-6317: If no PTE exists (vmf->pte is NULL), calls
   do_pte_missing() which dispatches to either do_anonymous_page()
   for anonymous mappings or do_fault() for file-backed mappings.

3. Line 6319-6320: If the PTE is present but not in memory
   (!pte_present), calls do_swap_page() to bring it back from swap.

4. Line 6322-6323: If the PTE has protnone set (a NUMA balancing
   marker), calls do_numa_page() for NUMA migration.

5. Lines 6331-6333: If the access is a write to a read-only PTE,
   calls do_wp_page() for copy-on-write handling.

6. Lines 6337-6343: For simple access faults (e.g., setting the
   accessed/dirty bits), updates the PTE in place via
   ptep_set_access_flags().

### do_anonymous_page(): First Access to Anonymous Memory

Defined at mm/memory.c:5217, this handles the first access to a page
in an anonymous mapping (heap, stack, mmap with MAP_ANONYMOUS):

1. Line 5227: Rejects shared anonymous mappings (VM_SHARED returns
   VM_FAULT_SIGBUS).
2. Line 5234: Allocates a PTE page table if the PMD has none.
3. Lines 5238-5258: For read faults, maps the global zero page
   (a single read-only page of zeros shared system-wide) using
   pte_mkspecial(pfn_pte(my_zero_pfn(...))).
4. Line 5262: For write faults, calls vmf_anon_prepare() then
   alloc_anon_folio() to allocate a real physical page.
5. The newly allocated folio is added to the reverse map via
   folio_add_new_anon_rmap() and inserted into the LRU lists.

### do_wp_page(): Copy-on-Write

Defined at mm/memory.c:4149, this handles write faults on pages that
are mapped read-only due to fork()'s copy-on-write mechanism. When a
process writes to a COW page:

1. The faulting PTE is read-only but the VMA allows writes.
2. do_wp_page() checks if the page has a single mapping (can be
   reused) or multiple mappings (must be copied).
3. If copying is needed, a new page is allocated, the old page's
   contents are copied, and the PTE is updated to point to the new
   page with write permissions.


## Code Walkthrough

Trace what happens when a process first writes to a newly mmap'd
anonymous page:

1. **Process touches address 0x7f0000001000** -- The CPU finds no PTE
   for this address and triggers a page fault exception.

2. **x86 fault entry** -- arch/x86/mm/fault.c:1207:
   do_user_addr_fault() receives error_code with X86_PF_WRITE and
   X86_PF_USER set. It validates the fault context, enables interrupts
   (line 1279), and looks up the VMA.

3. **handle_mm_fault()** -- mm/memory.c:6589:
   Enters memcg OOM context (line 6617), then calls
   __handle_mm_fault() (line 6624).

4. **Page table walk** -- mm/memory.c:6355:
   __handle_mm_fault() walks PGD/P4D/PUD/PMD. Since this is a fresh
   mapping, intermediate page table levels may need allocation via
   pud_alloc() and pmd_alloc().

5. **handle_pte_fault()** -- mm/memory.c:6273:
   The PMD exists but the PTE is NULL (no page table entry yet).
   vmf->pte is set to NULL at line 6284. Line 6317 calls
   do_pte_missing(), which recognizes this as an anonymous VMA and
   calls do_anonymous_page().

6. **do_anonymous_page()** -- mm/memory.c:5217:
   Since FAULT_FLAG_WRITE is set, the zero-page optimization is
   skipped. vmf_anon_prepare() prepares the anonymous mapping, then
   alloc_anon_folio() allocates a new physical page (folio). The page
   is zeroed, added to the reverse map, and a writable PTE is installed.

7. **Return to userspace** -- The process resumes with the write
   succeeding. The page is now in the process's resident set.


## Hands-On Challenges

### Challenge 1: Count Your Page Faults (75 XP)

Write a C program that:
1. Calls getrusage() to get the initial minor/major fault counts.
2. mmap()s 1 MB of anonymous memory.
3. Touches every page (write one byte per page).
4. Calls getrusage() again and computes the fault count delta.

Then read mm/memory.c and trace the path from handle_pte_fault()
at line 6273 through do_anonymous_page() at line 5217. Document
how many kernel functions are called per fault.

Verification: Show the fault counts and your annotated code path trace.

### Challenge 2: Observe Copy-on-Write (75 XP)

Write a program that:
1. Allocates 10 pages and writes unique values to each.
2. Forks a child process.
3. In the child, modifies 5 of the 10 pages.
4. Uses /proc/self/pagemap to observe which pages share physical
   frames before and after the child's writes.

Read do_wp_page() at mm/memory.c:4149 and explain the decision logic
for reusing vs. copying a page.

Verification: Show pagemap output demonstrating COW page separation.

### Challenge 3: Trace the Full Fault Path (50 XP)

Enable ftrace function_graph tracing for handle_mm_fault and trigger
a page fault by accessing a new mmap'd region. Capture the trace
showing the complete call tree from handle_mm_fault through
__handle_mm_fault, handle_pte_fault, and do_anonymous_page.

Identify every function in the trace and map it to its source file
and line number.

Verification: Show the ftrace output with source location annotations.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Trace the x86 page fault from do_user_addr_fault() at
      arch/x86/mm/fault.c:1207 to handle_mm_fault() at
      mm/memory.c:6589.
- [ ] Explain the four-level page table walk in __handle_mm_fault()
      at mm/memory.c:6355.
- [ ] Describe how handle_pte_fault() at line 6273 dispatches to
      do_anonymous_page (line 5217), do_fault, do_swap_page (line 4706),
      or do_wp_page (line 4149) based on PTE state.
- [ ] Explain the zero-page optimization in do_anonymous_page() where
      read faults map the shared zero page (lines 5238-5258).
- [ ] Describe copy-on-write mechanics in do_wp_page() at line 4149.
- [ ] Explain the role of vm_fault struct in carrying fault state
      through the handler chain.
- [ ] Distinguish minor faults (page already in memory) from major
      faults (page must be read from disk/swap).
