import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PageFaultState {
  faultAddress: string;
  faultType: 'read' | 'write' | 'exec';
  pageTableLevels: {
    pgd: string | null;
    p4d: string | null;
    pud: string | null;
    pmd: string | null;
    pte: string | null;
  };
  currentFunction: string;
  phase: 'trap' | 'find-vma' | 'walk-pgt' | 'handle-pte' | 'alloc-page' | 'map-page' | 'cow-copy' | 'file-read' | 'resolved';
  vmaInfo: { start: string; end: string; flags: string } | null;
  physicalPage: string | null;
  srcRef: string;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'anonymous-page-fault', label: 'Anonymous Page Fault (demand paging)' },
  { id: 'copy-on-write', label: 'Copy-on-Write (COW) Fault' },
  { id: 'file-backed-fault', label: 'File-Backed Page Fault (mmap read)' },
];

function makeState(overrides: Partial<PageFaultState> & { srcRef: string; currentFunction: string; phase: PageFaultState['phase'] }): PageFaultState {
  return {
    faultAddress: '0x7f1234000',
    faultType: 'read',
    pageTableLevels: { pgd: null, p4d: null, pud: null, pmd: null, pte: null },
    currentFunction: overrides.currentFunction,
    phase: overrides.phase,
    vmaInfo: null,
    physicalPage: null,
    srcRef: overrides.srcRef,
    ...overrides,
  };
}

function cloneState(s: PageFaultState): PageFaultState {
  return {
    faultAddress: s.faultAddress,
    faultType: s.faultType,
    pageTableLevels: { ...s.pageTableLevels },
    currentFunction: s.currentFunction,
    phase: s.phase,
    vmaInfo: s.vmaInfo ? { ...s.vmaInfo } : null,
    physicalPage: s.physicalPage,
    srcRef: s.srcRef,
  };
}

function frame(step: number, label: string, description: string, highlights: string[], state: PageFaultState): AnimationFrame {
  return { step, label, description, highlights, data: cloneState(state) };
}

// ----- Scenario 1: Anonymous Page Fault -----

