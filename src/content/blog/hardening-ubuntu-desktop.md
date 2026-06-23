---
title: 'Hardening an Ubuntu Desktop'
description: 'A normal Ubuntu desktop that is meaningfully harder to compromise, set up in an afternoon by one person who is not running a datacenter. Automatic updates, the firewall, disk encryption, a password manager, sandboxed apps, and a backup that actually runs.'
pubDate: 'Jun 22 2026'
heroImage: '../../assets/ubuntu-hardening-hero.png'
tags: ['Ubuntu', 'Linux', 'Security', 'Hardening', 'Firewall', 'Encryption', 'Backup', 'Desktop']
---

Most Linux hardening guides are written for people who run datacenters. They assume you have a threat model, a change control process, and a tolerance for editing config files you have never heard of. If you are a regular person who put Ubuntu on a laptop because you got tired of something else, that advice is overkill, and worse, it leaves you with a machine that is technically hardened and practically unusable.

This is the other guide. What I want is a normal Ubuntu desktop that is meaningfully harder to compromise, set up in an afternoon, that I never have to think about again. No enterprise jargon, no twelve layer defense in depth. Just the handful of things that actually do something for one person and one computer.

> **TL;DR** Turn on automatic security updates, enable UFW, encrypt the disk at install time, use a password manager with 2FA, and set up an automated encrypted backup. Everything past that is refinement.

## First, know what you are defending against

You are not defending against a nation state. For a personal machine the realistic threats are boring: a lost or stolen laptop, a malicious browser extension or download, a reused password that leaked in someone else's breach, and software that is out of date. Almost everything below targets one of those. If a step does not map to a threat you actually face, skip it. Security you do not understand is security you will eventually disable in frustration.

## Keep it updated, automatically

The highest value thing you can do is also the most boring: install security updates promptly. Most real world compromises exploit bugs that were patched months ago.

Ubuntu does this for you, and on a desktop install it is already doing it. The `unattended-upgrades` package ships and is enabled out of the box, so the first move is to confirm rather than install:

```bash
dpkg -l unattended-upgrades
```

If it is there (it almost always is on Ubuntu Desktop), you are done. Only if it is missing, say on a minimal install, do you need:

```bash
sudo apt update
sudo apt install unattended-upgrades
```

The thing worth knowing is what it does by default, because the default is exactly the balance you want. The shipped config in `/etc/apt/apt.conf.d/50unattended-upgrades` installs security updates automatically and leaves everything else alone. That is the default, not something you have to switch on. If you ever want to see or change the behavior, `sudo dpkg-reconfigure --priority=low unattended-upgrades` walks you through the on/off question, but it is not what makes it security only.

I still run a full `sudo apt update && sudo apt upgrade` by hand every couple of weeks to catch the non-security stuff, but the dangerous gaps close without me lifting a finger.

## Turn on the firewall

Ubuntu ships UFW (the "uncomplicated firewall"), installed but switched off. For a desktop that does not run any servers, the right policy is to block all incoming connections and allow all outgoing:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

Those two `default` lines actually restate UFW's own defaults, so the line doing the real work is `enable`. I set them explicitly anyway so the policy is written down where I can see it. Once it is on, nothing on your network can start a connection to your machine, but everything you start (browsing, updates, video calls) works normally.

If you ever do need to let something in, say you are running a game server for an evening, `sudo ufw allow <port>` opens it and `sudo ufw delete allow <port>` closes it again.

## Encrypt your disk

This is the one that protects you when the laptop physically leaves your control: lost, stolen, or left on a train. Without full disk encryption, anyone who picks it up can pull the drive and read every file, password, and photo on it, no login required.

The catch is that the clean way to do this is at install time. In the Ubuntu installer it is not a big obvious checkbox on the main screen. You find it under **Advanced features**, where you tick the option to encrypt the installation (it is tied to LVM). On 24.04 the desktop installer was rewritten, and the encryption option is still there under Advanced features, with an experimental TPM backed mode alongside the classic passphrase one.

