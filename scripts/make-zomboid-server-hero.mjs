import sharp from 'sharp';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#11140f', bg1 = '#070906', grid = '#1d2419', ghost = '#2f3b28';
const dim = '#8d9a84', bright = '#c8d98a', accent = '#e0b25c', good = '#6fc48a', bad = '#ef7f6f';
const badge = 'PROJECT ZOMBOID 42.22 · SYSTEMD · UBUNTU 26.04'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'default heap', a: '-Xmx8g', b: '-Xmx6g' },
  { k: 'crash restart', a: 'on-failure', b: 'always' },
  { k: 'hung server', a: 'active', b: 'port check' },
  { k: 'rollback', a: 'branch', b: 'branch + world' },
];
const term = [
  ['$','grep Xmx ProjectZomboid64.json','bright'],
  ['','"-Xmx8g",','accent'],
  ['','Out of memory: Killed process (ProjectZomboid6)','bad'],
  ['$','sudo kill -9 $(pgrep -x ProjectZomboid6)','bright'],
  ['','Result=success  NRestarts=0','bad'],
  ['#','broken mod:','dim'],
  ['','Server Terminated.  Active: active (running)','bad'],
  ['#','old branch, new world:','dim'],
  ['','savefile ... from a newer version','bad'],
  ['$','sudo pz-rollback 42.21 1b6d48cf','bright'],
  ['','*** SERVER STARTED ****','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const pre = l => l[0]==='$' ? `<tspan fill="${accent}">$</tspan> ` : l[0]==='#' ? `<tspan fill="${dim}">#</tspan> ` : '';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><rect x="1150" y="520" width="100" height="100" rx="6"/><path d="M1170 560h60M1170 585h40"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="720" height="462" rx="11" fill="#0a0c09" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="792" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">break it on a box you can delete</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*27}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${pre(l)}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="552" font-family="${mono}" font-size="16" fill="${dim}">restore it once before your group moves in.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="850" y="200" font-size="20" letter-spacing="2" fill="${dim}">DEFAULT VS WHAT WORKS</text>
  <text x="1010" y="232" font-size="12" fill="${dim}">default</text><text x="1160" y="232" font-size="12" fill="${dim}">use</text>
  ${rows.map((r,i)=>{const y=268+i*44;return `<line x1="850" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="850" y="${y}" font-size="14" fill="${dim}">${esc(r.k)}</text><text x="1010" y="${y}" font-size="14" fill="${bad}">${esc(r.a)}</text><text x="1160" y="${y}" font-size="14" fill="${good}">${esc(r.b)}</text>`;}).join('\n  ')}
  <text x="850" y="${268+4*44+8}" font-size="13" fill="${accent}">systemd can say running while the port is closed.</text>
  <text x="850" y="${268+4*44+32}" font-size="13" fill="${accent}">tag the backup you take before an update.</text></g>
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/project-zomboid-server-hero.png', import.meta.url).pathname);
console.log('wrote hero');
