import sharp from 'sharp';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#12101a', bg1 = '#08070c', grid = '#1f1b2b', ghost = '#342c4a';
const dim = '#9189a8', bright = '#f4a259', accent = '#62c7f0', good = '#4fbf87', bad = '#f2837a';
const badge = 'RCLONE 1.76 · CLOUDFLARE R2 · UBUNTU 26.04'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'lsf r2:', v: 'denied', c: bad },
  { k: 'lsf r2:bucket/', v: 'works', c: good },
  { k: 'copy (no flag)', v: 'denied', c: bad },
  { k: 'copy + no_check', v: 'works', c: good },
];
const term = [
  ['$','rclone copy a.txt r2:my-bucket/','bright'],
  ['','CreateBucket ... AccessDenied','bad'],
  ['$','rclone config update r2 no_check_bucket true','bright'],
  ['$','rclone copy a.txt r2:my-bucket/ -v','bright'],
  ['','a.txt: Copied (new)','good'],
  ['','','dim'],
  ['#',"ubuntu's rclone 1.60.1:",'dim'],
  ['','NotImplemented: Not Implemented','bad'],
  ['','Attempt 2/3 succeeded','dim'],
  ['#','rclone 1.76.0 from the .deb:','dim'],
  ['','Copied (new), no errors','good'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const pre = l => l[0]==='$' ? `<tspan fill="${accent}">$</tspan> ` : l[0]==='#' ? `<tspan fill="${dim}">#</tspan> ` : '';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><ellipse cx="1200" cy="560" rx="60" ry="18"/><path d="M1140 560v50c0 10 27 18 60 18s60-8 60-18v-50"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="720" height="462" rx="11" fill="#0c0a12" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="792" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">one bucket, one token</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*27}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${pre(l)}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="552" font-family="${mono}" font-size="16" fill="${dim}">scope the token, name the bucket.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="850" y="200" font-size="20" letter-spacing="2" fill="${dim}">OBJECT READ &amp; WRITE TOKEN</text>
  ${rows.map((r,i)=>{const y=252+i*44;return `<line x1="850" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="850" y="${y}" font-size="15" fill="${bright}">${esc(r.k)}</text><text x="1180" y="${y}" font-size="15" fill="${r.c}">${r.v}</text>`;}).join('\n  ')}
  <text x="850" y="${252+4*44+10}" font-size="13" fill="${accent}">sync --dry-run before every sync.</text>
  <text x="850" y="${252+4*44+34}" font-size="13" fill="${accent}">links max out at one week.</text></g>
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/rclone-r2-hero.png', import.meta.url).pathname);
console.log('wrote hero');
