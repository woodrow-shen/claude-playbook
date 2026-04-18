---
name: ext4-internals
description: Explore the ext4 filesystem internals including extents, journaling, and inode management
realm: filesystem
category: filesystem-driver
difficulty: intermediate
xp: 200
estimated_minutes: 100
prerequisites:
  - vfs-layer
unlocks: []
kernel_files:
  - fs/ext4/extents.c
  - fs/ext4/inode.c
  - fs/jbd2/commit.c
  - fs/ext4/ext4.h
doc_files:
  - Documentation/filesystems/ext4/
  - Documentation/filesystems/journalling.rst
badge: Ext4 Explorer
tags:
  - ext4
  - journal
  - extents
  - jbd2
---

# Ext4 Internals

## Quest Briefing

Ext4 is the most widely deployed Linux filesystem. It stores data on billions of
devices worldwide, from servers to embedded systems. Understanding its internals
reveals how the kernel maps logical file offsets to physical disk blocks, how
journaling prevents corruption after crashes, and how metadata structures are
organized on disk.

The ext4 filesystem evolved from ext3 (and before that, ext2), adding extent-based
allocation, delayed allocation, multi-block allocation, and a host of reliability
features. Its journaling layer (JBD2) ensures that metadata operations are atomic
even if power fails mid-write. Studying ext4 gives you a concrete, real-world
example of how the abstract VFS interfaces are implemented in practice.

When you debug filesystem corruption, tune mkfs parameters, or investigate I/O
performance, you are working with the code described in this skill. Ext4 is the
reference implementation that all other Linux filesystems are compared against.

## Learning Objectives

- Describe the ext4 on-disk layout: superblock, block groups, inode table, extents
- Trace how ext4 maps a logical file offset to a physical block using extent trees
- Explain the JBD2 journaling layer and how it commits transactions atomically
- Understand ext4 inode operations including read, write, and truncate
- Navigate the ext4 source tree and identify key data structures in ext4.h

## Core Concepts

### Extent Trees: Mapping File Offsets to Disk Blocks

Ext4 replaced the old indirect block mapping (ext2/ext3) with extent trees. An
extent is a contiguous range of physical blocks described by struct ext4_extent
in fs/ext4/ext4_extents.h:

- ee_block -- logical block number within the file
- ee_start_hi/ee_start_lo -- physical block on disk (48-bit)
- ee_len -- number of contiguous blocks (up to 32768)

Small files fit their extent data directly in the inode (4 extents in the i_block
area). Larger files use a B-tree of extent index nodes. Key functions in
fs/ext4/extents.c:

- ext4_ext_check_inode() at line 519 -- validates the extent tree header
- ext4_cache_extents() at line 524 -- populates the extent status cache
- ext4_ext_precache() at line 603 -- pre-reads the entire extent tree
- ext4_ext_split() at line 1053 -- splits an extent node when the tree grows
- ext4_ext_grow_indepth() at line 1312 -- increases tree depth by adding a root
- ext4_ext_try_to_merge_right() at line 1825 -- merges adjacent extents
- ext4_ext_try_to_merge_up() at line 1866 -- collapses a single-child node
- ext4_extent_block_csum_verify() at line 59 -- validates checksum integrity

### Inode Management in ext4

The fs/ext4/inode.c file implements the VFS inode operations for ext4. It
handles reading inodes from disk, writing them back, and managing the data
mapping layer. Key functions:

- ext4_inode_csum() at line 60 -- computes the inode checksum for integrity
- ext4_journalled_zero_new_buffers() at line 55 -- zeroes newly allocated blocks
  in journalled data mode
- The file provides readpage, writepages, and the iomap-based I/O paths that
  connect ext4 to the page cache

The struct ext4_inode_info (accessed via the EXT4_I macro) extends the VFS inode
with ext4-specific fields: the extent status tree, journal inode data,
preallocation lists, and the inline data area.

### JBD2 Journaling: Crash Consistency

