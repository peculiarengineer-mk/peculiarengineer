---
title: 'Pong, Part Three: an opponent that sees the future'
description: 'Give the LÖVE Pong AI a predictive read on the ball, plus Easy, Medium, and Hard, all driven by one little table of numbers. Medium reproduces Part Two exactly, so the default game is unchanged.'
pubDate: 'Jul 1 2026'
heroImage: '../../assets/pong-3-hero.png'
tags: ['LÖVE', 'Love2D', 'Lua', 'Game Dev', 'Pong', 'Game AI', 'Tutorial']
---

In [Part One](/blog/make-pong-with-love2d-and-lua/) I built a complete two player Pong in LÖVE and Lua, and in [Part Two](/blog/pong-computer-opponent-love2d-lua/) I added a simple AI to drive the right paddle, built on the realization that a computer opponent is just input you do not type. That AI worked by chasing the ball. Every frame it aimed at the ball's current `y` and slid toward it. The whole series is mapped on the [Pong series hub](/blog/pong-series/).

That is a fine start, and it has one flaw I want to fix today. Here is the whole idea of this post:

> A good opponent does not chase where the ball is. It chases where the ball is going to be.

I am going to teach the AI to predict the ball's landing spot, bounces and all, and then wrap the whole thing in Easy, Medium, and Hard presets that come from a single table of constants. And because I was careful, Medium reproduces Part Two exactly, so if you never touch the difficulty keys the game plays identically to before. Everything new is additive.

## The weakness of a reactive AI

Go back and watch the Part Two opponent against a fast, angled shot. The ball is screaming toward the corner and the paddle is always a half step behind. It is aiming at where the ball is right now, but by the time it gets there the ball has moved on. On slow, flat rallies the CPU looks great. On sharp shots it looks like it is reacting in slow motion, because it literally is.

The reason is simple. Chasing the current `y` is lag by design. The ball gets a head start every single frame, and the paddle spends the whole rally trying to close a gap it can never quite close. To fix that the AI has to stop reacting and start anticipating. It needs to work out, right now, where the ball will be when it finally arrives at the paddle, and go wait there.

## Predict the crossing point

Here is the thing that makes this tractable: the ball travels in a straight line until it hits something. Between the paddles the only things it can hit are the top and bottom walls, and a wall bounce is just a mirror, flip `dy`, which I already built in Part One. So the ball's path is a straight line that folds every time it kisses a wall. A zig zag.

I want the `y` where that zig zag reaches the paddle's x. There are two ways to think about it.

The naive way is to simulate. Step the ball forward a little at a time, bounce it off walls, and stop when it reaches the paddle. That works, but it is fiddly and slow.

The clever way is to ignore the walls at first. Extend the ball's straight line all the way to the paddle's x as if the walls were not there. That gives a `y` that might be way off screen, something like `-140` or `830`. Then I fold that impossible number back into the playfield, and the fold is the bounces.

### Folding a bounce, by hand

Say the playfield is 0 at the top and 500 at the bottom, just for the picture. The straight line math says the ball arrives at `y = -140`. That is 140 pixels above the ceiling, which is exactly where the ball would be if it had not bounced. But it would have bounced off the top at 0, so instead of landing at `-140` it reflects to `+140`:

```
   y = -140  (imaginary, above ceiling)
       │
   0 ──┼───────────────  ← top wall: fold here
       │╲
       │ ╲
       │  ● y = +140  (real, after one bounce)
       │
 500 ──┴───────────────  ← bottom wall
```

If the number had been past the floor instead, say `640` in a 500 tall field, it folds off the bottom to `500 - 140 = 360`. And a ball that overshoots twice, above the ceiling and then back past the floor, just folds twice. This back and forth folding is a triangle wave. The value oscillates between 0 and the field height, with a period of `2 * fieldHeight`. That triangle wave is the exact path of a ball ricocheting between two walls, with no simulation loop anywhere.

So the prediction is really two parts working together, and it helps to keep them separate in your head.

The first part is where it lands. Follow the straight line to the paddle's x, then fold that `y` into the playfield. This part is exact. The fold reproduces a bounce off any number of walls with pure arithmetic.

The second part is how hard the AI is willing to read the shot. I also count how many walls the ball crossed to get there. If that is more bounces than this difficulty is allowed to see through, the AI gives up predicting and just reacts to the ball's current `y` instead.