Retrofitting encryption onto a system you already installed is genuinely painful and risks data loss. So if you are reading this before installing, encrypt now. If you already installed without it and you have anything sensitive on the machine, the honest answer is that a backup, wipe, reinstall is the reliable path. Annoying, but it is a one time cost for permanent protection.

You set an encryption passphrase separate from your login password. Pick a good one, write it on paper, and store that somewhere safe. If you lose it the data is genuinely gone, which is the whole point.

## Use good passwords and a password manager

Your login password matters more once the disk is encrypted, because now it is a real gate rather than a speed bump. But the bigger win is your online passwords, and the only sustainable way to have a unique strong password for every site is a password manager. I use Bitwarden; KeePassXC is the other obvious pick if you want something fully local. Both are free. Install one, let it generate passwords, and stop trying to remember them.

While you are in there, turn on two factor authentication for your important accounts. Email first, since it is the recovery path for everything else. A leaked password is far less dangerous when it is not enough on its own.

## Be careful with sudo

`sudo` runs things as administrator, and it is where most self inflicted damage happens. Two habits keep you safe. First, do not get in the reflex of pasting `sudo` commands from random websites without reading them. A surprising number of "my Linux broke" stories start exactly there. Second, do not run everyday tasks as root or set up passwordless sudo for convenience. The password prompt is a small useful speed bump that gives you a half second to notice when something is asking for privileges it should not need.

## Prefer sandboxed apps

How you install software affects how much damage it can do. Traditional `apt` packages run with broad access to your system. Flatpak apps run sandboxed, so each app gets limited access to your files and hardware, and a misbehaving or compromised app is boxed in.

For third party desktop apps especially, prefer the Flatpak version from Flathub when one exists. One honest caveat: the sandbox is only as tight as the permissions an app ships with, and plenty of them ask for broad access like your whole home folder. That is where Flatseal comes in. It is itself a Flatpak, and it gives you a friendly toggle list for each app's permissions, so you can revoke things like a media player's access to your home directory.

## Lock your screen and trim what runs

Two small habits round things out. Set your screen to lock automatically after a few minutes idle, and get in the habit of locking it yourself with Super+L whenever you step away. Disk encryption protects a powered off laptop; the screen lock protects the one sitting open at a café. (A suspended laptop sits between the two, since the encryption key is still in memory, so a powered off machine is the only fully safe state.)

The setting moved between releases, which trips people up. On 22.04 it is Settings then Privacy then Screen Lock. On 24.04 the panel was renamed, so it is Settings then Privacy & Security then Screen Lock.

If you turned on Ubuntu Server features or services you do not use, removing them shrinks the surface area. Most desktop users do not need SSH running, for instance. Check what is listening with:

```bash
sudo ss -tulpn
```

Anything in that list is a service accepting connections. If you recognize none of it, good. If something is there you do not use, look up how to disable that specific service.

## Back up, because hardening is not the same as safety

Security keeps people out. Backups get you back on your feet when something goes wrong anyway: ransomware, a failed drive, or your own `rm` in the wrong directory. The encrypted laptop and the auto updates and the firewall all assume the machine survives. Backups are the plan for when it does not.

Use Ubuntu's built in Déjà Dup (it is literally called "Backups" in the app menu), point it at an external drive or a cloud target, turn on encryption for the backup, and let it run on a schedule. The 3-2-1 idea is the gold standard: three copies, two kinds of media, one off-site. For a single user, even one automated encrypted backup to an external drive puts you ahead of almost everyone.

## If you only do five things

Enable automatic security updates, turn on the firewall, encrypt your disk, use a password manager with 2FA, and set up automated backups. That is maybe an afternoon of work, none of it needs you to understand Linux internals, and it closes the doors that actually get walked through. Everything else is nice to have once you have done the part that matters.
