---
title: 'Self-host Forgejo on your tailnet with Docker Compose and Tailscale Serve'
description: 'Run your own Git host with no open ports, no public DNS, and no certbot. Forgejo behind a Tailscale sidecar container, real HTTPS on your ts.net name, and the state volume, node key expiry, and port 22 details that decide whether it works.'
pubDate: 'Jul 28 2026'
tags: ['Forgejo', 'Tailscale', 'Git', 'Docker', 'DockerCompose', 'SelfHosted', 'Homelab', 'Networking', 'VPN', 'Ubuntu2604']
---

You want your own Git host. Maybe you're getting off GitHub, maybe you just want somewhere private to keep the repos that shouldn't be on someone else's servers. So you go looking, and every guide hands you the same shape: a public DNS record, ports 80 and 443 open to the entire internet, a reverse proxy, a certificate, and a login page that anyone on earth can now knock on.

For a private code host, that's a strange trade. Nothing about "my repos, for me and three collaborators" requires a public address. If the only people who should reach it are people you already trust, put it on your tailnet and the whole category of internet facing problems stops existing. No open ports, and no login page getting scanned at three in the morning.

The Compose file for this is short. What makes it worth writing down is the sidecar pattern it uses, which is not obvious the first time, and a handful of settings that decide whether it works at all. I built this from nothing on a fresh Ubuntu 26.04 box to check it, and the settings that went wrong were not the ones I expected, so those get their own section at the end.

> **TL;DR.** Run Tailscale as its own container and give Forgejo `network_mode: service:ts-forgejo` so Forgejo has no published ports and its own tailnet identity. Point `TS_SERVE_CONFIG` at a serve JSON file and you get real HTTPS on `forgejo.your-tailnet.ts.net` with no port 80 and no HTTP-01 challenge. Persist `/var/lib/tailscale` or every restart creates a brand new node. Tag the device so its node key never expires. Do not set `START_SSH_SERVER`, because the image already runs sshd on port 22.

## Contents

