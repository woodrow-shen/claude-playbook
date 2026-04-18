---
name: crypto-api
description: Explore the kernel cryptographic API for ciphers, hashes, and algorithm management
realm: security
category: crypto
difficulty: advanced
xp: 300
estimated_minutes: 120
prerequisites:
  - lsm-framework
unlocks: []
kernel_files:
  - crypto/api.c
  - crypto/algapi.c
  - crypto/skcipher.c
  - include/linux/crypto.h
doc_files:
  - Documentation/crypto/index.rst
  - Documentation/crypto/architecture.rst
badge: Crypto Warden
tags:
  - crypto
  - cipher
  - hash
  - algorithm
---

# Crypto API

The Linux kernel's cryptographic API provides a unified framework for
encryption, hashing, and other cryptographic operations used throughout the
kernel. Disk encryption (dm-crypt), network protocols (IPsec, TLS), filesystem
encryption (fscrypt), and integrity verification all rely on this subsystem.
The API abstracts algorithm implementations behind a type system, allowing
hardware accelerators and optimized software implementations to be selected
transparently.

This is an advanced skill because the crypto API uses a layered architecture
with templates, algorithm types, and asynchronous operation patterns. Mastering
it requires understanding how algorithms are registered, looked up, and
instantiated, as well as the scatterlist-based data processing model.

## Quest Briefing

Cryptography in the kernel is not optional -- it protects your disks, your
network connections, and your filesystem metadata. The crypto API is the engine
behind all of it. Understanding how the kernel discovers, instantiates, and
uses cryptographic algorithms lets you write drivers for hardware accelerators,
debug crypto failures, and audit the security of kernel subsystems that depend
on cryptographic operations.

## Learning Objectives

After completing this skill, you will be able to:

- Describe the crypto API architecture: algorithms, types, transforms, and templates
- Trace algorithm registration through crypto_register_alg()
- Explain the algorithm lookup and instantiation path
- Understand the skcipher (symmetric key cipher) interface for encryption
- Describe FIPS mode enforcement and algorithm self-testing

## Core Concepts

### Algorithm Registration

All crypto algorithms live on the global crypto_alg_list (crypto/api.c line 26),
protected by the crypto_alg_sem read-write semaphore.

Registration flow in crypto/algapi.c:

crypto_check_alg() (line 32) validates a new algorithm:
- Ensures cra_name and cra_driver_name are set
- Checks alignmask is valid (power of 2 minus 1)
- Enforces MAX_ALGAPI_ALIGNMASK and MAX_ALGAPI_BLOCKSIZE limits
- For cipher types, enforces stricter MAX_CIPHER_ALIGNMASK/BLOCKSIZE
- Initializes the reference count with refcount_set()

In FIPS mode, crypto_check_module_sig() (line 25) verifies the module
signature; unsigned modules cause a kernel panic.

The crypto_chain blocking notifier (crypto/api.c line 31) broadcasts
CRYPTO_MSG_ALG_REGISTER events so templates can create derived algorithms.

### Algorithm Lookup

When code requests a crypto algorithm (e.g., "aes" or "xts(aes)"):

__crypto_alg_lookup() (crypto/api.c line 58) searches crypto_alg_list:
1. Iterates all registered algorithms
2. Skips moribund (being removed) algorithms
3. Matches by cra_driver_name (exact match, highest priority) or
   cra_name (fuzzy match, highest cra_priority wins)
4. Calls crypto_mod_get() to take a module reference

crypto_alg_lookup() (line 253) is the public wrapper. If no algorithm is
found, crypto_larval_lookup() (line 290) creates a "larval" placeholder and
triggers module loading via crypto_probing_notify() (line 324).

The larval mechanism (crypto_larval_alloc at line 104):
- Creates a temporary crypto_alg marked as CRYPTO_ALG_LARVAL
- Registers it on crypto_alg_list as a placeholder
- crypto_larval_wait() (line 201) blocks until the real algorithm registers
  or a timeout expires

### Transform Allocation

A transform (crypto_tfm) is an instantiated algorithm with state:

__crypto_alloc_tfm() (crypto/api.c line 440):
1. Allocates memory: crypto_alloc_tfmmem() (line 503) allocates the tfm
   plus type-specific context
2. Sets up the transform's operations via alg->cra_type->init(tfm)
3. Returns the typed transform wrapper (e.g., crypto_skcipher)

crypto_alloc_base() (line 469) is the generic allocator for basic transforms.
It loops: lookup algorithm, allocate tfm, retry if larval resolution needed.

crypto_destroy_tfm() (line 671) tears down a transform, calling
crypto_exit_ops() (line 371) and freeing the memory.

### Symmetric Key Ciphers (skcipher)

The skcipher interface (crypto/skcipher.c) handles symmetric encryption/
decryption (AES-CBC, AES-XTS, ChaCha20, etc.):

