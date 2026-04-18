import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface EptWalkStep {
  id: string;
  name: string;
  function: string;
  srcRef: string;
  state: 'pending' | 'active' | 'completed';
}

export interface EptWalkState {
  step: string;
  completedSteps: string[];
  currentFunction: string;
  srcRef: string;
  steps: EptWalkStep[];
}

function cloneSteps(steps: EptWalkStep[]): EptWalkStep[] {
  return steps.map(s => ({ ...s }));
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  steps: EptWalkStep[],
  currentFunction: string,
  srcRef: string,
): AnimationFrame {
  const completedSteps = steps.filter(s => s.state === 'completed').map(s => s.id);
  const activeStep = steps.find(s => s.state === 'active');
  return {
    step,
    label,
    description,
    highlights,
    data: {
      step: activeStep?.id ?? '',
      completedSteps,
      currentFunction,
      srcRef,
      steps: cloneSteps(steps),
    } satisfies EptWalkState,
  };
}

function generateEptViolationWalkFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const steps: EptWalkStep[] = [
    { id: 'ept_violation', name: 'handle_ept_violation()', function: 'handle_ept_violation', srcRef: 'arch/x86/kvm/vmx/vmx.c:6035', state: 'pending' },
    { id: 'mmu_page_fault', name: 'kvm_mmu_page_fault()', function: 'kvm_mmu_page_fault', srcRef: 'arch/x86/kvm/mmu/mmu.c:6398', state: 'pending' },
    { id: 'tdp_page_fault', name: 'kvm_tdp_page_fault()', function: 'kvm_tdp_page_fault', srcRef: 'arch/x86/kvm/mmu/mmu.c:4923', state: 'pending' },
    { id: 'direct_page_fault', name: 'direct_page_fault()', function: 'direct_page_fault', srcRef: 'arch/x86/kvm/mmu/mmu.c:4794', state: 'pending' },
    { id: 'fast_page_fault', name: 'fast_page_fault()', function: 'fast_page_fault', srcRef: 'arch/x86/kvm/mmu/mmu.c:3660', state: 'pending' },
    { id: 'faultin_pfn', name: 'kvm_mmu_faultin_pfn()', function: 'kvm_mmu_faultin_pfn', srcRef: 'arch/x86/kvm/mmu/mmu.c:4642', state: 'pending' },
    { id: 'tdp_mmu_map', name: 'kvm_tdp_mmu_map()', function: 'kvm_tdp_mmu_map', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1263', state: 'pending' },
    { id: 'walk_levels', name: 'for_each_tdp_pte() walk', function: 'kvm_tdp_mmu_map', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1279', state: 'pending' },
    { id: 'alloc_sp', name: 'tdp_mmu_alloc_sp()', function: 'tdp_mmu_alloc_sp', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1304', state: 'pending' },
    { id: 'map_target', name: 'tdp_mmu_map_handle_target_level()', function: 'tdp_mmu_map_handle_target_level', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1168', state: 'pending' },
  ];

  // Frame 0: EPT violation VM exit
  steps[0].state = 'active';
  frames.push(makeFrame(
    0,
    'EPT Violation VM Exit',
    'The guest accesses an unmapped guest physical address (GPA), causing an EPT violation VM exit. The VMX exit handler handle_ept_violation() at arch/x86/kvm/vmx/vmx.c:6035 reads the faulting GPA from GUEST_PHYSICAL_ADDRESS via vmcs_read64() at line 6051 and the exit qualification at line 6037. It calls __vmx_handle_ept_violation() at line 6065, which invokes kvm_mmu_page_fault().',
    ['ept_violation'],
    steps,
    'handle_ept_violation',
    'arch/x86/kvm/vmx/vmx.c:6035 handle_ept_violation()',
  ));

  // Frame 1: kvm_mmu_page_fault
  steps[0].state = 'completed';
  steps[1].state = 'active';
  frames.push(makeFrame(
    1,
    'MMU Page Fault Entry',
    'kvm_mmu_page_fault() at arch/x86/kvm/mmu/mmu.c:6398 is the central MMU fault handler. It validates the root HPA at line 6404, checks for reserved bit faults (MMIO emulation) at line 6422, increments vcpu->stat.pf_taken at line 6432, and dispatches to kvm_mmu_do_page_fault() at line 6434. For TDP (two-dimensional paging), this calls the vcpu mmu->page_fault handler.',
    ['mmu_page_fault'],
    steps,
    'kvm_mmu_page_fault',
    'arch/x86/kvm/mmu/mmu.c:6398 kvm_mmu_page_fault()',
  ));

  // Frame 2: kvm_tdp_page_fault
  steps[1].state = 'completed';
  steps[2].state = 'active';
  frames.push(makeFrame(
    2,
    'TDP Page Fault Dispatch',
    'kvm_tdp_page_fault() at arch/x86/kvm/mmu/mmu.c:4923 is the TDP-specific fault handler assigned to mmu->page_fault at line 5809. On x86_64 with tdp_mmu_enabled (line 4926), it calls kvm_tdp_mmu_page_fault() in arch/x86/kvm/mmu/tdp_mmu.c. Otherwise it falls through to direct_page_fault() at line 4930 for the legacy shadow-based TDP path.',
    ['tdp_page_fault'],
    steps,
    'kvm_tdp_page_fault',
    'arch/x86/kvm/mmu/mmu.c:4923 kvm_tdp_page_fault()',
  ));

  // Frame 3: direct_page_fault
  steps[2].state = 'completed';
  steps[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Direct Page Fault Path',
    'direct_page_fault() at arch/x86/kvm/mmu/mmu.c:4794 handles the legacy (non-TDP MMU) path. It first attempts fast_page_fault() at line 4805 for permission-only fixes without taking mmu_lock. Then it calls mmu_topup_memory_caches() at line 4809, kvm_mmu_faultin_pfn() at line 4813 to resolve GPA to host PFN, and finally takes mmu_lock (write_lock at line 4818) before calling direct_map() at line 4827.',
    ['direct_page_fault'],
    steps,
    'direct_page_fault',
    'arch/x86/kvm/mmu/mmu.c:4794 direct_page_fault()',
  ));

  // Frame 4: fast_page_fault
  steps[3].state = 'completed';
  steps[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Fast Page Fault Attempt',
    'fast_page_fault() at arch/x86/kvm/mmu/mmu.c:3660 attempts to resolve the fault without acquiring mmu_lock by using atomic compare-and-swap on the SPTE. This handles common cases like write-protection faults on access-tracked pages. If the SPTE already has the correct mapping but wrong permissions, it can be fixed in-place. Returns RET_PF_INVALID if the fast path cannot handle the fault.',
    ['fast_page_fault'],
    steps,
    'fast_page_fault',
    'arch/x86/kvm/mmu/mmu.c:3660 fast_page_fault()',
  ));

  // Frame 5: kvm_mmu_faultin_pfn
  steps[4].state = 'completed';
  steps[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Resolve GPA to Host PFN',
    'kvm_mmu_faultin_pfn() at arch/x86/kvm/mmu/mmu.c:4642 translates the guest frame number (GFN) to a host physical frame number (PFN). It snapshots mmu_invalidate_seq at line 4658 with smp_rmb() for consistency, checks the memory slot at line 4670, and calls __kvm_faultin_pfn() to pin the host page. This bridges the GPA-to-HVA (via memslot) and HVA-to-HPA (via host page tables) translations.',
    ['faultin_pfn'],
    steps,
    'kvm_mmu_faultin_pfn',
    'arch/x86/kvm/mmu/mmu.c:4642 kvm_mmu_faultin_pfn()',
  ));

  // Frame 6: kvm_tdp_mmu_map
  steps[5].state = 'completed';
  steps[6].state = 'active';
  frames.push(makeFrame(
    6,
    'TDP MMU Map Entry',
    'kvm_tdp_mmu_map() at arch/x86/kvm/mmu/tdp_mmu.c:1263 handles the actual EPT page table walk and mapping. It gets the root shadow page via tdp_mmu_get_root_for_fault() at line 1265, calls kvm_mmu_hugepage_adjust() at line 1273 to determine the optimal mapping level, and enters an RCU read-side critical section at line 1277 before walking the EPT hierarchy.',
    ['tdp_mmu_map'],
    steps,
    'kvm_tdp_mmu_map',
    'arch/x86/kvm/mmu/tdp_mmu.c:1263 kvm_tdp_mmu_map()',
  ));

  // Frame 7: Walk EPT levels
  steps[6].state = 'completed';
  steps[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Walk EPT Levels: PML4 -> PDPT -> PD -> PT',
    'The for_each_tdp_pte() loop at arch/x86/kvm/mmu/tdp_mmu.c:1279 walks from the EPT root (PML4, level 4) down through PDPT (level 3), PD (level 2), to PT (level 1). At each non-leaf level, if the SPTE is not present (line 1296), it allocates a new shadow page via tdp_mmu_alloc_sp() at line 1304, initializes it with tdp_mmu_init_child_sp() at line 1305, and links it with tdp_mmu_link_sp() at line 1316.',
    ['walk_levels'],
    steps,
    'kvm_tdp_mmu_map',
    'arch/x86/kvm/mmu/tdp_mmu.c:1279 for_each_tdp_pte()',
  ));

  // Frame 8: Allocate missing levels
  steps[7].state = 'completed';
  steps[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Allocate Shadow Page Tables',
    'When a non-present SPTE is encountered during the walk, tdp_mmu_alloc_sp() at arch/x86/kvm/mmu/tdp_mmu.c:1304 allocates a kvm_mmu_page structure. tdp_mmu_link_sp() at line 1316 installs the new page table by atomically setting the parent SPTE via tdp_mmu_set_spte_atomic() (line 1244 in tdp_mmu_link_sp). Each new page table is accounted via tdp_account_mmu_page() at line 1251.',
    ['alloc_sp'],
    steps,
    'tdp_mmu_alloc_sp',
    'arch/x86/kvm/mmu/tdp_mmu.c:1304 tdp_mmu_alloc_sp()',
  ));

  // Frame 9: Map target level
  steps[8].state = 'completed';
  steps[9].state = 'active';
  frames.push(makeFrame(
    9,
    'Install Final EPT Entry',
    'When iter.level reaches fault->goal_level (line 1292), the walk jumps to map_target_level at line 1344. tdp_mmu_map_handle_target_level() at arch/x86/kvm/mmu/tdp_mmu.c:1168 creates the final leaf SPTE via make_spte() at line 1190, which encodes the host PFN, access permissions, and memory type. The SPTE is installed atomically via tdp_mmu_set_spte_atomic() at line 1196. The guest can now access the GPA without further VM exits.',
    ['map_target'],
    steps,
    'tdp_mmu_map_handle_target_level',
    'arch/x86/kvm/mmu/tdp_mmu.c:1168 tdp_mmu_map_handle_target_level()',
  ));

  return frames;
}

function generateMemorySlotSetupFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const steps: EptWalkStep[] = [
    { id: 'ioctl_entry', name: 'KVM_SET_USER_MEMORY_REGION ioctl', function: 'kvm_vm_ioctl', srcRef: 'virt/kvm/kvm_main.c:5208', state: 'pending' },
    { id: 'set_memory_region', name: 'kvm_vm_ioctl_set_memory_region()', function: 'kvm_vm_ioctl_set_memory_region', srcRef: 'virt/kvm/kvm_main.c:2147', state: 'pending' },
    { id: 'kvm_set_memory_region', name: 'kvm_set_memory_region()', function: 'kvm_set_memory_region', srcRef: 'virt/kvm/kvm_main.c:2001', state: 'pending' },
    { id: 'validate_region', name: 'Validate memory region', function: 'kvm_set_memory_region', srcRef: 'virt/kvm/kvm_main.c:2014', state: 'pending' },
    { id: 'kvm_set_memslot', name: 'kvm_set_memslot()', function: 'kvm_set_memslot', srcRef: 'virt/kvm/kvm_main.c:1893', state: 'pending' },
    { id: 'prepare_region', name: 'kvm_prepare_memory_region()', function: 'kvm_prepare_memory_region', srcRef: 'virt/kvm/kvm_main.c:1665', state: 'pending' },
    { id: 'create_memslot', name: 'kvm_create_memslot()', function: 'kvm_create_memslot', srcRef: 'virt/kvm/kvm_main.c:1964', state: 'pending' },
    { id: 'commit_region', name: 'kvm_commit_memory_region()', function: 'kvm_commit_memory_region', srcRef: 'virt/kvm/kvm_main.c:1703', state: 'pending' },
    { id: 'lazy_populate', name: 'Lazy EPT population', function: 'kvm_tdp_page_fault', srcRef: 'arch/x86/kvm/mmu/mmu.c:4923', state: 'pending' },
  ];

  // Frame 0: ioctl entry
  steps[0].state = 'active';
  frames.push(makeFrame(
    0,
    'QEMU issues KVM_SET_USER_MEMORY_REGION ioctl',
    'QEMU (or another VMM) calls ioctl(vm_fd, KVM_SET_USER_MEMORY_REGION, &mem) to register a guest memory region. The KVM ioctl dispatcher at virt/kvm/kvm_main.c:5208 handles KVM_SET_USER_MEMORY_REGION by calling kvm_vm_ioctl_set_memory_region(). The userspace_memory_region2 struct specifies slot ID, flags, guest_phys_addr (GPA base), memory_size, and userspace_addr (HVA).',
    ['ioctl_entry'],
    steps,
    'kvm_vm_ioctl',
    'virt/kvm/kvm_main.c:5208 KVM_SET_USER_MEMORY_REGION',
  ));

  // Frame 1: kvm_vm_ioctl_set_memory_region
  steps[0].state = 'completed';
  steps[1].state = 'active';
  frames.push(makeFrame(
    1,
    'Entry: kvm_vm_ioctl_set_memory_region()',
    'kvm_vm_ioctl_set_memory_region() at virt/kvm/kvm_main.c:2147 validates that the slot number is within KVM_USER_MEM_SLOTS at line 2150. It then acquires kvm->slots_lock via guard(mutex) at line 2153 and calls kvm_set_memory_region() at line 2154. The slots_lock serializes all memory region modifications.',
    ['set_memory_region'],
    steps,
    'kvm_vm_ioctl_set_memory_region',
    'virt/kvm/kvm_main.c:2147 kvm_vm_ioctl_set_memory_region()',
  ));

  // Frame 2: kvm_set_memory_region
  steps[1].state = 'completed';
  steps[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Core: kvm_set_memory_region()',
    'kvm_set_memory_region() at virt/kvm/kvm_main.c:2001 performs extensive validation: page-aligned memory_size at line 2022, page-aligned guest_phys_addr at line 2025, and page-aligned userspace_addr at line 2028. It computes npages, base_gfn, and determines the change type (CREATE, DELETE, MOVE, FLAGS_ONLY) by comparing with existing slots.',
    ['kvm_set_memory_region'],
    steps,
    'kvm_set_memory_region',
    'virt/kvm/kvm_main.c:2001 kvm_set_memory_region()',
  ));

  // Frame 3: Validate region
  steps[2].state = 'completed';
  steps[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Validate Memory Region Parameters',
    'kvm_set_memory_region() calls check_memory_region_flags() at virt/kvm/kvm_main.c:2014 to verify no unsupported flags are set. It extracts the address space ID (as_id) from the upper 16 bits of the slot at line 2018 and the slot ID from the lower 16 bits at line 2019. It checks for overlapping memslots via kvm_check_memslot_overlap() to prevent conflicting GPA ranges.',
    ['validate_region'],
    steps,
    'kvm_set_memory_region',
    'virt/kvm/kvm_main.c:2014 check_memory_region_flags()',
  ));

  // Frame 4: kvm_set_memslot
  steps[3].state = 'completed';
  steps[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Activate Memslot: kvm_set_memslot()',
    'kvm_set_memslot() at virt/kvm/kvm_main.c:1893 acquires slots_arch_lock at line 1915 to serialize with vCPU page fault handlers. For DELETE/MOVE operations, it first invalidates the old slot at line 1936 via kvm_invalidate_memslot() to ensure no stale mappings exist. This two-phase approach prevents races where vCPUs could access a non-existent memslot.',
    ['kvm_set_memslot'],
    steps,
    'kvm_set_memslot',
    'virt/kvm/kvm_main.c:1893 kvm_set_memslot()',
  ));

  // Frame 5: prepare_region
  steps[4].state = 'completed';
  steps[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Prepare: kvm_prepare_memory_region()',
    'kvm_prepare_memory_region() at virt/kvm/kvm_main.c:1665 handles dirty logging setup: if KVM_MEM_LOG_DIRTY_PAGES is set, it allocates a dirty bitmap via kvm_alloc_dirty_bitmap() at line 1685. It then calls kvm_arch_prepare_memory_region() at line 1694, which on x86 may set up the memslot arch-specific data (rmap arrays, lpage_info for large page tracking).',
    ['prepare_region'],
    steps,
    'kvm_prepare_memory_region',
    'virt/kvm/kvm_main.c:1665 kvm_prepare_memory_region()',
  ));

  // Frame 6: create_memslot
  steps[5].state = 'completed';
  steps[6].state = 'active';
  frames.push(makeFrame(
    6,
    'Create: kvm_create_memslot()',
    'For KVM_MR_CREATE change type, kvm_set_memslot() calls kvm_create_memslot() at virt/kvm/kvm_main.c:1964. This adds the new kvm_memory_slot to the kvm_memslots array, mapping a GPA range [base_gfn, base_gfn+npages) to the userspace HVA. The memslot structure enables KVM to translate guest physical addresses to host virtual addresses during page fault handling.',
    ['create_memslot'],
    steps,
    'kvm_create_memslot',
    'virt/kvm/kvm_main.c:1964 kvm_create_memslot()',
  ));

  // Frame 7: commit_region
  steps[6].state = 'completed';
  steps[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Commit: kvm_commit_memory_region()',
    'kvm_commit_memory_region() at virt/kvm/kvm_main.c:1703 finalizes the memslot change. It calls kvm_arch_commit_memory_region() to notify the architecture layer. On x86, this updates the MMU notifier hooks and may flush stale TLB entries. The old dirty bitmap is freed if no longer needed. After commit, the memslot is fully visible to all vCPUs.',
    ['commit_region'],
    steps,
    'kvm_commit_memory_region',
    'virt/kvm/kvm_main.c:1703 kvm_commit_memory_region()',
  ));

  // Frame 8: lazy populate
  steps[7].state = 'completed';
  steps[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Lazy EPT Population on First Access',
    'EPT entries are NOT populated when the memslot is created. The EPT page tables are populated lazily: when a vCPU first accesses a GPA in the new memslot, it triggers an EPT violation. kvm_tdp_page_fault() at arch/x86/kvm/mmu/mmu.c:4923 handles the fault, looks up the memslot to find the HVA, resolves it to a host PFN, and installs the EPT mapping. This lazy approach avoids pre-faulting potentially gigabytes of guest memory.',
    ['lazy_populate'],
    steps,
    'kvm_tdp_page_fault',
    'arch/x86/kvm/mmu/mmu.c:4923 kvm_tdp_page_fault()',
  ));

  return frames;
}

function generateLargePageMappingFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const steps: EptWalkStep[] = [
    { id: 'ept_violation', name: 'EPT violation on 2MB-aligned GPA', function: 'handle_ept_violation', srcRef: 'arch/x86/kvm/vmx/vmx.c:6035', state: 'pending' },
    { id: 'tdp_page_fault', name: 'kvm_tdp_page_fault()', function: 'kvm_tdp_page_fault', srcRef: 'arch/x86/kvm/mmu/mmu.c:4923', state: 'pending' },
    { id: 'faultin_pfn', name: 'kvm_mmu_faultin_pfn()', function: 'kvm_mmu_faultin_pfn', srcRef: 'arch/x86/kvm/mmu/mmu.c:4642', state: 'pending' },
    { id: 'tdp_mmu_map', name: 'kvm_tdp_mmu_map()', function: 'kvm_tdp_mmu_map', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1263', state: 'pending' },
    { id: 'hugepage_adjust', name: 'kvm_mmu_hugepage_adjust()', function: 'kvm_mmu_hugepage_adjust', srcRef: 'arch/x86/kvm/mmu/mmu.c:3380', state: 'pending' },
    { id: 'max_mapping_level', name: 'kvm_mmu_max_mapping_level()', function: 'kvm_mmu_max_mapping_level', srcRef: 'arch/x86/kvm/mmu/mmu.c:3400', state: 'pending' },
    { id: 'walk_to_pd', name: 'Walk EPT: PML4 -> PDPT -> PD', function: 'kvm_tdp_mmu_map', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1279', state: 'pending' },
    { id: 'map_large', name: 'tdp_mmu_map_handle_target_level()', function: 'tdp_mmu_map_handle_target_level', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1168', state: 'pending' },
    { id: 'tlb_benefit', name: 'TLB performance benefit', function: 'kvm_tdp_mmu_map', srcRef: 'arch/x86/kvm/mmu/tdp_mmu.c:1345', state: 'pending' },
  ];

  // Frame 0: EPT violation on 2MB-aligned region
  steps[0].state = 'active';
  frames.push(makeFrame(
    0,
    'EPT Violation on 2MB-Aligned GPA',
    'The guest accesses a GPA within a 2MB-aligned region backed by contiguous host memory. handle_ept_violation() at arch/x86/kvm/vmx/vmx.c:6035 triggers a VM exit. The GPA is 2MB-aligned (bits [20:0] are zero relative to the 2MB boundary), and the backing host pages are also physically contiguous, making this eligible for a large page EPT mapping.',
    ['ept_violation'],
    steps,
    'handle_ept_violation',
    'arch/x86/kvm/vmx/vmx.c:6035 handle_ept_violation()',
  ));

  // Frame 1: kvm_tdp_page_fault
  steps[0].state = 'completed';
  steps[1].state = 'active';
  frames.push(makeFrame(
    1,
    'TDP Page Fault Entry',
    'kvm_tdp_page_fault() at arch/x86/kvm/mmu/mmu.c:4923 initializes the kvm_page_fault structure with fault->max_level set based on the memslot lpage_info. For a 2MB large page, max_level starts at PG_LEVEL_2M. The fault->gfn identifies the guest frame number within the 2MB range.',
    ['tdp_page_fault'],
    steps,
    'kvm_tdp_page_fault',
    'arch/x86/kvm/mmu/mmu.c:4923 kvm_tdp_page_fault()',
  ));

  // Frame 2: faultin_pfn
  steps[1].state = 'completed';
  steps[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Resolve Host PFN for Large Page',
    'kvm_mmu_faultin_pfn() at arch/x86/kvm/mmu/mmu.c:4642 resolves the GFN to a host PFN. For large page eligibility, the host backing pages at the HVA must be physically contiguous and aligned to a 2MB boundary. The PFN returned will be used by kvm_mmu_hugepage_adjust() to verify large page feasibility.',
    ['faultin_pfn'],
    steps,
    'kvm_mmu_faultin_pfn',
    'arch/x86/kvm/mmu/mmu.c:4642 kvm_mmu_faultin_pfn()',
  ));

  // Frame 3: kvm_tdp_mmu_map entry
  steps[2].state = 'completed';
  steps[3].state = 'active';
  frames.push(makeFrame(
    3,
    'TDP MMU Map with Large Page Support',
    'kvm_tdp_mmu_map() at arch/x86/kvm/mmu/tdp_mmu.c:1263 begins the page table walk. Before entering the walk loop, it calls kvm_mmu_hugepage_adjust() at line 1273 to determine whether the mapping can use a large page. This is the key decision point for 2MB vs 4KB mapping granularity.',
    ['tdp_mmu_map'],
    steps,
    'kvm_tdp_mmu_map',
    'arch/x86/kvm/mmu/tdp_mmu.c:1263 kvm_tdp_mmu_map()',
  ));

  // Frame 4: kvm_mmu_hugepage_adjust
  steps[3].state = 'completed';
  steps[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Hugepage Adjust: Check Large Page Eligibility',
    'kvm_mmu_hugepage_adjust() at arch/x86/kvm/mmu/mmu.c:3380 determines the optimal mapping level. It checks fault->max_level at line 3387 (must be > PG_LEVEL_4K), verifies dirty tracking is not enabled at line 3393 (dirty tracking requires 4K granularity), and calls kvm_mmu_max_mapping_level() at line 3400 to query the host page size. If eligible, it sets fault->goal_level to PG_LEVEL_2M and aligns fault->pfn at line 3412.',
    ['hugepage_adjust'],
    steps,
    'kvm_mmu_hugepage_adjust',
    'arch/x86/kvm/mmu/mmu.c:3380 kvm_mmu_hugepage_adjust()',
  ));

  // Frame 5: max mapping level
  steps[4].state = 'completed';
  steps[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Determine Maximum Mapping Level',
    'kvm_mmu_max_mapping_level() called at arch/x86/kvm/mmu/mmu.c:3400 queries the host page table to determine the physical mapping level via host_pfn_mapping_level() at line 3376. If the host backs the GFN with a 2MB transparent huge page (THP) or hugetlbfs page, it returns PG_LEVEL_2M. The result is capped by the memslot lpage_info, which tracks per-page large page disallow counts.',
    ['max_mapping_level'],
    steps,
    'kvm_mmu_max_mapping_level',
    'arch/x86/kvm/mmu/mmu.c:3400 kvm_mmu_max_mapping_level()',
  ));

  // Frame 6: Walk to PD level
  steps[5].state = 'completed';
  steps[6].state = 'active';
  frames.push(makeFrame(
    6,
    'Walk EPT: PML4 -> PDPT -> PD (Stop at Level 2)',
    'The for_each_tdp_pte() walk at arch/x86/kvm/mmu/tdp_mmu.c:1279 descends from PML4 (level 4) through PDPT (level 3) to PD (level 2). Because fault->goal_level is PG_LEVEL_2M (level 2), the walk stops at the PD level when iter.level == fault->goal_level at line 1292. Only 3 levels are traversed instead of 4, reducing the number of page table allocations needed.',
    ['walk_to_pd'],
    steps,
    'kvm_tdp_mmu_map',
    'arch/x86/kvm/mmu/tdp_mmu.c:1279 for_each_tdp_pte() walk',
  ));

  // Frame 7: Install 2MB large page SPTE
  steps[6].state = 'completed';
  steps[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Install 2MB Large Page EPT Entry',
    'tdp_mmu_map_handle_target_level() at arch/x86/kvm/mmu/tdp_mmu.c:1168 installs the leaf SPTE at PD level (level 2). make_spte() at line 1190 creates a large page SPTE with the PS (Page Size) bit set, mapping 512 contiguous 4KB pages (2MB total) with a single EPT entry. The SPTE is atomically installed via tdp_mmu_set_spte_atomic() at line 1196.',
    ['map_large'],
    steps,
    'tdp_mmu_map_handle_target_level',
    'arch/x86/kvm/mmu/tdp_mmu.c:1168 tdp_mmu_map_handle_target_level()',
  ));

  // Frame 8: TLB performance benefit
  steps[7].state = 'completed';
  steps[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Performance Benefit: Reduced TLB Pressure',
    'With a 2MB large page EPT entry, the hardware EPT walker needs only 3 memory accesses (PML4->PDPT->PD) instead of 4 (PML4->PDPT->PD->PT) for address translation. A single TLB entry covers 2MB (512 pages) instead of 4KB, dramatically reducing TLB misses for workloads with spatial locality. Combined with nested paging (guest PT walk x EPT walk), large pages reduce the worst-case 24 memory accesses (4 guest levels x 4 EPT levels + 4 EPT levels for final GPA) to fewer lookups.',
    ['tlb_benefit'],
    steps,
    'kvm_tdp_mmu_map',
    'arch/x86/kvm/mmu/tdp_mmu.c:1345 tdp_mmu_map_handle_target_level()',
  ));

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'ept-violation-walk', label: 'EPT Violation: Full Page Walk' },
  { id: 'memory-slot-setup', label: 'Memory Slot Setup (KVM_SET_USER_MEMORY_REGION)' },
  { id: 'large-page-mapping', label: 'Large Page (2MB) EPT Mapping' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as EptWalkState;
  const { steps } = data;
  const margin = { top: 24, right: 16, bottom: 16, left: 16 };
  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'KVM EPT Page Table Walk';
  container.appendChild(titleEl);

  // Draw steps as a vertical timeline
  const stepCount = steps.length;
  const rowHeight = Math.min(28, usableHeight / stepCount);
  const boxWidth = Math.min(usableWidth * 0.6, 260);
  const boxX = margin.left + (usableWidth - boxWidth) / 2;

  for (let i = 0; i < stepCount; i++) {
    const s = steps[i];
    const y = margin.top + i * rowHeight;

    // Connector line to next step
    if (i < stepCount - 1) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(boxX + boxWidth / 2));
      line.setAttribute('y1', String(y + rowHeight * 0.6));
      line.setAttribute('x2', String(boxX + boxWidth / 2));
      line.setAttribute('y2', String(y + rowHeight));
      line.setAttribute('class', 'anim-connector');
      line.setAttribute('stroke', '#666');
      line.setAttribute('stroke-width', '1');
      container.appendChild(line);
    }

    // Step box
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(boxX));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxWidth));
    rect.setAttribute('height', String(rowHeight * 0.6));
    rect.setAttribute('rx', '4');

    let cls = `anim-phase anim-phase-${s.state}`;
    if (frame.highlights.includes(s.id)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Step label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(boxX + boxWidth / 2));
    label.setAttribute('y', String(y + rowHeight * 0.38));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-function');
    label.textContent = s.name;
    container.appendChild(label);

    // Source reference on the right
    const srcLabel = document.createElementNS(NS, 'text');
    srcLabel.setAttribute('x', String(boxX + boxWidth + 8));
    srcLabel.setAttribute('y', String(y + rowHeight * 0.38));
    srcLabel.setAttribute('class', 'anim-srcref');
    srcLabel.textContent = s.srcRef;
    container.appendChild(srcLabel);
  }

  // Current function indicator
  const fnLabel = document.createElementNS(NS, 'text');
  fnLabel.setAttribute('x', String(margin.left));
  fnLabel.setAttribute('y', String(margin.top + stepCount * rowHeight + 12));
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.textContent = `Current: ${data.currentFunction}()`;
  container.appendChild(fnLabel);
}

const kvmEptWalk: AnimationModule = {
  config: {
    id: 'kvm-ept-walk',
    title: 'KVM EPT Page Table Walk',
    skillName: 'kvm-memory-virtualization',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'memory-slot-setup':
        return generateMemorySlotSetupFrames();
      case 'large-page-mapping':
        return generateLargePageMappingFrames();
      case 'ept-violation-walk':
      default:
        return generateEptViolationWalkFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default kvmEptWalk;
