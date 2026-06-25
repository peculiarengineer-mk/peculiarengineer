---
title: 'The ~/.ssh/config file explained: aliases, jump hosts, and a key per host'
description: 'How the SSH config file actually works: host aliases so you stop typing addresses, ProxyJump for reaching boxes behind a bastion, a separate key per host, tunnels without the flags, and the connection multiplexing that makes it all feel instant.'
pubDate: 'Jun 24 2026'
heroImage: '../../assets/ssh-config-hero.png'
tags: ['SSH', 'Ubuntu', 'Linux', 'macOS', 'ProxyJump', 'DevOps', 'SysAdmin', 'SelfHosted', 'Productivity']
---

Once you have a handful of machines you [reach over SSH](/blog/set-up-ssh-keys-ubuntu/),
typing `ssh keith@192.168.1.42 -p 2222 -i ~/.ssh/work_key` for the tenth time
gets old fast. The fix is one file on your laptop, `~/.ssh/config`, that lets you
write all of that down once and then just type `ssh db`.

This is the file I lean on the most, and it does far more than shorten commands.
It is where jump hosts, a different key for each box, and the connection reuse
that makes SSH feel instant all live. Everything here is on the client, the
machine you connect from, and applies the same on macOS and Linux.

> **TL;DR.** Put per host settings in `~/.ssh/config` as `Host` blocks:
> `HostName`, `User`, `Port`, `IdentityFile`. Then `ssh aliasname` instead of the
> full command. `ProxyJump bastion` reaches a box behind a jump host, and a
> `Host *` block at the bottom holds your defaults.

## Contents

