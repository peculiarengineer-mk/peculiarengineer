---
title: 'Making Pong with LÖVE and Lua: what I learned building my first game'
description: 'Build the 1972 classic from a blank window to a playable match: scoring, a title screen, sound generated in code, and a little screen shake, all in two short Lua files.'
pubDate: 'Jun 29 2026'
tags: ['LÖVE', 'Love2D', 'Lua', 'Game Dev', 'Pong', 'Tutorial']
---

I'd been meaning to actually make a game instead of just reading about how games get made, so I finally sat down and built the smallest real one I could think of: Pong, the 1972 classic, with [LÖVE](https://love2d.org) (also written Love2D) and the Lua language. This is me writing down what I learned doing it, mostly so I never have to work it all out from scratch again, but also because the handful of ideas that finally clicked are the ones nobody had bothered to spell out for me. By the end I had a complete two player game: scoring, a title screen, a win screen, sound effects, and a touch of screen shake.

Here's the part that surprised me most. Almost nothing I picked up was actually about Pong. The loop, delta time, collision, a state machine, a bit of juice. Those are game ideas, not Pong ideas. I just got to learn them on something small enough to hold in my head, and I keep running into the same ideas everywhere since.

The whole thing came out to two short files. Two paddles, a ball, a dashed net, a score, and that satisfying blip on every hit.

> **TL;DR** Install LÖVE, make a folder with `conf.lua` and `main.lua`, run `love .` from that folder. The full source for both files is at the bottom of this post. Grab it, run it, then start turning the knobs.

## Why LÖVE and Lua

LÖVE is a tiny, friendly framework for 2D games. There's no project to configure, no build step, no compiler. You write some Lua, point LÖVE at the folder, and your game runs. That low ceremony is the whole reason I reach for it when I want to make something today rather than read setup docs for an afternoon.

Lua is a small, readable scripting language. I know a few other languages, and I could read it in a few minutes. Two things tripped me up at first, though:

- Blocks end with the word `end`, not a closing brace or indentation.
- Tables, written `{ }`, are the only data structure. They act as both arrays and objects. We'll use them as little bundles of related data, like `ball = { x = 0, y = 0 }`.

