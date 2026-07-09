import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// Shared generator for the 5-part Pong series.
// Classic black-and-white arcade court; each part gets one accent + one motif.

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const black = '#0a0a0a';
const white = '#f4f4f4';
const dim = '#6a6a6a';

// court geometry
const TOP = 104, BOT = 596, NETX = 680;
const LPADX = 118, RPADX = 1226, PADW = 16, PADH = 108;

function net() {
  let d = '';
  for (let y = TOP + 12; y < BOT - 12; y += 34) {
    d += `<rect x="${NETX - 5}" y="${y}" width="10" height="18" fill="${white}" opacity="0.55"/>`;
  }
  return d;
}

function ball(cx, cy, accent, trail = true) {
  let t = '';
  if (trail) {
    for (let i = 1; i <= 3; i++) {
      t += `<rect x="${cx - 9 - i * 26}" y="${cy - 9}" width="18" height="18" fill="${accent}" opacity="${0.28 - i * 0.07}"/>`;
    }
  }
  return `${t}<rect x="${cx - 9}" y="${cy - 9}" width="18" height="18" fill="${white}"/>`;
}

function frame({ part, accent, scoreL, scoreR, lPad, rPad, rPaddleAccent, lPaddleAccent, ballXY, extra, caption }) {
  const lFill = lPaddleAccent ? accent : white;
  const rFill = rPaddleAccent ? accent : white;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#141414"/>
      <stop offset="100%" stop-color="${black}"/>
    </radialGradient>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" y="0" fill="#ffffff" opacity="0.03"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>

  <!-- court walls -->
  <rect x="72" y="${TOP}" width="1216" height="6" fill="${white}" opacity="0.85"/>
  <rect x="72" y="${BOT}" width="1216" height="6" fill="${white}" opacity="0.85"/>
  ${net()}

  <!-- score -->
  <text x="${NETX - 150}" y="248" font-family="${mono}" font-size="132" font-weight="700" fill="${white}" text-anchor="middle" letter-spacing="4">${scoreL}</text>
  <text x="${NETX + 150}" y="248" font-family="${mono}" font-size="132" font-weight="700" fill="${white}" text-anchor="middle" letter-spacing="4">${scoreR}</text>

  <!-- paddles -->
  <rect x="${LPADX}" y="${lPad}" width="${PADW}" height="${PADH}" fill="${lFill}"/>
  <rect x="${RPADX}" y="${rPad}" width="${PADW}" height="${PADH}" fill="${rFill}"/>

  ${extra || ''}

  <!-- ball -->
  ${ball(ballXY[0], ballXY[1], accent)}

  <!-- badge -->
  <text x="72" y="72" font-family="${mono}" font-size="26" font-weight="700" letter-spacing="8" fill="${white}">PONG</text>
  <text x="1288" y="72" font-family="${mono}" font-size="22" letter-spacing="4" fill="${accent}" text-anchor="end">&#9670; PART ${part}</text>

  <!-- caption -->
  <text x="${W / 2}" y="656" font-family="${mono}" font-size="21" fill="${dim}" text-anchor="middle">${caption}</text>
</svg>`;
}

const parts = [
  {
    file: 'pong-1-hero',
    part: 'ONE',
    accent: '#6fd08a',
    scoreL: '7', scoreR: '4',
    lPad: 360, rPad: 300,
    ballXY: [792, 430],
    caption: 'from a blank window to a playable match &#183; scoring &#183; sound made in code &#183; screen shake',
  },
  {
    file: 'pong-2-hero',
    part: 'TWO',
    accent: '#4d8bf0',
    scoreL: '3', scoreR: '5',
    lPad: 300, rPad: 372, rPaddleAccent: true,
    ballXY: [860, 402],
    caption: "an AI is just input you don't type &#183; the right paddle now plays itself",
  },
  {
    file: 'pong-3-hero',
    part: 'THREE',
    accent: '#f0883e',
    scoreL: '6', scoreR: '6',
    lPad: 300, rPad: 360, rPaddleAccent: true,
    ballXY: [560, 470],
    // predicted trajectory: ball -> bounce off top wall -> right paddle
    extra: `<polyline points="560,470 900,${TOP + 10} 1210,414" fill="none" stroke="#f0883e" stroke-width="3" stroke-dasharray="10 10" opacity="0.9"/>
      <circle cx="1210" cy="414" r="9" fill="none" stroke="#f0883e" stroke-width="3"/>
      <text x="1150" y="470" font-family="${mono}" font-size="18" fill="#f0883e" text-anchor="end">it sees where the ball will be</text>`,
    caption: 'a predictive read on the ball &#183; Easy &#183; Medium &#183; Hard, one table of numbers',
  },
  {
    file: 'pong-4-hero',
    part: 'FOUR',
    accent: '#c06bd8',
    scoreL: '9', scoreR: '8',
    lPad: 330, rPad: 300, lPaddleAccent: true, rPaddleAccent: true,
    ballXY: [720, 360],
    extra: `<text x="${NETX}" y="470" font-family="${mono}" font-size="30" letter-spacing="10" fill="#c06bd8" text-anchor="middle" opacity="0.9">DEMO</text>`,
    caption: 'attract mode: the game plays itself &#183; then a real retro pixel font',
  },
  {
    file: 'pong-5-hero',
    part: 'FIVE',
    accent: '#fbbf24',
    scoreL: '11', scoreR: '9',
    lPad: 360, rPad: 320,
    ballXY: [860, 300],
    // a pickup capsule mid-court + a particle burst
    extra: (() => {
      const bx = 560, by = 452;
      let burst = '';
      const pts = [[0, -42], [34, -24], [42, 6], [26, 36], [-8, 44], [-38, 26], [-44, -8], [-24, -36]];
      for (const [dx, dy] of pts) burst += `<rect x="${bx + dx - 4}" y="${by + dy - 4}" width="8" height="8" fill="#fbbf24" opacity="0.85"/>`;
      return `<rect x="${bx - 22}" y="${by - 13}" width="44" height="26" rx="13" fill="none" stroke="#fbbf24" stroke-width="3"/>
        <text x="${bx}" y="${by + 7}" font-family="${mono}" font-size="20" font-weight="700" fill="#fbbf24" text-anchor="middle">+</text>
        ${burst}`;
    })(),
    caption: 'the finale &#183; spawned pickups, timed effects, particles &#183; entities with lifetimes',
  },
];

for (const p of parts) {
  const svg = frame(p);
  writeFileSync(new URL(`../src/assets/.${p.file}.svg`, import.meta.url), svg);
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(W * 2, H * 2)
    .png()
    .toFile(new URL(`../src/assets/${p.file}.png`, import.meta.url).pathname);
  console.log(`wrote src/assets/${p.file}.png`);
}
