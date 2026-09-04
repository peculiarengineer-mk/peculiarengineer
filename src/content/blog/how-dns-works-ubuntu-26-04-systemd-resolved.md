---
title: 'How DNS actually works on Ubuntu 26.04'
description: 'Follow one lookup from ping to the upstream server on a real 26.04 box: the stub at 127.0.0.53, both resolv.conf files, split DNS, and how people break it.'
pubDate: 'Sep 3 2026'
heroImage: '../../assets/dns-resolved-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'DNS', 'systemd', 'Networking', 'Linux', 'Server', 'SysAdmin', 'Tutorial']
---

For years my understanding of DNS on a Linux box was one file. `/etc/resolv.conf` has a `nameserver` line, that is where lookups go, done. Then at some point I opened it on an Ubuntu server and it said `nameserver 127.0.0.53`, which is a DNS server I never installed, running on an address I never configured, and I closed the file and got on with my day.

I have since written a [Netplan post](/blog/set-static-ip-ubuntu-26-04-netplan/) and [three Tailscale posts](/blog/install-tailscale-ubuntu-26-04/) that each wave at that address for a paragraph and move on. This is me finally sitting down to understand it. I took a fresh Ubuntu 26.04 server and followed one name lookup from the application all the way down to the server that answered, and then broke it in the ways I have seen it broken. Everything below is what the box printed.

> **TL;DR.** Two layers. First the C library reads `/etc/nsswitch.conf`, which says `hosts: files dns`: check `/etc/hosts`, then ask DNS. "Ask DNS" means the `nameserver` in `/etc/resolv.conf`, which is a symlink to a file systemd-resolved writes, and it says `127.0.0.53`. That is systemd-resolved itself, a local caching resolver, and it forwards to the real upstream servers it learned per network interface from DHCP or Netplan. `resolvectl status` shows those servers, `resolvectl query` shows which one answered and whether it came from cache. `dig` skips the first layer and talks to the stub directly, which is why `dig` and `ping` can disagree. Change upstreams in Netplan, not by editing resolv.conf, which systemd-resolved rewrites. Split DNS is one server per domain per interface, and it is how Tailscale's MagicDNS works.

## Contents

