// Check that analytics loads by default in the built page: take the inline gtag
// script from dist/index.html, run it against fake storage in a vm context and
// see whether it appends the gtag.js tag. A stored "denied" is the only value
// that keeps analytics off.
// Usage: node scripts/test-consent-default.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('dist/index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const gtag = scripts.find((m) => /window\.peLoadAnalytics\s*=/.test(m[1]));
if (!gtag) {
	console.error('FAIL no inline gtag script defining window.peLoadAnalytics in dist/index.html');
	process.exit(1);
}

// run the extracted script with a fake window, document and localStorage
function run(stored, throws) {
	const appended = [];
	const sandbox = {
		document: {
			createElement: () => ({}),
			head: { appendChild: (s) => appended.push(String(s.src || '')) },
		},
		localStorage: {
			getItem: (k) => {
				if (throws) throw new Error('storage blocked');
				return k === 'pe-consent' ? stored : null;
			},
		},
	};
	sandbox.window = sandbox;
	vm.runInNewContext(gtag[1], sandbox);
	return appended;
}

const gtagLoads = (a) => a.filter((src) => src.includes('googletagmanager.com/gtag/js')).length === 1;
const appendsNothing = (a) => a.length === 0;

const cases = [
	['no stored value loads gtag.js', null, false, gtagLoads],
	['granted loads gtag.js', 'granted', false, gtagLoads],
	['denied appends nothing', 'denied', false, appendsNothing],
	['throwing getItem loads gtag.js', null, true, gtagLoads],
];

let failed = false;
for (const [name, stored, throws, check] of cases) {
	const ok = check(run(stored, throws));
	if (!ok) failed = true;
	console.log((ok ? 'PASS ' : 'FAIL ') + name);
}
process.exit(failed ? 1 : 0);
