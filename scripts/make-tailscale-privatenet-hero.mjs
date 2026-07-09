import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg0 = '#11151d', bg1 = '#0b0d12', grid = '#12161f', ghost = '#182236';
const dim = '#3d5273', bright = '#f0883e', accent = '#ffb37a';
const good = '#6fd08a', bad = '#e5534b', ts = '#5a7bf0';

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

  <!-- ghost padlock bottom-right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="8" fill="none">
    <rect x="1190" y="512" width="100" height="84" rx="10"/>
    <path d="M1206 512 v-22 a34 34 0 0 1 68 0 v22"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1076" y="48" width="236" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1102" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; PRIVATE NET</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">prod &#183; bind to the tailnet, never public</text>

    <text x="104" y="220" font-family="${mono}" font-size="16" fill="${dim}"># redis.conf</text>
    <text x="104" y="248" font-family="${mono}" font-size="17" fill="${accent}">bind <tspan fill="${ts}">100.72.10.4</tspan> 127.0.0.1</text>
    <text x="104" y="288" font-family="${mono}" font-size="16" fill="${dim}"># mongod.conf</text>
    <text x="104" y="316" font-family="${mono}" font-size="17" fill="${accent}">bindIp: <tspan fill="${ts}">100.72.10.4</tspan>, 127.0.0.1</text>

    <text x="104" y="378" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo tailscale up --ssh</text>
    <text x="104" y="406" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> SSH over the tailnet, port 22 stays shut</text>

    <text x="104" y="466" font-family="${mono}" font-size="17" fill="${bad}"><tspan fill="${bad}">&#10007;</tspan> key expired &#8594; the tunnel silently drops</text>
    <text x="104" y="494" font-family="${mono}" font-size="17" fill="${accent}">  disable key expiry on servers you trust</text>

    <text x="104" y="554" font-family="${mono}" font-size="18" fill="${dim}">datastores hear only the tailnet interface</text>
  </g>

  <!-- right: the topology -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">THE PRIVATE PATH</text>

    <rect x="852" y="216" width="200" height="72" rx="10" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="952" y="250" font-size="19" fill="${accent}" text-anchor="middle">worker VPS</text>
    <text x="952" y="274" font-size="15" fill="${dim}" text-anchor="middle">regional</text>

    <rect x="1108" y="216" width="200" height="72" rx="10" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="1208" y="250" font-size="19" fill="${accent}" text-anchor="middle">prod server</text>
    <text x="1208" y="274" font-size="15" fill="${dim}" text-anchor="middle">Redis &#183; Mongo</text>

    <!-- encrypted link -->
    <path d="M1052 252 H1108" stroke="${ts}" stroke-width="2.5"/>
    <text x="1080" y="238" font-size="14" fill="${ts}" text-anchor="middle">WireGuard</text>

    <rect x="852" y="330" width="456" height="60" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="367" font-size="18" fill="${good}"><tspan fill="${good}">&#10003;</tspan> listens only on the tailnet IP</text>

    <rect x="852" y="404" width="456" height="60" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="441" font-size="18" fill="${bad}"><tspan fill="${bad}">&#10007;</tspan> the public internet can't reach it</text>

    <text x="852" y="516" font-size="18" fill="${dim}">auth keys &#183; ACLs &#183; and the expiry gotcha</text>
    <text x="852" y="544" font-size="18" fill="${dim}">that silently breaks you months later.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.tailscale-privatenet-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/tailscale-privatenet-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/tailscale-privatenet-hero.png');
