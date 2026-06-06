---
title: 'Deploy an Astro blog to Cloudflare Pages'
description: 'A start-to-finish runbook for getting this blog live on Cloudflare Pages, with a free *.pages.dev URL and optional custom domain.'
pubDate: 'Jun 05 2026'
heroImage: '../../assets/blog-placeholder-1.jpg'
---

This is the runbook I used to put this very blog online. It takes about 10
minutes and costs nothing. Use it as a template for how I like to structure
guides here: prerequisites, numbered steps, copy-paste commands, and the
gotchas I actually hit.

## Prerequisites

- Node.js 22+ and npm (`node --version` should print `v22` or higher)
- A [GitHub](https://github.com) account
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account
- This project, building cleanly with `npm run build`

## 1. Push the project to GitHub

Create an empty repo on GitHub (no README), then from the project root:

```bash
git add -A
git commit -m "Initial commit: Peculiar Engineer blog"
git branch -M main
git remote add origin git@github.com:<your-username>/peculiarengineer.git
git push -u origin main
```

## 2. Create a Cloudflare Pages project

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize GitHub and pick the `peculiarengineer` repo.
3. Set the build configuration:

| Setting           | Value           |
| ----------------- | --------------- |
| Framework preset  | `Astro`         |
| Build command     | `npm run build` |
| Build output dir  | `dist`          |

4. Click **Save and Deploy**.

Cloudflare installs dependencies, runs the build, and publishes the `dist/`
folder to a URL like `https://peculiarengineer.pages.dev`. Every push to `main`
now triggers an automatic redeploy.

## 3. (Optional) Add a custom domain

In the Pages project → **Custom domains** → **Set up a domain**. If your domain's
DNS is on Cloudflare, the records are added for you. Otherwise add the `CNAME`
record it shows you at your registrar.

> **Update `site` in `astro.config.mjs`** to your final URL once you have it —
> the sitemap and RSS feed use it to generate absolute links.

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://peculiarengineer.pages.dev', // ← change to your domain
  // ...
});
```

## Gotchas I hit

- **Wrong Node version on Cloudflare.** Builds default to an older Node. Add an
  environment variable `NODE_VERSION = 22` in the Pages project settings if the
  build fails on `engines`.
- **Forgot to set `site`.** RSS/sitemap links came out as `example.com`. Set it
  before sharing the feed.

That's it — the blog is live and redeploys on every `git push`. 🎉
