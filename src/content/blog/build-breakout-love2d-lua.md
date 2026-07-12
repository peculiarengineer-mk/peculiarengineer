---
title: 'Build Breakout with LÖVE and Lua: collision, state, and the timestep trap'
description: 'Build a complete Breakout game in one Lua file: a paddle, 72 bricks, scoring, lives, serve and end states, rectangle collision, and bounded simulation steps that keep the ball honest.'
pubDate: 'Jul 11 2026'
heroImage: '../../assets/breakout-hero.png'
tags: ['LÖVE', 'Love2D', 'Lua', 'Game Dev', 'Breakout', 'Collision', 'Tutorial']
---

[Pong](/blog/make-pong-with-love2d-and-lua/) taught me the game loop. [Klondike](/blog/klondike-solitaire-love2d-lua/) made me learn the parts of Lua that Pong politely let me avoid. Breakout sits in a useful spot between them: still small enough for one `main.lua`, but busy enough to give collision response, generated levels, lives, and the state machine more work to do.

The finished game is the classic shape: one paddle, one ball, 72 bricks, three lives, a score, and a replay screen. The art is a handful of tiny PNGs. There is no physics library deciding what a bounce means. We have to make that choice ourselves, and that is where the useful lesson lives.

> **TL;DR** Detecting a collision and responding to it are separate jobs. The overlap test says the ball touched something; our code still has to push it back out and choose which direction to reverse. Small simulation steps keep the ball from skipping the question entirely. Everything around that loop is state: `serve`, `playing`, `won`, or `gameover`.

## The project shape

