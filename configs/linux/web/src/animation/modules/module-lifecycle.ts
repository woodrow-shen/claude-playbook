import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface ModuleState {
  phase: string;
  moduleName: string;
  state: 'loading' | 'live' | 'going' | 'unloaded';
  sections: { name: string; status: string }[];
  symbols: { name: string; resolved: boolean }[];
  srcRef: string;
}

function cloneState(s: ModuleState): ModuleState {
  return {
    ...s,
    sections: s.sections.map(sec => ({ ...sec })),
    symbols: s.symbols.map(sym => ({ ...sym })),
  };
}

const ELF_SECTIONS = [
  { name: '.text', status: 'pending' },
  { name: '.rodata', status: 'pending' },
  { name: '.data', status: 'pending' },
  { name: '.bss', status: 'pending' },
  { name: '.symtab', status: 'pending' },
  { name: '.rela.text', status: 'pending' },
];

const MODULE_SYMBOLS = [
  { name: 'printk', resolved: false },
  { name: 'kmalloc', resolved: false },
  { name: '__register_chrdev', resolved: false },
  { name: 'module_layout', resolved: false },
];

function initialLoadState(): ModuleState {
  return {
    phase: 'init_module',
    moduleName: 'example_mod',
    state: 'loading',
    sections: ELF_SECTIONS.map(s => ({ ...s })),
    symbols: MODULE_SYMBOLS.map(s => ({ ...s })),
    srcRef: '',
  };
}

function generateModuleLoadFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const st = initialLoadState();

  // Frame 0: init_module syscall entry
  st.srcRef = 'kernel/module/main.c:3570 SYSCALL_DEFINE3(init_module)';
  frames.push({
    step: 0,
    label: 'init_module() syscall entry',
    description:
      'User runs insmod, which invokes the init_module syscall (kernel/module/main.c:3570). ' +
      'SYSCALL_DEFINE3(init_module) calls may_init_module() at line 3576 to check CAP_SYS_MODULE, ' +
      'then copy_module_from_user() at line 3583 to copy the ELF binary from userspace into kernel memory. ' +
      'The struct load_info is initialized to track the module throughout loading.',
    highlights: ['phase-init_module'],
    data: cloneState(st),
  });

  // Frame 1: load_module entry + signature check
  st.phase = 'load_module';
  st.srcRef = 'kernel/module/main.c:3358 load_module()';
  frames.push({
    step: 1,
    label: 'load_module() begins',
    description:
      'init_module() calls load_module() at line 3590 (kernel/module/main.c:3358). ' +
      'The first step is module_sig_check() at line 3378, which verifies the module signature ' +
      'if CONFIG_MODULE_SIG is enabled. This prevents loading of tampered or unsigned modules.',
    highlights: ['phase-load_module'],
    data: cloneState(st),
  });

  // Frame 2: ELF validation and section parsing
  st.phase = 'elf_parse';
  st.sections.forEach(s => { s.status = 'parsing'; });
  st.srcRef = 'kernel/module/main.c:3387 elf_validity_cache_copy()';
  frames.push({
    step: 2,
    label: 'ELF validation and section parsing',
    description:
      'elf_validity_cache_copy() at line 3387 validates the ELF header (magic, class, machine type) ' +
      'and caches section header information. early_mod_check() at line 3391 performs additional sanity ' +
      'checks including vermagic string matching. The ELF sections (.text, .data, .bss, .symtab, etc.) ' +
      'are enumerated from the section header table.',
    highlights: ['section-.text', 'section-.rodata', 'section-.data', 'section-.bss', 'section-.symtab', 'section-.rela.text'],
    data: cloneState(st),
  });

  // Frame 3: layout_and_allocate
  st.phase = 'layout_allocate';
  st.sections.forEach(s => { s.status = 'allocated'; });
  st.srcRef = 'kernel/module/main.c:3396 layout_and_allocate()';
  frames.push({
    step: 3,
    label: 'Layout and memory allocation',
    description:
      'layout_and_allocate() at line 3396 computes the final memory layout for the module. ' +
      'It allocates module_memory regions for MOD_TEXT, MOD_DATA, MOD_RODATA, MOD_INIT_TEXT, etc. ' +
      'as defined in struct module_memory (include/linux/module.h:455). ' +
      'add_unformed_module() at line 3407 reserves a slot in the modules list with state MODULE_STATE_UNFORMED.',
    highlights: ['phase-layout_allocate'],
    data: cloneState(st),
  });

  // Frame 4: find_module_sections + simplify_symbols
  st.phase = 'find_sections';
  st.sections.forEach(s => { s.status = 'mapped'; });
  st.srcRef = 'kernel/module/main.c:3433 find_module_sections()';
  frames.push({
    step: 4,
    label: 'Map ELF sections to module struct',
    description:
      'find_module_sections() at line 3433 maps ELF sections to fields in struct module ' +
      '(include/linux/module.h:397). For example, __ksymtab sections become mod->syms (line 419), ' +
      'and __param sections become mod->kp (line 432). check_export_symbol_versions() at line 3437 ' +
      'verifies CRC version compatibility between the module and the running kernel.',
    highlights: ['section-.text', 'section-.symtab'],
    data: cloneState(st),
  });

  // Frame 5: Symbol resolution via simplify_symbols
  st.phase = 'symbol_resolution';
  st.symbols[0].resolved = true;
  st.symbols[1].resolved = true;
  st.srcRef = 'kernel/module/main.c:1513 simplify_symbols()';
  frames.push({
    step: 5,
    label: 'Symbol resolution begins',
    description:
      'simplify_symbols() at line 1513 iterates over all ELF symbols. For SHN_UNDEF symbols ' +
      '(external references like printk, kmalloc), it calls resolve_symbol_wait() at line 1552, ' +
      'which invokes resolve_symbol() (line 1231). resolve_symbol() acquires module_mutex, then ' +
      'calls find_symbol() (line 388) which searches __ksymtab (kernel exported symbols) first, ' +
      'then each loaded module\'s symbol tables.',
    highlights: ['symbol-printk', 'symbol-kmalloc'],
    data: cloneState(st),
  });

  // Frame 6: Remaining symbols resolved + relocations
  st.phase = 'relocations';
  st.symbols.forEach(s => { s.resolved = true; });
  st.sections.find(s => s.name === '.rela.text')!.status = 'relocated';
  st.srcRef = 'kernel/module/main.c:3451 apply_relocations()';
  frames.push({
    step: 6,
    label: 'Apply ELF relocations',
    description:
      'After all symbols are resolved, apply_relocations() at line 3451 patches the module code. ' +
      'For each .rela section, it applies architecture-specific relocations (e.g., R_X86_64_PLT32, ' +
      'R_X86_64_PC32) to rewrite call/jump targets to the resolved addresses. ' +
      'post_relocation() at line 3455 handles percpu and tracepoint setup. ' +
      'flush_module_icache() at line 3459 ensures the instruction cache sees the patched code.',
    highlights: ['section-.rela.text'],
    data: cloneState(st),
  });

  // Frame 7: complete_formation -> MODULE_STATE_COMING
  st.phase = 'complete_formation';
  st.sections.forEach(s => { s.status = 'finalized'; });
  st.srcRef = 'kernel/module/main.c:3243 complete_formation()';
  frames.push({
    step: 7,
    label: 'Complete formation: set memory protections',
    description:
      'complete_formation() at line 3243 finalizes the module. verify_exported_symbols() at line 3250 ' +
      'checks for duplicate symbol exports. module_enable_rodata_ro() (line 3258), module_enable_data_nx() ' +
      '(line 3260), and module_enable_text_rox() (line 3262) set memory protections: .rodata becomes ' +
      'read-only, .data becomes non-executable, .text becomes read-only-execute. ' +
      'The module state transitions to MODULE_STATE_COMING (line 3272).',
    highlights: ['phase-complete_formation'],
    data: cloneState(st),
  });

  // Frame 8: do_init_module -> module_init callback -> LIVE
  st.phase = 'do_init_module';
  st.state = 'live';
  st.srcRef = 'kernel/module/main.c:3017 do_init_module()';
  frames.push({
    step: 8,
    label: 'do_init_module(): call module_init()',
    description:
      'do_init_module() at line 3017 calls do_mod_ctors() at line 3043 for C++ static constructors, ' +
      'then invokes the module\'s init function via do_one_initcall(mod->init) at line 3046. ' +
      'The init function (registered with module_init() macro) performs driver registration, ' +
      'device probing, etc. On success, mod->state is set to MODULE_STATE_LIVE (line 3059) and ' +
      'a MODULE_STATE_LIVE notification is broadcast. The module is now fully operational.',
    highlights: ['phase-do_init_module'],
    data: cloneState(st),
  });

  return frames;
}

function generateModuleUnloadFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Start from a live module
  const st: ModuleState = {
    phase: 'live',
    moduleName: 'example_mod',
    state: 'live',
    sections: ELF_SECTIONS.map(s => ({ ...s, status: 'finalized' })),
    symbols: MODULE_SYMBOLS.map(s => ({ ...s, resolved: true })),
    srcRef: '',
  };

  // Frame 0: Module is live
  st.srcRef = 'include/linux/module.h:397 struct module';
  frames.push({
    step: 0,
    label: 'Module is MODULE_STATE_LIVE',
    description:
      'The module is fully loaded and operational. struct module (include/linux/module.h:397) ' +
      'has state == MODULE_STATE_LIVE. The module appears in /proc/modules and lsmod output. ' +
      'Its symbols are visible to other modules via the exported symbol table. ' +
      'User invokes rmmod to trigger the delete_module syscall.',
    highlights: ['phase-live'],
    data: cloneState(st),
  });

  // Frame 1: delete_module syscall
  st.phase = 'delete_module';
  st.srcRef = 'kernel/module/main.c:776 SYSCALL_DEFINE2(delete_module)';
  frames.push({
    step: 1,
    label: 'delete_module() syscall entry',
    description:
      'SYSCALL_DEFINE2(delete_module) at line 776 checks CAP_SYS_MODULE (line 784), then ' +
      'copies the module name from userspace via strncpy_from_user() at line 787. ' +
      'It acquires module_mutex (line 795) and calls find_module() (line 798) to locate ' +
      'the module in the global modules list.',
    highlights: ['phase-delete_module'],
    data: cloneState(st),
  });

  // Frame 2: Check dependencies and refcount
  st.phase = 'check_refs';
  st.srcRef = 'kernel/module/main.c:804 source_list check';
  frames.push({
    step: 2,
    label: 'Check dependencies and refcount',
    description:
      'At line 804, the kernel checks mod->source_list: if other modules depend on this one, ' +
      'deletion fails with -EWOULDBLOCK. At line 811, it verifies mod->state == MODULE_STATE_LIVE ' +
      '(modules being initialized or already dying cannot be removed). try_stop_module() at line 828 ' +
      'attempts to set the refcount to zero atomically. If the module is still in use, it fails ' +
      'with -EWOULDBLOCK (unless O_TRUNC force flag is set).',
    highlights: ['phase-check_refs'],
    data: cloneState(st),
  });

  // Frame 3: Call module_exit
  st.phase = 'module_exit';
  st.state = 'going';
  st.srcRef = 'kernel/module/main.c:834 mod->exit()';
  frames.push({
    step: 3,
    label: 'Call module_exit() cleanup',
    description:
      'After releasing module_mutex (line 832), the kernel calls mod->exit() at line 834. ' +
      'This is the function registered with module_exit() macro -- it performs cleanup: ' +
      'unregistering devices, freeing resources, removing sysfs entries. ' +
      'Then blocking_notifier_call_chain() at line 836 broadcasts MODULE_STATE_GOING ' +
      'to notify subsystems (ftrace, livepatch, etc.) that the module is departing.',
    highlights: ['phase-module_exit'],
    data: cloneState(st),
  });

  // Frame 4: ftrace and livepatch cleanup
  st.phase = 'ftrace_cleanup';
  st.srcRef = 'kernel/module/main.c:838 klp_module_going()';
  frames.push({
    step: 4,
    label: 'Ftrace and livepatch cleanup',
    description:
      'klp_module_going() at line 838 notifies livepatch that the module is leaving, ' +
      'allowing it to disable any patches targeting this module. ftrace_release_mod() at line 839 ' +
      'removes ftrace hooks from the module\'s functions. async_synchronize_full() at line 841 ' +
      'waits for all asynchronous operations to complete before proceeding with deallocation.',
    highlights: ['phase-ftrace_cleanup'],
    data: cloneState(st),
  });

  // Frame 5: free_module - sysfs teardown and state change
  st.phase = 'free_module';
  st.sections.forEach(s => { s.status = 'freeing'; });
  st.srcRef = 'kernel/module/main.c:1388 free_module()';
  frames.push({
    step: 5,
    label: 'free_module(): teardown begins',
    description:
      'free_module() at line 1388 first calls trace_module_free() (line 1390) for tracing, ' +
      'then mod_sysfs_teardown() at line 1394 to remove /sys/module/<name> entries. ' +
      'The module state is set to MODULE_STATE_UNFORMED (line 1401) under module_mutex, ' +
      'signaling that the module is no longer usable. module_arch_cleanup() at line 1405 ' +
      'handles architecture-specific deallocation.',
    highlights: ['phase-free_module'],
    data: cloneState(st),
  });

  // Frame 6: Unlink from modules list
  st.phase = 'unlink';
  st.symbols.forEach(s => { s.resolved = false; });
  st.srcRef = 'kernel/module/main.c:1418 list_del_rcu()';
  frames.push({
    step: 6,
    label: 'Unlink from modules list',
    description:
      'Under module_mutex (line 1417), list_del_rcu() at line 1419 removes the module from ' +
      'the global modules linked list. mod_tree_remove() at line 1420 removes it from the ' +
      'module address tree used by __module_address(). module_bug_cleanup() at line 1422 removes ' +
      'bug table entries. synchronize_rcu() at line 1424 ensures no concurrent readers ' +
      '(e.g., kallsyms lookup or /proc/modules) still reference the module.',
    highlights: ['phase-unlink'],
    data: cloneState(st),
  });

  // Frame 7: Free memory
  st.phase = 'free_memory';
  st.state = 'unloaded';
  st.sections.forEach(s => { s.status = 'freed'; });
  st.srcRef = 'kernel/module/main.c:1435 free_mod_mem()';
  frames.push({
    step: 7,
    label: 'Free module memory',
    description:
      'kfree(mod->args) at line 1432 frees the module arguments string. ' +
      'percpu_modfree() at line 1433 releases per-CPU allocations. ' +
      'Finally, free_mod_mem() at line 1435 frees all module_memory regions ' +
      '(MOD_TEXT, MOD_DATA, MOD_RODATA, etc.) via execmem_free(). ' +
      'The module is now fully unloaded -- all memory returned to the system.',
    highlights: ['phase-free_memory'],
    data: cloneState(st),
  });

  return frames;
}

function generateSymbolResolutionFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const st = initialLoadState();
  st.phase = 'symbol_resolution';

  // Frame 0: simplify_symbols entry
  st.srcRef = 'kernel/module/main.c:1513 simplify_symbols()';
  frames.push({
    step: 0,
    label: 'simplify_symbols() iterates ELF symbols',
    description:
      'simplify_symbols() at line 1513 iterates over all ELF symbols in the module\'s .symtab. ' +
      'For each symbol, it examines st_shndx (section index). SHN_COMMON symbols are rejected ' +
      '(kernel uses -fno-common). SHN_ABS symbols need no relocation. SHN_UNDEF symbols are ' +
      'external references that must be resolved against kernel and other module exports.',
    highlights: ['section-.symtab'],
    data: cloneState(st),
  });

  // Frame 1: SHN_UNDEF -> resolve_symbol_wait
  st.srcRef = 'kernel/module/main.c:1552 resolve_symbol_wait()';
  frames.push({
    step: 1,
    label: 'Undefined symbol: call resolve_symbol_wait()',
    description:
      'For SHN_UNDEF symbols (line 1551), simplify_symbols() calls resolve_symbol_wait() ' +
      '(line 1287). This wrapper repeatedly calls resolve_symbol() until the symbol is found ' +
      'or the module providing it finishes loading. This handles the case where two modules ' +
      'being loaded concurrently depend on each other\'s symbols.',
    highlights: ['symbol-printk'],
    data: cloneState(st),
  });

  // Frame 2: resolve_symbol -> find_symbol_arg setup
  st.srcRef = 'kernel/module/main.c:1231 resolve_symbol()';
  frames.push({
    step: 2,
    label: 'resolve_symbol() acquires module_mutex',
    description:
      'resolve_symbol() at line 1231 sets up struct find_symbol_arg with the symbol name ' +
      'and GPL compatibility flag (line 1238: gplok is true unless the module is proprietary). ' +
      'It acquires module_mutex at line 1249 and calls find_symbol() at line 1250. ' +
      'The mutex ensures the modules list is stable during the search.',
    highlights: ['symbol-printk'],
    data: cloneState(st),
  });

  // Frame 3: find_symbol searches __ksymtab
  st.srcRef = 'kernel/module/main.c:388 find_symbol()';
  frames.push({
    step: 3,
    label: 'Search kernel __ksymtab tables',
    description:
      'find_symbol() at line 388 first searches the kernel\'s built-in symbol tables. ' +
      'Two arrays are checked: __start___ksymtab..__stop___ksymtab (NOT_GPL_ONLY, line 391) ' +
      'and __start___ksymtab_gpl..__stop___ksymtab_gpl (GPL_ONLY, line 393). ' +
      'find_exported_symbol_in_section() uses binary search (via lookup_exported_symbol() ' +
      'in kernel/module/kallsyms.c:16) since the kernel symbol tables are sorted at build time.',
    highlights: ['symbol-printk', 'symbol-kmalloc'],
    data: cloneState(st),
  });

  // Frame 4: printk found in kernel ksymtab
  st.symbols[0].resolved = true; // printk
  st.srcRef = 'kernel/module/kallsyms.c:16 lookup_exported_symbol()';
  frames.push({
    step: 4,
    label: 'printk resolved from kernel __ksymtab',
    description:
      'lookup_exported_symbol() at kernel/module/kallsyms.c:16 performs bsearch() over the ' +
      'kernel_symbol array. printk is found in __ksymtab (it is EXPORT_SYMBOL). ' +
      'Back in resolve_symbol(), inherit_taint() at line 1256 checks license compatibility, ' +
      'check_version() at line 1261 verifies CRC matches, and verify_namespace_is_imported() ' +
      'at line 1266 checks the symbol namespace. ref_module() at line 1272 records the dependency.',
    highlights: ['symbol-printk'],
    data: cloneState(st),
  });

  // Frame 5: Search module exports for remaining symbols
  st.symbols[1].resolved = true; // kmalloc
  st.srcRef = 'kernel/module/main.c:404 modules list walk';
  frames.push({
    step: 5,
    label: 'kmalloc resolved; search continues',
    description:
      'kmalloc (actually a wrapper around __kmalloc) is also found in the kernel __ksymtab. ' +
      'If a symbol is not in the kernel tables, find_symbol() at line 404 walks the modules ' +
      'linked list via list_for_each_entry_rcu(). For each loaded module, it searches ' +
      'mod->syms (NOT_GPL_ONLY) and mod->gpl_syms (GPL_ONLY) -- these are the symbols ' +
      'exported by other modules via EXPORT_SYMBOL / EXPORT_SYMBOL_GPL.',
    highlights: ['symbol-kmalloc', 'symbol-__register_chrdev'],
    data: cloneState(st),
  });

  // Frame 6: Resolve remaining symbols
  st.symbols[2].resolved = true; // __register_chrdev
  st.symbols[3].resolved = true; // module_layout
  st.srcRef = 'kernel/module/main.c:1554 kernel_symbol_value()';
  frames.push({
    step: 6,
    label: 'All symbols resolved',
    description:
      'Each resolved symbol\'s value is written back to the ELF symbol table: ' +
      'sym[i].st_value = kernel_symbol_value(ksym) at line 1555. kernel_symbol_value() ' +
      'extracts the runtime address from the kernel_symbol struct. For weak undefined symbols ' +
      '(STB_WEAK at line 1561), resolution failure is acceptable -- the symbol remains zero. ' +
      'Unknown required symbols cause the load to fail with -ENOENT (line 1565).',
    highlights: ['symbol-__register_chrdev', 'symbol-module_layout'],
    data: cloneState(st),
  });

  // Frame 7: apply_relocations patches the code
  st.phase = 'relocations';
  st.sections.find(s => s.name === '.rela.text')!.status = 'relocated';
  st.srcRef = 'kernel/module/main.c:3451 apply_relocations()';
  frames.push({
    step: 7,
    label: 'apply_relocations() patches call sites',
    description:
      'With all symbol addresses resolved, apply_relocations() at line 3451 processes each ' +
      '.rela section. For .rela.text, each relocation entry specifies: which symbol, which offset ' +
      'in .text, and what relocation type (e.g., R_X86_64_PLT32 for function calls). ' +
      'The relocator writes the final addresses into the module\'s code, turning symbolic ' +
      'references like "call printk" into actual addresses the CPU can execute.',
    highlights: ['section-.rela.text'],
    data: cloneState(st),
  });

  // Frame 8: Module ready
  st.phase = 'complete';
  st.sections.forEach(s => { s.status = 'finalized'; });
  st.srcRef = 'kernel/module/main.c:3474 complete_formation()';
  frames.push({
    step: 8,
    label: 'Symbol resolution complete',
    description:
      'All symbols are resolved and relocations applied. The module code now contains real ' +
      'kernel addresses at every call site. complete_formation() at line 3474 sets memory ' +
      'protections (RO for .rodata, RX for .text, NX for .data) and transitions the module ' +
      'to MODULE_STATE_COMING. The module is ready for do_init_module() to invoke module_init().',
    highlights: ['phase-complete'],
    data: cloneState(st),
  });

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'module-load', label: 'Module Load Lifecycle' },
  { id: 'module-unload', label: 'Module Unload Lifecycle' },
  { id: 'symbol-resolution', label: 'Symbol Resolution Deep Dive' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as ModuleState;
  const margin = { top: 24, right: 10, bottom: 10, left: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = `Module: ${data.moduleName} [${data.state}]`;
  container.appendChild(titleEl);

  // Phase indicator
  const phaseY = margin.top + 4;
  const phaseEl = document.createElementNS(NS, 'text');
  phaseEl.setAttribute('x', String(margin.left));
  phaseEl.setAttribute('y', String(phaseY));
  phaseEl.setAttribute('class', 'anim-module');
  phaseEl.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseEl);

  // Draw sections as boxes
  const sectionTop = phaseY + 20;
  const sectionHeight = 24;
  const sectionGap = 4;
  const sectionWidth = usableWidth / data.sections.length - sectionGap;

  const sectionLabel = document.createElementNS(NS, 'text');
  sectionLabel.setAttribute('x', String(margin.left));
  sectionLabel.setAttribute('y', String(sectionTop));
  sectionLabel.setAttribute('class', 'anim-module');
  sectionLabel.textContent = 'ELF Sections:';
  container.appendChild(sectionLabel);

  const sectionBoxTop = sectionTop + 8;
  data.sections.forEach((sec, i) => {
    const x = margin.left + i * (sectionWidth + sectionGap);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(sectionBoxTop));
    rect.setAttribute('width', String(sectionWidth));
    rect.setAttribute('height', String(sectionHeight));
    rect.setAttribute('rx', '3');

    let cls = `anim-section anim-section-${sec.status}`;
    if (frame.highlights.includes(`section-${sec.name}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    if (sectionWidth > 30) {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(x + sectionWidth / 2));
      label.setAttribute('y', String(sectionBoxTop + sectionHeight / 2 + 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'anim-section-label');
      label.textContent = sec.name;
      container.appendChild(label);
    }
  });

  // Draw symbols as a row below sections
  const symbolTop = sectionBoxTop + sectionHeight + 24;
  const symbolLabel = document.createElementNS(NS, 'text');
  symbolLabel.setAttribute('x', String(margin.left));
  symbolLabel.setAttribute('y', String(symbolTop));
  symbolLabel.setAttribute('class', 'anim-module');
  symbolLabel.textContent = 'Symbols:';
  container.appendChild(symbolLabel);

  const symBoxTop = symbolTop + 8;
  const symHeight = 20;
  const symGap = 6;
  const symWidth = usableWidth / data.symbols.length - symGap;

  data.symbols.forEach((sym, i) => {
    const x = margin.left + i * (symWidth + symGap);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(symBoxTop));
    rect.setAttribute('width', String(symWidth));
    rect.setAttribute('height', String(symHeight));
    rect.setAttribute('rx', '2');

    let cls = `anim-symbol ${sym.resolved ? 'anim-symbol-resolved' : 'anim-symbol-unresolved'}`;
    if (frame.highlights.includes(`symbol-${sym.name}`)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    if (symWidth > 30) {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(x + symWidth / 2));
      label.setAttribute('y', String(symBoxTop + symHeight / 2 + 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'anim-symbol-label');
      label.textContent = sym.name;
      container.appendChild(label);
    }
  });

  // Source reference at bottom
  const srcRefY = symBoxTop + symHeight + 24;
  const srcRefEl = document.createElementNS(NS, 'text');
  srcRefEl.setAttribute('x', String(margin.left));
  srcRefEl.setAttribute('y', String(srcRefY));
  srcRefEl.setAttribute('class', 'anim-module');
  srcRefEl.textContent = `src: ${data.srcRef}`;
  container.appendChild(srcRefEl);
}

const module_: AnimationModule = {
  config: {
    id: 'module-lifecycle',
    title: 'Kernel Module Lifecycle',
    skillName: 'kernel-modules',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'module-unload':
        return generateModuleUnloadFrames();
      case 'symbol-resolution':
        return generateSymbolResolutionFrames();
      case 'module-load':
      default:
        return generateModuleLoadFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default module_;
