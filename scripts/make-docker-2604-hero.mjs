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

const steps = [
  ['$ sudo apt remove docker.io containerd', green],
  ['$ curl -fsSL .../gpg -o docker.asc', green],
  ['$ sudo apt install docker-ce docker-compose-plugin', green],
  ['$ sudo docker run hello-world', green],
  ['  Hello from Docker!', text],
];

const rows = steps.map(([line, color], i) => {
  const y = 226 + i * 52;
  return `<text x="108" y="${y}" font-family="${mono}" font-size="20" fill="${color}">${line}</text>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="72" y="104" width="1216" height="484" rx="8" fill="${panel}" stroke="#293244" stroke-width="2"/>
  <circle cx="104" cy="135" r="7" fill="${red}"/><circle cx="130" cy="135" r="7" fill="${amber}"/><circle cx="156" cy="135" r="7" fill="${green}"/>
  <text x="72" y="68" font-family="${mono}" font-size="24" font-weight="700" letter-spacing="5" fill="${text}">DOCKER ENGINE · UBUNTU 26.04</text>
  <text x="1288" y="68" font-family="${mono}" font-size="18" text-anchor="end" fill="${amber}">OFFICIAL APT REPO · NOT docker.io</text>
  ${rows}
  <rect x="838" y="196" width="374" height="300" rx="6" fill="#0d121b" stroke="#364154"/>
  <text x="874" y="238" font-family="${mono}" font-size="18" fill="${dim}"># docker.sources</text>
  <text x="874" y="279" font-family="${mono}" font-size="18" fill="${text}">Types: deb</text>
  <text x="874" y="320" font-family="${mono}" font-size="18" fill="${text}">URIs:  .../ubuntu</text>
  <text x="874" y="361" font-family="${mono}" font-size="18" fill="${blue}">Suites: resolute</text>
  <text x="874" y="402" font-family="${mono}" font-size="18" fill="${text}">Components: stable</text>
  <text x="874" y="443" font-family="${mono}" font-size="18" fill="${text}">Architectures: amd64</text>
  <text x="874" y="478" font-family="${mono}" font-size="18" fill="${green}">Signed-By: docker.asc</text>
  <text x="680" y="638" font-family="${mono}" font-size="20" text-anchor="middle" fill="${dim}">trust the key · add the repo · install the engine · run something</text>
</svg>`;

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/docker-2604-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/docker-2604-hero.png');
