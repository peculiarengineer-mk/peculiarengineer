// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { defineConfig, fontProviders } from 'astro/config';
import rehypeTableWrap from './src/plugins/rehype-table-wrap.mjs';

// lastmod is read back from each built post's own JSON-LD (dateModified, else datePublished),
// so the sitemap always says exactly what the page says. The sitemap is written after the pages.
let outDir = new URL('./dist/', import.meta.url);

function lastmodFromBuiltPage(url) {
	const { pathname } = new URL(url);
	if (!/^\/blog\/.+/.test(pathname)) return undefined;
	const bare = pathname.replace(/\/$/, '');
	for (const file of [`.${bare}/index.html`, `.${bare}.html`]) {
		let html;
		try {
			html = readFileSync(new URL(file, outDir), 'utf8');
		} catch {
			continue;
		}
		for (const [, json] of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
			try {
				const data = JSON.parse(json);
				const date = data.dateModified ?? data.datePublished;
				if (date) return date;
			} catch {}
		}
		return undefined;
	}
	return undefined;
}

// https://astro.build/config
export default defineConfig({
	site: 'https://peculiarengineer.com',
	integrations: [
		{ name: 'sitemap-outdir', hooks: { 'astro:config:done': ({ config }) => { outDir = config.outDir; } } },
		mdx(),
		sitemap({
			serialize(item) {
				const lastmod = lastmodFromBuiltPage(item.url);
				if (lastmod) item.lastmod = lastmod;
				return item;
			},
		}),
	],
	markdown: {
		rehypePlugins: [rehypeTableWrap],
	},
	fonts: [
		{
			provider: fontProviders.google(),
			name: 'JetBrains Mono',
			cssVariable: '--font-mono',
			weights: [400, 700],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
		},
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
