---
title: 'Swap and zram on Ubuntu 26.04: a cloud box ships with none, and zram only helps if you understand it'
description: 'A fresh 26.04 server has zero swap and no systemd-oomd, so the kernel OOM killer is your only backstop. Set up zram the systemd-generator way, then watch it buy a gigabyte of headroom on compressible memory and lose to no swap at all on random data. Measured on a 3.7 GB box.'
pubDate: 'Sep 5 2026'
heroImage: '../../assets/zram-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'zram', 'Swap', 'Memory', 'Linux', 'Performance', 'SysAdmin', 'systemd']
---

The first thing I checked on a fresh Ubuntu 26.04 cloud server, out of habit, was how much swap it had. The answer was none. Not a small swap, not a swapfile waiting to be turned on, zero.

```bash
$ free -h
               total        used        free      shared  buff/cache   available
Mem:           3.7Gi       425Mi       3.3Gi       4.7Mi       236Mi       3.3Gi
Swap:             0B          0B          0B
```

That is normal for a cloud image, and most guides that mention it hand you a two GB swapfile and move on. This post is the version that actually measures what you get, because two things turned out to be true that I would not have guessed. There is no `systemd-oomd` on a server install either, so when memory runs out the kernel OOM killer is the only thing between you and a hung box. And zram, the compressed RAM swap everyone recommends now, bought me a full gigabyte of headroom on one workload and did slightly worse than no swap at all on another. Which one you get depends entirely on whether your memory compresses, and nobody tells you that up front. I built it on a 3.7 GB box and pushed it until things died, on purpose.

> **TL;DR.** A cloud 26.04 box has no swap and no `systemd-oomd`; the kernel OOM killer is the backstop. For zram, install `systemd-zram-generator`, write `/etc/systemd/zram-generator.conf` with `[zram0]`, `zram-size = ram / 2`, `compression-algorithm = zstd`, `swap-priority = 100`, then reboot or `systemctl restart systemd-zram-setup@zram0.service`. Set `vm.swappiness = 180` and `vm.page-cluster = 0` in `/etc/sysctl.d/` because zram is RAM to RAM and cheap to use. zram only helps for compressible memory. For a hard ceiling on one service, `MemoryMax=` in the unit beats all of it. Do not also install `zram-tools`; the two fight over the device.

## Contents

