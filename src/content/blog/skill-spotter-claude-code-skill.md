---
title: 'A Claude Code skill that spots your repeatable work and offers to save it'
description: 'A small Claude Code skill that watches for repetition and stated rules in a conversation, then offers to turn the pattern into a reusable skill — with a subagent review step before anything gets saved.'
pubDate: 'Jun 17 2026'
heroImage: '../../assets/skill-spotter-hero.png'
tags: ['ClaudeCode', 'AI', 'Productivity', 'Automation', 'DevTools']
---

Most of my Claude Code skills exist because I noticed, too late, that I'd
explained the same thing three times. The fix is always the same: write it down
once as a skill so the agent loads it automatically next time. The annoying part
is *remembering to notice*. By the time I realize a workflow is repeatable, I've
already repeated it. This is one of four skills that chain into a pipeline; the [Claude Code skills hub](/blog/claude-code-skills/) maps the whole set.

So I wrote a skill whose entire job is to notice for me. It's called
`skill-spotter`. It watches a conversation for the signals that something is worth
saving — a request that comes up twice, a rule like "always do X" — and when it
sees one, it finishes what I asked and then quietly offers to save the pattern as
a skill. If I say yes, it drafts the new skill, has a subagent sanity-check the
draft, and shows me the result before writing anything.

## Contents

- [What a "skill" is](#what-a-skill-is)
- [The whole skill](#the-whole-skill)
- [How it works, section by section](#how-it-works-section-by-section)
- [Why the trigger is deliberately narrow](#why-the-trigger-is-deliberately-narrow)
- [Why a subagent reviews the draft](#why-a-subagent-reviews-the-draft)
- [Adapting it to your setup](#adapting-it-to-your-setup)

## What a "skill" is

A skill is just a Markdown file with YAML frontmatter that tells the agent *when*
to load it and *what to do* once loaded. The `name` and `description` in the
frontmatter are how the agent decides relevance, so the description is written to
match the situations where you'd actually want it. The body is the procedure.

That's the whole trick, and it's also why `skill-spotter` is useful: the hardest
part of building a skill library is realizing a moment is skill-worthy while
you're in it. A skill that watches for that moment closes the loop.

## The whole skill

Here it is in full so you can copy it:

````markdown
---
name: skill-spotter
description: Notice when something in the conversation is reusable across future sessions and could be saved as a skill, then offer to save it. Trigger only on repetition or stated rules — the user repeats a request, says "always do X" / "every time", or walks through a process they will clearly need again. Do not trigger on ordinary one-off multi-step tasks.
---

# Skill Spotter

When you notice a genuinely *reusable* pattern — the same request twice, a stated
rule ("always do X"), or a workflow the user will obviously repeat — finish their
actual request first, then add one short note:

> This looks repeatable. Want me to save it as a skill?

## Rules

- Only flag patterns reusable across future sessions, not just multi-step work within this one.
- Mention it once per pattern. Never nag.
- Stay silent for one-off questions and simple lookups.

## If they say yes

1. Capture the steps, conventions, and trigger conditions from the conversation.
2. Draft a `SKILL.md` with `name` and `description` frontmatter plus the steps.
3. Spawn a review subagent (the Agent tool, `general-purpose` type) and pass it
   the draft plus these checks: does an equivalent skill already exist in
   `~/.claude/skills/`, is the description specific enough to trigger correctly,
   are the steps reproducible by someone without this conversation's context.
4. Show me the reviewed draft before saving anything. On approval, save to
   `~/.claude/skills/<skill-name>/SKILL.md` (one directory per skill).
````

## How it works, section by section

**The frontmatter** is the trigger, and it's doing double duty. It tells the agent
to fire on repetition or a stated rule, and it explicitly tells it *not* to fire
on an ordinary one-off task. That second half matters more than it looks — without
it, the skill reads as "offer to save a skill whenever the work has steps," which
is almost every session.

**The offer** is one line. The skill finishes your actual request first and only
then adds the note. It never interrupts the work to pitch itself, and it never
turns the offer into a paragraph.

**The rules** keep it from becoming noise. The key one is "reusable across future
sessions, not just multi-step work within this one." A long task isn't a skill. A
task you'll do again next week is. The "mention it once, never nag" rule is the
difference between a helpful nudge and a clippy.

**The save procedure** only runs if you say yes. It captures the steps from the
conversation you just had, drafts a proper `SKILL.md`, and — this is the part I'd
keep — hands the draft to a subagent for review before anything touches disk.

## Why the trigger is deliberately narrow

The first version of this skill triggered on "the user walks through a multi-step
process." That sounds right until you realize it describes nearly every coding
session. A skill that fires constantly is one you delete in a day.

The signal that actually predicts "this should be a skill" is **repetition or a
stated rule**, not complexity. Three things qualify:

1. You ask for the same thing a second time.
2. You state a standing rule — "always do X," "every time," "from now on."
3. You walk through a process that's obviously going to recur.

Everything else, including genuinely complicated one-off work, is left alone. The
narrow trigger is the whole reason the skill is tolerable to leave switched on.

## Why a subagent reviews the draft

When the skill drafts a new skill, it doesn't just write the file. It spawns a
subagent to check three specific things:

- **Does an equivalent skill already exist?** No point adding a duplicate that
  competes with something you already have.
- **Is the description specific enough to trigger correctly?** A vague description
  either never fires or fires on everything. This is the single most common way a
  hand-written skill fails.
- **Are the steps reproducible without this conversation's context?** The draft is
  written from a chat full of shared context. The subagent reads it cold, the way
  a future session will, and flags anything that only makes sense if you were
  there.

A fresh agent reading the draft with no memory of the conversation is a good proxy
for how the skill will actually be loaded later — with none of today's context in
the room. That's exactly the review you want before saving.

## Adapting it to your setup

The specific wording is mine, but the shape transfers to any agent setup with a
loadable-skill or saved-prompt mechanism:

- Keep the trigger **narrow**. Tie it to repetition and stated rules, not to task
  complexity, or it will fire constantly.
- Keep the offer **small and deferred**. Finish the real work first, then make a
  one-line offer. Never interrupt to pitch.
- Keep a **review step** before saving. A second pass — ideally from a fresh
  context — catches the vague-description failure mode that kills most skills.

That three-part skeleton — narrow trigger, deferred one-line offer, cold review
before saving — is the reusable idea. The rest is just wording.

This is the front of the same pipeline as the rest of my skill posts: once
`skill-spotter` catches a pattern and you save it, the
[code-review-recon skill](/blog/code-review-recon-claude-code-skill/) maps a
codebase before you touch it, the
[dev-plan skill](/blog/dev-plan-claude-code-skill/) turns a vague request into a
locked plan, and the [dev-handoff skill](/blog/dev-handoff-claude-code-skill/)
dispatches that plan to worker models. Spot, plan, hand off.

The neat thing about `skill-spotter` is that it's the skill that grows the rest of
your skill library. Leave it on, keep working, and the moments worth capturing
start raising their own hands.
