import sharp from 'sharp';

const W = 1360;
const H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg = '#0b0e14';
const panel = '#121823';
const text = '#d8dee9';
const dim = '#718096';
const red = '#ef6b73';
const green = '#74c991';
const amber = '#e6b566';
const blue = '#5aa9e6';

const routes = [
  ['plex.example.com', 'reverse_proxy plex:32400'],
  ['books.example.com', 'reverse_proxy calibre-web:8083'],
  ['whoami.example.com', 'reverse_proxy whoami:80'],
];

const rows = routes.map(([host, target], i) => {
  const y = 250 + i * 60;
  return `<text x="138" y="${y}" font-family="${mono}" font-size="21" fill="${blue}">${host}</text>
    <text x="470" y="${y}" font-family="${mono}" font-size="21" fill="${dim}">-></text>
    <text x="530" y="${y}" font-family="${mono}" font-size="21" fill="${text}">${target}</text>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="72" y="104" width="1216" height="484" rx="8" fill="${panel}" stroke="#293244" stroke-width="2"/>
  <circle cx="104" cy="135" r="7" fill="${red}"/><circle cx="130" cy="135" r="7" fill="${amber}"/><circle cx="156" cy="135" r="7" fill="${green}"/>
  <text x="72" y="68" font-family="${mono}" font-size="24" font-weight="700" letter-spacing="5" fill="${text}">CADDY · REVERSE PROXY · UBUNTU 26.04</text>
  <text x="1288" y="68" font-family="${mono}" font-size="18" text-anchor="end" fill="${green}">AUTO-HTTPS · 🔒</text>
  <text x="108" y="196" font-family="${mono}" font-size="20" fill="${dim}"># one domain in front of every container</text>
  ${rows}
  <rect x="108" y="470" width="1144" height="70" rx="6" fill="#0d121b" stroke="#364154"/>
  <text x="138" y="514" font-family="${mono}" font-size="20" fill="${green}">$ docker exec -w /etc/caddy caddy caddy reload</text>
  <text x="1224" y="514" font-family="${mono}" font-size="20" text-anchor="end" fill="${amber}">443 ✓</text>
  <text x="680" y="632" font-family="${mono}" font-size="20" text-anchor="middle" fill="${dim}">one network · proxy to names · port 80 for the challenge · certs on autopilot</text>
</svg>`;

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/caddy-2604-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/caddy-2604-hero.png');
