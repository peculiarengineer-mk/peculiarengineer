import sharp from 'sharp';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#12101a', bg1 = '#08070c', grid = '#1f1b2b', ghost = '#342c4a';
const dim = '#9189a8', bright = '#b48cf0', accent = '#62c7f0', good = '#4fbf87', bad = '#f2837a';
const badge = 'JELLYFIN 12.4 · APT · 26.04 / 24.04 / DEBIAN 13'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'Ubuntu 26.04', s: 'resolute', v: '12.4+ubu2604', h: '750' },
  { k: 'Ubuntu 24.04', s: 'noble', v: '12.4+ubu2404', h: '750' },
  { k: 'Debian 13', s: 'trixie', v: '12.4+deb13', h: '700' },
];
const term = [
  ['$','sudo apt install -y jellyfin','bright'],
  ['','Setting up jellyfin (12.4+ubu2604) ...','dim'],
  ['$','curl -s localhost:8096/health','bright'],
  ['','Healthy','good'],
  ['','','dim'],
  ['#','library at /home/example/Media/Movies:','dim'],
  ['','The path could not be found.','bad'],
  ['$','sudo -u jellyfin ls /home/example','bright'],
  ['','Permission denied','bad'],
  ['#','library at /srv/media/movies (group jellyfin):','dim'],
  ['','MovieCount: 1','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const pre = l => l[0]==='$' ? `<tspan fill="${accent}">$</tspan> ` : l[0]==='#' ? `<tspan fill="${dim}">#</tspan> ` : '';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><path d="M1200 540l-50 80h100z"/><path d="M1200 568l-22 36h44z"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="720" height="462" rx="11" fill="#0c0a12" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="792" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">install, then the folder</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*27}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${pre(l)}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="552" font-family="${mono}" font-size="16" fill="${dim}">same repo, same commands, one folder rule.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="850" y="200" font-size="20" letter-spacing="2" fill="${dim}">SAME STEPS, THREE RELEASES</text>
  <text x="1010" y="232" font-size="12" fill="${dim}">suite</text><text x="1110" y="232" font-size="12" fill="${dim}">package</text><text x="1248" y="232" font-size="12" fill="${dim}">home</text>
  ${rows.map((r,i)=>{const y=268+i*44;return `<line x1="850" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="850" y="${y}" font-size="14" fill="${dim}">${esc(r.k)}</text><text x="1010" y="${y}" font-size="14" fill="${bright}">${r.s}</text><text x="1110" y="${y}" font-size="14" fill="${good}">${r.v}</text><text x="1262" y="${y}" font-size="14" fill="${bad}">${r.h}</text>`;}).join('\n  ')}
  <text x="850" y="${268+3*44+8}" font-size="13" fill="${accent}">jellyfin can't enter your home dir.</text>
  <text x="850" y="${268+3*44+32}" font-size="13" fill="${accent}">put media in /srv/media instead.</text></g>
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/install-jellyfin-hero.png', import.meta.url).pathname);
console.log('wrote hero');
