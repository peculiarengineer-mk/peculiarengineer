import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (network cyan / teal)
const bg = '#06100f';
const bright = '#2dd4bf';   // teal
const accent = '#7af0e0';   // brightest highlight
const dim = '#2c6f6a';      // muted teal
const faint = '#0f201e';    // borders / ghost
const good = '#6fd08a';     // ok green
const key = '#54a8f0';      // keyword blue

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0a1817"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#0d1c1a" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost network nodes, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="5" fill="none">
    <line x1="1200" y1="470" x2="1130" y2="560"/>
    <line x1="1200" y1="470" x2="1290" y2="560"/>
    <line x1="1130" y1="560" x2="1290" y2="560"/>
    <circle cx="1200" cy="470" r="20" fill="${bg}"/>
    <circle cx="1130" cy="560" r="20" fill="${bg}"/>
    <circle cx="1290" cy="560" r="20" fill="${bg}"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1064" y="48" width="248" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1090" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; NETPLAN</text>
  </g>

  <!-- editor window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0a1716" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">/etc/netplan/50-cloud-init.yaml</text>

    <text x="104" y="216" font-family="${mono}" font-size="16.5" fill="${accent}"><tspan fill="${key}">network</tspan>:</text>
    <text x="104" y="242" font-family="${mono}" font-size="16.5" fill="${accent}">  <tspan fill="${key}">renderer</tspan>: networkd</text>
    <text x="104" y="268" font-family="${mono}" font-size="16.5" fill="${accent}">  <tspan fill="${key}">ethernets</tspan>:</text>
    <text x="104" y="294" font-family="${mono}" font-size="16.5" fill="${accent}">    <tspan fill="${bright}">enp3s0</tspan>:</text>
    <text x="104" y="320" font-family="${mono}" font-size="16.5" fill="${accent}">      <tspan fill="${key}">dhcp4</tspan>: no</text>
    <text x="104" y="346" font-family="${mono}" font-size="16.5" fill="${accent}">      <tspan fill="${key}">addresses</tspan>: [<tspan fill="${good}">192.168.1.10/24</tspan>]</text>
    <text x="104" y="372" font-family="${mono}" font-size="16.5" fill="${accent}">      <tspan fill="${key}">routes</tspan>:</text>
    <text x="104" y="398" font-family="${mono}" font-size="16.5" fill="${accent}">        - <tspan fill="${key}">to</tspan>: default</text>
    <text x="104" y="424" font-family="${mono}" font-size="16.5" fill="${accent}">          <tspan fill="${key}">via</tspan>: <tspan fill="${good}">192.168.1.1</tspan></text>

    <text x="104" y="486" font-family="${mono}" font-size="16.5" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo netplan try</text>
    <text x="104" y="512" font-family="${mono}" font-size="16.5" fill="${good}"><tspan fill="${good}">&#10003;</tspan> rolls back in 120s unless confirmed</text>

    <text x="104" y="552" font-family="${mono}" font-size="17" fill="${dim}">spaces, never tabs &#183; whitespace is load-bearing</text>
  </g>

  <!-- right column: the model -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">YAML IN, NETWORK OUT</text>

    <rect x="852" y="220" width="456" height="178" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="880" y="266" font-size="19" fill="${accent}">state intent in YAML</text>
    <text x="880" y="302" font-size="19" fill="${bright}">  &#8595; netplan translates</text>
    <text x="880" y="338" font-size="19" fill="${good}">  &#8594; networkd / NetworkManager</text>
    <text x="880" y="376" font-size="17" fill="${dim}">one file format, either renderer</text>

    <text x="852" y="452" font-size="18" fill="${accent}"><tspan fill="#e5534b">gateway4</tspan>  is dead &#183; use routes:</text>
    <text x="852" y="484" font-size="18" fill="${accent}"><tspan fill="${key}">try</tspan> before apply on remote boxes</text>
    <text x="852" y="516" font-size="18" fill="${accent}"><tspan fill="${key}">ip a</tspan> / <tspan fill="${key}">ip route</tspan> tell you the names</text>
    <text x="852" y="552" font-size="17" fill="${dim}">cloud-init may overwrite your file</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.netplan-static-ip-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/netplan-static-ip-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/netplan-static-ip-hero.png');
