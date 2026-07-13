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

const lines = [
  ['$', 'adduser deploy', green, text],
  ['$', 'usermod -aG sudo deploy', green, text],
  ['$', 'su - deploy', green, text],
  ['$', 'sudo -v', green, text],
];

const cmds = lines.map(([sig, cmd], i) => {
  const y = 238 + i * 58;
  return `<text x="138" y="${y}" font-family="${mono}" font-size="21" fill="${green}">${sig}</text>
    <text x="168" y="${y}" font-family="${mono}" font-size="21" fill="${text}">${cmd}</text>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="72" y="104" width="1216" height="484" rx="8" fill="${panel}" stroke="#293244" stroke-width="2"/>
  <circle cx="104" cy="135" r="7" fill="${red}"/><circle cx="130" cy="135" r="7" fill="${amber}"/><circle cx="156" cy="135" r="7" fill="${green}"/>
  <text x="72" y="68" font-family="${mono}" font-size="24" font-weight="700" letter-spacing="5" fill="${text}">SUDO USER · UBUNTU 26.04</text>
  <text x="1288" y="68" font-family="${mono}" font-size="18" text-anchor="end" fill="${amber}">SUDO-RS 0.2.13 · MEMORY-SAFE</text>
  <text x="108" y="184" font-family="${mono}" font-size="20" fill="${dim}"># stop using root, borrow it</text>
  ${cmds}
  <text x="138" y="470" font-family="${mono}" font-size="21" fill="${amber}">[sudo: authenticate] Password: </text>
  <text x="606" y="470" font-family="${mono}" font-size="21" fill="${dim}">****</text>
  <rect x="838" y="204" width="374" height="278" rx="6" fill="#0d121b" stroke="#364154"/>
  <text x="874" y="250" font-family="${mono}" font-size="18" fill="${dim}">groups deploy</text>
  <text x="874" y="291" font-family="${mono}" font-size="18" fill="${green}">deploy sudo</text>
  <line x1="874" y1="318" x2="1176" y2="318" stroke="#293244" stroke-width="1"/>
  <text x="874" y="357" font-family="${mono}" font-size="18" fill="${text}">prompt      changed</text>
  <text x="874" y="398" font-family="${mono}" font-size="18" fill="${text}">pwfeedback  on</text>
  <text x="874" y="439" font-family="${mono}" font-size="18" fill="${text}">sudo group  same</text>
  <text x="680" y="638" font-family="${mono}" font-size="20" text-anchor="middle" fill="${dim}">create the user · add to sudo · verify from a second shell · lock down root</text>
</svg>`;

await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/create-sudo-user-2604-hero.png', import.meta.url).pathname);

console.log('wrote src/assets/create-sudo-user-2604-hero.png');
