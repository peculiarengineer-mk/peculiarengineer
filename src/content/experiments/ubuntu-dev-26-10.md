---
title: 'ubuntu-dev 26.10'
description: 'The same devcontainer base, now built on the Ubuntu 26.10 "Stonking Stingray" beta, plus a devel tag that follows Ubuntu''s development base. One Dockerfile with a version build argument, a GitHub Actions matrix that builds 26.04, 26.10 and devel for amd64 and arm64, a smoke test before every push, and a keepalive so the weekly rebuild does not get switched off.'
repo: 'https://github.com/peculiarengineer-mk/ubuntu-dev'
blogSlug: 'upgrade-ubuntu-26-04-to-26-10-beta'
pubDate: 'Oct 2 2026'
tags: ['Docker', 'GitHubActions', 'DevContainer', 'Ubuntu', 'Ubuntu2610', 'MultiArch']
---

`docker pull peculiarengineer/ubuntu-dev:26.10` gives you the 26.10 userland in seconds, which is the quick look. It is not a 26.10 server: no systemd, no kernel of its own, and a base snapshot that lags the archive. For a real 26.10 server, the writeup is the upgrade from 26.04 to the beta.
