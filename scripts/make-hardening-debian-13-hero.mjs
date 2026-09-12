import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

const badge = 'DEBIAN 13 · HARDENING';
const termTitle = 'you get root and nothing else';
const termLines = [
  {t:'getent group sudo',p:1,c:'bright',size:15},{t:'sudo:x:27:            # empty',c:'bad'},
  {t:'systemctl is-enabled nftables',p:1,c:'bright',size:15},{t:'disabled              # no rules, no ufw',c:'bad'},
  {t:'',c:'dim'},{t:'1. adduser keith && usermod -aG sudo keith',c:'bright'},{t:'2. nftables.conf: drop by default, allow 22',c:'bright'},{t:'3. sshd_config.d: PermitRootLogin no, keys only',c:'bright'},{t:'4. unattended-upgrades is already on. add a reboot window',c:'bright'},{t:'5. fail2ban: put your own IP in ignoreip the moment it installs',c:'bright'},
  {t:'',c:'dim'},{t:'firewall first, then touch sshd. never the other way.',c:'accent'}
];
const rightTitle = 'WHAT A FRESH BOX HAS';
const rightRows = [
  {k:'sudo',v:'installed, group empty, root has NOPASSWD',c:'dim'},
  {k:'firewall',v:'nftables installed, disabled, no ufw',c:'bad'},
  {k:'updates',v:'unattended-upgrades on, add a reboot window',c:'good'},
  {k:'ssh',v:'root by key, passwords still allowed',c:'bad'}
];
const footer = 'fail2ban REJECTS, and its bans survive a reboot. whitelist yourself first.';
const closer = 'close the door, then work.';

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const color = c => ({ dim, bright, accent, good, bad })[c] || dim;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="32%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none" stroke-linejoin="round">
    <path d="M1150 560 l40 -30 l40 30 v40 l-40 30 l-40 -30 z"/>
    <path d="M1150 560 l40 30 l40 -30 M1190 590 v40"/>
  </g>
  <g>
    <rect x="${1312 - ((badge.length + 2) * 13.2 + 52)}" y="48" width="${(badge.length + 2) * 13.2 + 52}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="${1312 - ((badge.length + 2) * 13.2 + 52) + 24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text>
  </g>
  <g>
    <rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">${esc(termTitle)}</text>
    ${termLines.map((l, i) => `<text x="104" y="${216 + i * 25}" font-family="${mono}" font-size="${l.size || 14}" fill="${color(l.c)}">${l.p ? '<tspan fill="' + accent + '">$</tspan> ' : ''}${esc(l.t)}</text>`).join('\n    ')}
    <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">${esc(closer)}<tspan fill="${bright}">&#9608;</tspan></text>
  </g>
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">${esc(rightTitle)}</text>
    ${rightRows.map((r, i) => { const y = 236 + i * 74; return `<rect x="852" y="${y}" width="440" height="56" rx="6" fill="none" stroke="${grid}" stroke-width="1.5"/>
    <text x="870" y="${y + 23}" font-size="13" fill="${dim}">${esc(r.k)}</text>
    <text x="870" y="${y + 45}" font-size="15" fill="${color(r.c || 'bright')}">${esc(r.v)}</text>`; }).join('\n    ')}
    <text x="852" y="${236 + rightRows.length * 74 + 12}" font-size="13" fill="${accent}">${esc(footer)}</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.hardening-debian-13-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/hardening-debian-13-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/hardening-debian-13-hero.png');
