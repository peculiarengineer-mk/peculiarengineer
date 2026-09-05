---
title: 'sudo-rs on Ubuntu 26.04: every place it differs from the sudo you know'
description: 'Ubuntu 26.04 makes sudo-rs, the Rust rewrite, the default sudo. Tested against GNU sudo on a real box: the sudoers settings it silently rejects, the flags it drops, the visudo that is stricter than the old one, and the one command that switches back.'
pubDate: 'Sep 4 2026'
heroImage: '../../assets/sudo-rs-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'sudo', 'sudo-rs', 'Linux', 'Security', 'SysAdmin', 'Rust']
---

The [create a sudo user](/blog/create-sudo-user-ubuntu-26-04/) post already told you the short version: 26.04 ships [sudo-rs](https://ubuntu.com/server/docs/reference/other-tools/sudo-rs/), a rewrite of `sudo` in Rust, the prompt looks a little different, and for making a user an admin nothing changes. That is true, and for most people it is the whole story.

This is the post for the day it stops being the whole story. You go to write an actual rule, or paste a `Defaults` line off some ten year old forum answer, and it does nothing. No error you would notice, just a setting that quietly is not there. I put both sudos on a fresh 26.04 box, ran the same commands through each, and wrote down every place they actually part ways. There are more than you would think, and one of them can lock a rule you rely on out of working.

> **TL;DR.** `sudo` on 26.04 is sudo-rs 0.2.13. It reads the same `/etc/sudoers`, honors the `sudo` group, and `NOPASSWD`, `env_keep`, `secure_path`, `umask`, and the per-user, per-host, per-command `Defaults` scopes all work. What it does not have: `logfile`, `log_output`, `requiretty`, `passprompt`, `!authenticate`, command digests, the `LOG_INPUT` tag, and full `-E`. Its `visudo` is stricter and will reject a file the old one accepts. If you need any of the missing pieces, `sudo update-alternatives --set sudo /usr/bin/sudo.ws` puts GNU sudo back in one command. Both are installed side by side.

## Contents

- [Both sudos are on the box](#both-sudos-are-on-the-box)
- [The cosmetic differences, so you stop worrying about them](#the-cosmetic-differences-so-you-stop-worrying-about-them)
- [sudo -l stopped telling you about Defaults](#sudo-l-stopped-telling-you-about-defaults)
- [The sudoers settings it silently drops](#the-sudoers-settings-it-silently-drops)
- [The scopes that do work, contrary to what you have read](#the-scopes-that-do-work-contrary-to-what-you-have-read)
- [-E is the flag that will surprise you](#e-is-the-flag-that-will-surprise-you)
- [The flags it does not have at all](#the-flags-it-does-not-have-at-all)
- [visudo is stricter now, and that is a feature](#visudo-is-stricter-now-and-that-is-a-feature)
- [What a broken sudoers actually costs you](#what-a-broken-sudoers-actually-costs-you)
- [Putting GNU sudo back](#putting-gnu-sudo-back)
- [su did not change](#su-did-not-change)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## Both sudos are on the box

This is the thing to understand before anything else. 26.04 does not replace GNU sudo with the Rust one. It installs both and points `/usr/bin/sudo` at the Rust build through the alternatives system.

```bash
$ dpkg -l | grep -E '^ii  sudo'
ii  sudo         1.9.17p2-1ubuntu3   Provide limited super user privileges
ii  sudo-common  1.2ubuntu           Configuration files for sudo
ii  sudo-rs      0.2.13-0ubuntu1     Rust-based sudo and su implementations

$ readlink -f /usr/bin/sudo
/usr/lib/cargo/bin/sudo
```

The `sudo` package Recommends `sudo-rs`, and `ubuntu-minimal` depends on both, so on a normal install you have the pair whether you asked for them or not. The Rust binary lives at `/usr/lib/cargo/bin/sudo` with alternatives priority 50. GNU sudo is still there as `/usr/bin/sudo.ws` at priority 40, which is why the Rust one wins by default. Every mention of `sudo` below is sudo-rs unless I name the other one.

That side by side layout is the whole escape hatch, and I will come back to it. For now the useful fact is that when I say "GNU sudo does X", you have GNU sudo sitting right there to check it yourself.

## The cosmetic differences, so you stop worrying about them

These are harmless, but they are the ones that make you think something broke, so clear them out of the way first.

The password prompt is reworded. sudo-rs says `[sudo: authenticate] Password:` where GNU said `[sudo] password for alice:`. The failure text changed too: a wrong password gives `sudo: Authentication failed, try again.` and after three tries `sudo: maximum 3 incorrect authentication attempts`, versus the old `Sorry, try again.` and `3 incorrect password attempts`.

And someone not in sudoers gets a different brush off. GNU sudo:

```
bob is not in the sudoers file.
```

sudo-rs:

```
sudo: I'm sorry bob. I'm afraid I can't do that
```

Which is a HAL 9000 joke and, honestly, a small delight. None of this matters, but now it will not make you second guess yourself at the prompt.

## sudo -l stopped telling you about Defaults

Here is the first difference that actually changes a habit. Run `sudo -l` to see what you are allowed to do, and the output is trimmed. GNU sudo leads with the Defaults in effect for you:

```
Matching Defaults entries for alice on host:
    env_reset, mail_badpass, secure_path=..., use_pty

User alice may run the following commands on host:
    (ALL : ALL) ALL
```

sudo-rs drops the whole first block and shows only the commands:

```
User alice may run the following commands on host:
    (ALL : ALL) ALL
```

The rules are the same. But if `sudo -l` was your way of confirming which `Defaults` are live, that readout is gone. The settings still apply, sudo-rs just does not print them. You confirm a `Defaults` line by testing its effect now, not by reading it back.

## The sudoers settings it silently drops

This is the section that will actually bite you, so it gets the most space. sudo-rs implements a subset of sudoers, and when it meets a setting it does not know, it prints a parse warning and ignores that line. Run any sudo command with one of these in a drop-in file and you see the warning go by, but the setting simply does nothing.

Here is what a rejected setting looks like. Put `Defaults logfile=/var/log/sudo.log` in `/etc/sudoers.d/test` and the next sudo call prints:

```
/etc/sudoers.d/test:1:10: unknown setting: 'logfile'
Defaults logfile=/var/log/sudo.log
         ^~~~~~~
```

The command still runs. The log file is never written. I walked a pile of common directives through it. These are the ones sudo-rs 0.2.13 does not understand, each one flagged on a real box, the settings as `unknown setting` and the command tags as `this tag is ignored by sudo-rs`:

| Setting | What you lose |
| --- | --- |
| `logfile` | The standalone `/var/log/sudo.log` text log. Use the journal. |
| `log_output` setting, `LOG_INPUT` and `LOG_OUTPUT` tags | Session I/O capture and replay. |
| `!authenticate` | Passwordless via this switch. `NOPASSWD` on the command still works. |
| `requiretty` | The control that demands a real terminal. |
| `passprompt`, `badpass_message` | Custom prompt and the wrong-password message. |
| `timestamp_type`, `mail_always` | Global credential caching, always-mail. |
| `sha256:` command digests | Pinning a command to a hash. "digest specifications are not supported". |

Two of these are worth a second look because people lean on them.

`!authenticate` is how a lot of old configs grant passwordless sudo. In sudo-rs it is an `unknown setting` and the password prompt comes back. If you want passwordless, use the command tag instead, which sudo-rs honors fully:

```
alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp
```

That works. `Defaults !authenticate` does not. If you inherited a config that suddenly asks for a password where it never used to, this is almost always why.

`logfile` is the other one. If you had sudo writing its own log at `/var/log/sudo.log`, that stops. sudo-rs logs to the journal and `/var/log/auth.log` like everything else, so `journalctl -t sudo` and `journalctl _COMM=sudo` still show every invocation with the user, working directory, and command. You are not losing the audit trail, only the separate file. And `sudoreplay`, which needs `log_output`, has no sudo-rs equivalent at all.

## The scopes that do work, contrary to what you have read

I want to correct something, including something my own earlier post said. The common line, and the sentence in the create-a-sudo-user post, is that sudo-rs "does not support the full range of per-user, per-command, or per-host Defaults". On 0.2.13 that is no longer true, and testing it is what showed me. The scope prefixes all work. I set `umask=077` under each scope and checked whether alice picked it up:

| Directive | alice gets it? |
| --- | --- |
| `Defaults:alice umask=077` | yes |
| `Defaults:%sudo umask=077` | yes, she is in `sudo` |
| `Defaults:%adm umask=077` | no, she is not in `adm` |
| `Defaults@thishost umask=077` | yes |
| `Defaults@otherhost umask=077` | no |
| `Defaults!/usr/bin/sh umask=077` | yes, for `sh` only |
| `Defaults>root umask=077` | yes, running as root |

Every scope resolves correctly, including the negative cases where it should not match. So the per-user, per-group, per-host, per-command, and per-runas prefixes are all in. What is missing is a set of individual settings, the table above, not the scoping machinery. Getting that wrong sends you debugging the scope syntax when the real problem is the setting inside it. Test it before you believe the old advice, mine included.

## -E is the flag that will surprise you

`sudo -E` and its long form `--preserve-env`, the "keep my whole environment" flag, is not supported. sudo-rs does not error out, it prints a notice and ignores it:

```
$ FOO=bar sudo -E env | grep FOO
sudo: preserving the entire environment is not supported, '-E' is ignored
```

`FOO` is gone. Scripts that assumed `sudo -E` carried their environment across will run with a clean one and no hard failure to tell them why. The targeted forms still work, which is the fix:

- `sudo --preserve-env=FOO,BAZ cmd` keeps a named list. Works.
- `Defaults env_keep += "FOO"` in sudoers keeps it for every call. Works.
- `sudo FOO=bar cmd` sets it on the spot. Works.

So you can preserve specific variables, just not the blanket "all of it". Given that blanket `-E` is a security smell anyway, naming the variables you actually need is the better habit regardless.

## The flags it does not have at all

A handful of command line flags are simply not implemented. These do not warn, they reject the whole invocation with `invalid option provided` and the short usage line:

- `-P` / `--preserve-groups`
- `-C` / `--close-from`
- `-R` / `--chroot`
- `-r` / `--role` and `-t` / `--type` (the SELinux options, which Ubuntu does not use anyway)
- `-T` / `--command-timeout`

The ones you use every day are all present: `-i`, `-s`, `-u`, `-g`, `-H`, `-k`, `-v`, `-l`, `-b`, `-e`, `-D`, `-p`, `-S`, `-n`, `-A`. If a script dies on `invalid option provided`, one of the five above is why, and that is your cue to switch that one script back to GNU sudo.

## visudo is stricter now, and that is a feature

`visudo` follows `sudo` through the alternatives system, so on 26.04 `visudo` is the Rust one too, and it is pickier than the old one in a way that will trip you the first time and help you every time after.

Give both a sudoers file that uses `requiretty` and a `LOG_INPUT` tag. GNU visudo:

```
$ visudo.ws -c -f test
test: parsed OK
```

sudo-rs visudo:

```
$ visudo-rs -c -f test
test:1:10: syntax error: unknown setting: 'requiretty'
test:2:17: syntax error: this tag is ignored by sudo-rs
visudo: invalid sudoers file
```

The old tool waves through settings the running sudo-rs will then ignore. The new one fails the check and points at the exact column. That is the behavior you want: `visudo -c` in a deploy script now actually tells you the file will not do what it says on this system. The catch is the reverse direction. A sudoers file that is valid for GNU sudo can fail sudo-rs visudo, so if you copy configs between an older box and a 26.04 one, run `visudo -c` on the new box before trusting them.

## What a broken sudoers actually costs you

The folklore is that one bad line in sudoers locks you out completely. I tested it, and the truth on 26.04 is more forgiving and more precise.

A broken drop-in file, or garbage appended to the end of `/etc/sudoers`, does not lock you out. Both sudos print the parse error on every call and then carry on with the rules that did parse. Root through a `NOPASSWD` drop-in kept working, and so did a normal user whose grant came from an intact line.

What does cost you access is a syntax error inside the rule that grants you. I mangled the `%sudo ALL=(ALL:ALL) ALL` line itself, and alice, who is admin only because she is in `sudo`, got `I'm sorry alice. I'm afraid I can't do that`. Her grant was the broken line, so it was gone. Root, whose grant was elsewhere and intact, was fine.

That is the real lesson and the real reason to use `visudo`. It is not that any typo bricks the machine. It is that a typo in the wrong line silently removes your own access while leaving the file "working", and the tool you would reach for to fix it is the one you just broke. `visudo` refuses to save the broken file in the first place. Edit a drop-in with plain `nano` and you are one unbalanced parenthesis away from locking yourself out of the exact rule you were editing.

```bash
sudo visudo -f /etc/sudoers.d/deploy
```

## Putting GNU sudo back

If you hit one of the missing pieces and you actually need it, digests, `log_output`, `requiretty`, full `-E`, you do not uninstall anything. Both are on the box, so you just point the alternative at GNU sudo:

```bash
sudo update-alternatives --set sudo /usr/bin/sudo.ws
```

Because `sudoedit`, `visudo`, and the man pages are slaves of the `sudo` alternative, that one command switches all of them together. `sudo --version` will report `1.9.17p2` and everything behaves the way every pre-26.04 guide expects. To go back to the Rust default:

```bash
sudo update-alternatives --auto sudo
```

Worth knowing that the two keep separate credential timestamps, under `/run/sudo-rs` and `/run/sudo`. So right after you switch, the "I typed my password a minute ago" grace does not carry over and you will be asked once more. Harmless, just not a surprise.

## su did not change

One thing that trips people who read that "sudo and su were both rewritten in Rust". They were, but Ubuntu did not switch `su`. `/usr/bin/su` is still util-linux's:

```bash
$ su --version
su from util-linux 2.41.3
```

sudo-rs ships its own `su` as `su-rs`, and it is installed, but plain `su` is the util-linux one it has always been, and it is not managed by alternatives. So the sudo swap is real and the su swap is not, at least not on this release. If you were bracing for `su` to behave differently, you can stop.

## Gotchas worth knowing

- **The missing setting is silent by design.** A rejected `Defaults` prints one warning line and then the command runs normally, so in a script or a cron job you will never see it. When a sudoers change "did nothing", run the command by hand once and read the first line.
- **`!authenticate` is the passwordless trap.** It is the most common way old configs skip the prompt, and it is an unknown setting now. Move to a `NOPASSWD` command tag.
- **Copying configs onto a 26.04 box needs a check.** GNU visudo passing a file does not mean sudo-rs will. Run `visudo -c` on the destination.
- **`sudo -l` no longer shows your Defaults.** Do not read it as "no Defaults are set". Test the behavior.
- **Speed is a non-issue.** A hundred `sudo true` calls took 1.11s on the Rust build and 0.99s on GNU. If you were wondering whether Rust made it slower, it did not.
- **Switching is per-command and reversible.** `--set` to pin GNU, `--auto` to go back, and both live on disk the whole time, so you are never one apt remove away from no sudo at all.

## Quick reference

| Job | Command |
| --- | --- |
| See which sudo is active | `readlink -f /usr/bin/sudo` |
| Switch to GNU sudo | `sudo update-alternatives --set sudo /usr/bin/sudo.ws` |
| Switch back to sudo-rs | `sudo update-alternatives --auto sudo` |
| Check a sudoers file the strict way | `sudo visudo -c` |
| Edit a drop-in safely | `sudo visudo -f /etc/sudoers.d/deploy` |
| Passwordless (works) | `alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` |
| Keep one env var | `sudo --preserve-env=FOO cmd` |
| Read the sudo log | `journalctl -t sudo` |

sudo-rs runs the commands you actually type exactly the way you expect. It is the clever sudoers lines and the two or three flags that differ, and now you know which ones, what they do instead, and the single command that hands you back the old sudo when a job truly needs it. The seatbelt still works. A couple of the dashboard lights just moved.

`[ same seatbelt, new dashboard ]`
