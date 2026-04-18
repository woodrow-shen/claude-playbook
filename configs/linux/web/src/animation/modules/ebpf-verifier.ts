import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface EbpfVerifierState {
  phase: 'load' | 'verify-init' | 'cfg-check' | 'check-common' | 'insn-walk' | 'mem-check' | 'helper-check' | 'state-prune' | 'jit-select' | 'jit' | 'jit-emit' | 'jit-finalize' | 'attach' | 'execution' | 'exec-insn' | 'complete';
  currentInsn: number;
  totalInsns: number;
  registers?: Record<string, string>;
  srcRef: string;
  /** v7.0 KF_TRUSTED_ARGS scenario: whether the kfunc argument is a trusted pointer */
  kfuncTrusted?: boolean;
  /** v7.0 KF_TRUSTED_ARGS scenario: verifier's acceptance decision for the current kfunc call */
  verifierResult?: 'accept' | 'reject';
  /** v7.0 KF_TRUSTED_ARGS scenario: BTF parameter annotation suffix being modeled */
  btfAnnotation?: 'default' | 'nullable' | 'ign';
  /** v7.0 KF_TRUSTED_ARGS scenario: whether the BPF program is currently inside a bpf_rcu_read_lock critical section */
  rcuSection?: boolean;
  /** v7.0 KF_TRUSTED_ARGS scenario: running verifier log as emitted by verbose() -- one entry per frame that appends a diagnostic */
  verifierLog?: string[];
  /** v7.0 KF_TRUSTED_ARGS scenario: three-state verdict for distinct accept/reject visual rendering */
  verdict?: 'pending' | 'accepted' | 'rejected';
}

function cloneState(state: EbpfVerifierState): EbpfVerifierState {
  return {
    ...state,
    registers: state.registers ? { ...state.registers } : undefined,
    verifierLog: state.verifierLog ? [...state.verifierLog] : undefined,
  };
}

function generateVerifierWalkFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: EbpfVerifierState = {
    phase: 'load',
    currentInsn: -1,
    totalInsns: 12,
    srcRef: 'kernel/bpf/syscall.c:6210',
  };

  // Frame 0: __sys_bpf entry
  frames.push({
    step: 0,
    label: '__sys_bpf() receives BPF_PROG_LOAD command',
    description: `__sys_bpf() (kernel/bpf/syscall.c:6210) is the main BPF syscall handler. It copies the bpf_attr from userspace, calls security_bpf() (kernel/bpf/syscall.c:6225), then dispatches on cmd. For BPF_PROG_LOAD (kernel/bpf/syscall.c:6248), it calls bpf_prog_load() (kernel/bpf/syscall.c:2871) which allocates a struct bpf_prog and copies the BPF instructions from userspace.`,
    highlights: ['sys-bpf'],
    data: cloneState(state),
  });

  // Frame 1: bpf_prog_load calls bpf_check
  state.phase = 'verify-init';
  state.srcRef = 'kernel/bpf/syscall.c:3089';
  frames.push({
    step: 1,
    label: 'bpf_prog_load() calls bpf_check() to verify the program',
    description: `bpf_prog_load() (kernel/bpf/syscall.c:2871) validates the program type, license, and flags. It allocates a bpf_prog via bpf_prog_alloc(), copies instructions from userspace, then calls bpf_check(&prog, attr, uattr, uattr_size) (kernel/bpf/syscall.c:3089). bpf_check() (kernel/bpf/verifier.c:25954) allocates a bpf_verifier_env, initializes insn_aux_data for each instruction, and begins verification.`,
    highlights: ['bpf-check'],
    data: cloneState(state),
  });

  // Frame 2: check_cfg validates control flow
  state.phase = 'cfg-check';
  state.srcRef = 'kernel/bpf/verifier.c:18953';
  frames.push({
    step: 2,
    label: 'check_cfg() validates control flow graph is a DAG',
    description: `check_cfg() (kernel/bpf/verifier.c:18953) performs a depth-first search of the instruction graph using insn_state[] and insn_stack[] arrays. Starting from instruction 0, it calls push_insn() (kernel/bpf/verifier.c:18248) for each successor (fallthrough and branch targets). push_insn() marks instructions as DISCOVERED and checks for back-edges (loops are forbidden in BPF). If a back-edge is found, it returns -EINVAL. It also verifies all instructions are reachable and no jumps go out of range.`,
    highlights: ['cfg-check'],
    data: cloneState(state),
  });

  // Frame 3: do_check_common initializes verifier state
  state.phase = 'check-common';
  state.srcRef = 'kernel/bpf/verifier.c:24572';
  frames.push({
    step: 3,
    label: 'do_check_common() initializes verifier state for main subprog',
    description: `do_check_common() (kernel/bpf/verifier.c:24572) is called for the main program (subprog 0) at kernel/bpf/verifier.c:24777. It allocates a bpf_verifier_state with state->branches = 1 and state->frame[0] as the initial stack frame. init_func_state() sets up the register state: r1 = PTR_TO_CTX (the BPF program context), r10 = PTR_TO_STACK (frame pointer). All other registers are NOT_INIT. Then it calls do_check() (kernel/bpf/verifier.c:21244) to walk instructions.`,
    highlights: ['do-check-common'],
    data: cloneState(state),
  });

  // Frame 4: do_check walks instructions
  state.phase = 'insn-walk';
  state.currentInsn = 0;
  state.srcRef = 'kernel/bpf/verifier.c:21244';
  frames.push({
    step: 4,
    label: 'do_check() begins walking instructions one by one',
    description: `do_check() (kernel/bpf/verifier.c:21244) enters an infinite loop (kernel/bpf/verifier.c:21253). For each instruction, it checks env->insn_processed against BPF_COMPLEXITY_LIMIT_INSNS (kernel/bpf/verifier.c:21271). At prune points, it calls is_state_visited() (kernel/bpf/verifier.c:20476) to check if the current register+stack state has been seen before. If so, this path is pruned. Otherwise, it decodes the instruction class (ALU, JMP, LD, ST, etc.) and validates it.`,
    highlights: ['insn-walk'],
    data: cloneState(state),
  });

  // Frame 5: check_mem_access for load/store
  state.phase = 'mem-check';
  state.currentInsn = 3;
  state.srcRef = 'kernel/bpf/verifier.c:7702';
  frames.push({
    step: 5,
    label: 'check_mem_access() validates memory load/store operations',
    description: `When do_check() encounters a BPF_LDX (load) instruction, it calls check_mem_access() (kernel/bpf/verifier.c:7702) with the source register, offset, and size. check_mem_access() determines the memory region type (stack, map value, packet data, ctx) from the register state, then calls __check_mem_access() (kernel/bpf/verifier.c:5854) to verify the offset is within bounds. For ctx access, it calls check_ctx_access() which verifies the offset against the program type's context layout. Out-of-bounds access returns -EACCES.`,
    highlights: ['mem-check'],
    data: cloneState(state),
  });

  // Frame 6: check_helper_call for BPF helper invocations
  state.phase = 'helper-check';
  state.currentInsn = 6;
  state.srcRef = 'kernel/bpf/verifier.c:11640';
  frames.push({
    step: 6,
    label: 'check_helper_call() validates BPF helper function calls',
    description: `When do_check() encounters BPF_CALL at instruction 6, it calls check_helper_call() (kernel/bpf/verifier.c:11640) invoked at kernel/bpf/verifier.c:21171. This looks up the helper function by imm field, verifies the program type is allowed to call this helper, and checks each argument register against the helper's expected types (e.g., ARG_PTR_TO_MAP_KEY requires a valid map pointer). After validation, the return type is propagated to r0's register state.`,
    highlights: ['helper-check'],
    data: cloneState(state),
  });

  // Frame 7: is_state_visited for state pruning
  state.phase = 'state-prune';
  state.currentInsn = 8;
  state.srcRef = 'kernel/bpf/verifier.c:20476';
  frames.push({
    step: 7,
    label: 'is_state_visited() prunes equivalent verifier states',
    description: `At prune points (branch targets, call sites), do_check() calls is_state_visited() (kernel/bpf/verifier.c:20476) at kernel/bpf/verifier.c:21282. It compares the current register and stack state against previously recorded states for this instruction index. If the current state is a subset of a cached state (all registers are "less or equal" in precision), the path is pruned -- the verifier already proved safety for a more general state. This prevents exponential explosion from branches.`,
    highlights: ['state-prune'],
    data: cloneState(state),
  });

  // Frame 8: Verification complete
  state.phase = 'complete';
  state.currentInsn = 11;
  state.srcRef = 'kernel/bpf/verifier.c:25954';
  frames.push({
    step: 8,
    label: 'bpf_check() verification complete -- program is safe',
    description: `After do_check() returns 0, bpf_check() (kernel/bpf/verifier.c:25954) performs post-verification fixups: resolving helper function calls to actual kernel addresses, converting map fd references to map pointers, and optimizing dead code. The verified program is now guaranteed: no out-of-bounds memory access, no uninitialized register use, no infinite loops, and all helper calls have valid arguments. Control returns to bpf_prog_load() (kernel/bpf/syscall.c:3089).`,
    highlights: ['verify-complete'],
    data: cloneState(state),
  });

  return frames;
}

function generateJitCompilationFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const state: EbpfVerifierState = {
    phase: 'load',
    currentInsn: -1,
    totalInsns: 12,
    srcRef: 'kernel/bpf/syscall.c:3093',
  };

  // Frame 0: bpf_prog_select_runtime entry
  frames.push({
    step: 0,
    label: 'bpf_prog_select_runtime() selects JIT or interpreter',
    description: `After bpf_check() verifies the program, bpf_prog_load() calls bpf_prog_select_runtime() (kernel/bpf/core.c:2546) at kernel/bpf/syscall.c:3093. This function decides whether to JIT-compile the program or fall back to the interpreter. If CONFIG_BPF_JIT_ALWAYS_ON is set or the program uses kfuncs, JIT is required (kernel/bpf/core.c:2556).`,
    highlights: ['select-runtime'],
    data: cloneState(state),
  });

  // Frame 1: Interpreter fallback setup
  state.phase = 'jit-select';
  state.srcRef = 'kernel/bpf/core.c:2560';
  frames.push({
    step: 1,
    label: 'bpf_prog_select_interpreter() sets interpreter as default',
    description: `bpf_prog_select_runtime() first calls bpf_prog_select_interpreter() (kernel/bpf/core.c:2560) to set prog->bpf_func to ___bpf_prog_run as the default execution path. If JIT compilation fails later, the program falls back to this interpreter. The function returns false if CFI (Control Flow Integrity) is enabled and the interpreter is disabled, in which case JIT becomes mandatory.`,
    highlights: ['interpreter-setup'],
    data: cloneState(state),
  });

  // Frame 2: Enter bpf_int_jit_compile
  state.phase = 'jit';
  state.srcRef = 'arch/x86/net/bpf_jit_comp.c:3716';
  frames.push({
    step: 2,
    label: 'bpf_int_jit_compile() begins x86-64 JIT compilation',
    description: `bpf_prog_select_runtime() calls bpf_int_jit_compile(fp) (kernel/bpf/core.c:2574). On x86-64, this is arch/x86/net/bpf_jit_comp.c:3716. It first checks prog->jit_requested. If not set, it returns the original program. Otherwise, it calls bpf_jit_blind_constants() (arch/x86/net/bpf_jit_comp.c:3738) to randomize immediate values as a JIT spraying mitigation -- each constant is replaced with XOR of two random values.`,
    highlights: ['jit-compile'],
    data: cloneState(state),
  });

  // Frame 3: Constant blinding
  state.srcRef = 'arch/x86/net/bpf_jit_comp.c:3738';
  frames.push({
    step: 3,
    label: 'bpf_jit_blind_constants() mitigates JIT spraying attacks',
    description: `bpf_jit_blind_constants() (arch/x86/net/bpf_jit_comp.c:3738) rewrites each BPF instruction that uses an immediate constant. For example, BPF_MOV64_IMM(r1, 0xdeadbeef) becomes: BPF_MOV64_IMM(r1, rand1) followed by BPF_XOR64_IMM(r1, rand1 ^ 0xdeadbeef). This prevents attackers from injecting known byte sequences into the JIT output memory. The blinded program replaces the original for compilation.`,
    highlights: ['constant-blind'],
    data: cloneState(state),
  });

  // Frame 4: Multi-pass code generation
  state.phase = 'jit-emit';
  state.srcRef = 'arch/x86/net/bpf_jit_comp.c:3752';
  frames.push({
    step: 4,
    label: 'Multi-pass JIT emits x86-64 machine code',
    description: `bpf_int_jit_compile() allocates jit_data (arch/x86/net/bpf_jit_comp.c:3752) and an addrs[] array mapping BPF insn index to x86 offset. It runs multiple passes: the first pass computes instruction sizes (some x86 encodings vary by offset magnitude), subsequent passes resolve jump offsets. Each BPF instruction maps to 1-N x86 instructions: BPF_ALU64_REG maps to a single x86 MOV/ADD, while BPF_CALL requires saving caller-saved regs and an indirect call.`,
    highlights: ['jit-emit'],
    data: cloneState(state),
  });

  // Frame 5: Allocate executable memory
  state.srcRef = 'arch/x86/net/bpf_jit_comp.c:3716';
  frames.push({
    step: 5,
    label: 'JIT allocates executable memory for native code',
    description: `After computing the final code size, bpf_int_jit_compile() (arch/x86/net/bpf_jit_comp.c:3716) allocates a bpf_binary_header via bpf_jit_binary_pack_alloc(). This returns two pointers: an rw_header for writing (W^X protection: writable but not executable) and a header that will be the final executable mapping. The JIT writes native code into rw_image, then bpf_jit_binary_pack_finalize() copies it to the executable region.`,
    highlights: ['jit-alloc'],
    data: cloneState(state),
  });

  // Frame 6: Final pass and image finalization
  state.phase = 'jit-finalize';
  state.srcRef = 'kernel/bpf/core.c:2574';
  frames.push({
    step: 6,
    label: 'JIT finalizes image and updates prog->bpf_func',
    description: `The final pass writes x86-64 code into rw_image. bpf_int_jit_compile() (arch/x86/net/bpf_jit_comp.c:3716) then finalizes: prog->bpf_func is set to the executable image address (the JIT entry point), prog->jited = 1, and prog->jited_len records the native code size. Back in bpf_prog_select_runtime() (kernel/bpf/core.c:2574), bpf_prog_jit_attempt_done() is called. If JIT failed and jit_needed is true, it returns -ENOTSUPP.`,
    highlights: ['jit-finalize'],
    data: cloneState(state),
  });

  // Frame 7: JIT complete, prog ready
  state.phase = 'complete';
  state.srcRef = 'kernel/bpf/core.c:2546';
  frames.push({
    step: 7,
    label: 'bpf_prog_select_runtime() returns JIT-compiled program',
    description: `bpf_prog_select_runtime() (kernel/bpf/core.c:2546) returns the compiled program. The BPF program is now a native x86-64 function: when invoked, it enters prog->bpf_func directly -- no interpreter overhead. The JIT output is typically 1.2-2x the size of the BPF bytecode. The native code runs at near-native speed with the safety guarantees of the verifier. Control returns to bpf_prog_load() (kernel/bpf/syscall.c:3093) which installs the program fd.`,
    highlights: ['jit-complete'],
    data: cloneState(state),
  });

  // Frame 8: Summary
  frames.push({
    step: 8,
    label: 'JIT compilation pipeline complete',
    description: `The BPF JIT pipeline: bpf_prog_select_runtime() (kernel/bpf/core.c:2546) -> bpf_int_jit_compile() (arch/x86/net/bpf_jit_comp.c:3716). Constant blinding defends against JIT spraying. Multi-pass compilation resolves variable-length x86 encodings. W^X memory protection ensures the JIT image is never simultaneously writable and executable. The result: verified BPF bytecode runs as optimized native code with hardware-level performance.`,
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

function generateProgramExecutionFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  const defaultRegs: Record<string, string> = {
    r0: '0x0', r1: 'ctx', r2: '0x0', r3: '0x0', r4: '0x0',
    r5: '0x0', r6: '0x0', r7: '0x0', r8: '0x0', r9: '0x0', r10: 'fp',
  };

  const state: EbpfVerifierState = {
    phase: 'attach',
    currentInsn: -1,
    totalInsns: 8,
    registers: { ...defaultRegs },
    srcRef: 'kernel/bpf/syscall.c:3093',
  };

  // Frame 0: Program attached to tracepoint
  frames.push({
    step: 0,
    label: 'BPF program attached to kprobe/tracepoint',
    description: `After bpf_prog_load() (kernel/bpf/syscall.c:2871) returns a program fd, userspace calls bpf(BPF_LINK_CREATE) to attach it to a kprobe or tracepoint. The kernel registers the BPF program as a callback via perf_event or tracepoint infrastructure. When the instrumented event fires, the kernel invokes the BPF program's entry point: either the JIT-compiled prog->bpf_func or the interpreter ___bpf_prog_run() (kernel/bpf/core.c:1775).`,
    highlights: ['attach'],
    data: cloneState(state),
  });

  // Frame 1: Event fires, enter ___bpf_prog_run
  state.phase = 'execution';
  state.currentInsn = 0;
  state.srcRef = 'kernel/bpf/core.c:1775';
  frames.push({
    step: 1,
    label: '___bpf_prog_run() begins BPF instruction interpretation',
    description: `When the kprobe fires, the trampoline calls ___bpf_prog_run(regs, insn) (kernel/bpf/core.c:1775). The regs array holds r0-r10 (u64 values), and insn points to the first BPF instruction. The interpreter uses a computed goto jumptable[256] (kernel/bpf/core.c:1779) indexed by insn->code for O(1) dispatch. At select_insn (kernel/bpf/core.c:1802), it executes goto *jumptable[insn->code] to jump to the handler for the current instruction class.`,
    highlights: ['interpreter-entry'],
    data: cloneState(state),
  });

  // Frame 2: First instruction - load from ctx
  state.currentInsn = 0;
  state.srcRef = 'kernel/bpf/core.c:1802';
  state.registers = { ...defaultRegs, r1: 'ctx' };
  frames.push({
    step: 2,
    label: 'BPF_LDX_MEM: r6 = *(u64 *)(r1 + 0) -- load from ctx',
    description: `Instruction 0: BPF_LDX_MEM(BPF_DW, r6, r1, 0). The jumptable dispatches to the LDX_MEM_DW handler. Since r1 = PTR_TO_CTX, this reads the first field of the BPF program context (e.g., struct pt_regs* for kprobes). DST = *(u64 *)(SRC + off). r6 is now a callee-saved register holding the ctx pointer for later use. The interpreter advances: insn++; goto select_insn (CONT macro at kernel/bpf/core.c:1799).`,
    highlights: ['insn-ldx'],
    data: cloneState(state),
  });

  // Frame 3: ALU operation
  state.currentInsn = 1;
  state.srcRef = 'kernel/bpf/core.c:1802';
  state.registers = { ...defaultRegs, r1: 'ctx', r6: '0xffff8881', r0: '0x0' };
  frames.push({
    step: 3,
    label: 'BPF_ALU64_IMM: r0 = 0 -- initialize return value',
    description: `Instruction 1: BPF_ALU64_IMM(BPF_MOV, r0, 0). The jumptable dispatches to ALU64_MOV_K handler which sets DST = IMM. r0 is the BPF return value register. Initializing it to 0 is common for kprobe programs (0 means "don't override"). The interpreter continues to select_insn (kernel/bpf/core.c:1802) for the next instruction.`,
    highlights: ['insn-alu'],
    data: cloneState(state),
  });

  // Frame 4: Helper call
  state.currentInsn = 3;
  state.srcRef = 'kernel/bpf/core.c:1802';
  state.registers = { ...defaultRegs, r1: '0xffff8881', r6: '0xffff8881', r0: '0x42' };
  frames.push({
    step: 4,
    label: 'BPF_CALL: r0 = bpf_probe_read_kernel(r1, r2, r3)',
    description: `Instruction 3: BPF_EMIT_CALL(bpf_probe_read_kernel). The JMP_CALL handler saves r6-r9 (callee-saved), sets up args in r1-r5, then calls the helper: BPF_R0 = (__bpf_call_base + insn->imm)(r1, r2, r3, r4, r5). The helper reads kernel memory safely using probe_kernel_read(). The return value lands in r0. For the interpreter path, this is at the JMP_CALL label in ___bpf_prog_run() (kernel/bpf/core.c:1775).`,
    highlights: ['insn-call'],
    data: cloneState(state),
  });

  // Frame 5: Conditional jump
  state.currentInsn = 5;
  state.srcRef = 'kernel/bpf/core.c:1802';
  state.registers = { ...defaultRegs, r0: '0x42', r6: '0xffff8881' };
  frames.push({
    step: 5,
    label: 'BPF_JMP_IMM: if r0 == 0 goto +2 -- conditional branch',
    description: `Instruction 5: BPF_JMP_IMM(BPF_JEQ, r0, 0, 2). The JMP_JEQ_K handler compares DST (r0=0x42) with IMM (0). Since 0x42 != 0, the branch is NOT taken. The interpreter falls through: insn++ (CONT). If the branch were taken, insn += off + 1 would skip 2 instructions. The verifier already proved both paths are safe via check_cfg() (kernel/bpf/verifier.c:18953) and do_check() (kernel/bpf/verifier.c:21244).`,
    highlights: ['insn-jmp'],
    data: cloneState(state),
  });

  // Frame 6: Store to stack
  state.phase = 'exec-insn';
  state.currentInsn = 6;
  state.srcRef = 'kernel/bpf/core.c:1802';
  state.registers = { ...defaultRegs, r0: '0x42', r6: '0xffff8881', r10: 'fp' };
  frames.push({
    step: 6,
    label: 'BPF_STX_MEM: *(u64 *)(r10 - 8) = r0 -- store to stack',
    description: `Instruction 6: BPF_STX_MEM(BPF_DW, r10, r0, -8). The STX_MEM_DW handler writes r0 to the BPF stack at fp-8. r10 is always the frame pointer, and the BPF stack is 512 bytes. The verifier previously validated this access via check_mem_access() (kernel/bpf/verifier.c:7702) ensuring the offset is within the 512-byte stack. The interpreter stores *(u64 *)(DST + off) = SRC and continues.`,
    highlights: ['insn-stx'],
    data: cloneState(state),
  });

  // Frame 7: Exit
  state.currentInsn = 7;
  state.srcRef = 'kernel/bpf/core.c:1775';
  state.registers = { ...defaultRegs, r0: '0x42', r6: '0xffff8881', r10: 'fp' };
  frames.push({
    step: 7,
    label: 'BPF_EXIT: return r0 -- program execution complete',
    description: `Instruction 7: BPF_EXIT_INSN(). The JMP_EXIT handler returns BPF_R0 (0x42) from ___bpf_prog_run() (kernel/bpf/core.c:1775). For kprobe programs, the return value is typically ignored. For XDP programs, it controls packet verdict (XDP_PASS, XDP_DROP, etc.). The BPF program executed entirely in kernel context with no preemption, took no locks, and accessed only verified-safe memory regions.`,
    highlights: ['insn-exit'],
    data: cloneState(state),
  });

  // Frame 8: Summary
  state.phase = 'complete';
  state.srcRef = 'kernel/bpf/core.c:1775';
  frames.push({
    step: 8,
    label: 'BPF program execution complete',
    description: `BPF program execution: event fires -> ___bpf_prog_run() (kernel/bpf/core.c:1775) interprets instructions via computed goto jumptable (kernel/bpf/core.c:1779). Registers r0-r5 are caller-saved, r6-r9 callee-saved, r10 is read-only frame pointer. Helper calls use the standard BPF calling convention (r1-r5 args, r0 return). JIT-compiled programs bypass the interpreter entirely -- prog->bpf_func points directly to native x86 code generated by bpf_int_jit_compile() (arch/x86/net/bpf_jit_comp.c:3716).`,
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

function generateKfTrustedArgsDefault(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // v7.0 changed kfunc argument checking: trusted-args became the default
  // for all kfuncs. The KF_TRUSTED_ARGS flag was removed (commit 7646c7afd9a9)
  // after is_kfunc_trusted_args() was made to always return true
  // (commit 1a5c01d2508a). Before v7.0 a kfunc had to opt IN to trusted-arg
  // checking; in v7.0+ it is opt-out-by-nullability. This scenario walks
  // the verifier as it evaluates two kfunc call sites: one with a trusted
  // pointer (accepted) and one with an untrusted pointer (rejected).

  const state: EbpfVerifierState = {
    phase: 'insn-walk',
    currentInsn: 4,
    totalInsns: 10,
    srcRef: 'kernel/bpf/verifier.c:17626 check_kfunc_call()',
    kfuncTrusted: true,
    verifierResult: 'accept',
    verdict: 'pending',
    verifierLog: [],
  };

  // Frame 0: BPF program under verification calls bpf_task_release(task)
  frames.push({
    step: 0,
    label: 'BPF program calls kfunc bpf_task_release(task)',
    description: `A BPF program running on a tp_btf/task_newtask tracepoint receives a trusted struct task_struct * in R1. It eventually emits a BPF_CALL instruction targeting the kfunc bpf_task_release (defined in kernel/bpf/helpers.c:2744 bpf_task_release()). kfuncs are distinct from legacy BPF helpers: helpers go through check_helper_call() (kernel/bpf/verifier.c:10262 check_helper_call()), while kfuncs take the check_kfunc_call() path invoked from do_check() at kernel/bpf/verifier.c:17626 check_kfunc_call(). kfunc id and flags are resolved via BTF, not a fixed helper table.`,
    highlights: ['kfunc-call'],
    data: cloneState(state),
  });

  // Frame 1: Verifier enters check_kfunc_call
  state.phase = 'helper-check';
  state.srcRef = 'kernel/bpf/verifier.c:12974 check_kfunc_call()';
  frames.push({
    step: 1,
    label: 'check_kfunc_call() dispatches kfunc argument validation',
    description: `check_kfunc_call() (kernel/bpf/verifier.c:12974 check_kfunc_call()) fetches the kfunc's BTF metadata via bpf_fetch_kfunc_arg_meta(), reads meta->kfunc_flags (KF_ACQUIRE, KF_RELEASE, KF_RCU, KF_SLEEPABLE, ...), and then calls check_kfunc_args() at kernel/bpf/verifier.c:13049 check_kfunc_args() to validate each argument register against the BTF-declared parameter types. For bpf_task_release the flags are just KF_RELEASE (see kernel/bpf/helpers.c:4721 BTF_ID_FLAGS()).`,
    highlights: ['check-kfunc-call'],
    data: cloneState(state),
  });

  // Frame 2: check_kfunc_args inspects each pointer argument
  state.srcRef = 'kernel/bpf/verifier.c:12028 check_kfunc_args()';
  frames.push({
    step: 2,
    label: 'check_kfunc_args() inspects each pointer argument',
    description: `check_kfunc_args() (kernel/bpf/verifier.c:12028 check_kfunc_args()) loops over each BTF-declared parameter. For pointer parameters it classifies the argument via get_kfunc_ptr_arg_type() into categories such as KF_ARG_PTR_TO_CTX (context pointer, bypasses trusted check), KF_ARG_PTR_TO_BTF_ID (a struct pointer like task_struct *), KF_ARG_PTR_TO_MAP, and so on. The KF_ARG_PTR_TO_BTF_ID path is where the v7.0 trusted-by-default rule applies.`,
    highlights: ['kfunc-args'],
    data: cloneState(state),
  });

  // Frame 3: NULL check (reinforced in v7.0)
  state.srcRef = 'kernel/bpf/verifier.c:12124 check_kfunc_args()';
  frames.push({
    step: 3,
    label: 'NULL argument rejected unconditionally in v7.0',
    description: `At kernel/bpf/verifier.c:12124 check_kfunc_args(), the verifier rejects any possibly-NULL pointer unless the parameter is annotated __nullable (is_kfunc_arg_nullable() at kernel/bpf/verifier.c:10881 is_kfunc_arg_nullable()) or __opt. Before v7.0 this check only ran when the kfunc had KF_TRUSTED_ARGS or KF_RCU set. After commit 1a5c01d2508a this became the default for ALL kfuncs -- the gate "(is_kfunc_trusted_args(meta) || is_kfunc_rcu(meta)) &&" was removed. Error: "Possibly NULL pointer passed to trusted arg%d".`,
    highlights: ['null-check'],
    data: cloneState(state),
  });

  // Frame 4: Trusted pointer passes is_trusted_reg
  state.srcRef = 'kernel/bpf/verifier.c:12190 is_trusted_reg()';
  state.kfuncTrusted = true;
  state.verifierResult = 'accept';
  state.verdict = 'accepted';
  state.btfAnnotation = 'default';
  state.verifierLog = [...(state.verifierLog ?? []), 'R1 is trusted (PTR_TRUSTED in type_flag)'];
  frames.push({
    step: 4,
    label: 'Trusted task_struct pointer -- is_trusted_reg() returns true',
    description: `The argument is a struct task_struct * obtained directly from the tp_btf/task_newtask tracepoint, so its register type carries the PTR_TRUSTED modifier (BPF_REG_TRUSTED_MODIFIERS). In the KF_ARG_PTR_TO_BTF_ID branch at kernel/bpf/verifier.c:12189 check_kfunc_args(), the verifier calls is_trusted_reg(reg) (kernel/bpf/verifier.c:5127 is_trusted_reg()). A reg is trusted if it has ref_obj_id set, if base_type is in reg2btf_ids[], or if type_flag(reg->type) includes PTR_TRUSTED with no unsafe modifiers. Result: accepted.`,
    highlights: ['is-trusted-accept'],
    data: cloneState(state),
  });

  // Frame 5: Contrast - untrusted pointer from a map
  state.currentInsn = 7;
  state.srcRef = 'kernel/bpf/verifier.c:12189 check_kfunc_args()';
  state.kfuncTrusted = false;
  state.verifierResult = 'reject';
  frames.push({
    step: 5,
    label: 'Second call site: untrusted task pointer loaded from a map',
    description: `Now consider a second bpf_task_release() call where the argument was loaded out of a BPF_MAP_TYPE_HASH value (a raw kernel pointer stashed by a previous program). Its register type is plain PTR_TO_BTF_ID without the PTR_TRUSTED modifier. The KF_ARG_PTR_TO_BTF_ID classification still applies and the same is_trusted_reg() check runs at kernel/bpf/verifier.c:12190 is_trusted_reg() -- but now it returns false because reg->ref_obj_id is 0 and PTR_TRUSTED is not in type_flag(reg->type).`,
    highlights: ['untrusted-load'],
    data: cloneState(state),
  });

  // Frame 6: v7.0 default behavior rejects the untrusted call
  state.srcRef = 'kernel/bpf/verifier.c:12192 check_kfunc_args()';
  state.verdict = 'rejected';
  state.verifierLog = [...(state.verifierLog ?? []), 'R1 must be referenced or trusted'];
  frames.push({
    step: 6,
    label: 'v7.0 default: untrusted kfunc arg is rejected',
    description: `Because is_trusted_reg(reg) is false, the verifier checks is_kfunc_rcu(meta) at kernel/bpf/verifier.c:12191 is_kfunc_rcu(). bpf_task_release is KF_RELEASE only (no KF_RCU), so the fallback path is taken: verbose(env, "R%d must be referenced or trusted") at kernel/bpf/verifier.c:12192 check_kfunc_args(), and check_kfunc_args returns -EINVAL. This is the v7.0-default behavior: kfunc pointer arguments MUST be trusted unless the kfunc opts into KF_RCU.`,
    highlights: ['reject'],
    data: cloneState(state),
  });

  // Frame 7: Pre-v7.0 comparison
  state.srcRef = 'include/linux/btf.h:21 BTF_TYPE_EMIT()';
  frames.push({
    step: 7,
    label: 'Pre-v7.0 contrast: KF_TRUSTED_ARGS was opt-IN',
    description: `Before v7.0 the KF_TRUSTED_ARGS flag was defined in include/linux/btf.h near the block at include/linux/btf.h:21 BTF_TYPE_EMIT() (the comment describing trusted args still lives there). Only kfuncs that set KF_TRUSTED_ARGS (or KF_RELEASE, via is_kfunc_trusted_args() returning trusted|release) ran the trusted-pointer check. A kfunc that forgot the flag silently accepted walked or map-loaded pointers -- a repeated security footgun. Commit 1a5c01d2508a flipped the default; commit 7646c7afd9a9 then deleted KF_TRUSTED_ARGS from include/linux/btf.h entirely.`,
    highlights: ['pre-v7'],
    data: cloneState(state),
  });

  // Frame 8: Escape hatches: KF_RCU and __nullable
  state.srcRef = 'kernel/bpf/verifier.c:10815 is_kfunc_rcu()';
  frames.push({
    step: 8,
    label: 'Escape hatches: KF_RCU and __nullable / __opt annotations',
    description: `v7.0 still supports legitimate use cases through opt-out mechanisms. A kfunc flagged KF_RCU (is_kfunc_rcu() at kernel/bpf/verifier.c:10815 is_kfunc_rcu()) accepts either trusted OR rcu-protected pointers, relaxing the strict trusted check. A parameter named with the __nullable suffix (is_kfunc_arg_nullable() at kernel/bpf/verifier.c:10881 is_kfunc_arg_nullable()) allows NULL. These annotations live in BTF parameter names and are parsed per-argument -- no whole-kfunc flag needed anymore.`,
    highlights: ['escape-hatch'],
    data: cloneState(state),
  });

  // Frame 9: BTF annotation path -- default (no suffix) requires trusted
  state.phase = 'helper-check';
  state.currentInsn = 4;
  state.srcRef = 'kernel/bpf/verifier.c:11380 get_kfunc_ptr_arg_type()';
  state.kfuncTrusted = true;
  state.verifierResult = 'accept';
  state.btfAnnotation = 'default';
  state.rcuSection = false;
  state.verdict = 'accepted';
  state.verifierLog = [...(state.verifierLog ?? []), 'arg#0: no BTF suffix -> KF_ARG_PTR_TO_BTF_ID, trusted required'];
  frames.push({
    step: 9,
    label: 'BTF path #1: default annotation -- trusted pointer required',
    description: `First of three BTF annotation paths. get_kfunc_ptr_arg_type() (kernel/bpf/verifier.c:11380 get_kfunc_ptr_arg_type()) classifies the argument. With no BTF param suffix, a PTR_TO_BTF_ID argument falls through to the KF_ARG_PTR_TO_BTF_ID case at kernel/bpf/verifier.c:12189 check_kfunc_args(). The v7.0 default then demands is_trusted_reg(reg) (kernel/bpf/verifier.c:5127 is_trusted_reg()). Since R1 carries PTR_TRUSTED from the tp_btf tracepoint, this path is accepted and no verbose() diagnostic fires.`,
    highlights: ['btf-default'],
    data: cloneState(state),
  });

  // Frame 10: BTF annotation path -- __nullable lets NULL through
  state.srcRef = 'kernel/bpf/verifier.c:10881 is_kfunc_arg_nullable()';
  state.kfuncTrusted = true;
  state.verifierResult = 'accept';
  state.btfAnnotation = 'nullable';
  state.verdict = 'accepted';
  state.verifierLog = [...(state.verifierLog ?? []), 'arg#0: suffix "__nullable" matched; NULL and PTR_MAYBE_NULL allowed'];
  frames.push({
    step: 10,
    label: 'BTF path #2: __nullable -- NULL or PTR_MAYBE_NULL permitted',
    description: `Second BTF annotation path. is_kfunc_arg_nullable() (kernel/bpf/verifier.c:10881 is_kfunc_arg_nullable()) calls btf_param_match_suffix(btf, arg, "__nullable") (kernel/bpf/btf.c:9794 btf_param_match_suffix()). If true, the NULL-rejection gate at kernel/bpf/verifier.c:12124 check_kfunc_args() is bypassed: "if ((bpf_register_is_null(reg) || type_may_be_null(reg->type)) && !is_kfunc_arg_nullable(...))" skips the "Possibly NULL pointer passed to trusted arg%d" verbose(). An argument tagged __nullable accepts registers with the PTR_MAYBE_NULL type flag -- the kfunc itself is responsible for the NULL check at runtime.`,
    highlights: ['btf-nullable'],
    data: cloneState(state),
  });

  // Frame 11: BTF annotation path -- __ign tells verifier to ignore the arg
  state.srcRef = 'kernel/bpf/verifier.c:10856 is_kfunc_arg_ignore()';
  state.kfuncTrusted = true;
  state.verifierResult = 'accept';
  state.btfAnnotation = 'ign';
  state.verdict = 'accepted';
  state.verifierLog = [...(state.verifierLog ?? []), 'arg#0: suffix "__ign" matched; skipping type validation'];
  frames.push({
    step: 11,
    label: 'BTF path #3: __ign -- verifier skips argument checking entirely',
    description: `Third BTF annotation path: the optional/ignored-arg escape. is_kfunc_arg_ignore() (kernel/bpf/verifier.c:10856 is_kfunc_arg_ignore()) matches the "__ign" suffix via btf_param_match_suffix() (kernel/bpf/btf.c:9794 btf_param_match_suffix()). An __ign parameter is not subject to the KF_ARG_PTR_TO_BTF_ID trusted check at kernel/bpf/verifier.c:12190 is_trusted_reg() -- the verifier walks past it. This is the escape hatch for kfunc authors who need a parameter that exists for ABI reasons but must not be verified (e.g. compiler-managed slots). Unlike __nullable, this skips type checks altogether.`,
    highlights: ['btf-ign'],
    data: cloneState(state),
  });

  // Frame 12: KF_RCU scenario -- call bpf_task_acquire OUTSIDE RCU read-side CS
  state.currentInsn = 6;
  state.srcRef = 'kernel/bpf/verifier.c:5151 is_rcu_reg()';
  state.kfuncTrusted = false;
  state.verifierResult = 'reject';
  state.btfAnnotation = 'default';
  state.rcuSection = false;
  state.verdict = 'rejected';
  state.verifierLog = [...(state.verifierLog ?? []), 'R1 must be a rcu pointer'];
  frames.push({
    step: 12,
    label: 'KF_RCU kfunc called outside rcu_read_lock -- rejected',
    description: `Switch to a kfunc flagged KF_RCU: bpf_task_acquire (kernel/bpf/helpers.c:4720 BTF_ID_FLAGS() declares KF_ACQUIRE | KF_RCU | KF_RET_NULL). The program is NOT inside a bpf_rcu_read_lock() region, so the R1 task pointer has base type PTR_TO_BTF_ID without MEM_RCU. At kernel/bpf/verifier.c:12190 is_trusted_reg() the trusted check fails; is_kfunc_rcu(meta) is true (kernel/bpf/verifier.c:10815 is_kfunc_rcu()), so the fallback is is_rcu_reg(reg) (kernel/bpf/verifier.c:5151 is_rcu_reg()) which returns (reg->type & MEM_RCU). Without MEM_RCU this returns false, verbose() fires "R1 must be a rcu pointer" at kernel/bpf/verifier.c:12196 check_kfunc_args() and -EINVAL propagates.`,
    highlights: ['kf-rcu-reject'],
    data: cloneState(state),
  });

  // Frame 13: KF_RCU scenario -- call bpf_task_acquire INSIDE rcu_read_lock: accepted
  state.srcRef = 'kernel/bpf/verifier.c:12195 is_rcu_reg()';
  state.kfuncTrusted = false;
  state.verifierResult = 'accept';
  state.btfAnnotation = 'default';
  state.rcuSection = true;
  state.verdict = 'accepted';
  state.verifierLog = [...(state.verifierLog ?? []), 'R1 has MEM_RCU; KF_RCU kfunc accepts rcu-protected pointer'];
  frames.push({
    step: 13,
    label: 'KF_RCU escape hatch: inside rcu_read_lock, MEM_RCU pointer accepted',
    description: `Now the program wraps the bpf_task_acquire() call in bpf_rcu_read_lock()/bpf_rcu_read_unlock(). Inside the RCU CS, the register's type gains the MEM_RCU flag (see the RCU handling at kernel/bpf/verifier.c:5153 is_rcu_reg() returning reg->type & MEM_RCU). At kernel/bpf/verifier.c:12190 is_trusted_reg() the trusted check still fails, but is_kfunc_rcu(meta) is true (kernel/bpf/verifier.c:10815 is_kfunc_rcu()), and now is_rcu_reg(reg) at kernel/bpf/verifier.c:12195 check_kfunc_args() also returns true. The verifier falls through without emitting a verbose() diagnostic. This is the intended KF_RCU escape hatch: untrusted but ref-guarded pointers are safe only inside the RCU read-side critical section.`,
    highlights: ['kf-rcu-accept'],
    data: cloneState(state),
  });

  // Frame 14: process_kf_arg_ptr_to_btf_id finalizes type match
  state.srcRef = 'kernel/bpf/verifier.c:11458 process_kf_arg_ptr_to_btf_id()';
  state.rcuSection = true;
  state.verdict = 'accepted';
  state.verifierLog = [...(state.verifierLog ?? []), 'arg#0 BTF id matched struct task_struct'];
  frames.push({
    step: 14,
    label: 'process_kf_arg_ptr_to_btf_id() matches BTF struct type',
    description: `After the trusted/RCU gate passes, process_kf_arg_ptr_to_btf_id() (kernel/bpf/verifier.c:11458 process_kf_arg_ptr_to_btf_id()) resolves the register's btf and ref_id, then checks struct compatibility against the kfunc's declared parameter type. For bpf_task_acquire(struct task_struct *p) the register's BTF id must match struct task_struct (or a projection thereof). Mismatch emits verbose() like "arg#0 expected pointer to struct task_struct but got struct %s" at kernel/bpf/verifier.c:11458 process_kf_arg_ptr_to_btf_id(). On match, meta->ref_obj_id is propagated for KF_ACQUIRE kfuncs so a later KF_RELEASE can discharge it.`,
    highlights: ['kf-btf-match'],
    data: cloneState(state),
  });

  // Frame 15: Pre-v7.0 contrast -- previously check_kfunc_args skipped the check
  state.srcRef = 'kernel/bpf/verifier.c:12028 check_kfunc_args()';
  state.verdict = 'accepted';
  state.verifierLog = [...(state.verifierLog ?? []), 'pre-v7.0 load path would have passed silently'];
  frames.push({
    step: 15,
    label: 'Pre-v7.0 contrast: check_kfunc_args() previously skipped this check',
    description: `Before commit 1a5c01d2508a, the dispatch at kernel/bpf/verifier.c:12028 check_kfunc_args() guarded the trusted-reg check with "(is_kfunc_trusted_args(meta) || is_kfunc_rcu(meta)) && ..." -- a kfunc author had to opt in by setting KF_TRUSTED_ARGS. An untrusted map-loaded pointer would silently pass. The same program now hits the unconditional gate. Commit 7646c7afd9a9 finished the transition by deleting KF_TRUSTED_ARGS entirely from include/linux/btf.h near include/linux/btf.h:21 BTF_TYPE_EMIT(). The default is no longer opt-in; it is the one true policy, opt-out only via KF_RCU, __nullable, or __ign.`,
    highlights: ['pre-v7-contrast'],
    data: cloneState(state),
  });

  // Frame 16: Program load fails or succeeds -- summary verdict
  state.phase = 'complete';
  state.srcRef = 'kernel/bpf/verifier.c:13049 check_kfunc_args()';
  state.kfuncTrusted = false;
  state.verifierResult = 'reject';
  state.rcuSection = false;
  state.verdict = 'rejected';
  state.verifierLog = [...(state.verifierLog ?? []), 'bpf_check() -> -EINVAL; BPF_PROG_LOAD rejected'];
  frames.push({
    step: 16,
    label: 'bpf_check() returns -EINVAL; BPF_PROG_LOAD fails',
    description: `check_kfunc_args() returned -EINVAL from the second call site, so check_kfunc_call() (kernel/bpf/verifier.c:13049 check_kfunc_args()) propagates it upward. do_check() aborts the instruction walk, bpf_check() cleans up the verifier env, and bpf_prog_load() at kernel/bpf/syscall.c:3089 bpf_check() returns -EINVAL to userspace. The user sees the verifier log line "R1 must be referenced or trusted" pointing at the offending BPF_CALL. Under pre-v7.0 kernels the same program loaded silently; under v7.0 it is rejected -- a meaningful hardening of kfunc ABI.`,
    highlights: ['prog-load-fail'],
    data: cloneState(state),
  });

  return frames;
}

const SCENARIOS: AnimationScenario[] = [
  { id: 'verifier-walk', label: 'BPF Verifier Instruction Walk' },
  { id: 'jit-compilation', label: 'BPF JIT Compilation Pipeline' },
  { id: 'program-execution', label: 'BPF Program Execution' },
  { id: 'kf-trusted-args-default', label: 'KF_TRUSTED_ARGS Default (v7.0)' },
];

const NS = 'http://www.w3.org/2000/svg';

function renderInsnList(
  container: SVGGElement,
  currentInsn: number,
  totalInsns: number,
  highlights: string[],
  startX: number,
  startY: number,
  boxW: number,
  boxH: number,
): void {
  const gap = 4;
  const visibleInsns = Math.min(totalInsns, 8);

  for (let i = 0; i < visibleInsns; i++) {
    const x = startX;
    const y = startY + i * (boxH + gap);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(boxW));
    rect.setAttribute('height', String(boxH));
    rect.setAttribute('rx', '3');

    let cls = 'anim-insn';
    if (i === currentInsn) cls += ' anim-highlight';
    rect.setAttribute('class', cls);

    let fill = '#34495e';
    if (i < currentInsn) fill = '#27ae60';
    else if (i === currentInsn) fill = '#f39c12';
    rect.setAttribute('fill', fill);
    rect.setAttribute('opacity', i === currentInsn ? '1' : '0.6');
    rect.setAttribute('stroke', i === currentInsn ? '#e67e22' : '#555');
    rect.setAttribute('stroke-width', i === currentInsn ? '2' : '1');

    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(x + boxW / 2));
    label.setAttribute('y', String(y + boxH / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-insn');
    label.setAttribute('fill', '#fff');
    label.setAttribute('font-size', '10');
    label.textContent = `insn ${i}`;
    container.appendChild(label);
  }
}

function renderRegisters(
  container: SVGGElement,
  registers: Record<string, string> | undefined,
  startX: number,
  startY: number,
): void {
  if (!registers) return;

  const regs = Object.entries(registers);
  const colWidth = 80;
  const rowHeight = 18;
  const cols = 4;

  for (let i = 0; i < regs.length; i++) {
    const [name, value] = regs[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * colWidth;
    const y = startY + row * rowHeight;

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('fill', name === 'r0' ? '#f39c12' : '#ccc');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-family', 'monospace');
    text.textContent = `${name}: ${value}`;
    container.appendChild(text);
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);

  const data = frame.data as EbpfVerifierState;
  const margin = { top: 10, right: 10, bottom: 10, left: 10 };

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', String(margin.top + 16));
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-phase');
  title.setAttribute('fill', '#ecf0f1');
  title.setAttribute('font-size', '16');
  title.setAttribute('font-weight', 'bold');
  title.textContent = 'eBPF Verifier and Execution';
  container.appendChild(title);

  // Phase indicator
  const phaseRect = document.createElementNS(NS, 'rect');
  phaseRect.setAttribute('x', String(margin.left));
  phaseRect.setAttribute('y', String(margin.top + 30));
  phaseRect.setAttribute('width', String(width - margin.left - margin.right));
  phaseRect.setAttribute('height', '28');
  phaseRect.setAttribute('rx', '5');
  phaseRect.setAttribute('class', 'anim-phase');

  let phaseFill = '#2c3e50';
  if (data.phase === 'cfg-check') phaseFill = '#8e44ad';
  else if (data.phase === 'insn-walk' || data.phase === 'mem-check' || data.phase === 'helper-check' || data.phase === 'state-prune') phaseFill = '#2980b9';
  else if (data.phase === 'jit' || data.phase === 'jit-emit' || data.phase === 'jit-finalize' || data.phase === 'jit-select') phaseFill = '#d35400';
  else if (data.phase === 'execution' || data.phase === 'exec-insn') phaseFill = '#27ae60';
  else if (data.phase === 'complete') phaseFill = '#16a085';
  phaseRect.setAttribute('fill', phaseFill);
  container.appendChild(phaseRect);

  const phaseText = document.createElementNS(NS, 'text');
  phaseText.setAttribute('x', String(width / 2));
  phaseText.setAttribute('y', String(margin.top + 48));
  phaseText.setAttribute('text-anchor', 'middle');
  phaseText.setAttribute('class', 'anim-phase');
  phaseText.setAttribute('fill', '#fff');
  phaseText.setAttribute('font-size', '12');
  phaseText.textContent = `Phase: ${data.phase}`;
  container.appendChild(phaseText);

  // Instruction list (for insn-walk, mem-check, helper-check, state-prune, execution, exec-insn)
  const showInsns = ['insn-walk', 'mem-check', 'helper-check', 'state-prune', 'execution', 'exec-insn'].includes(data.phase);
  if (showInsns) {
    renderInsnList(container, data.currentInsn, data.totalInsns, frame.highlights, margin.left + 20, margin.top + 80, 100, 24);
  }

  // Register display (for execution phases)
  if (data.registers) {
    renderRegisters(container, data.registers, width / 2 - 100, margin.top + 80);
  }

  // Source reference
  const srcText = document.createElementNS(NS, 'text');
  srcText.setAttribute('x', String(width - margin.right - 10));
  srcText.setAttribute('y', String(height - margin.bottom - 5));
  srcText.setAttribute('text-anchor', 'end');
  srcText.setAttribute('fill', '#7f8c8d');
  srcText.setAttribute('font-size', '10');
  srcText.textContent = `Src: ${data.srcRef}`;
  container.appendChild(srcText);
}

const ebpfVerifier: AnimationModule = {
  config: {
    id: 'ebpf-verifier',
    title: 'eBPF Verifier and Execution',
    skillName: 'ebpf-programs',
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    const id = scenario || 'verifier-walk';
    switch (id) {
      case 'jit-compilation':
        return generateJitCompilationFrames();
      case 'program-execution':
        return generateProgramExecutionFrames();
      case 'kf-trusted-args-default':
        return generateKfTrustedArgsDefault();
      case 'verifier-walk':
      default:
        return generateVerifierWalkFrames();
    }
  },

  renderFrame,

  getScenarios(): AnimationScenario[] {
    return SCENARIOS;
  },
};

export default ebpfVerifier;
