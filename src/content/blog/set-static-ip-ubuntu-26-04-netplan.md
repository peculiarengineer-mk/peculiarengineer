---
title: 'Set a Static IP on Ubuntu 26.04 with Netplan'
description: 'Give an Ubuntu 26.04 box a fixed address with Netplan, on server and desktop. Find your interface, write the YAML, apply it with netplan try so a typo cannot lock you out, and understand why the desktop GUI now writes a Netplan file too.'
pubDate: 'Jul 12 2026'
heroImage: '../../assets/static-ip-2604-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Linux', 'Netplan', 'Networking', 'StaticIP', 'Homelab', 'SysAdmin']
---

A box you SSH into needs to stay where you left it. DHCP hands it `192.168.1.47` today and something else next week, and then your SSH config points at nothing, your port forward is wrong, and you are scanning the subnet trying to find where the machine went. The fix is a static address, and on Ubuntu 26.04 that means Netplan.

This is the 26.04 version of my [evergreen Netplan guide](/blog/static-ip-ubuntu-netplan/), kept deliberately tight. If you want the long explanation of what Netplan actually is, the static-versus-DHCP-reservation decision, or the cloud-init trap on VPS images, that post covers all of it and still applies. This one is the quick reference for a 26.04 box, plus the one thing that genuinely changed on this release: the desktop and the server now write the same file.

> **TL;DR** On a server, edit the file in `/etc/netplan/`, set `dhcp4: no`, an `addresses:` line in CIDR form, a `routes:` block with `to: default` (not the old `gateway4`), and `nameservers:`. Apply with `sudo netplan try` so a mistake rolls itself back after 120 seconds. On a desktop, set it in the GUI and let it write Netplan for you.

## Pick your box

There are two clean paths and you only need one.

- **Headless server or homelab box** (Ubuntu Server, no desktop): you edit YAML in `/etc/netplan/` directly. The renderer underneath is `systemd-networkd`. Go to the server path below.
- **Desktop machine** (Ubuntu Desktop with the GNOME Settings app): you set it in the GUI, and NetworkManager writes the Netplan file for you. Go to the desktop path.