- [Where the file lives](#where-the-file-lives)
- [Host aliases, the main event](#host-aliases-the-main-event)
- [A key per host](#a-key-per-host)
- [Defaults with Host *](#defaults-with-host-)
- [Jump hosts with ProxyJump](#jump-hosts-with-proxyjump)
- [Make it instant with multiplexing](#make-it-instant-with-multiplexing)
- [Port forwarding without the flags](#port-forwarding-without-the-flags)
- [How matching actually works](#how-matching-actually-works)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## Where the file lives

It is `~/.ssh/config` on the machine you connect from. It probably does not exist
yet, so create it and lock the permissions down, because SSH aborts the whole
connection if the config is writable by anyone but you:

```bash
touch ~/.ssh/config
chmod 600 ~/.ssh/config
```

The format is plain text. You write `Host` blocks, each one a label followed by
indented `Keyword Value` lines. The indentation is cosmetic, SSH does not care
about it, but it makes the file readable. Lines starting with `#` are comments.

## Host aliases, the main event

This is the payoff that gets everyone in. Take that long command from the top and
write it down once:

```text
Host db
  HostName 192.168.1.42
  User keith
  Port 2222
  IdentityFile ~/.ssh/work_key
```

Now the whole thing collapses to:

```bash
ssh db
```

`Host db` is the nickname you type. `HostName` is the real address it dials.
Everything else is the flags you used to pass by hand. This works for `scp` and
`rsync` too, so `scp file.tar db:/tmp/` just goes, no address, no port flag, no
key flag.

## A key per host

If you keep separate keys, say one for work and one for a personal account on the
same provider, point each host at the right one. The important partner setting is
`IdentitiesOnly yes`, which tells SSH to use only the key you named instead of
offering every key your agent is holding:

```text
Host github-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/work_key
  IdentitiesOnly yes
```

Without `IdentitiesOnly`, an agent loaded with several keys offers them one at a
time, and a strict server can cut you off for too many attempts before it reaches
the right one. If you have ever seen `Too many authentication failures`, this is
the line that fixes it, and it is the same root cause behind some [Permission
denied (publickey)](/blog/permission-denied-publickey-ubuntu/) failures.

## Defaults with Host *

A `Host *` block matches every connection, so it is where shared defaults go. Put
it at the bottom of the file (the reason why is in [how matching
works](#how-matching-actually-works)):

```text
Host *
  AddKeysToAgent yes
  ServerAliveInterval 60
```

`AddKeysToAgent yes` loads a key into your agent the first time you use it.
`ServerAliveInterval 60` sends a quiet keepalive every minute so a session does
not freeze and die when the connection goes briefly idle, which is the thing that
kills long running SSH windows on a flaky network. On macOS this is also where
`UseKeychain yes` belongs if you want passphrases pulled from the keychain.

## Jump hosts with ProxyJump

Most real networks do not let you SSH straight to the interesting machines. They
sit on a private network behind a single bastion, and you are expected to hop
through it. `ProxyJump` does that hop for you in one line:

```text
Host bastion
  HostName bastion.example.com
  User keith

Host db
  HostName 10.0.5.12
  User keith
  ProxyJump bastion
```

Now `ssh db` quietly connects to the bastion first, then tunnels through it to
`10.0.5.12`, and you land on the private box as if it were direct. Your traffic to
the final host stays end to end encrypted, the bastion just passes it along. The
same thing on the command line is `ssh -J bastion db`.

You can chain more than one hop by listing them in order, `ProxyJump first,second`,
and SSH walks the chain. This replaced the old `ProxyCommand ssh -W %h:%p bastion`
incantation, which still works but nobody should type by choice anymore.

## Make it instant with multiplexing

This is the setting people do not know about and immediately love. With connection
multiplexing, the first `ssh db` opens the connection, and every `ssh db` after
that reuses it instead of doing the full handshake again. New sessions open in
well under a second, and an `scp` while you have a shell open does not authenticate
a second time.

```text
Host *
  ControlMaster auto
  ControlPath ~/.ssh/sockets/%r@%h:%p
  ControlPersist 10m
```

Create the socket directory once so SSH has somewhere to put the control files:

```bash
mkdir -p ~/.ssh/sockets
```

`ControlPersist 10m` keeps the master connection alive in the background for ten
minutes after you log out, so the next login is instant too. The `%r@%h:%p` tokens
expand to remote user, host, and port, which keeps a separate socket per
destination.

One macOS catch: the socket path has a hard limit of 104 characters, and a long
home directory plus a long hostname can blow past it with a cryptic `too long for
Unix domain socket` error. If you hit that, swap the path for
`ControlPath ~/.ssh/sockets/%C`, where `%C` is a short hash of the same
connection details.

## Port forwarding without the flags

If you keep typing `ssh -L 8080:localhost:80 db` to tunnel a remote service back
to your laptop, write the tunnel into the host block and drop the flag for good:

```text
Host db
  HostName 10.0.5.12
  User keith
  LocalForward 8080 localhost:80
```

Now `ssh db` brings the tunnel up every time. `LocalForward` pulls a remote port
to your machine, `RemoteForward` pushes one of your local ports out to the server,
and `DynamicForward 1080` turns the whole connection into a local SOCKS proxy.
They stack, so one host can carry several at once.

## How matching actually works

There is one rule behind every surprise this file throws. SSH reads the config top
to bottom, and for each setting the **first value it finds wins**. It does not
merge or let later blocks override earlier ones.

That has one practical consequence. Specific hosts go at the top, the catch all
`Host *` goes at the bottom. If you put `Host *` first and set `User root` in it,
that `User` is now locked for every host below, because the first match already
won. Order the file from most specific to least and it behaves the way you expect.

When the order still surprises you, stop guessing and ask SSH what it resolved:

```bash
ssh -G db
```

That prints the final merged config for `db`, every keyword and the value that
won, which is the fastest way to see why a setting is or is not taking.

For anything fancier than name patterns, there is `Match`, which can key off the
final hostname, the local user, or even the output of a command. That is a deeper
rabbit hole than most setups need, but it is there when a plain `Host` pattern
cannot express the rule.

## Gotchas I hit

- **First match wins, so order matters.** Put `Host *` last. A catch all at the
  top quietly poisons every host beneath it.
- **Permissions block the connection.** If `~/.ssh/config` is group or world
  writable, or owned by someone else, SSH does not quietly skip it. It aborts with
  `Bad owner or permissions on .../config` and refuses to connect at all. Keep it
  `600`.
- **`Host` is the alias, `HostName` is the address.** Mixing them up is the most
  common beginner slip. `Host` is what you type, `HostName` is where it goes.
- **`IdentitiesOnly` when you have many keys.** Without it, a big agent offers
  every key and trips the server's attempt limit. Name the key and pin it.
- **Skip `ForwardAgent` unless you must.** Agent forwarding lets the box you log
  into reach back and use your loaded keys, so anyone with root there can borrow
  them. To hop through a bastion use `ProxyJump`, which never exposes your agent.
  If you genuinely need forwarding, scope it to one trusted `Host`, never `Host *`.
- **Keep separate files with `Include`.** A top line of
  `Include ~/.ssh/config.d/*` lets you split work and personal configs into their
  own files instead of one giant blob. It is pasted in where the line sits, so the
  same first match wins rule applies: a stray `Host *` inside an included file will
  still poison everything after it.

## Quick reference

| Keyword | What it does |
|---|---|
| `Host` | The alias or pattern you type |
| `HostName` | The real address it connects to |
| `User` | Login username |
| `Port` | Non default port |
| `IdentityFile` | Which private key to use |
| `IdentitiesOnly yes` | Use only that key, offer no others |
| `ProxyJump` | Hop through a bastion to reach the target |
| `AddKeysToAgent yes` | Load the key into the agent on first use |
| `ServerAliveInterval` | Keepalive so idle sessions do not drop |
| `ControlMaster` / `ControlPath` / `ControlPersist` | Reuse one connection for speed |

Spend ten minutes writing this file for the machines you touch most and you get
the time back inside a week. The boxes stop being addresses and ports to remember
and turn into names you actually use. `[ ssh db ]`
