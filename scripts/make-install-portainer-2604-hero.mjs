import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b', good = '#4fbf87', bad = '#f2837a';
const badge = 'UBUNTU 26.04 · PORTAINER CE'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'publish',   u: '9443:9443',           f: '127.0.0.1:9443' },
  { k: 'edge port', u: '-p 8000:8000',        f: 'leave it off' },
  { k: 'reach it',  u: 'any address',         f: 'ssh -L 9443' },
  { k: 'first run', u: 'create admin',        f: 'setup_token' },
  { k: 'volume',    u: 'portainer_data:',     f: 'external: true' },
  { k: 'backup',    u: 'hope',                f: 'tar the volume' },
];
const term = [
  ['$','sudo ufw status','bright'],['','OpenSSH    ALLOW    Anywhere','good'],
  ['$','curl -sk -o /dev/null -w "%{http_code}" https://10.99.0.1:9443/','bright'],['','200','bad'],
  ['$','docker logs portainer 2>&1 | grep setup_token','bright'],['','setup_token=7416bc96...','good'],
  ['$','docker ps --format "{{.Ports}}"','bright'],['','8000/tcp, 9000/tcp, 127.0.0.1:9443->9443/tcp','good'],
  ['','','dim'],
  ['','a login in front of the docker socket.','bad'],
  ['','keep it on loopback.','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><rect x="1150" y="540" width="100" height="70" rx="6"/><path d="M1150 575h100M1183 540v35M1217 575v35"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">ufw said no. docker said yes.</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*26}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${l[0]?`<tspan fill="${accent}">$</tspan> `:''}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">bind it, tunnel it, back it up.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE DOCS WAY, THE SAFE WAY</text>
  <text x="1000" y="232" font-size="13" fill="${dim}">docs</text><text x="1130" y="232" font-size="13" fill="${dim}">this post</text>
  ${rows.map((r,i)=>{const y=262+i*44;return `<line x1="852" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="852" y="${y}" font-size="14" fill="${dim}">${r.k}</text><text x="1000" y="${y}" font-size="13" fill="${bright}">${esc(r.u)}</text><text x="1130" y="${y}" font-size="13" fill="${good}">${esc(r.f)}</text>`;}).join('\n  ')}
  <text x="852" y="${262+6*44+8}" font-size="13" fill="${accent}">portainer is root on the host.</text></g>
</svg>`;
writeFileSync(new URL('../src/assets/.install-portainer-2604-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/install-portainer-2604-hero.png', import.meta.url).pathname);
console.log('wrote hero');
