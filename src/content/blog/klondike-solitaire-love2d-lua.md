---
title: 'Klondike Solitaire in LÖVE and Lua: what a card game taught me about the language'
description: 'Building draw-one Klondike in LÖVE pushed me into the Lua I skipped writing Pong: modules, objects without classes via metatables, undo by snapshot, and dt-based tweening.'
pubDate: 'Jul 5 2026'
tags: ['LÖVE', 'Love2D', 'Lua', 'Game Dev', 'Solitaire', 'Metatables', 'Tutorial']
---

After I built [Pong](/blog/make-pong-with-love2d-and-lua/), I wanted something with actual structure. Pong is two paddles and a ball in one flat file, and that's the whole point of it, but because it's one flat file it never once made me touch the parts of Lua that have a real learning curve. So I picked the next smallest thing that would: draw-one Klondike solitaire, the classic Windows kind, in [LÖVE](https://love2d.org). Fifty two card objects, seven tableau columns, four foundations, a stock and a waste, rules for what can go where, drag and drop, undo, and a little slide animation so cards don't teleport.

This is me writing down what I learned, mostly so I never have to re-derive it, but also because solitaire forced me into two Lua ideas that Pong let me skip entirely: splitting code into modules, and making objects when the language has no `class` keyword. Those two are where Lua stops looking like "a scripting language I can read on sight" and starts having opinions of its own. Everything else here, the undo, the animation, the sound, hangs off those two.

The finished game is six small files totaling under 900 lines, and it uses [Kenney](https://kenney.nl/)'s free CC0 card art (one PNG per card). Here's the shape of it:

```text
card-game/
├── conf.lua        # window config
├── main.lua        # entry point, love callbacks
└── src/
    ├── deck.lua    # build + shuffle a 52-card deck
    ├── pile.lua    # one type for every stack of cards
    ├── game.lua    # board, rules, drag/drop, undo, drawing
    └── sfx.lua     # sound effects synthesized in code
```

> **TL;DR** In Lua a "module" is just a file that builds a table and `return`s it. There are no classes, so you make objects yourself with a metatable and `__index`. The colon in `pile:push(c)` is sugar for passing the object as `self`. Undo is easy when a snapshot stores card *references*, not copies. And `dt` is back, now driving a slide tween instead of ball speed.

## Why solitaire, as a Lua lesson

Pong taught me game ideas: the loop, delta time, collision, a state machine, juice. Great, but all of that lived happily in one 200 line file with a handful of globals. The moment a project has a deck, and piles, and cards that are all the same kind of thing behaving differently by position, you want two things Lua does its own peculiar way:

1. A way to split the code into files that hand each other clean pieces. That's **modules**.
2. A way to say "a pile is a type, here are its methods, make me a new one." That's **metatables**, and it's the one genuinely distinctive thing in the language.

Solitaire is the perfect size to learn both. Small enough to hold in your head, big enough that cramming it into one file with globals would actually hurt.

## Modules: a file that builds a table and returns it

Lua has no `import`, no `export`, no packages in the sense you might expect. A module is a plain convention, and once it clicks it's almost aggressively simple. A file makes a `local` table, fills it with functions, and returns it at the bottom. Whoever calls `require` gets that returned table back. Here's `deck.lua` opening exactly that way:

```lua
-- src/deck.lua
local Deck = {}

-- ... functions get attached to Deck ...

return Deck   -- require("src.deck") hands this table to the caller
```

And on the other side, `game.lua` pulls it in:

```lua
local Deck = require("src.deck")
local Pile = require("src.pile")
local Sfx  = require("src.sfx")
```

The `local` in `local Deck = {}` matters more than it looks. Anything you don't put in the returned table stays private to the file. My `rankValue` helper below is a `local function`, so nothing outside `deck.lua` can see it or call it. The returned table *is* the public surface, and everything else is genuinely hidden. That's the entire access-control story in Lua, and it's honestly enough.

## Tables are still the only data structure, and they wear a lot of hats

Pong already taught me that a table is the only container Lua has. Solitaire made me use every face of it in one file. In `deck.lua` a table is an **array**, a **set**, and a **record**, all in the space of a few lines:

```lua
-- Arrays: consecutive integer keys, starting at 1 (Lua is 1-based, not 0-based).
local SUITS = { "Clubs", "Diamonds", "Hearts", "Spades" }
local RANKS = { "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" }

-- A set / dictionary: string keys, boolean values.
-- RED["Hearts"] is true; RED["Clubs"] is nil, which is falsey.
local RED = { Hearts = true, Diamonds = true }
```

Those strings are picked to match the Kenney filenames exactly, so building a card's image path is just string concatenation with `..`:

```lua
local card = {
    suit   = suit,
    rank   = rank,
    value  = rankValue(rank),
    color  = RED[suit] and "red" or "black",
    faceUp = false,
    image  = love.graphics.newImage("Cards/card" .. suit .. rank .. ".png"),
}
```

Two small Lua-isms in there earn their keep. `#SUITS` gives the array length (4), and arrays are **1-based**, so loops run `for i = 1, #cards` and the deal below reaches for `table.remove(deck)` off the end. Second, `RED[suit] and "red" or "black"` is Lua's ternary. There's no `? :` operator, so you lean on short-circuit evaluation: if the left side is truthy you get the middle value, otherwise the right one. You see it constantly, and it reads fine once you stop expecting a real ternary.

## Shuffling: Fisher-Yates and the RNG that's already seeded

The deck ships in order, so `Deck.shuffle` does an in-place Fisher-Yates, the correct unbiased shuffle. Walk from the top down, and swap each card with a random one at or before it:

```lua
function Deck.shuffle(cards)
    for i = #cards, 2, -1 do          -- for i = start, stop, step
        local j = love.math.random(i)
        cards[i], cards[j] = cards[j], cards[i]
    end
end
```

Two things I'd flag. `love.math.random(i)` returns an integer in `1..i`, and unlike plain Lua's `math.random` it comes already seeded, so you don't get the same "random" deal every launch. And `cards[i], cards[j] = cards[j], cards[i]` is Lua's multiple assignment doing a swap with no temp variable. The right side is fully evaluated before anything is assigned, so it just works.

## Objects without classes: the metatable trick

This is the part Pong never made me learn, and the part worth the whole post. In solitaire, the stock, the waste, each foundation, and each tableau column all behave the same way. Push a card on top, peek at the top, pop it off, pick up a run of cards. That's one type, `Pile`, reused thirteen times.

Lua has no `class` keyword. You build the behavior yourself, and the whole mechanism is one special table field called `__index`. Here's the setup from `pile.lua`:

```lua
local Pile = {}
Pile.__index = Pile
```

That second line is the trick, and it took me a beat to see it. `__index` is a field Lua checks when you look up a key on a table and it's **missing**. Setting `Pile.__index = Pile` says: "if someone asks an object for a key it doesn't have, go look on `Pile` instead." So a freshly made pile carries its own data (`cards`, `x`, `y`), but when you ask it for a *method* like `push`, which it doesn't have, Lua falls through `__index` to find `Pile.push`. That fall-through is method lookup. There's no class, just a rule about where to look when a key is absent.

The constructor wires each new object to that rule with `setmetatable`:

```lua
function Pile.new(kind, x, y, fanDX, fanDY)
    local self = setmetatable({}, Pile)   -- new table, methods resolve via Pile
    self.kind  = kind
    self.x, self.y = x, y
    self.fanDX = fanDX or 0     -- `a or 0` defaults to 0 when the arg is nil
    self.fanDY = fanDY or 0
    self.cards = {}             -- the stack, bottom = index 1, top = #cards
    return self
end
```

Note `Pile.new` uses a **dot**, not a colon, because it isn't operating on an existing object, it's making one. The `fanDX or 0` pattern is how you do default arguments in a language with no default arguments: a missing arg arrives as `nil`, which is falsey, so `or` supplies the fallback.

### The colon is the piece that finally made it click

Once you have the object, methods are defined and called with a colon:

```lua
function Pile:push(card)
    table.insert(self.cards, card)   -- append = put on top
end

function Pile:pop()
    return table.remove(self.cards)  -- remove and return the top card
end

function Pile:peek()
    return self.cards[#self.cards]   -- top card, or nil if empty
end
```

The colon is pure sugar, and understanding what it desugars to is the thing that made Lua objects stop feeling like magic. `pile:push(card)` is exactly `Pile.push(pile, card)`. The colon silently passes the object on the left as the first argument, and by convention you name that argument `self`. Defining with `function Pile:push(card)` mirrors it: the colon on the definition side quietly adds the `self` parameter for you.

So there are two colons doing the same favor on two sides. Once I saw that `foo:bar(x)` is just `foo.bar(foo, x)`, every object in the codebase became readable, and the one class of bug I'll cover in the gotchas (calling a method with a dot) became obvious instead of baffling.

## One type, many piles: behavior from data, not subclasses

Here's where the single `Pile` type pays off. A stock stacks cards in one spot. A tableau column fans them downward so you can read every card. In a language with inheritance you might reach for a `TableauPile` subclass. In Lua I just handed the constructor two numbers, `fanDX` and `fanDY`, the per-card offset, and let one method do the math:

```lua
-- Where should the i-th card in this pile be drawn?
function Pile:cardPos(i)
    return self.x + (i - 1) * self.fanDX,
           self.y + (i - 1) * self.fanDY
end
```

Stock and waste and foundations get `fanDX, fanDY = 0, 0`, so every card lands on the same spot and you see only the top one. Tableau columns get `0, 30`, so each card drops thirty pixels below the last. Same code, different two numbers at construction time. `game.lua` sets them up in a loop:

```lua
self.foundations = {}
for i = 1, 4 do
    self.foundations[i] = Pile.new("foundation", columnX(3 + i), topY)
end

self.tableau = {}
for i = 1, 7 do
    self.tableau[i] = Pile.new("tableau", columnX(i), tabY, 0, TABLEAU_FAN)
end
```

The one genuinely clever `Pile` method is `removeFrom`, which lifts a card and everything stacked on top of it (that's how you drag a run in solitaire). It leans on the fact that `table.remove` at a fixed index shifts everything down:

```lua
function Pile:removeFrom(i)
    local moved = {}
    while #self.cards >= i do
        table.insert(moved, self.cards[i])
        table.remove(self.cards, i)   -- what was at i+1 becomes the new i
    end
    return moved
end
```

You keep removing at the *same* index `i`. Each `table.remove` slides the next card down into slot `i`, so the loop peels the run off in its original bottom-to-top order. No index arithmetic, no off-by-one.

## The rules are small pure functions

Klondike's rules are the fun part to get right, and the thing that kept them readable was writing each one as a tiny function that takes a card and a pile and answers true or false, with no side effects:

```lua
-- Tableau: opposite color, exactly one rank lower. Empty column takes a King.
local function canPlaceOnTableau(card, pile)
    if pile:isEmpty() then
        return card.value == 13
    end
    local top = pile:peek()
    return card.color ~= top.color
       and card.value == top.value - 1
end

-- Foundation: build up by suit from the Ace, one card at a time.
local function canPlaceOnFoundation(card, pile)
    if pile:isEmpty() then
        return card.value == 1
    end
    local top = pile:peek()
    return card.suit == top.suit
       and card.value == top.value + 1
end
```

Because they're pure, I can reuse them everywhere: the drag-drop check, the double-click auto-send, and (the nice touch) the highlight that outlines every legal target while you're holding a card. That last one is three lines in `draw`, and it only works because "is this legal?" is a cheap function I can call on every pile, every frame, with no state to disturb:

```lua
if p ~= self.drag.source and self:isLegalDrop(p, self.drag.cards) then
    -- draw a soft yellow outline around p
end
```

## Undo without deep copies: snapshots and tables as keys

Undo is the feature I expected to be a slog and turned out to be my favorite thing in the codebase, because it uses a Lua ability I hadn't needed before: **any value can be a table key, including another table**.

A snapshot records which cards are in each pile, in order, plus each card's `faceUp` flag (which changes as you play). The thing I got right by accident and then understood on purpose: I do *not* copy the card tables. Cards are unique and permanent, there's exactly one Ace of Spades for the whole game, so a snapshot just keeps *references* to them. That makes a snapshot cheap, a few small arrays of pointers, not fifty two cloned card tables with their images.

And I key the snapshot by the pile object itself:

```lua
function Game:snapshot()
    local snap = { moves = self.moves, piles = {} }
    for _, pile in ipairs(self:allPiles()) do
        local entries = {}
        for i, card in ipairs(pile.cards) do
            entries[i] = { card = card, faceUp = card.faceUp }
        end
        snap.piles[pile] = entries    -- the pile TABLE is the key
    end
    return snap
end
```

`snap.piles[pile]` uses the live pile object as a lookup key. In most languages a hash key is a string or a number. In Lua a table is a perfectly good key (it hashes by identity), so I never had to invent pile IDs or names. Restoring just walks the same piles and reads their entries back:

```lua
function Game:restore(snap)
    for _, pile in ipairs(self:allPiles()) do
        local entries = snap.piles[pile]
        local cards = {}
        for i, e in ipairs(entries) do
            e.card.faceUp = e.faceUp
            e.card.animT  = nil        -- cancel any in-flight slide animation
            cards[i] = e.card
        end
        pile.cards = cards
    end
    self.moves = snap.moves
    self.wonAnnounced = self:hasWon()
end
```

That `e.card.animT = nil` line is small but it's load-bearing, and I'll come back to it in the gotchas, because leaving it out is exactly the kind of bug that only shows up when you undo mid-slide.

## Animation is dt all over again, pointed at a slide instead of a ball

Pong drilled `dt` into me for ball speed: multiply motion by delta time so the game runs the same on a 30 fps laptop and a 144 fps desktop. Solitaire uses the exact same idea, but to tween a card from where you dropped it to where it belongs, so nothing snaps into place.

The trick I like here is that a card doesn't store its destination. It stores only how *far along* the slide it is (`animT`, running 0 to 1) and where it *started*. The destination is just wherever the card naturally sits, computed fresh at draw time. Tagging a card to animate is three fields:

```lua
function Game:animateCardFrom(card, fromX, fromY)
    card.animT     = 0
    card.animFromX = fromX
    card.animFromY = fromY
end
```

`update` advances every animating card by `dt / ANIM_DUR`, so the whole slide always takes `ANIM_DUR` seconds no matter the frame rate:

```lua
function Game:update(dt)
    for _, pile in ipairs(self:allPiles()) do
        for _, card in ipairs(pile.cards) do
            if card.animT then
                card.animT = card.animT + dt / ANIM_DUR
                if card.animT >= 1 then
                    card.animT = nil   -- done; render normally from here
                end
            end
        end
    end
end
```

Then draw interpolates between the start and the real slot with a `lerp`, and runs it through an ease-out so the card decelerates as it lands (linear motion looks robotic):

```lua
local function lerp(a, b, t)  return a + (b - a) * t end
local function easeOut(t)     return 1 - (1 - t) * (1 - t) end

function Game:drawCardInSlot(card, x, y)   -- (x, y) is the destination
    if card.animT then
        local e = easeOut(card.animT)
        x = lerp(card.animFromX, x, e)
        y = lerp(card.animFromY, y, e)
    end
    self:drawCard(card, x, y)
end
```

The nice payoff of "destination is computed, not stored": when a drop is illegal and the card has to fly back home, I get the return animation for free. I animate *from* the mouse release point, and since the card's real slot is wherever it lives, the slide just carries it back with no special case.

## Sound with no audio files, again, but richer

Pong generated a square-wave beep in code, and I loved that trick enough to reuse it here with more range. A sound is just a long list of numbers, one speaker position per sample, 44,100 of them a second. The reusable core takes a *function* and evaluates it at every sample. Passing a function as an argument is ordinary in Lua, functions are values you can hand around, and it makes `render` read like a little synth:

```lua
local function render(duration, fn)
    local n    = math.max(1, math.floor(RATE * duration))
    local data = love.sound.newSoundData(n, RATE, 16, 1)   -- n samples, 16-bit, mono
    for i = 0, n - 1 do
        local t = i / RATE
        local a = fn(t)                 -- amplitude in -1..1, from the caller
        if a >  1 then a =  1 end
        if a < -1 then a = -1 end
        data:setSample(i, a)
    end
    return love.audio.newSource(data, "static")
end
```

Now each sound effect is a one-line math expression handed to `render`. A sine times a fast exponential fade is a "pluck." Two sines a fifth apart is a bell. A short arpeggio steps the pitch as it plays:

```lua
-- A soft, low thud for landing a card on the tableau.
sounds.place = render(0.12, function(t)
    return 0.40 * math.exp(-t * 22) * math.sin(TAU * 180 * t)
end)

-- A bell-like ring for sending a card home: two partials a fifth apart.
sounds.chime = render(0.50, function(t)
    local env = math.exp(-t * 6)
    return 0.25 * env * (math.sin(TAU * 880 * t) + 0.5 * math.sin(TAU * 1320 * t))
end)

-- A 4-note win arpeggio: pick the note from which time-slice we're in.
local notes = { 523.25, 659.25, 783.99, 1046.50 }   -- C5 E5 G5 C6
sounds.win = render(0.90, function(t)
    local slot   = math.min(#notes, math.floor(t / 0.18) + 1)
    local localT = t - (slot - 1) * 0.18
    return 0.28 * math.exp(-localT * 5) * math.sin(TAU * notes[slot] * t)
end)
```

Same `render` for all four, four different tiny functions. The whole sound engine is under 80 lines and ships zero `.wav` files.

## Gotchas I hit

The ones that actually cost me time, roughly in order of how much they stung.

> **The colon versus the dot.** Call a method with a dot and you drop `self` on the floor. `pile.push(card)` passes `card` as `self` and leaves the real argument empty, so you get `attempt to index a nil value (local 'card')` or a silent no-op. Constructors are the mirror image: `Pile.new(...)` is a dot (it makes an object), but `pile:push(...)` is a colon (it acts on one). Once I internalized that `a:b(x)` means `a.b(a, x)`, these stopped being mysteries and started being typos.

**`local` only exists from its line downward.** Same trap Pong taught me, and it bites harder with more files. A `local function` declared *below* the function that calls it isn't in scope up there, so Lua treats the name as a global, finds `nil`, and you get `attempt to call a nil value`. Define your `local` helpers above their callers. This is why `lerp`, `easeOut`, `columnX`, and the rule functions all sit near the top of `game.lua`.

**Snapshot before you lift the cards, and only commit on a real move.** When a drag starts I take the snapshot *before* removing cards from the source pile, but I stash it as `pendingSnapshot` and only push it onto the undo history if the drop turns out legal:

```lua
function Game:startDrag(pile, index, mx, my)
    self.pendingSnapshot = self:snapshot()   -- state as it was, before lifting
    self.drag = { cards = pile:removeFrom(index), source = pile, ... }
end
```

If you push it to history immediately, a drop that snaps back to where it started (you missed, or the move was illegal) still leaves an undo entry, and now undo does nothing visible and feels broken. Commit the snapshot only when the move actually changes the board.

**Clearing `animT` on undo.** This is the one from earlier. If you undo while a card is mid-slide, the restored card still carries an `animT` from the move you just took back, so it animates from a stale start position toward a slot it's no longer in, and it visibly jumps. Resetting `e.card.animT = nil` inside `restore` kills any in-flight animation so undone cards appear exactly where they belong. I only found this by undoing fast during a slide and watching a card twitch.

**Consume the double-click so a third click isn't another "double."** Double-click detection compares the current pile and time to the last ones. After a successful auto-send I set `self.lastPile = nil`, otherwise a quick third click reads as a fresh double-click against a card that's already gone.

**`setSample` is 0-based in a 1-based language.** Everything else in Lua counts from 1, but the sound buffer indexes from 0, so the render loop runs `for i = 0, n - 1`. Start it at 1 and you skip the first sample and write one past the end. Lua being 1-based *almost* everywhere makes the one 0-based API easy to forget.

## What I actually came away with

Pong taught me game ideas. Solitaire taught me Lua the language, the stuff a single flat file lets you avoid:

- **Modules are a convention, not a keyword.** A file builds a `local` table, fills it, and `return`s it. Whatever you don't return is private.
- **Objects are metatables.** No `class`. `Meta.__index = Meta` plus `setmetatable(obj, Meta)` gives you method lookup, and that's the whole mechanism.
- **The colon is sugar.** `obj:method(x)` is `Table.method(obj, x)`. Dot to construct, colon to operate.
- **Tables key on anything,** including other tables, which made undo snapshots trivial to index by pile.
- **References over copies.** Cards are unique, so a snapshot stores pointers to them, and undo stays cheap.
- **`dt` generalizes.** The same delta-time habit that keeps a ball honest also drives a frame-rate-independent slide tween.
- **Functions are values.** Handing a little math function to a `render` loop is the cleanest synth I've written.

If you want the even smaller starting point that got me here, the [Pong write-up](/blog/make-pong-with-love2d-and-lua/) covers the game loop, delta time, and collision from scratch, and then the series carries on into a [computer opponent](/blog/pong-computer-opponent-love2d-lua/) and beyond. Solitaire was the natural next rung: same framework, real structure, and the two Lua ideas I'd been dodging. `[ DEAL OK ]`

## The full source

Here's the whole game, all six files. It's the code every excerpt above was pulled from, so you can read it end to end or just grab it and run it. The only thing not shown is the art: drop [Kenney](https://kenney.nl/)'s CC0 playing-card pack into a `Cards/` folder next to `conf.lua` (one PNG per card, named like `cardHeartsA.png` and `cardBack_blue1.png`), then run `love .` from the project folder.

```text
card-game/
├── conf.lua
├── main.lua
├── src/
│   ├── deck.lua
│   ├── pile.lua
│   ├── game.lua
│   └── sfx.lua
└── Cards/        # Kenney's card PNGs go here
```

### conf.lua

```lua
-- conf.lua
-- LÖVE reads this file BEFORE the game starts to configure the window and
-- engine. It's optional, but it's the clean place to set window size/title
-- instead of doing it in code. LÖVE calls love.conf(t) and hands us a table
-- `t` full of default settings; we just overwrite the fields we care about.

function love.conf(t)
    t.window.title  = "Klondike Solitaire"
    t.window.width  = 1280
    t.window.height = 800
    t.version       = "11.5"   -- the LÖVE version this game targets
    t.console       = false     -- (Windows only) set true to get a debug console
end
```

### main.lua

```lua
-- main.lua
-- Entry point. LÖVE calls these callbacks on a ~60 fps loop:
--   love.load()      -> once at startup
--   love.update(dt)  -> every frame
--   love.draw()      -> every frame, after update
--
-- STEP 6: the finale — win detection, double-click auto-send, legal-target
-- highlighting, and a move counter. All in game.lua; main.lua stays a thin shim.

local Game = require("src.game")
local Sfx  = require("src.sfx")

local game   -- our single Game instance

function love.load()
    love.graphics.setBackgroundColor(0.10, 0.45, 0.25)
    love.window.setTitle("Klondike Solitaire")
    Sfx.load()          -- synthesize the sound effects once, up front
    game = Game.new()
end

function love.update(dt)
    game:update(dt)   -- advance any in-flight card animations
end

function love.draw()
    game:draw()

    love.graphics.setColor(1, 1, 1)
    love.graphics.print("Double-click to auto-send.  Moves: " .. game.moves ..
        "   |   U / Ctrl+Z = undo,  N = new deal,  Esc = quit.", 10, 12)
end

-- LÖVE mouse callbacks. `button` 1 = left. We ignore other buttons for now.
function love.mousepressed(x, y, button)
    if button == 1 then
        game:mousepressed(x, y)
    end
end

function love.mousereleased(x, y, button)
    if button == 1 then
        game:mousereleased(x, y)
    end
end

function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif key == "n" then
        game = Game.new()   -- throw away the old board, deal a fresh one
    elseif key == "u" then
        game:undo()
    elseif key == "z" and (love.keyboard.isDown("lctrl", "rctrl", "lgui", "rgui")) then
        game:undo()         -- Ctrl+Z (or Cmd+Z on Mac) also undoes
    end
end
```

### src/deck.lua

```lua
-- src/deck.lua
-- ============================================================================
-- A MODULE. In Lua there are no classes or `import` keywords. A "module" is
-- just a file that builds a table, fills it with functions, and RETURNS it.
-- Whoever does `require("src.deck")` gets that returned table back.
--
-- The convention below (local table `Deck`, add functions to it, `return Deck`
-- at the bottom) is THE standard Lua module pattern. Keeping it `local` means
-- we don't leak anything into the global namespace — only what we return is
-- visible to the outside world.
-- ============================================================================

local Deck = {}

-- ----------------------------------------------------------------------------
-- Tables as ARRAYS.
-- A Lua table with consecutive integer keys 1,2,3... IS an array. Note it
-- starts at 1, NOT 0 — Lua is 1-based. `#SUITS` gives the length (4).
-- These strings are chosen to match the Kenney filenames exactly:
--   "Cards/card" .. "Hearts" .. "A" .. ".png"  ->  "Cards/cardHeartsA.png"
-- ----------------------------------------------------------------------------
local SUITS = { "Clubs", "Diamonds", "Hearts", "Spades" }
local RANKS = { "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" }

-- Tables as a SET / dictionary. Here the keys are strings and the values are
-- booleans. `RED["Hearts"]` -> true; `RED["Clubs"]` -> nil (which is falsey).
-- This is the idiomatic Lua way to ask "is this suit red?".
local RED = { Hearts = true, Diamonds = true }

-- A plain local helper function (not exported — it's private to this file).
-- It maps a rank token to a numeric value we'll use for game logic later
-- (Ace-low = 1 ... King = 13). `tonumber("10")` converts the string "10" to 10.
local function rankValue(rank)
    if     rank == "A" then return 1
    elseif rank == "J" then return 11
    elseif rank == "Q" then return 12
    elseif rank == "K" then return 13
    else                    return tonumber(rank)   -- "2".."10"
    end
end

-- ----------------------------------------------------------------------------
-- Deck.new() -> builds and returns a fresh, ordered 52-card deck.
-- Each "card" is a table (a little record) describing one card. Tables are how
-- you make structured objects in Lua — there's no `struct` or `class`.
-- ----------------------------------------------------------------------------
function Deck.new()
    local cards = {}   -- start with an empty array

    -- `ipairs` walks an array in order, giving (index, value) each loop.
    -- We don't need the index here, so we name it `_` by convention.
    for _, suit in ipairs(SUITS) do
        for _, rank in ipairs(RANKS) do
            local card = {
                suit   = suit,
                rank   = rank,
                value  = rankValue(rank),
                -- `RED[suit] and "red" or "black"` is Lua's ternary idiom:
                -- if RED[suit] is truthy -> "red", otherwise -> "black".
                color  = RED[suit] and "red" or "black",
                faceUp = false,   -- cards start face-down; we'll flip them later
                -- Build the filename by concatenating strings with `..`,
                -- then load the PNG into an Image we can draw.
                image  = love.graphics.newImage("Cards/card" .. suit .. rank .. ".png"),
            }
            -- table.insert appends to the end of the array (like push).
            table.insert(cards, card)
        end
    end

    return cards   -- an array of 52 card tables, in order
end

-- ----------------------------------------------------------------------------
-- Deck.shuffle(cards) -> shuffles the array IN PLACE (modifies the table you
-- pass in; returns nothing). This is the Fisher–Yates shuffle, the correct,
-- unbiased way to shuffle. Walk from the last index down to the 2nd, and swap
-- each element with a random one at or before it.
--
-- `love.math.random(i)` returns an integer in 1..i (LÖVE's RNG; it's already
-- seeded for you, unlike plain Lua's math.random). The one-line swap
--   a, b = b, a
-- uses Lua's multiple-assignment — no temp variable needed.
-- ----------------------------------------------------------------------------
function Deck.shuffle(cards)
    for i = #cards, 2, -1 do          -- for i = start, stop, step
        local j = love.math.random(i)
        cards[i], cards[j] = cards[j], cards[i]
    end
end

-- Handy for debugging/printing: "Ah", "10s", "Kd" ... (rank + first suit letter)
function Deck.short(card)
    return card.rank .. string.sub(card.suit, 1, 1):lower()
end

-- Export the module table so `require` hands it back to the caller.
return Deck
```

### src/pile.lua

```lua
-- src/pile.lua
-- ============================================================================
-- A PILE is a stack of cards that lives at a screen position: the stock, the
-- waste, each foundation, each tableau column. They all behave the same way
-- (push a card on top, peek/pop the top), so they share ONE type.
--
-- This file is also our introduction to OBJECTS in Lua via METATABLES — the
-- one genuinely distinctive Lua feature. There is no `class` keyword; you
-- build the behaviour yourself. Here's the whole trick:
--
--   1. `Pile` is a plain table that holds the shared methods (push, pop, ...).
--   2. `Pile.__index = Pile` — `__index` is a special metatable field. It says:
--      "if someone looks up a key on an object and it's MISSING, go look it up
--      on Pile instead."
--   3. `setmetatable(obj, Pile)` wires a new object to that rule.
--
-- Result: `myPile.cards` is found directly on the object, but `myPile:push(c)`
-- is NOT on the object — so Lua falls through `__index` to `Pile.push`. That
-- fall-through is exactly how method lookup works. No classes required.
--
-- The COLON `:` is sugar. `pile:push(card)` means `Pile.push(pile, card)` —
-- the colon silently passes the object as the first argument, which we name
-- `self`. Defining with `function Pile:push(...)` mirrors that on the other side.
-- ============================================================================

local Pile = {}
Pile.__index = Pile

-- Constructor. Convention: a `.new` function (dot, not colon) that builds a
-- fresh table, attaches the metatable, fills in fields, and returns it.
--   kind  : "stock" | "waste" | "foundation" | "tableau" (handy for rules later)
--   x, y  : where the pile's FIRST card is drawn
--   fanDX/fanDY : how far each subsequent card is offset. 0,0 = stacked on top
--                 (stock/waste/foundation); 0,30 = fanned downward (tableau).
function Pile.new(kind, x, y, fanDX, fanDY)
    local self = setmetatable({}, Pile)
    self.kind  = kind
    self.x, self.y = x, y
    self.fanDX = fanDX or 0     -- `a or 0`: default to 0 when the arg is nil
    self.fanDY = fanDY or 0
    self.cards = {}             -- the stack, bottom = index 1, top = index #cards
    return self
end

-- From here down, every `function Pile:name(...)` receives the pile as `self`.

function Pile:push(card)
    table.insert(self.cards, card)          -- append = put on top
end

function Pile:pop()
    return table.remove(self.cards)         -- remove & return the top card
end

function Pile:peek()
    return self.cards[#self.cards]          -- top card without removing (nil if empty)
end

function Pile:count()
    return #self.cards
end

function Pile:isEmpty()
    return #self.cards == 0
end

-- Where should the i-th card in this pile be drawn? Base position plus the fan
-- offset times how far down the stack it is. This one function is why tableau
-- columns fan out and the stock stays in a neat stack — same code, different
-- fanDX/fanDY set at construction time.
function Pile:cardPos(i)
    return self.x + (i - 1) * self.fanDX,
           self.y + (i - 1) * self.fanDY
end

-- Remove cards from index `i` to the top and return them (in order) as a new
-- array. Used to pick up a run of cards: click a face-up card in a tableau
-- column and you lift it AND everything stacked on top of it.
--
-- Note the trick: we repeatedly remove at the SAME index `i`. table.remove
-- shifts everything down, so what was at i+1 becomes the new i — removing at
-- `i` again grabs it next. They come out in their original bottom-to-top order.
function Pile:removeFrom(i)
    local moved = {}
    while #self.cards >= i do
        table.insert(moved, self.cards[i])
        table.remove(self.cards, i)
    end
    return moved
end

-- Push a whole array of cards onto the top, preserving order.
function Pile:pushAll(cards)
    for _, card in ipairs(cards) do
        table.insert(self.cards, card)
    end
end

return Pile
```

### src/sfx.lua

```lua
-- src/sfx.lua
-- ============================================================================
-- Sound effects — generated entirely IN CODE, no audio files. This is a nice
-- window into how digital sound works: a sound is just a long list of numbers
-- ("samples"), each the speaker's position at one instant. Play 44,100 of them
-- per second and your ear hears a continuous wave.
--
--   sample rate : how many numbers per second (44100 Hz = CD quality)
--   sample      : one amplitude value, here in the range -1 .. 1
--   frequency   : cycles per second of a sine wave = the PITCH you hear
--   envelope    : how loudness changes over time (a sharp fade-out = a "pluck")
--
-- We fill a SoundData buffer sample-by-sample, then wrap it in an audio Source
-- we can play. math.sin gives us a pure tone; multiplying by a decaying
-- envelope shapes it into a click, a thud, or a chime.
-- ============================================================================

local Sfx = {}

local RATE = 44100          -- samples per second
local TAU  = math.pi * 2    -- one full sine cycle is 2*pi radians

local sounds = {}           -- name -> audio Source

-- Build one Source by evaluating `fn(t)` at every sample. `t` is the time in
-- seconds; `fn` returns an amplitude in -1..1. We clamp for safety (clipping a
-- too-loud sample would pop).
local function render(duration, fn)
    local n    = math.max(1, math.floor(RATE * duration))
    local data = love.sound.newSoundData(n, RATE, 16, 1)   -- n samples, 16-bit, mono
    for i = 0, n - 1 do
        local t = i / RATE
        local a = fn(t)
        if a >  1 then a =  1 end
        if a < -1 then a = -1 end
        data:setSample(i, a)
    end
    return love.audio.newSource(data, "static")
end

-- Called once at startup (after LÖVE is up, so the audio API exists).
function Sfx.load()
    -- CLICK: a short, high blip for dealing from the stock. `math.exp(-t*45)`
    -- is a fast exponential fade — loud at t=0, near silent a moment later.
    sounds.click = render(0.06, function(t)
        return 0.35 * math.exp(-t * 45) * math.sin(TAU * 900 * t)
    end)

    -- PLACE: a soft, low thud for landing a card on the tableau. Lower pitch
    -- (180 Hz) + slightly slower fade reads as "a card settling down".
    sounds.place = render(0.12, function(t)
        return 0.40 * math.exp(-t * 22) * math.sin(TAU * 180 * t)
    end)

    -- CHIME: a pleasant ring for sending a card to a foundation. Two sine
    -- partials a perfect fifth apart (880 Hz + 1320 Hz) make it sound bell-like.
    sounds.chime = render(0.50, function(t)
        local env = math.exp(-t * 6)
        return 0.25 * env * (math.sin(TAU * 880 * t) + 0.5 * math.sin(TAU * 1320 * t))
    end)

    -- WIN: a quick 4-note ascending arpeggio (C-E-G-C). We pick the note from
    -- the current time slice, so the pitch steps up as the sound plays.
    local notes = { 523.25, 659.25, 783.99, 1046.50 }   -- C5 E5 G5 C6, in Hz
    sounds.win = render(0.90, function(t)
        local slot   = math.min(#notes, math.floor(t / 0.18) + 1)
        local localT = t - (slot - 1) * 0.18            -- time since this note began
        return 0.28 * math.exp(-localT * 5) * math.sin(TAU * notes[slot] * t)
    end)
end

-- Play a named sound. stop() first so rapid re-triggers restart cleanly instead
-- of being ignored (a Source that's already playing won't replay on its own).
function Sfx.play(name)
    local s = sounds[name]
    if s then
        s:stop()
        s:play()
    end
end

return Sfx
```

### src/game.lua

```lua
-- src/game.lua
-- ============================================================================
-- The GAME owns the whole board: stock, waste, 4 foundations, 7 tableau piles.
-- It deals a shuffled deck into the classic Klondike layout and knows how to
-- draw everything. (Rules/interaction come in later steps.)
--
-- Same metatable-object pattern as Pile: `Game` holds the methods, each
-- instance is `setmetatable({}, Game)`, and methods take `self`.
-- ============================================================================

local Deck = require("src.deck")
local Pile = require("src.pile")
local Sfx  = require("src.sfx")

local Game = {}
Game.__index = Game

-- ---- Layout constants -------------------------------------------------------
-- Defining these once, up top, is far better than sprinkling magic numbers
-- through the code. Change CARD_SCALE and the entire board re-flows.
local CARD_SCALE  = 0.9
local CARD_W      = 140 * CARD_SCALE   -- source cards are 140x190 px
local CARD_H      = 190 * CARD_SCALE
local GAP         = 18                 -- horizontal gap between columns
local MARGIN      = 40                 -- outer margin from the window edge
local TABLEAU_FAN = 30                 -- vertical offset per fanned tableau card
local ANIM_DUR    = 0.18               -- seconds for a card to slide into place

-- Linear interpolation: at t=0 return a, at t=1 return b, blend in between.
local function lerp(a, b, t)
    return a + (b - a) * t
end

-- Ease-out curve: fast at first, slowing as it arrives. Makes motion feel
-- natural instead of robotically linear. (1 - (1-t)^2 is a simple quadratic ease.)
local function easeOut(t)
    return 1 - (1 - t) * (1 - t)
end

-- The board is a 7-column grid. This maps a column number (1..7) to its x.
-- Stock=col1, Waste=col2, col3 is a spacer, Foundations=cols 4-7. Tableau
-- piles sit under all 7 columns. A local helper, private to this file.
local function columnX(col)
    return MARGIN + (col - 1) * (CARD_W + GAP)
end

-- ---- Construction / dealing -------------------------------------------------
function Game.new()
    local self = setmetatable({}, Game)

    self.scale = CARD_SCALE
    -- One shared card-back image for every face-down card.
    self.back  = love.graphics.newImage("Cards/cardBack_blue1.png")

    local topY = MARGIN                     -- y of the top row (stock/waste/foundations)
    local tabY = MARGIN + CARD_H + GAP      -- y where the tableau begins, below it

    -- Stock & waste stack in place (fan 0,0). Foundations too.
    self.stock = Pile.new("stock", columnX(1), topY)
    self.waste = Pile.new("waste", columnX(2), topY)

    self.foundations = {}
    for i = 1, 4 do
        self.foundations[i] = Pile.new("foundation", columnX(3 + i), topY)
    end

    -- Tableau columns fan DOWNWARD: fanDX=0, fanDY=TABLEAU_FAN.
    self.tableau = {}
    for i = 1, 7 do
        self.tableau[i] = Pile.new("tableau", columnX(i), tabY, 0, TABLEAU_FAN)
    end

    -- Build one shuffled deck, then deal it.
    local deck = Deck.new()
    Deck.shuffle(deck)

    -- Klondike deal: column c gets c cards; only the LAST (top) card is face-up.
    -- `table.remove(deck)` pulls from the end of the array (the top of the deck).
    for c = 1, 7 do
        for row = 1, c do
            local card = table.remove(deck)
            card.faceUp = (row == c)        -- true only for the final card in the column
            self.tableau[c]:push(card)
        end
    end

    -- Everything left (24 cards) becomes the stock, all face-down.
    for _, card in ipairs(deck) do
        card.faceUp = false
        self.stock:push(card)
    end

    self.moves     = 0      -- successful moves this game (for the HUD)
    self.lastTime  = -1     -- when the previous click happened (double-click timing)
    self.lastPile  = nil    -- what the previous click landed on
    self.history   = {}     -- stack of board snapshots, for Undo
    self.wonAnnounced = false   -- so the win chime plays exactly once

    return self
end

-- Play the win fanfare once, the first frame the game is won. Called after
-- every committed move.
function Game:checkWin()
    if self:hasWon() and not self.wonAnnounced then
        self.wonAnnounced = true
        Sfx.play("win")
    end
end

-- ---- Hit-testing helpers ----------------------------------------------------
-- Is the point (px, py) inside the rectangle (x, y, w, h)? Plain geometry.
local function pointInRect(px, py, x, y, w, h)
    return px >= x and px <= x + w and py >= y and py <= y + h
end

-- The bounding box a pile occupies on screen, including its fan and always at
-- least one card slot (so an EMPTY pile is still a droppable target).
local function pileBounds(pile)
    local n = math.max(pile:count(), 1)
    return pile.x,
           pile.y,
           CARD_W + (n - 1) * pile.fanDX,
           CARD_H + (n - 1) * pile.fanDY
end

-- ---- The rules --------------------------------------------------------------
-- These pure helper functions answer "is this move legal?". Keeping them small
-- and free of side effects makes the rules easy to read and to trust.

-- Tableau: you may drop the head-of-run `card` onto a column if...
local function canPlaceOnTableau(card, pile)
    if pile:isEmpty() then
        return card.value == 13            -- ...it's empty and the card is a King, or
    end
    local top = pile:peek()
    return card.color ~= top.color         -- ...opposite color (red on black / black on red)
       and card.value == top.value - 1     --    and exactly one rank lower.
end

-- Foundation: build UP by suit from the Ace. Only ever one card at a time.
local function canPlaceOnFoundation(card, pile)
    if pile:isEmpty() then
        return card.value == 1             -- empty foundation accepts only an Ace, or
    end
    local top = pile:peek()
    return card.suit == top.suit           -- same suit
       and card.value == top.value + 1     -- and the next rank up.
end

-- Is dropping the held `cards` onto `target` legal? Dispatches on pile kind.
-- Only the FIRST (bottom) card of the run needs checking — the rest of a
-- tableau run is already a valid alternating sequence by construction.
function Game:isLegalDrop(target, cards)
    if target.kind == "foundation" then
        return #cards == 1 and canPlaceOnFoundation(cards[1], target)
    elseif target.kind == "tableau" then
        return canPlaceOnTableau(cards[1], target)
    end
    return false
end

-- After cards leave a tableau column, the card newly exposed on top might be
-- face-down. If so, flip it face-up — that's the little reveal Solitaire does.
local function flipExposed(pile)
    if pile.kind == "tableau" and not pile:isEmpty() then
        local top = pile:peek()
        top.faceUp = true
    end
end

-- ---- Mouse interaction ------------------------------------------------------
-- Clicking the stock: deal its top card to the waste (face up). If the stock is
-- empty, recycle the whole waste back into it, face down. (Draw-1 rule.)
function Game:clickStock()
    self:pushHistory(self:snapshot())   -- save state before we change anything
    if self.stock:isEmpty() then
        while not self.waste:isEmpty() do
            local card = self.waste:pop()
            card.faceUp = false
            self.stock:push(card)
        end
    else
        local fromX, fromY = self.stock.x, self.stock.y
        local card = self.stock:pop()
        card.faceUp = true
        self.waste:push(card)
        self:animateCardFrom(card, fromX, fromY)   -- slide stock -> waste
    end
    Sfx.play("click")
end

-- Begin dragging: lift cards[index..top] off `pile` into `self.drag`, and
-- remember the grab offset so the card doesn't jump to the cursor's corner.
function Game:startDrag(pile, index, mx, my)
    local x, y = pile:cardPos(index)
    -- Snapshot BEFORE we lift the cards off the source. We stash it as
    -- "pending" and only push it to history if the drop turns out to be legal
    -- (a snap-back to where you started shouldn't count as an undoable move).
    self.pendingSnapshot = self:snapshot()
    self.drag = {
        cards  = pile:removeFrom(index),   -- the run we're now holding
        source = pile,                     -- where to put it back if we miss
        offX   = mx - x,                   -- cursor-to-card-corner offset...
        offY   = my - y,                   -- ...so the grab point stays under the mouse
    }
end

-- Which grabbable card is under the cursor? Returns (pile, index) for the head
-- of the run you'd pick up, or nil. Extracted so BOTH dragging and double-click
-- can reuse the exact same "what did I click?" logic. Stock is handled apart.
function Game:grabbableAt(mx, my)
    -- Waste & foundations expose only their top card.
    if not self.waste:isEmpty()
       and pointInRect(mx, my, self.waste.x, self.waste.y, CARD_W, CARD_H) then
        return self.waste, self.waste:count()
    end
    for i = 1, 4 do
        local f = self.foundations[i]
        if not f:isEmpty()
           and pointInRect(mx, my, f.x, f.y, CARD_W, CARD_H) then
            return f, f:count()
        end
    end
    -- Tableau: top card down; the visually-topmost card wins the click.
    for c = 1, 7 do
        local pile = self.tableau[c]
        for i = pile:count(), 1, -1 do
            local x, y = pile:cardPos(i)
            if pointInRect(mx, my, x, y, CARD_W, CARD_H) then
                if pile.cards[i].faceUp then
                    return pile, i
                end
                return nil          -- a face-down card blocks; nothing grabbable here
            end
        end
    end
    return nil
end

-- Try to move a pile's TOP card straight onto a matching foundation. Returns
-- true if it found a home. Powers double-click auto-send.
function Game:autoSendToFoundation(pile)
    local card = pile:peek()
    for i = 1, 4 do
        if canPlaceOnFoundation(card, self.foundations[i]) then
            self:pushHistory(self:snapshot())   -- save before moving
            local fromX, fromY = pile:cardPos(pile:count())   -- where it sits now
            self.foundations[i]:push(pile:pop())
            flipExposed(pile)
            self:animateCardFrom(card, fromX, fromY)          -- fly it to the foundation
            self.moves = self.moves + 1
            Sfx.play("chime")
            self:checkWin()
            return true
        end
    end
    return false
end

-- Called by love.mousepressed. Handles stock clicks, double-click auto-send,
-- and starting a drag — in that order.
function Game:mousepressed(mx, my)
    if self.drag then return end   -- already holding something

    -- Stock: click to deal/recycle (not a drag).
    local sx, sy, sw, sh = pileBounds(self.stock)
    if pointInRect(mx, my, sx, sy, sw, sh) then
        self:clickStock()
        self.moves = self.moves + 1
        return
    end

    local pile, index = self:grabbableAt(mx, my)
    if not pile then return end

    -- Double-click detection: two clicks on the SAME pile within the window.
    -- love.timer.getTime() returns seconds since the game started (a float).
    local now = love.timer.getTime()
    local isDoubleClick = (self.lastPile == pile) and (now - self.lastTime < 0.35)
    self.lastTime = now
    self.lastPile = pile

    -- A double-click on a single TOP card auto-sends it to a foundation.
    if isDoubleClick and index == pile:count() then
        if self:autoSendToFoundation(pile) then
            self.lastPile = nil            -- consume it so a 3rd click isn't a "double"
            return
        end
    end

    self:startDrag(pile, index, mx, my)
end

-- The game is won when all 52 cards have reached the foundations.
function Game:hasWon()
    local total = 0
    for i = 1, 4 do
        total = total + self.foundations[i]:count()
    end
    return total == 52
end

-- ---- Undo (state snapshots) -------------------------------------------------
-- Every pile on the board, as one flat list. Handy for iterating "everything".
function Game:allPiles()
    return { self.stock, self.waste,
             self.foundations[1], self.foundations[2],
             self.foundations[3], self.foundations[4],
             self.tableau[1], self.tableau[2], self.tableau[3], self.tableau[4],
             self.tableau[5], self.tableau[6], self.tableau[7] }
end

-- A snapshot records WHICH cards are in each pile, in order, plus each card's
-- faceUp flag (which changes over time). We do NOT copy the card tables — cards
-- are unique and permanent, so we just keep references. That makes a snapshot
-- cheap: a few small arrays of pointers, not 52 cloned images.
--
-- We use the pile object itself as a table KEY (`snap.piles[pile] = ...`). In
-- Lua any value, including a table, can be a key — very handy here.
function Game:snapshot()
    local snap = { moves = self.moves, piles = {} }
    for _, pile in ipairs(self:allPiles()) do
        local entries = {}
        for i, card in ipairs(pile.cards) do
            entries[i] = { card = card, faceUp = card.faceUp }
        end
        snap.piles[pile] = entries
    end
    return snap
end

-- Rebuild the board from a snapshot: rebuild each pile's `cards` array and
-- reset each card's faceUp to what it was at snapshot time.
function Game:restore(snap)
    for _, pile in ipairs(self:allPiles()) do
        local entries = snap.piles[pile]
        local cards = {}
        for i, e in ipairs(entries) do
            e.card.faceUp = e.faceUp
            e.card.animT  = nil        -- cancel any in-flight animation (Step 8)
            cards[i] = e.card
        end
        pile.cards = cards
    end
    self.moves = snap.moves
    self.wonAnnounced = self:hasWon()   -- so re-winning after an undo chimes again
end

-- Save the CURRENT state so we can come back to it. Call this BEFORE mutating.
function Game:pushHistory(snap)
    table.insert(self.history, snap)
    -- Keep the stack from growing without bound over a long game.
    if #self.history > 300 then
        table.remove(self.history, 1)   -- drop the oldest
    end
end

-- Undo: pop the most recent snapshot and restore it. No-op if history is empty.
function Game:undo()
    local snap = table.remove(self.history)   -- remove & return the top
    if snap then
        self:restore(snap)
    end
end

-- ---- Animation (dt-based tweening) ------------------------------------------
-- Tag a card so it slides in from (fromX, fromY) toward its real slot. We store
-- three transient fields right on the card table: a progress value animT that
-- runs 0 -> 1, and the start position. Its DESTINATION isn't stored — it's just
-- wherever the card naturally sits, computed fresh at draw time.
function Game:animateCardFrom(card, fromX, fromY)
    card.animT     = 0
    card.animFromX = fromX
    card.animFromY = fromY
end

-- love.update runs every frame with dt = seconds since the last frame. Framerate
-- varies, so we ALWAYS scale motion by dt — that keeps speed identical whether
-- the machine runs at 30 or 144 fps. Advance every animating card's progress;
-- when it reaches 1, clear the tag and the card renders normally again.
function Game:update(dt)
    for _, pile in ipairs(self:allPiles()) do
        for _, card in ipairs(pile.cards) do
            if card.animT then
                card.animT = card.animT + dt / ANIM_DUR
                if card.animT >= 1 then
                    card.animT = nil   -- animation finished
                end
            end
        end
    end
end

-- Which pile can we DROP on at (mx, my)? Only tableau + foundations are valid
-- drop targets (you never drop onto stock/waste). Excludes the source pile.
function Game:dropTargetAt(mx, my, source)
    local targets = { self.tableau[1], self.tableau[2], self.tableau[3],
                      self.tableau[4], self.tableau[5], self.tableau[6],
                      self.tableau[7], self.foundations[1], self.foundations[2],
                      self.foundations[3], self.foundations[4] }
    for _, p in ipairs(targets) do
        if p ~= source then
            local x, y, w, h = pileBounds(p)
            if pointInRect(mx, my, x, y, w, h) then
                return p
            end
        end
    end
    return nil
end

-- Called by love.mousereleased. Drop the held cards on a target, or send them
-- home if we didn't land on one. (No legality checks yet — that's Step 5.)
function Game:mousereleased(mx, my)
    if not self.drag then return end
    local drag = self.drag
    self.drag = nil                                  -- we're no longer holding anything

    local target = self:dropTargetAt(mx, my, drag.source)
    if target and self:isLegalDrop(target, drag.cards) then
        self:pushHistory(self.pendingSnapshot)       -- real move: commit the snapshot
        target:pushAll(drag.cards)
        flipExposed(drag.source)                     -- reveal whatever we uncovered
        self.moves = self.moves + 1
        Sfx.play(target.kind == "foundation" and "chime" or "place")
        self:checkWin()
    else
        drag.source:pushAll(drag.cards)              -- illegal or missed: put it back
    end

    -- Wherever the cards ended up, slide them there from where the mouse let go.
    -- (In the snap-back case this animates the "return home" too — for free.)
    local baseX, baseY = mx - drag.offX, my - drag.offY
    for i, card in ipairs(drag.cards) do
        self:animateCardFrom(card, baseX, baseY + (i - 1) * TABLEAU_FAN)
    end

    self.pendingSnapshot = nil
end

-- ---- Drawing ----------------------------------------------------------------
-- Draw one card at (x, y): its face if face-up, otherwise the shared back.
function Game:drawCard(card, x, y)
    love.graphics.setColor(1, 1, 1)                     -- white = draw image untinted
    local img = card.faceUp and card.image or self.back
    love.graphics.draw(img, x, y, 0, self.scale, self.scale)
end

-- Draw a card at its slot (x, y) — but if it's mid-animation, draw it partway
-- between its start position and that slot instead. (x, y) is the DESTINATION;
-- easeOut(animT) is how far along the slide we are.
function Game:drawCardInSlot(card, x, y)
    if card.animT then
        local e = easeOut(card.animT)
        x = lerp(card.animFromX, x, e)
        y = lerp(card.animFromY, y, e)
    end
    self:drawCard(card, x, y)
end

-- Draw a faint rounded outline where an empty pile sits, so the slot is visible.
local function drawPlaceholder(pile)
    love.graphics.setColor(1, 1, 1, 0.25)               -- 4th number = alpha (transparency)
    love.graphics.rectangle("line", pile.x, pile.y, CARD_W, CARD_H, 6, 6)
end

function Game:draw()
    -- Top row: show a placeholder for any empty slot, then the top card if present.
    local topRow = { self.stock, self.waste,
                     self.foundations[1], self.foundations[2],
                     self.foundations[3], self.foundations[4] }
    for _, p in ipairs(topRow) do
        if p:isEmpty() then
            drawPlaceholder(p)
        else
            -- Stock/waste/foundation are stacked, so we only see the TOP card.
            self:drawCardInSlot(p:peek(), p.x, p.y)
        end
    end

    -- Tableau: draw EVERY card in each column, fanned down via pile:cardPos(i).
    for c = 1, 7 do
        local pile = self.tableau[c]
        if pile:isEmpty() then
            drawPlaceholder(pile)
        else
            for i, card in ipairs(pile.cards) do
                local x, y = pile:cardPos(i)
                self:drawCardInSlot(card, x, y)
            end
        end
    end

    -- While dragging: outline every pile the held run could legally land on.
    -- A cheap, effective "affordance" — the board tells you where moves exist.
    if self.drag then
        local targets = { self.tableau[1], self.tableau[2], self.tableau[3],
                          self.tableau[4], self.tableau[5], self.tableau[6],
                          self.tableau[7], self.foundations[1], self.foundations[2],
                          self.foundations[3], self.foundations[4] }
        for _, p in ipairs(targets) do
            if p ~= self.drag.source and self:isLegalDrop(p, self.drag.cards) then
                local x, y, w, h = pileBounds(p)
                love.graphics.setColor(1, 1, 0.3, 0.9)              -- soft yellow
                love.graphics.setLineWidth(3)
                love.graphics.rectangle("line", x - 2, y - 2, w + 4, h + 4, 8, 8)
                love.graphics.setLineWidth(1)                       -- reset for later draws
            end
        end
    end

    -- The card(s) in hand, drawn LAST so they float above the board and follow
    -- the cursor. We read the live mouse position here each frame.
    if self.drag then
        local mx, my = love.mouse.getPosition()
        local baseX, baseY = mx - self.drag.offX, my - self.drag.offY
        for i, card in ipairs(self.drag.cards) do
            self:drawCard(card, baseX, baseY + (i - 1) * TABLEAU_FAN)
        end
    end

    -- Win banner, on top of absolutely everything.
    if self:hasWon() then
        local w, h = love.graphics.getDimensions()
        love.graphics.setColor(0, 0, 0, 0.6)                       -- dim the board
        love.graphics.rectangle("fill", 0, h / 2 - 60, w, 120)
        love.graphics.setColor(1, 1, 0.4)
        -- printf draws text in a box and can center it horizontally.
        love.graphics.printf("YOU WIN!", 0, h / 2 - 40, w, "center")
        love.graphics.printf("Press N for a new game", 0, h / 2 + 4, w, "center")
    end
end

return Game
```
