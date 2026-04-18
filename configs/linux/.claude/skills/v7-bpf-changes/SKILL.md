---
name: v7-bpf-changes
description: Study Linux 7.0 BPF changes -- BPF_F_CPU/BPF_F_ALL_CPUS flags and KF_TRUSTED_ARGS as the default kfunc policy
realm: kernel-7
category: release-features
difficulty: advanced
xp: 300
estimated_minutes: 90
prerequisites:
- ebpf-programs
- ebpf-maps-and-helpers
unlocks: []
kernel_files:
- kernel/bpf/verifier.c
- kernel/bpf/helpers.c
- kernel/bpf/arraymap.c
- kernel/bpf/hashtab.c
- include/linux/btf.h
- include/uapi/linux/bpf.h
badge: BPF Historian
tags:
- linux-7.0
- bpf
- kfunc
- per-cpu-map
- trusted-args
- release-notes
---


# Linux 7.0 BPF Changes

## Quest Briefing

Linux 7.0 tightened two parts of the BPF userspace/kernel contract.
First, per-CPU maps gained explicit `BPF_F_CPU` and `BPF_F_ALL_CPUS`
flags, so programs can write a value to a single target CPU slot or
broadcast to every CPU without reading-then-writing. Second, the
long-standing `KF_TRUSTED_ARGS` flag -- which kfunc authors had to
opt into -- became the default policy: every kfunc now demands
trusted pointer arguments unless it explicitly opts out.

Both changes sharpen BPF safety without requiring most program
authors to touch their code. But if you write kfuncs or interact with
per-CPU maps from C, you need to know what changed and why.


## Learning Objectives

- Read the `BPF_F_CPU` and `BPF_F_ALL_CPUS` definitions and explain
  the encoding `flags | (cpu << 32)` used by `percpu_array_update`
  and `percpu_hash_update` paths.
- Trace the per-CPU map update path on 7.0: `bpf_percpu_array_update()`
  decodes the flag, validates `(u32)map_flags > BPF_F_ALL_CPUS` is
  rejected, then writes to either a single CPU slot or broadcasts to
  all.
- Identify the commit shape of the KF_TRUSTED_ARGS default transition:
  "bpf: Make KF_TRUSTED_ARGS the default for all kfuncs" flipped the
  check in `check_kfunc_args()`; the follow-up "bpf: Remove redundant
  KF_TRUSTED_ARGS flag" deleted the per-kfunc opt-in everywhere.
- Walk `check_kfunc_args()` at `kernel/bpf/verifier.c:12028` and find
  the `is_trusted_reg()` call at line 12190 that now runs
  unconditionally for KF_ARG_PTR_TO_BTF_ID.
- Contrast with `check_helper_call()` at verifier.c:10262 (helpers
  still have their own, looser argument model).


## Core Concepts

### BPF_F_CPU and BPF_F_ALL_CPUS Flags

Per-CPU maps store a separate value per CPU. Pre-7.0, userspace had
no way to update one CPU's slot without a read-modify-write dance on
every other CPU's slot. 7.0 adds two flags encoded in the upper 32
bits of `map_flags`:

- `BPF_F_CPU`: write the supplied value to the CPU whose id is
  encoded in the upper 32 bits.
- `BPF_F_ALL_CPUS`: broadcast the supplied value to every CPU slot.

The encoding is `flags | ((u64)cpu << 32)`. Validation is
`(u32)map_flags > BPF_F_ALL_CPUS` -- anything with garbage in the
low 32 bits that isn't a recognized flag is rejected.

Supported map types: `BPF_MAP_TYPE_PERCPU_ARRAY`,
`BPF_MAP_TYPE_PERCPU_HASH`, `BPF_MAP_TYPE_LRU_PERCPU_HASH`, and
`BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE`.

The update dispatches through `pcpu_copy_value()` which now switches
on the new flags to choose between single-CPU write and broadcast.

### KF_TRUSTED_ARGS as the Default

kfuncs (kernel functions callable from BPF) accept typed pointer
arguments -- tasks, file descriptors, network devices, etc. The
verifier checks that such pointers are "trusted": they came from a
known-valid source, not an arbitrary pointer reconstructed by
program arithmetic.

Pre-7.0, this strict check was opt-in via `KF_TRUSTED_ARGS`. Authors
who forgot the flag got looser verification and potential
use-after-free hazards.

7.0 flips the default. Two commits:

1. "bpf: Make KF_TRUSTED_ARGS the default for all kfuncs" removes
   the opt-in check in `check_kfunc_args()` at
   kernel/bpf/verifier.c:12028. The key change: `is_trusted_reg(reg)`
   at verifier.c:12190 now runs unconditionally for
   KF_ARG_PTR_TO_BTF_ID arguments.
2. "bpf: Remove redundant KF_TRUSTED_ARGS flag from all kfuncs" then
   deletes the flag from every kfunc registration and from
   `include/linux/btf.h`. Every existing kfunc implicitly runs under
   the strict model.

