---
name: socket-layer
description: Explore the BSD socket interface and how the kernel handles network connections
realm: network
category: sockets
difficulty: intermediate
xp: 200
estimated_minutes: 90
prerequisites:
  - process-lifecycle
  - vfs-layer
unlocks:
  - tcp-state-machine
  - netfilter-and-nftables
  - sk-buff-lifecycle
kernel_files:
  - net/socket.c
  - include/linux/net.h
  - include/net/sock.h
  - net/core/sock.c
doc_files:
  - Documentation/networking/index.rst
badge: Socket Sage
tags:
  - networking
  - sockets
  - tcp
  - udp
  - bsd-sockets
---

# Socket Layer

Sockets are how the kernel exposes networking to userspace. Every network
connection -- HTTP, DNS, SSH -- goes through the socket API. The socket layer
bridges the VFS world (file descriptors, read/write) with the protocol world
(TCP/IP, UDP, raw packets).

## Learning Objectives

After completing this skill, you will be able to:

- Describe how sockets integrate with VFS as special file descriptors
- Trace socket(), bind(), listen(), accept(), connect() syscall paths
- Distinguish struct socket (VFS-facing) from struct sock (protocol-facing)
- Explain how protocol families register with the socket layer
- Navigate net/socket.c and net/core/sock.c

## Core Concepts

### Sockets as Files

A socket is a file descriptor. When you call socket(), the kernel creates:
1. struct socket (include/linux/net.h) -- VFS-level socket object
2. struct sock (include/net/sock.h) -- protocol-level socket object
3. struct file with socket-specific file_operations
4. A file descriptor in the process's fd table

This means read(), write(), close(), poll() all work on sockets.

### struct socket vs struct sock

**struct socket** (include/linux/net.h): VFS-facing.
- type: SOCK_STREAM, SOCK_DGRAM, SOCK_RAW
- state: SS_UNCONNECTED, SS_CONNECTING, SS_CONNECTED
- ops: struct proto_ops (bind, connect, listen, accept, sendmsg, recvmsg)
- sk: pointer to the protocol-level struct sock

**struct sock** (include/net/sock.h): protocol-facing. Much larger:
- sk_state: TCP state machine (TCP_ESTABLISHED, TCP_CLOSE_WAIT, etc.)
- sk_receive_queue: incoming packet queue
- sk_write_queue: outgoing packet queue
- sk_prot: struct proto (protocol operations)
- sk_dst_cache: cached routing decision

### Protocol Family Registration

Protocol families register via sock_register() in net/socket.c:
- AF_INET (IPv4): net/ipv4/af_inet.c -- inet_create()
- AF_INET6 (IPv6): net/ipv6/af_inet6.c -- inet6_create()
- AF_UNIX (local): net/unix/af_unix.c -- unix_create()
- AF_NETLINK: net/netlink/af_netlink.c
- AF_PACKET: net/packet/af_packet.c

socket(AF_INET, SOCK_STREAM, 0) triggers: look up AF_INET -> inet_create()
-> find TCP's struct proto -> allocate struct sock -> initialize TCP state.

### The Syscall Interface

net/socket.c implements all socket syscalls:

- sys_socket(): calls sock_create() then sock_map_fd() to assign an fd
- sys_bind(): assigns local address via protocol's bind operation
- sys_listen(): marks socket as passive, sets up accept queue
- sys_accept(): dequeues completed connection, creates new socket
- sys_connect(): initiates connection (TCP three-way handshake)
- sys_sendmsg() / sys_recvmsg(): fundamental data transfer operations

### Data Flow: Sending

When userspace calls send() on a TCP socket:
1. sys_sendmsg() in net/socket.c
2. sock_sendmsg() -> socket->ops->sendmsg (inet_sendmsg)
3. inet_sendmsg() -> sk->sk_prot->sendmsg (tcp_sendmsg)
4. tcp_sendmsg() copies data into sk_buffs, queues them, calls tcp_push()
5. TCP adds headers -> IP layer adds routing -> network device driver

## Code Walkthrough

### Exercise 1: Trace socket()

1. net/socket.c: __sys_socket() calls sock_create() -> __sock_create()
2. __sock_create() looks up protocol family, calls pf->create()
3. For AF_INET: inet_create() in net/ipv4/af_inet.c
4. inet_create() looks up protocol in inetsw[], calls sk_alloc()
5. sock_map_fd() creates struct file and installs fd

### Exercise 2: Trace a TCP Connection

1. Server listen(): sys_listen() -> inet_listen() sets up accept queue
2. Client connect(): sys_connect() -> inet_stream_connect() -> tcp_v4_connect() sends SYN
3. Server receives SYN: tcp_v4_rcv() -> creates request_sock
4. Three-way handshake completes, connection enters accept queue
5. Server accept(): sys_accept() -> inet_accept() dequeues connection

### Exercise 3: Socket File Operations

1. Find socket_file_ops in net/socket.c
2. read maps to sock_read_iter, write to sock_write_iter, poll to sock_poll
3. This is how VFS operations translate to socket operations

## Hands-On Challenges

### Challenge 1: Protocol Family Census (XP: 60)

Search for all sock_register() calls. List every protocol family, its AF_*
constant, and the source file. How many families does Linux support?

### Challenge 2: TCP State Machine Trace (XP: 70)

Write a TCP client and server in C. Use strace on both. For each socket
syscall, identify the kernel function in net/socket.c and the TCP state
transition it triggers.

### Challenge 3: struct sock Deep Dive (XP: 70)

Open include/net/sock.h and identify fields for: buffer management
(sk_rcvbuf, sk_sndbuf), connection state (sk_state), queues
(sk_receive_queue, sk_write_queue), timing (sk_timer). Explain each group.

## Verification Criteria

You have mastered this skill when you can:

- [ ] Explain struct socket (VFS) vs struct sock (protocol) dual design
- [ ] Trace socket() from syscall to protocol family create callback
- [ ] Describe send data path: userspace -> TCP -> IP -> driver
- [ ] Explain how sockets integrate with VFS (file_operations, fd)
- [ ] Identify which kernel files handle each socket syscall
