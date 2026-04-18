import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface ElfHeader {
  magic: string;
  class: '32-bit' | '64-bit';
  type: 'ET_EXEC' | 'ET_DYN';
  entry: number;
  phdrOffset: number;
  phdrCount: number;
}

export interface ProgramHeader {
  type: string;
  virtAddr: number;
  fileOffset: number;
  memSize: number;
  fileSize: number;
  permissions: string;
  state: 'idle' | 'reading' | 'mapping' | 'mapped';
  label: string;
}

export interface MemoryRegion {
  start: number;
  end: number;
  label: string;
  permissions: string;
  type: 'text' | 'data' | 'bss' | 'stack' | 'heap' | 'interp' | 'vdso';
  state: 'unmapped' | 'mapping' | 'mapped';
}

export interface StackEntry {
  label: string;
  value: string;
}

export interface ElfLoadState {
  elfHeader: ElfHeader;
  programHeaders: ProgramHeader[];
  memoryMap: MemoryRegion[];
  stackContents: StackEntry[];
  phase: string;
  currentFunction: string;
  interpreterPath: string | null;
  entryPoint: number;
  stackPointer: number;
  srcRef: string;
}

function cloneState(state: ElfLoadState): ElfLoadState {
  return {
    elfHeader: { ...state.elfHeader },
    programHeaders: state.programHeaders.map(ph => ({ ...ph })),
    memoryMap: state.memoryMap.map(r => ({ ...r })),
    stackContents: state.stackContents.map(e => ({ ...e })),
    phase: state.phase,
    currentFunction: state.currentFunction,
    interpreterPath: state.interpreterPath,
    entryPoint: state.entryPoint,
    stackPointer: state.stackPointer,
    srcRef: state.srcRef,
  };
}

function makeStaticHeader(): ElfHeader {
  return {
    magic: '7f 45 4c 46',
    class: '64-bit',
    type: 'ET_EXEC',
    entry: 0x401000,
    phdrOffset: 64,
    phdrCount: 4,
  };
}

function makeDynamicHeader(): ElfHeader {
  return {
    magic: '7f 45 4c 46',
    class: '64-bit',
    type: 'ET_DYN',
    entry: 0x1000,
    phdrOffset: 64,
    phdrCount: 5,
  };
}

function makeStaticPhdrs(): ProgramHeader[] {
  return [
    { type: 'PT_LOAD', virtAddr: 0x400000, fileOffset: 0, memSize: 0x1000, fileSize: 0x1000, permissions: 'R--', state: 'idle', label: '.rodata' },
    { type: 'PT_LOAD', virtAddr: 0x401000, fileOffset: 0x1000, memSize: 0x2000, fileSize: 0x2000, permissions: 'R-X', state: 'idle', label: '.text' },
    { type: 'PT_LOAD', virtAddr: 0x403000, fileOffset: 0x3000, memSize: 0x2000, fileSize: 0x1000, permissions: 'RW-', state: 'idle', label: '.data/.bss' },
    { type: 'PT_GNU_STACK', virtAddr: 0, fileOffset: 0, memSize: 0, fileSize: 0, permissions: 'RW-', state: 'idle', label: 'stack flags' },
  ];
}

function makeDynamicPhdrs(): ProgramHeader[] {
  return [
    { type: 'PT_INTERP', virtAddr: 0, fileOffset: 0x200, memSize: 28, fileSize: 28, permissions: 'R--', state: 'idle', label: '.interp' },
    { type: 'PT_LOAD', virtAddr: 0x0, fileOffset: 0, memSize: 0x1000, fileSize: 0x1000, permissions: 'R--', state: 'idle', label: '.rodata' },
    { type: 'PT_LOAD', virtAddr: 0x1000, fileOffset: 0x1000, memSize: 0x2000, fileSize: 0x2000, permissions: 'R-X', state: 'idle', label: '.text' },
    { type: 'PT_LOAD', virtAddr: 0x3000, fileOffset: 0x3000, memSize: 0x2000, fileSize: 0x1000, permissions: 'RW-', state: 'idle', label: '.data/.bss' },
    { type: 'PT_GNU_STACK', virtAddr: 0, fileOffset: 0, memSize: 0, fileSize: 0, permissions: 'RW-', state: 'idle', label: 'stack flags' },
  ];
}

function makeMemoryRegions(isDynamic: boolean): MemoryRegion[] {
  const regions: MemoryRegion[] = [
    { start: isDynamic ? 0x555555554000 : 0x400000, end: isDynamic ? 0x555555555000 : 0x401000, label: '.rodata', permissions: 'R--', type: 'text', state: 'unmapped' },
    { start: isDynamic ? 0x555555555000 : 0x401000, end: isDynamic ? 0x555555557000 : 0x403000, label: '.text', permissions: 'R-X', type: 'text', state: 'unmapped' },
    { start: isDynamic ? 0x555555557000 : 0x403000, end: isDynamic ? 0x555555559000 : 0x405000, label: '.data/.bss', permissions: 'RW-', type: 'data', state: 'unmapped' },
    { start: 0x7ffffffde000, end: 0x7ffffffff000, label: '[stack]', permissions: 'RW-', type: 'stack', state: 'unmapped' },
    { start: 0x7ffff7ffd000, end: 0x7ffff7fff000, label: '[vdso]', permissions: 'R-X', type: 'vdso', state: 'unmapped' },
  ];
  if (isDynamic) {
    regions.splice(3, 0, {
      start: 0x7ffff7fc0000, end: 0x7ffff7ff0000, label: 'ld-linux-x86-64.so.2', permissions: 'R-X', type: 'interp', state: 'unmapped',
    });
  }
  return regions;
}