- [What a fresh box gives you, and does not](#what-a-fresh-box-gives-you-and-does-not)
- [What running out of memory looks like with no swap](#what-running-out-of-memory-looks-like-with-no-swap)
- [Set up zram the systemd way](#set-up-zram-the-systemd-way)
- [Does it help? It depends on your memory](#does-it-help-it-depends-on-your-memory)
- [Tuning: swappiness and page-cluster](#tuning-swappiness-and-page-cluster)
- [zram, a swapfile, or both](#zram-a-swapfile-or-both)
- [Capping one service instead](#capping-one-service-instead)
- [It survives a reboot](#it-survives-a-reboot)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## What a fresh box gives you, and does not

Beyond the zero swap, two defaults are worth knowing before you decide what to add. `vm.swappiness` is 60, the historical default tuned for slow disk swap. And `systemd-oomd`, the userspace out-of-memory daemon that ships on the Ubuntu desktop, is not installed on a server:

```bash
$ systemctl status systemd-oomd
Unit systemd-oomd.service could not be found.
```

That matters because it means the only thing watching for memory exhaustion is the kernel's own OOM killer, which does not act until the box is already against the wall. There is no early, graceful "this cgroup is under pressure, kill it now" layer. So the memory story on a stock server is: no swap to absorb a spike, and no early warning system, just the kernel picking a process to sacrifice when it finally has no choice. Whether that is fine depends on your workload, but you should know it is the starting point.

## What running out of memory looks like with no swap

Before adding anything, I wanted to see the failure. I ran a program that allocates memory in chunks until the kernel stops it, and watched the journal:

```
python3 invoked oom-killer: gfp_mask=0x140dca, order=0
Out of memory: Killed process 6536 (python3) total-vm:3623588kB, anon-rss:3552380kB
```

It got to about 3.4 GB of a 3.7 GB box before the kernel killed it. Two things to take from that. The kernel picked the hog, the biggest anonymous memory user, and left everything else alone, so sshd survived and the box stayed reachable. And the service it was running under was marked failed with the reason recorded, which is the honest way to find an OOM after the fact:

```
hog-noswap.service: Main process exited, code=killed, status=9/KILL
hog-noswap.service: Failed with result 'oom-kill'.
```

`status=9/KILL` and `Failed with result 'oom-kill'` in `systemctl status` or the journal is the fingerprint. If a service keeps mysteriously restarting, that line tells you it is memory and not a crash. With no swap, this is your whole safety mechanism: the kernel kills the hungriest thing once there is nothing left. Swap does not prevent this, it moves the wall further out, which is the next section.

## Set up zram the systemd way

zram is a compressed block device in RAM. Used as swap, it means "cold" memory pages get compressed and kept in RAM instead of written to a disk that a cloud box may not even have. It is faster than disk swap by a wide margin because it never leaves memory, at the cost of some CPU to compress and the fact that the compressed data still lives in RAM.

There are three packages that all claim to set this up, and picking the right one saves confusion. `zram-config` is old. `zram-tools` is the Debian one with an `/etc/default/zramswap` file, and it works, but it is the sysvinit-flavored approach. The modern, systemd-native one is `systemd-zram-generator`, and it is what I would use on 26.04:

```bash
sudo apt install systemd-zram-generator
```

It installs a generator that turns a small config file into the right systemd units. There is no config by default, so you write one:

```ini
# /etc/systemd/zram-generator.conf
[zram0]
zram-size = ram / 2
compression-algorithm = zstd
swap-priority = 100
```

`ram / 2` is a sane size, half of RAM, since compression means the effective capacity is larger than that. `zstd` is the algorithm I would pick: the device offers `lzo-rle`, `lzo`, `lz4`, `lz4hc`, `zstd`, `deflate`, and `842`, and `zstd` gives the best ratio for a small CPU cost. Then activate it:

```bash
sudo systemctl daemon-reload
sudo systemctl restart systemd-zram-setup@zram0.service
```

And it is live:

```bash
$ swapon --show
NAME       TYPE      SIZE USED PRIO
/dev/zram0 partition 1.9G   0B  100

$ zramctl
NAME       ALGORITHM DISKSIZE DATA COMPR TOTAL MOUNTPOINT
/dev/zram0 zstd          1.9G   4K   64B   20K  [SWAP]
```

The generator wrote the units for you. `systemctl cat dev-zram0.swap` shows the generated swap unit with your priority and `Options=discard`. One snag if you tinker: once a `zram0` device exists, starting the setup service again can fail because the device is busy. If activation errors after you have been experimenting, a reboot always resolves it, and on a clean boot none of this comes up. It just works from the config.

## Does it help? It depends on your memory

This is the part that changed how I think about zram, and the part no quick guide mentions. I ran the same memory hog against the same 1.9 GB zram swap three times, changing only what the memory contained.

| Memory contents | Reached before OOM | vs no swap (3.4 GB) |
| --- | --- | --- |
| Compressible text | 4.4 GB | +1 GB |
| Random bytes | 3.3 GB | slightly worse |
| Mostly zeros | 5.1 GB | +1.7 GB |

Compressible data is the happy path. Real program memory, heaps, text, JSON, code, compresses roughly two or three to one, and the run got a full extra gigabyte of headroom before the kernel stepped in. The zram device held about 1.5 GB of pages compressed down to under 700 MB.

The random row is the one to sit with. Incompressible memory, and that includes anything encrypted, already compressed, or media buffers, does not shrink. The 1.9 GB of "swap" held about 1.9 GB of actual data, so it bought almost nothing, and the run reached 3.3 GB against 3.4 GB with no swap at all, a hair worse. That direction makes sense: those pages sit in zram at close to their original size, and zram lives in RAM, so you have turned usable memory into swap that holds no more than it took. zram is not free capacity. It is a bet that your cold pages compress, and when they do not, you have spent RAM to gain nothing.

The zeros row is just the extreme end of the same axis, memory that compresses about twenty to one, and it is why synthetic "look how much zram helps" demos look magical and your real workload does not match them. The honest rule: zram helps in proportion to how compressible your idle memory is, which for most application servers is good, and for anything doing encryption or media is not.

## Tuning: swappiness and page-cluster

The default `vm.swappiness` of 60 was chosen for spinning disks, where swapping is painfully slow and you want to avoid it. zram inverts that logic. Swapping to zram is RAM to RAM, cheap and fast, so you want the kernel to lean on it eagerly. The modern zram convention, and the default some other distributions now ship, is to turn swappiness up rather than down:

```ini
# /etc/sysctl.d/99-zram.conf
vm.swappiness = 180
vm.page-cluster = 0
```

`swappiness = 180` looks wrong to anyone who learned "lower swappiness is better", and it is correct here precisely because the old advice assumed a slow disk. The kernel allows values above 100 specifically for this case, to bias reclaim toward cheap swap. `page-cluster = 0` disables swap readahead, which pays off on rotating disks by reading neighboring pages at once but is pure waste for zram, where every page is equally fast to reach. I set both, and they are the standard pairing for zram rather than numbers I would tell you to trust from a single benchmark. Apply them with `sudo sysctl --system`.

## zram, a swapfile, or both

zram and an old fashioned swapfile are not either-or, and the priority field is how you tier them. Give zram the high priority so it fills first, and add a disk swapfile at low priority to catch the overflow:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile          # comes in at priority -1
```

With both in play, cold pages go to fast zram first, and only when that fills does the kernel spill to the slow swapfile. In my runs the tiered setup, zram at priority 100 plus a 2 GB swapfile at -1, pushed the OOM point out to 6.3 GB, the most headroom of anything I tried, because you get compression and disk capacity stacked. A swapfile alone reached 5.3 GB, more raw room than zram but slow to use. zram alone on compressible data was 4.4 GB, fast but capped by RAM. The tiered arrangement is the best of both and is what I would run on a box that has disk to spare and a workload that occasionally spikes. Add the swapfile to `/etc/fstab` to make it persist.

## Capping one service instead

Sometimes the right answer is not more swap but a hard ceiling on the one process that misbehaves, so it dies alone without dragging the box to the OOM killer. systemd does this per unit, and it is cleaner than any swap tuning:

```bash
sudo systemd-run -p MemoryMax=512M -p MemorySwapMax=0 /usr/bin/myjob
```

When the job crosses its cap it hits a cgroup-local OOM, killed inside its own limit without touching anything else:

```
Memory cgroup out of memory: Killed process 9930 (python3)
hog-capped2.service: Failed with result 'oom-kill'.
```

The kill said `CONSTRAINT_MEMCG`, the cgroup constraint, not a global one, so the rest of the box never noticed. For a known memory hog, a batch job, a scraper, anything you would rather have die than let it take the machine, put `MemoryMax=` in its unit file. It is the surgical option, and it works whether or not you have swap.

## It survives a reboot

The whole point is that this comes back on its own. After writing the generator config and the sysctl file, I rebooted the box and checked:

```bash
$ swapon --show
NAME       TYPE      SIZE USED PRIO
/dev/zram0 partition 1.9G   0B  100
$ sysctl vm.swappiness vm.page-cluster
vm.swappiness = 180
vm.page-cluster = 0
```

zram came up as swap at the priority I set, and the sysctl tunings applied, all from the two config files with nothing in `rc.local` or a cron `@reboot`. That is the advantage of the systemd-generator approach over a hand-rolled script: the units regenerate on every boot from the config, so there is nothing to babysit.

## Gotchas worth knowing

- **A cloud image has no swap.** Not a disabled swap, none. If you assumed there was a little to fall back on, there is not.
- **No `systemd-oomd` on a server.** The kernel OOM killer is the only backstop unless you install and configure oomd yourself. It works, but it does not act early.
- **zram only helps if your memory compresses.** Application heaps, yes. Encrypted or media data, no, and it can make things marginally worse. Know which you are.
- **Do not run `zram-tools` and `systemd-zram-generator` together.** Both try to own the zram device, and the second one to start fails. Pick one.
- **High swappiness is correct for zram.** 180 is not a typo. The advice to keep swappiness low was for slow disks.
- **`MemoryMax=` beats swap for a known hog.** Cap the one process in its unit and it dies alone.
- **`Failed with result 'oom-kill'` is the fingerprint.** A service that keeps restarting with `status=9/KILL` ran out of memory, it did not crash.

## Quick reference

| Job | Command |
| --- | --- |
| Check swap | `swapon --show` |
| See zram detail | `zramctl` |
| Install the generator | `sudo apt install systemd-zram-generator` |
| Activate after config | `sudo systemctl restart systemd-zram-setup@zram0.service` |
| Apply sysctl tuning | `sudo sysctl --system` |
| Add a disk swapfile | `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| Cap one service's memory | `MemoryMax=512M` in the unit, or `systemd-run -p MemoryMax=512M` |
| Find an OOM after the fact | `journalctl -k \| grep -i oom` |

Config files, for copy and paste:

```ini
# /etc/systemd/zram-generator.conf
[zram0]
zram-size = ram / 2
compression-algorithm = zstd
swap-priority = 100
```

```ini
# /etc/sysctl.d/99-zram.conf
vm.swappiness = 180
vm.page-cluster = 0
```

Swap on a modern box is not the "you need twice your RAM on disk" ritual it used to be. On a cloud server it is a choice you make on purpose, and zram is a good default as long as you know it is trading CPU and a little RAM for room that only materializes if your memory compresses. When it does, it is a free gigabyte. When it does not, a `MemoryMax=` on the one greedy service does more than any amount of swap. Measure your own memory before you trust anyone's headroom number, mine included.

`[ compressible pages only ]`
