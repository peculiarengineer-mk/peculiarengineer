import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// green felt palette
const felt0 = '#0f3323';
const felt1 = '#08160f';
const line = '#1c4a34';
const gold = '#e8b04a';
const cream = '#f3ead6';
const cardEdge = '#c8bfa8';
const red = '#d24b4b';
const ink = '#20303a';
const dim = '#6f8a7c';

const S = { spade: '&#9824;', heart: '&#9829;', diam: '&#9830;', club: '&#9827;' };

// a face-up card
function card(x, y, rank, suit, color) {
  return `<g>
    <rect x="${x}" y="${y}" width="96" height="132" rx="10" fill="${cream}" stroke="${cardEdge}" stroke-width="1.5"/>
    <text x="${x + 12}" y="${y + 34}" font-family="${mono}" font-size="26" font-weight="700" fill="${color}">${rank}</text>
    <text x="${x + 12}" y="${y + 58}" font-family="${mono}" font-size="22" fill="${color}">${suit}</text>
    <text x="${x + 48}" y="${y + 90}" font-family="${mono}" font-size="40" fill="${color}" text-anchor="middle">${suit}</text>
  </g>`;
}
// a face-down card
function back(x, y) {
  return `<g>
    <rect x="${x}" y="${y}" width="96" height="132" rx="10" fill="#123a28" stroke="${line}" stroke-width="1.5"/>
    <rect x="${x + 10}" y="${y + 10}" width="76" height="112" rx="6" fill="none" stroke="${gold}" stroke-width="1.5" opacity="0.55"/>
    <path d="M${x + 10} ${y + 10} L${x + 86} ${y + 122} M${x + 86} ${y + 10} L${x + 10} ${y + 122}" stroke="${gold}" stroke-width="1" opacity="0.35"/>
  </g>`;
}
// an empty slot
function slot(x, y, suit) {
  return `<g>
    <rect x="${x}" y="${y}" width="96" height="132" rx="10" fill="none" stroke="${line}" stroke-width="2"/>
    ${suit ? `<text x="${x + 48}" y="${y + 84}" font-family="${mono}" font-size="40" fill="${line}" text-anchor="middle">${suit}</text>` : ''}
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="felt" cx="34%" cy="30%" r="85%">
      <stop offset="0%" stop-color="${felt0}"/>
      <stop offset="100%" stop-color="${felt1}"/>
    </radialGradient>
    <pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M0 8 L8 0" stroke="#ffffff" stroke-width="0.5" opacity="0.02"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#felt)"/>
  <rect width="${W}" height="${H}" fill="url(#weave)"/>

  <!-- badge -->
  <g>
    <rect x="1088" y="48" width="224" height="46" rx="8" fill="none" stroke="${line}" stroke-width="1.5"/>
    <text x="1114" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${gold}">&#9670; L&#214;VE &#183; LUA</text>
  </g>

  <!-- foundations row -->
  ${slot(72, 128, S.spade)}
  ${slot(184, 128, S.heart)}
  ${slot(296, 128, S.diam)}
  ${slot(408, 128, S.club)}

  <!-- stock + waste -->
  ${back(596, 128)}
  ${card(708, 128, 'A', S.spade, ink)}

  <!-- a tableau column, fanned, undo-snapshot vibe -->
  ${back(72, 320)}
  ${back(96, 356)}
  ${card(120, 392, 'K', S.heart, red)}
  ${card(144, 470, 'Q', S.club, ink)}
  ${card(168, 548, 'J', S.diam, red)}

  <!-- a second short column -->
  ${back(360, 320)}
  ${card(384, 356, '10', S.spade, ink)}

  <!-- drag/tween arrow -->
  <path d="M300 470 C520 470 560 300 700 210" fill="none" stroke="${gold}" stroke-width="2" stroke-dasharray="8 8" opacity="0.7"/>
  <path d="M700 210 l2 11 l-11 -3 z" fill="${gold}"/>

  <!-- right: what the game taught -->
  <g font-family="${mono}">
    <text x="820" y="180" font-size="20" letter-spacing="2" fill="${dim}">WHAT A CARD GAME TAUGHT ME</text>

    <text x="820" y="232" font-size="21" fill="${cream}"><tspan fill="${gold}">&#183;</tspan> modules that hide their state</text>
    <text x="820" y="272" font-size="21" fill="${cream}"><tspan fill="${gold}">&#183;</tspan> objects without classes, via metatables</text>
    <text x="820" y="312" font-size="21" fill="${cream}"><tspan fill="${gold}">&#183;</tspan> undo by snapshot</text>
    <text x="820" y="352" font-size="21" fill="${cream}"><tspan fill="${gold}">&#183;</tspan> dt-based tweening</text>

    <rect x="820" y="392" width="468" height="132" rx="10" fill="#0a1f16" stroke="${line}" stroke-width="1.5"/>
    <text x="844" y="430" font-size="17" fill="${dim}">-- an object, the Lua way</text>
    <text x="844" y="462" font-size="17" fill="${cream}">Card = {}</text>
    <text x="844" y="490" font-size="17" fill="${cream}">Card.__index = Card</text>
    <text x="844" y="512" font-size="16" fill="${gold}">setmetatable(c, Card)  -- no class needed</text>

    <text x="820" y="566" font-size="18" fill="${dim}">the Lua I skipped writing Pong.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.klondike-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/klondike-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/klondike-hero.png');
