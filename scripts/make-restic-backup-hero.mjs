import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// violet / plum palette
const bg0 = '#15101d', bg1 = '#08060c', grid = '#1e1729', ghost = '#33244a';
const dim = '#8b7aa3', bright = '#a97fe0', accent = '#c5a6f0';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="28%" cy="32%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost stacked snapshots, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none">
    <rect x="1174" y="600" width="120" height="24" rx="5"/>
    <rect x="1186" y="632" width="120" height="24" rx="5"/>
    <rect x="1198" y="664" width="120" height="24" rx="5"/>
  </g>

  <g>
    <rect x="1016" y="48" width="296" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1040" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; RESTIC &#183; RESTORE</text>
  </g>

  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0d0a13" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">10 restores of a live database</text>

    <g font-family="${mono}" font-size="14">
      <text x="104" y="214" fill="${dim}">run</text><text x="188" y="214" fill="${dim}">wal</text><text x="352" y="214" fill="${dim}">journal</text>
      <text x="104" y="240" fill="${accent}">3</text><text x="188" y="240" fill="${bad}">malformed</text><text x="352" y="240" fill="${bad}">malformed</text>
      <text x="104" y="264" fill="${accent}">7</text><text x="188" y="264" fill="${good}">ok</text><text x="352" y="264" fill="${good}">ok</text>
      <text x="104" y="288" fill="${accent}">9</text><text x="188" y="288" fill="${bad}">malformed</text><text x="352" y="288" fill="${good}">ok</text>
      <text x="104" y="312" fill="${accent}">10</text><text x="188" y="312" fill="${bad}">malformed</text><text x="352" y="312" fill="${bad}">malformed</text>
    </g>
    <text x="104" y="348" font-family="${mono}" font-size="16" fill="${bad}">FAILURES: 12 / 20</text>

    <text x="104" y="406" font-family="${mono}" font-size="15" fill="${dim}">the first one passed.</text>
    <text x="104" y="432" font-family="${mono}" font-size="15" fill="${dim}">that is how you end up</text>
    <text x="104" y="458" font-family="${mono}" font-size="15" fill="${dim}">trusting it for two years.<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="520" font-family="${mono}" font-size="17" fill="${accent}">a backup nobody has restored</text>
    <text x="104" y="548" font-family="${mono}" font-size="17" fill="${accent}">is a rumour.</text>
  </g>

  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">DUMP IT, DO NOT COPY IT</text>
    <rect x="852" y="216" width="456" height="106" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="248" font-size="14" fill="${bad}">.backup  &#8594; database is locked</text>
    <text x="876" y="272" font-size="14" fill="${bad}">         &#8594; 0 byte file</text>
    <text x="876" y="300" font-size="14" fill="${good}">VACUUM INTO &#8594; 0.41s, ok</text>

    <text x="852" y="376" font-size="20" letter-spacing="2" fill="${dim}">FORGET FREES NOTHING</text>
    <rect x="852" y="396" width="456" height="106" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="428" font-size="14" fill="${dim}">16 snapshots        98 MiB</text>
    <text x="876" y="452" font-size="14" fill="${dim}">forget &#8594; 3         98 MiB</text>
    <text x="876" y="478" font-size="14" fill="${accent}">prune  &#8594; 3         26 MiB</text>

    <text x="852" y="546" font-size="17" fill="${dim}">the password is the backup.</text>
    <text x="852" y="572" font-size="17" fill="${dim}">lose it and it is just noise.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.restic-backup-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png()
  .toFile(new URL('../src/assets/restic-backup-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/restic-backup-hero.png');
