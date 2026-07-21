---
title: 'Reverse Proxy Your Containers with Caddy and Docker Compose on Ubuntu 26.04'
description: 'Put one domain and automatic HTTPS in front of every self-hosted container with Caddy and Docker Compose on Ubuntu 26.04. The shared Docker network, why you proxy to the container name and not localhost, the port 80 ACME requirement, and the rate-limit trap that burns a real certificate while you test.'
pubDate: 'Jul 20 2026'
heroImage: '../../assets/caddy-2604-hero.png'
tags: ['Caddy', 'Docker', 'DockerCompose', 'ReverseProxy', 'HTTPS', 'Ubuntu', 'Ubuntu2604', 'Homelab', 'SelfHosted', 'Networking']
---

Once you have [Docker running on 26.04](/blog/install-docker-ubuntu-26-04/) and a couple of containers up, you hit the wall everyone hits: your apps live on a pile of random ports. Plex on `:32400`, something else on `:8080`, a dashboard on `:9000`, and none of them speak HTTPS. You want `plex.example.com` and `books.example.com` to just work, with a real certificate, without hand-rolling Nginx configs or running certbot on a cron job.

Caddy is the boring, dependable answer to that, and it is short. A hostname in a Caddyfile is all it takes for Caddy to go get a Let's Encrypt certificate, serve it on 443, and renew it forever without you thinking about it again. This is the setup I use to front my own containers, and this post is where I keep the parts that are not obvious the first time.

> **TL;DR** Run Caddy in the same Compose project as your apps, put every container on one shared Docker network, and in the Caddyfile `reverse_proxy` to the *container name and its internal port*, never `localhost`. Caddy gets HTTPS automatically as long as your domain's DNS points at the box and ports 80 and 443 are reachable. While testing, set `acme_ca` to the Let's Encrypt staging endpoint so a broken config does not burn your weekly certificate quota.

## Contents

