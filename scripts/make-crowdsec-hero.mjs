import sharp from 'sharp';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#12101a', bg1 = '#08070c', grid = '#1f1b2b', ghost = '#342c4a';
const dim = '#9189a8', bright = '#b48cf0', accent = '#62c7f0', good = '#4fbf87', bad = '#f2837a';
const badge = 'CROWDSEC 1.8.2 · NGINX BOUNCER · UBUNTU 26.04'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'acts in', a: 'nftables', b: 'nginx (lua)' },
  { k: 'banned IP', a: 'timeout', b: '403' },
  { k: 'covers', a: 'every port', b: 'http only' },
  { k: 'new bans', a: 'every 10s', b: 'per request' },
];
const term = [
  ['$','sudo cscli allowlists add home <you>','bright'],
  ['','added 1 values to allowlist home','good'],
  ['#','30 probes from 203.0.113.50:','dim'],
  ['','Ip:203.0.113.50  http-probing  ban  3h59m','bad'],
  ['$','curl --interface 203.0.113.53 ...','bright'],
  ['','403','accent'],
  ['','000','bad'],
  ['#','LAPI moved, bouncers not:','dim'],
  ['','active  active','dim'],
  ['','banned IP gets 200','bad'],
  ['$','sudo cscli bouncers list','bright'],
];
const c = n => ({dim,bright,accent,good,bad})[n] || dim;
const pre = l => l[0]==='$' ? `<tspan fill="${accent}">$</tspan> ` : l[0]==='#' ? `<tspan fill="${dim}">#</tspan> ` : '';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g opacity="0.45" stroke="${ghost}" stroke-width="6" fill="none"><path d="M1200 520l-46 18v40c0 30 20 48 46 58c26-10 46-28 46-58v-40z"/></g>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="720" height="462" rx="11" fill="#0c0a12" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="792" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">engine decides, bouncers block</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*27}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${pre(l)}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="552" font-family="${mono}" font-size="16" fill="${dim}">check the last API pull after every change.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="850" y="200" font-size="20" letter-spacing="2" fill="${dim}">TWO BOUNCERS, TWO JOBS</text>
  <text x="1010" y="232" font-size="12" fill="${dim}">firewall</text><text x="1160" y="232" font-size="12" fill="${dim}">nginx</text>
  ${rows.map((r,i)=>{const y=268+i*44;return `<line x1="850" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="850" y="${y}" font-size="14" fill="${dim}">${esc(r.k)}</text><text x="1010" y="${y}" font-size="14" fill="${bright}">${esc(r.a)}</text><text x="1160" y="${y}" font-size="14" fill="${good}">${esc(r.b)}</text>`;}).join('\n  ')}
  <text x="850" y="${268+4*44+8}" font-size="13" fill="${accent}">allowlist yourself first.</text>
  <text x="850" y="${268+4*44+32}" font-size="13" fill="${accent}">a bouncer can be active and useless.</text></g>
</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/crowdsec-nginx-hero.png', import.meta.url).pathname);
console.log('wrote hero');
