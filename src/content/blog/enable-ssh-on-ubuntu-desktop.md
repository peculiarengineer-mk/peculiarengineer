---
title: 'Enable SSH on an Ubuntu desktop'
description: 'Install, start, and firewall the OpenSSH server so you can remote into an Ubuntu desktop — plus the hardening I apply before exposing it beyond a trusted LAN.'
pubDate: 'Jun 09 2026'
heroImage: '../../assets/ubuntu-ssh-hero.jpg'
---

Ubuntu desktop ships with the SSH *client* but not the *server*, so a fresh
install won't accept incoming connections. This is the short runbook I follow to
turn a desktop into something I can `ssh` into from another machine.

## Contents

- [Prerequisites](#prerequisites)
- [1. Install the OpenSSH server](#1-install-the-openssh-server)
- [2. Start it and enable it on boot](#2-start-it-and-enable-it-on-boot)
- [3. Verify it's running](#3-verify-its-running)
- [4. Allow SSH through the firewall](#4-allow-ssh-through-the-firewall)
- [5. Find the machine's IP address](#5-find-the-machines-ip-address)
- [6. Connect from another machine](#6-connect-from-another-machine)
- [Hardening before you expose it](#hardening-before-you-expose-it)
- [Gotchas I hit](#gotchas-i-hit)

## Prerequisites

- An Ubuntu desktop you can log into locally (to run these the first time)
- `sudo` privileges
- Another machine on the same network to connect from

## 1. Install the OpenSSH server

```bash
sudo apt update
sudo apt install openssh-server
```

## 2. Start it and enable it on boot

```bash
sudo systemctl enable --now ssh
```

`enable --now` starts the service immediately *and* makes it launch on every
boot.

## 3. Verify it's running

```bash
sudo systemctl status ssh
```

Look for `active (running)`, then press `q` to exit. To confirm something is
actually listening on port 22:

```bash
sudo ss -tlnp | grep :22
```

> **On Ubuntu 24.04 (and other 22.10+ releases), SSH is *socket-activated*.**
> `ssh.service` will read `inactive (dead)` until the first connection arrives,
> and the port-22 listener belongs to `systemd`, not `sshd` — both are normal.
> Check the socket instead:
>
> ```bash
> sudo systemctl status ssh.socket
> ```

## 4. Allow SSH through the firewall

Ubuntu ships UFW, often inactive. If you use it, open SSH before enabling the
firewall — otherwise you can lock yourself out:

```bash
sudo ufw allow ssh
sudo ufw enable
```

## 5. Find the machine's IP address

```bash
hostname -I    # quickest — prints just the IP(s)
ip a           # full detail, per interface
```

Note the `inet` address on your active interface, e.g. `192.168.1.42`.

## 6. Connect from another machine

```bash
ssh your_username@192.168.1.42
```

## Hardening before you expose it

For anything beyond a trusted LAN, switch to key-based auth **before** you touch
any config. From the machine you'll connect *from*:

```bash
ssh-keygen -t ed25519                     # skip if you already have a key
ssh-copy-id your_username@192.168.1.42     # installs your public key on the desktop
```

Confirm you can log in with the key, *then* edit `/etc/ssh/sshd_config` on the
desktop and set:

```text
PasswordAuthentication no
PermitRootLogin no
```

Apply the changes with `sudo systemctl restart ssh`.

> **Mind the drop-ins.** Modern `sshd_config` ends with
> `Include /etc/ssh/sshd_config.d/*.conf`. A file in that directory can override
> your edits — if a setting refuses to take, grep there before pulling your hair
> out.

## Gotchas I hit

- **Service is `ssh`, not `sshd`.** On modern Ubuntu the systemd unit is `ssh`
  (with `ssh.service` and `ssh.socket`). `systemctl status sshd` just errors.
- **UFW order matters.** Enabling the firewall before allowing SSH drops your
  next connection. Always `ufw allow ssh` first.
- **Wi-Fi IP changes.** A DHCP lease can hand the desktop a new address after a
  reboot. Set a static IP or a DHCP reservation if you connect to it regularly.

That's it — the desktop now accepts SSH and survives reboots. `[ SSH OK ]`
