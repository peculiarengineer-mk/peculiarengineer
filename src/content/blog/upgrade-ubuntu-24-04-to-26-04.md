---
title: 'Upgrading Ubuntu 24.04 to 26.04 before the door opens'
description: 'The LTS to LTS path does not open until 26.04.1 on 27 August 2026, and the reason is one line in a file on Canonical''s server. I forced it early on a throwaway Hetzner box to find out what is waiting: the reboot that blocks the upgrade, the two different ways your outside repos get killed, the provider mirror you silently lose, and a userland where ls and sort no longer agree on alphabetical order.'
pubDate: 'Aug 21 2026'
heroImage: '../../assets/upgrade-2604-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Ubuntu2404', 'Linux', 'Server', 'Upgrade', 'apt', 'coreutils', 'SysAdmin', 'Hetzner']
---

Ask a fully patched Ubuntu 24.04 server today whether there is anything to upgrade to, and it says no. Ubuntu 26.04 came out in April. It is right there. The machine is not confused and neither are you, but nothing about the message explains itself:

```bash
sudo do-release-upgrade -c
```

```text
Checking for a new Ubuntu release
There is no development version of an LTS available.
To upgrade to the latest non-LTS development release
set Prompt=normal in /etc/update-manager/release-upgrades.
```

That mentions development releases, which is not what you asked for, and says nothing about 26.04. The real answer is one line in a file on Canonical's server, and it flips on **27 August 2026**, when 26.04.1 ships.

So I forced it early. I upgraded a real 24.04 server to 26.04 on a Hetzner box that cost a couple of cents and that I threw away afterwards, which is a thing I now do on [a disposable lab I built for exactly this](/blog/disposable-hetzner-lab-opentofu/). Everything below is from that run. The upgrade itself took ten minutes and twenty three seconds and came back clean on the first reboot. The interesting part is not the upgrade. It is what it quietly changed underneath: your repositories, your package mirror, your userland, and your Python virtualenvs. One of those will outlive your attention span and start rotting the box weeks later.

> **TL;DR.** The path opens on 27 August with 26.04.1. Until then only `do-release-upgrade -d` works. Run `apt full-upgrade` first, then **reboot**, because a pending kernel makes the upgrader refuse outright. Every repo that is not Ubuntu's gets disabled, in two different ways depending on file format, and your provider's fast Ubuntu mirror gets swapped for `archive.ubuntu.com` without a word. Afterwards `ls` comes from Rust and `cp` comes from GNU on the same box, and `ls` ignores your locale's sort order while `sort` still respects it. `apt list '?obsolete'` is the command that finds what got left behind.

## Contents

