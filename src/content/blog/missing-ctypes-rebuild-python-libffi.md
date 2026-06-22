---
title: "No module named '_ctypes': why pandas wouldn't import, and rebuilding Python to fix it"
description: 'A Snowflake export job died on import pandas with ModuleNotFoundError for _ctypes. The real cause was a home-directory Python compiled without libffi headers, and the only fix was a full rebuild.'
pubDate: 'Jun 24 2026'
heroImage: '../../assets/ctypes-rebuild-hero.png'
tags: ['Debugging', 'Python', 'Linux', 'BuildFromSource', 'ctypes', 'pandas']
---

A scheduled Snowflake export job started failing on a line that doesn't even mention pandas internals, and the error pointed at a module nobody writes by hand: `_ctypes`. Chasing it down turned into a lesson about how C extension modules get built into a Python interpreter, why you can't bolt them on afterward, and why the fix was recompiling the whole thing. This is the writeup, mostly so I never re-derive it.

> **TL;DR** `import pandas` blew up with `ModuleNotFoundError: No module named '_ctypes'`. The interpreter was a self-contained Python 3.12 built into `~/.local` back in December 2023, on a box that didn't have `libffi-devel` at compile time. With no libffi headers present, the `_ctypes` C extension never got compiled, so the `.so` simply isn't there. Installing `libffi-devel` after the fact does nothing to an already-compiled interpreter. The only real fix is a rebuild. I built Python 3.14.6 with `--with-system-ffi`, dodged a `_curses` build failure caused by `--enable-optimizations` turning an optional-module warning into a hard error, `make install`ed into my own prefix, and migrated the packages over. pandas drags in `_ctypes` because pandas imports `ctypes`, and `ctypes` is just a Python wrapper around the `_ctypes` C extension.

## The failure

`snowflake_excel.py` ran fine for ages, then started dying immediately:

```text
Traceback (most recent call last):
  File "snowflake_excel.py", line 3, in <module>
    import pandas as pd
  ...
  File ".../ctypes/__init__.py", line 8, in <module>
    from _ctypes import Union, Structure, Array
ModuleNotFoundError: No module named '_ctypes'
```

The first thing worth noticing is that my code never imports `ctypes`. pandas does, transitively, somewhere deep in NumPy and its friends. So the crash happens at import time, before any of my logic runs, which is why it looked like pandas itself was broken when it wasn't.

## What _ctypes actually is

`ctypes` is two pieces. There's `ctypes/__init__.py`, which is pure Python and ships with the stdlib, and there's `_ctypes`, which is a compiled C extension, the `_ctypes...so` file that normally lives in the interpreter's `lib-dynload/` directory. The Python half is a thin wrapper. Line 8 of `ctypes/__init__.py` is literally `from _ctypes import ...`, and if that compiled `.so` isn't there, you get exactly this ModuleNotFoundError.

So the pure-Python part existed and ran. It just couldn't find the C half it depends on. That's the whole bug in one sentence: the `.so` was never built.

## Why it was never built

This Python is special. The entire 3.12 install, interpreter, stdlib, and every package, lives under `~/.local`. It's a self-contained home-directory build from December 2023, no root required, and `sys.prefix` confirms it:

```sh
$ python3 -c "import sys; print(sys.prefix)"
/home/wcdwload/.local
```

`_ctypes` is the CPython binding to libffi, the library that lets C code call functions whose signatures it only learns at runtime. To compile `_ctypes`, the build needs the libffi headers, which on a Red Hat style box come from `libffi-devel`. When this interpreter was compiled in 2023, that package wasn't on the machine. CPython's build treats `_ctypes` as an optional module: if the headers aren't there, it quietly skips building it and moves on. You get a working Python with one missing extension and no loud complaint.

Here's the bit that trips everyone up. Once the box later got `libffi-devel` installed, the obvious assumption is that the problem is solved. It is not. Installing the headers does nothing to an interpreter that was already compiled without them. The `.so` only ever gets created during compilation. The headers being present today doesn't retroactively build a file that the 2023 `make` already decided to skip.

So the menu was short. There's no `pip install _ctypes`, there's no flag to flip. You recompile the interpreter with the libffi headers present, or you live without `ctypes`. And pandas isn't going to live without it.

## The decision: rebuild, and bump the version while I'm at it

I had two choices: rebuild 3.12 in place, or build a newer Python. I went with the latest at the time, 3.14.6. Be clear that the version bump is incidental. The actual fix is "recompile with the libffi headers present," and that would have worked just as well on 3.12. I bumped because if I'm going to sit through a full source build anyway, I'd rather come out the other side on a current interpreter than on a two-year-old point release.

The nice property here is that these home-directory builds are version-scoped. Old 3.12 and new 3.14 live in separate trees under `~/.local`, so building 3.14 clobbers nothing. If the new one had gone sideways, the old broken-but-present 3.12 was still sitting right there.

