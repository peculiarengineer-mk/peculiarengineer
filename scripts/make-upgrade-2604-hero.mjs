import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// ubuntu-ish violet/orange palette
const bg0 = '#150e14', bg1 = '#08060a', grid = '#1e1420', ghost = '#3a2233';
const dim = '#8d7089', bright = '#d9743f', accent = '#f0a06a';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="34%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost 24 -> 26 arrow, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1168 640 H1268"/>
    <path d="M1240 614 L1268 640 L1240 666"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1006" y="48" width="306" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1030" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; 24.04 &#8594; 26.04 LTS</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e0a0e" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">noble &#8594; resolute</text>

    <text x="104" y="222" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> do-release-upgrade -c</text>
    <text x="104" y="248" font-family="${mono}" font-size="14" fill="${dim}">Checking for a new Ubuntu release</text>
    <text x="104" y="272" font-family="${mono}" font-size="14" fill="${bad}">There is no development version of an LTS</text>
    <text x="104" y="296" font-family="${mono}" font-size="14" fill="${bad}">available.</text>

    <text x="104" y="356" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> grep Supported meta-release-lts</text>
    <text x="104" y="382" font-family="${mono}" font-size="15" fill="${dim}">Dist: resolute</text>
    <text x="104" y="406" font-family="${mono}" font-size="15" fill="${bad}">Supported: 0<tspan fill="${dim}">&#160;&#160;&#160;&#160;&#8592; that is the whole answer</tspan></text>

    <text x="104" y="466" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> do-release-upgrade -d</text>
    <text x="104" y="492" font-family="${mono}" font-size="14" fill="${bad}">You have not rebooted after updating a</text>
    <text x="104" y="516" font-family="${mono}" font-size="14" fill="${bad}">package which requires a reboot.<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="560" font-family="${mono}" font-size="17" fill="${dim}">the path opens 27 August.</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">YOUR REPOS, DISABLED</text>

    <rect x="852" y="216" width="456" height="96" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="248" font-size="15" fill="${bad}">docker.sources</text>
    <text x="876" y="274" font-size="15" fill="${bad}">Enabled: no</text>
    <text x="876" y="300" font-size="14" fill="${dim}">was disabled (unknown mirror)</text>

    <text x="852" y="360" font-size="20" letter-spacing="2" fill="${dim}">THE SPLIT USERLAND</text>

    <rect x="852" y="380" width="456" height="120" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="412" font-size="15" fill="${accent}">ls, sort, cat  &#8594; uutils (Rust)</text>
    <text x="876" y="438" font-size="15" fill="${good}">cp, mv, rm     &#8594; GNU (reverted)</text>
    <text x="876" y="466" font-size="14" fill="${dim}">one PATH, two implementations</text>
    <text x="876" y="490" font-size="14" fill="${dim}">coreutils-from-gnu to go back</text>

    <text x="852" y="548" font-size="20" letter-spacing="2" fill="${dim}">AND initramfs-tools &#8594; dracut</text>
    <text x="852" y="578" font-size="16" fill="${dim}">tested on a box I could throw away</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.upgrade-2604-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/upgrade-2604-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/upgrade-2604-hero.png');
