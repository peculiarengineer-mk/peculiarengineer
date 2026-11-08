import sharp from 'sharp';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#12101a', bg1 = '#08070c', grid = '#1f1b2b', ghost = '#342c4a';
const dim = '#9189a8', bright = '#b48cf0', accent = '#62c7f0', good = '#4fbf87', bad = '#f2837a';
const badge = 'NAVIDROME 0.64.2 · DOCKER COMPOSE · UBUNTU 26.04'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'data/ owned by root', v: 'Database could not be opened!' },
  { k: 'one 700 folder', v: 'Watcher error' },
  { k: 'ND_SCANSCHEDULE', v: 'Periodic scan is DISABLED' },
  { k: 'first visitor', v: 'becomes admin' },
];
const term = [
  ['$','docker compose up -d','bright'],
  ['$','docker logs navidrome 2>&1 | grep fatal','bright'],
  ['','msg="Database could not be opened!"','bad'],
  ['','error="... no such file or directory"','bad'],
  ['$','ls -ld data','bright'],
  ['','drwxr-xr-x 2 root root 4096 data','bad'],
  ['$','sudo chown -R "$USER":"$USER" data backup','bright'],
  ['$','docker compose up -d','bright'],
  ['','msg="----> Navidrome server is ready!"','good'],
  ['$','curl -s "localhost:4533/rest/ping?..."','bright'],
  ['','"status":"ok","serverVersion":"0.64.2"','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const pre = l => l[0]==='$' ? `<tspan fill="${accent}">$</tspan> ` : l[0]==='#' ? `<tspan fill="${dim}">#</tspan> ` : '';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><circle cx="1180" cy="590" r="22"/><path d="M1202 590V510l40 12"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="720" height="462" rx="11" fill="#0c0a12" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="792" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">/srv/navidrome</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*27}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${pre(l)}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="552" font-family="${mono}" font-size="16" fill="${dim}">the folder exists. the owner is wrong.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="850" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHAT BITES</text>
  <text x="850" y="232" font-size="12" fill="${dim}">cause</text><text x="1040" y="232" font-size="12" fill="${dim}">what you see</text>
  ${rows.map((r,i)=>{const y=268+i*44;return `<line x1="850" y1="${y+12}" x2="1310" y2="${y+12}" stroke="${grid}"/><text x="850" y="${y}" font-size="14" fill="${bright}">${esc(r.k)}</text><text x="1040" y="${y}" font-size="13" fill="${bad}">${esc(r.v)}</text>`;}).join('\n  ')}
  <text x="850" y="${268+4*44+8}" font-size="13" fill="${accent}">make the folders before docker does.</text>
  <text x="850" y="${268+4*44+32}" font-size="13" fill="${accent}">claim the admin. read the log.</text></g>
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/install-navidrome-hero.png', import.meta.url).pathname);
console.log('wrote hero');
