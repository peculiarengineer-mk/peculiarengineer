// Check the weekly newsletter digest end to end: run scripts/newsletter-digest.mjs
// against the fixture feed with a temp --out dir and verify the window filter
// and the order, the subject line, the entity decoding, the summary cut, the
// empty week, the missing Buttondown key and the two Keith comments.
// Dependency-free (node built-ins only). One PASS or FAIL line per check,
// exit 1 on any FAIL.
// usage: node scripts/test-newsletter-digest.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const digest = path.join(here, 'newsletter-digest.mjs');
const fixture = path.join(here, 'fixtures', 'newsletter-digest', 'rss.xml');
const tmpRoot = mkdtempSync(path.join(tmpdir(), 'newsletter-digest-'));

// run the digest and swallow its output: only these PASS/FAIL lines get printed
function run(args, env = process.env) {
	try {
		const stdout = execFileSync(process.execPath, [digest, ...args], {
			encoding: 'utf8',
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		return { status: 0, stdout };
	} catch (err) {
		return { status: err.status === undefined ? 1 : err.status, stdout: String(err.stdout ?? '') };
	}
}

const mainArgs = ['--feed', fixture, '--now', '2026-10-19T07:00:00-07:00', '--days', '7'];
const mainDir = path.join(tmpRoot, 'main');
const mainRun = run([...mainArgs, '--out', mainDir]);
const mainFile = path.join(mainDir, '2026-10-19.md');
const mainText = mainRun.status === 0 && existsSync(mainFile) ? readFileSync(mainFile, 'utf8') : '';
const bullets = [...mainText.matchAll(/^- \[([^\]]+)\]\([^)]+\): (.*)$/gm)];

// (a) exactly the three in-window fixture posts, oldest first, and the two
// outside the window (eight days before --now and after --now) left out
const expectedTitles = [
	'Docker & Debian: one host, two architectures',
	'Zram <swap> tuning on Debian',
	"Nix on macOS: it's a quiet start",
];
const aOk =
	mainRun.status === 0 &&
	JSON.stringify(bullets.map((m) => m[1])) === JSON.stringify(expectedTitles) &&
	!mainText.includes('Ansible "vault" basics') &&
	!mainText.includes('Future post after the window');

// (b) the subject line comes from the --now date
const bOk = /^subject: Peculiar Engineer weekly: October 19, 2026$/m.test(mainText);

// (c) the &amp; in the docker title decodes to a plain &
const cOk =
	mainText.includes('Docker & Debian: one host, two architectures') &&
	!mainText.includes('Docker &amp; Debian');

// (d) the description past 200 characters with no early full stop is cut at a
// word boundary and gets ... appended
const zramSummary = (bullets.find((m) => m[1] === 'Zram <swap> tuning on Debian') || [])[2] || '';
const dOk =
	zramSummary.endsWith('...') &&
	zramSummary.length >= 190 &&
	zramSummary.length <= 203 &&
	!zramSummary.includes('Sunday afternoon');

// (e) a window with no posts prints the no-posts line and writes nothing
const emptyDir = path.join(tmpRoot, 'empty');
const emptyRun = run(['--feed', fixture, '--now', '2026-12-01T00:00:00Z', '--days', '7', '--out', emptyDir]);
const eOk =
	emptyRun.status === 0 &&
	emptyRun.stdout.trim() === 'No new posts in the last 7 days; no draft written.' &&
	(!existsSync(emptyDir) || readdirSync(emptyDir).length === 0);

// (f) --push with no key in the environment says so and still exits 0
const noKeyEnv = { ...process.env };
delete noKeyEnv.BUTTONDOWN_API_KEY;
const pushRun = run([...mainArgs, '--push', '--out', path.join(tmpRoot, 'push')], noKeyEnv);
const fOk =
	pushRun.status === 0 &&
	pushRun.stdout.includes('BUTTONDOWN_API_KEY not set; draft written locally only.');

// (g) the draft keeps both spots for Keith's own lines
const gOk =
	mainText.includes('<!-- KEITH: write one or two lines about your week here, then delete this comment -->') &&
	mainText.includes('<!-- KEITH: optional. A tool, command or link you found useful this week. Delete this section if nothing. -->');

const checks = [
	['(a) keeps the three in-window posts oldest first and drops the two outside', aOk],
	['(b) subject line is Peculiar Engineer weekly: October 19, 2026', bOk],
	['(c) the &amp; in a title decodes to &', cOk],
	['(d) the long summary is cut at a word boundary with ...', dOk],
	['(e) an empty week prints the no-posts line and writes no file', eOk],
	['(f) --push without the Buttondown key exits 0 and says so', fOk],
	['(g) the draft keeps both KEITH comments', gOk],
];

let failed = false;
for (const [name, ok] of checks) {
	if (!ok) failed = true;
	console.log((ok ? 'PASS ' : 'FAIL ') + name);
}
rmSync(tmpRoot, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
