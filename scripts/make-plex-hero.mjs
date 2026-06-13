import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette
const bg = '#080b09';
const bright = '#4ade80';   // primary phosphor green
const accent = '#6ff09a';   // brightest
const dim = '#2c7d4c';      // secondary
const faint = '#1d4d33';    // borders / ghost

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0d130f"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#10271a" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost chevron, bottom-right -->
  <path d="M1180 470 L1300 560 L1180 650" fill="none" stroke="${faint}" stroke-width="10" opacity="0.55"/>

  <!-- badge top-right -->
  <g>
    <rect x="1118" y="48" width="194" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1150" y="77" font-family="${mono}" font-size="22" letter-spacing="3" fill="${bright}">&#9670; DOCKER</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0a100c" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">docker compose up -d</text>

    <text x="104" y="232" font-family="${mono}" font-size="25" fill="${bright}"><tspan fill="${accent}">$</tspan> docker compose up -d</text>

    <text x="104" y="288" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${accent}">&#10003;</tspan> Container plex      <tspan fill="${dim}">Started</tspan></text>
    <text x="104" y="324" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${accent}">&#10003;</tspan> Container sabnzbd   <tspan fill="${dim}">Started</tspan></text>

    <text x="104" y="384" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${dim}">&gt;</tspan> network_mode: <tspan fill="${accent}">host</tspan></text>
    <text x="104" y="420" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${dim}">&gt;</tspan> /dev/dri  hw transcode <tspan fill="${accent}">&#10003;</tspan></text>
    <text x="104" y="456" font-family="${mono}" font-size="23" fill="${bright}"><tspan fill="${dim}">&gt;</tspan> :32400 plex &#183; :8080 sab<tspan fill="${accent}">&#9608;</tspan></text>

    <text x="104" y="522" font-family="${mono}" font-size="19" fill="${dim}">claim &#183; mount &#183; transcode</text>
  </g>

  <!-- right column: stack diagram -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE STACK</text>

    <!-- plex box -->
    <rect x="852" y="220" width="456" height="86" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="258" font-size="26" fill="${accent}">PLEX</text>
    <text x="876" y="288" font-size="18" fill="${dim}">network: host &#183; /dev/dri &#183; :32400</text>

    <!-- connector -->
    <text x="1066" y="338" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <!-- sabnzbd box -->
    <rect x="852" y="352" width="456" height="86" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="390" font-size="26" fill="${bright}">SABnzbd</text>
    <text x="876" y="420" font-size="18" fill="${dim}">usenet downloader &#183; :8080</text>

    <!-- shared volume bar -->
    <rect x="852" y="468" width="456" height="64" rx="8" fill="none" stroke="${faint}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="507" font-size="20" fill="${bright}"><tspan fill="${accent}">&#9635;</tspan> /mnt/media  <tspan fill="${dim}">shared volume</tspan></text>

    <text x="852" y="566" font-size="19" fill="${dim}">&#8594; one compose file, GPU transcoding on.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.plex-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/docker-plex-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/docker-plex-hero.png');
