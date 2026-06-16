---
title: 'Tailscale for private networking: workers, datastores, and SSH'
description: 'How regional worker VPSes reach Redis and MongoDB on a prod server over Tailscale — bound to the tailnet IP, never a public interface — plus how to securely SSH between Ubuntu machines without opening port 22, using auth keys, ACLs, and the key-expiry gotchas that silently break you months later.'
pubDate: 'Jun 15 2026'
tags: ['Tailscale', 'WireGuard', 'VPN', 'Networking', 'SSH', 'Redis', 'MongoDB', 'Ubuntu', 'Linux', 'SelfHosted', 'SysAdmin', 'DevOps']
---

This is a general overview of how I get worker nodes running in different regions
to talk to a production server — without port forwarding, without putting Redis
or MongoDB on a public IP, and without standing up my own VPN appliance. The glue
is **Tailscale**, and the same tailnet that carries the datastore traffic also
gives me SSH to every machine without exposing port 22 to the internet.

> **TL;DR** — Workers connect **directly** to Redis (`:6379`) and MongoDB
> (`:27017`) on the prod server. Those services are bound to the prod server's
> Tailscale IP (`100.x.y.z`), not a public interface. Tailscale is the private
> network that carries that traffic. The same tailnet also gives you SSH between
> every machine without opening port 22 to the internet.

---

## Why Tailscale (the actual reason)

The problem Tailscale solves here is **connecting two Ubuntu systems that live on
different networks** — a worker VPS in one region and the prod server in another
— **without**:

- **Port forwarding** — no router/NAT rules, no exposing Redis/Mongo to the
  public internet behind a firewall allowlist that you have to maintain by hand.
- **Public IPs on sensitive services** — Mongo and Redis have weak/no transport
  security by default. You never want them reachable from the open internet,
  even "allowlisted." With Tailscale they're only reachable from inside the
  tailnet.
- **A bastion / VPN appliance** — no WireGuard server to run and key-manage
  yourself; Tailscale is WireGuard under the hood with the coordination handled
  for you.

Every machine on the tailnet gets a stable `100.x.y.z` address (the
`100.64.0.0/10` CGNAT range). That address follows the machine across network
changes, NAT, and reboots. The prod datastores get pinned to one such address.

```
  Regional worker VPS                       Prod server
  ┌───────────────────────┐                 ┌─────────────────────────────┐
  │ worker container      │                 │ Redis   bound 100.x.y.z:6379  │
  │  - pulls task queue   │ ──Tailscale──▶  │ MongoDB bound 100.x.y.z:27017 │
  │  - writes results     │   (WireGuard)   │ (NOT on any public interface) │
  └───────────────────────┘                 └─────────────────────────────┘
        SSH (tailnet) ◀───────────────────────────────▶ SSH (tailnet)
```

It's wired up in the Compose file by binding the published ports to the tailnet
IP instead of `0.0.0.0`:

```yaml
# MongoDB
- "100.x.y.z:27017:27017"  # Expose only on the Tailscale interface for remote workers
# Redis
- "100.x.y.z:6379:6379"    # Expose only on the Tailscale interface for remote workers
```

Because the host-side bind address is the Tailscale IP, the kernel only accepts
connections arriving on the tailnet interface. A scan of the VPS's public IP
finds nothing on 6379/27017.

---

## Securely SSH between two Ubuntu machines using Tailscale

Tailscale can carry plain SSH (you just SSH to the `100.x` address or MagicDNS
name), **or** it can manage SSH itself with Tailscale SSH. Both remove the need
to open port 22 to the internet.

### Option A — plain SSH over the tailnet (simplest)

Keep your normal `sshd` and keys; just reach the host by its tailnet address.

```bash
# From the worker VPS, to the prod server:
ssh deploy@100.x.y.z
# or, with MagicDNS enabled:
ssh deploy@prod
```

Then **firewall off public SSH** so port 22 is only reachable over the tailnet.
On Ubuntu with UFW:

