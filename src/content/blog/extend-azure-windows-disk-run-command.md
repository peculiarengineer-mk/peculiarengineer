---
title: 'Extending C: on locked-down Azure Windows VMs without RDP'
description: 'Three small PowerShell scripts for Azure Run Command that delete the trailing recovery partition and extend C: into the new space — no RDP, no jumpbox, no Disk Management clicking.'
pubDate: 'Jun 12 2026'
heroImage: '../../assets/azure-disk-extend-hero.png'
---

The Windows VMs I look after sit behind a firewall. Getting an RDP session means
hopping through a jumpbox, and for a task as small as "make C: bigger" that's a
lot of ceremony. So when an OS disk fills up, I don't RDP anywhere. I resize the
disk in Azure, then run three short PowerShell scripts through **Run Command** —
the Azure feature that executes a script inside the VM via the agent, straight
from the portal or the CLI.

The reason it's three scripts and not one `Resize-Partition` is the part that
trips everyone up: on a typical Azure Windows image, the **recovery partition
sits immediately after C:**. When you grow the disk, the new free space lands
*after* that recovery partition, and Windows can only extend a partition into
space that's directly adjacent to it. So `Resize-Partition` fails with
`Not enough available capacity` even though Disk Management clearly shows
unallocated space. The fix is to delete the trailing recovery partition first,
which puts the free space right next to C:.

This post walks through the whole sequence: resize the disk, confirm the layout,
remove the blocker, extend C:. I'll also address the question you should be
asking — *is deleting the recovery partition actually safe?* — head-on, because
the answer is "yes, on an Azure VM" and it's worth understanding why.

## Contents

