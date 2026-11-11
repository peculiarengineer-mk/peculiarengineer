// Worker for peculiarengineer.com. Static pages are served from ./dist by the
// assets layer; this script only sees /api/* (see run_worker_first in wrangler.jsonc).
//
// POST /api/zomboid-apply: the managed Project Zomboid server application form.
// Order: Turnstile check, field validation, store in D1, then email a notification.
// The row is written before the email, so a failed send never loses an application.

import { EmailMessage } from 'cloudflare:email';

// Minimal local types, so this file needs no extra type packages.
interface D1Result {
	meta: { last_row_id: number };
}
interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	run(): Promise<D1Result>;
}
interface D1Database {
	prepare(query: string): D1PreparedStatement;
}
interface SendEmail {
	send(message: EmailMessage): Promise<void>;
}
interface Env {
	ASSETS: { fetch(request: Request): Promise<Response> };
	DB: D1Database;
	NOTIFY: SendEmail;
	NOTIFY_FROM: string;
	NOTIFY_TO: string;
	TURNSTILE_SECRET: string;
}

const FORM_PAGE = '/zomboid/';
const THANKS_PAGE = '/zomboid/thanks/';
const MAX_BODY_BYTES = 20_000;
const GROUP_SIZES = ['2-4', '5-8', '9-10', '11+'];

// field name -> [max length, required]
const FIELDS: Record<string, [number, boolean]> = {
	name: [100, true],
	email: [254, true],
	discord: [100, false],
	group_size: [10, true],
	mods: [2000, true],
	schedule: [300, false],
	hosting: [300, false],
	pains: [2000, false],
};

// Plain address check: one @, a dot in the domain, no spaces or line breaks.
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/api/zomboid-apply') {
			if (request.method !== 'POST') {
				return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
			}
			return handleApply(request, env, url);
		}
		if (url.pathname.startsWith('/api/')) {
			return new Response('Not Found', { status: 404 });
		}
		return env.ASSETS.fetch(request);
	},
};

function back(url: URL, path: string, error?: string): Response {
	const target = new URL(path, url.origin);
	if (error) {
		target.searchParams.set('error', error);
		target.hash = 'apply';
	}
	return Response.redirect(target.toString(), 303);
}

async function handleApply(request: Request, env: Env, url: URL): Promise<Response> {
	const type = request.headers.get('content-type') ?? '';
	if (!type.startsWith('application/x-www-form-urlencoded') && !type.startsWith('multipart/form-data')) {
		return new Response('Unsupported Media Type', { status: 415 });
	}

	// Read the body with a byte cap (Content-Length can be absent or wrong), then parse.
	const body = await readCapped(request, MAX_BODY_BYTES);
	if (body === null) return new Response('Payload Too Large', { status: 413 });

	let form: FormData;
	try {
		form = await new Request(request.url, { method: 'POST', headers: { 'content-type': type }, body }).formData();
	} catch {
		return back(url, FORM_PAGE, 'invalid');
	}

	// Honeypot: a field hidden from people. Bots that fill it get a quiet "thanks".
	if (String(form.get('website') ?? '').trim() !== '') return back(url, THANKS_PAGE);

	const ip = request.headers.get('cf-connecting-ip') ?? '';
	const token = String(form.get('cf-turnstile-response') ?? '');
	if (!token || !(await turnstileOk(token, ip, env.TURNSTILE_SECRET, url.hostname))) {
		return back(url, FORM_PAGE, 'captcha');
	}

	const values: Record<string, string> = {};
	for (const [field, [max, required]] of Object.entries(FIELDS)) {
		const raw = form.get(field);
		// Browsers send textarea line breaks as CRLF; count them as one character like maxlength does.
		const value = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : '';
		if (value.length > max || (required && value === '')) return back(url, FORM_PAGE, 'invalid');
		values[field] = value;
	}
	if (!EMAIL_RE.test(values.email) || !GROUP_SIZES.includes(values.group_size)) {
		return back(url, FORM_PAGE, 'invalid');
	}

	const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? null;

	let id: number;
	try {
		const result = await env.DB.prepare(
			`INSERT INTO applications (name, email, discord, group_size, mods, schedule, hosting, pains, country)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				values.name,
				values.email,
				values.discord || null,
				values.group_size,
				values.mods,
				values.schedule || null,
				values.hosting || null,
				values.pains || null,
				country,
			)
			.run();
		id = result.meta.last_row_id;
	} catch (err) {
		console.error('d1 insert failed', err);
		return back(url, FORM_PAGE, 'server');
	}

	try {
		await env.NOTIFY.send(buildNotification(env, id, values, country));
		await env.DB.prepare('UPDATE applications SET emailed = 1 WHERE id = ?').bind(id).run();
	} catch (err) {
		// The application is saved; the email is a convenience. Log and carry on.
		console.error('notification email failed', id, err);
	}

	return back(url, THANKS_PAGE);
}

async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
	if (!request.body) return new Uint8Array();
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > max) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}

async function turnstileOk(token: string, ip: string, secret: string, hostname: string): Promise<boolean> {
	const body = new FormData();
	body.append('secret', secret);
	body.append('response', token);
	if (ip) body.append('remoteip', ip);
	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body,
		});
		const data = (await res.json()) as { success?: boolean; hostname?: string };
		// The token must have been solved on this site (skipped for local `wrangler dev`,
		// where the test secret reports a placeholder hostname).
		if (hostname !== 'localhost' && data.hostname !== hostname) return false;
		return data.success === true;
	} catch (err) {
		console.error('siteverify failed', err);
		return false;
	}
}

// ── Notification email (raw MIME, as the Email Routing send_email binding expects) ──

function b64utf8(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

// RFC 2047 encoded word, so any character in a name is safe in a header.
function encodeHeader(text: string): string {
	return `=?UTF-8?B?${b64utf8(text.replace(/[\r\n]+/g, ' '))}?=`;
}

function buildNotification(env: Env, id: number, v: Record<string, string>, country: string | null): EmailMessage {
	const lines = [
		`Application #${id}`,
		'',
		`Name:        ${v.name}`,
		`Email:       ${v.email}`,
		`Discord:     ${v.discord || '-'}`,
		`Group size:  ${v.group_size}`,
		`Schedule:    ${v.schedule || '-'}`,
		`Hosting now: ${v.hosting || '-'}`,
		`Country:     ${country ?? '-'}`,
		'',
		'Mods / Workshop collection:',
		v.mods,
		'',
		'Top complaints with their current server:',
		v.pains || '-',
		'',
		'Reply to this email to answer the applicant directly.',
	];
	const body = b64utf8(lines.join('\r\n')).replace(/.{76}/g, '$&\r\n');
	const domain = env.NOTIFY_FROM.split('@')[1];

	const raw = [
		`From: Peculiar Engineer <${env.NOTIFY_FROM}>`,
		`To: <${env.NOTIFY_TO}>`,
		// The address passed EMAIL_RE above, so it holds no spaces, brackets or line breaks.
		`Reply-To: <${v.email}>`,
		`Subject: ${encodeHeader(`Zomboid server application #${id}: ${v.name.slice(0, 40)} (${v.group_size})`)}`,
		`Date: ${new Date().toUTCString()}`,
		`Message-ID: <${crypto.randomUUID()}@${domain}>`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		body,
	].join('\r\n');

	return new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, raw);
}
