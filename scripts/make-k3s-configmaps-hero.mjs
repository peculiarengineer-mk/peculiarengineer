import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// slate blue palette (matches the Part One k3s hero)
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

  <!-- big ghost key, bottom-right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="9" fill="none">
    <circle cx="1168" cy="548" r="40"/>
    <circle cx="1168" cy="548" r="14"/>
    <line x1="1208" y1="548" x2="1332" y2="548"/>
    <line x1="1300" y1="548" x2="1300" y2="578"/>
    <line x1="1328" y1="548" x2="1328" y2="570"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1080" y="48" width="232" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1106" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; K3S &#183; CONFIG</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">homelab01 &#183; config out of the image</text>

    <text x="104" y="220" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl apply -f config-and-secret.yaml</text>
    <text x="104" y="248" font-family="${mono}" font-size="16" fill="${good}"><tspan fill="${good}">&#10003;</tspan> configmap/web-config created</text>
    <text x="104" y="274" font-family="${mono}" font-size="16" fill="${good}"><tspan fill="${good}">&#10003;</tspan> secret/web-secret created</text>

    <text x="104" y="336" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> kubectl get secret web-secret -o yaml</text>
    <text x="104" y="362" font-family="${mono}" font-size="15" fill="${accent}">  API_KEY: c2stZGVtby0xMjM0NTY3ODkw</text>
    <text x="104" y="388" font-family="${mono}" font-size="15" fill="${bad}">  &#8592; base64, <tspan fill="${bad}">not</tspan> encrypted</text>

    <text x="104" y="440" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> ... | base64 -d  &#8594;  <tspan fill="${good}">sk-demo-1234567890</tspan></text>

    <text x="104" y="500" font-family="${mono}" font-size="18" fill="${dim}">the image says what the app is.</text>
    <text x="104" y="528" font-family="${mono}" font-size="18" fill="${dim}">config says how it is configured.</text>
  </g>

  <!-- right column: the separation -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">THE SEPARATION</text>

    <rect x="852" y="216" width="456" height="58" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="252" font-size="19" fill="${accent}"><tspan fill="${dim}">image</tspan>  &#183;  what the app IS</text>

    <text x="1080" y="302" font-size="22" fill="${dim}" text-anchor="middle">+</text>

    <rect x="852" y="316" width="456" height="82" rx="8" fill="none" stroke="${k8s}" stroke-width="2"/>
    <text x="876" y="350" font-size="18" fill="${accent}"><tspan fill="${k8s}">ConfigMap</tspan> &#8594; env vars + a mounted file</text>
    <text x="876" y="380" font-size="18" fill="${accent}"><tspan fill="${k8s}">Secret</tspan> &#8594; base64, handled with care</text>

    <text x="1080" y="428" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="442" width="456" height="58" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="478" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> same image, now it is your app</text>

    <text x="852" y="548" font-size="18" fill="${dim}">change a value, roll out, no rebuild</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.k3s-configmaps-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/k3s-configmaps-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/k3s-configmaps-hero.png');
