import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg = '#070b0f';
const bright = '#64d2ff';
const accent = '#b8f1ff';
const dim = '#32677d';
const faint = '#173540';
const good = '#70d998';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="32%" cy="36%" r="82%">
      <stop offset="0%" stop-color="#0b1720"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#10252e" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <g>
    <rect x="1012" y="48" width="300" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1038" y="77" font-family="${mono}" font-size="19" letter-spacing="1.4" fill="${bright}">&#9670; MAC FILE SHARING</text>
  </g>

  <g font-family="${mono}">
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#091117" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-size="20" fill="${dim}">Finder &#183; Connect to Server</text>

    <text x="104" y="230" font-size="18" fill="${dim}">SERVER ADDRESS</text>
    <rect x="104" y="250" width="568" height="58" rx="7" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="130" y="286" font-size="22" fill="${accent}">smb://Studio-Mac.local</text>

    <text x="126" y="400" font-size="22" fill="${good}">&#10003; connected as registered user</text>
    <text x="126" y="442" font-size="20" fill="${dim}">mounted under Finder Locations</text>
    <text x="126" y="520" font-size="18" fill="${dim}">one share &#183; one account &#183; local network</text>
  </g>

  <g font-family="${mono}">
    <text x="852" y="194" font-size="20" letter-spacing="2" fill="${dim}">ONE FOLDER, TWO MACS</text>

    <rect x="852" y="220" width="456" height="104" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="878" y="261" font-size="25" fill="${accent}">HOST MAC</text>
    <text x="878" y="294" font-size="18" fill="${dim}">File Sharing on &#183; Read &amp; Write</text>

    <line x1="1080" y1="324" x2="1080" y2="382" stroke="${bright}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="1098" y="360" font-size="18" fill="${bright}">SMB on local network</text>

    <rect x="852" y="382" width="456" height="104" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="878" y="423" font-size="25" fill="${bright}">CONNECTING MAC</text>
    <text x="878" y="456" font-size="18" fill="${dim}">Finder &#183; Command K &#183; Connect</text>

    <rect x="852" y="516" width="456" height="58" rx="8" fill="none" stroke="${faint}" stroke-width="2"/>
    <text x="878" y="552" font-size="18" fill="${good}">.local name survives IP changes</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.mac-file-sharing-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/mac-file-sharing-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/mac-file-sharing-hero.png');
