---
title: 'Set up SSH keys for Ubuntu'
description: 'How public key authentication actually works, how to generate an ed25519 key, protect it with a passphrase, load it into ssh-agent, install it on an Ubuntu box, and turn off password login for good. A learning guide and a reference.'
pubDate: 'Jun 24 2026'
heroImage: '../../assets/ssh-keys-ubuntu-hero.png'
tags: ['SSH', 'Ubuntu', 'Linux', 'Security', 'ed25519', 'ssh-agent', 'macOS', 'SysAdmin', 'SelfHosted']
---

Once you can [SSH into an Ubuntu box](/blog/enable-ssh-on-ubuntu-desktop/), the
very next thing worth doing is to stop typing your password. Not for laziness,
though that is a nice side effect, but because a password is the one thing a bot
hammering port 22 can actually guess. A key it cannot.

This is the post I wish I had bookmarked the first few times I set this up. It is
two things at once: a short explanation of how key authentication really works,
so the commands stop feeling like a magic spell, and a reference I can come back
to when I just need the right line to paste. Examples connect from macOS and
Linux. The Ubuntu side is the same on every release I have touched.

> **TL;DR.** On your laptop: `ssh-keygen -t ed25519` with a passphrase,
> `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` to load it,
> `ssh-copy-id user@host` to install it. Confirm a key login works, then set
> `PasswordAuthentication no` in the server's `sshd_config` and
> `sudo systemctl restart ssh`.

## Contents