function makeExecReplacesRegions(): MemoryRegion[] {
  return [
    { start: 0x400000, end: 0x401000, label: '.rodata', permissions: 'R--', type: 'text', state: 'unmapped' },
    { start: 0x401000, end: 0x403000, label: '.text', permissions: 'R-X', type: 'text', state: 'unmapped' },
    { start: 0x403000, end: 0x405000, label: '.data/.bss', permissions: 'RW-', type: 'data', state: 'unmapped' },
    { start: 0x7ffffffde000, end: 0x7ffffffff000, label: '[stack]', permissions: 'RW-', type: 'stack', state: 'unmapped' },
    { start: 0x7ffff7ffd000, end: 0x7ffff7fff000, label: '[vdso]', permissions: 'R-X', type: 'vdso', state: 'unmapped' },
  ];
}

function makeAuxvStack(): StackEntry[] {
  return [
    { label: 'argc', value: '1' },
    { label: 'argv[0]', value: '"./a.out"' },
    { label: 'NULL (argv terminator)', value: '0x0' },
    { label: 'envp[0]', value: '"PATH=/usr/bin"' },
    { label: 'envp[1]', value: '"HOME=/home/user"' },
    { label: 'NULL (envp terminator)', value: '0x0' },
    { label: 'AT_PHDR', value: '0x400040' },
    { label: 'AT_PHENT', value: '56' },
    { label: 'AT_PHNUM', value: '4' },
    { label: 'AT_ENTRY', value: '0x401000' },
    { label: 'AT_BASE', value: '0x0' },
    { label: 'AT_NULL', value: '0x0' },
  ];
}

