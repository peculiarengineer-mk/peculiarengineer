// Render a captured terminal transcript to a PNG in the site's terminal style.
// Usage: node scripts/render-terminal.mjs <input.txt> <output.png> "<title>"
// Lines starting with "$ " are commands; everything else is output. A line
// starting with "#! " is a highlighted output line (rendered in the accent colour).
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const [,, input, output, title = ''] = process.argv;
if (!input || !output) { console.error('usage: render-terminal.mjs <in.txt> <out.png> [title]'); process.exit(2); }

const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg = '#0e0b09', frame = '#9a8a76', grid = '#251e18';
const dim = '#c9b9a3', prompt = '#f5c56b', cmd = '#e8a33d', hi = '#4fbf87', warn = '#f2837a';
const fs = 15, lh = 24, padX = 28, padTop = 78, padBottom = 28, maxCols = 100;

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const wrap = (s, width = maxCols) => { const out=[]; while (s.length > width) { let cut = s.lastIndexOf(' ', width); if (cut < width * 0.5) cut = width; out.push(s.slice(0, cut)); s = '  ' + s.slice(cut).replace(/^ +/, ''); } out.push(s); return out; };

const raw = readFileSync(input, 'utf8').replace(/\r/g,'').replace(/\s+$/,'').split('\n');
const lines = [];
for (const l of raw) {
  if (l.startsWith('$ ')) wrap(l.slice(2), maxCols - 2).forEach((w, i) => lines.push({ t: w, k: i === 0 ? 'cmd' : 'cmdcont' }));
  else if (l.startsWith('#! ')) wrap(l.slice(3)).forEach(w => lines.push({ t: w, k: 'hi' }));
  else if (l.startsWith('#x ')) wrap(l.slice(3)).forEach(w => lines.push({ t: w, k: 'warn' }));
  else wrap(l).forEach(w => lines.push({ t: w, k: 'out' }));
}
const cols = Math.min(maxCols, Math.max(60, ...lines.map(l => l.t.length + (l.k === 'cmd' ? 2 : 0))));
const W = Math.round(padX * 2 + cols * 9.05), H = padTop + lines.length * lh + padBottom;

const body = lines.map((l, i) => {
  const y = padTop + i * lh;
  if (l.k === 'cmd') return `<text x="${padX}" y="${y}" font-family="${mono}" font-size="${fs}" fill="${cmd}" xml:space="preserve"><tspan fill="${prompt}">$</tspan> ${esc(l.t)}</text>`;
  const c = { cmdcont: cmd, hi: hi, warn: warn, out: dim }[l.k];
  return `<text x="${padX}" y="${y}" font-family="${mono}" font-size="${fs}" fill="${c}" xml:space="preserve">${esc(l.t)}</text>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="11" fill="${bg}" stroke="${frame}" stroke-width="1.5"/>
  <line x1="0" y1="50" x2="${W}" y2="50" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="26" cy="26" r="6" fill="${frame}"/><circle cx="46" cy="26" r="6" fill="${frame}"/><circle cx="66" cy="26" r="6" fill="${frame}"/>
  <text x="92" y="31" font-family="${mono}" font-size="15" fill="${frame}">${esc(title)}</text>
  ${body}
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W * 2, H * 2).png().toFile(output);
console.log(`wrote ${output} (${W}x${H} @2x, ${lines.length} lines)`);
