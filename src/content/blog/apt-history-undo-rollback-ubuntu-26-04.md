---
title: 'Undoing an apt install on Ubuntu 26.04'
description: 'Ubuntu 26.04 ships apt 3.2 with a real transaction history: history-list, history-info, history-undo and history-rollback. Here is what each one does on a real box, and the four places undo falls short, including the one case you will most want it for.'
pubDate: 'Aug 22 2026'
heroImage: '../../assets/apt-history-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'apt', 'Linux', 'Server', 'SysAdmin', 'PackageManagement', 'DevOps']
---

You install something at eleven at night, a service stops working, and the only record of what you touched is your shell history and a vague sense of regret. On Ubuntu 24.04 the answer was to read `/var/log/apt/history.log`, work out what changed, and reverse it by hand.

Ubuntu 26.04 ships apt 3.2, and apt now keeps its own transaction log with commands to walk it and reverse it. Five subcommands appeared with no fanfare:

```bash
apt --help | grep -A4 history-list
```

```text
  history-list - show list of history
  history-info - show info on specific transactions
  history-redo - redo transactions
  history-undo - undo transactions
  history-rollback - rollback transactions
```

That is a genuinely useful thing to have. It is also narrower than the word "undo" suggests, and the gap between the two is worth knowing before you rely on it at eleven at night. I went through it on a fresh 26.04 server, deliberately breaking things to find the edges.

> **TL;DR.** `apt history-list` numbers every transaction from 0. `apt history-info <id>` shows exactly which packages and versions changed. `apt history-undo <id>` reverses one, `apt history-rollback <id>` reverses everything after it. Undo works on installs and removals. It does **not** restore or remove your config files, it usually cannot reverse an upgrade because the old version is no longer in the archive, and it will refuse a large meta-package transaction outright. Undos are themselves recorded as new transactions, so nothing ever leaves the history.

## Contents

