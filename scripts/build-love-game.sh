#!/usr/bin/env bash
# Build the platformer LÖVE game into public/games/platformer/ as a WebAssembly
# bundle, trimmed to only the assets it actually loads.
#
#   scripts/build-love-game.sh [path-to-game-source]
#
# Defaults to the local game-dev-projects checkout. Re-run after editing the
# game; the <LoveGame> embed in the blog post picks up the new build with no
# other change. Needs `love.js` (fetched on demand via npx) and `zip`.
#
# Why trim: the Kenney art folder is ~4 MB of PNGs, but the game references
# only ~33 of them. Packaging the whole folder ships sprites nobody draws.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HOME/projects/game-dev-projects/platformer-demo}"
NAME="platformer"
TITLE="Platformer Demo"
OUT="$REPO/public/games/$NAME"
SHELL_TEMPLATE="$REPO/scripts/love-game-shell.html"

[ -f "$SRC/main.lua" ] || { echo "no main.lua under $SRC" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
GAME="$WORK/game"
mkdir -p "$GAME/Platformer Pack Remastered/PNG"
cp "$SRC/main.lua" "$SRC/conf.lua" "$GAME/"

# love.js ships LÖVE 11.4, but the game declares t.version = "11.5" (which is
# what the desktop build targets). LÖVE compares the two at startup and shows a
# compatibility nag screen before the game runs — fine on desktop where the
# versions match, but in the browser every reader would hit it. 11.5 is a bugfix
# release over 11.4 and changes nothing this game uses, so pin the declared
# version down for the web bundle only. The source conf.lua stays at 11.5.
sed -i '' -E 's/(t\.version[[:space:]]*=[[:space:]]*")11\.5(")/\111.4\2/' "$GAME/conf.lua"
grep -q 't.version *= *"11.4"' "$GAME/conf.lua" || {
  echo "conf.lua version rewrite failed — check t.version in $SRC/conf.lua" >&2; exit 1; }

# Referenced assets. Three ways main.lua names a file, all of which must be found:
#   1. a whole path literal      — GFX .. "Items/coinGold.png"
#   2. via a prefix local        — local P = GFX .. "Players/…/alienGreen_"
#                                  then P .. "stand.png"
#   3. built in a loop           — HUD digits hud0..9, enemy idle/_move/_dead
# Cases 2 and 3 are why this isn't just a grep for `.png`.
GFX_LITERALS="$WORK/gfx-literals.txt"
grep -oE 'GFX \.\. "[^"]+"' "$SRC/main.lua" | sed -E 's/GFX \.\. "//; s/"$//' > "$GFX_LITERALS"

# Prefix locals: map `local NAME = GFX .. "prefix"` -> every `NAME .. "leaf.png"`.
PREFIX_VARS="$WORK/prefix-vars.txt"
grep -oE 'local [A-Za-z_][A-Za-z0-9_]* = GFX \.\. "[^"]+"' "$SRC/main.lua" \
  | sed -E 's/local ([A-Za-z_][A-Za-z0-9_]*) = GFX \.\. "(.*)"$/\1\t\2/' > "$PREFIX_VARS"

# Prefixes the code interpolates a loop variable into. Declared here so the
# expansion below and the guard at the bottom agree on what's accounted for.
LOOP_PREFIXES="Enemies/
HUD/hud"

{
  grep -E '\.png$' "$GFX_LITERALS" || true          # 1
  while IFS=$'\t' read -r var prefix; do            # 2
    [ -n "$var" ] || continue
    grep -oE "\\b${var} \\.\\. \"[^\"]+\.png\"" "$SRC/main.lua" \
      | sed -E "s/^${var} \\.\\. \"//; s/\"$//" | sed "s|^|${prefix}|"
  done < "$PREFIX_VARS"
  for i in $(seq 0 9); do echo "HUD/hud$i.png"; done # 3
  for base in frog mouse; do
    echo "Enemies/$base.png"; echo "Enemies/${base}_move.png"; echo "Enemies/${base}_dead.png"
  done
} | sort -u > "$WORK/refs.txt"

# A GFX literal without a .png is only legitimate if we resolved it — as a prefix
# local, or as a loop prefix above. Anything else is a reference shape this script
# doesn't understand, and dropping it silently ships a build that dies at runtime
# on a missing image: exactly how the alienGreen_ player frames went missing. Fail.
while IFS= read -r lit; do
  case "$lit" in *.png) continue ;; esac
  cut -f2 "$PREFIX_VARS" | grep -qxF "$lit" && continue
  printf '%s\n' "$LOOP_PREFIXES" | grep -qxF "$lit" && continue
  echo "unrecognized GFX reference: \"$lit\" — not a .png, not a prefix local," >&2
  echo "and not a declared loop prefix. Teach scripts/build-love-game.sh to" >&2
  echo "resolve it (see LOOP_PREFIXES) before shipping." >&2
  exit 1
done < "$GFX_LITERALS"

missing=0 copied=0
while IFS= read -r rel; do
  s="$SRC/Platformer Pack Remastered/PNG/$rel"
  d="$GAME/Platformer Pack Remastered/PNG/$rel"
  if [ -f "$s" ]; then mkdir -p "$(dirname "$d")"; cp "$s" "$d"; copied=$((copied+1))
  else echo "MISSING asset: $rel" >&2; missing=$((missing+1)); fi
done < "$WORK/refs.txt"
[ "$missing" -eq 0 ] || { echo "$missing referenced asset(s) missing — aborting" >&2; exit 1; }
echo "trimmed to $copied assets"

( cd "$GAME" && zip -qr -9 "$WORK/$NAME.love" . -x '.*' )

rm -rf "$OUT"; mkdir -p "$OUT"
npx --yes love.js "$WORK/$NAME.love" "$OUT" -c -t "$TITLE" -m 33554432 >/dev/null
# love.js writes its own index.html and theme/ — replace them with our clean,
# canvas-only host that matches the site's CRT theme.
rm -rf "$OUT/theme"
cp "$SHELL_TEMPLATE" "$OUT/index.html"

echo "built $NAME -> $OUT"
du -sh "$OUT"
