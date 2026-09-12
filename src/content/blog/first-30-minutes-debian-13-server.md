---
title: 'The first 30 minutes on a Debian 13 server: sudo user, nftables, SSH keys, and the fail2ban trap that locked me out'
description: 'A fresh Debian 13 cloud image hands you root and nothing else: no sudo user, no firewall enabled, passwords still allowed over SSH. This is the hardening pass I run first, the Debian way with nftables and no ufw, plus the fail2ban gotcha that banned my own admin IP with a reject rule so it looked like sshd had died, and survived a reboot. Tested on a fresh Trixie box, lockout and rescue included.'
pubDate: 'Sep 12 2026'
heroImage: '../../assets/first-30-minutes-debian-13-hero.png'
tags: ['Debian', 'Debian13', 'Linux', 'Server', 'Security', 'Hardening', 'SSH', 'Nftables', 'Fail2ban', 'SysAdmin']
---

A fresh Debian 13 cloud image hands you root and nothing else. No sudo user, no firewall running, and SSH still accepting passwords. (An installer-built box lets you make a user during setup, but the cloud images most VPS providers hand you do not.) That is a reasonable Debian default, but it means the box is not ready to face the internet until you have done a few things. This is the pass I run in the first half hour, and it is the Debian version of my [Ubuntu 26.04 server hardening post](/blog/hardening-ubuntu-26-04-server/), which it deliberately does not copy, because Debian has no ufw, no Ubuntu Pro, and a couple of traps Ubuntu does not.

One of those traps cost me the box. fail2ban, set up the obvious way, banned my own admin IP with a reject rule that made SSH look dead, and a reboot did not clear it. I got back in through rescue mode. I did that on a lab box on purpose so the fix is in here too.

> **TL;DR.** Make a sudo user and put your SSH key on it before anything else. Set the firewall with nftables (there is no ufw) allowing only port 22, then lock SSH to keys with `PermitRootLogin no` and `PasswordAuthentication no` in a `sshd_config.d` drop-in. `unattended-upgrades` is already installed and on; add a reboot window. Install `fail2ban`, then immediately put your own admin IP in `ignoreip` and restart it, because its default nftables action rejects banned addresses (so a ban looks like a dead sshd) and it restores active bans after a reboot, so a fumbled root login during setup can lock you out in a way rebooting will not fix.

## Contents