```bash
sudo ufw allow in on tailscale0 to any port 22 proto tcp
sudo ufw delete allow 22/tcp     # remove any public SSH rule
sudo ufw reload
```

`tailscale0` is the interface Tailscale creates. After this, SSH only answers on
the tailnet — a public port scan shows 22 closed.

### Option B — Tailscale SSH (no SSH keys to manage)

Let Tailscale authenticate SSH using tailnet identity + ACLs instead of
`authorized_keys`:

```bash
sudo tailscale up --ssh
```

Now access is governed by the tailnet ACL policy (see below), not by per-host
key files. You still SSH the same way (`ssh user@host`), but the connection is
authorized centrally and every session is logged in the admin console. This is
the cleaner model once you have more than two machines — you revoke access by
editing one policy file instead of chasing `authorized_keys` across hosts.

> For a small two-machine-per-region setup, plain SSH over the tailnet (Option A)
> is enough. Tailscale SSH becomes worth it as the worker fleet grows.

---

## The parts people get stuck on

### 1. `tailscale up` and the auth flow

On a fresh Ubuntu host:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

`tailscale up` prints a URL. Open it in a browser **logged into the tailnet
owner account** to authorize the machine. That's the gotcha on headless VPSes —
the auth happens in *your* browser, not on the server.

**For automated/headless provisioning**, use a pre-generated **auth key** so
there's no interactive browser step:

```bash
# Generate in admin console → Settings → Keys (pick reusable + pre-approved
# if you provision many workers; consider an ephemeral key for short-lived VPSes).
sudo tailscale up --authkey "tskey-auth-xxxxx" --hostname "worker-eu"
```

- **Reusable key** — one key provisions many machines (good for a fleet).
- **Ephemeral key** — the node auto-removes from the tailnet when it goes
  offline (good for autoscaled/disposable workers; avoids dead entries).
- **Pre-authorized** — skips the manual "approve this machine" step when device
  approval is on.

### 2. Key expiry (the thing that silently breaks you in 6 months)

Two different expiries trip people up:

- **Auth key expiry** — the `tskey-...` you provision with expires (default 90
  days, configurable). It only matters *at join time*; once a machine is on the
  tailnet, rotating the auth key doesn't kick it off.
- **Node key expiry** — each *machine's* key expires (default 180 days). When it
  does, the node drops off the tailnet and **all its connections die** — workers
  stop reaching Redis/Mongo, SSH stops working. This is the classic "everything
  was fine and then one day a region went dark" incident.

For **infrastructure that must not drop**, disable key expiry on those nodes:

```
Admin console → Machines → (node) → ⋯ → Disable key expiry
```

Do this for the prod server and each long-lived worker VPS. For ephemeral/
autoscaled workers, leave expiry on so stale nodes clean themselves up.

### 3. MagicDNS

MagicDNS gives every machine a name instead of a `100.x` address:

```bash
ssh deploy@prod          # instead of ssh deploy@100.x.y.z
redis-cli -h prod ...    # instead of -h 100.x.y.z
```

Enable it in **admin console → DNS → Enable MagicDNS**. Names resolve to tailnet
IPs automatically across all machines.

> **Why still pin the raw IP in the Compose file:** a Docker `ports:` bind
> address must be an IP literal — it won't resolve a MagicDNS name, and it's
> evaluated before Tailscale's DNS is necessarily up. So the compose file uses
> the `100.x.y.z` address directly. MagicDNS is for humans (SSH, `redis-cli`,
> debugging), not for the service binds. If the prod server's tailnet IP ever
> changes, **that compose line must be updated by hand.**

### 4. ACLs — restricting which machines can talk

By default a tailnet is **flat**: every machine can reach every other machine on
every port. That's more than you want. Lock it down with the ACL policy
(admin console → **Access Controls**), using **tags** to group machines by role.

Tag machines at join time:

```bash
# Prod server
sudo tailscale up --advertise-tags=tag:prod
# Worker VPSes
sudo tailscale up --authkey "tskey-..." --advertise-tags=tag:worker --hostname worker-eu
```

