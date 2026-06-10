---
title: 'A read-only Claude Code skill that maps a codebase before you touch it'
description: 'A read-only Claude Code skill that maps any project — entry points, layers, git hotspots, and risks — into ARCHITECTURE_REVIEW.md without changing a single file.'
pubDate: 'Jun 10 2026'
heroImage: '../../assets/code-review-recon-hero.svg'
---

The fastest way to break an unfamiliar codebase is to let an AI agent start
editing it before anyone understands how it fits together. So before I plan or
hand off any work, I run a recon pass — a deep, *read-only* sweep that maps the
architecture and writes it down, touching nothing.

This is that skill: `code-review-recon`. It reads the project, traces a request
end-to-end, mines the git history for hotspots, and drops everything it learned
into a single `ARCHITECTURE_REVIEW.md`. It changes no source files — by design.
It's the third in this small set of [Claude Code](https://claude.com/claude-code)
skills I use as a pipeline, and like the others, I'm sharing it because read-only
analysis is exactly the kind of safe, high-value task AI agents are good at and
people rarely set up well.

## Contents

- [Why recon comes first](#why-recon-comes-first)
- [The whole skill](#the-whole-skill)
- [The read-only rule, and why it's strict](#the-read-only-rule-and-why-its-strict)
- [The five-step process](#the-five-step-process)
- [Why it reads git history](#why-it-reads-git-history)
- [Where it fits with dev-plan and dev-handoff](#where-it-fits-with-dev-plan-and-dev-handoff)

## Why recon comes first

If you've read the other two posts — the [planning skill](/blog/dev-plan-claude-code-skill/)
and the [handoff skill](/blog/dev-handoff-claude-code-skill/) — you'll notice both
*assume* you already understand the code. The plan grounds itself in real files
and line numbers; the handoff fences workers to specific modules. Neither can do
its job on a codebase nobody has mapped.

Recon is the step that produces that understanding. It's also the safest skill to
run on anything — a client's repo, an open-source project you're evaluating, a
service you inherited — precisely because it can't change anything.

## The whole skill

Copy it as-is:

````markdown
---
name: code-review-recon
description: Deep, read-only code review of the current directory/project (or a path the user specifies) to understand its architecture. Use whenever the user asks to "review the code", "understand this project", "deep dive", or "analyze the architecture". Fact-finding only — no code changes.
---

# Code Review Recon (Read-Only)

**Rules:** Do not edit, create, delete, or reformat any source file. No `--fix` flags, no installs, no mutating git commands. Default scope is the current directory unless told otherwise. Bugs and smells are recorded as observations, not fixed.

**Process:**
1. Orient — directory tree (skip `node_modules`, `.git`, build artifacts), then README, manifest files, Dockerfile, CI.
2. Map — entry points, layers (routes → services → data), external services/stores, config and secrets handling, cross-cutting concerns (auth, logging, errors).
3. Depth pass — read the central modules fully; trace one request/job end-to-end; note conventions actually in use.
4. Git history (read-only: `git log`, `git shortlog`, `git log --stat`) — recent activity, most-churned files (likely hotspots), major refactors or direction changes, contributor patterns.
5. Assess — coupling hotspots, security risks, test coverage shape, debt.

**Output:** Write findings to `ARCHITECTURE_REVIEW.md` in the project root (the one file this skill may create), and give a brief summary in chat. Sections: snapshot (incl. how to run it locally — entry command, required env vars), architecture overview, key components, dependencies, conventions, history insights, observations/risks, open questions. Keep it proportional to the codebase size. End by noting nothing was changed.
````

## The read-only rule, and why it's strict

The first block is the whole safety model: no edits, no `--fix`, no installs, no
mutating git commands. Bugs and smells are *recorded as observations, not fixed.*

That strictness is deliberate. An agent doing analysis is constantly tempted to
"just quickly fix" the thing it noticed — and that one quick fix is how an
analysis pass turns into an unreviewed, unscoped change you didn't ask for. The
skill draws a hard line: the only file it may create is `ARCHITECTURE_REVIEW.md`.
Everything else it learns becomes a note, which later becomes input to a
[plan](/blog/dev-plan-claude-code-skill/) you actually approve.

## The five-step process

The process moves from the outside in, the same way a careful human would:

1. **Orient** — the directory tree (minus `node_modules`, `.git`, build output),
   then the README, manifests, Dockerfile, and CI config. The cheap, high-signal
   stuff first.
2. **Map** — entry points and the layers between them (routes → services → data),
   plus where external services, config, and secrets live, and the cross-cutting
   concerns (auth, logging, error handling) that touch everything.
3. **Depth pass** — actually *read* the central modules, and trace one real
   request or job end-to-end. This is where you learn the conventions the code
   really follows, as opposed to what the README claims.
4. **Git history** — covered below.
5. **Assess** — coupling hotspots, security risks, the shape of the test coverage,
   and where the debt sits.

The output sections are fixed so the report is consistent and skimmable, and one
of them is *how to run it locally* — entry command plus required env vars — which
is the single most useful thing to capture and the thing READMEs most often omit.

## Why it reads git history

The git-history step is the one people skip, and it's the highest-leverage. Static
reading tells you how the code is *structured*; history tells you where it's
*alive*. `git log --stat` surfaces the most-churned files — which are almost always
the real hotspots, the risky code, and the place the next bug will appear.
`git shortlog` shows who owns what, and the log reveals major refactors and
direction changes that explain why the code looks the way it does. All of it is
strictly read-only — `git log`, `git shortlog`, `git log --stat`, nothing that
mutates.

## Where it fits with dev-plan and dev-handoff

These three skills form a pipeline, and recon is the front door:

1. **`code-review-recon`** (this one) maps the codebase, read-only, into
   `ARCHITECTURE_REVIEW.md` — the shared understanding everything else builds on.
2. **[`dev-plan`](/blog/dev-plan-claude-code-skill/)** turns a request into a
   locked, phase-by-phase plan grounded in the files recon identified.
3. **[`dev-handoff`](/blog/dev-handoff-claude-code-skill/)** dispatches that plan's
   tasks to worker models running in parallel.

Understand, plan, hand off — in that order. The reusable idea, if you build your
own version, is the hard read-only boundary: an analysis skill that *cannot* edit
is one you can safely point at any repo, and its output is the foundation every
later step depends on. Map first, change later.
