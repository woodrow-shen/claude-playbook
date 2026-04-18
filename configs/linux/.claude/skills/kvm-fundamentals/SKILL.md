---
name: kvm-fundamentals
description: Understand KVM architecture, VMCS, and the VM entry/exit cycle
realm: virtualization
category: kvm
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - system-calls
  - interrupt-handling
unlocks:
  - kvm-memory-virtualization
  - virtio-framework
kernel_files:
  - virt/kvm/kvm_main.c
  - arch/x86/kvm/vmx/vmx.c
  - arch/x86/kvm/x86.c
  - include/linux/kvm_host.h
doc_files:
  - Documentation/virt/kvm/api.rst
badge: VM Lord
tags:
  - kvm
  - vmx
  - vmcs
  - vm-entry
---

# KVM Fundamentals

## Quest Briefing

KVM (Kernel-based Virtual Machine) turns Linux itself into a hypervisor.
Rather than running a separate hypervisor layer beneath the OS, KVM extends
the Linux kernel with virtualization capabilities using hardware support
(Intel VT-x / AMD-V). Each virtual machine is a regular Linux process,
and each virtual CPU is a thread. The kernel scheduler, memory management,
and I/O stack are all reused -- KVM adds only the hardware virtualization
control.

The core abstraction is the VM entry/exit cycle: KVM loads guest state
into hardware (VMCS on Intel), executes VMLAUNCH/VMRESUME to enter the
guest, the guest runs at native speed until a sensitive operation causes
a VM exit, KVM handles the exit in the kernel, and the cycle repeats.
Understanding this loop is understanding KVM.


## Learning Objectives

- Explain the KVM architecture: /dev/kvm, VM fds, vCPU fds.
- Trace the KVM_CREATE_VM and KVM_CREATE_VCPU ioctl paths.
- Describe the VMCS (Virtual Machine Control Structure) and its fields.
- Follow the VM entry/exit cycle through vmx_vcpu_run().
- Understand exit handling for I/O, MMIO, and interrupts.


## Core Concepts

### KVM's ioctl Interface

KVM exposes /dev/kvm as a character device. The interface uses a hierarchy
of file descriptors:

1. /dev/kvm fd: system-level operations (KVM_GET_API_VERSION,
   KVM_CREATE_VM)
2. VM fd: per-VM operations (KVM_CREATE_VCPU, KVM_SET_USER_MEMORY_REGION)
3. vCPU fd: per-CPU operations (KVM_RUN, KVM_GET_REGS, KVM_SET_REGS)

kvm_dev_ioctl_create_vm() at virt/kvm/kvm_main.c:5486 creates a new
struct kvm. kvm_vm_ioctl_create_vcpu() at kvm_main.c:4158 creates a
new struct kvm_vcpu and its associated VMCS.

### The VMCS (Intel VT-x)

The VMCS is a hardware data structure that controls VM entry and exit
behavior. It contains:
- Guest state area: registers, segment descriptors, CR0/CR3/CR4
- Host state area: registers to restore on VM exit
- VM-execution controls: what causes a VM exit (I/O, MSR access, etc.)
- VM-exit controls: how to handle the transition back to host
- VM-entry controls: how to enter the guest

vmx_vcpu_create() at arch/x86/kvm/vmx/vmx.c:7770 allocates and
initializes the VMCS. vmcs_write*() functions write individual fields.

### The VM Entry/Exit Cycle

The KVM_RUN ioctl is handled by kvm_vcpu_ioctl() at kvm_main.c:4412,
which calls kvm_arch_vcpu_ioctl_run() in arch/x86/kvm/x86.c. This
enters the main loop:

1. vcpu_load() loads the vCPU state onto the physical CPU.
2. vcpu_enter_guest() prepares for VM entry: injects pending interrupts,
   checks for pending signals, loads the VMCS.
3. vmx_vcpu_enter_exit() executes the VMLAUNCH/VMRESUME instruction.
4. The CPU enters VMX non-root mode (guest mode) and executes guest code
   at native speed.
