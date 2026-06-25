import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (warm error orange / diagnostic)
const bg = '#0c0705';
const bright = '#e8794e';   // primary orange
const accent = '#ffb482';   // brightest highlight
const dim = '#8a5536';      // secondary
const faint = '#2a1610';    // borders / ghost
const good = '#6fd08a';     // resolved green
const bad = '#e0564a';      // denied red

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#170d09"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#1c110b" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- badge top-right -->
  <g>
    <rect x="1000" y="48" width="312" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1026" y="77" font-family="${mono}" font-size="18" letter-spacing="1.5" fill="${bright}">&#9670; READ ssh -v FIRST</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0f0907" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">laptop &#183; ssh -v</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> ssh user@host</text>
    <text x="104" y="250" font-family="${mono}" font-size="17" fill="${bad}"><tspan fill="${bad}">&#10007;</tspan> Permission denied (publickey).</text>

    <text x="104" y="312" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> ssh -v user@host</text>
    <text x="104" y="340" font-family="${mono}" font-size="15" fill="${dim}">debug1: Offering public key: id_ed25519</text>
    <text x="104" y="366" font-family="${mono}" font-size="15" fill="${dim}">debug1: Authentications that can continue:</text>
    <text x="104" y="392" font-family="${mono}" font-size="15" fill="${dim}">         publickey</text>
    <text x="104" y="418" font-family="${mono}" font-size="15" fill="${dim}">debug1: No more authentication methods.</text>

    <text x="104" y="478" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> key offered &#8594; look at the server</text>
    <text x="104" y="544" font-family="${mono}" font-size="18" fill="${dim}">no key offered &#8594; look at your client</text>
  </g>

  <!-- right column: which side? -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHICH SIDE?</text>

    <rect x="852" y="222" width="456" height="118" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="262" font-size="19" fill="${accent}">no key offered</text>
    <text x="880" y="292" font-size="16" fill="${dim}">client: empty agent, wrong key</text>
    <text x="880" y="320" font-size="16" fill="${good}">ssh-add -l &#183; IdentitiesOnly yes</text>

    <rect x="852" y="356" width="456" height="118" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="880" y="396" font-size="19" fill="${accent}">key offered, refused</text>
    <text x="880" y="426" font-size="16" fill="${dim}">server: wrong user, perms, no entry</text>
    <text x="880" y="454" font-size="16" fill="${good}">authorized_keys &#183; StrictModes</text>

    <text x="852" y="522" font-size="17" fill="${accent}">chmod 700 ~/.ssh</text>
    <text x="852" y="550" font-size="17" fill="${accent}">chmod 600 ~/.ssh/authorized_keys</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ssh-publickey-denied-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ssh-publickey-denied-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ssh-publickey-denied-hero.png');
