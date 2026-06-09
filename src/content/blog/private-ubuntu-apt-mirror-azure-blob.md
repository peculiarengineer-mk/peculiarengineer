---
title: 'Building a private Ubuntu APT mirror in Azure Blob Storage'
description: 'A snapshot-style Ubuntu APT mirror in Azure Blob Storage, synced by a containerized debmirror + azcopy job and served to a firewalled VM fleet over HTTPS — with every non-obvious bug I hit folded into the steps.'
pubDate: 'Jun 10 2026'
heroImage: '../../assets/ubuntu-azure-mirror-hero.jpg'
---

Some of the production VMs I'm responsible for sit in a deliberately restrictive
network. They can't reach `archive.ubuntu.com` or `download.docker.com`. They
can't reach Launchpad PPAs. Custom in-VNet DNS resolvers refuse to answer for
anything outside the corp namespace.

Useful security property. Inconvenient when a CVE drops on Friday afternoon and
you need to push a security update to 60 boxes.

The traditional answer is to stand up an apt-cacher-ng or a Squid in the
firewalled VNet and let it proxy to upstream. That works but it puts a stateful
piece of infrastructure in the critical path, makes you handle the cache disk,
the failover, the patching of the cache box itself. It also still requires that
*something* on the inside can reach outside.

I wanted a different answer: **a fully snapshot-style mirror of the bits we
actually use, sitting in Azure Blob Storage, served over HTTPS to the fleet via
a Private Endpoint**. The mirror is updated by a periodic job (a container) that
runs from a network where outbound is allowed, pulls from upstream with
`debmirror`, and pushes the delta to blob with `azcopy`.

This post walks through the build, step by step. By the end you'll have a
Dockerfile, a sync script, a third-party-repo example (Docker CE), and a
containerized end-to-end test. I've folded the non-obvious bugs I hit into the
steps where they're relevant, as `> **Watch out:**` callouts, so you can avoid
them on your first pass.

## Contents

