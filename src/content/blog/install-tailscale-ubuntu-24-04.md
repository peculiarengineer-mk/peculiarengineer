---
title: 'Installing Tailscale on Ubuntu 24.04'
description: 'Getting Tailscale onto a fresh Ubuntu 24.04 box: the install, joining your tailnet interactively or with an auth key on a headless server, checking it actually worked, and making it survive a reboot.'
pubDate: 'Jun 15 2026'
heroImage: '../../assets/install-tailscale-hero.png'
tags: ['Tailscale', 'Ubuntu', 'Linux', 'VPN', 'WireGuard', 'Networking', 'SelfHosted', 'SysAdmin']
---

Installing Tailscale on Ubuntu 24.04 takes about two minutes, and at the end the
machine has a stable `100.x.y.z` address that follows it around, with the daemon
running as a service that comes back after a reboot.

> **TL;DR** — `curl -fsSL https://tailscale.com/install.sh | sh`, then
> `sudo tailscale up`, open the URL it prints, approve the machine. On a headless
> server, hand it an `--authkey` and skip the browser entirely.

## Install it

The official script knows about Ubuntu 24.04. It adds Tailscale's apt repo and
installs the package:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

If piping a script into your shell makes you twitch (fair), add the repo by
hand. Note the URLs say `noble`, which is the 24.04 codename:

```bash
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg \
  | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list \
  | sudo tee /etc/apt/sources.list.d/tailscale.list
sudo apt-get update
sudo apt-get install -y tailscale
```

## Join the tailnet

### On something with a browser

```bash
sudo tailscale up
```

It prints a URL. Open it in a browser that's logged into your tailnet, approve
the machine, and you're on. Easy when the machine is in front of you.

### On a headless server

This is the bit I always forget. You do not want to be copying an auth URL out of
an SSH session. Generate an auth key first in the admin console under Settings
then Keys, then pass it straight in:

```bash
sudo tailscale up --authkey "tskey-auth-xxxxx" --hostname "my-server"
```

No browser, no fuss. The `--hostname` sets what it's called in the admin console,
which future you will appreciate when there are a dozen of these. While you're
generating the key, an ephemeral one is worth it for short lived boxes, since the
node cleans itself out of the tailnet when it goes offline instead of leaving a
dead entry behind.

## Check it actually worked

What address did it get:

```bash
tailscale ip -4
```

What does it see:

```bash
tailscale status
```

And prove a peer is reachable, by name or by IP:

```bash
tailscale ping my-other-machine
```

If `status` shows your other machines and `ping` comes back, you're done.

## Make it stick across reboots

The install script enables the daemon for you, but I confirm it anyway so a
reboot doesn't quietly drop the box off the tailnet:

```bash
sudo systemctl enable --now tailscaled
systemctl status tailscaled
```

Once `tailscaled` is enabled it rejoins on every boot with nothing from you.
That's the whole point: you set it up once and forget the machine is even on a
VPN.

## A few things worth knowing

Turn on MagicDNS in the admin console (under DNS) and you get to use names
instead of memorising `100.x` addresses:

```bash
ssh user@my-server      # rather than ssh user@100.x.y.z
```

This box can hand its internet connection to the rest of the tailnet, or borrow
someone else's:

```bash
sudo tailscale up --advertise-exit-node     # offer this box as an exit node
sudo tailscale up --exit-node=100.x.y.z     # send my traffic out through a peer
```

And when you're done with it:

```bash
sudo tailscale down        # disconnect but stay registered
sudo tailscale logout      # remove the machine from the tailnet for good
```

## Quick reference

| Task | Command |
|---|---|
| Install | `curl -fsSL https://tailscale.com/install.sh \| sh` |
| Join, with a browser | `sudo tailscale up` |
| Join, headless | `sudo tailscale up --authkey tskey-... --hostname my-server` |
| This machine's IP | `tailscale ip -4` |
| Status and peers | `tailscale status` |
| Ping a peer | `tailscale ping my-other-machine` |
| Start on boot | `sudo systemctl enable --now tailscaled` |
| Disconnect | `sudo tailscale down` |
| Log out | `sudo tailscale logout` |
