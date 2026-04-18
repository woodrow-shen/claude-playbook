import type { AnimationModule, AnimationFrame, AnimationScenario } from '../types.js';

export interface CryptoApiState {
  phase: 'lookup' | 'allocate' | 'init' | 'setkey' | 'encrypt' | 'walk' | 'complete' | 'template' | 'parse' | 'instantiate' | 'register';
  algorithm: string;
  tfm: string;
  scatterlist: string[];
  blockSize: number;
  keySize: number;
  cipherMode: string;
  srcRef: string;
}

function cloneState(s: CryptoApiState): CryptoApiState {
  return {
    phase: s.phase,
    algorithm: s.algorithm,
    tfm: s.tfm,
    scatterlist: [...s.scatterlist],
    blockSize: s.blockSize,
    keySize: s.keySize,
    cipherMode: s.cipherMode,
    srcRef: s.srcRef,
  };
}

// ---------------------------------------------------------------------------
// Scenario: algorithm-lookup
// Trace crypto_alg_lookup -> crypto_find_alg -> crypto_alloc_tfm_node -> crypto_create_tfm_node
// ---------------------------------------------------------------------------
function generateAlgorithmLookup(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CryptoApiState = {
    phase: 'lookup',
    algorithm: 'cbc(aes)',
    tfm: 'none',
    scatterlist: [],
    blockSize: 16,
    keySize: 32,
    cipherMode: 'skcipher',
    srcRef: '',
  };

  // Frame 0: crypto_alloc_skcipher entry
  state.srcRef = 'include/crypto/skcipher.h:280 (crypto_alloc_skcipher)';
  frames.push({
    step: 0,
    label: 'crypto_alloc_skcipher("cbc(aes)")',
    description: 'A kernel subsystem calls crypto_alloc_skcipher("cbc(aes)", 0, 0) declared at include/crypto/skcipher.h:280. This is the high-level API for allocating a symmetric key cipher handle. It delegates to crypto_alloc_tfm_node() at crypto/api.c:627 with the skcipher frontend type and NUMA_NO_NODE.',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 1: crypto_find_alg
  state.srcRef = 'crypto/api.c:589-601 (crypto_find_alg)';
  frames.push({
    step: 1,
    label: 'crypto_find_alg() resolves algorithm',
    description: 'crypto_alloc_tfm_node() at crypto/api.c:637 calls crypto_find_alg("cbc(aes)", frontend, type, mask). At crypto/api.c:589, crypto_find_alg() adjusts type/mask using frontend->maskclear and frontend->maskset to match skcipher algorithms, then delegates to crypto_alg_mod_lookup() at line 600.',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 2: crypto_alg_mod_lookup -> crypto_larval_lookup
  state.srcRef = 'crypto/api.c:338-368 (crypto_alg_mod_lookup) -> crypto/api.c:290-322 (crypto_larval_lookup)';
  frames.push({
    step: 2,
    label: 'crypto_alg_mod_lookup() searches algorithm list',
    description: 'crypto_alg_mod_lookup() at crypto/api.c:338 sets CRYPTO_ALG_INTERNAL mask, then calls crypto_larval_lookup() at line 354. crypto_larval_lookup() at line 290 first tries crypto_alg_lookup(). If not found, it calls request_module("crypto-cbc(aes)") at line 303 to auto-load the kernel module providing the algorithm.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: __crypto_alg_lookup traverses crypto_alg_list
  state.srcRef = 'crypto/api.c:58-92 (__crypto_alg_lookup) -> crypto/api.c:253-288 (crypto_alg_lookup)';
  frames.push({
    step: 3,
    label: '__crypto_alg_lookup() scans algorithm list',
    description: 'crypto_alg_lookup() at crypto/api.c:253 acquires crypto_alg_sem read lock (line 263), then calls __crypto_alg_lookup() at line 264. __crypto_alg_lookup() at line 58 iterates crypto_alg_list via list_for_each_entry (line 65), comparing cra_name and cra_driver_name (lines 74-75). It selects the highest-priority match via cra_priority (line 76) and grabs a module reference with crypto_mod_get() at line 79.',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 4: Algorithm found, probe notification
  state.phase = 'allocate';
  state.srcRef = 'crypto/api.c:354-368 (crypto_alg_mod_lookup probe path)';
  frames.push({
    step: 4,
    label: 'Algorithm found, probing notification',
    description: 'If crypto_larval_lookup() returns a larval (algorithm still loading), crypto_alg_mod_lookup() at crypto/api.c:358 sends CRYPTO_MSG_ALG_REQUEST via crypto_probing_notify(). The cryptomgr notifier at crypto/algboss.c:50 handles this by spawning a kernel thread (cryptomgr_probe) that calls crypto_lookup_template() and tmpl->create() to instantiate composed algorithms like cbc(aes). crypto_larval_wait() at line 361 blocks until the adult algorithm is ready.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 5: crypto_create_tfm_node allocates transform
  state.srcRef = 'crypto/api.c:527-561 (crypto_create_tfm_node)';
  frames.push({
    step: 5,
    label: 'crypto_create_tfm_node() allocates transform',
    description: 'crypto_alloc_tfm_node() at crypto/api.c:643 calls crypto_create_tfm_node(alg, frontend, node). At line 535, crypto_alloc_tfmmem() allocates memory: total = frontend->tfmsize + sizeof(crypto_tfm) + frontend->extsize(alg). kzalloc_node() at crypto/api.c:515 allocates the combined buffer. The crypto_tfm is placed at mem + tfmsize (line 519), and __crt_alg is set to point back to the algorithm (line 520).',
    highlights: ['tfm-state'],
    data: cloneState(state),
  });

  // Frame 6: frontend->init_tfm initializes type-specific state
  state.phase = 'init';
  state.tfm = 'crypto_skcipher (cbc(aes))';
  state.srcRef = 'crypto/api.c:542-547 (frontend->init_tfm and cra_init)';
  frames.push({
    step: 6,
    label: 'init_tfm() initializes skcipher transform',
    description: 'crypto_create_tfm_node() at crypto/api.c:542 calls frontend->init_tfm(tfm) which for skcipher sets up the encrypt/decrypt function pointers and initializes the fallback transform if needed. If the algorithm provides cra_init (line 546), it is called to perform algorithm-specific initialization. On error, crypto_shoot_alg() at line 555 marks the algorithm as dying and the transform memory is freed.',
    highlights: ['tfm-state'],
    data: cloneState(state),
  });

  // Frame 7: Transform handle returned to caller
  state.srcRef = 'crypto/api.c:643-645 (crypto_alloc_tfm_node returns)';
  frames.push({
    step: 7,
    label: 'Transform handle returned to caller',
    description: 'crypto_create_tfm_node() returns the allocated memory pointer at crypto/api.c:559. crypto_alloc_tfm_node() at line 644 checks !IS_ERR(tfm) and returns. The caller now holds a struct crypto_skcipher* with refcount=1 (set at line 522). The transform is ready for crypto_skcipher_setkey() followed by crypto_skcipher_encrypt(). On EAGAIN error (line 651), the loop retries the entire lookup+allocate sequence.',
    highlights: ['tfm-state'],
    data: cloneState(state),
  });

  // Frame 8: Summary of crypto_alloc_tfm path
  state.srcRef = 'crypto/api.c:627-661 (crypto_alloc_tfm_node complete path)';
  frames.push({
    step: 8,
    label: 'Allocation complete: cbc(aes) ready',
    description: 'The full allocation path: crypto_alloc_skcipher() -> crypto_alloc_tfm_node() at crypto/api.c:627 -> crypto_find_alg() at line 637 -> crypto_alg_mod_lookup() -> crypto_larval_lookup() -> __crypto_alg_lookup() scanning crypto_alg_list -> crypto_create_tfm_node() at line 643 -> crypto_alloc_tfmmem() + init_tfm(). The transform object wraps the algorithm with per-use state (key, IV context). Multiple transforms can share one crypto_alg.',
    highlights: ['alg-name', 'tfm-state'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: skcipher-encrypt
// Trace crypto_skcipher_encrypt -> skcipher_walk_virt -> walk_first -> walk_done
// ---------------------------------------------------------------------------
function generateSkcipherEncrypt(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CryptoApiState = {
    phase: 'setkey',
    algorithm: 'cbc(aes)',
    tfm: 'crypto_skcipher (cbc(aes))',
    scatterlist: [],
    blockSize: 16,
    keySize: 32,
    cipherMode: 'CBC',
    srcRef: '',
  };

  // Frame 0: Set key on transform
  state.srcRef = 'crypto/skcipher.c:408-433 (crypto_skcipher_setkey)';
  frames.push({
    step: 0,
    label: 'crypto_skcipher_setkey() installs key',
    description: 'Before encryption, the caller sets the key via crypto_skcipher_setkey(tfm, key, keylen=32) at crypto/skcipher.c:408. This calls the algorithm setkey function which expands the 256-bit AES key into round keys stored in the tfm context. On success, CRYPTO_TFM_NEED_KEY is cleared at line 430. The key schedule is computed once and reused across multiple encrypt/decrypt operations.',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 1: Build skcipher_request with scatterlists
  state.phase = 'encrypt';
  state.scatterlist = ['sg[0]: page=0xffff8880 offset=0 len=4096'];
  state.srcRef = 'include/crypto/skcipher.h:691-701 (crypto_skcipher_encrypt)';
  frames.push({
    step: 1,
    label: 'Build skcipher_request with scatterlists',
    description: 'The caller allocates a skcipher_request on the stack or via kmalloc, sets src/dst scatterlists pointing to the plaintext and ciphertext buffers, sets the IV (16 bytes for AES-CBC), and cryptlen (total bytes to encrypt). Scatterlists allow non-contiguous physical pages to be encrypted without copying. The request is submitted via crypto_skcipher_encrypt(req) declared at include/crypto/skcipher.h:701.',
    highlights: ['sg-list'],
    data: cloneState(state),
  });

  // Frame 2: crypto_skcipher_encrypt entry
  state.srcRef = 'crypto/skcipher.c:435-445 (crypto_skcipher_encrypt)';
  frames.push({
    step: 2,
    label: 'crypto_skcipher_encrypt() dispatches',
    description: 'crypto_skcipher_encrypt() at crypto/skcipher.c:435 retrieves the tfm via crypto_skcipher_reqtfm(req) at line 437 and the algorithm via crypto_skcipher_alg(tfm) at line 438. It first checks CRYPTO_TFM_NEED_KEY at line 440 -- returning -ENOKEY if setkey was not called. Then at line 442, it checks whether this is an lskcipher (linear) or standard skcipher type. For standard skcipher, it calls alg->encrypt(req) at line 444.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 3: Algorithm encrypt calls skcipher_walk_virt
  state.phase = 'walk';
  state.scatterlist = ['sg[0]: page=0xffff8880 offset=0 len=4096', 'walk: total=4096 nbytes=0'];
  state.srcRef = 'crypto/skcipher.c:283-319 (skcipher_walk_virt)';
  frames.push({
    step: 3,
    label: 'skcipher_walk_virt() initializes walk',
    description: 'The AES-CBC encrypt function calls skcipher_walk_virt(walk, req, false) at crypto/skcipher.c:283 to iterate over the scatterlist data. At line 293, walk->total = req->cryptlen (4096). Lines 295-296 save the IV pointer. scatterwalk_start() at lines 305-306 initializes the source and destination scatter walkers. walk->blocksize is set to 16 (AES block size) at line 308. Finally, skcipher_walk_first() is called at line 317.',
    highlights: ['sg-list'],
    data: cloneState(state),
  });

  // Frame 4: skcipher_walk_first processes first chunk
  state.scatterlist = ['sg[0]: page=0xffff8880 offset=0 len=4096', 'walk: total=4096 nbytes=4096'];
  state.srcRef = 'crypto/skcipher.c:266-281 (skcipher_walk_first)';
  frames.push({
    step: 4,
    label: 'skcipher_walk_first() maps first chunk',
    description: 'skcipher_walk_first() at crypto/skcipher.c:266 checks !in_hardirq() (line 268) to prevent use in hard interrupt context. It clears walk->buffer (line 271) and checks IV alignment (line 272) -- if misaligned, skcipher_copy_iv() copies the IV to an aligned buffer. Then skcipher_walk_next() at line 280 is called, which calls scatterwalk_clamp() to determine bytes available in the current scatterlist segment and maps the source/destination pages via skcipher_next_fast() at line 241.',
    highlights: ['sg-list'],
    data: cloneState(state),
  });

  // Frame 5: Algorithm processes block with walk data
  state.scatterlist = [
    'sg[0]: page=0xffff8880 offset=0 len=4096',
    'walk: total=4096 nbytes=4096 (processing)',
    'block[0..255]: AES-CBC encrypt 256 blocks',
  ];
  state.srcRef = 'crypto/skcipher.c:190-208 (skcipher_next_fast)';
  frames.push({
    step: 5,
    label: 'AES-CBC encrypts blocks via walk',
    description: 'skcipher_next_fast() at crypto/skcipher.c:190 checks if src and dst pages differ (line 194-197). If same page, walk->in and walk->out point to the same mapped address (line 200). If different, SKCIPHER_WALK_DIFF flag is set (line 203). The algorithm encrypt function now has walk->src.virt.addr and walk->dst.virt.addr pointing to the data. For AES-CBC, it XORs each 16-byte block with the previous ciphertext (or IV for first block), then AES-encrypts in place. This processes walk->nbytes (up to 4096) at a time.',
    highlights: ['sg-list'],
    data: cloneState(state),
  });

  // Frame 6: skcipher_walk_done advances walk
  state.scatterlist = [
    'sg[0]: page=0xffff8880 offset=0 len=4096 (done)',
    'walk: total=0 nbytes=0',
  ];
  state.srcRef = 'crypto/skcipher.c:71-141 (skcipher_walk_done)';
  frames.push({
    step: 6,
    label: 'skcipher_walk_done() completes walk',
    description: 'After processing, the algorithm calls skcipher_walk_done(walk, 0) at crypto/skcipher.c:71 with res=0 (all bytes processed). At line 73, n = walk->nbytes (4096). Line 80-81: n -= res (n stays 4096), total = walk->total - n (becomes 0). Since total is 0, the walk is finished. At line 128, the fast path checks: if walk->buffer and walk->page are NULL, skip cleanup. If walk->iv was copied (line 131), the final IV is copied back to walk->oiv for CBC chaining.',
    highlights: ['sg-list'],
    data: cloneState(state),
  });

  // Frame 7: Walk continues if more scatterlist entries
  state.phase = 'walk';
  state.srcRef = 'crypto/skcipher.c:118-124 (skcipher_walk_done continuation)';
  frames.push({
    step: 7,
    label: 'Walk loop: process remaining segments',
    description: 'If total > 0 after skcipher_walk_done() at crypto/skcipher.c:118, more data remains. scatterwalk_advance() (line 87) moves to the next scatterlist entry. If SKCIPHER_WALK_SLEEP is set (line 119), cond_resched() yields the CPU to avoid latency spikes. Walk flags are cleared (line 121-122) and skcipher_walk_next() at line 123 maps the next segment. The encrypt function loops: while (walk.nbytes) { process; skcipher_walk_done(); }. For our 4096-byte single-segment case, the walk completes in one iteration.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 8: Encryption complete
  state.phase = 'complete';
  state.scatterlist = ['sg[0]: page=0xffff8880 offset=0 len=4096 (encrypted)'];
  state.srcRef = 'crypto/skcipher.c:435-445 (crypto_skcipher_encrypt returns 0)';
  frames.push({
    step: 8,
    label: 'Encryption complete: 4096 bytes encrypted',
    description: 'The algorithm encrypt function returns 0 (success). crypto_skcipher_encrypt() at crypto/skcipher.c:444 returns this to the caller. The destination scatterlist now contains the ciphertext. The full path: crypto_skcipher_encrypt() -> alg->encrypt(req) -> skcipher_walk_virt() -> skcipher_walk_first() -> [process blocks] -> skcipher_walk_done() -> return 0. The walk mechanism handled page mapping, alignment, and scatterlist traversal transparently.',
    highlights: ['tfm-state'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// Scenario: template-instantiation
// Trace crypto_lookup_template -> tmpl->create -> crypto_register_instance for cbc(aes)
// ---------------------------------------------------------------------------
function generateTemplateInstantiation(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];
  const state: CryptoApiState = {
    phase: 'lookup',
    algorithm: 'cbc(aes)',
    tfm: 'none',
    scatterlist: [],
    blockSize: 16,
    keySize: 32,
    cipherMode: 'cbc(aes)',
    srcRef: '',
  };

  // Frame 0: Request for composed algorithm "cbc(aes)"
  state.srcRef = 'crypto/api.c:290-322 (crypto_larval_lookup)';
  frames.push({
    step: 0,
    label: 'Request for composed algorithm cbc(aes)',
    description: 'When crypto_larval_lookup("cbc(aes)") at crypto/api.c:290 cannot find the algorithm in crypto_alg_list, and crypto_alg_lookup() returns NULL at line 301, it calls request_module("crypto-cbc(aes)") at line 303 to try loading the module. If that fails, crypto_larval_add() at line 317 creates a larval placeholder and adds it to crypto_alg_list. The larval has CRYPTO_ALG_LARVAL flag and a completion for waiters.',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 1: crypto_probing_notify triggers cryptomgr
  state.srcRef = 'crypto/api.c:324-336 (crypto_probing_notify) -> crypto/api.c:358';
  frames.push({
    step: 1,
    label: 'Probing notification triggers cryptomgr',
    description: 'crypto_alg_mod_lookup() at crypto/api.c:358 calls crypto_probing_notify(CRYPTO_MSG_ALG_REQUEST, larval). At line 328, blocking_notifier_call_chain() notifies the crypto manager. If no handler responds (NOTIFY_DONE), request_module("cryptomgr") at line 330 loads the crypto manager module, then retries the notification at line 331. The cryptomgr_schedule_probe() callback at crypto/algboss.c:75 parses the algorithm name to extract template and arguments.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 2: cryptomgr_probe parses "cbc(aes)"
  state.phase = 'parse';
  state.srcRef = 'crypto/algboss.c:75-130 (cryptomgr_schedule_probe parses name)';
  frames.push({
    step: 2,
    label: 'cryptomgr parses "cbc(aes)" into template+args',
    description: 'cryptomgr_schedule_probe() at crypto/algboss.c:75 parses the algorithm name "cbc(aes)". It finds the opening parenthesis to extract template name "cbc" (line 79-80 via the name pointer) and the inner algorithm "aes" as an attribute. A cryptomgr_param struct is allocated with param->template = "cbc" and param->attrs[0] = "aes". A kernel thread is spawned (line 125) running cryptomgr_probe().',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 3: crypto_lookup_template finds "cbc" template
  state.phase = 'template';
  state.cipherMode = 'cbc (template)';
  state.srcRef = 'crypto/algapi.c:617-641 (crypto_lookup_template -> __crypto_lookup_template)';
  frames.push({
    step: 3,
    label: 'crypto_lookup_template("cbc") finds template',
    description: 'cryptomgr_probe() at crypto/algboss.c:56 calls crypto_lookup_template(param->template). At crypto/algapi.c:636, crypto_lookup_template() calls try_then_request_module(__crypto_lookup_template("cbc"), "crypto-cbc"). __crypto_lookup_template() at line 617 acquires crypto_alg_sem read lock (line 621), then iterates crypto_template_list via list_for_each_entry (line 622) comparing q->name with "cbc". On match, crypto_tmpl_get() at line 625 grabs a reference.',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 4: tmpl->create() called to instantiate cbc(aes)
  state.phase = 'instantiate';
  state.srcRef = 'crypto/algboss.c:60-62 (tmpl->create call)';
  frames.push({
    step: 4,
    label: 'tmpl->create() instantiates cbc(aes)',
    description: 'cryptomgr_probe() at crypto/algboss.c:61 calls tmpl->create(tmpl, param->tb). For CBC, the create function parses the attribute table to find the inner cipher "aes", looks up the AES algorithm via crypto_alg_mod_lookup(), allocates a crypto_instance with spawns pointing to the AES algorithm, and sets up the CBC encrypt/decrypt functions that wrap the underlying block cipher. The loop at line 62 retries on -EAGAIN.',
    highlights: ['tfm-state'],
    data: cloneState(state),
  });

  // Frame 5: crypto_instance setup with spawn
  state.srcRef = 'include/crypto/algapi.h:56-72 (struct crypto_instance and crypto_spawn)';
  frames.push({
    step: 5,
    label: 'Instance created with spawn dependency',
    description: 'The CBC template create function allocates a crypto_instance (include/crypto/algapi.h:56) containing: alg (the composed algorithm struct), tmpl (back-pointer to CBC template), and spawns (linked list of crypto_spawn at line 68). Each spawn holds a reference to a dependency -- here, the AES block cipher algorithm. The spawn mechanism ensures that if AES is unregistered, the cbc(aes) instance is automatically torn down via crypto_remove_spawns() at crypto/algapi.c:165.',
    highlights: [],
    data: cloneState(state),
  });

  // Frame 6: crypto_register_instance registers the composed algorithm
  state.srcRef = 'crypto/algapi.c:643-704 (crypto_register_instance)';
  frames.push({
    step: 6,
    label: 'crypto_register_instance() registers cbc(aes)',
    description: 'crypto_register_instance() at crypto/algapi.c:643 validates the algorithm via crypto_check_alg() at line 652, sets CRYPTO_ALG_INSTANCE flag (line 657), and sets cra_destroy to crypto_destroy_instance (line 658). Under crypto_alg_sem write lock (line 660), it iterates spawns at line 663 to link each spawn to the instance, then calls __crypto_register_alg() at line 682 to add the algorithm to crypto_alg_list. The instance is added to tmpl->instances at line 688.',
    highlights: ['alg-name'],
    data: cloneState(state),
  });

  // Frame 7: Larval completed, waiters wake up
  state.srcRef = 'crypto/algboss.c:67-71 (cryptomgr_probe completion)';
  frames.push({
    step: 7,
    label: 'Larval completed, waiters unblocked',
    description: 'After crypto_register_instance() succeeds, __crypto_register_alg() finds the matching larval in crypto_alg_list and sets larval->adult to the new algorithm. complete_all(&larval->completion) wakes all threads blocked in crypto_larval_wait() at crypto/api.c:213. The original caller of crypto_alloc_skcipher("cbc(aes)") now proceeds with crypto_create_tfm_node() to allocate a transform from the newly registered composed algorithm.',
    highlights: ['tfm-state'],
    data: cloneState(state),
  });

  // Frame 8: Template instantiation complete
  state.phase = 'register';
  state.tfm = 'crypto_instance (cbc(aes))';
  state.srcRef = 'crypto/algapi.c:682-688 (algorithm registered in crypto_alg_list)';
  frames.push({
    step: 8,
    label: 'cbc(aes) registered and available',
    description: 'The composed algorithm cbc(aes) is now in crypto_alg_list. Future calls to crypto_alloc_skcipher("cbc(aes)") will find it via __crypto_alg_lookup() at crypto/api.c:58 without triggering template instantiation. The full template path: crypto_probing_notify() -> cryptomgr_schedule_probe() -> cryptomgr_probe() -> crypto_lookup_template("cbc") -> tmpl->create() -> crypto_register_instance(). The instance depends on the AES algorithm through the spawn mechanism.',
    highlights: ['alg-name', 'tfm-state'],
    data: cloneState(state),
  });

  return frames;
}

// ---------------------------------------------------------------------------
// SVG Rendering
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';

const PHASE_LABELS = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'allocate', label: 'Allocate' },
  { id: 'init', label: 'Init' },
  { id: 'setkey', label: 'SetKey' },
  { id: 'encrypt', label: 'Encrypt' },
  { id: 'walk', label: 'Walk' },
  { id: 'complete', label: 'Complete' },
];

function getActivePhaseIndex(phase: string): number {
  switch (phase) {
    case 'lookup': return 0;
    case 'parse': return 0;
    case 'allocate': return 1;
    case 'template': return 1;
    case 'init': return 2;
    case 'instantiate': return 2;
    case 'setkey': return 3;
    case 'register': return 3;
    case 'encrypt': return 4;
    case 'walk': return 5;
    case 'complete': return 6;
    default: return -1;
  }
}

function renderFrame(container: SVGGElement, frame: AnimationFrame, width: number, height: number): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  const data = frame.data as CryptoApiState;
  const margin = { top: 10, left: 15, right: 15, bottom: 10 };
  const usableWidth = width - margin.left - margin.right;

  // Title
  const title = document.createElementNS(NS, 'text');
  title.setAttribute('x', String(width / 2));
  title.setAttribute('y', '18');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'anim-title');
  title.textContent = 'Kernel Crypto API';
  container.appendChild(title);

  // --- Algorithm/Transform info ---
  const infoTop = margin.top + 28;
  const infoLeft = margin.left;

  const infoEntries = [
    { name: 'Algorithm', value: data.algorithm, id: 'alg-name' },
    { name: 'TFM', value: data.tfm, id: 'tfm-state' },
    { name: 'Mode', value: data.cipherMode, id: 'cipher-mode' },
    { name: 'Block/Key', value: `${data.blockSize}B / ${data.keySize}B`, id: 'sizes' },
  ];

  infoEntries.forEach((entry, i) => {
    const ry = infoTop + i * 20;
    const isHighlighted = frame.highlights.includes(entry.id);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(infoLeft));
    rect.setAttribute('y', String(ry));
    rect.setAttribute('width', '350');
    rect.setAttribute('height', '16');
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', isHighlighted ? '#1f6feb' : '#21262d');
    let cls = 'anim-register';
    if (isHighlighted) cls += ' anim-highlight';
    rect.setAttribute('class', cls);
    container.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(infoLeft + 4));
    label.setAttribute('y', String(ry + 12));
    label.setAttribute('fill', '#8b949e');
    label.setAttribute('font-size', '10');
    label.setAttribute('class', 'anim-register');
    label.textContent = `${entry.name}: ${entry.value}`;
    container.appendChild(label);
  });

  // --- Phase flow diagram ---
  const flowTop = infoTop + infoEntries.length * 20 + 20;
  const phaseCount = PHASE_LABELS.length;
  const phaseWidth = Math.min(85, (usableWidth - (phaseCount - 1) * 6) / phaseCount);
  const phaseHeight = 28;
  const activeIndex = getActivePhaseIndex(data.phase);

  PHASE_LABELS.forEach((phase, i) => {
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

  // --- Current phase label ---
  const funcTop = flowTop + phaseHeight + 18;
  const funcText = document.createElementNS(NS, 'text');
  funcText.setAttribute('x', String(margin.left));
  funcText.setAttribute('y', String(funcTop));
  funcText.setAttribute('fill', '#e6edf3');
  funcText.setAttribute('font-size', '12');
  funcText.setAttribute('class', 'anim-cpu-label');
  funcText.textContent = `Phase: ${data.phase}`;
  container.appendChild(funcText);

  // --- Scatterlist entries ---
  const sgTop = funcTop + 16;
  const sgLabel = document.createElementNS(NS, 'text');
  sgLabel.setAttribute('x', String(margin.left));
  sgLabel.setAttribute('y', String(sgTop));
  sgLabel.setAttribute('class', 'anim-cpu-label');
  sgLabel.textContent = 'Scatterlist:';
  container.appendChild(sgLabel);

  const sgEntryHeight = 20;
  const sgEntryWidth = 350;

  data.scatterlist.forEach((entry, i) => {
    const sy = sgTop + 8 + i * (sgEntryHeight + 2);
    const sx = margin.left + i * 10;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(sx));
    rect.setAttribute('y', String(sy));
    rect.setAttribute('width', String(sgEntryWidth));
    rect.setAttribute('height', String(sgEntryHeight));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#161b22');
    rect.setAttribute('stroke', '#30363d');
    let sgCls = 'anim-stack-frame';
    if (frame.highlights.includes('sg-list')) sgCls += ' anim-highlight';
    rect.setAttribute('class', sgCls);
    container.appendChild(rect);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(sx + 6));
    text.setAttribute('y', String(sy + 14));
    text.setAttribute('fill', '#e6edf3');
    text.setAttribute('font-size', '10');
    text.setAttribute('class', 'anim-stack-frame');
    text.textContent = entry;
    container.appendChild(text);
  });
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------
const cryptoApiModule: AnimationModule = {
  config: {
    id: 'crypto-api',
    title: 'Kernel Crypto API',
    skillName: 'crypto-api',
  },

  getScenarios(): AnimationScenario[] {
    return [
      { id: 'algorithm-lookup', label: 'Algorithm Lookup & TFM Allocation' },
      { id: 'skcipher-encrypt', label: 'Symmetric Cipher Encryption' },
      { id: 'template-instantiation', label: 'Template Instantiation (cbc(aes))' },
    ];
  },

  generateFrames(scenario?: string): AnimationFrame[] {
    switch (scenario) {
      case 'skcipher-encrypt':
        return generateSkcipherEncrypt();
      case 'template-instantiation':
        return generateTemplateInstantiation();
      case 'algorithm-lookup':
      default:
        return generateAlgorithmLookup();
    }
  },

  renderFrame,
};

export default cryptoApiModule;
