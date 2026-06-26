---
title: 'UFW Firewall Basics on Ubuntu'
description: 'What UFW actually is, how the default deny-incoming policy works, allowing services by name and by port, the enable-order trap that locks people out, reading and deleting rules, rate limiting, app profiles, logging, and where the firewall stops and a cloud security group begins. A learning guide and a reference.'
pubDate: 'Jun 25 2026'
heroImage: '../../assets/ufw-basics-hero.png'
tags: ['Ubuntu', 'Linux', 'Firewall', 'UFW', 'Security', 'Networking', 'SysAdmin', 'SelfHosted']
---

Every Ubuntu box ships with a firewall already installed, switched off, waiting.
It is called UFW, the "uncomplicated firewall," and the name is honest: once you
understand the four or five ideas behind it, you can lock a machine down in three
commands and never think about it again. The trouble is that most people meet UFW
sideways, pasting `sudo ufw allow` lines out of someone else's setup guide without
ever learning what the rules mean, and then one day a rule does not do what they
expected and they have no idea why.

This is the post I keep coming back to whenever I set up a new box. It is two
things at once: a short explanation of how UFW actually works, so the commands
stop feeling like incantations, and a reference I can paste from when I just need
the right line. It is the firewall piece that the [Ubuntu hardening
posts](/blog/hardening-ubuntu-desktop/) and the [SSH guides](/blog/set-up-ssh-keys-ubuntu/)
keep gesturing at, pulled out on its own so they can point here.

> **TL;DR.** `sudo ufw default deny incoming`, `sudo ufw default allow outgoing`,
> then `sudo ufw allow OpenSSH` **before** `sudo ufw enable` so you do not drop
> your own session. Check it with `sudo ufw status verbose`, open a port with
> `sudo ufw allow 443`, close it with `sudo ufw delete allow 443`, and use
> `sudo ufw limit OpenSSH` to throttle brute-force knocking.

## Contents

