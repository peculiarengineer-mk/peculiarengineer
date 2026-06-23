---
title: 'Squid in Both Directions: Forward and Reverse Proxy'
description: 'Squid is best known as a forward proxy, but it also runs as a reverse proxy in accelerator mode. One daemon, one config file, two jobs pointing opposite ways. The mental model, a working config for each, and the deny-all trap that 403s every first attempt.'
pubDate: 'Jun 22 2026'
heroImage: '../../assets/squid-proxy-hero.png'
tags: ['Squid', 'Proxy', 'ReverseProxy', 'Caching', 'Linux', 'Networking', 'SysAdmin', 'SelfHosted']
---

Squid has a reputation problem. Mention it and most people picture a forward proxy, the thing your old corporate network used to filter web traffic and make the internet feel slower. That reputation is half right. Squid is primarily a forward proxy and it is very good at it. But it also runs as a reverse proxy (Squid calls this "accelerator mode"), sitting in front of a web server and caching content for visitors.

This post walks through both, because understanding the difference is most of the battle. Same daemon, same config file, two jobs that point in opposite directions.

> **TL;DR** A forward proxy sits in front of clients; a reverse proxy sits in front of servers. The `accel` keyword on the `http_port` line is the switch between them. Whichever mode you run, the `http_access deny all` backstop has to come first, and in accel mode your rules have to sit above Ubuntu's shipped defaults or you get a 403.

## The mental model

The two modes differ by whose side of the conversation Squid is on.

A **forward proxy** sits in front of clients. Your laptop, your phone, the office fleet, they all route their outbound requests through Squid, which fetches pages on their behalf. The clients know they are using a proxy; the websites do not. This is for controlling, filtering, or caching traffic leaving a network.

A **reverse proxy** sits in front of servers. Visitors hit Squid thinking it is the website, and Squid fetches from the real origin server behind it, caching the responses. The clients have no idea a proxy exists; the origin server does. This is for offloading and accelerating traffic arriving at your service.

Hold onto that, "in front of clients" versus "in front of servers," and the configs below stop looking arbitrary.

## Installing Squid

Same package either way. On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install squid
```

The main config lives at `/etc/squid/squid.conf`. The stock file is enormous, mostly comments documenting every directive, so a good first move is to keep the original as a reference:

```bash
sudo cp /etc/squid/squid.conf /etc/squid/squid.conf.original
```

After a change, reload and watch the logs:

```bash
sudo systemctl reload squid
sudo tail -f /var/log/squid/access.log
```

One thing that will save you a phantom debugging session: `reload` (which runs `squid -k reconfigure`) handles ordinary config edits, but it does not cover everything. Changing the listening port, the very `http_port` lines you are about to edit, or the cache layout needs a full `sudo systemctl restart squid`. When in doubt on a port change, restart.

## Mode 1: Forward proxy

The classic setup. Listen on the default port, allow your own network, deny everyone else. An open forward proxy is a gift to abusers, so the access rules matter more than anything.

Define which network is allowed and wire up the rules in `/etc/squid/squid.conf`:

```
# Listen for client requests
http_port 3128

# Define your local network (adjust to your subnet)
acl localnet src 192.168.1.0/24

# Allow the local network, deny everything else
http_access allow localnet
http_access deny all
```

The ordering of `http_access` lines is the whole game. Squid reads them top to bottom and stops at the first match. The `deny all` at the bottom is your backstop: anything not explicitly allowed above it gets refused. Get this wrong and you have published an open proxy to the internet, so the `deny all` is non-negotiable.

Point a client at it by setting its HTTP/HTTPS proxy to your Squid host on port 3128, and outbound requests now flow through Squid. You will see them appear in `access.log` in real time, which is half the reason people run a forward proxy in the first place: visibility into what is leaving the network.

One honest caveat. With modern HTTPS everywhere, a plain forward proxy sees which sites are visited (it gets the `CONNECT` target) but not the encrypted contents. Inspecting inside HTTPS means intercepting TLS with SSL bump, which means installing a trusted certificate on every client and wading into territory with real privacy and trust implications. For most people the value is the access control and the connection level logging, not content inspection, and that is fine.

## Mode 2: Reverse proxy (accelerator mode)

Now flip it around. Squid faces the public internet on port 80, pretends to be your website, and pulls content from a backend origin server, caching what it can.

```
# Face the public as if we are the web server
http_port 80 accel defaultsite=example.com no-vhost

# Define the real backend origin server
cache_peer 10.0.0.10 parent 8080 0 no-query originserver name=myorigin

# Only serve requests for our own domain
acl our_sites dstdomain example.com
http_access allow our_sites
http_access deny all

# Send matching requests to the backend, and nothing else
cache_peer_access myorigin allow our_sites
cache_peer_access myorigin deny all
```

Two things will bite you here if you are not warned, so before the line-by-line:

**Put this block at the top of `squid.conf`, above the default rules.** Ubuntu's shipped config has its own `http_access deny all` further down. If you append your accel rules to the bottom of the file, that stock deny fires first and every request comes back 403. This is the single most common reason an otherwise correct accel config "does not work."

**The `no-vhost` and the `deny all` on the peer matter.** Without `no-vhost`, Squid 3.2 and later does Host-header virtual hosting and `defaultsite` only kicks in as a fallback, which surprises you on a single-site setup. And without `cache_peer_access myorigin deny all`, the peer can be selected for requests that are not yours.

Now the rest. The `accel` keyword on `http_port` is what switches Squid from forward to reverse behavior. `cache_peer` names your real backend: a server at `10.0.0.10`, HTTP port `8080`, ICP port `0` (disabled), `no-query` to skip ICP/HTCP probes, and `originserver` so Squid treats it as the source of truth rather than another proxy. The `acl our_sites` plus `deny all` keeps Squid from being abused as an open relay for domains that are not yours, which is the reverse-proxy equivalent of the forward-proxy footgun.

With this running, visitors hitting Squid on port 80 get served from cache when possible and from the origin when not, taking load off your backend. You can confirm caching is working by watching `access.log` for `TCP_HIT` (served from cache) versus `TCP_MISS` (fetched from origin). You will also see variants like `TCP_MEM_HIT` (served from memory) and `TCP_REFRESH_UNMODIFIED` (revalidated with the origin and still fresh), which are all flavors of the same two outcomes.

## Which should you actually use?

Be honest about the job. If you want to control, filter, or log traffic leaving a network, forward proxy. If you want to cache and offload traffic arriving at a web service, reverse proxy.

But for reverse proxying specifically, Squid is not the default choice anymore, and pretending otherwise does nobody any favors. nginx, HAProxy, and Caddy are what most people reach for in front of a web server, and they handle TLS termination, modern HTTP, and load balancing more comfortably than Squid does. Squid as a reverse proxy makes the most sense when caching is the primary goal, since its caching engine is genuinely powerful and battle tested, or when you are already running Squid and want to consolidate.

Where Squid still clearly earns its keep is the forward-proxy role: outbound access control, network level caching, and traffic logging for a fleet of clients. That is the job it was built for, and there is still nothing quite like it.

## The one line to remember

One daemon, one config file, two directions, and `accel` on the `http_port` line is the switch. Whichever mode you run, the `http_access deny all` backstop is the line that keeps you off the list of misconfigured open proxies the internet loves to find. Write it first, build your allow rules above it, and in accel mode make sure the whole block sits above Ubuntu's stock defaults.
