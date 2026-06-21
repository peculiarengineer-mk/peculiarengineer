import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette
const bg = '#080b12';
const bright = '#5eb8ff';   // primary sky blue
const accent = '#a5e3ff';   // brightest cyan
const dim = '#2c5a7d';      // secondary
const faint = '#1d3a5c';    // borders / ghost

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0c111c"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#10243a" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost chevron, bottom-right -->
  <path d="M1180 470 L1300 560 L1180 650" fill="none" stroke="${faint}" stroke-width="10" opacity="0.55"/>

  <!-- badge top-right -->
  <g>
    <rect x="1086" y="48" width="226" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1110" y="77" font-family="${mono}" font-size="22" letter-spacing="2" fill="${bright}">&#9670; iPAD &#8594; MAC</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0a0f18" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">tailnet shell</text>

    <text x="104" y="226" font-family="${mono}" font-size="22" fill="${bright}"><tspan fill="${accent}">$</tspan> tailscale status</text>
    <text x="104" y="262" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">100.72.14.3</tspan>  mac-mini  <tspan fill="${dim}">macOS  -</tspan></text>
    <text x="104" y="294" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">100.81.66.9</tspan>  ipad      <tspan fill="${dim}">iOS    -</tspan></text>

    <text x="104" y="354" font-family="${mono}" font-size="22" fill="${bright}"><tspan fill="${accent}">$</tspan> open vnc://mac-mini:5900</text>
    <text x="104" y="402" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${accent}">&#10003;</tspan> RealVNC Viewer   <tspan fill="${dim}">connected</tspan></text>
    <text x="104" y="438" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${dim}">&gt;</tspan> screen sharing on <tspan fill="${accent}">:5900</tspan><tspan fill="${accent}">&#9608;</tspan></text>

    <text x="104" y="522" font-family="${mono}" font-size="19" fill="${dim}">headless &#183; private &#183; encrypted</text>
  </g>

  <!-- right column: connection diagram -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">REMOTE DESKTOP, PRIVATELY</text>

    <!-- ipad box -->
    <rect x="852" y="220" width="456" height="86" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="258" font-size="26" fill="${accent}">iPAD</text>
    <text x="876" y="288" font-size="18" fill="${dim}">RealVNC Viewer &#183; on the tailnet</text>

    <!-- dashed tailscale link -->
    <line x1="1080" y1="306" x2="1080" y2="352" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="1096" y="336" font-size="18" fill="${dim}">Tailscale / WireGuard</text>

    <!-- mac mini box -->
    <rect x="852" y="352" width="456" height="86" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="390" font-size="26" fill="${bright}">MAC MINI</text>
    <text x="876" y="420" font-size="18" fill="${dim}">headless &#183; Screen Sharing on :5900</text>

    <!-- encrypted note bar -->
    <rect x="852" y="468" width="456" height="64" rx="8" fill="none" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="507" font-size="20" fill="${bright}"><tspan fill="${accent}">&#9635;</tspan> encrypted by the tailnet  <tspan fill="${dim}">port 5900</tspan></text>

    <text x="852" y="566" font-size="19" fill="${dim}">&#8594; no port forwarding, no public IP.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ipad-mac-tailscale-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ipad-mac-tailscale-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ipad-mac-tailscale-hero.png');