The JBD2 (Journaling Block Device 2) layer in fs/jbd2/ provides atomic
transaction semantics for ext4 metadata updates. The journal is a circular log
on disk that records changes before they are committed to their final locations.

The commit process in fs/jbd2/commit.c:

1. jbd2_journal_commit_transaction() at line 348 -- the main commit function
2. It first calls journal_submit_data_buffers() at line 211 to flush dirty data
3. Then writes descriptor blocks with checksums via jbd2_block_tag_csum_set()
4. journal_submit_commit_record() at line 114 writes the final commit block
5. journal_wait_on_commit_record() at line 165 waits for the commit to hit disk
6. jbd2_submit_inode_data() at line 181 handles ordered data mode

The transaction lifecycle: Running -> Locked -> Flush -> Commit -> Finished.
Each handle obtained via ext4_journal_start() joins the current running
transaction. When the transaction commits, all metadata changes become atomic.

### On-Disk Layout

An ext4 filesystem is divided into block groups. Each group contains:

- A copy of the superblock (in select groups with sparse_super)
- Group descriptor table
- Block bitmap and inode bitmap
- Inode table
- Data blocks

The struct ext4_super_block and struct ext4_group_desc in fs/ext4/ext4.h
define these structures. Features like flex_bg group multiple block groups
together for better locality, and bigalloc allocates in clusters instead of
individual blocks.

## Code Walkthrough

Trace how ext4 reads a block from a file using extent lookup:

1. VFS calls ext4_file_read_iter() which uses the iomap framework
2. The iomap ->map_blocks() callback resolves the logical block to physical
3. This calls into ext4_map_blocks() which looks up the extent tree
4. ext4_ext_map_blocks() walks the extent tree from root to leaf:
   - Reads the extent header from the inode's i_block area
   - Follows extent index entries (ext4_extent_idx) down the tree
   - At the leaf level, finds the ext4_extent covering the logical block
   - ext4_cache_extents() caches adjacent extents for subsequent lookups
5. If the extent exists, returns the physical block number for I/O
6. If allocating a new extent:
   - ext4_ext_insert_index() at line 975 adds a new entry at the index level
   - ext4_ext_split() handles node splits when an index node is full
   - ext4_extent_block_csum_set() at line 73 updates checksums
   - The transaction handle ensures all changes are journalled

## Hands-On Challenges

### Challenge 1: Inspect Extent Trees with debugfs (75 XP)

Create a test ext4 filesystem with mkfs.ext4. Write a file with known
patterns (sequential writes, then a hole via fallocate FALLOC_FL_PUNCH_HOLE).
Use "debugfs -R 'extents <inode>' /dev/loop0" to inspect the extent tree.
Verify that the hole creates separate extents and observe the tree depth.

### Challenge 2: Trace a Journal Commit (75 XP)

Mount an ext4 filesystem and use ftrace to trace jbd2_journal_commit_transaction.
Create a file, sync it, and observe the commit sequence. Use
/proc/fs/jbd2/<device>/info to monitor transaction statistics including
average commit time and number of transactions.

### Challenge 3: Measure Extent Merge Behavior (50 XP)

Write a program that creates a file by writing alternating 4KB blocks (write,
seek, write, seek). Then fill in the gaps. Use filefrag to observe how ext4
merges extents as gaps are filled, reducing fragmentation. Compare with a
purely sequential write.

## Verification Criteria

- [ ] Can describe the ext4 extent tree structure (header, index, extent)
- [ ] Can explain how ext4_ext_map_blocks() resolves logical to physical blocks
- [ ] Can trace the JBD2 commit sequence from running transaction to disk
- [ ] Can distinguish between journal modes: journal, ordered, writeback
- [ ] Can describe the block group layout and role of flex_bg
- [ ] Can use debugfs and filefrag to inspect ext4 on-disk structures
- [ ] Can explain how checksums protect extent blocks and inodes
