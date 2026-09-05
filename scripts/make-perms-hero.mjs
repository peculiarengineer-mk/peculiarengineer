import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

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

  <!-- ghost folder bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linejoin="round">
    <path d="M1150 560 h34 l12 -14 h48 v70 h-94 z"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="928" y="48" width="384" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="952" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; PERMISSIONS</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">who owns this file, and why</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> docker run -v /srv/app:/data img</text>
    <text x="104" y="244" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> ls -ln /srv/app</text>
    <text x="104" y="268" font-family="${mono}" font-size="14" fill="${dim}">-rw-r--r-- 1 <tspan fill="${bad}">5555 5555</tspan> from-app</text>
    <text x="104" y="298" font-family="${mono}" font-size="13" fill="${bad}"># a user that isn't on the host</text>

    <text x="104" y="352" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> chmod -R 644 tree/</text>
    <text x="104" y="376" font-family="${mono}" font-size="14" fill="${dim}"><tspan fill="${bad}">drw-r--r--</tspan> tree   # lost the x</text>

    <text x="104" y="428" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> setfacl -m u:5555:rwx /srv/app</text>
    <text x="104" y="452" font-family="${mono}" font-size="14" fill="${good}">-rw-rw----+ dave 5555   # both in</text>

    <text x="104" y="536" font-family="${mono}" font-size="16" fill="${dim}">deleting is a directory right.<tspan fill="${bright}">&#9608;</tspan></text>
  </g>

  <!-- right column: the model -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">THE PART GUIDES SKIP</text>
    <rect x="852" y="216" width="456" height="110" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="14" fill="${accent}">x on a dir = may enter it</text>
    <text x="876" y="274" font-size="14" fill="${accent}">write on a dir = may delete in it</text>
    <text x="876" y="300" font-size="14" fill="${dim}">not the file. the directory.</text>

    <text x="852" y="372" font-size="20" letter-spacing="2" fill="${dim}">SHARED DIRECTORY</text>
    <rect x="852" y="392" width="456" height="72" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="424" font-size="13" fill="${good}">chmod 2775 + setfacl -d</text>
    <text x="876" y="446" font-size="13" fill="${dim}">setgid for the group, ACL for the mode</text>

    <text x="852" y="508" font-size="20" letter-spacing="2" fill="${dim}">uutils chmod</text>
    <rect x="852" y="528" width="456" height="58" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="560" font-size="13" fill="${accent}">invalid digit found in string</text>
    <text x="876" y="578" font-size="12" fill="${dim}">Rust error text, same behavior</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.perms-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/perms-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/perms-hero.png');
