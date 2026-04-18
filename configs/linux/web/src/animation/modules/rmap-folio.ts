import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface FolioEntry {
  id: string;
  label: string;
  refcount: number;
  mapped: boolean;
  flags: string[];
}

export interface RmapChainEntry {
  id: string;
  folioId: string;
  vmaLabel: string;
  anonVmaLabel: string;
}

export interface PteEntry {
  id: string;
  folioId: string;
  vaddr: string;
  present: boolean;
}

export interface RmapFolioState {
  phase: 'init' | 'prepare' | 'rmap-setup' | 'link' | 'mapped' | 'walk' | 'unmap' | 'complete' | 'alloc' | 'lookup' | 'lock' | 'refcount' | 'release';
  folios: FolioEntry[];
  rmapChains: RmapChainEntry[];
  pteEntries: PteEntry[];
  currentOperation: string;
  srcRef: string;
}

function cloneState(s: RmapFolioState): RmapFolioState {
  return {
    phase: s.phase,
    folios: s.folios.map(f => ({ ...f, flags: [...f.flags] })),
    rmapChains: s.rmapChains.map(c => ({ ...c })),
    pteEntries: s.pteEntries.map(p => ({ ...p })),
    currentOperation: s.currentOperation,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: anon-rmap-chain
// Anonymous reverse mapping: tracking which PTEs map to a given page/folio
// ---------------------------------------------------------------------------
function generateAnonRmapChain(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RmapFolioState = {
    phase: 'init',
    folios: [],
    rmapChains: [],
    pteEntries: [],
    currentOperation: '',
    srcRef: '',
  };

  // Frame 0: Anonymous page fault triggers folio allocation
  state.currentOperation = 'do_anonymous_page()';
  state.srcRef = 'mm/memory.c:4636 (do_anonymous_page)';
  frames.push({
    step: 0,
    label: 'Anonymous page fault triggers folio allocation',
    description: 'A process accesses an anonymous virtual address for the first time, triggering a page fault. do_anonymous_page() at mm/memory.c:4636 is called from handle_pte_fault(). The kernel needs to allocate a new folio and establish the reverse mapping so it can later find all PTEs pointing to this physical page.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: anon_vma_prepare - ensure VMA has anon_vma
  state.phase = 'prepare';
  state.currentOperation = '__anon_vma_prepare()';
  state.srcRef = 'mm/rmap.c:159 (__anon_vma_prepare)';
  frames.push({
    step: 1,
    label: 'Prepare anon_vma for the VMA',
    description: '__anon_vma_prepare() at mm/rmap.c:159 ensures the VMA has an anon_vma attached. It allocates a new anon_vma and an anon_vma_chain (AVC). The anon_vma is the root of the reverse mapping tree for anonymous pages. If a nearby VMA already has an anon_vma (common after mprotect splits), it reuses that one to maintain the chain.',
    highlights: ['anon-vma'],
    data: cloneState(state),
  });

  // Frame 2: anon_vma_chain_assign links VMA to anon_vma
  state.phase = 'link';
  state.currentOperation = 'anon_vma_chain_assign()';
  state.rmapChains.push({
    id: 'avc-1',
    folioId: '',
    vmaLabel: 'vma [0x7f000000-0x7f001000]',
    anonVmaLabel: 'anon_vma (root)',
  });
  state.srcRef = 'mm/rmap.c:150-157 (anon_vma_chain_assign)';
  frames.push({
    step: 2,
    label: 'Link VMA to anon_vma via AVC',
    description: 'anon_vma_chain_assign() at mm/rmap.c:150 sets avc->vma = vma and avc->anon_vma = anon_vma, then calls list_add(&avc->same_vma, &vma->anon_vma_chain) at line 156. This creates the bidirectional link: the VMA can find its anon_vma, and the anon_vma interval tree can find all VMAs sharing anonymous pages. The AVC is also inserted into anon_vma->rb_root.',
    highlights: ['avc-1'],
    data: cloneState(state),
  });

  // Frame 3: Folio allocation via vma_alloc_folio
  state.phase = 'rmap-setup';
  state.currentOperation = 'vma_alloc_folio()';
  state.folios.push({
    id: 'folio-1',
    label: 'folio @ pfn 0x12345',
    refcount: 1,
    mapped: false,
    flags: ['PG_locked'],
  });
  state.srcRef = 'include/linux/gfp.h:326 (vma_alloc_folio_noprof)';
  frames.push({
    step: 3,
    label: 'Allocate anonymous folio',
    description: 'vma_alloc_folio_noprof() at include/linux/gfp.h:326 allocates a new folio using the NUMA memory policy for the VMA. The folio starts with refcount=1, PG_locked set, and no mapping. For anonymous pages, the buddy allocator provides order-0 folios (single pages). The folio struct replaces the old page struct as the primary unit of memory management.',
    highlights: ['folio-1'],
    data: cloneState(state),
  });

  // Frame 4: __folio_set_anon establishes anon mapping
  state.currentOperation = '__folio_set_anon()';
  state.folios[0].flags.push('FOLIO_MAPPING_ANON');
  state.srcRef = 'mm/rmap.c:1463-1486 (__folio_set_anon)';
  frames.push({
    step: 4,
    label: '__folio_set_anon() establishes mapping',
    description: '__folio_set_anon() at mm/rmap.c:1463 sets up the anonymous reverse mapping for the folio. It reads vma->anon_vma (line 1466), BUG_ON if NULL. For exclusive folios, it uses the VMA anon_vma directly; for shared, it uses anon_vma->root (line 1475). Line 1483 encodes the anon_vma pointer with FOLIO_MAPPING_ANON flag, then WRITE_ONCE(folio->mapping, ...) at line 1484. Line 1485 sets folio->index = linear_page_index(vma, address).',
    highlights: ['folio-1'],
    data: cloneState(state),
  });

  // Frame 5: __folio_add_anon_rmap increments mapcount
  state.currentOperation = '__folio_add_anon_rmap()';
  state.folios[0].mapped = true;
  state.folios[0].refcount = 2;
  state.srcRef = 'mm/rmap.c:1516-1577 (__folio_add_anon_rmap)';
  frames.push({
    step: 5,
    label: '__folio_add_anon_rmap() increments mapcount',
    description: '__folio_add_anon_rmap() at mm/rmap.c:1516 calls __folio_add_rmap() at line 1524 to increment the folio mapcount via atomic_inc_and_test(&page->_mapcount). If KSM is not involved, __page_check_anon_rmap() at line 1527 validates the mapping. For RMAP_EXCLUSIVE at line 1529, SetPageAnonExclusive() marks the page exclusively owned by this process (line 1533).',
    highlights: ['folio-1'],
    data: cloneState(state),
  });

  // Frame 6: folio_add_anon_rmap_ptes - the PTE-level entry point
  state.currentOperation = 'folio_add_anon_rmap_ptes()';
  state.pteEntries.push({
    id: 'pte-1',
    folioId: 'folio-1',
    vaddr: '0x7f000000',
    present: true,
  });
  state.rmapChains[0].folioId = 'folio-1';
  state.srcRef = 'mm/rmap.c:1595-1601 (folio_add_anon_rmap_ptes)';
  frames.push({
    step: 6,
    label: 'folio_add_anon_rmap_ptes() adds PTE mapping',
    description: 'folio_add_anon_rmap_ptes() at mm/rmap.c:1595 is the PTE-level entry point. It calls __folio_add_anon_rmap(folio, page, nr_pages, vma, address, flags, PGTABLE_LEVEL_PTE) at line 1599. The caller (do_anonymous_page) holds the page table lock. The PTE now points to the folio physical frame, and the rmap chain (folio->mapping -> anon_vma -> AVC -> VMA) enables reverse lookup.',
    highlights: ['pte-1', 'folio-1'],
    data: cloneState(state),
  });

  // Frame 7: Second process maps same folio via fork (COW)
  state.phase = 'mapped';
  state.currentOperation = 'fork() -> copy_pte_range()';
  state.pteEntries.push({
    id: 'pte-2',
    folioId: 'folio-1',
    vaddr: '0x7f000000 (child)',
    present: true,
  });
  state.rmapChains.push({
    id: 'avc-2',
    folioId: 'folio-1',
    vmaLabel: 'child vma [0x7f000000-0x7f001000]',
    anonVmaLabel: 'anon_vma (child)',
  });
  state.folios[0].refcount = 3;
  state.folios[0].flags = ['FOLIO_MAPPING_ANON'];
  state.srcRef = 'mm/rmap.c:1595 (folio_add_anon_rmap_ptes via copy_pte_range)';
  frames.push({
    step: 7,
    label: 'fork() shares folio with child process',
    description: 'When fork() copies page tables via copy_pte_range(), the child gets a new VMA with its own anon_vma_chain linked to the parent anon_vma root. folio_add_anon_rmap_ptes() at mm/rmap.c:1595 is called again, incrementing the mapcount. Both parent and child PTEs now point to the same folio (COW). The rmap chain allows the kernel to find BOTH PTEs: folio->mapping -> anon_vma->rb_root -> AVC -> VMA -> page tables.',
    highlights: ['pte-2', 'avc-2'],
    data: cloneState(state),
  });

  // Frame 8: rmap_walk_anon shows how reverse walk works
  state.phase = 'walk';
  state.currentOperation = 'rmap_walk_anon()';
  state.srcRef = 'mm/rmap.c:2962-2997 (rmap_walk_anon)';
  frames.push({
    step: 8,
    label: 'rmap_walk_anon() traverses reverse mappings',
    description: 'rmap_walk_anon() at mm/rmap.c:2962 demonstrates the reverse walk. It reads folio_anon_vma(folio) (line 2976) to get the anon_vma, then iterates anon_vma_interval_tree_foreach(avc, &anon_vma->rb_root, pgoff_start, pgoff_end) at line 2987. For each AVC, it extracts vma = avc->vma (line 2989) and computes address = vma_address() (line 2990). The rwc->rmap_one callback (e.g. try_to_unmap_one) is called for each VMA that maps this folio.',
    highlights: ['avc-1', 'avc-2'],
    data: cloneState(state),
  });

  // Frame 9: Complete rmap picture
  state.phase = 'complete';
  state.currentOperation = 'rmap chain complete';
  state.srcRef = 'mm/rmap.c:20-53 (lock ordering documentation)';
  frames.push({
    step: 9,
    label: 'Complete anonymous rmap chain',
    description: 'The complete rmap chain is: folio->mapping (encoded anon_vma pointer with FOLIO_MAPPING_ANON bit) -> anon_vma->rb_root (interval tree) -> anon_vma_chain (AVC, with ->vma and ->anon_vma pointers) -> VMA -> page tables -> PTE pointing to folio physical frame. Lock ordering documented at mm/rmap.c:20-53: folio_lock > mapping->i_mmap_rwsem > anon_vma->rwsem > page_table_lock. This chain enables page reclaim, migration, and compaction to find and update ALL PTEs for any physical page.',
    highlights: ['folio-1', 'pte-1', 'pte-2'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: file-rmap-walk
// File-backed rmap walking to unmap all PTEs for a folio
// ---------------------------------------------------------------------------
function generateFileRmapWalk(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RmapFolioState = {
    phase: 'init',
    folios: [{
      id: 'folio-f1',
      label: 'file folio @ pgoff 42',
      refcount: 3,
      mapped: true,
      flags: ['PG_uptodate', 'PG_lru', 'PG_referenced'],
    }],
    rmapChains: [
      { id: 'vma-1', folioId: 'folio-f1', vmaLabel: 'proc-A mmap [0x7f100000]', anonVmaLabel: 'mapping->i_mmap' },
      { id: 'vma-2', folioId: 'folio-f1', vmaLabel: 'proc-B mmap [0x7f200000]', anonVmaLabel: 'mapping->i_mmap' },
    ],
    pteEntries: [
      { id: 'pte-a', folioId: 'folio-f1', vaddr: '0x7f100a80 (proc-A)', present: true },
      { id: 'pte-b', folioId: 'folio-f1', vaddr: '0x7f200a80 (proc-B)', present: true },
    ],
    currentOperation: '',
    srcRef: '',
  };

  // Frame 0: Page reclaim selects folio for eviction
  state.currentOperation = 'shrink_folio_list()';
  state.srcRef = 'mm/vmscan.c (shrink_folio_list selects folio for eviction)';
  frames.push({
    step: 0,
    label: 'Page reclaim selects file folio',
    description: 'The page reclaim path (kswapd or direct reclaim) selects a file-backed folio for eviction via shrink_folio_list(). Before the folio can be freed, the kernel must find and clear ALL page table entries (PTEs) pointing to it. This is where the reverse mapping (rmap) system is essential -- the kernel needs to walk from the physical page back to every virtual mapping.',
    highlights: ['folio-f1'],
    data: cloneState(state),
  });

  // Frame 1: try_to_unmap called
  state.phase = 'walk';
  state.currentOperation = 'try_to_unmap()';
  state.srcRef = 'mm/rmap.c:2392-2405 (try_to_unmap)';
  frames.push({
    step: 1,
    label: 'try_to_unmap() initiates rmap walk',
    description: 'try_to_unmap() at mm/rmap.c:2392 sets up rmap_walk_control with rmap_one=try_to_unmap_one (line 2395), done=folio_not_mapped (line 2397), and anon_lock=folio_lock_anon_vma_read (line 2398). Since this is a file-backed folio, rmap_walk() at mm/rmap.c:3104 dispatches to rmap_walk_file() at line 3106.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 2: rmap_walk_file traverses i_mmap interval tree
  state.currentOperation = 'rmap_walk_file() -> __rmap_walk_file()';
  state.srcRef = 'mm/rmap.c:3081-3097 (rmap_walk_file) -> mm/rmap.c:3029-3070 (__rmap_walk_file)';
  frames.push({
    step: 2,
    label: 'rmap_walk_file() traverses i_mmap tree',
    description: 'rmap_walk_file() at mm/rmap.c:3081 asserts folio_test_locked (line 3090) and calls __rmap_walk_file() at line 3095 with folio->mapping and folio->index. __rmap_walk_file() at line 3029 takes i_mmap_lock_read(mapping) (line 3049), then iterates vma_interval_tree_foreach(vma, &mapping->i_mmap, pgoff_start, pgoff_end) at line 3052. Each VMA that maps this file offset range is visited.',
    highlights: ['vma-1', 'vma-2'],
    data: cloneState(state),
  });

  // Frame 3: First VMA - try_to_unmap_one for proc-A
  state.phase = 'unmap';
  state.currentOperation = 'try_to_unmap_one() [proc-A]';
  state.srcRef = 'mm/rmap.c:1984-2005 (try_to_unmap_one setup)';
  frames.push({
    step: 3,
    label: 'try_to_unmap_one() processes proc-A VMA',
    description: 'try_to_unmap_one() at mm/rmap.c:1984 is called with the folio and proc-A VMA. It initializes DEFINE_FOLIO_VMA_WALK(pvmw, folio, vma, address, 0) at line 1988, sets up mmu_notifier_range_init() at line 2017 for KVM/device notifications, then calls mmu_notifier_invalidate_range_start() at line 2030. The pvmw structure tracks the page table walk position.',
    highlights: ['pte-a'],
    data: cloneState(state),
  });

  // Frame 4: page_vma_mapped_walk finds PTE
  state.currentOperation = 'page_vma_mapped_walk()';
  state.srcRef = 'mm/page_vma_mapped.c:157 (page_vma_mapped_walk)';
  frames.push({
    step: 4,
    label: 'page_vma_mapped_walk() locates PTE',
    description: 'page_vma_mapped_walk() at mm/page_vma_mapped.c:157 walks the page tables of proc-A: PGD -> P4D -> PUD -> PMD -> PTE. It locks the page table lock (ptl) and checks that the PTE pfn matches the folio pfn. Returns true with pvmw.pte pointing to the relevant PTE and pvmw.ptl held. The while(page_vma_mapped_walk(&pvmw)) loop at mm/rmap.c:2032 iterates over all PTEs in this VMA that map the folio.',
    highlights: ['pte-a'],
    data: cloneState(state),
  });

  // Frame 5: Unmap proc-A PTE
  state.currentOperation = 'ptep_clear_flush() [proc-A]';
  state.pteEntries[0].present = false;
  state.folios[0].refcount = 2;
  state.srcRef = 'mm/rmap.c:2032-2362 (try_to_unmap_one unmap loop)';
  frames.push({
    step: 5,
    label: 'Clear proc-A PTE via ptep_clear_flush',
    description: 'Inside the page_vma_mapped_walk loop at mm/rmap.c:2032, try_to_unmap_one() clears the PTE with ptep_get_and_clear() and issues a TLB flush. It decrements the folio mapcount via folio_remove_rmap_pte(). For file-backed pages being reclaimed, it may install a swap entry. The mmu_notifier callback at page_vma_mapped_walk_done() notifies KVM guests. proc-A can no longer access this folio without faulting.',
    highlights: ['pte-a'],
    data: cloneState(state),
  });

  // Frame 6: Second VMA - try_to_unmap_one for proc-B
  state.currentOperation = 'try_to_unmap_one() [proc-B]';
  state.srcRef = 'mm/rmap.c:3062 (__rmap_walk_file rwc->rmap_one callback for next VMA)';
  frames.push({
    step: 6,
    label: 'try_to_unmap_one() processes proc-B VMA',
    description: '__rmap_walk_file() continues the vma_interval_tree_foreach loop at mm/rmap.c:3052. It calls rwc->rmap_one(folio, vma, address, rwc->arg) at line 3062 for proc-B VMA. try_to_unmap_one() repeats: DEFINE_FOLIO_VMA_WALK, mmu_notifier_invalidate_range_start, page_vma_mapped_walk to find the PTE in proc-B page tables.',
    highlights: ['pte-b'],
    data: cloneState(state),
  });

  // Frame 7: Unmap proc-B PTE
  state.currentOperation = 'ptep_clear_flush() [proc-B]';
  state.pteEntries[1].present = false;
  state.folios[0].refcount = 1;
  state.folios[0].mapped = false;
  state.srcRef = 'mm/rmap.c:2032-2362 (try_to_unmap_one clears last PTE)';
  frames.push({
    step: 7,
    label: 'Clear proc-B PTE -- folio fully unmapped',
    description: 'try_to_unmap_one() clears the last PTE. folio_remove_rmap_pte() decrements mapcount to 0. Back in __rmap_walk_file(), the rwc->done callback folio_not_mapped() at mm/rmap.c:3064 checks !folio_mapped(folio) and returns true, breaking the loop. The folio is now fully unmapped -- no process can access it without a page fault.',
    highlights: ['pte-b', 'folio-f1'],
    data: cloneState(state),
  });

  // Frame 8: Folio can now be freed
  state.phase = 'complete';
  state.currentOperation = 'folio reclaim complete';
  state.pteEntries = [];
  state.srcRef = 'mm/rmap.c:3067-3069 (__rmap_walk_file releases i_mmap_lock)';
  frames.push({
    step: 8,
    label: 'Folio fully unmapped, ready for reclaim',
    description: '__rmap_walk_file() releases i_mmap_unlock_read(mapping) at mm/rmap.c:3069. Control returns to try_to_unmap() at mm/rmap.c:2404 then back to shrink_folio_list(). Since folio_mapped() is false, the reclaim path can proceed to write back dirty data (if needed) and free the folio. The rmap walk visited exactly 2 VMAs across 2 processes, clearing both PTEs efficiently.',
    highlights: ['folio-f1'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: folio-operations
// Folio abstraction operations lifecycle
// ---------------------------------------------------------------------------
function generateFolioOperations(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: RmapFolioState = {
    phase: 'init',
    folios: [],
    rmapChains: [],
    pteEntries: [],
    currentOperation: '',
    srcRef: '',
  };

  // Frame 0: Introduction to the folio abstraction
  state.currentOperation = 'folio concept';
  state.srcRef = 'include/linux/mm_types.h (struct folio definition)';
  frames.push({
    step: 0,
    label: 'Folio: the modern page abstraction',
    description: 'A struct folio represents one or more physically contiguous pages managed as a unit. It replaces ambiguous "compound page" patterns with a clear API. Key fields: folio->mapping (address_space or anon_vma), folio->index (offset), folio->_refcount, folio->_mapcount, folio->flags. All folio operations work on the head page of a compound page.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1: folio_alloc_noprof
  state.phase = 'alloc';
  state.currentOperation = 'folio_alloc_noprof()';
  state.folios.push({
    id: 'folio-op1',
    label: 'new folio (order-0)',
    refcount: 1,
    mapped: false,
    flags: ['PG_locked'],
  });
  state.srcRef = 'include/linux/gfp.h:323-336 (folio_alloc_noprof)';
  frames.push({
    step: 1,
    label: 'folio_alloc_noprof() allocates a new folio',
    description: 'folio_alloc_noprof() at include/linux/gfp.h:323 (NUMA) or line 333 (UMA) allocates a folio of the requested order. For NUMA, it calls __folio_alloc_node_noprof() which goes through the buddy allocator. The returned folio has refcount=1 and is not yet associated with any address_space or VMA. GFP flags control allocation behavior (GFP_HIGHUSER_MOVABLE for user pages, GFP_KERNEL for kernel).',
    highlights: ['folio-op1'],
    data: cloneState(state),
  });

  // Frame 2: folio_lock
  state.phase = 'lock';
  state.currentOperation = 'folio_lock()';
  state.srcRef = 'include/linux/pagemap.h:1134-1152 (folio_lock)';
  frames.push({
    step: 2,
    label: 'folio_lock() acquires the folio lock',
    description: 'folio_lock() at include/linux/pagemap.h:1134 locks the folio by setting PG_locked. If the bit is already set, it calls __folio_lock() at mm/filemap.c which sleeps in a wait queue until the lock is available. The folio lock protects: page cache insertion/removal, folio->mapping stability, write() atomicity, and truncation. Lock ordering: folio_lock > mapping->i_mmap_rwsem > anon_vma->rwsem (mm/rmap.c:26).',
    highlights: ['folio-op1'],
    data: cloneState(state),
  });

  // Frame 3: filemap_get_folio - page cache lookup
  state.phase = 'lookup';
  state.currentOperation = '__filemap_get_folio_mpol()';
  state.folios.push({
    id: 'folio-op2',
    label: 'cached folio @ pgoff 100',
    refcount: 2,
    mapped: true,
    flags: ['PG_uptodate', 'PG_lru', 'PG_referenced'],
  });
  state.srcRef = 'mm/filemap.c:1940-2000 (__filemap_get_folio_mpol)';
  frames.push({
    step: 3,
    label: 'filemap_get_folio() looks up page cache',
    description: '__filemap_get_folio_mpol() at mm/filemap.c:1940 looks up a folio in the page cache. It calls filemap_get_entry(mapping, index) at line 1946 which searches the XArray (mapping->i_pages). If found and not a shadow/swap entry, the folio reference count is incremented. FGP_LOCK flag (line 1952) causes folio_lock(), FGP_ACCESSED (line 1971) calls folio_mark_accessed(). FGP_CREAT (line 1982) allocates a new folio if not found.',
    highlights: ['folio-op2'],
    data: cloneState(state),
  });

  // Frame 4: folio_try_get / folio_get - reference counting
  state.phase = 'refcount';
  state.currentOperation = 'folio_get() / folio_try_get()';
  state.folios[1].refcount = 3;
  state.srcRef = 'include/linux/mm.h:2044-2047 (folio_get)';
  frames.push({
    step: 4,
    label: 'folio_get() increments reference count',
    description: 'folio_get() at include/linux/mm.h:2044 increments the folio refcount via folio_ref_inc(). It asserts refcount is not zero or overflowing. folio_try_get() is the safe variant for speculative references where the folio might be concurrently freed -- it uses atomic compare-and-exchange to avoid use-after-free. Reference counting ensures the folio memory is not freed while anyone holds a reference.',
    highlights: ['folio-op2'],
    data: cloneState(state),
  });

  // Frame 5: folio_mark_accessed for LRU promotion
  state.currentOperation = 'folio_mark_accessed()';
  state.folios[1].flags.push('PG_active');
  state.srcRef = 'mm/swap.c (folio_mark_accessed)';
  frames.push({
    step: 5,
    label: 'folio_mark_accessed() updates LRU position',
    description: 'folio_mark_accessed() marks the folio as recently accessed for the LRU page reclaim algorithm. First access sets PG_referenced. Second access promotes the folio from inactive to active LRU list (setting PG_active). This two-touch policy prevents single-access pages from polluting the active list. kswapd uses LRU position to decide which folios to reclaim first.',
    highlights: ['folio-op2'],
    data: cloneState(state),
  });

  // Frame 6: folio_unlock
  state.phase = 'release';
  state.currentOperation = 'folio_unlock()';
  state.folios[0].flags = [];
  state.srcRef = 'include/linux/pagemap.h (folio_unlock) -> mm/filemap.c (__folio_unlock)';
  frames.push({
    step: 6,
    label: 'folio_unlock() releases the folio lock',
    description: 'folio_unlock() clears PG_locked and wakes up any waiters sleeping in __folio_lock(). This uses clear_bit_unlock() for memory ordering: all stores before the unlock are visible to the next locker. Waiters are on a hashed wait queue (folio_waitqueue) to avoid per-folio wait queue overhead. The unlock is a critical handoff point -- truncation, writeback, and readahead all contend on this lock.',
    highlights: ['folio-op1'],
    data: cloneState(state),
  });

  // Frame 7: folio_put decrements refcount
  state.currentOperation = 'folio_put()';
  state.folios[1].refcount = 2;
  state.srcRef = 'include/linux/mm.h:2082-2086 (folio_put)';
  frames.push({
    step: 7,
    label: 'folio_put() decrements reference count',
    description: 'folio_put() at include/linux/mm.h:2082 calls folio_put_testzero() which atomically decrements _refcount. If refcount reaches zero (line 2084), it calls __folio_put() which removes the folio from LRU lists, frees associated resources (buffers, swap entries), and returns the pages to the buddy allocator via free_unref_folios(). The atomic decrement uses release semantics for memory ordering.',
    highlights: ['folio-op2'],
    data: cloneState(state),
  });

  // Frame 8: folio_put drops last reference -- folio freed
  state.currentOperation = 'folio_put() -> __folio_put()';
  state.folios[0].refcount = 0;
  state.folios = state.folios.filter(f => f.id !== 'folio-op1');
  state.srcRef = 'include/linux/mm.h:2084-2085 (folio_put_testzero -> __folio_put)';
  frames.push({
    step: 8,
    label: 'Last folio_put() frees the folio',
    description: 'When the last reference is dropped, folio_put_testzero() returns true and __folio_put() is called. This removes the folio from any LRU list, calls folio_undo_large_rmappable() for large folios, and returns pages to the buddy allocator. The physical memory is now available for new allocations. The folio lifecycle: alloc -> lock -> map -> use -> unmap -> unlock -> put(last) -> free.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 9: Folio API summary
  state.phase = 'complete';
  state.currentOperation = 'folio API overview';
  state.srcRef = 'include/linux/mm.h, include/linux/pagemap.h, include/linux/gfp.h';
  frames.push({
    step: 9,
    label: 'Folio API: unified page management',
    description: 'The folio API provides clear ownership semantics: folio_alloc() creates, folio_get()/folio_try_get() share, folio_put() releases. Locking: folio_lock()/folio_unlock()/folio_trylock(). State queries: folio_test_locked(), folio_mapped(), folio_test_uptodate(). Page cache: filemap_get_folio() for lookup, filemap_add_folio() for insertion. Rmap: folio_add_anon_rmap_ptes() for anonymous, folio_add_file_rmap_*() for file-backed. All replace the older page-based APIs.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  'init': '#8b949e',
  'prepare': '#d29922',
  'rmap-setup': '#d29922',
  'link': '#58a6ff',
  'mapped': '#3fb950',
  'walk': '#bc8cff',
  'unmap': '#f85149',
  'complete': '#3fb950',
  'alloc': '#d29922',
  'lookup': '#58a6ff',
  'lock': '#f0883e',
  'refcount': '#bc8cff',
  'release': '#f85149',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as RmapFolioState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Reverse Mappings & Folio Abstraction';
  container.appendChild(title);

  // Phase indicator
  const phaseTop = margin.top + 28;
  const phaseWidth = 200;
  const phaseHeight = 28;
  const phaseColor = PHASE_COLORS[data.phase] || '#30363d';

  const phaseRect = document.createElementNS(NS, 'rect');
  phaseRect.setAttribute('x', String(margin.left));
  phaseRect.setAttribute('y', String(phaseTop));
  phaseRect.setAttribute('width', String(phaseWidth));
  phaseRect.setAttribute('height', String(phaseHeight));
  phaseRect.setAttribute('rx', '6');
  phaseRect.setAttribute('fill', phaseColor);
  phaseRect.setAttribute('class', 'anim-phase');
  container.appendChild(phaseRect);

  const phaseText = document.createElementNS(NS, 'text');
  phaseText.setAttribute('x', String(margin.left + phaseWidth / 2));
  phaseText.setAttribute('y', String(phaseTop + 19));
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.setAttribute('fill', '#e6edf3');
  phaseText.setAttribute('class', 'anim-phase');
  phaseText.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseText);

  // Current operation label
  const opTop = phaseTop;
  const opLeft = margin.left + phaseWidth + 20;
  const opText = document.createElementNS(NS, 'text');
  opText.setAttribute('x', String(opLeft));
  opText.setAttribute('y', String(opTop + 19));
  opText.setAttribute('fill', '#e6edf3');
  opText.setAttribute('font-size', '12');
  opText.setAttribute('class', 'anim-operation');
  opText.textContent = `Op: ${data.currentOperation}`;
  container.appendChild(opText);

  // --- Folio boxes ---
  const folioTop = phaseTop + phaseHeight + 20;
  const folioBoxWidth = Math.min(180, (usableWidth - (data.folios.length - 1) * 12) / Math.max(data.folios.length, 1));
  const folioBoxHeight = 60;

  data.folios.forEach((folio, i) => {
    const fx = margin.left + i * (folioBoxWidth + 12);
    const isHighlighted = frame.highlights.includes(folio.id);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(fx));
    rect.setAttribute('y', String(folioTop));
    rect.setAttribute('width', String(folioBoxWidth));
    rect.setAttribute('height', String(folioBoxHeight));
    rect.setAttribute('rx', '5');
    rect.setAttribute('fill', folio.mapped ? '#1a4a2a' : '#21262d');
    let folioCls = 'anim-folio';
    if (isHighlighted) folioCls += ' anim-highlight';
    rect.setAttribute('class', folioCls);
    container.appendChild(rect);

    const labelText = document.createElementNS(NS, 'text');
    labelText.setAttribute('x', String(fx + 6));
    labelText.setAttribute('y', String(folioTop + 16));
    labelText.setAttribute('fill', '#e6edf3');
    labelText.setAttribute('font-size', '10');
    labelText.setAttribute('class', 'anim-folio');
    labelText.textContent = folio.label;
    container.appendChild(labelText);

    const refText = document.createElementNS(NS, 'text');
    refText.setAttribute('x', String(fx + 6));
    refText.setAttribute('y', String(folioTop + 32));
    refText.setAttribute('fill', '#8b949e');
    refText.setAttribute('font-size', '9');
    refText.setAttribute('class', 'anim-folio');
    refText.textContent = `refcount: ${folio.refcount}`;
    container.appendChild(refText);

    const flagText = document.createElementNS(NS, 'text');
    flagText.setAttribute('x', String(fx + 6));
    flagText.setAttribute('y', String(folioTop + 46));
    flagText.setAttribute('fill', '#8b949e');
    flagText.setAttribute('font-size', '9');
    flagText.setAttribute('class', 'anim-folio');
    flagText.textContent = folio.flags.join(', ').substring(0, 30);
    container.appendChild(flagText);
  });

  // --- Rmap chain entries ---
  const chainTop = folioTop + folioBoxHeight + 16;

  data.rmapChains.forEach((chain, i) => {
    const cy = chainTop + i * 22;
    const isHighlighted = frame.highlights.includes(chain.id);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left));
    rect.setAttribute('y', String(cy));
    rect.setAttribute('width', String(usableWidth * 0.7));
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', isHighlighted ? '#1f6feb' : '#1f3050');
    let chainCls = 'anim-rmap-chain';
    if (isHighlighted) chainCls += ' anim-highlight';
    rect.setAttribute('class', chainCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 6));
    text.setAttribute('y', String(cy + 13));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '9');
    text.setAttribute('class', 'anim-rmap-chain');
    text.textContent = `AVC: ${chain.vmaLabel} <-> ${chain.anonVmaLabel}`;
    container.appendChild(text);
  });

  // --- PTE entries ---
  const pteTop = chainTop + data.rmapChains.length * 22 + 12;

  data.pteEntries.forEach((pte, i) => {
    const py = pteTop + i * 22;
    const isHighlighted = frame.highlights.includes(pte.id);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(margin.left));
    rect.setAttribute('y', String(py));
    rect.setAttribute('width', String(usableWidth * 0.5));
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', pte.present ? '#1a4a2a' : '#4a1a1a');
    let pteCls = 'anim-pte';
    if (isHighlighted) pteCls += ' anim-highlight';
    rect.setAttribute('class', pteCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(margin.left + 6));
    text.setAttribute('y', String(py + 13));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '9');
    text.setAttribute('class', 'anim-pte');
    text.textContent = `PTE: ${pte.vaddr} -> ${pte.folioId} [${pte.present ? 'present' : 'cleared'}]`;
    container.appendChild(text);
  });
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'anon-rmap-chain', label: 'Anonymous Rmap Chain' },
  { id: 'file-rmap-walk', label: 'File Rmap Walk (unmap)' },
  { id: 'folio-operations', label: 'Folio Operations Lifecycle' },
];

const rmapFolio: AnimationModule = {
  config: {
    id: 'rmap-folio',
    title: 'Reverse Mappings & Folio Abstraction',
    skillName: 'rmap-and-folio',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'file-rmap-walk': return generateFileRmapWalk();
      case 'folio-operations': return generateFolioOperations();
      case 'anon-rmap-chain':
      default: return generateAnonRmapChain();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default rmapFolio;
