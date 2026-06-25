import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (cool cyan / secure key)
const bg = '#06090c';
const bright = '#56c5d0';   // primary cyan
const accent = '#9be7ef';   // brightest highlight
const dim = '#3f7d86';      // secondary
const deep = '#1f4248';     // deepest
const faint = '#10262a';    // borders / ghost
const good = '#6fd08a';     // ok green
const bad = '#e06a5a';      // denied red

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0a1418"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#0e1c20" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- badge top-right -->
  <g>
    <rect x="1000" y="48" width="312" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1026" y="77" font-family="${mono}" font-size="18" letter-spacing="1.5" fill="${bright}">&#9670; ED25519 &#183; KEYS ONLY</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#08110f" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">laptop &#183; ~/.ssh</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> ssh-keygen -t ed25519</text>
    <text x="104" y="250" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> key pair created &#183; passphrase set</text>

    <text x="104" y="312" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> ssh-copy-id you@host</text>
    <text x="104" y="340" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> public key installed on server</text>

    <text x="104" y="402" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> ssh you@host</text>
    <text x="104" y="430" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> Authenticated using "publickey"</text>
    <text x="104" y="458" font-family="${mono}" font-size="17" fill="${dim}">  no password prompt &#183; private key stayed put</text>

    <text x="104" y="544" font-family="${mono}" font-size="18" fill="${dim}">confirm the key works before you disable passwords</text>
  </g>

  <!-- right column: the key pair -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE KEY PAIR</text>

    <rect x="852" y="222" width="456" height="120" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="266" font-size="19" fill="${accent}">id_ed25519</text>
    <text x="880" y="296" font-size="16" fill="${dim}">private &#183; never leaves your laptop</text>
    <text x="880" y="324" font-size="16" fill="${bad}">guard this file</text>

    <rect x="852" y="358" width="456" height="120" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="880" y="402" font-size="19" fill="${accent}">id_ed25519.pub</text>
    <text x="880" y="432" font-size="16" fill="${dim}">public &#183; safe to share anywhere</text>
    <text x="880" y="460" font-size="16" fill="${good}">paste into authorized_keys</text>

    <text x="852" y="528" font-size="18" fill="${accent}">PasswordAuthentication <tspan fill="${bad}">no</tspan></text>
    <text x="852" y="556" font-size="18" fill="${accent}">PubkeyAuthentication <tspan fill="${good}">yes</tspan></text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ssh-keys-ubuntu-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ssh-keys-ubuntu-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ssh-keys-ubuntu-hero.png');
