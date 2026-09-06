---
title: 'Reading logs with journalctl on Ubuntu 26.04, from scratch'
description: 'Eight posts on this site say "check the journal" and none of them explains it. One fresh 26.04 server, one afternoon: where the logs live, the five filters you actually use, the new invocation flags, what -xe adds, why a burst of log lines gets silently dropped, and how vacuuming can erase your boot history.'
pubDate: 'Sep 6 2026'
heroImage: '../../assets/journalctl-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'systemd', 'journalctl', 'Logging', 'Linux', 'SysAdmin', 'Troubleshooting']
---

I have now told you to "check the journal" in at least eight posts on this site. The [timers post](/blog/systemd-units-timers-ubuntu-26-04/) does it a dozen times. The [swap post](/blog/swap-and-zram-ubuntu-26-04/) hands you `journalctl -k` and moves on. Not once have I explained what the journal is or how to ask it a question. This is that post.

It is written for someone who knows logs used to be text files in `/var/log` and has been typing `journalctl -xe` because an error message told them to, without knowing what the `x` or the `e` does. I put a fresh Ubuntu 26.04 server up, filled it with real events, broke a service on purpose, flooded it, grew the journal to a third of a gigabyte, rebooted it, and wrote down what every command actually printed. Some of what I found contradicts the folklore, including the folklore in my own head.

> **TL;DR.** On 26.04 the journal is persistent by default under `/var/log/journal`, and the text files in `/var/log` are copies made by rsyslog. The filters you use daily: `-u unit`, `-t tag`, `-p err`, `--since "1 hour ago"`, `-b` for this boot and `-b -1` for the last one. `-f` follows, `-o short-iso` gives real timestamps, `-o verbose` shows every field a line carries so you can filter on any of them. On the systemd 259 that 26.04 ships, `journalctl -I -u unit` shows only the current run of a service and `--invocation=-1` the run before it. A normal user sees nothing until you add them to `systemd-journal` or `adm`. A service that floods the journal gets lines dropped with no notice you will find, 22500 of 50000 survived in my test. `SystemMaxUse=` plus a journald restart trims the disk immediately, and `--vacuum-*` deletes archived files, which is where your old boots live, so vacuuming aggressively erases `-b -1`.

## Contents

