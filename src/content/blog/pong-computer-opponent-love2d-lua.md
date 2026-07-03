---
title: 'Pong, Part Two: teaching the paddle to play itself'
description: 'Add a one player mode to the LÖVE Pong from Part One by writing a computer opponent. An AI is just input you do not type, with a few limits bolted on to keep it beatable.'
pubDate: 'Jun 30 2026'
tags: ['LÖVE', 'Love2D', 'Lua', 'Game Dev', 'Pong', 'Game AI', 'Tutorial']
---

In [Part One](/blog/make-pong-with-love2d-and-lua/) I built a complete two player Pong in LÖVE and Lua: the game loop, delta time, collision, scoring, and a bit of juice. It works, and it is genuinely fun, right up until you notice you need a friend sitting next to you to play it. So this time I taught the computer to play the right paddle. That is the one player mode, and there is a key on the title screen to hand the paddle back to a human whenever a friend does show up.

In Part One the right paddle's `y` went up and down because the arrow keys told it to, every frame. That was the only place its movement came from. Nothing else in the game ever asked *why* the paddle sat where it did. The ball bounces off wherever it happens to be, the score reacts when the ball slips past, and none of that code cares whether a person is holding the keys. So a computer opponent is not a new system I bolt onto the game. It is the same right paddle, reading its position from a function I write instead of from the keyboard. Everything after this is just making that function play a decent game.

## The shape of every simple game AI

Almost every basic game AI I have seen is the same two steps, run every frame:

1. Decide where you want to be.
2. Move toward it, but no faster than your top speed.

For a Pong paddle, step one is easy. I want to line up with the ball. The dead simple version of the whole AI is one line, `right.y = ball.y`, and I want to tell you up front that it is a terrible opponent, for two reasons. It is perfect and instant, so you can never score on it. And it snaps straight to the ball every frame, which just looks broken. A good opponent is that naive idea plus a few deliberate handicaps that make it feel fair and a little bit human.

I put those handicaps up top as constants, right next to the knobs from Part One, because difficulty is exactly the kind of thing you want to tune by changing a number instead of digging through logic:

```lua
local AI_SPEED       = 410       -- a touch slower than the human (PADDLE_SPEED = 450)
local AI_DEADZONE    = 12        -- stop within this many px of the target (no jitter)
local AI_RETURN_BIAS = 0.45      -- 0..1: how eagerly it drifts back to center when idle
```

Three numbers, and each one fixes a specific way the naive version feels wrong. The reasoning behind each is the part worth keeping.

### A speed cap, so you can actually win

The paddle may only move `AI_SPEED` pixels per second, and I set that below the human's `PADDLE_SPEED` on purpose. Now a fast, sharply angled shot can outrun the CPU, which means the ball getting past it is a thing you did, not a thing the computer allowed. This is the main difficulty dial. Push it up toward `PADDLE_SPEED` for a nasty opponent, drop it for an easy one. And notice it still gets multiplied by `dt`, exactly like the human paddle did in Part One. The AI obeys the same per second movement rule as everything else in the game.

### A deadzone, so it stops twitching

If the AI always chased the exact center of the ball, it would never quite get there, so it would buzz up and down a pixel at a time forever. The deadzone is me telling it: if you are already within 12 pixels of your target, that is close enough, hold still. The difference between a paddle that glides to position and one that vibrates in place is this one check, and it costs nothing.

### Drifting back, so it can be caught leaning

A perfect opponent snaps back to the ready position the instant the ball leaves, which makes it impossible to fake out. I did not want that. So when the ball is heading away from the CPU, it only eases *partway* back toward center, controlled by `AI_RETURN_BIAS`. Sometimes that leaves it leaning the wrong way when the ball comes back, and having it be occasionally out of position is exactly what makes beating it feel earned instead of lucky.

## The AI itself

Here is the whole opponent. It goes up with the other helpers, above `love.load`, for the same reason everything else did in Part One: a `local` only exists from its line downward, so a helper has to sit above the code that calls it. Read the comments and you can see the decide a target, then move toward it shape right in the structure:

```lua
local function updateAI(dt)
    local paddleCenter = right.y + PADDLE_H / 2

    local target
    if ball.dx > 0 then
        target = ball.y + BALL_SIZE / 2                 -- ball incoming: track it
    else
        -- Ball going away: drift back toward center, but only partway.
        local center = WIN_H / 2
        target = paddleCenter + (center - paddleCenter) * AI_RETURN_BIAS
    end

    local diff = target - paddleCenter
    if math.abs(diff) > AI_DEADZONE then
        local dir = diff > 0 and 1 or -1
        right.y = right.y + dir * AI_SPEED * dt
    end

    right.y = math.max(0, math.min(WIN_H - PADDLE_H, right.y))
end
```

Walking through it once:

