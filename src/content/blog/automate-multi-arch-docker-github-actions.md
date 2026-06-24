---
title: 'Automating Multi-Arch Docker Image Builds with GitHub Actions'
description: 'Build a multi-arch Docker image for amd64 and arm64 with GitHub Actions, keep it fresh on a schedule, and publish it to Docker Hub, plus two gotchas that cost me a build.'
pubDate: 'Jun 23 2026'
heroImage: '../../assets/docker-multiarch-ci-hero.png'
tags: ['Docker', 'GitHubActions', 'CI', 'MultiArch', 'DevContainer', 'Buildx', 'DevOps', 'Automation']
---

This was the first devcontainer base image I ever built. I had spent years `FROM`-ing other people's images and finally wanted one that was mine, lean and current and shaped the way I like. So I built [`peculiarengineer/ubuntu-dev`](https://github.com/peculiarengineer-mk/ubuntu-dev), a small Ubuntu 26.04 LTS base on Docker Hub, and the surprise was that the Dockerfile was the easy part. The interesting work was all in CI: building a multi-arch Docker image for amd64 and arm64 with GitHub Actions, and keeping it fresh on its own.

The image has three jobs: run on Apple Silicon and on x86 boxes alike, stay current with upstream security updates without me touching it, and actually be findable when someone (including future me) goes looking for it. None of that lives in the Dockerfile. All three are CI problems, and once I had the workflow right they stopped being problems at all. This is me writing it down so I do not have to re-derive it the next time.

> **TL;DR** One GitHub Actions workflow builds the image for amd64 and arm64 with QEMU plus Buildx, re-pulls the base on every run so security updates land automatically, pushes `:26.04` and `:latest`, and syncs the Docker Hub description. `pull: true` is what turns a scheduled rebuild into an actual rebuild. And registry auth is not the same thing as Docker Hub API auth, which is the gotcha that 403s your description sync.

## The workflow

Here is the whole thing, `.github/workflows/build.yml`:

```yaml
name: build

on:
  schedule:
    - cron: "0 6 * * 1"        # Mondays 06:00 UTC
  push:
    branches: [main]
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - ".github/workflows/build.yml"
  workflow_dispatch:            # manual "Run workflow" button

concurrency:
  group: build-${{ github.ref }}
  cancel-in-progress: true

env:
  IMAGE: peculiarengineer/ubuntu-dev

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-qemu-action@v3        # emulation for cross-arch
      - uses: docker/setup-buildx-action@v3      # the multi-arch builder

      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64,linux/arm64
          pull: true                              # re-fetch the base every run
          push: true
          provenance: false
          tags: |
            ${{ env.IMAGE }}:26.04
            ${{ env.IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Sync Docker Hub description
        if: github.ref == 'refs/heads/main'
        continue-on-error: true                   # docs failure != build failure
        uses: peter-evans/dockerhub-description@v4
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
          repository: ${{ env.IMAGE }}
          short-description: "Lean Ubuntu 26.04 LTS devcontainer base, dev toolset, non-root sudo user, multi-arch amd64/arm64"
          readme-filepath: ./README.md
```

## The decisions that matter

There are three triggers because there are three reasons this image should ever rebuild. The `schedule` cron keeps it fresh on its own. The `push` trigger rebuilds when the recipe actually changes, and it is path filtered to only the files that affect the build. That filter is doing real work. Without it, every README typo or comment fix fires a full multi-arch build for nothing, and a cold multi-arch build is not cheap. The `workflow_dispatch` line gives me a "Run workflow" button in the Actions tab for when I want to force one by hand.

Then there is `pull: true`, which is the single most important line in the file and the one everyone leaves out. Buildx will cheerfully reuse a cached `FROM ubuntu:26.04` layer until the heat death of the universe. So you set up your nice Monday cron, feel good about yourself, and it rebuilds absolutely nothing because the base layer is still in cache. `pull: true` forces it to re-fetch the base on every run, so the cron genuinely pulls in the new upstream base plus apt security updates. Without it, your scheduled rebuild is a scheduled no-op that just burns minutes to produce the same image.

