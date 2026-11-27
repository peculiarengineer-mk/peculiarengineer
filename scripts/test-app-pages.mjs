// Check the app pages in the built site: the Garden Sun pages exist, carry the
// contact and privacy details, link to each other and stay out of the RSS feed
// and the search index. Reads dist/ only.
// Usage: node scripts/test-app-pages.mjs (run after `npm run build`)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const read = (rel) => readFileSync(join(dist, rel), 'utf8');

function fail(message) {
	console.error(`FAIL ${message}`);
	process.exit(1);
}

const PAGES = {
	app: { file: 'apps/garden-sun/index.html', path: '/apps/garden-sun/' },
	privacy: { file: 'apps/garden-sun/privacy/index.html', path: '/apps/garden-sun/privacy/' },
	support: { file: 'apps/garden-sun/support/index.html', path: '/apps/garden-sun/support/' },
};

// 1. the three pages exist
for (const { file } of Object.values(PAGES)) {
	if (!existsSync(join(dist, file))) fail(`missing app page ${file}`);
}

// 2. privacy and support link the contact address
for (const { file } of [PAGES.privacy, PAGES.support]) {
	if (!read(file).includes('href="mailto:apps@peculiarengineer.com"')) {
		fail(`${file} has no mailto:apps@peculiarengineer.com link`);
	}
}

// 3. the privacy page names NASA POWER, its effective date and both outside policies
const privacyHtml = read(PAGES.privacy.file);
for (const marker of [
	'power.larc.nasa.gov',
	'Effective 26 November 2026',
	'href="https://www.nasa.gov/privacy/"',
	'href="https://www.apple.com/legal/privacy/"',
]) {
	if (!privacyHtml.includes(marker)) fail(`${PAGES.privacy.file} is missing ${marker}`);
}

// 4. each page links to the other two
for (const page of Object.values(PAGES)) {
	const html = read(page.file);
	for (const other of Object.values(PAGES)) {
		if (other !== page && !html.includes(`href="${other.path}"`)) {
			fail(`${page.file} does not link ${other.path}`);
		}
	}
}

// 5. the app pages stay out of the RSS feed and the search index
for (const file of ['rss.xml', 'search.json']) {
	if (read(file).includes('/apps/')) fail(`dist/${file} mentions /apps/`);
}

console.log('app pages: ok');
