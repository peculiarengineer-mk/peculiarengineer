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

  <!-- ghost magnifier bottom right -->
  <g opacity="0.5" stroke="${ghost}" stroke-width="6" fill="none" stroke-linecap="round">
    <circle cx="1188" cy="574" r="30"/>
    <path d="M1210 596 L1240 626"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="936" y="48" width="376" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="960" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; UBUNTU 26.04 &#183; JOURNALCTL</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">reading logs, from scratch</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> journalctl -I -u ssh -o short-iso</text>
    <text x="104" y="240" font-family="${mono}" font-size="13" fill="${dim}">2026-09-06T00:31:22+00:00 Starting ssh.service...</text>
    <text x="104" y="260" font-family="${mono}" font-size="13" fill="${good}">2026-09-06T00:31:22+00:00 Server listening on :: port 22.</text>

    <text x="104" y="308" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> journalctl -b -1 -n 2 -o cat</text>
    <text x="104" y="332" font-family="${mono}" font-size="13" fill="${dim}">Received SIGTERM from PID 1 (systemd-shutdow).</text>
    <text x="104" y="352" font-family="${mono}" font-size="13" fill="${dim}">Journal stopped</text>

    <text x="104" y="400" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> journalctl -u flood2 -o cat | wc -l</text>
    <text x="104" y="424" font-family="${mono}" font-size="13" fill="${bad}">22500      # of 50000. no notice.</text>

    <text x="104" y="472" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> journalctl --list-boots</text>
    <text x="104" y="496" font-family="${mono}" font-size="13" fill="${bad}">  0 ab1a338a...   # -1 vanished after vacuum</text>

    <text x="104" y="540" font-family="${mono}" font-size="16" fill="${dim}">a database that prints like a log.<tspan fill="${bright}">&#9608;</tspan></text>
  </g>

  <!-- right column -->
  <g font-family="${mono}">
    <text x="852" y="196" font-size="20" letter-spacing="2" fill="${dim}">THE FIVE FILTERS</text>
    <rect x="852" y="216" width="456" height="86" rx="8" fill="none" stroke="${dim}" stroke-width="2" stroke-dasharray="7 5"/>
    <text x="876" y="248" font-size="14" fill="${accent}">-u unit  -t tag  -p err</text>
    <text x="876" y="274" font-size="14" fill="${accent}">--since "1 hour ago"  -b / -b -1</text>

    <text x="852" y="346" font-size="20" letter-spacing="2" fill="${dim}">SYSTEMD 259 ON 26.04</text>
    <rect x="852" y="366" width="456" height="86" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="398" font-size="14" fill="${good}">-I  &#183;  --invocation=-1  &#183;  --list-invocations</text>
    <text x="876" y="424" font-size="14" fill="${dim}">only the current run of a service</text>

    <text x="852" y="496" font-size="20" letter-spacing="2" fill="${dim}">FOLKLORE, TESTED</text>
    <rect x="852" y="516" width="456" height="70" rx="8" fill="none" stroke="${bad}" stroke-width="2"/>
    <text x="876" y="548" font-size="13" fill="${accent}">SystemMaxUse= + restart: 312M &#8594; 24M</text>
    <text x="876" y="570" font-size="13" fill="${dim}">no vacuum needed. vacuum deletes boots.</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.journalctl-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/journalctl-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/journalctl-hero.png');
