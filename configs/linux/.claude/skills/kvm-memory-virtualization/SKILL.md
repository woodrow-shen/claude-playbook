---
name: kvm-memory-virtualization
description: Understand EPT/NPT nested page tables and KVM memory slot management
realm: virtualization
category: kvm-memory
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - kvm-fundamentals
  - page-fault-handling
unlocks: []
kernel_files:
  - arch/x86/kvm/mmu/mmu.c
  - arch/x86/kvm/mmu/tdp_mmu.c
  - virt/kvm/kvm_main.c
doc_files:
  - Documentation/virt/kvm/mmu.rst
badge: Nested Page Master
tags:
  - ept
  - npt
  - tdp
  - nested-paging
---

# KVM Memory Virtualization

## Quest Briefing

Memory virtualization is KVM's most complex subsystem. The guest operates
with its own virtual and physical address spaces, but guest physical
addresses do not correspond to real host physical addresses. The kernel
must provide a second level of address translation: guest physical to host
physical. On modern hardware, this is done in silicon through Extended Page
Tables (EPT on Intel) or Nested Page Tables (NPT on AMD).

When a guest accesses memory, the hardware walks two page table hierarchies:
first the guest page tables (translating guest virtual to guest physical),
then the EPT/NPT tables (translating guest physical to host physical). If
either walk fails, a fault occurs -- an EPT violation triggers a VM exit,
and KVM must populate the missing translation by consulting the memory
slot mappings and the host page tables.

This two-dimensional page table walk is one of the most performance-critical
paths in KVM. The TDP (Two-Dimensional Paging) MMU in tdp_mmu.c is the
modern implementation that handles this efficiently.


## Learning Objectives

- Explain the two-level address translation (GVA -> GPA -> HPA).
- Trace an EPT violation from VM exit through KVM's page fault handler.
- Describe KVM memory slots and the GPA-to-HPA mapping.
- Understand the TDP MMU implementation in tdp_mmu.c.
- Explain large page (2MB/1GB) support and page splitting in KVM.


## Core Concepts

### Two-Dimensional Paging

Without hardware support, KVM would need shadow page tables -- maintaining
a kernel-managed copy of guest page tables that directly maps guest virtual
to host physical. This is expensive: every guest page table modification
triggers a VM exit.

With EPT/NPT, the hardware handles both translations. The guest maintains
its own page tables (GVA -> GPA), and KVM maintains the EPT/NPT tables
(GPA -> HPA). The hardware MMU walks both automatically. VM exits only
occur when the EPT/NPT translation is missing (EPT violation).

### Memory Slots

KVM uses memory slots (struct kvm_memory_slot) to define the GPA-to-HPA
mapping. The userspace VMM (QEMU) calls KVM_SET_USER_MEMORY_REGION to
register host virtual address ranges as guest physical memory.
kvm_set_memory_region() in kvm_main.c processes this, creating or
modifying slots in the memslots array.

When an EPT violation occurs, KVM looks up the faulting GPA in the memory
slots to find the corresponding host virtual address, then resolves that
to a host physical address (HPA) by walking the host page tables. The
HPA is then installed in the EPT.

### The TDP MMU

The TDP MMU (arch/x86/kvm/mmu/tdp_mmu.c) is KVM's modern page fault
handler for EPT/NPT. When an EPT violation occurs:

1. kvm_mmu_page_fault() in mmu.c is called with the faulting GPA.
2. It calls kvm_tdp_page_fault() which enters the TDP MMU.
3. tdp_mmu_map_handle_target_level() walks the EPT hierarchy, allocating
   intermediate page table pages as needed.
4. At the leaf level, it resolves the GPA to HPA (via memory slots and
   host page tables), allocates an EPT entry, and installs it.
5. Returns to the guest without a userspace round-trip.

The TDP MMU uses RCU for concurrent access to page tables, allowing
multiple vCPUs to handle EPT violations in parallel without global locks.

### Large Pages and Splitting

KVM supports 2MB and 1GB mappings in EPT for TLB efficiency. If a
large contiguous region of guest memory maps to contiguous host memory,
KVM installs a large page. However, certain operations (dirty tracking,
memory slot changes) require splitting large pages back to 4KB. The
kvm_mmu_try_split_huge_pages() function handles this.


## Code Walkthrough

Trace an EPT violation during guest execution:

1. **Guest accesses unmapped GPA** -- The hardware walks the guest page
   tables (GVA -> GPA), then the EPT (GPA -> HPA). The EPT walk fails
   because no mapping exists. The CPU triggers an EPT violation VM exit.

2. **VM exit handling** -- vmx_handle_exit() reads the exit reason
   (EXIT_REASON_EPT_VIOLATION). It extracts the faulting GPA and access
   type (read/write/execute) from VMCS fields.

3. **kvm_mmu_page_fault()** in arch/x86/kvm/mmu/mmu.c handles the
   fault. It looks up the GPA in memory slots to find the host virtual
   address.

4. **Host page resolution** -- hva_to_pfn() walks the host page tables
   (or calls get_user_pages) to find the host physical frame number (PFN).

5. **EPT entry installation** -- The TDP MMU walks the EPT hierarchy,
   creating intermediate tables as needed, and installs the GPA->HPA
   mapping at the leaf level.

6. **Return to guest** -- The VM exit handler returns 1 (handled),
   causing the run loop to re-enter the guest. The hardware retries the
   memory access, which now succeeds through the newly-installed EPT entry.


## Hands-On Challenges

### Challenge 1: Memory Slot Mapping (75 XP)

Read virt/kvm/kvm_main.c and:
1. Find KVM_SET_USER_MEMORY_REGION handling and trace how slots are created.
2. How does KVM look up a GPA in the memslots to find the HVA?
3. What happens when a slot is deleted or modified?

Verification: Trace the slot creation path with function names.

### Challenge 2: EPT Violation Deep Dive (100 XP)

Read arch/x86/kvm/mmu/mmu.c and tdp_mmu.c:
1. Trace kvm_mmu_page_fault() from VM exit to EPT entry installation.
2. How does the TDP MMU allocate intermediate page table pages?
3. How does RCU protect concurrent page table access from multiple vCPUs?

Verification: Annotate the EPT fault path with line numbers.

### Challenge 3: Large Page Behavior (125 XP)

Investigate large page support:
1. When does KVM install a 2MB EPT entry vs a 4KB entry?
2. What triggers large page splitting? Find the splitting code.
3. How does dirty page tracking interact with large pages?

Verification: Explain the large page decision logic with code references.


## Verification Criteria

- [ ] Explain two-dimensional paging: GVA -> GPA (guest PT) -> HPA (EPT).
- [ ] Trace an EPT violation from VM exit through kvm_mmu_page_fault().
- [ ] Describe memory slots and GPA-to-HVA-to-HPA resolution.
- [ ] Explain the TDP MMU's EPT page table walk and entry installation.
- [ ] Describe how RCU enables lock-free concurrent EPT fault handling.
- [ ] Explain large page support and when splitting occurs.
- [ ] Describe the difference between shadow paging and hardware TDP.
