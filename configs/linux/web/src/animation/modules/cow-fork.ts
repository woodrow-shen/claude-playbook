import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface PageEntry {
  virtualAddr: number;
  physicalPage: number;
  writable: boolean;
  state: 'normal' | 'shared' | 'copied' | 'faulting';
  label: string;
}

export interface Process {
  pid: number;
  name: string;
  pages: PageEntry[];
}

export interface PhysicalPage {
  addr: number;
  refCount: number;
  label: string;
}

export interface CowState {
  processes: Process[];
  physicalPages: PhysicalPage[];
  srcRef?: string;
}

function cloneState(state: CowState): CowState {
  return {
    processes: state.processes.map(p => ({ ...p, pages: p.pages.map(pg => ({ ...pg })) })),
    physicalPages: state.physicalPages.map(pp => ({ ...pp })),
  };
}

function generateWriteFault(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Initial parent process
  const state: CowState = {
    processes: [{
      pid: 1000, name: 'parent',
      pages: [
        { virtualAddr: 0, physicalPage: 0, writable: true, state: 'normal', label: 'code' },
        { virtualAddr: 1, physicalPage: 1, writable: true, state: 'normal', label: 'stack' },
        { virtualAddr: 2, physicalPage: 2, writable: true, state: 'normal', label: 'heap' },
      ],
    }],
    physicalPages: [
      { addr: 0, refCount: 1, label: 'code' },
      { addr: 1, refCount: 1, label: 'stack' },
      { addr: 2, refCount: 1, label: 'heap' },
    ],
  };

  frames.push({
    step: 0,
    label: 'Parent process with 3 pages',
    description: 'Parent process (PID 1000) has 3 virtual pages mapped to 3 physical pages. All are writable. Each physical page has refcount = 1. The fork path begins at copy_process() (kernel/fork.c:1964).',
    highlights: [],
    data: { ...cloneState(state), srcRef: 'kernel/fork.c:1967 copy_process()' },
  });

  // Fork: create child sharing all pages
  const child: Process = {
    pid: 1001, name: 'child',
    pages: state.processes[0].pages.map(p => ({ ...p, writable: false, state: 'shared' as const })),
  };
  state.processes.push(child);
  // Mark parent pages as read-only + shared
  state.processes[0].pages.forEach(p => { p.writable = false; p.state = 'shared'; });
  // Bump ref counts
  state.physicalPages.forEach(pp => { pp.refCount = 2; });

  frames.push({
    step: 1,
    label: 'fork() creates child -- pages SHARED',
    description: 'fork() does NOT copy any pages! copy_process() calls copy_mm() (kernel/fork.c:2223) -> dup_mm() (kernel/fork.c:1515) -> dup_mmap() (mm/mmap.c:1732). dup_mmap() walks each VMA and calls copy_page_range() (mm/memory.c:1504), which calls copy_pte_range() (mm/memory.c:1221) to mark PTEs read-only. Refcounts go to 2.',
    highlights: ['child'],
    data: { ...cloneState(state), srcRef: 'mm/memory.c:1208 copy_pte_range()' },
  });

  // Child writes to heap -> page fault
  const childHeap = child.pages.find(p => p.label === 'heap')!;
  childHeap.state = 'faulting';

  frames.push({
    step: 2,
    label: 'Child writes to heap -> PAGE FAULT!',
    description: 'Child tries to write to its heap page, but the PTE is read-only. The CPU triggers a page fault handled by do_wp_page() (mm/memory.c:4149). The kernel checks the page refcount > 1, confirming this is a CoW page that needs a private copy.',
    highlights: ['child-heap'],
    data: { ...cloneState(state), srcRef: 'mm/memory.c:4228 do_wp_page()' },
  });

  // Kernel allocates new physical page and copies
  const newPhysPage: PhysicalPage = { addr: 3, refCount: 1, label: 'heap (copy)' };
  state.physicalPages.push(newPhysPage);
  state.physicalPages[2].refCount = 1; // original heap refcount drops
  childHeap.physicalPage = 3;
  childHeap.writable = true;
  childHeap.state = 'copied';

  frames.push({
    step: 3,
    label: 'Kernel copies the page -- CoW complete',
    description: 'do_wp_page() calls wp_page_copy() (mm/memory.c:3758) which allocates a new physical page (addr 3), copies the content from page 2, and updates the child\'s PTE to point to the copy with write permission. The original page refcount drops to 1.',
    highlights: ['phys-3', 'child-heap'],
    data: { ...cloneState(state), srcRef: 'mm/memory.c:3837 wp_page_copy()' },
  });

  // Parent's page becomes writable again (refcount = 1)
  const parentHeap = state.processes[0].pages.find(p => p.label === 'heap')!;
  parentHeap.writable = true;
  parentHeap.state = 'normal';
  childHeap.state = 'normal';

  frames.push({
    step: 4,
    label: 'Both processes now have independent heap pages',
    description: 'Parent still points to physical page 2, child to page 3. Both are writable. The code and stack pages remain shared (refcount 2) until someone writes to them. Most pages are NEVER copied -- this is the CoW optimization. The full path: copy_pte_range() (mm/memory.c:1221) sets up sharing, do_wp_page() (mm/memory.c:4149) -> wp_page_copy() (mm/memory.c:3758) handles the fault.',
    highlights: [],
    data: { ...cloneState(state), srcRef: 'mm/memory.c:1208 copy_pte_range()' },
  });

  return frames;
}

