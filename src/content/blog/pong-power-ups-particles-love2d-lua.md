---
title: 'Pong, Part Five: power-ups (and a world that grows)'
description: 'The finale. Spawned pickups, timed effects, and a particle burst generated in code, built on the one idea that ties them together: entities with lifetimes. Ends with the complete main.lua, all five parts in one listing.'
pubDate: 'Jul 2 2026'
tags: ['LÖVE', 'Love2D', 'Lua', 'Game Dev', 'Pong', 'Tutorial']
---

Here is where the series has been. [Part One](/blog/make-pong-with-love2d-and-lua/) built two player Pong. [Part Two](/blog/pong-computer-opponent-love2d-lua/) taught a paddle to play itself, on the idea that an AI is just input you do not type. [Part Three](/blog/pong-predictive-ai-difficulty-love2d-lua/) made that AI predict the ball and gave it Easy, Medium, and Hard. [Part Four](/blog/pong-attract-mode-retro-font-love2d-lua/) let the title screen play itself and put a real arcade font on it. Four parts, and the game has grown from a blank window into something that looks and feels like a cabinet.

For the finale I add the thing that turns a clean game into a toy: power-ups. And to do it I cross a line the series has not crossed yet.

> Until now the world held exactly two paddles and a ball, forever. Today it holds things that are born, live for a few seconds, and die.

That is the real lesson of this post, bigger than power-ups themselves: entities with lifetimes. A pickup appears, waits to be grabbed, and vanishes. An effect switches on, runs for eight seconds, and switches off. Once you can model a thing that exists for a while, you can build almost anything, and it turns out the `dt` countdown I have used for screen shake since Part One is the entire trick.

I am going to build three power-ups, grow your paddle, shrink the opponent's, speed the ball, spawn them on a timer, collect them when the ball hits one, and celebrate with a particle burst generated in code, no new download, just like the beeps. At the very end: the complete `main.lua`, all five parts, in one listing.

## The shape of the feature

Before any code, the plan in plain words. Every few seconds a pickup appears somewhere in the middle of the field. When the ball touches it, the pickup is collected by whoever last hit the ball, and it grants that side a timed effect. Effects wear off on their own.

So I need three new nouns and one new verb: a pickup on the field, which has a position and a time left to live, a table of effects, which says what each one does and how to undo it, a list of active effects, each counting down its own timer, and the collect step where the ball meets a pickup.

None of this is hard. But one small thing has to change first, and it is the most important idea in the post.

## The refactor that makes it possible: per-paddle state

Here is a question that sounds trivial and is not. What is a paddle's height?

For four parts the answer was `PADDLE_H`, a constant, 90, the same for both, forever. That was fine because the two paddles were identical. But a grow power-up means one paddle is now taller than the other. The moment two paddles can differ, height stops being a shared constant and becomes each paddle's own state:

```lua
-- before: one shared constant did double duty
local left  = { x = ..., y = 0, score = 0 }

-- after: each paddle carries its own height, defaulting to the base
local left  = { x = ..., y = 0, score = 0, h = PADDLE_H }
local right = { x = ..., y = 0, score = 0, h = PADDLE_H }
```

`PADDLE_H` does not go away. It becomes the default and the base I revert to. But every place in the code that asked how tall is this paddle now has to ask the paddle, not the constant. That is a handful of edits. The collision test, the bounce angle math, the AI's sense of its own center, the screen clamps, and the draw call all switch from `PADDLE_H` to `paddle.h`, or `left.h` and `right.h`:

```lua
-- collision (in stepRally) — ask each paddle its height:
overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE, left.x, left.y, PADDLE_W, left.h)

-- the AI's notion of its own center, and its clamp:
local paddleCenter = paddle.y + paddle.h / 2
paddle.y = math.max(0, math.min(WIN_H - paddle.h, paddle.y))

-- drawing:
love.graphics.rectangle("fill", p.x, p.y, PADDLE_W, p.h)
```

Two things worth saying about this. First, it is a pure refactor. With no power-ups active, every `paddle.h` equals `PADDLE_H` and the game plays exactly like Part Four. You can make this change, run it, and see nothing different. That is the sign of a good refactor.

Second, this is a pattern you will meet forever: state that was shared becomes per-entity the moment entities can differ. The same reasoning turns one `score` into `left.score` and `right.score`, or would turn one ball into a list of balls if you added multi-ball. Spotting this constant secretly wants to be a field is a real skill, and power-ups are a perfect place to learn it.

## Effects as a table (you knew this was coming)

If you read Part Three you can guess how I describe the power-ups: one table, one row per kind. Same philosophy as the `DIFFICULTIES` table, the logic lives in code, the feel lives in data. Each row says what it looks like, how long it lasts, and, this is the new part, two little functions: how to apply the effect and how to revert it.

```lua
local function paddleOf(side)  return (side == "left") and left or right end
local function otherSide(side) return (side == "left") and "right" or "left" end

local POWERUPS = {
  grow   = { label = "GROW",   color = {0.3, 1.0, 0.4}, duration = 8,
             apply  = function(side) paddleOf(side).h = PADDLE_H * 1.6 end,
             revert = function(side) paddleOf(side).h = PADDLE_H end },
  shrink = { label = "SHRINK", color = {1.0, 0.4, 0.3}, duration = 8,
             apply  = function(side) paddleOf(otherSide(side)).h = PADDLE_H * 0.55 end,
             revert = function(side) paddleOf(otherSide(side)).h = PADDLE_H end },
  fast   = { label = "FAST",   color = {0.4, 0.7, 1.0}, duration = 6,
             apply  = function() ball.boost = 1.5 end,
             revert = function() ball.boost = 1 end },
}
```