- [What it looks like on a box you have not touched](#what-it-looks-like-on-a-box-you-have-not-touched)
- [1. Reading the history](#1-reading-the-history)
- [2. Undoing an install](#2-undoing-an-install)
- [3. Undoing a removal](#3-undoing-a-removal)
- [4. The config file question](#4-the-config-file-question)
- [5. Where undo quietly does nothing](#5-where-undo-quietly-does-nothing)
- [6. Where undo refuses outright](#6-where-undo-refuses-outright)
- [7. Rollback, and what "after" means](#7-rollback-and-what-after-means)
- [Nothing ever leaves the history](#nothing-ever-leaves-the-history)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## What it looks like on a box you have not touched

Run it on a server nobody has installed anything on and you get a header and nothing else:

```bash
apt history-list
```

```text
IDCommand line             Date and Time          Action    Changes
```

That is not a typo. `/var/log/apt/history.log` is zero bytes on a fresh image so there is nothing to show, and with no rows the first column is sized to its widest value, which is the word `ID` itself. So the header runs together as `IDCommand line`. Cosmetic, but if you go looking for that string in a script you will not find it.

Every command below also prints this to stderr, once per invocation:

```text
WARNING: apt does not have a stable CLI interface. Use with caution in scripts.
```

Take it seriously. This is a new feature and the output format is not a contract. Parse it in a script and expect to fix that script later.

## 1. Reading the history

Install a few things and the table fills in. **Transaction IDs start at 0**, not 1:

```text
ID Command line             Date and Time          Action    Changes
0  apt-get install -y ng... 2026-08-22  02:29:25   Install   2
1  apt-get remove -y htop   2026-08-22  02:29:39   Remove    1
2  apt-get install -y --... 2026-08-22  02:29:43   Upgrade   3
3  apt-get install -y sl... 2026-08-22  02:29:49   Install   2
4  apt-get install -y fi... 2026-08-22  02:29:54   Install   1
```

The command line is truncated, which is annoying when you ran three similar commands. `history-info` is where the real detail lives:

```bash
apt history-info 0
```

```text
Transaction ID: 0
Start time: 2026-08-22  02:29:25
End time: 2026-08-22  02:29:33
Requested by:
Command line: apt-get install -y nginx
Packages changed:
    Install nginx-common:amd64 (1.28.3-2ubuntu1.10, automatic)
    Install nginx:amd64 (1.28.3-2ubuntu1.10)
```

That is the good stuff. Exact versions, and `automatic` marking the dependency apt pulled in rather than the thing you asked for. That distinction is what makes a clean undo possible.

`Requested by` is empty here because the command ran as root directly rather than through `sudo`.

## 2. Undoing an install

```bash
apt history-undo 0 -y
```

```text
REMOVING:
  nginx  nginx-common

Summary:
  Upgrading: 0, Installing: 0, Removing: 2, Not Upgrading: 0
  Freed space: 1,860 kB
```

It took `nginx-common` with it. That is correct behavior and it is the reason `history-info` bothers to record which packages were automatic: undo removes what the transaction added, dependencies included, rather than leaving orphans behind for `autoremove` to find later.

## 3. Undoing a removal

The inverse works too. `htop` was removed in transaction 1:

```bash
which htop          # nothing
apt history-undo 1 -y
which htop          # /usr/bin/htop
```

It comes back. Worth knowing that undo is directional rather than destructive: it computes the inverse of the transaction, whichever way the transaction went.

## 4. The config file question

This is the one that decides whether you can trust the feature, so test it rather than assuming.

Install nginx, edit its config by hand, then undo the install:

```bash
echo '# EDIT MADE BY HAND' >> /etc/nginx/nginx.conf
apt history-undo 0 -y
```

Afterwards:

```bash
ls /etc/nginx/
tail -1 /etc/nginx/nginx.conf
```

```text
fastcgi.conf  fastcgi_params  ...
# EDIT MADE BY HAND
```

**The directory is still there and your edit is still in it.** Undo behaves like `apt remove`, not `apt purge`. The package is gone, the configuration it shipped stays on disk, and anything you changed by hand stays exactly as you left it.

That cuts both ways and you need both halves in your head. Good: undoing an install will not silently eat an afternoon of config work. Bad: "undo" does not return the machine to its previous state, it returns the *package set* to its previous state. If the thing that broke your server was a config file a package dropped into `/etc`, undoing the transaction does not remove it.

Nothing in the output tells you this. It is the difference between a package manager feature and a filesystem snapshot, and the word undo does a lot of work on your expectations.

## 5. Where undo quietly does nothing

Here is the failure that matters most, because it hits the exact case you would reach for this feature.

Transaction 2 was a `curl` security upgrade:

```text
Transaction ID: 2
Command line: apt-get install -y --only-upgrade curl
Packages changed:
    Upgrade curl:amd64 (8.18.0-1ubuntu2.3 -> 8.18.0-1ubuntu2.4)
    Upgrade libcurl3t64-gnutls:amd64 (8.18.0-1ubuntu2.3 -> 8.18.0-1ubuntu2.4)
    Upgrade libcurl4t64:amd64 (8.18.0-1ubuntu2.3 -> 8.18.0-1ubuntu2.4)
```

Undo it:

```bash
apt history-undo 2 -y
```

```text
curl is already the newest version (8.18.0-1ubuntu2.4).
Summary:
  Upgrading: 0, Installing: 0, Removing: 0, Not Upgrading: 0
```

Nothing happened. No error, no warning, and an exit that looks like success. The machine is exactly as it was and you would be forgiven for walking away believing you had rolled the upgrade back.

The reason is in the archive, not in apt:

```bash
apt-cache madison curl
```

```text
curl | 8.18.0-1ubuntu2.4 | .../resolute-updates/main amd64 Packages
curl | 8.18.0-1ubuntu2.4 | .../resolute-security/main amd64 Packages
curl | 8.18.0-1ubuntu2   | .../resolute/main amd64 Packages
```

`8.18.0-1ubuntu2.3`, the version the box was running an hour earlier, is not there. Ubuntu's `-updates` and `-security` pockets hold the current version, not a series of them. When `2.4` shipped it replaced `2.3`, and `2.3` stopped being downloadable through apt. It is not gone from the world: Launchpad keeps superseded builds, so you can still fetch that exact `.deb` by hand and `dpkg -i` it. That is the real escape hatch when a security update breaks something and you need precisely the version you were on. It is just not what `history-undo` does. Confirm by asking for it directly:

```bash
apt-get install --allow-downgrades curl=8.18.0-1ubuntu2.3
```

```text
E: Version '8.18.0-1ubuntu2.3' for 'curl' was not found
```

So the honest summary is: **`history-undo` cannot usually reverse a security upgrade, and it does not tell you it failed.** Since "a security update broke my service, put it back" is the most common reason anyone wants an undo button, this is the limitation to internalize before you need it.

It gets one degree worse. A no-op undo is not recorded, so the history jumps straight from transaction 6 to the next real change. There is no trace that you tried.

If you do not need that exact version and just want off the current one, apt can still reach whatever the release pocket froze:

```bash
apt-get install --allow-downgrades curl=8.18.0-1ubuntu2
```

That works, and it is worth being clear about what it costs. `8.18.0-1ubuntu2` is what 26.04 shipped with in April. It is older than the `2.3` you were happily running an hour ago, so you are going back past the transaction you were trying to reverse and giving up whatever `2.3` fixed along the way. The release pocket keeps its version permanently. It is the `-updates` and `-security` chain that evaporates behind you.

## 6. Where undo refuses outright

Large meta-package transactions do not reverse cleanly. Installing `linux-image-generic` recorded a single transaction touching 37 packages, microcode and firmware among them:

```text
Transaction ID: 6
Command line: apt-get install -y linux-image-generic
Packages changed:
    Install amd64-microcode:amd64 (3.20251202.1ubuntu2, automatic)
    Install firmware-sof-signed:amd64 (2025.12.2-1, automatic)
    Install intel-microcode:amd64 (3.20260210.1ubuntu2, automatic)
    ...
```

Undoing it:

```bash
apt history-undo 6 -y
```

```text
Error: Unable to satisfy dependencies. Reached two conflicting assignments:
```

This one at least fails loudly, which is the correct way to fail. I did not chase down which pair of assignments conflicted, and you probably should not either. The useful reading is that apt would rather refuse the whole reversal than do half the job, so when you see this, stop fighting it and remove the specific packages you want gone by hand.

Treat undo as reliable for the small, deliberate transaction you just ran, and unreliable for anything that pulled in a kernel or a large meta-package.

## 7. Rollback, and what "after" means

`history-rollback <id>` reverses everything that happened *after* that transaction, leaving the transaction itself alone. With this history:

```text
1  apt-get remove -y htop
2  apt-get install -y --only-upgrade curl
3  apt-get install -y sl cowsay
4  apt-get install -y figlet
```

then `apt history-rollback 1 -y` produced:

```text
Remove cowsay:amd64 (3.03+dfsg2-8build1)
Remove figlet:amd64 (2.2.5-3.1)
Remove sl:amd64 (5.02-1build1)
```

Transactions 3 and 4 reversed. Transaction 1 itself untouched, so `htop` stayed removed. Transaction 2, the curl upgrade, was skipped silently for the reason in section 5.

So read it as "put me back to the state I was in immediately after transaction 1", with the same caveats as undo applying to every step along the way. Rollback is undo in a loop, and it inherits every limitation undo has, including the quiet ones.

## Nothing ever leaves the history

Undo does not erase the thing it undid. It records a new transaction:

```text
6  apt-get install -y li... 2026-08-22  02:30:14   I,U       37
7  history-undo 0 -y        2026-08-22  02:32:52   Remove    2
8  history-undo 1 -y        2026-08-22  02:32:56   Install   1
```

Transaction 7 is the undo of 0, and its action is `Remove` because that is what it did. Transaction 8 is the undo of 1 and its action is `Install`. A `history-rollback` shows up the same way.

Two consequences. To undo an undo, you undo the undo's ID, not the original. And the audit trail is honest, which matters more than it sounds: the record of what happened to the machine includes your corrections, so nothing you did disappears from it.

Re-undoing something already undone is a safe no-op:

```text
Summary:
  Upgrading: 0, Installing: 0, Removing: 0, Not Upgrading: 0
```

## Gotchas worth knowing

**Undo is not purge.** Config files survive, including your edits. The package set goes back, the filesystem does not.

**Undoing an upgrade usually does nothing and says nothing.** The old version is no longer in `-updates` or `-security`. Check with `apt-cache madison <pkg>` before you trust it, and use `apt-get install --allow-downgrades <pkg>=<version>` when the version is still available.

**A no-op undo leaves no transaction.** If you are auditing later, an attempt that did nothing is invisible.

**IDs start at 0.** A script reaching for the first line gets the header, not a transaction, and there is a blank line between the header and the first row.

**Every invocation warns that the CLI is unstable.** On stderr, so it does not pollute a pipe, but do not build anything load bearing on this output shape yet.

**It is not a snapshot.** If you want the machine restored rather than the package set, that is still ZFS, Btrfs, or your provider's snapshot button. This feature does not compete with those and does not claim to.

**A sibling command worth knowing about.** The same apt release added `apt modernize-sources`, which converts old `.list` files into deb822 `.sources` files. If you [upgraded from 24.04](/blog/upgrade-ubuntu-24-04-to-26-04/) and found a repo renamed to `.list.disabled` with a note saying it could not be migrated automatically, this is the tool that does that conversion. It wants a live `.list` file though, not the commented out corpse the upgrader leaves behind, so you rename it back and uncomment the line first, by which point you have done most of the work yourself.

## Quick reference

```bash
apt history-list                    # every transaction, newest last, IDs from 0
apt history-info 4                  # exact packages and versions in one transaction
apt history-undo 4                  # reverse one transaction
apt history-rollback 4              # reverse everything AFTER 4, keeping 4
apt history-redo 4                  # reapply one
apt history-undo 4 -y               # skip the confirmation

apt-cache madison curl              # is the old version even still available?
apt-get install --allow-downgrades curl=8.18.0-1ubuntu2   # when undo will not
```

The feature is a real improvement and I will use it. Just know that it puts packages back, not machines, and that the one time you will most want it, a bad security update, is the one time it is most likely to shrug and do nothing.

`[ history-undo 0 ✓ ]`
