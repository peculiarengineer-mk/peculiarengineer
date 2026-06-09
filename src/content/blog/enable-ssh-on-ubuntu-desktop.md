---
title: 'Enable SSH on an Ubuntu desktop'
description: 'Install, start, and firewall the OpenSSH server so you can remote into an Ubuntu desktop — plus the hardening I apply before exposing it beyond a trusted LAN.'
pubDate: 'Jun 09 2026'
heroImage: '../../assets/ubuntu-ssh-hero.jpg'
---

Ubuntu desktop ships with the SSH *client* but not the *server*, so a fresh
install won't accept incoming connections. This is the short runbook I follow to
turn a desktop into something I can `ssh` into from another machine.

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

Look for `active (running)`. Press `q` to exit. To confirm it's actually
listening on port 22:

```bash
ss -tlnp | grep ssh
```

## 4. Allow SSH through the firewall

Ubuntu ships UFW, often inactive. If you use it, open SSH before enabling the
firewall — otherwise you can lock yourself out:

```bash
sudo ufw allow ssh
sudo ufw enable
```

## 5. Find the machine's IP address

```bash
ip a
```

Note the `inet` address on your active interface, e.g. `192.168.1.42`.

## 6. Connect from another machine

```bash
ssh your_username@192.168.1.42
```

## Hardening before you expose it

For anything beyond a trusted LAN, edit `/etc/ssh/sshd_config` and set:

```text
PasswordAuthentication no   # after you've set up key auth
PermitRootLogin no
```

Apply changes with `sudo systemctl restart ssh`. Switch to key-based auth from
your client with `ssh-copy-id your_username@192.168.1.42` *before* turning
passwords off, or you'll lock yourself out.

## Gotchas I hit

- **Service is `ssh`, not `sshd`.** On modern Ubuntu the systemd unit is `ssh`
  (with `ssh.service` and `ssh.socket`). `systemctl status sshd` just errors.
- **UFW order matters.** Enabling the firewall before allowing SSH drops your
  next connection. Always `ufw allow ssh` first.
- **Wi-Fi IP changes.** A DHCP lease can hand the desktop a new address after a
  reboot. Set a static IP or a DHCP reservation if you connect to it regularly.

That's it — the desktop now accepts SSH and survives reboots. `[ SSH OK ]`
