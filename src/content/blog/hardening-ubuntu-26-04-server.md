---
title: 'Hardening Ubuntu 26.04 Server (Resolute Raccoon)'
description: 'A practical hardening pass for a fresh Ubuntu 26.04 LTS server: SSH locked down to keys only, the firewall set before you cut yourself off, automatic security updates with a sane reboot window, fail2ban on the front door, kernel livepatch from the free Ubuntu Pro tier, and an honest look at what is actually listening.'
pubDate: 'Jun 22 2026'
heroImage: '../../assets/ubuntu-2604-server-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Linux', 'Server', 'Security', 'Hardening', 'SSH', 'fail2ban', 'SysAdmin']
---

A server is a different job from a desktop. There is no screen to lock and nobody sitting in front of it, but there is a public IP, an SSH port, and a stream of bots trying every password they have ever seen. This is the hardening pass I run on a fresh Ubuntu 26.04 LTS ("Resolute Raccoon," out 23 April 2026) box before it does anything useful. The desktop version of this is a [separate post](/blog/hardening-ubuntu-26-04-desktop/); almost none of it overlaps.

> **TL;DR** Set the firewall and add your SSH key before you touch sshd. Then lock SSH to keys only, turn on unattended security upgrades with an automatic reboot window, put fail2ban on port 22, enable kernel livepatch from the free Ubuntu Pro tier, and audit what is actually listening with `ss -tulpn`.

## Order matters: do not lock yourself out

The single way to ruin your afternoon is to harden SSH over SSH and get the order wrong. Before you disable password login, make sure your key works, and before you enable the firewall, make sure SSH is allowed through it. Do those two first, every time.

Get your public key onto the box (from your laptop):

```bash
ssh-copy-id user@your-server
```

Then prove you can log in with the key, in a *second* terminal, without closing the first. If the key works while you still have a working session open, you can change sshd safely. If it does not, you have a way back in to fix it.

## Firewall before you cut the cord

UFW is the same uncomplicated firewall as on the desktop, but on a server the policy has to allow SSH explicitly or `enable` will drop your session the moment it takes effect.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
```

`sudo ufw allow OpenSSH` uses the named profile UFW ships, which opens port 22. If you run SSH on a non-standard port, allow that number instead, and do it before `enable`. Add only the ports the box actually serves (`sudo ufw allow 443` for a web service, and so on). Everything else stays shut.

## Lock SSH down to keys only

Now that a key login is confirmed working, harden the daemon. On 26.04 the clean place to put your changes is a drop-in file rather than editing the big `sshd_config` directly, so an upgrade never clobbers them:

```bash
sudo nano /etc/ssh/sshd_config.d/99-hardening.conf
```

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
```

That refuses root logins outright, turns off password and keyboard-interactive auth so the password-guessing bots have nothing to guess, and keeps key auth on. Check the config parses before you reload, because a typo here is how you get locked out:

```bash
sudo sshd -t && sudo systemctl reload ssh
```

If `sshd -t` prints nothing, it is happy. Keep your existing session open and reconnect in a new terminal to confirm key login still works. Note the service is `ssh` on Ubuntu, not `sshd`.

## Automatic security updates, with a reboot window

`unattended-upgrades` is installed and enabled on 26.04, installing security updates on its own. On a server the extra setting worth adding is an automatic reboot, because a kernel or libc patch does nothing until the box restarts, and an unattended server will happily run a vulnerable kernel for months otherwise.

Edit `/etc/apt/apt.conf.d/50unattended-upgrades` and set:

```
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "02:30";
```

That reboots only when an update needs it, at half past two in the morning. Pick a time that suits the workload. If this box must never reboot unattended, leave it false and put a reminder somewhere to apply kernel updates by hand, but know that you are signing up to do it.

## Kernel livepatch, free from Ubuntu Pro

The reboot window above is the blunt fix. The sharper one, if you want to avoid reboots entirely for kernel security fixes, is Livepatch, which patches the running kernel in place. It is part of Ubuntu Pro, and the personal tier is free for up to five machines, which covers most homelab and small-server situations.

```bash
sudo pro attach <your-token>
sudo pro enable livepatch
```

You get your token from the Ubuntu Pro dashboard after signing up for the free tier. With Pro attached you also get the ten-year ESM security coverage that 26.04 LTS is eligible for, which is a strong reason to attach even if you never touch livepatch.

## fail2ban on the front door

Even with passwords off, the bots keep knocking, and the noise alone is worth quieting. fail2ban watches the auth log and temporarily bans IPs that rack up failed attempts.

```bash
sudo apt install fail2ban
```

Ubuntu's package enables its SSH jail through the distribution defaults. Verify that instead of assuming it:

```bash
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

Do not copy the full `jail.conf`; package updates improve that file, and a copied local version pins old defaults in place. Put only your overrides in `/etc/fail2ban/jail.d/sshd.local`. Ubuntu 26.04 also reads SSH failures from the systemd journal rather than relying on `/var/log/auth.log`, which is why I pulled the Python 3.14, journal backend, configuration, and testing details into a separate [Fail2ban on Ubuntu 26.04 guide](/blog/set-up-fail2ban-ubuntu-26-04/). With key-only auth this is more about cutting log noise than stopping a real break-in, but it is cheap and it works.

## See what is actually listening

The smallest attack surface is the one with the fewest open doors. List everything accepting connections:

```bash
sudo ss -tulpn
```

Every line is a service listening on a port, with the process that owns it. Go down the list and justify each one. A fresh server should be close to just SSH and whatever it exists to serve. If something is listening that you did not put there, find the service and disable it:

```bash
sudo systemctl disable --now <service>
```

Databases are the classic mistake here. If a database is bound to `0.0.0.0` and the firewall is not covering you, it is reachable from the internet. Bind it to localhost or a private interface, and never rely on the firewall alone for something that should not be public in the first place.

## The pass in order

Confirm key login, set the firewall with SSH allowed, lock sshd to keys only, turn on unattended upgrades with a reboot window, attach Ubuntu Pro for livepatch and ESM, add fail2ban, then audit the listening ports and shut what you do not need. None of it is exotic, all of it is on a fresh 26.04 box within an hour, and it turns a server that bots can wander into a server that quietly ignores them.
