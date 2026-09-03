import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// argo teal/indigo palette, same family as Parts Three and Four
const bg0 = '#0b1220', bg1 = '#05070d', grid = '#141d2e', ghost = '#1e2b45';
const dim = '#7387a6', bright = '#5aa9e6', accent = '#8fd0f5';
const good = '#4fbf87', bad = '#f2837a', warn = '#e6c15a';

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

  <!-- ghost key, bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="1150" cy="600" r="26"/>
    <path d="M1172 614 L1262 664 M1232 648 L1222 666 M1250 658 L1240 676"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="980" y="48" width="332" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1004" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; PART FIVE &#183; SEALED</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#080c15" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">secrets in a public repo</text>

    <text x="104" y="218" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> git show apps/hello/hello-db.sealed.yaml</text>
    <text x="104" y="246" font-family="${mono}" font-size="14" fill="${dim}">kind: <tspan fill="${accent}">SealedSecret</tspan></text>
    <text x="104" y="270" font-family="${mono}" font-size="14" fill="${dim}">  password: <tspan fill="${good}">AgDbPa8GSoLADay0GI27Kd2ck...</tspan></text>

    <text x="104" y="322" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> k3s-uninstall.sh &amp;&amp; reinstall &amp;&amp; kubectl apply -f root.yaml</text>
    <g font-family="${mono}" font-size="14">
      <text x="104" y="354" fill="${dim}">NAME</text><text x="300" y="354" fill="${dim}">SYNC</text><text x="470" y="354" fill="${dim}">HEALTH</text>
      <text x="104" y="380" fill="${accent}">hello</text><text x="300" y="380" fill="${good}">Synced</text><text x="470" y="380" fill="${bad}">Degraded</text>
      <text x="104" y="404" fill="${accent}">root</text><text x="300" y="404" fill="${good}">Synced</text><text x="470" y="404" fill="${good}">Healthy</text>
    </g>
    <text x="104" y="436" font-family="${mono}" font-size="14" fill="${bad}">no key could decrypt secret (password)</text>
    <text x="104" y="460" font-family="${mono}" font-size="14" fill="${bad}">hello-7bb887b46b-8zfvz  CreateContainerConfigError<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="518" font-family="${mono}" font-size="17" fill="${dim}">synced means "matches git".</text>
    <text x="104" y="546" font-family="${mono}" font-size="17" fill="${dim}">it has never meant "works".</text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">ONE KEY, ONE FILE</text>
    <rect x="852" y="216" width="456" height="80" rx="8" fill="none" stroke="${warn}" stroke-width="2"/>
    <text x="876" y="248" font-size="14" fill="${warn}">kubectl get secret -n kube-system -l ...</text>
    <text x="876" y="274" font-size="14" fill="${dim}">7 KB. back it up before you seal anything.</text>

    <text x="852" y="340" font-size="20" letter-spacing="2" fill="${dim}">THE RESTORE</text>
    <rect x="852" y="360" width="456" height="86" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="392" font-size="14" fill="${good}">registered private key  x2</text>
    <text x="876" y="416" font-size="14" fill="${dim}">31 seconds. same pods. nothing recreated.</text>

    <text x="852" y="490" font-size="20" letter-spacing="2" fill="${dim}">ROTATE IN THIS ORDER</text>
    <rect x="852" y="510" width="456" height="86" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="542" font-size="14" fill="${accent}">re-encrypt, commit, then compromised</text>
    <text x="876" y="566" font-size="14" fill="${bad}">the other way round breaks every secret</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.sealed-secrets-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/sealed-secrets-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/sealed-secrets-hero.png');
