---
title: 'Installing uv on macOS, with a command cheat sheet'
description: 'How I install uv on macOS, why it replaced pip and venv and pipx for me, and the handful of commands I actually use day to day, written down so I stop looking them up.'
pubDate: 'Jun 15 2026'
tags: ['uv', 'Python', 'macOS', 'pip', 'PackageManager', 'DevTools', 'Astral']
---

[uv](https://github.com/astral-sh/uv) is the tool I now reach for instead of pip,
venv, and pipx. It comes from Astral (the Ruff people), it's written in Rust, and
the first time you watch it resolve a dependency tree you've been waiting on pip
for, you get why people switched. This is how I install it on a Mac, plus the
commands I actually type. Mostly I'm writing it down so I stop re-deriving the
`uv pip compile` invocation every few weeks.

> **TL;DR** — `curl -LsSf https://astral.sh/uv/install.sh | sh`, then
> `uv init myapp`, `uv add requests`, `uv run main.py`. Same shape as the pip and
> venv dance, minus the waiting and with a real lockfile.

## Install it

The installer script is the path I use. It drops a single `uv` binary into
`~/.local/bin` and never touches your system Python:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Open a fresh terminal afterwards so the new PATH takes. If you'd rather let
Homebrew own it:

```bash
brew install uv
```

Check it landed:

```bash
uv --version
```

The script version can update itself with `uv self update`. If you went the
Homebrew route, that command tells you to use `brew upgrade uv` instead, so use
whichever matches how you installed.

## Why I bother, instead of just using pip

You can absolutely keep using pip. I did for years. Here's what actually moved me
over.

It's fast in a way that changes how you work. pip installs that used to be long
enough to go make coffee finish before I've alt tabbed away. That's the Rust and
some aggressive caching, but the practical effect is you stop avoiding `pip
install` because it's slow.

It's one tool instead of a drawer full of them. pip installs packages, venv makes
the environment, pipx runs your CLI tools, pip-tools pins your versions. uv is
all of those. That's four things I no longer have to remember the flags for.

It writes a real lockfile. `uv lock` produces a `uv.lock` that pins every
dependency including the transitive ones, so the install I get on my laptop is
the install CI gets. pip never had a proper answer for that without bolting on
pip-tools.

It manages Python itself, so pyenv is one less thing on the machine. And when you
do need to fall back, `uv pip install` speaks the pip commands you already know,
which is what let me adopt it gradually instead of all at once.

So it isn't a new way of thinking about Python packaging. It's the workflow you
already have, faster, with the parts that used to need a second tool folded in.

## Cheat sheet

### Working in a project

| Task | Command |
|---|---|
| Start a new project | `uv init myapp` |
| Add a dependency | `uv add requests` |
| Add a dev only dependency | `uv add --dev pytest` |
| Drop a dependency | `uv remove requests` |
| Install everything from the lockfile | `uv sync` |
| Refresh the lockfile | `uv lock` |
| Run a script in the project env | `uv run main.py` |
| Run a tool like pytest | `uv run pytest` |

### Python versions

| Task | Command |
|---|---|
| See what's installed | `uv python list` |
| Install a version | `uv python install 3.12` |
| Pin it for this project | `uv python pin 3.12` |

### The pip compatible side

| Task | Command |
|---|---|
| Make a virtual environment | `uv venv` |
| Install into it | `uv pip install requests` |
| Install from requirements.txt | `uv pip install -r requirements.txt` |
| Freeze what's installed | `uv pip freeze` |
| Compile pinned requirements | `uv pip compile requirements.in -o requirements.txt` |

### Running tools without installing them everywhere

| Task | Command |
|---|---|
| Run a CLI tool once | `uvx ruff check` |
| Install a CLI tool for your user | `uv tool install ruff` |
| List the tools you've installed | `uv tool list` |

`uvx` is just shorthand for `uv tool run`. Think of it as the pipx replacement:
it grabs the tool into a cache and runs it without dropping it into your project
or your system Python. I use `uvx ruff check` constantly and never actually
install ruff anywhere.
