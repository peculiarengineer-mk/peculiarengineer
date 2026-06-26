import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (firewall amber / steel)
const bg = '#0b0d12';
const bright = '#f0883e';   // amber
const accent = '#ffb37a';   // brightest highlight
const dim = '#3d5273';      // steel blue
const faint = '#161b26';    // borders / ghost
const good = '#6fd08a';     // ok green / allow
const block = '#e5534b';    // deny red

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#11151d"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#12161f" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost brick wall, bottom-right -->
  <g opacity="0.45" stroke="${faint}" stroke-width="6" fill="none">
    <rect x="1158" y="452" width="172" height="38"/>
    <rect x="1158" y="490" width="86" height="38"/>
    <rect x="1244" y="490" width="86" height="38"/>
    <rect x="1158" y="528" width="172" height="38"/>
    <rect x="1158" y="566" width="86" height="38"/>
    <rect x="1244" y="566" width="86" height="38"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1078" y="48" width="234" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1104" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; UFW BASICS</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">ubuntu &#183; the uncomplicated firewall</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw default deny incoming</text>
    <text x="104" y="252" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw allow OpenSSH</text>
    <text x="104" y="282" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw enable</text>
    <text x="104" y="312" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> Firewall is active and enabled on boot</text>

    <text x="104" y="380" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ufw status verbose</text>
    <text x="104" y="410" font-family="${mono}" font-size="17" fill="${good}">  22/tcp    <tspan fill="${good}">ALLOW IN</tspan>   Anywhere</text>
    <text x="104" y="438" font-family="${mono}" font-size="17" fill="${dim}">  default   <tspan fill="${block}">DENY IN</tspan>    everything else</text>

    <text x="104" y="508" font-family="${mono}" font-size="18" fill="${dim}">allow SSH first &#183; then flip it on</text>
    <text x="104" y="544" font-family="${mono}" font-size="18" fill="${dim}">first match wins &#183; rules do nothing until enable</text>
  </g>

  <!-- right column: the model -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE WHOLE MODEL</text>

    <rect x="852" y="220" width="456" height="200" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="268" font-size="20" fill="${accent}"><tspan fill="${good}">&#8594;</tspan>  outgoing: <tspan fill="${good}">ALLOW</tspan></text>
    <text x="880" y="312" font-size="20" fill="${accent}"><tspan fill="${block}">&#8592;</tspan>  incoming: <tspan fill="${block}">DENY</tspan></text>
    <text x="880" y="356" font-size="20" fill="${accent}"><tspan fill="${good}">&#10003;</tspan>  except the doors you open</text>
    <text x="880" y="398" font-size="18" fill="${dim}">two defaults + a list of rules</text>

    <text x="852" y="468" font-size="18" fill="${accent}"><tspan fill="${bright}">limit</tspan> OpenSSH &#183; throttle the bots</text>
    <text x="852" y="500" font-size="18" fill="${accent}"><tspan fill="${bright}">allow from</tspan> 10.0.0.5 &#183; one host only</text>
    <text x="852" y="544" font-size="17" fill="${dim}">cloud SG and Docker are other firewalls</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ufw-basics-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ufw-basics-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ufw-basics-hero.png');
