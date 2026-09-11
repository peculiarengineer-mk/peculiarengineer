---
title: 'Add a disk to Ubuntu 26.04: partition, format, fstab, grow it later, and the fstab mistake that locks you out'
description: 'The whole life of a second disk on Ubuntu 26.04: find it, partition and format it, mount it by UUID so it survives a reboot (mine changed from sdb to sdc on the first one), grow the partition and filesystem online when it fills, do the same under LVM, and what happens when an fstab line points at a disk that is not there. That last one put my box in emergency mode with no SSH, so the recovery is in here too.'
pubDate: 'Sep 11 2026'
heroImage: '../../assets/add-disk-2604-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Linux', 'Storage', 'LVM', 'fstab', 'ext4', 'Server', 'SysAdmin', 'systemd', 'Hetzner']
---

I attached two 10 GB volumes to a fresh Ubuntu 26.04 server and logged in half expecting something to have happened. Nothing had. The kernel had noticed them, called them `/dev/sdb` and `/dev/sdc`, and stopped. Everything after that is my job: partition, filesystem, mount point, the line in `/etc/fstab` that brings it back after a reboot, and later, when it fills up, making it bigger without taking anything offline.

None of those steps is hard, and that is the problem. They are easy enough that nobody writes down the order, and one of them, the fstab line, has a failure mode that takes the box off the network entirely. I did the failure mode on purpose so the recovery would be in this post too. Along the way the disk I had just set up changed its name from `sdb` to `sdc` across a single reboot, which is the best argument I have ever seen for mounting by UUID.

> **TL;DR.** Find the disk with `lsblk` and `ls -l /dev/disk/by-id/`. `sudo sgdisk -n 1:0:0 -t 1:8300 /dev/sdb` for one partition, `sudo mkfs.ext4 -L data /dev/sdb1`, then `blkid` for its UUID. Add `UUID=<uuid>  /mnt/data  ext4  defaults,nofail  0  2` to `/etc/fstab`, then `sudo systemctl daemon-reload && sudo mount -a` and check with `findmnt --verify`. Never put `/dev/sdX` in fstab. To grow it online after enlarging the disk: `sudo growpart /dev/sdb 1`, then `sudo resize2fs /dev/sdb1`. Under LVM: `growpart`, `pvresize`, then `lvextend -l +100%FREE -r`. An fstab line without `nofail` for a disk that is missing puts the box in emergency mode with no SSH after a 90 second timeout. Fix it from a rescue system.

## Contents