function generateAnonymousPageFault(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let step = 0;

  // Frame 0: Hardware trap fires exc_page_fault
  const s = makeState({
    faultAddress: '0x7f1234000',
    faultType: 'read',
    phase: 'trap',
    currentFunction: 'exc_page_fault',
    srcRef: 'arch/x86/mm/fault.c:1483',
  });
  frames.push(frame(step++, 'Hardware Page Fault Trap',
    'CPU raises #PF exception. exc_page_fault() at arch/x86/mm/fault.c:1483 reads the faulting address from CR2 and enters the page fault handler.',
    ['exc_page_fault'], s));

  // Frame 1: do_user_addr_fault
  s.currentFunction = 'do_user_addr_fault';
  s.srcRef = 'arch/x86/mm/fault.c:1207';
  frames.push(frame(step++, 'Enter do_user_addr_fault()',
    'exc_page_fault() dispatches to do_user_addr_fault() at arch/x86/mm/fault.c:1207. Retrieves current->mm, sets FAULT_FLAG_DEFAULT, and prepares to locate the VMA.',
    ['do_user_addr_fault'], s));

  // Frame 2: lock_mm_and_find_vma
  s.phase = 'find-vma';
  s.currentFunction = 'lock_mm_and_find_vma';
  s.srcRef = 'arch/x86/mm/fault.c:1357';
  s.vmaInfo = { start: '0x7f1234000', end: '0x7f1235000', flags: 'VM_READ|VM_WRITE' };
  frames.push(frame(step++, 'Find VMA for Faulting Address',
    'do_user_addr_fault() calls lock_mm_and_find_vma() at arch/x86/mm/fault.c:1357 (impl at mm/mmap_lock.c:496). Acquires mmap_lock and finds the VMA covering the faulting address.',
    ['lock_mm_and_find_vma', 'vma'], s));

  // Frame 3: handle_mm_fault
  s.phase = 'walk-pgt';
  s.currentFunction = 'handle_mm_fault';
  s.srcRef = 'mm/memory.c:6589';
  frames.push(frame(step++, 'Call handle_mm_fault()',
    'do_user_addr_fault() calls handle_mm_fault() at mm/memory.c:6589. Sanitizes fault flags and checks VMA access permissions before entering __handle_mm_fault().',
    ['handle_mm_fault'], s));

  // Frame 4: __handle_mm_fault walks PGD -> P4D -> PUD -> PMD
  s.currentFunction = '__handle_mm_fault';
  s.srcRef = 'mm/memory.c:6355';
  s.pageTableLevels.pgd = '0x1000 [present]';
  s.pageTableLevels.p4d = '0x2000 [present]';
  s.pageTableLevels.pud = '0x3000 [present]';
  s.pageTableLevels.pmd = '0x4000 [present]';
  frames.push(frame(step++, 'Walk Page Table Levels',
    '__handle_mm_fault() at mm/memory.c:6355 walks the 4-level page table. pgd_offset() at line 6372, p4d_alloc() at line 6373, pud_alloc() at line 6377, pmd_alloc() at line 6407. Each level is allocated or found present.',
    ['pgd', 'p4d', 'pud', 'pmd'], s));

  // Frame 5: handle_pte_fault -> PTE is missing
  s.phase = 'handle-pte';
  s.currentFunction = 'handle_pte_fault';
  s.srcRef = 'mm/memory.c:6273';
  s.pageTableLevels.pte = 'none';
  frames.push(frame(step++, 'PTE Not Present',
    'handle_pte_fault() at mm/memory.c:6273 finds pmd_none() is false but PTE is not present (pte_none at line 6310). Calls do_pte_missing() at mm/memory.c:4472 which dispatches to do_anonymous_page() since vma_is_anonymous().',
    ['handle_pte_fault', 'pte-missing'], s));

  // Frame 6: do_anonymous_page allocates zero page
  s.phase = 'alloc-page';
  s.currentFunction = 'do_anonymous_page';
  s.srcRef = 'mm/memory.c:5217';
  s.physicalPage = '0xffff888000050000';
  frames.push(frame(step++, 'Allocate Anonymous Page',
    'do_anonymous_page() at mm/memory.c:5217 allocates a PTE table via pte_alloc() at line 5234. For a read fault, maps the shared zero page via pte_mkspecial(pfn_pte(my_zero_pfn())) at line 5240. For write faults, allocates a new zeroed folio.',
    ['do_anonymous_page', 'alloc'], s));

  // Frame 7: Map the PTE and return
  s.phase = 'map-page';
  s.currentFunction = 'do_anonymous_page';
  s.srcRef = 'mm/memory.c:5242';
  s.pageTableLevels.pte = '0x50000 [present,user,accessed]';
  frames.push(frame(step++, 'Install PTE Entry',
    'do_anonymous_page() calls pte_offset_map_lock() at mm/memory.c:5242 to lock the PTE, verifies no race via vmf_pte_changed() at line 5246, then installs the new PTE entry via set_pte_at(). The page is now mapped.',
    ['pte-install'], s));

  // Frame 8: Fault resolved
  s.phase = 'resolved';
  s.currentFunction = 'exc_page_fault';
  s.srcRef = 'arch/x86/mm/fault.c:1385';
  frames.push(frame(step++, 'Fault Resolved',
    'Control returns up the call stack. handle_mm_fault() returns VM_FAULT_NOPAGE at arch/x86/mm/fault.c:1385. The process resumes execution at the faulting instruction, which now succeeds because the PTE is present.',
    ['resolved'], s));

  return frames;
}

// ----- Scenario 2: Copy-on-Write -----

