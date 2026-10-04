import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b', good = '#4fbf87', bad = '#f2837a';
const badge = 'SONARR + RADARR · UBUNTU 26.10'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'root folder',     u: 'not writable',    f: 'media group' },
  { k: 'import',          u: 'access denied',   f: 'UMask=0002' },
  { k: 'radarr script',   u: 'stops at [Y/n]',  f: 'press Enter' },
  { k: 'categories',      u: 'into library',    f: 'downloads/complete' },
  { k: 'ports 8989 7878', u: 'internet',        f: 'LAN + tailnet' },
];
const term = [
  ['$','sudo bash install-sonarr.sh','bright'],
  ['','Folder \'/srv/media/tv\' is not writable by user \'sonarr\'','bad'],
  ['$','sudo chgrp -R media /srv/media','bright'],
  ['$','sudo find /srv/media -type d -exec chmod g+s {} +','bright'],
  ['','System.UnauthorizedAccessException: Access to the path','bad'],
  ['',"  '/srv/media/downloads/complete/tv/...' is denied.",'bad'],
  ['$',"printf '[Service]\\nUMask=0002\\n' | sudo tee ...",'bright'],
  ['$','sudo chmod -R g+w /srv/media/downloads/complete','bright'],
  ['$','ls /srv/media/tv/Bonanza','bright'],
  ['','Season 1','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><rect x="1165" y="535" width="80" height="80" rx="6"/><path d="M1180 535v-14M1205 535v-14M1230 535v-14M1180 615v14M1205 615v14M1230 615v14M1165 550h-14M1165 575h-14M1165 600h-14M1245 550h14M1245 575h14M1245 600h14"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="700" height="462" rx="11" fill="#0e0b09" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">sonarr + radarr, no docker.</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*26}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${l[0]?`<tspan fill="${accent}">$</tspan> `:''}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">one group, one umask.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">WORTH KNOWING</text>
  <text x="1030" y="232" font-size="13" fill="${dim}">cause</text><text x="1160" y="232" font-size="13" fill="${dim}">fix</text>
  ${rows.map((r,i)=>{const y=262+i*44;return `<line x1="852" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="852" y="${y}" font-size="13" fill="${dim}">${esc(r.k)}</text><text x="1030" y="${y}" font-size="13" fill="${bright}">${esc(r.u)}</text><text x="1160" y="${y}" font-size="12" fill="${good}">${esc(r.f)}</text>`;}).join('\n  ')}
  <text x="852" y="${262+5*44+8}" font-size="13" fill="${accent}">sonarr :8989   radarr :7878</text></g>
</svg>`;
writeFileSync(new URL('../src/assets/.arr-2610-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/arr-2610-hero.png', import.meta.url).pathname);
console.log('wrote hero');
