import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

// right column: the three layers of a grow, before and after
const layers = [
  { label: 'disk',       before: 20, after: 20, note: 'provider resized it' },
  { label: 'partition',  before: 10, after: 20, note: 'growpart /dev/sdc 1' },
  { label: 'filesystem', before: 10, after: 20, note: 'resize2fs /dev/sdc1' },
];
const bx = 852, bw = 440, top = 236, bh = 34, gap = 44;

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

  <!-- ghost disk platter bottom right -->
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none">
    <ellipse cx="1196" cy="590" rx="52" ry="18"/>
    <path d="M1144 590 v22 a52 18 0 0 0 104 0 v-22"/>
    <ellipse cx="1196" cy="590" rx="10" ry="4" fill="${ghost}"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="924" y="48" width="388" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="948" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; ADD A DISK</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">sdb is not a name, it is a guess</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> findmnt /mnt/data        <tspan fill="${dim}"># before reboot</tspan></text>
    <text x="104" y="240" font-family="${mono}" font-size="14" fill="${dim}">/mnt/data  <tspan fill="${accent}">/dev/sdb1</tspan>  ext4</text>
    <text x="104" y="270" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> findmnt /mnt/data        <tspan fill="${dim}"># after reboot</tspan></text>
    <text x="104" y="294" font-family="${mono}" font-size="14" fill="${dim}">/mnt/data  <tspan fill="${bad}">/dev/sdc1</tspan>  ext4   <tspan fill="${bad}">&#8592; moved</tspan></text>

    <text x="104" y="342" font-family="${mono}" font-size="14" fill="${dim}"># /etc/fstab</text>
    <text x="104" y="366" font-family="${mono}" font-size="14" fill="${bright}"><tspan fill="${good}">UUID=</tspan>e785e82e-…  /mnt/data  ext4  defaults,<tspan fill="${good}">nofail</tspan>  0  2</text>

    <text x="104" y="414" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo findmnt --verify</text>
    <text x="104" y="438" font-family="${mono}" font-size="14" fill="${good}">Success, no errors or warnings detected</text>

    <text x="104" y="486" font-family="${mono}" font-size="14" fill="${dim}"># without nofail + missing disk:</text>
    <text x="104" y="510" font-family="${mono}" font-size="14" fill="${bad}">Reached target emergency.target - Emergency Mode.</text>
    <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">UUID=, nofail, verify.<tspan fill="${bright}">&#9608;</tspan></text>
  </g>

  <!-- right column: grow it online, three layers -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">GROW IT ONLINE, IN ORDER</text>
    ${layers.map((l, i) => {
      const y = top + i * (bh + gap);
      const wb = Math.round((l.before / 20) * bw);
      return `<text x="852" y="${y - 6}" font-size="14" fill="${dim}">${l.label}   <tspan fill="${accent}">${l.note}</tspan></text>
    <rect x="${bx}" y="${y}" width="${bw}" height="${bh}" rx="5" fill="none" stroke="${grid}" stroke-width="1.5"/>
    <rect x="${bx}" y="${y}" width="${bw}" height="${bh}" rx="5" fill="${good}" opacity="0.35"/>
    <rect x="${bx}" y="${y}" width="${wb}" height="${bh}" rx="5" fill="${l.before === 20 ? good : dim}" opacity="0.85"/>
    <text x="${bx + wb - 12}" y="${y + 23}" font-size="14" text-anchor="end" fill="#0a0807" font-weight="700">${l.before} GB</text>
    <text x="${bx + bw - 12}" y="${y + 23}" font-size="14" text-anchor="end" fill="${l.before === 20 ? '#0a0807' : good}" font-weight="700">${l.before === 20 ? '' : '20 GB'}</text>`;
    }).join('\n    ')}
    <text x="852" y="${top + 3 * (bh + gap) + 6}" font-size="13" fill="${accent}">df does not move until the last one.</text>
    <text x="852" y="${top + 3 * (bh + gap) + 28}" font-size="13" fill="${dim}">under LVM: growpart, pvresize, lvextend -r.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.add-disk-2604-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/add-disk-2604-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/add-disk-2604-hero.png');
