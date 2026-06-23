import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (resolute green / teal)
const bg = '#06140e';
const bright = '#4ade80';   // primary green
const accent = '#bbf7d0';   // brightest highlight
const dim = '#15803d';      // secondary
const deep = '#166534';     // deepest
const faint = '#13291d';    // borders / ghost
const good = '#7dd3fc';     // cyan accent

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#0a2014"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#0d2417" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost TPM chip, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="8" fill="none">
    <rect x="1170" y="470" width="120" height="120" rx="10"/>
    <rect x="1200" y="500" width="60" height="60" rx="6"/>
    <path d="M1170 500 h-22 M1170 530 h-22 M1170 560 h-22 M1290 500 h22 M1290 530 h22 M1290 560 h22"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="952" y="48" width="360" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="978" y="77" font-family="${mono}" font-size="17" letter-spacing="1.5" fill="${bright}">&#9670; 26.04 &#183; RESOLUTE RACCOON</text>
  </g>

  <text x="72" y="86" font-family="${mono}" font-size="24" letter-spacing="1" fill="${accent}">WHAT CHANGES ON 26.04 DESKTOP</text>

  <!-- three feature cards -->
  <g font-family="${mono}">
    <!-- card 1: TPM FDE -->
    <rect x="72" y="150" width="392" height="420" rx="10" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="100" y="200" font-size="20" letter-spacing="1" fill="${accent}">TPM-BACKED FDE</text>
    <text x="100" y="244" font-size="17" fill="${bright}">first-class in the</text>
    <text x="100" y="270" font-size="17" fill="${bright}">installer now</text>
    <text x="100" y="320" font-size="16" fill="${dim}">unlocks at boot,</text>
    <text x="100" y="344" font-size="16" fill="${dim}">no passphrase</text>
    <line x1="100" y1="378" x2="436" y2="378" stroke="${faint}" stroke-width="1.5"/>
    <text x="100" y="416" font-size="16" fill="${good}">tradeoff: login</text>
    <text x="100" y="440" font-size="16" fill="${good}">password is the gate</text>
    <text x="100" y="492" font-size="16" fill="${dim}">sealed to this</text>
    <text x="100" y="516" font-size="16" fill="${dim}">machine's chip</text>

    <!-- card 2: Wayland -->
    <rect x="484" y="150" width="392" height="420" rx="10" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="512" y="200" font-size="20" letter-spacing="1" fill="${accent}">WAYLAND-ONLY</text>
    <text x="512" y="244" font-size="17" fill="${bright}">X11 session gone</text>
    <text x="512" y="270" font-size="17" fill="${bright}">in GNOME 50</text>
    <line x1="512" y1="304" x2="848" y2="304" stroke="${faint}" stroke-width="1.5"/>
    <text x="512" y="344" font-size="16" fill="${dim}">X11: any app could</text>
    <text x="512" y="368" font-size="16" fill="${dim}">keylog + screenshot</text>
    <text x="512" y="392" font-size="16" fill="${dim}">every other window</text>
    <text x="512" y="444" font-size="16" fill="${good}">Wayland isolates</text>
    <text x="512" y="468" font-size="16" fill="${good}">apps for free</text>
    <text x="512" y="520" font-size="16" fill="${dim}">capture via portals</text>

    <!-- card 3: permission prompts -->
    <rect x="896" y="150" width="392" height="420" rx="10" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="924" y="200" font-size="20" letter-spacing="1" fill="${accent}">PERMISSION PROMPTS</text>
    <text x="924" y="244" font-size="17" fill="${bright}">camera &#183; mic</text>
    <text x="924" y="270" font-size="17" fill="${bright}">location &#183; screen</text>
    <line x1="924" y1="304" x2="1260" y2="304" stroke="${faint}" stroke-width="1.5"/>
    <text x="924" y="344" font-size="16" fill="${dim}">review + revoke in</text>
    <text x="924" y="368" font-size="16" fill="${dim}">Privacy &amp; Security</text>
    <text x="924" y="440" font-size="16" fill="${good}">a text editor asking</text>
    <text x="924" y="464" font-size="16" fill="${good}">for the mic = stop</text>
    <text x="924" y="524" font-size="16" fill="${dim}">screen-lock lives here too</text>
  </g>

  <text x="72" y="624" font-family="${mono}" font-size="18" fill="${dim}">LTS &#183; patched to 2031 (10 yrs with free Ubuntu Pro)</text>
</svg>`;

writeFileSync(new URL('../src/assets/.ubuntu-2604-desktop-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ubuntu-2604-desktop-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ubuntu-2604-desktop-hero.png');