Then a policy that says *workers may reach prod only on Redis + Mongo, and admin
may SSH everything*:

```jsonc
{
  "tagOwners": {
    "tag:prod":   ["autogroup:admin"],
    "tag:worker": ["autogroup:admin"]
  },
  "acls": [
    // Workers → prod: only Redis and MongoDB, nothing else.
    {
      "action": "accept",
      "src":    ["tag:worker"],
      "dst":    ["tag:prod:6379", "tag:prod:27017"]
    },
    // Admin (you) → everything, for SSH and ops.
    {
      "action": "accept",
      "src":    ["autogroup:admin"],
      "dst":    ["*:*"]
    }
  ],
  // If using Tailscale SSH (Option B):
  "ssh": [
    {
      "action": "accept",
      "src":    ["autogroup:admin"],
      "dst":    ["tag:prod", "tag:worker"],
      "users":  ["deploy", "root"]
    }
  ]
}
```

What this buys you:

- A compromised worker VPS can hit **only** Redis and Mongo on prod — not SSH,
  not anything else, and **not other workers** (no `tag:worker → tag:worker`
  rule). Lateral movement is blocked at the network layer.
- Workers cannot SSH into prod or each other.
- Only the admin identity can SSH anywhere.

> **Tag ownership caveat:** once a machine is tagged, the tag (not the user who
> joined it) owns the node, and only `tagOwners` can re-tag it. Set
> `--advertise-tags` at join time and define `tagOwners` first, or the join is
> rejected.

---

## Putting it together: provisioning a new region

1. **Prod server** (one-time): install Tailscale, `tailscale up
   --advertise-tags=tag:prod`, disable key expiry, confirm Mongo/Redis bind to
   the prod server's tailnet IP in the Compose file.
2. **New worker VPS**: install Tailscale, join with an auth key +
   `--advertise-tags=tag:worker --hostname worker-<region>`, disable key expiry
   for long-lived nodes.
3. **ACL**: confirm the `tag:worker → tag:prod:6379,27017` rule is in place.
4. **Worker env**: point `REDIS_URL` / `MONGO_URI` at the prod server (its
   `100.x.y.z` address or MagicDNS name).
5. **Verify**: from the worker, `nc -vz 100.x.y.z 6379` and `... 27017` should
   connect; the same against the prod server's *public* IP should fail.

### Retiring the public-port fallback

If you ever documented a non-Tailscale path (open 6379/27017 via UFW to specific
worker IPs), that fallback is the riskier option once you're committed to
Tailscale, and it should be retired:

- Remove any `ufw allow from <VPS_IP> to any port 6379/27017` rules on prod.
- Keep the datastores bound to the tailnet IP only (never `0.0.0.0`).
- Update your provisioning docs to require Tailscale rather than presenting
  public ports as an equal alternative.

---

## Quick reference

| Task | Command |
|---|---|
| Install | `curl -fsSL https://tailscale.com/install.sh \| sh` |
| Join (interactive) | `sudo tailscale up` |
| Join (headless) | `sudo tailscale up --authkey tskey-... --advertise-tags=tag:worker --hostname worker-eu` |
| Status / IPs | `tailscale status` |
| This machine's tailnet IP | `tailscale ip -4` |
| Test a peer | `tailscale ping prod` |
| Enable Tailscale SSH | `sudo tailscale up --ssh` |
| Leave tailnet | `sudo tailscale down` / `sudo tailscale logout` |

| Gotcha | Fix |
|---|---|
| Headless host won't auth | Use an `--authkey`, not interactive browser |
| Region went dark after months | Disable **node** key expiry on long-lived nodes |
| MagicDNS name won't resolve in compose | Use the raw `100.x` IP for service binds |
| Worker can reach more than it should | Tag machines + write an ACL; default tailnet is flat |
| Can't re-tag a machine | Only `tagOwners` can; set tags at join time |
