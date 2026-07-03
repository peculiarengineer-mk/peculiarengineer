---
title: 'Pong, Part Four: a game that plays itself'
description: 'Add attract mode to the LÖVE Pong, the self-running ghost match behind the title screen, then swap in a real retro pixel font. Both fall out of one idea: the AI is just input you do not type, so nothing says only one paddle can use it.'
pubDate: 'Jul 1 2026'
tags: ['LÖVE', 'Love2D', 'Lua', 'Game Dev', 'Pong', 'Game AI', 'Tutorial']
---

In [Part One](/blog/make-pong-with-love2d-and-lua/) I built two player Pong, in [Part Two](/blog/pong-computer-opponent-love2d-lua/) I added a simple AI to drive the right paddle, on the realization that a computer opponent is just input you do not type, and in [Part Three](/blog/pong-predictive-ai-difficulty-love2d-lua/) I made that AI predict where the ball is going and wrapped it in Easy, Medium, and Hard. This time I do something that sounds harder than it is and looks great: I make the title screen play itself.

Walk up to any old arcade cabinet and it is not sitting on a static logo. It is playing, a ghost match running to lure you into dropping a coin. That is called attract mode, and it is the big idea of this post:

> If the AI is just input you do not type, then nothing says only one paddle can use it.

I am going to point the AI at both paddles, let the ball rip behind the menu, and then, as a little polish pass to close out, swap LÖVE's built in font for a real retro pixel font. That last step is a first for this series: my very first downloaded asset.

## Attract mode is almost free

Here is why this is a small change and not a big one. I already have everything I need.

`updateAI`, from Part Three, drives a paddle toward the ball. The ball physics, from Part One, moves it, bounces it off walls, bounces it off paddles, and detects a point. Attract mode is just this: run `updateAI` on both paddles, run the physics, and when someone scores, do not tally it, just serve again. No winner, no score, an endless ghost volley.

Two things stand in the way, and both are worth fixing properly because they teach something.

First, `updateAI` from Part Three is hard wired to the right paddle. I need it to drive either side.

Second, my ball physics is currently tangled up inside `love.update`, mixed in with scoring. I need to run it from the title screen without the scoring.

Clear both and attract mode falls out in a few lines.

## Step 1: teach the AI to play either side

Look back at Part Three's `updateAI` and `predictBallY`. They mention `right` all over the place: `right.y`, `right.x`, and the guard `if ball.dx > 0`, since a rightward ball is heading toward the right paddle. None of that is really about the right paddle specifically. It is about the paddle this AI controls. So I make that explicit. I pass in which paddle, and a `side` that says which way is incoming.

`side = 1` means this AI runs the right paddle. The ball is incoming when it moves right, `ball.dx > 0`, and it aims at the paddle's left face. `side = -1` means this AI runs the left paddle. The ball is incoming when it moves left, `ball.dx < 0`, and it aims at the paddle's right face.

The neat trick is that one expression handles both: `ball.dx * side > 0`. For the right paddle that is `ball.dx > 0`. For the left paddle, `side` is negative, so it flips to `ball.dx < 0`. Multiplying by `side` is a tiny, readable way to say incoming, whichever side I am on.

Here is `predictBallY`, now parameterized. The only changes from Part Three are the guard and the `targetX` line. The fold math does not care which direction the ball travels:

```lua
local function predictBallY(paddle, side, maxBounces)
    if ball.dx * side <= 0 then return nil end       -- ball moving away from this paddle
    if maxBounces <= 0 then return nil end            -- Easy: no prediction at all

    -- x where the ball meets this paddle's face (right paddle = its left edge,
    -- left paddle = its right edge).
    local targetX = (side > 0) and (paddle.x - BALL_SIZE) or (paddle.x + PADDLE_W)
    local range   = WIN_H - BALL_SIZE
    local slope   = ball.dy / ball.dx
    local yFlat   = ball.y + slope * (targetX - ball.x)

    local bounces = math.floor(math.abs(yFlat - ball.y) / range)
    if bounces > maxBounces then return nil end

    local period = 2 * range
    local m = yFlat % period
    if m < 0 then m = m + period end
    local folded = (m <= range) and m or (period - m)

    return folded + BALL_SIZE / 2
end
```

