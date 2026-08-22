import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// crimson palette (Hetzner lab)
const bg0 = '#160a0d', bg1 = '#090607', grid = '#1f1013', ghost = '#3d1620';
const dim = '#8f6169', bright = '#e2495f', accent = '#f4788a';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="28%" cy="32%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost server stack, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="7" fill="none" stroke-linecap="round">
    <rect x="1176" y="612" width="128" height="30" rx="6"/>
    <rect x="1176" y="654" width="128" height="30" rx="6"/>
    <circle cx="1200" cy="627" r="4" fill="${ghost}" stroke="none"/>
    <circle cx="1200" cy="669" r="4" fill="${ghost}" stroke="none"/>
  </g>

  <!-- badge top right -->
  <g>
    <rect x="1002" y="48" width="310" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1026" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; HETZNER &#183; OPENTOFU</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0f0709" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">born, used, destroyed</text>

    <text x="104" y="222" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> lab up --image ubuntu-26.04 --ttl 1</text>
    <text x="104" y="248" font-family="${mono}" font-size="15" fill="${dim}">Waiting for SSH on 128.140.11.62:22 ...</text>
    <text x="104" y="274" font-family="${mono}" font-size="15" fill="${good}"><tspan fill="${good}">&#10003;</tspan> Lab ready <tspan fill="${dim}">&#183; 62s</tspan></text>

    <text x="104" y="342" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> lab ssh -c &#39;lsb_release -d&#39;</text>
    <text x="104" y="368" font-family="${mono}" font-size="15" fill="${good}">Ubuntu 26.04 LTS <tspan fill="${dim}">(Resolute Raccoon)</tspan></text>

    <text x="104" y="436" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> lab down</text>
    <text x="104" y="462" font-family="${mono}" font-size="15" fill="${dim}">Destroy complete. 2 destroyed.<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="530" font-family="${mono}" font-size="18" fill="${dim}">a real kernel. real systemd.</text>
    <text x="104" y="556" font-family="${mono}" font-size="18" fill="${dim}">gone before you forget it.</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">STATE, ONE PER LAB</text>

    <rect x="852" y="216" width="456" height="72" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="16" fill="${dim}">s3://bucket/labs/<tspan fill="${accent}">&lt;id&gt;</tspan>/state.tfstate</text>
    <text x="876" y="274" font-size="16" fill="${dim}">separate keys, separate locks</text>

    <text x="852" y="336" font-size="20" letter-spacing="2" fill="${dim}">THE FOOTGUN</text>

    <rect x="852" y="356" width="456" height="108" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="388" font-size="16" fill="${bad}">_public_ip() timed out</text>
    <text x="876" y="414" font-size="16" fill="${bad}">&#8594; ssh cidr: 0.0.0.0/0</text>
    <text x="876" y="442" font-size="15" fill="${dim}">root, open, no warning printed</text>

    <text x="852" y="506" font-size="20" letter-spacing="2" fill="${dim}">THE BACKSTOP</text>

    <rect x="852" y="526" width="456" height="72" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="558" font-size="16" fill="${accent}">label_selector=lab%3Dtrue</text>
    <text x="876" y="584" font-size="15" fill="${accent}">what am I still being billed for?</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.hetzner-lab-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/hetzner-lab-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/hetzner-lab-hero.png');