function generateForkAndExec(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: CowState = {
    processes: [{
      pid: 1000, name: 'shell',
      pages: [
        { virtualAddr: 0, physicalPage: 0, writable: true, state: 'normal', label: 'code' },
        { virtualAddr: 1, physicalPage: 1, writable: true, state: 'normal', label: 'stack' },
        { virtualAddr: 2, physicalPage: 2, writable: true, state: 'normal', label: 'data' },
      ],
    }],
    physicalPages: [
      { addr: 0, refCount: 1, label: 'code' },
      { addr: 1, refCount: 1, label: 'stack' },
      { addr: 2, refCount: 1, label: 'data' },
    ],
  };

  frames.push({
    step: 0, label: 'Shell process before fork()',
    description: 'A shell process is about to fork() + exec() a new program (the standard Unix pattern). The kernel entry point is copy_process() (kernel/fork.c:1964). Let\'s see why CoW makes this efficient.',
    highlights: [], data: { ...cloneState(state), srcRef: 'kernel/fork.c:1967 copy_process()' },
  });

  // Fork
  const child: Process = {
    pid: 1001, name: 'child',
    pages: state.processes[0].pages.map(p => ({ ...p, writable: false, state: 'shared' as const })),
  };
  state.processes.push(child);
  state.processes[0].pages.forEach(p => { p.writable = false; p.state = 'shared'; });
  state.physicalPages.forEach(pp => { pp.refCount = 2; });

  frames.push({
    step: 1, label: 'fork() -- zero pages copied',
    description: 'fork() shares all pages with CoW via copy_mm() (kernel/fork.c:1556) -> dup_mm() (kernel/fork.c:1515) -> dup_mmap() (mm/mmap.c:1732). copy_pte_range() (mm/memory.c:1221) marks all PTEs read-only. No physical memory was allocated, no data was copied.',
    highlights: ['child'], data: { ...cloneState(state), srcRef: 'mm/mmap.c:1731 dup_mmap()' },
  });

  // Exec replaces child's address space
  child.pages = [
    { virtualAddr: 0, physicalPage: 3, writable: true, state: 'normal', label: 'new code' },
    { virtualAddr: 1, physicalPage: 4, writable: true, state: 'normal', label: 'new stack' },
  ];
  child.name = 'ls';
  state.physicalPages.forEach(pp => { pp.refCount = 1; }); // shell pages drop to refcount 1
  state.physicalPages.push({ addr: 3, refCount: 1, label: 'ls code' });
  state.physicalPages.push({ addr: 4, refCount: 1, label: 'ls stack' });
  state.processes[0].pages.forEach(p => { p.writable = true; p.state = 'normal'; });

  frames.push({
    step: 2, label: 'exec("ls") -- new address space',
    description: 'exec() replaces the child\'s entire address space with the "ls" binary. The old CoW mappings are dropped (refcounts go back to 1). The shell\'s pages were NEVER copied -- CoW saved us from copying pages that were immediately discarded. Without CoW, fork() would have copied all pages at copy_page_range() (mm/memory.c:1504) only to throw them away here.',
    highlights: ['child'], data: { ...cloneState(state), srcRef: 'mm/memory.c:1491 copy_page_range()' },
  });

  return frames;
}

