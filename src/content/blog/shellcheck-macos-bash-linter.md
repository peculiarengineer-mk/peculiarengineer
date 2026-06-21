---
title: 'ShellCheck on macOS: the linter that catches the bash bugs you never see'
description: 'How a skipped CI step put ShellCheck on my radar, how I install it on macOS, a worked example of the real bugs it catches in a deploy script, and the practical ways I wire it into editors and CI.'
pubDate: 'Jun 22 2026'
heroImage: '../../assets/shellcheck-macos-hero.png'
tags: ['ShellCheck', 'Bash', 'Shell', 'Linting', 'DevTools', 'CI', 'macOS', 'PowerShell']
---

I found ShellCheck because it wasn't there. A CI run flashed a line about skipping the shellcheck step, and the only reason it skipped was that the binary wasn't installed on the runner. So a check that was supposed to lint every shell script in the repo had been quietly doing nothing. That's the worst kind of green build. I went to install it, got curious about what it actually catches, and came away convinced it earns its place on any machine where I write bash. This is the writeup, mostly so I never re-derive the install or the good usages again.

> **TL;DR** `brew install shellcheck`, then `shellcheck myscript.sh`. It's a static analysis linter for bash and sh, not a spellchecker. Each warning gets a code like `SC2086` you can look up at [shellcheck.net](https://www.shellcheck.net/wiki/SC2086). Wire it into your editor and CI so the unquoted variable footguns never land. PowerShell's equivalent is PSScriptAnalyzer.

## What it actually is

First, the name trap, because everyone hits it once. ShellCheck is not a spellchecker. It's a static analysis linter for shell scripts. You point it at a `.sh` file, it reads the script without running it, and it flags bugs and bad practices. Every finding comes with a code like `SC2086`, and you can drop that code onto the end of a [shellcheck.net/wiki](https://www.shellcheck.net/wiki/SC2086) URL to get the full rationale and the fix.

That's the whole pitch. It encodes years of "here's how shell scripts blow up in production" into checks that run in a fraction of a second. Shell is a minefield of silent failure modes: unquoted variables, word splitting, glob surprises, subshell scoping, a `cd` that fails while the rest of the script charges ahead anyway. ShellCheck knows about all of them and you don't have to.

## Install it on macOS

Homebrew is the conventional path and the one I use:

```bash
brew install shellcheck
shellcheck --version
```

If you don't have Homebrew yet, grab it first:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

I also keep Nix around (separate post), so if that's your world it's there too:

```bash
nix profile install nixpkgs#shellcheck
```

Any of the three lands the same binary. Pick whichever owns the rest of your tooling.

## Basic usage

It's about as simple as a CLI gets:

```bash
shellcheck myscript.sh        # lint one script
shellcheck *.sh               # lint several
shellcheck -f gcc script.sh   # editor-friendly output
shellcheck -f json script.sh  # machine-readable for tooling
```

The default output is colorized and human readable, with the offending line, the code, and a short explanation. The `-f gcc` format prints one finding per line in the classic `file:line:col` shape that editors and quickfix windows know how to jump to. The `-f json` format is what you reach for when something downstream needs to parse the results.

## The worked example, where it earns its keep

This is the part that sold me. Reading about a linter is one thing. Watching it catch three real bugs in eight lines is another. Here's a `deploy.sh` that looks completely fine and would pass a casual review:

```bash
#!/bin/bash
for f in $(ls *.log); do
  rm $f
done

if [ $1 == "prod" ]; then
  echo "deploying to prod"
fi
```

Run `shellcheck deploy.sh` and it lights up. Here's what it finds and why each one matters:

| Code | Line | The problem | The fix |
|---|---|---|---|
| `SC2045` | `for f in $(ls *.log)` | Iterating over `ls` output breaks on spaces and newlines in filenames | `for f in *.log` |
| `SC2086` | `rm $f` | Unquoted variable; a filename with a space deletes the wrong files | `rm "$f"` |
| `SC2086` | `[ $1 == "prod" ]` | Unquoted `$1` breaks when it's empty or has spaces | `[ "$1" = "prod" ]` |

