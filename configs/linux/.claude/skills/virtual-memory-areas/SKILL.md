---
name: virtual-memory-areas
description: Understand VMAs, mmap, and address space management in the Linux kernel
realm: memory
category: virtual-memory
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - page-allocation
unlocks:
  - page-fault-handling
kernel_files:
  - mm/mmap.c
  - mm/vma.c
  - include/linux/mm_types.h
doc_files:
  - Documentation/mm/overview.rst
badge: Address Architect
tags:
  - vma
  - mmap
  - address-space
---

# Virtual Memory Areas

## Quest Briefing

Every userspace process sees a flat, contiguous virtual address space, but
behind this illusion lies a carefully managed collection of virtual memory
areas (VMAs). Each VMA describes a contiguous range of virtual addresses
with uniform permissions and backing -- a code segment, a heap region, a
memory-mapped file, or an anonymous mapping for the stack.

The VMA is one of the most fundamental abstractions in the Linux memory
management subsystem. When a process calls mmap(), the kernel creates a
VMA. When it calls munmap(), a VMA is removed or split. When the process
forks, VMAs are duplicated. When a page fault occurs, the kernel looks up
the VMA to determine what should be mapped at that address. Understanding
VMAs is the gateway to understanding every other aspect of Linux memory
management.

The kernel recently transitioned from a red-black tree to a maple tree
(struct maple_tree, stored in mm_struct->mm_mt) for VMA lookup, improving
scalability for large address spaces. The VMA manipulation code in mm/vma.c
and mm/mmap.c is some of the most actively maintained code in the kernel.


## Learning Objectives

- Describe the key fields of struct vm_area_struct and their roles in
  defining a memory region.
- Trace the mmap() syscall from userspace through do_mmap() to VMA
  creation.
- Explain how VMAs are stored in the maple tree (mm_struct->mm_mt) and
  looked up during page faults.
- Understand VMA merging: when and how adjacent VMAs with compatible
  properties are combined.
- Describe the struct mm_struct and how it represents a process's entire
  address space.


## Core Concepts

### struct vm_area_struct: The Memory Region Descriptor

Defined at include/linux/mm_types.h:913, struct vm_area_struct describes
a single contiguous virtual memory region. Key fields:

- vm_start, vm_end (line 918-919): The virtual address range [vm_start,
  vm_end) that this VMA covers. These are always page-aligned.
- vm_mm (line 929): Pointer to the owning mm_struct (the process's
  address space).
- vm_page_prot (line 930): The page protection bits (read/write/execute)
  as a pgprot_t value.
- vm_flags (line 939): Comprehensive flags including VM_READ, VM_WRITE,
  VM_EXEC, VM_SHARED, VM_MAYREAD, VM_GROWSDOWN (stack), VM_HUGETLB,
  VM_DONTCOPY, VM_LOCKED (mlock), and many more.
- vm_ops: Pointer to struct vm_operations_struct, which provides
  callbacks for fault handling (.fault), page writeback (.page_mkwrite),
  and cleanup (.close).
- vm_file: For file-backed mappings, points to the struct file.
- vm_pgoff: The offset within the file (in pages) for file-backed
  mappings.
- anon_vma: For anonymous (non-file) mappings, points to the reverse
  mapping structure used to find all processes sharing a page.

The VMA is organized for cache efficiency: the first cache line contains
the fields needed for VMA tree walking (vm_start, vm_end, vm_mm).

### struct mm_struct: The Address Space

Defined at include/linux/mm_types.h:1123, mm_struct represents a
process's entire virtual address space. Key fields:

- mm_mt (line 1140): The maple tree that stores all VMAs, replacing the
  older red-black tree. Lookups, insertions, and removals all go through
  the maple tree API.
- mm_count (line 1137): Reference count for the mm_struct itself.
- pgd (line 1150): Pointer to the top-level page global directory, the
  root of the hardware page tables.
- mmap_base (line 1142): Base address for the mmap region, used by
  get_unmapped_area() to find free virtual address ranges.
- task_size (line 1149): The size of the user virtual address space
  (typically 128 TB on x86-64).
- map_count: Number of VMAs in this address space.
- total_vm, locked_vm, pinned_vm, data_vm, stack_vm: Various counters
  tracking different types of mapped memory.

### mmap(): Creating a VMA

The mmap() syscall enters the kernel via SYSCALL_DEFINE6(mmap_pgoff)
at mm/mmap.c:612, which calls ksys_mmap_pgoff() at line 567. This
eventually calls do_mmap() at mm/mmap.c:335.

do_mmap() is the core VMA creation function. It:

1. Validates parameters: checks length (line 348), overflow (line 374),
   map_count limits (line 378).
2. Calls get_unmapped_area() to find a suitable virtual address range
   if MAP_FIXED is not specified.
3. Computes vm_flags from the protection and mapping flags.
4. For file-backed mappings, calls the file's mmap operation.
5. Creates the VMA via the mmap_state machinery in mm/vma.c, which
   handles merging with adjacent VMAs or creating a new one.

