import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// palette (build amber)
const bg = '#100b06';
const bright = '#fbbf24';   // primary amber
const accent = '#fde68a';   // brightest highlight
const dim = '#a16207';      // secondary
const faint = '#7a5410';    // borders / ghost
const good = '#6fd08a';     // ok / success green
const bad = '#e06a5a';      // error red

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#1a1209"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#211708" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost gear, bottom-right -->
  <g opacity="0.5" stroke="${faint}" stroke-width="9" fill="none">
    <circle cx="1240" cy="540" r="78"/>
    <circle cx="1240" cy="540" r="30"/>
    <path d="M1240 440 L1240 470 M1240 610 L1240 640 M1140 540 L1170 540 M1310 540 L1340 540 M1169 469 L1190 490 M1290 590 L1311 611 M1311 469 L1290 490 M1190 590 L1169 611"/>
  </g>

  <!-- badge top-right -->
  <g>
    <rect x="1060" y="48" width="252" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1086" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; PYTHON &#183; REBUILD</text>
  </g>

  <!-- terminal window -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#140d06" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">python &#183; import pandas</text>

    <text x="104" y="222" font-family="${mono}" font-size="19" fill="${bad}">ModuleNotFoundError: No module</text>
    <text x="104" y="248" font-family="${mono}" font-size="19" fill="${bad}">named '_ctypes'</text>

    <text x="104" y="312" font-family="${mono}" font-size="18" fill="${bright}"><tspan fill="${accent}">$</tspan> ./configure --prefix=$HOME/.local</text>
    <text x="104" y="338" font-family="${mono}" font-size="18" fill="${bright}">  --with-system-ffi</text>
    <text x="104" y="376" font-family="${mono}" font-size="19" fill="${bright}"><tspan fill="${accent}">$</tspan> make &amp;&amp; make install</text>

    <text x="104" y="440" font-family="${mono}" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> import _ctypes, ssl  &#10003; ok</text>

    <text x="104" y="522" font-family="${mono}" font-size="19" fill="${dim}">error &#183; reconfigure &#183; rebuild &#183; verify</text>
  </g>

  <!-- right column: the causal chain -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE CAUSAL CHAIN</text>

    <rect x="852" y="220" width="456" height="64" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="259" font-size="20" fill="${accent}">libffi-devel missing at build</text>

    <text x="1080" y="312" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="328" width="456" height="64" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="367" font-size="20" fill="${bright}">_ctypes.so never compiled</text>

    <text x="1080" y="420" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="436" width="456" height="64" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="475" font-size="20" fill="${bad}">pandas import dies</text>

    <rect x="852" y="520" width="456" height="48" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="551" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> rebuild with --with-system-ffi</text>

    <text x="852" y="608" font-size="18" fill="${dim}">the headers have to be there at compile</text>
    <text x="852" y="632" font-size="18" fill="${dim}">time, not after.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.ctypes-rebuild-hero.svg', import.meta.url), svg);

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/ctypes-rebuild-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/ctypes-rebuild-hero.png');
