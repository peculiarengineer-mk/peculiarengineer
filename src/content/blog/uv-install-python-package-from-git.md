---
title: 'Installing a Python package from git with uv (and not confusing it with GitPython)'
description: 'Two completely different things hide behind "git package for Python with uv": the GitPython library and installing straight from a git+ URL. Here is how to do both, plus how --python stops you from guessing which interpreter you just installed into.'
pubDate: 'Jun 22 2026'
heroImage: '../../assets/uv-git-hero.png'
tags: ['Python', 'uv', 'git', 'packaging', 'pip']
---

Every time I search "git package for python using uv" I get two unrelated answers tangled together, because the phrase means two different things. One is the library you `import git`. The other is installing a package directly from a git repository instead of from PyPI. They have nothing to do with each other beyond the word "git," so I'm writing both down once and never untangling them again. If you want the uv install itself, that's a [separate post](/blog/install-uv-macos-cheat-sheet/).

> **TL;DR** `uv pip install GitPython` gets you the library you `import git` (note the name mismatch). `uv pip install git+https://github.com/owner/repo.git` installs a package straight from a repo, and you add `@v1.2.3` to pin it. Whichever you're doing, pass `--python ~/.local/bin/python3.14` so you actually know which interpreter you installed into.

## Reading 1: GitPython, the library you import

GitPython is just a normal package on PyPI. There's nothing git-special about installing it. It happens to have "git" in the name because it wraps the git binary so you can drive repositories from Python.

```sh
uv pip install GitPython
```

Then in your code:

```python
import git

repo = git.Repo(".")
print(repo.head.commit.hexsha)
```

Here's the footgun, and it catches everyone at least once. The distribution on PyPI is named `GitPython`, but the import name is `git`. So you `pip install GitPython` and then `import git`. If you `import gitpython` you get a ModuleNotFoundError, and if you `pip install git` you get a different, unrelated package. The two names just don't match, and there's no rule that says they have to. Install `GitPython`, import `git`, move on.

This reading has nothing to do with git URLs. It's a regular PyPI package that confusingly shares a word with the next section.

## Reading 2: installing straight from a git repo

This is the one people actually mean when they say "install from git." Sometimes the package you want isn't on PyPI, or you need a fix that's merged on the repo but not yet released. uv handles this with `git+` URLs:

```sh
uv pip install git+https://github.com/owner/repo.git
```

That clones the repo, builds it, and installs it like any other package. uv reads the project's `pyproject.toml` (or `setup.py`) to figure out how to build it, so the repo has to be an actual installable Python project, not just a folder of scripts.

### Pinning to a branch, tag, or commit

Append `@` and a git ref to nail down exactly what you get:

```sh
uv pip install "git+https://github.com/owner/repo.git@v1.2.3"
uv pip install "git+https://github.com/owner/repo.git@main"
```

Quote the whole URL. The `@` and other characters in these URLs are special to the shell, and an unquoted `@` plus the wrong combination of metacharacters will get mangled or interpreted before uv ever sees the string. Quoting it makes the shell hand uv the literal URL you typed, which is what you want.

On which ref to pin: pin to a tag or a commit, not a branch, if you care about reproducibility. `@main` means "whatever main happens to be the next time someone runs this," so the install you got today and the install CI gets next week can quietly differ. `@v1.2.3` is a tag, which is meant to be immobile, and a full commit SHA is the strongest guarantee there is. Use `@main` when you're deliberately tracking the tip and you understand it's a moving target. Otherwise pin something that won't move under you.

## The part that actually bites: which environment did it go into?

`uv pip install` operates on whatever environment uv is currently pointed at, and that is not always the interpreter you have in your head. If there's an activated venv, it uses that. If not, uv goes looking, and "the Python you typed `python3` at five minutes ago" is not necessarily the one it picks. So you run the install, it succeeds, and then your import fails because the package landed somewhere else.

This matters a lot more once you have several Pythons around. I have a 3.12 and a freshly built 3.14 sitting in `~/.local` after [rebuilding Python to get ctypes back](/blog/missing-ctypes-rebuild-python-libffi/), and "install GitPython" is meaningless until I say which of those I mean.

The no-surprises way is to point uv at the interpreter explicitly with `--python`:

```sh
uv pip install --python ~/.local/bin/python3.14 GitPython
```

Now there's no guessing. The package goes into that exact 3.14, full stop. This works the same for git URLs:

```sh
uv pip install --python ~/.local/bin/python3.14 "git+https://github.com/owner/repo.git@v1.2.3"
```

If you'd rather isolate things, have uv build a venv on that interpreter and work inside it:

```sh
uv venv --python ~/.local/bin/python3.14
source .venv/bin/activate
uv pip install GitPython
```

Once that venv is activated, `uv pip install` targets it without you needing `--python` every time, because now uv's "current environment" is unambiguous. Both approaches get you to the same place. I reach for `--python` for one-off installs and the venv when I'm actually working in a project, but the principle is identical: make the interpreter explicit so you're never wondering where the package went.

## A note on the project workflow

Everything above is the pip-compatible side of uv. `uv pip` exists so the commands you already know from pip keep working. If instead you're in a uv-managed project with a `pyproject.toml`, the equivalent of adding a git dependency is:

```sh
uv add "git+https://github.com/owner/repo.git"
```

`uv add` records the dependency in your `pyproject.toml` and the lockfile, which `uv pip install` does not do. So `uv pip install` is the right tool when you want pip's behavior, and `uv add` is the right tool when you want the project and its lockfile to remember the dependency. Same git URL syntax either way.

## The takeaway

The two readings of "git package for Python" are unrelated, and conflating them is most of the confusion. GitPython is a library that merely has "git" in its name; you `uv pip install GitPython` and `import git`, and the name mismatch is the only trap. The `git+` URL is a real install mechanism for pulling a package from a repo instead of PyPI; quote the URL and pin a tag or commit so it's reproducible.

And no matter which one you're doing, `--python` is how you stop guessing which environment you just installed into. When you've got two interpreters in `~/.local`, "it installed fine but the import fails" is almost always the package sitting in the other one.
