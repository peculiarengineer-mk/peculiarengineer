---
title: 'Running Untrusted Ebooks and Calibre in Production: gVisor, Second Origin, and Per-Lane Egress on K3s'
description: 'How I isolated Calibre, ebook archive parsing, and user-uploaded EPUB rendering in Bookary on K3s: zero-env calibre-svc under gVisor, a cross-origin reader iframe with length-preserving meta sanitization, per-lane Postgres roles, and Squid CONNECT allowlists.'
pubDate: 'Nov 17 2026'
heroImage: '../../assets/untrusted-ebooks-k3s-hero.png'
tags: ['Kubernetes', 'K3s', 'Security', 'Hardening', 'gVisor', 'Squid', 'Calibre', 'Cloudflare', 'R2', 'Linux']
---

An EPUB is not a text file. It is a ZIP archive full of arbitrary XHTML, CSS, SVG and fonts that you hand straight to a parser on your backend and a layout engine in a reader's browser. A CBZ is a ZIP of images. A CBR is a RAR archive going into `bsdtar`. A MOBI or AZW3 goes straight into Calibre.

When you run a hosted ebook library like [Bookary](https://app.bookary.io), every uploaded file is untrusted input. Parsing it inside the web pod means one bad archive can crash the API, read database credentials out of the environment, or run script inside your authenticated origin.

This post documents the four isolation boundaries I put in place on a single-node K3s cluster so a compromised parser or a crafted book lands somewhere with no credentials, no database route, and nowhere useful to call out.

> **TL;DR.** Never run Calibre or archive extractors in your web pod, and never render user-uploaded books on the same origin that holds auth cookies. In Bookary, `calibre-svc` runs with zero environment variables, zero secrets, a read-only rootfs, a memory `emptyDir` scratch mount, and presigned URLs over an internal nginx listener; the four parser deployments run under gVisor (`runsc`); the browser reader lives on a separate origin (`books.bookary.io`) behind a `MessageChannel` protocol; and every background worker lane gets its own Postgres role and its own Squid `CONNECT` port.

## Contents

- [1. Lock down calibre-svc: no DB, no secrets, no env vars](#1-lock-down-calibre-svc-no-db-no-secrets-no-env-vars)
- [2. Put the parsers under gVisor (runsc)](#2-put-the-parsers-under-gvisor-runsc)
- [3. Serve the browser reader from a second origin](#3-serve-the-browser-reader-from-a-second-origin)
- [4. Split background workers by Postgres role and Squid port](#4-split-background-workers-by-postgres-role-and-squid-port)
- [Where things live](#where-things-live)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## 1. Lock down calibre-svc: no DB, no secrets, no env vars

Calibre does format conversion and metadata extraction well, and its runtime pulls in Python, C++, Qt and Chromium for PDF output. That is a big parser surface to feed user uploads to. Keeping `ebook-convert` in the same container as your database connection string or R2 keys means a parser bug turns into a data breach.

`calibre-svc` runs in its own Deployment (`k8s/base/calibre-svc.yaml`) with three hard rules:

1. **Zero environment variables and zero secrets.** There is no `env:` and no `envFrom:` on the container. Every limit (`MAX_CONCURRENT_CONVERSIONS = 2`, 480-second wall clock, 2 GiB `RLIMIT_AS` per conversion child) is baked into Python constants. If execution lands inside `calibre-svc`, `/proc/self/environ` holds no database URLs, no R2 keys and no service topology.
2. **No API token and a read-only root filesystem.** The pod sets `automountServiceAccountToken: false`, `runAsUser: 10001`, `runAsGroup: 10001`, `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, drops `ALL` capabilities, and mounts `readOnlyRootFilesystem: true`. The only writable path is `/scratch`, backed by a `1536Mi` `medium: Memory` `emptyDir`, so converted book bytes never sit on a persistent node disk.
3. **Presigned URLs only, through an internal nginx listener.** `calibre-svc` holds no S3 library and no R2 credentials. The conversion worker creates a presigned GET for the original and a presigned PUT for the output, rewrites both URLs to `http://books-cdn:8090`, and passes just those two URLs to `POST /convert`.

```text
worker-conversion ──POST /convert──▶ calibre-svc (gVisor, no secrets, no internet)
                                         │
                                    urllib GET/PUT (presigned URLs)
                                         ▼
                                    books-cdn:8090 ──▶ egress-proxy:8448 ──▶ R2
```

Here is the NetworkPolicy (`k8s/policies/calibre-svc.yaml`) enforcing that path at L3/L4:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: calibre-svc
  namespace: bookary
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: bookary
      app.kubernetes.io/component: calibre-svc
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: bookary
              app.kubernetes.io/component: worker
              bookary.dev/lane: conversion
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: bookary
              app.kubernetes.io/component: books-cdn
      ports:
        - protocol: TCP
          port: 8090
```

`calibre-svc` cannot open a TCP socket to Postgres, cannot talk to the Kubernetes API, and cannot dial public port 443. On the `books-cdn` side, port `8090` accepts traffic only from `calibre-svc` and is never exposed through Traefik.

## 2. Put the parsers under gVisor (runsc)

Seccomp and dropping capabilities still share the host Linux kernel across containers. When pods unpack arbitrary ZIPs, RAR archives, PDFs and images, a parser bug paired with a kernel bug is still game over on a single-node cluster.

In production, `k8s/overlays/production/runtimeclass-gvisor.yaml` defines a `gvisor` `RuntimeClass`:

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
scheduling:
  nodeSelector:
    bookary.dev/gvisor: "true"
overhead:
  podFixed:
    memory: 64Mi
    cpu: 50m
```

Only the four deployments that parse untrusted user files get `runtimeClassName: gvisor`:

- `calibre-svc` (Calibre conversions, metadata extraction, cover extraction)
- `worker-ingest` (EPUB/PDF/CBZ header inspection, thumbnail rendering, nightly static upload security scan)
- `worker-pages` (comic archive extraction and in-process ONNX panel detection)
- `worker-conversion` (conversion orchestration and CBR-to-CBZ repacks)

The web pod, auth/mail worker and Postgres stay on the standard runtime so everyday HTTP requests and database queries do not pay the gVisor syscall overhead. Setting `nodeSelector: bookary.dev/gvisor: "true"` also ensures parser pods fail closed into `Pending` if `runsc` is missing on a node, rather than silently running unsandboxed.

## 3. Serve the browser reader from a second origin

Backend sandboxing does nothing if a user's browser renders an untrusted EPUB on your authenticated domain. An EPUB section is XHTML. Put it on `app.bookary.io` and a missed script tag or SVG trick runs right alongside your auth cookies and `/api/v1` endpoints.

In Bookary, the entire reader (`services/reader-shell`) is served by a separate nginx Deployment on `books.bookary.io`:

- **Containment comes from the second origin, not the `sandbox` attribute.** `app.bookary.io` embeds `https://books.bookary.io/_shell/reader.html?app=https://app.bookary.io` with `sandbox="allow-scripts allow-same-origin"`. Because the iframe is genuinely cross-origin, `iframe.contentDocument` returns `null` from the app side, and `window.parent.location` throws `SecurityError` from the shell side. If you ever accidentally serve both from the same origin, `allow-scripts allow-same-origin` disables the sandbox completely.
- **No book bytes cross the app origin.** Browser downloads and reader fetches go directly to presigned URLs proxied through `books-cdn` on `books.bookary.io`. (If you scope R2 tokens by bucket, my [rclone with Cloudflare R2 post](/blog/rclone-cloudflare-r2-ubuntu-26-04/) covers how R2 permissions and presigned URLs behave.)
- **All communication goes through a `MessageChannel` handshake.** On load, the shell waits for a `connect` message from the exact `?app=` origin and trades a `MessagePort`. Page turns, highlights, search queries and comic panel steps all travel across that port as typed JSON envelopes (`channel: "bookary-reader", v: 1`).

### The `<meta http-equiv="refresh">` trap

Even with `script-src 'self'` and `form-action 'none'` on `books.bookary.io`, an EPUB section carrying this in `<head>` broke the reader:

```html
<meta http-equiv="refresh" content="1">
```

Chrome blocks the navigation away from the `blob:` document, and then replaces the frame with `chrome-error://chromewebdata/` anyway. With `content="1"`, it re-destroys the frame every second and sent `foliate-js`'s paginator into a layout storm (242 `ResizeObserver` errors measured in 5 seconds).

Deleting the `<meta>` tag or re-serialising the XHTML through `DOMParser` would break something else: EPUB Canonical Fragment Identifiers (CFIs), which store both reading progress and highlights, depend on element child indices and text character offsets.

The fix in `services/reader-shell/app/section-transform.js` hooks `foliate-js`'s `book.transformTarget` before `URL.createObjectURL` and renames `http-equiv` to `data-equiv` when the value is `refresh`:

```javascript
const HTTP_EQUIV_REFRESH =
    /http-equiv(\s*=\s*)(?:"\s*refresh\s*"|'\s*refresh\s*'|refresh(?![\w-]))/gi;
const INERT_NAME = 'data-equiv';

export function neutraliseMetaRefresh(markup) {
    if (typeof markup !== 'string' || markup.length === 0) {
        return { markup: typeof markup === 'string' ? markup : '', neutralised: 0 };
    }
    if (!/http-equiv/i.test(markup)) return { markup, neutralised: 0 };

    let neutralised = 0;
    HTTP_EQUIV_REFRESH.lastIndex = 0;
    const result = markup.replace(HTTP_EQUIV_REFRESH, (match) => {
        neutralised++;
        return INERT_NAME + match.slice(INERT_NAME.length);
    });
    return { markup: result, neutralised };
}
```

`http-equiv` is 10 characters. `data-equiv` is 10 characters. `<meta data-equiv="refresh" content="1">` is valid HTML and XHTML, triggers no browser refresh pragma, keeps the element count identical, and keeps the byte length identical so zero highlights shift.

## 4. Split background workers by Postgres role and Squid port

One worker deployment with one superuser DB role and open outbound port 443 turns any compromised job into full cluster access.

Bookary splits background queues across eight worker Deployments (`interactive`, `ingest`, `conversion`, `pages`, `kindle`, `enrichment`, `exports`, `maintenance`), each backed by its own Postgres role (`bookary_auth`, `bookary_ingest`, `bookary_conversion`, `bookary_pages`, `bookary_kindle`, `bookary_enrichment`, `bookary_exports`, `bookary_maintenance`) and enforced by architecture tests in CI/local runs.

For outbound HTTPS, standard Kubernetes `NetworkPolicy` works at L3/L4 only and cannot say "allow `api.stripe.com`, deny everything else on 443". So `egress-proxy` (Squid 6.12) is the only pod in the namespace allowed to open public TCP 443. Every workload that calls external APIs connects through its own port on `egress-proxy`:

| Port | Caller | Allowed external targets |
|---|---|---|
| `8441` | `web` | Stripe, Turnstile, Apple JWKS / OAuth |
| `8442` | `worker-interactive` | Resend, APNs |
| `8443` | `worker-kindle` | Resend |
| `8444` | `worker-enrichment` | OpenLibrary |
| `8445` / `8446` | `backup` / `restore-drill` | Offsite backup endpoints (when configured) |
| `8447` | Storage worker lanes (`ingest`, `conversion`, `pages`, `exports`) | Cloudflare R2 host |
| `8448` | `books-cdn` | Plain-HTTP `accel` listener forwarding to Cloudflare R2 over TLS |

Squid pairs `myportname` ACLs with per-lane hostname files, and `k8s/policies/egress-proxy.yaml` restricts each port by pod label. A workload cannot reach another lane's allowlist because the CNI blocks the port before a packet ever reaches Squid.

## Where things live

| File | Role |
|---|---|
| `k8s/base/calibre-svc.yaml` | Read-only rootfs, `1536Mi` memory `/scratch`, `shareProcessNamespace`, `preStop` sleep |
| `k8s/policies/calibre-svc.yaml` | Ingress only from `conversion` worker; egress only to `kube-dns` and `books-cdn:8090` |
| `k8s/overlays/production/runtimeclass-gvisor.yaml` | `gvisor` (`runsc`) `RuntimeClass` and node selector |
| `k8s/base/egress-proxy.yaml` | Eight-port Squid `CONNECT` + `accel` proxy, probes checking all eight listeners |
| `services/reader-shell/app/section-transform.js` | Length-preserving `http-equiv` to `data-equiv` neutraliser |
| `services/reader-shell/PROTOCOL.md` | Cross-origin `MessageChannel` wire protocol (v1) |

## Gotchas I hit

- **A memory `emptyDir` survives container restarts inside the same pod.** When `calibre-svc` gets OOM-killed or hits a hard timeout, its `conv-*` temp directories stay on `/scratch`. `/health` kept answering `200` while `/scratch` filled up and every conversion failed with `ENOSPC`. Fix: purge `/scratch/tmp/conv-*` in the container entrypoint on every start, and make the readiness probe check `os.statvfs('/scratch')` for at least 256 MiB free instead of checking `/health` alone.
- **Presigned URLs still need DNS.** It is easy to read "deny all except presigned URLs" and drop `kube-dns` from `calibre-svc`'s egress policy. That breaks every conversion because `http://books-cdn:8090` is a Service name that needs DNS resolution on every job.
- **Timed-out `ebook-convert` runs leave zombie children without PID 1 reaping.** `calibre-svc` kills conversion process groups on timeout, and without an init process inside the pod, orphans turn into zombies. Setting `shareProcessNamespace: true` hands orphan reaping to the pod's pause container.
- **Squid 6 skips a port it fails to bind instead of failing startup.** Checking only port `8441` in a readiness probe can mark `egress-proxy` Ready while port `8443` (`kindle`) failed to bind. The startup and readiness probes loop over all eight ports (`8441` through `8448`) with `nc -z`.

## Quick reference

```bash
# render the production kustomize overlay (including gvisor patches and egress allowlists)
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/overlays/production

# verify calibre-svc has no mounted SA token, no env vars, and 1.5G memory scratch
kubectl -n bookary exec deploy/calibre-svc -- df -h /scratch

# verify gvisor RuntimeClass is bound to the four parser deployments
kubectl -n bookary get deploy calibre-svc worker-ingest worker-pages worker-conversion \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.runtimeClassName}{"\n"}{end}'
```

If you only want a personal library on your home network, you do not need any of this machinery: run [Kavita or Calibre-Web on a box you own](https://app.bookary.io/guides/kavita-without-a-server) and skip the multi-tenant isolation. The moment you accept arbitrary EPUB, PDF, CBZ, CBR, MOBI and AZW3 uploads on the public internet and [send them to people's Kindles](https://app.bookary.io/guides/send-epub-to-kindle), separating the parsers, the browser origin and the worker egress lanes is what keeps bad files boring. If you want to try the end result without running any of it yourself, [Bookary is free for up to 20 books](https://app.bookary.io/for/books).

`[ ISOLATION OK ]`