Read it and the whole design is right there. `apply` and `revert` both take the collector's side, and each row decides who it touches: `grow` grows your paddle, `shrink` shrinks the other paddle, `fast` speeds the ball for everyone. Want a fourth power-up? Add a row. That is the entire extension story, no new `if` ladders, no new draw code, just data.

Two supporting pieces make the effects work.

Fast needs a ball multiplier. I give the ball a `boost` field, normally `1`, and use it when I move the ball, so speeding up is one multiply and does not disturb the speed ramp from Part One:

```lua
ball.x = ball.x + ball.dx * ball.speed * ball.boost * dt
```

Someone has to earn the pickup. A power-up rewards whoever last touched the ball, so I record that in the bounce:

```lua
-- in bounceOffPaddle: a ball sent rightward (towardDir = 1) came off the LEFT paddle
ball.lastHit = (towardDir > 0) and "left" or "right"
```

and clear it on each serve, since a fresh rally has no last hitter yet, which neatly means a pickup sitting near the center cannot be collected by a serve before anyone has played it.

## Lifetimes: born, living, dying

Now the heart of it. A pickup is just a little table, a position and a `life` counter:

```lua
local function spawnPowerup()
    powerup = {
        kind = POWERUP_KINDS[love.math.random(#POWERUP_KINDS)],
        x    = WIN_W / 2 - POWERUP_SIZE / 2 + love.math.random(-140, 140),
        y    = love.math.random(60, WIN_H - 60 - POWERUP_SIZE),
        life = POWERUP_LIFETIME,
    }
end
```

I keep one pickup on the field at a time, `powerup` or `nil`, a deliberate simplification that keeps the whole system easy to reason about. And active effects live in a list, each an entry that remembers what it is, whose it is, and how long it has left:

```lua
local active = {}   -- list of { kind, side, timeLeft }
```

Everything happens in one function, `updatePowerups(dt)`, and it reads like the plain English plan from the top of the post. Age the active effects and undo any that hit zero. Then either age the pickup, collecting it if the ball is touching it and dropping it if it timed out, or count down to the next spawn.

```lua
local function updatePowerups(dt, silent)
    -- 1) tick active effects; when one runs out, undo it
    for i = #active, 1, -1 do
        local e = active[i]
        e.timeLeft = e.timeLeft - dt
        if e.timeLeft <= 0 then
            POWERUPS[e.kind].revert(e.side)
            table.remove(active, i)
            clampPaddles()
        end
    end

    -- 2) age the pickup, or count down to the next spawn
    if powerup then
        powerup.life = powerup.life - dt
        if powerup.life <= 0 then
            powerup = nil                               -- expired uncollected
        elseif ball.lastHit and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                         powerup.x, powerup.y, POWERUP_SIZE, POWERUP_SIZE) then
            collectPowerup(powerup, ball.lastHit, silent)
            powerup = nil
        end
    else
        spawnTimer = spawnTimer - dt
        if spawnTimer <= 0 then
            spawnPowerup()
            spawnTimer = POWERUP_INTERVAL
        end
    end
end
```

Look how much of this is just `x = x - dt` and did it hit zero yet. That is the exact rhythm of the screen shake from Part One, applied to the existence of things instead of a wobble. That is the whole idea of lifetimes. Two small notes: I loop the `active` list backwards so removing an item mid loop does not skip the next one, a classic gotcha, and `clampPaddles()` tugs a paddle back on screen after a size change so a grow near the wall cannot leave it poking out.

Collecting is where a pickup becomes an effect:

```lua
local function collectPowerup(p, side, silent)
    local def = POWERUPS[p.kind]
    for _, e in ipairs(active) do
        if e.kind == p.kind and e.side == side then
            e.timeLeft = def.duration                   -- already have it? just refresh
            spawnBurst(p.x + POWERUP_SIZE/2, p.y + POWERUP_SIZE/2, def.color, silent)
            return
        end
    end
    def.apply(side)
    table.insert(active, { kind = p.kind, side = side, timeLeft = def.duration })
    clampPaddles()
    spawnBurst(p.x + POWERUP_SIZE/2, p.y + POWERUP_SIZE/2, def.color, silent)
end
```

### An honest word about stacking

There is a deliberate simplification here, and it is more useful to name it than to hide it. Because every `revert` restores the absolute base height, `= PADDLE_H`, two height effects landing on the same paddle do not compose perfectly. If your paddle is grown and then the opponent shrinks it, whichever effect expires first snaps the paddle straight back to the base 90, even though the other is still running. No paddle ever gets stuck the wrong size, since the last revert always lands on the base and `clampPaddles` keeps it on screen. It just means overlapping height effects do not add up the way a physicist would want.

Is that a bug? For a tutorial, no. It is a choice. Composing effects properly, store the original, stack multipliers, revert relatively, is a real topic, and doing it here would triple the code for a case a player rarely hits. I keep one pickup on the field, and I set the spawn interval, 7 seconds, longer than the effects it competes with, so genuine same paddle overlap is uncommon. When you feel ready, making effects stack cleanly is a great exercise, and the table structure is already the right place to do it.

## Juice, generated in code

A power-up should pop. Time to meet LÖVE's particle system, and to keep faith with the series' no downloads streak, I will not ship a sprite for it. I generate the particle texture in code, exactly as I generate the beep sounds: a 4 by 4 white dot, built at load.