Install LÖVE from [love2d.org](https://love2d.org). To run a game you make a folder, drop a `main.lua` inside, and run `love .` from that folder. You can also drag the folder onto the LÖVE app.

## The one idea behind every game: the loop

This is the idea that made everything else fall into place for me, once it finally landed. A game is a loop that runs about 60 times a second. Each pass through the loop, each frame, does three things:

1. Read input. Which keys are down?
2. Update. Move everything forward a tiny slice of time.
3. Draw. Paint the current state of the world to the screen.

LÖVE runs that loop for you. You fill in three functions and LÖVE calls them at the right moments:

```lua
function love.load()      -- runs once at startup; create your stuff here
end

function love.update(dt)  -- runs every frame; dt = seconds since last frame
end

function love.draw()      -- runs every frame; draw the world
end
```

Drop those into a `main.lua`, run `love .`, and you get a black window. That black window is a running game loop. Everything from here is filling in those three functions.

### dt, the parameter that took me a minute to get

See that `dt` in `update`? It stands for delta time: how many seconds passed since the last frame. On a fast machine that might be `0.016`, which is 60 frames a second. On a slow one it might be `0.033`.

This one confused me until it didn't. If you move the ball "5 pixels per frame," it moves twice as fast on a fast computer. So instead we move it per second and multiply by `dt`:

```lua
ball.x = ball.x + speed * dt   -- `speed` is pixels per SECOND
```

Now the ball covers the same distance per real world second on any machine. Anytime something moves, it gets multiplied by `dt`. Once that clicked, I'd sidestepped the bug I would otherwise have walked straight into, the one everyone apparently hits first.

## Setting up the window and our knobs

Before the game logic, two bits of setup.

First, an optional `conf.lua` file. LÖVE reads it before your game starts, to configure the window. It's the conventional home for this:

```lua
-- conf.lua
function love.conf(t)
    t.window.title  = "Pong"
    t.window.width  = 800
    t.window.height = 600
    t.window.resizable = false
end
```

Second, at the top of `main.lua`, we define constants, the knobs we might tweak. Putting them up top means you can tune the feel of the game without hunting through logic:

```lua
local WIN_W, WIN_H   = 800, 600
local PADDLE_W       = 14
local PADDLE_H       = 90
local PADDLE_MARGIN  = 40        -- distance of each paddle from its wall
local PADDLE_SPEED   = 450       -- pixels per second
local BALL_SIZE      = 14
local BALL_START_SPD = 320       -- pixels per second on serve
local BALL_SPEEDUP   = 28        -- added to ball speed on every paddle hit
local BALL_MAX_SPD   = 720
local SCORE_TO_WIN   = 5
```

The `local` just means "this name lives in this file," which is good Lua hygiene. It also matters more than you'd think, and I'll come back to it.

## Describing the world with tables

What is the world in Pong? Two paddles, a ball, and a couple of scores. We model each as a table, a little bag of named values:

```lua
local state  = "title"   -- "title", "play", or "win"
local winner = nil

local left  = { x = PADDLE_MARGIN,                   y = 0, score = 0 }
local right = { x = WIN_W - PADDLE_MARGIN - PADDLE_W, y = 0, score = 0 }

local ball  = { x = 0, y = 0, dx = 0, dy = 0, speed = BALL_START_SPD }
```

A few things worth noticing:

- `left.x` never changes, because paddles only move up and down, so we set it once.
- The ball has `dx` and `dy`, its direction, a little arrow pointing where it's headed. We keep direction (length 1) separate from `speed` (how fast). To move the ball we go `x + dx * speed * dt`. This separation makes "speed up the ball" trivial: bump `speed`, leave the direction alone.
- `state` is a state machine, a single variable that says which screen we're on. It's the simplest, most useful pattern for organizing a game. The title screen, the match, and the win screen are all the same program behaving differently based on `state`.

## Drawing: paint the world every frame

`love.draw` runs every frame and redraws everything from scratch. In LÖVE you set a color, then draw shapes. Colors are RGB from 0 to 1, so white is `1, 1, 1`.

```lua
function love.draw()
    -- Dashed center line (the net).
    love.graphics.setColor(0.25, 0.25, 0.25)
    for y = 0, WIN_H, 30 do
        love.graphics.rectangle("fill", WIN_W / 2 - 2, y, 4, 16)
    end

    love.graphics.setColor(1, 1, 1)

    -- Scores.
    love.graphics.setFont(bigFont)
    love.graphics.printf(tostring(left.score),  0, 20, WIN_W / 2 - 30, "right")
    love.graphics.printf(tostring(right.score), WIN_W / 2 + 30, 20, WIN_W / 2 - 30, "left")

    -- Paddles and ball are just filled rectangles.
    love.graphics.rectangle("fill", left.x,  left.y,  PADDLE_W, PADDLE_H)
    love.graphics.rectangle("fill", right.x, right.y, PADDLE_W, PADDLE_H)
    love.graphics.rectangle("fill", ball.x,  ball.y,  BALL_SIZE, BALL_SIZE)
end
```

That's the entire art budget. Three rectangles and a dashed line. Pong is rectangles all the way down, and honestly that's freeing. Nobody is waiting on you to draw sprites.

## Moving the paddles: continuous input

There are two ways to read the keyboard, and the difference between them matters:

- `love.keyboard.isDown(key)` is true as long as the key is held. I use it for movement, where holding W should keep the paddle gliding.
- `love.keypressed(key)` is a callback that fires once per press. I use it for one shot actions like "press Space to start."

Paddles move continuously, so we use `isDown` inside `update`, and there's `dt` again, multiplied through:

```lua
function love.update(dt)
    if shake.time > 0 then shake.time = shake.time - dt end   -- count shake down first
    if state ~= "play" then return end                        -- only run the match in play

    if love.keyboard.isDown("w") then
        left.y = left.y - PADDLE_SPEED * dt
    elseif love.keyboard.isDown("s") then
        left.y = left.y + PADDLE_SPEED * dt
    end
    if love.keyboard.isDown("up") then
        right.y = right.y - PADDLE_SPEED * dt
    elseif love.keyboard.isDown("down") then
        right.y = right.y + PADDLE_SPEED * dt
    end

    -- Don't let paddles leave the screen (clamp between 0 and the bottom edge).
    left.y  = math.max(0, math.min(WIN_H - PADDLE_H, left.y))
    right.y = math.max(0, math.min(WIN_H - PADDLE_H, right.y))
```

Two things to flag in there. The `y` value decreases to go up, because in 2D graphics the origin is the top left corner and the y axis points down. And that very first line, where we count the shake timer down, has to happen before the `if state ~= "play" then return end` bail out. If you put it after, the timer freezes the instant the game ends and the win screen shakes forever. I learned that one by watching it happen, so the shake countdown lives above the early return.

## Moving the ball and bouncing off walls

The ball moves on its own, along its `(dx, dy)` direction:

```lua
    ball.x = ball.x + ball.dx * ball.speed * dt
    ball.y = ball.y + ball.dy * ball.speed * dt
```

When it hits the top or bottom wall, we bounce by flipping the vertical direction. We also nudge it back inside the wall so it can't get stuck:

```lua
    if ball.y < 0 then
        ball.y  = 0
        ball.dy = -ball.dy        -- flip vertical direction
        sndWall:stop(); sndWall:play()
    elseif ball.y + BALL_SIZE > WIN_H then
        ball.y  = WIN_H - BALL_SIZE
        ball.dy = -ball.dy
        sndWall:stop(); sndWall:play()
    end
```

Flipping `dy` and leaving `dx` alone is the whole physics of a wall bounce. It's a mirror, not a simulation, and that's all Pong ever needed.

## Collision: does the ball touch a paddle?

The ball and paddles are rectangles, so we use the workhorse of 2D collision: AABB overlap, short for axis aligned bounding box. Two rectangles overlap when they overlap on both the x axis and the y axis at the same time:

```lua
local function overlaps(ax, ay, aw, ah, bx, by, bw, bh)
    return ax < bx + bw and bx < ax + aw and
           ay < by + bh and by < ay + ah
end
```

It looked fiddly to me at first, but it's just "is A's left edge past B's right edge?" asked four times. Once I had it straight in my head, I realized this one function covers a huge fraction of all the 2D collision I'm ever likely to write. I've started trusting it.

A flat bounce worked, but it felt dead, so I dug into how the real game does it. The trick is letting where you hit the paddle control the angle. Hit it dead center and the ball goes straight back. Hit it near the edge and it flies off at a steep angle. That's the thing that turns Pong from a toy into a game of skill:

```lua
local function bounceOffPaddle(paddle, towardDir)
    local paddleCenter = paddle.y + PADDLE_H / 2
    local ballCenter   = ball.y + BALL_SIZE / 2
    local offset       = (ballCenter - paddleCenter) / (PADDLE_H / 2) -- -1..1
    local angle        = offset * (math.pi / 4)                       -- up to 45 degrees

    ball.dx    = towardDir * math.cos(angle)   -- send it back the other way
    ball.dy    = math.sin(angle)
    ball.speed = math.min(ball.speed + BALL_SPEEDUP, BALL_MAX_SPD)  -- a little faster

    sndPaddle:stop(); sndPaddle:play()
    startShake(6)
end
```

`offset` is "how far from center, from -1 to +1." We turn that into an angle, up to 45 degrees, and rebuild the direction with `cos` and `sin`. Don't sweat the trig if it's rusty. The point is that the contact point chooses the angle. Because we rebuild the direction from an angle, `cos` and `sin` always come out to length 1, so the ball never accidentally speeds up sideways. That's the classic bug where you flip `dx` and tweak `dy` by hand and the ball mysteriously gets faster on the diagonals. We dodge it for free here.

We also nudge `speed` up a hair on every hit, so rallies get tenser the longer they go. That's a design choice you can feel, and one of the first knobs I'd tell you to play with.

We call all this from `update`, when the ball overlaps a paddle and is moving toward it:

```lua
    if ball.dx < 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                left.x, left.y, PADDLE_W, PADDLE_H) then
        ball.x = left.x + PADDLE_W      -- shove the ball clear of the paddle
        bounceOffPaddle(left, 1)        -- now traveling right (+1)
    elseif ball.dx > 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                    right.x, right.y, PADDLE_W, PADDLE_H) then
        ball.x = right.x - BALL_SIZE
        bounceOffPaddle(right, -1)      -- now traveling left (-1)
    end
```

That `ball.dx < 0` check, "only if it's heading left," stops the ball from colliding again while it's already leaving. Skip it and you get the classic bug where the ball vibrates against your paddle like it's stuck to flypaper.

## Scoring and winning

If the ball escapes off the left or right edge, the other player scores and we serve a fresh ball toward the player who just got scored on:

```lua
    if ball.x + BALL_SIZE < 0 then
        right.score = right.score + 1
        sndScore:stop(); sndScore:play()
        startShake(10)
        serveBall(1)            -- serve toward the right
    elseif ball.x > WIN_W then
        left.score = left.score + 1
        sndScore:stop(); sndScore:play()
        startShake(10)
        serveBall(-1)
    end

    -- First to SCORE_TO_WIN flips us to the win screen.
    if left.score >= SCORE_TO_WIN then
        winner, state = "Left player", "win"
    elseif right.score >= SCORE_TO_WIN then
        winner, state = "Right player", "win"
    end
end
```

`serveBall` recenters the ball and picks a slightly random starting angle, so no two rallies open the same way:

```lua
local function serveBall(dir)
    ball.x     = (WIN_W - BALL_SIZE) / 2
    ball.y     = (WIN_H - BALL_SIZE) / 2
    ball.speed = BALL_START_SPD
    local angle = love.math.random() * (math.pi / 3) - (math.pi / 6) -- -30 to +30 degrees
    ball.dx = dir * math.cos(angle)
    ball.dy = math.sin(angle)
end
```

## Screens: the state machine pays off

Now `love.keypressed`, the fires once per press callback, handles Space, and what it does depends on `state`:

```lua
function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif key == "space" then
        if state == "title" then
            state = "play"
        elseif state == "win" then
            left.score, right.score = 0, 0   -- reset the match
            winner = nil
            serveBall(love.math.random(2) == 1 and -1 or 1)
            state = "play"
        end
    end
end
```

And `draw` paints an overlay depending on `state`. The little helper `printCentered` keeps that tidy:

```lua
local function printCentered(text, font, y)
    love.graphics.setFont(font)
    love.graphics.printf(text, 0, y, WIN_W, "center")  -- center across the whole window
end
```

```lua
    if state == "title" then
        printCentered("PONG", hugeFont, WIN_H / 2 - 120)
        printCentered("Left: W / S      Right: Up / Down", smallFont, WIN_H / 2 - 10)
        printCentered("Press SPACE to start", smallFont, WIN_H / 2 + 60)
    elseif state == "win" then
        printCentered(winner .. " wins!", bigFont, WIN_H / 2 - 60)
        printCentered("Press SPACE to play again", smallFont, WIN_H / 2 + 10)
    end
```

One `state` variable, and the same code base is a title screen, a match, and a results screen. This pattern scales straight up to real games: menus, pause, level transitions, all the same trick.

## A little juice: sound and screen shake

Once the game worked, it still felt flat, and chasing down why led me to the idea designers call juice: the small feedback that makes actions feel good. I added two cheap bits that punched way above their weight.

### Sound without any audio files

This was my favorite thing I stumbled into. Instead of shipping `.wav` files, you can generate beeps in code. A square wave is just a value flipping between `+1` and `-1` at the note's frequency. A quick fade to silence keeps it from clicking:

```lua
local function makeBeep(freq, duration, volume)
    local rate    = 44100
    local samples = math.floor(rate * duration)
    local data    = love.sound.newSoundData(samples, rate, 16, 1)
    for i = 0, samples - 1 do                     -- samples are zero based, start at 0
        local t      = i / rate
        local square = math.sin(2 * math.pi * freq * t) >= 0 and 1 or -1
        local env    = 1 - (i / samples)          -- linear fade to silence
        data:setSample(i, square * volume * env)
    end
    return love.audio.newSource(data, "static")
end
```

One thing to get right: `setSample` indexes from 0, so the loop runs `0` to `samples - 1`. Start at 1 and you write past the end and skip the first sample. We make three of these at startup, a high blip for paddles, a lower one for walls, and a longer low tone for scoring:

```lua
sndPaddle = makeBeep(440, 0.06, 0.5)
sndWall   = makeBeep(280, 0.05, 0.4)
sndScore  = makeBeep(150, 0.25, 0.5)
```

That `:stop(); :play()` pattern you keep seeing just rewinds the sound so rapid hits each get a fresh blip instead of cutting each other off.

### Screen shake

A few pixels of camera shake on impact reads as force. We track a shake timer, count it down in `update`, and at the very top of `draw` we shove the whole scene by a random offset:

```lua
local shake = { time = 0, magnitude = 0 }

local function startShake(magnitude)
    shake.time      = 0.12
    shake.magnitude = magnitude
end

-- at the TOP of love.draw():
if shake.time > 0 then
    local m = shake.magnitude
    love.graphics.translate(love.math.random(-m, m), love.math.random(-m, m))
end
```

LÖVE resets the coordinate transform at the start of every frame, so this doesn't drift. It just nudges everything drawn after it by a fresh random amount each frame, which your eye reads as a shake. Because `translate` shifts everything that follows, one little block shakes the entire playfield. Tiny change, big difference in feel. Comment it out for a minute and you'll miss it the moment it's gone.

## Bringing it together: love.load

The last piece is the one time setup. `love.load` creates the fonts and sounds and serves the first ball:

```lua
function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest") -- crisp, blocky pixels
    love.window.setMode(WIN_W, WIN_H)

    smallFont = love.graphics.newFont(18)
    bigFont   = love.graphics.newFont(32)
    hugeFont  = love.graphics.newFont(72)

    sndPaddle = makeBeep(440, 0.06, 0.5)
    sndWall   = makeBeep(280, 0.05, 0.4)
    sndScore  = makeBeep(150, 0.25, 0.5)

    left.y  = (WIN_H - PADDLE_H) / 2
    right.y = (WIN_H - PADDLE_H) / 2
    serveBall(love.math.random(2) == 1 and -1 or 1)
end
```

## One Lua gotcha that bites every beginner: order matters

Here's the thing nobody warns you about when you paste a tutorial together out of order. All those helpers, `overlaps`, `bounceOffPaddle`, `serveBall`, `startShake`, `makeBeep`, `printCentered`, are declared with `local function`. In Lua, a `local` only exists from its line downward. So if `local function overlaps` sits below `function love.update`, then inside `update` the name `overlaps` isn't your local at all. Lua reads it as a global, finds nothing there, and you get `attempt to call a nil value (global 'overlaps')` the first time it runs.

The fix is simple: define every `local` helper above the `love.*` callbacks that use them. That's exactly how the full listing below is ordered, so it runs as is. If you build your own file by scrolling up this post and pasting section by section, mind the order or you'll chase a pile of nil errors that have nothing to do with your logic. The full files are right here so you don't have to.

## conf.lua

```lua
-- conf.lua
function love.conf(t)
    t.window.title     = "Pong"
    t.window.width     = 800
    t.window.height    = 600
    t.window.resizable = false
end
```

## main.lua

```lua
-- main.lua

-- Knobs. Tune the feel of the game from up here.
local WIN_W, WIN_H   = 800, 600
local PADDLE_W       = 14
local PADDLE_H       = 90
local PADDLE_MARGIN  = 40        -- distance of each paddle from its wall
local PADDLE_SPEED   = 450       -- pixels per second
local BALL_SIZE      = 14
local BALL_START_SPD = 320       -- pixels per second on serve
local BALL_SPEEDUP   = 28        -- added to ball speed on every paddle hit
local BALL_MAX_SPD   = 720
local SCORE_TO_WIN   = 5

-- World state.
local state  = "title"   -- "title", "play", or "win"
local winner = nil

local left  = { x = PADDLE_MARGIN,                   y = 0, score = 0 }
local right = { x = WIN_W - PADDLE_MARGIN - PADDLE_W, y = 0, score = 0 }
local ball  = { x = 0, y = 0, dx = 0, dy = 0, speed = BALL_START_SPD }

local shake = { time = 0, magnitude = 0 }

-- Fonts and sounds are created in love.load. They're globals on purpose,
-- so every function below can see them: smallFont, bigFont, hugeFont,
-- sndPaddle, sndWall, sndScore.

-- Generate a square wave beep in code so we ship no audio files.
local function makeBeep(freq, duration, volume)
    local rate    = 44100
    local samples = math.floor(rate * duration)
    local data    = love.sound.newSoundData(samples, rate, 16, 1)
    for i = 0, samples - 1 do                     -- samples are zero based
        local t      = i / rate
        local square = math.sin(2 * math.pi * freq * t) >= 0 and 1 or -1
        local env    = 1 - (i / samples)          -- linear fade to silence
        data:setSample(i, square * volume * env)
    end
    return love.audio.newSource(data, "static")
end

local function startShake(magnitude)
    shake.time      = 0.12
    shake.magnitude = magnitude
end

-- AABB overlap: two rectangles touch when they overlap on both axes.
local function overlaps(ax, ay, aw, ah, bx, by, bw, bh)
    return ax < bx + bw and bx < ax + aw and
           ay < by + bh and by < ay + ah
end

local function serveBall(dir)
    ball.x     = (WIN_W - BALL_SIZE) / 2
    ball.y     = (WIN_H - BALL_SIZE) / 2
    ball.speed = BALL_START_SPD
    local angle = love.math.random() * (math.pi / 3) - (math.pi / 6) -- -30..+30 degrees
    ball.dx = dir * math.cos(angle)
    ball.dy = math.sin(angle)
end

-- The contact point on the paddle picks the bounce angle.
local function bounceOffPaddle(paddle, towardDir)
    local paddleCenter = paddle.y + PADDLE_H / 2
    local ballCenter   = ball.y + BALL_SIZE / 2
    local offset       = (ballCenter - paddleCenter) / (PADDLE_H / 2) -- -1..1
    local angle        = offset * (math.pi / 4)                       -- up to 45 degrees

    ball.dx    = towardDir * math.cos(angle)
    ball.dy    = math.sin(angle)
    ball.speed = math.min(ball.speed + BALL_SPEEDUP, BALL_MAX_SPD)

    sndPaddle:stop(); sndPaddle:play()
    startShake(6)
end

local function printCentered(text, font, y)
    love.graphics.setFont(font)
    love.graphics.printf(text, 0, y, WIN_W, "center")
end

function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")
    love.window.setMode(WIN_W, WIN_H)

    smallFont = love.graphics.newFont(18)
    bigFont   = love.graphics.newFont(32)
    hugeFont  = love.graphics.newFont(72)

    sndPaddle = makeBeep(440, 0.06, 0.5)
    sndWall   = makeBeep(280, 0.05, 0.4)
    sndScore  = makeBeep(150, 0.25, 0.5)

    left.y  = (WIN_H - PADDLE_H) / 2
    right.y = (WIN_H - PADDLE_H) / 2
    serveBall(love.math.random(2) == 1 and -1 or 1)
end

function love.update(dt)
    -- Count the shake timer down first, on every screen,
    -- or the win screen will shake forever.
    if shake.time > 0 then shake.time = shake.time - dt end

    if state ~= "play" then return end

    -- Paddles: held keys, so isDown, and everything times dt.
    if love.keyboard.isDown("w") then
        left.y = left.y - PADDLE_SPEED * dt
    elseif love.keyboard.isDown("s") then
        left.y = left.y + PADDLE_SPEED * dt
    end
    if love.keyboard.isDown("up") then
        right.y = right.y - PADDLE_SPEED * dt
    elseif love.keyboard.isDown("down") then
        right.y = right.y + PADDLE_SPEED * dt
    end

    left.y  = math.max(0, math.min(WIN_H - PADDLE_H, left.y))
    right.y = math.max(0, math.min(WIN_H - PADDLE_H, right.y))

    -- Ball moves along its own direction.
    ball.x = ball.x + ball.dx * ball.speed * dt
    ball.y = ball.y + ball.dy * ball.speed * dt

    -- Bounce off the top and bottom walls.
    if ball.y < 0 then
        ball.y  = 0
        ball.dy = -ball.dy
        sndWall:stop(); sndWall:play()
    elseif ball.y + BALL_SIZE > WIN_H then
        ball.y  = WIN_H - BALL_SIZE
        ball.dy = -ball.dy
        sndWall:stop(); sndWall:play()
    end

    -- Paddle collisions, only while heading toward the paddle.
    if ball.dx < 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                left.x, left.y, PADDLE_W, PADDLE_H) then
        ball.x = left.x + PADDLE_W
        bounceOffPaddle(left, 1)
    elseif ball.dx > 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                    right.x, right.y, PADDLE_W, PADDLE_H) then
        ball.x = right.x - BALL_SIZE
        bounceOffPaddle(right, -1)
    end

    -- Scoring: a ball off the edge gives the other side a point.
    if ball.x + BALL_SIZE < 0 then
        right.score = right.score + 1
        sndScore:stop(); sndScore:play()
        startShake(10)
        serveBall(1)
    elseif ball.x > WIN_W then
        left.score = left.score + 1
        sndScore:stop(); sndScore:play()
        startShake(10)
        serveBall(-1)
    end

    -- First to SCORE_TO_WIN wins the match.
    if left.score >= SCORE_TO_WIN then
        winner, state = "Left player", "win"
    elseif right.score >= SCORE_TO_WIN then
        winner, state = "Right player", "win"
    end
end

function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif key == "space" then
        if state == "title" then
            state = "play"
        elseif state == "win" then
            left.score, right.score = 0, 0
            winner = nil
            serveBall(love.math.random(2) == 1 and -1 or 1)
            state = "play"
        end
    end
end

function love.draw()
    -- Shake the whole playfield by nudging everything drawn after this.
    if shake.time > 0 then
        local m = shake.magnitude
        love.graphics.translate(love.math.random(-m, m), love.math.random(-m, m))
    end

    -- The net.
    love.graphics.setColor(0.25, 0.25, 0.25)
    for y = 0, WIN_H, 30 do
        love.graphics.rectangle("fill", WIN_W / 2 - 2, y, 4, 16)
    end

    love.graphics.setColor(1, 1, 1)

    -- Scores.
    love.graphics.setFont(bigFont)
    love.graphics.printf(tostring(left.score),  0, 20, WIN_W / 2 - 30, "right")
    love.graphics.printf(tostring(right.score), WIN_W / 2 + 30, 20, WIN_W / 2 - 30, "left")

    -- Paddles and ball.
    love.graphics.rectangle("fill", left.x,  left.y,  PADDLE_W, PADDLE_H)
    love.graphics.rectangle("fill", right.x, right.y, PADDLE_W, PADDLE_H)
    love.graphics.rectangle("fill", ball.x,  ball.y,  BALL_SIZE, BALL_SIZE)

    -- Screen overlays, chosen by state.
    if state == "title" then
        printCentered("PONG", hugeFont, WIN_H / 2 - 120)
        printCentered("Left: W / S      Right: Up / Down", smallFont, WIN_H / 2 - 10)
        printCentered("Press SPACE to start", smallFont, WIN_H / 2 + 60)
    elseif state == "win" then
        printCentered(winner .. " wins!", bigFont, WIN_H / 2 - 60)
        printCentered("Press SPACE to play again", smallFont, WIN_H / 2 + 10)
    end
end
```

Save those two files in a folder, run `love .`, and you've got Pong: a title screen, two paddles, a speeding ball, sound, screen shake, scoring, and a winner.

## What I actually came away with

Now I get why everyone points beginners at Pong. None of what stuck with me was really about Pong. It was this:

- The game loop. Load once, update and draw every frame.
- Delta time. Multiply movement by `dt` so speed is per second, not per frame.
- Tables as world state. Bundle related data, and keep direction separate from speed.
- Two kinds of input. Held with `isDown` versus pressed once with `keypressed`.
- AABB collision. The overlap test I'll reach for forever now.
- A state machine. One variable that organizes screens and modes.
- Juice. Sound and shake that cost almost nothing and change how the whole thing feels.

## Where to go next

The things I want to try next, roughly easiest to hardest:

1. A computer opponent. Make the right paddle chase the ball's `y`, and cap its speed so it stays beatable.
2. A real font. Drop a `.ttf` in the folder and load it with `newFont("name.ttf", 48)` for that retro arcade look.
3. Particles on each paddle hit, with `love.graphics.newParticleSystem`.
4. Power ups. A bigger paddle, a faster ball, a second ball at once.

The full source is the two files above. Grab them, run `love .`, and start turning the knobs. That's the part that actually taught me something, the part no write up could have handed me: you learn what each number does by feel, by changing it and watching what happens. So that's what I did, and I'd say go break it yourself. `[ PONG OK ]`
