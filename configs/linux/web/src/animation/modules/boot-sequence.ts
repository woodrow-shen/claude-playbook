import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface BootPhase {
  id: string;
  name: string;
  function: string;
  srcRef: string;
  state: 'pending' | 'active' | 'completed';
}

export interface BootState {
  phase: string;
  completedPhases: string[];
  currentFunction: string;
  srcRef: string;
  phases: BootPhase[];
}

function clonePhases(phases: BootPhase[]): BootPhase[] {
  return phases.map(p => ({ ...p }));
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  phases: BootPhase[],
  currentFunction: string,
  srcRef: string,
): AnimationFrame {
  const completedPhases = phases.filter(p => p.state === 'completed').map(p => p.id);
  const activePhase = phases.find(p => p.state === 'active');
  return {
    step,
    label,
    description,
    highlights,
    data: {
      phase: activePhase?.id ?? '',
      completedPhases,
      currentFunction,
      srcRef,
      phases: clonePhases(phases),
    } satisfies BootState,
  };
}

function generateStartKernelToInitFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const phases: BootPhase[] = [
    { id: 'start_kernel', name: 'start_kernel()', function: 'start_kernel', srcRef: 'init/main.c:1008', state: 'pending' },
    { id: 'setup_arch', name: 'setup_arch()', function: 'setup_arch', srcRef: 'init/main.c:1030', state: 'pending' },
    { id: 'mm_core_init', name: 'mm_core_init()', function: 'mm_core_init', srcRef: 'init/main.c:1070', state: 'pending' },
    { id: 'sched_init', name: 'sched_init()', function: 'sched_init', srcRef: 'init/main.c:1083', state: 'pending' },
    { id: 'rest_init', name: 'rest_init()', function: 'rest_init', srcRef: 'init/main.c:1210', state: 'pending' },
    { id: 'kernel_init', name: 'kernel_init()', function: 'kernel_init', srcRef: 'init/main.c:1573', state: 'pending' },
    { id: 'kernel_init_freeable', name: 'kernel_init_freeable()', function: 'kernel_init_freeable', srcRef: 'init/main.c:1663', state: 'pending' },
    { id: 'free_initmem', name: 'free_initmem()', function: 'free_initmem', srcRef: 'init/main.c:1591', state: 'pending' },
    { id: 'run_init_process', name: 'run_init_process()', function: 'run_init_process', srcRef: 'init/main.c:1491', state: 'pending' },
  ];

  // Frame 0: Entry
  phases[0].state = 'active';
  frames.push(makeFrame(
    0,
    'Entry: start_kernel()',
    'The kernel entry point start_kernel() at init/main.c:1008 begins execution. This is the first C function called after architecture-specific assembly boot code. It initializes the init_task stack guard via set_task_stack_end_magic() at line 1013 and disables local IRQs at line 1020.',
    ['start_kernel'],
    phases,
    'start_kernel',
    'init/main.c:1008 start_kernel()',
  ));

  // Frame 1: setup_arch
  phases[0].state = 'completed';
  phases[1].state = 'active';
  frames.push(makeFrame(
    1,
    'Architecture setup: setup_arch()',
    'start_kernel() calls setup_arch(&command_line) at init/main.c:1030. On x86, setup_arch() is defined at arch/x86/kernel/setup.c:884. It configures the memory map from BIOS/EFI (e820), sets up page tables, reserves memory regions, and initializes the boot CPU topology. This is the bridge between firmware and kernel memory management.',
    ['setup_arch'],
    phases,
    'setup_arch',
    'arch/x86/kernel/setup.c:884 setup_arch()',
  ));

  // Frame 2: mm_core_init
  phases[1].state = 'completed';
  phases[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Memory subsystem: mm_core_init()',
    'At init/main.c:1070, mm_core_init() is called. Defined at mm/mm_init.c:2694, it calls build_all_zonelists() at line 2700 to organize NUMA zones, then memblock_free_all() at line 2720 to release bootmem to the buddy allocator, mem_init() at line 2721 to finalize physical memory setup, and kmem_cache_init() at line 2722 to bootstrap the SLUB slab allocator.',
    ['mm_core_init'],
    phases,
    'mm_core_init',
    'mm/mm_init.c:2694 mm_core_init()',
  ));

  // Frame 3: sched_init
  phases[2].state = 'completed';
  phases[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Scheduler bootstrap: sched_init()',
    'sched_init() is called at init/main.c:1083 before any interrupts are enabled. Defined at kernel/sched/core.c:8599, it verifies scheduling class priority order (line 8605-8608), initializes per-CPU runqueues with init_cfs_rq(), init_rt_rq(), init_dl_rq() at lines 8672-8674, and sets up the boot idle thread via init_idle(current, smp_processor_id()) at line 8782.',
    ['sched_init'],
    phases,
    'sched_init',
    'kernel/sched/core.c:8599 sched_init()',
  ));

  // Frame 4: rest_init
  phases[3].state = 'completed';
  phases[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Transition: rest_init()',
    'After all early init completes, start_kernel() calls rest_init() at init/main.c:1210. Defined at init/main.c:714, rest_init() spawns the first userspace-capable thread via user_mode_thread(kernel_init, ...) at line 725 to create PID 1, then spawns kthreadd via kernel_thread() at line 738 to create PID 2. The boot CPU then enters the idle loop.',
    ['rest_init'],
    phases,
    'rest_init',
    'init/main.c:714 rest_init()',
  ));

  // Frame 5: kernel_init
  phases[4].state = 'completed';
  phases[5].state = 'active';
  frames.push(makeFrame(
    5,
    'PID 1: kernel_init()',
    'kernel_init() at init/main.c:1573 is the entry point for PID 1, spawned by rest_init(). It first waits for kthreadd to finish setup via wait_for_completion(&kthreadd_done) at line 1580, then calls kernel_init_freeable() at line 1582 to run all initcalls and bring up SMP.',
    ['kernel_init'],
    phases,
    'kernel_init',
    'init/main.c:1573 kernel_init()',
  ));

  // Frame 6: kernel_init_freeable
  phases[5].state = 'completed';
  phases[6].state = 'active';
  frames.push(makeFrame(
    6,
    'Init calls: kernel_init_freeable()',
    'kernel_init_freeable() at init/main.c:1663 runs do_pre_smp_initcalls() at line 1681, then smp_init() at line 1684 to bring up secondary CPUs, and sched_init_smp() at line 1685 to build scheduling domains. It also runs all module_init() functions via do_initcalls(), mounting rootfs and loading drivers.',
    ['kernel_init_freeable'],
    phases,
    'kernel_init_freeable',
    'init/main.c:1663 kernel_init_freeable()',
  ));

  // Frame 7: free_initmem
  phases[6].state = 'completed';
  phases[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Reclaim __init: free_initmem()',
    'Back in kernel_init() at init/main.c:1591, free_initmem() reclaims all memory marked __init (functions and data only needed during boot). The system state transitions to SYSTEM_FREEING_INITMEM at line 1586, then to SYSTEM_RUNNING at line 1600. mark_readonly() at line 1592 sets kernel text pages read-only for security.',
    ['free_initmem'],
    phases,
    'free_initmem',
    'init/main.c:1591 free_initmem()',
  ));

  // Frame 8: run_init_process
  phases[7].state = 'completed';
  phases[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Userspace: run_init_process()',
    'kernel_init() attempts to exec userspace init. At init/main.c:1607, if ramdisk_execute_command is set, it calls run_init_process() (defined at line 1491). Otherwise it tries execute_command (line 1622), CONFIG_DEFAULT_INIT (line 1630), and finally the fallback sequence: /sbin/init, /etc/init, /bin/init, /bin/sh (lines 1638-1641). If all fail, the kernel panics at line 1644.',
    ['run_init_process'],
    phases,
    'run_init_process',
    'init/main.c:1491 run_init_process()',
  ));

  return frames;
}

function generateMemoryInitFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const phases: BootPhase[] = [
    { id: 'setup_arch', name: 'setup_arch()', function: 'setup_arch', srcRef: 'arch/x86/kernel/setup.c:884', state: 'pending' },
    { id: 'mm_core_init_early', name: 'mm_core_init_early()', function: 'mm_core_init_early', srcRef: 'init/main.c:1031', state: 'pending' },
    { id: 'mm_core_init', name: 'mm_core_init()', function: 'mm_core_init', srcRef: 'mm/mm_init.c:2694', state: 'pending' },
    { id: 'build_all_zonelists', name: 'build_all_zonelists()', function: 'build_all_zonelists', srcRef: 'mm/mm_init.c:2700', state: 'pending' },
    { id: 'memblock_free_all', name: 'memblock_free_all()', function: 'memblock_free_all', srcRef: 'mm/mm_init.c:2720', state: 'pending' },
    { id: 'mem_init', name: 'mem_init()', function: 'mem_init', srcRef: 'mm/mm_init.c:2721', state: 'pending' },
    { id: 'kmem_cache_init', name: 'kmem_cache_init()', function: 'kmem_cache_init', srcRef: 'mm/mm_init.c:2722', state: 'pending' },
    { id: 'vmalloc_init', name: 'vmalloc_init()', function: 'vmalloc_init', srcRef: 'mm/mm_init.c:2732', state: 'pending' },
    { id: 'kmem_cache_init_late', name: 'kmem_cache_init_late()', function: 'kmem_cache_init_late', srcRef: 'init/main.c:1140', state: 'pending' },
  ];

  // Frame 0
  phases[0].state = 'active';
  frames.push(makeFrame(
    0,
    'Architecture memory map: setup_arch()',
    'Memory initialization begins in setup_arch() at arch/x86/kernel/setup.c:884, called from start_kernel() at init/main.c:1030. On x86, it parses the e820 memory map from BIOS/UEFI, identifies usable RAM regions, reserves kernel text/data, and calls early memblock allocations for page tables and the initial direct mapping.',
    ['setup_arch'],
    phases,
    'setup_arch',
    'arch/x86/kernel/setup.c:884 setup_arch()',
  ));

  // Frame 1
  phases[0].state = 'completed';
  phases[1].state = 'active';
  frames.push(makeFrame(
    1,
    'Early mm init: mm_core_init_early()',
    'mm_core_init_early() is called at init/main.c:1031 right after setup_arch(). Defined at mm/mm_init.c:2683, it performs early memory management initialization that must happen before other subsystems, setting up foundational data structures that the full mm_core_init() will build upon.',
    ['mm_core_init_early'],
    phases,
    'mm_core_init_early',
    'mm/mm_init.c:2683 mm_core_init_early()',
  ));

  // Frame 2
  phases[1].state = 'completed';
  phases[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Core mm init: mm_core_init()',
    'mm_core_init() at mm/mm_init.c:2694 is the main memory subsystem initialization function, called from init/main.c:1070. It orchestrates the transition from boot-time memblock allocator to the runtime buddy allocator and slab allocator. It starts with arch_mm_preinit() at line 2696 for final architecture-specific preparation.',
    ['mm_core_init'],
    phases,
    'mm_core_init',
    'mm/mm_init.c:2694 mm_core_init()',
  ));

  // Frame 3
  phases[2].state = 'completed';
  phases[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Zone lists: build_all_zonelists()',
    'build_all_zonelists(NULL) at mm/mm_init.c:2700 constructs the NUMA zone fallback lists. Each node has zones (DMA, DMA32, Normal, Movable), and the zonelist defines the order in which zones are tried during allocation. BUILD_BUG_ON(MAX_ZONELISTS > 2) at line 2699 ensures at most 2 zonelist types (normal and GFP_THISNODE).',
    ['build_all_zonelists'],
    phases,
    'build_all_zonelists',
    'mm/mm_init.c:2700 build_all_zonelists()',
  ));

  // Frame 4
  phases[3].state = 'completed';
  phases[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Release bootmem: memblock_free_all()',
    'memblock_free_all() at mm/mm_init.c:2720 is the pivotal moment: it iterates over all memblock.memory regions and frees pages to the buddy allocator via __free_pages_core(). After this call, the buddy allocator owns all free physical memory and memblock is no longer the primary allocator. This is the birth of the runtime page allocator.',
    ['memblock_free_all'],
    phases,
    'memblock_free_all',
    'mm/mm_init.c:2720 memblock_free_all()',
  ));

  // Frame 5
  phases[4].state = 'completed';
  phases[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Finalize physical memory: mem_init()',
    'mem_init() at mm/mm_init.c:2721 (defined at line 2679) finalizes physical memory setup. On x86, it performs architecture-specific memory accounting, reports total usable RAM, and verifies the memory map is consistent. After mem_init(), the kernel has a complete picture of available physical memory.',
    ['mem_init'],
    phases,
    'mem_init',
    'mm/mm_init.c:2679 mem_init()',
  ));

  // Frame 6
  phases[5].state = 'completed';
  phases[6].state = 'active';
  frames.push(makeFrame(
    6,
    'Slab bootstrap: kmem_cache_init()',
    'kmem_cache_init() at mm/mm_init.c:2722 bootstraps the SLUB slab allocator. Before this, all allocations come from memblock or the buddy allocator. kmem_cache_init() creates the initial kmem_cache and kmem_cache_node caches using static bootstrap structures, then migrates them to proper slab-allocated memory. This enables kmalloc() for all subsequent kernel allocations.',
    ['kmem_cache_init'],
    phases,
    'kmem_cache_init',
    'mm/mm_init.c:2722 kmem_cache_init()',
  ));

  // Frame 7
  phases[6].state = 'completed';
  phases[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Virtual memory: vmalloc_init()',
    'vmalloc_init() at mm/mm_init.c:2732 initializes the vmalloc subsystem for non-contiguous virtual memory mappings. It sets up the vmalloc address space between VMALLOC_START and VMALLOC_END, enabling kernel code to allocate large virtually contiguous regions even when physical memory is fragmented.',
    ['vmalloc_init'],
    phases,
    'vmalloc_init',
    'mm/mm_init.c:2732 vmalloc_init()',
  ));

  // Frame 8
  phases[7].state = 'completed';
  phases[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Late slab setup: kmem_cache_init_late()',
    'After IRQs are enabled in start_kernel(), kmem_cache_init_late() at init/main.c:1140 completes slab allocator initialization. It finalizes features that require working IRQs and timers, such as slab debugging, KASAN integration, and the slab memory accounting that feeds /proc/slabinfo. The memory subsystem is now fully operational.',
    ['kmem_cache_init_late'],
    phases,
    'kmem_cache_init_late',
    'init/main.c:1140 kmem_cache_init_late()',
  ));

  return frames;
}

function generateSchedulerInitFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const phases: BootPhase[] = [
    { id: 'sched_init_entry', name: 'sched_init() entry', function: 'sched_init', srcRef: 'kernel/sched/core.c:8599', state: 'pending' },
    { id: 'class_verify', name: 'Verify sched classes', function: 'sched_init', srcRef: 'kernel/sched/core.c:8605', state: 'pending' },
    { id: 'init_rq', name: 'Initialize runqueues', function: 'sched_init', srcRef: 'kernel/sched/core.c:8664', state: 'pending' },
    { id: 'init_cfs_rt_dl', name: 'Init CFS/RT/DL per-rq', function: 'sched_init', srcRef: 'kernel/sched/core.c:8672', state: 'pending' },
    { id: 'init_idle', name: 'Boot idle thread', function: 'init_idle', srcRef: 'kernel/sched/core.c:8782', state: 'pending' },
    { id: 'smp_init', name: 'smp_init()', function: 'smp_init', srcRef: 'kernel/smp.c:992', state: 'pending' },
    { id: 'sched_init_smp', name: 'sched_init_smp()', function: 'sched_init_smp', srcRef: 'kernel/sched/core.c:8544', state: 'pending' },
    { id: 'sched_domains', name: 'Build sched domains', function: 'sched_init_domains', srcRef: 'kernel/sched/core.c:8556', state: 'pending' },
    { id: 'sched_complete', name: 'Scheduler fully online', function: 'sched_init_smp', srcRef: 'kernel/sched/core.c:8570', state: 'pending' },
  ];

  // Frame 0
  phases[0].state = 'active';
  frames.push(makeFrame(
    0,
    'Entry: sched_init()',
    'sched_init() at kernel/sched/core.c:8599 is called from start_kernel() at init/main.c:1083, before any interrupts are enabled. It initializes the scheduler data structures on the boot CPU. The comment at init/main.c:1079 explains: "Set up the scheduler prior starting any interrupts (such as the timer interrupt)."',
    ['sched_init_entry'],
    phases,
    'sched_init',
    'kernel/sched/core.c:8599 sched_init()',
  ));

  // Frame 1
  phases[0].state = 'completed';
  phases[1].state = 'active';
  frames.push(makeFrame(
    1,
    'Verify scheduling class hierarchy',
    'sched_init() verifies the scheduling class priority chain at kernel/sched/core.c:8605-8608: stop > deadline > realtime > fair > idle. BUG_ON(!sched_class_above(&stop_sched_class, &dl_sched_class)) ensures stop class has highest priority. With CONFIG_SCHED_CLASS_EXT, it also verifies fair > ext > idle at lines 8610-8611.',
    ['class_verify'],
    phases,
    'sched_init',
    'kernel/sched/core.c:8605 sched class BUG_ON checks',
  ));

  // Frame 2
  phases[1].state = 'completed';
  phases[2].state = 'active';
  frames.push(makeFrame(
    2,
    'Initialize per-CPU runqueues',
    'The for_each_possible_cpu(i) loop at kernel/sched/core.c:8664 initializes each CPU runqueue. For each rq: raw_spin_lock_init(&rq->__lock) at line 8668, rq->nr_running = 0 at line 8669, and rq->cpu = i at line 8718. Each runqueue is the core scheduling data structure -- the "ready list" for its CPU.',
    ['init_rq'],
    phases,
    'sched_init',
    'kernel/sched/core.c:8664 for_each_possible_cpu runqueue init',
  ));

  // Frame 3
  phases[2].state = 'completed';
  phases[3].state = 'active';
  frames.push(makeFrame(
    3,
    'Init CFS, RT, and DL queues per runqueue',
    'Inside the per-CPU loop, init_cfs_rq(&rq->cfs) at kernel/sched/core.c:8672 sets up the CFS red-black tree, init_rt_rq(&rq->rt) at line 8673 initializes RT priority arrays, and init_dl_rq(&rq->dl) at line 8674 creates the deadline scheduling structures. Each rq also gets rq_attach_root(rq, &def_root_domain) at line 8726 for load balancing.',
    ['init_cfs_rt_dl'],
    phases,
    'sched_init',
    'kernel/sched/core.c:8672 init_cfs_rq/init_rt_rq/init_dl_rq',
  ));

  // Frame 4
  phases[3].state = 'completed';
  phases[4].state = 'active';
  frames.push(makeFrame(
    4,
    'Boot CPU idle thread setup',
    'After the per-CPU loop, sched_init() sets up the boot idle thread. set_load_weight(&init_task, false) at kernel/sched/core.c:8758 assigns weight, __sched_fork(0, current) at line 8781 initializes scheduling fields, and init_idle(current, smp_processor_id()) at line 8782 designates the boot thread as the idle task. idle_thread_set_boot_cpu() at line 8786 marks it as the boot CPU idle.',
    ['init_idle'],
    phases,
    'init_idle',
    'kernel/sched/core.c:8782 init_idle()',
  ));

  // Frame 5
  phases[4].state = 'completed';
  phases[5].state = 'active';
  frames.push(makeFrame(
    5,
    'Bring up secondary CPUs: smp_init()',
    'Much later in boot, kernel_init_freeable() calls smp_init() at init/main.c:1684. Defined at kernel/smp.c:992, it iterates over all possible CPUs and brings them online one by one. Each secondary CPU gets its own idle thread and runqueue. The boot CPU orchestrates this via CPU hotplug infrastructure.',
    ['smp_init'],
    phases,
    'smp_init',
    'kernel/smp.c:992 smp_init()',
  ));

  // Frame 6
  phases[5].state = 'completed';
  phases[6].state = 'active';
  frames.push(makeFrame(
    6,
    'SMP scheduler setup: sched_init_smp()',
    'sched_init_smp() at kernel/sched/core.c:8544 is called from init/main.c:1685, immediately after smp_init(). It initializes NUMA-aware scheduling with sched_init_numa() at line 8546, builds scheduling domains with sched_init_domains(cpu_active_mask) at line 8556, and initializes RT and DL scheduling classes with init_sched_rt_class() and init_sched_dl_class() at lines 8565-8566.',
    ['sched_init_smp'],
    phases,
    'sched_init_smp',
    'kernel/sched/core.c:8544 sched_init_smp()',
  ));

  // Frame 7
  phases[6].state = 'completed';
  phases[7].state = 'active';
  frames.push(makeFrame(
    7,
    'Build scheduling domains',
    'sched_init_domains(cpu_active_mask) at kernel/sched/core.c:8556 constructs the hierarchical scheduling domain topology: SMT (hyperthreads) -> MC (cores) -> NUMA (nodes). These domains define the scope of load balancing. The comment at line 8553 notes "no userspace yet to cause hotplug operations; hence all the CPU masks are stable."',
    ['sched_domains'],
    phases,
    'sched_init_domains',
    'kernel/sched/core.c:8556 sched_init_domains()',
  ));

  // Frame 8
  phases[7].state = 'completed';
  phases[8].state = 'active';
  frames.push(makeFrame(
    8,
    'Scheduler fully online',
    'sched_init_smp() completes by setting sched_smp_initialized = true at kernel/sched/core.c:8570, and calls sched_init_granularity() at line 8563 to finalize time slice parameters. The scheduler is now fully operational on all CPUs with proper load balancing domains. init_sched_dl_servers() at line 8568 sets up deadline servers for fair bandwidth control.',
    ['sched_complete'],
    phases,
    'sched_init_smp',
    'kernel/sched/core.c:8570 sched_smp_initialized = true',
  ));

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'start-kernel-to-init', label: 'Boot Path: start_kernel to userspace' },
  { id: 'memory-init', label: 'Memory Subsystem Initialization' },
  { id: 'scheduler-init', label: 'Scheduler Bring-up and SMP' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as BootState;
  const { phases } = data;
  const margin = { top: 24, right: 16, bottom: 16, left: 16 };
  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'Kernel Boot Sequence';
  container.appendChild(titleEl);

  // Draw phases as a vertical timeline
  const phaseCount = phases.length;
  const rowHeight = Math.min(28, usableHeight / phaseCount);
  const boxWidth = Math.min(usableWidth * 0.6, 260);
  const boxX = margin.left + (usableWidth - boxWidth) / 2;

  for (let i = 0; i < phaseCount; i++) {
    const phase = phases[i];
    const y = margin.top + i * rowHeight;

    // Connector line to next phase
    if (i < phaseCount - 1) {
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

    // Phase box
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(boxX));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxWidth));
    rect.setAttribute('height', String(rowHeight * 0.6));
    rect.setAttribute('rx', '4');

    let cls = `anim-phase anim-phase-${phase.state}`;
    if (frame.highlights.includes(phase.id)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    // Phase label
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(boxX + boxWidth / 2));
    label.setAttribute('y', String(y + rowHeight * 0.38));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-function');
    label.textContent = phase.name;
    container.appendChild(label);

    // Source reference on the right
    const srcLabel = document.createElementNS(NS, 'text');
    srcLabel.setAttribute('x', String(boxX + boxWidth + 8));
    srcLabel.setAttribute('y', String(y + rowHeight * 0.38));
    srcLabel.setAttribute('class', 'anim-srcref');
    srcLabel.textContent = phase.srcRef;
    container.appendChild(srcLabel);
  }

  // Current function indicator
  const fnLabel = document.createElementNS(NS, 'text');
  fnLabel.setAttribute('x', String(margin.left));
  fnLabel.setAttribute('y', String(margin.top + phaseCount * rowHeight + 12));
  fnLabel.setAttribute('class', 'anim-function');
  fnLabel.textContent = `Current: ${data.currentFunction}()`;
  container.appendChild(fnLabel);
}

const bootSequence: AnimationModule = {
  config: {
    id: 'boot-sequence',
    title: 'Kernel Boot Sequence',
    skillName: 'boot-and-init',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'memory-init':
        return generateMemoryInitFrames();
      case 'scheduler-init':
        return generateSchedulerInitFrames();
      case 'start-kernel-to-init':
      default:
        return generateStartKernelToInitFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default bootSequence;