```lua
-- in love.load:
local dot = love.image.newImageData(4, 4)
dot:mapPixel(function() return 1, 1, 1, 1 end)   -- every pixel opaque white
particleImg = love.graphics.newImage(dot)

sparks = love.graphics.newParticleSystem(particleImg, 256)  -- room for 256 particles
sparks:setParticleLifetime(0.2, 0.6)   -- each spark lives 0.2–0.6s
sparks:setSpeed(60, 260)               -- flung at a random speed
sparks:setSpread(2 * math.pi)          -- in any direction
sparks:setSizes(1.5, 0.2)              -- shrink as they die
sparks:setSizeVariation(1)
```

A particle system is a little factory. You configure how particles are born and how they age, then tell it to `emit` a batch. Because the dot is white, I can tint each burst to the power-up's color:

```lua
local function spawnBurst(px, py, color, silent)
    sparks:setPosition(px, py)
    sparks:setColors(color[1], color[2], color[3], 1,  color[1], color[2], color[3], 0)
    sparks:emit(28)                                  -- fling 28 sparks
    if not silent then sndPaddle:stop(); sndPaddle:play() end
end
```

The two color stops, `...,1` then `...,0`, mean start opaque, fade to transparent over each particle's life. Then the system just needs a heartbeat and a draw, once each, every frame, regardless of state so a burst can finish even as the screen changes:

```lua
-- in love.update, near the top:
sparks:update(dt)

-- in love.draw, over the field (white, so we don't double-tint):
love.graphics.setColor(1, 1, 1)
love.graphics.draw(sparks)
```

No asset, no crash risk, and a satisfying green, red, or blue spray on every pickup. Same trick as the beeps, one dimension over.

## Wiring it into the loop

Two hook ups and it is done. First, run the power-up world from `love.update`, and here is a free win from Part Four: because attract mode already runs the real game behind the title, I call `updatePowerups` in both places. In play it is audible, in the demo it is silent, so the title screen quietly shows off power-ups too:

```lua
-- title branch (attract): after the AIs + stepRally...
updatePowerups(dt, true)   -- silent

-- play branch: after scoring...
updatePowerups(dt, false)  -- audible
```

The win screen is untouched. `love.update` returns before either branch there, so nothing spawns while the banner is up.

Second, a clean slate when a new match starts. Power-ups should not bleed from a finished demo or a previous game into a fresh one, so a `resetPowerups()` undoes every active effect, snaps heights and boost back to default, and clears the field:

```lua
local function resetPowerups()
    for _, e in ipairs(active) do POWERUPS[e.kind].revert(e.side) end
    active = {}
    left.h, right.h = PADDLE_H, PADDLE_H
    ball.boost = 1
    powerup = nil
    spawnTimer = POWERUP_INTERVAL
end
```

I call it in the `SPACE` handoff, before `centerPaddles()`, and order matters, because centering uses each paddle's height, so heights must be back to base first:

```lua
resetPowerups()          -- restore base heights + clear pickups...
centerPaddles()          -- ...then center against those base heights
serveBall(love.math.random(2) == 1 and -1 or 1)
```

Drawing the pickup is the last piece, a colored square with its initial, shown only while a game or demo is live so a leftover pickup does not linger on the win screen. It is a dozen lines you can read in the full listing below.

## Go earn some

Run `love .` and watch the title screen first: the attract demo now spawns pickups and the ghosts fight over them, paddles ballooning and shrinking mid rally. Then press `1`, `SPACE`, and go earn some yourself:

Grab a GROW and feel the wall you have become, then let it expire and watch your paddle snap back. That snap is `revert` firing on the timer.

Set `POWERUP_INTERVAL` to `1` at the top of the file and start a game, pickups rain down. Set it to `20` for a rare treat feel. One number, whole different pace: the table philosophy, one last time.

Add a power-up of your own. Copy the `fast` row, call it `slow`, set `ball.boost = 0.6`. You just extended the game without touching a single line of logic, and that is the payoff of putting the feel in a table.

And a ladder of things to build beyond the series, now that you have the tools:

1. Multi-ball. The big one: turn `ball` into a list and loop your update over it. The per-entity lesson from this post is exactly the muscle you need.
2. More power-ups. Sticky paddle, curve shot, a shield, each is a new row and maybe one new field. Try making the height effects stack cleanly while you are there.
3. Networked two-player. A stretch, but the state is already tidy and central.

That is the series. You started with a blank 800 by 600 window and a note that a LÖVE game is just three callbacks, and you have ended with a juicy, self demoing, power-up slinging arcade Pong, still, remarkably, in one `main.lua` and one `conf.lua`, plus a font. Below is the whole thing, end to end. Copy it, break it, make it yours.

## The complete main.lua

