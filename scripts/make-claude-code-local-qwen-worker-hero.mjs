import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b', good = '#4fbf87', bad = '#f2837a';
const badge = 'CLAUDE CODE · QWEN 27B · LLAMA.CPP'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// scores from the 2026-10-09 runs (grade.py, 78 tests)
const rows = [
  { k: 'orchestrated 1', u: '84 turns',  f: '78/78', g: true },
  { k: 'orchestrated 2', u: '69 turns',  f: '77/78', g: true },
  { k: 'one shot 1',     u: '23 turns',  f: '74/78' },
  { k: 'one shot 2',     u: '11 turns',  f: '76/78' },
  { k: 'one shot, 90',   u: 'ctx 32,001', f: '71/78' },
];
const term = [
  ['$','pw run ws T2_txn.md 15','bright'],
  ['','{"turns": 5, "finish": "done"}','good'],
  ['$','python3 -c "...; t.delete(\'a\'); t.delete(\'a\')"','bright'],
  ['','delete a: True | again: True (want False)','bad'],
  ['$','pw run ws T2b_txn_rework.md 15','bright'],
  ['','{"turns": 7, "finish": "done"}','good'],
  ['','delete a: True | again: False | ttl: -2','good'],
  ['$','python3 grade.py ws','bright'],
  ['','TOTAL 78/78','good'],
  ['','','dim'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><rect x="1165" y="535" width="80" height="80" rx="6"/><path d="M1180 535v-14M1205 535v-14M1230 535v-14M1180 615v14M1205 615v14M1230 615v14M1165 550h-14M1165 575h-14M1165 600h-14M1245 550h14M1245 575h14M1245 600h14"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">the worker types. the reviewer reads.</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*28}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${l[0]?`<tspan fill="${accent}">$</tspan> `:''}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">"done" is the model's opinion.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">HIDDEN TESTS, SAME MODEL</text>
  ${rows.map((r,i)=>{const y=252+i*48;return `<line x1="852" y1="${y+14}" x2="1300" y2="${y+14}" stroke="${grid}"/><text x="852" y="${y}" font-size="15" fill="${dim}">${esc(r.k)}</text><text x="1040" y="${y}" font-size="14" fill="${bright}">${esc(r.u)}</text><text x="1210" y="${y}" font-size="16" fill="${r.g?good:bad}">${esc(r.f)}</text>`;}).join('\n  ')}
  <text x="852" y="${252+5*48+10}" font-size="14" fill="${accent}">one 24 GB card, about $0.40.</text></g>
</svg>`;
writeFileSync(new URL('../src/assets/.claude-code-local-qwen-worker-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/claude-code-local-qwen-worker-hero.png', import.meta.url).pathname);
console.log('wrote hero');
