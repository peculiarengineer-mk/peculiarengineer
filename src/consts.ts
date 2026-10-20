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

// ── Newsletter ───────────────────────────────────────────────────────────────
// Buttondown username. The embed form posts to
// https://buttondown.com/api/emails/embed-subscribe/<username> and needs no JS.
// While this is 'CHANGEME' every signup form renders a visible setup notice
// instead of a live input, so a half-configured form can't ship silently.
export const BUTTONDOWN_USERNAME = 'peculiarengineer';

// Master switch for every signup form on the site. The forms are on; set this
// to false to hide them all again.
export const NEWSLETTER_ENABLED = true;

export const NEWSLETTER_READY = (BUTTONDOWN_USERNAME as string) !== 'CHANGEME';
export const NEWSLETTER_ACTION = `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;

export function sortByPubDate<T extends { data: { pubDate: Date } }>(a: T, b: T): number {
	return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
}
