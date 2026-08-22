---
title: 'A disposable Hetzner lab with OpenTofu: real Ubuntu box, run a script, destroy it'
description: 'Build a throwaway Hetzner Cloud VM harness with OpenTofu and Python so Linux guides get tested on a real machine before they ship: S3 state per lab, runbooks over SSH, TTL sweeping, and three footguns I found in my own tool, including a server type the API happily prices and quotes but will not sell you.'
pubDate: 'Aug 21 2026'
heroImage: '../../assets/hetzner-lab-hero.png'
tags: ['Hetzner', 'OpenTofu', 'Terraform', 'Ubuntu', 'Python', 'IaC', 'Cloud', 'SelfHosted', 'DevOps', 'SysAdmin']
---

Most of what I write here is Ubuntu, and I write it on a Mac. That gap is a problem. A Docker container is not a machine: it shares my kernel, it has no real systemd to fight with, it cannot reboot, and `do-release-upgrade` inside one is meaningless. A local VM is closer but it lives forever, drifts, and quietly becomes a machine I maintain instead of a machine I test on.

What I actually want is a real Ubuntu server that exists for twenty minutes and then does not. Hetzner bills by the hour and hands you a booted box in about sixty seconds, so the cloud part is easy. The part worth writing down is everything around it: where the state goes when you are creating and destroying the same thing forty times, how you make sure a forgotten VM does not bill you all month, and the three ways this tool could quietly cost me money, open a box to the internet, or leave something behind it no longer knows about. All three were in my own code. I found one by reading it and the other two by trying to build the box for the next post, which failed. All three are fixed now, and each one is in here because the fix is less interesting than the reason it was wrong.

> **TL;DR.** One `hcloud_server` and one `hcloud_firewall` in OpenTofu, with the firewall locked to your public IP `/32`. Keep state in S3 at `labs/<lab_id>/state.tfstate`, one object per lab, so concurrent labs never touch the same file. Wrap it in a Python script that does `up`, `down`, `ssh`, `status`, and `sweep`. Push the work into a **runbook**, a plain Python file that gets copied to the box and run as root, so the test is a reproducible artifact instead of shell history. Set a short TTL and sweep from cron, because nothing cloud side enforces it.

## Contents