- [How key authentication actually works](#how-key-authentication-actually-works)
- [1. Generate a key](#1-generate-a-key)
- [2. Load the key into ssh-agent](#2-load-the-key-into-ssh-agent)
- [3. Put your public key on the server](#3-put-your-public-key-on-the-server)
- [4. Test it before you change anything](#4-test-it-before-you-change-anything)
- [5. Turn off password login](#5-turn-off-password-login)
- [6. Stop typing the address](#6-stop-typing-the-address)
- [The permissions trap](#the-permissions-trap)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## How key authentication actually works

A key is a pair of files that belong together. The private key stays on your
laptop and never leaves it. The public key is the half you hand out, and it is
safe to paste anywhere, because it cannot be reversed back into the private one.

When you connect, the server takes your public key (which you installed earlier)
and uses it to set a small cryptographic puzzle that only the matching private
key can solve. Your SSH client solves it locally, proves it holds the private
key, and the server lets you in. The private key itself is never sent over the
wire, which is the whole point. There is no secret in transit for anyone to grab.

So the work breaks down into making a pair, handing the server the public half,
and then, once that actually works, telling the server to stop accepting
passwords so the key becomes the only way in.

## 1. Generate a key

Run this on the machine you connect **from**, your laptop, not the server:

```bash
ssh-keygen -t ed25519 -C "you@your-laptop"
```

A few words on those flags. `-t ed25519` picks the modern key type. It is
smaller and faster than the old RSA default and there is no reason to choose
anything else in 2026. The `-C` comment is just a label that rides along in the
public key, and writing where the key lives helps later when you are staring at a
server with five keys in it wondering which laptop is which.

It asks where to save the key. Press enter to accept the default,
`~/.ssh/id_ed25519`. Then it asks for a passphrase, and this is the one place I
want you to slow down.

**Use a passphrase.** Your private key is a file. If your laptop is stolen or a
backup leaks, an empty passphrase means whoever holds that file holds every
server it can reach. A passphrase encrypts the key at rest, so the file alone is
useless. You will not be typing it on every connection, because the next step
hands it to an agent that remembers it for you.

When it finishes you have two files:

```bash
ls ~/.ssh/id_ed25519*
# ~/.ssh/id_ed25519        the private key, guard this
# ~/.ssh/id_ed25519.pub    the public key, safe to share
```

## 2. Load the key into ssh-agent

The agent is a small background process that holds your decrypted key in memory.
You unlock it once, and every SSH connection after that borrows the key without
asking you for the passphrase again. That is what makes a passphrase painless
instead of annoying.

On **macOS**, add the key and store the passphrase in the system keychain so it
survives reboots:

```bash
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
```

To make that automatic on every login, add a block to `~/.ssh/config`:

```text
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519
```

On **Linux**, the agent is usually already running under your desktop session.
Add the key with:

```bash
ssh-add ~/.ssh/id_ed25519
```

If it complains that it cannot connect to your authentication agent, start one
for the current shell and try again:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

Confirm the key is loaded:

```bash
ssh-add -l
```

That should print your ed25519 key. If it prints "The agent has no identities,"
the key did not load and connections will fall back to asking for the passphrase
or, worse, your password.

## 3. Put your public key on the server

The easy way, when you can still log in with a password, is `ssh-copy-id`. It
reads your public key, appends it to `~/.ssh/authorized_keys` on the server, and
sets the file permissions correctly, which matters more than people expect (see
[the permissions trap](#the-permissions-trap)):

```bash
ssh-copy-id your_username@192.168.1.42
```

It will ask for your password this one last time, then copy the key. On macOS
`ssh-copy-id` ships with the system these days, and on Ubuntu and most Linux it
is already there.

If `ssh-copy-id` is missing or the server only allows keys already, do it by
hand. Print your public key on the laptop:

```bash
cat ~/.ssh/id_ed25519.pub
```

Then on the server, create the directory and append the line:

```bash
mkdir -p ~/.ssh
echo "ssh-ed25519 AAAA...the whole line... you@your-laptop" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Paste the entire public key as one line. It is one line even when your terminal
wraps it, and breaking it across lines is a classic way to lock yourself out.

## 4. Test it before you change anything

This is the step people skip and then regret. Open a **new** terminal, leave your
current session logged in as a safety net, and connect:

```bash
ssh your_username@192.168.1.42
```

If the key is working you land straight on the server with no password prompt. If
you set a passphrase and the agent is loaded, you also will not be asked for the
passphrase. When you want to see exactly what is happening, add verbosity:

```bash
ssh -v your_username@192.168.1.42
```

Watch for `Offering public key:` followed by `Server accepts key:`, and finally a
line like `Authenticated to host (...) using "publickey"`. That last one is the
unambiguous proof your key did the work. If instead you see `Next authentication
method: password` and a password prompt appears, the key was not accepted and you
have something to fix before you go any further. Do not turn off passwords yet. If
that is where you are, jump to [Troubleshooting "Permission denied
(publickey)"](/blog/permission-denied-publickey-ubuntu/), which walks the causes
in order.

## 5. Turn off password login

Only once a key login works, close the door on passwords. On the server, edit the
SSH daemon config:

```bash
sudo nano /etc/ssh/sshd_config
```

Set these:

```text
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
```

`prohibit-password` lets root in by key if you ever genuinely need it, but never
by password. If you do not log in as root at all, `no` is stricter and better.

Apply the change:

```bash
sudo systemctl restart ssh
```

> **Mind the config drop-ins.** Modern `sshd_config` ends with a line that pulls
> in everything under `/etc/ssh/sshd_config.d/`. A file in there can quietly
> override what you just set, so if `PasswordAuthentication` refuses to stick,
> grep that directory before you lose your mind:
> `sudo grep -r PasswordAuthentication /etc/ssh/sshd_config.d/`

Keep your safety net session open and confirm a fresh login still works after the
restart. If it does, you are done locking it down.

## 6. Stop typing the address

Now that the key works, give the machine a name so you never type
`your_username@192.168.1.42` again. In `~/.ssh/config` on your laptop:

```text
Host mini
  HostName 192.168.1.42
  User your_username
  IdentityFile ~/.ssh/id_ed25519
```

After that, the whole thing is just:

```bash
ssh mini
```

This also keeps `scp` and `rsync` short, and it is where you would set a custom
`Port` if you moved SSH off 22. The config file does a lot more than shorten
commands, including jump hosts and a key per box, which I cover in [the
~/.ssh/config explainer](/blog/ssh-config-file-explained/).

## The permissions trap

Here is the one that cost me an evening, and it is the reason I always let
`ssh-copy-id` do the file work. SSH is deliberately paranoid about permissions.
If your home directory, your `~/.ssh` directory, or `authorized_keys` is writable
by anyone other than you, `sshd` decides the setup cannot be trusted and silently
ignores your key. No error on the client. It just falls back to asking for a
password, and if you have already turned passwords off, you are locked out.

The fix is to lock the permissions down to exactly this:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chown -R $USER:$USER ~/.ssh
```

The behavior is controlled by `StrictModes` in `sshd_config`, which is on by
default and should stay on. When a key that looks correct still gets refused,
permissions are the first thing to check, every time. The smoking gun is in the
server log:

```bash
sudo journalctl -u ssh --no-pager | grep -i 'authentication refused\|bad ownership'
```

A line about "bad ownership or modes" is `StrictModes` telling you exactly what
is wrong.

## Gotchas I hit

- **Permissions silently kill the key.** Covered above, and worth repeating
  because the failure is invisible from the client. 700 on `~/.ssh`, 600 on
  `authorized_keys`, owned by you.
- **The wrong user gets the key.** `ssh-copy-id root@host` installs the key for
  root, not for the account you actually log in as. Copy it to the user you will
  be logging in as, and verify with that user.
- **No agent, no convenience.** If `ssh-add -l` says the agent has no identities,
  every connection will prompt for the passphrase. That is harmless, just
  annoying, and usually means the agent is not running or the key was never added.
- **One line means one line.** A public key pasted with a line break in the
  middle will not match. Paste it whole.
- **Test before you disable passwords.** Confirm a key login works in a second
  terminal first. Turning off `PasswordAuthentication` while a key login is still
  broken is how lockouts happen.

## Quick reference

| Task | Command |
|---|---|
| Generate a key | `ssh-keygen -t ed25519 -C "you@laptop"` |
| Add key (macOS, keychain) | `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` |
| Add key (Linux) | `ssh-add ~/.ssh/id_ed25519` |
| List loaded keys | `ssh-add -l` |
| Copy public key to server | `ssh-copy-id user@host` |
| Show your public key | `cat ~/.ssh/id_ed25519.pub` |
| Test with verbose output | `ssh -v user@host` |
| Fix permissions | `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys` |
| Disable passwords | set `PasswordAuthentication no` in `sshd_config` |
| Apply config change | `sudo systemctl restart ssh` |

That is the whole ritual. After this the only way into the box is a file that
never leaves your laptop, and the bots can knock on port 22 all night for nothing.
`[ key in, password out ]`
