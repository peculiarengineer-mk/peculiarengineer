// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Peculiar Engineer';
export const SITE_DESCRIPTION =
	'Tested fixes and AI how-tos to speed up developer workflows — Linux, SSH, Cloudflare, DevOps, and AI coding tools like Claude Code. Never Google the same fix twice.';

export function sortByPubDate<T extends { data: { pubDate: Date } }>(a: T, b: T): number {
	return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
}
