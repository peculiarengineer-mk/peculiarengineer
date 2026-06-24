---
title: 'ubuntu-dev'
description: 'My first devcontainer base image: a lean Ubuntu 26.04 LTS base with a standard dev toolset and a passwordless-sudo non-root user. A GitHub Actions pipeline builds it for amd64 and arm64, re-pulls the base every run so security updates land on their own, and publishes it to Docker Hub.'
repo: 'https://github.com/peculiarengineer-mk/ubuntu-dev'
blogSlug: 'automate-multi-arch-docker-github-actions'
pubDate: 'Jun 23 2026'
tags: ['Docker', 'GitHubActions', 'DevContainer', 'Ubuntu', 'MultiArch']
---

The first devcontainer image I ever built. The Dockerfile was the easy part; the real work was the CI that keeps it multi-arch, fresh, and findable. Two gotchas cost me a build, and both are in the writeup.
