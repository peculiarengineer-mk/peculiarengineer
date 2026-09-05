import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1000, H = 420;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
// crimson, matching the article hero
const bg0 = '#160a0d', bg1 = '#090607', grid = '#1f1013';
const dim = '#8f6169', bright = '#e2495f', accent = '#f4788a';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g" cx="26%" cy="30%" r="86%">
      <stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#p)" opacity="0.55"/>

  <text x="54" y="100" font-family="${mono}" font-size="15" letter-spacing="3" fill="${bright}">&#9670; HETZNER &#183; OPENTOFU</text>

  <text x="54" y="164" font-family="${mono}" font-size="38" font-weight="700" fill="${accent}">Born, used,</text>
  <text x="54" y="210" font-family="${mono}" font-size="38" font-weight="700" fill="${accent}">destroyed.</text>

  <line x1="54" y1="244" x2="470" y2="244" stroke="${dim}" stroke-width="1.5"/>
  <text x="54" y="278" font-family="${mono}" font-size="16" fill="${dim}">a real Ubuntu box for twenty minutes,</text>
  <text x="54" y="304" font-family="${mono}" font-size="16" fill="${dim}">so the guide is tested before it ships</text>
  <text x="54" y="348" font-family="${mono}" font-size="15" fill="${dim}">plus three footguns in my own code</text>

  <g font-family="${mono}">
    <rect x="546" y="72" width="404" height="280" rx="10" fill="#0f0709" stroke="${dim}" stroke-width="1.5"/>
    <line x1="546" y1="116" x2="950" y2="116" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="572" cy="94" r="5" fill="${dim}"/><circle cx="590" cy="94" r="5" fill="${dim}"/><circle cx="608" cy="94" r="5" fill="${dim}"/>
    <text x="632" y="99" font-size="14" fill="${dim}">lab up &#183; lab down</text>

    <text x="572" y="152" font-size="14" fill="${accent}"><tspan fill="${bright}">$</tspan> lab up --image ubuntu-26.04</text>
    <text x="572" y="178" font-size="13" fill="${dim}">Waiting for SSH on 128.140.11.62 ...</text>
    <text x="572" y="202" font-size="13" fill="${good}">&#10003; Lab ready &#183; 62s</text>

    <text x="572" y="244" font-size="14" fill="${accent}"><tspan fill="${bright}">$</tspan> lab down</text>
    <text x="572" y="270" font-size="13" fill="${dim}">Destroy complete. 2 destroyed.</text>

    <line x1="572" y1="292" x2="924" y2="292" stroke="${grid}" stroke-width="1.5"/>
    <text x="572" y="320" font-size="13" fill="${bad}">ssh cidr: 0.0.0.0/0</text>
    <text x="572" y="342" font-size="12" fill="${dim}">the footgun it printed without comment</text>
  </g>
</svg>`;

writeFileSync(new URL('../social/.lab-devto-cover.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png()
  .toFile(new URL('../social/disposable-hetzner-lab-devto-cover.png', import.meta.url).pathname);
console.log('wrote social/disposable-hetzner-lab-devto-cover.png');
