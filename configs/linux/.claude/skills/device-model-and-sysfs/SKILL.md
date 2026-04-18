---
name: device-model-and-sysfs
description: Understand the Linux device model with buses, drivers, devices, and sysfs representation
realm: devices
category: device-model
difficulty: beginner
xp: 150
estimated_minutes: 75
prerequisites:
  - kernel-modules
unlocks:
  - pci-and-dma
  - virtio-framework
kernel_files:
  - drivers/base/core.c
  - drivers/base/bus.c
  - drivers/base/driver.c
  - fs/sysfs/dir.c
doc_files:
  - Documentation/driver-api/driver-model/overview.rst
  - Documentation/filesystems/sysfs.rst
badge: Model Mapper
tags:
  - device-model
  - sysfs
  - kobject
---

# Device Model and Sysfs

The Linux device model is the framework that organizes every piece of hardware
and its software representation into a coherent hierarchy. Every device in your
system -- from the CPU to a USB mouse -- is represented as a struct device,
connected to a bus, and matched to a driver. The sysfs filesystem (/sys) exposes
this hierarchy to userspace, enabling tools like udev to discover devices and
manage hotplug events.

Understanding the device model is a prerequisite for writing any real driver.
Without it, you cannot register a device on a bus, bind a driver to hardware,
or expose device attributes to userspace. This is the scaffolding on which all
of Linux driver development rests.

## Quest Briefing

The device model unifies how the kernel represents hardware. Before it existed,
each subsystem invented its own way of tracking devices. Now, buses, drivers,
and devices share a common framework that handles discovery, binding, power
management, and userspace visibility through sysfs. Learning this model is the
gateway to writing any Linux driver.

## Learning Objectives

After completing this skill, you will be able to:

- Explain the relationships between struct device, struct bus_type, and struct device_driver
- Trace the device registration path through device_initialize() and device_add()
- Understand how bus_register() creates a new bus with its sysfs representation
- Describe how driver-device matching and probing works
- Navigate the /sys hierarchy and interpret its directory structure

## Core Concepts

### The Three Pillars: Bus, Device, Driver

The device model is built on three core abstractions in drivers/base/:

**struct bus_type** (drivers/base/bus.c): Represents a bus (PCI, USB, platform,
etc.). Each bus defines a match function that determines if a driver can handle
a device. The bus_register() function creates the bus in /sys/bus/<name>/ with
devices/ and drivers/ subdirectories. Internally, bus_to_subsys() looks up the
subsys_private structure that holds the bus's kset and device/driver lists.

**struct device** (drivers/base/core.c): Represents any device in the system.
Created via device_initialize() which sets up the kobject, initializes the
device's power management state, and prepares the device link infrastructure.
Then device_add() places it on the bus and triggers driver matching.

**struct device_driver** (drivers/base/driver.c): Represents a driver that can
bind to one or more devices. Registered with driver_register() which adds it to
its bus's driver list and triggers matching against unbound devices.

### Device Registration Flow

The full path to register a device:

1. device_initialize() (drivers/base/core.c line 3157): sets up kobject,
   initializes spin locks, INIT_LIST_HEAD for device links, power management,
   and DMA configuration
2. device_add() (line 3573): the core registration function that:
   - Assigns a device name if not set
   - Creates the sysfs directory via kobject_add()
   - Creates default device attributes
   - Adds the device to its parent's children list
   - Calls bus_add_device() to place it on the bus
   - Triggers bus_probe_device() to find a matching driver
3. device_register() (line 3770): convenience wrapper that calls both
   device_initialize() and device_add()

### Bus Registration and Matching

When bus_register() is called (drivers/base/bus.c line 934):

1. A subsys_private structure is allocated for internal bookkeeping
2. A kset is created for the bus in /sys/bus/
3. Subdirectories for devices/ and drivers/ are created
4. The bus's match callback is stored for later use during driver binding

The matching process:
- When a new device appears, the bus iterates its driver list
- For each driver, bus->match(dev, drv) is called
- If match returns true, the driver's probe() function is called
- If probe succeeds, the device and driver are bound together
- The binding is visible in sysfs as a symlink in the driver's directory

