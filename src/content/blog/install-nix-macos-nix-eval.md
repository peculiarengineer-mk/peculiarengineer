---
title: 'Installing Nix on macOS, and what nix eval actually does'
description: 'How I install Nix on Apple Silicon, why my first nix eval blew up with two different errors, the fixes for both, what nix eval is actually for, and an honest verdict on whether Nix is worth the side quest.'
pubDate: 'Jun 21 2026'
heroImage: '../../assets/install-nix-macos-hero.png'
tags: ['Nix', 'macOS', 'AppleSilicon', 'Flakes', 'DevTools', 'PackageManager', 'Reproducibility']
---

I installed Nix, immediately ran `nix eval` to set up someone else's repo, and got two errors back to back. Then I went down the hole of what `nix eval` actually does, worked out it was the wrong tool for what I was doing, and came out the other side with an opinion on whether Nix earns a spot on my machines at all. This is the writeup, mostly so I never re-derive the fixes.

> **TL;DR** Install with the Determinate installer (`curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install`), which turns flakes on for you. Verify with `nix eval --expr '1 + 2'` (prints `3`). If it says `'nix-command' is disabled`, add `experimental-features = nix-command flakes` to `~/.config/nix/nix.conf`. If it says the path has no `flake.nix`, you forgot to give it a target. And `nix eval` only evaluates expressions, it never builds anything. That's `nix build`.

## Install it on macOS

macOS doesn't get single-user Nix. The Mac install has to be multi-user, which means a daemon and a dedicated `/nix` volume. That isn't a choice you get to make. There are two installers and they both wrap the exact same Nix underneath, so this is purely about which one is less of a headache.

### The Determinate Systems installer (what I use)

This is the one I'd point anyone at. Same upstream Nix, but it turns flakes on out of the box and gives you a clean one command uninstall:

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

If you ever want it gone:

```bash
/nix/nix-installer uninstall
```

That single command, versus the manual teardown the official installer leaves you with, is reason enough on its own. It also behaves the same way on Linux, so my Ubuntu box gets the identical command, which matters to me since I bounce between the two.

### The official upstream installer

Same Nix, more friction. On a Mac it wants the `--daemon` flag:

```bash
bash <(curl -L https://nixos.org/nix/install) --daemon
```

It works, but two things bit me. It does not enable flakes by default, so you walk straight into the first error below. And uninstalling on macOS is a manual chore: stop the daemon, tear down the `/nix` volume, undo the `synthetic.conf` and `fstab` edits, then clean up your shell profile by hand. That's a lot of yak shaving for a tool you might only be evaluating, and it's exactly what the Determinate uninstall avoids.

### Verify it's healthy

Open a fresh terminal so the daemon and your PATH are picked up, then:

```bash
nix --version
nix eval --expr '1 + 2'
```

If that second command prints `3`, Nix is installed, the new CLI is on, and you're done. If it errors instead, it's almost certainly one of the next two.

## The two errors everyone hits first

### experimental Nix feature 'nix-command' is disabled

Nix is installed, but the new style `nix` CLI is gated behind an experimental flag that the upstream installer leaves off. The permanent fix is one config line:

```bash
mkdir -p ~/.config/nix
echo 'experimental-features = nix-command flakes' >> ~/.config/nix/nix.conf
```

If you just want to run one command without committing to the config change, pass the features inline:

```bash
nix eval --extra-experimental-features 'nix-command flakes' --expr '1 + 2'
```

The Determinate installer writes that config for you, which is why I don't hit this one anymore.

### path ... does not contain a 'flake.nix'

This one's a footgun. A bare `nix eval` with no arguments defaults to evaluating the current directory *as a flake*. If there's no `flake.nix` sitting there, it throws this (or its cousin, `is not part of a flake`). `nix eval` always needs a target. Pick one:

