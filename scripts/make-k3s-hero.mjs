import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (slate blue — matches ufw / netplan / ssh family)
const bg0 = '#11151d';
const bg1 = '#0b0d12';
const grid = '#12161f';
const ghost = '#182236';
const dim = '#3d5273';      // slate secondary / labels
const bright = '#f0883e';   // primary amber (prompts, borders)
const accent = '#ffb37a';   // brightest highlight
const good = '#6fd08a';     // ok / healed green
const bad = '#e5534b';      // dead / error red
const k8s = '#4d8bf0';      // kubernetes blue

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

  <!-- big ghost helm (k8s wheel), bottom-right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="8" fill="none" transform="translate(1240 540)">
    <circle r="86"/>
    <circle r="30"/>
    <g>
      <line x1="0" y1="-30" x2="0" y2="-86"/>
      <line x1="0" y1="-30" x2="0" y2="-86" transform="rotate(51.43)"/>
      <line x1="0" y1="-30" x2="0" y2="-86" transform="rotate(102.86)"/>
      <line x1="0" y1="-30" x2="0" y2="-86" transform="rotate(154.29)"/>
      <line x1="0" y1="-30" x2="0" y2="-86" transform="rotate(205.71)"/>
      <line x1="0" y1="-30" x2="0" y2="-86" transform="rotate(257.14)"/>
      <line x1="0" y1="-30" x2="0" y2="-86" transform="rotate(308.57)"/>
    </g>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1064" y="48" width="248" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1090" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; K3S &#183; KUBECTL</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">homelab01 &#183; the reconciliation loop</text>

    <text x="104" y="222" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl apply -f nginx-deployment.yaml</text>
    <text x="104" y="250" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> deployment.apps/web created</text>

    <text x="104" y="312" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl delete pod web-595d5fcfb-472tz</text>
    <text x="104" y="340" font-family="${mono}" font-size="17" fill="${bad}"><tspan fill="${bad}">&#10007;</tspan> pod "web-595d..." deleted</text>

    <text x="104" y="402" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl get pods</text>
    <text x="104" y="430" font-family="${mono}" font-size="17" fill="${good}">web-9x2kf  <tspan fill="${good}">Running</tspan>  14s  <tspan fill="${dim}">&#8592; already back</tspan></text>

    <text x="104" y="500" font-family="${mono}" font-size="18" fill="${dim}">you never started that Pod. the cluster did,</text>
    <text x="104" y="530" font-family="${mono}" font-size="18" fill="${dim}">because you said you wanted three.</text>
  </g>

  <!-- right column: the loop -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE WHOLE PRODUCT</text>

    <rect x="852" y="220" width="456" height="60" rx="8" fill="none" stroke="${k8s}" stroke-width="2"/>
    <text x="876" y="257" font-size="20" fill="${accent}"><tspan fill="${k8s}">desired</tspan>  &#183;  3 replicas of web</text>

    <text x="1080" y="308" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="324" width="456" height="60" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="361" font-size="20" fill="${accent}"><tspan fill="${bad}">actual</tspan>   &#183;  2 running, one died</text>

    <text x="1080" y="412" font-size="18" fill="${dim}" text-anchor="middle">reconcile</text>

    <rect x="852" y="428" width="456" height="60" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="465" font-size="20" fill="${accent}"><tspan fill="${good}">&#10003;</tspan> controller starts one more</text>

    <!-- loop-back arrow -->
    <path d="M852 458 C812 458 812 250 852 250" fill="none" stroke="${dim}" stroke-width="2"/>
    <path d="M852 250 l-9 -6 v12 z" fill="${dim}"/>

    <text x="852" y="540" font-size="18" fill="${dim}">declare the state you want.</text>
    <text x="852" y="566" font-size="18" fill="${dim}">Kubernetes makes reality match it, forever.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.k3s-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/k3s-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/k3s-hero.png');
