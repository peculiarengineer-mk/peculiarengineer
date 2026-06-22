---
title: 'Resurrecting a dead book downloader: debugging an API migration end to end'
description: 'How a one line JSONDecodeError turned into a reverse-engineering-by-reading exercise, a v1 to v2 API migration, a hardened little tool of my own, and a paywall that held the whole time.'
pubDate: 'Jun 23 2026'
heroImage: '../../assets/resurrecting-downloader-hero.png'
tags: ['Debugging', 'ReverseEngineering', 'API', 'Python', 'Docker', 'EPUB', 'asyncio']
---

> **Educational note up front.** Everything below was done against content I'm subscribed to, with my own credentials, for the purpose of understanding how a modern SPA plus JSON API plus EPUB pipeline actually works. Nothing here defeats access control or bot protection, and as you'll see, the experiment proves the protection is intact. Bulk or automated downloading can violate a provider's Terms of Service, so know the rules for whatever you point tools at.

A Docker-wrapped O'Reilly EPUB downloader I'd been using stopped working, and the error it threw was the kind that lies to you. It said the same thing for three completely different problems. Chasing it down turned into a reverse-engineering-by-reading session, an API migration, a real bug that only showed up on full content, and a clean little tool of my own. This is the writeup, mostly so I never re-derive any of it. (Yes, this is the same repo I reflexively reached for `nix eval` on in an earlier post. It does not use Nix. It does, it turns out, have other problems.)

> **TL;DR** A Docker-wrapped O'Reilly EPUB downloader (built on the popular safaribooks) died with `Authentication successful` followed instantly by an unhandled `JSONDecodeError`. The cause was the old `/api/v1/book/{id}/` metadata endpoint now returning non-JSON. The fix was to drop it entirely and switch to the v2 `/api/v2/epubs/urn:orm:book:{id}/files/` manifest API, which hands back the publisher's own EPUB files. I rewrote the core into a small, hardened, tested downloader, containerized it as non-root, fixed a bug that only appears on real content, and shipped it as its own repo with branch protection. The nice side effect: an invalid token returns only truncated previews, which confirms the migration changed which endpoint we call, not the paywall.

## The starting point

The project was a thin convenience layer. A Dockerfile that `git clone`d the upstream safaribooks project, plus two tiny shell entrypoints: `login` (email and password) and `sso` (browser cookies piped on stdin). Each ran `safaribooks.py`, then `cat`-ed the resulting `.epub` to stdout so you could redirect it to a file.

It had the usual smell of an unmaintained wrapper. An unpinned `git clone`, scripts with no `set -eu`, a container running as root, and a "please star us on GitHub" message printed after every run. Useful, but fragile.

## The failure

Running the SSO path produced this:

```
[-] Successfully authenticated.
[*] Retrieving book info...
[#] Unhandled Exception: Expecting value: line 1 column 1 (char 0) (type: JSONDecodeError)
[!] Aborting...
```

`Expecting value: line 1 column 1 (char 0)` is the unmistakable signature of `json.loads("")`. Python got handed an empty or non-JSON body and tried to parse it as JSON.

## Debugging, one layer at a time

The first red herring was empty cookies. Before auth even succeeded, an earlier attempt failed at the same error because the cookie file was empty. A missing `-i` on `docker run` meant stdin never reached the container. I reproduced it deterministically:

```sh
printf '' | docker run -i orly sso 9781492029496   # -> the exact JSONDecodeError
```

So that error is generic. Empty stdin and a broken API endpoint look identical from the outside.

The second failure was the real one: auth works, book-info doesn't. Once the cookies were valid, the output changed to `Successfully authenticated.` and then crashed at `Retrieving book info...`. Authentication was fine. Something after it was returning non-JSON.

Time to read the actual code. I pulled the cloned tool out of the image and found the crash site:

```python
# safaribooks.py
API_TEMPLATE = "https://learning.oreilly.com/api/v1/book/{0}/"

def get_book_info(self):
    response = self.requests_provider(self.api_url)   # request goes through
    ...
    response = response.json()                         # <- throws: body is not JSON
```

