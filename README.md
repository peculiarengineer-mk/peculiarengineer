# Peculiar Engineer

Hands-on tech guides, install walkthroughs, and runbooks — the commands that
actually worked, the errors hit along the way, and the reasoning behind each
step. Built with [Astro](https://astro.build) and deployed to Cloudflare Pages.

Live site: <https://peculiarengineer.com>

## Stack

- **[Astro 6](https://astro.build)** — static site generation
- **Content Collections** with Zod-validated frontmatter (`src/content.config.ts`)
- **MDX**, **RSS**, and **sitemap** support
- Local **Atkinson** font hosting with `display: swap`
- SEO baked in: canonical URLs, Open Graph + Twitter cards, sitemap, RSS feed

## Project structure

```text
src/
├── assets/            # Images and self-hosted fonts
├── components/        # BaseHead, Header, Footer, HeaderLink, FormattedDate
├── content/blog/      # Blog posts (Markdown / MDX)
├── layouts/           # BlogPost layout (used by posts and the About page)
├── pages/             # Routes: /, /blog, /blog/[slug], /about, /rss.xml
├── styles/            # global.css (based on Bear Blog)
├── consts.ts          # SITE_TITLE / SITE_DESCRIPTION
└── content.config.ts  # Blog collection schema
```

## Writing a post

Add a Markdown or MDX file to `src/content/blog/`. Required frontmatter:

```yaml
---
title: 'Your title'
description: 'One-line summary for SEO and the blog index.'
pubDate: 2026-06-07
# updatedDate: 2026-06-10   # optional
# heroImage: ../../assets/blog-placeholder-1.jpg   # optional
---
```

The filename becomes the URL slug (`/blog/your-file-name/`).

## Commands

Run from the project root:

| Command           | Action                                       |
| :---------------- | :------------------------------------------- |
| `npm install`     | Install dependencies                         |
| `npm run dev`     | Start the dev server at `localhost:4321`     |
| `npm run build`   | Build the production site to `./dist/`       |
| `npm run preview` | Preview the production build locally         |

Requires Node `>=22.12.0` (see `.nvmrc`).

## Deployment

Pushing to the default branch triggers a Cloudflare Pages build (build command
`npm run build`, output directory `dist/`). The full walkthrough is published as
a post: **Deploy this blog to Cloudflare Pages**.

## Credit

Theme based on the [Bear Blog](https://github.com/HermanMartinus/bearblog/)
template that ships with the Astro blog starter.
