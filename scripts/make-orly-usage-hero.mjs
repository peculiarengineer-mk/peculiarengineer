import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (teal)
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
    <rect x="1086" y="48" width="226" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1112" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; ORLY &#183; EPUB</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0a1816" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">orly &#183; docker cli</text>

    <text x="104" y="226" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">$</tspan> docker build -t orly .</text>
    <text x="104" y="262" font-family="${mono}" font-size="19" fill="${good}">&#10003; image built</text>

    <text x="104" y="320" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">$</tspan> orly sso &lt;book id&gt;</text>
    <text x="104" y="356" font-family="${mono}" font-size="19" fill="${good}">&#10003; Authentication successful</text>
    <text x="104" y="392" font-family="${mono}" font-size="17" fill="${dim}">  streaming manifest &#8230;</text>
    <text x="104" y="428" font-family="${mono}" font-size="19" fill="${good}">&#10003; created book.epub  <tspan fill="${dim}">EPUB 3</tspan></text>

    <text x="104" y="522" font-family="${mono}" font-size="19" fill="${dim}">build &#183; authenticate &#183; verify</text>
  </g>

  <!-- right column: the flow -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE FLOW</text>

    <rect x="852" y="220" width="456" height="64" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="259" font-size="20" fill="${accent}">browser cookies  &#8594;  orm-jwt</text>

    <text x="1076" y="312" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="328" width="456" height="64" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="367" font-size="20" fill="${bright}">v2 manifest  /epubs/.../files/</text>

    <text x="1076" y="420" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="436" width="456" height="64" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="475" font-size="20" fill="${good}">streamed into a .epub (a ZIP)</text>

    <text x="852" y="548" font-size="19" fill="${dim}">&#8594; your subscription, your content,</text>
    <text x="852" y="572" font-size="19" fill="${dim}">  for learning. mind the terms of service.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.orly-usage-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/orly-usage-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/orly-usage-hero.png');