Install [LÖVE](https://love2d.org), put these files in one folder, and run `love .` from there. This tutorial uses the sprites supplied with the Breakout demo; keep the `breakout_pixel_art` folder name because the image paths depend on it.

```text
breakout-demo/
├── conf.lua
├── main.lua
└── breakout_pixel_art/
    ├── ball_default.png
    ├── paddle.png
    ├── block_blue.png
    ├── block_brown.png
    ├── block_green.png
    ├── block_pink.png
    ├── game_over_panel.png
    ├── game_over_panel_blue.png
    ├── button_play_again.png
    └── button_pressed_play_again.png
```

`conf.lua` owns the window. The game asks LÖVE what size it actually created instead of repeating `640` and `480` in `main.lua` and hoping the two files never disagree:

```lua
function love.conf(t)
    t.identity = "breakout-tutorial"
    t.window.title = "Classic Breakout"
    t.window.width = 640
    t.window.height = 480
    t.window.resizable = false
    t.window.vsync = 1
end
```

Then, during `love.load`:

```lua
local WINDOW_WIDTH
local WINDOW_HEIGHT

function love.load()
    WINDOW_WIDTH, WINDOW_HEIGHT = love.graphics.getDimensions()
    -- Load images, create fonts, and reset the game here.
end
```

`conf.lua` asks for a size; `love.graphics.getDimensions()` tells us what LÖVE actually created.

## The world is a few tables and four states

Lua tables are enough for every object in this game:

```lua
local paddle = {}
local ball = {}
local bricks = {}

local score = 0
local lives = 3
local gameState = "serve"
```

The state variable is the spine of the program:

- `serve`: the ball waits above the paddle and follows it.
- `playing`: the ball moves and collisions run.
- `won`: everything freezes under the victory panel.
- `gameover`: everything freezes under the defeat panel.

This is not a framework-sized state machine. It is one string and a few guarded branches. Space launches only from `serve`; losing a ball returns to `serve` unless the lives counter reached zero; clearing the bricks enters `won`; replay performs a full reset.

```lua
local function launchBall()
    if gameState ~= "serve" then return end

    local direction = love.math.random(0, 1) == 0 and -1 or 1
    ball.dx = direction * BALL_SPEED * 0.55
    ball.dy = -BALL_SPEED
    gameState = "playing"
end
```

Without that guard, pressing Space during a rally quietly replaces the ball's velocity.

## Generate the wall instead of typing it

You could write 72 brick tables by hand. You would also have to edit 72 of them when the spacing changes. Two nested loops are enough.

```lua
local function createBricks()
    bricks = {}

    local columns = 12
    local rows = 6
    local brickWidth = images.bricks[1]:getWidth()
    local brickHeight = images.bricks[1]:getHeight()
    local horizontalGap = 4
    local verticalGap = 4
    local fieldWidth = columns * brickWidth
        + (columns - 1) * horizontalGap
    local startX = (WINDOW_WIDTH - fieldWidth) / 2

    for row = 1, rows do
        local imageIndex = ((row - 1) % #images.bricks) + 1

        for column = 1, columns do
            table.insert(bricks, {
                x = startX + (column - 1) * (brickWidth + horizontalGap),
                y = 66 + (row - 1) * (brickHeight + verticalGap),
                width = brickWidth,
                height = brickHeight,
                image = images.bricks[imageIndex],
                points = (rows - row + 1) * 10,
                active = true
            })
        end
    end
end
```

Three Lua details matter here:

- Arrays start at 1, so both loops begin at 1.
- `#images.bricks` is the array length. The modulo expression cycles through the four colors no matter how many rows exist.
- Destroying a brick sets `active = false`; it does not remove the entry while `ipairs` is walking the array. Stable arrays make collision loops much less surprising.

The points live on the brick because the row decides what the brick is worth. Now the collision code does not need to know which row it hit. It adds `brick.points`, and the brick carries the answer.

## One overlap test, three kinds of collision

The ball, paddle, and bricks are rectangles, so they all use the same axis-aligned bounding-box test:

```lua
local function overlaps(a, b)
    return a.x < b.x + b.width
       and b.x < a.x + a.width
       and a.y < b.y + b.height
       and b.y < a.y + a.height
end
```

The test only answers **whether** two rectangles overlap. It does not tell you what to do next. Wall, paddle, and brick collisions share detection, but their responses are different.

### Walls: put the ball back, then reverse it

```lua
if ball.x < 0 then
    ball.x = 0
    if ball.dx < 0 then ball.dx = -ball.dx end
elseif ball.x + ball.width > WINDOW_WIDTH then
    ball.x = WINDOW_WIDTH - ball.width
    if ball.dx > 0 then ball.dx = -ball.dx end
end

if ball.y < 0 then
    ball.y = 0
    if ball.dy < 0 then ball.dy = -ball.dy end
end
```

Correcting the position is load-bearing. If you only reverse velocity while the ball remains buried in the wall, the next update can detect the same collision and flip it back again. That is how a ball starts buzzing against an edge instead of leaving it.

### The paddle: let the player choose the angle

A flat `ball.dy = -ball.dy` bounce works, but it removes most of the player's control. Breakout gives the paddle influence by turning the impact position into horizontal velocity:

```lua
local function bounceOffPaddle()
    if ball.dy <= 0 or not overlaps(ball, paddle) then return end

    ball.y = paddle.y - ball.height

    local ballCenter = ball.x + ball.width / 2
    local paddleCenter = paddle.x + paddle.width / 2
    local hitPosition = (ballCenter - paddleCenter) / (paddle.width / 2)
    hitPosition = math.max(-1, math.min(1, hitPosition))

    ball.dx = hitPosition * BALL_SPEED
    ball.dy = -math.max(BALL_SPEED * 0.8, math.abs(ball.dy))
end
```

`hitPosition` runs from roughly `-1` at the left edge through `0` at the center to `1` at the right edge. Hit the center and the ball rises mostly straight. Catch it on an edge and it leaves sideways. That one normalized number is the difference between returning the ball and aiming it.

The `ball.dy <= 0` guard prevents the underside of the paddle from grabbing a rising ball and teleporting it above the surface.

### Bricks: find the shallowest way out

For a brick, compare horizontal and vertical penetration. The smaller overlap is the side the ball most likely entered through:

```lua
local function bounceOffBrick(brick)
    local overlapLeft = ball.x + ball.width - brick.x
    local overlapRight = brick.x + brick.width - ball.x
    local overlapTop = ball.y + ball.height - brick.y
    local overlapBottom = brick.y + brick.height - ball.y
    local smallestX = math.min(overlapLeft, overlapRight)
    local smallestY = math.min(overlapTop, overlapBottom)

    if smallestX < smallestY then
        if overlapLeft < overlapRight then
            ball.x = brick.x - ball.width
            if ball.dx > 0 then ball.dx = -ball.dx end
        else
            ball.x = brick.x + brick.width
            if ball.dx < 0 then ball.dx = -ball.dx end
        end
    else
        if overlapTop < overlapBottom then
            ball.y = brick.y - ball.height
            if ball.dy > 0 then ball.dy = -ball.dy end
        else
            ball.y = brick.y + brick.height
            if ball.dy < 0 then ball.dy = -ball.dy end
        end
    end
end
```

This is deliberately arcade physics. It is not continuous collision detection and it will not settle a debate between two physicists. It gives this small rectangular ball a simple, deterministic answer at most brick edges, which is the job.

The collision loop destroys and scores at most one brick per simulation step:

```lua
for _, brick in ipairs(bricks) do
    if brick.active and overlaps(ball, brick) then
        brick.active = false
        score = score + brick.points
        bounceOffBrick(brick)
        break
    end
end
```

Keep that `break`. At a seam the ball can overlap two bricks at once. Processing both in the same step can flip velocity twice and cancel the bounce. A later substep can still hit the neighboring brick; the `break` prevents two responses from fighting inside one step.

## The timestep trap

Multiplying velocity by `dt` makes motion frame-rate independent, but it does not make discrete collision detection bulletproof. A slow frame can move the ball from one side of a thin brick to the other without ever overlapping it.

The tempting fix is this:

```lua
dt = math.min(dt, 1 / 30)
```

That prevents one enormous move, but it throws elapsed time away. At 10 frames per second the game simulates only one third of a second for every real second, so the ball and paddle visibly slow down.

Instead, consume a normal frame in small pieces:

```lua
local MAX_TIMESTEP = 1 / 120

function love.update(dt)
    -- A resumed laptop can hand us seconds or minutes at once. Do not spend
    -- the next frame replaying all of that history 1/120 second at a time.
    local remainingTime = math.min(dt, 0.25)

    while remainingTime > 0 do
        local step = math.min(remainingTime, MAX_TIMESTEP)
        updateSimulation(step)
        remainingTime = remainingTime - step
    end
end
```

`updateSimulation(step)` contains paddle movement, ball movement, and collision checks. A normal frame consumes all of its time, but no collision step is larger than `1/120` of a second.

The `0.25` cap handles the other half of the trap. If a laptop sleeps for an hour and the game tries to replay all 3,600 seconds in tiny steps, it owes you 432,000 updates before it can draw again. The game appears frozen because it is being extremely faithful to an hour nobody saw. Cap exceptional stalls; subdivide ordinary frames.

## Losing a ball is not resetting the game

There are three different resets here, and mixing them up produces particularly annoying bugs:

- A **ball reset** puts the ball above the current paddle and zeros its velocity.
- A **round reset** enters `serve` after a miss while preserving score and destroyed bricks.
- A **game reset** restores score, lives, every brick, the paddle, and the ball.

```lua
if ball.y > WINDOW_HEIGHT then
    lives = lives - 1

    if lives <= 0 then
        gameState = "gameover"
    else
        gameState = "serve"
        resetBall()
    end
end
```

Call `createBricks()` after every miss and the player gets a fresh wall while keeping the old score. Clear the score after every miss and three lives quietly become three separate games. The names are similar; the consequences are not.

Victory needs one more check: search for one active brick, and win only when none remain.

```lua
local function allBricksDestroyed()
    for _, brick in ipairs(bricks) do
        if brick.active then return false end
    end
    return true
end
```

## Input: held keys versus events

Movement belongs in `updateSimulation` because it should continue while a key is held:

```lua
local movement = 0
if love.keyboard.isDown("left", "a") then movement = movement - 1 end
if love.keyboard.isDown("right", "d") then movement = movement + 1 end

paddle.x = paddle.x + movement * PADDLE_SPEED * dt
paddle.x = math.max(0, math.min(WINDOW_WIDTH - paddle.width, paddle.x))
```

Launching, restarting, and quitting are one-shot events, so they belong in `love.keypressed`:

```lua
function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif key == "space" then
        launchBall()
    elseif (key == "r" or key == "return")
        and (gameState == "won" or gameState == "gameover") then
        resetGame()
    end
end
```

That is the useful distinction: `isDown` answers "is this still held?" every frame; `keypressed` reports "this press happened" once.

## The bugs I would test before calling it done

**Correct overlap before reversing velocity.** Reversing alone leaves the ball inside the collider, where the next step can reverse it again. Snap it outside first.

**Stop after one brick response per step.** Two responses at a seam can cancel one another and remove two bricks. `break` is part of the collision rule, not an optimization.

**Do not throw normal elapsed time away.** A blunt `dt` clamp slows the whole game during dropped frames. Subdivide it.

**Do not simulate an afternoon.** Substeps need an outer cap for resume and debugger stalls, or the game can lock itself in a perfectly accurate replay of time nobody watched.

**Keep terminal states terminal.** Check for `won` and `gameover` before reading movement input. Otherwise the paddle keeps wandering under the end panel while the game is supposedly frozen.

**Ask LÖVE for the real window size.** Keeping dimensions in both `conf.lua` and `main.lua` works until you change one and forget the other.

## Go turn the knobs

Once the game runs, change one thing at a time and watch which rule moves with it:

1. Change `rows` from `6` to `3`. The field, drawing loop, scoring data, collision loop, and win check should all adapt without another edit.
2. Change `BALL_SPEED` from `230` to `400`. The game gets meaner, but the bounded substeps should keep the ball from skipping through a 16-pixel brick.
3. Change the paddle bounce line from `hitPosition * BALL_SPEED` to `hitPosition * BALL_SPEED * 1.4`. Edge hits become sharper while center hits remain nearly vertical.
4. Temporarily replace the substep loop with `dt = math.min(dt, 1 / 30)` and throttle the frame rate. The whole game slows down because that version throws time away. Put the substeps back when the point lands.

## The complete source

The focused blocks above explain the decisions. Here is the runnable version in one place so you do not have to reconstruct declaration order from excerpts. It matches the demo, with one deliberate safeguard added: the outer `0.25`-second cap prevents a long sleep or debugger pause from turning into hundreds of thousands of catch-up updates.

### `conf.lua`

```lua
function love.conf(t)
    t.identity = "breakout-tutorial"
    t.window.title = "Classic Breakout"
    t.window.width = 640
    t.window.height = 480
    t.window.resizable = false
    t.window.vsync = 1
end
```

### `main.lua`

```lua
-- Classic Breakout
-- A deliberately small LÖVE game whose Lua is suitable for a guided tutorial.

local WINDOW_WIDTH
local WINDOW_HEIGHT
local ASSET_PATH = "breakout_pixel_art/"
local MAX_TIMESTEP = 1 / 120

local PADDLE_SPEED = 360
local BALL_SPEED = 230
local STARTING_LIVES = 3

local paddle = {}
local ball = {}
local bricks = {}
local images = {}
local fonts = {}

local score = 0
local lives = STARTING_LIVES
local gameState = "serve"

local panel = { x = 0, y = 0 }
local replayButton = { x = 0, y = 0, width = 240, height = 54 }

-- Axis-aligned bounding box collision works well for our rectangular sprites.
local function overlaps(a, b)
    return a.x < b.x + b.width
        and b.x < a.x + a.width
        and a.y < b.y + b.height
        and b.y < a.y + a.height
end

local function pointInside(x, y, rectangle)
    return x >= rectangle.x and x <= rectangle.x + rectangle.width
        and y >= rectangle.y and y <= rectangle.y + rectangle.height
end

local function resetBall()
    ball.x = paddle.x + (paddle.width - ball.width) / 2
    ball.y = paddle.y - ball.height - 2
    ball.dx = 0
    ball.dy = 0
end

local function createBricks()
    bricks = {}

    local columns = 12
    local rows = 6
    local brickWidth = images.bricks[1]:getWidth()
    local brickHeight = images.bricks[1]:getHeight()
    local horizontalGap = 4
    local verticalGap = 4
    local fieldWidth = columns * brickWidth + (columns - 1) * horizontalGap
    local startX = (WINDOW_WIDTH - fieldWidth) / 2
    local startY = 66

    for row = 1, rows do
        local imageIndex = ((row - 1) % #images.bricks) + 1

        for column = 1, columns do
            table.insert(bricks, {
                x = startX + (column - 1) * (brickWidth + horizontalGap),
                y = startY + (row - 1) * (brickHeight + verticalGap),
                width = brickWidth,
                height = brickHeight,
                image = images.bricks[imageIndex],
                points = (rows - row + 1) * 10,
                active = true
            })
        end
    end
end

local function resetGame()
    score = 0
    lives = STARTING_LIVES
    gameState = "serve"

    paddle.x = (WINDOW_WIDTH - paddle.width) / 2
    paddle.y = WINDOW_HEIGHT - 42
    createBricks()
    resetBall()
end

local function launchBall()
    if gameState ~= "serve" then
        return
    end

    -- A small random horizontal component makes each serve a little different.
    local direction = love.math.random(0, 1) == 0 and -1 or 1
    ball.dx = direction * BALL_SPEED * 0.55
    ball.dy = -BALL_SPEED
    gameState = "playing"
end

local function allBricksDestroyed()
    for _, brick in ipairs(bricks) do
        if brick.active then
            return false
        end
    end

    return true
end

local function bounceOffPaddle()
    if ball.dy <= 0 or not overlaps(ball, paddle) then
        return
    end

    -- Move the ball out of the paddle before reversing it so it cannot stick.
    ball.y = paddle.y - ball.height

    local ballCenter = ball.x + ball.width / 2
    local paddleCenter = paddle.x + paddle.width / 2
    local hitPosition = (ballCenter - paddleCenter) / (paddle.width / 2)
    hitPosition = math.max(-1, math.min(1, hitPosition))

    ball.dx = hitPosition * BALL_SPEED
    ball.dy = -math.max(BALL_SPEED * 0.8, math.abs(ball.dy))
end

local function bounceOffBrick(brick)
    -- Compare overlap depths to decide which face of the brick was hit.
    local overlapLeft = ball.x + ball.width - brick.x
    local overlapRight = brick.x + brick.width - ball.x
    local overlapTop = ball.y + ball.height - brick.y
    local overlapBottom = brick.y + brick.height - ball.y
    local smallestX = math.min(overlapLeft, overlapRight)
    local smallestY = math.min(overlapTop, overlapBottom)

    if smallestX < smallestY then
        if overlapLeft < overlapRight then
            ball.x = brick.x - ball.width
            if ball.dx > 0 then ball.dx = -ball.dx end
        else
            ball.x = brick.x + brick.width
            if ball.dx < 0 then ball.dx = -ball.dx end
        end
    else
        if overlapTop < overlapBottom then
            ball.y = brick.y - ball.height
            if ball.dy > 0 then ball.dy = -ball.dy end
        else
            ball.y = brick.y + brick.height
            if ball.dy < 0 then ball.dy = -ball.dy end
        end
    end
end

function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")
    love.graphics.setBackgroundColor(0.035, 0.045, 0.09)
    love.math.setRandomSeed(os.time())

    -- conf.lua owns the window size; gameplay reads the size LÖVE actually made.
    WINDOW_WIDTH, WINDOW_HEIGHT = love.graphics.getDimensions()

    images.paddle = love.graphics.newImage(ASSET_PATH .. "paddle.png")
    images.ball = love.graphics.newImage(ASSET_PATH .. "ball_default.png")
    images.bricks = {
        love.graphics.newImage(ASSET_PATH .. "block_pink.png"),
        love.graphics.newImage(ASSET_PATH .. "block_brown.png"),
        love.graphics.newImage(ASSET_PATH .. "block_green.png"),
        love.graphics.newImage(ASSET_PATH .. "block_blue.png")
    }
    images.panelGameOver = love.graphics.newImage(ASSET_PATH .. "game_over_panel.png")
    images.panelWon = love.graphics.newImage(ASSET_PATH .. "game_over_panel_blue.png")
    images.replay = love.graphics.newImage(ASSET_PATH .. "button_play_again.png")
    images.replayPressed = love.graphics.newImage(ASSET_PATH .. "button_pressed_play_again.png")

    fonts.hud = love.graphics.newFont(18)
    fonts.title = love.graphics.newFont(28)
    fonts.message = love.graphics.newFont(16)

    paddle.width = images.paddle:getWidth()
    paddle.height = images.paddle:getHeight()
    ball.width = images.ball:getWidth()
    ball.height = images.ball:getHeight()

    panel.x = (WINDOW_WIDTH - images.panelGameOver:getWidth()) / 2
    panel.y = (WINDOW_HEIGHT - images.panelGameOver:getHeight()) / 2 - 25
    replayButton.x = (WINDOW_WIDTH - replayButton.width) / 2
    replayButton.y = panel.y + images.panelGameOver:getHeight() + 10

    resetGame()
end

local function updateSimulation(dt)
    if gameState ~= "serve" and gameState ~= "playing" then
        return
    end

    local movement = 0
    if love.keyboard.isDown("left", "a") then movement = movement - 1 end
    if love.keyboard.isDown("right", "d") then movement = movement + 1 end

    paddle.x = paddle.x + movement * PADDLE_SPEED * dt
    paddle.x = math.max(0, math.min(WINDOW_WIDTH - paddle.width, paddle.x))

    if gameState == "serve" then
        resetBall()
        return
    end

    ball.x = ball.x + ball.dx * dt
    ball.y = ball.y + ball.dy * dt

    if ball.x < 0 then
        ball.x = 0
        if ball.dx < 0 then ball.dx = -ball.dx end
    elseif ball.x + ball.width > WINDOW_WIDTH then
        ball.x = WINDOW_WIDTH - ball.width
        if ball.dx > 0 then ball.dx = -ball.dx end
    end

    if ball.y < 0 then
        ball.y = 0
        if ball.dy < 0 then ball.dy = -ball.dy end
    end

    bounceOffPaddle()

    for _, brick in ipairs(bricks) do
        if brick.active and overlaps(ball, brick) then
            brick.active = false
            score = score + brick.points
            bounceOffBrick(brick)
            break -- Only resolve one brick collision during this simulation step.
        end
    end

    if allBricksDestroyed() then
        gameState = "won"
    elseif ball.y > WINDOW_HEIGHT then
        lives = lives - 1
        if lives <= 0 then
            gameState = "gameover"
        else
            gameState = "serve"
            resetBall()
        end
    end
end

function love.update(dt)
    -- Consume all elapsed time in small pieces. Small steps reduce collision
    -- tunneling without slowing the game when a frame takes longer than usual.
    local remainingTime = math.min(dt, 0.25)
    while remainingTime > 0 do
        local step = math.min(remainingTime, MAX_TIMESTEP)
        updateSimulation(step)
        remainingTime = remainingTime - step
    end
end

function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif key == "space" then
        launchBall()
    elseif (key == "r" or key == "return")
        and (gameState == "won" or gameState == "gameover") then
        resetGame()
    end
end

function love.mousepressed(x, y, button)
    if button == 1
        and (gameState == "won" or gameState == "gameover")
        and pointInside(x, y, replayButton) then
        resetGame()
    end
end

local function drawCentered(text, y, font)
    love.graphics.setFont(font)
    love.graphics.printf(text, 0, y, WINDOW_WIDTH, "center")
end

local function drawEndScreen()
    local won = gameState == "won"
    local mouseX, mouseY = love.mouse.getPosition()
    local hovering = pointInside(mouseX, mouseY, replayButton)
    local pressed = hovering and love.mouse.isDown(1)

    love.graphics.setColor(0, 0, 0, 0.55)
    love.graphics.rectangle("fill", 0, 0, WINDOW_WIDTH, WINDOW_HEIGHT)
    love.graphics.setColor(1, 1, 1)
    love.graphics.draw(won and images.panelWon or images.panelGameOver, panel.x, panel.y)

    love.graphics.setColor(0.08, 0.1, 0.18)
    drawCentered(won and "YOU WIN!" or "GAME OVER", panel.y + 48, fonts.title)
    drawCentered("Final score: " .. score, panel.y + 92, fonts.message)

    love.graphics.setColor(1, 1, 1)
    love.graphics.draw(pressed and images.replayPressed or images.replay,
        replayButton.x, replayButton.y)

    love.graphics.setColor(0.08, 0.1, 0.18)
    drawCentered("PLAY AGAIN", replayButton.y + 16, fonts.message)
    love.graphics.setColor(1, 1, 1)
    drawCentered("Click, press Enter, or press R", replayButton.y + 62, fonts.message)
end

function love.draw()
    love.graphics.setColor(0.12, 0.14, 0.25)
    love.graphics.rectangle("fill", 0, 48, WINDOW_WIDTH, 2)

    love.graphics.setFont(fonts.hud)
    love.graphics.setColor(1, 0.93, 0.65)
    love.graphics.print("SCORE  " .. score, 20, 16)
    love.graphics.printf("LIVES  " .. lives, 0, 16, WINDOW_WIDTH - 20, "right")

    love.graphics.setColor(1, 1, 1)
    for _, brick in ipairs(bricks) do
        if brick.active then
            love.graphics.draw(brick.image, brick.x, brick.y)
        end
    end

    love.graphics.draw(images.paddle, paddle.x, paddle.y)
    love.graphics.draw(images.ball, ball.x, ball.y)

    if gameState == "serve" then
        drawCentered("Move: A/D or arrows     Serve: Space", WINDOW_HEIGHT - 22, fonts.message)
    elseif gameState == "won" or gameState == "gameover" then
        drawEndScreen()
    end
end
```


## What Breakout adds to the ladder

Pong is the cleanest place to learn the loop. Breakout adds a generated field of entities, collision response from more than one side, progress that survives a lost life, and a state machine with a playable pause before every serve. It is still one file. You can still hold the whole thing in your head.

The compact version is this: represent the world with tables, let one state decide which rules are active, move in bounded steps, and always push an overlapping ball back into valid space before you bounce it. The rest is bricks.
