---
title: "Download an O'Reilly book to EPUB: the command cheat sheet"
description: "The four commands to pull an O'Reilly book down as an EPUB with the Docker tool. Just the copy and paste, no theory. Your own subscription only."
pubDate: 'Jun 27 2026'
heroImage: '../../assets/download-oreilly-hero.png'
tags: ['OReilly', 'EPUB', 'Docker', 'CLI', 'SSO']
---

> **Educational note up front.** This works only with a subscription and credentials you already hold, for content you can already read. It does not defeat access control or bot protection. Bulk or automated downloading can break O'Reilly's Terms of Service, so know the rules before you point anything at it.

This is the cheat sheet version. I keep coming back here when I just want the commands and not the story. If you want the why behind any of it, the full walkthrough is in [Using the O'Reilly EPUB Downloader](/blog/oreilly-epub-downloader-usage/), and the debugging tale that produced the tool is [here](/blog/resurrecting-dead-book-downloader-api-migration/).

## What you need

Docker, an O'Reilly subscription, and Firefox for the cookie step. That is it.

## The four commands

**1. Build the image** (once).

```bash
docker build -t orly .
```

**2. Grab your session cookies.** Log in to `https://learning.oreilly.com/` in Firefox, open the book, hit F12, and paste this into the Console:

```javascript
copy(JSON.stringify(document.cookie.split(';').map(c => c.split('=')).map(i => [i[0].trim(), i[1].trim()]).reduce((r, i) => {r[i[0]] = i[1]; return r;}, {})))
```

Then save it straight away, because the session does not last long:

```bash
pbpaste > cookies.json
```

(macOS uses `pbpaste`. On Linux it is `xclip -o > cookies.json`. On WSL it is `powershell.exe Get-Clipboard`.)

**3. Download the book.** The book ID is the number at the end of the library URL.

```bash
(cat cookies.json | docker run -i orly sso 9781492029496) > "book.epub"
```

**4. Verify.**

```bash
file "book.epub"
```

You want `EPUB document`. Done.

## The two gotchas that will bite you

**Keep the `-i` flag.** Without it stdin never reaches the container, the tool gets an empty cookie object, and it dies with `JSONDecodeError: Expecting value: line 1 column 1 (char 0)`. That same error also shows up when your token is stale, which makes it a confusing one to chase. Check your flags first.

**Cookies expire fast.** There is no refresh flow. If the download starts coming back short, or a chapter ends mid sentence with `...`, your cookies went stale and you grabbed a public preview. Re-export from a fresh browser session and run it again.

## Copy and paste block

```bash
docker build -t orly .
# (paste the Firefox console one-liner, then:)
pbpaste > cookies.json
(cat cookies.json | docker run -i orly sso <book-id>) > "book.epub"
file "book.epub"
```

That is the whole thing. Built for learning, against your own content. Mind the terms of service of anything you point software at.
