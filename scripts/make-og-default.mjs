import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// The branded default OG card — the site's own terminal-green identity.
// Used by BaseHead as the fallback for the homepage, the blog index, and
// any post without its own heroImage.

const W = 1360, H = 680;
const mono = "'JetBrains Mono','SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg = '#0d0d0d';
const green = '#39ff14';   // --sys-fg
const dim = '#1b730e';     // --sys-dim
const text = '#c9d6c4';    // --sys-text
const faint = '#123a0c';

// the >_ mark, scaled from the favicon (viewBox 128) into a panel
function mark(px, py, size) {
  const k = size / 128;
  const cx = (x) => px + x * k, cy = (y) => py + y * k;
  return `<g>
    <rect x="${px}" y="${py}" width="${size}" height="${size}" rx="${28 * k}" fill="#0a0f0a" stroke="${dim}" stroke-width="2"/>
    <polyline points="${cx(38)},${cy(44)} ${cx(64)},${cy(64)} ${cx(38)},${cy(84)}" fill="none" stroke="${green}" stroke-width="${13 * k}" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${cx(72)}" y="${cy(74)}" width="${30 * k}" height="${12 * k}" rx="1" fill="${green}"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="26%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#0f160d"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="scan" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="1" y="0" fill="${green}" opacity="0.035"/>
    </pattern>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>

  <!-- big ghost gear, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="9" fill="none">
    <circle cx="1238" cy="556" r="80"/>
    <circle cx="1238" cy="556" r="30"/>
    <path d="M1238 456 L1238 486 M1238 626 L1238 656 M1138 556 L1168 556 M1308 556 L1338 556 M1167 485 L1188 506 M1288 606 L1309 627 M1309 485 L1288 506 M1188 606 L1167 627"/>
  </g>

  <!-- domain badge, top-right -->
  <g>
    <rect x="1016" y="48" width="296" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1042" y="77" font-family="${mono}" font-size="20" letter-spacing="1" fill="${green}">&#9670; peculiarengineer.com</text>
  </g>

  <!-- prompt line, top-left -->
  <text x="100" y="132" font-family="${mono}" font-size="24" fill="${dim}">&gt; whoami</text>

  <!-- the mark -->
  ${mark(100, 250, 176)}

  <!-- soft green glow behind wordmark -->
  <rect x="340" y="270" width="520" height="150" fill="${green}" opacity="0.06" filter="url(#soft)"/>

  <!-- wordmark -->
  <text x="336" y="332" font-family="${mono}" font-size="86" font-weight="700" fill="${green}" letter-spacing="1">Peculiar</text>
  <text x="336" y="424" font-family="${mono}" font-size="86" font-weight="700" fill="${green}" letter-spacing="1">Engineer</text>

  <!-- tagline -->
  <text x="102" y="512" font-family="${mono}" font-size="30" fill="${text}">Never Google the same fix twice.<tspan fill="${green}"> &#9608;</tspan></text>

  <!-- topics -->
  <text x="102" y="566" font-family="${mono}" font-size="21" fill="${dim}" letter-spacing="1">Linux &#183; SSH &#183; Cloudflare &#183; DevOps &#183; Claude Code</text>
</svg>`;

writeFileSync(new URL('../src/assets/.og-default.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/og-default.png', import.meta.url).pathname);
console.log('wrote src/assets/og-default.png');
