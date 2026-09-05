import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// dev.to cover spec is 1000x420. Rendered at 2x for crispness.
const W = 1000, H = 420;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg0 = '#15101d', bg1 = '#08060c', grid = '#1e1729';
const dim = '#8b7aa3', bright = '#a97fe0', accent = '#c5a6f0';
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
  <text x="54" y="104" font-family="${mono}" font-size="15" letter-spacing="3" fill="${bright}">&#9670; RESTIC &#183; BACKUP</text>

  <text x="54" y="168" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">A backup nobody</text>
  <text x="54" y="216" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">has restored</text>
  <text x="54" y="264" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">is a rumor.</text>

  <line x1="54" y1="298" x2="470" y2="298" stroke="${dim}" stroke-width="1.5"/>
  <text x="54" y="330" font-family="${mono}" font-size="16" fill="${dim}">copying a live SQLite file, restored</text>
  <text x="54" y="356" font-family="${mono}" font-size="16" fill="${dim}">and checked, across three machines</text>

  <!-- right: the evidence -->
  <g font-family="${mono}">
    <rect x="546" y="72" width="404" height="280" rx="10" fill="#0d0a13" stroke="${dim}" stroke-width="1.5"/>
    <line x1="546" y1="116" x2="950" y2="116" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="572" cy="94" r="5" fill="${dim}"/><circle cx="590" cy="94" r="5" fill="${dim}"/><circle cx="608" cy="94" r="5" fill="${dim}"/>
    <text x="632" y="99" font-size="14" fill="${dim}">PRAGMA integrity_check</text>

    <text x="572" y="148" font-size="13" fill="${dim}">run</text>
    <text x="646" y="148" font-size="13" fill="${dim}">wal</text>
    <text x="790" y="148" font-size="13" fill="${dim}">journal</text>

    <text x="572" y="176" font-size="13" fill="${accent}">1</text>
    <text x="646" y="176" font-size="13" fill="${bad}">malformed</text>
    <text x="790" y="176" font-size="13" fill="${bad}">malformed</text>

    <text x="572" y="200" font-size="13" fill="${accent}">2</text>
    <text x="646" y="200" font-size="13" fill="${bad}">malformed</text>
    <text x="790" y="200" font-size="13" fill="${good}">ok</text>

    <text x="572" y="224" font-size="13" fill="${accent}">3</text>
    <text x="646" y="224" font-size="13" fill="${bad}">malformed</text>
    <text x="790" y="224" font-size="13" fill="${bad}">malformed</text>

    <text x="572" y="248" font-size="13" fill="${dim}">..</text>
    <text x="646" y="248" font-size="13" fill="${dim}">..</text>
    <text x="790" y="248" font-size="13" fill="${dim}">..</text>

    <line x1="572" y1="266" x2="924" y2="266" stroke="${grid}" stroke-width="1.5"/>
    <text x="572" y="294" font-size="16" fill="${bad}">19 of 20 restores corrupt</text>
    <text x="572" y="326" font-size="13" fill="${dim}">the first one passed. they always do.</text>
  </g>
</svg>`;

writeFileSync(new URL('../social/.restic-devto-cover.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png()
  .toFile(new URL('../social/backup-homelab-restic-devto-cover.png', import.meta.url).pathname);
console.log('wrote social/backup-homelab-restic-devto-cover.png');
