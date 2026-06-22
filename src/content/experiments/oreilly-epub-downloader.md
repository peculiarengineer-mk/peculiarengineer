---
title: 'oreilly-epub-downloader'
description: "Resurrected a dead O'Reilly EPUB downloader by migrating it off the broken v1 book API and onto the v2 manifest endpoint a smaller tool was already using, then hardened it into a small, tested, non-root container. The migration was mostly deletion: about 80% of the original code came out."
repo: 'https://github.com/peculiarengineer-mk/oreilly-epub-downloader'
blogSlug: 'resurrecting-dead-book-downloader-api-migration'
pubDate: 'Jun 23 2026'
tags: ['Python', 'Docker', 'API', 'EPUB', 'asyncio']
---

A reverse-engineering-by-reading exercise that started with a one line `JSONDecodeError` and ended with a clean little tool of my own. Built for learning, against content I'm subscribed to, with my own credentials.