Why is the fold untouched? Because it was always direction agnostic. `slope = ball.dy / ball.dx` and `(targetX - ball.x)` both carry the sign of the ball's travel. For a leftward ball, `ball.dx` is negative and `targetX` is to the left of the ball, so the two negatives multiply into the same forward projection. And the bounce count uses `math.abs`, so it never cared about direction in the first place. That is the payoff of writing the geometry cleanly in Part Three. It generalizes for free.

`updateAI` gets the same treatment. Every `right` becomes `paddle`, the incoming test becomes `ball.dx * side > 0`, and the prediction call passes `paddle, side` through:

```lua
local function updateAI(paddle, side, dt)
    local d = DIFFICULTIES[difficulty]
    local paddleCenter = paddle.y + PADDLE_H / 2

    local target
    if ball.dx * side > 0 then
        -- Ball incoming: aim where it WILL cross this paddle's face, plus this rally's error.
        target = predictBallY(paddle, side, d.predictBounces) or (ball.y + BALL_SIZE / 2)
        target = target + aiError
    else
        -- Ball going away: drift back toward center, only partway (unchanged).
        local center = WIN_H / 2
        target = paddleCenter + (center - paddleCenter) * d.returnBias
    end

    local diff = target - paddleCenter
    if math.abs(diff) > d.deadzone then
        local dir = diff > 0 and 1 or -1
        paddle.y = paddle.y + dir * d.speed * dt
    end

    paddle.y = math.max(0, math.min(WIN_H - PADDLE_H, paddle.y))
end
```

Nothing about how the CPU plays has changed. The old single player call just becomes `updateAI(right, 1, dt)`, which does exactly what Part Three did. I did not make the AI smarter, I made it portable. That is a refactor: same behavior, more reusable shape.

## Step 2: pull the physics out of love.update

Right now the ball's movement, its wall and paddle bounces, and the scoring all live jammed together in `love.update`. To run the demo I need the physics without the scoring. So I lift the physics into its own function, `stepRally`, and give it one careful rule:

> `stepRally` moves and bounces the ball, and reports if the ball left the field, but it never scores and never re-serves. The caller decides what a point means.

That rule is the whole design. It returns `"left"` or `"right"`, which edge the ball crossed, or `nil`, and then a real game and the attract demo can each react differently to the same event:

```lua
local function stepRally(dt, silent)
    -- Move the ball.
    ball.x = ball.x + ball.dx * ball.speed * dt
    ball.y = ball.y + ball.dy * ball.speed * dt

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

    -- Bounce off paddles.
    if ball.dx < 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                left.x, left.y, PADDLE_W, PADDLE_H) then
        ball.x = left.x + PADDLE_W
        bounceOffPaddle(left, 1, silent)
    elseif ball.dx > 0 and overlaps(ball.x, ball.y, BALL_SIZE, BALL_SIZE,
                                    right.x, right.y, PADDLE_W, PADDLE_H) then
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
```

There is a `silent` parameter in there. Hold that thought for one section, it is what keeps the demo from rattling the menu.

Now the play branch of `love.update` becomes small and readable. It calls `stepRally`, and it owns the scoring policy: award the point to the side that did not get scored on, and serve back toward the loser:

```lua
local scored = stepRally(dt)
if scored == "left" then
    right.score = right.score + 1     -- ball got past the left side
    sndScore:stop(); sndScore:play()
    startShake(10)
    serveBall(1)
elseif scored == "right" then
    left.score = left.score + 1       -- ball got past the right side
    sndScore:stop(); sndScore:play()
    startShake(10)
    serveBall(-1)
end
-- ...then the win check, unchanged from Part Three...
```

This is the exact behavior I had before, same points, same serve directions, same beep and shake, just with the what happened, the physics, cleanly separated from the what it means, the scoring. That separation is the whole reason attract mode is about to be trivial.

## Step 3: attract mode, at last

Part Three's `love.update` started with `if state ~= "play" then return end`, so on the title screen nothing moved. I replace that with a real title screen branch that runs the demo:

```lua
function love.update(dt)
    -- Decay the screen shake regardless of state.
    if shake.time > 0 then
        shake.time = shake.time - dt
    end

    if state == "title" then
        -- Attract mode: both paddles are the AI and the ball plays on -- a self-
        -- running demo. Silent, and it never scores: on a point we just re-serve.
        updateAI(left,  -1, dt)
        updateAI(right,  1, dt)
        local scored = stepRally(dt, true)   -- true = silent
        if scored == "left" then
            serveBall(1)
        elseif scored == "right" then
            serveBall(-1)
        end
        return
    end

    if state ~= "play" then
        return   -- "win": idle here; only the shake above keeps decaying
    end

    -- ...play-mode input, stepRally + scoring, and win check as above...
end
```

Read the title branch next to the play branch and the symmetry is the point. Both run `updateAI` and `stepRally`. That is the shared machine. The play branch turns a point into a score, and a win check. The title branch turns a point into just another serve. Same event, two policies, which is exactly what the `stepRally` return value bought me.

And `love.load` already calls `serveBall` before the menu shows, so the demo is alive the instant the game opens. There is no separate start the demo code, it just runs.

Note that the `state == "win"` screen still falls through both branches to the bare `return`, so it stays frozen and only the shake decays. Scoring and the demo cannot leak onto the win screen.

### Why silent exists

Try the demo without that `silent` flag and you will immediately want it back. Two problems.

The menu would shake. My screen shake works by translating the whole scene a few pixels, Part One's juice, and that translate happens before I draw the menu text. So every time a demo paddle connects, PONG and the menu would jerk sideways. That is annoying on a title screen you are trying to read.

The menu would beep. A paddle blip and a wall blip on every bounce, forever, before the player has even started.

So `stepRally(dt, true)` passes `silent = true`, and I thread it down into the bounce helper, gating the juice on it:

```lua
local function bounceOffPaddle(paddle, towardDir, silent)
    -- ...set the new ball angle and speed as before...
    if not silent then
        sndPaddle:stop(); sndPaddle:play()
        startShake(6)
    end
end
```

Real play passes no flag, so `silent` is `nil`, which is falsy, and keeps all its juice. The demo passes `true` and plays quietly and still. Same physics, different presentation, a theme of this whole post.

### A clean start when the player takes over

One subtlety. While the menu sits there, the demo has been knocking the ball all over the field. When the player finally hits `SPACE`, I do not want them to inherit whatever half finished volley the ghosts left behind. So the title to play handoff resets the world:

```lua
elseif key == "space" and (state == "title" or state == "win") then
    -- Start fresh. From "title" the demo left the ball mid-volley; from "win" the
    -- scores are maxed -- either way, reset everything and serve.
    left.score, right.score = 0, 0
    winner = nil
    centerPaddles()
    serveBall(love.math.random(2) == 1 and -1 or 1)   -- serveBall also rolls the aim error
    state = "play"
```

Nice bonus: the title to play and win to play cases now do the same thing, zero the scores, recenter, serve, so they collapse into one branch. And because `serveBall` already rolls a fresh aim error internally, I do not need the separate `rollAiError()` call Part Three had here. The reset serve covers it.

## Polish: a real retro font

The game works. Now let me make it look the part. Until now this series has been proudly download free. Even the sound effects are square waves I generate in code, no asset files at all. I am going to break that rule on purpose, once, because a crisp pixel font is the single biggest visual upgrade for the least effort, and it is a good excuse to learn how LÖVE loads assets.

### Where files live

Drop a font file into the project so the folder looks like this:

```
pong-demo/
├── conf.lua
├── main.lua
└── assets/
    └── fonts/
        ├── PressStart2P.ttf
        └── OFL.txt
```

I am using Press Start 2P, the quintessential blocky arcade font, which is free under the SIL Open Font License. That license, `OFL.txt`, has one main obligation: ship it alongside the font, which is why it is sitting right there in the folder. Credit where it is due, keep the license with the file and you are square.

LÖVE resolves paths relative to your game folder, so from code the font is just `"assets/fonts/PressStart2P.ttf"`. I put that path up in the constants block with the other knobs:

