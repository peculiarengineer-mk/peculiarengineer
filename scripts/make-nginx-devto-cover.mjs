import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// dev.to cover spec is 1000x420. Rendered at 2x for crispness.
const W = 1000, H = 420;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// green on near black, matching the post hero
const bg0 = '#0f1a14', bg1 = '#070c09', grid = '#15251b', panel = '#090e0b';
const dim = '#8fa896', bright = '#5fd08a', accent = '#a9f0c2';
const good = '#5fd08a', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g" cx="26%" cy="30%" r="86%">
      <stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#p)" opacity="0.55"/>

  <!-- left: the line -->
  <text x="54" y="104" font-family="${mono}" font-size="15" letter-spacing="3" fill="${bright}">&#9670; UBUNTU 26.04 &#183; NGINX 1.28</text>

  <text x="54" y="168" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">One app,</text>
  <text x="54" y="216" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">one hostname,</text>
  <text x="54" y="264" font-family="${mono}" font-size="40" font-weight="700" fill="${accent}">no Docker.</text>

  <line x1="54" y1="298" x2="470" y2="298" stroke="${dim}" stroke-width="1.5"/>
  <text x="54" y="330" font-family="${mono}" font-size="16" fill="${dim}">a systemd app on 127.0.0.1:8080, put behind</text>
  <text x="54" y="356" font-family="${mono}" font-size="16" fill="${dim}">nginx and certbot straight from the archive</text>

  <!-- right: the evidence -->
  <g font-family="${mono}">
    <rect x="546" y="72" width="404" height="280" rx="10" fill="${panel}" stroke="${dim}" stroke-width="1.5"/>
    <line x1="546" y1="116" x2="950" y2="116" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="572" cy="94" r="5" fill="${dim}"/><circle cx="590" cy="94" r="5" fill="${dim}"/><circle cx="608" cy="94" r="5" fill="${dim}"/>
    <text x="632" y="99" font-size="14" fill="${dim}">curl -si https://app.example.com/</text>

    <text x="572" y="150" font-size="13" fill="${good}">HTTP/2 200</text>
    <text x="572" y="176" font-size="13" fill="${dim}">Host: app.example.com</text>
    <text x="572" y="202" font-size="13" fill="${dim}">X-Forwarded-For: 203.0.113.7</text>
    <text x="572" y="228" font-size="13" fill="${bad}">app stopped: HTTP/1.1 502 Bad Gateway</text>

    <line x1="572" y1="252" x2="924" y2="252" stroke="${grid}" stroke-width="1.5"/>
    <text x="572" y="282" font-size="16" fill="${good}">four headers. one default site.</text>
    <text x="572" y="308" font-size="13" fill="${dim}">websockets, http2 on; and certbot 4 from apt</text>
    <text x="572" y="334" font-size="13" fill="${dim}">also: what 502 and 413 are telling you</text>
  </g>
</svg>`;

writeFileSync(new URL('../social/.nginx-devto-cover.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png()
  .toFile(new URL('../social/nginx-reverse-proxy-devto-cover.png', import.meta.url).pathname);
console.log('wrote social/nginx-reverse-proxy-devto-cover.png');