- [Why your box says there is no new release](#why-your-box-says-there-is-no-new-release)
- [Do this on a machine you can throw away](#do-this-on-a-machine-you-can-throw-away)
- [1. Update, then reboot, and do not skip the reboot](#1-update-then-reboot-and-do-not-skip-the-reboot)
- [2. Run it](#2-run-it)
- [3. Your outside repos, killed two different ways](#3-your-outside-repos-killed-two-different-ways)
- [4. You quietly lose your provider's mirror](#4-you-quietly-lose-your-providers-mirror)
- [5. The split userland](#5-the-split-userland)
- [6. What actually changed](#6-what-actually-changed)
- [Dracut did not happen, and other things the notes oversell](#dracut-did-not-happen-and-other-things-the-notes-oversell)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## Why your box says there is no new release

`do-release-upgrade` does not look at what exists. It downloads a file called `meta-release-lts` from Canonical and reads a flag out of it. Fetch it yourself:

```bash
curl -s https://changelogs.ubuntu.com/meta-release-lts | grep -A5 '^Dist: resolute'
```

```text
Dist: resolute
Name: Resolute Raccoon
Version: 26.04 LTS
Date: Thu, 23 April 2026 00:26:04 UTC
Supported: 0
Description: This is the 26.04 LTS release
```

`Supported: 0`. That is the whole answer. Canonical does not open LTS to LTS upgrades on release day. They open them at the first point release, which is 26.04.1 on 27 August 2026, and on that day this becomes `Supported: 1` and every 24.04 box in the world starts offering you the upgrade.

The prompt setting on the box is a separate dial, and it is worth checking that it is what you think:

```bash
grep ^Prompt /etc/update-manager/release-upgrades
# Prompt=lts
```

`lts` is the default on Ubuntu Server and it is correct. Do not change it to `normal` because the error message suggested it. That message is telling you what would happen if you wanted a non-LTS development release, which on an LTS server is not a thing you want.

If you are reading this on or after 27 August, none of this applies to you. Drop the `-d` from every command below and everything else holds.

## Do this on a machine you can throw away

I mean it, and not as a ritual disclaimer. `do-release-upgrade` replaces the kernel, the init system, the package manager, and most of `/usr/bin` in one transaction. It went perfectly for me. It is still the single most invasive thing you can do to a running Linux box without reinstalling it.

Before touching anything you care about:

- Snapshot the machine, or make sure you can rebuild it from configuration. On a VPS this is one click and it is the difference between an inconvenience and an evening.
- Do it on the console or in `tmux`. If the upgrade owns your only SSH session and the session dies, you get to find out how good your provider's rescue console is. The interactive upgrader offers to start a second sshd on port 1022 as a safety net, which I did not see because I ran it non-interactively, and which is not a thing to rely on either way.
- Have physical or console access to fix a boot failure. The reboot at the end is the real test.

I ran the whole thing non-interactively inside a runbook against a disposable Hetzner box, which is the only reason I was willing to build it again after getting the first attempt wrong.

## 1. Update, then reboot, and do not skip the reboot

Every guide tells you to fully update 24.04 first, which is correct:

```bash
sudo apt update
sudo apt full-upgrade
sudo apt autoremove
```

Nobody tells you what that does to you next. On my box `full-upgrade` installed kernel `6.8.0-138` while the machine was running `6.8.0-137`. That creates a file, and `do-release-upgrade` checks for that file and refuses:

```text
Checking for a new Ubuntu release
You have not rebooted after updating a package which requires a reboot. Please reboot before upgrading.
```

No amount of retrying, no flag, and nothing about the message tells you what package. Here is what it is looking at:

```bash
cat /var/run/reboot-required
# *** System restart required ***
cat /var/run/reboot-required.pkgs
# linux-image-6.8.0-138-generic
# linux-base
```

So the sequence is update, reboot, **then** upgrade. Not update then upgrade. Reboot and confirm the file is gone before you continue:

```bash
sudo reboot
# after it comes back
uname -r                          # should be the new kernel
ls /var/run/reboot-required       # should say No such file or directory
```

## 2. Run it

With the reboot done:

```bash
sudo do-release-upgrade -d
```

Drop the `-d` from 27 August. It will ask you to confirm, tell you how many packages it is changing, and then ask about configuration files it cannot merge. For an unattended run, which is what I did:

```bash
sudo RELEASE_UPGRADER_NO_REBOOT=1 DEBIAN_FRONTEND=noninteractive \
  do-release-upgrade -d -f DistUpgradeViewNonInteractive
```

`RELEASE_UPGRADER_NO_REBOOT=1` is the part worth stealing. The non-interactive frontend is built to restart the machine as soon as it is done, and if you are watching over SSH that costs you the end of the log at exactly the moment it gets interesting. My run stopped at `confirmRestart() called` in `main.log` and sat there, which is what I wanted, and is worth confirming yourself before you depend on it.

Ten minutes and twenty three seconds later, on two cores, it was done. The log lives in `/var/log/dist-upgrade/`, and `main.log` is the one that tells you what decisions it made about your configuration. Read it before you reboot, not after.

## 3. Your outside repos, killed two different ways

This is the part that gets people, and it gets them slowly.

The upgrader disables every repository that is not Ubuntu's, because a repo built for `noble` has nothing in it for `resolute` and leaving it enabled would break the transaction. Fine. What is not obvious is that it does this **differently depending on the file format**, and only one of the two is easy to spot afterwards.

I set the box up the way my own guides tell people to, with Docker's repo in modern deb822 format and Tailscale's as a one line `.list`. Here is what each looked like afterwards.

The deb822 file keeps its name and gets one line appended:

```bash
cat /etc/apt/sources.list.d/docker.sources
```

```text
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
Enabled: no
```

`Enabled: no` at the bottom, and `Suites` still says `noble`. The one line file gets renamed and commented out entirely:

```bash
cat /etc/apt/sources.list.d/tailscale.list.disabled
```

```text
# This file could not be automatically migrated to a .sources file during the upgrade.
# Please see sources.list(5) for details on how to migrate manually.

# deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/ubuntu noble main
```

Two formats, two fates, and the second one no longer matches `ls /etc/apt/sources.list.d/*.list` in whatever script you wrote to audit these.

The software itself keeps working. Docker ran `hello-world` fine after the reboot and `tailscaled` came back active. That is the trap. Nothing is broken, so nothing draws your attention, and meanwhile those packages are frozen at their `noble` builds and will never see another update:

```bash
apt list '?obsolete'
```

```text
containerd.io/now 2.3.3-1~ubuntu.24.04~noble amd64 [installed,local]
docker-ce/now 5:29.7.2-1~ubuntu.24.04~noble amd64 [installed,local]
docker-ce-cli/now 5:29.7.2-1~ubuntu.24.04~noble amd64 [installed,local]
docker-compose-plugin/now 5.5.0-1~ubuntu.24.04~noble amd64 [installed,local]
...
```

Eleven packages on my box, six of them Docker's. `[installed,local]` means installed but present in no enabled repository. A Docker with no update path is a Docker that stops getting security fixes, and you will not notice for months.

The fix is to point each repo at `resolute` and re-enable it, and the two formats need different work.

For Docker, edit `docker.sources`, change `Suites: noble` to `Suites: resolute`, and delete the `Enabled: no` line.

For Tailscale there are four steps, because the upgrader did more than flip a flag. Rename `tailscale.list.disabled` back to `tailscale.list`, delete the two comment lines the upgrader added at the top, uncomment the `deb` line, and change the suite from `noble` to `resolute`. That suite is the bare word after the URL, not part of the URL itself:

```text
deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/ubuntu resolute main
```

Both of those vendors do publish for `resolute`, which I checked before recommending it:

```bash
curl -sI https://download.docker.com/linux/ubuntu/dists/resolute/Release | head -1
curl -sI https://pkgs.tailscale.com/stable/ubuntu/dists/resolute/Release | head -1
# HTTP/2 200
# HTTP/2 200
```

Then:

```bash
sudo apt update
sudo apt full-upgrade
```

Do this deliberately and one at a time. A vendor who has not published for `resolute` yet will give you a `404` on `apt update`, which is the correct signal to leave that one disabled and check back rather than to start hunting for a workaround.

The audit command worth keeping is the first one:

```bash
apt list '?obsolete'
```

Anything it returns is a package your system is carrying with no way to update it.

The quicker `dpkg -l | grep noble` also works and is easier to remember, but only for vendors who bake the codename into their version strings. Docker does, so its six packages show up. Tailscale does not, its version is a plain `1.102.3`, and neither do Ubuntu's own kernel packages. Use the grep to spot vendor leftovers in a hurry. Use `?obsolete` when you actually want the answer.

## 4. You quietly lose your provider's mirror

This one is not in any release note I could find and it is the reason I am glad I tested on a real cloud box rather than a plain image.

Hetzner's Ubuntu images ship with `ubuntu.sources` pointed at `mirror.hetzner.com`, which is on the same network as the server and is fast. After the upgrade, that stanza is still in the file, and it looks like this:

```text
Types: deb
URIs: https://mirror.hetzner.com/ubuntu/packages
Suites: noble-backports noble-updates noble
Components: main universe restricted multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
Enabled: no
```

Disabled, still on `noble`. And appended below it, two brand new stanzas:

```text
Types: deb
URIs: http://archive.ubuntu.com/ubuntu
Suites: resolute resolute-updates
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: http://security.ubuntu.com/ubuntu
Suites: resolute-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
```

Note what is not in there. The old Hetzner stanzas covered `noble-backports`. The new ones do not mention `resolute-backports` at all, so if you were relying on backports you have silently lost that as well. Add it to the suites line yourself:

```text
Suites: resolute resolute-updates resolute-backports
```

The upgrader treated the provider mirror as just another repository it did not recognise, disabled it, and added Canonical's general archive in its place. Everything works. Every `apt` operation from now on goes across the internet to `archive.ubuntu.com` instead of staying on your provider's network, over plain HTTP, forever, unless you notice.

If your provider runs a mirror, put it back:

```bash
sudo sed -i 's|http://archive.ubuntu.com/ubuntu|https://mirror.hetzner.com/ubuntu/packages|; s|http://security.ubuntu.com/ubuntu|https://mirror.hetzner.com/ubuntu/security|' \
  /etc/apt/sources.list.d/ubuntu.sources
sudo apt update
```

Then delete the two dead `noble` stanzas, the packages one shown above and the matching `noble-security` one below it, so the next person to read that file is not confused by them.

## 5. The split userland

Ubuntu 26.04 ships [uutils](https://uutils.github.io/), a reimplementation of coreutils in Rust, as the default. You have read that. What the summary does not prepare you for is that it is not a clean swap, and you end up running two implementations side by side.

Ask two commands what they are:

```bash
ls --version | head -1
# ls (uutils coreutils) 0.8.0

cp --version | head -1
# cp (GNU coreutils) 9.7
```

Same box, same `PATH`. `cp`, `mv`, and `rm` stayed GNU while everything else went Rust. Follow the symlinks and the split is right there:

```bash
readlink -f $(which ls) $(which sort) $(which cp) $(which rm)
```

```text
/usr/lib/cargo/bin/coreutils/ls
/usr/lib/cargo/bin/coreutils/sort
/usr/bin/gnucp
/usr/bin/gnurm
```

That `9.7` next to a `coreutils` package that reports `9.5-1ubuntu2+0.0.0~ubuntu25` confused me until I asked dpkg who actually owns each binary, which is the query that makes the layout make sense:

```bash
for b in ls sort cp rm; do printf '%-5s %s\n' "$b" "$(dpkg -S $(readlink -f $(which $b)) | cut -d: -f1)"; done
```

```text
ls    rust-coreutils
sort  rust-coreutils
cp    gnu-coreutils
rm    gnu-coreutils
```

There are more packages in play than the two you expect. `rust-coreutils` ships the uutils binaries, `gnu-coreutils` ships the GNU ones including the `gnu` prefixed copies, and plain `coreutils` is now a metapackage whose version number describes neither set of tools. What actually decides which binaries win on your `PATH` is a separate pair, `coreutils-from-uutils` and `coreutils-from-gnu`, which is the same pair you use at the end of this section to switch back. So `cp --version` and `dpkg -l | grep coreutils` are answering different questions, and only one of them is about the thing you ran.

Every GNU tool is still on the box under a `gnu` prefix. `gnuls`, `gnusort`, `gnucat`, `gnudu`, and so on down to `gnubasename` and a `/usr/bin/gnu[` that made me look twice. That is your escape hatch for a single command that misbehaves, and it is much better than reverting the whole system.

### The difference that will actually bite you

I went looking for the breakage people complain about, expecting to find it in `sort`. I did not. On `0.8.0`, `sort` matches GNU exactly, in both the C locale and `en_US.UTF-8`, and so does numeric sort, and so does `du`. If you read that Rust `sort` is broken, test it before you believe it.

`ls` is a different story. It ignores locale collation:

```bash
cd /tmp && mkdir ct && cd ct && touch apple Banana cherry Apricot

ls          # Apricot Banana apple cherry
gnuls       # apple Apricot Banana cherry
sort <<< $'apple\nBanana\ncherry\nApricot'
            # apple Apricot Banana cherry
```

Under `en_US.UTF-8`, GNU `ls` sorts the way your locale asks, ignoring case. The Rust `ls` sorts by raw byte value, putting every capital letter first, and it does that whatever `LC_ALL` is set to.

Sit with the third line for a second. **On a stock 26.04 box, `ls` and `sort` no longer agree on alphabetical order.** They are different implementations now, and only one of them reads your locale. Anything that diffs `ls` output between two machines, or any test fixture holding a recorded directory listing, is going to disagree with itself the day you upgrade. Use `gnuls`, or `LC_ALL=C` everywhere so at least both agree, or stop parsing `ls`, which was always the real answer.

If you want the old world back wholesale, it is one package:

```bash
sudo apt install coreutils-from-gnu
```

That swaps the defaults back to GNU. `coreutils-from-uutils` puts them the other way again. Nothing is one way permanently, which is the one genuinely reassuring thing about the whole change.

## 6. What actually changed

Measured on the box, before and after, rather than copied from a release note:

| | 24.04.4 | 26.04 |
|---|---|---|
| Kernel | 6.8.0-138 | 7.0.0-30 |
| systemd | 255.4 | 259.5 |
| Python | 3.12.3 | 3.14.4 |
| apt | 2.8.3 | 3.2.0 |
| sudo | 1.9.15p5 | sudo-rs 0.2.13 |
| coreutils | GNU 9.4 | uutils 0.8.0 plus GNU 9.7 |

Two of those deserve a sentence.

**Python 3.12 to 3.14 is a two version jump** and the old interpreter goes with it. I watched the upgrade purge `libpython3.12-minimal`, and I did not think to run `test -e /usr/bin/python3.12` before I destroyed the box, so check that on yours. If 3.12 is gone, every virtualenv built against it is pointing at an interpreter that no longer exists. They do not repair themselves and they do not warn you, they just fail the next time something tries to use them. Rebuild them, and check anything with compiled extensions actually has a 3.14 wheel before you promise someone a maintenance window.

**`apt-key` is gone**, not deprecated. If you have a provisioning script that still calls it, that script now fails on this release. Keys belong in `/etc/apt/keyrings/` referenced by `Signed-By:`, which is what the Docker stanza above is doing.

## Dracut did not happen, and other things the notes oversell

The 26.04 material makes a point of Dracut replacing initramfs-tools as the default initial ramdisk. I went looking for the fallout and there was none, because on an upgraded machine it does not happen:

```bash
dpkg -l | grep dracut
# ii  dracut-install  110-11   amd64  dracut is an event driven initramfs infrastructure (dracut-install)

which dracut
# (nothing)

dpkg -l | grep initramfs-tools
# ii  initramfs-tools  0.151ubuntu1
```

`dracut-install` is a helper pulled in as a dependency. The initramfs generator is still `initramfs-tools`, and your hooks in `/etc/initramfs-tools/` still run. Dracut is the default for *fresh installs* of 26.04. An upgrade keeps what it had, which means one of the scarier sounding items on the changelog is not something you have to plan for this time.

I am flagging it because I built a checklist around it before I tested, and the box disagreed with the checklist.

## Gotchas I hit

**The refusal that names no package.** `You have not rebooted after updating a package which requires a reboot.` Read `/var/run/reboot-required.pkgs` to see what it means, reboot, continue.

**`do-release-upgrade -c` talks about development releases.** On a 24.04 box before the 27th, `-c` reports `There is no development version of an LTS available`, which sounds like a problem with your configuration. It is not. It is `Supported: 0` upstream.

**The non-interactive frontend is built to reboot when it finishes.** With `RELEASE_UPGRADER_NO_REBOOT=1` set, my run stopped at `confirmRestart() called` and waited for me instead. I did not test what it does without the variable, so confirm that half yourself before you lean on it.

**`pgrep -f do-release-upgrade` matches itself.** I wasted twenty minutes believing the upgrade was still running because my own monitoring command contained the string it was grepping for. Check `/var/log/dist-upgrade/main.log` for `confirmRestart() called`, which is the real last line, or match on the process tree instead.

**`unattended-upgrades` is running while you upgrade.** It was alive on my box throughout. It did not cause a lock conflict, but if you hit `Could not get lock /var/lib/dpkg/lock-frontend` mid upgrade, that is the first thing to look at.

**Old kernels stay installed.** `linux-image-6.8.0-138-generic` was still on the disk and still listed by `apt list '?obsolete'` after the reboot, though not by the `noble` grep, since Ubuntu kernel versions carry no codename. `sudo apt autoremove --purge` once you are confident 7.0 boots reliably, and not one second before.

## Quick reference

```bash
# is the door open yet?
curl -s https://changelogs.ubuntu.com/meta-release-lts | grep -A5 '^Dist: resolute'
grep ^Prompt /etc/update-manager/release-upgrades          # want Prompt=lts

# the correct order
sudo apt update && sudo apt full-upgrade && sudo apt autoremove
sudo reboot
ls /var/run/reboot-required                                 # must not exist
sudo do-release-upgrade                                     # add -d before 27 Aug

# unattended
sudo RELEASE_UPGRADER_NO_REBOOT=1 DEBIAN_FRONTEND=noninteractive \
  do-release-upgrade -d -f DistUpgradeViewNonInteractive

# afterwards, in this order
apt list '?obsolete'                                        # the real answer
dpkg -l | grep noble                                        # vendor leftovers only
grep -rn 'Enabled: no\|noble' /etc/apt/sources.list.d/      # what got disabled
ls /etc/apt/sources.list.d/*.disabled                       # and what got renamed

# the userland
ls --version | head -1                                      # uutils
cp --version | head -1                                      # GNU
sudo apt install coreutils-from-gnu                         # put it all back
```

The upgrade was ten minutes. The repository cleanup afterwards is the part that decides whether the box is still healthy in six months, and it is the part with no progress bar.

`[ resolute ✓ ]`
