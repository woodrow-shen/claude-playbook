import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface KbuildState {
  phase: 'parse' | 'read-config' | 'calc-value' | 'write-config' | 'build' | 'descend' | 'compile' | 'link' | 'dep-check' | 'resolve' | 'select' | 'imply' | 'complete';
  currentFile: string;
  symbols: string[];
  dependencies: string[];
  buildTarget: string;
  srcRef: string;
}

function cloneState(s: KbuildState): KbuildState {
  return {
    phase: s.phase,
    currentFile: s.currentFile,
    symbols: [...s.symbols],
    dependencies: [...s.dependencies],
    buildTarget: s.buildTarget,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: kconfig-parsing
// How Kconfig files are parsed and .config is generated
// Trace: conf_parse() -> conf_read() -> sym_calc_value()
// ---------------------------------------------------------------------------
function generateKconfigParsing(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: KbuildState = {
    phase: 'parse',
    currentFile: 'scripts/kconfig/conf.c',
    symbols: [],
    dependencies: [],
    buildTarget: '',
    srcRef: '',
  };

  // Frame 0: conf.c main() entry
  state.srcRef = 'scripts/kconfig/conf.c:661 (int main)';
  frames.push({
    step: 0,
    label: 'conf.c main() parses command-line options',
    description: 'The kconfig tool starts at scripts/kconfig/conf.c:661 (main). It parses command-line options via getopt_long() at line 670, selecting an input_mode (oldaskconfig, syncconfig, defconfig, etc.) from the enum at line 23. The final positional argument (av[optind]) is the top-level Kconfig file path, typically "Kconfig" from the kernel root.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: conf_parse() called
  state.srcRef = 'scripts/kconfig/conf.c:710 -> scripts/kconfig/parser.y:554 (conf_parse)';
  state.currentFile = 'scripts/kconfig/parser.y';
  frames.push({
    step: 1,
    label: 'conf_parse() initiates Kconfig parsing',
    description: 'At scripts/kconfig/conf.c:710, conf_parse(av[optind]) is called. conf_parse() is defined at scripts/kconfig/parser.y:554. It initializes the scanner with zconf_initscan(name) at line 562, calls _menu_init() at line 564 to set up the root menu, then invokes yyparse() at line 568 -- the Bison-generated parser that reads and processes all Kconfig files recursively (source statements pull in sub-Kconfig files).',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 2: Kconfig symbols registered during parse
  state.srcRef = 'scripts/kconfig/parser.y:568 (yyparse builds symbol table)';
  state.symbols = ['CONFIG_MODULES', 'CONFIG_SMP'];
  frames.push({
    step: 2,
    label: 'Parser builds symbol table and menu tree',
    description: 'yyparse() processes Kconfig grammar rules (config, menuconfig, choice, menu, source, etc.). Each "config FOO" statement creates a struct symbol via sym_lookup() and builds the menu hierarchy. Properties (type, default, depends on, select, imply, help) are attached via menu_add_prop(). After parsing, the complete symbol table and menu tree represent all configurable options.',
    highlights: ['sym-list'],
    data: cloneState(state),
  });

  // Frame 3: conf_read() loads .config
  state.phase = 'read-config';
  state.currentFile = 'scripts/kconfig/confdata.c';
  state.srcRef = 'scripts/kconfig/confdata.c:489 (conf_read)';
  state.symbols = ['CONFIG_MODULES', 'CONFIG_SMP', 'CONFIG_X86_64'];
  frames.push({
    step: 3,
    label: 'conf_read() loads existing .config values',
    description: 'Back in conf.c main(), conf_read(NULL) is called at line 734 for most modes. conf_read() at scripts/kconfig/confdata.c:489 calls conf_read_simple(name, S_DEF_USER) at line 495 to parse the .config file. conf_read_simple() at line 320 opens the file, reads "CONFIG_FOO=y/m/n" lines, looks up each symbol, and sets sym->def[S_DEF_USER]. If no .config exists, it searches KCONFIG_DEFCONFIG_LIST.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 4: conf_read_simple parses lines
  state.srcRef = 'scripts/kconfig/confdata.c:320 (conf_read_simple)';
  state.symbols = ['CONFIG_MODULES=y', 'CONFIG_SMP=y', 'CONFIG_X86_64=y', 'CONFIG_PRINTK=y'];
  frames.push({
    step: 4,
    label: 'conf_read_simple() matches .config lines to symbols',
    description: 'conf_read_simple() at scripts/kconfig/confdata.c:320 reads each line of .config. Lines matching "CONFIG_FOO=val" are parsed: the symbol is looked up, and its def[S_DEF_USER] is set to the parsed tristate (y/m/n) or string value. Lines starting with "# CONFIG_FOO is not set" set the symbol to n. Unknown symbols trigger a warning if KCONFIG_WARN_UNKNOWN_SYMBOLS is set (line 330).',
    highlights: ['sym-list'],
    data: cloneState(state),
  });

  // Frame 5: sym_calc_value for modules_sym
  state.phase = 'calc-value';
  state.currentFile = 'scripts/kconfig/symbol.c';
  state.srcRef = 'scripts/kconfig/confdata.c:500 -> scripts/kconfig/symbol.c:411 (sym_calc_value)';
  frames.push({
    step: 5,
    label: 'sym_calc_value() computes effective values',
    description: 'After loading .config, conf_read() at scripts/kconfig/confdata.c:500 calls sym_calc_value(modules_sym) to calculate the MODULES symbol first (it affects tristate evaluation globally). sym_calc_value() at scripts/kconfig/symbol.c:411 checks SYMBOL_VALID flag (line 420), calls sym_calc_visibility() (line 450), then evaluates the symbol based on type: for BOOLEAN/TRISTATE, it considers user value, defaults, reverse dependencies (select), and implied values.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 6: for_all_symbols loop
  state.srcRef = 'scripts/kconfig/confdata.c:502 (for_all_symbols sym_calc_value)';
  state.symbols = ['CONFIG_MODULES=y', 'CONFIG_SMP=y', 'CONFIG_X86_64=y', 'CONFIG_PRINTK=y', 'CONFIG_NET=y'];
  state.dependencies = ['CONFIG_INET depends on CONFIG_NET'];
  frames.push({
    step: 6,
    label: 'Calculate all symbol values and check consistency',
    description: 'conf_read() at scripts/kconfig/confdata.c:502 iterates for_all_symbols, calling sym_calc_value(sym) on each. For each symbol, sym_calc_value() at symbol.c:411 evaluates: visibility from "depends on" via expr_calc_value() (line 482), reverse dependencies from "select" (line 248: sym->rev_dep), and "imply" constraints (line 257: sym->implied). If the calculated value differs from the saved .config value, conf_set_changed(true) is called at line 522.',
    highlights: ['sym-list'],
    data: cloneState(state),
  });

  // Frame 7: check_conf for new/changed symbols
  state.phase = 'write-config';
  state.currentFile = 'scripts/kconfig/conf.c';
  state.srcRef = 'scripts/kconfig/conf.c:829-831 (check_conf loop)';
  frames.push({
    step: 7,
    label: 'check_conf() handles new/changed symbols',
    description: 'For syncconfig/oldconfig modes, conf.c:829-831 runs a do-while loop calling check_conf(&rootmenu). check_conf() at line 574 walks the menu tree: for each visible symbol without a user value (sym_has_value() false, line 583), it either lists it (listnewconfig), shows help (helpnewconfig), or prompts the user (oldaskconfig). The loop repeats until conf_cnt == 0, meaning no new symbols need attention.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 8: conf_write outputs .config
  state.srcRef = 'scripts/kconfig/conf.c:848 (conf_write)';
  state.currentFile = 'scripts/kconfig/confdata.c';
  frames.push({
    step: 8,
    label: 'conf_write() saves final .config',
    description: 'At scripts/kconfig/conf.c:848, conf_write(NULL) writes the resolved configuration to .config. For syncconfig mode (line 862), conf_write_autoconf(sync_kconfig) also generates include/config/auto.conf (consumed by Kbuild) and include/generated/autoconf.h (C header with #define CONFIG_FOO 1). These files bridge the Kconfig system to the Kbuild compilation system.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 9: Configuration complete
  state.phase = 'complete';
  state.srcRef = 'scripts/kconfig/conf.c:868 (return 0)';
  state.currentFile = 'scripts/kconfig/conf.c';
  frames.push({
    step: 9,
    label: 'Configuration complete',
    description: 'conf.c main() returns 0 at line 868. The configuration pipeline is complete: Kconfig files parsed (parser.y:554), .config loaded and symbols resolved (confdata.c:489, symbol.c:411), new symbols handled, and output written. The .config file, auto.conf, and autoconf.h are now consistent and ready for the Kbuild compilation stage.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: make-build-flow
// The make/Kbuild recursive build system
// Trace: top-level Makefile -> scripts/Makefile.build -> cmd_cc_o_c
// ---------------------------------------------------------------------------
function generateMakeBuildFlow(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: KbuildState = {
    phase: 'build',
    currentFile: 'Makefile',
    symbols: [],
    dependencies: [],
    buildTarget: 'vmlinux',
    srcRef: '',
  };

  // Frame 0: Top-level Makefile entry
  state.srcRef = 'Makefile:22-23 (PHONY := __all / __all:)';
  frames.push({
    step: 0,
    label: 'Top-level Makefile defines __all target',
    description: 'The build starts with the top-level Makefile. At Makefile:22-23, the default target is __all. At line 764, __all depends on "all" (for in-tree builds) or "modules" (for KBUILD_EXTMOD, line 766). MAKEFLAGS += -rR at line 49 disables built-in rules for performance. V=1 enables verbose output (lines 82-92).',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: all -> vmlinux
  state.srcRef = 'Makefile:823 (all: vmlinux)';
  state.buildTarget = 'vmlinux';
  frames.push({
    step: 1,
    label: '"all" depends on vmlinux',
    description: 'At Makefile:823, "all: vmlinux" establishes that the default build target is vmlinux. The arch Makefile (included earlier) may add additional targets. Before vmlinux can be built, the configuration must exist: include/config/auto.conf is included at line 797 (ifdef need-config) to provide CONFIG_* variables to Make.',
    highlights: ['build-target'],
    data: cloneState(state),
  });

  // Frame 2: Object file lists
  state.srcRef = 'Makefile:813-816 (core-y, drivers-y, libs-y)';
  state.symbols = ['core-y', 'drivers-y', 'libs-y'];
  frames.push({
    step: 2,
    label: 'Makefile collects object directories',
    description: 'At Makefile:813-816, the top-level Makefile defines core-y, drivers-y, and libs-y := lib/. These are expanded by the arch Makefile and other includes to list all directories containing kernel objects. Each directory has a Kbuild or Makefile that specifies obj-y and obj-m variables controlling which .o files are built-in vs modular.',
    highlights: ['sym-list'],
    data: cloneState(state),
  });

  // Frame 3: Recursive make descends
  state.phase = 'descend';
  state.currentFile = 'scripts/Makefile.build';
  state.srcRef = 'scripts/Makefile.build:1-10 (Building)';
  frames.push({
    step: 3,
    label: 'Recursive make enters scripts/Makefile.build',
    description: 'For each directory in core-y/drivers-y/libs-y, make invokes $(MAKE) $(build)=<dir>. The $(build) macro expands to "-f scripts/Makefile.build obj=<dir>". scripts/Makefile.build:6-7 sets src from the obj variable. It initializes obj-y, obj-m, lib-y, and other variables to empty at lines 14-28, then includes auto.conf (line 33), Kbuild.include (line 35), Makefile.compiler (line 36), and the directory\'s kbuild-file (line 37).',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 4: Makefile.build processes obj-y/obj-m
  state.srcRef = 'scripts/Makefile.build:46-96 (obj-y/obj-m processing)';
  state.symbols = ['obj-y', 'obj-m', 'real-obj-y', 'real-obj-m', 'subdir-ym'];
  frames.push({
    step: 4,
    label: 'Makefile.build resolves object lists',
    description: 'scripts/Makefile.build processes the variables from the kbuild-file. At line 50, obj-m is filtered to exclude anything already in obj-y. At line 57, subdir-ym collects subdirectories needing recursive descent. Lines 75-78 replace "foo/" entries with "foo/built-in.a". Lines 88-95 expand composite objects (foo-objs, foo-y) into their individual .o parts via multi-search and real-search macros.',
    highlights: ['sym-list'],
    data: cloneState(state),
  });

  // Frame 5: C compilation rule
  state.phase = 'compile';
  state.currentFile = 'scripts/Makefile.lib';
  state.srcRef = 'scripts/Makefile.lib:252-253 (cmd_cc_o_c)';
  state.buildTarget = 'kernel/fork.o';
  frames.push({
    step: 5,
    label: 'cmd_cc_o_c compiles .c to .o',
    description: 'Individual C files are compiled by the cmd_cc_o_c rule defined at scripts/Makefile.lib:252-253. quiet_cmd_cc_o_c = "CC $(quiet_modtag) $@" (the short output). cmd_cc_o_c = "$(CC) $(c_flags) -c -o $@ $<" runs the compiler with flags assembled from arch, directory, and file-specific settings. The c_flags variable includes KBUILD_CFLAGS, per-directory ccflags-y, and per-file CFLAGS_foo.o.',
    highlights: ['build-target'],
    data: cloneState(state),
  });

  // Frame 6: Dependency tracking
  state.srcRef = 'scripts/Makefile.build:219-222 (C file compilation with deps)';
  state.currentFile = 'scripts/Makefile.build';
  frames.push({
    step: 6,
    label: 'if_changed_dep tracks header dependencies',
    description: 'At scripts/Makefile.build:221, the comment notes "See cmd_cc_o_c + relevant part of rule_cc_o_c". The if_changed_dep macro (from Kbuild.include) runs the compile command and generates a .cmd file containing the dependency list (gcc -MD output). On subsequent builds, Make reads these .cmd files to know which .o files need recompilation when headers change.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 7: built-in.a archive
  state.phase = 'link';
  state.srcRef = 'scripts/Makefile.build:138-149 (built-in.a and modules.order)';
  state.buildTarget = 'built-in.a';
  frames.push({
    step: 7,
    label: 'Object files archived into built-in.a',
    description: 'After all .o files in a directory are compiled, they are archived into built-in.a. At scripts/Makefile.build:138, subdir-builtin collects sub-directory built-in.a files. Line 148-149 define the $(obj)/built-in.a target (ifdef need-builtin). The ar command combines all real-obj-y files and sub-directory built-in.a archives. These propagate up the directory tree until the top-level vmlinux link step.',
    highlights: ['build-target'],
    data: cloneState(state),
  });

  // Frame 8: vmlinux.a and final link
  state.currentFile = 'Makefile';
  state.srcRef = 'Makefile:1302-1309 (cmd_ar_vmlinux.a, vmlinux.a target)';
  state.buildTarget = 'vmlinux';
  frames.push({
    step: 8,
    label: 'vmlinux.a assembled, vmlinux linked',
    description: 'At Makefile:1302-1303, cmd_ar_vmlinux.a archives all top-level built-in.a files into vmlinux.a (target at line 1308-1309). The final vmlinux ELF is linked by scripts/link-vmlinux.sh using the linker script arch/$(SRCARCH)/kernel/vmlinux.lds (Makefile:1293). LDFLAGS_vmlinux (line 571) accumulates linker flags. The result is the kernel binary ready for boot.',
    highlights: ['build-target'],
    data: cloneState(state),
  });

  // Frame 9: Build complete
  state.phase = 'complete';
  state.srcRef = 'Makefile:764 (__all: all completed)';
  frames.push({
    step: 9,
    label: 'Build complete: vmlinux produced',
    description: 'The recursive Kbuild process is complete. The flow was: Makefile __all (line 764) -> all -> vmlinux -> vmlinux.a -> per-directory built-in.a -> individual .o files compiled by cmd_cc_o_c (scripts/Makefile.lib:252). Each directory was visited via scripts/Makefile.build, which processed obj-y/obj-m lists to determine what to compile, archive, and link.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: config-dependency-resolution
// How Kconfig resolves dependencies (depends on, select, imply)
// Trace: sym_check_deps() -> sym_calc_value() -> expr_calc_value()
// ---------------------------------------------------------------------------
function generateConfigDependencyResolution(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: KbuildState = {
    phase: 'parse',
    currentFile: 'scripts/kconfig/symbol.c',
    symbols: [],
    dependencies: [],
    buildTarget: '',
    srcRef: '',
  };

  // Frame 0: Dependency model overview
  state.srcRef = 'scripts/kconfig/symbol.c:411 (sym_calc_value entry)';
  frames.push({
    step: 0,
    label: 'Kconfig dependency model: depends on, select, imply',
    description: 'Kconfig has three dependency mechanisms. "depends on" (dir_dep) gates visibility and constrains values -- a symbol cannot be y if its dependency is n. "select" (rev_dep) force-enables a symbol when the selector is enabled, regardless of dependencies. "imply" (implied) is a weak select that suggests enablement but can be overridden. sym_calc_value() at scripts/kconfig/symbol.c:411 resolves all three.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 1: sym_check_deps entry
  state.phase = 'dep-check';
  state.srcRef = 'scripts/kconfig/symbol.c:1307 (sym_check_deps)';
  state.symbols = ['CONFIG_INET'];
  state.dependencies = ['CONFIG_INET depends on CONFIG_NET'];
  frames.push({
    step: 1,
    label: 'sym_check_deps() detects circular dependencies',
    description: 'sym_check_deps() at scripts/kconfig/symbol.c:1307 checks for circular dependency chains. It uses SYMBOL_CHECK and SYMBOL_CHECKED flags (lines 1312-1317) to track visited symbols during DFS traversal. If SYMBOL_CHECK is already set when revisited, sym_check_print_recursive() at line 1313 prints the circular chain. For choice groups (line 1319-1325), it delegates to the main choice symbol.',
    highlights: ['dep-list'],
    data: cloneState(state),
  });

  // Frame 2: sym_check_sym_deps walks expressions
  state.srcRef = 'scripts/kconfig/symbol.c:1214 (sym_check_sym_deps)';
  state.dependencies = ['CONFIG_INET depends on CONFIG_NET', 'dir_dep: CONFIG_NET', 'rev_dep: (none)', 'implied: (none)'];
  frames.push({
    step: 2,
    label: 'sym_check_sym_deps() walks dir_dep, rev_dep, implied',
    description: 'sym_check_sym_deps() at scripts/kconfig/symbol.c:1214 systematically checks all dependency expressions. It pushes to dep_stack (line 1220), then checks sym->dir_dep.expr (line 1222-1225 for "depends on"), sym->rev_dep.expr (line 1227-1230 for "select"), and sym->implied.expr (line 1232-1234 for "imply"). Each expression tree is walked by sym_check_expr_deps() which recursively calls sym_check_deps() on referenced symbols.',
    highlights: ['dep-list'],
    data: cloneState(state),
  });

  // Frame 3: sym_calc_value starts evaluation
  state.phase = 'resolve';
  state.srcRef = 'scripts/kconfig/symbol.c:411-423 (sym_calc_value init)';
  state.symbols = ['CONFIG_INET', 'CONFIG_NET'];
  frames.push({
    step: 3,
    label: 'sym_calc_value() evaluates symbol from dependencies',
    description: 'sym_calc_value() at scripts/kconfig/symbol.c:411 is the core value resolution function. It returns immediately if SYMBOL_VALID is set (line 420-421, memoization). It sets SYMBOL_VALID (line 423), saves oldval (line 425), initializes newval to no/0/"" based on type (lines 427-447). Then sym_calc_visibility() at line 450 evaluates all "depends on" expressions to determine the effective visibility.',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 4: expr_calc_value evaluates expressions
  state.currentFile = 'scripts/kconfig/expr.c';
  state.srcRef = 'scripts/kconfig/expr.c:967 (expr_calc_value)';
  frames.push({
    step: 4,
    label: 'expr_calc_value() computes tristate expression results',
    description: 'expr_calc_value() at scripts/kconfig/expr.c:967 evaluates dependency expressions to tristate values (yes/mod/no). It uses caching: if e->val_is_valid (line 972), it returns the cached value. Otherwise __expr_calc_value() at line 891 dispatches by expression type: E_SYMBOL calls sym_calc_value() recursively (line 901), E_AND/E_OR combine sub-expressions (lines 903-910), E_NOT inverts (line 912), and comparison operators evaluate string/numeric relations (lines 914-959).',
    highlights: ['phase-indicator'],
    data: cloneState(state),
  });

  // Frame 5: "depends on" (dir_dep) constrains value
  state.currentFile = 'scripts/kconfig/symbol.c';
  state.srcRef = 'scripts/kconfig/symbol.c:239 (tri = expr_calc_value(sym->dir_dep.expr))';
  state.dependencies = ['CONFIG_INET depends on CONFIG_NET', 'dir_dep: CONFIG_NET=y -> tri=y', 'INET visibility: y'];
  frames.push({
    step: 5,
    label: '"depends on" evaluated via dir_dep expression',
    description: 'In sym_calc_value(), sym_calc_visibility() evaluates each property\'s visible.expr via expr_calc_value() at line 125. Then at line 239, sym->dir_dep.expr is evaluated: tri = expr_calc_value(sym->dir_dep.expr). If CONFIG_INET depends on CONFIG_NET and CONFIG_NET=y, then dir_dep evaluates to y. If CONFIG_NET were n, INET\'s visibility would be n and it could not be enabled. At line 495, dir_dep is also checked against rev_dep to warn about unmet dependencies.',
    highlights: ['dep-list'],
    data: cloneState(state),
  });

  // Frame 6: "select" (rev_dep) forces enablement
  state.phase = 'select';
  state.srcRef = 'scripts/kconfig/symbol.c:248 (tri = expr_calc_value(sym->rev_dep.expr))';
  state.symbols = ['CONFIG_INET=y', 'CONFIG_NET=y', 'CONFIG_TCP_CONG_CUBIC=y'];
  state.dependencies = ['CONFIG_INET depends on CONFIG_NET', 'CONFIG_INET select CONFIG_TCP_CONG_CUBIC', 'rev_dep for TCP_CONG_CUBIC: INET=y -> forced y'];
  frames.push({
    step: 6,
    label: '"select" forces symbol via rev_dep',
    description: 'At scripts/kconfig/symbol.c:248, the reverse dependency (select) is evaluated: tri = expr_calc_value(sym->rev_dep.expr). If CONFIG_INET has "select TCP_CONG_CUBIC", then TCP_CONG_CUBIC\'s rev_dep includes INET. When INET=y, rev_dep evaluates to y, forcing TCP_CONG_CUBIC=y at line 497: newval.tri = EXPR_OR(newval.tri, sym->rev_dep.tri). This override happens even if TCP_CONG_CUBIC\'s own dependencies are unmet, which is why "select" can cause dependency warnings.',
    highlights: ['dep-list'],
    data: cloneState(state),
  });

  // Frame 7: "imply" (implied) suggests value
  state.phase = 'imply';
  state.srcRef = 'scripts/kconfig/symbol.c:257 (tri = expr_calc_value(sym->implied.expr))';
  state.dependencies = ['CONFIG_INET depends on CONFIG_NET', 'CONFIG_INET select CONFIG_TCP_CONG_CUBIC', 'CONFIG_NET imply CONFIG_INET', 'implied: weak suggestion, can be overridden'];
  frames.push({
    step: 7,
    label: '"imply" provides weak default via implied expr',
    description: 'At scripts/kconfig/symbol.c:257, the implied expression is evaluated: tri = expr_calc_value(sym->implied.expr). Unlike "select", "imply" only suggests a value -- the user can override it to n. At lines 487-491, the implied value is OR\'d with newval but then AND\'d with dir_dep: newval.tri = EXPR_OR(newval.tri, sym->implied.tri) followed by EXPR_AND(newval.tri, sym->dir_dep.tri). This ensures "imply" respects "depends on" constraints, unlike "select".',
    highlights: ['dep-list'],
    data: cloneState(state),
  });

  // Frame 8: Final value and warning check
  state.phase = 'resolve';
  state.srcRef = 'scripts/kconfig/symbol.c:495-498 (unmet dep warning, final OR with rev_dep)';
  state.symbols = ['CONFIG_INET=y', 'CONFIG_NET=y', 'CONFIG_TCP_CONG_CUBIC=y', 'CONFIG_PRINTK=y'];
  frames.push({
    step: 8,
    label: 'Final value: merge defaults, rev_dep, implied',
    description: 'At scripts/kconfig/symbol.c:495, if dir_dep < rev_dep, sym_warn_unmet_dep() warns that "select" is forcing a symbol whose dependencies are not met. Line 497 applies the final OR: newval.tri = EXPR_OR(newval.tri, sym->rev_dep.tri), ensuring "select" always wins. Line 499-500 clamps: if result is mod but type is BOOLEAN, promote to yes. The symbol\'s curr value is then set, completing resolution for this symbol.',
    highlights: ['sym-list'],
    data: cloneState(state),
  });

  // Frame 9: sym_dep_errors check
  state.phase = 'complete';
  state.srcRef = 'scripts/kconfig/conf.c:838 (sym_dep_errors)';
  state.currentFile = 'scripts/kconfig/conf.c';
  frames.push({
    step: 9,
    label: 'sym_dep_errors() validates dependency integrity',
    description: 'After all configuration modes run, conf.c:838 calls sym_dep_errors() which iterates all symbols calling sym_check_deps(). If any circular dependencies are found, the function returns true and conf.c exits with error code 1. This final validation ensures the resolved configuration is consistent: no circular deps, no impossible constraints, all "select" targets reachable.',
    highlights: [],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_COLORS: Record<string, string> = {
  parse: '#58a6ff',
  'read-config': '#3fb950',
  'calc-value': '#d2a8ff',
  'write-config': '#f0883e',
  build: '#58a6ff',
  descend: '#79c0ff',
  compile: '#3fb950',
  link: '#f0883e',
  'dep-check': '#ff7b72',
  resolve: '#d2a8ff',
  select: '#f0883e',
  imply: '#79c0ff',
  complete: '#8b949e',
};

const KCONFIG_PHASE_LABELS = [
  { id: 'parse', label: 'Parse' },
  { id: 'read-config', label: 'Read .config' },
  { id: 'calc-value', label: 'Calc Value' },
  { id: 'write-config', label: 'Write' },
  { id: 'complete', label: 'Done' },
];

const BUILD_PHASE_LABELS = [
  { id: 'build', label: 'Top Make' },
  { id: 'descend', label: 'Descend' },
  { id: 'compile', label: 'Compile' },
  { id: 'link', label: 'Link' },
  { id: 'complete', label: 'Done' },
];

const DEP_PHASE_LABELS = [
  { id: 'parse', label: 'Model' },
  { id: 'dep-check', label: 'Check Deps' },
  { id: 'resolve', label: 'Resolve' },
  { id: 'select', label: 'Select' },
  { id: 'imply', label: 'Imply' },
  { id: 'complete', label: 'Done' },
];

function getPhaseLabels(phase: string): { id: string; label: string }[] {
  if (['build', 'descend', 'compile', 'link'].includes(phase)) {
    return BUILD_PHASE_LABELS;
  }
  if (['dep-check', 'select', 'imply'].includes(phase)) {
    return DEP_PHASE_LABELS;
  }
  // Check if the phase appears in dep labels
  if (phase === 'resolve') return DEP_PHASE_LABELS;
  return KCONFIG_PHASE_LABELS;
}

function getActivePhaseIndex(phase: string, labels: { id: string; label: string }[]): number {
  const idx = labels.findIndex(l => l.id === phase);
  return idx >= 0 ? idx : 0;
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  container.innerHTML = '';
  const data = frame.data as KbuildState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Kbuild & Kconfig System';
  container.appendChild(title);

  // --- Mode indicator (current file) ---
  const modeTop = margin.top + 28;
  const modeWidth = 280;
  const modeHeight = 30;
  const modeColor = PHASE_COLORS[data.phase] || '#30363d';

  const modeRect = document.createElementNS(NS, 'rect');
  modeRect.setAttribute('x', String(margin.left));
  modeRect.setAttribute('y', String(modeTop));
  modeRect.setAttribute('width', String(modeWidth));
  modeRect.setAttribute('height', String(modeHeight));
  modeRect.setAttribute('rx', '6');
  modeRect.setAttribute('fill', modeColor);
  let modeCls = 'anim-mode';
  if (frame.highlights.includes('phase-indicator')) modeCls += ' anim-highlight';
  modeRect.setAttribute('class', modeCls);
  container.appendChild(modeRect);

  const modeText = document.createElementNS(NS, 'text');
  modeText.setAttribute('x', String(margin.left + modeWidth / 2));
  modeText.setAttribute('y', String(modeTop + 20));
  modeText.setAttribute('text-anchor', 'middle');
  modeText.setAttribute('class', 'anim-mode');
  modeText.setAttribute('fill', '#e6edf3');
  modeText.textContent = data.currentFile;
  container.appendChild(modeText);

  // --- Symbols (displayed as registers) ---
  if (data.symbols.length > 0) {
    const regTop = margin.top + 28;
    const regLeft = width - margin.right - 280;

    const regTitle = document.createElementNS(NS, 'text');
    regTitle.setAttribute('x', String(regLeft));
    regTitle.setAttribute('y', String(regTop));
    regTitle.setAttribute('class', 'anim-cpu-label');
    regTitle.textContent = data.buildTarget ? 'Build Variables' : 'Config Symbols';
    container.appendChild(regTitle);

    const maxShow = Math.min(data.symbols.length, 5);
    for (let i = 0; i < maxShow; i++) {
      const ry = regTop + 8 + i * 20;
      const isHighlighted = frame.highlights.includes('sym-list');

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(regLeft));
      rect.setAttribute('y', String(ry));
      rect.setAttribute('width', '270');
      rect.setAttribute('height', '16');
      rect.setAttribute('rx', '2');
      rect.setAttribute('fill', isHighlighted ? '#1f6feb' : '#21262d');
      let regCls = 'anim-register';
      if (isHighlighted) regCls += ' anim-highlight';
      rect.setAttribute('class', regCls);
      container.appendChild(rect);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(regLeft + 4));
      label.setAttribute('y', String(ry + 12));
      label.setAttribute('fill', '#8b949e');
      label.setAttribute('font-size', '10');
      label.setAttribute('class', 'anim-register');
      label.textContent = data.symbols[i];
      container.appendChild(label);
    }
  }

  // --- Phase flow diagram ---
  const phaseLabels = getPhaseLabels(data.phase);
  const flowTop = modeTop + modeHeight + 25;
  const phaseCount = phaseLabels.length;
  const phaseWidth = Math.min(120, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(data.phase, phaseLabels);

  phaseLabels.forEach((phase, i) => {
    const px = margin.left + i * (phaseWidth + 6);
    const isActive = i === activeIndex;
    const isPast = activeIndex > 0 && i < activeIndex;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(px));
    rect.setAttribute('y', String(flowTop));
    rect.setAttribute('width', String(phaseWidth));
    rect.setAttribute('height', String(phaseHeight));
    rect.setAttribute('rx', '4');
    let blockClass = 'anim-block';
    if (isActive) {
      blockClass += ' anim-block-allocated anim-highlight';
    } else if (isPast) {
      blockClass += ' anim-block-allocated';
    } else {
      blockClass += ' anim-block-free';
    }
    rect.setAttribute('class', blockClass);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(px + phaseWidth / 2));
    label.setAttribute('y', String(flowTop + phaseHeight / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'anim-cpu-label');
    label.textContent = phase.label;
    container.appendChild(label);

    // Arrow between phases
    if (i < phaseCount - 1) {
      const arrowX = px + phaseWidth;
      const arrowY = flowTop + phaseHeight / 2;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(arrowX));
      line.setAttribute('y1', String(arrowY));
      line.setAttribute('x2', String(arrowX + 6));
      line.setAttribute('y2', String(arrowY));
      line.setAttribute('stroke', '#8b949e');
      line.setAttribute('stroke-width', '2');
      container.appendChild(line);
    }
  });

  // --- Build target indicator ---
  if (data.buildTarget) {
    const targetTop = flowTop + phaseHeight + 18;
    const targetText = document.createElementNS(NS, 'text');
    targetText.setAttribute('x', String(margin.left));
    targetText.setAttribute('y', String(targetTop));
    targetText.setAttribute('fill', '#e6edf3');
    targetText.setAttribute('font-size', '12');
    let targetCls = 'anim-cpu-label';
    if (frame.highlights.includes('build-target')) targetCls += ' anim-highlight';
    targetText.setAttribute('class', targetCls);
    targetText.textContent = `Target: ${data.buildTarget}`;
    container.appendChild(targetText);
  }

  // --- Dependencies (displayed as stack frames) ---
  if (data.dependencies.length > 0) {
    const depTop = flowTop + phaseHeight + (data.buildTarget ? 36 : 18);
    const depLabel = document.createElementNS(NS, 'text');
    depLabel.setAttribute('x', String(margin.left));
    depLabel.setAttribute('y', String(depTop));
    depLabel.setAttribute('class', 'anim-cpu-label');
    depLabel.textContent = 'Dependencies:';
    container.appendChild(depLabel);

    const stackEntryHeight = 20;
    const stackEntryWidth = 320;

    data.dependencies.forEach((entry, i) => {
      const sy = depTop + 8 + i * (stackEntryHeight + 2);
      const sx = margin.left + i * 8;
      const isHighlighted = frame.highlights.includes('dep-list');

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(sx));
      rect.setAttribute('y', String(sy));
      rect.setAttribute('width', String(stackEntryWidth));
      rect.setAttribute('height', String(stackEntryHeight));
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', '#1f4068');
      rect.setAttribute('opacity', '0.8');
      let stackCls = 'anim-stack-frame';
      if (isHighlighted) stackCls += ' anim-highlight';
      rect.setAttribute('class', stackCls);
      container.appendChild(rect);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(sx + 6));
      text.setAttribute('y', String(sy + stackEntryHeight / 2 + 4));
      text.setAttribute('fill', '#e6edf3');
      text.setAttribute('font-size', '10');
      text.setAttribute('class', 'anim-stack-frame');
      text.textContent = entry;
      container.appendChild(text);
    });
  }
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const SCENARIOS: AnimationScenario[] = [
  { id: 'kconfig-parsing', label: 'Kconfig Parsing (.config generation)' },
  { id: 'make-build-flow', label: 'Make/Kbuild Recursive Build' },
  { id: 'config-dependency-resolution', label: 'Config Dependency Resolution' },
];

const kbuildKconfig: AnimationModule = {
  config: {
    id: 'kbuild-kconfig',
    title: 'Kbuild & Kconfig System',
    skillName: 'kbuild-and-kconfig',
  },
  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'make-build-flow': return generateMakeBuildFlow();
      case 'config-dependency-resolution': return generateConfigDependencyResolution();
      case 'kconfig-parsing':
      default: return generateKconfigParsing();
    }
  },
  renderFrame,
  getScenarios: () => SCENARIOS,
};

export default kbuildKconfig;