It also throws an info-level `SC2035` on `ls *.log`, nudging you toward `./*.log` so a filename that starts with a dash can't get read as a command flag. That's the lower-stakes end of the same idea: shell will hand your data straight to a command as if it were syntax.

Look at what each of these does in the wild. The unquoted `rm $f` is the nasty one. Drop a log file named `old logs.log` into that directory and the loop runs `rm old logs.log`, which `rm` reads as two arguments and happily deletes both `old` and `logs.log`. The script that was supposed to clean up logs now deletes whatever else happened to match. Iterating over `ls` output has the same word splitting problem one level up.

The `[ $1 == "prod" ]` check is sneakier. Call the script with no argument and `$1` expands to nothing, so the test becomes `[ == "prod" ]`, which is a syntax error in some shells and silently wrong in others. `SC2086` flags the unquoted `$1`; quoting it is the real fix. I also switch `==` to `=` while I'm there, because `=` is the portable form and bash only tolerates `==` as an extension. None of these show up when you test with tidy filenames and the right arguments. They wait for an odd filename or an empty argument, and then they bite in production. That's exactly the class of bug ShellCheck exists to kill.

## Why shell needs this more than most languages

I write a fair amount of bash glue around Azure and AWS, plus provisioning automation and the scripting on my VPS and Proxmox project. Those scripts touch real infrastructure, and the failure mode that scares me isn't a crash. A crash is loud. The one that scares me is a script doing something destructive because a variable was empty or held a character I didn't expect, while exiting 0 and looking like it worked.

This is where shell is genuinely worse than other languages, and why I think it needs a linter more than they do. A typed language catches a whole class of these mistakes at compile time. A modern interpreted language at least raises an exception when you touch something that isn't there. Shell does neither. An empty variable doesn't error, it just expands to nothing, and now `rm -rf "$DIR"/` is `rm -rf /`. The language gives you no safety net, so ShellCheck is the safety net.

The cost is a one-time install and a few seconds per run. The payoff is not running an unquoted `rm` against an empty path on a box I care about. Cheap insurance, and I've never regretted paying it.

## Good practical usages

A few ways I actually wire it in, beyond running it by hand:

**In your editor.** The VS Code ShellCheck extension surfaces warnings as you type, so you fix the unquoted variable before it ever reaches a file you save. This is where most of the value lands for me, because the feedback loop is immediate.

**In CI or a pre-commit hook.** This is what that skipped check was supposed to be doing. Put ShellCheck in the pipeline so no unlinted script lands in the repo. The lesson from the skipped step: make sure the binary is actually installed on the runner, or your check passes by doing nothing. A linting step that can silently no-op is worse than no step, because it tells you you're covered when you aren't.

**Inline directives when you meant it.** Sometimes you genuinely want the thing it's flagging. You can silence a single finding with a directive on the line above:

```bash
# shellcheck disable=SC2086  # word splitting is intentional here, $FLAGS holds multiple args
some_command $FLAGS
```

Always leave a comment saying why. A bare `disable` is a future footgun for whoever reads it next, including you.

**Read the wiki pages.** Every code has a page like [shellcheck.net/wiki/SC2086](https://www.shellcheck.net/wiki/SC2086) with the reasoning and the fix. Reading a few of them is genuinely one of the better ways to get sharper at shell. The tool is teaching you the language's sharp edges one warning at a time.

## One caveat: it doesn't do PowerShell

ShellCheck covers POSIX sh and bash. It does not touch PowerShell, which matters to me because I write plenty of that too. The equivalent there is [PSScriptAnalyzer](https://github.com/PowerShell/PSScriptAnalyzer), which you run with `Invoke-ScriptAnalyzer`. Same idea, different ecosystem. If your repo has both kinds of script, you want both linters.

For everything bash and sh, though, ShellCheck is one of those rare tools that's pure upside. Quote your variables, stop parsing `ls`, and let the linter remember the other forty footguns for you. `[ ShellCheck OK ]`