- [Step 0: Resize the disk in Azure](#step-0-resize-the-disk-in-azure)
- [How to run the scripts](#how-to-run-the-scripts)
- [Script 1: Confirm the layout](#script-1-confirm-the-layout)
- [Is it safe to delete the recovery partition?](#is-it-safe-to-delete-the-recovery-partition)
- [Script 2: Remove the trailing partition](#script-2-remove-the-trailing-partition)
- [Script 3: Extend C: to max](#script-3-extend-c-to-max)
- [Why the scripts look the way they do](#why-the-scripts-look-the-way-they-do)

## Step 0: Resize the disk in Azure

Before any of the in-guest work, the disk itself has to grow. In the portal
that's **VM → Disks → the OS disk → Size + performance**, pick a bigger size,
save. From the CLI:

```bash
az disk update \
  --resource-group my-rg \
  --name my-vm_OsDisk_1 \
  --size-gb 256
```

> **Watch out:** depending on the disk type and size, Azure may require the VM
> to be deallocated (not just stopped from inside the OS) before it'll accept
> the resize. Newer Premium SSD / data-disk scenarios support live resize, but
> OS disks often still want a stop/deallocate → resize → start cycle. If
> `az disk update` complains the disk is attached to a running VM, that's why.

Once the VM is back up, the guest sees a bigger disk with unallocated space at
the end — sitting behind the recovery partition.

## How to run the scripts

Run Command executes PowerShell inside the VM as `SYSTEM`, via the Azure VM
agent. No network path to the VM needed — it goes through the Azure control
plane, which is exactly why it works on firewalled machines.

**Portal:** VM → **Operations → Run command** → `RunPowerShellScript` → paste a
script → Run. Output appears in the blade after it finishes.

**CLI:**

```bash
az vm run-command invoke \
  --resource-group my-rg \
  --name my-vm \
  --command-id RunPowerShellScript \
  --scripts @script1-list-partitions.ps1
```

The `@file.ps1` syntax reads the script from a local file; you can also pass
the script inline with `--scripts "Get-Partition ..."` for one-liners.

> **Watch out:** Run Command is completely non-interactive. Anything that
> prompts — a confirmation dialog, a `Read-Host` — hangs until the command
> times out. That's why every destructive cmdlet below carries `-Confirm:$false`
> and the scripts set `$ErrorActionPreference = 'Stop'` so a failure halts the
> script instead of barreling on.

## Script 1: Confirm the layout

Never delete a partition by number without looking first. This prints the
layout of Disk 0 (the OS disk):

```powershell
# List all partitions on Disk 0
Get-Partition -DiskNumber 0 |
    Format-Table PartitionNumber, DriveLetter, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}, Type -AutoSize |
    Out-String | Write-Output
```

The `Out-String | Write-Output` at the end isn't decoration: Run Command only
returns what lands in the output stream, and `Format-Table` on its own can get
swallowed or mangled. Piping through `Out-String` flattens the table into text
that survives the trip back to the portal/CLI.

On a stock Azure Windows Server image you'll typically see something like:

```text
PartitionNumber DriveLetter SizeGB Type
--------------- ----------- ------ ----
              1                0.1 System
              2           C 126.45 Basic
              3                0.6 Recovery
```

That's the shape you're looking for: C: is partition 2, and partition 3 is a
small (~500 MB–1 GB) **Recovery** partition sitting between C: and the free
space you just paid for.

> **Watch out:** if your layout differs — partition 3 is large, has a drive
> letter, or isn't `Recovery` type — **stop**. The remove script below
> hard-codes partition 3 because that's the standard Azure layout, but it will
> happily delete whatever partition 3 actually is. Script 1 exists precisely so
> you check before you cut.

## Is it safe to delete the recovery partition?

This is the part that makes people hesitate, so let's be explicit about it.

That partition holds **WinRE** — the Windows Recovery Environment. On a laptop,
WinRE is how you get "Startup Repair" and "Reset this PC" when boot goes
sideways, and deleting it would be a bad idea.

On an Azure VM, WinRE is close to useless anyway:

- There's no console keyboard to press F8 on. If the VM won't boot, you're not
  getting into WinRE interactively the way you would on physical hardware.
- Azure gives you better recovery tools that don't live on the disk at all:
  [boot diagnostics](https://learn.microsoft.com/azure/virtual-machines/boot-diagnostics),
  the serial console, the
  [`az vm repair`](https://learn.microsoft.com/azure/virtual-machines/troubleshooting/repair-windows-vm-using-azure-virtual-machine-repair-commands)
  workflow (attach the broken OS disk to a rescue VM), and plain disk snapshots.
- Your real recovery story for a cloud VM should be snapshots/backup anyway,
  not an in-place reset.

If you want a belt-and-suspenders option, you can check WinRE's status with
`reagentc /info` before deleting, and later re-create a recovery partition with
`reagentc` if some compliance requirement demands one. I've never needed to.

## Script 2: Remove the trailing partition

Layout confirmed, partition 3 is the recovery partition — remove it:

```powershell
# Remove trailing partition 3 on Disk 0 (non-interactive)
$ErrorActionPreference = 'Stop'

Remove-Partition -DiskNumber 0 -PartitionNumber 3 -Confirm:$false
Write-Output "Partition 3 removed. Current layout:"

Get-Partition -DiskNumber 0 |
    Format-Table PartitionNumber, DriveLetter, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}, Type -AutoSize |
    Out-String | Write-Output
```

`-Confirm:$false` is mandatory here — `Remove-Partition` prompts by default,
and a prompt under Run Command is a hang. The script re-prints the layout after
the delete so the output you get back is its own verification: partition 3 gone,
C: now adjacent to the free space.

## Script 3: Extend C: to max

```powershell
# Extend C: into all available trailing free space on Disk 0 (non-interactive)
$ErrorActionPreference = 'Stop'

Update-HostStorageCache | Out-Null
$size = Get-PartitionSupportedSize -DriveLetter C
$current = (Get-Partition -DriveLetter C).Size

if (($size.SizeMax - $current) -gt 1MB) {
    Resize-Partition -DriveLetter C -Size $size.SizeMax
    Write-Output ("C: extended from {0:N2} GB to {1:N2} GB." -f ($current/1GB), ($size.SizeMax/1GB))
} else {
    Write-Output ("C: already at max ({0:N2} GB)." -f ($current/1GB))
}

Get-Partition -DiskNumber 0 |
    Format-Table PartitionNumber, DriveLetter, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}, Type -AutoSize |
    Out-String | Write-Output
```

A few deliberate choices in here:

- **`Update-HostStorageCache`** forces Windows to re-read the disk topology.
  After an Azure-side resize, the guest sometimes still reports the old disk
  size until something nudges the storage stack. This is the nudge — it's the
  scripted equivalent of clicking "Rescan Disks" in Disk Management.
- **`Get-PartitionSupportedSize`** asks Windows what the maximum legal size for
  C: is, rather than computing it by hand. Whatever free space is adjacent,
  `SizeMax` accounts for it.
- **The `1MB` guard** makes the script idempotent. `Resize-Partition` throws if
  you ask it to resize to the size it already is, and there's often a sliver of
  unusable space at the end of the disk, so "is there more than a megabyte to
  gain?" is the practical test for "is there real work to do?" Run it twice and
  the second run just reports "already at max" instead of erroring.

The final layout printout confirms the result without needing a fourth script.

## Why the scripts look the way they do

The pattern these three scripts follow is worth stealing for any Run Command
work, not just disk extensions:

1. **Look before you touch.** Script 1 changes nothing; it exists so the
   destructive step is taken with current information, not assumptions.
2. **Suppress every prompt, fail loudly.** `-Confirm:$false` plus
   `$ErrorActionPreference = 'Stop'` is the non-interactive contract: nothing
   waits for input, and nothing limps past an error into the next destructive
   line.
3. **Every script ends by printing state.** Run Command's output blade is your
   only window into the machine. If the script doesn't say what the world looks
   like afterward, you're running the next step blind.
4. **Make re-runs harmless.** The size guard in script 3 means an accidental
   double-run — easy to do from the portal — costs nothing.

Total time per VM, including the portal clicking: a couple of minutes. RDP
sessions through the jumpbox: zero.