Opt-outs still exist for helpers that legitimately accept looser
pointers: `is_kfunc_rcu()` at verifier.c:10815 and
`is_kfunc_arg_nullable()` at verifier.c:10881 change what "trusted"
means for specific argument kinds.

### Helpers vs kfuncs

`check_helper_call()` at verifier.c:10262 is unchanged. Helpers have
a different argument model (ARG_PTR_TO_FOO enumerations rather than
BTF-id'd structures), so the KF_TRUSTED_ARGS change does not apply
to them. When reading verifier code on 7.0, check which call path
you're in before concluding what verification applies.


## Code Walkthrough

Trace a `bpf_map_update_elem` on a per-CPU array with `BPF_F_CPU |
(2 << 32)`:

1. Userspace encodes the target CPU in the upper 32 bits:
   `map_flags = BPF_F_CPU | ((u64)2 << 32)`.
2. syscall enters `map_update_elem` dispatch.
3. `bpf_percpu_array_update()` decodes the flag and the CPU id.
4. Validation: reject if `(u32)map_flags > BPF_F_ALL_CPUS` (malformed
   low bits).
5. `pcpu_copy_value()` with `updateMode = 'cpu'` writes only the slot
   for CPU 2. The other CPUs' slots retain their old value.
6. Complementary read path: `bpf_percpu_array_copy()` with BPF_F_CPU
   returns the value of the specified CPU instead of aggregating.

And a kfunc call under the new default:

1. BPF program calls `bpf_task_release(p)` where `p` is `struct
   task_struct *`.
2. `check_kfunc_call()` at verifier.c:12974 dispatches through
   `check_kfunc_args()` at verifier.c:12028.
3. The argument kind is KF_ARG_PTR_TO_BTF_ID. Line 12190 calls
   `is_trusted_reg(reg)`. `is_trusted_reg()` at verifier.c:5127
   validates that the pointer came from a trusted source (a kfunc
   that returned `__ref`, a tracepoint-trusted argument, etc.).
4. If the pointer is not trusted, the verifier rejects the program.
   Pre-7.0, this check only ran if the kfunc declared
   KF_TRUSTED_ARGS; 7.0 runs it unconditionally.
5. `bpf_task_release()` at helpers.c:2744 is registered via
   `BTF_ID_FLAGS(bpf_task_release, KF_RELEASE)` at helpers.c:4721.
   Note the absence of `KF_TRUSTED_ARGS` in the flags -- in 7.0
   that's implicit.


## Hands-On Challenges

### Challenge 1: Per-CPU Map Demo (75 XP)

Write a BPF program that uses `BPF_F_CPU` to increment a per-CPU
counter for CPU 0 only, then `BPF_F_ALL_CPUS` to reset all slots to
zero. Verify via a userspace reader that the semantics match.

Verification: Show the BPF source, the output showing per-CPU slot
values before/after, and a short trace of which kernel path each
update took.

### Challenge 2: Verifier Rejection (100 XP)

Write a BPF program that constructs an untrusted `struct task_struct *`
via pointer arithmetic and passes it to `bpf_task_release()`. Confirm
the verifier rejects the program and capture the exact error message.

Then patch the program to use `bpf_task_acquire()` (which returns
`__ref`) and show the same call now verifies cleanly.

Verification: Two verifier logs (before/after) and a short writeup
citing `is_trusted_reg()` at verifier.c:5127.

### Challenge 3: kfunc Audit (100 XP)

Pick five kfuncs across different subsystems (fs, net, sched, task,
cgroup). For each, show the BTF_ID_FLAGS registration and explain
what "trusted" means for its argument types. Note which rely on
`is_kfunc_rcu()` or `is_kfunc_arg_nullable()` as partial opt-outs.

Verification: Five entries with source citations.

### Challenge 4: Flag Encoding Math (25 XP)

Given `map_flags = 0x00000000_00000002`, 0x00000002_00000002`, and
`0xffffffff_00000002`, explain whether each is valid and what CPU
would be targeted. Cite the validation rule.

Verification: Three-line table plus the cited check.


## Verification Criteria

After completing this skill, you should be able to:

- [ ] Explain `BPF_F_CPU` and `BPF_F_ALL_CPUS` and decode an example
      `map_flags` value.
- [ ] Trace the v7.0 per-CPU map update path from syscall to
      `pcpu_copy_value()` with both single-CPU and broadcast modes.
- [ ] Describe why `KF_TRUSTED_ARGS` became the default and identify
      the two commits that performed the transition.
- [ ] Walk `check_kfunc_args()` (verifier.c:12028) and pinpoint the
      `is_trusted_reg()` call at verifier.c:12190 that is now
      unconditional for KF_ARG_PTR_TO_BTF_ID.
- [ ] Contrast kfunc verification with `check_helper_call()`
      (verifier.c:10262) and explain why the KF_TRUSTED_ARGS change
      does not apply to helpers.