The request itself succeeded, no connection error, but its body wasn't JSON. So the v1 book-info endpoint specifically was returning HTML or empty. A deprecated or bot-challenged endpoint. A quick look at the upstream project confirmed the bigger picture: the maintainer notes login "no longer works due to changes in the APIs," and the cookie set itself contained Akamai Bot Manager cookies (`_abck`, `bm_sz`, and friends), a tell that the API sits behind active bot protection.

## The insight: a different tool uses a different endpoint

This is the part that actually fixed everything, and it wasn't cleverness on my part. Comparing downloaders surfaced the key architectural difference. A minimal 119-line project, `xi/oreilly-downloader`, never calls `/api/v1/book/...` at all. It goes straight to a v2 manifest:

```python
root_path = f'/api/v2/epubs/urn:orm:book:{book_id}/files/'
```

That endpoint returns a paginated JSON list of every file in the book: HTML chapters, images, CSS, fonts, and the EPUB structural files (`content.opf`, the nav doc). The download loop is just this:

```python
while url:
    data = await session.get(url).json()
    for f in data['results']:
        download(f['url'], f"EPUB/{f['full_path']}")
    url = data['next']
```

An EPUB is just a ZIP with a specific layout, so the tool only hand-writes two files, `mimetype` and `META-INF/container.xml`, and streams everything else from the manifest. The kicker is that safaribooks already knew about this v2 endpoint, it just used it as a late-stage hack for image assets. The migration was to promote v2 from a footnote to the primary path and delete the entire v1 metadata, chapter, and TOC machinery.

## Mapping v1 to v2

| v1 endpoint (old) | Purpose | v2 status |
|-------------------|---------|-----------|
| `/api/v1/book/{id}/` (the crash) | metadata for content.opf | not needed, content.opf is a file in the manifest |
| `/api/v1/book/{id}/chapter/?page=N` | chapter crawl | not needed, manifest lists every HTML file |
| per-chapter HTML scrape | extract content div | not needed, download files directly |
| `/api/v1/book/{id}/toc/` | build toc.ncx | not needed, nav doc is in the manifest |
| image/CSS asset fetches | binary assets | not needed, assets are manifest entries |
| mimetype + container.xml | EPUB wrappers | still synthesized client-side (2 static files) |

Auth collapses to a single `orm-jwt` cookie, with an optional liveness check against `/api/v1/user-preferences/`. About 80% of the original tool became dead code.