- [Where the logs actually are](#where-the-logs-actually-are)
- [The five filters you will use every day](#the-five-filters-you-will-use-every-day)
- [What a log line really is](#what-a-log-line-really-is)
- [Output formats, and the one to make your default](#output-formats-and-the-one-to-make-your-default)
- [Only the current run of a service](#only-the-current-run-of-a-service)
- [Watching a service restart](#watching-a-service-restart)
- [What -xe actually adds](#what--xe-actually-adds)
- [Boot history](#boot-history)
- [Logging from your own scripts](#logging-from-your-own-scripts)
- [Reading the journal as a normal user](#reading-the-journal-as-a-normal-user)
- [The lines that get thrown away](#the-lines-that-get-thrown-away)
- [Disk: how big it gets and how to shrink it](#disk-how-big-it-gets-and-how-to-shrink-it)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## Where the logs actually are

systemd-journald collects everything: kernel messages, service output, anything sent to syslog, and its own notes, into a binary, indexed store. On 26.04 that store is persistent and on disk out of the box:

```bash
$ ls /var/log/journal/
67cef2194b1e405698519fb09609500f
9ba8daa0e9094672976673925c5af5a0
$ journalctl --disk-usage
Archived and active journals take up 8M in the file system.
```

The directories are named after machine IDs, the first is this box, and their presence is what makes the journal persistent. `Storage=` in `/etc/systemd/journald.conf` is left at `auto`, which means "persistent if `/var/log/journal` exists, otherwise in memory under `/run` and gone at reboot". Ubuntu ships the directory, so you get persistence without doing anything. The image I tested on also had a second machine ID directory left over from when the image was built, which is harmless and a small reminder that the directory name is the machine, not the hostname.

Then there are the text files you remember, and on this box they were still there:

```bash
$ ls -la /var/log/syslog /var/log/auth.log /var/log/kern.log
-rw-r----- 1 syslog adm   2892 /var/log/auth.log
-rw-r----- 1 syslog adm  81672 /var/log/kern.log
-rw-r----- 1 syslog adm 167998 /var/log/syslog
```

Those exist because this image has rsyslog installed and running, and journald forwards to it, `ForwardToSyslog=yes` in a drop-in under `/usr/lib/systemd/journald.conf.d/`. rsyslog then writes the classic files. So the files are downstream copies, and the journal is the source. That matters for one practical reason: the journal has structured fields you can filter on and the text files do not, so once you can read the journal there is very little reason to grep `/var/log/syslog` again. Check for rsyslog with `dpkg -l rsyslog`; a minimal install may not have it, and then the files will not be there at all.

## The five filters you will use every day

Plain `journalctl` prints everything since the beginning of time, oldest first, in a pager. That is almost never what you want. Everything useful starts with narrowing it down, and these five do ninety percent of the work.

**By unit.** The one you type most:

```bash
journalctl -u ssh
```

Globs work, `-u 'systemd-*'`, and repeating `-u` is an OR: `-u ssh -u cron` shows both interleaved by time.

**By this boot.** `-b` restricts to the current boot, `-b -1` to the previous one. `journalctl -b -p err` is how you ask "did anything go wrong since this machine came up".

**By priority.** `-p err` shows errors and worse. Priorities are the syslog levels, `emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug`, or the numbers 0 through 7, and `-p 3` means the same as `-p err`. A range is `-p warning..err`. On my fresh box, `journalctl -b -p err` returned nothing at all, and `-p warning..err` returned twenty lines of hardware noise about a BIOS power setting and SCSI device IDs, which is about what a healthy server looks like.

**By time.** `--since` and `--until` take a lot of shapes, and they all worked: `--since "10 min ago"`, `--since today`, `--since -5m --until -1m`, and full timestamps like `--since "2026-09-06 00:00" --until "2026-09-06 00:30"`. The short forms `-S` and `-U` are the same thing.

**By tag.** `-t sudo` matches the syslog identifier, the name just before the square brackets in the classic format, `sudo[1640]`. The number inside the brackets is the PID. The tag is how you find a script's messages, which comes up later.

Two more that earn their place: `-k` is kernel messages only and is `dmesg` with persistence, on my box both printed exactly 861 lines. And `-f` follows, like `tail -f`. Put them together and `journalctl -fu ssh` is the thing you leave running in a second terminal while you poke at a service.

Add `-r` to reverse the order, `-n 20` for the last twenty lines, `-e` to jump the pager to the end, and `--no-pager` when the output is going into a pipe.

## What a log line really is

This is the part that turns the journal from "syslog with a weird command" into something better. A journal entry is not a line of text. It is a set of fields, and the line you see is one rendering of them. Look at one entry in full:

```bash
$ journalctl -u ssh -n 1 -o verbose
Sun 2026-09-06 00:30:00.158627 UTC [s=8ec485e0...;i=5d5;b=e7b6820f...]
    _BOOT_ID=e7b6820fa8a244d3821d448e4855fe41
    PRIORITY=6
    _UID=0
    _GID=0
    _TRANSPORT=syslog
    _HOSTNAME=pe-journal
    _SYSTEMD_UNIT=ssh.service
    _SYSTEMD_INVOCATION_ID=df72d24f6ac04a18a0cf6ccc8d6d5ef4
    SYSLOG_IDENTIFIER=sshd-session
    _COMM=sshd-session
    _EXE=/usr/lib/openssh/sshd-session
    _CMDLINE="sshd-session: root [priv]"
    MESSAGE=pam_unix(sshd:session): session opened for user root(uid=0) by root(uid=0)
    _PID=1462
```

I trimmed it. The real entry has about two dozen fields. The ones with a leading underscore were stamped on by journald itself from the kernel's view of the sending process, so the program does not get to choose them: `_PID`, `_UID`, `_COMM`, `_EXE`, `_SYSTEMD_UNIT`. `PRIORITY` and `MESSAGE` came from the program. `_TRANSPORT` says how the line arrived, and on this box the values in use were `syslog`, `journal`, `stdout`, `driver`, and `kernel`.

Every one of those fields is a filter. `-u ssh` is close to `_SYSTEMD_UNIT=ssh.service` plus systemd's own messages about that unit, and you can write any field directly:

```bash
journalctl _COMM=sudo                  # by program name
journalctl _COMM=sudo _UID=1000        # two fields is AND: sudo calls by uid 1000
journalctl _COMM=sudo + _COMM=sshd     # a plus between them is OR
journalctl _PID=1314                   # one process
journalctl /usr/lib/cargo/bin/sudo     # a path means _EXE
```

The AND case is the useful one. `_COMM=sudo _UID=1000` gave me only alice's sudo calls; swapping in `_UID=0` returned nothing, no sudo calls by root were on record. That is a question the text files cannot answer without a regex and a prayer.

`journalctl -N` lists every field name in the journal, and `journalctl -F _TRANSPORT` lists the values one field has taken. When you are not sure what to filter on, `-o verbose -n 1` on a line you care about shows you exactly what is there.

## Output formats, and the one to make your default

The default `-o short` looks like classic syslog, `Sep 06 00:30:00 host sshd-session[1462]: message`, and it has the classic problem: no year, no timezone. `-o short-iso` fixes both and is what I use in every post on this site:

```
2026-09-06T00:30:00+00:00 pe-journal sshd-session[1462]: pam_unix(sshd:session): ...
```

The others, each verified on the same line:

| Format | What you get |
| --- | --- |
| `short-precise` | Classic, with microseconds |
| `short-monotonic` | `[64.009564]` seconds since boot, the `dmesg` style |
| `short-unix` | `1788654600.158627` epoch seconds |
| `cat` | The message only, no prefix at all |
| `verbose` | Every field, one per line |
| `json` | One JSON object per entry, every field |
| `json-pretty` | The same, indented |

`-o cat` is the one for scripts and for reading a service's output as the program wrote it. `-o json` piped into `jq` is how you do anything analytical. `--output-fields=MESSAGE,PRIORITY,_PID` trims the JSON to what you asked for, though journald still includes its own cursor, timestamp, boot ID, and sequence number fields. `--utc` forces UTC in the timestamps, which on a box already set to UTC changed nothing, and on your laptop will.

## Only the current run of a service

Here is the problem `-u` does not solve. You restart a service, it misbehaves, and `journalctl -u thing -b` shows you every line from every run since the machine booted, and without the `-b`, every run from every boot. You want just this run. The journal has known the answer for years. It is that `_SYSTEMD_INVOCATION_ID` field from the verbose dump, a new ID every time a unit starts:

```bash
$ systemctl show -p InvocationID --value ssh
df72d24f6ac04a18a0cf6ccc8d6d5ef4
$ journalctl _SYSTEMD_INVOCATION_ID=df72d24f6ac04a18a0cf6ccc8d6d5ef4
```

After I restarted ssh, `-u ssh -b` had 16 lines and the `_SYSTEMD_INVOCATION_ID=` match for the current run had 2. That is the difference between reading a log and reading the right log.

systemd 259, which is what 26.04 ships, gives this a front door. Three flags, all present and all working on the box:

```bash
journalctl --list-invocations -u ssh    # every run this unit has had, with IDs and times
journalctl -I -u ssh                    # the latest run only
journalctl --invocation=-1 -u ssh       # the run before that
```

`--list-invocations` prints a table exactly like `--list-boots`, index `0` for the current run and negative numbers back through history. `-I` sits alongside `-u`, and `-I -u ssh` showed three lines where the raw field match showed two, because `-u` also picks up systemd's own `Starting` message about the unit. Adding `-I` is going to be my default for most debugging, because "what did it say since I restarted it" is nearly always the question. If your release's `journalctl --help` does not list these flags, the `_SYSTEMD_INVOCATION_ID=` form above works on anything with a journal.

## Watching a service restart

`-f` is the follow flag, and paired with `-n 0` it starts silent and prints only new lines. I ran it against ssh in one terminal and restarted the service in another. This is what a clean restart looks like, all eight lines of it:

```
Stopping ssh.service - OpenBSD Secure Shell server...
Received signal 15; terminating.
ssh.service: Deactivated successfully.
Stopped ssh.service - OpenBSD Secure Shell server.
Starting ssh.service - OpenBSD Secure Shell server...
Server listening on 0.0.0.0 port 22.
Server listening on :: port 22.
Started ssh.service - OpenBSD Secure Shell server.
```

Worth knowing the shape of, because when a restart is not clean, the line that is different from this jumps out. The `Received signal 15` is the service acknowledging SIGTERM from systemd.

## What -xe actually adds

`journalctl -xeu thing` is the command every failed unit tells you to run. `-e` jumps to the end. `-u` you know. The `-x` is the interesting one, and I had never actually looked at what it did until I made a service fail on purpose:

```
Sep 06 00:33:29 pe-journal systemd[1]: fail1.service: Main process exited, code=exited, status=3/NOTIMPLEMENTED
░░ Subject: Unit process exited
░░ Defined-By: systemd
░░ Support: http://www.ubuntu.com/support
░░
░░ An ExecStart= process belonging to unit fail1.service has exited.
░░
░░ The process' exit code is 'exited' and its exit status is 3.
Sep 06 00:33:29 pe-journal systemd[1]: fail1.service: Failed with result 'exit-code'.
░░ Subject: Unit failed
░░ Defined-By: systemd
░░
░░ The unit fail1.service has entered the 'failed' state with result 'exit-code'.
```

Those `░░` blocks are the message catalog: a set of human explanations, 98 of them on this box per `--list-catalog`, keyed to the message IDs systemd attaches to its own log lines. `-x` looks each line up and prints the explanation underneath. For systemd's own messages it tells you what the event means. For your program's output it adds nothing, because your program's lines have no catalog entry. So `-x` is useful for understanding what systemd did to your service and useless for understanding what your service said. Run the same command without `-x` and you get the four plain lines, which is usually enough once you know the `Failed with result` line is the verdict and the `status=3` is your program's exit code.

One small thing that will confuse you exactly once: that `status=3/NOTIMPLEMENTED`. The word after the slash is systemd's own label for exit code 3, not anything your script said. Ignore the word, read the number.

## Boot history

Because the journal is persistent, it remembers previous boots, and this is where it beats every text log. After rebooting the box:

```bash
$ journalctl --list-boots
IDX BOOT ID                          FIRST ENTRY                 LAST ENTRY
 -1 e7b6820fa8a244d3821d448e4855fe41 Sun 2026-09-06 00:30:26 UTC Sun 2026-09-06 00:31:06 UTC
  0 ab1a338ae42c4960856632f931869816 Sun 2026-09-06 00:31:15 UTC Sun 2026-09-06 00:31:32 UTC
```

`-b -1` is the previous boot, and the most useful question to ask it is what happened right before it went down:

```bash
$ journalctl -b -1 -n 3 -o cat
Received SIGTERM from PID 1 (systemd-shutdow).
Failed to remove file descriptor "config-serialization" from the store, ignoring: Connection refused
Journal stopped
```

That is a clean shutdown: systemd told journald to stop, and it did. A box that lost power or panicked never gets to write those lines, so when the previous boot's log ends without a `Journal stopped`, it did not go down on purpose, and `journalctl -b -1 -p err` is where you look for why. On a brand new box with only one boot, `-b -1` prints `No journal boot entry found for the specified boot (-1).`, which is not an error, there just is not one yet.

## Logging from your own scripts

Your shell scripts and cron jobs should write to the journal too, and it is one command. `logger` sends a message with a tag and an optional priority:

```bash
logger -t myscript "hello from logger"
logger -t myscript -p user.err "something failed in myscript"
```

`systemd-cat` does the same for a command's whole output, or for a pipe:

```bash
systemd-cat -t myscript ./backup.sh          # stdout and stderr both captured
echo "one line" | systemd-cat -t myscript -p warning
```

Then `journalctl -t myscript` shows them all and `journalctl -t myscript -p err` shows only the failure, which is exactly what the failure alert in the timers post relies on. The `-p user.err` in logger becomes `PRIORITY=3` on the entry, verified in the verbose dump, so the priority filter works on your messages the same as on systemd's.

A service you run under systemd gets this for free. Anything it prints to stdout or stderr lands in the journal with `_TRANSPORT=stdout` and the unit name attached, no logger call needed:

```bash
$ journalctl -u say-hi -o cat
Started say-hi.service - [systemd-run] /usr/bin/sh -c "echo hi from a service; echo oops >&2".
hi from a service
oops
say-hi.service: Deactivated successfully.
```

That is why "just print to stdout" is the right logging advice for anything you run as a unit. One limit to know: a single stdout line is capped at `LineMax=48K`. I sent a 100000 character line and the entry the journal stored held 49152 characters. Keep long JSON blobs off a single line.

## Reading the journal as a normal user

Run `journalctl` as a regular user and you get a polite, complete, useless result:

```
Hint: You are currently not seeing messages from other users and the system.
      Users in groups 'adm', 'systemd-journal' can see all messages.
      Pass -q to turn off this notice.
-- No entries --
```

A normal user sees only their own user journal. The system journal is readable by the `systemd-journal` group, which owns the directory, and by `adm`, which has an ACL on it, the same ACL mechanism from the [permissions post](/blog/users-groups-permissions-ubuntu-26-04/). Either group works:

```bash
sudo usermod -aG systemd-journal alice
```

Then a fresh login, because group changes do not reach a running session, and the same command shows everything. Give this to any account that debugs services and stop typing `sudo journalctl`.

## The lines that get thrown away

Here is one that surprised me. journald rate limits each service. The defaults are `RateLimitIntervalSec=30s` and `RateLimitBurst=10000`, and a service that floods past them starts losing lines. I made a unit print 50000 numbered lines as fast as it could:

```bash
$ journalctl -u flood2 -o cat | grep -cE '^[0-9]+$'
22500
```

27500 lines gone. More than the nominal 10000 survived, so the effective limit is higher than the configured number and I did not pin down why, but a little over half the output was dropped. And I could not find a "suppressed N messages" notice anywhere in the journal afterwards, so do not count on being told. If a chatty service has gaps in its log that make no sense, this is the first thing to suspect.

The fix is per unit, and it is a normal unit setting:

```ini
[Service]
LogRateLimitBurst=100000
LogRateLimitIntervalSec=30s
```

With that on the unit the same 50000 line burst kept all 50000. Raise it for the one service that genuinely logs that much. Leave the default for everything else.

## Disk: how big it gets and how to shrink it

A fresh box used 8M. To see what the limits actually were I fed it nine thousand 40 KB messages of base64 random bytes, about 350 MB, and watched:

```
after 1500 messages  (58 MB sent):  81.2M
after 4500 messages (175 MB sent): 176.1M
after 9000 messages (351 MB sent): 312.1M
```

It grew roughly in step with what I sent and never hit a ceiling, because the ceiling on this 75 GB disk is high. journald prints its own limit when it starts, and after a restart it said:

```
System Journal (/var/log/journal/67cef...) is 41.2M, max 4G, 3.9G free.
```

On this 75 GB disk journald reported a 4 GB ceiling, so a normal server never gets near it. Now the part where the usual advice is wrong. The advice is that lowering `SystemMaxUse=` does nothing until you vacuum by hand. I set a drop-in and restarted journald with 312 MB on disk:

```bash
$ sudo mkdir -p /etc/systemd/journald.conf.d
$ printf '[Journal]\nSystemMaxUse=64M\n' | sudo tee /etc/systemd/journald.conf.d/size.conf
$ sudo systemctl restart systemd-journald
$ journalctl --disk-usage
Archived and active journals take up 24M in the file system.
```

312 MB to 24 MB from the restart alone. journald enforces the new cap when it starts and trims the store down to fit. After changing the setting, restart the daemon. You do not need to vacuum.

The manual tools still matter for one off cleanup, and they have one rule between them: they only ever delete *archived* files, the `system@...journal` ones, never the active `system.journal`:

```bash
journalctl --vacuum-size=200M    # delete archives until under 200M
journalctl --vacuum-time=2weeks  # delete archives older than this
journalctl --vacuum-files=5      # keep at most this many archive files
journalctl --rotate              # archive the active file now, so the above can reach it
```

`--vacuum-size=1M` on my box deleted the one 16.9 MB archive and left the 8 MB active file alone, because the active file is not eligible. If you want to free everything, `--rotate` first so the current data becomes an archive, then vacuum.

The catch: those archived files are also where your old boots end up. After my vacuum tests, `--list-boots` on that box showed exactly one boot. The previous boot I had just examined was gone, along with every `myscript` line from before the reboot. Vacuuming is not "free up some space", it is "delete the oldest history", and `-b -1` is the first casualty. Size the journal with `SystemMaxUse=` and `MaxRetentionSec=` and let journald manage it, and reach for `--vacuum-*` only when you mean it.

`journalctl --verify` checks the files for corruption and printed `PASS` for the one file left on disk, worth running if a box was powered off hard.

## Gotchas worth knowing

- **`-u` alone shows every run, and without `-b`, every boot.** For just the current run add `-I` on 26.04, or match `_SYSTEMD_INVOCATION_ID=` on any version with a journal.
- **`--grep` turns case sensitive when your pattern has a capital letter.** `-g 'Started.*ssh'` matched; `-g 'started.*SSH'` matched nothing.
- **A normal user sees nothing.** Add them to `systemd-journal` or `adm`, then log in again.
- **Fast loggers lose lines silently.** Flood past the 10000 per 30 second default and journald drops some, and I found no notice about it. `LogRateLimitBurst=` on the unit.
- **Long lines are capped at 48K.** One 100000 character stdout line, 49152 characters in the stored entry.
- **Lowering `SystemMaxUse=` takes effect on restart, not on vacuum.** 312M to 24M the moment journald came back.
- **Vacuum deletes boot history.** The archives hold the old boots. `--list-boots` went from two to one after my cleanup.

Two smaller ones. `-x` explains systemd's own lines and adds nothing to yours, because the catalog does not know your program. And on first boot journald reported a system journal cap of `max 182.2M` on this box, then `max 4G` after a restart, so if the number it prints looks too small, restart journald and read it again.

## Quick reference

| Job | Command |
| --- | --- |
| A service, this boot, real timestamps | `journalctl -u ssh -b -o short-iso` |
| Only its current run | `journalctl -I -u ssh` |
| Its previous run | `journalctl --invocation=-1 -u ssh` |
| Anything wrong since boot | `journalctl -b -p err` |
| Why did it go down last time | `journalctl -b -1 -n 50` |
| Follow while you restart | `journalctl -fu ssh -n 0` |
| Last hour, one tag | `journalctl -t myscript --since "1 hour ago"` |
| Every field on one line | `journalctl -u ssh -n 1 -o verbose` |
| Kernel only | `journalctl -k` |
| From a script | `logger -t myscript -p user.err "message"` |
| Let a user read it | `sudo usermod -aG systemd-journal alice` |
| How big is it | `journalctl --disk-usage` |
| Cap it for good | `SystemMaxUse=500M` in `/etc/systemd/journald.conf.d/size.conf`, then restart journald |
| One off cleanup | `journalctl --rotate && journalctl --vacuum-time=2weeks` |

The journal is a database that happens to print like a log file. Ask it for a unit, a run, a priority, and a time range, and the answer is usually three lines long and already on your screen.

`[ add -I ]`
