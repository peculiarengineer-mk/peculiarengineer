import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (linter amber)
const bg = '#0c0a06';
const bright = '#f2c14e';   // primary amber
const accent = '#ffd97a';   // brightest highlight
const dim = '#8a6d2f';      // secondary
const faint = '#3a2e14';    // borders / ghost
const good = '#6fd08a';     // fixed / ok green
const bad = '#e06a5a';      // bug red

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#14100a"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#1d1709" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost warning triangle, bottom-right -->
  <path d="M1230 430 L1330 620 L1130 620 Z" fill="none" stroke="${faint}" stroke-width="10" opacity="0.6"/>
  <text x="1218" y="600" font-family="${mono}" font-size="120" fill="${faint}" opacity="0.6">!</text>

  <!-- badge top-right -->
  <g>
    <rect x="1096" y="48" width="216" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1124" y="77" font-family="${mono}" font-size="22" letter-spacing="3" fill="${bright}">&#9888; SHELLCHECK</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#100c06" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">shellcheck deploy.sh</text>

    <text x="104" y="228" font-family="${mono}" font-size="21" fill="${bright}"><tspan fill="${accent}">$</tspan> shellcheck deploy.sh</text>

    <text x="104" y="288" font-family="${mono}" font-size="20" fill="${bad}">&#9888; SC2045 <tspan fill="${dim}">iterating over ls output</tspan></text>
    <text x="104" y="324" font-family="${mono}" font-size="20" fill="${bad}">&#9888; SC2086 <tspan fill="${dim}">rm $f is unquoted</tspan></text>
    <text x="104" y="360" font-family="${mono}" font-size="20" fill="${bad}">&#9888; SC2086 <tspan fill="${dim}">[ $1 == ... ] unquoted</tspan></text>

    <text x="104" y="424" font-family="${mono}" font-size="20" fill="${good}"><tspan fill="${good}">&#10003;</tspan> rm "$f"   <tspan fill="${dim}">for f in *.log</tspan></text>
    <text x="104" y="460" font-family="${mono}" font-size="20" fill="${good}"><tspan fill="${good}">&#10003;</tspan> [ "$1" = "prod" ]</text>

    <text x="104" y="522" font-family="${mono}" font-size="19" fill="${dim}">lint &#183; look up the code &#183; quote it</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">SILENT SHELL FOOTGUNS</text>

    <rect x="852" y="220" width="456" height="86" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="256" font-size="22" fill="${accent}">empty var, no error</text>
    <text x="876" y="288" font-size="17" fill="${dim}">rm -rf "$DIR"/  &#8594;  rm -rf /</text>

    <rect x="852" y="320" width="456" height="86" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="356" font-size="22" fill="${bright}">passes the test, then bites</text>
    <text x="876" y="388" font-size="17" fill="${dim}">odd filename &#183; empty arg &#183; exits 0</text>

    <rect x="852" y="468" width="456" height="64" rx="8" fill="none" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="507" font-size="19" fill="${bright}"><tspan fill="${accent}">&#9635;</tspan> editor + CI  <tspan fill="${dim}">so it never skips</tspan></text>

    <text x="852" y="566" font-size="19" fill="${dim}">&#8594; cheap insurance on scripts that touch prod.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.shellcheck-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/shellcheck-macos-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/shellcheck-macos-hero.png');
