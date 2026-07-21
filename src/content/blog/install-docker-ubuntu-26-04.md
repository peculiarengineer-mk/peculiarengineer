---
title: 'Install Docker on Ubuntu 26.04'
description: "Install Docker Engine on Ubuntu 26.04 from Docker's own apt repo, not the distro docker.io package, get the Compose and Buildx plugins, and add your user to the docker group with open eyes about the root-equivalent tradeoff."
pubDate: 'Jul 20 2026'
heroImage: '../../assets/docker-2604-hero.png'
tags: ['Docker', 'Ubuntu', 'Ubuntu2604', 'Linux', 'Server', 'SelfHosted', 'Containers', 'DevOps']
---

The wrong way to install Docker on Ubuntu is the one that looks easiest: `sudo apt install docker.io`. That package exists, it installs, and it runs a container. It is also whatever version happened to be frozen into the archive when 26.04 was cut, it lags the real releases by months, and it ships without the Compose and Buildx plugins you will want by the end of the week. Use Docker's own apt repository instead, and this is the post I keep open so I do not re-derive the repo setup from memory each time.

This is short on purpose. The steps are the official ones, and the only place worth slowing down is step 5, where adding yourself to the `docker` group quietly hands out root. That tradeoff is the part most guides skip, and it is the one thing here actually worth reading twice.

> **TL;DR** Remove any distro `docker.io`/`containerd` packages, add Docker's GPG key and the deb822 `.sources` repo, then `sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`. Verify with `sudo docker run hello-world`. Add yourself to the `docker` group to drop the `sudo` (it is root-equivalent, more below).

## Prerequisites

- Ubuntu 26.04 (Resolute Raccoon), server or desktop, on `amd64` or `arm64`.
- A user with sudo. If you are still on root, [create a sudo user first](/blog/create-sudo-user-ubuntu-26-04/).
- Outbound HTTPS to `download.docker.com`.

## 1. Remove the distro Docker packages first

Ubuntu ships its own `docker.io`, `docker-compose`, and `containerd` packages, and any of them will fight the official ones over the same files and the same `containerd` socket. Clear them out before you add Docker's repo. This is safe on a fresh box because there is nothing to lose yet; on a box that already ran the distro Docker, it removes the packages but leaves your images and volumes in `/var/lib/docker` alone.

```bash
sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc | cut -f1)
```

The `dpkg --get-selections` wrapper is just so the command does not error out on packages you never had installed. If none of them are present, nothing happens, which is exactly what you want.

## 2. Add Docker's apt repository

Two steps: trust Docker's signing key, then point apt at their repo. Docker's current docs use the newer deb822 format (a `.sources` file), which is more readable than the old one-line `.list` entry and is what 26.04's apt prefers.

First, the key:

```bash
sudo apt update
sudo apt install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

The key lives in `/etc/apt/keyrings/`, not the deprecated `apt-key` store, and the repo file below points at it with `Signed-By`. That pairing is what tells apt "only trust packages from this repo if they are signed by this specific key," which is the whole reason you are not just piping a script into your shell.

Now the repo itself:

```bash
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

The `Suites:` line reads your release codename out of `/etc/os-release`, so on 26.04 it resolves to `resolute` and on 24.04 it would be `noble`. That final `apt update` pulls in Docker's package list, and you are ready to install.

## 3. Install the engine and plugins

```bash
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Five packages, and it is worth knowing what each one is rather than pasting them as a magic incantation:

- `docker-ce` is the daemon, the thing that actually runs containers.
- `docker-ce-cli` is the `docker` command you type.
- `containerd.io` is the lower-level runtime the daemon drives.
- `docker-buildx-plugin` is the modern builder, so `docker build` uses BuildKit.
- `docker-compose-plugin` gives you `docker compose` as a subcommand.

That last one is the part people miss. Compose v2 is a plugin now, so the command is `docker compose up` with a space, not the old standalone `docker-compose` with a hyphen. If you have muscle memory for the hyphenated one, this is where it stops working, and installing this plugin is how you get the replacement.

The daemon starts and enables itself on install, so there is nothing to `systemctl enable`. Confirm it:

```bash
systemctl is-active docker    # -> active
```

## 4. Verify it actually runs

```bash
sudo docker run hello-world
```

This pulls a tiny image, runs it, and prints a paragraph confirming the daemon, the runtime, and the network path all work end to end. If you see "Hello from Docker!", the install is done. If it hangs on the pull, that is a network or DNS problem reaching Docker Hub, not a broken install.

## 5. Run Docker without sudo (and what that really costs)

Typing `sudo` before every `docker` command gets old fast. The fix is to add yourself to the `docker` group, which owns the daemon's socket:

```bash
sudo groupadd docker            # usually already exists; harmless if so
sudo usermod -aG docker $USER
```

Group membership is read at login, so it does not apply to your current shell. Log out and back in, or start a fresh session with:

```bash
newgrp docker
```

Then prove it without sudo:

```bash
docker run hello-world
```

Here is the honest caveat, because most guides drop you in the `docker` group and move on. **Membership in the `docker` group is root-equivalent.** The daemon runs as root, and anyone who can talk to its socket can mount the host filesystem into a container and walk straight out as root. There is no privilege boundary between "in the docker group" and "root," full stop. On your own laptop or a single-admin homelab box, that is a fine trade for convenience. On a shared server, do not hand out `docker` group membership as if it were a lesser permission, because it is not. If that trade bothers you, [rootless mode](https://docs.docker.com/engine/security/rootless/) runs the whole daemon as your user instead, at the cost of a few limitations around ports below 1024 and some networking.

## Quick reference

| Job | Command |
| --- | --- |
| Remove distro packages | `sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc \| cut -f1)` |
| Add GPG key | `sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc` |
| Install engine + plugins | `sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin` |
| Verify | `sudo docker run hello-world` |
| Drop the sudo | `sudo usermod -aG docker $USER` then re-login |
| Compose command | `docker compose up` (space, not `docker-compose`) |
| Check the daemon | `systemctl is-active docker` |

Use Docker's repo, not the distro package, so you get real versions and the Compose and Buildx plugins. Clear out the old packages first, trust the key, and let apt pull the real thing. Then decide with open eyes whether the `docker` group is a trade you want, because it hands out root. With that done, the box is ready for the actual reason you installed Docker: running something.

`[ daemon up · containers go ]`
