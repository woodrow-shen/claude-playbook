import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface KvmState {
  mode: 'host-kernel' | 'host-user' | 'guest';
  currentFunction: string;
  vmcsFields: Record<string, string>;
  exitReason: string | null;
  phase: 'ioctl' | 'prepare-entry' | 'vm-entry' | 'guest-running' | 'vm-exit' | 'exit-handling' | 'return-userspace' | 'vcpu-create';
  registers: Record<string, string>;
  srcRef: string;
}

function makeFrame(
  step: number,
  label: string,
  description: string,
  highlights: string[],
  state: KvmState,
): AnimationFrame {
  return {
    step,
    label,
    description,
    highlights,
    data: { ...state, vmcsFields: { ...state.vmcsFields }, registers: { ...state.registers } },
  };
}

function generateVmEntryExitCycleFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: KvmState = {
    mode: 'host-kernel',
    currentFunction: 'kvm_vcpu_ioctl',
    vmcsFields: {},
    exitReason: null,
    phase: 'ioctl',
    registers: {},
    srcRef: 'virt/kvm/kvm_main.c:4405 kvm_vcpu_ioctl()',
  };

  // Frame 0: ioctl(KVM_RUN) entry
  frames.push(makeFrame(
    0,
    'ioctl(KVM_RUN) entry',
    'Userspace (QEMU) calls ioctl(vcpu_fd, KVM_RUN). The kernel dispatches to kvm_vcpu_ioctl() at virt/kvm/kvm_main.c:4412. The switch statement at line 4446 matches KVM_RUN, acquires vcpu->mutex at line 4444, and calls kvm_arch_vcpu_ioctl_run() at the arch-specific layer.',
    ['kvm_vcpu_ioctl'],
    state,
  ));

  // Frame 1: kvm_arch_vcpu_ioctl_run
  state.currentFunction = 'kvm_arch_vcpu_ioctl_run';
  state.phase = 'prepare-entry';
  state.srcRef = 'arch/x86/kvm/x86.c:11919 kvm_arch_vcpu_ioctl_run()';
  frames.push(makeFrame(
    1,
    'Arch-specific KVM_RUN handler',
    'kvm_arch_vcpu_ioctl_run() at arch/x86/kvm/x86.c:11919 loads the vCPU state with vcpu_load() at line 11930, activates the signal set with kvm_sigset_activate() at line 11931, and loads guest FPU state with kvm_load_guest_fpu() at line 11933. It then calls vcpu_run() to enter the main run loop.',
    ['kvm_arch_vcpu_ioctl_run'],
    state,
  ));

  // Frame 2: vcpu_run loop
  state.currentFunction = 'vcpu_run';
  state.srcRef = 'arch/x86/kvm/x86.c:11662 vcpu_run()';
  frames.push(makeFrame(
    2,
    'vCPU run loop',
    'vcpu_run() at arch/x86/kvm/x86.c:11662 enters a for(;;) loop at line 11668. It sets exit_reason to KVM_EXIT_UNKNOWN at line 11666. If kvm_vcpu_running() returns true (line 11676), it calls vcpu_enter_guest(). Otherwise it calls vcpu_block() for halted vCPUs. The loop continues until r <= 0 (line 11682).',
    ['vcpu_run'],
    state,
  ));

  // Frame 3: vcpu_enter_guest
  state.currentFunction = 'vcpu_enter_guest';
  state.srcRef = 'arch/x86/kvm/x86.c:11079 vcpu_enter_guest()';
  frames.push(makeFrame(
    3,
    'Prepare guest entry',
    'vcpu_enter_guest() at arch/x86/kvm/x86.c:11079 processes pending requests (line 11090), injects interrupts and exceptions, then disables preemption at line 11282. It calls kvm_x86_call(prepare_switch_to_guest) at line 11284, disables local IRQs at line 11291, and sets vcpu->mode to IN_GUEST_MODE at line 11294 with a store-release barrier.',
    ['vcpu_enter_guest'],
    state,
  ));

  // Frame 4: vmx_vcpu_run
  state.currentFunction = 'vmx_vcpu_run';
  state.phase = 'vm-entry';
  state.srcRef = 'arch/x86/kvm/vmx/vmx.c:7605 vmx_vcpu_run()';
  state.vmcsFields = { 'GUEST_RIP': '0xffffffff81000000', 'GUEST_RSP': '0xffffc90000003ff0' };
  frames.push(makeFrame(
    4,
    'VMX vCPU run',
    'kvm_x86_call(vcpu_run) at arch/x86/kvm/x86.c:11393 dispatches to vmx_vcpu_run() at arch/x86/kvm/vmx/vmx.c:7605. It validates guest state (line 7621), calls trace_kvm_entry() at line 7633, then calls vmx_vcpu_enter_exit() at line 7699 which invokes __vmx_vcpu_run() with VMLAUNCH or VMRESUME flags.',
    ['vmx_vcpu_run'],
    state,
  ));

  // Frame 5: __vmx_vcpu_run asm entry
  state.currentFunction = '__vmx_vcpu_run';
  state.mode = 'guest';
  state.phase = 'guest-running';
  state.srcRef = 'arch/x86/kvm/vmx/vmenter.S:79 __vmx_vcpu_run()';
  frames.push(makeFrame(
    5,
    'VMLAUNCH/VMRESUME: enter guest mode',
    '__vmx_vcpu_run() at arch/x86/kvm/vmx/vmenter.S:79 is the assembly entry point. It saves host registers onto the stack (lines 80-91), loads guest register state from the vcpu->arch.regs array, then executes VMLAUNCH (first entry) or VMRESUME (subsequent entries) based on VMX_RUN_VMRESUME flag at line 72. The CPU transitions to VMX non-root operation -- the guest is now running directly on hardware.',
    ['__vmx_vcpu_run', 'VMLAUNCH'],
    state,
  ));

  // Frame 6: VM exit occurs
  state.currentFunction = 'vmx_vcpu_enter_exit';
  state.mode = 'host-kernel';
  state.phase = 'vm-exit';
  state.exitReason = 'EXIT_REASON_EXTERNAL_INTERRUPT';
  state.srcRef = 'arch/x86/kvm/vmx/vmx.c:7566 vmx_vcpu_enter_exit()';
  state.vmcsFields = { ...state.vmcsFields, 'VM_EXIT_REASON': '1 (EXTERNAL_INTERRUPT)' };
  frames.push(makeFrame(
    6,
    'VM exit: return to host',
    'A VM exit occurs (e.g., external interrupt). The CPU saves guest state to the VMCS, loads host state, and returns to vmx_vcpu_enter_exit() at arch/x86/kvm/vmx/vmx.c:7566. At line 7595, it reads the exit reason from VMCS via vmcs_read32(VM_EXIT_REASON). guest_state_exit_irqoff() at line 7602 marks the transition back to host. vcpu->mode is set to OUTSIDE_GUEST_MODE at arch/x86/kvm/x86.c:11442.',
    ['vmx_vcpu_enter_exit', 'VM_EXIT'],
    state,
  ));

  // Frame 7: vmx_handle_exit
  state.currentFunction = 'vmx_handle_exit';
  state.phase = 'exit-handling';
  state.srcRef = 'arch/x86/kvm/vmx/vmx.c:6937 vmx_handle_exit()';
  frames.push(makeFrame(
    7,
    'Handle VM exit',
    'kvm_x86_call(handle_exit) at arch/x86/kvm/x86.c:11520 dispatches to vmx_handle_exit() at arch/x86/kvm/vmx/vmx.c:6937. It calls __vmx_handle_exit() at line 6939, which reads the exit reason (line 6784) and uses the kvm_vmx_exit_handlers[] dispatch table (line 6781) to invoke the appropriate handler. For external interrupts, the handler returns 1 to re-enter the guest via the vcpu_run() loop.',
    ['vmx_handle_exit'],
    state,
  ));

  // Frame 8: return to vcpu_run loop or userspace
  state.currentFunction = 'vcpu_run';
  state.phase = 'return-userspace';
  state.mode = 'host-kernel';
  state.exitReason = null;
  state.srcRef = 'arch/x86/kvm/x86.c:11662 vcpu_run()';
  frames.push(makeFrame(
    8,
    'Return to run loop or userspace',
    'Back in vcpu_run() at arch/x86/kvm/x86.c:11662, if the exit handler returned r > 0 (line 11682), the loop continues and re-enters the guest. If r <= 0, the loop breaks. For exits requiring userspace handling (KVM_EXIT_IO, KVM_EXIT_MMIO), r = 0 causes return through kvm_arch_vcpu_ioctl_run(), which stores exit info in vcpu->run (the shared kvm_run page) and returns to the ioctl caller (QEMU).',
    ['vcpu_run', 'return'],
    state,
  ));

  return frames;
}

function generateIoExitHandlingFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: KvmState = {
    mode: 'host-kernel',
    currentFunction: 'kvm_arch_vcpu_ioctl_run',
    vmcsFields: {},
    exitReason: null,
    phase: 'ioctl',
    registers: {},
    srcRef: 'arch/x86/kvm/x86.c:12014 kvm_arch_vcpu_ioctl_run()',
  };

  // Frame 0: KVM_RUN from QEMU
  frames.push(makeFrame(
    0,
    'QEMU calls ioctl(KVM_RUN)',
    'QEMU invokes ioctl(vcpu_fd, KVM_RUN) which reaches kvm_arch_vcpu_ioctl_run() at arch/x86/kvm/x86.c:11919. The shared kvm_run page (allocated at virt/kvm/kvm_main.c:4198) serves as the communication channel between kernel and userspace. vcpu_run() at line 11662 enters the main loop.',
    ['kvm_arch_vcpu_ioctl_run'],
    state,
  ));

  // Frame 1: Enter guest
  state.currentFunction = 'vcpu_enter_guest';
  state.phase = 'vm-entry';
  state.srcRef = 'arch/x86/kvm/x86.c:11079 vcpu_enter_guest()';
  frames.push(makeFrame(
    1,
    'Enter guest via vcpu_enter_guest()',
    'vcpu_enter_guest() at arch/x86/kvm/x86.c:11079 prepares the vCPU for VMX non-root operation. After processing requests and injecting events, it calls kvm_x86_call(vcpu_run) at line 11393 which dispatches to vmx_vcpu_run() at arch/x86/kvm/vmx/vmx.c:7605. The CPU executes VMLAUNCH/VMRESUME to enter guest mode.',
    ['vcpu_enter_guest'],
    state,
  ));

  // Frame 2: Guest executes I/O instruction
  state.currentFunction = '__vmx_vcpu_run';
  state.mode = 'guest';
  state.phase = 'guest-running';
  state.srcRef = 'arch/x86/kvm/vmx/vmenter.S:79 __vmx_vcpu_run()';
  state.registers = { 'RDX': '0x3f8', 'RAX': '0x41' };
  frames.push(makeFrame(
    2,
    'Guest executes OUT instruction',
    'The guest is running in VMX non-root mode via __vmx_vcpu_run() at arch/x86/kvm/vmx/vmenter.S:79. The guest executes an I/O instruction (e.g., OUT 0x3f8, AL to write to the serial port). Because the I/O bitmap in the VMCS is configured to trap port 0x3f8, the CPU triggers a VM exit.',
    ['guest_io'],
    state,
  ));

  // Frame 3: VM exit with EXIT_REASON_IO_INSTRUCTION
  state.currentFunction = 'vmx_vcpu_enter_exit';
  state.mode = 'host-kernel';
  state.phase = 'vm-exit';
  state.exitReason = 'EXIT_REASON_IO_INSTRUCTION';
  state.srcRef = 'arch/x86/kvm/vmx/vmx.c:7595 vmcs_read32(VM_EXIT_REASON)';
  state.vmcsFields = { 'VM_EXIT_REASON': '30 (IO_INSTRUCTION)', 'EXIT_QUALIFICATION': 'port=0x3f8, size=1, out' };
  frames.push(makeFrame(
    3,
    'VM exit: EXIT_REASON_IO_INSTRUCTION',
    'The CPU performs a VM exit, saving guest state to the VMCS. Back in vmx_vcpu_enter_exit() at arch/x86/kvm/vmx/vmx.c:7566, the exit reason is read at line 7595 via vmcs_read32(VM_EXIT_REASON). The exit reason is 30 (EXIT_REASON_IO_INSTRUCTION). The exit qualification encodes the port number, size, and direction.',
    ['VM_EXIT', 'EXIT_REASON_IO_INSTRUCTION'],
    state,
  ));

  // Frame 4: vmx_handle_exit dispatches to handle_io
  state.currentFunction = '__vmx_handle_exit';
  state.phase = 'exit-handling';
  state.srcRef = 'arch/x86/kvm/vmx/vmx.c:6781 __vmx_handle_exit()';
  frames.push(makeFrame(
    4,
    'Dispatch to handle_io()',
    'vmx_handle_exit() at arch/x86/kvm/vmx/vmx.c:6937 calls __vmx_handle_exit() at line 6781. The kvm_vmx_exit_handlers[] table at line 6407 maps EXIT_REASON_IO_INSTRUCTION to handle_io(). The exit handler index selects the correct function from the dispatch table.',
    ['__vmx_handle_exit', 'handle_io'],
    state,
  ));

  // Frame 5: handle_io processes the exit
  state.currentFunction = 'handle_io';
  state.srcRef = 'arch/x86/kvm/vmx/vmx.c:5654 handle_io()';
  frames.push(makeFrame(
    5,
    'handle_io() processes I/O exit',
    'handle_io() at arch/x86/kvm/vmx/vmx.c:5654 reads the exit qualification at line 5660 via vmx_get_exit_qual(). It extracts the port number (line 5668), size (line 5669), direction (line 5670), and string flag (line 5661). For string I/O, it calls kvm_emulate_instruction() at line 5666. For non-string I/O, it calls kvm_fast_pio() at line 5672 with the port, size, and direction.',
    ['handle_io'],
    state,
  ));

  // Frame 6: kvm_fast_pio or emulation
  state.currentFunction = 'kvm_fast_pio';
  state.srcRef = 'arch/x86/kvm/x86.c:9734 kvm_fast_pio()';
  frames.push(makeFrame(
    6,
    'Fast PIO path',
    'kvm_fast_pio() at arch/x86/kvm/x86.c:9734 attempts to handle the I/O in-kernel via kvm_fast_pio_out() (line 9741) or kvm_fast_pio_in() (line 9739). If the port is handled by an in-kernel device (e.g., PIT, PIC, IOAPIC), the I/O completes without returning to userspace. If not, it sets up vcpu->run->io with the port info and returns 0, signaling an exit to userspace.',
    ['kvm_fast_pio'],
    state,
  ));

  // Frame 7: Exit to userspace
  state.currentFunction = 'kvm_arch_vcpu_ioctl_run';
  state.phase = 'return-userspace';
  state.mode = 'host-user';
  state.srcRef = 'arch/x86/kvm/x86.c:11919 kvm_arch_vcpu_ioctl_run()';
  state.registers = {};
  frames.push(makeFrame(
    7,
    'Return to QEMU for device emulation',
    'When the I/O targets a userspace-emulated device (serial port, virtio), the handler returns 0, breaking the vcpu_run() loop at arch/x86/kvm/x86.c:11682. kvm_arch_vcpu_ioctl_run() returns to kvm_vcpu_ioctl() at virt/kvm/kvm_main.c:4412, which returns to userspace. vcpu->run->exit_reason is KVM_EXIT_IO, and the kvm_run struct contains port, size, direction, and data.',
    ['return_userspace'],
    state,
  ));

  // Frame 8: QEMU handles I/O
  state.currentFunction = 'qemu_device_emulation';
  state.mode = 'host-user';
  state.srcRef = 'virt/kvm/kvm_main.c:4198 vcpu->run (shared page)';
  frames.push(makeFrame(
    8,
    'QEMU emulates device I/O',
    'QEMU reads vcpu->run->io.port, size, direction, and data_offset from the shared kvm_run page (allocated at virt/kvm/kvm_main.c:4198 via alloc_page()). It dispatches to the appropriate virtual device model (e.g., serial UART 16550). After completing emulation, QEMU calls ioctl(KVM_RUN) again to re-enter the guest, continuing the cycle.',
    ['qemu_emulation'],
    state,
  ));

  return frames;
}

function generateVcpuCreationFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: KvmState = {
    mode: 'host-user',
    currentFunction: 'kvm_dev_ioctl',
    vmcsFields: {},
    exitReason: null,
    phase: 'vcpu-create',
    registers: {},
    srcRef: 'virt/kvm/kvm_main.c:5522 kvm_dev_ioctl()',
  };

  // Frame 0: open /dev/kvm
  frames.push(makeFrame(
    0,
    'Open /dev/kvm',
    'Userspace opens /dev/kvm which is registered with misc_register(). The file operations are defined at virt/kvm/kvm_main.c:5565 as kvm_chardev_ops with .unlocked_ioctl = kvm_dev_ioctl. This gives userspace a file descriptor to the KVM subsystem for creating VMs.',
    ['kvm_dev_ioctl'],
    state,
  ));

  // Frame 1: KVM_CREATE_VM
  state.currentFunction = 'kvm_dev_ioctl_create_vm';
  state.mode = 'host-kernel';
  state.srcRef = 'virt/kvm/kvm_main.c:5486 kvm_dev_ioctl_create_vm()';
  frames.push(makeFrame(
    1,
    'ioctl(KVM_CREATE_VM)',
    'kvm_dev_ioctl() at virt/kvm/kvm_main.c:5529 handles KVM_CREATE_VM at line 5541 by calling kvm_dev_ioctl_create_vm(). At line 5493, it gets an unused fd via get_unused_fd_flags(O_CLOEXEC). It then calls kvm_create_vm() at line 5499 to allocate and initialize the VM structure.',
    ['kvm_dev_ioctl_create_vm'],
    state,
  ));

  // Frame 2: kvm_create_vm
  state.currentFunction = 'kvm_create_vm';
  state.srcRef = 'virt/kvm/kvm_main.c:1105 kvm_create_vm()';
  frames.push(makeFrame(
    2,
    'Allocate and initialize VM',
    'kvm_create_vm() at virt/kvm/kvm_main.c:1105 allocates the kvm struct via kvm_arch_alloc_vm() at line 1107. It initializes the MMU lock at line 1114, grabs a reference to current->mm at line 1115-1116, initializes mutexes (lock, irq_lock, slots_lock) at lines 1118-1121, sets up the vCPU xarray at line 1124, and sets max_vcpus at line 1133.',
    ['kvm_create_vm'],
    state,
  ));

  // Frame 3: Return VM fd
  state.currentFunction = 'kvm_dev_ioctl_create_vm';
  state.srcRef = 'virt/kvm/kvm_main.c:5505 anon_inode_getfile()';
  frames.push(makeFrame(
    3,
    'Create anonymous inode for VM',
    'Back in kvm_dev_ioctl_create_vm(), anon_inode_getfile("kvm-vm", &kvm_vm_fops, kvm, O_RDWR) at virt/kvm/kvm_main.c:5505 creates an anonymous inode backed by kvm_vm_fops (defined at line 5475 with .unlocked_ioctl = kvm_vm_ioctl). fd_install() at line 5519 installs the file into the fd table. The fd is returned to userspace.',
    ['anon_inode'],
    state,
  ));

  // Frame 4: KVM_CREATE_VCPU ioctl
  state.currentFunction = 'kvm_vm_ioctl';
  state.srcRef = 'virt/kvm/kvm_main.c:5154 kvm_vm_ioctl()';
  frames.push(makeFrame(
    4,
    'ioctl(KVM_CREATE_VCPU)',
    'Userspace calls ioctl(vm_fd, KVM_CREATE_VCPU, vcpu_id). kvm_vm_ioctl() at virt/kvm/kvm_main.c:5154 dispatches KVM_CREATE_VCPU at line 5165 to kvm_vm_ioctl_create_vcpu(kvm, arg). This begins the per-vCPU setup.',
    ['kvm_vm_ioctl'],
    state,
  ));

  // Frame 5: kvm_vm_ioctl_create_vcpu
  state.currentFunction = 'kvm_vm_ioctl_create_vcpu';
  state.srcRef = 'virt/kvm/kvm_main.c:4158 kvm_vm_ioctl_create_vcpu()';
  frames.push(makeFrame(
    5,
    'Create vCPU structure',
    'kvm_vm_ioctl_create_vcpu() at virt/kvm/kvm_main.c:4158 validates the vCPU ID (line 4173), acquires kvm->lock (line 4176), checks max_vcpus (line 4177). It allocates the vcpu struct from kvm_vcpu_cache at line 4191 via kmem_cache_zalloc(), allocates the shared kvm_run page at line 4198, calls kvm_vcpu_init() at line 4205, then kvm_arch_vcpu_create() at line 4207.',
    ['kvm_vm_ioctl_create_vcpu'],
    state,
  ));

  // Frame 6: kvm_arch_vcpu_create (x86)
  state.currentFunction = 'kvm_arch_vcpu_create';
  state.srcRef = 'arch/x86/kvm/x86.c:12736 kvm_arch_vcpu_create()';
  frames.push(makeFrame(
    6,
    'Arch-specific vCPU creation',
    'kvm_arch_vcpu_create() at arch/x86/kvm/x86.c:12736 initializes x86-specific vCPU state: the emulator, APIC, MMU, and PMU. It calls kvm_x86_call(vcpu_create) which dispatches to vmx_vcpu_create() for Intel VMX hardware. This is where the VMCS (Virtual Machine Control Structure) is allocated.',
    ['kvm_arch_vcpu_create'],
    state,
  ));

  // Frame 7: vmx_vcpu_create
  state.currentFunction = 'vmx_vcpu_create';
  state.srcRef = 'arch/x86/kvm/vmx/vmx.c:7770 vmx_vcpu_create()';
  state.vmcsFields = { 'VMCS_allocated': 'true' };
  frames.push(makeFrame(
    7,
    'VMX-specific vCPU creation',
    'vmx_vcpu_create() at arch/x86/kvm/vmx/vmx.c:7770 initializes VMX-specific state. It allocates a VPID at line 7783 via allocate_vpid(). If PML is enabled, it allocates a PML page at line 7792. alloc_loaded_vmcs(&vmx->vmcs01) at line 7810 allocates the 4KB VMCS region that the CPU uses for VM entry/exit state. The loaded_vmcs is set at line 7827.',
    ['vmx_vcpu_create', 'VMCS'],
    state,
  ));

  // Frame 8: Install vCPU fd
  state.currentFunction = 'kvm_vm_ioctl_create_vcpu';
  state.srcRef = 'virt/kvm/kvm_main.c:4226 xa_insert()';
  state.vmcsFields = { 'VMCS_allocated': 'true', 'VPID': 'assigned' };
  frames.push(makeFrame(
    8,
    'Register vCPU and return fd',
    'Back in kvm_vm_ioctl_create_vcpu() at virt/kvm/kvm_main.c:4158, the vCPU is inserted into kvm->vcpu_array via xa_insert() at line 4226. The online_vcpus count is incremented. An anonymous inode file is created with kvm_vcpu_fops (.unlocked_ioctl = kvm_vcpu_ioctl at line 4107). The vCPU fd is returned to userspace, ready for KVM_RUN.',
    ['vcpu_fd_install'],
    state,
  ));

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'vm-entry-exit-cycle', label: 'Complete VM Entry/Exit Cycle' },
  { id: 'io-exit-handling', label: 'I/O Exit Handling (Port I/O)' },
  { id: 'vcpu-creation', label: 'VM and vCPU Creation' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as KvmState;
  const margin = { top: 24, right: 16, bottom: 16, left: 16 };
  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  // Title
  const titleEl = document.createElementNS(NS, 'text');
  titleEl.setAttribute('x', String(width / 2));
  titleEl.setAttribute('y', '16');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('class', 'anim-title');
  titleEl.textContent = 'KVM Entry/Exit Cycle';
  container.appendChild(titleEl);

  // Mode indicator
  const modeColors: Record<string, string> = {
    'host-kernel': '#4a9eff',
    'host-user': '#ff9f43',
    'guest': '#2ed573',
  };
  const modeLabels: Record<string, string> = {
    'host-kernel': 'host-kernel (VMX root)',
    'host-user': 'host-user (QEMU)',
    'guest': 'guest (VMX non-root)',
  };

  const modeRect = document.createElementNS(NS, 'rect');
  modeRect.setAttribute('x', String(margin.left));
  modeRect.setAttribute('y', String(margin.top));
  modeRect.setAttribute('width', String(usableWidth));
  modeRect.setAttribute('height', '24');
  modeRect.setAttribute('rx', '4');
  modeRect.setAttribute('fill', modeColors[data.mode] || '#666');
  modeRect.setAttribute('opacity', '0.3');
  modeRect.setAttribute('class', 'anim-phase anim-phase-active');
  container.appendChild(modeRect);

  const modeText = document.createElementNS(NS, 'text');
  modeText.setAttribute('x', String(width / 2));
  modeText.setAttribute('y', String(margin.top + 16));
  modeText.setAttribute('text-anchor', 'middle');
  modeText.setAttribute('class', 'anim-function');
  modeText.textContent = modeLabels[data.mode] || data.mode;
  container.appendChild(modeText);

  // Phase boxes representing the call stack
  const phases = [
    { id: data.currentFunction, label: `${data.currentFunction}()`, srcRef: data.srcRef },
  ];
  if (data.exitReason) {
    phases.push({ id: data.exitReason, label: `Exit: ${data.exitReason}`, srcRef: '' });
  }

  const phaseStartY = margin.top + 36;
  const boxHeight = 28;
  const boxWidth = Math.min(usableWidth * 0.7, 300);
  const boxX = margin.left + (usableWidth - boxWidth) / 2;

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const y = phaseStartY + i * (boxHeight + 8);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(boxX));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxWidth));
    rect.setAttribute('height', String(boxHeight));
    rect.setAttribute('rx', '4');
    let cls = 'anim-phase anim-phase-active';
    if (frame.highlights.includes(p.id)) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(boxX + boxWidth / 2));
    label.setAttribute('y', String(y + boxHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-function');
    label.textContent = p.label;
    container.appendChild(label);

    if (p.srcRef) {
      const srcLabel = document.createElementNS(NS, 'text');
      srcLabel.setAttribute('x', String(boxX + boxWidth + 8));
      srcLabel.setAttribute('y', String(y + boxHeight / 2 + 4));
      srcLabel.setAttribute('class', 'anim-srcref');
      srcLabel.textContent = p.srcRef;
      container.appendChild(srcLabel);
    }
  }

  // VMCS fields if any
  const vmcsKeys = Object.keys(data.vmcsFields);
  if (vmcsKeys.length > 0) {
    const vmcsY = phaseStartY + phases.length * (boxHeight + 8) + 12;
    const vmcsTitle = document.createElementNS(NS, 'text');
    vmcsTitle.setAttribute('x', String(margin.left));
    vmcsTitle.setAttribute('y', String(vmcsY));
    vmcsTitle.setAttribute('class', 'anim-function');
    vmcsTitle.textContent = 'VMCS Fields:';
    container.appendChild(vmcsTitle);

    for (let i = 0; i < vmcsKeys.length; i++) {
      const fieldText = document.createElementNS(NS, 'text');
      fieldText.setAttribute('x', String(margin.left + 8));
      fieldText.setAttribute('y', String(vmcsY + 16 + i * 14));
      fieldText.setAttribute('class', 'anim-srcref');
      fieldText.textContent = `${vmcsKeys[i]}: ${data.vmcsFields[vmcsKeys[i]]}`;
      container.appendChild(fieldText);
    }
  }

  // Phase indicator
  const phaseY = usableHeight + margin.top - 4;
  const phaseLabel = document.createElementNS(NS, 'text');
  phaseLabel.setAttribute('x', String(margin.left));
  phaseLabel.setAttribute('y', String(Math.min(phaseY, height - margin.bottom)));
  phaseLabel.setAttribute('class', 'anim-function');
  phaseLabel.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseLabel);
}

const kvmEntryExit: AnimationModule = {
  config: {
    id: 'kvm-entry-exit',
    title: 'KVM VM Entry/Exit Cycle',
    skillName: 'kvm-fundamentals',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'io-exit-handling':
        return generateIoExitHandlingFrames();
      case 'vcpu-creation':
        return generateVcpuCreationFrames();
      case 'vm-entry-exit-cycle':
      default:
        return generateVmEntryExitCycleFrames();
    }
  },

  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default kvmEntryExit;
