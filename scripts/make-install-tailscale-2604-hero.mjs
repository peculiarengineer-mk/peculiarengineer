import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// slate blue palette
const bg0 = '#11151d', bg1 = '#0b0d12', grid = '#12161f', ghost = '#182236';
const dim = '#3d5273', bright = '#f0883e', accent = '#ffb37a';
const good = '#6fd08a', ts = '#5a7bf0';

// a mesh node
function node(x, y, r, on) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${on ? ts : ghost}" stroke-width="${on ? 2.5 : 2}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost mesh bottom-right -->
  <g opacity="0.5">
    <path d="M1170 470 L1300 470 M1170 470 L1235 600 M1300 470 L1235 600 M1170 470 L1235 540 M1300 470 L1235 540" stroke="${ghost}" stroke-width="4" fill="none"/>
    ${node(1170, 470, 20)}${node(1300, 470, 20)}${node(1235, 600, 20)}${node(1235, 540, 14)}
  </g>

  <!-- badge -->
  <g>
    <rect x="1040" y="48" width="272" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1066" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; TAILSCALE &#183; 26.04</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">ubuntu 26.04 (resolute) &#183; the tailnet</text>

    <text x="104" y="222" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> curl -fsSL https://tailscale.com/install.sh | sh</text>
    <text x="104" y="264" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo tailscale up</text>
    <text x="104" y="292" font-family="${mono}" font-size="16" fill="${dim}">  # headless? use an auth key instead:</text>
    <text x="104" y="320" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo tailscale up --authkey tskey-auth-...</text>

    <text x="104" y="382" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> tailscale ip -4</text>
    <text x="104" y="410" font-family="${mono}" font-size="17" fill="${ts}">100.86.42.7</text>

    <text x="104" y="466" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo systemctl enable --now tailscaled</text>
    <text x="104" y="494" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> survives a reboot</text>

    <text x="104" y="554" font-family="${mono}" font-size="18" fill="${dim}">interactive login, or an auth key on a headless box</text>
  </g>

  <!-- right: what you get -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHAT YOU GET</text>

    <rect x="852" y="220" width="456" height="64" rx="8" fill="none" stroke="${ts}" stroke-width="2"/>
    <text x="876" y="259" font-size="19" fill="${accent}">a <tspan fill="${ts}">100.x</tspan> address on your tailnet</text>

    <text x="1080" y="312" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="328" width="456" height="64" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="367" font-size="19" fill="${accent}">WireGuard tunnels, no ports opened</text>

    <text x="1080" y="420" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="436" width="456" height="64" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="475" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> reachable from every other node</text>

    <text x="852" y="546" font-size="18" fill="${dim}">install &#183; join &#183; verify &#183; make it stick</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.install-tailscale-2604-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/install-tailscale-2604-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/install-tailscale-2604-hero.png');
