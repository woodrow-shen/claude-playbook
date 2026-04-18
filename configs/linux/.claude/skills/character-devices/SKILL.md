---
name: character-devices
description: Build character device drivers that expose kernel functionality to userspace
realm: devices
category: char-devices
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - kernel-modules
  - vfs-layer
unlocks: []
kernel_files:
  - fs/char_dev.c
  - include/linux/cdev.h
  - include/linux/fs.h
  - include/linux/miscdevice.h
  - drivers/char/mem.c
doc_files:
  - Documentation/driver-api/basics.rst
badge: Device Forger
tags:
  - drivers
  - character-devices
  - file-operations
  - cdev
  - miscdevice
---

# Character Devices

Character devices are the most common way for kernel code to expose functionality
to userspace. /dev/null, /dev/random, /dev/tty, and most hardware drivers use
this interface. A character device appears as a file in /dev/ that userspace can
open, read, write, and ioctl.

## Learning Objectives

After completing this skill, you will be able to:

- Explain major/minor device numbers and how they identify devices
- Implement struct file_operations for a character device
- Register a device using cdev_add() or the miscdevice shortcut
- Trace how VFS dispatches I/O operations to your driver
- Write a complete character device kernel module

## Core Concepts

### Major and Minor Numbers

Every device in /dev/ is identified by a major and minor number pair:
- Major number identifies the driver (e.g., 1 = mem devices, 4 = tty)
- Minor number identifies the specific device within that driver

You can see these with `ls -la /dev/null`:
```
crw-rw-rw- 1 root root 1, 3 ...  /dev/null
```
Major 1, minor 3.

Device numbers are allocated via:
- register_chrdev_region(dev, count, name) -- request specific numbers
- alloc_chrdev_region(&dev, baseminor, count, name) -- let kernel choose

### struct file_operations

Defined in include/linux/fs.h, this structure contains function pointers for
every operation userspace can perform on the device:

```c
struct file_operations my_fops = {
    .owner   = THIS_MODULE,
    .open    = my_open,
    .release = my_release,
    .read    = my_read,
    .write   = my_write,
    .unlocked_ioctl = my_ioctl,
    .llseek  = no_llseek,
};
```

When userspace calls read() on your device, VFS calls your .read function.
When it calls ioctl(), VFS calls .unlocked_ioctl. The VFS layer (covered in
the vfs-layer skill) handles the dispatch.

### struct cdev

The cdev structure (include/linux/cdev.h) links a device number range to
file_operations:

```c
struct cdev my_cdev;

cdev_init(&my_cdev, &my_fops);
my_cdev.owner = THIS_MODULE;
cdev_add(&my_cdev, dev_number, 1);  // register with VFS
```

After cdev_add(), opening the corresponding /dev/ node will invoke your fops.

### The Device Registration Flow

1. Allocate device numbers: alloc_chrdev_region()
2. Create a class: class_create("myclass")
3. Initialize and add cdev: cdev_init() + cdev_add()
4. Create device node: device_create(class, NULL, dev, NULL, "mydevice")
   This creates /dev/mydevice automatically via udev.
5. On module unload: reverse all steps (device_destroy, cdev_del,
   unregister_chrdev_region, class_destroy)

### miscdevice: The Shortcut

For simple devices needing a single minor number, miscdevice
(include/linux/miscdevice.h) simplifies everything:

```c
static struct miscdevice my_misc = {
    .minor = MISC_DYNAMIC_MINOR,
    .name  = "mydevice",
    .fops  = &my_fops,
};

misc_register(&my_misc);    // does everything: alloc minor, create /dev node
misc_deregister(&my_misc);  // clean up
```

All misc devices share major number 10. The kernel auto-allocates a minor.

### Real Example: /dev/null

drivers/char/mem.c implements /dev/null, /dev/zero, /dev/full, and /dev/random.
The null device's operations are trivial:

- read: returns 0 (EOF)
- write: discards all data, returns count (success)
- llseek: returns 0

This is a great reference for understanding minimal file_operations.

## Code Walkthrough

### Exercise 1: Trace an Open on a Char Device

1. Userspace: open("/dev/mydevice", O_RDWR)
2. VFS resolves path, finds the inode for /dev/mydevice
3. The inode has i_rdev (device number) and i_fop pointing to def_chr_fops
4. chrdev_open() (fs/char_dev.c) is called
5. chrdev_open() looks up the cdev by device number (kobj_lookup)
6. Replaces filp->f_op with the cdev's file_operations (your fops)
7. Calls your .open function

### Exercise 2: Read /dev/null Source

1. Open drivers/char/mem.c
2. Find the null device's file_operations (null_fops)
3. read_null() returns 0 (nothing to read)
4. write_null() returns count (data accepted and discarded)
5. Find where the null device is registered (chr_dev_init)

### Exercise 3: Trace ioctl Dispatch

1. Userspace calls ioctl(fd, cmd, arg)
2. VFS calls do_vfs_ioctl() (fs/ioctl.c)
3. For most commands: filp->f_op->unlocked_ioctl(filp, cmd, arg)
4. Your ioctl handler receives the command and argument
5. Use copy_from_user/copy_to_user for data transfer

## Hands-On Challenges

### Challenge 1: Counter Device (XP: 70)

Write a character device module that:
- Maintains an internal counter starting at 0
- read() returns the counter value as ASCII text
- write() increments the counter by the written value
- ioctl() with a RESET command sets the counter to 0

Register it with miscdevice. Test with echo, cat, and a custom ioctl program.

### Challenge 2: /dev/mem Analysis (XP: 60)

Read drivers/char/mem.c completely. Document every device it registers
(null, zero, full, random, urandom, mem, kmem, port). For each, explain
the purpose and key file_operations.

### Challenge 3: VFS-to-Driver Trace (XP: 70)

Using ftrace or printk, trace a complete read() call on your device from
sys_read through VFS through chrdev_open through your driver's read function.
Record the complete function call chain.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain major/minor numbers and how the kernel maps them to drivers
- [ ] Implement file_operations with open, read, write, ioctl, and release
- [ ] Register a character device with both cdev_add and miscdevice approaches
- [ ] Trace how VFS dispatches operations to chrdev_open and then your driver
- [ ] Write a complete working character device module