// ---------------------------------------------------------------------------
// Static binary scenario
// ---------------------------------------------------------------------------
function generateStaticBinaryFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ElfLoadState = {
    elfHeader: makeStaticHeader(),
    programHeaders: makeStaticPhdrs(),
    memoryMap: makeMemoryRegions(false),
    stackContents: [],
    phase: 'execve',
    currentFunction: 'sys_execve',
    interpreterPath: null,
    entryPoint: 0x401000,
    stackPointer: 0x7fffffffe000,
    srcRef: 'fs/exec.c:1778',
  };

  // Frame 0 -- execve entry
  frames.push({
    step: 0,
    label: 'User calls execve("./a.out")',
    description: 'A process calls sys_execve() which enters do_execveat_common() (fs/exec.c:1778). This function allocates a linux_binprm structure, calls copy_strings() (fs/exec.c:448) to copy argv and envp onto the new stack page, then invokes bprm_execve() (fs/exec.c:1724) to begin binary loading.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1 -- read ELF header
  state.phase = 'read-header';
  state.currentFunction = 'bprm_execve';
  state.srcRef = 'fs/exec.c:1724';
  frames.push({
    step: 1,
    label: 'Read ELF header from file',
    description: 'bprm_execve() (fs/exec.c:1724) reads the first 256 bytes of the file into bprm->buf. The kernel checks the ELF magic bytes (7f 45 4c 46 = "\\x7fELF") at the start. The header reveals: 64-bit executable (ET_EXEC), entry point at 0x401000, 4 program headers starting at file offset 64.',
    highlights: ['elf-header'],
    data: cloneState(state),
  });

  // Frame 2 -- search binary handler
  state.phase = 'search-handler';
  state.currentFunction = 'search_binary_handler';
  state.srcRef = 'fs/exec.c:1645';
  frames.push({
    step: 2,
    label: 'Find ELF binary handler',
    description: 'search_binary_handler() (fs/exec.c:1645) iterates the list of registered binary formats. exec_binprm() (fs/exec.c:1679) calls it after preparing the bprm. The ELF handler matches the magic and invokes load_elf_binary() (fs/binfmt_elf.c:833).',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3 -- parse program headers
  state.phase = 'parse-phdrs';
  state.currentFunction = 'load_elf_binary';
  state.srcRef = 'fs/binfmt_elf.c:833';
  for (const ph of state.programHeaders) {
    ph.state = 'reading';
  }
  frames.push({
    step: 3,
    label: 'Parse program headers (PHDRs)',
    description: 'load_elf_binary() (fs/binfmt_elf.c:833) reads the program header table via kernel_read(). Each PT_LOAD entry describes a segment to map into memory. PT_GNU_STACK controls stack executability. For this static binary there is no PT_INTERP, so no dynamic linker is needed.',
    highlights: ['phdr-table'],
    data: cloneState(state),
  });

  // Frame 4 -- begin_new_exec (point of no return)
  state.phase = 'flush-exec';
  state.currentFunction = 'load_elf_binary -> begin_new_exec';
  state.srcRef = 'fs/binfmt_elf.c:1011 -> fs/exec.c:1091';
  frames.push({
    step: 4,
    label: 'Destroy old address space',
    description: 'load_elf_binary() calls begin_new_exec() at fs/binfmt_elf.c:1011. Inside begin_new_exec() (fs/exec.c:1091), de_thread() (fs/exec.c:900) kills other threads, then exec_mmap() (fs/exec.c:837) replaces the mm_struct, destroying all old virtual memory mappings. Signals are reset. This is the point of no return.',
    highlights: [],
    data: cloneState(state),
  });

  // Frames 5-7 -- map PT_LOAD segments one by one
  const ptLoads = state.programHeaders.filter(ph => ph.type === 'PT_LOAD');
  for (let i = 0; i < ptLoads.length; i++) {
    const ph = ptLoads[i];
    ph.state = 'mapping';
    const region = state.memoryMap[i]; // regions align with PT_LOAD order
    if (region) region.state = 'mapping';

    state.phase = `map-segment-${i}`;
    state.currentFunction = 'load_elf_binary -> elf_map';
    state.srcRef = 'fs/binfmt_elf.c:371';

    frames.push({
      step: frames.length,
      label: `Map PT_LOAD: ${ph.label} (${ph.permissions})`,
      description: `elf_map() (fs/binfmt_elf.c:371) calls vm_mmap() to map the ${ph.label} segment at 0x${ph.virtAddr.toString(16)}. Permissions ${ph.permissions} mean ${ph.permissions === 'R-X' ? 'read+execute for code -- the CPU can fetch instructions but not write, preventing code modification' : ph.permissions === 'RW-' ? 'read+write for data -- writable but not executable, enforcing W^X (write XOR execute) security' : 'read-only for constants and ELF metadata'}. File offset 0x${ph.fileOffset.toString(16)}, size 0x${ph.memSize.toString(16)}.`,
      highlights: [`phdr-${i}`, `region-${region?.label || ''}`],
      data: cloneState(state),
    });

    ph.state = 'mapped';
    if (region) region.state = 'mapped';
  }

  // Frame 8 -- zero BSS
  state.phase = 'zero-bss';
  state.currentFunction = 'load_elf_binary -> padzero';
  state.srcRef = 'fs/binfmt_elf.c:127';
  const bssRegion = state.memoryMap.find(r => r.label.includes('bss'));
  if (bssRegion) bssRegion.state = 'mapped';
  frames.push({
    step: frames.length,
    label: 'Zero BSS region',
    description: 'The .bss section (uninitialized globals) is part of the data PT_LOAD but has no file backing -- fileSize < memSize. padzero() (fs/binfmt_elf.c:127) fills the gap with zeros so uninitialized globals start at 0 as the C standard requires. Called at fs/binfmt_elf.c:436 during segment mapping.',
    highlights: ['region-.data/.bss'],
    data: cloneState(state),
  });

  // Frame 9 -- setup stack with vdso
  state.phase = 'setup-stack';
  state.currentFunction = 'load_elf_binary -> setup_arg_pages';
  state.srcRef = 'fs/binfmt_elf.c:1029 -> fs/exec.c:598';
  const stackRegion = state.memoryMap.find(r => r.type === 'stack');
  if (stackRegion) stackRegion.state = 'mapped';
  const vdsoRegion = state.memoryMap.find(r => r.type === 'vdso');
  if (vdsoRegion) vdsoRegion.state = 'mapped';
  frames.push({
    step: frames.length,
    label: 'Map stack and vDSO',
    description: 'setup_arg_pages() (fs/exec.c:598, called at fs/binfmt_elf.c:1029) finalizes the stack VMA with randomize_stack_top(STACK_TOP). The vDSO page is mapped via arch_setup_additional_pages() (fs/binfmt_elf.c:1291), providing fast userspace implementations of gettimeofday() and clock_gettime() without a full syscall.',
    highlights: ['region-[stack]', 'region-[vdso]'],
    data: cloneState(state),
  });

  // Frame 10 -- create_elf_tables: argc/argv
  state.phase = 'create-tables-argv';
  state.currentFunction = 'create_elf_tables';
  state.srcRef = 'fs/binfmt_elf.c:165';
  state.stackContents = [
    { label: 'argc', value: '1' },
    { label: 'argv[0]', value: '"./a.out"' },
    { label: 'NULL (argv terminator)', value: '0x0' },
  ];
  frames.push({
    step: frames.length,
    label: 'Build stack: argc and argv',
    description: 'create_elf_tables() (fs/binfmt_elf.c:165, called at fs/binfmt_elf.c:1297) pushes argc and argv pointers onto the new stack. The argument strings were already copied by copy_strings() (fs/exec.c:448). argv[0] is the program name, terminated by a NULL pointer.',
    highlights: ['stack-argc', 'stack-argv'],
    data: cloneState(state),
  });

  // Frame 11 -- create_elf_tables: envp
  state.phase = 'create-tables-envp';
  state.srcRef = 'fs/binfmt_elf.c:165';
  state.stackContents.push(
    { label: 'envp[0]', value: '"PATH=/usr/bin"' },
    { label: 'envp[1]', value: '"HOME=/home/user"' },
    { label: 'NULL (envp terminator)', value: '0x0' },
  );
  frames.push({
    step: frames.length,
    label: 'Build stack: environment variables',
    description: 'Still inside create_elf_tables() (fs/binfmt_elf.c:165). Environment variable pointers follow argv on the stack. Each envp entry points to a "KEY=VALUE" string copied by copy_strings() (fs/exec.c:1822). The list ends with a NULL pointer.',
    highlights: ['stack-envp'],
    data: cloneState(state),
  });

  // Frame 12 -- create_elf_tables: auxiliary vector
  state.phase = 'create-tables-auxv';
  state.srcRef = 'fs/binfmt_elf.c:241';
  state.stackContents.push(
    { label: 'AT_PHDR', value: '0x400040' },
    { label: 'AT_PHENT', value: '56' },
    { label: 'AT_PHNUM', value: '4' },
    { label: 'AT_ENTRY', value: '0x401000' },
    { label: 'AT_BASE', value: '0x0' },
    { label: 'AT_NULL', value: '0x0' },
  );
  frames.push({
    step: frames.length,
    label: 'Build stack: auxiliary vector',
    description: 'create_elf_tables() builds the auxiliary vector starting with ARCH_DLINFO (fs/binfmt_elf.c:241). AT_ENTRY is the program entry point, AT_PHDR locates program headers in memory, AT_BASE is the interpreter base (0 for static). The C runtime reads auxv to initialize correctly.',
    highlights: ['stack-auxv'],
    data: cloneState(state),
  });

  // Frame 13 -- start_thread
  state.phase = 'start-thread';
  state.currentFunction = 'start_thread';
  state.srcRef = 'fs/binfmt_elf.c:1380';
  state.stackPointer = 0x7fffffffe000;
  frames.push({
    step: frames.length,
    label: 'Jump to entry point: START_THREAD()',
    description: 'START_THREAD() (fs/binfmt_elf.c:1380) sets the instruction pointer (RIP) to elf_entry (0x401000, assigned at fs/binfmt_elf.c:1280 for static binaries) and the stack pointer (RSP) to bprm->p. When the process returns to userspace, it begins executing at _start. The entire execve is complete.',
    highlights: ['entry-point'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Dynamic binary scenario
// ---------------------------------------------------------------------------
function generateDynamicBinaryFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ElfLoadState = {
    elfHeader: makeDynamicHeader(),
    programHeaders: makeDynamicPhdrs(),
    memoryMap: makeMemoryRegions(true),
    stackContents: [],
    phase: 'execve',
    currentFunction: 'sys_execve',
    interpreterPath: null,
    entryPoint: 0x1000,
    stackPointer: 0x7fffffffe000,
    srcRef: 'fs/exec.c:1778',
  };

  // Frame 0
  frames.push({
    step: 0,
    label: 'User calls execve("./a.out")',
    description: 'sys_execve() enters do_execveat_common() (fs/exec.c:1778) which allocates linux_binprm, copies argv/envp via copy_strings() (fs/exec.c:448), and calls bprm_execve() (fs/exec.c:1724). This dynamically linked binary depends on shared libraries resolved at runtime.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1 -- read header
  state.phase = 'read-header';
  state.currentFunction = 'bprm_execve';
  state.srcRef = 'fs/exec.c:1724';
  frames.push({
    step: 1,
    label: 'Read ELF header from file',
    description: 'bprm_execve() (fs/exec.c:1724) reads the first page. The ELF header shows type ET_DYN (position-independent executable). ET_DYN means the binary can be loaded at any base address, enabling ASLR (Address Space Layout Randomization) for security.',
    highlights: ['elf-header'],
    data: cloneState(state),
  });

  // Frame 2 -- search handler
  state.phase = 'search-handler';
  state.currentFunction = 'search_binary_handler';
  state.srcRef = 'fs/exec.c:1645';
  frames.push({
    step: 2,
    label: 'Find ELF binary handler',
    description: 'search_binary_handler() (fs/exec.c:1645) iterates registered binary formats. exec_binprm() (fs/exec.c:1679) orchestrates the dispatch. The ELF handler matches the magic and calls load_elf_binary() (fs/binfmt_elf.c:833).',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3 -- parse phdrs, find PT_INTERP
  state.phase = 'parse-phdrs';
  state.currentFunction = 'load_elf_binary';
  state.srcRef = 'fs/binfmt_elf.c:833';
  for (const ph of state.programHeaders) {
    ph.state = 'reading';
  }
  frames.push({
    step: 3,
    label: 'Parse program headers -- PT_INTERP found',
    description: 'load_elf_binary() (fs/binfmt_elf.c:833) reads the program header table. PT_INTERP contains the path to the dynamic linker. For dynamically linked binaries, the kernel must load the interpreter (ld-linux-x86-64.so.2) in addition to the binary itself.',
    highlights: ['phdr-table', 'phdr-0'],
    data: cloneState(state),
  });

  // Frame 4 -- read interpreter path
  state.phase = 'read-interp';
  state.currentFunction = 'load_elf_binary';
  state.srcRef = 'fs/binfmt_elf.c:833';
  state.interpreterPath = '/lib64/ld-linux-x86-64.so.2';
  frames.push({
    step: 4,
    label: 'Read interpreter path from PT_INTERP',
    description: 'load_elf_binary() reads the PT_INTERP segment containing the null-terminated path "/lib64/ld-linux-x86-64.so.2". This is the ELF interpreter (dynamic linker). The kernel opens this file via open_exec() and reads its ELF headers to prepare for loading.',
    highlights: ['phdr-0'],
    data: cloneState(state),
  });

  // Frame 5 -- begin_new_exec
  state.phase = 'flush-exec';
  state.currentFunction = 'load_elf_binary -> begin_new_exec';
  state.srcRef = 'fs/binfmt_elf.c:1011 -> fs/exec.c:1091';
  frames.push({
    step: 5,
    label: 'Destroy old address space',
    description: 'begin_new_exec() (fs/exec.c:1091, called at fs/binfmt_elf.c:1011) is the point of no return. de_thread() (fs/exec.c:900) kills sibling threads, exec_mmap() (fs/exec.c:837) replaces the mm_struct. After this, execve cannot be undone -- the process must load successfully or be killed.',
    highlights: [],
    data: cloneState(state),
  });

  // Frames 6-8 -- map PT_LOAD segments
  const ptLoads = state.programHeaders.filter(ph => ph.type === 'PT_LOAD');
  for (let i = 0; i < ptLoads.length; i++) {
    const ph = ptLoads[i];
    ph.state = 'mapping';
    // Regions: index 0=.rodata, 1=.text, 2=.data/.bss for the binary
    const region = state.memoryMap[i];
    if (region) region.state = 'mapping';

    state.phase = `map-segment-${i}`;
    state.currentFunction = 'load_elf_binary -> elf_map';
    state.srcRef = 'fs/binfmt_elf.c:371';

    frames.push({
      step: frames.length,
      label: `Map PT_LOAD: ${ph.label} (${ph.permissions})`,
      description: `elf_map() (fs/binfmt_elf.c:371) maps the ${ph.label} segment. For ET_DYN binaries, the kernel applies a random load offset for ASLR. Permissions: ${ph.permissions === 'R-X' ? 'read+execute (code)' : ph.permissions === 'RW-' ? 'read+write (data)' : 'read-only (constants)'}. All addresses are relative to the chosen base.`,
      highlights: [`phdr-${i + 1}`, `region-${region?.label || ''}`],
      data: cloneState(state),
    });

    ph.state = 'mapped';
    if (region) region.state = 'mapped';
  }

  // Frame 9 -- load interpreter ELF
  state.phase = 'load-interp';
  state.currentFunction = 'load_elf_binary -> load_elf_interp';
  state.srcRef = 'fs/binfmt_elf.c:646 (called at :1255)';
  const interpRegion = state.memoryMap.find(r => r.type === 'interp');
  if (interpRegion) interpRegion.state = 'mapping';
  frames.push({
    step: frames.length,
    label: 'Load dynamic linker (ld-linux-x86-64.so.2)',
    description: 'load_elf_interp() (fs/binfmt_elf.c:646, called at fs/binfmt_elf.c:1255) opens the interpreter ELF, reads its headers, and maps its PT_LOAD segments. elf_entry is set to the interpreter load address plus e_entry (fs/binfmt_elf.c:1265). The interpreter entry point becomes the initial instruction pointer.',
    highlights: ['region-ld-linux-x86-64.so.2'],
    data: cloneState(state),
  });

  if (interpRegion) interpRegion.state = 'mapped';

  // Frame 10 -- setup stack/vdso
  state.phase = 'setup-stack';
  state.currentFunction = 'load_elf_binary -> setup_arg_pages';
  state.srcRef = 'fs/binfmt_elf.c:1029 -> fs/exec.c:598';
  const stackR = state.memoryMap.find(r => r.type === 'stack');
  if (stackR) stackR.state = 'mapped';
  const vdsoR = state.memoryMap.find(r => r.type === 'vdso');
  if (vdsoR) vdsoR.state = 'mapped';
  frames.push({
    step: frames.length,
    label: 'Map stack and vDSO',
    description: 'setup_arg_pages() (fs/exec.c:598, called at fs/binfmt_elf.c:1029) finalizes the stack. The vDSO is mapped via arch_setup_additional_pages() (fs/binfmt_elf.c:1291). For dynamically linked binaries, the auxv on the stack is critical: the interpreter reads AT_PHDR and AT_PHNUM to find program headers for relocation.',
    highlights: ['region-[stack]', 'region-[vdso]'],
    data: cloneState(state),
  });

  // Frame 11 -- create_elf_tables
  state.phase = 'create-tables';
  state.currentFunction = 'create_elf_tables';
  state.srcRef = 'fs/binfmt_elf.c:165 (called at :1297)';
  state.stackContents = [
    ...makeAuxvStack(),
  ];
  frames.push({
    step: frames.length,
    label: 'Build stack: argc, argv, envp, auxv',
    description: 'create_elf_tables() (fs/binfmt_elf.c:165, called at fs/binfmt_elf.c:1297) builds the initial stack layout. ARCH_DLINFO (fs/binfmt_elf.c:241) emits arch-specific auxv entries. AT_BASE holds the interpreter load address so ld.so can find its own data, and AT_ENTRY holds the program entry for transfer after symbol resolution.',
    highlights: ['stack-auxv'],
    data: cloneState(state),
  });

  // Frame 12 -- start_thread to interpreter
  state.phase = 'start-thread';
  state.currentFunction = 'start_thread';
  state.srcRef = 'fs/binfmt_elf.c:1380';
  frames.push({
    step: frames.length,
    label: 'Jump to interpreter entry point',
    description: 'START_THREAD() (fs/binfmt_elf.c:1380) sets RIP to elf_entry -- for dynamic binaries this is the interpreter entry (fs/binfmt_elf.c:1265), not the program entry. ld-linux-x86-64.so.2 starts in _dl_start. It will relocate itself, load DT_NEEDED shared libraries, resolve symbols, and finally jump to the program entry point.',
    highlights: ['entry-point'],
    data: cloneState(state),
  });

  // Frame 13 -- interpreter bootstraps
  state.phase = 'interp-bootstrap';
  state.currentFunction = '_dl_start -> _dl_init -> program entry';
  state.srcRef = 'fs/binfmt_elf.c:1380 (userspace)';
  frames.push({
    step: frames.length,
    label: 'Interpreter loads shared libraries',
    description: 'The dynamic linker (loaded by load_elf_interp at fs/binfmt_elf.c:1255) maps shared libraries (libc.so.6, etc.) into the process address space, resolves symbols (printf, malloc, etc.), and applies relocations. With lazy binding, PLT entries are resolved on first call. Finally, the interpreter jumps to the program entry and main() begins.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Exec-replaces-process scenario
// ---------------------------------------------------------------------------
function generateExecReplacesFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: ElfLoadState = {
    elfHeader: makeStaticHeader(),
    programHeaders: makeStaticPhdrs(),
    memoryMap: makeExecReplacesRegions(),
    stackContents: [],
    phase: 'running-bash',
    currentFunction: '(bash running)',
    interpreterPath: null,
    entryPoint: 0x401000,
    stackPointer: 0x7fffffffe000,
    srcRef: '',
  };

  // Frame 0 -- bash is running
  frames.push({
    step: 0,
    label: 'bash is running (PID 1234)',
    description: 'The bash shell process has its own address space: code (.text), data, heap, and stack. The user types "./a.out" and bash calls fork() then execve() in the child. We focus on the child process where execve replaces the entire memory image.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 1 -- execve called
  state.phase = 'execve-called';
  state.currentFunction = 'sys_execve';
  state.srcRef = 'fs/exec.c:1778';
  frames.push({
    step: 1,
    label: 'Child calls execve("./a.out")',
    description: 'The child process (same PID) enters do_execveat_common() (fs/exec.c:1778). This begins the transformation: the process keeps its PID and open file descriptors (unless close-on-exec), but code, data, stack, and heap will all be replaced.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 2 -- open and read ELF
  state.phase = 'read-header';
  state.currentFunction = 'do_execveat_common -> bprm_execve';
  state.srcRef = 'fs/exec.c:1778 -> fs/exec.c:1724';
  frames.push({
    step: 2,
    label: 'Open file and read ELF header',
    description: 'do_execveat_common() (fs/exec.c:1778) opens the file, checks permissions, and reads the first page into bprm->buf. bprm_execve() (fs/exec.c:1724) is called next. The ELF magic 7f 45 4c 46 is verified. This is a statically linked ET_EXEC binary with entry point 0x401000.',
    highlights: ['elf-header'],
    data: cloneState(state),
  });

  // Frame 3 -- point of no return
  state.phase = 'flush-old';
  state.currentFunction = 'load_elf_binary -> begin_new_exec';
  state.srcRef = 'fs/binfmt_elf.c:1011 -> fs/exec.c:1091';
  frames.push({
    step: 3,
    label: 'Point of no return: flush_old_exec()',
    description: 'load_elf_binary() calls begin_new_exec() (fs/binfmt_elf.c:1011 -> fs/exec.c:1091), historically known as flush_old_exec(). Inside, de_thread() (fs/exec.c:900) handles multi-threaded processes, then exec_mmap() (fs/exec.c:837) creates a new mm_struct and destroys the old one. All of bash\'s mappings are torn down: .text, .data, heap, stack, shared libraries -- all gone. Signal handlers reset to SIG_DFL.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 4 -- old mappings destroyed
  state.phase = 'old-destroyed';
  state.currentFunction = 'load_elf_binary';
  state.srcRef = 'fs/exec.c:837 (exec_mmap completed)';
  frames.push({
    step: 4,
    label: 'Old address space destroyed',
    description: 'exec_mmap() (fs/exec.c:837) has completed. The previous mm_struct is gone: page tables freed, physical pages released (or refcount decremented for shared pages). setup_new_exec() (fs/exec.c:1315, called at fs/binfmt_elf.c:1025) sets up the new process name and dumpability. If loading fails now, the kernel must kill the process.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 5 -- parse new phdrs
  state.phase = 'parse-phdrs';
  state.currentFunction = 'load_elf_binary';
  state.srcRef = 'fs/binfmt_elf.c:833';
  for (const ph of state.programHeaders) {
    ph.state = 'reading';
  }
  frames.push({
    step: 5,
    label: 'Parse new binary program headers',
    description: 'load_elf_binary() (fs/binfmt_elf.c:833) reads the program headers for ./a.out. Three PT_LOAD segments define the new memory layout: read-only data, executable code, and writable data+BSS. SET_PERSONALITY2() (fs/binfmt_elf.c:1017) sets the execution domain.',
    highlights: ['phdr-table'],
    data: cloneState(state),
  });

  // Frames 6-8 -- map segments progressively
  const ptLoads = state.programHeaders.filter(ph => ph.type === 'PT_LOAD');
  for (let i = 0; i < ptLoads.length; i++) {
    const ph = ptLoads[i];
    ph.state = 'mapping';
    const region = state.memoryMap[i];
    if (region) region.state = 'mapping';

    state.phase = `map-new-${i}`;
    state.currentFunction = 'load_elf_binary -> elf_map';
    state.srcRef = 'fs/binfmt_elf.c:371';

    frames.push({
      step: frames.length,
      label: `Map new ${ph.label} segment (${ph.permissions})`,
      description: `elf_map() (fs/binfmt_elf.c:371) creates a new VMA (vm_area_struct) for the ${ph.label} segment at 0x${ph.virtAddr.toString(16)}. Page table entries are created but physical pages are demand-allocated. The first access triggers a page fault that reads the file data from the inode.`,
      highlights: [`region-${region?.label || ''}`],
      data: cloneState(state),
    });

    ph.state = 'mapped';
    if (region) region.state = 'mapped';
  }

  // Frame 9 -- map stack
  state.phase = 'map-stack';
  state.currentFunction = 'load_elf_binary -> setup_arg_pages';
  state.srcRef = 'fs/binfmt_elf.c:1029 -> fs/exec.c:598';
  const stackR = state.memoryMap.find(r => r.type === 'stack');
  if (stackR) stackR.state = 'mapped';
  const vdsoR = state.memoryMap.find(r => r.type === 'vdso');
  if (vdsoR) vdsoR.state = 'mapped';
  frames.push({
    step: frames.length,
    label: 'Map new stack and vDSO',
    description: 'setup_arg_pages() (fs/exec.c:598, called at fs/binfmt_elf.c:1029) finalizes the stack mapping with randomize_stack_top(STACK_TOP) for ASLR. The vDSO is mapped via arch_setup_additional_pages() (fs/binfmt_elf.c:1291). The stack grows downward from near the top of the virtual address space.',
    highlights: ['region-[stack]'],
    data: cloneState(state),
  });

  // Frame 10 -- create_elf_tables
  state.phase = 'build-stack';
  state.currentFunction = 'create_elf_tables';
  state.srcRef = 'fs/binfmt_elf.c:165 (called at :1297)';
  state.stackContents = makeAuxvStack();
  frames.push({
    step: frames.length,
    label: 'Build initial stack contents',
    description: 'create_elf_tables() (fs/binfmt_elf.c:165, called at fs/binfmt_elf.c:1297) places argc, argv pointers, envp pointers, and the auxiliary vector onto the stack. ARCH_DLINFO (fs/binfmt_elf.c:241) emits AT_ENTRY, AT_PHDR, AT_PAGESZ and other values the C runtime needs.',
    highlights: ['stack-auxv'],
    data: cloneState(state),
  });

  // Frame 11 -- start_thread
  state.phase = 'start-thread';
  state.currentFunction = 'start_thread';
  state.srcRef = 'fs/binfmt_elf.c:1380';
  frames.push({
    step: frames.length,
    label: 'Set registers and return to userspace',
    description: 'START_THREAD() (fs/binfmt_elf.c:1380) sets RIP=0x401000 (elf_entry, assigned at fs/binfmt_elf.c:1280 for static binaries) and RSP to bprm->p (stack top). When the kernel returns to userspace, the process -- still PID 1234, same task_struct -- begins executing a completely different program.',
    highlights: ['entry-point'],
    data: cloneState(state),
  });

  // Frame 12 -- summary
  state.phase = 'complete';
  state.currentFunction = '_start (userspace)';
  state.srcRef = 'fs/binfmt_elf.c:1380 (completed)';
  frames.push({
    step: frames.length,
    label: 'Process transformation complete',
    description: 'Same PID, same task_struct, completely different program. The full path: do_execveat_common() (fs/exec.c:1778) -> bprm_execve() (fs/exec.c:1724) -> exec_binprm() (fs/exec.c:1679) -> search_binary_handler() (fs/exec.c:1645) -> load_elf_binary() (fs/binfmt_elf.c:833) -> begin_new_exec() (fs/exec.c:1091) -> elf_map() (fs/binfmt_elf.c:371) -> create_elf_tables() (fs/binfmt_elf.c:165) -> START_THREAD() (fs/binfmt_elf.c:1380). Fork+exec is two calls: fork copies the process, exec replaces it.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

function svgText(
  x: number, y: number, text: string, cls: string, anchor = 'start',
): SVGTextElement {
  const el = document.createElementNS(NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', anchor);
  el.setAttribute('class', cls);
  el.textContent = text;
  return el;
}

function svgRect(
  x: number, y: number, w: number, h: number, cls: string, rx = 3,
): SVGRectElement {
  const el = document.createElementNS(NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(Math.max(w, 1)));
  el.setAttribute('height', String(Math.max(h, 1)));
  el.setAttribute('rx', String(rx));
  el.setAttribute('class', cls);
  return el;
}

function svgLine(
  x1: number, y1: number, x2: number, y2: number, cls: string,
): SVGLineElement {
  const el = document.createElementNS(NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('class', cls);
  return el;
}

const REGION_COLORS: Record<string, string> = {
  text: 'anim-elf-text',
  data: 'anim-elf-data',
  bss: 'anim-elf-bss',
  stack: 'anim-elf-stack',
  heap: 'anim-elf-heap',
  interp: 'anim-elf-interp',
  vdso: 'anim-elf-vdso',
};

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as ElfLoadState;
  const margin = { top: 16, bottom: 50, left: 10, right: 10 };
  const colWidth = (width - margin.left - margin.right) / 3;

  // -- Title --
  container.appendChild(
    svgText(width / 2, 14, 'ELF Binary Loading', 'anim-title', 'middle'),
  );

  // ===================== LEFT COLUMN: ELF File =====================
  const leftX = margin.left;
  const fileTop = margin.top + 16;

  container.appendChild(svgText(leftX + colWidth / 2, fileTop, 'ELF File', 'anim-section-title', 'middle'));

  // ELF header box
  const hdrY = fileTop + 10;
  const hdrH = 50;
  const hdrCls = frame.highlights.includes('elf-header') ? 'anim-block anim-highlight' : 'anim-block anim-block-free';
  container.appendChild(svgRect(leftX + 4, hdrY, colWidth - 8, hdrH, hdrCls));
  container.appendChild(svgText(leftX + colWidth / 2, hdrY + 14, `Magic: ${data.elfHeader.magic}`, 'anim-block-label', 'middle'));
  container.appendChild(svgText(leftX + colWidth / 2, hdrY + 28, `${data.elfHeader.class} ${data.elfHeader.type}`, 'anim-block-label', 'middle'));
  container.appendChild(svgText(leftX + colWidth / 2, hdrY + 42, `Entry: 0x${data.elfHeader.entry.toString(16)}`, 'anim-block-label', 'middle'));

  // Program headers
  const phdrTop = hdrY + hdrH + 10;
  container.appendChild(svgText(leftX + 4, phdrTop, 'Program Headers:', 'anim-freelist-title'));

  const phdrRowH = 22;
  for (let i = 0; i < data.programHeaders.length; i++) {
    const ph = data.programHeaders[i];
    const y = phdrTop + 8 + i * phdrRowH;
    const stateCls = ph.state === 'mapped' ? 'anim-block-allocated'
      : ph.state === 'mapping' ? 'anim-block-splitting'
      : ph.state === 'reading' ? 'anim-block-coalescing'
      : 'anim-block-free';
    let cls = `anim-block ${stateCls}`;
    if (frame.highlights.includes(`phdr-${i}`)) cls += ' anim-highlight';
    container.appendChild(svgRect(leftX + 4, y, colWidth - 8, phdrRowH - 2, cls));
    container.appendChild(svgText(leftX + 8, y + 14, `${ph.type} ${ph.label} ${ph.permissions}`, 'anim-block-label'));
  }

  // Interpreter path
  if (data.interpreterPath) {
    const interpY = phdrTop + 8 + data.programHeaders.length * phdrRowH + 8;
    container.appendChild(svgText(leftX + 4, interpY, `Interp: ${data.interpreterPath}`, 'anim-addr-marker'));
  }

  // ===================== CENTER COLUMN: Virtual Address Space =====================
  const centerX = margin.left + colWidth + 8;
  const memTop = margin.top + 16;

  container.appendChild(svgText(centerX + (colWidth - 16) / 2, memTop, 'Virtual Address Space', 'anim-section-title', 'middle'));

  const memBarTop = memTop + 10;
  const memBarH = height - memBarTop - margin.bottom - 30;
  const regionCount = data.memoryMap.length;

  // Background bar
  container.appendChild(svgRect(centerX, memBarTop, colWidth - 16, memBarH, 'anim-block anim-block-free'));

  if (regionCount > 0) {
    // Use proportional layout: regions at known positions within address space
    const slotH = Math.max(14, (memBarH - 10) / Math.max(regionCount + 1, 6));
    for (let i = 0; i < regionCount; i++) {
      const region = data.memoryMap[i];
      const y = memBarTop + 4 + i * slotH;
      const regionW = colWidth - 24;

      if (region.state !== 'unmapped') {
        const typeCls = REGION_COLORS[region.type] || 'anim-elf-text';
        let cls = `anim-block ${typeCls}`;
        if (region.state === 'mapping') cls += ' anim-block-splitting';
        if (frame.highlights.includes(`region-${region.label}`)) cls += ' anim-highlight';
        container.appendChild(svgRect(centerX + 4, y, regionW, slotH - 3, cls));
      }

      container.appendChild(
        svgText(centerX + 8, y + slotH / 2 + 3, `${region.label} (${region.permissions})`, 'anim-block-label'),
      );
    }
  }

  // ===================== RIGHT COLUMN: Stack Contents =====================
  const rightX = margin.left + 2 * colWidth + 16;
  const stackTop = margin.top + 16;

  container.appendChild(svgText(rightX + (colWidth - 24) / 2, stackTop, 'Initial Stack', 'anim-section-title', 'middle'));

  const stackEntryH = 16;
  const stackStartY = stackTop + 12;
  for (let i = 0; i < data.stackContents.length; i++) {
    const entry = data.stackContents[i];
    const y = stackStartY + i * stackEntryH;
    container.appendChild(svgText(rightX, y, `${entry.label}: ${entry.value}`, 'anim-addr-marker'));
  }

  // ===================== BOTTOM: Current function and source reference =====================
  const bottomY = height - margin.bottom + 10;
  container.appendChild(
    svgLine(margin.left, bottomY - 14, width - margin.right, bottomY - 14, 'anim-freelist-title'),
  );
  container.appendChild(
    svgText(width / 2, bottomY, `Kernel function: ${data.currentFunction}`, 'anim-freelist-title', 'middle'),
  );
  container.appendChild(
    svgText(width / 2, bottomY + 16, data.srcRef ? `Source: ${data.srcRef}` : `Phase: ${data.phase}`, 'anim-addr-marker', 'middle'),
  );
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'static-binary', label: 'Static ELF Binary Loading' },
  { id: 'dynamic-binary', label: 'Dynamic ELF Binary Loading' },
  { id: 'exec-replaces-process', label: 'execve Replaces Process' },
];

const elfLoader: AnimationModule = {
  config: {
    id: 'elf-loader',
    title: 'ELF Binary Loading',
    skillName: 'process-lifecycle',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'dynamic-binary':
        return generateDynamicBinaryFrames();
      case 'exec-replaces-process':
        return generateExecReplacesFrames();
      case 'static-binary':
      default:
        return generateStaticBinaryFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default elfLoader;
