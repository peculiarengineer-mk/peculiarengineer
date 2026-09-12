---
title: 'Set a static IP on Debian 13 (Trixie): ifupdown, systemd-networkd, and the cloud-init trap'
description: 'Debian 13 does not set up networking with netplan the way Ubuntu does. Give a box a fixed address the Debian way with /etc/network/interfaces.d, or with systemd-networkd which is already installed, plus the cloud-init trap that rewrites your file every boot, why DNS on a networkd box needs systemd-resolved, and the fact that dhcpcd is the DHCP client on the cloud image. Tested on a fresh Trixie box.'
pubDate: 'Sep 12 2026'
heroImage: '../../assets/static-ip-debian-13-hero.png'
tags: ['Debian', 'Debian13', 'Linux', 'Networking', 'StaticIP', 'SystemdNetworkd', 'Ifupdown', 'Homelab', 'SysAdmin']
---

A box you SSH into needs to stay where you left it. DHCP hands it one address today and a different one next week, and then your SSH config points at nothing. On Ubuntu the answer is netplan. Debian 13 does not use netplan by default (the `netplan.io` package exists in the archive, but nothing installs or relies on it), and if you came here from Ubuntu that is the first surprise. This is the Debian version of my [Ubuntu 26.04 netplan post](/blog/set-static-ip-ubuntu-26-04-netplan/), and the whole reason it needs to exist is that Debian does networking with different tools.

There are two ways to do it, and Debian ships both. This post does each one, says which I would pick and when, and covers the three things that actually bite: the cloud-init trap on a VPS image, where DNS really comes from, and which DHCP client is running. I tested all of it on a fresh Trixie server.

> **TL;DR.** Debian does not use netplan. The classic way is `ifupdown`: put a stanza in `/etc/network/interfaces.d/eth0` with `iface eth0 inet static`, `address`, `gateway`, `dns-nameservers`, then apply it from the console with `sudo ifdown eth0 && sudo ifup eth0`. The modern way is `systemd-networkd`, already installed but not enabled: write `/etc/systemd/network/10-eth0.network`, and install `systemd-resolved` too if you want `DNS=` to actually populate `/etc/resolv.conf`. Pick one manager, not both. On a cloud image, cloud-init writes the network config and overwrites yours every boot until you drop `network: {config: disabled}` into `/etc/cloud/cloud.cfg.d/99-disable-network-config.cfg` and remove its generated file.

## Contents