The mmap_state struct (mm/vma.c:10) encapsulates all state needed during
a mmap operation: the mm_struct, vma_iterator, address range, flags,
file, and page protection.

### VMA Merging

When a new mapping is adjacent to an existing one with identical
properties (same flags, same file at the right offset, same vm_ops),
the kernel merges them into a single VMA to reduce memory overhead.

The function vma_merge_new_range() at mm/vma.c:1046 handles this for
new mappings. It checks if the new range can be merged with the
predecessor VMA, the successor VMA, or both. The vma_expand() function
at mm/vma.c:1151 extends an existing VMA to absorb the new range.

VMA merging is critical for performance: a process that calls mmap()
thousands of times with compatible settings will have far fewer VMAs
than one that alternates incompatible mappings.

### The brk() Syscall

The brk() syscall at mm/mmap.c:116 (SYSCALL_DEFINE1(brk)) manages the
heap by adjusting the program break. It either expands the heap VMA
(using do_brk_flags in mm/vma.c) or shrinks it (via do_vmi_munmap).
This is how malloc() implementations like glibc's get memory for small
allocations before switching to mmap() for larger ones.


## Code Walkthrough

Trace what happens when a process calls mmap(NULL, 4096, PROT_READ|PROT_WRITE,
MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) to allocate one page of anonymous memory:

1. **Syscall entry** -- mm/mmap.c:612:
   SYSCALL_DEFINE6(mmap_pgoff) receives the parameters and calls
   ksys_mmap_pgoff() at line 567.

2. **ksys_mmap_pgoff()** -- mm/mmap.c:567:
   For MAP_ANONYMOUS, no file is involved. It calls vm_mmap_pgoff()
   which acquires mmap_lock for writing and calls do_mmap().

3. **do_mmap()** -- mm/mmap.c:335:
   Validates the 4096-byte length (page-aligned). Since addr is NULL
   and MAP_FIXED is not set, get_unmapped_area() finds a free region
   in the process's address space, typically near mmap_base.

4. **VMA creation** -- The mmap_state machinery in mm/vma.c is
   initialized via the MMAP_STATE macro (line 47). It records the
   mm, address range, vm_flags (VM_READ|VM_WRITE), and file (NULL).

5. **Merge attempt** -- vma_merge_new_range() checks if the new
   anonymous mapping can merge with adjacent VMAs. If the previous
   VMA has the same flags and is also anonymous, they merge.

6. **New VMA allocated** -- If merging is not possible, a new
   vm_area_struct is allocated from the VMA slab cache, initialized
   with the address range and flags, and inserted into the maple tree.

7. **Return to userspace** -- The virtual address of the new mapping
   is returned. No physical page is allocated yet -- that happens on
   first access via the page fault handler (demand paging).


## Hands-On Challenges

### Challenge 1: Map Your Process's VMAs (75 XP)

Write a C program that:
1. Reads and prints /proc/self/maps before any allocations.
2. Calls mmap() to create three adjacent anonymous mappings.
3. Reads /proc/self/maps again and identifies whether merging occurred.
4. Calls mprotect() on the middle mapping to change permissions.
5. Reads /proc/self/maps a third time to observe VMA splitting.

Then read mm/vma.c and find vma_merge_new_range() at line 1046.
Explain the conditions under which merging occurs.

Verification: Show the three /proc/self/maps outputs and annotate
which VMAs were merged, split, or created.

### Challenge 2: Trace do_mmap() (75 XP)

Using ftrace or printk, trace the do_mmap() function at mm/mmap.c:335
during a mmap() call. Document:
- The value of addr, len, prot, flags, vm_flags at entry.
- Whether get_unmapped_area() was called and what address it returned.
- Whether VMA merging succeeded or a new VMA was allocated.
- The final state of the maple tree entry.

Verification: Show trace output with annotations mapping to source lines.

### Challenge 3: Explore the Maple Tree (50 XP)

Read include/linux/mm_types.h:1140 where mm_mt is defined. Then:
- Write a kernel module that iterates all VMAs in the current process
  using vma_iterator (VMA_ITERATOR macro).
- For each VMA, print vm_start, vm_end, vm_flags, and whether it has
  a backing file.
- Compare the output with /proc/self/maps.

Verification: Show the module output alongside /proc/self/maps and
verify they match.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Name at least 8 fields of struct vm_area_struct at
      include/linux/mm_types.h:913 and explain their purposes.
- [ ] Trace mmap() from SYSCALL_DEFINE6(mmap_pgoff) at mm/mmap.c:612
      through do_mmap() at line 335 to VMA creation.
- [ ] Explain the maple tree (mm_mt at mm_types.h:1140) and how VMAs
      are looked up by virtual address.
- [ ] Describe VMA merging via vma_merge_new_range() at mm/vma.c:1046
      and the conditions that enable it.
- [ ] Explain the mmap_state struct at mm/vma.c:10 and how it
      encapsulates mmap operation state.
- [ ] Describe how brk() at mm/mmap.c:116 manages the heap by
      expanding or shrinking the heap VMA.
- [ ] Explain why do_mmap() does not allocate physical pages (demand
      paging defers this to the page fault handler).
