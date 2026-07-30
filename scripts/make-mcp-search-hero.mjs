import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";

// slate blue palette
const bg0 = '#11151d', bg1 = '#0b0d12', grid = '#12161f', ghost = '#182236';
const dim = '#3d5273', bright = '#f0883e', accent = '#ffb37a';
const good = '#6fd08a', ts = '#5a7bf0', bad = '#e06c75';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="35%" r="80%">
      <stop offset="0%" stop-color="${bg0}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- ghost vector space, bottom right -->
  <g opacity="0.5">
    <circle cx="1206" cy="604" r="8" fill="none" stroke="${ghost}" stroke-width="2"/>
    <circle cx="1262" cy="588" r="8" fill="none" stroke="${ghost}" stroke-width="2"/>
    <circle cx="1312" cy="618" r="8" fill="none" stroke="${ghost}" stroke-width="2"/>
    <circle cx="1234" cy="650" r="8" fill="none" stroke="${ghost}" stroke-width="2"/>
    <circle cx="1294" cy="654" r="8" fill="none" stroke="${ghost}" stroke-width="2"/>
    <path d="M1206 604 L1262 588 M1262 588 L1312 618 M1206 604 L1234 650 M1234 650 L1294 654 M1312 618 L1294 654" stroke="${ghost}" stroke-width="3" fill="none"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="1018" y="48" width="294" height="46" rx="8" fill="none" stroke="${dim}" stroke-width="1.5"/>
    <text x="1044" y="77" font-family="${mono}" font-size="20" letter-spacing="2" fill="${bright}">&#9670; MCP &#183; EMBEDDINGS</text>
  </g>

  <!-- terminal -->
  <g>
    <rect x="72" y="120" width="672" height="462" rx="11" fill="#0e121a" stroke="${dim}" stroke-width="1.5"/>
    <line x1="72" y1="178" x2="744" y2="178" stroke="${grid}" stroke-width="1.5"/>
    <circle cx="104" cy="149" r="7" fill="${dim}"/>
    <circle cx="128" cy="149" r="7" fill="${dim}"/>
    <circle cx="152" cy="149" r="7" fill="${dim}"/>
    <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">search_notes &#183; ranking and meaning</text>

    <text x="104" y="220" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">&gt;</tspan> search_notes("brute force")</text>
    <text x="104" y="248" font-family="${mono}" font-size="17" fill="${bad}">No posts mention 'brute force'.</text>
    <text x="104" y="274" font-family="${mono}" font-size="16" fill="${dim}">  # substring match, nothing at all</text>

    <text x="104" y="330" font-family="${mono}" font-size="17" fill="${bright}"><tspan fill="${accent}">&gt;</tspan> embed "brute force"</text>
    <text x="104" y="358" font-family="${mono}" font-size="17" fill="${ts}">0.6237  ufw-firewall-basics-ubuntu</text>
    <text x="104" y="384" font-family="${mono}" font-size="16" fill="${bad}">  # the fail2ban post is eighth</text>

    <text x="104" y="440" font-family="${mono}" font-size="16" fill="${bright}"><tspan fill="${accent}">&gt;</tspan> embed "how do I stop repeated failed SSH login attempts"</text>
    <text x="104" y="470" font-family="${mono}" font-size="17" fill="${good}"><tspan fill="${good}">&#10003;</tspan> <tspan fill="${ts}">0.7546</tspan>  set-up-fail2ban-ubuntu-26-04</text>

    <text x="104" y="534" font-family="${mono}" font-size="18" fill="${dim}">two words is not enough to embed</text>
  </g>

  <!-- right: how it gets there -->
  <g font-family="${mono}">
    <text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">HOW IT GETS THERE</text>

    <rect x="852" y="220" width="456" height="64" rx="8" fill="none" stroke="${dim}" stroke-width="2"/>
    <text x="876" y="259" font-size="19" fill="${accent}">score and sort, not alphabetical</text>

    <text x="1080" y="312" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="328" width="456" height="64" rx="8" fill="none" stroke="${ts}" stroke-width="2"/>
    <text x="876" y="367" font-size="19" fill="${accent}">496 chunks <tspan fill="${ts}">&#183;</tspan> 768 dims <tspan fill="${ts}">&#183;</tspan> 1.5 MB</text>

    <text x="1080" y="420" font-size="22" fill="${dim}" text-anchor="middle">&#8595;</text>

    <rect x="852" y="436" width="456" height="64" rx="8" fill="none" stroke="${good}" stroke-width="2"/>
    <text x="876" y="475" font-size="19" fill="${good}"><tspan fill="${good}">&#10003;</tspan> keep both, they fail differently</text>

    <text x="852" y="546" font-size="18" fill="${dim}">rank &#183; embed &#183; prefix &#183; keep both</text>
  </g>
</svg>`;

writeFileSync(new URL('../src/assets/.mcp-search-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 })
	.resize(W * 2, H * 2)
	.png()
	.toFile(new URL('../src/assets/mcp-search-hero.png', import.meta.url).pathname);
console.log('wrote src/assets/mcp-search-hero.png');
