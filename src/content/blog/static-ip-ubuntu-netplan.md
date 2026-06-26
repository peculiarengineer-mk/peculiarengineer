---
title: 'Setting a Static IP on Ubuntu with Netplan'
description: 'Why a homelab box needs a fixed address, how Netplan turns a few lines of YAML into a working network config, finding your interface and gateway, the deprecated gateway4 trap, applying changes with netplan try so a typo cannot lock you out, and the cloud-init and renderer gotchas that waste an evening. A learning guide and a reference.'
pubDate: 'Jun 25 2026'
heroImage: '../../assets/netplan-static-ip-hero.png'
tags: ['Ubuntu', 'Linux', 'Netplan', 'Networking', 'StaticIP', 'Homelab', 'SysAdmin', 'SelfHosted']
---

The moment you start treating an Ubuntu box as a server, something you SSH into, a
thing that runs Plex or a database or just sits in the corner doing a job, you hit
the same wall: its IP address keeps changing. DHCP handed it `192.168.1.47` today
and `192.168.1.52` next week, your [SSH config](/blog/ssh-config-file-explained/)
is now wrong, your port forward points at nothing, and you are squinting at a
screen trying to find where the machine went. The fix is to give it a fixed
address, and on modern Ubuntu that means Netplan.

This is the post I wish existed the first time I fought Netplan, because the old
guides on the internet are full of syntax that Ubuntu actively removed, and
pasting them gets you an error or, worse, a box you can no longer reach. It is two
things at once: a short explanation of what Netplan actually is, so the YAML stops
feeling arbitrary, and a reference I can paste a known-good config from. Examples
are for a typical home network. The Ubuntu side is the same story on every release
since 20.04.

> **TL;DR.** Find your interface with `ip a` and gateway with `ip route`. Edit the
> file in `/etc/netplan/`, set `dhcp4: no`, an `addresses:` line in CIDR form, a
> `routes:` block with `to: default` (not the old `gateway4`), and
> `nameservers:`. Apply with `sudo netplan try` so a mistake rolls itself back
> after 120 seconds, then `sudo netplan apply` once it works.

## Contents

