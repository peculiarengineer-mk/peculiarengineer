import sharp from 'sharp';

const W = 1360;
const H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const colors = ['#f08ca3', '#b98762', '#79c98d', '#6d9bea'];
let bricks = '';

for (let row = 0; row < 6; row += 1) {
  for (let column = 0; column < 12; column += 1) {
    bricks += `<rect x="${248 + column * 72}" y="${132 + row * 38}" width="62" height="28" rx="2" fill="${colors[row % colors.length]}"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="72%">
      <stop offset="0%" stop-color="#171b38"/>
      <stop offset="100%" stop-color="#080a18"/>
    </radialGradient>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="#fff" opacity="0.025"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>
  <text x="72" y="74" font-family="${mono}" font-size="26" font-weight="700" letter-spacing="8" fill="#f4f4f4">BREAKOUT</text>
  <text x="1288" y="74" font-family="${mono}" font-size="21" letter-spacing="4" text-anchor="end" fill="#f5d77b">LÖVE · LUA</text>
  <text x="72" y="126" font-family="${mono}" font-size="17" fill="#7d86a8">SCORE  1840</text>
  <text x="1288" y="126" font-family="${mono}" font-size="17" text-anchor="end" fill="#7d86a8">LIVES  3</text>
  ${bricks}
  <rect x="610" y="558" width="144" height="16" rx="2" fill="#f4f4f4"/>
  <rect x="824" y="438" width="24" height="24" fill="#f5d77b"/>
  <rect x="793" y="469" width="18" height="18" fill="#f5d77b" opacity="0.35"/>
  <rect x="765" y="497" width="14" height="14" fill="#f5d77b" opacity="0.16"/>
  <text x="680" y="641" font-family="${mono}" font-size="21" text-anchor="middle" fill="#7d86a8">one ball · seventy-two bricks · four states · one main.lua</text>
</svg>`;

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/breakout-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/breakout-hero.png');
