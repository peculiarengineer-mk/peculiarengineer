import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

const badge = 'DEBIAN 13 · STATIC IP';
const termTitle = 'no netplan here';
const termLines = [
  {t:'ls /etc/netplan',p:1,c:'bright',size:15},{t:'No such file or directory',c:'bad'},
  {t:'',c:'dim'},{t:'# /etc/network/interfaces.d/eth0',c:'dim'},
  {t:'auto eth0',c:'bright'},{t:'iface eth0 inet static',c:'bright'},{t:'    address 192.168.1.50/24',c:'accent'},{t:'    gateway 192.168.1.1',c:'accent'},{t:'    dns-nameservers 1.1.1.1 9.9.9.9',c:'accent'},
  {t:'',c:'dim'},{t:'echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg',p:1,c:'bright',size:12},
  {t:'ifquery eth0 && ifdown eth0 && ifup eth0',p:1,c:'good'}
];
const rightTitle = 'TWO WAYS, PICK ONE';
const rightRows = [
  {k:'ifupdown (the Debian default)',v:'/etc/network/interfaces.d/eth0',c:'good'},
  {k:'systemd-networkd (already installed)',v:'/etc/systemd/network/10-eth0.network'},
  {k:'the trap on a cloud image',v:'cloud-init rewrites your file every boot',c:'bad'},
  {k:'DNS goes through',v:'resolvconf, not systemd-resolved',c:'dim'}
];
const footer = 'dhcpcd is the DHCP client now. isc-dhcp-client is gone.';
const closer = 'stay where I left you.';

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

writeFileSync(new URL('../src/assets/.static-ip-debian-13-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/static-ip-debian-13-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/static-ip-debian-13-hero.png');
