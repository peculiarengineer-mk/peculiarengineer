// Build the weekly newsletter draft from what published this week: pull the
// RSS feed, keep the posts inside the window, summarise each one and write a
// Markdown draft with room for Keith's own lines. With --push the draft is
// created in Buttondown and waits there until he adds his lines and sends it.
// Node 22 built-ins only, meant to run from a LaunchAgent once a week.
// usage: node scripts/newsletter-digest.mjs [--feed <url-or-path>] [--now <ISO date>] [--days <n>] [--out <dir>] [--push] [--stdout]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const { values } = parseArgs({
	options: {
		feed: { type: 'string', default: 'https://peculiarengineer.com/rss.xml' },
		now: { type: 'string' },
		days: { type: 'string', default: '7' },
		out: { type: 'string' },
		push: { type: 'boolean', default: false },
		stdout: { type: 'boolean', default: false },
	},
});

const days = Number(values.days);
if (!Number.isFinite(days) || days <= 0) {
	console.error('--days must be a positive number');
	process.exit(1);
}
// --now has to start with YYYY-MM-DD so the window and the date stamped on the
// draft come from the same value
if (values.now && !/^\d{4}-\d{2}-\d{2}/.test(values.now)) {
	console.error('--now must be an ISO date');
	process.exit(1);
}
const now = values.now ? new Date(values.now) : new Date();
if (Number.isNaN(now.getTime())) {
	console.error('--now must be an ISO date');
	process.exit(1);
}

// the calendar date to stamp the file and the subject with: the date part of
// --now as written, so the name does not shift with the machine timezone
function nowDateParts() {
	const m = values.now ? values.now.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
	if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
	const d = new Date();
	return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// CDATA is literal text, so it comes back as is. Everything else gets the
// named entities the feed uses plus any numeric ones decoded, all in one pass
// so &amp;lt; comes out as the text &lt; and not as a tag bracket.
function decode(raw) {
	const text = raw.trim();
	const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
	if (cdata) return cdata[1].trim();
	const named = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&' };
	return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|nbsp|amp);/gi, (whole, ref) => {
		if (ref[0] !== '#') return named[ref.toLowerCase()] ?? whole;
		const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
		// a code point past Unicode would throw, so a bad entity stays as written
		return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
	});
}

// the draft is Markdown that Buttondown renders, so a < or > in a title would
// turn into an HTML tag and a ] would end the link text early
function mdText(text) {
	return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function mdLinkText(text) {
	return mdText(text).replace(/([\\[\]])/g, '\\$1');
}

function field(block, name) {
	const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
	return m ? decode(m[1]) : '';
}

// pull the posts out of the feed with regexes: the site is a static Astro blog
// and the item blocks are simple, so no XML parser is worth a dependency here
function parseItems(xml) {
	const items = [];
	for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
		const block = m[1];
		const pubDate = field(block, 'pubDate');
		const time = Date.parse(pubDate);
		if (Number.isNaN(time)) continue;
		items.push({
			title: field(block, 'title'),
			link: field(block, 'link'),
			description: field(block, 'description'),
			time,
		});
	}
	return items;
}

// one line per post: the first sentence of the description, cut to 200
// characters at a word boundary with ... when the sentence runs longer
function summarize(description) {
	const text = description.replace(/\s+/g, ' ').trim();
	const dot = text.search(/\.\s/);
	const first = dot === -1 ? text : text.slice(0, dot + 1);
	if (first.length <= 200) return first;
	let cut = first.slice(0, 201);
	const space = cut.lastIndexOf(' ');
	if (space > 0) cut = cut.slice(0, space);
	return cut.trimEnd() + '...';
}

// network calls give up after 30 seconds so a hung server can't stall the
// weekly run
// returns the response with its body already read, since the timeout covers
// the body download too
async function fetchOrExit(url, options, what) {
	try {
		const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
		return { ok: res.ok, status: res.status, text: await res.text() };
	} catch (err) {
		console.error(`${what} failed: ${err.name}: ${err.message}`);
		process.exit(1);
	}
}

let xml;
if (values.feed.startsWith('http')) {
	const res = await fetchOrExit(values.feed, {}, 'feed fetch');
	if (!res.ok) {
		console.error(`feed fetch failed: ${res.status}`);
		process.exit(1);
	}
	xml = res.text;
} else {
	xml = readFileSync(path.resolve(values.feed), 'utf8');
}

// the window is the --days days ending at --now: the start instant counts,
// anything published after --now does not
const start = now.getTime() - days * 24 * 60 * 60 * 1000;
const posts = parseItems(xml)
	.filter((item) => item.time >= start && item.time <= now.getTime())
	.sort((a, b) => a.time - b.time);

if (posts.length === 0) {
	console.log(`No new posts in the last ${days} days; no draft written.`);
	process.exit(0);
}

const parts = nowDateParts();
const stamp = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
const longDate = new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
});
const subject = `Peculiar Engineer weekly: ${longDate}`;
const body = [
	'<!-- KEITH: write one or two lines about your week here, then delete this comment -->',
	'',
	'## New this week',
	...posts.map((post) => `- [${mdLinkText(post.title)}](${post.link}): ${mdText(summarize(post.description))}`),
	'',
	'## One useful thing',
	'<!-- KEITH: optional. A tool, command or link you found useful this week. Delete this section if nothing. -->',
	'',
	'Thanks for reading. Reply to this email if a guide saved you time or went stale.',
].join('\n');
// the file is the front matter Buttondown reads plus the body
const draft = `---\nsubject: ${subject}\n---\n\n${body}\n`;

if (values.stdout) {
	process.stdout.write(draft);
} else {
	const outDir = values.out ? path.resolve(values.out) : path.join(repoRoot, 'newsletter', 'drafts');
	const outPath = path.join(outDir, `${stamp}.md`);
	mkdirSync(outDir, { recursive: true });
	writeFileSync(outPath, draft);
	console.log(outPath);
}

if (values.push) {
	const noKeyLine = 'BUTTONDOWN_API_KEY not set; draft written locally only.';
	const token = process.env.BUTTONDOWN_API_KEY;
	if (!token) {
		console.log(noKeyLine);
		process.exit(0);
	}
	const res = await fetchOrExit(
		'https://api.buttondown.com/v1/emails',
		{
			method: 'POST',
			headers: {
				Authorization: `Token ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ subject, body, status: 'draft' }),
		},
		'Buttondown draft',
	);
	const text = res.text;
	if (!res.ok) {
		// the status and the response text only: the key never gets printed
		console.error(`Buttondown draft failed: ${res.status} ${text}`);
		process.exit(1);
	}
	let id;
	try {
		id = JSON.parse(text)?.id;
	} catch {
		// a 2xx body that is not JSON has no id to report
	}
	console.log(id ? `Buttondown draft created: ${id}` : 'Buttondown draft created.');
}