- [What Netplan actually is](#what-netplan-actually-is)
- [Static IP, or a DHCP reservation?](#static-ip-or-a-dhcp-reservation)
- [Find your interface, gateway, and subnet](#find-your-interface-gateway-and-subnet)
- [The config file](#the-config-file)
- [The gateway4 trap](#the-gateway4-trap)
- [Apply it without locking yourself out](#apply-it-without-locking-yourself-out)
- [Confirm it worked](#confirm-it-worked)
- [Desktop is a different renderer](#desktop-is-a-different-renderer)
- [The cloud-init surprise](#the-cloud-init-surprise)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## What Netplan actually is

Netplan is not the thing that runs your network. It is a translator. You write a
short YAML file describing what you want, and Netplan hands that description to a
back end, called the renderer, that does the actual work. On Ubuntu Server the
renderer is `systemd-networkd`. On Ubuntu Desktop it is NetworkManager, the same
thing the Wi-Fi menu in the top bar talks to. Netplan sits above both and gives
you one file format regardless of which is underneath.

That design is the whole reason the YAML can be so short. You are not configuring
an interface byte by byte; you are stating intent, "this NIC has this address,
this gateway, these DNS servers," and letting the renderer generate the messy
low-level config. It also means a single typo in indentation can change meaning
entirely, because YAML is whitespace-sensitive, which is the source of about half
the Netplan pain on the internet.

The files live in `/etc/netplan/`, they end in `.yaml`, and they are read in
alphabetical order with later files overriding earlier ones. A fresh server
usually ships one already, something like `50-cloud-init.yaml` or
`00-installer-config.yaml`. That existing file is your starting point, and where
the first gotcha hides, which I get to below.

## Static IP, or a DHCP reservation?

Before editing anything, know there are two ways to give a machine a stable
address, and the other one is sometimes better.

A **static IP** is configured on the machine itself, which is what this post is
about. The box insists on its address no matter what the network thinks.

A **DHCP reservation** is configured on your router: you tell the router "always
hand this MAC address the same IP," and the machine keeps using DHCP none the
wiser. The address is stable, but the source of truth is the router, so DNS and
gateway changes propagate automatically and you cannot lock yourself out with a
bad YAML file.

My rule of thumb: for a box I administer and that must come up correctly even if
the router is replaced, I set a static IP on the machine. For appliances, IoT
gear, and things I would rather manage in one place, I use a reservation. They are
not mutually exclusive, but do not do both for the same address with conflicting
values, that way lies an afternoon of confusion. The rest of this post is the
static route.

## Find your interface, gateway, and subnet

You need three facts before you write anything: the name of the network interface,
the address of your gateway (your router), and the subnet size. All three come
from two commands.

The interface name and current address:

```bash
ip a
```

Look for the entry that is not `lo` (loopback) and has an IP on your LAN. The name
will be something like `enp3s0`, `ens18`, or `eth0`. Modern Ubuntu uses
"predictable" interface names derived from the hardware slot, so it is rarely just
`eth0` anymore, and copying a guide that assumes `eth0` is a classic first
mistake. Note your exact name.

The gateway and subnet:

```bash
ip route
```

The line starting `default via` names your gateway, for example
`default via 192.168.1.1`. And in `ip a` the address was shown with a suffix like
`/24`, which is the subnet in CIDR form. `/24` is the normal home network, meaning
addresses `192.168.1.1` through `192.168.1.254`. You write the static address the
same way, address and prefix together, `192.168.1.10/24`.

Pick an address that is on your subnet but outside the router's DHCP pool, so the
router never hands your static address to something else. Most routers let you see
or shrink the pool in their admin page; a common safe choice is something low like
`.10` when the pool starts at `.100`.

## The config file

Open the existing file in `/etc/netplan/` rather than making a new one that might
conflict. Check what is there first:

```bash
ls /etc/netplan/
sudo nano /etc/netplan/50-cloud-init.yaml
```

Here is a complete, known-good static configuration for a server. Replace the
interface name, addresses, and gateway with yours:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp3s0:
      dhcp4: no
      addresses:
        - 192.168.1.10/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

Reading it top to bottom: version 2 is the only Netplan format in use, the
renderer is `systemd-networkd` for a server, `enp3s0` is the interface, `dhcp4: no`
turns off automatic addressing, `addresses` sets the static IP with its `/24`
subnet, the `routes` block points all other traffic at the gateway, and
`nameservers` sets DNS (here Cloudflare and Google; use your router or a local
resolver if you prefer).

Two formatting rules that cause most failures. Use **spaces, never tabs**: a tab
anywhere in the file makes Netplan reject it outright. And the indentation is
two spaces per level and must be consistent, because the nesting is what assigns
each value to the right interface. If you take one thing from this section, it is
that the whitespace is load-bearing.

While you are here, fix the file permissions, because recent Netplan warns that
world-readable configs are a risk (they can contain Wi-Fi passwords):

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
```

## The gateway4 trap

This is the single biggest reason old Netplan guides fail today, and it deserves
its own heading.

For years, the way to set the gateway was a single line:

```yaml
      gateway4: 192.168.1.1
```

That key is **deprecated and now actively warns or errors** on current Ubuntu. If
you paste a tutorial from a few years back, this is the line that breaks, and the
error message (`gateway4 has been deprecated`) is easy to miss in a wall of YAML
parsing complaints. The modern replacement is the `routes` block shown above:

```yaml
      routes:
        - to: default
          via: 192.168.1.1
```

`to: default` is the new way of saying "everything not on the local subnet," which
is exactly what a default gateway is. Anytime a Netplan config from the internet
does not apply, check for `gateway4` first. It is almost always the culprit.

## Apply it without locking yourself out

Here is the command that turns Netplan from scary into safe, and the reason I will
never just run `apply` on a remote box again:

```bash
sudo netplan try
```

`try` applies the new config, then starts a 120-second countdown. If you press
Enter to confirm, it keeps the change. If you do **not** confirm, because your
typo just killed your own SSH session, it automatically rolls back to the previous
working config after the timeout. On a machine you reach over the network, this is
the difference between "oops, let me fix that" and a drive to wherever the box
physically lives. Always `try` before `apply` on anything remote.

Once `try` succeeds and you have confirmed, or for a local box where lockout is
harmless, apply for real:

```bash
sudo netplan apply
```

If you just want to check the YAML parses without bringing the change live,
`generate` reads your config and writes the back-end files under `/run` without
applying or reloading anything, so it is a safe syntax check:

```bash
sudo netplan generate
```

It prints nothing on success. To see the merged config Netplan has read, including
which file won when several overlap, use `sudo netplan get`.

## Confirm it worked

After applying, verify the address actually took and that you can reach the world.

The address and the route, the same commands you started with:

```bash
ip a
ip route
```

`ip a` should now show your static `192.168.1.10/24` on the interface, and
`ip route` should show `default via 192.168.1.1`. Newer Ubuntu also has a tidy
status view:

```bash
sudo netplan status
```

Then prove DNS and routing both work, since an address with broken DNS looks
online but resolves nothing:

```bash
ping -c3 1.1.1.1        # routing works if this replies
ping -c3 google.com     # DNS works if this resolves and replies
```

If the first ping works and the second does not, your `nameservers` block is the
problem, not your address or gateway.

## Desktop is a different renderer

Everything above assumes a server with the `networkd` renderer. On Ubuntu Desktop,
NetworkManager owns the network, and the default Netplan file says
`renderer: NetworkManager` with the interfaces left for NetworkManager to manage.
You have two honest options there.

The easy one: skip Netplan entirely and set the static IP in **Settings, Network**,
click the gear on your connection, the IPv4 tab, switch Method to Manual, and type
the same address, gateway, and DNS. NetworkManager stores it and Netplan never
enters the picture. For a desktop, this is what I actually do.

The other option: write the Netplan YAML exactly as above but keep
`renderer: NetworkManager`, and let Netplan hand it to NetworkManager. This is
worth it only if you want your desktop's config to live in the same file format as
your servers. For one machine, the GUI is less fuss.

## The cloud-init surprise

If this is a cloud VM (a VPS, an AWS or Azure or Oracle instance), there is a trap
that eats hours. On cloud images, **cloud-init regenerates the Netplan file on
boot**, so your hand-edited `50-cloud-init.yaml` gets overwritten the next time the
machine restarts and your static IP silently reverts. You change it, it works, you
reboot weeks later, and the network is "mysteriously" broken.

The fix is to tell cloud-init to stop managing the network. Create this file:

```bash
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
```

Now your Netplan file is yours to keep. Note that most cloud providers expect you
to set a static or reserved address in *their* console rather than on the
instance, because the hypervisor's networking is the real source of truth; on a
cloud box, check the provider's networking panel before you fight the guest OS.
This is the same "there is a second layer you do not control" lesson that the
[firewall post](/blog/ufw-firewall-basics-ubuntu/) runs into with cloud security
groups.

## Gotchas I hit

- **`gateway4` is dead.** The number-one reason a pasted config fails. Use the
  `routes:` block with `to: default` instead. Covered above because it is that
  common.
- **Tabs break everything.** YAML is spaces only. One tab and Netplan refuses the
  whole file. If your editor inserts tabs, fix it before you fix anything else.
- **The interface is not `eth0`.** Modern Ubuntu uses names like `enp3s0` and
  `ens18`. Run `ip a` and use the real name, do not trust the guide's.
- **`apply` can lock you out, `try` cannot.** On any remote box, `sudo netplan
  try` first so a bad config rolls back on its own after 120 seconds.
- **cloud-init overwrites your file.** On cloud images, disable cloud-init's
  network config or your static IP reverts on the next reboot.
- **Address inside the DHCP pool.** If your static IP overlaps the router's DHCP
  range, the router can hand it to another device and you get an address clash.
  Pick something outside the pool.
- **DNS forgotten.** An `addresses` and `routes` block with no `nameservers` gives
  you a box that pings IPs but cannot resolve names. Set DNS too.

## Quick reference

| Task | Command |
|---|---|
| Show interfaces and addresses | `ip a` |
| Show gateway and routes | `ip route` |
| List Netplan files | `ls /etc/netplan/` |
| Edit the config | `sudo nano /etc/netplan/50-cloud-init.yaml` |
| Lock down permissions | `sudo chmod 600 /etc/netplan/*.yaml` |
| Preview generated config | `sudo netplan generate` |
| Apply with auto-rollback | `sudo netplan try` |
| Apply for real | `sudo netplan apply` |
| Status overview | `sudo netplan status` |
| Test routing | `ping -c3 1.1.1.1` |
| Test DNS | `ping -c3 google.com` |

A minimal static config is a dozen lines of YAML: the interface, `dhcp4: no`, an
address in CIDR form, a `routes` block instead of the dead `gateway4`, and
nameservers. Get the whitespace right, apply it with `try` so a mistake cannot
strand you, and the box that used to wander around your subnet now sits at one
address forever, which is the whole point of calling it a server.
`[ one box, one address, forever ]`
