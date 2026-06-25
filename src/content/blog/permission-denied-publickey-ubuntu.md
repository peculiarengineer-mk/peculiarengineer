---
title: 'Troubleshooting "Permission denied (publickey)" on Ubuntu'
description: 'The exact checklist I work through when SSH rejects me with Permission denied (publickey): how to read ssh -v, the server side debug trick, and every common cause ordered by how often it is the culprit.'
pubDate: 'Jun 24 2026'
heroImage: '../../assets/ssh-publickey-denied-hero.png'
tags: ['SSH', 'Ubuntu', 'Linux', 'Troubleshooting', 'ed25519', 'ssh-agent', 'Security', 'SysAdmin', 'SelfHosted']
---

You go to connect, and instead of a shell you get this:

```text
user@host: Permission denied (publickey).
```

It is one of the most useless error messages in all of SSH, because it tells you
what failed but nothing about why. I have hit it after [setting up keys](/blog/set-up-ssh-keys-ubuntu/)
on a fresh box more times than I would like to admit, so this is the ordered
checklist I now work down instead of guessing. The fixes are quick once you know
which of the half dozen causes you are actually looking at.

> **TL;DR.** Run `ssh -v user@host` and read which keys get offered. If none do,
> it is your client (`ssh-add -l`, wrong `IdentityFile`). If a key is offered and
> still refused, it is the server: wrong user, key not in `authorized_keys`, or
> the permissions trap (`chmod 700 ~/.ssh`, `chmod 600 ~/.ssh/authorized_keys`).

## Contents