`ball.dx > 0` means the ball is moving right, which is toward the CPU. That is the `dx` direction from Part One doing its job again. Only when the ball is actually coming does the paddle bother tracking it. Otherwise it falls into the drift back branch.

`diff` is how far my target is from where I am right now. I take one step in that direction at `AI_SPEED`, but only if `diff` is outside the deadzone. Inside the deadzone I do nothing, which is the whole point of the deadzone.

That last line is the exact same clamp the human paddles use, keeping the paddle on screen. I did not write a new one. I copied it, because the AI paddle is still a paddle and the rules that keep a paddle on the board have not changed.

That is the entire opponent. No new systems, nothing bolted onto the ball or the score.

## Plugging it in

In Part One, `love.update` always read the arrow keys for the right paddle. Now I branch on a `gameMode` variable that says who is driving:

```lua
local gameMode = "1p"   -- "1p" = vs CPU, "2p" = two humans
```

```lua
-- inside love.update, where the right paddle used to read the arrow keys:
if gameMode == "1p" then
    updateAI(dt)
else
    if love.keyboard.isDown("up") then
        right.y = right.y - PADDLE_SPEED * dt
    elseif love.keyboard.isDown("down") then
        right.y = right.y + PADDLE_SPEED * dt
    end
end
```

This is what I meant by input you do not type. The only thing that changed is where the right paddle's `y` comes from. In two player mode the `else` branch is the same code Part One always ran, so nothing about the human game is any different. In one player mode the same paddle moves, the ball still bounces off it the same way, scoring still works, because none of that ever knew or cared where the movement came from.

## Letting the player choose

I extended the state machine from Part One instead of adding a new one. On the title screen or the win screen, `1` and `2` pick the mode, and Space still starts the match. Because `keypressed` fires once per press, it is the right home for a menu choice, the same way it was the right home for "press Space to start":

```lua
function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif (key == "1" or key == "2") and (state == "title" or state == "win") then
        gameMode = (key == "1") and "1p" or "2p"
    elseif key == "space" then
        -- ...start / restart, exactly as in Part One...
    end
end
```

Then the title overlay shows which mode is selected and lists the controls that actually apply. In one player mode the right side is the CPU, so there are no right paddle keys to show, and it would be confusing to list them. I also swapped the winner text so the end screen reads "You win!" or "CPU wins!" when you are playing solo, because "Right player wins!" is a strange thing to read when the right player is a computer.

## Go turn the knobs

This is my favorite part and the thing I would push you to actually do rather than just read. Change one number, run `love .`, and feel the difference. That loop is where the learning lives.

Set `AI_SPEED = 460`, just above the human, and watch it become nearly unbeatable. That is the whole difficulty curve in one number.

Set `AI_DEADZONE = 0` and watch the paddle jitter on the ball. Now you can *see* the problem the deadzone was quietly solving the whole time.

Set `AI_RETURN_BIAS = 1.0` and the CPU snaps fully back to center every time, which makes it much harder to catch out of position. Set it to `0` and it never recenters at all, which makes it easy to exploit once you notice.

Tuning those three numbers is the same thing a real game designer does. The logic was twenty lines and none of it was hard. The *feel* of the opponent lives entirely in the constants, and you find the right values by playing, not by reasoning about them.

## What Part Two taught me

- An AI is input you do not type. Swap the source of a paddle's movement and the rest of the game does not need to know.
- Decide a target, then move toward it. That is the backbone of most simple game AI, and it fit Pong in a dozen lines.
- The limits are what make it fun, not the tracking. The speed cap is the one that actually matters, since it is the only reason a shot ever gets past. The deadzone just stops the twitching, and the lazy recentering is there so you can catch it leaning.
- Difficulty belongs in constants, not in logic, so you can tune it by feel.

## Where to go next

The right paddle currently aims at the ball's current `y`, which is honestly a bit dumb. It is aiming at where the ball is, not where it is going. A few directions I want to try:

1. Difficulty presets. Easy, Medium, and Hard that just swap the three AI constants. No new logic at all.
2. A little error. Nudge the AI's target by a small random offset so it occasionally misjudges a ball, and shrink that offset for the harder modes. Imperfect aim reads as human.
3. Predict the bounce. Instead of aiming at the ball's current `y`, follow its `dy` and aim at where it will actually be when it reaches the paddle. That turns a paddle that reacts into one that anticipates, which is a real jump in how sharp it feels.
4. Attract mode. Let the AI drive *both* paddles on the title screen so the game demos itself while nobody is playing. Since either paddle is just a movement source, this is barely any code.

The whole game is still just `conf.lua` and `main.lua`. Run `love .`, press `1`, and play a computer that, twenty lines ago, did not exist. `[ P1 vs CPU ]`

Next up: [Part Three](/blog/pong-predictive-ai-difficulty-love2d-lua/), where I teach that AI to predict where the ball is going and wrap it in Easy, Medium, and Hard.