**Key setup**:
crypto_skcipher_setkey() (line 398) sets the encryption key. It checks the
key length against the algorithm's min/max, handles alignment requirements
via skcipher_setkey_unaligned() (line 377), and manages the NEED_KEY flag
via skcipher_set_needkey() (line 371).

**Encryption/Decryption**:
crypto_skcipher_encrypt() (line 435) and crypto_skcipher_decrypt() (line 448)
are the main entry points. They invoke the algorithm's encrypt/decrypt
callbacks via the skcipher_alg structure.

**Scatterwalk processing**:
skcipher_walk provides an iterator for processing data across scatterlist
pages:
- skcipher_walk_virt() (line 283): initializes a walk for virtual addresses
- skcipher_walk_next() (line 210): advances to the next chunk
- skcipher_walk_done() (line 71): completes one step, handles partial
  processing, and manages the SLOW/COPY/DIFF path variants
- skcipher_copy_iv() (line 244): copies the initialization vector to an
  aligned buffer

The walk handles three data movement modes:
- Fast path: source and destination are in the same page, process in place
- Copy path (SKCIPHER_WALK_COPY): copy source to temp buffer, process, copy back
- Slow path (SKCIPHER_WALK_SLOW): for data spanning page boundaries

### Templates and Composed Algorithms

Templates create new algorithms by combining existing ones. For example,
"xts(aes)" creates XTS mode using AES as the underlying cipher.

The crypto_template_list (crypto/algapi.c line 23) holds registered templates.
When a lookup for "xts(aes)" fails, the larval mechanism triggers template
instantiation:
1. crypto_probing_notify() sends CRYPTO_MSG_ALG_REQUEST
2. The xts template parses "xts(aes)" and looks up "aes"
3. It creates a new crypto_instance wrapping aes with XTS logic
4. crypto_register_instance() adds it to crypto_alg_list

crypto_destroy_instance_workfn() (crypto/algapi.c line 72) handles deferred
cleanup of template instances via a workqueue.

## Code Walkthrough

### Tracing AES-XTS Allocation

1. dm-crypt calls crypto_alloc_skcipher("xts(aes)", 0, 0)
2. crypto_alg_mod_lookup() (crypto/api.c line 338) searches for "xts(aes)"
3. Not found; crypto_larval_lookup() creates a larval and requests module load
4. The xts template is notified, instantiates xts(aes) using aes
5. crypto_larval_wait() returns the now-registered xts(aes) algorithm
6. __crypto_alloc_tfm() allocates the skcipher transform
7. crypto_skcipher_init_tfm() (line 527) initializes type-specific state
8. The transform is ready; dm-crypt calls crypto_skcipher_setkey()

### Processing an Encryption Request

1. Caller fills a skcipher_request with source/destination scatterlists
2. crypto_skcipher_encrypt() invokes the algorithm's encrypt callback
3. The algorithm calls skcipher_walk_virt() to set up the data walk
4. Loop: skcipher_walk_next() maps the next page-sized chunk
5. Algorithm encrypts walk->nbytes of data
6. skcipher_walk_done() advances the walk position
7. When walk->nbytes == 0, all data is processed
8. crypto_req_done() (line 704) signals completion for async operations

## Hands-On Challenges

### Challenge 1: Algorithm Inventory (XP: 80)

Read /proc/crypto and catalog:
- How many algorithms are registered on your system
- Group them by type (cipher, skcipher, hash, aead, rng, etc.)
- For AES, find all registered driver variants (generic, AES-NI, etc.)
- Explain the priority field and how the kernel selects implementations
Then trace __crypto_alg_lookup() to understand the selection logic.

### Challenge 2: Encryption Module (XP: 100)

Write a kernel module that:
- Allocates an AES-CBC skcipher transform
- Sets a 256-bit key
- Encrypts a 4096-byte buffer using the scatterwalk interface
- Decrypts it and verifies the result matches the original
- Measures encryption throughput in MB/s
Use crypto_alloc_skcipher(), crypto_skcipher_setkey(), and
skcipher_request_alloc() for the implementation.

### Challenge 3: Self-Test Analysis (XP: 120)

Trace the crypto self-test path:
- Find where crypto_start_test() (crypto/api.c line 181) triggers testing
- Trace how __crypto_boot_test_finished controls test ordering at boot
- Read the test vectors for AES in crypto/testmgr.h
- Explain what happens when FIPS mode is enabled (fips=1 boot parameter)
- Document the relationship between crypto_schedule_test() and the
  larval waiting mechanism

## Verification Criteria

You have mastered this skill when you can:

- [ ] Describe the crypto_alg, crypto_tfm, and crypto_type relationships
- [ ] Trace algorithm registration through crypto_register_alg()
- [ ] Explain the larval mechanism for on-demand algorithm loading
- [ ] Use the skcipher interface to encrypt and decrypt data
- [ ] Describe the scatterwalk data processing model
- [ ] Explain templates and how composed algorithms (e.g., xts(aes)) are created
- [ ] Describe FIPS mode enforcement and self-testing
