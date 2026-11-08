import sharp from 'sharp';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#14110d', bg1 = '#090806', grid = '#211c15', ghost = '#3a3122';
const dim = '#a39a88', bright = '#e8b86a', accent = '#62c7f0', good = '#4fbf87', bad = '#f2837a';
const badge = 'AUDIOBOOKSHELF 2.37.2 · COMPOSE · UBUNTU 26.04'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const tree = [
  ['Ada Lane/', 0, 'dim'],
  ['The Quiet Harbor/', 1, 'bright'],
  ['Harbor Lights/', 1, 'dim'],
  ['Book 1 - Salt and Signal/', 2, 'bright'],
  ['Book 2 - Low Tide/', 2, 'bright'],
  ['Ben Marsh/', 0, 'dim'],
  ['Cold Open.mp3', 1, 'bad'],
  ['Second Draft.mp3', 1, 'bad'],
];
const term = [
  ['$','docker compose up -d','bright'],
  ['','Container audiobookshelf Started','dim'],
  ['$','curl -s localhost:13378/status','bright'],
  ['','"serverVersion":"2.37.2","isInit":false','good'],
  ['','','dim'],
  ['#','added user: "1000:1000" to a root install:','dim'],
  ['','SQLITE_READONLY: attempt to write a','bad'],
  ['','readonly database','bad'],
  ['$','sudo chown -R 1000:1000 config metadata','bright'],
  ['','4 Added | 0 Updated | 0 Missing','good'],
  ['','Auto Backups are disabled','bad'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const pre = l => l[0]==='$' ? `<tspan fill="${accent}">$</tspan> ` : l[0]==='#' ? `<tspan fill="${dim}">#</tspan> ` : '';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><path d="M1150 610v-50a50 50 0 0 1 100 0v50"/><rect x="1138" y="584" width="24" height="40" rx="6"/><rect x="1238" y="584" width="24" height="40" rx="6"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="720" height="462" rx="11" fill="#0d0b08" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="792" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">/srv/audiobookshelf</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*27}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${pre(l)}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="552" font-family="${mono}" font-size="16" fill="${dim}">own the folders, then press Scan.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="850" y="200" font-size="20" letter-spacing="2" fill="${dim}">ONE FOLDER PER BOOK</text>
  ${tree.map((t,i)=>`<text x="${850+t[1]*26}" y="${244+i*30}" font-size="15" fill="${c(t[2])}">${esc(t[0])}</text>`).join('\n  ')}
  <text x="850" y="${244+8*30+6}" font-size="13" fill="${accent}">two loose files = one book.</text>
  <text x="850" y="${244+8*30+30}" font-size="13" fill="${accent}">give each its own folder.</text></g>
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/install-audiobookshelf-hero.png', import.meta.url).pathname);
console.log('wrote hero');
