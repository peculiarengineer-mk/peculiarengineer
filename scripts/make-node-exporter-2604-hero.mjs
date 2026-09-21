import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#1a1210', bg1 = '#0a0706', grid = '#2a1c16';
const dim = '#a08a7e', bright = '#f28c38', accent = '#f7b27a', good = '#5fd08a', bad = '#f2837a', warn = '#f0c060';
const badge = 'NODE EXPORTER · UBUNTU 26.04'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const term = [
  ['$','sudo apt install --no-install-recommends prometheus-node-exporter','bright'],
  ['','1 package. with recommends: 22.','dim'],
  ['$','curl -s http://10.20.1.10:9100/metrics | grep -E "^(apt_|node_reboot)"','bright'],
  ['','apt_upgrades_pending{...security...} 70','warn'],
  ['','node_reboot_required 0','good'],
  ['$','curl -s prom:9090/api/v1/query?query=up','bright'],
  ['','up{instance="nodex"} 1','good'],
  ['','lastError: connect: connection refused   -> exporter','bad'],
  ['','lastError: context deadline exceeded     -> firewall','bad'],
];
const c = n => ({dim,bright,accent,good,bad,warn})[n] || dim;
// a small sparkline
const pts = [12,14,13,18,22,19,25,31,28,34,30,38,36,41,39,45,43,48,46,52];
const px = i => 852 + i * 23, py = v => 420 - (v - 10) * 3.4;
const path = pts.map((v,i)=>`${i?'L':'M'}${px(i)} ${py(v)}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern>
  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${bright}" stop-opacity="0.35"/><stop offset="100%" stop-color="${bright}" stop-opacity="0"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0a08" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">host metrics, private network</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*30}" font-family="${mono}" font-size="14.5" fill="${c(l[2])}">${l[0]?`<tspan fill="${accent}">$</tspan> `:''}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">93 pending updates on a five minute old box.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}">
  <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">SCRAPED EVERY 15S</text>
  <path d="${path} L${px(pts.length-1)} 430 L852 430 Z" fill="url(#area)"/>
  <path d="${path}" fill="none" stroke="${bright}" stroke-width="2.5"/>
  <circle cx="${px(pts.length-1)}" cy="${py(pts[pts.length-1])}" r="5" fill="${bright}"/>
  <line x1="852" y1="430" x2="1300" y2="430" stroke="${grid}"/>
  <text x="852" y="452" font-size="12" fill="${dim}">node_filesystem_avail_bytes{mountpoint="/"}</text>
  <text x="852" y="500" font-size="14" fill="${dim}">target  <tspan fill="${good}">10.20.1.10:9100</tspan>  bound to the private nic</text>
  <text x="852" y="526" font-size="14" fill="${dim}">ufw     <tspan fill="${good}">allow from 10.20.1.20</tspan>  and nothing else</text>
  <text x="852" y="556" font-size="13" fill="${accent}">three alert rules, one of them already pending.</text></g>
</svg>`;
writeFileSync(new URL('../src/assets/.node-exporter-2604-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/node-exporter-2604-hero.png', import.meta.url).pathname);
console.log('wrote hero');
