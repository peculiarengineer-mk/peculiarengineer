import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// warm amber on charcoal, the Ubuntu hub family
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a', rust = '#d9743f';

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

  <!-- ghost gear/shield bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1150 552 l40 -14 l40 14 v40 q0 34 -40 52 q-40 -18 -40 -52 z"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="936" y="48" width="376" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="960" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; SUDO-RS</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">the sudo you know, rewritten</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> readlink -f /usr/bin/sudo</text>
    <text x="104" y="240" font-family="${mono}" font-size="15" fill="${rust}">/usr/lib/cargo/bin/sudo</text>

    <text x="104" y="292" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo id</text>
    <text x="104" y="316" font-family="${mono}" font-size="14" fill="${dim}">[sudo: authenticate] Password:</text>

    <text x="104" y="366" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> sudo -u bob whoami</text>
    <text x="104" y="390" font-family="${mono}" font-size="13" fill="${bad}">sudo: I'm sorry bob.</text>
    <text x="104" y="410" font-family="${mono}" font-size="13" fill="${bad}">I'm afraid I can't do that</text>

    <text x="104" y="462" font-family="${mono}" font-size="14" fill="${dim}"># Defaults logfile=... </text>
    <text x="104" y="486" font-family="${mono}" font-size="13" fill="${bad}">unknown setting: 'logfile'</text>

    <text x="104" y="538" font-family="${mono}" font-size="16" fill="${dim}">reads /etc/sudoers. drops a few lines.<tspan fill="${bright}">&#9608;</tspan></text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">SILENTLY DROPPED</text>
    <rect x="852" y="216" width="456" height="86" rx="8" fill="none" stroke="${bad}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="14" fill="${accent}">logfile &#183; requiretty &#183; !authenticate</text>
    <text x="876" y="274" font-size="14" fill="${dim}">digests &#183; log_output &#183; full -E</text>

    <text x="852" y="346" font-size="20" letter-spacing="2" fill="${dim}">STILL WORKS</text>
    <rect x="852" y="366" width="456" height="86" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="398" font-size="14" fill="${good}">NOPASSWD &#183; env_keep &#183; :user @host</text>
    <text x="876" y="424" font-size="14" fill="${dim}">the per-scope Defaults all resolve</text>

    <text x="852" y="496" font-size="20" letter-spacing="2" fill="${dim}">THE ESCAPE HATCH</text>
    <rect x="852" y="516" width="456" height="70" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="548" font-size="13" fill="${accent}">update-alternatives --set sudo</text>
    <text x="876" y="570" font-size="13" fill="${dim}">/usr/bin/sudo.ws  &#8594; GNU sudo back</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.sudo-rs-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/sudo-rs-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/sudo-rs-hero.png');