function generateCopyOnWrite(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let step = 0;

  const s = makeState({
    faultAddress: '0x55a000',
    faultType: 'write',
    phase: 'trap',
    currentFunction: 'exc_page_fault',
    srcRef: 'arch/x86/mm/fault.c:1483',
  });

  // Frame 0: Hardware trap
  frames.push(frame(step++, 'Write Fault on COW Page',
    'CPU raises #PF with write error code. exc_page_fault() at arch/x86/mm/fault.c:1483 reads CR2 = 0x55a000. The PTE is present but read-only (COW mapping from fork).',
    ['exc_page_fault'], s));

  // Frame 1: do_user_addr_fault
  s.currentFunction = 'do_user_addr_fault';
  s.srcRef = 'arch/x86/mm/fault.c:1207';
  frames.push(frame(step++, 'Enter do_user_addr_fault()',
    'exc_page_fault() dispatches to do_user_addr_fault() at arch/x86/mm/fault.c:1207. Sets FAULT_FLAG_WRITE because the error code indicates a write access.',
    ['do_user_addr_fault'], s));

  // Frame 2: find VMA
  s.phase = 'find-vma';
  s.currentFunction = 'lock_mm_and_find_vma';
  s.srcRef = 'arch/x86/mm/fault.c:1357';
  s.vmaInfo = { start: '0x55a000', end: '0x55b000', flags: 'VM_READ|VM_WRITE' };
  frames.push(frame(step++, 'Find VMA',
    'lock_mm_and_find_vma() at arch/x86/mm/fault.c:1357 locates the VMA. The VMA has VM_WRITE permission, so access_error() at line 1367 does not fire.',
    ['lock_mm_and_find_vma', 'vma'], s));

  // Frame 3: handle_mm_fault -> __handle_mm_fault
  s.phase = 'walk-pgt';
  s.currentFunction = 'handle_mm_fault';
  s.srcRef = 'mm/memory.c:6589';
  s.pageTableLevels.pgd = '0x1000 [present]';
  s.pageTableLevels.p4d = '0x2000 [present]';
  s.pageTableLevels.pud = '0x3000 [present]';
  s.pageTableLevels.pmd = '0x4000 [present]';
  frames.push(frame(step++, 'Walk Page Table',
    'handle_mm_fault() at mm/memory.c:6589 calls __handle_mm_fault() at mm/memory.c:6355. Walks PGD (line 6372), P4D (line 6373), PUD (line 6377), PMD (line 6407). All levels present.',
    ['handle_mm_fault', 'pgd', 'p4d', 'pud', 'pmd'], s));

  // Frame 4: handle_pte_fault finds write-protected PTE
  s.phase = 'handle-pte';
  s.currentFunction = 'handle_pte_fault';
  s.srcRef = 'mm/memory.c:6273';
  s.pageTableLevels.pte = '0x50000 [present,user,readonly]';
  frames.push(frame(step++, 'PTE Present but Read-Only',
    'handle_pte_fault() at mm/memory.c:6273 finds PTE present (pte_present at line 6319 is true). FAULT_FLAG_WRITE is set and pte_write() is false at line 6332, so it calls do_wp_page() at line 6333.',
    ['handle_pte_fault', 'pte-readonly'], s));

  // Frame 5: do_wp_page checks page count
  s.currentFunction = 'do_wp_page';
  s.srcRef = 'mm/memory.c:4149';
  frames.push(frame(step++, 'Enter do_wp_page()',
    'do_wp_page() at mm/memory.c:4149 determines COW is needed. Checks the folio reference count to decide whether to reuse (single owner) or copy (shared). For a forked process, the page is shared so wp_page_copy() at mm/memory.c:3758 is called.',
    ['do_wp_page'], s));

  // Frame 6: wp_page_copy allocates and copies
  s.phase = 'cow-copy';
  s.currentFunction = 'wp_page_copy';
  s.srcRef = 'mm/memory.c:3758';
  s.physicalPage = '0xffff888000060000';
  frames.push(frame(step++, 'Copy Page (COW)',
    'wp_page_copy() at mm/memory.c:3758 allocates a new folio, calls __wp_page_copy_user() at line 3787 to copy the old page contents to the new page. Then prepares to update the PTE.',
    ['wp_page_copy', 'copy'], s));

  // Frame 7: Update PTE with write permission
  s.phase = 'map-page';
  s.currentFunction = 'wp_page_copy';
  s.srcRef = 'mm/memory.c:3758';
  s.pageTableLevels.pte = '0x60000 [present,user,writable,dirty]';
  frames.push(frame(step++, 'Update PTE with Write Permission',
    'wp_page_copy() installs the new PTE pointing to the freshly copied page with write permission via set_pte_at_notify(). The old shared page reference is released. TLB is flushed for the old mapping.',
    ['pte-install', 'cow-done'], s));

  // Frame 8: Fault resolved
  s.phase = 'resolved';
  s.currentFunction = 'exc_page_fault';
  s.srcRef = 'arch/x86/mm/fault.c:1385';
  frames.push(frame(step++, 'COW Fault Resolved',
    'Control returns to exc_page_fault(). The write instruction is retried and succeeds, now writing to the private copy of the page. The parent process retains its original read-only mapping.',
    ['resolved'], s));

  return frames;
}

