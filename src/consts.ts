// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Peculiar Engineer';
export const SITE_DESCRIPTION =
	'Tested fixes and AI how-tos to speed up developer workflows — Linux, SSH, Cloudflare, DevOps, and AI coding tools like Claude Code. Never Google the same fix twice.';

// ── Newsletter ───────────────────────────────────────────────────────────────
// Buttondown username. The embed form posts to
// https://buttondown.com/api/emails/embed-subscribe/<username> and needs no JS.
// While this is 'CHANGEME' every signup form renders a visible setup notice
// instead of a live input, so a half-configured form can't ship silently.
export const BUTTONDOWN_USERNAME = 'peculiarengineer';

// Master switch for every signup form on the site. Off while traffic is too low
// for a newsletter to be worth running. Flip to true to bring them all back.
export const NEWSLETTER_ENABLED = false;

export const NEWSLETTER_READY = BUTTONDOWN_USERNAME !== 'CHANGEME';
export const NEWSLETTER_ACTION = `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;

export function sortByPubDate<T extends { data: { pubDate: Date } }>(a: T, b: T): number {
	return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
}