- [What UFW actually is](#what-ufw-actually-is)
- [The starting state](#the-starting-state)
- [The default policy is the whole idea](#the-default-policy-is-the-whole-idea)
- [Allowing things in](#allowing-things-in)
- [The order trap that locks people out](#the-order-trap-that-locks-people-out)
- [Reading your rules](#reading-your-rules)
- [Deleting rules](#deleting-rules)
- [More specific rules](#more-specific-rules)
- [Rate limiting the front door](#rate-limiting-the-front-door)
- [App profiles](#app-profiles)
- [Logging](#logging)
- [Where UFW stops](#where-ufw-stops)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## What UFW actually is

UFW is not the firewall. The actual firewall is in the kernel, run by `nftables`
(or `iptables` on older releases), and its native syntax is famously miserable to
write by hand. UFW is a friendly front end that turns short, readable commands
into the long kernel rules underneath. When you type `sudo ufw allow 443`, UFW
generates the real rule and loads it. That is the entire trick, and it is why the
tool can be both simple to use and a genuine firewall at the same time.

What that buys you is a single mental model: a list of rules, checked top to
bottom, each one saying allow or deny for some traffic. Plus two default policies,
one for traffic coming in and one for traffic going out, that catch anything no
rule matched. Get those two ideas straight and the rest is detail.

A firewall only governs traffic crossing the machine's own boundary. It does
nothing about what is already running locally, and it is not antivirus. What it
does is decide which of the doors on your machine are open to the network, and to
whom. For a normal box that means: almost none of them.

## The starting state

UFW is installed on every modern Ubuntu and starts out inactive. Before you change
anything, look at what you have:

```bash
sudo ufw status verbose
```

On a fresh box that prints `Status: inactive` and nothing else. Inactive means UFW
is enforcing nothing at all, regardless of any rules you may have added: rules sit
dormant until the firewall is enabled. That detail trips people up, because you can
add a dozen `allow` rules, walk away satisfied, and have changed precisely nothing
until you run `enable`.

## The default policy is the whole idea

The two default policies are the load-bearing part of any sane setup. The policy
you want on almost every machine is: block everything coming in, allow everything
going out.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

`deny incoming` means that unless a specific rule says otherwise, nothing on the
network can start a connection to your machine. `allow outgoing` means everything
*you* start, browsing, updates, video calls, package installs, works without you
listing it. The asymmetry is the point. You reach out freely; the world cannot
reach in unless you have explicitly opened a door.

Worth knowing: those two lines are already UFW's built-in defaults, so on a fresh
install you are restating what is true. I set them explicitly anyway, because a
firewall policy you can read in your own shell history is better than one you are
trusting from memory. The line that actually changes the machine's behavior is the
next one.

```bash
sudo ufw enable
```

That activates the firewall now and arranges for it to come back on at every boot.
From this moment the default-deny is real, and if you are connected over SSH and
have *not* allowed SSH yet, read the next two sections before you run it.

## Allowing things in

Every service you actually want reachable needs its own `allow` rule. There are
three ways to write one, in rough order of how I prefer them.

By application profile, the most readable:

```bash
sudo ufw allow OpenSSH
```

By port number, when there is no profile:

```bash
sudo ufw allow 443
```

By port and protocol, when you want to be precise:

```bash
sudo ufw allow 443/tcp
```

All three do the same kind of thing: punch a hole for one service. `allow 443`
opens both TCP and UDP on that port, which is usually harmless but slightly
broader than you need; `allow 443/tcp` is the tighter version. For the common web
and SSH services you almost always want TCP. Add a rule for each port the box
genuinely serves and leave everything else shut. A web server is often just two
lines:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

You can name the service instead of the number for the well-known ones, since UFW
reads `/etc/services`. `sudo ufw allow http` and `sudo ufw allow 80/tcp` are the
same rule. I lean toward the number, because a port is unambiguous and a name is
one more thing to remember.

## The order trap that locks people out

This is the single most common way people ruin an afternoon with UFW, and it is
worth its own section because the failure is so abrupt.

If you are administering a box over SSH and you run `sudo ufw enable` before you
have allowed SSH, the firewall comes up with its default-deny policy and drops your
connection mid-sentence. Your terminal hangs. You are now locked out of a remote
machine by your own firewall, and the only way back in is physical or console
access.

The fix is simply order. Allow SSH first, confirm the rule is there, then enable:

```bash
sudo ufw allow OpenSSH
sudo ufw status
sudo ufw enable
```

If you moved SSH off port 22, allow the real port instead (`sudo ufw allow 2222/tcp`)
and do it *before* `enable`, not after. The same caution applies to any change that
could cut your own path: think about whether the rule you are about to add or remove
is the one carrying your current session. On a local desktop with a keyboard
attached this is harmless, you can always fix it at the screen. On a remote server
it is the difference between a working evening and a support ticket. The
[server hardening post](/blog/hardening-ubuntu-26-04-server/) hammers the same point
because it matters that much.

## Reading your rules

Once UFW is on, you will want to see what it is enforcing. There are three views.

The plain list:

```bash
sudo ufw status
```

The verbose view, which also shows the default policies and logging level, and is
the one I reach for:

```bash
sudo ufw status verbose
```

And the numbered view, which is the one you need before deleting anything, because
it tags every rule with an index:

```bash
sudo ufw status numbered
```

A typical numbered output looks like this:

```text
     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    Anywhere
[ 2] 80/tcp                     ALLOW IN    Anywhere
[ 3] 443/tcp                    ALLOW IN    Anywhere
[ 4] 22/tcp (v6)                ALLOW IN    Anywhere (v6)
[ 5] 80/tcp (v6)                ALLOW IN    Anywhere (v6)
[ 6] 443/tcp (v6)               ALLOW IN    Anywhere (v6)
```

Read it right to left and it says: from anywhere, traffic to port 22 is allowed in.
The `(v6)` lines are the IPv6 versions of your rules, which UFW adds automatically
when IPv6 is enabled, so one `allow` command usually produces two rows. That is
normal and you want both. It is also why your rule numbers climb faster than the
number of commands you ran.

## Deleting rules

There are two ways to remove a rule, and the difference matters.

The safe-to-remember way is to delete by the exact spec you added it with. If you
opened a port with `allow 443/tcp`, you close it by prefixing the same line with
`delete`:

```bash
sudo ufw delete allow 443/tcp
```

The other way is by number, using the index from `status numbered`:

```bash
sudo ufw status numbered
sudo ufw delete 3
```

One catch with numbered deletes: the numbers shift the moment you remove a rule,
because everything below renumbers up. So if you are deleting several, either
re-run `status numbered` between each delete, or delete from the bottom of the list
upward so the indexes above your cursor stay put. Deleting by spec sidesteps the
whole problem, which is why I prefer it when I remember the original line.

## More specific rules

The `allow <port>` form opens a port to the entire internet. Often you want
narrower than that, and UFW's longer syntax covers the cases that come up.

Allow a port only from one address, the workhorse for letting a single trusted box
reach a database:

```bash
sudo ufw allow from 203.0.113.10 to any port 5432 proto tcp
```

Allow a whole subnet, say your home LAN:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
```

Allow a port only on a particular network interface, which is how you bind a
service to your VPN and nothing else:

```bash
sudo ufw allow in on tailscale0 to any port 22 proto tcp
```

Open a range of ports in one rule (the protocol is required for ranges):

```bash
sudo ufw allow 60000:61000/udp
```

And the inverse of allow, an explicit `deny` or `reject`, for the rare case you
want to block something the default policy would otherwise have let through, or to
sit above a broader allow rule:

```bash
sudo ufw deny from 203.0.113.66
```

The `from` form is the one I use most after plain `allow`, because "this database
is reachable, but only from the one app server" is a far better posture than "this
database is reachable from the whole internet and I am trusting the password." Tie
a port to a source and you have shrunk the attack surface to a single host.

> **Rule order matters here.** UFW checks rules top to bottom and the first match
> wins, so a specific `deny` has to sit *above* the broad `allow` it is meant to
> override or it never gets reached. When you need that, insert at a position
> instead of appending: `sudo ufw insert 1 deny from 203.0.113.66`.

## Rate limiting the front door

For anything exposed to the public internet, especially SSH, UFW has a built-in
brute-force throttle:

```bash
sudo ufw limit OpenSSH
```

`limit` allows the connection normally but starts denying an address once it makes
six or more connection attempts in thirty seconds. It is not a replacement for
key-only SSH or for [fail2ban](/blog/hardening-ubuntu-26-04-server/), but it is one
line and it takes the edge off the constant background knocking that every public
box gets. On a server with SSH open to the world I use `limit` instead of plain
`allow` for the SSH rule as a matter of habit.

## App profiles

Those named profiles like `OpenSSH` come from files in `/etc/ufw/applications.d/`.
A package that wants to be firewall-friendly drops a profile there describing its
ports, so you can allow it by name without looking the numbers up. See what is
available on your box:

```bash
sudo ufw app list
```

And inspect what a profile actually opens before you trust it:

```bash
sudo ufw app info OpenSSH
```

That prints the title, a description, and the ports the profile covers, so a name
like `Nginx Full` stops being a black box and you can see it means 80 and 443.
Profiles are convenience, not magic: underneath, `allow OpenSSH` becomes exactly
the `22/tcp` rule you would have written yourself.

## Logging

UFW can log what it blocks, which is how you find out whether that connection
failure is the firewall or something else:

```bash
sudo ufw logging on
```

Levels run `low`, `medium`, `high`, `full`; `low` logs blocked packets and is
plenty for most people. The lines land in `/var/log/ufw.log` (and the kernel log), and you read
them with:

```bash
sudo grep 'UFW BLOCK' /var/log/ufw.log
```

Each `[UFW BLOCK]` line names the interface, source, destination, and port it
dropped, which is genuinely useful when you are staring at a service that "should
work" and want to confirm whether packets are even reaching it or being denied at
the door. Turn logging back to quiet with `sudo ufw logging off` once you are done
debugging, since on a busy public box it can get noisy.

## Where UFW stops

The thing that costs people the most time with UFW is not UFW. It is assuming the
host firewall is the only firewall in the path. Two cases come up constantly.

**Cloud security groups.** On a cloud server, your provider runs its own network
firewall *in front of* the instance: AWS security groups, Oracle security lists,
Azure NSGs, GCP firewall rules. A port has to be open in *both* places to work. If
a port responds locally but not from the internet, the provider's firewall is
almost always still blocking it, and no amount of fiddling with `ufw` will fix a
rule that lives one layer up. I have watched this eat an hour of someone's life
more than once, including [my own self-hosting
post](/blog/self-host-ollama-oracle-free-vast-gpu/) where Oracle's security list
was the culprit.

**Docker punches through.** If you run Docker, know that publishing a container
port with `-p 8080:80` writes its own rules straight into the kernel's NAT layer,
*beneath* the chain UFW manages. The practical result is that a "blocked" port can
be wide open to the internet because Docker opened it and UFW never got a say. If
you rely on UFW on a Docker host, either bind published ports to `127.0.0.1`
explicitly (`-p 127.0.0.1:8080:80`) or install the `ufw-docker` rules that put the
two back in agreement. Assuming UFW covers your containers when it does not is a
genuinely dangerous gap.

The honest framing is that UFW is the host's own door policy, and it is excellent
at that. It is not the only door policy on a cloud box, and it is not automatically
the one Docker respects. Knowing where it stops is most of staying out of trouble.

If you ever need a clean slate, `sudo ufw reset` wipes all rules back to factory
and disables the firewall, and `sudo ufw disable` turns it off without forgetting
your rules.

## Gotchas I hit

- **Rules do nothing until `enable`.** You can stack up `allow` lines on an
  inactive firewall and change nothing. `status` says `inactive` for a reason.
- **`enable` before `allow ssh` locks you out.** The number-one remote-box
  mistake. Allow SSH, confirm with `status`, *then* enable. Covered above because
  it is that common.
- **Numbered deletes renumber as you go.** Delete one rule and every rule below it
  shifts up. Re-check `status numbered` between deletes, or delete bottom-up, or
  just delete by spec.
- **First match wins.** A `deny` placed below a broad `allow` never fires. Use
  `ufw insert 1 ...` to put specific blocks above general allows.
- **Cloud security groups are a second firewall.** Open in the provider console
  *and* in UFW, or it will not work from outside. Local-only success is the tell.
- **Docker bypasses UFW.** Published container ports can be exposed even when UFW
  looks locked down. Bind to `127.0.0.1` or use `ufw-docker`.
- **`allow 443` opens TCP and UDP.** Write `443/tcp` when you mean only TCP, which
  is almost always what you mean for web and SSH.

## Quick reference

| Task | Command |
|---|---|
| See current state | `sudo ufw status verbose` |
| Set safe defaults | `sudo ufw default deny incoming` / `default allow outgoing` |
| Allow SSH (do this first) | `sudo ufw allow OpenSSH` |
| Turn the firewall on | `sudo ufw enable` |
| Open a port | `sudo ufw allow 443/tcp` |
| Open a port to one host | `sudo ufw allow from 203.0.113.10 to any port 5432 proto tcp` |
| List rules with numbers | `sudo ufw status numbered` |
| Delete by spec | `sudo ufw delete allow 443/tcp` |
| Delete by number | `sudo ufw delete 3` |
| Insert above other rules | `sudo ufw insert 1 deny from 203.0.113.66` |
| Rate-limit a port | `sudo ufw limit OpenSSH` |
| List app profiles | `sudo ufw app list` |
| Turn on logging | `sudo ufw logging on` |
| Reset everything | `sudo ufw reset` |

That is the whole tool. Two default policies, a list of rules checked top to
bottom, and the discipline to allow SSH before you flip it on. Get those right and
UFW becomes the kind of thing you set up in three commands on a fresh box and never
think about again, which is exactly what a firewall should be.
`[ deny incoming, allow outgoing, sleep well ]`
