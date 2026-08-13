import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// amber palette (Kimi Code lane)
const bg0 = '#161208', bg1 = '#0b0906', grid = '#1e1810', ghost = '#3a2d13';
const dim = '#8a7442', bright = '#e5a83c', accent = '#f2bc5c';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost lane markers, bottom-right -->
  <g opacity="0.55" stroke="${ghost}" stroke-width="8" fill="none" stroke-linecap="round">
    <path d="M1170 606 H1252"/>
    <path d="M1170 652 H1252" stroke-dasharray="22 16"/>
    <path d="M1246 588 L1272 606 L1246 624"/>
    <path d="M1246 634 L1272 652 L1246 670"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1006" y="48" width="306" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1032" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; CLAUDE CODE &#183; KIMI</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#100c06" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">two tabs &#183; two subscriptions</text>

    <text x="104" y="222" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> claude-kimi</text>
    <text x="104" y="248" font-family="${mono}" font-size="15" fill="${good}"><tspan fill="${good}">&#10003;</tspan> api.kimi.com/coding/ <tspan fill="${dim}">&#183;</tspan> Kimi K3</text>

    <text x="104" y="316" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> claude</text>
    <text x="104" y="342" font-family="${mono}" font-size="15" fill="${good}"><tspan fill="${good}">&#10003;</tspan> api.anthropic.com <tspan fill="${dim}">&#183;</tspan> Opus 5<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="410" font-family="${mono}" font-size="15" fill="${dim}">--settings, not a shell export</text>

    <text x="104" y="486" font-family="${mono}" font-size="18" fill="${dim}">nothing in the first lane changes.</text>
    <text x="104" y="514" font-family="${mono}" font-size="18" fill="${dim}">that&#8217;s the whole point.</text>
  </g>

  <!-- right column: the lanes, then the lie -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">THE TWO LANES</text>

    <rect x="852" y="216" width="456" height="80" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="250" font-size="18" fill="${dim}">claude <tspan fill="${ghost}">&#8594;</tspan> api.anthropic.com</text>
    <text x="876" y="278" font-size="17" fill="${dim}">billed to your Claude plan</text>

    <rect x="852" y="314" width="456" height="80" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="348" font-size="18" fill="${accent}">claude-kimi <tspan fill="${bright}">&#8594;</tspan> api.kimi.com/coding/</text>
    <text x="876" y="376" font-size="17" fill="${accent}">billed to your Kimi Code plan</text>

    <text x="852" y="444" font-size="20" letter-spacing="2" fill="${dim}">THE 401 THAT LIES</text>

    <rect x="852" y="462" width="456" height="80" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="496" font-size="17" fill="${bad}">k3[1m] <tspan fill="${dim}">&#8594;</tspan> 401 authentication_error</text>
    <text x="876" y="524" font-size="16" fill="${dim}">&#8230; but the body says model id</text>

    <text x="852" y="568" font-size="17" fill="${dim}">&#8594; read the body, not the status code</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.claude-code-kimi-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/claude-code-kimi-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/claude-code-kimi-hero.png');