- [Order matters: do not lock yourself out](#order-matters-do-not-lock-yourself-out)
- [What a fresh box actually gives you](#what-a-fresh-box-actually-gives-you)
- [A sudo user and your key](#a-sudo-user-and-your-key)
- [The firewall, with nftables](#the-firewall-with-nftables)
- [Lock SSH to keys](#lock-ssh-to-keys)
- [Automatic security updates](#automatic-security-updates)
- [fail2ban, and how it locked me out](#fail2ban-and-how-it-locked-me-out)
- [The pass in order](#the-pass-in-order)
- [Quick reference](#quick-reference)

## Order matters: do not lock yourself out

The order of these steps is the whole game. Set the firewall and get your SSH key working before you touch the SSH daemon, so that if you fat-finger the sshd config you still have a way in. Do fail2ban last, and the moment it is installed put your own IP in its ignore list, because it is the one tool here whose job is to block SSH and it does not care that the SSH it is blocking is yours. Everything below is in the order I actually run it.

## What a fresh box actually gives you

Worth seeing before you change it. Root is the only login account, and the `sudo` group is empty:

```bash
$ getent group sudo
sudo:x:27:
$ passwd -S root
root L 2017-11-08 0 99999 7 -1
```

The firewall is installed but doing nothing. nftables is present, disabled, with an empty skeleton ruleset, and there is no ufw at all, which is the Ubuntu tool people reach for and will not find here:

```bash
$ systemctl is-enabled nftables
disabled
```

SSH allows root by key (root's own password is locked, so `prohibit-password` means key only for root) and still allows password logins for any normal account you create later:

```bash
$ sshd -T | grep -E '^(permitrootlogin|passwordauthentication)'
permitrootlogin prohibit-password
passwordauthentication yes
```

One good default: `unattended-upgrades` is already installed and switched on. And two absences that matter later: there is no `rsyslog` and therefore no `/var/log/auth.log`. This image logs to the systemd journal only unless you install rsyslog yourself, and that single fact decides how fail2ban has to be configured. (ufw is not installed either, though it is in the archive if you prefer it to raw nftables.)

## A sudo user and your key

Make the user, give it a password, put it in the `sudo` group, and copy root's authorized key onto it:

```bash
sudo adduser keith
sudo usermod -aG sudo keith
sudo install -d -m 700 -o keith -g keith /home/keith/.ssh
sudo install -m 600 -o keith -g keith /root/.ssh/authorized_keys /home/keith/.ssh/authorized_keys
```

`adduser` is the friendly Debian wrapper, it prompts for the password and creates the home directory. On Debian the `sudo` group is what grants sudo, via the `%sudo ALL=(ALL:ALL) ALL` line in `/etc/sudoers`, so adding `keith` to it is all you need. Unlike root, that user is asked for its password the first time it sudos, which is what you want:

```bash
$ su - keith -c 'sudo -n true'
sudo: a password is required
```

Now open a second SSH session as `keith` and confirm the key works and `sudo` works, and keep that session open for the rest of this post. Do not close it until the very end. It is your safety line.

## The firewall, with nftables

No ufw, so this is raw nftables, which is fine because the ruleset for a server is short. Debian already has a `/etc/nftables.conf` with an empty skeleton and a disabled service. Replace the file with a real ruleset:

```bash
sudo tee /etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        iif lo accept
        ct state established,related accept
        ct state invalid drop
        ip protocol icmp accept
        meta l4proto ipv6-icmp accept
        tcp dport 22 accept
    }
    chain forward {
        type filter hook forward priority filter; policy drop;
    }
    chain output {
        type filter hook output priority filter; policy accept;
    }
}
EOF
```

The input chain drops by default, then allows loopback, established connections, ping, and new connections to port 22. Everything else is silently dropped, not rejected, so a port scan just hangs. (`meta l4proto ipv6-icmp` catches ICMPv6 even when it sits behind an IPv6 extension header, which the shorter `ip6 nexthdr icmpv6` form misses.) Check the syntax before you load it, then enable the service so it survives a reboot:

```bash
sudo nft -c -f /etc/nftables.conf     # -c checks without applying
sudo systemctl enable --now nftables
sudo nft list ruleset                  # confirm it is live
```

`nft -c` is the safety check. It parses the file and reports errors without touching the live ruleset, which is worth doing every time because a syntax error in an nftables file loaded at boot can leave you with no rules at all. Because your SSH is already up and the ruleset allows 22 and established connections, enabling this does not cut your session.

## Lock SSH to keys

Now that the firewall is up and your key works, lock the daemon down. Debian 13's sshd reads configuration snippets from `/etc/ssh/sshd_config.d/`, and the main config already ends with an `Include` line for that directory, so put your changes in a file there rather than editing the main config:

```bash
sudo tee /etc/ssh/sshd_config.d/50-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
sudo sshd -t && sudo systemctl restart ssh
```

`sshd -t` tests the config and stays silent if it is good, which is the check that stops a typo from taking the daemon down on restart. The service is `ssh` on Debian (`sshd` works as an alias, but `ssh` is the real unit). The drop-in is named `50-` so it loads in the middle: sshd takes the first value it sees for each option, so a drop-in that sorts earlier than yours would win, worth a glance with `sshd -T` if you have others. Confirm it took:

```bash
$ sudo sshd -T | grep -E '^(permitrootlogin|passwordauthentication)'
permitrootlogin no
passwordauthentication no
```

Test a new connection as `keith` before you close that safety session. Root over SSH now gets refused outright, and password attempts never get a prompt. One Debian 13 note worth holding onto: the process that handles each login logs as `sshd-session`, not `sshd`, because OpenSSH split the per-session work into a separate binary in 9.8. It matters in a moment, because it is what fail2ban's journal match has to catch.

## Automatic security updates

unattended-upgrades is already installed and enabled, which you can confirm:

```bash
$ cat /etc/apt/apt.conf.d/20auto-upgrades
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
```

By default it upgrades from the Debian and Debian-Security origins for your release. Note that the allowed origins include the plain `label=Debian` stable origin, not only `Debian-Security`, so it is a touch broader than security-only, which surprises people who assume the name means what it says. A dry run shows exactly which origins are in scope:

```bash
$ sudo unattended-upgrade --dry-run -d 2>&1 | grep 'Allowed origins'
Allowed origins are: origin=Debian,codename=trixie,label=Debian, origin=Debian,codename=trixie,label=Debian-Security, ...
```

The one thing worth adding is a reboot window. When an update leaves `/var/run/reboot-required` behind, which a new kernel does, the box otherwise waits forever:

```bash
sudo tee /etc/apt/apt.conf.d/52autoreboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
```

That reboots at 03:30 only when an update left the `reboot-required` flag. Pick a time your box is idle.

## fail2ban, and how it locked me out

This is the section that earns the post. fail2ban watches for repeated failed logins and bans the source. On Debian 13 it has one non-obvious requirement and one genuinely dangerous default, and I hit both.

Install it and look at what Debian preconfigures. Run `sudo apt update` first if you have not lately, because on a fresh image the package index can be stale enough that `apt install fail2ban` reports it cannot find the package:

```bash
$ sudo apt update && sudo apt install fail2ban
$ cat /etc/fail2ban/jail.d/defaults-debian.conf
[DEFAULT]
banaction = nftables
banaction_allports = nftables[type=allports]

[sshd]
backend = systemd
journalmatch = _SYSTEMD_UNIT=ssh.service + _COMM=sshd
enabled = true
```

Two things to read there. The ban action is `nftables`, which is correct for this box, and the sshd jail's backend is `systemd`. That backend is not optional on Debian 13: there is no `/var/log/auth.log` because there is no rsyslog, so a file-based backend would watch a log that never gets written and never ban anything. The systemd backend reads the journal instead, matching `_SYSTEMD_UNIT=ssh.service`, and that is the only way it sees anything. If you copy an old jail.local from an Ubuntu box that sets `backend = auto` or points at `/var/log/auth.log`, fail2ban silently protects nothing.

Here is where it went wrong. The `/etc/fail2ban` directory does not exist until the package is installed, so you cannot write your `jail.local` before installing, which is the order I first assumed. What actually protects you is writing it immediately after the install, before you accumulate any more failed logins, and restarting. I did not, I had already been failing root logins during the SSH step above, so by the time I set a small `jail.local` and restarted, the damage was done:

```bash
$ sudo fail2ban-client status sshd
...
   `- Banned IP list:	10.0.1.20 104.3.77.33
```

Two IPs banned. One was a machine I had been failing logins from on purpose. The other, `104.3.77.33`, was my own workstation, banned because of all the root logins I had been refused while testing the sshd lockdown above. fail2ban counts your own failed root attempts, and I had made plenty.

Now the dangerous part, in two halves. First, fail2ban's nftables action does not drop banned traffic, it rejects it:

```bash
$ sudo nft list table inet f2b-table
table inet f2b-table {
    set addr-set-sshd {
        type ipv4_addr
        elements = { ... }
    }
    chain f2b-chain {
        type filter hook input priority filter - 1; policy accept;
        tcp dport 22 ip saddr @addr-set-sshd reject with icmp port-unreachable
    }
}
```

`reject with icmp port-unreachable` sends back an ICMP error, and the client reports it as `Connection refused`, exactly what you see when nothing is listening on the port. So from my workstation, a banned admin IP, SSH looked like the daemon had died. It had not. fail2ban was turning me away at the door.

Second, I rebooted the box expecting the ban to clear, and it did not. fail2ban is not purely in-memory: it keeps active bans in a small SQLite database (`/var/lib/fail2ban/fail2ban.sqlite3`) and restores any whose `bantime` has not expired when it starts, so a ban with an hour to run comes straight back on boot. On top of that, with the systemd backend it rescans the journal on startup, and my failed logins were still inside the `findtime` window, so even a cleared database would have re-banned me. Between the two, a reboot does not save you. That is what makes this trap worse than a normal firewall mistake, which a reboot usually clears.

I got back in through the provider's rescue system, mounted the disk, and added my IP to the whitelist in the config directly:

```bash
# from a rescue system, with the root filesystem mounted at /mnt
sudo tee /mnt/etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 203.0.113.10
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF
```

Replace `203.0.113.10` with your own admin IP or range. On the next normal boot, fail2ban reads `ignoreip` and never bans that address even when it scans the journal and finds the old failures. That is the fix, and it is why you set `ignoreip` before you ever enable the jail, not after you are locked out. With the whitelist in place, the ban wiring works exactly as intended for everyone else: a banned address lands in the `addr-set-sshd` set and gets the reject, and `fail2ban-client set sshd unbanip <ip>` removes it.

## The pass in order

1. Make a sudo user, put your SSH key on it, open a second session as that user and keep it open.
2. Write the nftables ruleset, check it with `nft -c`, enable the service.
3. Lock SSH to keys in a `sshd_config.d` drop-in, test with `sshd -t`, restart, and confirm from a new session.
4. Add a reboot window to `unattended-upgrades`.
5. `sudo apt update && sudo apt install fail2ban`, and immediately write `/etc/fail2ban/jail.local` with your admin IP in `ignoreip`, then `sudo systemctl restart fail2ban`. The config directory only exists after the install, so this is the first thing you do once it does, before any more failed logins pile up.

The lesson is that gap between installing fail2ban and whitelisting yourself. Close it in one breath. I left it open on the lab box, while I had already been fumbling root logins, and it cost me a rescue boot.

## Quick reference

```bash
# sudo user + key
sudo adduser keith && sudo usermod -aG sudo keith
sudo install -d -m 700 -o keith -g keith /home/keith/.ssh
sudo install -m 600 -o keith -g keith /root/.ssh/authorized_keys /home/keith/.ssh/authorized_keys

# firewall (no ufw on Debian)
sudo tee /etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
flush ruleset
table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;
        iif lo accept
        ct state established,related accept
        ct state invalid drop
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept
        tcp dport 22 accept
    }
    chain forward { type filter hook forward priority filter; policy drop; }
    chain output  { type filter hook output priority filter; policy accept; }
}
EOF
sudo nft -c -f /etc/nftables.conf && sudo systemctl enable --now nftables

# ssh: keys only, in a drop-in
sudo tee /etc/ssh/sshd_config.d/50-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo sshd -t && sudo systemctl restart ssh    # service is 'ssh', not 'sshd'

# unattended-upgrades reboot window (it is already enabled)
sudo tee /etc/apt/apt.conf.d/52autoreboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
EOF

# fail2ban: install, then IMMEDIATELY whitelist your ip and restart
sudo apt update && sudo apt install fail2ban
sudo tee /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 203.0.113.10
bantime = 1h
findtime = 10m
maxretry = 5
[sshd]
enabled = true
EOF
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

The steps here are short. The one that bites is fail2ban, because its job is to block SSH and on Debian it does so with a reject rule and a memory that outlives a reboot. Whitelist yourself the moment it is installed, keep a second session open while you work, and the first thirty minutes end with a box you can actually leave facing the internet.

`[ your key first. your IP whitelisted. then close the door. ]`