### Sysfs: The Userspace Interface

Sysfs (fs/sysfs/) is a virtual filesystem that mirrors the kernel's device
model hierarchy. The core operation is sysfs_create_dir_ns() (fs/sysfs/dir.c
line 40) which creates a directory for a kobject:

1. Finds the parent kernfs_node (from kobj->parent->sd or sysfs_root_kn)
2. Calls kernfs_create_dir_ns() to create the directory entry
3. Stores the kernfs_node in kobj->sd for future attribute operations

Key sysfs functions:
- sysfs_create_dir_ns(): creates a directory for a kobject
- sysfs_remove_dir(): removes a kobject's directory and all attributes
- sysfs_warn_dup(): warns about duplicate filename creation attempts

Device attributes are files in sysfs exposed via DEVICE_ATTR macros:
- device_create_file() adds individual attributes
- device_add_groups() (drivers/base/core.c line 2835) adds attribute groups

### Device Links

The device model supports dependency tracking between devices via device links
(drivers/base/core.c). device_link_add() creates a supplier-consumer
relationship. The firmware device link infrastructure (__fwnode_link_add)
automatically creates links based on firmware descriptions (DT, ACPI).

## Code Walkthrough

### Tracing a Platform Device Registration

1. A board file or device tree populates a platform_device
2. platform_device_register() calls device_add() with bus = platform_bus_type
3. device_add() creates /sys/devices/platform/<device-name>/
4. bus_probe_device() iterates registered platform drivers
5. platform_match() checks name, device tree compatible, or ACPI ID
6. If matched, the driver's probe() function initializes the hardware
7. A symlink appears: /sys/bus/platform/devices/<name> -> /sys/devices/...

### The driver_register Path

1. driver_register() (drivers/base/driver.c line 225) validates the driver
2. bus_add_driver() places it on the bus's driver kset
3. driver_attach() iterates all unbound devices on the bus
4. For each device, __driver_attach() calls bus->match() then driver_probe_device()
5. The driver's probe() function is called in device context

### Exploring the Sysfs Hierarchy

```
/sys/
  bus/           <- one directory per registered bus_type
    pci/
      devices/   <- symlinks to devices on this bus
      drivers/   <- one directory per registered driver
    platform/
    usb/
  devices/       <- physical device hierarchy (by connection topology)
    system/
    pci0000:00/
    platform/
  class/         <- logical grouping (net, block, input, etc.)
```

## Hands-On Challenges

### Challenge 1: Sysfs Explorer (XP: 40)

Navigate /sys/bus/ and answer:
- How many buses are registered on your system?
- For the PCI bus, how many devices and drivers are listed?
- Pick one PCI device and find its vendor/device IDs in sysfs
- Trace the symlink from /sys/bus/pci/devices/ to /sys/devices/ and explain
  the physical topology the path reveals

### Challenge 2: Platform Device Module (XP: 50)

Write a kernel module that:
- Registers a platform_driver with a probe and remove function
- Registers a matching platform_device
- In probe(), creates a custom sysfs attribute using DEVICE_ATTR_RO
- The attribute returns a message when read from userspace
- Verify the attribute appears in /sys/ and can be read with cat

### Challenge 3: Device Model Diagram (XP: 60)

Draw the relationship diagram for a specific device on your system (e.g., a
network card). Show:
- The struct device and its parent chain up to the root
- The bus_type it belongs to
- The bound device_driver
- All sysfs directories and symlinks involved
- Any device_links (supplier/consumer relationships)

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain the roles of struct device, struct bus_type, and struct device_driver
- [ ] Trace device_initialize() and device_add() in drivers/base/core.c
- [ ] Describe how bus_register() sets up the internal subsys_private structures
- [ ] Explain the match-probe-bind sequence for driver binding
- [ ] Navigate /sys/bus/, /sys/devices/, and /sys/class/ and explain the layout
- [ ] Create a module that registers a device with custom sysfs attributes
