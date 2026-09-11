---
title: 'pip install fails with externally-managed-environment on Ubuntu 26.04: what to do instead'
description: 'A fresh Ubuntu 26.04 box has Python 3.14 but no pip, a python3 -m venv that fails, and a marker file that makes pip refuse to install anything. Here are the four things that actually work (apt, venv, pipx, uv), what --break-system-packages really does to your system, and the uv venv gotcha that lands you right back at the same error.'
pubDate: 'Sep 11 2026'
heroImage: '../../assets/pip-externally-managed-2604-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Python', 'pip', 'venv', 'pipx', 'uv', 'Linux', 'Server', 'SysAdmin', 'DevOps']
---

I logged into a fresh Ubuntu 26.04 server needing one Python library for a script, and typed the thing I have typed a thousand times. First `pip` was not there. Then I installed it and it refused to work:

```text
$ pip install requests
error: externally-managed-environment

× This environment is externally managed
```

And if you try to sidestep it with a virtual environment, that fails too, because the piece `venv` needs to put a pip inside the new environment is missing. Three walls in a row on a box that has Python 3.14 sitting right there. None of this is a bug. It is Ubuntu telling you, in the least friendly way possible, that the system Python belongs to apt now and you need to pick a lane.

The error message actually contains the right advice, but it is easy to miss under the red. This post is the version I wanted: what a fresh 26.04 install gives you, why pip is locked out, the four ways to install a package that work, and what the `--break-system-packages` escape hatch really does to your system when you use it. I ran all of it on a clean 26.04 server and pasted what came back.

> **TL;DR.** A fresh 26.04 server has Python 3.14.4, no pip, and a venv module that cannot finish without a package. For a library the system needs, `sudo apt install python3-requests` (there are over five thousand `python3-*` packages). For a project, `sudo apt install python3-venv`, then `python3 -m venv .venv` and use `.venv/bin/pip`. For a command line tool, `sudo apt install pipx` and `pipx install httpie`. For all of it with one tool, install `uv` from its installer (it is not in the archive) and use `uv venv`, `uv pip install`, `uv tool install`. `--break-system-packages` works, but it installs into `/usr/local`, which shadows apt's packages for every system tool, including cloud-init. Save it for containers.

## Contents

