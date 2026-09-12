---
title: 'Install Docker on Debian 13 (Trixie)'
description: "Install Docker Engine on Debian 13 from Docker's own apt repo instead of the archive's docker.io, with the Debian repo URL and a deb822 sources file, the Compose and Buildx plugins, and a demonstration of the root access the docker group grants. Tested on a fresh Trixie box."
pubDate: 'Sep 12 2026'
heroImage: '../../assets/docker-debian-13-hero.png'
tags: ['Docker', 'Debian', 'Debian13', 'Linux', 'Server', 'SelfHosted', 'Containers', 'DevOps']
---

Debian 13 has Docker in the archive. `sudo apt install docker.io` works, and on my fresh Trixie box it gave me Docker 26.1.5. Docker's own repository, the same afternoon, gave me 29.8.0. Debian freezes a package version when the release freezes and backports security fixes to it, rather than following upstream, which is exactly what Debian is for and exactly what you do not want from a container engine moving as fast as this one. This post is the Debian version of my [Ubuntu 26.04 Docker install](/blog/install-docker-ubuntu-26-04/), and the two differ in a handful of lines that are easy to get wrong by copying an Ubuntu guide.

Short on purpose. The steps are the official ones. The two places worth slowing down are the repo file, because my Trixie image used the deb822 format and the codename has to be `trixie`, and step 5, where the `docker` group quietly hands out root.

> **TL;DR.** Remove any `docker.io`, `docker-compose`, or `containerd` packages from the archive, add Docker's GPG key and a deb822 `.sources` file pointing at `download.docker.com/linux/debian` with `Suites: trixie`, then `sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`. Verify with `sudo docker run hello-world`. Add yourself to the `docker` group to drop the `sudo`, knowing that is the same as granting root.

## Contents

