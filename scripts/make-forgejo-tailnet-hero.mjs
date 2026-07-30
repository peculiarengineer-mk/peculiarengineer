import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// slate blue palette
const bg0 = '#11151d', bg1 = '#0b0d12', grid = '#12161f', ghost = '#182236';
const dim = '#3d5273', bright = '#f0883e', accent = '#ffb37a';
const good = '#6fd08a', ts = '#5a7bf0';

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

  <!-- ghost shared namespace, bottom right: two containers, one network stack -->
  <g opacity="0.5">
    <rect x="1186" y="578" width="134" height="86" rx="10" fill="none" stroke="${ghost}" stroke-width="4"/>
    <rect x="1204" y="594" width="98" height="24" rx="5" fill="none" stroke="${ghost}" stroke-width="2"/>
    <rect x="1204" y="626" width="98" height="24" rx="5" fill="none" stroke="${ghost}" stroke-width="2"/>
    <path d="M1253 618 L1253 626" stroke="${ghost}" stroke-width="3" fill="none"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1040" y="48" width="272" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1066" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; FORGEJO &#183; TAILNET</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">your own git host &#183; no open ports</text>

    <text x="104" y="220" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> docker compose up -d</text>
    <text x="104" y="248" font-family="${mono}" font-size="16" fill="${good}"><tspan fill="${good}">&#10003;</tspan> ts-forgejo  started</text>
    <text x="104" y="274" font-family="${mono}" font-size="16" fill="${good}"><tspan fill="${good}">&#10003;</tspan> forgejo     started</text>

    <text x="104" y="330" font-family="${mono}" font-size="16" fill="${dim}">  # network_mode: service:ts-forgejo</text>

    <text x="104" y="380" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> curl -I https://forgejo.tail1234.ts.net/</text>
    <text x="104" y="408" font-family="${mono}" font-size="17" fill="${ts}">HTTP/2 200</text>

    <text x="104" y="464" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> git clone git@forgejo.tail1234.ts.net:me/repo.git</text>
    <text x="104" y="492" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> cloning over port 22</text>

    <text x="104" y="554" font-family="${mono}" font-size="18" fill="${dim}">no DNS record, no certbot, nothing exposed</text>
  </g>

  <!-- right: what you get -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHAT YOU GET</text>

    <rect x="852" y="220" width="456" height="64" rx="8" fill="none" stroke="${ts}" stroke-width="2"/>
    <text x="876" y="259" font-size="19" fill="${accent}">forgejo <tspan fill="${ts}">is</tspan> the tailscale node</text>

    <text x="1080" y="312" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="328" width="456" height="64" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="367" font-size="19" fill="${accent}">real cert, no port 80 opened</text>

    <text x="1080" y="420" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="436" width="456" height="64" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="475" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> reachable from your tailnet only</text>

    <text x="852" y="546" font-size="18" fill="${dim}">sidecar &#183; serve &#183; clone &#183; keep the state</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.forgejo-tailnet-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
	.resize(W * 2, H * 2)
	.png()
	.toFile(new URL('../src/assets/forgejo-tailnet-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/forgejo-tailnet-hero.png');
