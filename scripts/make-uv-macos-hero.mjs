import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// amber build palette
const bg = '#100b06';
const bright = '#fbbf24';
const accent = '#fde68a';
const dim = '#a16207';
const faint = '#7a5410';
const good = '#6fd08a';
const slate = '#9a8258';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#1a1209"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#211708" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost lightning bolt, bottom-right (speed) -->
  <g opacity="0.5" fill="none" stroke="${faint}" stroke-width="9" stroke-linejoin="round">
    <path d="M1268 452 L1198 556 L1244 556 L1206 632 L1300 520 L1252 520 Z"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1092" y="48" width="220" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1118" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; UV &#183; macOS</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#140d06" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">zsh &#183; one tool for Python</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> curl -LsSf https://astral.sh/uv/install.sh | sh</text>
    <text x="104" y="250" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> installed uv to ~/.local/bin</text>

    <text x="104" y="312" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> uv venv &amp;&amp; uv pip install ruff</text>
    <text x="104" y="340" font-family="${mono}" font-size="17" fill="${good}">Resolved 1 package in 4ms</text>
    <text x="104" y="368" font-family="${mono}" font-size="17" fill="${good}">Installed 1 package in 11ms</text>

    <text x="104" y="430" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> uv run main.py</text>
    <text x="104" y="458" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> uv python install 3.13</text>

    <text x="104" y="528" font-family="${mono}" font-size="18" fill="${dim}">one static binary &#183; no pip bootstrap</text>
    <text x="104" y="556" font-family="${mono}" font-size="18" fill="${dim}">resolves in milliseconds, not minutes</text>
  </g>

  <!-- right: what it replaces -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">ONE TOOL REPLACES</text>

    <rect x="852" y="222" width="140" height="52" rx="8" fill="none" stroke="${slate}" stroke-width="1.5"/>
    <text x="922" y="255" font-size="20" fill="${slate}" text-anchor="middle">pip</text>
    <rect x="1008" y="222" width="140" height="52" rx="8" fill="none" stroke="${slate}" stroke-width="1.5"/>
    <text x="1078" y="255" font-size="20" fill="${slate}" text-anchor="middle">venv</text>
    <rect x="1164" y="222" width="140" height="52" rx="8" fill="none" stroke="${slate}" stroke-width="1.5"/>
    <text x="1234" y="255" font-size="20" fill="${slate}" text-anchor="middle">pipx</text>

    <text x="1080" y="316" font-size="24" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="988" y="332" width="184" height="60" rx="10" fill="none" stroke="${bright}" stroke-width="2.5"/>
    <text x="1080" y="371" font-size="26" font-weight="700" fill="${accent}" text-anchor="middle">uv</text>

    <text x="852" y="452" font-size="19" fill="${accent}"><tspan fill="${bright}">10-100&#215;</tspan> faster resolves</text>
    <text x="852" y="486" font-size="18" fill="${slate}">it manages Python versions too</text>

    <text x="852" y="546" font-size="18" fill="${dim}">the handful of commands I actually</text>
    <text x="852" y="572" font-size="18" fill="${dim}">use, written down so I stop looking.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.uv-macos-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/uv-macos-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/uv-macos-hero.png');
