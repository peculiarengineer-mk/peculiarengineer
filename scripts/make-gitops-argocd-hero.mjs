import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// slate blue palette (matches the Part One and Part Two k3s heroes)
const bg0 = '#11151d', bg1 = '#0b0d12', grid = '#12161f', ghost = '#182236';
const dim = '#3d5273', bright = '#f0883e', accent = '#ffb37a';
const good = '#6fd08a', bad = '#e5534b', k8s = '#4d8bf0';

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

  <!-- big ghost reconcile loop, bottom-right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="9" fill="none" stroke-linecap="round">
    <path d="M1128 612 A40 40 0 0 1 1208 612"/>
    <polyline points="1194 598 1208 613 1222 598"/>
    <path d="M1208 612 A40 40 0 0 1 1128 612"/>
    <polyline points="1142 626 1128 611 1114 626"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1080" y="48" width="232" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1106" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; K3S &#183; GITOPS</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">homelab01 &#183; git drives the cluster</text>

    <text x="104" y="220" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl scale deploy hello --replicas=5</text>
    <text x="104" y="248" font-family="${mono}" font-size="16" fill="${good}"><tspan fill="${good}">&#10003;</tspan> deployment.apps/hello scaled</text>

    <text x="104" y="310" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl get deploy hello -w</text>
    <text x="104" y="336" font-family="${mono}" font-size="15" fill="${accent}">  hello   5/5   <tspan fill="${bad}">OutOfSync</tspan></text>
    <text x="104" y="362" font-family="${mono}" font-size="15" fill="${accent}">  hello   2/2   <tspan fill="${good}">Synced</tspan>  <tspan fill="${dim}">&#8592; 12s later</tspan></text>

    <text x="104" y="424" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> git revert --no-edit HEAD &amp;&amp; git push</text>
    <text x="104" y="450" font-family="${mono}" font-size="16" fill="${good}"><tspan fill="${good}">&#10003;</tspan> rolled back, no kubectl involved</text>

    <text x="104" y="510" font-family="${mono}" font-size="18" fill="${dim}">you stop applying YAML at a cluster.</text>
    <text x="104" y="538" font-family="${mono}" font-size="18" fill="${dim}">you push a commit and walk away.</text>
  </g>

  <!-- right column: the loop -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">THE LOOP</text>

    <rect x="852" y="216" width="456" height="58" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="252" font-size="19" fill="${accent}"><tspan fill="${dim}">git repo</tspan>  &#183;  the declared state</text>

    <text x="1080" y="302" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="316" width="456" height="82" rx="8" fill="none" stroke="${k8s}" stroke-width="2"/>
    <text x="876" y="350" font-size="18" fill="${accent}"><tspan fill="${k8s}">Argo CD</tspan> &#8594; watches the repo, syncs</text>
    <text x="876" y="380" font-size="18" fill="${accent}"><tspan fill="${k8s}">selfHeal</tspan> &#8594; undoes your hand edits</text>

    <text x="1080" y="428" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="442" width="456" height="58" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="478" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> cluster &#183; the observed state</text>

    <text x="852" y="548" font-size="18" fill="${dim}">Synced means matches Git, not works</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.gitops-argocd-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/gitops-argocd-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/gitops-argocd-hero.png');
