---
title: 'Troubleshooting "ssh: connect to host port 22: Connection refused"'
description: 'What Connection refused really means on port 22, how to tell it apart from a timeout, and the ordered checklist for getting an Ubuntu box to accept SSH again: nothing listening, wrong port, socket not enabled, or the wrong address entirely.'
pubDate: 'Jun 24 2026'
heroImage: '../../assets/ssh-connection-refused-hero.png'
tags: ['SSH', 'Ubuntu', 'Linux', 'Troubleshooting', 'Networking', 'systemd', 'Firewall', 'SysAdmin', 'SelfHosted']
---

You try to connect and never even get to a password or a key:

```text
ssh: connect to host 192.168.1.42 port 22: Connection refused
```

This is a different animal from [Permission denied
(publickey)](/blog/permission-denied-publickey-ubuntu/). That one means you
reached the SSH server and it turned you away. Connection refused means you never
reached an SSH server at all. The good news is that it narrows the problem down a
lot, and the fix is usually one command on the box itself.

> **TL;DR.** Connection refused means the host is reachable but nothing is
> listening on port 22. Get on the box and run `sudo ss -tlnp | grep :22`. If it
> is empty, SSH is not running: `sudo apt install openssh-server` then
> `sudo systemctl enable --now ssh`. If it shows `127.0.0.1:22` or a different
> port, that is your answer.

## Contents

