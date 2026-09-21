import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#0f1a14', bg1 = '#070c09', grid = '#15251b';
const dim = '#8fa896', bright = '#5fd08a', accent = '#a9f0c2', good = '#5fd08a', bad = '#f2837a', warn = '#f0c060';
const badge = 'NGINX 1.28 · UBUNTU 26.04'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const term = [
  ['$','curl -s http://app.example.com/','bright'],
  ['','Host: app.example.com','good'],
  ['','X-Forwarded-For: 203.0.113.7','good'],
  ['','X-Forwarded-Proto: https','good'],
  ['$','sudo nginx -t','bright'],
  ['','[warn] the "listen ... http2" directive is deprecated','warn'],
  ['$','systemctl stop app; curl -sI http://app.example.com/','bright'],
  ['','HTTP/1.1 502 Bad Gateway','bad'],
  ['','connect() failed (111: Connection refused)','bad'],
];
const c = n => ({dim,bright,accent,good,bad,warn})[n] || dim;
const flow = [
  { x: 852, label: 'internet', sub: ':443 / :80' },
  { x: 1010, label: 'nginx', sub: 'server_name' },
  { x: 1168, label: 'app', sub: '127.0.0.1:8080' },
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="30%" cy="32%" r="82%"><stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/></radialGradient>
  <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
  <g><rect x="${1312-bw}" y="48" width="${bw}" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
  <text x="${1312-bw+24}" y="77" font-family="${mono}" font-size="18" letter-spacing="2" fill="${bright}">&#9670; ${esc(badge)}</text></g>
  <g><rect x="72" y="120" width="700" height="462" rx="11" fill="#090e0b" stroke="${dim}" stroke-width="1.5"/>
  <line x1="72" y1="178" x2="772" y2="178" stroke="${grid}" stroke-width="1.5"/>
  <circle cx="104" cy="149" r="7" fill="${dim}"/><circle cx="128" cy="149" r="7" fill="${dim}"/><circle cx="152" cy="149" r="7" fill="${dim}"/>
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">reverse proxy, no docker</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*30}" font-family="${mono}" font-size="16" fill="${c(l[2])}">${l[0]?`<tspan fill="${accent}">$</tspan> `:''}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">the app still only listens on loopback.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}">
  <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">ONE HOSTNAME, ONE APP</text>
  ${flow.map((f,i)=>`<rect x="${f.x}" y="250" width="130" height="78" rx="9" fill="none" stroke="${i===1?bright:dim}" stroke-width="${i===1?2:1.5}"/>
  <text x="${f.x+65}" y="283" text-anchor="middle" font-size="17" fill="${i===1?bright:accent}">${esc(f.label)}</text>
  <text x="${f.x+65}" y="308" text-anchor="middle" font-size="12" fill="${dim}">${esc(f.sub)}</text>`).join('\n  ')}
  <path d="M982 289 h22 m-6 -6 l6 6 l-6 6" fill="none" stroke="${good}" stroke-width="2"/>
  <path d="M1140 289 h22 m-6 -6 l6 6 l-6 6" fill="none" stroke="${good}" stroke-width="2"/>
  <text x="852" y="392" font-size="14" fill="${dim}">proxy_set_header Host            <tspan fill="${good}">$host</tspan></text>
  <text x="852" y="420" font-size="14" fill="${dim}">proxy_set_header X-Forwarded-For <tspan fill="${good}">$proxy_add_x_forw...</tspan></text>
  <text x="852" y="448" font-size="14" fill="${dim}">proxy_set_header Upgrade         <tspan fill="${good}">$http_upgrade</tspan></text>
  <text x="852" y="476" font-size="14" fill="${dim}">client_max_body_size             <tspan fill="${warn}">1m by default</tspan></text>
  <text x="852" y="504" font-size="14" fill="${dim}">listen 443 ssl; <tspan fill="${good}">http2 on;</tspan>   <tspan fill="${bad}">not listen ... http2</tspan></text>
  <text x="852" y="556" font-size="13" fill="${accent}">certbot 4.0 from apt. no snap on 26.04.</text></g>
</svg>`;
writeFileSync(new URL('../src/assets/.nginx-reverse-proxy-2604-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/nginx-reverse-proxy-2604-hero.png', import.meta.url).pathname);
console.log('wrote hero');