```bash
nix eval --expr '1 + 2'   # a literal expression, no flake required
nix eval .#someAttr       # an attribute from a flake in this directory
nix flake init            # scaffold a flake.nix if you actually want one here
```

It's not broken. It just won't guess what you meant.

## What nix eval actually does

Once both errors were out of the way I stopped to ask what I'd even bought myself.

`nix eval` takes a Nix expression, evaluates it, and prints the result. That's the whole job. It never builds anything and it never realizes a derivation. If you want something built, that's `nix build`. `nix eval` is for inspecting, debugging, and the occasional bit of scripting glue.

It's part of the experimental new style `nix` CLI, so it needs `nix-command` enabled (and usually `flakes` too). The two forms you'll actually use:

| Form | What it does |
|---|---|
| `nix eval --expr '1 + 2'` | Evaluates a literal expression, no flake needed |
| `nix eval .#someAttr` | Pulls an attribute out of a flake, needs a `flake.nix` |

And the flags worth knowing:

| Flag | What it does |
|---|---|
| `--raw` | Prints strings without the surrounding quotes |
| `--json` | Emits JSON so you can pipe it to `jq` |
| `--impure` | Allows reading the environment, e.g. `builtins.currentSystem` |
| `--apply '<fn>'` | Runs a function over the result before printing |

The honest summary: `nix eval` is plumbing. You reach for it maybe five percent of the time, when you're poking at your own flake to see what a value resolves to without kicking off a build. It is not a setup command, and installing Nix *for* `nix eval` makes no sense. It only matters once you're already using Nix the package manager.

## Is Nix even worth it?

This is the part I actually care about, so I'll be blunt: on its own, no, and `nix eval` definitely isn't the reason. But Nix the system could earn its place, and for me it has a real case.

Where it genuinely pays off:

- **Reproducible dev environments per project.** A `flake.nix` plus `nix develop` gives you a shell with exactly the toolchain a project needs, pinned, without installing anything globally. No more "works on my machine because I happen to have node 18 and you have 20."
- **The same environment across machines.** I run a MacBook and a Mac mini, plus an Ubuntu box. Nix can hand all three the identical environment from one definition. This is the part that's an actual pain point for me, so it's the part that makes me keep the install around.
- **Declarative macOS config with `nix-darwin`.** Think of it as Pulumi for your laptop: your system state lives in a file you can diff and rebuild, instead of a pile of `brew install` commands you half remember.

Now the cost, because it's real. The learning curve is steep, the Nix language is genuinely weird in a "this is a lazy functional language and you will feel it" way, and getting comfortable is a side quest that eats a weekend or three. It is not a small commitment.

So the verdict is conditional and I'll state it plainly. If "reproducible declarative environments across machines" is a true, recurring pain for you, Nix is worth the climb. If it isn't, Homebrew plus a version manager like mise or asdf gets you most of the way there for a fraction of the learning cost, and you should just do that instead. Don't install Nix because it's cool. Install it because you have the problem it solves.

## The lesson: check before you assume

Back to where this started. I'd cloned a repo, an O'Reilly downloader thing, and reflexively reached for `nix eval` to set it up, because Nix was fresh on my mind and freshly installed. That's exactly when the `flake.nix` error fired.

Turns out the repo has no `flake.nix` and no `shell.nix`. It doesn't use Nix at all. It was almost certainly a plain Python project: a venv and `pip install -r requirements.txt`, or whatever the README spelled out. Nix was a detour I invented for a project that never asked for it.

The two commands that would have saved me the whole loop:

```bash
cat README.md
ls -la            # look for flake.nix or shell.nix
```

That's the lesson, and it generalizes well past Nix. Having a tool installed doesn't mean the repo in front of you uses it. Check for `flake.nix` or `shell.nix` before you Nix anything, the same way you'd check for a `package.json` before reaching for npm. A new hammer makes everything look like a nail, and I am not immune. The repo tells you how it wants to be built. Read it before you bring your own opinions.
