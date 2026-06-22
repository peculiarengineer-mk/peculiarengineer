---
title: "Using the O'Reilly EPUB Downloader"
description: "How to build, authenticate, and download O'Reilly books as EPUBs using the Docker-wrapped CLI tool. Quick start, gotchas, and verification steps."
pubDate: 'Jun 24 2026'
heroImage: '../../assets/orly-usage-hero.png'
tags: ['OReilly', 'EPUB', 'Docker', 'CLI', 'Python', 'SSO', 'API']
---

> **Educational note up front.** This tool only works with credentials and a subscription you already hold, for content you have access to. It does not defeat access control or bot protection. Bulk or automated downloading can violate O'Reilly's Terms of Service, so know the rules before you point anything at it.

I built this tool in a previous post (the debugging story is [here](/blog/resurrecting-dead-book-downloader-api-migration/)), but that post is long and full of reverse-engineering detours. This is the short version: how to actually run the thing, what you get out, and the handful of gotchas that will bite you if you skip them.

> **TL;DR** Build the Docker image, grab your session cookies from Firefox, pipe them in with `docker run -i`, and redirect stdout to a `.epub` file. The whole flow is four commands.

## Prerequisites

- **Docker** — any recent version, nothing fancy
- **An O'Reilly subscription** — the tool downloads content you already have access to
- **Firefox** — the cookie extraction step relies on Firefox's console; other browsers require manually assembling the JSON from the Application tab

## Quick start

This is a worked example downloading *The Site Reliability Workbook* (book ID `9781492029496`). Four steps.

**1. Build the image.**

```bash
docker build -t orly .
```

**2. Grab your session cookies.**

Log in to `https://learning.oreilly.com/` in Firefox. Open the book's page. F12 to open DevTools, go to the Console tab, and run this:

```javascript
copy(JSON.stringify(document.cookie.split(';').map(c => c.split('=')).map(i => [i[0].trim(), i[1].trim()]).reduce((r, i) => {r[i[0]] = i[1]; return r;}, {})))
```

That copies a JSON object of every cookie on the domain to your clipboard. Save it immediately — the session is short-lived:

```bash
pbpaste > cookies.json
```

(`pbpaste` is macOS. Linux: `xclip -o > cookies.json`. Windows WSL: `powershell.exe Get-Clipboard`.)

**3. Download the book.**

```bash
(cat cookies.json | docker run -i orly sso 9781492029496) > "SRE Workbook.epub"
```

The parentheses matter: they ensure the redirect captures stdout from the container, not from `cat`. The `-i` flag on `docker run` is mandatory — without it, stdin never reaches the container and you get the same `JSONDecodeError` as an expired token.

**4. Verify.**

```bash
file "SRE Workbook.epub"
unzip -p "SRE Workbook.epub" EPUB/ch06.html | tail -c 80
```

`file` should say `EPUB document`. The tail of a chapter should end mid-content, not with an ellipsis. If you see `...` cutoff, you got a truncated preview — see the verification section below.

## SSO login in detail

SSO (cookie-based) is the supported authentication path. The tool reads a JSON cookie object from stdin, extracts the `orm-jwt` token, and uses it for every API call.

The cookie extraction one-liner does this:

1. `document.cookie` returns all cookies as a semicolon-delimited string.
2. Split on `;`, split each pair on `=`, trim whitespace.
3. Reduce into a plain `{key: value}` object.
4. `JSON.stringify` it.
5. `copy()` puts it on the clipboard.

The resulting file looks like this (most fields omitted — you just need the structure):

```json
{
  "BrowserCookie": "a3207952-...",
  "csrfsafari": "rCJPYf19...",
  "groot_sessionid": "abcdef...",
  "logged_in": "y",
  "orm-jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "orm-rt": "5f18b2d1...",
  "salesforce_id": "e15031a5...",
  "sessionid": "abcdef..."
}
```

The critical field is `orm-jwt`. That's the JWT the downloader hands to the v2 API. Everything else is incidental — the tool extracts `orm-jwt` from the JSON and ignores the rest.

### Finding the book ID

The book ID is the number at the end of the library URL:

```
https://learning.oreilly.com/library/view/the-site-reliability-workbook/9781492029496/
                                                                 ^^^^^^^^^^^^^^^^
```

Swap `9781492029496` for whatever book you're after.

### Email/password login

The tool has a `login` subcommand that takes `email:password` as an argument. It's best-effort and usually fails. O'Reilly's login sits behind Akamai bot protection, and the email/password flow gets challenged more often than not. When it fails, the tool exits with a message pointing you to the SSO path. Don't waste time debugging it — use SSO.

