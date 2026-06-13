---
title: 'Plex + SABnzbd on Docker with hardware transcoding'
description: 'A single Docker Compose file that runs Plex Media Server and SABnzbd with host networking, Intel QuickSync hardware transcoding via /dev/dri, and a shared media volume — plus the claim-token, UID, and networking gotchas that trip everyone up on first run.'
pubDate: 'Jun 12 2026'
heroImage: '../../assets/docker-plex-hero.png'
tags: ['Docker', 'DockerCompose', 'Plex', 'SABnzbd', 'Homelab', 'SelfHosted', 'Linux', 'Usenet', 'HardwareTranscoding', 'SysAdmin']
---

This is the Compose file I use to run Plex Media Server and SABnzbd side by side
on a single Linux box, with **Intel QuickSync hardware transcoding** wired up and
a shared media volume so finished downloads land where Plex can see them. The
YAML itself is short. The reason it's worth a post is the handful of non-obvious
details — the claim token that expires in four minutes, why Plex needs host
networking, and the UID that has to match whoever owns your media — that send
everyone to the search bar on first run.

## Contents

- [Prerequisites](#prerequisites)
- [The Compose file](#the-compose-file)
- [1. First run: the claim token](#1-first-run-the-claim-token)
- [2. Why Plex uses host networking](#2-why-plex-uses-host-networking)
- [3. UID/GID and media ownership](#3-uidgid-and-media-ownership)
- [4. Verify hardware transcoding](#4-verify-hardware-transcoding)
- [5. The shared media volume](#5-the-shared-media-volume)
- [Gotchas I hit](#gotchas-i-hit)

## Prerequisites

- A Linux host with Docker and the Compose plugin (`docker compose version`)
- A Plex account (free) to claim the server
- For hardware transcoding: an Intel CPU with QuickSync **and** an active Plex
  Pass — software transcoding works without either, just on the CPU
- Media living somewhere on the host, e.g. `/mnt/media`

## The Compose file

```yaml
services:
  # Plex Media Server
  plex:
    container_name: plex
    image: plexinc/pms-docker:1.41.3.9314   # pin a version; see gotchas
    restart: unless-stopped
    network_mode: host                       # required for discovery
    environment:
      - TZ=Europe/London                     # your timezone
      - PLEX_CLAIM=claim-xxxxxxxxxxxxxxxxxxxx # from https://plex.tv/claim
      - PLEX_UID=1000                         # must own /mnt/media
      - PLEX_GID=1000
    volumes:
      - /opt/dockerapp/plex/config:/config
      - /mnt/media:/media
    devices:
      - /dev/dri:/dev/dri                     # Intel QuickSync passthrough

  # SABnzbd - Usenet downloader
  sabnzbd:
    container_name: sabnzbd
    image: linuxserver/sabnzbd:4.3.3          # pin a version
    restart: unless-stopped
    network_mode: host
    environment:
      - PUID=1000                             # note: PUID, not PLEX_UID
      - PGID=1000
      - TZ=Europe/London
    volumes:
      - /opt/dockerapp/sabnzbd/config:/config
      - /opt/dockerapp/sabnzbd/downloads:/downloads
      - /mnt/media:/media
```

Bring it up with:

```bash
docker compose up -d
```

> **The two images name the same thing differently.** The official Plex image
> wants `PLEX_UID` / `PLEX_GID`; the LinuxServer SABnzbd image wants `PUID` /
> `PGID`. Same numbers, different keys — set the wrong one and the container
> silently runs as root or `0`/`0` and your file permissions drift.

## 1. First run: the claim token

`PLEX_CLAIM` is what links a brand-new server to your Plex account without
opening the web setup wizard on the host's own network. Grab one from
[plex.tv/claim](https://plex.tv/claim) while logged in, paste it into the
Compose file, and start the container.

> **The token expires in four minutes and is single-use.** If `docker compose
> up -d` takes you longer than that to run after copying it, the server starts
> *unclaimed* and won't show up under your account. Get the token last, right
> before you start the stack.

Once the server is claimed, the token is spent and does nothing on subsequent
restarts. I leave the line in place (blank or stale, it's harmless) so the file
documents itself — but you can also clear it:

```yaml
      - PLEX_CLAIM=
```

Confirm the claim worked by opening `http://<host-ip>:32400/web` — a claimed
server drops you straight into your library, an unclaimed one shows the setup
wizard.

## 2. Why Plex uses host networking

`network_mode: host` looks like a shortcut, but for Plex it's effectively
required. Plex relies on **GDM** (its local discovery protocol) and DLNA, both
of which use broadcast/multicast traffic that does not cross Docker's default
bridge network cleanly. On bridge networking you get the classic symptoms:

- Apps on the same LAN can't find the server automatically
- "Remote Access" reports the wrong IP or refuses to enable
- DLNA devices never see the library

Host networking puts Plex directly on the host's stack, so port `32400` (and the
discovery ports) behave exactly as Plex expects. The trade-off is that the
container shares the host's ports — fine here, since there's nothing else
competing for them.

## 3. UID/GID and media ownership

`1000` is the first non-root user on most Linux installs, so it's a sane
default — but the numbers only work if **that UID actually owns the media**.
This is the number-one cause of "Plex can't see my files" and "SABnzbd can't
write the download." Check who owns the tree:

```bash
stat -c '%u %g %n' /mnt/media
```

If it prints `1000 1000 /mnt/media`, you're set. If not, either change the
Compose UID/GID to match, or take ownership:

```bash
sudo chown -R 1000:1000 /mnt/media
```

Both containers run as the same `1000:1000`, which is deliberate: SABnzbd writes
a finished file and Plex reads it with identical ownership, so no permission
dance in between.

## 4. Verify hardware transcoding

Passing `/dev/dri` into the container exposes the Intel iGPU's render nodes.
First confirm they exist on the host:

```bash
ls -l /dev/dri
# crw-rw---- ... card0
# crw-rw---- ... renderD128
```

In Plex, enable **Settings → Transcoder → Use hardware acceleration when
available** (this needs an active Plex Pass). Then force a transcode — play a
file in a format the client can't direct-play, or set a lower quality — and
watch the GPU light up on the host:

```bash
sudo intel_gpu_top      # from intel-gpu-tools; watch the "Video" engine
```

In the Plex dashboard, an active hardware transcode shows **(hw)** next to the
session's transcode info. No `(hw)`, busy CPU, idle GPU → acceleration isn't
actually engaging; recheck the Plex Pass and that `renderD128` is present
inside the container (`docker exec plex ls /dev/dri`).

## 5. The shared media volume

Both services mount `/mnt/media`. That's not duplication — it's what lets a
download become a library item without a slow cross-filesystem copy. When
SABnzbd and Plex see the same path, your downloader (or Sonarr/Radarr, if you
add them later) can **move** a finished file into the library with an atomic
rename instead of copying gigabytes across volumes.

Keep the SABnzbd `/downloads` and the final media library on the *same
filesystem* under `/mnt/media` and those moves stay instant. Split them across
mounts and every import turns into a full copy.

## Gotchas I hit

- **The claim token's four-minute fuse.** Copy it *last*. An unclaimed server
  looks broken in confusing ways — the fix is almost always "get a fresh token
  and recreate the container."
- **`PUID`/`PGID` vs `PLEX_UID`/`PLEX_GID`.** Two images, two spellings for the
  same idea. Mixing them up is a silent permissions bug, not an error.
- **`:latest` is a footgun on a media server.** A stray `docker compose pull`
  can drag in a Plex or SABnzbd release that changes behaviour mid-binge. I pin
  explicit versions and bump them on purpose, not by accident.
- **UID must own the media.** `chown` the tree to match the Compose UID/GID, or
  Plex sees an empty library and SABnzbd fails to write.
- **Don't expose SABnzbd to the internet.** With host networking its web UI sits
  on `:8080` on the LAN. That's fine behind a trusted router — but it has no
  business being port-forwarded. Reach it remotely over a VPN or reverse proxy
  with auth, never raw.
- **Transcodes hammer `/config` by default.** Plex writes temp transcode data
  under `/config`. If you transcode a lot, point it at a dedicated fast disk (or
  tmpfs) via **Settings → Transcoder → Transcoder temporary directory** so you
  don't thrash the config volume.

That's the whole stack: one `docker compose up -d`, Plex and SABnzbd sharing a
media tree, and the iGPU doing the transcoding instead of the CPU. `[ hw ✓ ]`