## The build journey, and the footgun in the middle

Grabbed the source, configured it for my prefix, and kicked off the build. It did not go cleanly the first time.

### First failure: _curses

The build died, but not on anything to do with ctypes:

```text
Python/../Modules/_cursesmodule.c: undefined reference to 'setupterm'
```

`setupterm` is an ncurses symbol, and the box was missing `ncurses-devel`. Fine, `_curses` is another optional module, and I don't need it for a Snowflake export anyway. But notice it didn't *skip* the way `_ctypes` got skipped in 2023. It killed the whole build.

The reason is `--enable-optimizations`. That flag turns on profile-guided optimization, and as part of that hardened build, an optional-module compile warning gets promoted to a hard error via `-Werror=implicit-function-declaration`. So a missing optional library that would normally produce a "could not build these modules" skip notice at the end instead stops the build cold. That's the footgun: PGO changes the failure mode of every optional module from "shrug and skip" to "stop everything."

Two ways out, depending on whether you have root:

- Install `ncurses-devel` (needs root) and keep `--enable-optimizations` on. You get the optimized interpreter and `_curses` too.
- Drop `--enable-optimizations`. Optional-module failures go back to being skip warnings instead of build killers, and the build sails past `_curses`.

I only actually cared about `_ctypes`, so either was fine. The thing to internalize is that PGO and missing optional headers don't mix gracefully.

### The red herring: No module named 'encodings'

Mid-build I ran the freshly compiled `python` binary out of the build tree to poke at it, and got:

```text
Fatal Python error: init_fs_encoding: failed to get the Python codec of the filesystem encoding
ModuleNotFoundError: No module named 'encodings'
```

This one looks scary and means nothing. It's the in-tree binary running before `make install`, so it hasn't been told where its stdlib lives yet and can't find `encodings`. That's expected before installation, not a real problem. Run it again after `make install`, from the installed path, and it's fine. I wasted a few minutes on this before remembering it's just what a half-installed Python does.

## The final sequence

Configured pointing at my own prefix and explicitly asking for system libffi:

```sh
./configure --prefix=$HOME/.local --with-system-ffi
make
make install
```

A note on `make install` versus `make altinstall`. The usual advice is `altinstall` so you don't stomp the system's `python` symlinks, but that's for installs into shared prefixes like `/usr/local`. This goes into my own `~/.local`, owned by me, no root, nothing system-wide to clobber. So plain `make install` is correct here, and it gives me a clean `python3.14` and the `python3` symlink in my own tree.

Then verify the extensions that actually matter all import:

```sh
$ ~/.local/bin/python3.14 -c "import _ctypes, encodings, ssl; print('ok')"
ok
```

`_ctypes` for the original bug, `encodings` to confirm the install is whole (no more red herring), and `ssl` because a Python without working TLS is its own kind of useless and I'd rather find out now than on the first `pip install`.

## Migrating the packages

A fresh interpreter is an empty interpreter. I snapshotted the old environment first, then replayed it into the new one:

```sh
# from the old 3.12
~/.local/bin/python3.12 -m pip freeze > old-requirements.txt

# into the new 3.14
~/.local/bin/python3.14 -m pip install -r old-requirements.txt
```

pandas reinstalled, and this time it imported, because `_ctypes` was finally there for `ctypes` to lean on.

Two cleanups fell out of this:

- There was a `~ip-24.2.dist-info` directory sitting in `site-packages`. That leading `~` is pip's marker for an interrupted install, a half-written metadata directory left behind when a previous `pip` got killed partway through writing `pip-24.2.dist-info`. It's corrupt and harmless to delete, so I removed it. pip litters these when it dies mid-write, and they cause confusing warnings until you clear them out.
- The shebang in `snowflake_excel.py` still pointed at the old interpreter. I updated it to `#!/home/wcdwload/.local/bin/python3.14` so the job runs on the new build that actually has working ctypes.

## The lesson

A missing C extension module like `_ctypes` is almost always one thing: the dev headers weren't installed when this interpreter was compiled. And you cannot fix it by installing the headers afterward. The interpreter built without them is permanently missing that `.so`, and nothing short of a rebuild brings it back. No `pip install`, no config flag, no amount of `libffi-devel` after the fact.

The part that makes it sneaky is the distance between the symptom and the cause. The thing that broke was a Snowflake job. The thing that crashed was `import pandas`. The module it actually complained about was `_ctypes`, which backs `ctypes`, which pandas pulls in transitively for foreign-function calls. Three hops from "my data export" to "the C compiler couldn't find libffi two years ago." When you see `ModuleNotFoundError` on a name that starts with an underscore, stop looking at your code and your packages. Look at how the interpreter itself was built.
