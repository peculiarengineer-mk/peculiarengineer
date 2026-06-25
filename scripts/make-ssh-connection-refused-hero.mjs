import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (steel blue / network)
const bg = '#06080d';
const bright = '#5b8dd6';   // primary blue
const accent = '#9cc2f2';   // brightest highlight
const dim = '#3a5a8a';      // secondary
const faint = '#101a2c';    // borders / ghost
const good = '#6fd08a';     // listening green
const bad = '#e0564a';      // refused red

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0a1320"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#0d1626" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- badge top-right -->
  <g>
    <rect x="976" y="48" width="336" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1002" y="77" font-family="${mono}" font-size="18" letter-spacing="1.5" fill="${bright}">&#9670; IS ANYTHING ON :22?</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#080d16" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">server console &#183; :22</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bad}"><tspan fill="${bad}">&#10007;</tspan> connect to host port 22: refused</text>

    <text x="104" y="284" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ss -tlnp | grep :22</text>
    <text x="104" y="312" font-family="${mono}" font-size="16" fill="${dim}">(nothing listening)</text>

    <text x="104" y="374" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo apt install openssh-server</text>
    <text x="104" y="402" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo systemctl enable --now ssh</text>

    <text x="104" y="464" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> LISTEN 0 128 0.0.0.0:22 sshd</text>

    <text x="104" y="544" font-family="${mono}" font-size="18" fill="${dim}">refused means reachable, just no listener</text>
  </g>

  <!-- right column: refused vs timed out -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">READ THE ERROR</text>

    <rect x="852" y="222" width="456" height="118" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="262" font-size="19" fill="${accent}">Connection refused</text>
    <text x="880" y="292" font-size="16" fill="${dim}">reachable &#183; nothing on the port</text>
    <text x="880" y="320" font-size="16" fill="${good}">fix on the box: start sshd</text>

    <rect x="852" y="356" width="456" height="118" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="880" y="396" font-size="19" fill="${accent}">Connection timed out</text>
    <text x="880" y="426" font-size="16" fill="${dim}">not reachable at all</text>
    <text x="880" y="454" font-size="16" fill="${bad}">wrong address or firewall drop</text>

    <text x="852" y="522" font-size="17" fill="${accent}">nc -vz host 22</text>
    <text x="852" y="550" font-size="17" fill="${accent}">systemctl status ssh.socket</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ssh-connection-refused-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ssh-connection-refused-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ssh-connection-refused-hero.png');