- [Find the disk](#find-the-disk)
- [The one thing to get straight: sdb is not a name, it is a guess](#the-one-thing-to-get-straight-sdb-is-not-a-name-it-is-a-guess)
- [Partition it](#partition-it)
- [Format it and get the UUID](#format-it-and-get-the-uuid)
- [Mount it with fstab](#mount-it-with-fstab)
- [It survives a reboot, on a different device name](#it-survives-a-reboot-on-a-different-device-name)
- [Grow it online when it fills](#grow-it-online-when-it-fills)
- [The same thing under LVM](#the-same-thing-under-lvm)
- [The fstab mistake that locks you out](#the-fstab-mistake-that-locks-you-out)
- [Getting back in](#getting-back-in)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## Find the disk

`lsblk` is the first thing to run, before and after attaching, so you know which one is new:

```bash
$ lsblk
NAME    MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS
sda       8:0    0 38.1G  0 disk
├─sda1    8:1    0 37.9G  0 part /
├─sda14   8:14   0    1M  0 part
└─sda15   8:15   0  256M  0 part /boot/efi
sdb       8:16   0   10G  0 disk
sdc       8:32   0   10G  0 disk
```

Two new 10 GB disks, no partitions, no mount points. If you attached one and it is not there, the kernel log says whether it ever arrived:

```bash
$ journalctl -k | grep -iE 'sd[b-z]'
kernel: sd 0:0:0:1: [sdb] 20971520 512-byte logical blocks: (10.7 GB/10.0 GiB)
kernel: sd 0:0:0:1: [sdb] Attached SCSI disk
```

The more useful listing is the one with stable names in it:

```bash
$ ls -l /dev/disk/by-id/
scsi-0HC_Volume_106851989 -> ../../sdb
scsi-0HC_Volume_106851990 -> ../../sdc
scsi-0QEMU_QEMU_HARDDISK_127368955 -> ../../sda
```

Those `by-id` names come from the hardware, the volume ID on a cloud provider or the model and serial on a physical drive, and they do not change. On Hetzner the number is the volume ID from the console, which is how I knew which of the two identical 10 GB disks was which. I match the volume ID in the `by-id` name against the provider console before I format anything, and then check that `blkid /dev/sdb` prints nothing, because a blank disk has no filesystem signature. Both together are how I know I have the right disk. Neither on its own is.

On the cloud image I used, everything below was already installed. `gdisk`, `parted`, `lvm2`, `e2fsprogs`, `xfsprogs`, and `cloud-guest-utils` (which is where `growpart` lives) were all there on first login. If yours is a minimal image, `sudo apt install gdisk lvm2 cloud-guest-utils` covers it.

## The one thing to get straight: sdb is not a name, it is a guess

`/dev/sdb` means "the second SCSI disk the kernel found this boot." It is an enumeration order, not an identity. Add a disk, remove one, change a controller, or on a cloud box simply reboot, and the letters can shuffle. I will show you that happening later in this post, on a box where nothing changed but the uptime.

So the rule is: use `/dev/sdb` interactively, right now, to partition and format the thing you can see in `lsblk`. Use the filesystem UUID, or the `/dev/disk/by-id/` path, for anything that has to find the disk again later, which means fstab and every script. Ubuntu's own installer follows the rule, look at the `/dev/disk/by-uuid/` entries it wrote for `/` and `/boot/efi` in the stock fstab.

## Partition it

You can put a filesystem straight onto `/dev/sdb` with no partition table, and it works. I do not, and I would talk you out of it. A partition table costs one megabyte and it means every tool and every future admin, including you, sees a disk that is obviously in use rather than one that `lsblk` shows as empty. One GPT partition covering the whole disk:

```bash
$ sudo sgdisk -n 1:0:0 -t 1:8300 -c 1:data /dev/sdb
Creating new GPT entries in memory.
The operation has completed successfully.
$ sudo partprobe /dev/sdb
```

`-n 1:0:0` is partition 1, from the first aligned sector (2048, `sgdisk` aligns for you) to the last. `-t 1:8300` is the Linux filesystem type code, `-c` is a label for the partition table entry. `partprobe` tells the kernel to reread the table, and `lsblk` now shows `sdb1` at 10G. If you prefer `parted`, `parted -s /dev/sdb mklabel gpt mkpart data ext4 0% 100%` does the same job with slightly different end geometry. Use whichever you already know. `fdisk` still works too, but it still defaults to an MBR label on a blank disk, so press `g` for GPT first if you go that way.

## Format it and get the UUID

```bash
$ sudo mkfs.ext4 -L data /dev/sdb1
Creating filesystem with 2621179 4k blocks and 655360 inodes
Filesystem UUID: e785e82e-2435-4e3c-abd1-b33097a3c96a
...
Writing superblocks and filesystem accounting information: done
```

ext4 is the default for a reason and it is what I use unless I have a specific need. XFS is the other sane choice on Ubuntu, it grows online just as well, but shrinking it is at best experimental (the `xfsprogs` in 26.04 will do it behind an `EXPERIMENTAL` warning), where ext4 shrinks offline with plain `resize2fs`. Pick it knowing that. The `-L data` label is optional and I always set one because `lsblk -f` then tells you what the disk is for without a spreadsheet.

Now the UUID, which is the only thing about this disk you actually need to remember:

```bash
$ sudo blkid /dev/sdb1
/dev/sdb1: LABEL="data" UUID="e785e82e-2435-4e3c-abd1-b33097a3c96a" BLOCK_SIZE="4096" TYPE="ext4" PARTUUID="2f60a9c1-..."
```

Note there are two UUIDs in that line. `UUID` belongs to the filesystem and is what a `UUID=` line in fstab wants. `PARTUUID` belongs to the partition table entry and survives a reformat. fstab can mount by it too, with `PARTUUID=`, but pasting it after `UUID=` is a classic way to get a mount that never finds its device. Copy `UUID`.

## Mount it with fstab

Create the mount point and add one line to `/etc/fstab`:

```bash
sudo mkdir -p /mnt/data
echo 'UUID=e785e82e-2435-4e3c-abd1-b33097a3c96a  /mnt/data  ext4  defaults,nofail  0  2' | sudo tee -a /etc/fstab
```

Six fields. The UUID, where to mount it, the filesystem type, the options, a `0` for the ancient `dump` utility nobody runs, and a `2` meaning "check this filesystem at boot, after the root filesystem." The option that matters is `nofail`, and the whole second half of this post is about what happens without it. With `nofail`, a missing disk is logged and boot continues. Without it, a missing disk stops the boot. For a data disk, the disk is never more important than the box staying reachable, so `nofail` goes on every line that is not `/`. The one cost, straight from `systemd.mount(5)`, is that a `nofail` mount is no longer ordered before `local-fs.target`, so a service that needs the disk should say so itself with `RequiresMountsFor=/mnt/data` in its unit rather than assuming it is there.

Mount it without rebooting:

```bash
$ sudo systemctl daemon-reload
$ sudo mount -a
$ findmnt /mnt/data
TARGET    SOURCE    FSTYPE OPTIONS
/mnt/data /dev/sdb1 ext4   rw,relatime
```

The `daemon-reload` is there because on a systemd box, fstab is not really read by `mount` at boot. A generator turns every fstab line into a `.mount` unit, and it is those units that run. You can see the one it wrote for you:

```bash
$ systemctl cat mnt-data.mount
# /run/systemd/generator/mnt-data.mount
# Automatically generated by systemd-fstab-generator

[Unit]
SourcePath=/etc/fstab
Requires=systemd-fsck@dev-disk-by\x2duuid-e785e82e\x2d2435\x2d4e3c\x2dabd1\x2db33097a3c96a.service
After=systemd-fsck@dev-disk-by\x2duuid-e785e82e\x2d2435\x2d4e3c\x2dabd1\x2db33097a3c96a.service
...

[Mount]
What=/dev/disk/by-uuid/e785e82e-2435-4e3c-abd1-b33097a3c96a
Where=/mnt/data
Type=ext4
Options=defaults,nofail
```

If you skip the `daemon-reload`, `mount -a` still works, but `systemctl status mnt-data.mount` reports the unit as `loaded (/proc/self/mountinfo)`, meaning systemd noticed a mount and made up a unit for it. After the reload it says `loaded (/etc/fstab; generated)`, which is the state you want, because that is the unit that will run at boot. I reload so that the unit I am looking at is the one generated from fstab, not one systemd improvised from a mount it happened to notice.

The last check, and the one I would tattoo on the inside of everyone's eyelids before a reboot:

```bash
$ sudo findmnt --verify
Success, no errors or warnings detected
```

That parses fstab and checks every source exists. It is the command that would have warned me about the mistake later in this post, and it did, and I rebooted anyway to see what happened. You should not.

## It survives a reboot, on a different device name

I rebooted and checked:

```bash
$ findmnt /mnt/data
TARGET    SOURCE    FSTYPE OPTIONS
/mnt/data /dev/sdc1 ext4   rw,relatime
```

Mounted, with the file I had written still there, and look at the source. Before the reboot this disk was `/dev/sdb1`. After it, `/dev/sdc1`. The other volume took `sdb`. Nothing changed but the uptime, the two disks simply came up in the other order. Had the fstab line said `/dev/sdb1`, the box would have gone looking for a partition that, on the disk now called `sdb`, did not exist yet, and depending on `nofail` either logged an error or dropped into emergency mode. On a box where both disks were formatted it would have mounted the wrong one, which is worse. The UUID line did not care. It happened on the first reboot of the first box I tried this on.

## Grow it online when it fills

Disks fill. On a cloud provider you resize the volume in their console and the guest sees a bigger disk, but nothing inside it changes on its own. I resized the data volume from 10 GB to 20 GB while it was mounted and in use:

```bash
$ lsblk /dev/sdc
NAME   MAJ:MIN RM SIZE RO TYPE MOUNTPOINTS
sdc      8:32   0  20G  0 disk
└─sdc1   8:33   0  10G  0 part /mnt/data
$ df -h /mnt/data
Filesystem      Size  Used Avail Use% Mounted on
/dev/sdc1       9.8G  2.1M  9.3G   1% /mnt/data
```

The kernel already knew the disk was 20G. The partition was still 10G, and the filesystem inside it was still 10G. Two layers to grow, in order, and both can be done with the filesystem mounted:

```bash
$ sudo growpart /dev/sdc 1
CHANGED: partition=1 start=2048 old: size=20969439 end=20971486 new: size=41940959 end=41943006
$ df -h /mnt/data
/dev/sdc1       9.8G  2.1M  9.3G   1% /mnt/data
$ sudo resize2fs /dev/sdc1
Filesystem at /dev/sdc1 is mounted on /mnt/data; on-line resizing required
old_desc_blocks = 2, new_desc_blocks = 3
The filesystem on /dev/sdc1 is now 5242619 (4k) blocks long.
$ df -h /mnt/data
/dev/sdc1        20G  2.1M   19G   1% /mnt/data
```

`growpart` takes the disk and the partition number as two arguments, not `/dev/sdc1`. It moves the end of the partition to the end of the disk, and if the partition happens to be an LVM physical volume it resizes that too, which matters in the next section. Then `df` is unchanged, which surprises people, because the filesystem does not know its container grew until you tell it. `resize2fs` with no size argument grows ext4 to fill the partition, online. For XFS the equivalent is `xfs_growfs /mnt/data`, which takes the mount point (the device path of a mounted XFS works as well). Run `growpart` a second time and it says `NOCHANGE`, which is a handy way to confirm there is nothing left to claim. Note it exits 1 when it says that, so do not chain it with `&&` in a script.

On this box the kernel saw the new size immediately. If yours does not, `echo 1 | sudo tee /sys/class/block/sdc/device/rescan` asks the SCSI layer to look again. I ran it here too and it changed nothing, because there was nothing to change.

## The same thing under LVM

If you installed Ubuntu Server from the ISO and took the defaults, your root filesystem is not on a partition, it is on a logical volume called `ubuntu-lv` in a volume group called `ubuntu-vg`, and there is a good chance that volume group has free space in it, because the installer caps the root volume on purpose. Its documented sizing policy gives root half the disk between 20 and 200 GB, and 100 GB on anything bigger. The same commands that grow a data disk grow that root, with one extra layer in the middle. I built the same shape on the second volume to walk through it, since a cloud image does not use LVM.

The partition type is `8e00` for LVM, then three create commands, one per layer:

```bash
sudo sgdisk -n 1:0:0 -t 1:8e00 -c 1:lvm /dev/sdb && sudo partprobe /dev/sdb
sudo pvcreate /dev/sdb1                 # physical volume: the disk is now LVM's
sudo vgcreate data-vg /dev/sdb1          # volume group: a pool made of PVs
sudo lvcreate -L 5G -n data-lv data-vg   # logical volume: the thing you format
sudo mkfs.ext4 -q /dev/data-vg/data-lv
sudo mkdir -p /srv/data && sudo mount /dev/data-vg/data-lv /srv/data
```

I deliberately made the logical volume 5 GB on a 10 GB disk, the same shape as an installer that left half the group free:

```bash
$ sudo vgs
  VG      #PV #LV #SN Attr   VSize   VFree
  data-vg   1   1   0 wz--n- <10.00g <5.00g
$ df -h /srv/data
/dev/mapper/data--vg-data--lv  4.9G  1.3M  4.6G   1% /srv/data
```

`VFree <5.00g` is the tell. Half the disk is in the pool and nobody is using it. One command hands it to the logical volume and grows the filesystem in the same step, online:

```bash
$ sudo lvextend -l +100%FREE -r /dev/data-vg/data-lv
  File system ext4 found on data-vg/data-lv mounted at /srv/data.
  Size of logical volume data-vg/data-lv changed from 5.00 GiB (1280 extents) to <10.00 GiB (2559 extents).
  Extending file system ext4 to <10.00 GiB (10733223936 bytes) on data-vg/data-lv...
  ...
  Logical volume data-vg/data-lv successfully resized.
$ df -h /srv/data
/dev/mapper/data--vg-data--lv  9.8G  1.3M  9.3G   1% /srv/data
```

`-l +100%FREE` means all the free extents in the group, and `-r` runs `resize2fs` for you. That is the entire fix for the installer's half used disk, and for an Ubuntu Server install the command is `sudo lvextend -l +100%FREE -r /dev/ubuntu-vg/ubuntu-lv`. I did not run that exact line on an installer built box for this post, I built the layout to match it, but the commands do not know the difference.

Then I grew the underlying volume from 10 GB to 20 GB, which is the other case: the disk got bigger and LVM has to be told. Three layers now, partition, physical volume, logical volume:

```bash
$ sudo growpart /dev/sdb 1
CHANGED: partition=1 start=2048 old: size=20969439 end=20971486 new: size=41940959 end=41943006
$ sudo pvresize /dev/sdb1
  Physical volume "/dev/sdb1" changed
  1 physical volume(s) resized or updated / 0 physical volume(s) not resized
$ sudo lvextend -l +100%FREE -r /dev/data-vg/data-lv
  Size of logical volume data-vg/data-lv changed from <10.00 GiB (2559 extents) to <20.00 GiB (5119 extents).
  ...
$ df -h /srv/data
/dev/mapper/data--vg-data--lv   20G  1.3M   19G   1% /srv/data
```

`pvresize` is the step people forget, because `growpart` grew the partition and it feels like LVM should notice. Something did not add up though: on this box `pvs` already reported the physical volume at `<20.00g` after `growpart` and before I ran `pvresize`. The reason is in `/usr/bin/growpart` itself. The version in 26.04 ends with a `maybe_lvm_resize` function that asks `lvm pvs` whether the partition it just grew is a physical volume and, if it is, runs `lvm pvresize` on it for you. So the manual `pvresize` was a no-op here. Run it anyway. It is idempotent, it costs nothing, and on an older `growpart` or a partition you grew with `parted` it is the step that makes the space appear.

For fstab, a logical volume has a path that does not shuffle, `/dev/data-vg/data-lv`, so either that or the filesystem UUID from `blkid` is fine. I used the path, with `nofail`.

## The fstab mistake that locks you out

I added an fstab line for a disk that does not exist, first with `nofail`, then without, and rebooted each time.

```text
UUID=00000000-dead-beef-0000-000000000000  /mnt/bogus  ext4  defaults,nofail  0  2
```

`findmnt --verify` caught it immediately:

```text
/mnt/bogus
   [E] unreachable on boot required source: UUID=00000000-dead-beef-0000-000000000000
0 parse errors, 1 error, 0 warnings
```

With `nofail`, the reboot was uneventful. The box came back, SSH answered, both real disks were mounted, and `systemctl --failed` was empty. The only trace was a job in `systemctl list-jobs` waiting for a device that will never show up, which sits there for the same 90 seconds you are about to see and then times out quietly. `nofail` did exactly what it says.

Then I took `nofail` off that line and rebooted again. The box pinged. SSH said `Connection refused`, and kept saying it. Here is the journal from that boot, read later from a rescue system:

```text
systemd[1]: Expecting device dev-disk-by\x2duuid-00000000\x2ddead\x2dbeef...device
systemd[1]: dev-disk-by\x2duuid-00000000...device: Job dev-disk-by\x2duuid-00000000...device/start timed out.
systemd[1]: Timed out waiting for device dev-disk-by\x2duuid-00000000...device
systemd[1]: Dependency failed for systemd-fsck@dev-disk-by\x2duuid-00000000...service
systemd[1]: Dependency failed for mnt-bogus.mount - /mnt/bogus.
systemd[1]: Dependency failed for local-fs.target - Local File Systems.
systemd[1]: local-fs.target: Job local-fs.target/start failed with result 'dependency'.
systemd[1]: Started emergency.service - Emergency Shell.
systemd[1]: Reached target emergency.target - Emergency Mode.
```

The timestamps on the first and second lines are 90 seconds apart. That is the default device timeout. systemd waited a minute and a half for a disk that did not exist, gave up, and because the mount was required rather than optional, `local-fs.target` failed. Boot switched to `emergency.target`, and the normal multi-user boot, `sshd` included, never happened. Networking and cloud-init did come up, which is why the box answered pings. It was up, on the network, and completely unreachable, sitting at an emergency shell on a console I did not have.

That is the whole difference `nofail` makes. Same missing disk, same 90 second wait in the log. One boot finishes, the other one stops at a prompt asking for a root password.

## Getting back in

You need something that can mount the root filesystem from outside. On a physical box that is a live USB. On a VM, an ISO. On Hetzner, and most cloud providers have an equivalent, it is a rescue system: enable rescue mode on the server, reset it, and it boots a small Debian from the network with your SSH key already in place. From there:

```bash
# in the rescue system
mount /dev/sda1 /mnt
grep -v '^#' /mnt/etc/fstab
sed -i '\#/mnt/bogus#d' /mnt/etc/fstab      # delete the offending line, or add nofail to it
umount /mnt
# disable rescue mode, reboot
```

Two things worth knowing about that. First, I had no console on this box, so I cannot tell you what the emergency shell would have offered. On a machine with a screen it may drop you straight into a maintenance shell, and if it does, `mount -o remount,rw /` and fix fstab there. On a headless cloud box the rescue system is the route. Second, the journal from the failed boot is on the disk, and you can read it from the rescue system before you unmount anything, which is how I got the log above:

```bash
journalctl -D /mnt/var/log/journal --list-boots
journalctl -D /mnt/var/log/journal -b <boot-id> | grep -iE 'timed out|Dependency failed|emergency'
```

After the fix the box booted normally, both real disks mounted, `systemctl list-jobs` said `No jobs running`, and `journalctl -b -1 -p err` still had the single `Timed out waiting for device` line from the bad boot as a souvenir.

## Gotchas worth knowing

- **Device names shuffle.** My data disk went from `sdb` to `sdc` across one reboot with no hardware change. UUID or `/dev/disk/by-id/` in fstab, always.
- **`nofail` on every line that is not `/`.** Without it, a missing data disk stops the boot at an emergency shell you probably cannot reach. Services that need the disk get `RequiresMountsFor=` in their unit.
- `findmnt --verify` before every reboot after touching fstab. It caught my bad line. It takes one second.
- **`daemon-reload` after editing fstab.** Otherwise the unit systemd shows you is either a guess from `/proc/self/mountinfo` or the stale one from before your edit, not the one that runs at boot.
- **Two UUIDs in `blkid` output.** `UUID` is the filesystem and goes after `UUID=`. `PARTUUID` is the partition entry and only works after `PARTUUID=`.
- `growpart` takes the disk and a number. `growpart /dev/sdc 1`, not `growpart /dev/sdc1`.
- **`df` does not change after `growpart`.** The filesystem needs its own resize. `resize2fs` for ext4, `xfs_growfs <mountpoint>` for XFS.
- **Under LVM, `pvresize` is the step between `growpart` and `lvextend`.** The `growpart` in 26.04 runs it for you when the partition is a physical volume, but an older one or a `parted` resize does not, and running it twice is harmless.
- **`lvextend -r` runs the filesystem resize for you.** Without `-r` you get a bigger logical volume with the same size filesystem inside it and a confusing `df`.
- XFS shrinking is experimental at best. ext4 shrinks offline with `resize2fs`. If you might ever want to go smaller, that decides it.
- On the Hetzner cloud image, `gdisk`, `parted`, `lvm2`, `growpart`, `e2fsprogs`, and `xfsprogs` were all preinstalled. A minimal image may need `gdisk lvm2 cloud-guest-utils`.

## Quick reference

```bash
# find it
lsblk
ls -l /dev/disk/by-id/
sudo blkid /dev/sdb            # prints nothing on a blank disk

# partition and format
sudo sgdisk -n 1:0:0 -t 1:8300 -c 1:data /dev/sdb && sudo partprobe /dev/sdb
sudo mkfs.ext4 -L data /dev/sdb1
sudo blkid /dev/sdb1           # copy UUID=, not PARTUUID=

# mount by UUID, survive reboots
sudo mkdir -p /mnt/data
echo 'UUID=<uuid>  /mnt/data  ext4  defaults,nofail  0  2' | sudo tee -a /etc/fstab
sudo systemctl daemon-reload && sudo mount -a
sudo findmnt --verify          # before you reboot, every time

# grow a plain partition online after enlarging the disk
sudo growpart /dev/sdb 1
sudo resize2fs /dev/sdb1       # ext4
sudo xfs_growfs /mnt/data      # xfs, takes the mount point

# LVM from scratch
sudo sgdisk -n 1:0:0 -t 1:8e00 /dev/sdb && sudo partprobe /dev/sdb
sudo pvcreate /dev/sdb1 && sudo vgcreate data-vg /dev/sdb1
sudo lvcreate -L 5G -n data-lv data-vg && sudo mkfs.ext4 /dev/data-vg/data-lv

# LVM: use the free space the installer left
sudo lvextend -l +100%FREE -r /dev/ubuntu-vg/ubuntu-lv

# LVM: the disk under it got bigger
sudo growpart /dev/sda 3       # whichever partition holds the PV
sudo pvresize /dev/sda3
sudo lvextend -l +100%FREE -r /dev/ubuntu-vg/ubuntu-lv

# what is what
sudo pvs; sudo vgs; sudo lvs
lsblk -f
systemctl cat mnt-data.mount

# locked out by fstab: from a rescue system
mount /dev/sda1 /mnt
journalctl -D /mnt/var/log/journal --list-boots   # read the failed boot first
nano /mnt/etc/fstab && umount /mnt
```

Adding a disk is five commands. The reason it deserves a post is that the sixth, the fstab line, is the one place in the whole process where a typo does not fail loudly. It fails at the next reboot, weeks later, after you have forgotten you touched it, and it takes SSH with it.

`[ missing disk, working SSH ]`