That second part is the whole trick to fairness, and I will come back to it. The math can fold any bounce. I deliberately let weaker opponents see only a few bounces ahead.

### Why speed does not matter

Here is a small piece of magic worth pausing on. To find where the ball crosses the paddle's x, I do not need to know how fast it is going. I only need the direction `(dx, dy)`. Since that direction is a unit vector, length 1, from Part One, for every step `dx` the ball moves horizontally it moves `dy` vertically, and that ratio is fixed no matter the speed. Speed only changes when the ball arrives, not where. So it cancels straight out of the geometry, and the whole prediction is one straight line calculation plus a fold.

### The prediction helper

Here is `predictBallY`. It returns the predicted ball center `y`, or `nil` when the ball is moving away, in which case there is nothing to predict and the caller falls back to the old drift toward center behavior. It goes above `updateAI`:

```lua
local function predictBallY(maxBounces)
    if ball.dx <= 0 then return nil end   -- ball moving away: nothing to predict

    -- 1) Extend the straight line to the paddle's front face.
    local targetX  = right.x - BALL_SIZE
    local dist     = targetX - ball.x                 -- horizontal distance to cover
    local slope    = ball.dy / ball.dx                -- vertical per horizontal (speed cancels)
    local rawY     = ball.y + slope * dist            -- y if walls didn't exist

    -- 2) Fold that y back into the playfield (triangle wave = wall bounces).
    local range    = WIN_H - BALL_SIZE                -- the ball's y lives in [0, range]
    local period   = 2 * range
    local folded   = (rawY % period + period) % period  -- wrap into [0, period)
    if folded > range then folded = period - folded     -- reflect the far half back
    end

    -- 3) Respect the difficulty's bounce budget: past it, give up and react instead.
    local bounces = math.floor(math.abs(rawY - ball.y) / range)
    if maxBounces == 0 or bounces > maxBounces then return nil end

    return folded + BALL_SIZE / 2   -- return the ball's CENTER y
end
```

Walking it:

Step 1 projects the straight line to `right.x - BALL_SIZE`, the ball's left edge meeting the paddle's face. `slope` is vertical movement per unit of horizontal movement, and notice `ball.speed` shows up nowhere.

Step 2 is the fold. The modulo wraps `rawY` into one period of the triangle wave, and the `if` reflects the second half of the period back down. What comes out is always a legal on screen `y`.

Step 3 counts how many walls the ball would have crossed to get there and bails, `return nil`, if that is more than this difficulty allows, or if `maxBounces` is `0`, meaning do not predict at all. When it bails, the caller reverts to Part Two's aim at the current `y`, which is exactly what Easy wants.

That double modulo, `(rawY % period + period) % period`, is a safe wrap that behaves even when `rawY` is negative. Lua's `%` can surprise you with negatives, so I normalize it.

## Making it fair again

A perfect predictor is no fun. It is the same problem I solved in Part Two with the speed cap, one level up. If the AI could see infinitely many bounces ahead and aim with pixel precision, it would never miss, ever. I already have two dials that keep it beatable, the `bounces` budget and speed, and I am going to add one more: a little wrongness.

### Bounded prediction depth

That `maxBounces` argument is a difficulty knob in disguise. Think of it as how many bounces the AI can see through before it loses the thread. The fold math could compute any of them exactly. I simply refuse to let weaker opponents use that power. Easy sees through 0 bounces, so it never predicts, it just reacts to the current ball exactly like Part Two's rookie AI. Medium sees through 1 bounce, enough to read a single wall ricochet. Hard sees through 4, which in practice means it reads almost anything. When a shot exceeds the cap the AI gives up and falls back to reacting, and that gap between could predict and allowed to predict is exactly what keeps Easy beatable.

### Once per rally aim error

The second knob is deliberate error. I nudge the AI's target by a random number of pixels so it occasionally misjudges. But when I roll that random number matters enormously.

If I re-rolled the error every frame, the target would twitch wildly, up 40px, down 30px, up 15px, sixty times a second. The paddle would buzz like an angry bee, and worse, the errors would average out to roughly zero, so it would not even feel like a mistake. That is jitter, the same disease the deadzone cured in Part Two.

The fix is to roll the error once per serve and commit to it for the whole rally. The AI picks one wrong read of the incoming shot and lives with it, which is exactly how a human misjudges a ball. I store it in `aiError` and give it its own little helper so I can roll it from more than one place, and you will see why in a moment:

```lua
-- add to the state block near the top:
local aiError = 0

-- a helper, above serveBall:
local function rollAiError()
    local errPx = DIFFICULTIES[difficulty].errorPx
    aiError = love.math.random() * 2 * errPx - errPx   -- one commitment: -errPx .. +errPx
end
```

`love.math.random()` gives `0..1`, and the arithmetic stretches that to the range `-errPx .. +errPx`. A big `errPx` on Easy means big, obvious misreads. A tiny one on Hard means it is nearly dead on.

Now I call it from `serveBall`, right after aiming the ball, so every serve commits to a fresh misread:

```lua
-- inside serveBall, after aiming the ball:
rollAiError()
```

### The updated updateAI

Now `updateAI` reads the active preset, asks for a prediction, applies the committed error, and otherwise keeps the Part Two shape you already know:

```lua
local function updateAI(dt)
    local d = DIFFICULTIES[difficulty]
    local paddleCenter = right.y + PADDLE_H / 2

    local target
    if ball.dx > 0 then
        -- Ball incoming: aim where it WILL be, plus this rally's committed error.
        target = (predictBallY(d.predictBounces) or (ball.y + BALL_SIZE / 2)) + aiError
    else
        -- Ball going away: drift back toward center, but only partway (unchanged).
        local center = WIN_H / 2
        target = paddleCenter + (center - paddleCenter) * d.returnBias
    end

    local diff = target - paddleCenter
    if math.abs(diff) > d.deadzone then
        local dir = diff > 0 and 1 or -1
        right.y = right.y + dir * d.speed * dt
    end

    right.y = math.max(0, math.min(WIN_H - PADDLE_H, right.y))
end
```

Compare it to Part Two's version and the skeleton is identical. Decide a target, move toward it, respect the deadzone, clamp to the screen. The only real change is the target line. `predictBallY(...) or (ball.y + BALL_SIZE / 2)` means use the prediction, but if it returned `nil`, fall back to the reactive aim. Everything else just reads from `d` instead of the old loose constants.

## Difficulty as a dial

Here is the whole difficulty system. One table, three rows, five columns. It drops into the constants block at the top of `main.lua`, right where the loose `AI_*` knobs used to live:

```lua
local DIFFICULTIES = {
  easy   = { speed = 320, deadzone = 22, returnBias = 0.30, predictBounces = 0, errorPx = 55 },
  medium = { speed = 410, deadzone = 12, returnBias = 0.45, predictBounces = 1, errorPx = 22 },
  hard   = { speed = 470, deadzone = 6,  returnBias = 0.60, predictBounces = 4, errorPx = 6  },
}

local difficulty = "medium"   -- which row is active; "medium" == the Part Two AI
```

Look at the `medium` row. `speed = 410`, `deadzone = 12`, `returnBias = 0.45`, those are the exact numbers from Part Two. Medium is Part Two. That is on purpose. The default game is unchanged, and Easy and Hard are the same machine with the dials turned.

Read the table column by column and you can see difficulty happen. Every column moves in the same direction as you go from Easy to Hard.

`speed`, 320 then 410 then 470, is how fast the paddle can move in pixels per second. This is the raw can it get there in time dial from Part Two. Easy is slower than the human's `PADDLE_SPEED` of 450, Hard is faster.

`deadzone`, 22 then 12 then 6, is how close counts as close enough before the paddle stops. A fat deadzone on Easy means it settles lazily near the ball and often just misses. A tight deadzone on Hard means it lines up precisely.

`returnBias`, 0.30 then 0.45 then 0.60, is how eagerly it recenters when the ball is leaving, on a 0 to 1 scale. Low bias leaves Easy leaning the wrong way, easy to wrong foot. High bias keeps Hard poised in the middle, ready for anything.

`predictBounces`, 0 then 1 then 4, is how many wall bounces the prediction may see. This is the star of the post. `0` disables prediction entirely, so Easy just reacts, Part Two rookie style, and `4` reads almost any ricochet.

`errorPx`, 55 then 22 then 6, is the size of the once per rally aim mistake in pixels. Notice this one shrinks toward Hard while the others grow. A big misread on Easy, a near perfect read on Hard. Same direction of difficulty, opposite direction of number.