- [Refused is not the same as timed out](#refused-is-not-the-same-as-timed-out)
- [Step 1: prove which one you have](#step-1-prove-which-one-you-have)
- [Step 2: check the server itself](#step-2-check-the-server-itself)
- [The causes, in order of likelihood](#the-causes-in-order-of-likelihood)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## Refused is not the same as timed out

This is the distinction that solves most of these, so get it straight first.

**Connection refused** means your packet arrived and the machine actively said
no. The kernel sent back a reset because nothing was listening on that port. So
the box is up, you can reach it across the network, and the only thing missing is
an SSH server on port 22.

**Connection timed out** is the opposite. Your packet went into the void and
nothing came back. That points at the wrong address, a box that is powered off,
or a firewall silently dropping the traffic. None of those are the same problem,
and chasing the SSH config when you actually have a timeout is wasted effort.

So before anything else, read the error. If it says `Connection refused`, stay on
this page. If it says `Connection timed out` or `No route to host`, your problem
is the network or the address, not SSH.

## Step 1: prove which one you have

From the machine you are connecting from, test just the port:

```bash
nc -vz -G 5 192.168.1.42 22      # Linux: swap -G 5 for -w 5
```

`Connection refused` confirms the host is alive but nothing answers on 22.
`Operation timed out` means you are not even reaching it. The `-G` (or `-w` on
Linux) caps the wait so a dropped packet fails fast instead of hanging for a
minute. You can get the same read from SSH itself:

```bash
ssh -v user@192.168.1.42
```

It prints `Connecting to 192.168.1.42 port 22` and then the refusal. If it hangs
for a long time before failing, that is a timeout wearing a trench coat, and this page
won't help you.

## Step 2: check the server itself

Connection refused almost always gets fixed on the box, not the client, so get to
it directly. Use the console, a monitor and keyboard, or your cloud provider's web
console. Then ask the one question that matters: is anything listening on 22?

```bash
sudo ss -tlnp | grep :22
```

Three things can happen, and each one tells you what is wrong:

- **Nothing prints.** No SSH server is listening. That is cause 1 or 3 below.
- **It shows `127.0.0.1:22`.** SSH is listening, but only for the box itself, not
  the network. That is cause 5.
- **It shows a different port like `:2222`.** SSH moved. That is cause 2.

## The causes, in order of likelihood

> **On Ubuntu 24.04 and newer, systemd owns the listening socket, not `sshd`.**
> The port and address SSH listens on come from `ssh.socket` (its `ListenStream=`
> setting), which means `Port` and `ListenAddress` in `sshd_config` are ignored
> while socket activation is on. To change either, edit the socket, not the daemon
> config: `sudo systemctl edit ssh.socket`, set `ListenStream=`, then
> `sudo systemctl daemon-reload && sudo systemctl restart ssh.socket`. This is the
> trap behind causes 2 and 5 below, where editing `sshd_config` and reloading
> looks right and changes nothing.

### 1. The SSH server is not installed or not running (server)

This is the big one, especially on a fresh desktop. Ubuntu ships the SSH client
but not the server, so a clean install refuses every connection until you add it.
Check the service:

```bash
sudo systemctl status ssh
```

If it reports `could not be found`, the server is not installed. Install it and
turn it on, which is the whole of [enabling SSH on an Ubuntu
box](/blog/enable-ssh-on-ubuntu-desktop/):

```bash
sudo apt update
sudo apt install openssh-server
sudo systemctl enable --now ssh
```

If it is installed but `inactive (dead)` or `failed`, start it and find out why it
stopped:

```bash
sudo systemctl enable --now ssh
sudo journalctl -u ssh -b --no-pager | tail
```

If it tried to start and `failed`, a typo in the config is the usual reason.
Validate it, which prints the offending line or stays silent when the config is
clean:

```bash
sudo sshd -t
```

### 2. SSH is listening on a different port (server)

If `ss` showed something like `:2222`, the listener moved off 22. Connecting
straight to it is the quickest way back in:

```bash
ssh -p 2222 user@192.168.1.42
```

To put it back permanently, change it where the port actually lives. On 24.04 and
newer that is `ListenStream=` in `ssh.socket` (see the note above), and `sshd -T`
can even disagree with `ss` because the daemon config no longer controls the bind:

```bash
sudo sshd -T | grep -i '^port'      # what sshd_config says (may be ignored)
```

On older releases where `sshd` owns the listener, that `Port` line in
`sshd_config` is authoritative and a `sudo systemctl restart ssh` applies it.

### 3. The socket is not enabled (server)

On Ubuntu 24.04 and other recent releases, SSH is socket activated. The systemd
socket listens on 22 and only spawns `sshd` when a connection arrives, so
`systemctl status ssh` reading `inactive (dead)` is completely normal and not
your problem. What matters is the socket:

```bash
sudo systemctl status ssh.socket
```

If the socket is disabled or dead, nothing is listening, and you get refused.
Turn it on:

```bash
sudo systemctl enable --now ssh.socket
```

### 4. You are connecting to the wrong address (client)

If the box hands out DHCP addresses, a reboot can move it, and you end up knocking
on some other device that has nothing on port 22. On the box, check its current
address:

```bash
hostname -I
```

Make sure that matches what you are typing. If this keeps happening, set a static
IP or a DHCP reservation so the address stops wandering.

### 5. SSH is bound to localhost only (server)

If `ss` showed `127.0.0.1:22` and nothing on the real interface, the listener is
pinned to the machine itself. A login over the network gets refused while
`ssh localhost` on the box works fine, which is the giveaway.

On 24.04 and newer, fix this in the socket per the note above, setting
`ListenStream=0.0.0.0:22`. On older releases where `sshd` owns the listener, find
the `ListenAddress` line:

```bash
sudo sshd -T | grep -i listenaddress
```

If it is pinned to `127.0.0.1`, set it to `0.0.0.0` (or the right interface) and
restart, since a bind change does not take on a reload:

```bash
sudo systemctl restart ssh
```

### 6. A firewall is actively rejecting it (either side)

Most firewalls drop unwanted traffic, which gives you a timeout, not a refusal.
UFW's default deny drops, so a plain UFW block lands on the timeout page, not this
one. A refusal means something sent a reset back, so a local firewall is the
culprit only when it has an explicit `reject` rule. The version of this you are
more likely to meet is on a cloud box, where a security group or network ACL that
does not allow port 22 belongs in your provider's console, not here. If you do
find a local `reject` rule in the way:

```bash
sudo ufw status
sudo ufw allow ssh
```

## Gotchas I hit

- **Refused means reachable.** A refusal is almost good news. The box is up and on
  the network, and only the SSH server is missing. Save the network debugging for
  when you actually get a timeout.
- **`inactive (dead)` is fine on 24.04.** Socket activation means `ssh.service`
  sits idle until a connection comes in. Do not go restarting things to fix a
  state that is working as designed. Check `ssh.socket` instead.
- **The service is `ssh`, not `sshd`.** `systemctl status sshd` just errors on
  Ubuntu. The unit is `ssh`, with `ssh.service` and `ssh.socket`.
- **`localhost` works but the network does not.** That is the tell for a
  `ListenAddress` pinned to `127.0.0.1`, every time.
- **The address wandered.** DHCP moved the box and you are connecting to thin air.
  `hostname -I` on the console settles it in one line.

## Quick reference

| What you see | Likely cause | Fix |
|---|---|---|
| `ss` on 22 is empty, status `could not be found` | SSH not installed | `sudo apt install openssh-server` |
| `ss` empty, service installed | Not running | `sudo systemctl enable --now ssh` |
| `ss` empty on 24.04+ | Socket disabled | `sudo systemctl enable --now ssh.socket` |
| `ss` shows `:2222` | Custom port | `ssh -p 2222 user@host` |
| `ss` shows `127.0.0.1:22` | Bound to localhost | fix the socket or `ListenAddress`, restart |
| `nc` times out instead | Wrong address or firewall drop | check IP, this is not a refusal |

Once `ss` shows a listener on `0.0.0.0:22` (owned by `systemd` under socket
activation, or `sshd` on older boxes), the refusal is gone and you are back to a
normal login. Which means the next thing to break is the key itself, and I
[already wrote that one up](/blog/permission-denied-publickey-ubuntu/).
`[ port 22 open ]`
