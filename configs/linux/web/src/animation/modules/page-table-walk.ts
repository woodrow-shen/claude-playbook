import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PageTableEntry {
  index: number;
  physAddr: number;
  present: boolean;
  writable: boolean;
  user: boolean;
  accessed: boolean;
  dirty: boolean;
  state: 'idle' | 'reading' | 'found' | 'missing' | 'allocating';
}

export interface PageTableLevel {
  name: 'PGD' | 'PUD' | 'PMD' | 'PTE';
  entries: PageTableEntry[];
  activeIndex: number;
}

export interface PageWalkState {
  virtualAddress: string;
  addressBits: { pgd: number; pud: number; pmd: number; pte: number; offset: number };
  cr3: number;
  levels: PageTableLevel[];
  currentLevel: number;
  physicalPage: number | null;
  tlbHit: boolean;
  faultType: 'none' | 'not-present' | 'write-protect';
  phase: 'walking' | 'faulting' | 'allocating' | 'complete';
  srcRef: string;
}

/** Parse a 48-bit x86-64 virtual address into its 4-level page table indices */
function parseAddress48(addrStr: string): { pgd: number; pud: number; pmd: number; pte: number; offset: number } {
  const addr = parseInt(addrStr.replace('0x', ''), 16);
  return {
    pgd: (addr >>> 39) & 0x1FF,
    pud: (addr >>> 30) & 0x1FF,
    pmd: (addr >>> 21) & 0x1FF,
    pte: (addr >>> 12) & 0x1FF,
    offset: addr & 0xFFF,
  };
}

function makeEntry(index: number, physAddr: number, present: boolean, writable: boolean): PageTableEntry {
  return {
    index,
    physAddr,
    present,
    writable,
    user: true,
    accessed: present,
    dirty: false,
    state: 'idle',
  };
}

/**
 * Build a display-friendly page table level with a small number of entries.
 * The active entry (the one selected by the address bits) is placed at a fixed
 * visual position (slot 1) so that indices larger than the display count work.
 * Other slots show neighbouring entries for context.
 */
function makeLevel(name: 'PGD' | 'PUD' | 'PMD' | 'PTE', activeIdx: number, displayCount: number, activePhysAddr: number, activePresent: boolean, activeWritable: boolean): PageTableLevel {
  const entries: PageTableEntry[] = [];
  const activeSlot = 1; // visual position for the target entry

  for (let slot = 0; slot < displayCount; slot++) {
    if (slot === activeSlot) {
      entries.push(makeEntry(activeIdx, activePhysAddr, activePresent, activeWritable));
    } else {
      // Contextual neighbours: offset from activeIdx so labels look realistic
      const neighbourIdx = Math.max(0, activeIdx - activeSlot + slot);
      const present = slot % 3 !== 2;
      entries.push(makeEntry(neighbourIdx, 0x1000 * (neighbourIdx + 1), present, present));
    }
  }
  return { name, entries, activeIndex: -1 };
}

/** The visual slot where the active entry is always placed */
const ACTIVE_SLOT = 1;

function cloneState(s: PageWalkState): PageWalkState {
  return {
    virtualAddress: s.virtualAddress,
    addressBits: { ...s.addressBits },
    cr3: s.cr3,
    levels: s.levels.map(l => ({
      name: l.name,
      entries: l.entries.map(e => ({ ...e })),
      activeIndex: l.activeIndex,
    })),
    currentLevel: s.currentLevel,
    physicalPage: s.physicalPage,
    tlbHit: s.tlbHit,
    faultType: s.faultType,
    phase: s.phase,
    srcRef: s.srcRef,
  };
}

// Physical addresses used in the animation
const CR3_BASE = 0x10_0000;
const PGD_ENTRY_PHYS = 0x20_0000;
const PUD_ENTRY_PHYS = 0x30_0000;
const PMD_ENTRY_PHYS = 0x40_0000;
const PHYS_PAGE = 0x50_0000;
const NEW_PHYS_PAGE = 0x60_0000;

