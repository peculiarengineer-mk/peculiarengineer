import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (server amber / green)
const bg = '#0c0a06';
const bright = '#f2c14e';   // primary amber
const accent = '#ffd97a';   // brightest highlight
const dim = '#8a6d2f';      // secondary
const deep = '#5c4719';     // deepest
const faint = '#322713';    // borders / ghost
const good = '#6fd08a';     // ok green
const bad = '#e06a5a';      // denied red

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#14100a"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#1c160c" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- badge top-right -->
  <g>
    <rect x="976" y="48" width="336" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1002" y="77" font-family="${mono}" font-size="18" letter-spacing="1.5" fill="${bright}">&#9670; 26.04 SERVER &#183; HARDEN</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0f0c07" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">resolute &#183; sshd_config.d</text>

    <text x="104" y="220" font-family="${mono}" font-size="17" fill="${accent}">PermitRootLogin <tspan fill="${bad}">no</tspan></text>
    <text x="104" y="248" font-family="${mono}" font-size="17" fill="${accent}">PasswordAuthentication <tspan fill="${bad}">no</tspan></text>
    <text x="104" y="276" font-family="${mono}" font-size="17" fill="${accent}">PubkeyAuthentication <tspan fill="${good}">yes</tspan></text>

    <text x="104" y="338" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo sshd -t &amp;&amp; systemctl reload ssh</text>
    <text x="104" y="366" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> config parses &#183; keys only</text>

    <text x="104" y="428" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw allow OpenSSH</text>
    <text x="104" y="456" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw enable</text>
    <text x="104" y="484" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> SSH allowed before the door shuts</text>

    <text x="104" y="544" font-family="${mono}" font-size="18" fill="${dim}">confirm the key works in a 2nd terminal first</text>
  </g>

  <!-- right column: the pass in order -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE PASS, IN ORDER</text>

    <rect x="852" y="220" width="456" height="362" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="266" font-size="19" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Key login confirmed</text>
    <text x="880" y="312" font-size="19" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Firewall + OpenSSH</text>
    <text x="880" y="358" font-size="19" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  sshd: keys only</text>
    <text x="880" y="404" font-size="19" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Unattended + reboot 02:30</text>
    <text x="880" y="450" font-size="19" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  Pro: livepatch + ESM</text>
    <text x="880" y="496" font-size="19" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  fail2ban on :22</text>
    <text x="880" y="542" font-size="19" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  ss -tulpn &#183; shut the rest</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ubuntu-2604-server-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ubuntu-2604-server-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ubuntu-2604-server-hero.png');
