import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette: Ollama phosphor green + NVIDIA green accent
const bg = '#080b09';
const bright = '#4ade80';   // primary phosphor green
const accent = '#6ff09a';   // brightest
const dim = '#2c7d4c';      // secondary
const faint = '#1d4d33';    // borders / ghost
const nv = '#76b900';       // NVIDIA green

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0d130f"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#10271a" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost chevron, bottom-right -->
  <path d="M1180 470 L1300 560 L1180 650" fill="none" stroke="${faint}" stroke-width="10" opacity="0.55"/>

  <!-- badge top-right -->
  <g>
    <rect x="1064" y="48" width="248" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1090" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; OLLAMA &#183; <tspan fill="${nv}">GPU</tspan></text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0a100c" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">ubuntu 26.04 &#183; nvidia gpu</text>

    <text x="104" y="224" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo ubuntu-drivers install</text>
    <text x="104" y="256" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${nv}">&#10003;</tspan> nvidia-smi          <tspan fill="${dim}">driver OK</tspan></text>

    <text x="104" y="308" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo apt install nvidia-cuda-toolkit</text>
    <text x="104" y="340" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${nv}">&#10003;</tspan> nvcc                <tspan fill="${dim}">from ubuntu archive</tspan></text>

    <text x="104" y="392" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${accent}">$</tspan> curl -fsSL ollama.com/install.sh | sh</text>
    <text x="104" y="424" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${accent}">$</tspan> ollama run llama3.1:8b</text>
    <text x="104" y="460" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${dim}">&gt;</tspan> ollama ps &#8594; <tspan fill="${nv}">100% GPU</tspan><tspan fill="${accent}">&#9608;</tspan></text>

    <text x="104" y="524" font-family="${mono}" font-size="19" fill="${dim}">driver &#183; cuda &#183; ollama &#183; offload</text>
  </g>

  <!-- right column: the 26.04 gpu stack -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE 26.04 GPU STACK</text>

    <rect x="852" y="220" width="456" height="64" rx="8" fill="none" stroke="${nv}" stroke-width="2"/>
    <text x="876" y="259" font-size="19" fill="${accent}">NVIDIA driver  <tspan fill="${dim}">via apt</tspan></text>

    <text x="1080" y="312" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="328" width="456" height="64" rx="8" fill="none" stroke="${nv}" stroke-width="2"/>
    <text x="876" y="367" font-size="19" fill="${accent}">native CUDA  <tspan fill="${dim}">from ubuntu archive</tspan></text>

    <text x="1080" y="420" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="436" width="456" height="64" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="475" font-size="19" fill="${bright}"><tspan fill="${accent}">&#9635;</tspan> Ollama, on the GPU</text>

    <text x="852" y="546" font-size="18" fill="${dim}">no external nvidia repo &#183; first on 26.04</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ollama-nvidia-2604-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ollama-nvidia-2604-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ollama-nvidia-2604-hero.png');
