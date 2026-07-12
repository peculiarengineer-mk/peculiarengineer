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

const attempts = [
  ['203.0.113.41', 'FAILED', '1/5'],
  ['203.0.113.41', 'FAILED', '2/5'],
  ['203.0.113.41', 'FAILED', '3/5'],
  ['203.0.113.41', 'FAILED', '4/5'],
  ['203.0.113.41', 'BANNED', '5/5'],
];

const rows = attempts.map(([ip, state, count], i) => {
  const y = 238 + i * 58;
  const color = state === 'BANNED' ? red : dim;
  return `<text x="138" y="${y}" font-family="${mono}" font-size="21" fill="${dim}">sshd</text>
    <text x="252" y="${y}" font-family="${mono}" font-size="21" fill="${text}">${ip}</text>
    <text x="532" y="${y}" font-family="${mono}" font-size="21" fill="${color}">${state}</text>
    <text x="722" y="${y}" font-family="${mono}" font-size="21" fill="${color}">${count}</text>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="72" y="104" width="1216" height="484" rx="8" fill="${panel}" stroke="#293244" stroke-width="2"/>
  <circle cx="104" cy="135" r="7" fill="${red}"/><circle cx="130" cy="135" r="7" fill="${amber}"/><circle cx="156" cy="135" r="7" fill="${green}"/>
  <text x="72" y="68" font-family="${mono}" font-size="24" font-weight="700" letter-spacing="5" fill="${text}">FAIL2BAN · UBUNTU 26.04</text>
  <text x="1288" y="68" font-family="${mono}" font-size="18" text-anchor="end" fill="${amber}">PYTHON 3.14 · SYSTEMD JOURNAL</text>
  <text x="108" y="184" font-family="${mono}" font-size="20" fill="${green}">$ sudo fail2ban-client status sshd</text>
  ${rows}
  <rect x="838" y="204" width="374" height="278" rx="6" fill="#0d121b" stroke="#364154"/>
  <text x="874" y="250" font-family="${mono}" font-size="18" fill="${dim}">[sshd]</text>
  <text x="874" y="291" font-family="${mono}" font-size="18" fill="${text}">backend  = systemd</text>
  <text x="874" y="332" font-family="${mono}" font-size="18" fill="${text}">maxretry = 5</text>
  <text x="874" y="373" font-family="${mono}" font-size="18" fill="${text}">findtime = 10m</text>
  <text x="874" y="414" font-family="${mono}" font-size="18" fill="${text}">bantime  = 1h</text>
  <text x="874" y="455" font-family="${mono}" font-size="18" fill="${green}">enabled  = true</text>
  <text x="680" y="638" font-family="${mono}" font-size="20" text-anchor="middle" fill="${dim}">watch the journal · count failures · block the address · verify the jail</text>
</svg>`;

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/fail2ban-2604-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/fail2ban-2604-hero.png');