function generateMultipleForks(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CowState = {
    processes: [{
      pid: 1, name: 'parent',
      pages: [
        { virtualAddr: 0, physicalPage: 0, writable: true, state: 'normal', label: 'data' },
      ],
    }],
    physicalPages: [{ addr: 0, refCount: 1, label: 'data' }],
  };

  frames.push({
    step: 0, label: 'Parent with one data page',
    description: 'Starting simple: one process, one page. Watch what happens with multiple forks via copy_process() (kernel/fork.c:1964).',
    highlights: [], data: { ...cloneState(state), srcRef: 'kernel/fork.c:1967 copy_process()' },
  });

  // Fork child 1
  state.processes.push({ pid: 2, name: 'child-1', pages: [{ virtualAddr: 0, physicalPage: 0, writable: false, state: 'shared', label: 'data' }] });
  state.processes[0].pages[0].writable = false;
  state.processes[0].pages[0].state = 'shared';
  state.physicalPages[0].refCount = 2;

  frames.push({
    step: 1, label: 'First fork() -- refcount = 2',
    description: 'child-1 shares the page via copy_pte_range() (mm/memory.c:1221). Refcount goes to 2.',
    highlights: ['child-1'], data: { ...cloneState(state), srcRef: 'mm/memory.c:1208 copy_pte_range()' },
  });

  // Fork child 2
  state.processes.push({ pid: 3, name: 'child-2', pages: [{ virtualAddr: 0, physicalPage: 0, writable: false, state: 'shared', label: 'data' }] });
  state.physicalPages[0].refCount = 3;

  frames.push({
    step: 2, label: 'Second fork() -- refcount = 3',
    description: 'child-2 shares the same page via another copy_pte_range() (mm/memory.c:1221) pass. Refcount goes to 3. Still only one physical page for three processes!',
    highlights: ['child-2'], data: { ...cloneState(state), srcRef: 'mm/memory.c:1208 copy_pte_range()' },
  });

  // child-1 writes
  state.physicalPages.push({ addr: 1, refCount: 1, label: 'data (copy)' });
  state.physicalPages[0].refCount = 2;
  state.processes[1].pages[0] = { virtualAddr: 0, physicalPage: 1, writable: true, state: 'copied', label: 'data' };

  frames.push({
    step: 3, label: 'child-1 writes -- gets its own copy',
    description: 'child-1 triggers CoW via do_wp_page() (mm/memory.c:4149) -> wp_page_copy() (mm/memory.c:3758). Refcount of the original drops from 3 to 2. child-1 gets a private copy. Parent and child-2 still share.',
    highlights: ['child-1'], data: { ...cloneState(state), srcRef: 'mm/memory.c:3837 wp_page_copy()' },
  });

  return frames;
}

const NS = 'http://www.w3.org/2000/svg';
const PROC_COLORS = ['#58a6ff', '#3fb950', '#f0883e', '#bc8cff'];

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as CowState;
  const margin = { top: 20, left: 10, right: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '14');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Copy-on-Write Fork';
  container.appendChild(title);

  // Process columns
  const procWidth = Math.min(120, usableWidth / (data.processes.length + 1));
  const procTop = margin.top + 10;
  const pageHeight = 24;
  const pageGap = 4;

  data.processes.forEach((proc, pi) => {
    const px = margin.left + pi * (procWidth + 10);
    const color = PROC_COLORS[pi % PROC_COLORS.length];

    // Process label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(px + procWidth / 2));
    label.setAttribute('y', String(procTop));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-proc-label');
    label.setAttribute('fill', color);
    label.textContent = `${proc.name} (${proc.pid})`;
    container.appendChild(label);

    // Pages
    proc.pages.forEach((page, pgi) => {
      const py = procTop + 10 + pgi * (pageHeight + pageGap);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(px));
      rect.setAttribute('y', String(py));
      rect.setAttribute('width', String(procWidth));
      rect.setAttribute('height', String(pageHeight));
      rect.setAttribute('rx', '3');
      let cls = `anim-page anim-page-${page.state}`;
      if (frame.highlights.includes(`${proc.name}-${page.label}`)) cls += ' anim-highlight';
      rect.setAttribute('class', cls);
      container.appendChild(rect);

      // Page label
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(px + procWidth / 2));
      text.setAttribute('y', String(py + pageHeight / 2 + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'anim-page-label');
      text.textContent = `${page.label} -> p${page.physicalPage}`;
      container.appendChild(text);
    });
  });

  // Physical pages section
  const physTop = procTop + 10 + 4 * (pageHeight + pageGap) + 20;
  const physLabel = document.createElementNS(NS, 'text');
  physLabel.setAttribute('x', String(margin.left));
  physLabel.setAttribute('y', String(physTop));
  physLabel.setAttribute('class', 'anim-phys-title');
  physLabel.textContent = 'Physical Pages:';
  container.appendChild(physLabel);

  const physPageWidth = Math.min(80, usableWidth / data.physicalPages.length - 5);
  data.physicalPages.forEach((pp, i) => {
    const px = margin.left + i * (physPageWidth + 5);
    const py = physTop + 8;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(py));
    rect.setAttribute('width', String(physPageWidth));
    rect.setAttribute('height', String(pageHeight));
    rect.setAttribute('rx', '3');
    let cls = 'anim-phys-page';
    if (pp.refCount > 1) cls += ' anim-phys-shared';
    if (frame.highlights.includes(`phys-${pp.addr}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(px + physPageWidth / 2));
    text.setAttribute('y', String(py + pageHeight / 2 + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'anim-phys-label');
    text.textContent = `p${pp.addr} ref:${pp.refCount}`;
    container.appendChild(text);
  });
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'write-fault', label: 'Write Fault Copy' },
  { id: 'fork-and-exec', label: 'Fork + Exec Pattern' },
  { id: 'multiple-forks', label: 'Multiple Forks' },
];

const cowFork: AnimationModule = {
  config: {
    id: 'cow-fork',
    title: 'Copy-on-Write Fork Visualization',
    skillName: 'process-lifecycle',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'fork-and-exec': return generateForkAndExec();
      case 'multiple-forks': return generateMultipleForks();
      case 'write-fault':
      default: return generateWriteFault();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default cowFork;
