import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// argo teal/indigo palette
const bg0 = '#0b1220', bg1 = '#05070d', grid = '#141d2e', ghost = '#1e2b45';
const dim = '#7387a6', bright = '#5aa9e6', accent = '#8fd0f5';
const good = '#4fbf87', bad = '#f2837a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="28%" cy="32%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost tree, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linecap="round">
    <circle cx="1180" cy="596" r="15"/>
    <path d="M1180 611 V636 M1180 636 H1130 M1180 636 H1240 M1130 636 V652 M1240 636 V652"/>
    <circle cx="1130" cy="664" r="12"/>
    <circle cx="1240" cy="664" r="12"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1000" y="48" width="312" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1024" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; PART FOUR &#183; ARGO CD</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#080c15" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">who deploys the deployer</text>

    <text x="104" y="218" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> git push</text>
    <g font-family="${mono}" font-size="14">
      <text x="104" y="250" fill="${dim}">NAME</text><text x="300" y="250" fill="${dim}">SYNC</text><text x="470" y="250" fill="${dim}">HEALTH</text>
      <text x="104" y="276" fill="${accent}">hello</text><text x="300" y="276" fill="${good}">Synced</text><text x="470" y="276" fill="${good}">Healthy</text>
      <text x="104" y="300" fill="${accent}">root</text><text x="300" y="300" fill="${good}">Synced</text><text x="470" y="300" fill="${good}">Healthy</text>
      <text x="104" y="324" fill="${accent}">whoami</text><text x="300" y="324" fill="${good}">Synced</text><text x="470" y="324" fill="${good}">Healthy</text>
    </g>
    <text x="104" y="356" font-family="${mono}" font-size="14" fill="${dim}">no kubectl was run.</text>

    <text x="104" y="414" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl delete application root</text>
    <text x="104" y="440" font-family="${mono}" font-size="14" fill="${bad}">deployments.apps &#34;hello&#34; not found</text>
    <text x="104" y="464" font-family="${mono}" font-size="14" fill="${bad}">No resources found.<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="518" font-family="${mono}" font-size="17" fill="${dim}">one command.</text>
    <text x="104" y="546" font-family="${mono}" font-size="17" fill="${dim}">two levels of cascade.</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">ADOPTION IS FREE</text>
    <rect x="852" y="216" width="456" height="80" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="14" fill="${good}">pod uid unchanged</text>
    <text x="876" y="274" font-size="14" fill="${dim}">patched in place, nothing bounced</text>

    <text x="852" y="340" font-size="20" letter-spacing="2" fill="${dim}">THE GUARD NOBODY MENTIONS</text>
    <rect x="852" y="360" width="456" height="86" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="392" font-size="14" fill="${accent}">SyncError: Skipping sync attempt:</text>
    <text x="876" y="416" font-size="14" fill="${accent}">auto-sync will wipe out all resources</text>

    <text x="852" y="490" font-size="20" letter-spacing="2" fill="${dim}">AND THE DEADLOCK</text>
    <rect x="852" y="510" width="456" height="86" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="542" font-size="14" fill="${bad}">root stuck Terminating</text>
    <text x="876" y="566" font-size="14" fill="${dim}">its finalizer waits for itself</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.app-of-apps-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/app-of-apps-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/app-of-apps-hero.png');
