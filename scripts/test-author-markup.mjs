// check the built dist/ for the author markup that ties the posts to Minor
// Keith: the json-ld author on a blog post, the byline next to the date, the
// meta author tag on the post and the home page, and the ProfilePage json-ld
// on /about. dependency-free (node:fs only), run after `npm run build`.
// usage: node scripts/test-author-markup.mjs
import { readFileSync } from 'node:fs';

const authorName = 'Minor Keith';
const authorUrl = 'https://peculiarengineer.com/about/';
const authorSameAs = 'https://github.com/peculiarengineer-mk';
const authorJobTitle = 'Site Reliability Engineer';
const metaAuthor = `<meta name="author" content="${authorName}"`;

const postPage = 'dist/blog/install-docker-ubuntu-26-10/index.html';
const homePage = 'dist/index.html';
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

// pull every <script type="application/ld+json"> block out of a page and
// parse it; an unparseable block counts as absent so the check fails
function jsonLd(html) {
	const blocks = [];
	if (!html) return blocks;
	for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
		try {
			blocks.push(JSON.parse(m[1]));
		} catch {
			// ignore blocks that are not valid json
		}
	}
	return blocks;
}

// find an <a> by attribute substrings and return its text, or null
function linkText(html, href, rel) {
	if (!html) return null;
	for (const m of html.matchAll(/<a\s+([^>]*)>([\s\S]*?)<\/a>/gi)) {
		if (m[1].includes(`href="${href}"`) && m[1].includes(`rel="${rel}"`)) {
			return m[2].replace(/<[^>]*>/g, '').trim();
		}
	}
	return null;
}

function blogAuthor() {
	const post = jsonLd(page(postPage)).find((b) => b['@type'] === 'BlogPosting');
	return (post && post.author) || null;
}

function profileEntity() {
	const profile = jsonLd(page(aboutPage)).find((b) => b['@type'] === 'ProfilePage');
	return (profile && profile.mainEntity) || null;
}

const checks = [
	[
		'blog post json-ld author has name and url',
		() => {
			const author = blogAuthor();
			return (
				!!author && author.name === authorName && author.url === authorUrl
			);
		},
	],
	[
		'blog post json-ld author has sameAs and jobTitle',
		() => {
			const author = blogAuthor();
			return (
				!!author &&
				Array.isArray(author.sameAs) &&
				author.sameAs.includes(authorSameAs) &&
				author.jobTitle === authorJobTitle
			);
		},
	],
	[
		'blog post byline links /about/ with rel=author',
		() => linkText(page(postPage), '/about/', 'author') === authorName,
	],
	[
		'blog post has meta author',
		() => (page(postPage) || '').includes(metaAuthor),
	],
	[
		'home page has meta author',
		() => (page(homePage) || '').includes(metaAuthor),
	],
	[
		'about page json-ld is ProfilePage with Person mainEntity',
		() => {
			const profile = jsonLd(page(aboutPage)).find((b) => b['@type'] === 'ProfilePage');
			const entity = profileEntity();
			return (
				!!profile &&
				!!entity &&
				entity['@type'] === 'Person' &&
				entity.name === authorName &&
				entity.url === authorUrl &&
				Array.isArray(entity.sameAs) &&
				entity.sameAs.includes(authorSameAs)
			);
		},
	],
];

let failed = false;
for (const [name, check] of checks) {
	const ok = check();
	if (!ok) failed = true;
	console.log((ok ? 'PASS ' : 'FAIL ') + name);
}
process.exit(failed ? 1 : 0);
