import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (violet / indigo)
const bg = '#0c0a14';
const bright = '#a78bfa';   // primary violet
const accent = '#ddd6fe';   // brightest highlight
const dim = '#6d28d9';      // secondary
const deep = '#4c1d95';     // deepest
const faint = '#241a3d';    // borders / ghost
const good = '#6fd08a';     // ok green

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#14102099"/>
      <stop offset="0%" stop-color="#151022"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#191130" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost branch glyph, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="9" fill="none">
    <circle cx="1180" cy="470" r="20"/>
    <circle cx="1180" cy="620" r="20"/>
    <circle cx="1300" cy="540" r="20"/>
    <path d="M1180 490 L1180 600 M1180 540 Q1180 540 1280 540"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1052" y="48" width="260" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1078" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; UV &#183; GIT INSTALL</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0f0c1a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">uv &#183; pip install</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> uv pip install \\</text>
    <text x="104" y="248" font-family="${mono}" font-size="17" fill="${bright}">  git+https://github.com/owner/repo.git</text>

    <text x="104" y="312" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> uv pip install "git+&#8230;@v1.2.3"</text>

    <text x="104" y="376" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> uv pip install \\</text>
    <text x="104" y="402" font-family="${mono}" font-size="17" fill="${bright}">  --python ~/.local/bin/python3.14 GitPython</text>

    <text x="104" y="462" font-family="${mono}" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> installed into python3.14</text>

    <text x="104" y="540" font-family="${mono}" font-size="18" fill="${dim}">repo &#183; pin a tag &#183; pick the interpreter</text>
  </g>

  <!-- right column: two readings of "git package" -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">TWO READINGS</text>

    <!-- box 1: the library -->
    <rect x="852" y="220" width="456" height="116" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="252" font-size="17" letter-spacing="1" fill="${deep}">THE LIBRARY</text>
    <text x="876" y="288" font-size="20" fill="${accent}">pip name:    GitPython</text>
    <text x="876" y="318" font-size="20" fill="${bright}">import name: git</text>

    <!-- box 2: from a repo -->
    <rect x="852" y="356" width="456" height="116" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="388" font-size="17" letter-spacing="1" fill="${deep}">FROM A REPO</text>
    <text x="876" y="424" font-size="20" fill="${accent}">git+https://&#8230;@tag</text>
    <text x="876" y="454" font-size="17" fill="${dim}">&#8594; any repo, any ref, no PyPI</text>

    <!-- footer -->
    <rect x="852" y="500" width="456" height="86" rx="8" fill="none" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="536" font-size="18" fill="${good}"><tspan fill="${good}">&#10003;</tspan> --python picks the interpreter,</text>
    <text x="876" y="564" font-size="18" fill="${dim}">no guessing about where it lands.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.uv-git-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/uv-git-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/uv-git-hero.png');