The lesson from Part Two holds and gets louder. The logic lives in a handful of functions, and the feel lives entirely in this table. Want a brutal Nightmare mode? Add a fourth row. Want to see why prediction matters? Set `medium`'s `predictBounces` to `0` and watch it fall a step behind on angled shots again.

## Wiring it up

Two small changes expose all of this. First, the title screen selector. I already handle `1` and `2` for mode and `space` to start from Part Two, so I add `e`, `m`, and `h` for difficulty, but only in one player mode, since there is no CPU to configure with two humans:

```lua
function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif (key == "1" or key == "2") and (state == "title" or state == "win") then
        gameMode = (key == "1") and "1p" or "2p"
    elseif gameMode == "1p" and (state == "title" or state == "win")
           and (key == "e" or key == "m" or key == "h") then
        difficulty = (key == "e" and "easy") or (key == "m" and "medium") or "hard"
    elseif key == "space" then
        if state == "title" then
            rollAiError()          -- commit this rally's aim error before the first serve
            state = "play"
        elseif state == "win" then
            -- ...reset the match and serveBall(...), exactly as in Part Two...
        end
    end
end
```

Because `keypressed` fires once per press, it is the natural home for menu choices, the same reasoning as the mode toggle in Part Two.

Notice that `rollAiError()` call on the title to play line. It is easy to miss and it matters. The title screen does not re-serve the ball, since `love.load` already served it before the menu, so if I did not roll the error here the difficulty you just picked with `E`, `M`, or `H` would not affect the very first rally. The AI would play the opening point with a stale error left over from startup. The win to play path is fine because it calls `serveBall`, which rolls the error for me. Only the title to play path needs this nudge.

Second, show the active difficulty on the title screen so the player knows what they picked. In the `state == "title"` overlay, when `gameMode == "1p"`, I add a line that marks the current choice, mirroring the `>` marker style I used for the mode line:

```lua
-- inside the title overlay, only in 1-player mode:
if gameMode == "1p" then
    local function mark(d)
        local label = d:upper()   -- render "EASY" / "MEDIUM" / "HARD"
        return (difficulty == d) and ("> " .. label) or ("  " .. label)
    end
    printCentered(mark("easy") .. "   " .. mark("medium") .. "   " .. mark("hard"),
                  smallFont, WIN_H / 2 + 25)
    printCentered("1/2: mode    E/M/H: difficulty    SPACE: start", smallFont, WIN_H / 2 + 90)
end
```

That is the entire user facing surface. Three keys and one line of text. The interesting work all happened in twenty lines of prediction and one table.

## Go turn the knobs

Same as Part Two, the fastest way to understand any of this is to feel it. Run `love .`, press `1` for single player, then tap `E`, `M`, `H` and play a rally on each.

On Easy, hit a sharp angled shot and watch the paddle react late. That is `predictBounces = 0`, the Part Two rookie. Then switch to Hard and try the same shot. It is already waiting for you. That contrast is this whole post.

Set `medium`'s `errorPx` to `0` and play. The misreads vanish and it feels robotic. Bump it to `80` and it starts whiffing like a distracted human. That is your fairness dial.

Set `hard`'s `predictBounces` to `0`. Now even Hard is a step behind. One number, huge difference, which is the payoff of keeping the tunables in a table.

## Where to go next

A ladder of things to build, roughly easiest to hardest:

1. Attract mode. Let the AI drive both paddles on the title screen for a demo that plays itself. I already have `updateAI`, so I just point a mirrored copy at the left paddle.
2. Particles on hit. A little burst on each paddle bounce with `love.graphics.newParticleSystem`. Cheap juice, big payoff.
3. A real retro font. Drop a `.ttf` in the folder and load it with `newFont("name.ttf", 48)` for that arcade cabinet look, instead of LÖVE's default font.
4. Power ups. A bigger paddle, a faster ball, a second ball. Each is a new little table and a rule, the same pattern I have used all series.

The full game is still just `conf.lua` and `main.lua`. Run `love .`, press `1`, pick your poison with `E`, `M`, or `H`, and see if you can beat a paddle that sees the future. `[ P1 vs CPU: HARD ]`

Next up: [Part Four](/blog/pong-attract-mode-retro-font-love2d-lua/), where I point that AI at both paddles so the title screen plays itself, and swap in a real arcade font.
