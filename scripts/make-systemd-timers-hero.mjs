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

  <!-- ghost clock, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linecap="round">
    <circle cx="1190" cy="600" r="48"/>
    <path d="M1190 600 V566 M1190 600 H1216"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="948" y="48" width="364" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="972" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; SYSTEMD</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">units and timers, from scratch</text>

    <text x="104" y="216" font-family="${mono}" font-size="14" fill="${dim}"># backup.timer</text>
    <text x="104" y="240" font-family="${mono}" font-size="14" fill="${accent}">[Timer]</text>
    <text x="104" y="264" font-family="${mono}" font-size="14" fill="${bright}">OnCalendar=<tspan fill="${accent}">*-*-* 03:30:00</tspan></text>
    <text x="104" y="288" font-family="${mono}" font-size="14" fill="${bright}">Persistent=<tspan fill="${good}">true</tspan></text>
    <text x="104" y="312" font-family="${mono}" font-size="14" fill="${bright}">AccuracySec=<tspan fill="${accent}">1s</tspan></text>

    <text x="104" y="362" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> systemctl list-timers backup.timer</text>
    <g font-family="${mono}" font-size="14">
      <text x="104" y="392" fill="${dim}">NEXT</text><text x="330" y="392" fill="${dim}">LEFT</text><text x="440" y="392" fill="${dim}">LAST</text>
      <text x="104" y="416" fill="${accent}">Fri 03:30:00 UTC</text><text x="330" y="416" fill="${accent}">4h 40min</text><text x="440" y="416" fill="${good}">Thu 23:12:11</text>
    </g>

    <text x="104" y="466" font-family="${mono}" font-size="14" fill="${bad}">daily job ran at /tmp</text>
    <text x="104" y="490" font-family="${mono}" font-size="14" fill="${dim}">%T is systemd's. write %%T.<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="540" font-family="${mono}" font-size="17" fill="${dim}">no shell. no HOME. five entry PATH.</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">WHY IT FIRED LATE</text>
    <rect x="852" y="216" width="456" height="80" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="14" fill="${accent}">AccuracySec defaults to 1min</text>
    <text x="876" y="274" font-size="14" fill="${dim}">measured: 4s to 27s after the minute</text>

    <text x="852" y="340" font-size="20" letter-spacing="2" fill="${dim}">THE BOX WAS OFF AT 03:30</text>
    <rect x="852" y="360" width="456" height="86" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="392" font-size="14" fill="${good}">Persistent=true</text>
    <text x="876" y="416" font-size="14" fill="${dim}">missed run happened 10s after boot</text>

    <text x="852" y="490" font-size="20" letter-spacing="2" fill="${dim}">ENABLE THE TIMER</text>
    <rect x="852" y="510" width="456" height="86" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="542" font-size="14" fill="${accent}">systemctl enable --now job.timer</text>
    <text x="876" y="566" font-size="14" fill="${bad}">never the service</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.systemd-timers-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/systemd-timers-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/systemd-timers-hero.png');