// ----- Scenario 3: File-Backed Page Fault -----

function generateFileBackedFault(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  let step = 0;

  const s = makeState({
    faultAddress: '0x7f5678000',
    faultType: 'read',
    phase: 'trap',
    currentFunction: 'exc_page_fault',
    srcRef: 'arch/x86/mm/fault.c:1483',
  });

  // Frame 0: Hardware trap
  frames.push(frame(step++, 'Page Fault on mmap Region',
    'CPU raises #PF. exc_page_fault() at arch/x86/mm/fault.c:1483 reads the faulting address from CR2. The address falls in a file-backed mmap region that has not been populated yet.',
    ['exc_page_fault'], s));

  // Frame 1: do_user_addr_fault
  s.currentFunction = 'do_user_addr_fault';
  s.srcRef = 'arch/x86/mm/fault.c:1207';
  frames.push(frame(step++, 'Enter do_user_addr_fault()',
    'do_user_addr_fault() at arch/x86/mm/fault.c:1207 sets FAULT_FLAG_DEFAULT and retrieves the mm_struct from current->mm at line 1218.',
    ['do_user_addr_fault'], s));

  // Frame 2: find VMA
  s.phase = 'find-vma';
  s.currentFunction = 'lock_mm_and_find_vma';
  s.srcRef = 'arch/x86/mm/fault.c:1357';
  s.vmaInfo = { start: '0x7f5678000', end: '0x7f5688000', flags: 'VM_READ|VM_EXEC' };
  frames.push(frame(step++, 'Find File-Backed VMA',
    'lock_mm_and_find_vma() at arch/x86/mm/fault.c:1357 finds the VMA. The VMA has vm_ops->fault set (file-backed) and flags VM_READ|VM_EXEC.',
    ['lock_mm_and_find_vma', 'vma'], s));

  // Frame 3: handle_mm_fault -> __handle_mm_fault
  s.phase = 'walk-pgt';
  s.currentFunction = 'handle_mm_fault';
  s.srcRef = 'mm/memory.c:6589';
  s.pageTableLevels.pgd = '0x1000 [present]';
  s.pageTableLevels.p4d = '0x2000 [present]';
  s.pageTableLevels.pud = '0x3000 [present]';
  s.pageTableLevels.pmd = '0x4000 [present]';
  frames.push(frame(step++, 'Walk Page Table Levels',
    'handle_mm_fault() at mm/memory.c:6589 enters __handle_mm_fault() at mm/memory.c:6355. Walks PGD (line 6372), P4D (line 6373), PUD (line 6377), PMD (line 6407) -- all levels present.',
    ['handle_mm_fault', 'pgd', 'p4d', 'pud', 'pmd'], s));

  // Frame 4: handle_pte_fault -> PTE missing -> do_fault
  s.phase = 'handle-pte';
  s.currentFunction = 'handle_pte_fault';
  s.srcRef = 'mm/memory.c:6273';
  s.pageTableLevels.pte = 'none';
  frames.push(frame(step++, 'PTE Missing -- File Fault Path',
    'handle_pte_fault() at mm/memory.c:6273 finds PTE not present (pte_none at line 6310). do_pte_missing() at mm/memory.c:4472 checks vma_is_anonymous() returns false, dispatches to do_fault() at mm/memory.c:5903.',
    ['handle_pte_fault', 'pte-missing'], s));

  // Frame 5: do_fault -> do_read_fault
  s.currentFunction = 'do_read_fault';
  s.srcRef = 'mm/memory.c:5779';
  frames.push(frame(step++, 'Enter do_read_fault()',
    'do_fault() at mm/memory.c:5903 dispatches to do_read_fault() at mm/memory.c:5779 since FAULT_FLAG_WRITE is not set. do_read_fault() calls __do_fault() at line 5799 which invokes vma->vm_ops->fault (typically filemap_fault).',
    ['do_read_fault', 'do_fault'], s));

  // Frame 6: filemap_fault reads page from disk
  s.phase = 'file-read';
  s.currentFunction = 'filemap_fault';
  s.srcRef = 'mm/filemap.c:3512';
  s.physicalPage = '0xffff888000070000';
  frames.push(frame(step++, 'filemap_fault() Reads from Page Cache',
    'filemap_fault() at mm/filemap.c:3512 looks up the page cache via mapping->host at line 3518. On cache miss, initiates readpage() to read the file data from disk into a new folio. The folio is added to the page cache.',
    ['filemap_fault', 'page-cache'], s));

  // Frame 7: finish_fault installs PTE
  s.phase = 'map-page';
  s.currentFunction = 'do_read_fault';
  s.srcRef = 'mm/memory.c:5803';
  s.pageTableLevels.pte = '0x70000 [present,user,accessed]';
  frames.push(frame(step++, 'Install PTE for File Page',
    'do_read_fault() calls finish_fault() at mm/memory.c:5803 to install the PTE mapping the page cache folio into the process address space. The page is now accessible without disk I/O on subsequent accesses.',
    ['pte-install', 'finish_fault'], s));

  // Frame 8: Fault resolved
  s.phase = 'resolved';
  s.currentFunction = 'exc_page_fault';
  s.srcRef = 'arch/x86/mm/fault.c:1385';
  frames.push(frame(step++, 'File Fault Resolved',
    'Control returns to exc_page_fault(). The faulting instruction is retried and the memory access succeeds, reading file data from the page cache via the newly installed PTE.',
    ['resolved'], s));

  return frames;
}