- [Prerequisites](#prerequisites)
- [The mental model](#the-mental-model)
- [1. The Compose file](#1-the-compose-file)
- [2. The Caddyfile](#2-the-caddyfile)
- [3. The shared network is the whole trick](#3-the-shared-network-is-the-whole-trick)
- [4. How automatic HTTPS actually happens](#4-how-automatic-https-actually-happens)
- [5. Reloading without downtime](#5-reloading-without-downtime)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## Prerequisites

- Ubuntu 26.04 with Docker and the Compose plugin. If you are not there yet, start with [Install Docker on Ubuntu 26.04](/blog/install-docker-ubuntu-26-04/).
- A domain you control, with an A record (and AAAA if you have IPv6) pointing at the box's public IP.
- Ports 80 and 443 reachable from the internet: open in [UFW](/blog/ufw-firewall-basics-ubuntu/) and forwarded at your router if you are behind NAT.

## The mental model

Two ideas carry this whole setup, and if you hold them straight nothing else is confusing.

First, **Caddy and your apps have to share a Docker network so Caddy can reach them by name.** Containers on the same user-defined network get automatic DNS: a service called `whoami` is reachable at the hostname `whoami` from any other container on that network. Caddy proxies to those names. Your apps then do not need to publish any ports to the host at all, which is the point. Only Caddy is exposed, everything behind it is private.

Second, **automatic HTTPS is triggered by using a real hostname, not a port.** When the Caddyfile says `books.example.com { ... }`, Caddy registers an ACME account, proves it controls that name over port 80, installs the certificate, and serves 443. When it says `:8080 { ... }` it does not, because there is nothing to get a certificate for. The hostname is the switch.

## 1. The Compose file

Here is a complete, working stack: Caddy plus one example backend (`whoami`, a tiny container that prints request info, perfect for confirming the proxy works before you point it at anything real).

```yaml
services:
  caddy:
    image: caddy:2.9
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"        # HTTP/3
    volumes:
      - /opt/dockerapp/caddy:/etc/caddy   # mount the dir, not the file
      - caddy_data:/data                  # certificates live here, keep it
      - caddy_config:/config
    networks:
      - web

  whoami:
    image: traefik/whoami
    container_name: whoami
    restart: unless-stopped
    networks:
      - web
    # note: no `ports:` at all. Only Caddy is exposed.

networks:
  web:

volumes:
  caddy_data:
  caddy_config:
```

Two lines earn their comments. `caddy_data` is a named volume holding your certificates and ACME account key; if you delete it you throw away real Let's Encrypt certificates and have to fetch them again, which matters because of the rate limit below. And the config mount is the *directory* `/opt/dockerapp/caddy`, not the single Caddyfile. Mounting a lone file bites you when an editor replaces it on save: the container keeps pointing at the old inode and your edits appear to do nothing. Mount the folder and that problem disappears.

Create the config directory before you bring the stack up:

```bash
sudo mkdir -p /opt/dockerapp/caddy
```

## 2. The Caddyfile

Drop this at `/opt/dockerapp/caddy/Caddyfile`:

```text
{
	email you@example.com
}

whoami.example.com {
	reverse_proxy whoami:80
}
```

That is the entire config for one site. The global block at the top sets the email Let's Encrypt uses for expiry notices. The site block says "for this hostname, hand the request to the `whoami` container on port 80." Bring it up:

```bash
cd /opt/dockerapp/caddy
docker compose up -d
```

Point `whoami.example.com` at the box, wait for DNS, and load it over HTTPS. You should see the whoami output with a valid padlock and no certificate warning. Adding a second app is another three lines:

```text
books.example.com {
	reverse_proxy calibre-web:8083
}
```

The port you write is the container's *internal* port, the one the app listens on inside its own container, not any host port you might have published elsewhere. Caddy is talking to it over the Docker network, so the host port mapping is irrelevant here.

## 3. The shared network is the whole trick

This is the part that sends people to the search bar, so it gets its own section. If Caddy and the backend are not on the same Docker network, `reverse_proxy whoami:80` fails with a DNS error in the Caddy logs:

```text
dial tcp: lookup whoami on 127.0.0.11:53: no such host
```

That message means exactly what it says: Caddy asked Docker's internal DNS for `whoami` and got nothing, because from Caddy's network that name does not exist. The fix is always the same: put both services on the same network. In the Compose file above they share `web`, so it works.

The trap shows up when your apps live in a *different* Compose file (a common way to organize a homelab, one project per app). Compose names each project's default network after the project, and those networks are isolated. To let Caddy reach a container in another project, declare a shared external network and attach both sides to it. Create it once:

```bash
docker network create web
```

Then in every Compose file, Caddy's and each app's, mark that network external:

```yaml
networks:
  web:
    external: true
```

and add `- web` to each service's `networks:` list. Now they all share one bridge and Caddy can resolve every container by name across projects.

**One real exception worth knowing:** a container running with `network_mode: host` is not on any bridge network and has no Docker DNS name. My [Plex container uses host networking](/blog/plex-sabnzbd-docker-compose-hardware-transcoding/) because it needs it for discovery, so Caddy cannot reach it as `plex`. For those, proxy to the host's LAN address and the published port instead:

```text
plex.example.com {
	reverse_proxy 192.168.1.10:32400
}
```

## 4. How automatic HTTPS actually happens

Caddy's certificate magic is not magic, and knowing the steps tells you exactly what to fix when it fails. On first request for a hostname, Caddy:

1. Registers an ACME account with Let's Encrypt (once, stored in `caddy_data`).
2. Requests a certificate for the hostname.
3. Proves control by answering an HTTP-01 challenge on **port 80**, or a TLS-ALPN challenge on 443.
4. Installs the certificate and serves HTTPS on 443, redirecting HTTP to HTTPS.
5. Renews automatically around 30 days before expiry.

So the requirements are concrete: the DNS record must resolve to this box, and **port 80 must be reachable from the public internet** for the challenge. If 80 is closed at the firewall or not forwarded through your router, the challenge fails and you get no certificate, no matter how correct the Caddyfile is. Check the logs with `docker compose logs caddy` and you will see the ACME error spelled out.

If the box is LAN-only and has no public DNS, public certificates are not an option, because Let's Encrypt cannot reach it to run the challenge. Two ways out: use Caddy's built-in local CA with `tls internal` (you then trust its root on your devices), or use the DNS-01 challenge, which proves control by writing a TXT record instead of answering on port 80. DNS-01 needs a Caddy image built with your provider's DNS module, so it is a custom build, not the stock `caddy:2.9`. For a normal internet-facing box, none of that applies and the default just works.

## 5. Reloading without downtime

After editing the Caddyfile, you do not need to restart the container and drop connections. Caddy reloads its config in place:

```bash
docker exec -w /etc/caddy caddy caddy reload
```

The `-w /etc/caddy` runs the command from the config directory so Caddy finds the Caddyfile without a `--config` flag. If the new config has a syntax error, the reload is rejected and the old config keeps serving, so a typo does not take your sites down. Validate a change before reloading if you want the check without applying it:

```bash
docker exec -w /etc/caddy caddy caddy validate
```

## Gotchas I hit

**The rate limit that burns a real certificate.** Let's Encrypt allows [5 certificates per exact hostname per week](https://letsencrypt.org/docs/rate-limits/). Fight a broken config with the production endpoint and you can exhaust that quota fast, then you are locked out of new certificates for that name for days. While you are still getting things working, point Caddy at the staging CA, which issues certificates your browser will not trust but that never run out:

```text
{
	email you@example.com
	acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}
```

Your browser will warn about the staging certificate, that is expected. Once the setup is solid, delete that `acme_ca` line, reload, and Caddy fetches a real one.

**Editing the mounted single file did nothing.** This is the inode trap from earlier. I mounted `./Caddyfile:/etc/caddy/Caddyfile` directly, edited it with an editor that writes a new file and renames it over the old one, and the container went on serving the original because it still held the old inode. Mounting the directory instead of the file fixes it for good.

**Port 80 closed after I set up the firewall.** I locked the box down with UFW, opened 443, and forgot 80. Everything looked fine until the certificate came up for renewal weeks later and silently failed the HTTP-01 challenge. Open both:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Port 80 is not just for a redirect, Caddy needs it for the ACME challenge on renewal, so leaving it closed is a time bomb set for 60 days out.

## Quick reference

| Job | Command / config |
| --- | --- |
| Proxy to a container | `reverse_proxy servicename:INTERNALPORT` |
| Proxy to a host-networked app | `reverse_proxy 192.168.1.10:32400` |
| Shared network across projects | `docker network create web` + `external: true` |
| Reload config | `docker exec -w /etc/caddy caddy caddy reload` |
| Validate config | `docker exec -w /etc/caddy caddy caddy validate` |
| Staging CA while testing | `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` |
| Open the ACME ports | `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp` |
| Read the logs | `docker compose logs -f caddy` |

Put every container on one shared network, proxy to names and not `localhost`, keep port 80 open for the challenge, and test against staging so a bad afternoon does not cost you a week of certificates. Do that and Caddy turns a pile of random ports into clean hostnames with real HTTPS that renews itself while you forget it exists. That last part, forgetting it exists, is the whole reason to use it.

`[ 443 up · certs on autopilot ]`
