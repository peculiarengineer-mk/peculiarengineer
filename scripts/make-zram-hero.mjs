import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

// three bars: no swap, zram (text), zram (random) — GB reached before OOM
const bars = [
  { label: 'no swap', gb: 3.4, w: 3.4, color: dim },
  { label: 'zram · text', gb: 4.4, w: 4.4, color: good },
  { label: 'zram · random', gb: 3.3, w: 3.3, color: bad },
];
const bx = 876, bw = 400, top = 236, bh = 40, gap = 26, maxGb = 5.2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="32%" r="82%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost RAM chip bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linejoin="round">
    <rect x="1150" y="556" width="92" height="52" rx="4"/>
    <path d="M1166 556 v-10 M1188 556 v-10 M1210 556 v-10"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="964" y="48" width="348" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="988" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; ZRAM</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">a cloud box ships with none</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> free -h</text>
    <text x="104" y="240" font-family="${mono}" font-size="14" fill="${dim}">Mem:   3.7Gi</text>
    <text x="104" y="264" font-family="${mono}" font-size="14" fill="${bad}">Swap:     0B      &#8592; nothing</text>

    <text x="104" y="316" font-family="${mono}" font-size="14" fill="${dim}"># /etc/systemd/zram-generator.conf</text>
    <text x="104" y="340" font-family="${mono}" font-size="14" fill="${accent}">[zram0]</text>
    <text x="104" y="364" font-family="${mono}" font-size="14" fill="${bright}">zram-size = <tspan fill="${accent}">ram / 2</tspan></text>
    <text x="104" y="388" font-family="${mono}" font-size="14" fill="${bright}">compression-algorithm = <tspan fill="${good}">zstd</tspan></text>
    <text x="104" y="412" font-family="${mono}" font-size="14" fill="${bright}">swap-priority = <tspan fill="${accent}">100</tspan></text>

    <text x="104" y="464" font-family="${mono}" font-size="14" fill="${bright}"># /etc/sysctl.d/99-zram.conf</text>
    <text x="104" y="488" font-family="${mono}" font-size="14" fill="${bright}">vm.swappiness = <tspan fill="${accent}">180</tspan>  <tspan fill="${dim}"># not a typo</tspan></text>

    <text x="104" y="540" font-family="${mono}" font-size="16" fill="${dim}">compressible pages only.<tspan fill="${bright}">&#9608;</tspan></text>
  </g>

  <!-- right column: bar chart, GB reached before OOM -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">GB REACHED BEFORE OOM</text>
    ${bars.map((b, i) => {
      const y = top + i * (bh + gap);
      const wpx = Math.round((b.w / maxGb) * bw);
      return `<text x="852" y="${y - 6}" font-size="14" fill="${dim}">${b.label}</text>
    <rect x="${bx}" y="${y}" width="${bw}" height="${bh}" rx="5" fill="none" stroke="${grid}" stroke-width="1.5"/>
    <rect x="${bx}" y="${y}" width="${wpx}" height="${bh}" rx="5" fill="${b.color}" opacity="0.85"/>
    <text x="${bx + wpx - 12}" y="${y + 27}" font-size="15" text-anchor="end" fill="#0a0807" font-weight="700">${b.gb} GB</text>`;
    }).join('\n    ')}
    <text x="852" y="${top + 3 * (bh + gap) + 22}" font-size="13" fill="${accent}">same 1.9 GB zram. only the data changed.</text>
    <text x="852" y="${top + 3 * (bh + gap) + 44}" font-size="13" fill="${dim}">random memory does worse than no swap.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.zram-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/zram-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/zram-hero.png');
