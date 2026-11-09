// Check the curated pages in the built site: the topic pages exist, the chips
// and tag links point at them, every curated list resolves to a real post and
// the new homepage sections carry no dash punctuation. Reads dist/ only.
// Usage: node scripts/test-site-curation.mjs (run after `npm run build`)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const read = (rel) => readFileSync(join(dist, rel), 'utf8');

function fail(message) {
	console.error(`FAIL ${message}`);
	process.exit(1);
}

const TOPIC_SLUGS = [
	'ubuntu',
	'docker',
	'ssh',
	'security',
	'self-hosting',
	'ai',
	'kubernetes',
];

// 1. the eight topic pages exist
const topicPages = ['topics/index.html', ...TOPIC_SLUGS.map((slug) => `topics/${slug}/index.html`)];
for (const page of topicPages) {
	if (!existsSync(join(dist, page))) fail(`missing topic page ${page}`);
}

// 2. each topic page links to at least 5 distinct /blog/<id>/ posts
function postIds(html) {
	return [...html.matchAll(/href="\/blog\/([^"]+)\/"/g)].map((m) => m[1]);
}

for (const slug of TOPIC_SLUGS) {
	const html = read(`topics/${slug}/index.html`);
	const ids = new Set(postIds(html));
	if (ids.size < 5) fail(`topic page /topics/${slug}/ links only ${ids.size} posts, expected at least 5`);
}

// 3. the archive chips on /blog/ link to every topic
const blogHtml = read('blog/index.html');
for (const t of ['ubuntu', 'docker', 'ssh', 'security', 'self-hosting', 'ai', 'kubernetes']) {
	if (!blogHtml.includes(`href="/topics/${t}/"`)) fail(`dist/blog/index.html has no chip for /topics/${t}/`);
}

// 4. a post's tag links to its topic
const postHtml = read('blog/permission-denied-publickey-ubuntu/index.html');
if (!postHtml.includes('href="/topics/ssh/"')) {
	fail('dist/blog/permission-denied-publickey-ubuntu/index.html does not link /topics/ssh/');
}

// 5. the homepage carries the new intro sentence and sections, and no future-me
const homeHtml = read('index.html');
const homeText = homeHtml.replace(/\s+/g, ' ');
const intro = 'Tested Linux, DevOps and AI guides, with the real commands, the real errors, and the fixes that worked.';
if (!homeText.includes(intro)) fail('dist/index.html is missing the intro sentence');
for (const marker of ['start_here.sh', 'popular_fixes.log', 'topics/', 'deep_dives/']) {
	if (!homeHtml.includes(marker)) fail(`dist/index.html is missing ${marker}`);
}
if (homeHtml.includes('future-me')) fail('dist/index.html still mentions future-me');

// 6. every /blog/<id>/ link on the homepage and the topic pages resolves
const files = [
	'index.html',
	'topics/index.html',
	...TOPIC_SLUGS.map((slug) => `topics/${slug}/index.html`),
];
for (const file of files) {
	for (const id of new Set(postIds(read(file)))) {
		if (!existsSync(join(dist, 'blog', id, 'index.html'))) {
			fail(`${file} links /blog/${id}/ but dist/blog/${id}/index.html does not exist`);
		}
	}
}

// 7. the new homepage sections use no em dash or en dash in their visible text
const sections = [...homeHtml.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map((m) => m[1]);
const labels = ['start_here.sh', 'popular_fixes.log', 'topics/', 'deep_dives/'];
for (const section of sections.filter((s) => labels.some((label) => s.includes(label)))) {
	if (/&mdash;|&ndash;|&#8212;|&#8211;|[\u2014\u2013]/i.test(section)) {
		fail('a new homepage section contains an em dash or en dash');
	}
}
if (!sections.some((s) => s.includes('deep_dives/'))) fail('could not find the new homepage sections');

// sanity: readdir keeps the check honest if the dist layout changes
if (!readdirSync(dist).includes('blog')) fail('dist/ has no blog/ directory');

console.log('site curation: ok');
