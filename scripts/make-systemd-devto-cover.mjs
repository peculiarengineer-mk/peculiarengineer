import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// dev.to cover spec is 1000x420. Rendered at 2x for crispness.
const W = 1000, H = 420;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// warm amber on charcoal, matching the post hero
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g" cx="26%" cy="30%" r="86%">
      <stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#p)" opacity="0.55"/>

  <!-- left: the line -->
  <text x="54" y="104" font-family="${mono}" font-size="15" letter-spacing="3" fill="${bright}">&#9670; UBUNTU 26.04 &#183; SYSTEMD</text>

  <text x="54" y="168" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">The box was off</text>
  <text x="54" y="216" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">at 03:30.</text>
  <text x="54" y="264" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">Now what?</text>

  <line x1="54" y1="298" x2="470" y2="298" stroke="${dim}" stroke-width="1.5"/>
  <text x="54" y="330" font-family="${mono}" font-size="16" fill="${dim}">units and timers for people who have</text>
  <text x="54" y="356" font-family="${mono}" font-size="16" fill="${dim}">never opened one, measured on a real box</text>

  <!-- right: the evidence -->
  <g font-family="${mono}">
    <rect x="546" y="72" width="404" height="280" rx="10" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="546" y1="116" x2="950" y2="116" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="572" cy="94" r="5" fill="${dim}"/><circle cx="590" cy="94" r="5" fill="${dim}"/><circle cx="608" cy="94" r="5" fill="${dim}"/>
    <text x="632" y="99" font-size="14" fill="${dim}">journalctl -u daily.service -b</text>

    <text x="572" y="150" font-size="13" fill="${dim}">23:07:27  poweroff</text>
    <text x="572" y="176" font-size="13" fill="${bad}">23:10:00  scheduled run, box dark</text>
    <text x="572" y="202" font-size="13" fill="${dim}">23:12:01  boot</text>
    <text x="572" y="228" font-size="13" fill="${good}">23:12:11  daily job ran</text>

    <line x1="572" y1="252" x2="924" y2="252" stroke="${grid}" stroke-width="1.5"/>
    <text x="572" y="282" font-size="16" fill="${good}">Persistent=true</text>
    <text x="572" y="308" font-size="13" fill="${dim}">cron would have skipped it and said nothing.</text>
    <text x="572" y="334" font-size="13" fill="${dim}">also: why it fires 27s late, and %T = /tmp</text>
  </g>
</svg>`;

writeFileSync(new URL('../social/.systemd-devto-cover.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png()
  .toFile(new URL('../social/systemd-units-timers-devto-cover.png', import.meta.url).pathname);
console.log('wrote social/systemd-units-timers-devto-cover.png');