- [Architecture, before we touch anything](#architecture-before-we-touch-anything)
- [Step 1: Bootstrap the Azure side](#step-1-bootstrap-the-azure-side)
- [Step 2: A minimal Dockerfile](#step-2-a-minimal-dockerfile)
- [Step 3: A first `sync.sh` that pulls one suite](#step-3-a-first-syncsh-that-pulls-one-suite)
- [Step 4: The two-pass `azcopy` upload](#step-4-the-two-pass-azcopy-upload)
- [Step 5: A host-side wrapper for local dev](#step-5-a-host-side-wrapper-for-local-dev)
- [Step 6: Verifying with a containerized client](#step-6-verifying-with-a-containerized-client)
- [Step 7: Adding a third-party repo — Docker CE](#step-7-adding-a-third-party-repo--docker-ce)
- [Step 8: Tightening the filter](#step-8-tightening-the-filter)
- [Step 9: Rolling out to a real fleet](#step-9-rolling-out-to-a-real-fleet)
- [What's still on the to-do list](#whats-still-on-the-to-do-list)
- [Why I'd do it again](#why-id-do-it-again)

## Architecture, before we touch anything

```
                ┌──────────────┐
upstream ─────► │ sync runner  │ ─── azcopy sync ──► Azure Blob Storage
(archive.ubuntu │ (container)  │                     (Hot tier, public+SAS or PE)
 .com,          │              │                           │
 docker.com)    │ debmirror    │                           │
                │ azcopy       │                           ▼
                └──────────────┘              ┌──────────────────────┐
                                              │  Fleet VMs (apt      │
                                              │  pointed at blob)    │
                                              │  no outbound needed  │
                                              └──────────────────────┘
```

A few choices that matter, before we start writing code:

- **Blob storage, Hot tier.** Apt indexes (`Release`, `InRelease`,
  `Packages.gz`) are read on every `apt-get update` — they want low latency. The
  `.deb`s themselves are read on install. Hot tier across the board is the
  cheapest right answer per dollar of engineering time; Cool/Archive tier would
  save a few cents per GB-month but adds rehydrate latency that breaks apt.
- **A single container** (one blob container resource) holds the Ubuntu main
  mirror at `/...` and any third-party repos beside it under prefixes like
  `/docker/`. One SAS scope, one access policy. Could be separate containers;
  the prefix approach is simpler.
- **`debmirror` as the puller, not a custom script.** It speaks the Debian
  archive layout natively, handles InRelease GPG verification end-to-end,
  computes deltas based on the upstream `Packages.gz`, and runs idempotently
  against a local mirror directory.
- **`azcopy sync` as the pusher, not `azcopy copy`.** `sync` does a server-side
  metadata diff and only ships what changed. Crucial when the local mirror is
  ~100GB per Ubuntu LTS suite.
- **A small Dockerfile that has both tools and the script.** Same image runs
  locally during development and as a scheduled job in production (Azure
  Container Apps Jobs in my case, but it's portable to any container scheduler).

With that decided, let's build.

## Step 1: Bootstrap the Azure side

You need three things in Azure before any code matters: a resource group, a
storage account, and a blob container. The script that creates them:

```bash
#!/usr/bin/env bash
set -euo pipefail

LOCATION="${LOCATION:-eastus2}"
RG="${RG:-rg-aptmirror}"
SA="${SA:-aptmirror$(openssl rand -hex 3)}"   # globally unique
CONTAINER="${CONTAINER:-ubuntu}"

az group create --name "$RG" --location "$LOCATION" -o table

az storage account create \
  --name "$SA" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --https-only true \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access true \
  -o table

az storage container create \
  --name "$CONTAINER" \
  --account-name "$SA" \
  --public-access blob \
  --auth-mode key \
  -o table

cat <<EOF

Done. Put these in your .env so the sync scripts find them:
  STORAGE_ACCOUNT=$SA
  BLOB_CONTAINER=$CONTAINER
EOF
```

Notes on the choices:

- **`Standard_LRS`** (locally-redundant). Geo-redundant storage doubles cost and
  we don't need it — the mirror can be rebuilt from upstream in an hour.
- **`access-tier Hot`** for the reasons above.
- **`public-access blob`** on the container makes individual blobs readable
  anonymously over HTTPS. This is fine if all you're serving is signed apt
  indexes (the signatures are the trust boundary). If your security review says
  no public access, drop this and serve via a Private Endpoint instead — apt
  doesn't care which one.
- **`allow-blob-public-access true`** on the account is the storage-account-level
  switch that has to be flipped on for container-level public access to take
  effect. Easy to miss.

After running this once, you put `STORAGE_ACCOUNT=aptmirror...` into a `.env`
file alongside the scripts. From here on everything reads those env vars.

## Step 2: A minimal Dockerfile

We need an image that has `debmirror`, `gpg` and the Ubuntu archive keyring (for
signature verification), `azcopy` (for the upload), and the Azure CLI (for
short-lived SAS minting during local dev). One layer:

```dockerfile
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
# TARGETARCH is populated by BuildKit (amd64 in production, arm64 on Apple
# Silicon during local development).
ARG TARGETARCH

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        debmirror \
        ubuntu-keyring \
        gpg gpg-agent \
        rsync patch ed \
        ca-certificates curl \
        lsb-release \
 && curl -sL https://aka.ms/InstallAzureCLIDeb | bash \
 && case "$TARGETARCH" in \
      amd64) AZCOPY_URL=https://aka.ms/downloadazcopy-v10-linux ;; \
      arm64) AZCOPY_URL=https://aka.ms/downloadazcopy-v10-linux-arm64 ;; \
      *) echo "unsupported TARGETARCH:$TARGETARCH" >&2; exit 1 ;; \
    esac \
 && curl -sL "$AZCOPY_URL" -o /tmp/azcopy.tgz \
 && tar -xzf /tmp/azcopy.tgz -C /tmp \
 && mv /tmp/azcopy_linux_${TARGETARCH}_*/azcopy /usr/local/bin/azcopy \
 && chmod +x /usr/local/bin/azcopy \
 && rm -rf /tmp/azcopy* /var/lib/apt/lists/*

COPY sync.sh /usr/local/bin/sync.sh
RUN chmod +x /usr/local/bin/sync.sh

ENV AZCOPY_AUTO_LOGIN_TYPE=AZCLI

ENTRYPOINT ["/usr/local/bin/sync.sh"]
```

Two things worth saying out loud:

- `TARGETARCH` is set automatically by BuildKit. The same Dockerfile builds on an
  Apple Silicon laptop (`arm64`) and on a Linux x86_64 build agent. The image is
  multi-arch friendly so the dev loop is fast on a Mac, and the production build
  is whatever the target platform asks for.
- `AZCOPY_AUTO_LOGIN_TYPE=AZCLI` tells `azcopy` to use whatever Azure CLI session
  it can find. In local dev we'll override that by passing a SAS token via env;
  in production the job runs with a managed identity that has Storage Blob Data
  Contributor on the container, and `azcopy` finds the identity automatically.

We'll add `sync.sh` next.

## Step 3: A first `sync.sh` that pulls one suite

Let's start with the bare minimum — one suite (`noble`, which is 24.04 LTS), main
section only, no excludes, no upload yet. Just prove `debmirror` works.

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${STORAGE_ACCOUNT:?STORAGE_ACCOUNT must be set}"
: "${BLOB_CONTAINER:=ubuntu}"

MIRROR_ROOT="/data/mirror"

echo "[sync] $(date -u +%FT%TZ) pulling noble (main, amd64) from azure.archive.ubuntu.com"

debmirror \
    --method=http \
    --host=azure.archive.ubuntu.com \
    --root=ubuntu \
    --dist=noble \
    --section=main \
    --arch=amd64 \
    --no-source \
    --i18n \
    --getcontents \
    --rsync-extra=none \
    --keyring=/usr/share/keyrings/ubuntu-archive-keyring.gpg \
    --progress \
    "$MIRROR_ROOT"

echo "[sync] $(date -u +%FT%TZ) mirror size on disk:"
du -sh "$MIRROR_ROOT"
```

A few choices to call out:

- **`--host=azure.archive.ubuntu.com`** instead of `archive.ubuntu.com`.
  Canonical and Microsoft run a regional mirror of the Ubuntu archive inside
  every Azure region, reachable from inside Azure without hairpinning out to the
  public internet. The sync runs **3–5× faster** from inside Azure if you point
  at the regional mirror instead of the canonical one.
- **`--keyring=/usr/share/keyrings/ubuntu-archive-keyring.gpg`** is what makes
  this trustworthy. `debmirror` won't accept a `Release` file whose GPG signature
  doesn't verify against the keyring. If upstream were ever compromised, the
  signature check fails and the sync aborts — we never mirror tampered bits.
- **`--getcontents`** pulls the `Contents-amd64.gz` index files that
  `apt-file search` uses. Worth the small size cost.
- **`--i18n`** pulls translation files so `apt install foo` shows a localized
  description. Otherwise apt prints "(no description available)".
- **`--no-source`** because we ship a binary mirror. If your fleet builds
  packages, you'd want source too.
- **`--rsync-extra=none`** because we're not serving over rsync.

This is enough to produce a valid mirror tree at `/data/mirror`. It looks like:

```
/data/mirror/
├── dists/
│   └── noble/
│       ├── Release
│       ├── Release.gpg
│       ├── InRelease
│       └── main/
│           └── binary-amd64/
│               ├── Packages
│               ├── Packages.gz
│               └── ...
└── pool/
    └── main/
        └── a/
            └── adduser/
                └── adduser_3.137ubuntu1_all.deb
        └── ... (every package, organized by first letter)
```

It's the Debian archive layout, byte-for-byte, with our exclude rules applied. We
haven't uploaded any of it yet — that's next.

## Step 4: The two-pass `azcopy` upload

Now we extend the script to push the mirror tree to blob storage. The naive
version is one `azcopy sync` call — but there's a subtle ordering hazard that
matters in production. Let's do it properly.

The hazard: **clients reading the mirror mid-upload should never see a `Release`
file that references a `.deb` we haven't uploaded yet.** The `Release` file is
the apex of trust — it lists hashes of `Packages.gz`, which in turn references
files in `pool/`. If we upload the new `Release` before we upload the new
`.deb`s, an in-flight `apt-get update` on a client will fetch `Packages.gz`, try
to install a referenced package, and get a 404 from blob.

The fix is two passes:

1. **Pass 1** uploads everything *except* the per-suite `Release`, `Release.gpg`,
   and `InRelease` files. After this pass, the new `.deb`s are all in place, but
   clients still see the *old* `Release` (if any), which points at the *old*
   `.deb`s (also still in place, because pass 1 was additive). Old state is fully
   consistent.
2. **Pass 2** uploads only the three index files. At the moment pass 2 finishes,
   the client's view atomically switches from old state to new state.

```bash
BLOB_URL="https://${STORAGE_ACCOUNT}.blob.core.windows.net/${BLOB_CONTAINER}"

# Auth: SAS for local dev (mounted via env), managed identity in production.
if [[ -n "${AZURE_STORAGE_SAS:-}" ]]; then
  echo "[sync] using SAS auth for azcopy"
  AZCOPY_DEST="${BLOB_URL}?${AZURE_STORAGE_SAS}"
  unset AZCOPY_AUTO_LOGIN_TYPE
else
  echo "[sync] using AZCLI/managed-identity auth for azcopy"
  AZCOPY_DEST="${BLOB_URL}"
fi

# Pass 1: package tree, excluding the per-suite index files.
echo "[sync] $(date -u +%FT%TZ) pass 1/2: uploading package tree"
azcopy sync \
  "${MIRROR_ROOT}/" \
  "${AZCOPY_DEST}" \
  --recursive=true \
  --exclude-pattern='Release;Release.gpg;InRelease'

# Pass 2: ONLY the index files. Atomic flip from client's perspective.
echo "[sync] $(date -u +%FT%TZ) pass 2/2: uploading Release/InRelease last"
azcopy sync \
  "${MIRROR_ROOT}/" \
  "${AZCOPY_DEST}" \
  --recursive=true \
  --include-pattern='Release;Release.gpg;InRelease'
```

> **Watch out: don't add `--delete-destination=true` to pass 2.** This is the one
> bug I want you to absolutely avoid, because the failure mode is silent and
> ruinous.
>
> `--delete-destination=true` looks sensible. "If a file exists at the
> destination but not in source, remove it" — normal sync semantics. But when
> combined with `--include-pattern`, `azcopy` interprets the rule as: *across the
> entire container, delete any file whose name matches the pattern and isn't at
> this exact relative path in the local source.*
>
> If you ever run a smaller-scoped sync — say, you're testing a bionic-only run —
> your local source only has `dists/bionic/Release`. The blob has
> `dists/{noble,jammy,focal,...,bionic}/Release`. The sync looks at every
> `Release` file in the blob, sees they're "not in source," and **deletes them
> all** except bionic's. The first time I made this mistake, 24 Release files
> vanished from the blob in one azcopy job. Apt clients across the fleet started
> getting `404 The specified blob does not exist` on `noble Release`. The `.deb`s
> in `pool/` were all fine — only the index files were gone.
>
> The principle is broader than this one bug: **`azcopy`'s `--delete-destination`
> operates on the visible filesystem at the destination, not on the conceptual
> scope of your sync command.** Combine it with any pattern flag and you're
> saying "delete things outside my scope that match a pattern." Almost certainly
> not what you meant.
>
> Both passes should be additive only. If you really want to garbage-collect
> orphaned `.deb`s from `pool/` after a package gets removed upstream, do it as a
> separate, explicit operation, not as a side effect of an
> `--include-pattern`-scoped sync.

With pass 2 done, you've got a complete mirror at
`https://<sa>.blob.core.windows.net/<container>/`. A client can be pointed at it
with:

```
deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] \
    https://<sa>.blob.core.windows.net/<container> noble main
```

—and `apt-get update && apt-get install something` works.

## Step 5: A host-side wrapper for local dev

In production the sync container runs in Azure Container Apps Jobs (or whatever
scheduler you like), and its managed identity has `Storage Blob Data Contributor`
on the container. No SAS, no key juggling.

In local dev that's clunky — I want to iterate on the script without re-deploying
the job each time. So there's a small host-side wrapper that mints a short-lived
SAS, builds the image, and runs the container with the SAS injected via env:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/.env" ]] && set -a && . "$SCRIPT_DIR/.env" && set +a

: "${STORAGE_ACCOUNT:?set STORAGE_ACCOUNT in .env}"
BLOB_CONTAINER="${BLOB_CONTAINER:-ubuntu}"

mkdir -p ./data    # persisted across runs so deltas are fast

# Mint a 4-hour container SAS. Uses the storage account key (so the host
# needs Reader/Contributor on the storage account — no RBAC role
# assignment required).
EXPIRY=$(date -u -v+4H +%Y-%m-%dT%H:%MZ 2>/dev/null \
       || date -u -d '+4 hours' +%Y-%m-%dT%H:%MZ)

AZURE_STORAGE_SAS=$(az storage container generate-sas \
  --account-name "$STORAGE_ACCOUNT" \
  --name "$BLOB_CONTAINER" \
  --permissions rwdl \
  --expiry "$EXPIRY" \
  --auth-mode key \
  -o tsv)
export AZURE_STORAGE_SAS

docker build -t ubuntu-mirror-sync:latest .

docker run --rm \
  -v "$(pwd)/data:/data" \
  -v "$HOME/.azure:/root/.azure" \
  -e STORAGE_ACCOUNT \
  -e BLOB_CONTAINER \
  -e AZURE_STORAGE_SAS \
  ubuntu-mirror-sync:latest
```

The `./data:/data` mount is what makes incremental syncs fast — `debmirror` only
re-fetches files whose hashes have changed upstream, and `azcopy sync` only
uploads what's new. A first sync of `noble` main might take an hour and pull
~50 GB; the next day's sync takes a few minutes and pulls a few hundred MB of
deltas.

## Step 6: Verifying with a containerized client

You can't ship a mirror without a way to **prove** it works end-to-end — from a
fresh, untouched apt client, with the real signatures, against the real blob URL.
Here's the test:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Reads STORAGE_ACCOUNT and BLOB_CONTAINER from .env, same as before.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/.env" ]] && set -a && . "$SCRIPT_DIR/.env" && set +a
MIRROR_URL="https://${STORAGE_ACCOUNT}.blob.core.windows.net/${BLOB_CONTAINER}"
SUITE="${1:-noble}"

case "$SUITE" in
  noble)  image="ubuntu:24.04" ;;
  jammy)  image="ubuntu:22.04" ;;
  focal)  image="ubuntu:20.04" ;;
  bionic) image="ubuntu:18.04" ;;
  *) echo "unknown suite: $SUITE" >&2; exit 2 ;;
esac

# --platform forces amd64 because the mirror is amd64-only. Without this,
# Docker on Apple Silicon would pull an arm64 base image and apt would
# look for arm64 .debs that don't exist in our mirror.
docker run --rm --platform linux/amd64 "$image" bash -euo pipefail -c "
# Default Ubuntu base images don't ship ca-certificates. Bootstrap from
# the default (public) archive so curl/apt can talk HTTPS to our mirror.
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates >/dev/null

# Wipe the default sources and point ONLY at the mirror.
rm -f /etc/apt/sources.list /etc/apt/sources.list.d/*.sources \
      /etc/apt/sources.list.d/*.list

cat > /etc/apt/sources.list.d/ubuntu.list <<EOF
deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] ${MIRROR_URL} ${SUITE} main
deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] ${MIRROR_URL} ${SUITE}-updates main
deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] ${MIRROR_URL} ${SUITE}-security main
EOF

apt-get update                  # exercises GPG verification of the mirror
apt-get install -y --no-install-recommends htop

# Assert the installed package actually resolved from the mirror, not
# from some default source we forgot to delete.
if apt-cache policy htop | grep -q '${MIRROR_URL}'; then
  echo 'OK: htop resolved from mirror'
else
  echo 'FAIL: htop did NOT resolve from mirror'; exit 1
fi
"
echo "[test] PASS — ${SUITE}/main/amd64"
```

What this gives you that a local-side test can't: it's a clean Ubuntu image you
don't control. The container has no cached apt indexes, no pre-trusted GPG keys
beyond what ships with `ubuntu:24.04`, no leftover sources. If `apt-get update`
succeeds, then your mirror is publishing a correctly-signed `Release` file. If
`apt install htop` succeeds, then your mirror has the `.deb` referenced by
`Packages.gz` and the hashes match. If the policy check passes, then the package
actually came from the blob URL and not from some path you forgot to disable.

Run this against each Ubuntu LTS suite you support, in CI if you have it. It
catches mirror regressions faster than anything else.

> **Watch out: `--platform linux/amd64` is non-optional on Apple Silicon.** The
> mirror is amd64-only (that's most fleets). Without the platform flag, Docker on
> M-series Macs pulls an arm64 base image, apt looks for arm64 `.deb`s that don't
> exist in your mirror, and you spend an hour wondering why your perfectly-fine
> mirror "doesn't work." Took me embarrassingly long to figure out the first
> time.

## Step 7: Adding a third-party repo — Docker CE

The same pattern handles any other `.deb` repo you need to mirror. Docker CE is
the worked example here because it's the third-party repo I needed; the same
shape applies to anything else that publishes a signed apt repo (HashiCorp,
NodeSource, PostgreSQL's apt.postgresql.org, etc.).

Docker publishes per Ubuntu codename with `stable`, `test`, and `edge` channels:

```
https://download.docker.com/linux/ubuntu/dists/{noble,jammy,focal,bionic}/{stable,test,edge}/...
```

The script imports Docker's GPG key, runs `debmirror` once per suite, and uploads
under a `/docker/` prefix in the same blob container as the Ubuntu mirror:

```bash
#!/usr/bin/env bash
set -euo pipefail

SUITES="${SUITES:-noble,jammy,focal,bionic}"
CHANNEL="${CHANNEL:-stable}"

: "${STORAGE_ACCOUNT:?}"
: "${BLOB_CONTAINER:=ubuntu}"

MIRROR_ROOT="/data/docker-mirror"
BLOB_PREFIX="docker"
BLOB_URL="https://${STORAGE_ACCOUNT}.blob.core.windows.net/${BLOB_CONTAINER}/${BLOB_PREFIX}"

# (Auth setup identical to sync.sh — SAS in dev, managed identity in prod.)

# Docker's release signing key. We also publish it into the blob so
# firewalled clients can fetch it from the mirror itself, rather than
# reaching download.docker.com.
KEYRING=/tmp/docker-keyring.gpg
mkdir -p "$MIRROR_ROOT"
KEY_ASC="$MIRROR_ROOT/gpg"
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$KEY_ASC"
gpg --no-default-keyring --keyring "$KEYRING" --import "$KEY_ASC"

IFS=',' read -ra SUITE_ARR <<< "$SUITES"
for suite in "${SUITE_ARR[@]}"; do
  debmirror \
      --method=https \
      --host=download.docker.com \
      --root=/linux/ubuntu \
      --dist="$suite" \
      --section="$CHANNEL" \
      --arch=amd64 \
      --no-source --i18n \
      --rsync-extra=none \
      --keyring="$KEYRING" \
      --progress \
      "$MIRROR_ROOT"
done

# Two-pass azcopy, same as sync.sh, same hazards, same fix.
```

The detail that's worth lingering on: **we publish the upstream signing key into
the blob alongside the `.deb`s.** A first pass at this might not bother. The
thinking is "clients already trust the apt-archive keyring; they only need
Docker's GPG key once during VM provisioning, and they can fetch it from
`download.docker.com`."

That logic falls apart for a firewalled fleet. The provisioning step
`curl -fsSL https://download.docker.com/linux/ubuntu/gpg` requires reaching
`download.docker.com` — exactly what the firewall blocks. Two options:

1. Bake the key into the VM gold image. Works, but now your image is coupled to a
   third-party repo's key-rotation cadence.
2. Publish the key into the blob next to the `.deb`s. The same Private Endpoint
   that serves the packages also serves the trust anchor for them.

The second is cleaner — one ingress, one consistent provisioning path. So we drop
the key into `$MIRROR_ROOT/gpg`, and `azcopy sync` pushes it up alongside
everything else.

Client-side bootstrap on a fleet VM becomes:

```bash
curl -fsSL https://<sa>.blob.core.windows.net/ubuntu/docker/gpg \
  | gpg --dearmor | sudo tee /usr/share/keyrings/docker.gpg >/dev/null

echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/docker.gpg] \
      https://<sa>.blob.core.windows.net/ubuntu/docker noble stable' \
  | sudo tee /etc/apt/sources.list.d/docker.list
```

Same shape for any other third-party repo you add. The key publish step is the
one most people miss the first time.

## Step 8: Tightening the filter

The bare `debmirror` from Step 3 is correct but bigger than it needs to be.
Ubuntu publishes kernel packages for `aws`, `gcp`, `oracle`, `kvm`,
`lowlatency`, `raspi`, and so on. We're on Azure and we use the `azure` kernel
flavor — we don't need any of the others. The same goes for `nvidia-*` packages,
debug-symbol packages (`*-dbgsym`), and CPU microcode firmware for hardware we
don't own.

Adding excludes to `debmirror`:

```bash
# Cloud-kernel flavors we DON'T need (Azure fleet only).
# Ubuntu uses two naming conventions for flavor packages:
#   suffix:  linux-image-6.8.0-52-lowlatency   (version-specific binary)
#   prefix:  linux-lowlatency-tools-6.8.0-52   (flavor-rooted package)
# We need to exclude both forms.
FLAVORS='aws|gcp|oracle|kvm|lowlatency|raspi|ibm|intel-iotg|nvidia|starfive|laptop|realtime'
EXCLUDE_KERNELS_SUFFIX="/linux-(image|modules|headers|tools|cloud-tools|buildinfo|source|libc-dev)-.*-(${FLAVORS})([-_]|\$)"
EXCLUDE_KERNELS_PREFIX="/linux-(${FLAVORS})([-_]|\$)"

# Other large families we don't need for headless Azure VMs.
EXCLUDE_FAMILIES='^(.*/)?(nvidia-|libnvidia-|amd64-microcode|intel-microcode_)'

# Debug symbol packages — huge, never needed in prod.
EXCLUDE_DBG='-dbgsym_'

debmirror \
    ...  # everything from Step 3
    --exclude="$EXCLUDE_KERNELS_SUFFIX" \
    --exclude="$EXCLUDE_KERNELS_PREFIX" \
    --exclude="$EXCLUDE_FAMILIES" \
    --exclude="$EXCLUDE_DBG" \
    --progress \
    "$MIRROR_ROOT"
```

Practical effect: the mirror shrinks by roughly 50%. On
`noble + noble-updates + noble-security` main, the difference for my fleet was
something like 100 GB → 50 GB. Pure win — we never install any of the excluded
packages, so we're not shipping them around to no purpose.

You'd tighten this further for your own fleet. If you only run a specific Ubuntu
LTS, drop the others. If you don't use Java, exclude the openjdk pool path. Each
exclude is a regex, applied against the package's pool path in the mirror tree.

## Step 9: Rolling out to a real fleet

This is where bugs cluster. The mirror itself is correct after Step 8 — verified
by Step 6. But pointing real production VMs at it almost always uncovers state on
those boxes that's been broken for a long time and nobody noticed. Here's the
sequence, with the four bugs I hit on the actual rollout, in order.

### 9.1 Confirm DNS works

Pick a representative VM and resolve the blob hostname:

```
$ resolvectl query <sa>.blob.core.windows.net
```

If it returns an IP, you're golden. If it returns "Lookup failed" or times out,
you have a problem upstream of apt. Two common shapes:

> **Watch out: stale DHCP lease pretending to be a DNS problem.** The first time
> I saw this, the symptom was that `resolvectl status` listed two `172.x` DNS
> servers that timed out for everything outside the corp namespace. I started
> designing a fix at the network plane — Private Endpoint, Private DNS Zone, the
> usual.
>
> Then I checked the NIC's actual Azure-side DNS settings: `10.128.26.4` and
> `10.128.26.5`. Reachable. *Not* what the VM was using.
>
> The mismatch lived in `/run/systemd/netif/leases/2` — a DHCP lease from months
> earlier, when the NIC's DNS *had* been the `172.x` servers. Someone updated the
> NIC config in Azure since then. systemd-networkd happily kept using the cached
> lease values. The fix was one command:
>
> ```
> networkctl renew eth0
> resolvectl flush-caches
> ```
>
> Lesson: **Azure NIC settings push to the VM via DHCP, not by writing into the
> VM's filesystem.** A NIC config change that isn't followed by a lease renew (or
> a VM reboot) doesn't take effect inside the guest. The two views of the world
> diverge and stay diverged, sometimes for months, until something forces the
> issue. Check the actual DHCP lease, not just `resolvectl`.

If your VNet legitimately doesn't have DNS for the storage account, the long-term
fix is a Private Endpoint plus a linked Azure Private DNS Zone
(`privatelink.blob.core.windows.net`). That way the storage hostname resolves to
a private IP from inside the VNet.

### 9.2 Confirm reachability

```
$ curl -I https://<sa>.blob.core.windows.net/<container>/dists/noble/Release
HTTP/1.1 200 OK
```

If you get `(28) Resolving timed out`, go back to 9.1. If you get a
`Could not connect to localhost:3142`, you've hit the next bug:

> **Watch out: phantom apt-cacher-ng proxy hooks.** Every box in my fleet had
> `/etc/apt/apt.conf.d/01proxy` pointing apt at `localhost:3142` — the default
> port for `apt-cacher-ng`. Looked deliberate, like an intentional caching layer.
>
> Except: `dpkg -s apt-cacher-ng → not installed`. `systemctl status
> apt-cacher-ng → Unit could not be found`. The proxy config was in the gold
> image but the cacher was never installed on any box. apt had been silently
> broken on the entire fleet for over a year. Every `apt update` and
> `apt install` failed against `localhost:3142 connection refused`, and nobody
> noticed because nobody was running them.
>
> The mirror rollout uncovered this only because it forced a real `apt-get update`
> against the new sources. Lesson: **when you inherit a fleet, the presence of
> `apt.conf.d/*` files doesn't tell you the apt path actually works.** Do at least
> one `apt-get update` on every box before you trust anything.
>
> Fix in our case: back up the file (`cp 01proxy /var/backups/...`), then
> `rm /etc/apt/apt.conf.d/01proxy`.

### 9.3 Back up, then rewrite sources

Cheap insurance:

```
$ tar czf /var/backups/apt-config-$(date -u +%Y%m%dT%H%M%SZ).tar.gz /etc/apt/
```

Then write the new sources. Single file, deb822 format, points only at the
mirror. For noble (24.04):

```
$ cat > /etc/apt/sources.list.d/ubuntu.sources <<EOF
Types: deb
URIs: https://<sa>.blob.core.windows.net/<container>
Suites: noble noble-updates noble-security
Components: main
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
EOF
$ rm /etc/apt/sources.list  # the legacy file
```

`apt-get update` should now hit the mirror cleanly and return without errors.

### 9.4 Fix the pre-existing broken-dep cascade

The first `apt install <anything>` after the cutover often fails like this:

```
You might want to run 'apt --fix-broken install' to correct these.
The following packages have unmet dependencies:
 docker-ce : Depends: docker-ce-cli but it is not installable
 e2fsprogs : PreDepends: libext2fs2t64 (= 1.47.0-2.4~exp1ubuntu4)
             but 1.47.0-2.4~exp1ubuntu4.1 is to be installed
 libpam-modules : PreDepends: libpam-modules-bin (= 1.5.3-5ubuntu5.1)
                  but 1.5.3-5ubuntu5.4 is to be installed
 vim : Depends: vim-runtime (= 2:9.1.0016-1ubuntu7.8)
       but 2:9.1.0016-1ubuntu7.1 is to be installed
E: Unmet dependencies.
```

apt refuses to install anything new while the system has unmet deps. That's a
safety property, not a bug — but it means the very first `apt install` against
your new mirror will stare at a backlog of half-applied partial upgrades from
before the mirror existed.

The recovery sequence I converged on:

```bash
# 1. Resolve as many broken deps as can be resolved against the mirror.
apt-get install -f -y \
  -o Dpkg::Options::="--force-confold"

# 2. Apply the full pending upgrade.
apt-get upgrade -y \
  -o Dpkg::Options::="--force-confold" \
  -o Dpkg::Options::="--force-confdef"

# 3. For packages held back by `upgrade` because they need new deps
#    (kernel updates do this often), full-upgrade.
apt-get full-upgrade -y \
  -o Dpkg::Options::="--force-confold" \
  -o Dpkg::Options::="--force-confdef"

# If a kernel landed in step 3, reboot.
```

> **Watch out: conf file prompts kill `az vm run-command`.** When dpkg upgrades a
> package whose config file has been locally modified, it prompts:
>
> ```
> Configuration file '/etc/foo/foo.yaml'
>   ==> Modified (by you or by a script) since installation.
>   ==> Package distributor has shipped an updated version.
> *** foo.yaml (Y/I/N/O/D/Z) [default=N] ?
> ```
>
> Running this through `az vm run-command invoke` (or any non-interactive shell),
> there's no tty, dpkg sees EOF on stdin and aborts. The package ends up in a `iU`
> (unpacked, awaiting config) state, and now `dpkg --audit` lists a broken
> package.
>
> The `--force-confold` option above is what prevents this. It tells dpkg: "if
> you ever face this prompt, keep the local file silently." `--force-confnew` does
> the opposite. Pick one based on what you'd answer at the prompt if you were
> there.

### 9.5 Don't pick the first version when reading Packages.gz

If you have to install a package directly via `dpkg -i` (for example, to break a
dep cycle that apt's solver can't resolve), and you're parsing the mirror's
`Packages.gz` yourself to find the `.deb`, watch this carefully:

```bash
# WRONG — picks the OLDEST version.
fn=$(awk -v p="$pkg" '
  BEGIN { f=0 }
  /^Package: /  { cur=$2; f = (cur==p) ? 1 : 0 }
  f && /^Filename:/ { print $2; exit }
' Packages)
```

`Packages.gz` lists every version of every package the repo has ever shipped, in
**ascending** order. The first entry is the oldest. My first version of this awk
happily downgraded `docker-ce` from `28.3.3` to `26.0.0` (the first stable Docker
ever published for noble) and I didn't notice until I checked `docker version`
afterwards.

The fix is to keep the last match instead:

```bash
# RIGHT — picks the NEWEST version.
fn=$(awk -v p="$pkg" '
  BEGIN { f=0 }
  /^Package: /  { cur=$2; f = (cur==p) ? 1 : 0 }
  f && /^Filename:/ { last=$2 }
  END { print last }
' Packages)
```

> **Watch out: a repo's `Packages.gz` is a *history*, not a *manifest*.** Apt uses
> the `Release` file's `Version-Compare` semantics to decide which entry is
> "current." If you skip apt and read `Packages.gz` directly, you have to do that
> comparison yourself, or you'll pick something arbitrary — and arbitrary is
> usually wrong.

## What's still on the to-do list

Things I haven't done yet but would tackle for a longer-running deployment:

- **Garbage-collect orphaned `.deb`s from `pool/`.** The current sync is additive
  only. Old package versions never get cleaned up. Storage cost is finite and not
  catastrophic — main is ~50GB per LTS suite — but it grows. A separate, explicit
  cleanup script that parses every current `Packages.gz` and deletes pool files
  no longer referenced is the right shape.
- **Ubuntu Pro / ESM.** Bionic (18.04) main is frozen as of April 2023; security
  fixes for it come through ESM, which is auth-gated and currently unmirrored.
  Would require pulling from `esm.ubuntu.com/infra` with the right machine-token
  credentials. If you have bionic boxes in production, this matters.
- **Multi-arch.** Currently amd64 only. Adding arm64 is a flag change in
  `debmirror` and roughly doubles the mirror size.
- **CI for the test scripts.** They're easy to run locally but should also gate
  the periodic sync job — sync, then verify, then publish a green/red signal.
- **Observability on the periodic sync.** Right now the only signal is whether the
  container's exit code is 0. Worth at least emitting the mirror size, the last
  successful sync timestamp, and the count of upgraded packages per suite to a
  metrics endpoint.

## Why I'd do it again

The total LOC of the finished thing is small — maybe 400 lines of bash spread
across the sync scripts and a Dockerfile. The architecture is dumb on purpose:
scheduled job pulls upstream, scheduled job pushes to blob, clients consume from
blob. There is no application layer. No cache invalidation. No watchdog. No
control plane. The mirror is a snapshot of bytes in object storage, and a
`Release` file's GPG signature is the contract that those bytes are authentic.

In exchange for those 400 lines, the fleet:

- Gets package updates without ever reaching outside the firewalled VNet.
- Gets Docker and any other third-party `.deb` repos through the same single
  ingress point.
- Doesn't depend on an apt-cacher-ng box that someone has to keep alive.
- Doesn't have any new long-lived stateful infrastructure to monitor — Azure
  Blob's SLA is the SLA.

The mirror is unexciting to operate. That's the goal. `[ MIRROR OK ]`
