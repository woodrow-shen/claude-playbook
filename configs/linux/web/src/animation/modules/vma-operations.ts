import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface VmaEntry {
  id: string;
  label: string;
  start: string;
  end: string;
  flags: string;
  state: 'existing' | 'new' | 'merged' | 'split' | 'removed' | 'modified';
}

export interface UnmapDescSnapshot {
  start: string;
  end: string;
  mm: string;
  uf?: string;
}

export interface VmaState {
  currentFunction: string;
  srcRef: string;
  vmas: VmaEntry[];
  description: string;
  /** v7.0: indicates whether VMA uses the legacy bitmask or the new structured type */
  vmaFlagsType?: 'legacy' | 'typed';
  /** v7.0: snapshot of struct unmap_desc fields when the refactor scenario is running */
  unmapDesc?: UnmapDescSnapshot;
}

function cloneVmas(vmas: VmaEntry[]): VmaEntry[] {
  return vmas.map(v => ({ ...v }));
}

/** Clone a VmaState snapshot -- used by scenarios that carry extra optional fields. */
function cloneState(state: VmaState): VmaState {
  return {
    currentFunction: state.currentFunction,
    srcRef: state.srcRef,
    vmas: cloneVmas(state.vmas),
    description: state.description,
    vmaFlagsType: state.vmaFlagsType,
    unmapDesc: state.unmapDesc ? { ...state.unmapDesc } : undefined,
  };
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  vmas: VmaEntry[],
  currentFunction: string,
  srcRef: string,
  extras?: Pick<VmaState, 'vmaFlagsType' | 'unmapDesc'>,
): AnimationFrame {
  const state: VmaState = {
    currentFunction,
    srcRef,
    vmas: cloneVmas(vmas),
    description,
    vmaFlagsType: extras?.vmaFlagsType,
    unmapDesc: extras?.unmapDesc ? { ...extras.unmapDesc } : undefined,
  };
  return {
    step,
    label,
    description,
    highlights,
    data: cloneState(state),
  };
}

function generateMmapAnonymousFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Initial address space with existing VMAs
  const vmas: VmaEntry[] = [
    { id: 'text', label: '[text]', start: '0x400000', end: '0x420000', flags: 'r-xp', state: 'existing' },
    { id: 'data', label: '[data]', start: '0x620000', end: '0x624000', flags: 'rw-p', state: 'existing' },
    { id: 'heap', label: '[heap]', start: '0x1000000', end: '0x1020000', flags: 'rw-p', state: 'existing' },
    { id: 'stack', label: '[stack]', start: '0x7ffd00000', end: '0x7ffd21000', flags: 'rw-p', state: 'existing' },
  ];

  // Frame 0: Entry into do_mmap
  frames.push(makeFrame(
    0,
    'Entry: do_mmap()',
    'Userspace calls mmap(NULL, 0x4000, PROT_READ|PROT_WRITE, MAP_ANONYMOUS|MAP_PRIVATE, -1, 0). The glibc wrapper invokes the mmap2 syscall, reaching do_mmap() at mm/mmap.c:335. It validates len != 0 at line 348, applies READ_IMPLIES_EXEC personality at line 357, rounds the hint address at line 366, and PAGE_ALIGNs the length at line 369.',
    ['heap'],
    vmas,
    'do_mmap',
    'mm/mmap.c:335 do_mmap()',
  ));

  // Frame 1: Flag computation in do_mmap
  frames.push(makeFrame(
    1,
    'Flag computation: do_mmap()',
    'do_mmap() at mm/mmap.c:335 converts the userspace prot and flags into kernel vm_flags. MAP_PRIVATE sets VM_MAYWRITE, PROT_READ|PROT_WRITE sets VM_READ|VM_WRITE. MAP_ANONYMOUS means no file backing -- the VMA will represent zero-filled anonymous memory. The function calls mmap_region() at mm/mmap.c:559 to perform the actual mapping.',
    ['heap'],
    vmas,
    'do_mmap',
    'mm/mmap.c:559 mmap_region() call',
  ));

  // Frame 2: mmap_region entry
  frames.push(makeFrame(
    2,
    'Validation: mmap_region()',
    'mmap_region() at mm/vma.c:2811 validates the request. It checks MDWE (Memory-Deny-Write-Execute) at line 2821, validates architecture-specific flags at line 2825, then delegates to __mmap_region() at line 2837. For anonymous mappings, no file write mapping setup is needed.',
    ['heap'],
    vmas,
    'mmap_region',
    'mm/vma.c:2811 mmap_region()',
  ));

  // Frame 3: __mmap_region setup
  frames.push(makeFrame(
    3,
    'Setup: __mmap_region()',
    '__mmap_region() at mm/vma.c:2720 initializes a VMA_ITERATOR and MMAP_STATE. It calls __mmap_setup() at line 2741, which uses vma_find() at mm/vma.c:2400 to locate any overlapping VMAs and init_vma_munmap() at line 2401. If overlapping VMAs exist, vms_gather_munmap_vmas() at line 2411 prepares them for removal.',
    ['heap'],
    vmas,
    '__mmap_region',
    'mm/vma.c:2720 __mmap_region()',
  ));

  // Frame 4: Merge attempt
  frames.push(makeFrame(
    4,
    'Merge attempt: vma_merge_new_range()',
    '__mmap_region() attempts to merge with adjacent VMAs at mm/vma.c:2750-2755. VMG_MMAP_STATE() at line 2752 builds a vma_merge_struct, then vma_merge_new_range() at line 2754 (defined at mm/vma.c:1046) checks if prev->vm_end == start with compatible flags via can_vma_merge_left() at line 422, or next->vm_start == end via can_vma_merge_right(). For our anonymous mmap with no adjacent compatible VMA, merge returns NULL.',
    ['heap'],
    vmas,
    'vma_merge_new_range',
    'mm/vma.c:1046 vma_merge_new_range()',
  ));

  // Frame 5: Allocate new VMA
  const newVma: VmaEntry = { id: 'anon_new', label: '[anon]', start: '0x7f8000000', end: '0x7f8004000', flags: 'rw-p', state: 'new' };
  const vmasWithNew = [...vmas.slice(0, 3), newVma, vmas[3]];
  frames.push(makeFrame(
    5,
    'Allocate VMA: __mmap_new_vma()',
    'Since merge failed, __mmap_new_vma() at mm/vma.c:2506 allocates a new vm_area_struct via vm_area_alloc() at line 2517 from the vm_area_cachep slab cache. It configures the VMA: vma_set_range() at line 2522 sets vm_start, vm_end, and vm_pgoff; vm_flags_init() at line 2523 sets the flags; vma_set_anonymous() at line 2536 marks it as anonymous (no file backing).',
    ['anon_new'],
    vmasWithNew,
    '__mmap_new_vma',
    'mm/vma.c:2506 __mmap_new_vma()',
  ));

  // Frame 6: Insert into maple tree via vma_link
  frames.push(makeFrame(
    6,
    'Insert: vma_link()',
    'The new VMA is inserted into the process address space maple tree. vma_iter_store() stores the VMA in the maple tree at the range [vm_start, vm_end). vma_link() at mm/vma.c:1824 calls vma_iter_config() at line 1828 to set the iterator range, vma_iter_prealloc() at line 1829 to preallocate maple tree nodes, and vma_start_write() at line 1832 to take the VMA write lock before insertion.',
    ['anon_new'],
    vmasWithNew,
    'vma_link',
    'mm/vma.c:1824 vma_link()',
  ));

  // Frame 7: Complete the mapping
  frames.push(makeFrame(
    7,
    'Complete: __mmap_complete()',
    '__mmap_complete() at mm/vma.c:2580 finalizes the mapping. It calls perf_event_mmap() at line 2585 to notify perf of the new mapping, vms_complete_munmap_vmas() at line 2588 to clean up any overlapping VMAs that were gathered, and vm_stat_account() at line 2590 to update the mm_struct accounting (total_vm, data_vm, etc.).',
    ['anon_new'],
    vmasWithNew,
    '__mmap_complete',
    'mm/vma.c:2580 __mmap_complete()',
  ));

  // Frame 8: Return to userspace
  vmasWithNew.forEach(v => { if (v.state === 'new') v.state = 'existing'; });
  frames.push(makeFrame(
    8,
    'Complete: return address to userspace',
    'mmap_region() at mm/vma.c:2837 returns the mapped address. Back in do_mmap() at mm/mmap.c:560, if VM_LOCKED or MAP_POPULATE was set, *populate is set to trigger page fault pre-population. The address is returned through the syscall path to userspace. The new VMA is now visible in /proc/pid/maps. No physical pages are allocated yet -- they will be demand-paged on first access via the page fault handler.',
    ['anon_new'],
    vmasWithNew,
    'do_mmap',
    'mm/mmap.c:559 return addr',
  ));

  return frames;
}

function generateVmaMergeAndSplitFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Initial state: two adjacent VMAs with same flags, a gap, and another VMA
  const vmas: VmaEntry[] = [
    { id: 'vma_a', label: 'VMA-A', start: '0x7f8000000', end: '0x7f8004000', flags: 'rw-p', state: 'existing' },
    { id: 'gap', label: '[gap]', start: '0x7f8004000', end: '0x7f8008000', flags: '', state: 'existing' },
    { id: 'vma_b', label: 'VMA-B', start: '0x7f8008000', end: '0x7f800c000', flags: 'rw-p', state: 'existing' },
  ];

  // Frame 0: Setup -- show initial address space
  frames.push(makeFrame(
    0,
    'Initial address space',
    'The process has two anonymous VMAs with identical flags (rw-p) separated by a 16KB gap. VMA-A spans [0x7f8000000, 0x7f8004000) and VMA-B spans [0x7f8008000, 0x7f800c000). A new mmap() request for the gap region will trigger a merge opportunity. The kernel tracks VMAs in a maple tree (replacing the old red-black tree since Linux 6.1).',
    ['vma_a', 'vma_b'],
    vmas,
    'initial_state',
    'mm/vma.c:1003 vma_merge_new_range() comment',
  ));

  // Frame 1: mmap the gap -- do_mmap entry
  frames.push(makeFrame(
    1,
    'Map the gap: do_mmap()',
    'Userspace calls mmap() targeting the gap at 0x7f8004000 with size 0x4000, PROT_READ|PROT_WRITE, MAP_ANONYMOUS|MAP_PRIVATE|MAP_FIXED. do_mmap() at mm/mmap.c:335 processes the request. MAP_FIXED forces the exact address. The call chain reaches __mmap_region() at mm/vma.c:2720, which calls __mmap_setup() at line 2741.',
    ['gap'],
    vmas,
    'do_mmap',
    'mm/mmap.c:335 do_mmap()',
  ));

  // Frame 2: Merge attempt succeeds
  frames.push(makeFrame(
    2,
    'Merge check: vma_merge_new_range()',
    'At mm/vma.c:2750-2754, __mmap_region() attempts a merge. vma_merge_new_range() at mm/vma.c:1046 checks: can_vma_merge_left() at line 422 returns true because VMA-A->vm_end == start and flags match. can_vma_merge_right() returns true because VMA-B->vm_start == end and flags match. This is case 2 from the function comment (lines 1018-1023): merge both sides.',
    ['vma_a', 'gap', 'vma_b'],
    vmas,
    'vma_merge_new_range',
    'mm/vma.c:1046 vma_merge_new_range()',
  ));

  // Frame 3: vma_expand merges
  const mergedVmas: VmaEntry[] = [
    { id: 'vma_merged', label: 'VMA-merged', start: '0x7f8000000', end: '0x7f800c000', flags: 'rw-p', state: 'merged' },
  ];
  frames.push(makeFrame(
    3,
    'Expand: vma_expand()',
    'vma_merge_new_range() calls vma_expand() at mm/vma.c:1151 to extend VMA-A to cover the full range. vma_expand() takes a write lock via vma_start_write() at line 1161, detects remove_next=true at line 1163 since VMA-B will be absorbed. It calls init_vma_prep()/vma_prepare() to lock all involved VMAs, then updates the maple tree to reflect the expanded range [0x7f8000000, 0x7f800c000). VMA-B is removed.',
    ['vma_merged'],
    mergedVmas,
    'vma_expand',
    'mm/vma.c:1151 vma_expand()',
  ));

  // Frame 4: mprotect on a subrange -- entry
  frames.push(makeFrame(
    4,
    'mprotect: change flags on subrange',
    'Now userspace calls mprotect(0x7f8004000, 0x4000, PROT_READ) to make the middle 16KB read-only. The syscall handler at mm/mprotect.c:695 enters mprotect_fixup(). It checks if the VMA is sealed at line 706 and compares oldflags to newflags at line 709. Since flags differ, it calls vma_modify_flags() at line 756 to split and modify the VMA.',
    ['vma_merged'],
    mergedVmas,
    'mprotect_fixup',
    'mm/mprotect.c:695 mprotect_fixup()',
  ));

  // Frame 5: vma_modify attempts merge, then splits
  frames.push(makeFrame(
    5,
    'Modify: vma_modify() -> split',
    'vma_modify_flags() at mm/vma.c:1689 delegates to vma_modify() at line 1649. It first tries vma_merge_existing_range() at line 1657 (defined at mm/vma.c:805), but the new read-only flags differ from neighbors, so merge fails. Since vma->vm_start < start, split_vma() at line 1672 splits the leading portion. Since vma->vm_end > end, split_vma() at line 1680 splits the trailing portion.',
    ['vma_merged'],
    mergedVmas,
    'vma_modify',
    'mm/vma.c:1649 vma_modify()',
  ));

  // Frame 6: __split_vma creates new VMAs
  const splitVmas: VmaEntry[] = [
    { id: 'vma_left', label: 'VMA-left', start: '0x7f8000000', end: '0x7f8004000', flags: 'rw-p', state: 'existing' },
    { id: 'vma_mid', label: 'VMA-mid', start: '0x7f8004000', end: '0x7f8008000', flags: 'r--p', state: 'split' },
    { id: 'vma_right', label: 'VMA-right', start: '0x7f8008000', end: '0x7f800c000', flags: 'rw-p', state: 'split' },
  ];
  frames.push(makeFrame(
    6,
    'Split: __split_vma()',
    '__split_vma() at mm/vma.c:497 performs the actual split. It calls vm_area_dup() at line 513 to clone the original VMA, then adjusts the new VMA range: if new_below=1, new->vm_end = addr at line 518; otherwise new->vm_start = addr at line 520. init_vma_prep()/vma_prepare() at lines 540-541 locks the involved VMAs, then the maple tree is updated via vma_iter_store() to reflect both halves.',
    ['vma_mid', 'vma_right'],
    splitVmas,
    '__split_vma',
    'mm/vma.c:497 __split_vma()',
  ));

  // Frame 7: Apply new flags
  frames.push(makeFrame(
    7,
    'Apply flags: mprotect_fixup()',
    'Back in mprotect_fixup() at mm/mprotect.c:756, after vma_modify_flags() returns the middle VMA, vm_flags_reset_once() at line 769 atomically updates the flags to read-only. vma_set_page_prot() at line 772 recalculates the page protection. change_protection() at line 774 walks the page tables to update existing PTEs, clearing the write bit on any already-faulted pages.',
    ['vma_mid'],
    splitVmas,
    'mprotect_fixup',
    'mm/mprotect.c:769 vm_flags_reset_once()',
  ));

  // Frame 8: Final state
  splitVmas.forEach(v => { if (v.state === 'split') v.state = 'existing'; });
  frames.push(makeFrame(
    8,
    'Result: three VMAs from one',
    'The address space now has three VMAs where there was one merged VMA. VMA-left [0x7f8000000, 0x7f8004000) retains rw-p. VMA-mid [0x7f8004000, 0x7f8008000) is now r--p (read-only). VMA-right [0x7f8008000, 0x7f800c000) retains rw-p. This demonstrates how mprotect() on a subrange forces splits via __split_vma() at mm/vma.c:497 when merge is not possible.',
    ['vma_left', 'vma_mid', 'vma_right'],
    splitVmas,
    'mprotect_fixup',
    'mm/vma.c:497 __split_vma() result',
  ));

  return frames;
}

function generateMunmapPathFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Initial address space
  const vmas: VmaEntry[] = [
    { id: 'text', label: '[text]', start: '0x400000', end: '0x420000', flags: 'r-xp', state: 'existing' },
    { id: 'data', label: '[data]', start: '0x620000', end: '0x624000', flags: 'rw-p', state: 'existing' },
    { id: 'target', label: '[anon]', start: '0x7f8000000', end: '0x7f8008000', flags: 'rw-p', state: 'existing' },
    { id: 'libc', label: '[libc]', start: '0x7f8100000', end: '0x7f8180000', flags: 'r-xp', state: 'existing' },
    { id: 'stack', label: '[stack]', start: '0x7ffd00000', end: '0x7ffd21000', flags: 'rw-p', state: 'existing' },
  ];

  // Frame 0: munmap syscall entry
  frames.push(makeFrame(
    0,
    'Syscall: munmap()',
    'Userspace calls munmap(0x7f8000000, 0x8000) to unmap a 32KB anonymous region. The SYSCALL_DEFINE2(munmap, ...) at mm/mmap.c:1075 calls untagged_addr() at line 1077 and delegates to __vm_munmap() at line 1078 with unlock=true. Alternatively, kernel code uses do_munmap() at mm/mmap.c:1061 which wraps do_vmi_munmap().',
    ['target'],
    vmas,
    'munmap',
    'mm/mmap.c:1075 SYSCALL_DEFINE2(munmap)',
  ));

  // Frame 1: __vm_munmap
  frames.push(makeFrame(
    1,
    'Lock: __vm_munmap()',
    '__vm_munmap() at mm/vma.c:3244 acquires the mmap write lock via mmap_write_lock_killable() at line 3251 (returns -EINTR if the process receives a fatal signal). It creates a VMA_ITERATOR at line 3249 positioned at the start address, then calls do_vmi_munmap() at line 3254 to perform the actual unmapping.',
    ['target'],
    vmas,
    '__vm_munmap',
    'mm/vma.c:3244 __vm_munmap()',
  ));

  // Frame 2: do_vmi_munmap validates and finds VMAs
  frames.push(makeFrame(
    2,
    'Validate: do_vmi_munmap()',
    'do_vmi_munmap() at mm/vma.c:1611 validates the range: checks page alignment and TASK_SIZE bounds at line 1618, computes end = start + PAGE_ALIGN(len) at line 1621. It calls vma_find() at line 1626 to locate the first overlapping VMA. If no VMA overlaps, the function returns 0 (success) without doing anything -- munmap of unmapped memory is not an error.',
    ['target'],
    vmas,
    'do_vmi_munmap',
    'mm/vma.c:1611 do_vmi_munmap()',
  ));

  // Frame 3: do_vmi_align_munmap
  frames.push(makeFrame(
    3,
    'Align: do_vmi_align_munmap()',
    'do_vmi_munmap() delegates to do_vmi_align_munmap() at mm/vma.c:1564 after finding the target VMA. This function initializes a vma_munmap_struct via init_vma_munmap() at line 1575, creates a detached maple tree at line 1568-1571 to temporarily hold removed VMAs, and prepares to gather all affected VMAs.',
    ['target'],
    vmas,
    'do_vmi_align_munmap',
    'mm/vma.c:1564 do_vmi_align_munmap()',
  ));

  // Frame 4: Gather VMAs
  frames.push(makeFrame(
    4,
    'Gather: vms_gather_munmap_vmas()',
    'vms_gather_munmap_vmas() at mm/vma.c:1379 collects all VMAs in the unmap range. If start > vma->vm_start (line 1389), it splits the first VMA via __split_vma() at line 1408 with new_below=1. If end < last_vma->vm_end (line 1396), it splits the last VMA via __split_vma() at line 1429 with new_below=0. Each affected VMA is detached from the main maple tree into the detach tree.',
    ['target'],
    vmas,
    'vms_gather_munmap_vmas',
    'mm/vma.c:1379 vms_gather_munmap_vmas()',
  ));

  // Frame 5: Clear page tables
  const vmasClearing: VmaEntry[] = vmas.map(v =>
    v.id === 'target' ? { ...v, state: 'removed' as const } : { ...v }
  );
  frames.push(makeFrame(
    5,
    'Clear PTEs: vms_clear_ptes()',
    'vms_clear_ptes() at mm/vma.c:1256 unmaps the page tables for the removed region. It builds an unmap_desc struct at lines 1259-1278 with the start/end range and the detached VMA tree, then calls unmap_region() to walk the page table hierarchy (PGD->P4D->PUD->PMD->PTE) and clear all PTEs in the range, flushing TLB entries to ensure no stale translations remain.',
    ['target'],
    vmasClearing,
    'vms_clear_ptes',
    'mm/vma.c:1256 vms_clear_ptes()',
  ));

  // Frame 6: Complete munmap
  frames.push(makeFrame(
    6,
    'Complete: vms_complete_munmap_vmas()',
    'vms_complete_munmap_vmas() at mm/vma.c:1311 finalizes the munmap. It decrements mm->map_count at line 1318 and mm->locked_vm at line 1319. It calls update_hiwater_vm() at line 1328 to record the high watermark. Then iterates mas_for_each() at line 1341 over the detached tree, calling remove_vma() at line 1342 on each VMA to free the struct and associated resources.',
    ['target'],
    vmasClearing,
    'vms_complete_munmap_vmas',
    'mm/vma.c:1311 vms_complete_munmap_vmas()',
  ));

  // Frame 7: Accounting update
  frames.push(makeFrame(
    7,
    'Accounting: update total_vm',
    'vms_complete_munmap_vmas() updates total_vm at mm/vma.c:1330: WRITE_ONCE(mm->total_vm, READ_ONCE(mm->total_vm) - vms->nr_pages). It verifies bookkeeping with VM_WARN_ON checks at lines 1332-1334 for exec_vm, stack_vm, data_vm. vm_unacct_memory() at line 1344 releases overcommit accounting, and __mt_destroy() at line 1349 destroys the detach maple tree.',
    ['target'],
    vmasClearing,
    'vms_complete_munmap_vmas',
    'mm/vma.c:1330 total_vm update',
  ));

  // Frame 8: Return to userspace with gap
  const vmasFinal: VmaEntry[] = vmas.filter(v => v.id !== 'target');
  frames.push(makeFrame(
    8,
    'Result: gap in address space',
    'The unmap is complete. Back in __vm_munmap() at mm/vma.c:3254, do_vmi_munmap() returned 0. Since unlock=true, the mmap write lock was downgraded in vms_complete_munmap_vmas() at line 1321 via mmap_write_downgrade(). userfaultfd_unmap_complete() at line 3258 notifies userfaultfd monitors. The address space now has a gap where the anonymous VMA was -- [0x7f8000000, 0x7f8008000) is free for future mmap() calls.',
    [],
    vmasFinal,
    '__vm_munmap',
    'mm/vma.c:3258 userfaultfd_unmap_complete()',
  ));

  return frames;
}

