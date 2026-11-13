import sharp from 'sharp';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#11140f', bg1 = '#070906', grid = '#1d2419', ghost = '#2f3b28';
const dim = '#8d9a84', bright = '#c8d98a', accent = '#e0b25c', good = '#6fc48a', bad = '#ef7f6f';
const badge = 'VALHEIM 1.0.21 · YOUR OWN SERVER'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'rented server', a: '2 vCPU 4 GB', b: '$24/mo' },
  { k: 'memory used', a: '1.3 GB', b: 'empty world' },
  { k: 'after a crash', a: 'restarts in', b: '10 s' },
  { k: 'nightly backup', a: 'takes', b: '4 s' },
];
const term = [
  ['$','systemctl restart valheim','bright'],
  ['#','about a minute later:','dim'],
  ['','ZNet.LoadWorld: Midgard (Midgard), save number 4','good'],
  ['','registered with join code 061818','accent'],
  ['$','kill -9 $(systemctl show -p MainPID ...)','bright'],
  ['','Scheduled restart job, restart counter is at 1','good'],
  ['$','valheim-backup','bright'],
  ['$','ls -lh /opt/valheim-backups','bright'],
  ['','145K world-2026-11-13.tar.gz','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const pre = l => l[0]==='$' ? `<tspan fill="${accent}">$</tspan> ` : l[0]==='#' ? `<tspan fill="${dim}">#</tspan> ` : '';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><path d="M1160 620l40-90l40 90M1200 530v-20M1175 580h50"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="720" height="462" rx="11" fill="#0a0c09" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="792" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">your world, on all the time</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*27}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${pre(l)}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="552" font-family="${mono}" font-size="16" fill="${dim}">friends can play while you are offline.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="850" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHAT I MEASURED</text>
  <text x="1010" y="232" font-size="12" fill="${dim}">&#160;</text><text x="1160" y="232" font-size="12" fill="${dim}">&#160;</text>
  ${rows.map((r,i)=>{const y=268+i*44;return `<line x1="850" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="850" y="${y}" font-size="14" fill="${dim}">${esc(r.k)}</text><text x="1010" y="${y}" font-size="14" fill="${bright}">${esc(r.a)}</text><text x="1160" y="${y}" font-size="14" fill="${good}">${esc(r.b)}</text>`;}).join('\n  ')}
  <text x="850" y="${268+4*44+8}" font-size="13" fill="${accent}">restore a backup once, before you need it.</text>
  <text x="850" y="${268+4*44+32}" font-size="13" fill="${accent}">a missing world comes back empty, silently.</text></g>
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/valheim-server-hero.png', import.meta.url).pathname);
console.log('wrote hero');