- [What the error actually means](#what-the-error-actually-means)
- [Step 1: read the client side with ssh -v](#step-1-read-the-client-side-with-ssh--v)
- [Step 2: read the server side](#step-2-read-the-server-side)
- [The causes, in order of likelihood](#the-causes-in-order-of-likelihood)
- [The permissions reset](#the-permissions-reset)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## What the error actually means

The message is the server saying two things at once. It only accepts the
`publickey` method right now, which usually means [password login is turned
off](/blog/set-up-ssh-keys-ubuntu/#5-turn-off-password-login), and none of the
keys your client offered were accepted. So the problem lives on exactly one of
two sides. Either your client never sent a usable key, or it sent one the server
would not take. Everything below is about figuring out which.

If you have not actually [enabled SSH on the
box](/blog/enable-ssh-on-ubuntu-desktop/) yet, that is a different error
([`Connection refused`](/blog/ssh-connection-refused-port-22-ubuntu/)), not this
one. This post assumes the daemon is up and talking to you.

## Step 1: read the client side with ssh -v

Do not skip this. The verbose output tells you almost everything, and the rest of
this post is just acting on what it says. From the machine you are connecting
from:

```bash
ssh -v user@host
```

The lines that matter:

```text
debug1: Offering public key: /Users/you/.ssh/id_ed25519 ED25519 ...
debug1: Authentications that can continue: publickey
debug1: No more authentication methods to try.
```

Read it like this. If you never see an `Offering public key` line at all, your
client has no key to send, and the fix is on your side. If you see a key offered
and then `Authentications that can continue` repeats and it gives up, the server
received a key and rejected it, and the fix is on the server. That one
distinction sends you to two completely different halves of the checklist below.

## Step 2: read the server side

When the client side looks fine but you are still refused, the server will tell
you exactly why, but only if you look. SSH logs to the journal:

```bash
sudo journalctl -u ssh -f
```

Leave that running and connect again from the other machine. The smoking gun is
usually a line like `Authentication refused: bad ownership or modes for file
/home/you/.ssh/authorized_keys`, which points straight at the permissions trap.

When the journal is not specific enough, run a throwaway `sshd` in debug mode on a
spare port and connect to that. It prints the entire decision in your terminal:

```bash
sudo /usr/sbin/sshd -d -p 2222
```

Use the full path. `sshd` re-execs itself and refuses to start unless you call it
with an absolute path, and `/usr/sbin` is not on a normal user's `PATH` anyway.
Then from your laptop, `ssh -v -p 2222 user@host`. The debug `sshd` stays in the
foreground, handles one connection, prints everything it is thinking, and exits.
This is the single most useful trick for this error and almost nobody reaches for
it.

## The causes, in order of likelihood

Work down this list. It is roughly ordered by how often each one is the actual
problem.

### 1. The agent has no key loaded (client)

If `ssh -v` never offered a key, check what your agent is holding:

```bash
ssh-add -l
```

If that says `The agent has no identities`, nothing will ever be offered. Load
your key:

```bash
ssh-add ~/.ssh/id_ed25519          # macOS: add --apple-use-keychain
```

### 2. The wrong key, or too many keys (client)

If you have several keys, the agent offers them one by one, and the server cuts
you off after a handful of failures with `Too many authentication failures`
before it ever reaches the right one. Pin the exact key and tell SSH to use only
that:

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes user@host
```

If that works, make it permanent in [`~/.ssh/config`](/blog/ssh-config-file-explained/):

```text
Host myhost
  HostName host
  User user
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

### 3. You are logging in as the wrong user (client)

A key only works for the account whose `authorized_keys` it sits in. If you
installed the key for `keith` but you are running `ssh root@host`, you get denied
even though the key is perfectly good. Connect as the user you actually set the
key up for, and double check you are not relying on a stale `User` line in
`~/.ssh/config`.

### 4. The key never made it onto the server (server)

On the server, as the user you are logging in as, look at the file:

```bash
cat ~/.ssh/authorized_keys
```

Your public key should be in there as one unbroken line starting with
`ssh-ed25519`. If the file is missing or empty, the key was never installed, or
it went to a different user's home. Re-install it with
[`ssh-copy-id`](/blog/set-up-ssh-keys-ubuntu/#3-put-your-public-key-on-the-server)
or paste it by hand, and make sure it is one single line. A line break in the
middle of a key is a classic cause of this exact error.

### 5. The permissions trap (server)

This is the one that wastes the most time because the key looks completely
correct and is still ignored. SSH refuses to use `authorized_keys` if the file,
the `~/.ssh` directory, or even your home directory is writable by anyone but
you. It fails silent on the client and shows up only in the server log as `bad
ownership or modes`. The fix is in [the permissions
reset](#the-permissions-reset) below.

### 6. Pubkey auth is off, or the path is wrong (server)

Check the daemon config:

```bash
sudo sshd -T | grep -Ei 'pubkeyauthentication|authorizedkeysfile'
```

`sshd -T` prints the resolved global config, including anything pulled in from
`/etc/ssh/sshd_config.d/`, which is why it beats reading the file by eye. You want
`pubkeyauthentication yes` and an `authorizedkeysfile` that points where your key
actually is (the default is `.ssh/authorized_keys`). One catch: plain `sshd -T`
does not evaluate `Match` blocks, so if a `Match User` or `Match Address` rule is
quietly turning pubkey off for you, ask for it with the connection context:

```bash
sudo sshd -T -C user=you,host=host,addr=1.2.3.4 | grep -i pubkeyauthentication
```

If you changed the config, fix it and reload:

```bash
sudo systemctl reload ssh
```

### 7. Your account is blocked by an allow list (server)

On a hardened box, an `AllowUsers`, `AllowGroups`, `DenyUsers`, or `DenyGroups`
line in the daemon config can refuse you even with a perfect key, and the symptom
is identical: key offered, silently rejected. Check what is set:

```bash
sudo sshd -T | grep -Ei 'allowusers|allowgroups|denyusers|denygroups'
```

If your user is not on the allow list (or is on a deny list), that is your
answer. Fix the list or add yourself to the right group.

### 8. The signature algorithm is disabled (either side)

This one is rare and only bites against old servers. Modern OpenSSH disables the
legacy `ssh-rsa` (RSA with SHA-1) signature scheme by default. Note the key is
not the problem: the same RSA key signs fine with `rsa-sha2-256` against anything
recent. You only hit this talking to an sshd old enough that `ssh-rsa` is all it
knows, and `ssh -v` shows the key offered and immediately rejected. The
compatibility escape hatch is to re-enable that algorithm for the one connection:

```bash
ssh -o PubkeyAcceptedAlgorithms=+ssh-rsa user@host
```

If both ends are modern, generate an ed25519 key instead and forget the whole
thing. It is the default I reach for precisely because it sidesteps this.

## The permissions reset

When in doubt, run this on the server as the user you log in as. It puts every
permission back to what `sshd` expects:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod go-w ~                      # home must not be group or world writable
chown -R "$USER": ~/.ssh
```

That `go-w` on your home directory catches the sneaky case where everything inside
`~/.ssh` is correct but the home directory itself is group writable, which
`StrictModes` rejects just as hard. It strips only the offending write bits and
leaves the rest of your home permissions alone. The `chown` uses your login group
rather than assuming the group name matches your username.

## Gotchas I hit

- **The fix is on whichever side offered the key.** No key offered in `ssh -v`
  means look at your client. A key offered and refused means look at the server.
  Sorting that first saves you from editing `sshd_config` when the real problem
  was an empty agent.
- **`sudo` does not change your SSH identity.** `sudo ssh user@host` uses root's
  empty `~/.ssh`, not yours, and fails with this exact message. Drop the `sudo`.
- **A drop-in can override your config.** A file in `/etc/ssh/sshd_config.d/` can
  quietly disable pubkey auth. `sudo sshd -T` shows the resolved truth, so trust
  it over the main file.
- **Home directory permissions count too.** Not just `~/.ssh`. A group writable
  home triggers `StrictModes` and the failure looks identical.
- **One key, one line.** Re-paste from `ssh-keygen` output, never retype, and
  never let it wrap onto two lines.

## Quick reference

| Symptom in `ssh -v` | Likely cause | Fix |
|---|---|---|
| No `Offering public key` line | Agent empty / no key | `ssh-add ~/.ssh/id_ed25519` |
| `Too many authentication failures` | Too many keys offered | `-i key -o IdentitiesOnly=yes` |
| Key offered, refused, wrong user | Logging in as wrong account | `ssh correctuser@host` |
| Key offered, refused | Not in `authorized_keys` | re-run `ssh-copy-id` |
| Server log: `bad ownership or modes` | Permissions trap | `chmod 700 ~/.ssh; 600 authorized_keys` |
| `sshd -T` shows `pubkeyauthentication no` | Pubkey disabled | edit config, `systemctl reload ssh` |

Nine times out of ten this comes down to an empty agent or the permissions trap,
and both take one command to fix. The trick is reading `ssh -v` first so you stop
editing the wrong machine. `[ publickey accepted ]`