- [What a fresh 26.04 box actually has](#what-a-fresh-2604-box-actually-has)
- [Why pip is locked out](#why-pip-is-locked-out)
- [Option 1: apt, for what the system needs](#option-1-apt-for-what-the-system-needs)
- [Option 2: a venv, for a project](#option-2-a-venv-for-a-project)
- [Option 3: pipx, for a tool](#option-3-pipx-for-a-tool)
- [Option 4: uv, for all of it](#option-4-uv-for-all-of-it)
- [What `--break-system-packages` actually does](#what---break-system-packages-actually-does)
- [Which one, when](#which-one-when)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## What a fresh 26.04 box actually has

Python is there. The packaging tools are not:

```bash
$ python3 --version
Python 3.14.4

$ python3 -m pip --version
/usr/bin/python3: No module named pip

$ python3 -m venv /tmp/v0
The virtual environment was not created successfully because ensurepip is not
available.  On Debian/Ubuntu systems, you need to install the python3-venv
package using the following command.

    apt install python3.14-venv
```

No pip, and no `ensurepip`, which is the module `venv` uses to seed a new environment with pip, so `venv` starts and then gives up. That is deliberate. Ubuntu wants you to install those on purpose, and it tells you the package name when you trip over it. Installing pip is one line:

```bash
sudo apt install python3-pip
```

That gives you pip 25.1.1 at `/usr/bin/pip` and `/usr/bin/pip3`. Now try to use it and you hit the real wall:

```text
$ pip install requests
error: externally-managed-environment

× This environment is externally managed
╰─> To install Python packages system-wide, try apt install
    python3-xyz, where xyz is the package you are trying to
    install.

    If you wish to install a non-Debian-packaged Python package,
    create a virtual environment using python3 -m venv path/to/venv.
    Then use path/to/venv/bin/python and path/to/venv/bin/pip. Make
    sure you have python3-full installed.

    If you wish to install a non-Debian packaged Python application,
    it may be easiest to use pipx install xyz, which will manage a
    virtual environment for you. Make sure you have pipx installed.

    See /usr/share/doc/python3.14/README.venv for more information.

note: If you believe this is a mistake, please contact your Python installation or OS distribution provider. You can override this, at the risk of breaking your Python installation or OS, by passing --break-system-packages.
hint: See PEP 668 for the detailed specification.
```

`pip install --user requests` fails the same way. So does running it as a normal user instead of root. Downloading is still allowed, `pip download requests` works fine, it is only installing into the system interpreter that is blocked.

## Why pip is locked out

The whole mechanism is one file:

```bash
$ cat /usr/lib/python3.14/EXTERNALLY-MANAGED
[externally-managed]
Error=To install Python packages system-wide, try apt install
 python3-xyz, where xyz is the package you are trying to
 install.
 ...
```

pip checks for that marker next to the standard library and, if it exists, refuses to install into that interpreter. That is PEP 668. Ubuntu has shipped the marker since before 24.04, so if you skipped from 22.04 straight to 26.04 this is the first time you are seeing it.

The reason it exists is the way the paths stack up. Look at where the system interpreter searches:

```bash
$ python3 -c 'import sys; print(sys.path)'
['', '/usr/lib/python314.zip', '/usr/lib/python3.14', '/usr/lib/python3.14/lib-dynload',
 '/usr/local/lib/python3.14/dist-packages', '/usr/lib/python3/dist-packages']
```

apt installs Python packages into `/usr/lib/python3/dist-packages`. pip, when run against the system interpreter, installs into `/usr/local/lib/python3.14/dist-packages`. And `/usr/local` comes first. So anything pip puts there shadows whatever apt put in the other directory, for every process on the box that uses `/usr/bin/python3`.

Which processes are those? More than you think. On a stock 26.04 server:

```bash
$ apt-cache rdepends --installed python3-requests
python3-requests
Reverse Depends:
  cloud-init-base
  python3-botocore
  python3-boto3
```

cloud-init runs on the system Python. So do `unattended-upgrade`, the `pro` client, and `apt`'s own Python helpers, and netplan pulls in `python3-rich`, which is why `import rich` already works on a fresh box before you have installed anything. Before the marker file, `sudo pip install` of the wrong version of `urllib3` or `cryptography` could break the tool that applies your security updates, and the failure would show up weeks later with no obvious link to the pip command that caused it. The marker turns that silent footgun into a loud error. Annoying, but I would rather have it.

## Option 1: apt, for what the system needs

If the package is for something Ubuntu's own tooling calls, or for a quick root script where the archive's version is good enough, install it the way Ubuntu wants:

```bash
sudo apt install python3-requests
```

There are a lot of these. On 26.04 the count is 5,546 packages matching `python3-*`, and the popular ones are all there: `python3-requests`, `python3-httpx`, `python3-rich`, `python3-pydantic`, `python3-numpy`, `python3-pandas`, `python3-flask`, `python3-fastapi`, `python3-boto3`, `python3-yaml`. They land in `/usr/lib/python3/dist-packages`, apt tracks them, updates arrive the same way as everything else on the box, and nothing shadows anything.

The trade is version lag. apt's `requests` is 2.32.5, and it was already on the box because cloud-init depends on it. PyPI had 2.34.2 the same day. For a system script that is fine. For a project that pins its dependencies, it is not, and that is what the next option is for.

## Option 2: a venv, for a project

A virtual environment is a private copy of the interpreter's search path with its own `site-packages`, so pip can install whatever it likes without touching `/usr/local` or `/usr/lib`. The marker file only applies to the system interpreter, so pip inside a venv works exactly as it always did.

First you need the package that makes `python3 -m venv` work, which was the third wall in the intro:

```bash
sudo apt install python3-venv
```

The error message says `python3.14-venv`. Either name works, `python3-venv` is a thin package that depends on the versioned one. Do not bother with `python3-full` on a server, it pulls in `idle` and `python3-tk` along with venv, which is a GUI you will never use.

Now the normal workflow:

```bash
$ python3 -m venv ~/proj/.venv
$ source ~/proj/.venv/bin/activate
(.venv) $ which python pip
/root/proj/.venv/bin/python
/root/proj/.venv/bin/pip
(.venv) $ pip install requests
Successfully installed certifi-2026.7.22 charset_normalizer-3.5.1 idna-3.19 requests-2.34.2 urllib3-2.7.0
(.venv) $ python -c 'import requests; print(requests.__file__)'
/root/proj/.venv/lib/python3.14/site-packages/requests/__init__.py
(.venv) $ deactivate
```

Current `requests`, installed where nothing else on the box can see it. Install `httpx` the same way and `python3 -c 'import httpx'` outside the venv still says `No module named 'httpx'`, and that is the point. You do not have to activate it either. `~/proj/.venv/bin/pip install httpx` and `~/proj/.venv/bin/python script.py` work from anywhere, which is what you want in a systemd unit or a cron line.

Two things worth knowing about venvs on 26.04. If you want apt's packages visible inside the venv as well, create it with `--system-site-packages` and the venv falls through to the system directories for anything it does not have itself, `/usr/local` first and then apt's, so a shadow you planted with `--break-system-packages` follows you in there too. And Python 3.14 puts a `𝜋thon` symlink in the `bin` directory of every venv the standard library creates, next to `python`. It is an easter egg, it works, and it is going to confuse someone's `ls` one day.

## Option 3: pipx, for a tool

Half the time the thing you want is not a library, it is a command. `httpie`, `black`, `ansible`, `yt-dlp`. Making a venv by hand for each one and remembering where you put it gets old, and that is exactly what pipx automates:

```bash
sudo apt install pipx
pipx install httpie
pipx ensurepath
```

pipx creates one venv per tool under `~/.local/share/pipx/venvs/`, installs the tool into it, and symlinks its commands into `~/.local/bin`:

```bash
$ ls -l ~/.local/bin/          # trimmed
http -> /root/.local/share/pipx/venvs/httpie/bin/http
https -> /root/.local/share/pipx/venvs/httpie/bin/https
httpie -> /root/.local/share/pipx/venvs/httpie/bin/httpie
```

`pipx ensurepath` appends `export PATH="$PATH:/root/.local/bin"` to your `.bashrc` (and `.profile`), so the commands work in the next shell, not this one. Open a new terminal or `source ~/.bashrc` and `http --version` answers. `pipx list` shows what is installed, `pipx upgrade httpie` upgrades one, and `pipx run cowsay -t hello` runs a tool from a cached environment under `~/.cache/pipx` without putting anything on your PATH.

pipx refuses libraries, which is the right behaviour. `pipx install requests` stops with `No apps associated with package requests` and suggests a venv instead. If a package has no command to expose, pipx is the wrong tool and it says so.

## Option 4: uv, for all of it

uv does venvs, tools, project management, and Python version management in one binary, and it is what I use on my own machines. I have a [macOS cheat sheet](/blog/install-uv-macos-cheat-sheet/) for it already. The first thing to know on 26.04 is that it is not in the archive:

```bash
$ sudo apt install uv
Error: Unable to locate package uv
```

So it is the official installer, which drops `uv` and `uvx` into `~/.local/bin` for the user who ran it:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.local/bin/env
uv --version
```

I got 0.12.13. That `env` file prepends `~/.local/bin` to `PATH` if it is not already there, and the installer adds a line sourcing it to your shell profile. It is per user. Installing as root does not give it to anyone else.

uv respects the marker file exactly as pip does. `uv pip install httpx` with no venv around stops with `No virtual environment found; run uv venv to create an environment, or pass --system to install into a non-virtual environment`, and if you do pass `--system` you get the same PEP 668 text pip printed. So the workflow is a venv first. In a fresh directory, because `uv venv` refuses to overwrite a `.venv` that already exists, like the one from Option 2:

```bash
$ mkdir ~/uvproj && cd ~/uvproj
$ uv venv
Using CPython 3.14.4 interpreter at: /usr/bin/python3
Creating virtual environment at: .venv
Activate with: source .venv/bin/activate
$ uv pip install httpx
 + httpx==0.28.1
```

Here is the gotcha that sent me back to the error I was trying to escape. **A uv venv does not contain pip.** Look in `.venv/bin` right after creating it and there is `python`, the activate scripts, and no `pip`. If you activate it and type `pip install rich` out of habit, the `pip` you get is `/usr/bin/pip`, the system one, aimed at the system interpreter, and it fails with `externally-managed-environment` even though your prompt says `(uvproj)`. Either use `uv pip install` for everything, or create the venv with `uv venv --seed` if you want a real pip inside it.

The rest of uv's toolkit maps onto the options above:

```bash
uv tool install ruff          # like pipx install, lands in ~/.local/bin
uvx cowsay -t hello           # like pipx run, cached under ~/.cache/uv
uv run --with requests python -c 'import requests'   # one-off, throwaway env
uv init demo && cd demo && uv add requests           # a project with pyproject.toml, uv.lock, .venv
```

`uv python list` shows the system 3.14.4 at `/usr/bin/python3.14`, and `uv python install 3.13` fetches a managed interpreter in about a second. One more thing to know once you have done that: uv prefers its own managed interpreters over the system one, so after installing 3.13 a plain `uv venv` in a directory with no `.python-version` picked 3.13, not the system's 3.14. Inside a project that `uv init` created it stayed on 3.14, because `uv init` writes a `.python-version`. Pass `--python 3.14` or keep that file if you care which one you get.

## What `--break-system-packages` actually does

The error tells you the flag exists. It does not tell you what happens when you use it, so I did it on purpose to see. I picked `urllib3` because apt already had it installed as a dependency of cloud-init, and asked pip for an older major version:

```text
$ pip install --break-system-packages 'urllib3<2'
Collecting urllib3<2
Installing collected packages: urllib3
  Attempting uninstall: urllib3
    Found existing installation: urllib3 2.6.3
error: uninstall-no-record-file

× Cannot uninstall urllib3 2.6.3
╰─> The package's contents are unknown: no RECORD file was found for urllib3.

hint: The package was installed by debian. You should check if it can uninstall the package.
```

That is a second, quieter safety net. pip wants to remove the existing copy before installing, and it cannot, because apt's packages do not ship the `RECORD` file pip needs to know what to delete. So even with the flag, replacing something apt owns in `/usr/local` fails on its own. Add `--ignore-installed` and it goes through:

```bash
$ pip install --break-system-packages --ignore-installed 'urllib3<2'
Successfully installed urllib3-1.26.20

$ python3 -c 'import urllib3; print(urllib3.__version__, urllib3.__file__)'
1.26.20 /usr/local/lib/python3.14/dist-packages/urllib3/__init__.py
```

And now every process that uses the system interpreter gets `urllib3` 1.26 from `/usr/local` instead of the 2.6.3 apt installed, because `/usr/local` is earlier on the path. apt still believes it has 2.6.3. `dpkg -l` still says 2.6.3. `requests` and `botocore` happened to import fine on this box with the old major version underneath them, which is luck, not design, and the next apt security update to `python3-urllib3` will land in a directory nothing is reading.

The one saving grace is that pip never touched apt's files. `/usr/local` is a separate layer on top. `pip uninstall --break-system-packages urllib3` removed the shadow and the import went straight back to `2.6.3 /usr/lib/python3/dist-packages`. So it is recoverable, if you remember you did it.

`--user` with the flag does the same trick in `~/.local/lib/python3.14/site-packages` and only shadows for that one user, and because nothing needs uninstalling there it does not even need `--ignore-installed`. `export PIP_BREAK_SYSTEM_PACKAGES=1` turns the flag on for every pip call in that shell, and `break-system-packages = true` under `[global]` in `pip.conf` makes it permanent. Both are how a Dockerfile makes the error go away, and inside a container that is rebuilt from its image every time, that is a reasonable place for it. On a server I keep, it is not.

## Which one, when

| You want | Use | Where it goes |
| --- | --- | --- |
| A library for a system script, cron job, or systemd unit as root | `sudo apt install python3-xyz` | `/usr/lib/python3/dist-packages` |
| A library for your own project | `python3 -m venv .venv` then `.venv/bin/pip install xyz` | `.venv/lib/python3.14/site-packages` |
| A command line tool | `pipx install xyz` | `~/.local/share/pipx/venvs/xyz`, command in `~/.local/bin` |
| Any of the above with one tool | `uv venv` and `uv pip install`, `uv tool install`, `uv add` | `.venv`, `~/.local/share/uv/tools` |
| A throwaway container or CI image | `pip install --break-system-packages` | `/usr/local/lib/python3.14/dist-packages` |

If the script runs as a service, put the venv's interpreter straight into the unit file: `ExecStart=/opt/myapp/.venv/bin/python /opt/myapp/main.py`. No activation step, and an apt upgrade of a system Python library cannot change what the service imports. The interpreter itself is still apt's, a venv is package isolation, not a second Python. That pattern is in the [systemd units post](/blog/systemd-units-timers-ubuntu-26-04/).

## Gotchas I hit

- **No pip and no venv on a fresh install.** `sudo apt install python3-pip python3-venv` is the first line, every time. `python3.14-venv` is the same thing under its versioned name.
- `--user` does not get around the marker, and neither does running as a normal user. The check is on the interpreter, not on you.
- **A uv venv has no pip in it.** Activating it and running `pip install` uses `/usr/bin/pip` and fails with the same error. Use `uv pip install` or `uv venv --seed`. And `uv venv` will not overwrite an existing `.venv`, so start it in a fresh directory.
- **uv is not in the 26.04 archive.** The installer puts it in `~/.local/bin` for one user. Each user installs their own.
- `pipx ensurepath` edits `.bashrc`, so the commands are not on your PATH until you open a new shell.
- pipx will not install a library. `No apps associated with package` means you wanted a venv.
- **`--break-system-packages` cannot replace an apt package on its own.** pip cannot uninstall what apt installed, so it stops. `--ignore-installed` forces it and the shadow copy in `/usr/local` wins for every system tool from then on.
- **uv prefers its managed Pythons.** After `uv python install 3.13`, `uv venv` picked 3.13 over the system 3.14. Pin with `--python`.
- apt versions lag. `python3-requests` was 2.32.5 while PyPI had 2.34.2. For the system that is fine, for a project it is why venvs exist.

## Quick reference

```bash
# the two packages a fresh 26.04 box is missing
sudo apt install python3-pip python3-venv

# a library for the system
sudo apt install python3-requests

# a project venv
python3 -m venv .venv
.venv/bin/pip install requests          # no activation needed
source .venv/bin/activate               # if you want the prompt

# a command line tool
sudo apt install pipx
pipx install httpie && pipx ensurepath  # then open a new shell
pipx run cowsay -t hello                # run from a cache, nothing on PATH

# uv, not in the archive
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.local/bin/env
uv venv && uv pip install httpx         # a venv (no pip inside, use uv pip)
uv venv --seed                          # a venv with pip inside
uv tool install ruff                    # pipx equivalent
uv run --with requests python script.py # one-off

# the escape hatch, for containers only
pip install --break-system-packages xyz
PIP_BREAK_SYSTEM_PACKAGES=1 pip install xyz

# undo a shadow you regret
pip uninstall --break-system-packages xyz
ls /usr/local/lib/python3.14/dist-packages/
```

The thing I keep coming back to is that the fix for the error is one apt package and one `python3 -m venv`, and the tool that applies security updates to this box runs on the interpreter the error is protecting. That is a good trade. Give the system its Python, give yourself a venv, and the two never meet.

`[ apt owns /usr/lib. you own .venv ]`
