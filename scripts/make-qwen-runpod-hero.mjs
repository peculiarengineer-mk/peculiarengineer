import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// violet palette (RunPod / Qwen)
const bg0 = '#141020', bg1 = '#0a0812', grid = '#191428', ghost = '#251d3e';
const dim = '#6553a0', bright = '#a78bfa', accent = '#c9b6ff';
const good = '#6fd08a', bad = '#e5534b';

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

  <!-- big ghost GPU die, bottom-right -->
  <g opacity="0.55" stroke="${ghost}" stroke-width="8" fill="none" stroke-linecap="round">
    <rect x="1136" y="550" width="104" height="80" rx="10"/>
    <rect x="1166" y="580" width="44" height="20" rx="4"/>
    <path d="M1156 550 V534 M1188 550 V534 M1220 550 V534"/>
    <path d="M1156 630 V646 M1188 630 V646 M1220 630 V646"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1074" y="48" width="238" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1100" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; RUNPOD &#183; vLLM</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0f0b1a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">one rented L40S &#183; 48 GB</text>

    <text x="104" y="220" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> vllm serve Qwen/Qwen3.6-27B-FP8 \\</text>
    <text x="104" y="246" font-family="${mono}" font-size="16" fill="${bright}">    --max-model-len 131072 --max-num-seqs 8</text>

    <text x="104" y="304" font-family="${mono}" font-size="16" fill="${good}"><tspan fill="${good}">&#10003;</tspan> Application startup complete</text>
    <text x="104" y="330" font-family="${mono}" font-size="15" fill="${accent}">  Uvicorn running on <tspan fill="${bright}">http://0.0.0.0:8000</tspan></text>

    <text x="104" y="388" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">$</tspan> curl &#8230;/v1/chat/completions</text>
    <text x="104" y="414" font-family="${mono}" font-size="15" fill="${accent}"><tspan fill="${dim}">&gt;</tspan> 27B dense &#183; Apache 2.0 &#183; 128K ctx<tspan fill="${bright}">&#9608;</tspan></text>

    <text x="104" y="486" font-family="${mono}" font-size="18" fill="${dim}">the question isn&#8217;t how much GPU you</text>
    <text x="104" y="514" font-family="${mono}" font-size="18" fill="${dim}">can rent. it&#8217;s how little you need.</text>
  </g>

  <!-- right column: the trade -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">THE TRADE</text>

    <rect x="852" y="216" width="456" height="82" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="250" font-size="18" fill="${dim}">Kimi K2.7 Code &#183; 1T params</text>
    <text x="876" y="280" font-size="18" fill="${dim}">8x H200 &#183; 595 GB &#183; <tspan fill="${bad}">~$37/hr</tspan></text>

    <text x="1080" y="330" font-size="20" fill="${dim}" text-anchor="middle">vs</text>

    <rect x="852" y="346" width="456" height="82" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="380" font-size="18" fill="${accent}">Qwen3.6-27B &#183; FP8</text>
    <text x="876" y="410" font-size="18" fill="${accent}">1x L40S &#183; 31 GB &#183; <tspan fill="${good}">$0.99/hr</tspan></text>

    <rect x="852" y="452" width="456" height="64" rx="8" fill="none" stroke="${ghost}" stroke-width="2"/>
    <text x="876" y="491" font-size="17" fill="${bright}"><tspan fill="${accent}">77.2%</tspan> SWE-bench <tspan fill="${dim}">vs 76.2% for a 397B</tspan></text>

    <text x="852" y="562" font-size="17" fill="${dim}">&#8594; 128K is the ceiling on 48 GB, not 262K</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.qwen-runpod-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/self-host-qwen-runpod-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/self-host-qwen-runpod-hero.png');