I worked the migration in phases rather than hacking on the live file: a security and correctness review of the existing repo first (which caught the unpinned clone, the root container, a `chmod o+x` quirk, and a live-secret footgun I'll get to), then a written plan for the endpoint mapping and the CLI contract to preserve, then implementation, then verification against a real book. The one decision I'd defend hardest is vendoring the roughly 120-line downloader instead of forking 1,100 lines of scraping code. The v2 manifest makes the old crawler redundant, so carrying it would have been pure maintenance debt.

## Building it right: the hardening that mattered

The reference implementation had one fatal flaw I refused to copy: a bare `await r.json()` with no guard. That's literally the bug that started this whole thing. A 200-response carrying an HTML bot-challenge sails straight into `.json()` and explodes. So the centerpiece of the rewrite is a guard that checks status before content type and fails with a human message instead of a stack trace:

```python
class DownloadError(Exception):
    ...

async def _get_json(session, url):
    async with session.get(url, raise_for_status=False) as r:
        if r.status in (401, 403):
            raise DownloadError(f"Authentication failed ({r.status}): orm-jwt missing/expired.")
        if r.status >= 400:
            raise DownloadError(f"HTTP {r.status} fetching {url}.")
        if "application/json" not in r.headers.get("Content-Type", ""):
            snippet = (await r.text())[:200]
            raise DownloadError(f"Expected JSON, got {r.headers.get('Content-Type')!r} "
                                f"- likely a bot/challenge page. First bytes: {snippet!r}")
        return await r.json()
```

A few other production touches the reference lacked. Bounded concurrency (`asyncio.Semaphore(8)`) so a large book doesn't open hundreds of simultaneous connections and trip rate limits. Malformed manifest entries get skipped instead of raising a `KeyError`. All logs go to stderr, because stdout is reserved for EPUB bytes. And the whole run is wrapped so a `DownloadError` prints one line to stderr and exits non-zero, which means the wrapper's `set -eu` correctly aborts before any trailing success message.

The container got the same care. I dropped the unpinned `git clone` entirely, `pip install` the two real deps, run as a non-root `appuser`, and `chmod 0755` the scripts.

## The bug that only shows up on real content

The first full run with a valid token got further, then crashed differently:

```
File "oreilly_downloader.py", line 51, in to_xhtml
    if el.get(attr, '').startswith(root_path):
AttributeError: 'NoneType' object has no attribute 'startswith'
```

This is a great example of a bug that hides during testing. The HTML-rewriting helper iterates every node with `tree.iter()`, which in lxml also yields comment and processing-instruction nodes. For those nodes, `.get('href', '')` ignores the default and returns `None`. The truncated preview content I'd been testing on had no comments, so it never triggered. The full chapters did. The fix:

```python
for el in tree.iter():
    if not isinstance(el.tag, str):   # skip comments / processing instructions
        continue
    for attr in ("href", "src"):
        val = el.get(attr)
        if val and val.startswith(root_path):
            el.set(attr, val.removeprefix(root_path))
```

I added a regression test that feeds `to_xhtml` an HTML fragment containing a comment and a PI node, so it can never silently come back.

## Verification, and an ethics check that passed

With a fresh, valid token:

```
Authentication successful.
fetching .../files/
fetching .../files/?limit=20&offset=20
...
created 9781492029496.epub
```

A valid EPUB, 117 files, full chapters. But the most interesting result came from a deliberately invalid token:

| | Bogus token | Valid token |
|---|---|---|
| ch06.html | 2,306 bytes, ends "...Toil tends to fall on a ..." | 109,239 bytes, complete |
| Output | structurally valid EPUB, truncated text | full book |

With no valid auth, the endpoint serves public-preview, truncated content (chapters literally cut off mid sentence with `...`). That's the important takeaway. The migration changed which endpoint the tool calls, not the authorization model. Full content still requires your own valid session. The paywall held. I just stopped using a broken door.

## Repo hygiene and the near-miss

The security review's scariest finding had nothing to do with the API. During testing I'd saved my real session cookies to `cookies.json`, and the `.gitignore` had a typo (`cookie.json`, singular) that didn't match the real filename. The file was untracked but unignored, one `git add .` away from publishing live tokens. I fixed the ignore rule, scanned the entire committed tree for token patterns and my specific cookie values to confirm nothing leaked, and rotated the credential (it had also been pasted into a debugging session, so I treated it as burned regardless).

If you take one operational lesson from this post, it's this: `git check-ignore` your secret files, don't assume the pattern matches.

## Making it my own

Since the result was substantially a rewrite, I shipped it as its own repository, [peculiarengineer-mk/oreilly-epub-downloader](https://github.com/peculiarengineer-mk/oreilly-epub-downloader), with a clean, single-commit history, keeping a Credits section for the upstream projects it learned from. Then I locked the default branch down:

- Pull request required before merging, no direct pushes to `main`.
- Force pushes and branch deletion blocked.
- Conversation resolution required.
- Required approvals set to 0 and admin-enforcement off. That's pragmatic for a solo repo, so I'm protected from accidents without locking myself out.

## Lessons

Generic errors lie. `JSONDecodeError: char 0` meant three different things across this debug session: empty stdin, broken endpoint, bot challenge. Reproduce each hypothesis deterministically instead of guessing.

Read the other implementations. The fix wasn't cleverness, it was noticing that a second tool quietly used a different, better endpoint.

Guard your parse boundaries. Any `.json()` on a response you don't control needs a status and content-type check. The crash that started all this was a missing four-line guard.

Test on representative data. The comment-node bug was invisible on previews and obvious on full content.

Migrations are deletions. The win was removing about 80% of the code, not adding to it.

And the cleanest signal that I'd done this right was watching an invalid token return a truncated preview. A protection you respect is a protection you can reason about.

Built for learning. Use responsibly, and mind the terms of service of anything you point software at.
