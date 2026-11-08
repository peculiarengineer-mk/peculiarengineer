// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Peculiar Engineer';
export const SITE_DESCRIPTION =
	'Tested fixes and AI how-tos to speed up developer workflows — Linux, SSH, Cloudflare, DevOps, and AI coding tools like Claude Code. Never Google the same fix twice.';

// ── Author ───────────────────────────────────────────────────────────────────
// The one author constant. Every author mention (article JSON-LD, the byline
// next to the date, the meta author tag) comes from here so they can't drift
// apart as more profile links get added.
export const AUTHOR = {
	name: 'Minor Keith',
	url: 'https://peculiarengineer.com/about/',
	sameAs: ['https://github.com/peculiarengineer-mk'],
	jobTitle: 'Site Reliability Engineer',
};

export function sortByPubDate<T extends { data: { pubDate: Date } }>(a: T, b: T): number {
	return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
}
