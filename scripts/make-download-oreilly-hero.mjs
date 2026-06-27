import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (teal) - matches the orly family
const bg = '#06100f';
const bright = '#5eead4';   // primary teal
const accent = '#99f6e4';   // brightest highlight
const dim = '#2c7a72';      // secondary
const faint = '#13332f';    // borders / ghost
const good = '#6fd08a';     // ok green

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0a1917"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#0e2522" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost book glyph, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="9" fill="none">
    <path d="M1150 440 L1150 630 M1150 440 Q1215 412 1280 440 L1280 630 Q1215 602 1150 630 M1280 440 Q1310 425 1330 440 L1330 630 Q1310 615 1280 630"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1040" y="48" width="272" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1066" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; ORLY &#183; CHEAT SHEET</text>
  </g>

  <!-- title -->
  <g font-family="${mono}">
    <text x="72" y="86" font-size="22" letter-spacing="2" fill="${dim}">O'REILLY &#8594; EPUB</text>
    <text x="72" y="92" font-size="0" fill="${dim}"> </text>
  </g>

  <!-- terminal window: the four commands -->
  <g>
    <rect x="72" y="120" width="864" height="488" rx="11" fill="#0a1816" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="936" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">four commands</text>

    <text x="104" y="232" font-family="${mono}" font-size="19" fill="${dim}"><tspan fill="${bright}">1</tspan>  build the image</text>
    <text x="104" y="266" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">$</tspan> docker build -t orly .</text>

    <text x="104" y="328" font-family="${mono}" font-size="19" fill="${dim}"><tspan fill="${bright}">2</tspan>  save your cookies</text>
    <text x="104" y="362" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">$</tspan> pbpaste &gt; cookies.json</text>

    <text x="104" y="424" font-family="${mono}" font-size="19" fill="${dim}"><tspan fill="${bright}">3</tspan>  download the book</text>
    <text x="104" y="458" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">$</tspan> cat cookies.json | orly sso &lt;id&gt; &gt; book.epub</text>

    <text x="104" y="520" font-family="${mono}" font-size="19" fill="${dim}"><tspan fill="${bright}">4</tspan>  verify</text>
    <text x="104" y="554" font-family="${mono}" font-size="20" fill="${good}"><tspan fill="${accent}">$</tspan> file book.epub  <tspan fill="${dim}">&#8594;</tspan> EPUB document</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="980" y="232" font-size="20" letter-spacing="2" fill="${dim}">YOU NEED</text>
    <text x="980" y="272" font-size="19" fill="${bright}">&#9656; docker</text>
    <text x="980" y="304" font-size="19" fill="${bright}">&#9656; an O'Reilly sub</text>
    <text x="980" y="336" font-size="19" fill="${bright}">&#9656; firefox cookies</text>

    <text x="980" y="424" font-size="20" letter-spacing="2" fill="${dim}">GOTCHAS</text>
    <text x="980" y="464" font-size="18" fill="${good}">&#10003; keep the -i flag</text>
    <text x="980" y="496" font-size="18" fill="${good}">&#10003; cookies expire fast</text>

    <text x="980" y="560" font-size="17" fill="${dim}">your sub, your content,</text>
    <text x="980" y="582" font-size="17" fill="${dim}">for learning. mind the ToS.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.download-oreilly-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/download-oreilly-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/download-oreilly-hero.png');