- [Prerequisites](#prerequisites)
- [The one thing to get straight](#the-one-thing-to-get-straight)
- [1. Turn on HTTPS for your tailnet](#1-turn-on-https-for-your-tailnet)
- [2. Make a tagged auth key](#2-make-a-tagged-auth-key)
- [3. The Compose file](#3-the-compose-file)
- [4. The serve config](#4-the-serve-config)
- [5. First boot and locking the installer](#5-first-boot-and-locking-the-installer)
- [6. Cloning over SSH](#6-cloning-over-ssh)
- [Who can actually reach it](#who-can-actually-reach-it)
- [When you want it public after all](#when-you-want-it-public-after-all)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## Prerequisites

- A box with [Docker installed](/blog/install-docker-ubuntu-26-04/). Mine runs Ubuntu 26.04, but nothing here is version specific.
- A Tailscale account and a tailnet you can already log into. If you're starting cold, [install Tailscale on the host first](/blog/install-tailscale-ubuntu-26-04/) so you have something to test from.
- Admin access to the Tailscale console, because two of the steps happen there and not on the box.
- MagicDNS turned on. It's on by default for new tailnets, and without it you get an IP instead of a name.

You do not need a domain, a DNS record, a certificate, or a single open port in your firewall. That's the point.

## The one thing to get straight

Forgejo is not sitting behind a reverse proxy here. Forgejo *is* the Tailscale node.

That distinction is the whole post. In the usual setup you'd run Caddy or Nginx on the host, publish ports, and forward traffic to a container. Here, the Tailscale container owns a network namespace, and Forgejo is placed inside that same namespace with `network_mode: service:ts-forgejo`. The two containers share one network stack the way two processes on one machine do.

Once that clicks, the rest follows on its own:

- Forgejo publishes no ports to the host, so `docker ps` shows nothing listening and the host firewall has nothing to do.
- The machine appears in your tailnet as its own device, with its own name and its own ACL rules, separate from the host it happens to run on.
- Port 22 inside that namespace belongs to Forgejo, and the host's real sshd is somewhere else entirely as far as the network stack is concerned. The port collision that makes the public version of this setup annoying never happens.
- HTTPS arrives without opening port 80. The certificate still comes from Let's Encrypt, but through a DNS-01 challenge that Tailscale completes for you by publishing the `_acme-challenge` TXT record under `ts.net` for your node. Nothing has to be reachable from the public internet for validation to pass.

The result is a real, publicly trusted certificate on a machine with no public presence at all. Your browser sees a normal padlock. Nothing is exposed.

## 1. Turn on HTTPS for your tailnet

Do this before anything else. Skipping it does not stop the stack coming up, which is exactly why it wastes your time later.

In the Tailscale admin console, go to **DNS**, and under HTTPS Certificates click **Enable HTTPS**. Note the tailnet name it shows you, something like `tail1234.ts.net`. Every device in your tailnet gets a name under it, so your Forgejo node will end up at `forgejo.tail1234.ts.net`.

If you skip this, the sidecar still starts and still says it's running. It logs a line telling you HTTPS is not enabled and links the docs, which is fair enough, but `tailscale serve status` just answers `No serve config` with no reason attached. The command that gives you a straight answer is:

```bash
docker compose exec ts-forgejo tailscale cert forgejo.tail1234.ts.net
```

With HTTPS off you get `your Tailscale account does not support getting TLS certs`. With it on you get two files written and you can move on. I use that as the check before touching anything else, because every other symptom of this is ambiguous.

## 2. Make a tagged auth key

The container needs a key to join the tailnet unattended, and the way expiry works here catches people out.

Auth keys cap out at 90 days, but that expiry only stops *new* devices from joining. A node that already registered keeps working until its own node key expires, and that defaults to 180 days. So a plain reusable key gets you roughly six months before your Git host quietly drops off the tailnet on a day you weren't touching anything.

The fix is a tag. Key expiry is disabled by default for tagged devices, because they're owned by the tailnet rather than by a user.

First define the tag in your ACL file, under **Access controls**:

```json
{
  "tagOwners": {
    "tag:container": ["autogroup:admin"]
  }
}
```

Then go to **Settings**, **Keys**, and generate an auth key with **Reusable** on and the tag `tag:container` applied. Copy it somewhere safe now, because the console shows it exactly once.

Put it in a `.env` file next to your Compose file:

```bash
# .env
TS_AUTHKEY=tskey-auth-xxxxxxxxxxxx
```

And keep that file out of Git:

```bash
echo ".env" >> .gitignore
```

## 3. The Compose file

Two services. The first is the network, the second is the application.

```yaml
services:
  ts-forgejo:
    image: tailscale/tailscale:latest
    container_name: ts-forgejo
    hostname: forgejo                      # becomes forgejo.your-tailnet.ts.net
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY}
      - TS_EXTRA_ARGS=--advertise-tags=tag:container
      - TS_STATE_DIR=/var/lib/tailscale    # persisted, see the volume below
      - TS_SERVE_CONFIG=/config/serve.json
      - TS_USERSPACE=false                 # use the kernel networking path
    volumes:
      - ts-forgejo-state:/var/lib/tailscale
      - ./ts-config:/config
    devices:
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
      - sys_module
    restart: unless-stopped

  forgejo:
    image: codeberg.org/forgejo/forgejo:15
    container_name: forgejo
    network_mode: service:ts-forgejo       # the whole trick, one line
    environment:
      - USER_UID=1000
      - USER_GID=1000
      - FORGEJO__server__ROOT_URL=https://forgejo.tail1234.ts.net/
      - FORGEJO__server__SSH_DOMAIN=forgejo.tail1234.ts.net
      - FORGEJO__server__SSH_PORT=22
      - FORGEJO__service__DISABLE_REGISTRATION=true
    volumes:
      - forgejo-data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    depends_on:
      - ts-forgejo
    restart: unless-stopped

volumes:
  ts-forgejo-state:
  forgejo-data:
```

A few of those lines are doing more work than they look like they are.

`network_mode: service:ts-forgejo` is the pattern. Notice what is absent: there is no `ports:` block anywhere in this file. Forgejo listens on 3000 and 22 inside the shared namespace, reachable over the tailnet and nowhere else.

`TS_USERSPACE=false` matters more than it looks. The Tailscale image defaults to userspace networking, and in that mode the TUN device and the `net_admin` capability sit there unused. Turning it off puts the container on the kernel networking path those lines exist for, which is what you want when something in the namespace needs to answer on a real port.

`hostname: forgejo` is what decides the name. Tailscale registers the container under it, so this is the value that ends up in your URL. Pick it before first boot, because renaming a node later means fixing `ROOT_URL` too.

`TS_STATE_DIR` with a real volume behind it is the difference between one node and a hundred. More on that in the gotchas below.

`FORGEJO__server__ROOT_URL` uses Forgejo's double underscore convention, where `FORGEJO__section__KEY` maps to a key in `app.ini`. Get this value right before you ever start the container. Forgejo bakes it into the clone URLs it shows you, the links in its emails, and its webhook targets. Wrong here means every clone command your users copy points at the wrong place, and it looks fine on screen right up until someone tries it.

There is also something deliberately missing. You will see `START_SSH_SERVER=true` in a lot of Forgejo examples, and it does not belong here. The rootful image runs OpenSSH on port 22 by itself, unconditionally. Setting that variable starts Forgejo's own Go SSH server as well, and now two SSH servers want the same port in the same namespace. Leave it out and the image does the right thing on its own. That variable is for the rootless image, which is a different setup with SSH on 2222.

`DISABLE_REGISTRATION=true` from the first boot means nobody gets to sign up while you're still setting things up. You'll create your admin account through the installer instead.

## 4. The serve config

Create `ts-config/serve.json` next to your Compose file:

```json
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://127.0.0.1:3000"
        }
      }
    }
  },
  "AllowFunnel": {
    "${TS_CERT_DOMAIN}:443": false
  }
}
```

`${TS_CERT_DOMAIN}` is substituted by the Tailscale container at startup with the node's real name, so you don't have to hardcode your tailnet name in a second place.

The proxy target is `127.0.0.1:3000`, and that is only correct because of the shared namespace. Forgejo really is on localhost from Tailscale's point of view. If you ever pull these two apart into separate networks, this line breaks first.

`AllowFunnel` is set to `false` on purpose. It's the switch that would put this node on the public internet, and having it present and off is better than having it absent, because you can see what the answer currently is.

Bring it up:

```bash
docker compose up -d
docker compose logs -f ts-forgejo
```

Watch for the node registering and the certificate being issued. Then check it from another machine on your tailnet:

```bash
tailscale status | grep forgejo
curl -I https://forgejo.tail1234.ts.net/
```

A `200` and a valid certificate means the hard part is done.

## 5. First boot and locking the installer

Open `https://forgejo.tail1234.ts.net/` in a browser on any device in your tailnet and you get Forgejo's setup page.

Two things matter here. Leave the database as SQLite unless you have a reason not to. For a personal or small team instance it's genuinely fine, it's one less container to run and one less thing to back up, and you can migrate later if the instance grows into something that needs Postgres. And check that the URL fields on the form match the `ROOT_URL` you set, because the installer will happily write different values into `app.ini` and leave you with two sources of truth.

Create your admin account on that same form. Do not skip it and do it later.

The reason for the urgency is smaller here than on a public box, but it still applies: until the installer is completed, whoever reaches that page can complete it and become the administrator. On a tailnet that's limited to devices you've already authorised, which is a much shorter list than "the internet". It's still a list. Finish the form.

Once you're in, confirm the install lock landed:

```bash
docker compose exec forgejo grep INSTALL_LOCK /data/gitea/conf/app.ini
# INSTALL_LOCK = true
```

## 6. Cloning over SSH

This is the part that would have been a whole section of fighting in the public version, and here it's almost nothing.

```bash
git clone git@forgejo.tail1234.ts.net:yourname/yourrepo.git
```

Port 22, no custom port, no `-p 2222` to remember, no conflict with the host's own sshd. The image's SSH server owns port 22 inside its namespace, and the host's sshd owns port 22 on the host, and they never meet.

Add your public key in the Forgejo UI under **Settings**, **SSH / GPG Keys**, the same as you would anywhere else.

One thing to check: the clone URL Forgejo displays comes from `SSH_DOMAIN` and `SSH_PORT`. If those disagree with reality, the button copies a command that fails, and the error the user sees is a connection timeout that tells them nothing about why.

## Who can actually reach it

Right now, every device in your tailnet can reach it. That's fine for a tailnet of one person and three laptops. It stops being fine the moment you add a contractor's machine or a server that runs someone else's code.

ACLs fix that. **This is a fragment to merge into your existing policy, not a whole policy file.** If you paste it over the top of everything, you delete the default rule that lets your tailnet talk to itself, and every other connection you have stops working at the same moment.

```json
{
  "groups": {
    "group:devs": ["you@example.com", "collaborator@example.com"]
  },
  "tagOwners": {
    "tag:container": ["autogroup:admin"]
  },
  "acls": [
    // ... your existing rules stay here ...
    {
      "action": "accept",
      "src": ["group:devs"],
      "dst": ["tag:container:443,22"]
    }
  ]
}
```

If you already worked through the ACL section of [Tailscale for private networking](/blog/tailscale-private-networking-workers-to-prod/), this is the same machinery pointed at a container instead of a server.

## When you want it public after all

Sometimes you need to hand someone a link without adding them to your tailnet. Tailscale Funnel does that, and it's less of a one liner than it looks.

Two things have to be true first. Your tailnet policy needs the `funnel` node attribute, which for a tagged container node you will be adding by hand:

```json
"nodeAttrs": [
  {
    "target": ["tag:container"],
    "attr": ["funnel"]
  }
]
```

Then flip the switch in `serve.json` and restart the sidecar, which is the durable way to do it since `TS_SERVE_CONFIG` reapplies that file every time the container starts:

```json
  "AllowFunnel": {
    "${TS_CERT_DOMAIN}:443": true
  }
```

Funnel only works on ports 443, 8443, and 10000, so 443 is the one you want anyway.

The node attribute is not optional, and skipping it is the worst kind of failure. I flipped `AllowFunnel` to `true` without it and everything told me it had worked. `tailscale funnel status` printed `Funnel on` with the URL under it, `tailscale serve status` agreed, and the logs said nothing at all. The name simply never appeared in public DNS, so from outside the tailnet it did not resolve, let alone serve. The node did not have the capability and no part of the tooling mentioned it.

If you turn Funnel on, verify it from something that is not on your tailnet. A phone with WiFi off is enough:

```bash
dig +short @1.1.1.1 forgejo.tail1234.ts.net
```

An empty answer means Funnel is not really on, whatever the CLI told you.

Once it's on, you have inherited every problem this post was avoiding. Registration lockdown and rate limiting become your concern again. It's a good escape hatch and a bad default. Set it back to `false` when you're done.

The honest limitation: if the people you collaborate with will not join your tailnet, this setup is not for you. Tailnet only means tailnet only. Everyone who touches these repos needs Tailscale on their machine and a place in your ACLs. For a solo developer or a small team that already uses Tailscale, that cost is zero. For an open source project taking drive by contributions, it's a wall.

## Gotchas I hit

**No state volume, so every restart mints a new node.** This is the big one, and I watched it happen. If `TS_STATE_DIR` has no volume behind it, the container loses its identity, registers again as a fresh device, and Tailscale appends a suffix to keep the name unique. Mine came back as `forgejo-1` on a new address while the old `forgejo` sat there marked offline.

What makes it nasty is how healthy the result looks. The new node got its own certificate within seconds and served Forgejo on 443 without complaint. But `ROOT_URL` and `SSH_DOMAIN` live in `app.ini` inside the data volume, so they still held the old name, and the API cheerfully handed out clone URLs pointing at a node nothing is listening on. The server is fine. Every clone command it gives your users times out. Persist `/var/lib/tailscale`.

**What losing that state does to you depends on your auth key.** With a reusable key you get the duplicate node above. With a single use key the container cannot register at all, fails with `invalid key: API key ... not valid`, and never comes up. Two completely different mornings from the same missing volume.

**Auth failures loop instead of stopping.** Every registration failure I hit, whether a tag the policy did not allow or a spent key, left the container restarting rather than exiting. With `restart: unless-stopped` that continues forever. `docker compose ps` shows `restarting`, not an error, so if you run `up -d` and walk away you come back to something that has been failing quietly for however long you were gone. The reason is only ever in `docker compose logs`.

**An untagged node drops off at six months, not three.** The auth key expiring at 90 days is the number everyone quotes, but that only blocks new registrations. The node itself runs until its node key hits the 180 day default, which is a much worse way to find out, because by then you've forgotten the setup entirely. Tag the device and key expiry is off.

**The tag has to exist before you advertise it.** `tag:container` is my example name, not a default. If it is not in `tagOwners` in your policy the node refuses to join with `requested tags [tag:container] are invalid or not permitted`, which is at least an honest error. Use whatever tag your tailnet already has if you have one.

**Tailscale SSH swallows Git over SSH.** If you add `--ssh` to `TS_EXTRA_ARGS`, tailscaled intercepts inbound tailnet connections to port 22 before they ever reach the SSH server in the container. There's no bind conflict and nothing looks broken in the logs. Your clones just stop working. Leave Tailscale SSH off on this node and use it on your other machines.

**Restarting the sidecar takes Forgejo's network with it.** Because Forgejo borrows the sidecar's namespace, `docker compose restart ts-forgejo` leaves Forgejo running with a network stack that has moved out from under it. Restart both together when you touch the Tailscale container.

**`ROOT_URL` left over from an earlier attempt.** If you tried this once with a different hostname, changing the environment variable is not always enough, because the installer wrote the old value into `app.ini` and that file lives in the volume. Check `/data/gitea/conf/app.ini` and fix it there, or start from a clean volume.

## Quick reference

| Setting | What it controls | What breaks without it |
| --- | --- | --- |
| `network_mode: service:ts-forgejo` | Puts Forgejo in the sidecar's network namespace | Forgejo is not on the tailnet at all |
| `TS_USERSPACE=false` | Kernel networking instead of userspace | The TUN device and `net_admin` do nothing |
| `hostname` on the sidecar | The node name, and so the URL | Random or wrong `ts.net` name |
| `TS_STATE_DIR` plus a volume | Node identity across restarts | New device on every restart, name drifts |
| `TS_EXTRA_ARGS=--advertise-tags` | Marks the node as tailnet owned | Node key expires at 180 days, node drops off |
| `TS_SERVE_CONFIG` | HTTPS and the proxy to port 3000 | No TLS, nothing served on 443 |
| `FORGEJO__server__ROOT_URL` | Clone URLs, emails, webhooks | Everything points somewhere wrong |
| `FORGEJO__server__SSH_DOMAIN` | The SSH clone URL shown in the UI | Copy button hands out a command that times out |
| no `START_SSH_SERVER` | Lets the image's own sshd own port 22 | Two SSH servers want the same port |

Useful commands:

```bash
docker compose logs -f ts-forgejo                      # node registration and cert issuance
docker compose exec ts-forgejo tailscale status        # is it on the tailnet
docker compose exec ts-forgejo tailscale serve status   # what is being served on 443

# backup, written somewhere writable and then copied out
docker compose exec -u 1000 -w /tmp forgejo \
  forgejo dump -c /data/gitea/conf/app.ini

# the archive is named forgejo-dump-<timestamp>.zip, so read the name back
DUMP=$(docker compose exec -T forgejo sh -c 'ls -1 /tmp/forgejo-dump-*.zip | tail -1')
docker compose cp "forgejo:${DUMP%$'\r'}" ./
```

That timestamp is the part that bites. `forgejo dump` prints the filename it wrote and then you are on your own, so a copy command with a fixed name in it fails every time and you find out when you need the backup.

What this setup removes is most of the recurring maintenance. There's no certificate renewal to monitor, and no port forward on the router for someone to find in a scan.

Back it up anyway. `forgejo dump` writes a single archive with the repos, the database, and the config, and an untested backup is a rumour.

`[ tailnet up · no ports open ]`
