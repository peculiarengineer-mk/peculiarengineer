import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

// right column: the four lanes
const lanes = [
  { k: 'system needs it', v: 'apt install python3-xyz' },
  { k: 'your project',    v: 'python3 -m venv .venv' },
  { k: 'a CLI tool',      v: 'pipx install xyz' },
  { k: 'all of it',       v: 'uv venv / uv tool install' },
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="32%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost python-ish coil bottom right -->
  <g opacity="0.45" stroke="${ghost}" stroke-width="7" fill="none" stroke-linecap="round">
    <path d="M1150 600 c0 -40 60 -40 60 -80 c0 -40 -60 -40 -60 -80"/>
    <circle cx="1210" cy="600" r="5" fill="${ghost}"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="944" y="48" width="368" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="968" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; PEP 668</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">apt owns /usr/lib. you own .venv</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> pip install requests</text>
    <text x="104" y="242" font-family="${mono}" font-size="15" fill="${bad}">error: externally-managed-environment</text>
    <text x="104" y="266" font-family="${mono}" font-size="14" fill="${dim}">&#215; This environment is externally managed</text>
    <text x="104" y="290" font-family="${mono}" font-size="14" fill="${dim}">hint: See PEP 668 for the detailed specification.</text>

    <text x="104" y="338" font-family="${mono}" font-size="14" fill="${dim}">/usr/lib/python3.14/EXTERNALLY-MANAGED   <tspan fill="${accent}">&#8592; one file</tspan></text>

    <text x="104" y="386" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo apt install python3-venv</text>
    <text x="104" y="410" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> python3 -m venv .venv</text>
    <text x="104" y="434" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> .venv/bin/pip install requests</text>
    <text x="104" y="458" font-family="${mono}" font-size="14" fill="${good}">Successfully installed requests-2.34.2</text>

    <text x="104" y="506" font-family="${mono}" font-size="14" fill="${dim}"># --break-system-packages: containers only</text>
    <text x="104" y="546" font-family="${mono}" font-size="16" fill="${dim}">pick a lane.<tspan fill="${bright}">&#9608;</tspan></text>
  </g>

  <!-- right column: four lanes -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHICH ONE, WHEN</text>
    ${lanes.map((l, i) => {
      const y = 236 + i * 78;
      return `<rect x="852" y="${y}" width="440" height="58" rx="6" fill="none" stroke="${grid}" stroke-width="1.5"/>
    <text x="870" y="${y + 24}" font-size="13" fill="${dim}">${l.k}</text>
    <text x="870" y="${y + 46}" font-size="15" fill="${i === 1 ? good : bright}">${l.v}</text>`;
    }).join('\n    ')}
    <text x="852" y="${236 + 4 * 78 + 14}" font-size="13" fill="${accent}">/usr/local shadows /usr/lib for every system tool.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.pip-externally-managed-2604-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/pip-externally-managed-2604-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/pip-externally-managed-2604-hero.png');
