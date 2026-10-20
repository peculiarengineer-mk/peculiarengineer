// check the built dist/ for the live Buttondown newsletter forms: the embed
// form action and method on the home, blog index, about and post pages, the
// about form's email id and hidden tag input, the privacy line under every
// form, the terminal prompt and Sunday blurb copy, the reduced-motion rule and
// no leftover setup notice or old em-dash blurb. dependency-free (node:fs
// only), run after `npm run build`.
// usage: node scripts/test-newsletter-live.mjs
import { readFileSync, readdirSync } from 'node:fs';

const formAction = 'https://buttondown.com/api/emails/embed-subscribe/peculiarengineer';
const privacyLine = 'Email only, stored by Buttondown. Unsubscribe any time.';
const setupNotice = 'Not wired up yet';
const oldBlurb = 'New posts by email —';
const promptLine = 'subscribe --weekly';
const cursorTag = 'class="cursor"';
const sundayCopy = 'every Sunday';
// the newsletter's own reduced-motion block: it switches off the scoped cursor
// animation, so look for that rule rather than any reduced-motion media query
const reducedMotionRule = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.cursor\[data-astro-cid-/;

const pages = [
	'dist/index.html',
	'dist/blog/index.html',
	'dist/about/index.html',
	'dist/blog/install-docker-ubuntu-26-10/index.html',
];
const aboutPage = 'dist/about/index.html';

// read a page once and cache it; a missing file becomes null and fails the
// checks that need it instead of crashing the run
const cache = new Map();
function page(path) {
	if (!cache.has(path)) {
		try {
			cache.set(path, readFileSync(path, 'utf8'));
		} catch {
			cache.set(path, null);
		}
	}
	return cache.get(path);
}

// collect the attribute maps of every opening tag with the given name so the
// checks don't depend on attribute order or quoting style
function tags(html, name) {
	if (!html) return [];
	const out = [];
	for (const m of html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))) {
		const attrs = {};
		for (const a of m[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
		out.push(attrs);
	}
	return out;
}

// every html file under dist/, for the checks that must hold site wide; null
// when dist/ is missing so the check fails instead of passing vacuously
function allPages(dir = 'dist') {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	const out = [];
	for (const entry of entries) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) out.push(...(allPages(path) || []));
		else if (entry.name.endsWith('.html')) out.push(path);
	}
	return out;
}

// a form that posts to the Buttondown embed endpoint with method="post"
function liveForm(path) {
	return tags(page(path), 'form').some((a) => a.action === formAction && a.method === 'post');
}

// the visible text of every newsletter blurb paragraph on a page, with any
// markup inside it stripped
function blurbTexts(html) {
	const out = [];
	for (const m of (html || '').matchAll(/<p[^>]*class="[^"]*\bblurb\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g)) {
		out.push(m[1].replace(/<[^>]*>/g, ''));
	}
	return out;
}

// a page's own HTML plus the text of every local stylesheet it links, so a
// rule counts wherever the build decided to put it
function pageAndSheets(path) {
	const html = page(path);
	if (!html) return null;
	const out = [html];
	for (const a of tags(html, 'link')) {
		if (a.rel !== 'stylesheet' || !a.href?.startsWith('/')) continue;
		try {
			out.push(readFileSync(`dist${a.href}`, 'utf8'));
		} catch {
			return null;
		}
	}
	return out.join('\n');
}

const checks = [
	...pages.map((path) => [
		`${path} has a live Buttondown form`,
		() => liveForm(path),
	]),
	[
		'about page email input has id="bd-email-about"',
		() => tags(page(aboutPage), 'input').some((a) => a.id === 'bd-email-about' && a.type === 'email'),
	],
	[
		'about page has hidden tag input with value about',
		() =>
			tags(page(aboutPage), 'input').some(
				(a) => a.type === 'hidden' && a.name === 'tag' && a.value === 'about'
			),
	],
	...pages.map((path) => [
		`${path} has the privacy line`,
		() => (page(path) || '').includes(privacyLine),
	]),
	[
		'no page shows the setup notice',
		() => {
			const files = allPages();
			return !!files && files.length > 0 && files.every((f) => !(page(f) || '').includes(setupNotice));
		},
	],
	[
		'none of the four pages has the old em-dash blurb',
		() => pages.every((path) => !(page(path) || '').includes(oldBlurb)),
	],
	...pages.map((path) => [
		`${path} has the terminal prompt line and cursor`,
		() => {
			const html = page(path) || '';
			return html.includes(promptLine) && html.includes(cursorTag);
		},
	]),
	...pages.map((path) => [
		`${path} says every Sunday`,
		() => (page(path) || '').includes(sundayCopy),
	]),
	[
		'index page has the newsletter reduced-motion rule in its HTML or linked CSS',
		() => reducedMotionRule.test(pageAndSheets('dist/index.html') || ''),
	],
	[
		'no newsletter blurb text contains an em dash',
		() => pages.every((path) => blurbTexts(page(path)).every((text) => !text.includes('—'))),
	],
];

let failed = false;
for (const [name, check] of checks) {
	const ok = check();
	if (!ok) failed = true;
	console.log((ok ? 'PASS ' : 'FAIL ') + name);
}
process.exit(failed ? 1 : 0);