- [Prerequisites](#prerequisites)
- [1. Remove the archive's Docker packages first](#1-remove-the-archives-docker-packages-first)
- [2. Add Docker's apt repository](#2-add-dockers-apt-repository)
- [3. Install the engine and plugins](#3-install-the-engine-and-plugins)
- [4. Verify it actually runs](#4-verify-it-actually-runs)
- [5. Run Docker without sudo (and what that really costs)](#5-run-docker-without-sudo-and-what-that-really-costs)
- [What is different from Ubuntu](#what-is-different-from-ubuntu)
- [Quick reference](#quick-reference)

## Prerequisites

- Debian 13 (Trixie) on `amd64` or `arm64`.
- A user with sudo. The Debian cloud images I have used start with `root` and no regular user, so make one first. (An installer-built box lets you create one during setup.) The [Debian 13 hardening post](/blog/hardening-debian-13-server/) covers making that user and locking root out of SSH, and it is worth doing before this.
- Outbound HTTPS to `download.docker.com`.

## 1. Remove the archive's Docker packages first

Debian ships `docker.io`, `docker-compose`, `docker-buildx`, `containerd`, and `runc`, and on Trixie the versions are 26.1.5, 2.26.1, 0.13.1, 1.7.24, and 1.1.15. Any of them will fight Docker's packages over the same binaries and the same `containerd` socket. Clear them out first:

```bash
sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-buildx docker-doc podman-docker containerd runc | cut -f1)
```

The `dpkg --get-selections` wrapper stops the command erroring on packages you never had. On my fresh box none of them were installed and the command did nothing, which is the point. If you already ran the archive's Docker, this removes the packages and leaves your images and volumes in `/var/lib/docker` alone.

One Debian detail: unlike Ubuntu, Trixie's `docker-compose` package is Compose v2 (2.26.1), so the hyphenated `docker-compose` command exists in the archive. You still want the plugin from Docker's repo instead, which was v5.5.1 when I installed it, and it runs as `docker compose` with a space.

## 2. Add Docker's apt repository

Two steps: trust Docker's signing key, then point apt at their Debian repo. My Trixie image already kept its own sources in the deb822 format (`/etc/apt/sources.list.d/debian.sources`, with no `sources.list`), so I used the same format for Docker. The old one-line `.list` form still works if you prefer it; deb822 is just the current recommendation.

The key:

```bash
sudo apt update
sudo apt install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Note the URL says `linux/debian`, not `linux/ubuntu`. The two repos are signed with the same key, but the package lists are different, so when you copy the commands from an Ubuntu guide this is the line to change.

Now the repo file:

```bash
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

On Debian 13 the `Suites:` line resolves to `trixie`. The Ubuntu version of this command has a `${UBUNTU_CODENAME:-$VERSION_CODENAME}` dance in it because Ubuntu's `os-release` carries both names. Debian only has `VERSION_CODENAME`, so the plain form is right here, and the Ubuntu fallback form works too because it falls through to the same variable. `apt update` should show two new lines from `download.docker.com`, and `apt-cache policy docker-ce` should list `5:29.8.0-1~debian.13~trixie` or newer as the candidate.

## 3. Install the engine and plugins

```bash
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

The five packages, so they are not a magic incantation:

- `docker-ce` is the daemon.
- `docker-ce-cli` is the `docker` command.
- `containerd.io` is the runtime underneath.
- `docker-buildx-plugin` makes `docker build` use BuildKit.
- `docker-compose-plugin` gives you `docker compose`.

The install enables and starts the daemon and its socket on its own. Confirm:

```bash
$ systemctl is-enabled docker docker.socket containerd
enabled
enabled
enabled
$ sudo docker version --format '{{.Server.Version}}'
29.8.0
$ sudo docker compose version
Docker Compose version v5.5.1
```

Use `sudo` for those until you have done step 5, because the user you installed as is not in the `docker` group yet.

Two things `docker info` told me on Trixie that are worth knowing. The storage driver is `overlayfs` and the cgroup driver is `systemd` on cgroup v2, both what you want and neither needs configuring. And the firewall backend is `iptables`, which on Debian 13 means `iptables-nft`, because `iptables` is the nftables shim now (`iptables --version` says `v1.8.11 (nf_tables)`). Docker writes its rules into `ip filter` and `ip nat` tables through that shim, and `nft list ruleset` shows them with a `managed by iptables-nft, do not touch!` warning on each table. If you run your own nftables ruleset on the box, keep it in its own `inet` table and leave Docker's alone. That stops your filtering rules colliding with Docker's, though it does not override Docker's forwarding and NAT, so restrict what containers can reach through Docker's own options rather than expecting your table to win.

## 4. Verify it actually runs

```bash
sudo docker run hello-world
```

That pulls a tiny image, runs it, and prints a paragraph confirming the daemon, the runtime, and the path to Docker Hub all work. If it hangs on the pull, the problem is DNS or outbound network, not the install.

## 5. Run Docker without sudo (and what that really costs)

The install created a `docker` group that owns the daemon's socket:

```bash
$ ls -l /var/run/docker.sock
srw-rw---- 1 root docker 0 Sep 12 02:02 /var/run/docker.sock
```

Add your user to it and log in again, because group membership is read at login:

```bash
sudo usermod -aG docker $USER
newgrp docker        # or log out and back in
docker ps
```

Before you do that, know what it hands out, because most guides drop you in the group and move on. **The `docker` group is root.** Not root-like, root. The daemon runs as root, and anyone who can talk to its socket can mount the host filesystem into a container and read anything. I ran this as the unprivileged user I had just added to the group:

```bash
$ docker run --rm -v /:/host alpine head -1 /host/etc/shadow
root:!:17478:0:99999:7:::
```

That is the host's shadow file, from a user with no sudo. On your own laptop or a homelab box you administer alone, that is a fine trade for not typing `sudo`. On a box other people log into, treat membership in the `docker` group as granting root, and hand it out on those terms. If that bothers you, [rootless mode](https://docs.docker.com/engine/security/rootless/) runs the daemon as your user instead, with some limits around ports below 1024 and networking.

## What is different from Ubuntu

| | Debian 13 | Ubuntu 26.04 |
| --- | --- | --- |
| Repo URL | `download.docker.com/linux/debian` | `download.docker.com/linux/ubuntu` |
| `Suites:` | `trixie` | `resolute` |
| Archive package | `docker.io` 26.1.5, `docker-compose` is v2 | `docker.io`, `docker-compose-v2` |
| Default user (cloud image) | `root`, make a sudo user first | a sudo user from the installer |
| Firewall backend | `iptables-nft` shim, tables show as managed by iptables | same |

Everything else, the five package names, the group tradeoff, and `docker compose` with a space, is identical.

## Quick reference

| Job | Command |
| --- | --- |
| Remove archive packages | `sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-buildx docker-doc podman-docker containerd runc \| cut -f1)` |
| Add GPG key | `sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc` |
| Repo file | `/etc/apt/sources.list.d/docker.sources` with `Suites: trixie` |
| Install engine + plugins | `sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin` |
| Verify | `sudo docker run hello-world` |
| Check versions | `docker version`, `docker compose version`, `docker buildx version` |
| Drop the sudo | `sudo usermod -aG docker $USER` then log in again |
| See Docker's firewall rules | `sudo nft list ruleset` (tables `ip filter`, `ip nat`) |

Docker is the one thing on the box I would not take from the archive, because the version gap is wide (26 to 29 the day I checked) and a container engine is exactly the fast-moving software that gap hurts. Point apt at Docker's repo with `trixie` in the suite line, install the five packages, and decide about the `docker` group with that shadow file in mind.

`[ trixie · docker-ce · one group away from root ]`