## What you get

With a valid token, the output is a structurally correct EPUB:

```
$ file "SRE Workbook.epub"
SRE Workbook.epub: EPUB document (EPUB 3)
```

You can inspect the internals:

| Check | Command |
|---|---|
| Verify it's a valid ZIP | `file "SRE Workbook.epub"` |
| List contents | `unzip -l "SRE Workbook.epub"` |
| Check the OPF manifest | `unzip -p "SRE Workbook.epub" EPUB/content.opf` |
| Read a chapter | `unzip -p "SRE Workbook.epub" EPUB/ch06.html` |
| Count files | `unzip -l "SRE Workbook.epub" \| wc -l` |

The manifest (`content.opf`) lives at `EPUB/content.opf`. Content documents are `.html`, not `.xhtml`. The `full_path` values in the API response are EPUB-relative, so the downloader writes them under `EPUB/` in the ZIP.

**With an invalid or expired token, you still get an EPUB — but it's a truncated preview.** Chapters are cut off mid-sentence with `...`. This is O'Reilly's public-preview behavior, not a bug. The file is structurally valid, `file` reports it as an EPUB, and everything looks fine until you actually read a chapter and find it cut off mid-word. If your output looks suspiciously short, your cookies are stale.

## A few things worth knowing

**Cookies go stale.** The `orm-jwt` token has a finite lifetime tied to your browser session. If the tool starts returning truncated content or authentication errors, re-export your cookies from a fresh browser session. There's no refresh flow — you grab a fresh one each time.

**The `-i` flag on `docker run` is not optional.** Without it, stdin never reaches the container, and the tool gets an empty cookie object. The error it throws (`JSONDecodeError: Expecting value: line 1 column 1 (char 0)`) is the same one you'd see with a broken API endpoint, which makes it a confusing debugging experience. If in doubt, check your `docker run` flags first.

**Firefox is the reliable path for cookie export.** Chrome's `document.cookie` omits `HttpOnly` cookies. Firefox's DevTools console returns everything. If you're on Chrome, use the Application tab and copy cookies manually, or just use Firefox for this step.

**Output buffering.** EPUB bytes go to stdout, logs go to stderr. Because stdout is buffered in 4k chunks, you might not see any file output for a while on large books. This is normal. The download is working; let it finish.

**Concurrency is bounded at 8.** The downloader uses `asyncio.Semaphore(8)` to limit simultaneous file downloads. This is intentional — opening hundreds of connections against O'Reilly's CDN would be rude and probably trip rate limits. A large book (200+ files) will take a bit longer, but it won't get you banned.

## How it works under the hood

The downloader calls `/api/v2/epubs/urn:orm:book:{id}/files/`, which returns a paginated JSON list of every file the publisher published for that book. It follows `next` links until it has the full manifest, then streams each file into a ZIP with the EPUB layout (`mimetype` and `META-INF/container.xml` are synthesized client-side; everything else comes from the API). A content-type guard catches bot-challenge pages before they hit the JSON parser.

The v2 API replaced a v1 approach that scraped chapters individually and rebuilt the EPUB structure from scratch. Roughly 80% of the old tool's code became unnecessary once the manifest handed back the publisher's own files. The full migration story — the broken endpoint, the content-type guard design, the comment-node bug that only showed up on real content, and the ethics check that confirmed the paywall still holds — is in the [companion post](/blog/resurrecting-dead-book-downloader-api-migration/).

## Quick reference

| Task | Command |
|---|---|
| Build image | `docker build -t orly .` |
| Export cookies (Firefox Console) | `copy(JSON.stringify(document.cookie.split(';').map(c => c.split('=')).map(i => [i[0].trim(), i[1].trim()]).reduce((r, i) => {r[i[0]] = i[1]; return r;}, {})))` |
| Save cookies | `pbpaste > cookies.json` |
| Download book | `(cat cookies.json \| docker run -i orly sso 9781492029496) > book.epub` |
| Verify it's an EPUB | `file book.epub` |
| Check chapter isn't truncated | `unzip -p book.epub EPUB/ch06.html \| tail -c 80` |
| List EPUB contents | `unzip -l book.epub` |
| Inspect the manifest | `unzip -p book.epub EPUB/content.opf` |
| Use pre-built image | `(cat cookies.json \| docker run -i peculiarengineer-mk/orly:latest sso <id>) > book.epub` |

Built for learning. Use responsibly, and mind the terms of service of anything you point software at.