- [The shape of it](#the-shape-of-it)
- [Prerequisites](#prerequisites)
- [1. The OpenTofu is the small part](#1-the-opentofu-is-the-small-part)
- [2. One state object per lab](#2-one-state-object-per-lab)
- [3. The wrapper](#3-the-wrapper)
- [4. Runbooks, not shell history](#4-runbooks-not-shell-history)
- [5. Teardown is the actual feature](#5-teardown-is-the-actual-feature)
- [Three footguns I found in my own tool](#three-footguns-i-found-in-my-own-tool)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## The shape of it

The commands you will actually use are `up`, `down`, `ssh`, `status`, and `sweep`, and the whole thing is a Python file plus five `.tofu` files.

```bash
lab up --image ubuntu-26.04 --ttl 1 --runbook runbooks/check.py
lab ssh -c 'journalctl -n 50 --no-pager'
lab down
```

`up` creates one server and one firewall, then prints the SSH command and a destroy deadline. Hand it a runbook and it also waits for SSH, copies the script to the box, and runs it as root while streaming the output back. `down` destroys it. `sweep` destroys anything past its deadline. That is the entire product.

The design decision that matters is that a lab is **one server**, not a fleet. The moment you let it grow a second node you need inventory, ordering, and a graph, and you have written a worse Ansible. One box, born and killed, is a small enough problem to keep honest.

## Prerequisites

- [OpenTofu](https://opentofu.org/docs/intro/install/) 1.10 or newer, which is where S3 state locking arrives. I am on 1.12.6. Terraform works too, since this uses nothing OpenTofu specific.
- Python 3.10 or newer and [uv](https://docs.astral.sh/uv/getting-started/installation/).
- A Hetzner Cloud project and an API token with read and write, from **Security**, then **API tokens**.
- Your SSH public key uploaded under **Security**, then **SSH keys**. Note the name you gave it.
- An S3 compatible bucket. I use Hetzner Object Storage in the same region, so state and logs sit next to the servers.

## 1. The OpenTofu is the small part

Two resources. That is it.

```hcl
# main.tofu
data "hcloud_ssh_key" "lab" {
  name = var.ssh_key_name
}

resource "hcloud_firewall" "lab" {
  name = "${var.lab_id}-fw"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = [var.allowed_ssh_cidr]
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "lab" {
  name         = var.lab_id
  server_type  = var.server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [data.hcloud_ssh_key.lab.id]
  firewall_ids = [hcloud_firewall.lab.id]

  labels = {
    lab        = "true"
    lab_id     = var.lab_id
    ttl_hours  = var.ttl_hours
    created_at = var.created_at
  }
}
```

One more file does quiet work alongside this one. `outputs.tofu` exports `server_ip`, `server_id`, and `lab_id`, and the Python wrapper reads the first two back with `tofu output -json` right after apply. Copy the resources, skip the outputs, and `up` dies immediately after building your server, which is the worst moment for it to die.

Two things in the resources are load bearing and easy to skip past.

**Only port 22 and ICMP are open.** Nothing else, inbound, ever. If a runbook installs Nginx you will not reach it from your browser, and that is deliberate: a box that exists for twenty minutes with a service exposed to the internet is how you end up in someone's scan results. When I need to see a web service I forward it over the SSH session I already have:

```bash
ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -N -L 8080:localhost:80 root@<ip>
```

**The labels are the safety net.** `lab = "true"`, plus the TTL and creation time, live on the server in Hetzner's own API. Local files get deleted, laptops get reimaged, and a `.lab/` directory is one `rm -rf` away from being gone. The labels stay attached to the running server, so no matter what happens on my machine I can always ask Hetzner "what did I leave on?" and get a real answer:

```bash
curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" \
  'https://api.hetzner.cloud/v1/servers?label_selector=lab%3Dtrue' \
  | python3 -c 'import json,sys; [print(s["name"], s["public_net"]["ipv4"]["ip"], s["labels"]) for s in json.load(sys.stdin)["servers"]]'
```

Put that somewhere you will find it. It is the command that answers "am I being billed for something I forgot about," and it does not care whether your local state survived.

## 2. One state object per lab

The backend is declared empty and filled in at `init` time:

```hcl
# backend.tofu
terraform {
  backend "s3" {}
}
```

Then every command passes the key for that specific lab:

```bash
tofu init -input=false -reconfigure \
  -backend-config="bucket=$S3_BUCKET" \
  -backend-config="key=labs/$LAB_ID/state.tfstate" \
  -backend-config="region=$S3_REGION" \
  -backend-config="endpoint=$S3_ENDPOINT" \
  -backend-config="access_key=$AWS_ACCESS_KEY_ID" \
  -backend-config="secret_key=$AWS_SECRET_ACCESS_KEY" \
  -backend-config="skip_credentials_validation=true" \
  -backend-config="skip_metadata_api_check=true" \
  -backend-config="skip_region_validation=true" \
  -backend-config="skip_requesting_account_id=true" \
  -backend-config="use_lockfile=true" \
  -backend-config="use_path_style=true"
```

The four `skip_` flags are not optional and they are the thing that sends people to the search bar. The S3 backend assumes AWS. Point it at Hetzner Object Storage, MinIO, or Backblaze and it will try to validate credentials against AWS endpoints, look for an EC2 metadata service that is not there, reject `nbg1` as a region name, and call STS to work out an account ID. Every one of those fails against a non AWS provider. Skip them all.

`use_path_style=true` matters for the same reason. Hetzner Object Storage wants `https://nbg1.your-objectstorage.com/bucket/key`, not `https://bucket.nbg1.your-objectstorage.com/key`. Get it wrong and you get a DNS failure that looks nothing like a configuration mistake.

Why one object per lab instead of one workspace or one big state? Because labs are independent and I want to run two at once without them knowing about each other. Separate keys means separate state files, so a 24.04 box and a 26.04 box can be up simultaneously and neither can corrupt the other. It also means a lab's entire existence is one deletable prefix in a bucket.

The credentials failure here is worth calling out because it does not announce itself. Bad S3 keys surface as an opaque `tofu init` error with no mention of S3. So the first thing the tool does when you complain is check them directly:

```bash
lab test-s3
# Endpoint: https://nbg1.your-objectstorage.com
# Region:   nbg1
# Bucket:   minor-lab-state
# Access:   ABC123...
#
# OK: bucket 'minor-lab-state' is reachable.
```

If that passes and `init` still fails, the problem is genuinely OpenTofu. If it fails, you have your answer in two seconds instead of twenty minutes.

## 3. The wrapper

The Python file is the whole user interface. `up`, `down`, `ssh`, `logs`, `status`, `sweep`, plus `test-s3`, `test-discord`, and `server-types`. It shells out to `tofu`, holds the flags so I never type a backend config by hand, and writes a small metadata file per lab.

Three details in `up` earned their place.

**It waits for SSH properly, when there is a runbook.** Hetzner reports the server as `running` before cloud-init has finished, so connecting immediately gets you a refused connection. The wrapper polls port 22 every two seconds for up to two minutes, with the progress prints trimmed out of the quote below. A bare `lab up` with no runbook skips this entirely. It applies, prints, and exits without ever probing port 22, so the address it hands you may not answer for another half minute.

```python
def _wait_for_ssh(ip: str, timeout: int = 120) -> None:
    deadline = _now() + timedelta(seconds=timeout)
    while _now() < deadline:
        try:
            with socket.create_connection((ip, 22), timeout=5):
                return
        except OSError:
            pass
        time.sleep(2)
    sys.exit(1)
```

**It saves metadata before it does anything risky.** The IP, the server ID, the TTL, and the destroy deadline are written to disk the moment the server exists, before the runbook runs. If the runbook explodes, or I hit Ctrl C, the box is still tracked and still destroyable. Saving that file after the interesting part would mean any failure leaves an untracked, billed server.

**It fails closed.** If the runbook exits non zero, `up` destroys the server and firewall, wipes the local metadata, and still exits with the runbook's code. That is the correct default for a tool that spends money, but it has a consequence you need to internalize: **the evidence dies with the box.** To debug a failure you have to decide beforehand and pass `--keep-on-failure`. It took two fixes to make that heading true, and both are in the third footgun below.

The log survives a failed runbook, because the upload to S3 happens before the destroy. After an automatic teardown, `lab logs` fails because the local directory is gone, but the full output including stderr is sitting at `s3://<bucket>/labs/<lab_id>/runbook.log`. Read it from there.

One hole in that, which I would rather state than have you discover. The upload only gets skipped when the SCP itself fails, because that raises and goes straight to the exception handler, which destroys the box without uploading. A connection that dies partway through a running script is fine: the read loop just ends, `up` uploads whatever made it into the log, and you get a truncated but real record. So the log survives a script that fails and a session that drops. It does not survive a runbook that never landed on the box.

## 4. Runbooks, not shell history

A runbook is a Python file that gets copied to `/tmp/runbook.py` and executed as root. Output is merged, streamed live to my terminal, written locally, and uploaded to S3.

```python
#!/usr/bin/env python3
import subprocess, sys

def run(cmd):
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, check=True)

def main() -> int:
    run(["apt-get", "update", "-qq"])
    run(["apt-get", "install", "-y", "-qq", "nginx"])
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

Python rather than bash for one reason: exit codes. A bash script without `set -euo pipefail` cheerfully reports success after every command in it failed, and I have been burned by a green test that proved nothing. `subprocess.run(..., check=True)` raises, the script exits non zero, and the tool tears the lab down and tells me. Failure is loud by default instead of by remembering to configure it.

The real payoff is that the runbook is a file. When I write an Ubuntu guide, the script that proves it works can ship next to the post. A reader can run the same file on their own box and get the same output rather than trusting that I ran the commands in the order I wrote them.

One thing bites on the first run. `apt-get` fails with `Could not get lock /var/lib/dpkg/lock-frontend` because cloud-init is still installing packages when SSH comes up. Waiting for port 22 is not the same as waiting for the machine to be finished. Either wait for cloud-init or retry:

```python
run(["cloud-init", "status", "--wait"])
```

## 5. Teardown is the actual feature

Creating servers is easy. Not paying for them is the part that needs design.

Every lab gets a `destroy_after` timestamp from `--ttl`, in hours. `sweep` walks the labs and destroys anything past its deadline, which goes in cron:

```cron
0 * * * * cd ~/projects/hetzner-terraform-dev-lab && uv run ./lab sweep >> /tmp/lab-sweep.log 2>&1
```

`uv run` is not decoration there. The script exits at import time if `boto3` and `python-dotenv` are missing, and system Python has neither, so a bare `./lab sweep` from cron prints a dependency error into the log every hour and sweeps nothing. Silently, in the one place whose entire job is to stop you being billed for a machine you forgot.

Be honest about what this is: **the TTL is advisory.** Nothing on Hetzner's side enforces it. If my laptop is asleep, cron does not run, and the box bills merrily. A short TTL plus prompt `lab down` is the real story, and sweep is a backstop for the times I forget.

`sweep` also destroys *any* expired lab, including one somebody else on the machine created. Mine is a single user Mac so that is theoretical, but it is why the command is not wired into `up`.

The failure I care most about is the one where teardown itself fails. The script prints `Manual cleanup may be required`, then re-raises, so you get a traceback with it. That is the correct behavior, and it is also the exact moment to go run that label selector query from earlier.

## Three footguns I found in my own tool

Writing this post is what surfaced all three. The first I found by reading the code, and the other two found me, in the middle of trying to spin up the box for the next post.

### The public IP lookup fails open

`up` locks SSH to your current public IP by default. It gets that IP from ipify:

```python
def _public_ip() -> str:
    try:
        with urllib.request.urlopen("https://api.ipify.org", timeout=10) as resp:
            return resp.read().decode().strip()
    except Exception:
        return ""
```

and then:

```python
ip = _public_ip()
allowed_ssh_cidr = f"{ip}/32" if ip else "0.0.0.0/0"
```

Read that second block again. If ipify is slow, blocked, rate limiting me, or I am on a captive portal, `_public_ip()` swallows the exception and returns an empty string, and the default silently becomes **root SSH open to the entire internet.** No warning, no prompt, nothing in the output that looks different from a normal run. The one line in `up`'s output that would tell you is `ssh cidr: 0.0.0.0/0`, sitting in a block of five lines that all look like routine startup noise.

It fails closed now:

```python
ip = _public_ip()
if not ip:
    print("Could not determine your public IP address.")
    print("Refusing to default the SSH rule to 0.0.0.0/0.")
    print("Pass --allow-ssh <cidr> explicitly if that is really what you want.")
    sys.exit(1)
allowed_ssh_cidr = f"{ip}/32"
```

And when you do ask for it deliberately, it says so out loud instead of hiding in the startup noise:

```text
WARNING: SSH will be open to the entire internet (0.0.0.0/0).
```

Wide open is a legitimate thing to want sometimes, from a CI runner with no stable egress address for instance. It is not a legitimate thing to arrive at by accident because a third party HTTP request timed out. Make the human type it.

The same default was sitting in `variables.tofu` as `default = "0.0.0.0/0"`, which is the belt to match the braces. That default is gone too, so the variable is now required and a missing value is an error rather than an open port.

### Hetzner will price a server type it will not sell you

I picked `cpx12` when I set this up because the name looked like the small one. Later I built a `server-types` command so I would stop guessing, ran it, and it told me `cpx11` was two cores instead of one and less than half the price. Obvious upgrade. I changed the flag, ran it, and got this:

```text
Error: Server Type "cpx11" is unavailable in "nbg1" and can no longer be ordered

  with hcloud_server.lab,
  on main.tofu line 22, in resource "hcloud_server" "lab":
```

Here is the part worth the post. Hetzner's `/v1/server_types` endpoint still returns `cpx11` with a current hourly price for `nbg1` and `deprecation: null`. Nothing in that response suggests you cannot have one. The entire `cpx*1` generation is retired, and the only endpoint that admits it is `/v1/datacenters`, which carries a `server_types.available` list of numeric IDs per datacenter:

```bash
curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" \
  'https://api.hetzner.cloud/v1/datacenters' \
  | python3 -c 'import json,sys; [print(d["name"], sorted(d["server_types"]["available"])) for d in json.load(sys.stdin)["datacenters"]]'
```

Prices and deprecation flags describe the catalog. Only that list describes the shop.

Which made my own command a liar. `lab server-types --location nbg1` printed the header `Available server types in nbg1:` and then listed `cpx11`, `cpx21`, `cpx31`, `cpx41`, `cpx51`, `cx43`, and `cx53`, none of which can be ordered there. It filtered on whether a price exists for the location, which is not the same question. A command whose whole purpose is to stop me guessing sent me straight into a failed apply.

It cross references the datacenter list now, and only prints what you can actually have:

```text
Server types you can actually order in nbg1:
NAME          CPU   RAM   DISK  ORDERABLE   PRICE/MO
cax11           2    4GB    40GB        yes       6.99
cpx12           1    2GB    40GB        yes      13.49
cx23            2    4GB    40GB        yes       6.49
...                                                       (17 rows in total)

Pass --all to include types that are priced here but cannot be ordered.
```

`--all` keeps the rest visible with an honest column, which is where `cpx11` now shows up as `NO`.

Among the types you can actually order in `nbg1`, the original default still looks bad:

| Type | Cores | RAM | Hourly | Orderable in nbg1 |
|---|---|---|---|---|
| `cx23` | 2 | 4 GB | €0.0104 | yes |
| `cax11` (arm) | 2 | 4 GB | €0.0112 | yes |
| **`cpx12`** | **1** | **2 GB** | **€0.0216** | yes |
| `cpx11` | 2 | 2 GB | €0.0096 | **no** |

`cx23` is double the cores and double the RAM of the old default, for less than half the hourly. It is the default now. The arm box is worth a look too, since Hetzner publishes `ubuntu-26.04` for arm as well as x86.

### The teardown handler has two blind spots

The `cpx11` failure exposed a third one immediately. When `tofu apply` fails, the run leaves behind a `lab-upgrade-2604-fw` firewall with nothing attached to it, and `lab status` shows an empty table. Local metadata is written after apply succeeds, so from the tool's point of view the lab was never born, and `lab down` has nothing to destroy.

The cause is one line of control flow. In `cmd_up`, the apply happens *before* the `try` block that owns the cleanup:

```python
_tofu_init(lab_id)
_tofu_apply(lab_id, args, allowed_ssh_cidr, created_at_label)
vm_created = True

try:
    ...
except Exception:
    # tears down the server and the firewall
```

Every failure after that point was handled properly. The failure *of* that line was not handled at all, and it is the most likely one, because apply is where quota limits, retired server types, unavailable images, and API hiccups all land.

The apply lives inside the `try` now. The subtle part is the flag, which has to be set *before* the apply rather than after it, because a failed apply may already have built the firewall. Set it after and you have written the same bug in a new place, which I did on the first attempt:

```python
resources_touched = False
try:
    _tofu_init(lab_id)
    # Set before the apply, not after: a failed apply can still have created
    # the firewall, and that is exactly the case that used to leak.
    resources_touched = True
    _tofu_apply(lab_id, args, allowed_ssh_cidr, created_at_label)
```

Running the same `cpx11` failure against the fixed version now ends the way it should:

```text
Error: Server Type "cpx11" is unavailable in "nbg1" and can no longer be ordered

Lab setup failed: Command '['tofu', 'apply', ...]' returned non-zero exit status 1.
Tearing down lab to avoid leaving resources up...
...
Destroy complete! Resources: 1 destroyed.
Lab torn down.
```

There is a second blind spot in the same handler and it is quieter. `_wait_for_ssh` gives up after two minutes by calling `sys.exit(1)`. That raises `SystemExit`, and `SystemExit` does not inherit from `Exception`:

```python
>>> issubclass(SystemExit, Exception)
False
```

So it went straight past `except Exception` and no teardown ran. A box that boots but never opens port 22, which is what a bad image or a firewall mistake looks like, left a running server behind. This one was gentler than the apply case, because metadata was already saved, so `lab status` saw the lab and `lab down` worked. It still was not the behavior the tool advertised. The handler catches `BaseException` now, which is the one place that spelling is worth reaching for.

A dangling firewall costs nothing, so this is clutter rather than a bill. It matters because it breaks the promise the rest of the tool makes: that anything it created, it can also destroy. Here is the audit, which needs no local state and is the thing to reach for when the tool says it knows nothing:

```bash
curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" 'https://api.hetzner.cloud/v1/firewalls' \
  | python3 -c 'import json,sys; [print(f["id"], f["name"], len(f["applied_to"])) for f in json.load(sys.stdin)["firewalls"]]'
```

Anything with zero attachments and a lab name is mine, and it is safe to delete.

## Gotchas worth knowing

**`tofu init` fails with something that never mentions S3.** Bad object storage credentials surface as an opaque init error. Run `lab test-s3` first, always.

**`InvalidAccessKeyId` when the keys look right.** The S3 credentials belong to a different Hetzner project than the bucket. They are scoped per project and the console does not make that obvious.

**SSH stops working mid lab.** The firewall is pinned to the public IP you had when you ran `up`. Move from home WiFi to a phone hotspot and you are locked out of your own box. Recreate it, or widen the CIDR.

**There was no state locking at all, and that is worse than a stuck lock.** I assumed there was, and I was wrong, which is why I am spelling it out. The S3 backend only locks if you ask it to, and this backend config did not. On OpenTofu 1.10 and later that means adding `use_lockfile=true`, and on older setups it meant a DynamoDB table. With neither, two commands against the same lab do not queue and do not hang. They both write, and the loser silently corrupts the state file. Separate labs are genuinely safe because they have separate state objects. The same lab twice at once was not, and nothing warned you. One flag fixes it, and it is in the backend config now:

```bash
-backend-config="use_lockfile=true"
```

**Deleting `.lab/` orphans a running server.** Destroy is driven from the local metadata file. Wipe the directory and the tool no longer knows the box exists, while Hetzner still does, and still bills for it. This is why the labels matter.

**`lab logs` fails after a failed runbook.** Expected. The teardown removed the local directory. The log is in S3.

**Discord webhooks fail quietly.** Post to a webhook URL and you get a `204` with no body whether or not anything sensible happened. Add `?wait=true` and Discord returns the created message or a real error, which turns "did that work?" into a question with an answer.

## Quick reference

```bash
lab status                                     # what exists, * marks current
lab up --ttl 1                                 # bare box, eligible for sweep after 1h
lab up --image ubuntu-26.04 --ttl 2 --runbook runbooks/x.py
lab up --ttl 1 --runbook r.py --keep-on-failure  # keep the box to debug
lab ssh                                        # interactive shell
lab ssh -c 'cloud-init status --wait'          # one shot command
lab logs --show                                # local runbook log
lab down                                       # destroy current lab
lab down lab-20260821-143000                   # destroy a specific one
lab sweep                                      # destroy everything expired
lab server-types --location nbg1               # only what you can actually order
lab test-s3                                    # check credentials first
```

And the one that does not need the tool at all, for when local state is gone and you need the truth:

```bash
curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" \
  'https://api.hetzner.cloud/v1/servers?label_selector=lab%3Dtrue'
```

The first thing I pointed this at was a 24.04 box and `do-release-upgrade`, which is a test I was never going to run on a machine I cared about. That one is written up in [upgrading Ubuntu 24.04 to 26.04](/blog/upgrade-ubuntu-24-04-to-26-04/), and two of the three footguns above surfaced while I was building the box for it.

`[ lab down ✓ ]`
