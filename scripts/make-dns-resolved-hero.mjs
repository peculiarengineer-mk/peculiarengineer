import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// warm amber on charcoal, the Ubuntu hub family
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="28%" cy="32%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost chain, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linecap="round">
    <circle cx="1090" cy="620" r="14"/><circle cx="1170" cy="620" r="14"/><circle cx="1250" cy="620" r="14"/>
    <path d="M1104 620 H1156 M1184 620 H1236"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="948" y="48" width="364" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="972" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; DNS</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">who is 127.0.0.53</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> cat /etc/resolv.conf</text>
    <text x="104" y="242" font-family="${mono}" font-size="14" fill="${accent}">nameserver 127.0.0.53</text>

    <text x="104" y="288" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> resolvectl query example.com</text>
    <text x="104" y="314" font-family="${mono}" font-size="14" fill="${dim}">example.com: 104.20.23.154   <tspan fill="${accent}">-- link: eth0</tspan></text>
    <text x="104" y="338" font-family="${mono}" font-size="14" fill="${dim}">-- Information acquired via protocol DNS in 5.9ms.</text>
    <text x="104" y="362" font-family="${mono}" font-size="14" fill="${good}">-- Data from: network</text>

    <text x="104" y="408" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> resolvectl domain</text>
    <text x="104" y="434" font-family="${mono}" font-size="14" fill="${dim}">Link 2 (eth0):  <tspan fill="${accent}">~.</tspan></text>
    <text x="104" y="458" font-family="${mono}" font-size="14" fill="${dim}">Link 3 (corp0): <tspan fill="${accent}">~corp.example</tspan><tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="518" font-family="${mono}" font-size="17" fill="${dim}">two layers. files, then dns.</text>
    <text x="104" y="546" font-family="${mono}" font-size="17" fill="${dim}">ping asks the first. dig asks the second.</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">TWO RESOLV.CONF FILES</text>
    <rect x="852" y="216" width="456" height="80" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="14" fill="${accent}">stub-resolv.conf  -&gt; 127.0.0.53</text>
    <text x="876" y="274" font-size="14" fill="${dim}">resolv.conf       -&gt; the real upstreams</text>

    <text x="852" y="340" font-size="20" letter-spacing="2" fill="${dim}">WHAT SURVIVES A REBOOT</text>
    <rect x="852" y="360" width="456" height="86" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="392" font-size="14" fill="${good}">netplan nameservers: yes</text>
    <text x="876" y="416" font-size="14" fill="${bad}">resolvectl dns eth0 ...: no</text>

    <text x="852" y="490" font-size="20" letter-spacing="2" fill="${dim}">THE OUTAGE SETTING</text>
    <rect x="852" y="510" width="456" height="86" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="542" font-size="14" fill="${bad}">DNSOverTLS=yes with DHCP servers</text>
    <text x="876" y="566" font-size="14" fill="${dim}">no answer for 20s. set DNS= too.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.dns-resolved-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/dns-resolved-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/dns-resolved-hero.png');
