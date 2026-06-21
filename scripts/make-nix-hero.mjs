import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (nix blue)
const bg = '#070b12';
const bright = '#7eb6ff';   // primary nix blue
const accent = '#a9d2ff';   // brightest highlight
const dim = '#3f6aa3';      // secondary
const faint = '#1c2e4a';    // borders / ghost
const warn = '#e0a85a';     // error/footgun amber

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0c1320"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#101d31" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost lambda, bottom-right -->
  <text x="1150" y="640" font-family="${mono}" font-size="320" fill="${faint}" opacity="0.5">&#955;</text>

  <!-- badge top-right -->
  <g>
    <rect x="1150" y="48" width="162" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1180" y="77" font-family="${mono}" font-size="22" letter-spacing="3" fill="${bright}">&#955; NIX</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0a1019" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">nix on macos</text>

    <text x="104" y="232" font-family="${mono}" font-size="21" fill="${bright}"><tspan fill="${accent}">$</tspan> ...install.determinate.systems/nix | sh</text>

    <text x="104" y="288" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${accent}">&#10003;</tspan> nix installed   <tspan fill="${dim}">daemon mode</tspan></text>
    <text x="104" y="324" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${accent}">&#10003;</tspan> flakes enabled  <tspan fill="${dim}">out of the box</tspan></text>

    <text x="104" y="384" font-family="${mono}" font-size="22" fill="${bright}"><tspan fill="${accent}">$</tspan> nix eval --expr '1 + 2'</text>
    <text x="104" y="420" font-family="${mono}" font-size="23" fill="${accent}">3<tspan fill="${bright}"> </tspan><tspan fill="${accent}">&#9608;</tspan></text>

    <text x="104" y="522" font-family="${mono}" font-size="19" fill="${dim}">install &#183; verify &#183; eval, never build</text>
  </g>

  <!-- right column: the two footguns + verdict -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE TWO ERRORS</text>

    <!-- footgun 1 -->
    <rect x="852" y="220" width="456" height="86" rx="8" fill="none" stroke="${warn}" stroke-width="2"/>
    <text x="876" y="256" font-size="21" fill="${warn}">&#9888; nix-command disabled</text>
    <text x="876" y="288" font-size="17" fill="${dim}">&#8594; experimental-features in nix.conf</text>

    <!-- footgun 2 -->
    <rect x="852" y="320" width="456" height="86" rx="8" fill="none" stroke="${warn}" stroke-width="2"/>
    <text x="876" y="356" font-size="21" fill="${warn}">&#9888; no flake.nix here</text>
    <text x="876" y="388" font-size="17" fill="${dim}">&#8594; give eval a target: --expr / .#attr</text>

    <!-- verdict bar -->
    <rect x="852" y="468" width="456" height="64" rx="8" fill="none" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="507" font-size="19" fill="${bright}"><tspan fill="${accent}">&#9635;</tspan> reproducible across machines  <tspan fill="${dim}">or skip it</tspan></text>

    <text x="852" y="566" font-size="19" fill="${dim}">&#8594; check the repo before you Nix anything.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.nix-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/install-nix-macos-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/install-nix-macos-hero.png');
