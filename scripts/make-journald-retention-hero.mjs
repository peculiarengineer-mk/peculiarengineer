import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b';
const good = '#4fbf87', bad = '#f2837a';

const badge = 'UBUNTU 26.04 · JOURNALD';
const bw = (badge.length + 2) * 13.2 + 52;

// right column: where 400 MB of log lines went
const bars = [
  { label: 'journal, zstd',            mb: 304, color: bright, note: '304 MB' },
  { label: '/var/log/syslog copy',     mb: 78,  color: dim,    note: '78 MB, lines cut at 8 KB' },
  { label: 'after SystemMaxUse=100M',  mb: 100, color: bad,    note: '100 MB, 0 of 10,000 left' },
];
const bx = 852, barw = 440, top = 236, bh = 34, gap = 46, maxMb = 320;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none" stroke-linejoin="round">
    <rect x="1150" y="556" width="80" height="60" rx="4"/><path d="M1162 574 h56 M1162 590 h56 M1162 606 h36"/>
  </g>
  <g>
    <rect x="${1312 - bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="${1312 - bw + 24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${badge}</text>
  </g>
  <g>
    <rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">the ceiling is computed once</text>

    <text x="104" y="216" font-family="${mono}" font-size="15" fill="${bright}"><tspan fill="${accent}">$</tspan> journalctl -b -u systemd-journald | grep 'System Journal'</text>
    <text x="104" y="242" font-family="${mono}" font-size="13" fill="${bad}">13:42:33  System Journal is 8M, max 182.2M   # first boot</text>
    <text x="104" y="264" font-family="${mono}" font-size="13" fill="${dim}">13:42:40  EXT4-fs: resizing filesystem 1.9G -> 38G</text>
    <text x="104" y="286" font-family="${mono}" font-size="13" fill="${good}">13:44:51  System Journal is 8M, max 3.7G     # after restart</text>

    <text x="104" y="334" font-family="${mono}" font-size="14" fill="${dim}"># /etc/systemd/journald.conf.d/zz-retention.conf</text>
    <text x="104" y="358" font-family="${mono}" font-size="14" fill="${accent}">[Journal]</text>
    <text x="104" y="382" font-family="${mono}" font-size="14" fill="${bright}">SystemMaxUse=<tspan fill="${accent}">1G</tspan></text>
    <text x="104" y="406" font-family="${mono}" font-size="14" fill="${bright}">MaxRetentionSec=<tspan fill="${accent}">1month</tspan>   <tspan fill="${dim}"># deletes whole files</tspan></text>
    <text x="104" y="430" font-family="${mono}" font-size="14" fill="${bright}">MaxFileSec=<tspan fill="${accent}">1week</tspan>        <tspan fill="${dim}"># so 'a month' means a month</tspan></text>
    <text x="104" y="454" font-family="${mono}" font-size="14" fill="${bright}">ForwardToSyslog=<tspan fill="${accent}">no</tspan>     <tspan fill="${dim}"># only works past syslog.conf</tspan></text>

    <text x="104" y="502" font-family="${mono}" font-size="14" fill="${dim}">zz- because drop-ins apply in filename order.</text>
    <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">restart, then read the line back.<tspan fill="${bright}">&#9608;</tspan></text>
  </g>
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHERE 400 MB OF LOGS WENT</text>
    ${bars.map((b, i) => { const y = top + i * (bh + gap); const w = Math.round((b.mb / maxMb) * barw);
      return `<text x="852" y="${y - 6}" font-size="14" fill="${dim}">${b.label}</text>
    <text x="${bx + barw}" y="${y - 6}" font-size="13" text-anchor="end" fill="${b.color}">${b.note}</text>
    <rect x="${bx}" y="${y}" width="${barw}" height="${bh}" rx="5" fill="none" stroke="${grid}" stroke-width="1.5"/>
    <rect x="${bx}" y="${y}" width="${w}" height="${bh}" rx="5" fill="${b.color}" opacity="0.85"/>`; }).join('\n    ')}
    <text x="852" y="${top + 3 * (bh + gap) + 4}" font-size="13" fill="${accent}">the previous boot went with the cap.</text>
    <text x="852" y="${top + 3 * (bh + gap) + 26}" font-size="13" fill="${dim}">MaxRetentionSec=120s deleted an archive 1 s old.</text>
  </g>
</svg>`;
writeFileSync(new URL('../src/assets/.journald-retention-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W * 2, H * 2).png()
  .toFile(new URL('../src/assets/journald-retention-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/journald-retention-hero.png');