// ----- Renderer -----

function renderFrame(container: SVGGElement, _frame: AnimationFrame, width: number, height: number): void {
  // Clear previous content
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const state = _frame.data as PageFaultState;
  const ns = 'http://www.w3.org/2000/svg';

  // Background
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#1a1a2e');
  container.appendChild(bg);

  // Title
  const title = document.createElementNS(ns, 'text');
  title.setAttribute('x', '20');
  title.setAttribute('y', '30');
  title.setAttribute('fill', '#e0e0ff');
  title.setAttribute('font-size', '16');
  title.setAttribute('font-weight', 'bold');
  title.textContent = `${_frame.label} [${state.phase}]`;
  container.appendChild(title);

  // Current function label
  const fnLabel = document.createElementNS(ns, 'text');
  fnLabel.setAttribute('x', '20');
  fnLabel.setAttribute('y', '55');
  fnLabel.setAttribute('fill', '#80ff80');
  fnLabel.setAttribute('font-size', '13');
  fnLabel.textContent = `Function: ${state.currentFunction}()  |  ${state.srcRef}`;
  container.appendChild(fnLabel);

  // Fault address
  const addrLabel = document.createElementNS(ns, 'text');
  addrLabel.setAttribute('x', '20');
  addrLabel.setAttribute('y', '78');
  addrLabel.setAttribute('fill', '#ffcc80');
  addrLabel.setAttribute('font-size', '12');
  addrLabel.textContent = `Fault Address: ${state.faultAddress}  Type: ${state.faultType}`;
  container.appendChild(addrLabel);

  // Page table levels visualization
  const levels = state.pageTableLevels;
  const levelNames: (keyof typeof levels)[] = ['pgd', 'p4d', 'pud', 'pmd', 'pte'];
  const boxW = (width - 120) / 5;
  const boxH = 50;
  const startY = 100;

  for (let i = 0; i < levelNames.length; i++) {
    const name = levelNames[i];
    const val = levels[name];
    const x = 20 + i * (boxW + 10);

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(startY));
    rect.setAttribute('width', String(boxW));
    rect.setAttribute('height', String(boxH));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', val ? '#2a4a6a' : '#333344');
    rect.setAttribute('stroke', val ? '#4488cc' : '#555566');
    rect.setAttribute('stroke-width', '1.5');
    container.appendChild(rect);

    const nameText = document.createElementNS(ns, 'text');
    nameText.setAttribute('x', String(x + boxW / 2));
    nameText.setAttribute('y', String(startY + 20));
    nameText.setAttribute('fill', '#ccddff');
    nameText.setAttribute('font-size', '12');
    nameText.setAttribute('font-weight', 'bold');
    nameText.setAttribute('text-anchor', 'middle');
    nameText.textContent = name.toUpperCase();
    container.appendChild(nameText);

    const valText = document.createElementNS(ns, 'text');
    valText.setAttribute('x', String(x + boxW / 2));
    valText.setAttribute('y', String(startY + 38));
    valText.setAttribute('fill', val ? '#aaccff' : '#666677');
    valText.setAttribute('font-size', '10');
    valText.setAttribute('text-anchor', 'middle');
    valText.textContent = val ?? '---';
    container.appendChild(valText);
  }

  // VMA info box
  if (state.vmaInfo) {
    const vmaY = startY + boxH + 20;
    const vmaRect = document.createElementNS(ns, 'rect');
    vmaRect.setAttribute('x', '20');
    vmaRect.setAttribute('y', String(vmaY));
    vmaRect.setAttribute('width', String(width - 40));
    vmaRect.setAttribute('height', '35');
    vmaRect.setAttribute('rx', '4');
    vmaRect.setAttribute('fill', '#2a3a2a');
    vmaRect.setAttribute('stroke', '#448844');
    container.appendChild(vmaRect);

    const vmaText = document.createElementNS(ns, 'text');
    vmaText.setAttribute('x', '30');
    vmaText.setAttribute('y', String(vmaY + 22));
    vmaText.setAttribute('fill', '#88cc88');
    vmaText.setAttribute('font-size', '11');
    vmaText.textContent = `VMA: [${state.vmaInfo.start} - ${state.vmaInfo.end}]  flags: ${state.vmaInfo.flags}`;
    container.appendChild(vmaText);
  }

  // Physical page
  if (state.physicalPage) {
    const ppY = height - 60;
    const ppRect = document.createElementNS(ns, 'rect');
    ppRect.setAttribute('x', '20');
    ppRect.setAttribute('y', String(ppY));
    ppRect.setAttribute('width', String(width - 40));
    ppRect.setAttribute('height', '30');
    ppRect.setAttribute('rx', '4');
    ppRect.setAttribute('fill', '#3a2a4a');
    ppRect.setAttribute('stroke', '#8844cc');
    container.appendChild(ppRect);

    const ppText = document.createElementNS(ns, 'text');
    ppText.setAttribute('x', '30');
    ppText.setAttribute('y', String(ppY + 20));
    ppText.setAttribute('fill', '#cc88ff');
    ppText.setAttribute('font-size', '11');
    ppText.textContent = `Physical Page: ${state.physicalPage}`;
    container.appendChild(ppText);
  }

  // Phase indicator
  const phaseColors: Record<string, string> = {
    'trap': '#ff4444',
    'find-vma': '#ffaa44',
    'walk-pgt': '#44aaff',
    'handle-pte': '#ff8844',
    'alloc-page': '#44ff88',
    'map-page': '#8844ff',
    'cow-copy': '#ff44aa',
    'file-read': '#44ffdd',
    'resolved': '#44ff44',
  };
  const phaseRect = document.createElementNS(ns, 'rect');
  phaseRect.setAttribute('x', String(width - 120));
  phaseRect.setAttribute('y', '15');
  phaseRect.setAttribute('width', '100');
  phaseRect.setAttribute('height', '24');
  phaseRect.setAttribute('rx', '12');
  phaseRect.setAttribute('fill', phaseColors[state.phase] ?? '#888888');
  phaseRect.setAttribute('opacity', '0.3');
  container.appendChild(phaseRect);

  const phaseText = document.createElementNS(ns, 'text');
  phaseText.setAttribute('x', String(width - 70));
  phaseText.setAttribute('y', '32');
  phaseText.setAttribute('fill', phaseColors[state.phase] ?? '#888888');
  phaseText.setAttribute('font-size', '11');
  phaseText.setAttribute('font-weight', 'bold');
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.textContent = state.phase;
  container.appendChild(phaseText);
}

// ----- Module -----

const pageFault: AnimationModule = {
  config: {
    id: 'page-fault',
    title: 'Page Fault Handling Path',
    skillName: 'page-fault-handling',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'copy-on-write':
        return generateCopyOnWrite();
      case 'file-backed-fault':
        return generateFileBackedFault();
      case 'anonymous-page-fault':
      default:
        return generateAnonymousPageFault();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default pageFault;