Multi-arch is QEMU plus Buildx working together. [`setup-qemu-action`](https://github.com/docker/setup-qemu-action) registers the emulation so an amd64 runner can build arm64 binaries, and [`setup-buildx-action`](https://github.com/docker/setup-buildx-action) provides the BuildKit builder that emits one manifest covering both architectures. The build itself runs through [`docker/build-push-action`](https://github.com/docker/build-push-action), which is where every option below lives. The honest caveat: the emulated architecture is slow. On a cold cache, expect minutes, not seconds, for the arm64 side.

Which is exactly why caching is in there. `cache-from` and `cache-to: type=gha` park the layers in GitHub's own Actions cache. After the first run, an unchanged rebuild came back in about 20 seconds. And caching does not fight freshness here, because `pull: true` still refreshes the base layer whenever upstream actually moves. You get the fast path on no-op rebuilds and the slow path only when something genuinely changed.

The `concurrency` block with `cancel-in-progress: true` means that if I push twice in quick succession, the second push cancels the first now-stale run instead of letting both grind through the queue. No point finishing a build for a commit I already replaced.

Credentials live in secrets, never a file, and the token is least privilege. The workflow reads `secrets.DOCKERHUB_USERNAME` and `secrets.DOCKERHUB_TOKEN`. You can set those in repo Settings under Secrets and variables, Actions, or from the CLI:

```bash
gh secret set DOCKERHUB_USERNAME --repo OWNER/REPO --body "your-dockerhub-user"
gh secret set DOCKERHUB_TOKEN   --repo OWNER/REPO   # prompts, never echoes
```

## Gotcha 1: Forbidden on the description sync

The first time I ran the full thing, the image push succeeded and then the description step blew up with `Error: Forbidden`. A clean 403 right after a clean push, which is confusing until you realise registry auth and the Docker Hub REST API are two completely different surfaces wearing the same login form.

A repository-scoped access token is perfectly happy to push images. It is not allowed to call `PATCH /v2/repositories/...` to edit the description, because that is the account API, not the registry. The fix was to generate an account-level Personal Access Token with Read, Write, Delete scope (the kind that is not restricted to a single repo) and make sure the username is the namespace owner. That is the footgun: the token that pushes your image will not necessarily edit your repo page, and the error gives you no hint why.

I also left the docs step marked `continue-on-error: true` on purpose. A description-permission hiccup should never be allowed to fail the actual image publish. Publishing the image is the job; updating the marketing copy is a nice-to-have, and it gets to fail quietly.

## Gotcha 2: UID 1000 was already taken

The whole point of a devcontainer base is a non-root user, so I added a `vscode` user pinned to UID 1000, the conventional first-user ID that VS Code and Codespaces expect. The build failed. UID 1000 was already in use.

It turns out Ubuntu 24.04 and later ship the base image with a default `ubuntu` user already sitting on UID 1000. Nobody told me, because why would they. So before I could hand that UID to `vscode` I had to evict the squatter:

```dockerfile
# Ubuntu 24.04+ base images ship a default 'ubuntu' user at UID 1000; drop it
# so we can own UID 1000 with our predictable 'vscode' user.
RUN set -eux; \
    if id -u ubuntu >/dev/null 2>&1; then userdel -r ubuntu 2>/dev/null || true; fi; \
    useradd --uid 1000 --gid 1000 -m -s /bin/bash vscode; \
    echo "vscode ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/vscode; \
    chmod 0440 /etc/sudoers.d/vscode
```

The `id -u ubuntu` guard matters so this does not explode on an older base that never had the `ubuntu` user, and the `2>/dev/null || true` keeps it quiet either way. If you are building your first devcontainer on a modern Ubuntu base and your non-root user fails to take UID 1000, this is why. The fix is two lines, but finding out it was even a problem cost me a build. (If you are standing up a real Ubuntu 26.04 box rather than a container, I went through [locking one down](/blog/hardening-ubuntu-26-04-server/) separately.)

## Published is not the same as discoverable

Pushing the image does not make anyone able to find it. Findability is its own separate task, and again it splits across two surfaces that work nothing alike.

Docker Hub has no free-form topic tags. Its search indexes your short description and your overview, and the overview is just your README. The `dockerhub-description` step publishes both on every main build, so the Hub page never drifts from the repo. (Docker Hub Categories are the one thing with no API at all, so you set those once by hand in the UI and forget about them.)

GitHub uses repo topics, which you can set straight from the CLI:

```bash
gh repo edit OWNER/REPO \
  --description "Lean Ubuntu 26.04 LTS devcontainer base, multi-arch amd64/arm64" \
  --add-topic docker --add-topic devcontainer --add-topic ubuntu \
  --add-topic base-image --add-topic multi-arch --add-topic vscode
```

And lead the README with the one thing people actually came for, the pull command, plus a couple of shields.io badges up top:

```markdown
docker pull peculiarengineer/ubuntu-dev:26.04
```

## What I ended up with

One push to main, or a Monday at 06:00 UTC, now builds the image for amd64 and arm64, re-pulls the base so security updates land on their own, pushes `:26.04` and `:latest`, and syncs the Docker Hub description and overview. About 20 seconds on a warm cache. The repo is findable on GitHub through topics and on Docker Hub through the description, and a docs-permission failure can never block an image release. It is the same publish-on-push reflex I lean on everywhere else, like the way [this blog deploys itself to Cloudflare](/blog/deploy-this-blog-to-cloudflare-pages/) on every commit, or how I keep my [Plex stack running in Docker](/blog/plex-sabnzbd-docker-compose-hardware-transcoding/).

Three things to carry out of this: `pull: true` is the whole difference between a scheduled rebuild and a scheduled nap; the token that pushes your image is not the token that edits your Hub page; and "published" and "discoverable" are two separate jobs that each want doing. Set it once, then go a month without thinking about your base image again, which is exactly how a base image should feel.