function generateVmaFlagsUnmapDesc(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Initial address space: a single anonymous VMA we are about to refactor/unmap.
  const vmas: VmaEntry[] = [
    { id: 'text', label: '[text]', start: '0x400000', end: '0x420000', flags: 'r-xp', state: 'existing' },
    { id: 'anon', label: '[anon]', start: '0x7f8000000', end: '0x7f8008000', flags: 'rw-p', state: 'existing' },
    { id: 'stack', label: '[stack]', start: '0x7ffd00000', end: '0x7ffd21000', flags: 'rw-p', state: 'existing' },
  ];

  // Frame 0: struct vm_area_struct now carries vma_flags_t vma_flags (was vm_flags_t vm_flags).
  frames.push(makeFrame(
    0,
    'v7.0: struct vm_area_struct embeds vma_flags_t',
    'Linux 7.0 refactored the VMA flag field at include/linux/mm_types.h:909. Previously struct vm_area_struct carried a raw bitmask "vm_flags_t vm_flags". The new field is "vma_flags_t vma_flags" -- a structured type with helper accessors, paving the way for safer manipulation and future per-flag metadata.',
    ['anon'],
    vmas,
    'vm_area_struct',
    'include/linux/mm_types.h:909 vma_flags field',
    { vmaFlagsType: 'typed' },
  ));

  // Frame 1: the typedef itself.
  frames.push(makeFrame(
    1,
    'Typedef: vma_flags_t',
    'include/linux/mm_types.h:880 defines "typedef struct { unsigned long __bits; } vma_flags_t;" wrapping the flag bits in a struct. Because vma_flags_t is no longer a bare integer, assignments like "vma->vm_flags = 0" no longer compile -- callers must use helper accessors such as vma_flags_empty() at include/linux/mm_types.h:885. This prevents accidental integer arithmetic on flags.',
    ['anon'],
    vmas,
    'vma_flags_empty',
    'include/linux/mm_types.h:885 vma_flags_empty()',
    { vmaFlagsType: 'typed' },
  ));

  // Frame 2: clear helper -- replaces vma->vm_flags = 0
  frames.push(makeFrame(
    2,
    'Helper: vma_flags_clear_all()',
    'Pre-7.0 code wrote "vma->vm_flags = 0" to zero all flags. In 7.0 the equivalent is vma_flags_clear_all(vma) at include/linux/mm_types.h:1078, which stores a zeroed vma_flags_t through the accessor. This keeps the write centralized so instrumentation (e.g., lockdep on the vma write lock) can verify the caller holds the proper lock before mutating flags.',
    ['anon'],
    vmas,
    'vma_flags_clear_all',
    'include/linux/mm_types.h:1078 vma_flags_clear_all()',
    { vmaFlagsType: 'typed' },
  ));

  // Frame 3: bridge to legacy vm_flags_t for APIs that still take the scalar.
  frames.push(makeFrame(
    3,
    'Bridge: vma_flags_to_legacy()',
    'Many in-tree helpers and exported APIs still accept the old scalar vm_flags_t. vma_flags_to_legacy() at include/linux/mm_types.h:1090 returns the underlying unsigned long so those call sites keep working unchanged. New code should prefer vma_flags_has() / vma_flags_set() helpers, but conversions during the 7.0 transition are explicit and auditable.',
    ['anon'],
    vmas,
    'vma_flags_to_legacy',
    'include/linux/mm_types.h:1090 vma_flags_to_legacy()',
    { vmaFlagsType: 'typed' },
  ));

  // Frame 4: unmap begins -- caller in mmap.c builds struct unmap_desc.
  const unmapDescInit: UnmapDescSnapshot = {
    start: '0x7f8000000',
    end: '0x7f8008000',
    mm: 'current->mm',
    uf: 'NULL',
  };
  frames.push(makeFrame(
    4,
    'Caller builds: struct unmap_desc unmap',
    'At mm/mmap.c:1279 the munmap caller now initializes "struct unmap_desc unmap = { .start = start, .end = end, .mm = mm, .uf = uf };" in one declaration. Before 7.0 these arguments were passed positionally to unmap_region(), making the call site verbose and error-prone. The descriptor groups related fields and documents them by name.',
    ['anon'],
    vmas,
    'do_munmap',
    'mm/mmap.c:1279 struct unmap_desc unmap',
    { vmaFlagsType: 'typed', unmapDesc: unmapDescInit },
  ));

  // Frame 5: the descriptor is passed by pointer to unmap_region().
  frames.push(makeFrame(
    5,
    'Pass by pointer: unmap_region(&unmap)',
    'mm/vma.c:481 is the new signature: "void unmap_region(struct unmap_desc *unmap)". Where the pre-7.0 signature accepted six arguments (mm, mt, vma, start, end, tree_end, uf, mm_wr_locked), the refactor passes a single pointer. This shrinks the ABI surface, keeps the stack small, and lets future fields be added without touching every caller.',
    ['anon'],
    vmas,
    'unmap_region',
    'mm/vma.c:481 unmap_region()',
    { vmaFlagsType: 'typed', unmapDesc: unmapDescInit },
  ));

  // Frame 6: unmap_region() uses descriptor fields internally.
  const vmasMarkedForRemoval = vmas.map(v =>
    v.id === 'anon' ? { ...v, state: 'removed' as const } : { ...v },
  );
  frames.push(makeFrame(
    6,
    'Descriptor-driven unmap inside unmap_region()',
    'Inside unmap_region() at mm/vma.c:481, the body reads unmap->start, unmap->end, unmap->mm, and unmap->uf directly, then walks the VMA tree clearing PTEs. Because all inputs live on the descriptor, helper calls like unmap_vmas() and free_pgtables() can be refactored without changing their callers -- only unmap_desc gains a field.',
    ['anon'],
    vmasMarkedForRemoval,
    'unmap_region',
    'mm/vma.c:481 unmap_region()',
    { vmaFlagsType: 'typed', unmapDesc: unmapDescInit },
  ));

  // Frame 7: another caller in vma.c -- consistency across call sites.
  frames.push(makeFrame(
    7,
    'Second call site: mm/vma.c:1278',
    'mm/vma.c:1278 shows the same pattern inside vms_clear_ptes(): "struct unmap_desc unmap = { .start = vms->start, .end = vms->end, .mm = mm, .uf = vms->uf };" followed by unmap_region(&unmap). Both call sites use the identical descriptor shape, so a reader only has to learn the layout once to understand every unmap path.',
    ['anon'],
    vmasMarkedForRemoval,
    'vms_clear_ptes',
    'mm/vma.c:1278 struct unmap_desc unmap',
    { vmaFlagsType: 'typed', unmapDesc: unmapDescInit },
  ));

  // Frame 8: contrast before/after -- refactor benefit.
  const vmasFinal = vmas.filter(v => v.id !== 'anon');
  frames.push(makeFrame(
    8,
    'Refactor benefit: before vs after',
    'Before 7.0: unmap_region(mm, &mt, vma, start, end, tree_end, uf, mm_wr_locked) -- eight positional arguments with easy-to-swap neighbors. After 7.0: unmap_region(&unmap) -- one pointer; fields are self-documenting and a new field (e.g., a reason code for tracing) can be added by extending struct unmap_desc without touching callers. Combined with vma_flags_t, the VMA subsystem presents a more typed, descriptor-driven API.',
    [],
    vmasFinal,
    'unmap_region',
    'mm/vma.c:481 unmap_region()',
    { vmaFlagsType: 'typed' },
  ));

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'mmap-anonymous', label: 'mmap() Anonymous Mapping' },
  { id: 'vma-merge-and-split', label: 'VMA Merge and Split (mprotect)' },
  { id: 'munmap-path', label: 'munmap() Unmap Path' },
  { id: 'vma-flags-unmap-desc', label: 'vma_flags_t & unmap_desc (v7.0)' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as VmaState;
  const { vmas } = data;
  const margin = { top: 24, right: 16, bottom: 40, left: 16 };
  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'VMA Operations';
  container.appendChild(titleEl);

  // Draw VMAs as horizontal bars representing the address space
  const vmaCount = vmas.length;
  const barHeight = Math.min(28, usableHeight / Math.max(vmaCount, 1));
  const barWidth = Math.min(usableWidth * 0.55, 220);
  const barX = margin.left + (usableWidth - barWidth) / 2;

  for (let i = 0; i < vmaCount; i++) {
    const vma = vmas[i];
    const y = margin.top + 8 + i * (barHeight + 4);

    // VMA bar
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(barX));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(barWidth));
    rect.setAttribute('height', String(barHeight * 0.7));
    rect.setAttribute('rx', '3');

    let cls = `anim-vma anim-vma-${vma.state}`;
    if (frame.highlights.includes(vma.id)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // VMA label (left side)
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(barX - 6));
    label.setAttribute('y', String(y + barHeight * 0.45));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'anim-function');
    label.textContent = vma.label;
    container.appendChild(label);

    // Address range (inside bar)
    const addrText = document.createElementNS(NS, 'text');
    addrText.setAttribute('x', String(barX + barWidth / 2));
    addrText.setAttribute('y', String(y + barHeight * 0.45));
    addrText.setAttribute('text-anchor', 'middle');
    addrText.setAttribute('class', 'anim-addr');
    addrText.textContent = `${vma.start} - ${vma.end}`;
    container.appendChild(addrText);

    // Flags (right side)
    const flagsText = document.createElementNS(NS, 'text');
    flagsText.setAttribute('x', String(barX + barWidth + 6));
    flagsText.setAttribute('y', String(y + barHeight * 0.45));
    flagsText.setAttribute('class', 'anim-flags');
    flagsText.textContent = vma.flags;
    container.appendChild(flagsText);
  }

  // Current function indicator
  const fnLabel = document.createElementNS(NS, 'text');
  fnLabel.setAttribute('x', String(margin.left));
  fnLabel.setAttribute('y', String(height - margin.bottom + 16));
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.textContent = `Current: ${data.currentFunction}()`;
  container.appendChild(fnLabel);

  // Source reference
  const srcLabel = document.createElementNS(NS, 'text');
  srcLabel.setAttribute('x', String(margin.left));
  srcLabel.setAttribute('y', String(height - margin.bottom + 32));
  srcLabel.setAttribute('class', 'anim-srcref');
  srcLabel.textContent = data.srcRef;
  container.appendChild(srcLabel);
}

const vmaOperations: AnimationModule = {
  config: {
    id: 'vma-operations',
    title: 'VMA Operations: mmap, merge, split, munmap',
    skillName: 'virtual-memory-areas',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'vma-merge-and-split':
        return generateVmaMergeAndSplitFrames();
      case 'munmap-path':
        return generateMunmapPathFrames();
      case 'vma-flags-unmap-desc':
        return generateVmaFlagsUnmapDesc();
      case 'mmap-anonymous':
      default:
        return generateMmapAnonymousFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default vmaOperations;