- [First, which interface and which tools](#first-which-interface-and-which-tools)
- [The cloud-init trap](#the-cloud-init-trap)
- [Option A: ifupdown, the Debian default](#option-a-ifupdown-the-debian-default)
- [Option B: systemd-networkd](#option-b-systemd-networkd)
- [Where DNS actually comes from](#where-dns-actually-comes-from)
- [Which one should you use](#which-one-should-you-use)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## First, which interface and which tools

Find the interface name before you touch anything:

```bash
$ ip -br addr
lo               UNKNOWN        127.0.0.1/8 ::1/128
eth0             UP             192.0.2.50/24 ...
```

On real hardware and most VMs this is `enp1s0` or similar, thanks to predictable interface names. On the cloud image I tested it was `eth0`, because the provider pins it. Use whatever `ip -br addr` shows you, and know that the name is stable, unlike the disk letters in the [add-a-disk post](/blog/add-disk-fstab-lvm-ubuntu-26-04/).

Two facts about the fresh Trixie cloud image I tested that matter before you start. The DHCP client is `dhcpcd`. The older `isc-dhcp-client` is deprecated and was not installed, though it is still in the archive if some tool pulls it in. And `systemd-networkd` is installed but disabled, while `ifupdown` is installed and running the show through `networking.service`. So both toolchains are present, which is exactly why you have to pick one and not let them fight.

## The cloud-init trap

This one wastes an afternoon if you skip it. On any cloud image, the file you are about to edit was written by cloud-init:

```bash
$ cat /etc/network/interfaces.d/50-cloud-init
# This file is generated from information provided by the datasource. Changes
# to it will not persist across an instance reboot. To disable cloud-init's
# network configuration capabilities, write a file
# /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg with the following:
# network: {config: disabled}
```

cloud-init means it. Edit `50-cloud-init` directly and your change is gone on the next boot, replaced with DHCP. The file even tells you the fix, so take it:

```bash
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
```

That disable file stops cloud-init regenerating the config, but it does not delete the `50-cloud-init` file already sitting there, and that file still has an `eth0 inet dhcp` stanza in it. So after disabling cloud-init, remove it, or your static config and cloud-init's DHCP will both try to run:

```bash
sudo rm /etc/network/interfaces.d/50-cloud-init
```

A Debian box you installed by hand has no cloud-init and none of this applies, so skip straight to whichever option you want.

## Option A: ifupdown, the Debian default

This is the traditional Debian way and the one most guides mean when they say "edit `/etc/network/interfaces`." The main file just sources a directory, so put a file per interface in `/etc/network/interfaces.d/` and leave the main one alone. On a cloud image, make sure you have removed the `50-cloud-init` stanza first (previous section), or you will have two configs for the same interface. Then:

```bash
sudo tee /etc/network/interfaces.d/eth0 <<'EOF'
auto eth0
iface eth0 inet static
    address 192.0.2.50/24
    gateway 192.0.2.1
    dns-nameservers 1.1.1.1 9.9.9.9
EOF
```

`auto eth0` brings it up at boot. `iface eth0 inet static` is the static declaration. The `address` takes CIDR notation, so `/24` is the netmask. `dns-nameservers` needs the `resolvconf` package to actually do anything, which is installed by default on Trixie, and it feeds those servers into `/etc/resolv.conf` for you. Apply it by cycling the interface:

```bash
sudo ifdown eth0 && sudo ifup eth0
```

Do that from the provider's console, not over SSH, because `ifdown eth0` drops the link and takes every SSH session with it, and a second SSH session runs over the same NIC so it dies too. If the new address is wrong you want a console, not another window. Check it took:

```bash
$ ip -br addr show eth0
eth0             UP             192.0.2.50/24 ...
$ ifquery eth0
address: 192.0.2.50
gateway: 192.0.2.1
dns-nameservers: 1.1.1.1 9.9.9.9
```

`ifquery` is the underused tool here. It prints what ifupdown thinks the config is, parsed, which is how you catch a typo before you cycle the link. One thing ifupdown does not do that netplan does: there is no `netplan try` with a countdown that rolls back a config that locks you out. On Debian your safety net is the provider console, or pairing the change with an `at` job that restores the old file in two minutes unless you cancel it. A second SSH session is not a safety net here, because it goes down with the interface.

## Option B: systemd-networkd

systemd-networkd is already on the box, so this is not an install, just a switch. It reads `.network` files from `/etc/systemd/network/`:

```bash
sudo apt install systemd-resolved
sudo tee /etc/systemd/network/10-eth0.network <<'EOF'
[Match]
Name=eth0

[Network]
Address=192.0.2.50/24
Gateway=192.0.2.1
DNS=1.1.1.1
DNS=9.9.9.9
EOF
sudo systemctl enable --now systemd-networkd
```

`[Match]` picks the interface, `[Network]` sets the address, gateway, and DNS. Enabling `systemd-networkd` is what makes it take over that interface. The `systemd-resolved` install is not optional if you want DNS to work: `DNS=` here feeds `systemd-resolved`, and on a fresh Debian box that is not installed, so without it `DNS=` is silently ignored and `/etc/resolv.conf` ends up with no nameservers. This is the opposite of the ifupdown path, where `resolvconf` is already present and `dns-nameservers` just works. Confirm with its own tool:

```bash
$ networkctl list
IDX LINK   TYPE     OPERATIONAL SETUP
  2 eth0   ether    routable    configured
$ networkctl status eth0
```

`configured` in the SETUP column is the word you want. `unmanaged` means networkd is not handling that link, usually because no `.network` file matched it. If you are moving a live interface from ifupdown to networkd, remove its `/etc/network/interfaces.d/` file and stop `dhcpcd` on it first, or both will try to manage the same NIC. Do that removal before you enable networkd, not after.

## Where DNS actually comes from

This trips up anyone expecting the Ubuntu setup. On a fresh Trixie box `/etc/resolv.conf` is a symlink managed by `resolvconf` (the package), not by `systemd-resolved`:

```bash
$ ls -l /etc/resolv.conf
/etc/resolv.conf -> ../run/resolvconf/resolv.conf
```

`systemd-resolved` is not installed by default on Debian 13. So `dns-nameservers` in an ifupdown stanza works because `resolvconf` picks it up, and `resolvectl` will not even be a command until you install `systemd-resolved` yourself. If you switch to systemd-networkd, the `DNS=` lines in your `.network` file only mean something once `systemd-resolved` is installed and running, which is why Option B installs it. If you stay on ifupdown, leave `resolvconf` alone and DNS just works. The mistake is mixing them: deleting the `resolvconf` symlink and expecting `systemd-resolved` to fill it in when it is not installed leaves you with no DNS at all, which I managed to do to myself once.

## Which one should you use

For a plain server that gets one static address and never changes, ifupdown is less to think about, it is the Debian default, and `dns-nameservers` in the interfaces file is all the DNS config you need. That is what I would use on a homelab box or a VPS.

Reach for systemd-networkd when you want the things it is good at: multiple addresses, bonding, VLANs, or a fleet where you already manage `.network` files with a config tool. It is also the better fit if the rest of your stack is built on systemd and you want `networkctl` and `resolvectl` to be the single source of truth. On the same machine, pick one. Running both against the same interface is how you get a box that comes up with an address you did not choose.

## Gotchas I hit

- No netplan by default. If you came from Ubuntu, that is the whole shock. The package exists in the archive, but nothing on a normal Debian box uses it.
- On a cloud image, cloud-init regenerates the network config at boot until you disable it, and its `50-cloud-init` file lingers with a DHCP stanza until you delete it. This is the one that wastes the afternoon.
- On ifupdown, `dns-nameservers` needs `resolvconf`, which is installed by default. On networkd, `DNS=` needs `systemd-resolved`, which is not. Do not delete the `/etc/resolv.conf` symlink expecting `systemd-resolved` to be there.
- `ifdown eth0` drops your SSH, and a second SSH session dies with it because it uses the same NIC. Cycle the link from the provider console, or pair it with a timed rollback job.
- The DHCP client on the cloud image is `dhcpcd`. `isc-dhcp-client` is deprecated and was not installed. If a guide tells you to edit `/etc/dhcp/dhclient.conf`, check which client you actually have first.
- ifupdown and systemd-networkd will fight over the same interface. Remove one before enabling the other.
- No `netplan try` equivalent. Have console access ready when you change a remote box's network, because SSH cannot save you from a bad change to its own link.

## Quick reference

```bash
# find the interface
ip -br addr

# stop cloud-init overwriting it (cloud images only), then remove its file
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
sudo rm -f /etc/network/interfaces.d/50-cloud-init

# --- Option A: ifupdown ---
sudo tee /etc/network/interfaces.d/eth0 <<'EOF'
auto eth0
iface eth0 inet static
    address 192.0.2.50/24
    gateway 192.0.2.1
    dns-nameservers 1.1.1.1 9.9.9.9
EOF
sudo ifdown eth0 && sudo ifup eth0     # from the console, not your SSH session
ifquery eth0                            # check the parsed config

# --- Option B: systemd-networkd ---
sudo apt install systemd-resolved     # or DNS= is ignored
sudo tee /etc/systemd/network/10-eth0.network <<'EOF'
[Match]
Name=eth0
[Network]
Address=192.0.2.50/24
Gateway=192.0.2.1
DNS=1.1.1.1
EOF
sudo systemctl enable --now systemd-networkd
networkctl status eth0                  # SETUP should say 'configured'
```

Pick ifupdown for a box with one address and be done, or networkd if you want the systemd tooling, and either way disable and delete cloud-init's network config first on a cloud image so the box actually stays where you put it.

`[ one address. one owner. ]`
