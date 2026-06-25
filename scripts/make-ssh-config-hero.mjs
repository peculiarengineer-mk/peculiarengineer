import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (violet / config)
const bg = '#08060d';
const bright = '#a78bfa';   // primary violet
const accent = '#c9b8fc';   // brightest highlight
const dim = '#5f4f8c';      // secondary
const faint = '#1a1430';    // borders / ghost
const good = '#6fd08a';     // ok green
const key = '#7aa2f7';      // keyword blue accent

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#120c20"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#140e26" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- badge top-right -->
  <g>
    <rect x="1008" y="48" width="304" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1034" y="77" font-family="${mono}" font-size="18" letter-spacing="1.5" fill="${bright}">&#9670; ~/.ssh/config</text>
  </g>

  <!-- editor window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0c0917" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">laptop &#183; ~/.ssh/config</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${key}">Host</tspan> db</text>
    <text x="104" y="250" font-family="${mono}" font-size="17" fill="${accent}">  <tspan fill="${key}">HostName</tspan> 10.0.5.12</text>
    <text x="104" y="278" font-family="${mono}" font-size="17" fill="${accent}">  <tspan fill="${key}">User</tspan> keith</text>
    <text x="104" y="306" font-family="${mono}" font-size="17" fill="${accent}">  <tspan fill="${key}">IdentityFile</tspan> ~/.ssh/work_key</text>
    <text x="104" y="334" font-family="${mono}" font-size="17" fill="${accent}">  <tspan fill="${key}">ProxyJump</tspan> bastion</text>

    <text x="104" y="402" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> ssh db</text>
    <text x="104" y="430" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> through bastion, landed on 10.0.5.12</text>

    <text x="104" y="498" font-family="${mono}" font-size="17" fill="${dim}">no address &#183; no port flag &#183; no key flag</text>
    <text x="104" y="544" font-family="${mono}" font-size="18" fill="${dim}">first match wins &#183; keep Host * last</text>
  </g>

  <!-- right column: the hop -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">ONE HOP, ONE LINE</text>

    <rect x="852" y="222" width="456" height="150" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="272" font-size="18" fill="${accent}">laptop</text>
    <text x="880" y="304" font-size="18" fill="${bright}">  &#8594; bastion</text>
    <text x="880" y="336" font-size="18" fill="${good}">      &#8594; 10.0.5.12</text>

    <text x="852" y="430" font-size="18" fill="${accent}"><tspan fill="${key}">IdentitiesOnly</tspan> yes</text>
    <text x="852" y="462" font-size="18" fill="${accent}"><tspan fill="${key}">ControlMaster</tspan> auto</text>
    <text x="852" y="494" font-size="18" fill="${accent}"><tspan fill="${key}">AddKeysToAgent</tspan> yes</text>
    <text x="852" y="544" font-size="17" fill="${dim}">write it once, type a name forever</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ssh-config-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ssh-config-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ssh-config-hero.png');