- [The one idea worth holding onto](#the-one-idea-worth-holding-onto)
- [1. Start where the applications start](#1-start-where-the-applications-start)
- [2. resolv.conf is a symlink, and there are two of them](#2-resolvconf-is-a-symlink-and-there-are-two-of-them)
- [3. Who is 127.0.0.53](#3-who-is-1270053)
- [4. Watch a lookup happen](#4-watch-a-lookup-happen)
- [5. Why dig and ping disagree](#5-why-dig-and-ping-disagree)
- [6. Changing the upstream, and what survives a reboot](#6-changing-the-upstream-and-what-survives-a-reboot)
- [7. Split DNS: a different server for one domain](#7-split-dns-a-different-server-for-one-domain)
- [8. Search domains and single labels](#8-search-domains-and-single-labels)
- [9. DNS over TLS, and the setting that takes the box offline](#9-dns-over-tls-and-the-setting-that-takes-the-box-offline)
- [10. Three ways it gets broken](#10-three-ways-it-gets-broken)
- [11. Debugging it](#11-debugging-it)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## The one idea worth holding onto

There are two layers, and most confusion about DNS on Linux comes from not knowing which one you are looking at.

The first layer is not DNS at all. It is the C library's name lookup, the code linked into every program on the box that turns a name into an address, and it consults a list of sources in order. On Ubuntu that list is `/etc/hosts` first, then DNS. Every normal program, `ping`, `curl`, `ssh`, your Python script, goes through this layer, and a name that `/etc/hosts` answers never becomes a DNS query.

The second layer is the resolver. On Ubuntu 26.04 that is systemd-resolved, listening on `127.0.0.53`. It caches, it knows which upstream servers belong to which network interface, and it forwards your question to the right one. `dig`, `host` and `nslookup` skip the first layer entirely and talk to this one.

Hold onto that and the rest is detail. When something resolves in the browser but not in `dig`, or in `dig` but not in `ping`, the two layers disagree, and Section 5 is about exactly that.

Everything below was run as root on Ubuntu 26.04.1 with systemd 259. The box is a Hetzner server, which matters only because it ends up with four DNS servers from two different sources, and that turns out to be one too many for one of the files.

## 1. Start where the applications start

```bash
grep '^hosts:' /etc/nsswitch.conf
```

```text
hosts:          files dns
```

That is the entire first layer on a 26.04 server. `files` is `/etc/hosts`. `dns` is the resolver library, which reads `/etc/resolv.conf`. Desktop installs usually carry an extra `mdns4_minimal` entry in there for `.local` names. The server image does not.

The tool for asking this layer a question directly, without a network round trip you did not ask for, is `getent`:

```bash
getent hosts example.com
```

```text
2606:4700:10::6814:179a example.com
2606:4700:10::ac42:93f3 example.com
```

`getent hosts` does exactly what `ping` does to turn a name into an address, and nothing else. When a program cannot resolve a name, this is the first command to run, because it answers "is it the program or is it the box".

## 2. resolv.conf is a symlink, and there are two of them

```bash
ls -la /etc/resolv.conf
grep -v '^#' /etc/resolv.conf
```

```text
lrwxrwxrwx 1 root root 39 Apr 20 18:07 /etc/resolv.conf -> ../run/systemd/resolve/stub-resolv.conf
nameserver 127.0.0.53
options edns0 trust-ad
search .
```

So `/etc/resolv.conf` is not a file you own. It points at a file systemd-resolved regenerates, and that file names one server: the stub on `127.0.0.53`. A stub resolver is one that owns no DNS data of its own. It takes questions from local programs and forwards them to servers that do. The `options` line turns on EDNS0, the extension that lets answers be bigger than the original 512 byte limit, and `trust-ad`, which lets the library trust a DNSSEC flag the stub sets. Both can stay unread until Section 11. The comment block at the top of it, which I cut here, says all of this in so many words, and ends with the line that matters: run `resolvectl status` to see the real upstream servers.

There is a second generated file next to it, and knowing it exists solves a whole category of problems later:

```bash
grep -v '^#' /run/systemd/resolve/resolv.conf
```

```text
nameserver 2a01:4ff:ff00::add:2
nameserver 2a01:4ff:ff00::add:1
nameserver 185.12.64.1
# Too many DNS servers configured, the following entries may be ignored.
nameserver 185.12.64.2
search .
```

Same format, but listing the actual upstream servers instead of the stub. This is the file you point at when a program cannot use `127.0.0.53`, and Docker is the usual example, in Section 10. That warning comment is real and worth knowing about: the classic C library resolver only reads the first three `nameserver` lines, so systemd-resolved writes the fourth one with a note that it will probably be ignored. The stub has no such limit, which is one small reason to leave the symlink pointing where it is.

## 3. Who is 127.0.0.53

```bash
ss -ulnp | grep ':53 '
```

```text
UNCONN 0 0    127.0.0.54:53     0.0.0.0:*  users:(("systemd-resolve",pid=485,fd=18))
UNCONN 0 0 127.0.0.53%lo:53     0.0.0.0:*  users:(("systemd-resolve",pid=485,fd=16))
```

systemd-resolved, bound to loopback only, so nothing outside the box can ask it anything. It also listens on `127.0.0.54`, which the documentation describes as a second stub with different forwarding rules. Nothing in `resolv.conf` points at it and I did not test it. `.53` is the one this post is about.

Now the command the comment told you to run:

```bash
resolvectl status
```

```text
Global
         Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported
  resolv.conf mode: stub

Link 2 (eth0)
    Current Scopes: DNS
         Protocols: +DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported
Current DNS Server: 2a01:4ff:ff00::add:2
       DNS Servers: 2a01:4ff:ff00::add:2 2a01:4ff:ff00::add:1 185.12.64.1
                    185.12.64.2
     Default Route: yes
```

Read it top to bottom. `Global` is settings that apply everywhere, and on a fresh box there is nothing in it except a list of protocols that are all switched off, which is the correct default for a server. Then one block per network interface. `eth0` knows four servers, is currently using the first, and has `Default Route: yes`, meaning any name that no other interface claims goes here. Section 7 is about interfaces that claim names.

Where did those four servers come from? Not from a file you edited. The two IPv4 addresses arrived with the DHCPv4 lease, and the cloud image's Netplan file supplies the IPv6 pair statically:

```bash
grep -A3 nameservers /etc/netplan/50-cloud-init.yaml
```

```yaml
      nameservers:
        addresses:
        - 2a01:4ff:ff00::add:2
        - 2a01:4ff:ff00::add:1
```

That is the shape to remember. Per interface, DNS servers come in from whatever configured the interface, DHCP or Netplan, systemd-networkd hands them to systemd-resolved, and systemd-resolved writes the two `resolv.conf` files to match. You never edit the files. You edit what feeds them.

## 4. Watch a lookup happen

`resolvectl query` asks the stub the same way an application would, and then tells you what it did:

```bash
resolvectl flush-caches
resolvectl query example.com
```

```text
example.com: 2606:4700:10::ac42:93f3                        -- link: eth0
             2606:4700:10::6814:179a                        -- link: eth0
             104.20.23.154                                  -- link: eth0
             172.66.147.243                                 -- link: eth0

-- Information acquired via protocol DNS in 5.9ms.
-- Data is authenticated: no; Data was acquired via local or encrypted transport: no
-- Data from: network
```

Which interface it went out of, how long it took, and where the answer came from. Ask again:

```text
-- Information acquired via protocol DNS in 1.0ms.
-- Data from: cache
```

That cache is the main practical thing the stub gives you over a bare `resolv.conf` pointing at a remote server. Every repeated lookup on the box, and a busy box does thousands, is answered locally. You can see what is in it:

```bash
resolvectl show-cache
```

```text
Scope protocol=dns ifindex=2 ifname=eth0 DNSSEC=no DNSOverTLS=no
example.com IN A 172.66.147.243
example.com IN A 104.20.23.154
example.com IN AAAA 2606:4700:10::6814:179a
example.com IN AAAA 2606:4700:10::ac42:93f3
```

and how it is doing overall with `resolvectl statistics`, which counts transactions, cache hits and misses, and timeouts. Mine showed 10 hits to 30 misses a few minutes into a fresh boot, which is what you expect before the cache warms up.

The tool I wish I had known about earlier is `resolvectl monitor`. It prints every question the stub receives and every answer it gives, live. Leave it running in one terminal and do anything in another:

```text
→ Q: peculiarengineer.com IN AAAA
← S: success
← A: peculiarengineer.com IN AAAA 2606:4700:3031::6815:467a
← A: peculiarengineer.com IN AAAA 2606:4700:3036::ac43:df66
```

When you are not sure whether a program is even asking DNS, or what name it is asking for, this answers it in one line.

`dig` is the same lookup seen from the other side. It reads `resolv.conf`, so by default it asks the stub too, and it shows you the raw answer including the TTL, the lifetime in seconds the upstream stamped on the answer, counting down as the cache ages:

```bash
dig example.com +noall +answer
```

```text
example.com.		155	IN	A	104.20.23.154
```

`dig @1.1.1.1 example.com` skips the stub and asks a server of your choosing, which is how you find out whether a wrong answer is coming from your box or from upstream. `dig` is preinstalled on 26.04 server, which it was not always.

## 5. Why dig and ping disagree

Put a name in `/etc/hosts` and ask each layer about it:

```bash
echo "10.99.99.9 mybox" >> /etc/hosts
getent hosts mybox
dig mybox +noall +answer
resolvectl query mybox
```

```text
10.99.99.9      mybox
mybox.			0	IN	A	10.99.99.9
mybox: 10.99.99.9
-- Data from: synthetic
```

I expected `dig` to fail here, because `dig` skips `/etc/hosts`. It did not, because on Ubuntu the stub it asks is systemd-resolved, and systemd-resolved reads `/etc/hosts` itself and serves those entries with a TTL of zero. `resolvectl` is honest about it: `Data from: synthetic`, meaning the resolver made the answer up from local knowledge and never sent a packet. So on 26.04 the two layers agree about `/etc/hosts`. The disagreement is elsewhere.

Ask for a `.local` name:

```bash
resolvectl query printer.local
```

```text
printer.local: resolve call failed: No appropriate name servers or networks for name found
```

`.local` is reserved for multicast DNS, and mDNS is off on a server (`-mDNS` in the status output). systemd-resolved refuses to send a `.local` name to a real DNS server, by design, so it fails instantly with that message. A desktop with `mdns4_minimal` in `nsswitch.conf` would have answered from the first layer without DNS being involved, which is why the printer resolves on your laptop and not on the server.

And the box's own name:

```bash
getent hosts "$(hostname)"
```

```text
127.0.1.1       dns-post dns-post
```

That is an `/etc/hosts` line the installer wrote, pointing the hostname at `127.0.1.1`, the second loopback address. It is why `ping $(hostname)` works on a box with no DNS at all, and why a service that binds to "the hostname" sometimes ends up listening only on loopback.

## 6. Changing the upstream, and what survives a reboot

There are two ways, and the difference is what happens tomorrow.

The quick way is `resolvectl`, and it takes effect immediately:

```bash
resolvectl dns eth0 1.1.1.1 9.9.9.9
resolvectl dns eth0
```

```text
Link 2 (eth0): 1.1.1.1 9.9.9.9
```

I wanted to know exactly how temporary that is, so I tried to knock it out. `netplan apply` did not touch it. `networkctl reconfigure eth0` did not touch it either, which surprised me. A reboot did: the box came back with Hetzner's four servers and no memory of mine. So a `resolvectl dns` change lasts until the next boot, and no less, which makes it fine for "try this server for an hour" and wrong for anything else.

The permanent way is Netplan. Add a file, and let it feed the chain from the top:

```yaml
# /etc/netplan/60-dns.yaml
network:
  version: 2
  ethernets:
    eth0:
      nameservers:
        addresses: [1.1.1.1, 9.9.9.9]
```

```bash
chmod 600 /etc/netplan/60-dns.yaml
netplan apply
resolvectl status eth0 | grep -i 'DNS Server'
```

```text
Current DNS Server: 1.1.1.1
       DNS Servers: 1.1.1.1 9.9.9.9
```

And now look at the two files from Section 2. `/etc/resolv.conf` still says `nameserver 127.0.0.53`, unchanged, because the stub did not move. `/run/systemd/resolve/resolv.conf` now lists `1.1.1.1` and `9.9.9.9`, because the upstreams did. That is the whole model working as intended: you changed the input, both outputs followed, and no program on the box noticed anything.

Netplan merges every file in `/etc/netplan/` by filename order, so a `60-` file layers over the cloud image's `50-cloud-init.yaml` without you editing a file that cloud-init might regenerate. Note what the merge did to the list, though. eth0 went from four servers to exactly two, so the `nameservers` list is replaced, not appended, and the IPv6 pair from the cloud image is gone. If you want them, put them in your file too. The Netplan post goes into that ordering.

## 7. Split DNS: a different server for one domain

This is the part that made the design click for me, because it is the thing a single `resolv.conf` fundamentally cannot do.

The situation: your normal DNS is fine for the internet, but names under `corp.example` only exist on a private server. In the old world you either pointed the whole box at the private server and hoped it forwarded everything else, or you gave up. With per interface servers and routing domains, you attach the private server to an interface and tell systemd-resolved which names belong to it. A routing domain is written with a leading `~`: `~corp.example` means "send questions about this domain to this interface's servers", and `~.` means "send everything else here", which is what `Default Route: yes` in Section 3 was showing you.

To try it without a corporate network I ran a tiny DNS server on the box that invents answers for one domain. dnsmasq will do that in four lines of config. Installing it produced the first lesson for free:

```text
dnsmasq: failed to create listening socket for port 53: Address already in use
```

The stub already has port 53 on loopback, and dnsmasq's default is to bind everything. Pin it to a different loopback address and give it the fake zone:

```ini
# /etc/dnsmasq.d/corp.conf
listen-address=127.0.0.2
bind-interfaces
port=53
no-resolv
address=/corp.example/10.7.7.7
address=/git.corp.example/10.7.7.10
```

Then an interface to hang it on. A dummy interface is fine for the demonstration, a VPN interface is what you would have in real life:

```bash
ip link add corp0 type dummy && ip link set corp0 up
ip addr add 10.7.7.1/24 dev corp0
resolvectl dns corp0 127.0.0.2
resolvectl domain corp0 '~corp.example'
resolvectl status corp0
```

```text
Link 3 (corp0)
    Current Scopes: DNS
         Protocols: -DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported
       DNS Servers: 127.0.0.2
        DNS Domain: ~corp.example
     Default Route: no
```

`Default Route: no`. This interface's server only ever sees names under `corp.example`. Now query one of each:

```bash
resolvectl query git.corp.example
resolvectl query example.com
```

```text
git.corp.example: 10.7.7.10
-- Information acquired via protocol DNS in 3.1ms.

example.com: 104.20.23.154 ...                              -- link: eth0
-- Information acquired via protocol DNS in 18.1ms.
```

The private name went to `127.0.0.2` on `corp0`. The public name went out `eth0` as before. Neither server saw the other's traffic. And `/etc/resolv.conf` still says `nameserver 127.0.0.53` and nothing else, so every program on the box gets this behaviour without knowing it exists. `dig git.corp.example` returns `10.7.7.10` too, through the stub.

```bash
resolvectl domain
```

```text
Link 2 (eth0): ~.
Link 3 (corp0): ~corp.example
```

That two line table is the routing policy for every name on the machine. If you have ever run `resolvectl status` on a box with Tailscale and wondered what the `tailscale0` block with its own DNS server and a `~` domain was for, this is it. MagicDNS is exactly this shape: Tailscale attaches its resolver to its interface, claims the tailnet's domain, and leaves `~.` alone.

## 8. Search domains and single labels

A search domain is what turns `git` into `git.corp.example` so you can type the short name. It is per interface, like everything else here, and it is wired into both layers. Using the `corp0` interface from Section 7, with the domain written without the `~` this time:

```bash
resolvectl domain corp0 corp.example
grep '^search' /etc/resolv.conf
getent hosts git
resolvectl query git
```

```text
search corp.example
10.7.7.10       git.corp.example
git: 10.7.7.10
     (git.corp.example)
```

systemd-resolved wrote the domain into the `search` line of `resolv.conf`, so the C library appends it, and it also applies it itself when asked directly, which is why `resolvectl query git` shows the name it actually looked up in brackets. `dig` needs to be told: `dig +search git` works, plain `dig git` gets `status: REFUSED` from the stub.

That refusal is deliberate and it will bite you once. systemd-resolved does not send single label names, a bare `git` or `mybox` with no dots, to a DNS server at all unless a search domain completes them. Without one you get:

```text
mybox: resolve call failed: No appropriate name servers or networks for name found
```

The setting behind it is `ResolveUnicastSingleLabel=no` in `resolved.conf`, and the default is right: a single label leaking to the internet is how a typo becomes a query to somebody else's server.

The `~` form from Section 7 is the other kind. `~corp.example` routes queries for the domain to this interface's servers and nothing more: it does not complete short names. Drop the `~` and you get both routing and completion, which is what this section just used.

## 9. DNS over TLS, and the setting that takes the box offline

Everything so far went over plain UDP. systemd-resolved can encrypt the leg to the upstream, and the configuration lives in a drop-in, a small file under `resolved.conf.d` that overrides the main `resolved.conf` without editing it:

```ini
# /etc/systemd/resolved.conf.d/dot.conf
[Resolve]
DNS=1.1.1.1#cloudflare-dns.com 1.0.0.1#cloudflare-dns.com
DNSOverTLS=yes
```

```bash
systemctl restart systemd-resolved
resolvectl query example.com | tail -2
ss -tnp | grep ':853'
```

```text
-- Data is authenticated: no; Data was acquired via local or encrypted transport: yes
ESTAB 0 0 178.105.172.189:53968 1.1.1.1:853 users:(("systemd-resolve",pid=2934,fd=24))
```

An open TLS connection to port 853, and `resolvectl` reports the encrypted transport. The `#hostname` after each address is the certificate name to verify, and you want it there.

Here is the trap, and I walked into it on purpose. `DNSOverTLS=yes` is strict mode, and it applies to every server on every interface, including the ones DHCP handed you. I removed the `DNS=` line so the only servers left were Hetzner's, which do not speak TLS, and asked for a name:

```text
(nothing. the twenty second timeout I had wrapped it in gave up, exit 124)
```

DNS on the box was simply gone. `resolvectl status eth0` showed `+DNSOverTLS` against servers that would never answer on 853. So strict mode is only correct when you have also set the upstreams to servers you know support it, in the same drop-in. `DNSOverTLS=opportunistic` is the softer setting, it tries TLS and falls back to plain, and against the same Hetzner servers it worked immediately, unencrypted, with no connection to 853 at all. Opportunistic is honest about what it gives you, which is not much. Either set strict with known servers, or leave it off.

## 10. Three ways it gets broken

**Someone replaces the symlink.** The most common one, usually from a guide written for a distribution without systemd-resolved, or a VPN client from years ago. I did it the way they do it:

```bash
cp --remove-destination /run/systemd/resolve/resolv.conf /etc/resolv.conf
```

Now `/etc/resolv.conf` is a regular file listing the upstreams directly. Everything still resolves, so nobody notices. What you lost: `resolvectl statistics` shows a cache size of zero and stays there, `resolvectl monitor` sees nothing when programs look names up, split DNS and search domains stop applying to anything except `resolvectl` itself, and the next DHCP change never reaches the file. Put it back:

```bash
ln -sf ../run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
```

**Docker containers.** A container cannot use `127.0.0.53`, because inside the container loopback is the container's own. So Docker does not copy `/etc/resolv.conf`; it copies the other file, the one with the real upstreams:

```bash
docker run --rm alpine:3.20 cat /etc/resolv.conf
```

```text
nameserver 1.1.1.1
nameserver 9.9.9.9
search .
```

Those are the servers from Section 6, taken from `/run/systemd/resolve/resolv.conf`, with no cache and no split DNS. On a user defined network Docker instead gives the container `nameserver 127.0.0.11`, its own embedded resolver, which forwards to the same upstreams and adds container name resolution on top. Either way, a private name that resolves on the host through a routing domain will not resolve inside a container unless you pass `--dns` or configure the daemon.

**Something else wants port 53.** dnsmasq did it in Section 7, Pi-hole does it, so does any local DNS server installed with defaults. The failure is `Address already in use` and the service does not start. Either bind the new server somewhere other than `127.0.0.53`, as I did, or if the new server is meant to replace the stub entirely, stop and disable systemd-resolved and manage `resolv.conf` yourself. Do one or the other. Running both on the same address is not a state the box can be in.

## 11. Debugging it

The commands, in the order I now reach for them:

```bash
getent hosts NAME
resolvectl query NAME
resolvectl status
resolvectl monitor
dig @UPSTREAM NAME
```

`getent` for what a program sees, `query` for which link and source answered, `status` for who owns the default route, `monitor` when you are not sure a program is asking at all, and `dig` at an upstream to take the box out of the picture.

When those do not explain it, turn the resolver's own logging up for a minute:

```bash
resolvectl log-level debug
resolvectl query example.com >/dev/null
journalctl -u systemd-resolved --since -1min | grep example.com
resolvectl log-level info
```

```text
Cache miss for example.com IN AAAA
Firing regular transaction 19300 for <example.com IN AAAA> scope dns on eth0/* (validate=yes).
Cache miss for example.com IN A
```

That tells you the exact scope and interface a query was sent on, which is the question split DNS problems come down to. And `resolvectl show-server-state` shows what the resolver has learned about each upstream, such as whether it supports EDNS0 and how many UDP and TCP attempts have failed against it. A server with `Failed UDP attempts` climbing is a server on the way out, and `resolvectl reset-server-features` makes systemd-resolved forget and re-probe.

A name that does not exist looks like this, and exits 1, which is useful in scripts:

```text
does-not-exist.peculiarengineer.com: Name 'does-not-exist.peculiarengineer.com' not found
```

## Gotchas worth knowing

**`/etc/resolv.conf` is output, not input.** Edit what feeds it: Netplan for permanent, `resolvectl dns` for the rest of today. If it is a regular file instead of a symlink, somebody broke it, and `ln -sf ../run/systemd/resolve/stub-resolv.conf /etc/resolv.conf` fixes it.

**A `resolvectl dns` change survives `netplan apply` and `networkctl reconfigure` and dies at reboot.** Longer lived than I assumed and shorter than you need.

**Four DHCP servers is one too many for the classic resolver.** Only the stub reads all four. Anything reading `/run/systemd/resolve/resolv.conf` directly, Docker included, ignores the fourth, and the file says so in a comment.

**Single label names never leave the box.** No search domain, no query. The error is `No appropriate name servers or networks for name found`, and it is not a network problem.

**`.local` fails on a server on purpose.** mDNS is off and systemd-resolved will not send `.local` to unicast DNS. Turn on mDNS or use a real name.

**`DNSOverTLS=yes` with DHCP servers is an outage.** Strict mode applies to every server on every link. Set `DNS=` to known TLS servers in the same drop-in, or use `opportunistic` and accept that it will mostly be plaintext.

**`dig` sees `/etc/hosts` on Ubuntu.** Because the stub it talks to reads the file. `Data from: synthetic` in `resolvectl query` is how you tell.

**Docker gets the upstreams, not the stub.** No cache, no split DNS, no search domains inside containers unless you configure them. Private names that work on the host will not work in a container by default.

**Port 53 is taken.** By the stub, on `127.0.0.53` and `127.0.0.54`. A local DNS server has to bind elsewhere or replace systemd-resolved outright.

## Quick reference

| Task | Command |
| --- | --- |
| Resolve a name the way programs do | `getent hosts NAME` |
| Resolve with details: link, cache, timing | `resolvectl query NAME` |
| Servers and routing per interface | `resolvectl status` |
| Just the servers | `resolvectl dns` |
| Just the domains | `resolvectl domain` |
| Watch every query live | `resolvectl monitor` |
| What is cached | `resolvectl show-cache` |
| Hit and miss counts | `resolvectl statistics` |
| Empty the cache | `resolvectl flush-caches` |
| Change servers until reboot | `resolvectl dns eth0 1.1.1.1 9.9.9.9` |
| Change servers permanently | `nameservers:` in a `/etc/netplan/*.yaml`, then `netplan apply` |
| Add a search domain until reboot | `resolvectl domain eth0 corp.example` |
| Route one domain to one link | `resolvectl domain IFACE '~corp.example'` plus `resolvectl dns IFACE SERVER` |
| Ask an upstream directly | `dig @1.1.1.1 NAME` |
| Per upstream health | `resolvectl show-server-state` |
| Verbose resolver log | `resolvectl log-level debug`, then `journalctl -u systemd-resolved -f` |
| Restore the symlink | `ln -sf ../run/systemd/resolve/stub-resolv.conf /etc/resolv.conf` |
| The upstream list for things that cannot use the stub | `/run/systemd/resolve/resolv.conf` |

The next time `/etc/resolv.conf` says `127.0.0.53`, that is not a mystery, it is a table of contents. `resolvectl status` is the book. `[ 127.0.0.53 ✓ ]`
