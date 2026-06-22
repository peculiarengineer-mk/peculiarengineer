import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (debug violet)
const bg = '#0a0810';
const bright = '#b794f6';   // primary violet
const accent = '#d6bcfa';   // brightest highlight
const dim = '#6b4f96';      // secondary
const faint = '#2c2142';    // borders / ghost
const bad = '#e06a7a';      // crash red
const good = '#6fd08a';     // success green

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#120c1d"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#191228" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost book glyph, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="9" fill="none">
    <path d="M1150 440 L1150 630 M1150 440 Q1210 415 1270 440 L1270 630 Q1210 605 1150 630 M1270 440 Q1310 420 1330 440 L1330 630 Q1310 610 1270 630"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1080" y="48" width="232" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1108" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; EPUB DOWNLOADER</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0f0a18" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">debugging the migration</text>

    <text x="104" y="224" font-family="${mono}" font-size="20" fill="${bright}"><tspan fill="${accent}">$</tspan> orly sso 9781492029496</text>
    <text x="104" y="258" font-family="${mono}" font-size="19" fill="${good}">&#10003; Authentication successful</text>
    <text x="104" y="292" font-family="${mono}" font-size="19" fill="${bad}">&#10007; JSONDecodeError: char 0</text>
    <text x="104" y="326" font-family="${mono}" font-size="17" fill="${dim}">  v1 /book/{id}/ returned non-JSON</text>

    <text x="104" y="388" font-family="${mono}" font-size="19" fill="${bright}"><tspan fill="${accent}">&#8594;</tspan> switch to v2 manifest</text>
    <text x="104" y="422" font-family="${mono}" font-size="17" fill="${dim}">  /api/v2/epubs/.../files/</text>
    <text x="104" y="456" font-family="${mono}" font-size="19" fill="${good}">&#10003; created 9781492029496.epub  <tspan fill="${dim}">117 files</tspan></text>

    <text x="104" y="522" font-family="${mono}" font-size="19" fill="${dim}">read the code &#183; migrate &#183; delete 80%</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE MIGRATION</text>

    <!-- v1 box -->
    <rect x="852" y="220" width="210" height="86" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="256" font-size="24" fill="${bad}">v1 book API</text>
    <text x="876" y="288" font-size="16" fill="${dim}">crawl + scrape, dead</text>

    <text x="1086" y="270" font-size="30" fill="${bright}">&#8594;</text>

    <!-- v2 box -->
    <rect x="1126" y="220" width="182" height="86" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="1150" y="256" font-size="24" fill="${good}">v2 manifest</text>
    <text x="1150" y="288" font-size="16" fill="${dim}">files, JSON</text>

    <!-- guard box -->
    <rect x="852" y="338" width="456" height="68" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="368" font-size="18" fill="${accent}">guard .json(): status &#8594; content-type</text>
    <text x="876" y="392" font-size="16" fill="${dim}">no more 200-with-a-bot-challenge crashes</text>

    <!-- paywall held bar -->
    <rect x="852" y="468" width="456" height="64" rx="8" fill="none" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="507" font-size="19" fill="${bright}"><tspan fill="${good}">&#9635;</tspan> invalid token = truncated preview</text>

    <text x="852" y="566" font-size="19" fill="${dim}">&#8594; the paywall held. learning only.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.downloader-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/resurrecting-downloader-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/resurrecting-downloader-hero.png');
