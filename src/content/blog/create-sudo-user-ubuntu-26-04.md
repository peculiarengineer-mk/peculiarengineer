---
title: 'Create a Sudo User on Ubuntu 26.04'
description: 'Create a non-root sudo user on Ubuntu 26.04 with adduser and the sudo group, verify it before you log out, and understand what sudo-rs changes on this release.'
pubDate: 'Jul 12 2026'
heroImage: '../../assets/create-sudo-user-2604-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Linux', 'Server', 'Security', 'sudo', 'sudo-rs', 'SysAdmin']
---

The first thing I do on a fresh Ubuntu box is stop using root. Root has no seatbelt: one mistyped command and there is nothing between you and a broken system. A normal account that can borrow root through `sudo` gives you the same power with a password prompt in front of it, and a log of who did what. This is the account every other setup step assumes you already have.

The task is basic and I am not going to pretend otherwise. The reason it earns its own page is that Ubuntu 26.04 quietly swapped out the program doing the work. The `sudo` you type is now [sudo-rs](https://ubuntu.com/server/docs/reference/other-tools/sudo-rs/), a rewrite in Rust, and the first time you use it the prompt looks different enough to make you wonder if you broke something. You did not. More on that below.

> **TL;DR** As root: `adduser deploy`, then `usermod -aG sudo deploy`. Open a second session, run `sudo -v` as the new user to prove it works, and only then close root and lock down root SSH login. Never edit `/etc/sudoers` with a plain editor; use `visudo`.

## Two ways you got here

There are two common starting points, and the steps differ by one command:

- **Brand-new server, logged in as root.** A VPS or bare install that handed you a root shell. You need to create a user and grant it sudo. Do both steps.
- **Existing account that just needs sudo.** The installer already made you a user (Ubuntu Desktop does this, and its first user is usually already an admin), or a teammate created the account. Skip the creation step and go straight to the group.

Everything here assumes 26.04. If you are on a Desktop install and your account already runs `sudo` fine, you are done before you start; this is really a server story.

## 1. Create the user

Use `adduser`. It is the friendly Debian and Ubuntu wrapper: it makes the home directory, sets up a shell, and prompts for the password interactively.

```bash
adduser deploy
```

It asks for a password, then a few optional fields (full name, room number) you can leave blank by pressing Enter. That is the whole account created.

I reach for `adduser`, not the lower-level `useradd`, on purpose. `useradd deploy` on its own gives you an account with no home directory and no password set, which is a surprise waiting to happen the first time the user logs in. `adduser` does the sensible thing by default. Save `useradd` for scripts where you want to spell out every flag yourself.

If the account already exists and you only need to grant sudo, skip to the next step.

## 2. Add the user to the sudo group

On Ubuntu, membership in the `sudo` group is what grants sudo access. There is no need to touch the sudoers file for a normal admin user; the default policy already says "anyone in group `sudo` may run any command."

```bash
usermod -aG sudo deploy
```

The flags matter. `-a` means append and `-G sudo` names the group. Leave off `-a` and `usermod -G sudo deploy` will *replace* every one of the user's supplementary groups with just `sudo`, silently dropping them from anything else they belonged to. The two letters `aG` are the difference between adding a hat and swapping their entire wardrobe for one hat.

Group membership is read at login, so the user has to start a fresh session before the new group takes effect. An existing shell will not pick it up. Log out and back in, or if you are switching to the account from root:

```bash
su - deploy
```

## 3. Verify before you log out

Do not close your root session until you have proven the new account can actually use sudo. Everyone is tempted to skip this and trust that the group took; the one time it did not, you are locked out of your own box with no way back in. Open a *second* terminal, log in as `deploy`, and run:

```bash
sudo -v
```

`sudo -v` refreshes the sudo timestamp and, more usefully here, does nothing except confirm you are allowed to. It prompts for `deploy`'s password and returns quietly if the group membership took. If it says the user is not in the sudoers file, the group did not apply yet, which almost always means you are still in the shell you opened before running `usermod`. Log out fully and try again.

While you are here, confirm the group directly:

```bash
groups deploy
```

You want to see `sudo` in that list. Keep the root session open in the other window until both of these agree. A broken sudo user is only a real problem if it is the *only* thing you have, and right now it is not.

## What is different on Ubuntu 26.04

Here is the part no older tutorial mentions. Since 25.10, Ubuntu ships [sudo-rs](https://ubuntu.com/server/docs/reference/other-tools/sudo-rs/) as the default `sudo`, and 26.04 LTS carries version 0.2.13 of it. It is a memory-safe reimplementation of `sudo` and `su`, part of the same push that brought Rust coreutils to the release.

For creating and using a sudo user, nothing above changes, and that is exactly the point. sudo-rs reads the same `/etc/sudoers` and `/etc/sudoers.d/` files, honors the `sudo` group the same way, and the flags you actually use (`-i`, `-s`, `-E`, `-v`) behave identically. `visudo` and `sudoedit` both ship in this version.

What you *will* notice is cosmetic, and it trips people the first time:

- **The prompt changed.** You get `[sudo: authenticate] Password:` instead of the classic `[sudo] password for deploy:`. Same thing, different words.
- **Password feedback is on.** sudo-rs enables `pwfeedback` out of the box, so you see asterisks as you type your password. Traditional `sudo` showed nothing at all. If you are used to the blank prompt and suddenly see `****`, that is expected, not a compromise.

The one difference worth knowing before you write clever rules: sudo-rs does not yet support the full range of per-user, per-command, or per-host `Defaults` entries, and it always authenticates through PAM. For the plain "give this account admin rights" job, none of that matters. If you later paste in an exotic sudoers directive from some old forum post and it seems ignored, check it against [Ubuntu's sudo-rs notes](https://ubuntu.com/server/docs/reference/other-tools/sudo-rs/) before assuming you made a typo.

## Editing sudoers the right way

Ninety percent of the time the `sudo` group is all you need, and you should not open the sudoers file at all. When you do need finer control, two rules keep you out of trouble.

First, put custom rules in their own file under `/etc/sudoers.d/`, not in the main `/etc/sudoers`. Drop-in files are read automatically and keep your changes separate from the package's defaults, so a package upgrade never fights your edits.

Second, always edit through `visudo`. It edits a temporary copy and refuses to save if the syntax is broken:

```bash
sudo visudo -f /etc/sudoers.d/deploy
```

That `-f` points `visudo` at the drop-in file while keeping its safety check. The reason this matters is not tidiness. A stray character in the sudoers file can make `sudo` refuse to run *at all*, and the tool you would use to fix it is the tool that just broke. `visudo` catches the mistake before it is written. Edit sudoers with a plain `nano` and you are one bad line away from spending the afternoon in rescue mode.

## NOPASSWD is a footgun, not a feature

Sooner or later you will want to skip the password prompt, usually for a script or a CI runner. You can, with a rule like:

```
deploy ALL=(ALL) NOPASSWD: ALL
```

Understand what that line actually does: it lets `deploy` run *anything* as root with no password, ever. Anyone who lands in that shell (a stolen SSH key, a hijacked automation token, a forgotten open terminal) is instantly root with nothing in the way. That is not admin convenience, that is a spare key taped to the door.

If you genuinely need passwordless sudo, scope it to the exact commands that require it instead of `ALL`:

```
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp
```

Now the account can restart one service without a password and nothing else. That is a defensible trade. Blanket `NOPASSWD: ALL` on an account you also SSH into is the kind of thing you set up on a Tuesday and get owned for on a Saturday.

## Now lock down root

Creating the sudo user was step one of getting off root. Step two is closing the door behind you. Once you have confirmed `deploy` works, stop letting anyone SSH in as root directly.

If you have not already, [set up SSH keys](/blog/set-up-ssh-keys-ubuntu/) for `deploy` and confirm a key login works. Then disable root SSH login in `/etc/ssh/sshd_config`:

```
PermitRootLogin no
```

Reload SSH and, again, test from a second session before trusting it:

```bash
sudo systemctl restart ssh
```

This is the moment the sudo user pays for itself. Attackers hammer `root` over SSH constantly because it is the one username every Linux box is guaranteed to have. Take it off the table and their guessing game loses its only sure target. The full version of this, plus the firewall and the rest, lives in my [Ubuntu 26.04 server hardening guide](/blog/hardening-ubuntu-26-04-server/).

## Quick reference

| Job | Command |
| --- | --- |
| Create the user | `adduser deploy` |
| Grant sudo | `usermod -aG sudo deploy` |
| Confirm the group | `groups deploy` |
| Prove sudo works | `sudo -v` |
| Switch to the user | `su - deploy` |
| Edit sudoers safely | `sudo visudo -f /etc/sudoers.d/deploy` |
| Remove sudo later | `deluser deploy sudo` |

Create the account with `adduser`, grant it through the `sudo` group, prove it works from a second session, then take root off the SSH login screen. The commands are the same ones that have worked for years; the program running them changed underneath you, and now you know why the prompt looks different. Log in as a human and borrow root only when you actually need it. The seatbelt is the whole point.

`[ human in, root on loan ]`