5. A sensitive operation triggers a VM exit (VMEXIT). The CPU saves guest
   state to VMCS and resumes host execution.
6. vmx_handle_exit() reads the exit reason from VMCS and dispatches to
   the appropriate handler.
7. If the exit can be handled in the kernel, loop back to step 2.
   If userspace assistance is needed (e.g., MMIO to an emulated device),
   return to the KVM_RUN caller.

### Common VM Exit Reasons

- EPT_VIOLATION: guest accessed unmapped memory (handled by KVM MMU)
- IO_INSTRUCTION: guest executed IN/OUT (forwarded to userspace QEMU)
- MSR_WRITE/READ: guest accessed a model-specific register
- EXTERNAL_INTERRUPT: host interrupt preempts the guest
- HLT: guest executed HLT instruction
- CPUID: guest executed CPUID


## Code Walkthrough

Trace creating and running a minimal VM:

1. **open("/dev/kvm")** -- Returns the KVM system fd.

2. **ioctl(KVM_CREATE_VM)** -- kvm_dev_ioctl_create_vm() at
   kvm_main.c:5486 allocates struct kvm, initializes the MMU,
   I/O bus, and IRQ routing. Returns a VM fd.

3. **ioctl(KVM_SET_USER_MEMORY_REGION)** -- Maps a host memory region
   as guest physical memory. kvm_vm_ioctl_set_memory_region() creates
   a struct kvm_memory_slot.

4. **ioctl(KVM_CREATE_VCPU)** -- kvm_vm_ioctl_create_vcpu() at
   kvm_main.c:4158 allocates struct kvm_vcpu, calls
   vmx_vcpu_create() to allocate the VMCS, initializes guest registers.

5. **ioctl(KVM_SET_REGS)** -- Sets guest register state (RIP, RSP, etc.)
   into the vCPU structure.

6. **ioctl(KVM_RUN)** -- kvm_vcpu_ioctl() at kvm_main.c:4412 enters
   the run loop. vcpu_enter_guest() loads VMCS and executes VMLAUNCH.
   Guest code runs. On VM exit, the exit reason is read and handled.
   If the handler returns 1, re-enter. If 0, return to userspace with
   exit info in the shared kvm_run page.


## Hands-On Challenges

### Challenge 1: KVM API Exploration (50 XP)

Read virt/kvm/kvm_main.c and answer:
1. Find kvm_dev_ioctl_create_vm() and list what it initializes.
2. Find kvm_vm_ioctl_create_vcpu() and trace how the VMCS is allocated.
3. What is the kvm_run shared memory page and what information does it
   contain?

Verification: Map the ioctl flow with exact function names and line numbers.

### Challenge 2: VMCS Fields (75 XP)

Read arch/x86/kvm/vmx/vmx.c and:
1. Find vmx_vcpu_create() and list the VMCS fields it writes.
2. What VM-execution controls are set by default?
3. How does KVM configure which guest operations cause VM exits?

Verification: List at least 10 VMCS fields with their purpose.

### Challenge 3: Exit Handler Trace (75 XP)

Read the VM exit handling code and:
1. Find where the exit reason is read after a VMEXIT.
2. Trace an I/O exit (guest executes OUT instruction).
3. How does the exit info get communicated back to userspace QEMU?

Verification: Trace the complete I/O exit path with function names.


## Verification Criteria

- [ ] Explain the KVM fd hierarchy: /dev/kvm -> VM fd -> vCPU fd.
- [ ] Trace KVM_CREATE_VM through kvm_dev_ioctl_create_vm() at
      kvm_main.c:5486.
- [ ] Describe the VMCS structure and its four areas.
- [ ] Follow the VM entry/exit cycle: KVM_RUN -> VMLAUNCH -> VMEXIT ->
      exit handler -> re-enter or return to userspace.
- [ ] List at least 5 common VM exit reasons and their handlers.
- [ ] Explain how KVM injects interrupts into the guest via VMCS.
- [ ] Describe the kvm_run shared page protocol between kernel and QEMU.
