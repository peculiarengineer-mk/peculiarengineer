---
title: 'A Claude Code skill that hands off a dev plan to sub-agents'
description: 'A copy-paste Claude Code skill that dispatches tasks from an approved dev plan to worker AI models running in parallel, via the OpenCode CLI in headless mode.'
pubDate: 'Jun 10 2026'
heroImage: '../../assets/dev-handoff-hero.svg'
---

If you use [Claude Code](https://claude.com/claude-code) (or any agentic coding
setup) for real work, you eventually hit the same wall I did: one model planning
*and* writing *and* reviewing everything is slow, and it burns your good context
on mechanical edits. The fix is to split the roles — let a smart model plan and
review, and hand the actual typing to cheaper worker models running in parallel.

This is the skill I use to do that handoff. It's called `dev-handoff`, and it
takes an already-approved [dev plan](/blog/dev-plan-claude-code-skill/) and
dispatches each task to a worker model through the [OpenCode](https://opencode.ai/)
CLI in headless mode. I'm sharing
it here because it's the kind of thing that's hard to find when you search for
"Claude Code skills" — most examples are toys, and this is something I actually
run.

## Contents

- [What a "skill" is](#what-a-skill-is)
- [The whole skill](#the-whole-skill)
- [How it works, section by section](#how-it-works-section-by-section)
- [Why headless workers instead of one big agent](#why-headless-workers-instead-of-one-big-agent)
- [Preconditions that keep it safe](#preconditions-that-keep-it-safe)
- [Adapting it to your setup](#adapting-it-to-your-setup)

## What a "skill" is

A skill is just a Markdown file with YAML frontmatter that tells the agent *when*
to load it and *what to do* once loaded. The `name` and `description` in the
frontmatter are how the agent decides relevance — so the description is written
to match the words a user would actually say ("hand off", "delegate", "dispatch
the plan"). The body is the procedure.

Nothing here is magic. It's a checklist the agent follows, with the guard rails
written down so the agent doesn't improvise the dangerous parts.

## The whole skill

Here it is in full so you can copy it:

````markdown
---
name: dev-handoff
description: Hand off tasks from an approved dev plan to sub-agents via OpenCode CLI headless mode. Use when the user says "hand off", "delegate", "dispatch the plan", or answers "yes" to a plan's "Ready to hand off?" question. Requires a finalized single-phase plan (default DEV_PLAN.md) in the dev-plan skill format.
---

# Dev Handoff (OpenCode Sub-Agents)

Dispatches dev-plan tasks to worker models. This skill writes no code itself.

## Workers (already configured in OpenCode — confirm strings with `opencode models`)
- **Kimi K2.6** (Zen) — default.
- **MiMo-V2.5-Pro** (Xiaomi) — tasks needing large context: big refactors, many files.

## Preconditions
1. Plan exists, is approved, covers one phase, and has all six sections (File Tree, tasks, Order of execution, phase acceptance, Out of scope, closing question). Vague plan → stop and say so.
2. Working tree clean or committed, so worker diffs are reviewable.
3. A permissive `worker` agent config exists so headless runs don't hang on permission prompts.

## Dispatch
1. Use the **Order of execution** table as-is: parallel-safe tasks run concurrently, dependent tasks in order. Don't re-derive.
2. Per-task prompt (the worker gets nothing else): the task's section verbatim + the plan's **Design principles** notes if present + **File Tree** and **Out of scope** as the scope fence + "Only modify your task's file(s). Code against the interfaces the plan specifies — do not reach into other tasks' implementations. Stop when 'Done when' is satisfied." Strip the closing question.
3. Run:
```bash
timeout 1800 opencode run --agent worker -m <provider/model> \
  "<task prompt>" 2>&1 | tee .handoff/task-<n>.log
```
Parallel: `&` + `wait`. Sequential: stop the chain on first failure.

## Verify
1. Per task: exit status, "Done when" met (run the check — it's command/inspection-verifiable by plan contract), files touched.
2. `git diff --stat` — flag any file modified by two tasks or absent from the File Tree.
3. Walk **Acceptance for the phase**: pass/fail per item.
4. Recommend review (manual or code-review-recon). Never auto-commit.
````

## How it works, section by section

**The frontmatter** is the trigger. The agent loads this skill only when you say
something like "hand off" or "dispatch the plan", or when you answer "yes" to a
plan's closing "Ready to hand off?" question. It also documents its one hard
requirement: a finalized, single-phase plan in a known format.

**Workers** lists the models that do the actual writing. A cheap, fast default
(Kimi K2.6) and a large-context model (MiMo-V2.5-Pro) for sprawling refactors.
The note to confirm strings with `opencode models` matters — model identifiers
drift, and a stale string fails silently.

**Preconditions** is the part that keeps this from being reckless. It refuses to
run on a vague plan, insists the working tree is clean so every worker's diff is
reviewable in isolation, and requires a permissive `worker` agent config so
headless runs don't hang waiting for a permission prompt nobody will answer.

**Dispatch** is the core. It trusts the plan's own *Order of execution* table
rather than re-deriving dependencies, and it builds each worker's prompt from a
tight, fenced slice of the plan — the task verbatim, the design notes, and the
file tree plus out-of-scope list as a fence. The key line is *"Only modify your
task's file(s)... do not reach into other tasks' implementations."* That's what
makes parallel execution safe: workers code against interfaces, not each other.

**Verify** closes the loop. Every task's "Done when" is checked, `git diff --stat`
surfaces any file two workers both touched (a sign the plan's boundaries leaked),
the phase acceptance criteria are walked one by one, and — critically — it never
auto-commits. A human or a review pass always sees the diff first.

## Why headless workers instead of one big agent

Three reasons I keep coming back to this pattern:

1. **Parallelism.** Independent tasks run at the same time with `&` and `wait`.
   A five-file feature finishes in the time of its slowest file, not the sum.
2. **Cost.** The expensive model plans and reviews; cheap workers do the volume
   typing. You pay top-tier rates only for the thinking.
3. **Isolation.** Each worker gets only its task and the scope fence, so its diff
   is small and reviewable. No worker holds the whole codebase in context, which
   is exactly why their changes stay predictable.

## Preconditions that keep it safe

The thing I'd stress to anyone copying this: the guard rails are the point. A
handoff skill that *only* dispatched would be a footgun. The reason this one is
safe to run is that it refuses bad input (vague plans), keeps state reviewable
(clean tree, per-task logs in `.handoff/`), flags boundary violations (two tasks
touching one file), and stops short of committing. The orchestrating agent writes
no code itself — it only routes, runs, and verifies.

## Adapting it to your setup

You don't need OpenCode or these exact models. The shape transfers to any setup
where you can run an agent headlessly from the command line:

- Swap the `opencode run --agent worker -m <model>` line for your CLI's
  equivalent headless invocation.
- Replace the worker models with whatever you have configured — a local model, a
  cheaper API tier, a different provider.
- Keep the four parts intact: a **trigger** in the frontmatter, **preconditions**
  that refuse bad input, a **dispatch** step that fences each worker's scope, and
  a **verify** step that never auto-commits.

That four-part skeleton — trigger, preconditions, fenced dispatch, verify — is
the reusable idea. The specific models and CLI are just the implementation.

This is the last step of a three-skill pipeline: a
[read-only recon pass](/blog/code-review-recon-claude-code-skill/) maps the
codebase, the [dev-plan skill](/blog/dev-plan-claude-code-skill/) turns that into
a locked plan, and this skill dispatches it. Understand, plan, hand off.

If you write your own version of this, the single most valuable habit is the
scope fence: give each worker exactly its task and an explicit list of what's out
of bounds. That one constraint is what turns "spawn a bunch of agents" from a
mess into something you'd actually let near your repo.
