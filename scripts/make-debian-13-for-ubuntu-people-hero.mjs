import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b', good = '#4fbf87', bad = '#f2837a';
const badge = 'DEBIAN 13 · FOR UBUNTU PEOPLE'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'kernel',   d: '6.12',              u: '7.0' },
  { k: 'systemd',  d: '257',               u: '259' },
  { k: 'python',   d: '3.13',              u: '3.14' },
  { k: 'sudo',     d: 'original 1.9.16',   u: 'sudo-rs 0.2' },
  { k: 'coreutils',d: 'GNU 9.7',           u: 'uutils 0.8' },
  { k: 'network',  d: 'ifupdown + dhcpcd', u: 'netplan + networkd' },
  { k: 'packages', d: '386',               u: '585' },
];
const term = [
  ['$','ls /etc/netplan','bright'],['','No such file or directory','bad'],
  ['$','ufw status','bright'],['','ufw: command not found','bad'],
  ['$','resolvectl status','bright'],['','resolvectl: command not found','bad'],
  ['$','apt history-list','bright'],['','Error: Invalid operation history-list','bad'],
  ['$','add-apt-repository ppa:x/y','bright'],['','command not found. PPAs are Ubuntu.','bad'],
  ['','','dim'],
  ['','journalctl, apt, systemd: identical.','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><path d="M1160 600 c0 -30 24 -40 40 -40 c16 0 40 10 40 40 c-20 -10 -60 -10 -80 0z"/><circle cx="1200" cy="560" r="4" fill="${ghost}"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">ubuntu habits, debian prompt</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*26}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${l[0]?`<tspan fill="${accent}">$</tspan> `:''}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">same apt, same journal, different plumbing.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">SAME PROVIDER, SAME DAY</text>
  <text x="1000" y="232" font-size="13" fill="${dim}">debian 13</text><text x="1180" y="232" font-size="13" fill="${dim}">ubuntu 26.04</text>
  ${rows.map((r,i)=>{const y=262+i*44;return `<line x1="852" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="852" y="${y}" font-size="14" fill="${dim}">${r.k}</text><text x="1000" y="${y}" font-size="14" fill="${good}">${esc(r.d)}</text><text x="1180" y="${y}" font-size="14" fill="${bright}">${esc(r.u)}</text>`;}).join('\n  ')}
  <text x="852" y="${262+7*44+8}" font-size="13" fill="${accent}">and sshd is socket activated only on Ubuntu.</text></g>
</svg>`;
writeFileSync(new URL('../src/assets/.debian-13-for-ubuntu-people-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/debian-13-for-ubuntu-people-hero.png', import.meta.url).pathname);
console.log('wrote hero');
