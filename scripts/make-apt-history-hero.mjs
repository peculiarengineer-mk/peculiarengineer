import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// cool slate/cyan palette (apt history)
const bg0 = '#0a1418', bg1 = '#05090b', grid = '#0f2027', ghost = '#16323d';
const dim = '#6f8f99', bright = '#3fbcd4', accent = '#6fd8ea';
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

  <!-- ghost undo arrow, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1290 660 A 46 46 0 1 0 1244 614 L1190 614"/>
    <path d="M1216 588 L1190 614 L1216 640"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1014" y="48" width="298" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1038" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; APT 3.2 &#183; 26.04</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#071013" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">apt history-list</text>

    <g font-family="${mono}" font-size="14" fill="${dim}"><text x="104" y="216">ID</text><text x="140" y="216">Command line</text><text x="452" y="216">Action</text><text x="596" y="216">Changes</text></g>
    <g font-family="${mono}" font-size="14" fill="${accent}"><text x="104" y="244">0</text><text x="140" y="244">install nginx</text><text x="452" y="244">Install</text><text x="596" y="244">2</text></g>
    <g font-family="${mono}" font-size="14" fill="${accent}"><text x="104" y="270">1</text><text x="140" y="270">remove htop</text><text x="452" y="270">Remove</text><text x="596" y="270">1</text></g>
    <g font-family="${mono}" font-size="14" fill="${bad}"><text x="104" y="296">2</text><text x="140" y="296">upgrade curl</text><text x="452" y="296">Upgrade</text><text x="596" y="296">3</text></g>
    <g font-family="${mono}" font-size="14" fill="${accent}"><text x="104" y="322">6</text><text x="140" y="322">install linux-image</text><text x="452" y="322">I,U</text><text x="596" y="322">37</text></g>
    <g font-family="${mono}" font-size="14" fill="${good}"><text x="104" y="348">7</text><text x="140" y="348">history-undo 0</text><text x="452" y="348">Remove</text><text x="596" y="348">2</text></g>
    <text x="104" y="404" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> apt history-undo 2</text>
    <text x="104" y="430" font-family="${mono}" font-size="14" fill="${dim}">curl is already the newest version.</text>
    <text x="104" y="456" font-family="${mono}" font-size="14" fill="${bad}">Removing: 0, Installing: 0<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="512" font-family="${mono}" font-size="17" fill="${dim}">it did nothing.</text>
    <text x="104" y="540" font-family="${mono}" font-size="17" fill="${dim}">it did not say so.</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">UNDO IS NOT PURGE</text>

    <rect x="852" y="216" width="456" height="80" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="15" fill="${dim}">package removed</text>
    <text x="876" y="276" font-size="15" fill="${good}">/etc/nginx/nginx.conf survives</text>

    <text x="852" y="340" font-size="20" letter-spacing="2" fill="${dim}">WHY THE UPGRADE WILL NOT GO BACK</text>

    <rect x="852" y="360" width="456" height="128" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="392" font-size="14" fill="${bad}">E: Version &#39;8.18.0-1ubuntu2.3&#39;</text>
    <text x="876" y="416" font-size="14" fill="${bad}">   for &#39;curl&#39; was not found</text>
    <text x="876" y="446" font-size="14" fill="${dim}">-security keeps one version,</text>
    <text x="876" y="470" font-size="14" fill="${dim}">not a series of them</text>
  </g>

  <g font-family="${mono}">
    <text x="852" y="536" font-size="20" letter-spacing="2" fill="${dim}">AND THE KERNEL</text>
    <text x="852" y="566" font-size="15" fill="${bad}">Error: two conflicting assignments</text>
    <text x="852" y="592" font-size="15" fill="${dim}">at least that one fails loudly</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.apt-history-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/apt-history-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/apt-history-hero.png');
