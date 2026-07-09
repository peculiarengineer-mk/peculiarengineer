import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// amber build palette
const bg = '#100b06';
const bright = '#fbbf24';
const accent = '#fde68a';
const dim = '#a16207';
const faint = '#7a5410';
const good = '#6fd08a';
const slate = '#9a8258';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#1a1209"/>
      <stop offset="100%" stop-color="${bg}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#211708" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- big ghost eye, bottom-right (spotter) -->
  <g opacity="0.5" stroke="${faint}" stroke-width="9" fill="none">
    <path d="M1150 540 Q1240 460 1330 540 Q1240 620 1150 540 Z"/>
    <circle cx="1240" cy="540" r="30"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1024" y="48" width="288" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1050" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; CLAUDE CODE &#183; SKILL</text>
  </g>

  <!-- chat / transcript panel -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#140d06" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${faint}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">claude code &#183; a conversation</text>

    <text x="104" y="216" font-family="${mono}" font-size="17" fill="${slate}">you: format that the same way as</text>
    <text x="104" y="240" font-family="${mono}" font-size="17" fill="${slate}">the last two files &#8230;</text>

    <text x="104" y="296" font-family="${mono}" font-size="17" fill="${dim}"># spotted: same shape, 3rd time</text>
    <rect x="104" y="316" width="560" height="120" rx="8" fill="#1a1209" stroke="${bright}" stroke-width="1.5"/>
    <text x="124" y="352" font-family="${mono}" font-size="16" fill="${accent}">You've done this three times now.</text>
    <text x="124" y="380" font-family="${mono}" font-size="16" fill="${accent}">Want me to save it as a reusable skill?</text>
    <text x="124" y="416" font-family="${mono}" font-size="15" fill="${dim}">[ subagent review runs before anything saves ]</text>

    <text x="104" y="486" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> skill written &#183; you approved it</text>

    <text x="104" y="546" font-family="${mono}" font-size="18" fill="${dim}">repetition and stated rules become skills</text>
  </g>

  <!-- right: the flow -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">THE LOOP IT ADDS</text>

    <rect x="852" y="220" width="456" height="60" rx="8" fill="none" stroke="${bright}" stroke-width="2"/>
    <text x="876" y="257" font-size="19" fill="${accent}"><tspan fill="${bright}">1</tspan>  spot repetition or a stated rule</text>

    <text x="1080" y="308" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="324" width="456" height="60" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="361" font-size="19" fill="${accent}"><tspan fill="${bright}">2</tspan>  offer to save it, never assume</text>

    <text x="1080" y="412" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="428" width="456" height="60" rx="8" fill="none" stroke="${slate}" stroke-width="2"/>
    <text x="876" y="465" font-size="19" fill="${accent}"><tspan fill="${bright}">3</tspan>  a subagent reviews the draft</text>

    <rect x="852" y="512" width="456" height="52" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="545" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> only then does it get written</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.skill-spotter-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
  .resize(W * 2, H * 2)
  .png()
  .toFile(new URL('../src/assets/skill-spotter-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/skill-spotter-hero.png');