```lua
local FONT_PATH = "assets/fonts/PressStart2P.ttf"
```

### Loading it, with a parachute

Loading a font is one call, `love.graphics.newFont(path, size)`. But there is a catch worth teaching. If that file is missing or misspelled, `newFont` raises an error and your game will not start. Shipping my first asset should not make the game more fragile than the asset free version was. So I wrap it in `pcall`, a protected call, and fall back to LÖVE's built in font if anything goes wrong:

```lua
local function loadFont(size)
    local ok, f = pcall(love.graphics.newFont, FONT_PATH, size)
    return ok and f or love.graphics.newFont(size)   -- fall back to the built-in font
end
```

`pcall` runs the function and, instead of crashing, hands back `ok = false` when it fails. So `ok and f or love.graphics.newFont(size)` reads as the loaded font if it worked, otherwise the plain default. Delete the `.ttf` and the game still runs, just in the old font. That is the promise I made in Part One and I am keeping it.

Then in `love.load`, build the three fonts through it:

```lua
smallFont = loadFont(16)
bigFont   = loadFont(32)
hugeFont  = loadFont(56)
```

### Sizes want to be multiples of 8

Those sizes are not arbitrary. Press Start 2P is drawn on an 8 pixel grid. Every glyph is designed at 8px and scales up cleanly only at whole multiples of 8. Combined with the `love.graphics.setDefaultFilter("nearest", "nearest")` from Part One, which keeps pixels crisp instead of blurring them, sizes like 16, 32, and 56 stay razor sharp, while an off grid size like 30 or 14 comes out slightly fuzzy. When you adopt a pixel font, size it to its grid.

### Watch the width

One gotcha with a blocky font: it is wider than the default. Press Start 2P is roughly monospace at about one glyph width per point of size, so a 50 character line at size 16 is about 800 pixels, the entire window. My `printCentered` lays text across the full window width and wraps anything that overflows, which would silently break the tidy `y = y + 30` spacing of the title screen.

The fix is boring but real: shorten the strings. The Part Three menu line `"1/2: mode   E/M/H: difficulty   SPACE: start"` becomes the tighter `"1/2 MODE  E/M/H DIFF  SPACE=GO"`, difficulty labels shrink, `MEDIUM` to `MED`, and so on. It is a reminder that a font is not a direct swap. Changing how wide your text is means revisiting your layout. A quick dimming panel behind the menu keeps it readable over the moving demo, too:

```lua
-- at the top of the title overlay, before the text:
love.graphics.setColor(0, 0, 0, 0.6)
love.graphics.rectangle("fill", 0, WIN_H / 2 - 150, WIN_W, 320)
love.graphics.setColor(1, 1, 1)
```

## Go watch the ghosts

Run `love .` and just watch for a few seconds before touching anything, two ghost paddles volleying behind a crisp arcade menu. Then:

Tap `E`, `M`, or `H` on the title screen and keep watching. The demo paddles use the same difficulty you pick, so on Hard the ghost match is a tense, near perfect rally, and on Easy the ghosts whiff and trade points. The attract demo is a preview of the opponent you are about to face.

Delete `assets/fonts/PressStart2P.ttf` and run again. The game still boots, just in the plain font. That is your `pcall` parachute doing its job.

Press `SPACE` mid demo and note the ball snaps back to a clean center serve. That is the handoff reset. Comment it out and you will inherit the ghosts' volley instead.

And the ladder onward, roughly easiest to hardest:

1. Particles on hit. A little spark burst on each paddle bounce with `love.graphics.newParticleSystem`. Cheap juice, and the demo shows it off for free.
2. Power ups. A bigger paddle, a faster ball, a second ball. Each is a new little table and a rule, the same pattern I have used all series.
3. A full source listing. If you have been following along in pieces, it is worth pasting the whole `main.lua` end to end once to see how little code all four parts really add up to.

The full game is still just `conf.lua`, `main.lua`, and now one font file. Run `love .`, watch the ghosts play, and drop your coin.

Next up: [Part Five](/blog/pong-power-ups-particles-love2d-lua/), the finale, where I add spawned power-ups, timed effects, and a particle burst, then paste the whole game end to end.
