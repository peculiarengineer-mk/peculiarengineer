---
title: 'A Claude Code skill that writes plans a sub-agent can follow blindly'
description: 'A Claude Code skill that turns a vague request into a locked, phase-by-phase plan a junior dev — or a headless AI sub-agent — can execute without asking questions.'
pubDate: 'Jun 10 2026'
heroImage: '../../assets/dev-plan-hero.png'
---

In the [last post](/blog/dev-handoff-claude-code-skill/) I shared `dev-handoff`,
the skill that dispatches an approved plan to worker models. But a handoff is only
as good as the plan it hands off. Workers running headless can't ask "wait, which
file?" or "did you mean the user table or the account table?" — so the plan has to
answer every question *before* anyone writes code.

This is the skill that produces those plans. It's called `dev-plan`, and its whole
job is to turn a fuzzy request into an implementation plan so explicit that a
junior dev — or a sub-agent that can't ask follow-ups — can execute it without
clarification. Sharing it here for the same reason as the last one: it's a real,
load-bearing [Claude Code](https://claude.com/claude-code) skill, not a demo.

## Contents

- [The core idea: lock scope before code](#the-core-idea-lock-scope-before-code)
- [The whole skill](#the-whole-skill)
- [What makes a plan executable without questions](#what-makes-a-plan-executable-without-questions)
- [Why SOLID shows up in a planning skill](#why-solid-shows-up-in-a-planning-skill)
- [The six sections, and why each exists](#the-six-sections-and-why-each-exists)
- [How it pairs with dev-handoff](#how-it-pairs-with-dev-handoff)

## The core idea: lock scope before code

Most bad AI coding sessions go wrong at the same moment: the model starts typing
before anyone agreed on what "done" means. Then it invents file paths, drifts into
adjacent features, and you spend more time correcting than you'd have spent writing
it yourself.

`dev-plan` puts a hard gate in front of that. It verifies what actually exists
(reads files, greps, checks the schema — never invents names), confirms scope with
*at most one* question, and refuses to plan more than ~one day of work at a time.
The output is a frozen contract. Approval comes before implementation, always.

## The whole skill

Copy it as-is:

````markdown
# Dev Plan Skill

Produce an implementation plan a junior dev — or a headless sub-agent that can't ask questions — can follow without clarification. Scope is locked before code is written.

## Before drafting
1. **Verify what exists.** Read files, grep, check the schema. Never invent paths or function names.
2. **Confirm scope.** One targeted question max if ambiguous; otherwise state an explicit assumption.
3. **Phase it.** Work bigger than ~1 day splits into independently-shippable phases. Plan one phase at a time.

## Design principles
Apply SOLID when shaping tasks; call out in "Notes" where the codebase tempts a violation:
- **SRP** — one task = one responsibility; if a "Why" paragraph needs the word "and", split the task.
- **OCP** — prefer extension points (new handler, new strategy) over editing stable core code.
- **DIP** — depend on abstractions: new code takes interfaces/protocols at the boundary, not concrete clients (e.g., inject the DB client, don't instantiate it inside the service). This is also what makes tasks parallel-safe — workers build against the interface, not each other's code.
- Don't over-engineer: no abstraction for a single implementation unless a second is already planned.

## Plan structure (every plan, in order)
1. **File Tree** — code block, every file with `[CREATE]`/`[MODIFY]` and one-line purpose. One sentence after: file count + what's deliberately not in this phase.
2. **Numbered tasks** — non-overlapping; each file appears in at most one task. Each task is self-contained (no "same as Task 2") with exactly: **File / Why** (motivation, one paragraph) / **What to change** (concrete, real code chunks, verified line numbers) / **Notes** (gotchas only, skip if none) / **Done when** (checkable by command or file inspection — workers use this as their stopping condition).
3. **Order of execution** — table: task # | name | depends on | parallel-safe. Parallel-safe only if no shared files with other parallel tasks.
4. **Acceptance for the phase** — end-to-end checklist proving the user-visible payoff.
5. **Out of scope** — aggressive bullet list of things a reader might assume are included (RBAC, bulk ops, tests, docs).
6. **Closing question** — "Want me to start on Task 1?" / "Ready to hand off?" Never implement without approval.

## Rules
- Direct tone, no hedging, no placeholders like `<your-table>`.
- "What to change" over 40 lines = you're implementing, not planning.
- No optional tasks — in or out.
- Tests match the codebase's existing bar; don't add by default.
- "Do the same for phase N" = full structure again, standalone, no summarizing the prior phase.
````

## What makes a plan executable without questions

Every rule in this skill exists to remove a reason a worker might stall or guess:

- **"Verify what exists."** A worker handed an invented path fails immediately.
  Grounding the plan in real files and line numbers is non-negotiable.
- **"One targeted question max."** Planning shouldn't turn into an interrogation.
  Either ask the one thing that genuinely blocks you, or state your assumption out
  loud so the human can veto it.
- **"Done when" must be checkable.** Not "implement login" but a condition a
  command or a file inspection can confirm. That line is literally what a headless
  worker uses to know it's finished.
- **No "same as Task 2."** Each task is self-contained, because the worker
  executing Task 5 may never see Task 2's prompt. Cross-references break isolation.

## Why SOLID shows up in a planning skill

You'd expect design principles in a coding guide, not a planning one. They're here
for a specific, practical reason: **they're what make tasks safe to run in
parallel.**

The Dependency Inversion line is the key one — new code takes an interface at the
boundary instead of instantiating a concrete client inside itself. When every task
codes against an agreed interface, two workers can build two pieces simultaneously
without touching each other's implementation. SOLID isn't decoration here; it's the
mechanism that lets the [handoff](/blog/dev-handoff-claude-code-skill/) fan out.

Single Responsibility gets a memorable test, too: if a task's "Why" paragraph needs
the word "and", the task is doing two things — split it. One task, one file, one
responsibility keeps every diff small and reviewable.

## The six sections, and why each exists

The plan structure is fixed and ordered, because predictability is the feature:

1. **File Tree** — every file tagged `[CREATE]` or `[MODIFY]` up front, so the
   blast radius is visible before any code exists.
2. **Numbered tasks** — non-overlapping, each file in exactly one task. This is the
   guarantee that makes parallel dispatch safe: no two workers own the same file.
3. **Order of execution** — a dependency table marking which tasks are parallel-safe
   (only if they share no files with other concurrent tasks).
4. **Acceptance for the phase** — an end-to-end checklist proving the actual
   user-visible payoff, not just "the code compiles."
5. **Out of scope** — an *aggressive* list of things a reader might assume are
   included (RBAC, bulk ops, tests, docs). This kills scope creep before it starts.
6. **Closing question** — the explicit approval gate. The plan never implements
   itself; it asks "Want me to start on Task 1?" and stops.

The 40-line rule on "What to change" is my favorite guard: if your change
description runs past 40 lines, you've stopped planning and started implementing.
A plan describes; it doesn't ghost-write the whole feature.

## How it pairs with dev-handoff

These two skills are a pipeline:

1. **`dev-plan`** produces a locked, single-phase plan with non-overlapping tasks,
   a dependency table, and checkable "Done when" conditions.
2. **`dev-handoff`** reads that plan and dispatches each task to a worker model,
   using the *Order of execution* table to decide what runs in parallel and the
   *File Tree* / *Out of scope* as each worker's scope fence.

The handoff skill works *only* because the planning skill guarantees the
properties it relies on — one file per task, explicit boundaries, verifiable
stopping conditions. And the planning skill, in turn, works best when it's
grounded in a [read-only recon pass](/blog/code-review-recon-claude-code-skill/)
that maps the codebase first. Understand, plan, hand off — in that order. If you only adopt one habit from
either skill, make it this: write the plan so completely that the person (or model)
executing it never has to guess. Everything else follows from that.