Either way the config ends up in the same place, `/etc/netplan/`, which is the whole point of the 26.04 story. If you are curious why, skip to [what is different on 26.04](#what-is-different-on-2604) after you have a working address.

## Server path: edit the YAML

### 1. Find your interface and gateway

You need three facts: the interface name, the gateway address, and the subnet size. Two commands give you all of them.

```bash
ip a
```

Look for the entry that is not `lo` and has a LAN address. The name is something like `enp3s0`, `ens18`, or `eth0`. Ubuntu uses predictable interface names derived from the hardware slot, so it is rarely plain `eth0` anymore, and copying a guide that assumes `eth0` is the classic first mistake. Note your exact name and the `/24` suffix on the address, which is the subnet in CIDR form.

```bash
ip route
```

The line starting `default via` names your gateway, for example `default via 192.168.1.1`.

Pick a static address on your subnet but outside the router's DHCP pool, so the router never hands your address to something else. If the pool starts at `.100`, something low like `.10` is a safe choice.

### 2. Write the config

Edit the file already in `/etc/netplan/` rather than adding a new one that might conflict. Check what is there first:

```bash
ls /etc/netplan/
sudo nano /etc/netplan/50-cloud-init.yaml
```

Here is a complete, known-good server config. Replace the interface, address, and gateway with yours:

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

Top to bottom: `dhcp4: no` turns off automatic addressing, `addresses` sets the static IP with its subnet, the `routes` block sends everything else to the gateway, and `nameservers` sets DNS.

Two whitespace rules cause most failures. Use **spaces, never tabs**; a single tab makes Netplan reject the whole file. And indentation is two spaces per level, consistently, because the nesting is what binds each value to the right interface. The whitespace is load-bearing.

Lock the permissions while you are here, because Netplan warns about world-readable configs (they can hold Wi-Fi passwords):

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
```

### 3. The gateway4 trap

This is still the single most common reason a pasted config fails, so it earns its own heading even in the short version. For years the gateway was one line:

```yaml
      gateway4: 192.168.1.1
```

That key is deprecated. It has been on the way out since Ubuntu 22.04, and on 26.04 it still parses but nags you with `gateway4 has been deprecated, use default routes instead` every time you run `netplan generate` or `apply`. It is easy to miss that warning in a wall of YAML output, then wonder why your config feels off. Do not use it. The modern form is the `routes` block already shown:

```yaml
      routes:
        - to: default
          via: 192.168.1.1
```

`to: default` means "everything not on the local subnet," which is exactly what a default gateway is. Anytime a Netplan config from the internet misbehaves, check for `gateway4` first.

### 4. Apply it without locking yourself out

This is the command that makes Netplan safe on a remote box:

```bash
sudo netplan try
```

`try` applies the config, then starts a 120-second countdown. Press Enter to keep it. Do not press it, because your typo just killed your own SSH session, and it rolls back to the last working config on its own. On a machine you reach over the network, that is the difference between "let me fix that" and a drive to wherever the box physically lives. Always `try` before `apply` on anything remote.

Once it holds, or on a local box where lockout is harmless, apply for real:

```bash
sudo netplan apply
```

### 5. Confirm it took

```bash
ip a
ip route
sudo netplan status
```

`ip a` should show your static `192.168.1.10/24`, and `ip route` should show `default via 192.168.1.1`. Then prove DNS and routing both work, because an address with broken DNS looks online but resolves nothing:

```bash
ping -c3 1.1.1.1        # routing works if this replies
ping -c3 google.com     # DNS works if this resolves too
```

If the first ping works and the second does not, the problem is your `nameservers` block, not your address.

## Desktop path: use the GUI

On Ubuntu Desktop you do not have to touch YAML at all, and on 26.04 you get the Netplan file anyway. Set the address in the GNOME Settings app:

1. Open **Settings**, then **Network** (or **Wi-Fi**).
2. Click the gear icon next to your connection.
3. Go to the **IPv4** tab.
4. Switch **Method** from Automatic (DHCP) to **Manual**.
5. Under Addresses, enter the address (`192.168.1.10`), netmask (`255.255.255.0` for a `/24`), and gateway (`192.168.1.1`).
6. Turn off **Automatic** DNS and enter your servers (`1.1.1.1, 8.8.8.8`).
7. Click **Apply**, then toggle the connection off and on so the change takes.

Confirm the same way as the server:

```bash
ip a
ping -c3 google.com
```

Here is the part worth knowing. That GUI change did not just live inside NetworkManager. On 26.04 it wrote a Netplan file. Look:

```bash
ls /etc/netplan/
```

You will see something like `90-NM-<UUID>.yaml`, one file per connection you configured. That is NetworkManager storing your settings in Netplan's format, in Netplan's directory. The desktop and the server now speak the same language, which is the change this post exists for.

If you prefer the terminal on a desktop, `nmcli` does the same thing and produces the same file:

```bash
nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses 192.168.1.10/24 \
  ipv4.gateway 192.168.1.1 \
  ipv4.dns "1.1.1.1 8.8.8.8"
nmcli connection up "Wired connection 1"
```

## What is different on 26.04

Here is the part no older tutorial mentions, and the reason I stopped trusting my own memory on this.

Netplan is now the single source of truth for network config across every Ubuntu variant, [desktop, server, cloud, and IoT](https://ubuntu.com/blog/netplan-configuration-across-desktop-server-cloud-and-iot). NetworkManager on the desktop uses `libnetplan` to write every connection you make, whether through the GUI or `nmcli`, out to `/etc/netplan/` as a `90-NM-<UUID>.yaml` file. The old `.nmconnection` file under `/etc/NetworkManager/system-connections/` is no longer where your settings really live; it is generated from the Netplan YAML at runtime, under `/run`.

The practical consequences:

- **Editing `.nmconnection` by hand does nothing useful.** Change it and NetworkManager regenerates it from the Netplan file on the next boot, quietly throwing your edit away. Edit the Netplan file or use `nmcli` instead.
- **One place to look.** On any 26.04 box, desktop or server, `ls /etc/netplan/` shows you the real network config. No more wondering which subsystem owns it.
- **`netplan get` shows the merged picture.** When several files overlap, `sudo netplan get` prints the config Netplan actually assembled, and `sudo netplan status --diff` shows where the live system differs from what the YAML says.

None of this changes the server YAML you wrote above. It just means the desktop finally joined it.

## Gotchas I hit

- **`gateway4` is on its way out.** Still the number-one reason a pasted config fails. Use the `routes:` block with `to: default`.
- **Tabs break everything.** YAML is spaces only. One tab and Netplan refuses the whole file.
- **The interface is not `eth0`.** Modern Ubuntu uses names like `enp3s0` and `ens18`. Run `ip a` and use the real name.
- **`apply` can lock you out, `try` cannot.** On any remote box, `sudo netplan try` first so a bad config rolls back after 120 seconds.
- **Editing `.nmconnection` on a desktop does nothing.** On 26.04 that file is generated from Netplan. Change the Netplan file or use `nmcli`.
- **Address inside the DHCP pool.** If your static IP overlaps the router's pool, the router can hand it to another device. Pick something outside the pool.
- **DNS forgotten.** An address and route with no `nameservers` gives you a box that pings IPs but cannot resolve names.

## Quick reference

| Task | Command |
|---|---|
| Show interfaces and addresses | `ip a` |
| Show gateway and routes | `ip route` |
| List Netplan files | `ls /etc/netplan/` |
| Edit the server config | `sudo nano /etc/netplan/50-cloud-init.yaml` |
| Lock down permissions | `sudo chmod 600 /etc/netplan/*.yaml` |
| Apply with auto-rollback | `sudo netplan try` |
| Apply for real | `sudo netplan apply` |
| Status overview | `sudo netplan status` |
| Diff live vs config | `sudo netplan status --diff` |
| Set it from the desktop CLI | `nmcli connection modify ...` |
| Test routing | `ping -c3 1.1.1.1` |
| Test DNS | `ping -c3 google.com` |

Find your interface, write a dozen lines of YAML or click through the GUI, and apply it with `try` so a typo cannot strand you. The box that used to wander around your subnet now sits at one address, and on 26.04 it is the same address in the same file whether that box has a screen or not.

`[ one file, one address, screen or not ]`