// ---------------------------------------------------------------------------
// Scenario 1: TLB miss -- full 4-level hardware page table walk
// Traces __handle_mm_fault() in mm/memory.c:6355
// ---------------------------------------------------------------------------
function generateTlbMissWalk(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const vaddr = '0x7fffdeadbeef';
  const bits = parseAddress48(vaddr);

  const state: PageWalkState = {
    virtualAddress: vaddr,
    addressBits: bits,
    cr3: CR3_BASE,
    levels: [
      makeLevel('PGD', bits.pgd, 4, PGD_ENTRY_PHYS, true, true),
      makeLevel('PUD', bits.pud, 4, PUD_ENTRY_PHYS, true, true),
      makeLevel('PMD', bits.pmd, 4, PMD_ENTRY_PHYS, true, true),
      makeLevel('PTE', bits.pte, 4, PHYS_PAGE, true, true),
    ],
    currentLevel: -1,
    physicalPage: null,
    tlbHit: false,
    faultType: 'none',
    phase: 'walking',
    srcRef: 'mm/memory.c:6449 __handle_mm_fault()',
  };

  // Frame 0: TLB miss triggers software walk
  frames.push({
    step: 0,
    label: 'TLB miss for virtual address',
    description: `CPU accesses virtual address ${vaddr}. The TLB has no cached translation -- TLB miss. The CPU raises #PF and the kernel enters __handle_mm_fault() (mm/memory.c:6355) to perform a 4-level page table walk starting from the mm_struct's pgd.`,
    highlights: ['vaddr'],
    data: cloneState(state),
  });

  // Frame 1: Decode the 48-bit virtual address into 9-bit indices
  frames.push({
    step: 1,
    label: 'Decode virtual address bit fields',
    description: `The 48-bit virtual address is decomposed: bits[47:39] = PGD index (${bits.pgd}), bits[38:30] = PUD index (${bits.pud}), bits[29:21] = PMD index (${bits.pmd}), bits[20:12] = PTE index (${bits.pte}), bits[11:0] = page offset (0x${bits.offset.toString(16)}). Each 9-bit index selects one of 512 entries at each page table level.`,
    highlights: ['bits'],
    data: cloneState(state),
  });

  // Frame 2: CR3 -> PGD base via pgd_offset()
  state.currentLevel = 0;
  state.srcRef = 'mm/memory.c:6372 pgd = pgd_offset(mm, address)';
  frames.push({
    step: 2,
    label: 'CR3 -> PGD base (pgd_offset)',
    description: `__handle_mm_fault() calls pgd_offset(mm, address) at mm/memory.c:6372. The CR3 register holds the physical address of the top-level PGD at 0x${CR3_BASE.toString(16)}. On context switch, the kernel loads CR3 via switch_mm() -> load_new_mm_cr3().`,
    highlights: ['cr3'],
    data: cloneState(state),
  });

  // Frame 3: Read PGD entry
  state.levels[0].activeIndex = ACTIVE_SLOT;
  state.levels[0].entries[ACTIVE_SLOT].state = 'reading';
  state.srcRef = 'mm/memory.c:6373 p4d = p4d_alloc(mm, pgd, address)';
  frames.push({
    step: 3,
    label: `Read PGD[${bits.pgd}]`,
    description: `PGD index ${bits.pgd} selects an entry in the PGD table. On x86-64 with 4-level paging, the P4D level is folded into the PGD, so p4d_alloc(mm, pgd, address) at mm/memory.c:6373 effectively passes through to the PGD entry. The entry contains the physical base of the next-level PUD.`,
    highlights: ['pgd-entry'],
    data: cloneState(state),
  });

  // Frame 4: PGD -> PUD via pud_alloc()
  state.levels[0].entries[ACTIVE_SLOT].state = 'found';
  state.currentLevel = 1;
  state.levels[1].activeIndex = ACTIVE_SLOT;
  state.levels[1].entries[ACTIVE_SLOT].state = 'reading';
  state.srcRef = 'mm/memory.c:6377 vmf.pud = pud_alloc(mm, p4d, address)';
  frames.push({
    step: 4,
    label: `PGD[${bits.pgd}] -> PUD base at 0x${PGD_ENTRY_PHYS.toString(16)}`,
    description: `PGD entry is present (P=1). It points to PUD table at physical address 0x${PGD_ENTRY_PHYS.toString(16)}. The kernel calls pud_alloc(mm, p4d, address) at mm/memory.c:6377 to obtain the PUD entry using bits[38:30] = ${bits.pud}. If the PUD did not exist, pud_alloc() would allocate a new page table page.`,
    highlights: ['pud-entry'],
    data: cloneState(state),
  });

  // Frame 5: PUD -> PMD via pmd_alloc()
  state.levels[1].entries[ACTIVE_SLOT].state = 'found';
  state.currentLevel = 2;
  state.levels[2].activeIndex = ACTIVE_SLOT;
  state.levels[2].entries[ACTIVE_SLOT].state = 'reading';
  state.srcRef = 'mm/memory.c:6407 vmf.pmd = pmd_alloc(mm, vmf.pud, address)';
  frames.push({
    step: 5,
    label: `PUD[${bits.pud}] -> PMD base at 0x${PUD_ENTRY_PHYS.toString(16)}`,
    description: `PUD entry is present, pointing to PMD at 0x${PUD_ENTRY_PHYS.toString(16)}. The kernel calls pmd_alloc(mm, vmf.pud, address) at mm/memory.c:6407. Bits[29:21] = ${bits.pmd} index into the PMD. The PMD could also map a 2MB huge page if pmd_trans_huge() is true, but here it points to a regular PTE table.`,
    highlights: ['pmd-entry'],
    data: cloneState(state),
  });

  // Frame 6: PMD -> PTE via handle_pte_fault() -> pte_offset_map_rw_nolock()
  state.levels[2].entries[ACTIVE_SLOT].state = 'found';
  state.currentLevel = 3;
  state.levels[3].activeIndex = ACTIVE_SLOT;
  state.levels[3].entries[ACTIVE_SLOT].state = 'reading';
  state.srcRef = 'mm/memory.c:6455 -> handle_pte_fault() at :6273, pte_offset_map_rw_nolock() at :6302';
  frames.push({
    step: 6,
    label: `PMD[${bits.pmd}] -> PTE base at 0x${PMD_ENTRY_PHYS.toString(16)}`,
    description: `PMD entry is present. __handle_mm_fault() falls through to handle_pte_fault() at mm/memory.c:6455->6273. Inside handle_pte_fault(), pte_offset_map_rw_nolock(mm, pmd, address, ...) at mm/memory.c:6302 maps the PTE page and locates PTE[${bits.pte}] using bits[20:12].`,
    highlights: ['pte-entry'],
    data: cloneState(state),
  });

  // Frame 7: PTE found, extract physical page
  state.levels[3].entries[ACTIVE_SLOT].state = 'found';
  state.levels[3].entries[ACTIVE_SLOT].accessed = true;
  state.physicalPage = PHYS_PAGE;
  state.currentLevel = -1;
  state.srcRef = 'mm/memory.c:6307 vmf->orig_pte = ptep_get_lockless(vmf->pte)';
  frames.push({
    step: 7,
    label: `PTE[${bits.pte}] -> Physical page 0x${PHYS_PAGE.toString(16)}`,
    description: `ptep_get_lockless(vmf->pte) at mm/memory.c:6307 reads the PTE. It is present (P=1), writable (R/W=1), user-accessible (U/S=1). The physical page frame is at 0x${PHYS_PAGE.toString(16)}. The hardware sets the Accessed bit. Final physical address = 0x${(PHYS_PAGE + bits.offset).toString(16)}.`,
    highlights: ['phys-page'],
    data: cloneState(state),
  });

  // Frame 8: Walk complete, TLB caches the translation
  state.phase = 'complete';
  state.tlbHit = true;
  state.srcRef = 'mm/memory.c:6337 entry = pte_mkyoung(entry) -- sets Accessed bit';
  frames.push({
    step: 8,
    label: 'Walk complete -- TLB updated',
    description: `The 4-level walk is complete. handle_pte_fault() calls pte_mkyoung(entry) at mm/memory.c:6337 to set the Accessed bit. Physical address 0x${(PHYS_PAGE + bits.offset).toString(16)} is returned. The translation is cached in the TLB so future accesses bypass the walk. The kernel manages these tables via mm_struct->pgd.`,
    highlights: ['tlb'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 2: Demand paging -- first touch on anonymous page
// Traces handle_pte_fault() -> do_pte_missing() -> do_anonymous_page()
// ---------------------------------------------------------------------------
function generateDemandPagingFault(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const vaddr = '0x7fff00400000';
  const bits = parseAddress48(vaddr);

  const state: PageWalkState = {
    virtualAddress: vaddr,
    addressBits: bits,
    cr3: CR3_BASE,
    levels: [
      makeLevel('PGD', bits.pgd, 4, PGD_ENTRY_PHYS, true, true),
      makeLevel('PUD', bits.pud, 4, PUD_ENTRY_PHYS, true, true),
      makeLevel('PMD', bits.pmd, 4, PMD_ENTRY_PHYS, true, true),
      makeLevel('PTE', bits.pte, 4, 0, false, false),  // PTE not present!
    ],
    currentLevel: -1,
    physicalPage: null,
    tlbHit: false,
    faultType: 'none',
    phase: 'walking',
    srcRef: 'mm/memory.c:6449 __handle_mm_fault()',
  };

  // Frame 0: First access to mmap'd anonymous region
  frames.push({
    step: 0,
    label: 'First access to mmap\'d page',
    description: `Process accesses virtual address ${vaddr} in a newly mmap'd region. The VMA (vm_area_struct) exists but no physical page is allocated yet -- this is demand paging. The kernel enters __handle_mm_fault() at mm/memory.c:6355 to walk the page tables.`,
    highlights: ['vaddr'],
    data: cloneState(state),
  });

  // Frame 1: PGD lookup via pgd_offset() at mm/memory.c:6372
  state.currentLevel = 0;
  state.levels[0].activeIndex = ACTIVE_SLOT;
  state.levels[0].entries[ACTIVE_SLOT].state = 'found';
  state.srcRef = 'mm/memory.c:6372 pgd = pgd_offset(mm, address)';
  frames.push({
    step: 1,
    label: `Walk PGD[${bits.pgd}] -- present`,
    description: `pgd_offset(mm, address) at mm/memory.c:6372 locates the PGD entry. It is present -- the upper page table levels were populated when the process address space was created via fork()/exec().`,
    highlights: ['pgd-entry'],
    data: cloneState(state),
  });

  // Frame 2: PUD via pud_alloc() at mm/memory.c:6377
  state.currentLevel = 1;
  state.levels[1].activeIndex = ACTIVE_SLOT;
  state.levels[1].entries[ACTIVE_SLOT].state = 'found';
  state.srcRef = 'mm/memory.c:6377 vmf.pud = pud_alloc(mm, p4d, address)';
  frames.push({
    step: 2,
    label: `Walk PUD[${bits.pud}] -- present`,
    description: `pud_alloc(mm, p4d, address) at mm/memory.c:6377 returns the PUD entry. It is present. The walk continues to the PMD level.`,
    highlights: ['pud-entry'],
    data: cloneState(state),
  });

  // Frame 3: PMD via pmd_alloc() at mm/memory.c:6407
  state.currentLevel = 2;
  state.levels[2].activeIndex = ACTIVE_SLOT;
  state.levels[2].entries[ACTIVE_SLOT].state = 'found';
  state.srcRef = 'mm/memory.c:6407 vmf.pmd = pmd_alloc(mm, vmf.pud, address)';
  frames.push({
    step: 3,
    label: `Walk PMD[${bits.pmd}] -- present`,
    description: `pmd_alloc(mm, vmf.pud, address) at mm/memory.c:6407 locates the PMD entry. It is present. The walk reaches the PTE level via handle_pte_fault() at mm/memory.c:6455->6273.`,
    highlights: ['pmd-entry'],
    data: cloneState(state),
  });

  // Frame 4: PTE not present -- pte_none() triggers page fault path
  state.currentLevel = 3;
  state.levels[3].activeIndex = ACTIVE_SLOT;
  state.levels[3].entries[ACTIVE_SLOT].state = 'missing';
  state.faultType = 'not-present';
  state.phase = 'faulting';
  state.srcRef = 'mm/memory.c:6310 pte_none(vmf->orig_pte) -> :6316-6317 do_pte_missing()';
  frames.push({
    step: 4,
    label: 'PTE not present -- #PF page fault!',
    description: `handle_pte_fault() reads the PTE at mm/memory.c:6307 via ptep_get_lockless(). pte_none() is true at mm/memory.c:6310, so vmf->pte is set to NULL. At mm/memory.c:6316-6317, the kernel calls do_pte_missing(vmf) since the PTE is empty.`,
    highlights: ['pte-entry', 'fault'],
    data: cloneState(state),
  });

  // Frame 5: do_pte_missing() -> do_anonymous_page()
  state.srcRef = 'mm/memory.c:4472 do_pte_missing() -> :4474 do_anonymous_page() at :5217';
  frames.push({
    step: 5,
    label: 'do_pte_missing() -> do_anonymous_page()',
    description: `do_pte_missing() at mm/memory.c:4472 checks vma_is_anonymous() at :4474. Since this is an anonymous mapping (not file-backed), it calls do_anonymous_page() at mm/memory.c:5217. This is the demand paging path: allocate a physical page on first touch.`,
    highlights: ['fault-handler'],
    data: cloneState(state),
  });

  // Frame 6: do_anonymous_page() allocates PTE table and physical page
  state.phase = 'allocating';
  state.levels[3].entries[ACTIVE_SLOT].state = 'allocating';
  state.srcRef = 'mm/memory.c:5234 pte_alloc() -> :5266 folio = alloc_anon_folio(vmf)';
  frames.push({
    step: 6,
    label: 'Allocating physical page frame',
    description: `do_anonymous_page() first ensures the PTE table exists via pte_alloc(vma->vm_mm, vmf->pmd) at mm/memory.c:5234. For a write fault, it allocates a real page via alloc_anon_folio(vmf) at mm/memory.c:5266. For a read fault, it would use the shared zero_page (mm/memory.c:5238-5258). Page frame allocated at 0x${NEW_PHYS_PAGE.toString(16)}.`,
    highlights: ['alloc'],
    data: cloneState(state),
  });

  // Frame 7: Set PTE with mk_pte() and set_pte_at()
  state.levels[3].entries[ACTIVE_SLOT].physAddr = NEW_PHYS_PAGE;
  state.levels[3].entries[ACTIVE_SLOT].present = true;
  state.levels[3].entries[ACTIVE_SLOT].writable = true;
  state.levels[3].entries[ACTIVE_SLOT].state = 'found';
  state.levels[3].entries[ACTIVE_SLOT].accessed = true;
  state.faultType = 'none';
  state.srcRef = 'mm/memory.c:5217 do_anonymous_page() -- mk_pte() + set_pte_at()';
  frames.push({
    step: 7,
    label: 'Set PTE: Present=1, R/W=1, U/S=1',
    description: `do_anonymous_page() constructs the PTE with mk_pte(page, vma->vm_page_prot) and installs it via set_pte_at(). Flags: Present=1 (mapped), R/W=1 (writable), U/S=1 (user accessible), Accessed=1. The page is zeroed for security to prevent information leaks from previously freed pages.`,
    highlights: ['pte-entry'],
    data: cloneState(state),
  });

  // Frame 8: Fault resolved, CPU retries the faulting instruction
  state.physicalPage = NEW_PHYS_PAGE;
  state.phase = 'complete';
  state.currentLevel = -1;
  state.srcRef = 'mm/memory.c:5217 do_anonymous_page() returns VM_FAULT_MINOR';
  frames.push({
    step: 8,
    label: 'Fault resolved -- access succeeds',
    description: `do_anonymous_page() returns VM_FAULT_MINOR. The CPU retries the faulting instruction. The PTE is now present and the walk completes: physical address = 0x${NEW_PHYS_PAGE.toString(16)} + offset. The translation is cached in the TLB. This entire demand paging process is transparent to userspace.`,
    highlights: ['phys-page', 'tlb'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario 3: Copy-on-write fault after fork()
// Traces handle_pte_fault() -> do_wp_page() -> wp_page_copy()
// ---------------------------------------------------------------------------
function generateCowWriteFault(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const vaddr = '0x7fff00200000';
  const bits = parseAddress48(vaddr);

  const state: PageWalkState = {
    virtualAddress: vaddr,
    addressBits: bits,
    cr3: CR3_BASE,
    levels: [
      makeLevel('PGD', bits.pgd, 4, PGD_ENTRY_PHYS, true, true),
      makeLevel('PUD', bits.pud, 4, PUD_ENTRY_PHYS, true, true),
      makeLevel('PMD', bits.pmd, 4, PMD_ENTRY_PHYS, true, true),
      makeLevel('PTE', bits.pte, 4, PHYS_PAGE, true, false),  // Present but NOT writable (CoW)
    ],
    currentLevel: -1,
    physicalPage: null,
    tlbHit: false,
    faultType: 'none',
    phase: 'walking',
    srcRef: 'mm/memory.c:6449 __handle_mm_fault()',
  };

  // Frame 0: Post-fork write to CoW page
  frames.push({
    step: 0,
    label: 'Fork\'d process writes to shared page',
    description: `After fork(), parent and child share physical pages with copy-on-write. copy_page_range() in kernel/fork.c marks PTEs read-only even if the VMA allows writes. The child writes to virtual address ${vaddr}, triggering __handle_mm_fault() at mm/memory.c:6355.`,
    highlights: ['vaddr'],
    data: cloneState(state),
  });

  // Frame 1: Walk PGD via pgd_offset() at mm/memory.c:6372
  state.currentLevel = 0;
  state.levels[0].activeIndex = ACTIVE_SLOT;
  state.levels[0].entries[ACTIVE_SLOT].state = 'found';
  state.srcRef = 'mm/memory.c:6372 pgd = pgd_offset(mm, address)';
  frames.push({
    step: 1,
    label: `Walk PGD[${bits.pgd}] -- present`,
    description: `pgd_offset(mm, address) at mm/memory.c:6372 locates the PGD entry. It is present. After fork(), the child has its own page tables created by copy_page_range() (kernel/fork.c).`,
    highlights: ['pgd-entry'],
    data: cloneState(state),
  });

  // Frame 2: PUD via pud_alloc() at mm/memory.c:6377
  state.currentLevel = 1;
  state.levels[1].activeIndex = ACTIVE_SLOT;
  state.levels[1].entries[ACTIVE_SLOT].state = 'found';
  state.srcRef = 'mm/memory.c:6377 vmf.pud = pud_alloc(mm, p4d, address)';
  frames.push({
    step: 2,
    label: `Walk PUD[${bits.pud}] -- present`,
    description: `pud_alloc(mm, p4d, address) at mm/memory.c:6377 returns the PUD entry. Present. Walking through the forked page table structure.`,
    highlights: ['pud-entry'],
    data: cloneState(state),
  });

  // Frame 3: PMD via pmd_alloc() at mm/memory.c:6407
  state.currentLevel = 2;
  state.levels[2].activeIndex = ACTIVE_SLOT;
  state.levels[2].entries[ACTIVE_SLOT].state = 'found';
  state.srcRef = 'mm/memory.c:6407 vmf.pmd = pmd_alloc(mm, vmf.pud, address)';
  frames.push({
    step: 3,
    label: `Walk PMD[${bits.pmd}] -- present`,
    description: `pmd_alloc(mm, vmf.pud, address) at mm/memory.c:6407 returns the PMD entry. Present. One more level to the PTE.`,
    highlights: ['pmd-entry'],
    data: cloneState(state),
  });

  // Frame 4: PTE present but read-only -- write fault detected
  state.currentLevel = 3;
  state.levels[3].activeIndex = ACTIVE_SLOT;
  state.levels[3].entries[ACTIVE_SLOT].state = 'reading';
  state.srcRef = 'mm/memory.c:6302 pte_offset_map_rw_nolock() -> :6307 ptep_get_lockless()';
  frames.push({
    step: 4,
    label: 'PTE present but R/W=0 -- write attempt',
    description: `handle_pte_fault() at mm/memory.c:6273 calls pte_offset_map_rw_nolock() at :6302 to map the PTE, then ptep_get_lockless() at :6307 reads it. PTE[${bits.pte}] is present (P=1) but R/W=0 (read-only). The page at 0x${PHYS_PAGE.toString(16)} is shared (refcount=2).`,
    highlights: ['pte-entry'],
    data: cloneState(state),
  });

  // Frame 5: Write-protect fault -> do_wp_page()
  state.faultType = 'write-protect';
  state.phase = 'faulting';
  state.levels[3].entries[ACTIVE_SLOT].state = 'missing';
  state.srcRef = 'mm/memory.c:6331-6333 FAULT_FLAG_WRITE && !pte_write -> do_wp_page()';
  frames.push({
    step: 5,
    label: '#PF write-protection fault!',
    description: `At mm/memory.c:6331, handle_pte_fault() checks (vmf->flags & FAULT_FLAG_WRITE) && !pte_write(entry). Both are true, so it calls do_wp_page(vmf) at mm/memory.c:6333. Since the VMA has VM_WRITE, this is a legitimate CoW fault, not a protection violation.`,
    highlights: ['fault'],
    data: cloneState(state),
  });

  // Frame 6: do_wp_page() -> wp_page_copy() allocates new page
  state.phase = 'allocating';
  state.levels[3].entries[ACTIVE_SLOT].state = 'allocating';
  state.srcRef = 'mm/memory.c:4149 do_wp_page() -> :3758 wp_page_copy() -> :3780 folio_prealloc()';
  frames.push({
    step: 6,
    label: 'do_wp_page() -> wp_page_copy() -- allocate and copy',
    description: `do_wp_page() at mm/memory.c:4149 determines this page needs copying and calls wp_page_copy() at mm/memory.c:3758. wp_page_copy() allocates a new folio via folio_prealloc() at :3780 (page at 0x${NEW_PHYS_PAGE.toString(16)}), then copies the old page content via __wp_page_copy_user() at :3787.`,
    highlights: ['alloc', 'copy'],
    data: cloneState(state),
  });

  // Frame 7: Update PTE to point to new private page
  state.levels[3].entries[ACTIVE_SLOT].physAddr = NEW_PHYS_PAGE;
  state.levels[3].entries[ACTIVE_SLOT].writable = true;
  state.levels[3].entries[ACTIVE_SLOT].dirty = true;
  state.levels[3].entries[ACTIVE_SLOT].state = 'found';
  state.faultType = 'none';
  state.srcRef = 'mm/memory.c:3758 wp_page_copy() -- set_pte_at() + flush_tlb_page()';
  frames.push({
    step: 7,
    label: 'Update PTE: new page, R/W=1, Dirty=1',
    description: `wp_page_copy() at mm/memory.c:3758 updates the PTE via set_pte_at() to point to the new page 0x${NEW_PHYS_PAGE.toString(16)} with R/W=1 and Dirty=1. The old TLB entry is invalidated via flush_tlb_page(). The old page's refcount drops (2->1); the parent keeps it read-only until it also writes.`,
    highlights: ['pte-entry'],
    data: cloneState(state),
  });

  // Frame 8: CoW complete, write succeeds on private copy
  state.physicalPage = NEW_PHYS_PAGE;
  state.phase = 'complete';
  state.currentLevel = -1;
  state.srcRef = 'mm/memory.c:3758 wp_page_copy() returns VM_FAULT_WRITE';
  frames.push({
    step: 8,
    label: 'CoW complete -- write succeeds on private copy',
    description: `wp_page_copy() returns VM_FAULT_WRITE. The CPU retries the write instruction. The PTE now points to the child's private copy at 0x${NEW_PHYS_PAGE.toString(16)} with write permission. Parent and child have independent pages -- this is copy-on-write as implemented in mm/memory.c:3758 (wp_page_copy).`,
    highlights: ['phys-page'],
    data: cloneState(state),
  });

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'tlb-miss-walk', label: 'TLB Miss -- Full 4-Level Walk' },
  { id: 'demand-paging-fault', label: 'Demand Paging (First Touch Fault)' },
  { id: 'cow-write-fault', label: 'Copy-on-Write Fault' },
];

const NS = 'http://www.w3.org/2000/svg';

// Colors for address bit fields
const BIT_COLORS: Record<string, string> = {
  pgd: '#e74c3c',   // red
  pud: '#3498db',   // blue
  pmd: '#2ecc71',   // green
  pte: '#f39c12',   // gold
  offset: '#95a5a6', // gray
};

const LEVEL_NAMES: ('PGD' | 'PUD' | 'PMD' | 'PTE')[] = ['PGD', 'PUD', 'PMD', 'PTE'];
const LEVEL_BIT_KEYS: string[] = ['pgd', 'pud', 'pmd', 'pte'];

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as PageWalkState;
  const margin = { top: 10, right: 15, bottom: 10, left: 15 };

  // -- Title --
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '18');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = '4-Level Page Table Walk';
  container.appendChild(titleEl);

  // -- Virtual address with colored bit fields (top bar) --
  const addrY = 42;
  const addrLabel = document.createElementNS(NS, 'text');
  addrLabel.setAttribute('x', String(margin.left));
  addrLabel.setAttribute('y', String(addrY));
  addrLabel.setAttribute('class', 'anim-block-label');
  addrLabel.textContent = `VA: ${data.virtualAddress}`;
  container.appendChild(addrLabel);

  // Bit field boxes
  const bitFieldX = 180;
  const bitFieldW = (width - bitFieldX - margin.right) / 5;
  const bitFieldH = 22;
  const bitFieldY = addrY - 15;

  const fieldNames = ['PGD [47:39]', 'PUD [38:30]', 'PMD [29:21]', 'PTE [20:12]', 'Offset [11:0]'];
  const fieldKeys = ['pgd', 'pud', 'pmd', 'pte', 'offset'];
  const fieldValues = [
    data.addressBits.pgd,
    data.addressBits.pud,
    data.addressBits.pmd,
    data.addressBits.pte,
    data.addressBits.offset,
  ];

  for (let i = 0; i < 5; i++) {
    const x = bitFieldX + i * bitFieldW;
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(bitFieldY));
    rect.setAttribute('width', String(bitFieldW - 2));
    rect.setAttribute('height', String(bitFieldH));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', BIT_COLORS[fieldKeys[i]]);
    rect.setAttribute('opacity', '0.3');

    // Highlight the current level's bit field
    if (data.currentLevel >= 0 && data.currentLevel < 4 && i === data.currentLevel) {
      rect.setAttribute('opacity', '0.8');
      rect.setAttribute('class', 'anim-highlight');
    }
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(x + (bitFieldW - 2) / 2));
    label.setAttribute('y', String(bitFieldY + 14));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-block-label');
    label.setAttribute('font-size', '9');
    label.textContent = `${fieldNames[i]}: ${fieldValues[i]}`;
    container.appendChild(label);
  }

  // -- CR3 Register (left side) --
  const cr3X = margin.left;
  const cr3Y = 80;
  const cr3W = 80;
  const cr3H = 30;

  const cr3Rect = document.createElementNS(NS, 'rect');
  cr3Rect.setAttribute('x', String(cr3X));
  cr3Rect.setAttribute('y', String(cr3Y));
  cr3Rect.setAttribute('width', String(cr3W));
  cr3Rect.setAttribute('height', String(cr3H));
  cr3Rect.setAttribute('rx', '4');
  cr3Rect.setAttribute('class', 'anim-block anim-block-allocated');
  if (frame.highlights.includes('cr3')) {
    cr3Rect.setAttribute('class', 'anim-block anim-block-allocated anim-highlight');
  }
  container.appendChild(cr3Rect);

  const cr3Label = document.createElementNS(NS, 'text');
  cr3Label.setAttribute('x', String(cr3X + cr3W / 2));
  cr3Label.setAttribute('y', String(cr3Y + 12));
  cr3Label.setAttribute('text-anchor', 'middle');
  cr3Label.setAttribute('class', 'anim-block-label');
  cr3Label.setAttribute('font-size', '10');
  cr3Label.textContent = 'CR3';
  container.appendChild(cr3Label);

  const cr3Addr = document.createElementNS(NS, 'text');
  cr3Addr.setAttribute('x', String(cr3X + cr3W / 2));
  cr3Addr.setAttribute('y', String(cr3Y + 24));
  cr3Addr.setAttribute('text-anchor', 'middle');
  cr3Addr.setAttribute('class', 'anim-block-label');
  cr3Addr.setAttribute('font-size', '8');
  cr3Addr.textContent = `0x${data.cr3.toString(16)}`;
  container.appendChild(cr3Addr);

  // -- Page Table Columns (center area) --
  const colStartX = 120;
  const colWidth = (width - colStartX - 140) / 4;
  const colTopY = 80;
  const entryH = 28;
  const entryGap = 4;

  for (let lvl = 0; lvl < 4; lvl++) {
    const level = data.levels[lvl];
    const colX = colStartX + lvl * colWidth;

    // Level header
    const header = document.createElementNS(NS, 'text');
    header.setAttribute('x', String(colX + colWidth / 2));
    header.setAttribute('y', String(colTopY - 5));
    header.setAttribute('text-anchor', 'middle');
    header.setAttribute('class', 'anim-freelist-title');
    header.setAttribute('font-size', '11');
    header.setAttribute('fill', BIT_COLORS[LEVEL_BIT_KEYS[lvl]]);
    header.textContent = level.name;
    container.appendChild(header);

    // Draw entries
    for (let e = 0; e < level.entries.length; e++) {
      const entry = level.entries[e];
      const entryX = colX + 5;
      const entryY = colTopY + e * (entryH + entryGap);
      const entryW = colWidth - 10;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(entryX));
      rect.setAttribute('y', String(entryY));
      rect.setAttribute('width', String(entryW));
      rect.setAttribute('height', String(entryH));
      rect.setAttribute('rx', '3');

      let cls = 'anim-block';
      if (e === level.activeIndex) {
        switch (entry.state) {
          case 'reading':
            cls += ' anim-block-splitting';
            break;
          case 'found':
            cls += ' anim-block-allocated';
            break;
          case 'missing':
            cls += ' anim-block-free';
            break;
          case 'allocating':
            cls += ' anim-block-coalescing';
            break;
          default:
            cls += ' anim-block-free';
        }
        cls += ' anim-highlight';
      } else if (entry.present) {
        cls += ' anim-block-free';
      } else {
        cls += ' anim-block';
      }
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      // Entry text
      const entryText = document.createElementNS(NS, 'text');
      entryText.setAttribute('x', String(entryX + entryW / 2));
      entryText.setAttribute('y', String(entryY + entryH / 2 + 4));
      entryText.setAttribute('text-anchor', 'middle');
      entryText.setAttribute('class', 'anim-block-label');
      entryText.setAttribute('font-size', '9');

      if (e === level.activeIndex) {
        const flags = [];
        if (entry.present) flags.push('P');
        if (entry.writable) flags.push('RW');
        if (entry.accessed) flags.push('A');
        if (entry.dirty) flags.push('D');
        entryText.textContent = `[${entry.index}] ${flags.join(' ') || 'not present'}`;
      } else {
        entryText.textContent = `[${entry.index}]`;
      }
      container.appendChild(entryText);
    }

    // Arrow from active entry to next level (if found)
    if (level.activeIndex >= 0 && lvl < 3) {
      const entry = level.entries[level.activeIndex];
      if (entry.state === 'found') {
        const fromX = colX + colWidth - 5;
        const fromY = colTopY + level.activeIndex * (entryH + entryGap) + entryH / 2;
        const toX = colStartX + (lvl + 1) * colWidth + 5;
        const toY = fromY;

        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', String(fromX));
        line.setAttribute('y1', String(fromY));
        line.setAttribute('x2', String(toX));
        line.setAttribute('y2', String(toY));
        line.setAttribute('stroke', BIT_COLORS[LEVEL_BIT_KEYS[lvl]]);
        line.setAttribute('stroke-width', '2');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        container.appendChild(line);
      }
    }
  }

  // Arrow marker definition
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const polygon = document.createElementNS(NS, 'polygon');
  polygon.setAttribute('points', '0 0, 8 3, 0 6');
  polygon.setAttribute('fill', '#666');
  marker.appendChild(polygon);
  defs.appendChild(marker);
  container.appendChild(defs);

  // -- CR3 arrow to PGD --
  if (data.currentLevel >= 0 || data.phase === 'complete') {
    const arrowLine = document.createElementNS(NS, 'line');
    arrowLine.setAttribute('x1', String(cr3X + cr3W));
    arrowLine.setAttribute('y1', String(cr3Y + cr3H / 2));
    arrowLine.setAttribute('x2', String(colStartX + 5));
    arrowLine.setAttribute('y2', String(cr3Y + cr3H / 2));
    arrowLine.setAttribute('stroke', '#e74c3c');
    arrowLine.setAttribute('stroke-width', '2');
    arrowLine.setAttribute('stroke-dasharray', '4,2');
    container.appendChild(arrowLine);
  }

  // -- Physical Page (bottom-right) --
  const physX = width - 130;
  const physY = colTopY;
  const physW = 110;
  const physH = 50;

  if (data.physicalPage !== null) {
    const physRect = document.createElementNS(NS, 'rect');
    physRect.setAttribute('x', String(physX));
    physRect.setAttribute('y', String(physY));
    physRect.setAttribute('width', String(physW));
    physRect.setAttribute('height', String(physH));
    physRect.setAttribute('rx', '4');
    physRect.setAttribute('class', 'anim-block anim-block-allocated anim-highlight');
    container.appendChild(physRect);

    const physLabel = document.createElementNS(NS, 'text');
    physLabel.setAttribute('x', String(physX + physW / 2));
    physLabel.setAttribute('y', String(physY + 18));
    physLabel.setAttribute('text-anchor', 'middle');
    physLabel.setAttribute('class', 'anim-block-label');
    physLabel.setAttribute('font-size', '10');
    physLabel.textContent = 'Physical Page';
    container.appendChild(physLabel);

    const physAddr = document.createElementNS(NS, 'text');
    physAddr.setAttribute('x', String(physX + physW / 2));
    physAddr.setAttribute('y', String(physY + 35));
    physAddr.setAttribute('text-anchor', 'middle');
    physAddr.setAttribute('class', 'anim-block-label');
    physAddr.setAttribute('font-size', '9');
    physAddr.textContent = `0x${data.physicalPage.toString(16)}`;
    container.appendChild(physAddr);

    // Arrow from PTE to physical page
    const pteLevel = data.levels[3];
    if (pteLevel.activeIndex >= 0) {
      const fromX = colStartX + 3 * colWidth + colWidth - 5;
      const fromY = colTopY + pteLevel.activeIndex * (entryH + entryGap) + entryH / 2;
      const toX = physX;
      const toY = physY + physH / 2;

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(fromX));
      line.setAttribute('y1', String(fromY));
      line.setAttribute('x2', String(toX));
      line.setAttribute('y2', String(toY));
      line.setAttribute('stroke', '#f39c12');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);
    }
  }

  // -- Source reference (above fault/status area) --
  if (data.srcRef) {
    const srcRefY = height - 70;
    const srcRefText = document.createElementNS(NS, 'text');
    srcRefText.setAttribute('x', String(width / 2));
    srcRefText.setAttribute('y', String(srcRefY));
    srcRefText.setAttribute('text-anchor', 'middle');
    srcRefText.setAttribute('class', 'anim-block-label');
    srcRefText.setAttribute('font-size', '9');
    srcRefText.setAttribute('fill', '#7f8c8d');
    srcRefText.textContent = data.srcRef;
    container.appendChild(srcRefText);
  }

  // -- Fault/Allocating indicator (bottom area) --
  if (data.phase === 'faulting' || data.phase === 'allocating') {
    const faultY = height - 60;
    const faultRect = document.createElementNS(NS, 'rect');
    faultRect.setAttribute('x', String(margin.left));
    faultRect.setAttribute('y', String(faultY));
    faultRect.setAttribute('width', String(width - margin.left - margin.right));
    faultRect.setAttribute('height', String(40));
    faultRect.setAttribute('rx', '4');
    faultRect.setAttribute('class', data.phase === 'faulting' ? 'anim-block anim-block-splitting' : 'anim-block anim-block-coalescing');
    container.appendChild(faultRect);

    const faultText = document.createElementNS(NS, 'text');
    faultText.setAttribute('x', String(width / 2));
    faultText.setAttribute('y', String(faultY + 24));
    faultText.setAttribute('text-anchor', 'middle');
    faultText.setAttribute('class', 'anim-block-label');
    faultText.setAttribute('font-size', '11');
    if (data.phase === 'faulting') {
      faultText.textContent = data.faultType === 'write-protect'
        ? 'FAULT: Write to read-only page (CoW) -> do_wp_page()'
        : 'FAULT: Page not present -> do_anonymous_page()';
    } else {
      faultText.textContent = 'Allocating physical page from buddy allocator...';
    }
    container.appendChild(faultText);
  }

  // -- Phase/Status (bottom) --
  const statusY = height - 12;
  const statusText = document.createElementNS(NS, 'text');
  statusText.setAttribute('x', String(width / 2));
  statusText.setAttribute('y', String(statusY));
  statusText.setAttribute('text-anchor', 'middle');
  statusText.setAttribute('class', 'anim-addr-marker');
  statusText.setAttribute('font-size', '10');
  if (data.phase === 'complete') {
    statusText.textContent = `Walk complete. Physical: 0x${(data.physicalPage! + data.addressBits.offset).toString(16)}`;
  } else if (data.currentLevel >= 0 && data.currentLevel < 4) {
    statusText.textContent = `Walking level ${data.currentLevel + 1}/4: ${LEVEL_NAMES[data.currentLevel]}`;
  } else {
    statusText.textContent = `Phase: ${data.phase}`;
  }
  container.appendChild(statusText);
}

const pageTableWalk: AnimationModule = {
  config: {
    id: 'page-table-walk',
    title: '4-Level Page Table Walk',
    skillName: 'page-allocation',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'demand-paging-fault':
        return generateDemandPagingFault();
      case 'cow-write-fault':
        return generateCowWriteFault();
      case 'tlb-miss-walk':
      default:
        return generateTlbMissWalk();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default pageTableWalk;
