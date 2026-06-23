import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (Ubuntu orange / aubergine)
const bg = '#160d14';
const bright = '#e95420';   // Ubuntu orange
const accent = '#ff9466';   // brightest highlight
const dim = '#77216f';      // aubergine
const deep = '#5a1853';     // deepest
const faint = '#2c1a2a';    // borders / ghost
const good = '#6fd08a';     // ok green

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#1d1019"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#231521" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost shield, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="9" fill="none">
    <path d="M1240 430 L1310 460 L1310 545 Q1310 605 1240 640 Q1170 605 1170 545 L1170 460 Z"/>
    <path d="M1205 535 L1233 562 L1283 505"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1040" y="48" width="272" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1066" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; HARDEN UBUNTU</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#180e16" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">ubuntu &#183; desktop</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw default deny incoming</text>
    <text x="104" y="252" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw enable</text>
    <text x="104" y="282" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> Firewall is active and enabled</text>

    <text x="104" y="346" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> dpkg -l unattended-upgrades</text>
    <text x="104" y="376" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> already installed &#183; security only</text>

    <text x="104" y="440" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ss -tulpn</text>
    <text x="104" y="470" font-family="${mono}" font-size="17" fill="${dim}">  nothing listening you did not put there</text>

    <text x="104" y="540" font-family="${mono}" font-size="18" fill="${dim}">an afternoon &#183; no Linux internals needed</text>
  </g>

  <!-- right column: the five that matter -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">IF YOU ONLY DO FIVE</text>

    <rect x="852" y="220" width="456" height="362" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="270" font-size="21" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Auto security updates</text>
    <text x="880" y="324" font-size="21" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Firewall: deny incoming</text>
    <text x="880" y="378" font-size="21" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Full-disk encryption</text>
    <text x="880" y="432" font-size="21" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Password manager + 2FA</text>
    <text x="880" y="486" font-size="21" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Automated encrypted backup</text>
    <line x1="880" y1="516" x2="1280" y2="516" stroke="${faint}" stroke-width="1.5"/>
    <text x="880" y="552" font-size="17" fill="${dim}">the doors that get walked through</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ubuntu-hardening-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ubuntu-hardening-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ubuntu-hardening-hero.png');
