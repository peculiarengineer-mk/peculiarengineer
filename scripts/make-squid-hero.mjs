import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (squid teal / cyan)
const bg = '#05131a';
const bright = '#38bdf8';   // sky cyan
const accent = '#a5f3fc';   // brightest highlight
const dim = '#0e7490';      // secondary teal
const deep = '#155e75';     // deepest
const faint = '#11303a';    // borders / ghost
const good = '#6fd08a';     // hit green

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#0a1f29"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#0c2730" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- badge top-right -->
  <g>
    <rect x="1006" y="48" width="306" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1032" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; SQUID &#183; BOTH WAYS</text>
  </g>

  <text x="72" y="86" font-family="${mono}" font-size="24" letter-spacing="2" fill="${accent}">ONE DAEMON &#183; TWO DIRECTIONS</text>

  <!-- central squid node -->
  <g>
    <rect x="600" y="300" width="160" height="80" rx="12" fill="#082530" stroke="${bright}" stroke-width="2.5"/>
    <text x="680" y="335" font-family="${mono}" font-size="22" fill="${accent}" text-anchor="middle">squid</text>
    <text x="680" y="362" font-family="${mono}" font-size="15" fill="${dim}" text-anchor="middle">:3128 / :80</text>
  </g>

  <!-- FORWARD row (top): clients -> squid -> web -->
  <g font-family="${mono}">
    <text x="72" y="150" font-size="19" letter-spacing="2" fill="${dim}">FORWARD &#183; in front of clients</text>
    <rect x="72" y="172" width="200" height="74" rx="8" fill="none" stroke="${deep}" stroke-width="2"/>
    <text x="172" y="206" font-size="18" fill="${accent}" text-anchor="middle">clients</text>
    <text x="172" y="230" font-size="14" fill="${dim}" text-anchor="middle">laptop &#183; phone</text>

    <rect x="1088" y="172" width="200" height="74" rx="8" fill="none" stroke="${deep}" stroke-width="2"/>
    <text x="1188" y="206" font-size="18" fill="${accent}" text-anchor="middle">the web</text>
    <text x="1188" y="230" font-size="14" fill="${dim}" text-anchor="middle">out of network</text>

    <path d="M280 250 Q470 250 628 312" fill="none" stroke="${bright}" stroke-width="2.5"/>
    <path d="M620 309 l14 1 l-9 11 z" fill="${bright}"/>
    <path d="M734 309 Q900 250 1080 232" fill="none" stroke="${bright}" stroke-width="2.5"/>
    <path d="M1082 240 l6 -12 l8 11 z" fill="${bright}"/>
  </g>

  <!-- REVERSE row (bottom): visitors -> squid -> origin -->
  <g font-family="${mono}">
    <text x="72" y="470" font-size="19" letter-spacing="2" fill="${dim}">REVERSE &#183; in front of servers (accel)</text>
    <rect x="72" y="488" width="200" height="74" rx="8" fill="none" stroke="${deep}" stroke-width="2"/>
    <text x="172" y="522" font-size="18" fill="${accent}" text-anchor="middle">visitors</text>
    <text x="172" y="546" font-size="14" fill="${dim}" text-anchor="middle">think it's the site</text>

    <rect x="1088" y="488" width="200" height="74" rx="8" fill="none" stroke="${deep}" stroke-width="2"/>
    <text x="1188" y="522" font-size="18" fill="${accent}" text-anchor="middle">origin</text>
    <text x="1188" y="546" font-size="14" fill="${dim}" text-anchor="middle">cache_peer</text>

    <path d="M280 522 Q470 522 628 410" fill="none" stroke="${good}" stroke-width="2.5"/>
    <path d="M620 414 l14 -1 l-7 13 z" fill="${good}"/>
    <path d="M734 372 Q900 470 1080 502" fill="none" stroke="${good}" stroke-width="2.5"/>
    <path d="M1082 494 l8 -11 l6 13 z" fill="${good}"/>
  </g>

  <!-- the switch line -->
  <g font-family="${mono}">
    <rect x="430" y="612" width="500" height="42" rx="8" fill="none" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="680" y="640" font-size="18" fill="${accent}" text-anchor="middle">http_port 80 <tspan fill="${bright}">accel</tspan>  &#8592; the switch</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.squid-proxy-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/squid-proxy-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/squid-proxy-hero.png');
