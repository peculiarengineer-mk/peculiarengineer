import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const W = 1360, H = 680;
const mono = "'SF Mono','Menlo','DejaVu Sans Mono','Consolas',monospace";
const bg0 = '#171310', bg1 = '#0a0807', grid = '#251e18', ghost = '#3a2f24';
const dim = '#9a8a76', bright = '#e8a33d', accent = '#f5c56b', good = '#4fbf87', bad = '#f2837a';
const badge = 'CLAUDE CODE · CODEX · HOOKS'; const bw = (badge.length + 2) * 13.2 + 52;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows = [
  { k: 'lab up cx23',     u: 'within limits',  f: 'allow' },
  { k: 'no --ttl',        u: 'forgot it',      f: 'rewrite --ttl 2' },
  { k: 'lab up cx33',     u: 'bigger box',     f: 'ask Keith' },
  { k: 'Codex + ask',     u: 'no ask there',   f: 'deny' },
  { k: 'plan fails Jev',  u: 'rounds 1-2',     f: 'block, revise' },
  { k: 'plan round 3',    u: 'still fails',    f: 'ask + notify' },
];
const term = [
  ['$','claude  # Keith: spin up a cx33 lab','bright'],
  ['','Hook PreToolUse:Bash requires confirmation','bad'],
  ['','lab-guard: needs Keith\'s approval: cx33','bad'],
  ['$','echo \'{...cx23...}\' | lab-guard.py','bright'],
  ['','"updatedInput": {"command": "lab up ... --ttl 2"}','good'],
  ['$','# plan mode: ExitPlanMode','bright'],
  ['','plan-gate hook: Jev failed this plan (round 1 of 3)','bad'],
  ['','plan-gate: Jev still fails after 3 rounds. Keith decides','good'],
  ['','','dim'],['','','dim'],
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
  <text x="200" y="156" font-family="${mono}" font-size="20" fill="${dim}">prompts ask. hooks make sure.</text>
  ${term.map((l,i)=>`<text x="104" y="${216+i*26}" font-family="${mono}" font-size="15" fill="${c(l[2])}">${l[0]?`<tspan fill="${accent}">$</tspan> `:''}${esc(l[1])}</text>`).join('\n  ')}
  <text x="104" y="548" font-family="${mono}" font-size="16" fill="${dim}">the final call stays mine.<tspan fill="${bright}">&#9608;</tspan></text></g>
  <g font-family="${mono}"><text x="852" y="200" font-size="20" letter-spacing="2" fill="${dim}">WHAT THE HOOK SAYS</text>
  <text x="1030" y="232" font-size="13" fill="${dim}">cause</text><text x="1150" y="232" font-size="13" fill="${dim}">fix</text>
  ${rows.map((r,i)=>{const y=262+i*44;return `<line x1="852" y1="${y+12}" x2="1300" y2="${y+12}" stroke="${grid}"/><text x="852" y="${y}" font-size="13" fill="${dim}">${esc(r.k)}</text><text x="1030" y="${y}" font-size="13" fill="${bright}">${esc(r.u)}</text><text x="1150" y="${y}" font-size="12" fill="${good}">${esc(r.f)}</text>`;}).join('\n  ')}
  <text x="852" y="${262+6*44+8}" font-size="13" fill="${accent}">same every time.</text></g>
</svg>`;
writeFileSync(new URL('../src/assets/.claude-codex-hooks-hero.svg', import.meta.url), svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(W*2, H*2).png().toFile(new URL('../src/assets/claude-codex-hooks-hero.png', import.meta.url).pathname);
console.log('wrote hero');