```lua
-- Pong, in one file.
--
-- A LÖVE game is just three callbacks the engine calls for you every frame:
--   love.load()        -> run once at startup; create your stuff here
--   love.update(dt)    -> run every frame; dt = seconds since the last frame
--   love.draw()        -> run every frame; draw the current state of the world
-- Plus event callbacks like love.keypressed() for one-off key presses.
--
-- The whole game is a loop: read input, update the world by `dt`, draw it.

-- ---------------------------------------------------------------------------
-- Tunable constants. Putting the "knobs" up top makes the game easy to tweak.
-- ---------------------------------------------------------------------------
local WIN_W, WIN_H   = 800, 600
local PADDLE_W       = 14
local PADDLE_H       = 90         -- the *default* paddle height; power-ups change a paddle's own h
local PADDLE_MARGIN  = 40         -- distance of each paddle from its wall
local PADDLE_SPEED   = 450        -- pixels per second
local BALL_SIZE      = 14
local BALL_START_SPD = 320        -- pixels per second on serve
local BALL_SPEEDUP   = 28         -- added to ball speed on every paddle hit
local BALL_MAX_SPD   = 720
local SCORE_TO_WIN    = 5

-- Power-up tuning (the behavior lives in the POWERUPS table further down).
local POWERUP_SIZE     = 22       -- pickup square, px
local POWERUP_INTERVAL = 7        -- seconds between spawns (when none is on the field). Keep this
                                  -- >= fast's duration so two "fast" pickups can't overlap and one's
                                  -- expiry cancel the other's boost early (single-pickup invariant).
local POWERUP_LIFETIME = 6        -- seconds an uncollected pickup lingers before vanishing

-- Retro pixel font asset. Our first *bundled* file (sounds are generated in code).
-- If the file is missing the game falls back to LÖVE's built-in font, so it always
-- runs. Press Start 2P is drawn on an 8px grid, so we size it in multiples of 8.
local FONT_PATH      = "assets/fonts/PressStart2P.ttf"

-- AI opponent presets (single-player mode). One row per difficulty; each column
-- is a "knob" that makes the CPU easier or harder to beat:
--   speed          -- paddle pixels/second (lower = slower to reach the ball)
--   deadzone       -- stop within this many px of the target (no jitter)
--   returnBias     -- 0..1: how eagerly it drifts back to center while idle
--   predictBounces -- how many wall bounces it can "read" ahead (0 = no prediction)
--   errorPx        -- max random aim mistake per rally, in px (bigger = worse aim)
local DIFFICULTIES = {
  easy   = { speed = 320, deadzone = 22, returnBias = 0.30, predictBounces = 0, errorPx = 55 },
  medium = { speed = 410, deadzone = 12, returnBias = 0.45, predictBounces = 1, errorPx = 22 },
  hard   = { speed = 470, deadzone = 6,  returnBias = 0.60, predictBounces = 4, errorPx = 6  },
}

-- ---------------------------------------------------------------------------
-- Game state. `state` is a tiny state machine: "title", "play", or "win".
-- Everything else describes the current world.
-- ---------------------------------------------------------------------------
local state = "title"
local winner = nil
local gameMode = "1p"   -- "1p" = vs CPU (right paddle is AI), "2p" = two humans
local difficulty = "medium"  -- which DIFFICULTIES row the CPU uses (1p mode)
local aiError = 0            -- per-rally aim mistake (px); set once in serveBall

-- Paddles now carry their own height `h` (defaults to PADDLE_H): a power-up can
-- grow or shrink one paddle without touching the other. That per-entity state is
-- the whole idea of Part 5.
local left  = { x = PADDLE_MARGIN,                 y = 0, score = 0, h = PADDLE_H }
local right = { x = WIN_W - PADDLE_MARGIN - PADDLE_W, y = 0, score = 0, h = PADDLE_H }

-- The ball also gains two fields: `boost` (a speed multiplier the "fast" power-up
-- toggles) and `lastHit` (which side touched it last, so a pickup rewards its
-- collector).
local ball = { x = 0, y = 0, dx = 0, dy = 0, speed = BALL_START_SPD, boost = 1, lastHit = nil }

-- Power-up world state: at most one pickup on the field at a time (keeps it simple),
-- a spawn countdown, and a list of currently-active timed effects.
local powerup    = nil                 -- the on-field pickup, or nil
local spawnTimer = POWERUP_INTERVAL
local active     = {}                  -- list of { kind, side, timeLeft }

-- Screen-shake bookkeeping (our bit of "juice").
local shake = { time = 0, magnitude = 0 }

local bigFont, hugeFont, smallFont
local sndPaddle, sndWall, sndScore
local particleImg, sparks              -- the code-generated particle burst (no asset)

-- ---------------------------------------------------------------------------
-- Sound: we *generate* short beeps in code instead of shipping audio files.
-- A square wave is just +1 / -1 flipping at the note's frequency; a quick
-- fade-out (envelope) keeps it from clicking. Nice for a tutorial: no assets.
-- ---------------------------------------------------------------------------
local function makeBeep(freq, duration, volume)
    local rate    = 44100
    local samples = math.floor(rate * duration)
    local data    = love.sound.newSoundData(samples, rate, 16, 1)
    for i = 0, samples - 1 do
        local t      = i / rate
        local square = math.sin(2 * math.pi * freq * t) >= 0 and 1 or -1
        local env    = 1 - (i / samples)          -- linear fade to silence
        data:setSample(i, square * volume * env)
    end
    return love.audio.newSource(data, "static")
end

-- Load the retro pixel font at `size`, but degrade gracefully: if the .ttf
-- isn't there, love.graphics.newFont raises, pcall catches it, and we fall back
-- to LÖVE's built-in font. So a missing asset means "plain font", not a crash.
local function loadFont(size)
    local ok, f = pcall(love.graphics.newFont, FONT_PATH, size)
    return ok and f or love.graphics.newFont(size)
end

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Center both paddles vertically (used on serve/reset).
local function centerPaddles()
    left.y  = (WIN_H - left.h) / 2
    right.y = (WIN_H - right.h) / 2
end

-- Pick the CPU's aim mistake ONCE for the upcoming rally: a random offset in
-- [-errPx, +errPx] for the active difficulty. Committing to one misread per rally
-- (instead of re-rolling every frame) makes mistakes look deliberate, not jittery.
-- We call this on every serve AND when starting play from the title, so a fresh
-- Easy/Hard pick takes effect on the very first rally instead of using the stale
-- startup value.
local function rollAiError()
    local errPx = DIFFICULTIES[difficulty].errorPx
    aiError = love.math.random() * 2 * errPx - errPx
end

-- Put the ball in the middle and serve it toward `dir` (-1 = left, 1 = right)
-- at a random-ish angle so every rally is a little different.
local function serveBall(dir)
    ball.x     = (WIN_W - BALL_SIZE) / 2
    ball.y     = (WIN_H - BALL_SIZE) / 2
    ball.speed = BALL_START_SPD
    ball.lastHit = nil                  -- fresh rally: nobody has touched it yet
    local angle = love.math.random() * (math.pi / 3) - (math.pi / 6) -- -30°..+30°
    ball.dx = dir * math.cos(angle)
    ball.dy = math.sin(angle)

    rollAiError()   -- fresh CPU aim mistake for this rally
end

local function startShake(magnitude)
    shake.time      = 0.12
    shake.magnitude = magnitude
end

-- Axis-aligned bounding-box overlap test: do two rectangles touch?
local function overlaps(ax, ay, aw, ah, bx, by, bw, bh)
    return ax < bx + bw and bx < ax + aw and
           ay < by + bh and by < ay + ah
end

-- Bounce the ball off a paddle. The spot where it hits decides the new angle,
-- so hitting with the paddle's edge sends the ball off at a steeper angle. Uses
-- the paddle's own `h` so a grown/shrunk paddle bounces correctly. Also records
-- who touched it last (for power-up rewards). `silent` skips the beep + shake
-- (used by the title-screen attract demo so the menu doesn't jitter or beep).
local function bounceOffPaddle(paddle, towardDir, silent)
    local paddleCenter = paddle.y + paddle.h / 2
    local ballCenter   = ball.y + BALL_SIZE / 2
    local offset       = (ballCenter - paddleCenter) / (paddle.h / 2)  -- -1..1
    local angle        = offset * (math.pi / 4)                        -- up to 45°

    ball.dx      = towardDir * math.cos(angle)
    ball.dy      = math.sin(angle)
    ball.speed   = math.min(ball.speed + BALL_SPEEDUP, BALL_MAX_SPD)
    ball.lastHit = (towardDir > 0) and "left" or "right"  -- sent rightward => off the left paddle

    if not silent then
        sndPaddle:stop(); sndPaddle:play()
        startShake(6)
    end
end

-- Where will the ball be when it reaches `paddle`'s face? We follow the ball's
-- straight-line path to that x, then "fold" it back into the playfield to account
-- for bounces off the top/bottom walls (like unfolding a reflection). `side` says
-- which paddle this is: +1 = right paddle (guards a rightward ball, aims at its
-- left face), -1 = left paddle (guards a leftward ball, aims at its right face).
-- Returns a ball-center y to aim at, or nil when the AI shouldn't predict:
--   * ball is moving away from this paddle (ball.dx * side <= 0), or
--   * it would take more than `maxBounces` wall bounces to get there,
-- in which case updateAI falls back to reacting to the ball's current y.
local function predictBallY(paddle, side, maxBounces)
    if ball.dx * side <= 0 then return nil end       -- ball moving away from this paddle
    if maxBounces <= 0 then return nil end            -- Easy: no prediction at all

    -- x where the ball meets this paddle's face (right paddle = its left edge,
    -- left paddle = its right edge).
    local targetX = (side > 0) and (paddle.x - BALL_SIZE) or (paddle.x + PADDLE_W)
    local range   = WIN_H - BALL_SIZE                 -- ball's top-left y ranges 0..range
    local slope   = ball.dy / ball.dx                 -- rise over run (speed cancels out)
    local yFlat   = ball.y + slope * (targetX - ball.x)  -- y if there were no walls

    -- How many times would that straight path cross a wall on the way?
    local bounces = math.floor(math.abs(yFlat - ball.y) / range)
    if bounces > maxBounces then return nil end       -- too many bounces to read confidently

    -- Fold yFlat into [0, range] using a triangle wave of period 2*range.
    local period = 2 * range
    local m = yFlat % period
    if m < 0 then m = m + period end
    local folded = (m <= range) and m or (period - m)

    return folded + BALL_SIZE / 2                      -- convert to a ball-center y
end

-- The AI is just "input you don't type." It picks a target y and walks `paddle`
-- toward it, capped at the difficulty's `speed`. When the ball is heading its way
-- it aims at where the ball *will* cross its face (prediction), nudged by this
-- rally's aim mistake; otherwise it eases back toward center (so a human can
-- wrong-foot it). The deadzone stops it twitching on the target. `side` is +1 for
-- the right paddle, -1 for the left -- the only thing that differs between them.
local function updateAI(paddle, side, dt)
    local d = DIFFICULTIES[difficulty]
    local paddleCenter = paddle.y + paddle.h / 2

    local target
    if ball.dx * side > 0 then
        -- Ball incoming: aim at the predicted crossing point, or (if prediction
        -- is off / too many bounces) just track the ball's current y.
        target = predictBallY(paddle, side, d.predictBounces) or (ball.y + BALL_SIZE / 2)
        target = target + aiError                       -- this rally's misread
    else
        -- Ball going away: drift back toward center, but only partway, so the
        -- AI isn't perfectly reset and ready every time.
        local center = WIN_H / 2
        target = paddleCenter + (center - paddleCenter) * d.returnBias
    end

    local diff = target - paddleCenter
    if math.abs(diff) > d.deadzone then
        local dir = diff > 0 and 1 or -1
        paddle.y = paddle.y + dir * d.speed * dt
    end

    paddle.y = math.max(0, math.min(WIN_H - paddle.h, paddle.y))
end

-- Advance the ball by one frame: move it, bounce off walls and paddles, and
-- report whether it left the field. Returns "left" or "right" (which side was
-- scored on, i.e. which edge the ball crossed) or nil. It deliberately does NOT
-- score or re-serve -- each caller applies its own policy, so the exact same
-- physics drives both a real game and the title-screen attract demo. `silent`
-- suppresses the shake + beeps for the demo. The "boost" multiplier is the
-- "fast" power-up (1 normally); it scales travel without touching the speed-ramp.
local function stepRally(dt, silent)
    -- Move the ball.
    ball.x = ball.x + ball.dx * ball.speed * ball.boost * dt
    ball.y = ball.y + ball.dy * ball.speed * ball.boost * dt

    -- Bounce off top/bottom walls.
    if ball.y < 0 then
        ball.y  = 0
        ball.dy = -ball.dy
        if not silent then sndWall:stop(); sndWall:play() end
    elseif ball.y + BALL_SIZE > WIN_H then
        ball.y  = WIN_H - BALL_SIZE
        ball.dy = -ball.dy
        if not silent then sndWall:stop(); sndWall:play() end
    end

    -- Bounce off paddles (using each paddle's own height). We also nudge the ball
    -- just past the paddle so it can't get "stuck" overlapping and bounce repeatedly.
    if ball.dx < 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                left.x, left.y, PADDLE_W, left.h) then
        ball.x = left.x + PADDLE_W
        bounceOffPaddle(left, 1, silent)
    elseif ball.dx > 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                    right.x, right.y, PADDLE_W, right.h) then
        ball.x = right.x - BALL_SIZE
        bounceOffPaddle(right, -1, silent)
    end

    -- Did the ball leave the field?
    if ball.x + BALL_SIZE < 0 then
        return "left"        -- crossed the left edge: the left side was scored on
    elseif ball.x > WIN_W then
        return "right"       -- crossed the right edge: the right side was scored on
    end
    return nil
end

-- ---------------------------------------------------------------------------
-- Power-ups: spawned pickups the ball collects, granting a timed effect.
-- The behavior is data: each row says how it looks, how long it lasts, and what
-- it does to / undoes for the COLLECTOR's side (grow helps you, shrink hurts the
-- foe, fast speeds the ball). This mirrors the DIFFICULTIES table: logic in code,
-- feel in a table.
-- ---------------------------------------------------------------------------
local function paddleOf(side)  return (side == "left") and left or right end
local function otherSide(side) return (side == "left") and "right" or "left" end

local POWERUPS = {
  grow   = { label = "GROW",   color = {0.3, 1.0, 0.4}, duration = 8,
             apply  = function(side) paddleOf(side).h = PADDLE_H * 1.6 end,
             revert = function(side) paddleOf(side).h = PADDLE_H end },
  shrink = { label = "SHRINK", color = {1.0, 0.4, 0.3}, duration = 8,
             apply  = function(side) paddleOf(otherSide(side)).h = PADDLE_H * 0.55 end,
             revert = function(side) paddleOf(otherSide(side)).h = PADDLE_H end },
  fast   = { label = "FAST",   color = {0.4, 0.7, 1.0}, duration = 6,
             apply  = function() ball.boost = 1.5 end,
             revert = function() ball.boost = 1 end },
}
local POWERUP_KINDS = { "grow", "shrink", "fast" }

-- Re-clamp both paddles to the screen: a grow/shrink can leave a paddle poking
-- off the top or bottom, so pull it back in whenever a height changes.
local function clampPaddles()
    left.y  = math.max(0, math.min(WIN_H - left.h,  left.y))
    right.y = math.max(0, math.min(WIN_H - right.h, right.y))
end

-- Fire a colored particle burst at a pickup's location. The particle texture is
-- generated in love.load (no image file, like our beeps). `silent` skips the blip.
local function spawnBurst(px, py, color, silent)
    sparks:setPosition(px, py)
    sparks:setColors(color[1], color[2], color[3], 1,  color[1], color[2], color[3], 0)
    sparks:emit(28)
    if not silent then sndPaddle:stop(); sndPaddle:play() end
end

-- Drop a fresh pickup somewhere in a central band (away from the paddles).
local function spawnPowerup()
    powerup = {
        kind = POWERUP_KINDS[love.math.random(#POWERUP_KINDS)],
        x    = WIN_W / 2 - POWERUP_SIZE / 2 + love.math.random(-140, 140),
        y    = love.math.random(60, WIN_H - 60 - POWERUP_SIZE),
        life = POWERUP_LIFETIME,
    }
end

-- Collect a pickup for `side` (the last hitter): apply its effect (or just refresh
-- the timer if that same effect is already running on that side), re-clamp the
-- paddles, and pop a particle burst.
local function collectPowerup(p, side, silent)
    local def = POWERUPS[p.kind]
    for _, e in ipairs(active) do
        if e.kind == p.kind and e.side == side then
            e.timeLeft = def.duration                   -- refresh, don't stack a duplicate
            spawnBurst(p.x + POWERUP_SIZE / 2, p.y + POWERUP_SIZE / 2, def.color, silent)
            return
        end
    end
    def.apply(side)
    table.insert(active, { kind = p.kind, side = side, timeLeft = def.duration })
    clampPaddles()
    spawnBurst(p.x + POWERUP_SIZE / 2, p.y + POWERUP_SIZE / 2, def.color, silent)
end

-- One frame of the power-up world: age active effects (undo them when they run
-- out), then either age the on-field pickup (collect it if the ball touches it,
-- drop it if it times out) or count down to the next spawn. Runs in play AND
-- attract, so the demo shows power-ups too; `silent` mutes the collect blip there.
local function updatePowerups(dt, silent)
    for i = #active, 1, -1 do
        local e = active[i]
        e.timeLeft = e.timeLeft - dt
        if e.timeLeft <= 0 then
            POWERUPS[e.kind].revert(e.side)
            table.remove(active, i)
            clampPaddles()
        end
    end

    if powerup then
        powerup.life = powerup.life - dt
        if powerup.life <= 0 then
            powerup = nil                               -- expired uncollected
        elseif ball.lastHit and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                         powerup.x, powerup.y, POWERUP_SIZE, POWERUP_SIZE) then
            collectPowerup(powerup, ball.lastHit, silent)
            powerup = nil
        end
    else
        spawnTimer = spawnTimer - dt
        if spawnTimer <= 0 then
            spawnPowerup()
            spawnTimer = POWERUP_INTERVAL
        end
    end
end

-- Wipe all power-up state back to a clean slate for a fresh match: undo every
-- active effect, snap paddle heights + ball boost back to default, clear the
-- field, and restart the spawn clock.
local function resetPowerups()
    for _, e in ipairs(active) do POWERUPS[e.kind].revert(e.side) end
    active = {}
    left.h, right.h = PADDLE_H, PADDLE_H
    ball.boost = 1
    powerup = nil
    spawnTimer = POWERUP_INTERVAL
end

-- ---------------------------------------------------------------------------
-- love.load: one-time setup
-- ---------------------------------------------------------------------------
function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest") -- crisp, blocky look
    love.window.setMode(WIN_W, WIN_H)

    -- Sizes are multiples of 8 so the pixel font stays crisp under nearest filtering.
    smallFont = loadFont(16)
    bigFont   = loadFont(32)
    hugeFont  = loadFont(56)

    sndPaddle = makeBeep(440, 0.06, 0.5)  -- A4-ish blip on paddle hit
    sndWall   = makeBeep(280, 0.05, 0.4)  -- lower blip on wall bounce
    sndScore  = makeBeep(150, 0.25, 0.5)  -- longer low tone when someone scores

    -- Build the particle texture in code -- a 4x4 white dot, no image file (same
    -- spirit as the generated beeps). We tint it per-burst, so white is the base.
    local dot = love.image.newImageData(4, 4)
    dot:mapPixel(function() return 1, 1, 1, 1 end)
    particleImg = love.graphics.newImage(dot)
    sparks = love.graphics.newParticleSystem(particleImg, 256)
    sparks:setParticleLifetime(0.2, 0.6)
    sparks:setSpeed(60, 260)
    sparks:setSpread(2 * math.pi)          -- fling in all directions
    sparks:setSizes(1.5, 0.2)              -- shrink as they fade
    sparks:setSizeVariation(1)

    centerPaddles()
    serveBall(love.math.random(2) == 1 and -1 or 1)
end

-- ---------------------------------------------------------------------------
-- love.update: move the world forward by `dt` seconds
-- ---------------------------------------------------------------------------
function love.update(dt)
    -- Decay the screen shake regardless of state.
    if shake.time > 0 then
        shake.time = shake.time - dt
    end

    -- Particles animate in every state so a burst can finish playing out.
    sparks:update(dt)

    if state == "title" then
        -- Attract mode: both paddles are the AI and the ball plays on -- a
        -- self-running demo behind the menu, like an arcade cabinet. It's silent
        -- (no shake/beeps so the menu stays still) and never scores: on a point we
        -- just re-serve away from the goal that was breached, volleying forever.
        -- Power-ups run here too, so the demo shows them off.
        updateAI(left,  -1, dt)
        updateAI(right,  1, dt)
        local scored = stepRally(dt, true)
        if scored == "left" then
            serveBall(1)
        elseif scored == "right" then
            serveBall(-1)
        end
        updatePowerups(dt, true)
        return
    end

    if state ~= "play" then
        return   -- "win": idle here; only the shake/particles above keep going
    end

    -- Paddle input. Multiplying by dt makes movement frame-rate independent:
    -- the paddle covers PADDLE_SPEED pixels per *second*, not per frame.
    if love.keyboard.isDown("w") then
        left.y = left.y - PADDLE_SPEED * dt
    elseif love.keyboard.isDown("s") then
        left.y = left.y + PADDLE_SPEED * dt
    end
    -- The right paddle is either the CPU (1p) or a second human (2p).
    if gameMode == "1p" then
        updateAI(right, 1, dt)
    else
        if love.keyboard.isDown("up") then
            right.y = right.y - PADDLE_SPEED * dt
        elseif love.keyboard.isDown("down") then
            right.y = right.y + PADDLE_SPEED * dt
        end
    end

    -- Keep paddles on screen (each by its own height).
    left.y  = math.max(0, math.min(WIN_H - left.h, left.y))
    right.y = math.max(0, math.min(WIN_H - right.h, right.y))

    -- Step the ball. In real play a point actually scores, plays the tone, shakes
    -- the screen, and re-serves away from the goal that was just breached (toward
    -- the paddle that scored) -- the same serve directions Parts 1-3 used.
    local scored = stepRally(dt)
    if scored == "left" then
        right.score = right.score + 1
        sndScore:stop(); sndScore:play()
        startShake(10)
        serveBall(1)
    elseif scored == "right" then
        left.score = left.score + 1
        sndScore:stop(); sndScore:play()
        startShake(10)
        serveBall(-1)
    end

    -- Spawn / age / collect power-ups (audible here, unlike the silent demo).
    updatePowerups(dt, false)

    -- Win check.
    if left.score >= SCORE_TO_WIN then
        winner = (gameMode == "1p") and "You" or "Left player"
        state  = "win"
    elseif right.score >= SCORE_TO_WIN then
        winner = (gameMode == "1p") and "CPU" or "Right player"
        state  = "win"
    end
end

-- ---------------------------------------------------------------------------
-- Input events (fire once per press, unlike love.keyboard.isDown)
-- ---------------------------------------------------------------------------
function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif (key == "1" or key == "2") and (state == "title" or state == "win") then
        gameMode = (key == "1") and "1p" or "2p"   -- pick mode before starting
    elseif (key == "e" or key == "m" or key == "h")
           and (state == "title" or state == "win") and gameMode == "1p" then
        -- Choose CPU difficulty (1p only). Takes effect when play starts.
        difficulty = (key == "e") and "easy" or (key == "m") and "medium" or "hard"
    elseif key == "space" and (state == "title" or state == "win") then
        -- Start a fresh game from a clean slate. From "title" the attract demo has
        -- left the ball mid-volley; from "win" the scores are maxed -- either way,
        -- reset everything and serve. (serveBall also rolls a fresh aim mistake.)
        left.score, right.score = 0, 0
        winner = nil
        resetPowerups()          -- clear any lingering pickups/effects too
        centerPaddles()
        serveBall(love.math.random(2) == 1 and -1 or 1)
        state = "play"
    end
end

-- ---------------------------------------------------------------------------
-- love.draw: paint the current state. Drawing order = back to front.
-- ---------------------------------------------------------------------------
local function drawPaddle(p)
    love.graphics.rectangle("fill", p.x, p.y, PADDLE_W, p.h)
end

local function printCentered(text, font, y)
    love.graphics.setFont(font)
    love.graphics.printf(text, 0, y, WIN_W, "center")
end

function love.draw()
    -- Apply screen shake by translating the whole scene a few pixels.
    if shake.time > 0 then
        local m = shake.magnitude
        love.graphics.translate(love.math.random(-m, m), love.math.random(-m, m))
    end

    -- Dashed center line.
    love.graphics.setColor(0.25, 0.25, 0.25)
    for y = 0, WIN_H, 30 do
        love.graphics.rectangle("fill", WIN_W / 2 - 2, y, 4, 16)
    end

    love.graphics.setColor(1, 1, 1)

    -- Scores.
    love.graphics.setFont(bigFont)
    love.graphics.printf(tostring(left.score),  0, 20, WIN_W / 2 - 30, "right")
    love.graphics.printf(tostring(right.score), WIN_W / 2 + 30, 20, WIN_W / 2 - 30, "left")

    -- Paddles and ball. On the title screen these are the attract demo in motion.
    drawPaddle(left)
    drawPaddle(right)
    love.graphics.rectangle("fill", ball.x, ball.y, BALL_SIZE, BALL_SIZE)

    -- The on-field pickup (a colored square with its initial), while it's live.
    if powerup and (state == "play" or state == "title") then
        local def = POWERUPS[powerup.kind]
        love.graphics.setColor(def.color)
        love.graphics.rectangle("fill", powerup.x, powerup.y, POWERUP_SIZE, POWERUP_SIZE)
        love.graphics.setColor(0, 0, 0)
        love.graphics.setFont(smallFont)
        love.graphics.printf(def.label:sub(1, 1), powerup.x, powerup.y + 3, POWERUP_SIZE, "center")
        love.graphics.setColor(1, 1, 1)
    end

    -- Particle bursts on top of the field (tinted by the system, so draw white).
    love.graphics.setColor(1, 1, 1)
    love.graphics.draw(sparks)

    -- State-specific overlays.
    if state == "title" then
        -- Dim the playfield behind the menu so the moving demo doesn't fight the
        -- text. Draw the panel, then the white text on top.
        love.graphics.setColor(0, 0, 0, 0.6)
        love.graphics.rectangle("fill", 0, WIN_H / 2 - 150, WIN_W, 320)
        love.graphics.setColor(1, 1, 1)

        local modeLine = (gameMode == "1p")
            and "> [1] 1P vs CPU    [2] 2 PLAYER"
            or  "  [1] 1P vs CPU  > [2] 2 PLAYER"
        local controls = (gameMode == "1p")
            and "YOU: W/S    CPU: RIGHT"
            or  "LEFT: W/S    RIGHT: UP/DOWN"
        printCentered("PONG", hugeFont, WIN_H / 2 - 130)
        printCentered(modeLine, smallFont, WIN_H / 2 - 40)

        -- Walk down the screen; the difficulty line only exists in 1p mode, so we
        -- advance `y` conditionally to keep the block tidy in both modes.
        local y = WIN_H / 2 - 10
        if gameMode == "1p" then
            -- Difficulty picker, marking the active one like modeLine's `>`.
            local function mark(name) return (difficulty == name) and "> " or "  " end
            local diffLine = mark("easy")   .. "EASY   "
                          .. mark("medium") .. "MED   "
                          .. mark("hard")   .. "HARD"
            printCentered(diffLine, smallFont, y); y = y + 30
        end
        printCentered(controls, smallFont, y);                            y = y + 30
        printCentered("FIRST TO " .. SCORE_TO_WIN .. " WINS", smallFont, y); y = y + 36
        local hint = (gameMode == "1p")
            and "1/2 MODE  E/M/H DIFF  SPACE=GO"
            or  "1/2 MODE   SPACE=GO"
        printCentered(hint, smallFont, y)
    elseif state == "win" then
        -- "You" needs "win!"; named players take "wins!".
        local msg = (winner == "You") and "You win!" or (winner .. " wins!")
        printCentered(msg, bigFont, WIN_H / 2 - 60)
        printCentered("Press SPACE to play again", smallFont, WIN_H / 2 + 10)
    end
end
```

*And that is Pong. Five parts, one file. Thanks for building it with me.*
