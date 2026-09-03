---
title: 'systemd units and timers on Ubuntu 26.04, from scratch'
description: 'Build one service and one timer on a real 26.04 box, then measure the drift, the missed runs, the failures, and the traps that bite a newcomer first.'
pubDate: 'Sep 3 2026'
heroImage: '../../assets/systemd-timers-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'systemd', 'Linux', 'Server', 'SysAdmin', 'Automation', 'DevOps', 'Tutorial']
---

I have now written "run it from a systemd timer" in three posts, pointed at a timer each time, and never once explained what one is. The [restic post](/blog/backup-homelab-restic-object-storage/) has a timer in it that I asked you to copy on faith. This is the post those should have linked to.

It is written for someone who has never opened a unit file. If you have used cron, you already know the job: run this script at that time. What is different is everything around the job. Where the output goes, what happens when the box was off at three in the morning, what happens when the script fails, and why it fires a few seconds late. I built one job on a fresh Ubuntu 26.04 server and then spent an evening measuring those things instead of assuming them.

> **TL;DR.** Two files in `/etc/systemd/system/`. `job.service` says what to run (`Type=oneshot`, `ExecStart=/absolute/path`). `job.timer` says when (`OnCalendar=`), and it starts the service with the same name. `systemctl daemon-reload` after every edit, then `systemctl enable --now job.timer`, the timer, never the service. Add `Persistent=true` so a run missed while the box was off happens at boot, and `AccuracySec=1s` if "03:30" has to mean 03:30. Test with `systemctl start job.service` instead of waiting. Your script runs with no shell, no `HOME`, a five entry `PATH`, and every `%` and `$` has a meaning to systemd before your script ever sees it.

## Contents

- [The one idea worth holding onto](#the-one-idea-worth-holding-onto)
- [What is already running on your box](#what-is-already-running-on-your-box)
- [1. The job](#1-the-job)
- [2. The service unit](#2-the-service-unit)
- [3. daemon-reload, and why your edit did nothing](#3-daemon-reload-and-why-your-edit-did-nothing)
- [4. The timer unit](#4-the-timer-unit)
- [5. Reading and writing OnCalendar](#5-reading-and-writing-oncalendar)
- [6. Why it fired late](#6-why-it-fired-late)
- [7. The box was off at 03:30](#7-the-box-was-off-at-0330)
- [8. Timers that count from boot, and jitter](#8-timers-that-count-from-boot-and-jitter)
- [9. When the job fails](#9-when-the-job-fails)
- [10. Your script is not running in your shell](#10-your-script-is-not-running-in-your-shell)
- [11. When the job takes longer than the interval](#11-when-the-job-takes-longer-than-the-interval)
- [12. Testing without waiting until 03:30](#12-testing-without-waiting-until-0330)
- [13. Timers for a normal user](#13-timers-for-a-normal-user)
- [14. Changing one of Ubuntu's own timers](#14-changing-one-of-ubuntus-own-timers)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## The one idea worth holding onto

systemd manages things called units. A service unit is a thing to run. A timer unit is a clock that starts some other unit when it goes off. That is the whole model, and cron has no equivalent to it: in cron the schedule and the command live on one line, and the moment the command runs, cron forgets about it.

Here they are two files with the same name and different extensions. `backup.service` is what. `backup.timer` is when. The timer activates the service by name, and because the service is a real unit in its own right, you can start it by hand, read its last exit code, and see its output, all without the timer being involved. Most of what makes timers better than cron falls out of that split.

Everything below was run on Ubuntu 26.04.1 with systemd 259, as root unless I say otherwise. The box is on UTC, which matters in Section 5.

## What is already running on your box

You do not have to write a timer to see one. A fresh 26.04 server ships with eighteen:

```bash
systemctl list-timers --all
```

```text
NEXT                                LEFT LAST PASSED UNIT                           ACTIVATES
Thu 2026-09-03 22:50:00 UTC     2min 57s -         - sysstat-collect.timer          sysstat-collect.service
Thu 2026-09-03 23:01:21 UTC        14min -         - systemd-tmpfiles-clean.timer   systemd-tmpfiles-clean.service
Fri 2026-09-04 00:00:00 UTC     1h 12min -         - dpkg-db-backup.timer           dpkg-db-backup.service
Fri 2026-09-04 00:12:59 UTC     1h 25min -         - logrotate.timer                logrotate.service
Fri 2026-09-04 06:41:12 UTC           7h -         - apt-daily-upgrade.timer        apt-daily-upgrade.service
Fri 2026-09-04 10:09:56 UTC          11h -         - apt-daily.timer                apt-daily.service
Mon 2026-09-07 01:02:03 UTC       3 days -         - fstrim.timer                   fstrim.service
-                                      - -         - snapd.snap-repair.timer        snapd.snap-repair.service
...
18 timers listed.
```

Log rotation, the apt update check, filesystem trimming, the `man` database: on Ubuntu none of these are cron jobs any more. Each is a timer starting a service. The `-` rows at the bottom are timers that are loaded but will never fire, often because a condition in the unit is false on this machine.

The fastest way to learn the format is to read one Ubuntu wrote:

```bash
systemctl cat fstrim.timer
```

```ini
# /usr/lib/systemd/system/fstrim.timer
[Unit]
Description=Discard unused filesystem blocks once a week
Documentation=man:fstrim
ConditionVirtualization=!container
ConditionPathExists=!/etc/initrd-release

[Timer]
OnCalendar=weekly
AccuracySec=1h
Persistent=true
RandomizedDelaySec=100min

[Install]
WantedBy=timers.target
```

Every line in that `[Timer]` block gets its own section below, because Ubuntu's choices there are good ones and it is worth knowing why. The two `Condition` lines are why this timer does nothing inside a container: a condition that is false makes the unit load and then quietly never run. Note the path too. Ubuntu's units live in `/usr/lib/systemd/system/`. Yours go in `/etc/systemd/system/`, and if both places hold a file with the same name, `/etc` wins. Do not edit anything under `/usr/lib`; Section 14 shows how to change a vendor timer without touching it.

## 1. The job

Start with something that prints what it can see, because what it can see is the surprising part.

```bash
cat > /usr/local/bin/hello-timer.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "hello from $(hostname) at $(date '+%F %T'), pid $$, user $(id -un)"
echo "PATH is: $PATH"
echo "HOME is: ${HOME:-unset}"
EOF
chmod +x /usr/local/bin/hello-timer.sh
/usr/local/bin/hello-timer.sh
```

```text
hello from systemd-timers-post at 2026-09-03 22:47:04, pid 1741, user root
PATH is: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin
HOME is: /root
```

Remember those last two lines. They are about to change.

## 2. The service unit

```ini
# /etc/systemd/system/hello.service
[Unit]
Description=Say hello (demo job)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/hello-timer.sh
```

Three things to notice. `Type=oneshot` tells systemd this is a job that runs and exits, not a daemon that stays up, so "started successfully" means "exited zero" rather than "the process is alive". `ExecStart` is the command. And there is no `[Install]` section, on purpose: this unit is started by the timer, not at boot, so it has no place to be enabled into. Section 4 shows what happens when you try.

Tell systemd the file exists, run it once by hand, and look:

```bash
systemctl daemon-reload
systemctl start hello.service
systemctl status hello.service
```

```text
○ hello.service - Say hello (demo job)
     Loaded: loaded (/etc/systemd/system/hello.service; static)
     Active: inactive (dead)

Sep 03 22:47:05 systemd-timers-post systemd[1]: Starting hello.service - Say hello (demo job)...
Sep 03 22:47:05 systemd-timers-post hello-timer.sh[1873]: hello from systemd-timers-post at 2026-09-03 22:47:05, pid 1873, user root
Sep 03 22:47:05 systemd-timers-post hello-timer.sh[1873]: PATH is: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin
Sep 03 22:47:05 systemd-timers-post hello-timer.sh[1873]: HOME is: unset
Sep 03 22:47:05 systemd-timers-post systemd[1]: hello.service: Deactivated successfully.
Sep 03 22:47:05 systemd-timers-post systemd[1]: Finished hello.service - Say hello (demo job).
```

`inactive (dead)` is the correct resting state for a oneshot. It ran, it finished, it is not running now. The script's output went straight into the journal with no redirection on your part, which is the first thing cron never gave you. The same lines are there whenever you want them:

```bash
journalctl -u hello.service -o short-iso
```

And there are the two changed lines. `PATH` has five entries instead of nine, and `HOME` is not set at all. Your script did not run in your shell. It ran in systemd's idea of a clean environment, and Section 10 is about how far that goes.

One thing I expected to be a gotcha and was not. Every guide says `ExecStart` needs an absolute path. I tried `ExecStart=hello-timer.sh` and it ran, because systemd has looked bare command names up in its own `PATH` for years now. Write the absolute path anyway. It costs nothing and it means the unit does not depend on where `PATH` points.

## 3. daemon-reload, and why your edit did nothing

systemd reads unit files once and keeps them in memory. Edit the file on disk and nothing happens until you say `daemon-reload`. Everyone gets bitten by this exactly once, so here is what it looks like. I changed the `Description=` line and then asked:

```bash
systemctl status hello.service
```

```text
Warning: The unit file, source configuration file or drop-ins of hello.service changed on disk. Run 'systemctl daemon-reload' to reload units.
○ hello.service - Say hello (demo job)
```

The warning is loud, but only if you run `status`. `systemctl start` prints it too and then starts the **old** definition regardless:

```bash
systemctl start hello.service
systemctl show hello.service -p Description
```

```text
Warning: The unit file, source configuration file or drop-ins of hello.service changed on disk. Run 'systemctl daemon-reload' to reload units.
Description=Say hello (demo job)
```

Still the old text. After `systemctl daemon-reload` it reads `Description=Say hello (edited on disk)` and the warning goes away. The habit to build is that `daemon-reload` is part of saving the file, not a separate step you do when something looks wrong.

## 4. The timer unit

```ini
# /etc/systemd/system/hello.timer
[Unit]
Description=Run hello every minute (demo)

[Timer]
OnCalendar=*-*-* *:*:00
Unit=hello.service

[Install]
WantedBy=timers.target
```

`OnCalendar` is the schedule, here every minute on the minute, which is a terrible schedule for anything real and a very good one for watching it work. `Unit=` names what to start, and you can leave it out when the service has the same name as the timer, which it does here and should in general. The `[Install]` section is what makes `enable` mean something: `timers.target` is the unit that starts all timers at boot, and enabling this timer hooks it in there.

This is also the moment to see what enabling the service instead would have done, because it is the most common first mistake:

```bash
systemctl enable hello.service
```

```text
The unit files have no installation config (WantedBy=, RequiredBy=, UpheldBy=,
Also=, or Alias= settings in the [Install] section, and DefaultInstance= for
template units). This means they are not meant to be enabled or disabled using systemctl.
...
```

Correct, and that is exactly why the service has no `[Install]` section. If it had one with `WantedBy=multi-user.target`, enabling it would make the job run once at every boot, which for a backup or a cleanup is a surprise nobody wants. Enable the timer:

```bash
systemctl daemon-reload
systemctl enable --now hello.timer
systemctl list-timers hello.timer
```

```text
Created symlink '/etc/systemd/system/timers.target.wants/hello.timer' → '/etc/systemd/system/hello.timer'.
NEXT                        LEFT LAST PASSED UNIT        ACTIVATES
Thu 2026-09-03 22:48:00 UTC  51s -         - hello.timer hello.service
```

`--now` starts it as well as enabling it, and `list-timers` is the command you will run more than any other in this post. `systemctl status hello.timer` shows the same in prose, with a `Trigger:` line and a `Triggers: ● hello.service` line that ties the two files together.

Wait two minutes and read the service's journal, and the job is running itself:

```text
2026-09-03T22:48:27+00:00 systemd-timers-post hello-timer.sh[2109]: hello from systemd-timers-post at 2026-09-03 22:48:27, pid 2109, user root
```

Look at that timestamp though. The timer was for 22:48:00 and the job ran at 22:48:27. Section 6.

## 5. Reading and writing OnCalendar

The format is `DayOfWeek Year-Month-Day Hour:Minute:Second`, every part optional, `*` for any, `..` for ranges, `,` for lists, `/` for steps. You do not have to remember that, because `systemd-analyze calendar` will tell you what any expression means and when it next fires, and it is the tool to reach for before you put anything in a unit file:

```bash
systemd-analyze calendar "Mon..Fri 09:00"
```

```text
  Original form: Mon..Fri 09:00
Normalized form: Mon..Fri *-*-* 09:00:00
    Next elapse: Fri 2026-09-04 09:00:00 UTC
       From now: 10h left
```

Here is a table I built by feeding it the expressions I actually use, so I stop working them out from the man page:

| You write | systemd reads it as | Meaning |
| --- | --- | --- |
| `daily` | `*-*-* 00:00:00` | midnight every day |
| `03:30` | `*-*-* 03:30:00` | 03:30 every day |
| `hourly` | `*-*-* *:00:00` | top of every hour |
| `*:0/15` | `*-*-* *:00/15:00` | every 15 minutes |
| `weekly` | `Mon *-*-* 00:00:00` | Monday midnight |
| `Mon..Fri 09:00` | `Mon..Fri *-*-* 09:00:00` | weekday mornings |
| `Mon,Wed,Fri 18:00` | `Mon,Wed,Fri *-*-* 18:00:00` | three evenings a week |
| `*-*-01 00:00:00` | `*-*-01 00:00:00` | first of the month |
| `quarterly` | `*-01,04,07,10-01 00:00:00` | first of Jan, Apr, Jul, Oct |
| `2026-12-25 08:00` | `2026-12-25 08:00:00` | once, on that date |

Two things worth knowing. `--iterations=3` shows the next three firings instead of one, which is how you catch that `weekly` means Monday and not "seven days from now". And a real typo is rejected rather than guessed at:

```bash
systemd-analyze calendar "every day at 3"
```

```text
Failed to parse calendar specification 'every day at 3': Invalid argument
```

That same rejection is what you get if the typo makes it into a timer unit, except there it is quieter. `systemd-analyze verify /etc/systemd/system/bad.timer` prints `Failed to parse calendar specification, ignoring` and `Timer unit lacks value setting. Refusing`, and `systemctl start` fails with `bad unit file setting`. Run `verify` on anything new before you enable it. One thing it forgives: I typed `Mon-Fri 09:00` with a single hyphen, and it silently normalised it to `Mon..Fri`.

**Timezones.** `OnCalendar` is read in the box's local timezone, which on a fresh server is almost always UTC. Check with `timedatectl`. If the box is on local time and you want a job in UTC anyway, append it: `*-*-* 03:30:00 UTC` is valid and `systemd-analyze calendar` shows the `UTC` in the normalised form.

## 6. Why it fired late

The 22:48:00 job ran at 22:48:27. The next one, scheduled for 22:49:00, ran at 22:49:18. Nothing is wrong. Timers have a setting called `AccuracySec`, and its default is one minute:

```bash
systemctl show hello.timer -p AccuracyUSec
```

```text
AccuracyUSec=1min
```

Which means: fire at any point in the minute after the scheduled time. systemd does this so it can batch timers together and wake the machine up less often, and for a nightly backup a few seconds of drift is nothing. For anything where the exact minute matters, say a job that has to land before another system polls at :05, set it explicitly. I ran the same minute timer twice, once with the default and once with `AccuracySec=1s`, and logged the moment the job started:

```text
default:           fired at 22:50:03.959   fired at 22:51:08.954
AccuracySec=1s:    fired at 22:52:00.147   fired at 22:53:00.147
```

With the default I saw the job land anywhere from four to twenty seven seconds after the minute. With `AccuracySec=1s` it landed 150 milliseconds after, both times. Ubuntu's own `fstrim.timer` goes the other way and sets `AccuracySec=1h`, because nobody cares which hour of Monday the disks get trimmed. Pick the one that matches how much you care.

## 7. The box was off at 03:30

This is the single best reason to use a timer over cron for anything on a machine that is ever switched off or rebooted. Cron skips a missed run and says nothing. A timer with `Persistent=true` remembers.

```ini
# /etc/systemd/system/daily.timer
[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

The mechanism is a stamp file. Every time the timer fires it touches `/var/lib/systemd/timers/stamp-daily.timer`, and when the timer is next activated, systemd compares that stamp to the schedule. If a run should have happened in between, it runs the job immediately.

Two things I wanted to know before trusting it. First, does a brand new persistent timer fire the moment you enable it, on the theory that it has "missed" every run since the beginning of time? No. On first enable it created the stamp and waited for midnight like any other timer. Second, does it really catch up? I made it look as if the last run was two days ago and started the timer:

```bash
systemctl stop daily.timer
touch -d "2 days ago" /var/lib/systemd/timers/stamp-daily.timer
systemctl start daily.timer
journalctl -u daily.service -o short-iso --since "-1min"
```

```text
2026-09-03T23:00:43+00:00 systemd-timers-post sh[4482]: daily job ran at 23:00:43
```

Immediately. The same test with the `Persistent=true` line removed did nothing, and `list-timers` showed it calmly waiting for midnight.

Then I did it properly. I set the timer for 23:10, powered the server off at 23:07, and turned it back on through the Hetzner API at 23:11:48, so the slot passed with the machine dark:

```text
uptime -s            2026-09-03 23:12:01
2026-09-03T23:12:11+00:00 systemd-timers-post systemd[1]: Starting daily.service...
2026-09-03T23:12:11+00:00 systemd-timers-post sh[964]: daily job ran at 23:12:11
```

Ten seconds after boot, the missed run happened. A cron job at 23:10 would have been silently skipped and you would have found out when you went looking for last night's backup. Every timer Ubuntu ships that does real work, `fstrim`, `apt-daily`, `logrotate`, has `Persistent=true`. Yours should too.

## 8. Timers that count from boot, and jitter

`OnCalendar` is wall clock time. There is a second family that counts durations instead, and they are useful for "a while after boot" and "every so often" without caring what time it is:

```ini
[Timer]
OnBootSec=15min
OnUnitActiveSec=1h
```

`OnBootSec=15min` fires fifteen minutes after the machine came up. `OnUnitActiveSec=1h` fires an hour after the service last ran. Together they mean "first run fifteen minutes after boot, then hourly", which is a better shape for a health check than `hourly`, because it does not pile onto whatever else runs at the top of the hour. `list-timers` showed mine for 23:01:21 on a box that booted at 22:46:21, which is the arithmetic you would expect.

`RandomizedDelaySec` spreads a run out over a window. Ubuntu's `apt-daily.timer` uses `RandomizedDelaySec=12h` so that every Ubuntu machine on earth does not hit the mirrors at the same second. I put `RandomizedDelaySec=30min` on a 03:30 timer and restarted it three times:

```text
Fri 2026-09-04 03:49:13 UTC
Fri 2026-09-04 03:44:33 UTC
Fri 2026-09-04 03:44:47 UTC
```

A fresh point in the window each time. This is why the [restic post](/blog/backup-homelab-restic-object-storage/) has `RandomizedDelaySec=30m` on its backup: three homelab boxes all backing up to the same bucket at exactly 03:30 is a small self inflicted thundering herd.

## 9. When the job fails

A script that exits nonzero fails the service, and systemd is not shy about it:

```bash
systemctl start flaky.service
systemctl status flaky.service
```

```text
Job for flaky.service failed because the control process exited with error code.
See "systemctl status flaky.service" and "journalctl -xeu flaky.service" for details.

× flaky.service - A job that fails
     Active: failed (Result: exit-code) since Thu 2026-09-03 22:54:41 UTC; 20ms ago
    Process: 3305 ExecStart=/bin/sh -c echo "about to fail"; exit 3 (code=exited, status=3)
```

The `×` and `failed` stick until you clear them, and `systemctl list-units --failed` lists every unit on the box in that state, which is a decent morning check on any server. `systemctl reset-failed flaky.service` clears it. One thing that will confuse you the first time: the journal line reads `status=3/NOTIMPLEMENTED`. systemd keeps a table of names for exit codes, inherited from the old LSB init script convention where 3 meant "unimplemented feature", and it prints the name next to any code it recognises. Your script exited 3 and that is all it means.

Nothing emails you, and that is the honest gap compared to cron's `MAILTO`. The building block systemd gives you instead is `OnFailure=`, which starts another unit when this one fails. Here is the smallest useful version. It uses a template unit, which is worth a sentence because the filename looks odd: a unit named `something@.service` is a reusable definition you start with an argument after the `@`, and inside the file `%i` stands for that argument. So `notify-failed@flaky.service` is the template run with `flaky.service` as its argument. The alert goes into the journal at error priority, where anything you already use to watch logs will see it:

```ini
# /etc/systemd/system/flaky.service
[Unit]
Description=A job that fails
OnFailure=notify-failed@%n.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo "about to fail"; exit 3'
```

```ini
# /etc/systemd/system/notify-failed@.service
[Unit]
Description=Log a failure for %i

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo "ALERT: %i failed on $(hostname), see: journalctl -u %i" | systemd-cat -t failure-alert -p err'
```

`%n` in the first file expands to the failing unit's own name, which becomes the argument, and `%i` in the template picks it up, so one `notify-failed@.service` serves every job on the box. On the `systemd-cat` line, `-t` tags the message so you can find it and `-p err` sets the priority. The result:

```bash
journalctl -t failure-alert -o short-iso
```

```text
2026-09-03T22:54:41+00:00 systemd-timers-post failure-alert[3311]: ALERT: flaky.service failed on systemd-timers-post, see: journalctl -u flaky.service
```

Swap the `echo | systemd-cat` for a `curl` to whatever pings your phone and you have cron's `MAILTO`, but per job and without a mail server.

## 10. Your script is not running in your shell

Section 2 showed `HOME` unset and a short `PATH`. It goes further than that, and every item below is something I have seen in a real unit file that did not do what its author thought.

### There is no shell

`ExecStart` is split into words by systemd and executed directly. Pipes, redirects and `&&` are just arguments:

```ini
ExecStart=/bin/echo hello | /usr/bin/tr a-z A-Z
```

```text
hello | /usr/bin/tr a-z A-Z
```

That printed the pipe. If you need shell syntax, ask for a shell: `ExecStart=/bin/sh -c 'echo hello | tr a-z A-Z'` printed `HELLO`. Better still, put anything longer than one command in a script file and point `ExecStart` at the script, which is what Section 1 did.

### No tilde, no globs

`~` stays a literal `~` and `*` stays a literal `*`, for the same reason: those are shell features.

### `$` means something to systemd first

systemd does its own variable expansion on `ExecStart` before your command runs, and it has rules that are almost, but not quite, the shell's. I tested every spelling against `Environment=NAME=keith`:

```text
ExecStart=/bin/echo bare: $NAME          ->  bare: keith
ExecStart=/bin/echo braces: ${NAME}      ->  braces: keith
ExecStart=/bin/echo quoted: "$NAME"      ->  quoted: keith
ExecStart=/bin/echo doubled: $$NAME      ->  doubled: $NAME
ExecStart=/bin/sh -c 'echo shell: $NAME' ->  shell: keith
```

`$$` is how you get a literal dollar through to your command. Where this bites is shell constructs that systemd half understands: I wrote `${#SECRET_TOKEN}` inside an `sh -c` to print a length, systemd saw `${...}`, looked for a variable literally named `#SECRET_TOKEN`, and substituted nothing. The output was silently empty. Plain `$SECRET_TOKEN` inside the quotes made it through to the shell and worked.

### `%` means something to systemd too

Percent signs in unit files are specifiers: `%n` is the unit name, `%H` the hostname, `%u` the user, `%T` the temp directory. So this:

```ini
ExecStart=/bin/sh -c 'echo "daily job ran at $(date +%T)"'
```

logs `daily job ran at /tmp`, because `%T` became `/tmp` before `date` ever saw it. I did this in my own test unit and stared at it for a minute. Double it, `%%T`, and `date` gets its `%T` back.

### Set the environment on purpose

The useful knobs, together:

```ini
[Service]
Type=oneshot
User=keith
WorkingDirectory=/home/keith
EnvironmentFile=/etc/hello.env
ExecStart=/bin/sh -c 'echo "user=$(id -un) pwd=$(pwd) token=$SECRET_TOKEN"'
```

```text
user=keith pwd=/home/keith token=abc123
```

`User=` runs the job as someone other than root, which most jobs should. `WorkingDirectory=` matters because the default is `/`. `EnvironmentFile=` reads `KEY=value` lines from a file, which is where a token or a password belongs, in a root owned file with mode 600, and not in the unit file that `systemctl cat` will happily print to anyone. The restic post's `Environment=HOME=/root` line exists precisely because of the `HOME is: unset` result from Section 2, restic wanted a home directory for its cache, and a system service does not get one for free.

## 11. When the job takes longer than the interval

What if the timer fires again while the previous run is still going? I gave a service a hundred second `sleep` and a timer that fires every minute:

```text
2026-09-03T22:55:00+00:00 slow start
2026-09-03T22:56:40+00:00 slow end
2026-09-03T22:56:40+00:00 slow start
```

No second copy started at 22:56:00. Starting a service that is already running does nothing, and what my log shows is the 22:56 trigger waiting behind the running job and firing the instant it finished, at 22:56:40. You get at most one instance at a time, which is exactly right for a backup. If you want a fixed gap between runs instead of a fixed clock time, `OnUnitActiveSec` from Section 8 counts from the last start, so a slow run simply pushes the next one back.

## 12. Testing without waiting until 03:30

The service is a normal unit, so the way to test a nightly job is to run it now:

```bash
systemctl start backup.service
journalctl -u backup.service -n 20
```

That runs the exact command, as the exact user, with the exact environment the timer will use. It is a much better test than running the script from your shell, because your shell has a `HOME` and a full `PATH` and Section 10 happens.

For a one off "run this in twenty seconds" or "at 03:30 tonight only" there is `systemd-run`, which creates a temporary timer and service without any files:

```bash
systemd-run --on-active=20s --unit=oneoff /bin/sh -c 'echo "oneoff fired at $(date +%T)"'
systemctl list-timers oneoff.timer
```

```text
Running timer as unit: oneoff.timer
Will run service as unit: oneoff.service
NEXT                        LEFT LAST PASSED UNIT         ACTIVATES
Thu 2026-09-03 22:58:29 UTC  19s -         - oneoff.timer oneoff.service
```

`--on-calendar="*-*-* 03:30:00"` gives you the calendar flavour. The transient timer fires, the output lands in `journalctl -u oneoff.service`, and then the units disappear on their own. It is `at`, without installing `at`.

## 13. Timers for a normal user

Everything so far went in `/etc/systemd/system/` as root. A normal user gets their own systemd, with its own units in `~/.config/systemd/user/`, driven by `systemctl --user`. Same file format, no `sudo`, and the jobs run as you. The catch is what happens when you log out.

I created `note.timer` and `note.service` as user `keith`, logged in over SSH, enabled the timer, and logged out:

```bash
systemctl --user daemon-reload
systemctl --user enable --now note.timer
systemctl --user list-timers note.timer
```

```text
Created symlink '/home/keith/.config/systemd/user/timers.target.wants/note.timer' → '/home/keith/.config/systemd/user/note.timer'.
Thu 2026-09-03 23:05:00 UTC 46s - - note.timer note.service
```

Seventy five seconds later, from root:

```bash
systemctl is-active user@1000.service
journalctl _UID=1000 --since "-2min" | grep "user timer"
```

```text
inactive
```

Nothing ran. A user's systemd instance is `user@<uid>.service`, and by default it starts when the user logs in and stops when their last session ends, taking every user timer down with it. The fix is one command, run once, by root or by the user themselves:

```bash
loginctl enable-linger keith
```

Lingering keeps `user@1000.service` up with no session at all. Same timer, same enable, log out, and this time:

```text
2026-09-03T23:06:00+00:00 systemd-timers-post sh[2375]: user timer ran as keith at 23:06:00
```

The user reads their own runs with `journalctl --user -u note.service`, and root can see them with `journalctl _UID=1000`. One trap for anyone administering this from root: `sudo -iu keith systemctl --user ...` does not work. It fails with `Failed to connect to user scope bus`, because `sudo` does not set up the session environment the user manager needs. Log in as the user properly. The error message suggests `--machine=keith@.host --user` as a way for root to reach the user's manager directly, which I have not tried.

## 14. Changing one of Ubuntu's own timers

You will eventually want `apt-daily.timer` to run at 04:00 instead of somewhere in a twelve hour window, or `fstrim` on a Sunday. Do not edit the file under `/usr/lib`, the next package update will overwrite it. Add an override:

```bash
systemctl edit apt-daily.timer
```

That opens an editor on a new file, `/etc/systemd/system/apt-daily.timer.d/override.conf`, which systemd merges over the original. systemd calls that file a drop-in, and it is the word in the warning from Section 3. I tested this from a session with no terminal, where `systemctl edit` refuses to run, so I wrote the same file by hand and ran `daemon-reload`, which is all `edit` does for you. Here is the one that pins the apt check to 04:00:

```ini
[Timer]
OnCalendar=
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=0
```

The blank `OnCalendar=` line is not a typo and it is the part everyone misses. `OnCalendar` is a list setting, and a drop-in that supplies another one **adds** a time rather than replacing it. I checked: without the blank line, `systemctl show apt-daily.timer -p TimersCalendar` still listed the original `06,18:00` alongside my `04:00`, so apt would have run three times a day. An empty assignment clears the list first.

`systemctl cat apt-daily.timer` now shows both files, original and override, which is how you can always tell what is actually in effect. `systemctl revert apt-daily.timer` deletes the override and puts things back.

## Gotchas worth knowing

**Edits do nothing until `daemon-reload`.** `start` prints a warning and runs the old definition anyway. Make the reload part of saving the file.

**Enable the timer, not the service.** A service with no `[Install]` section refuses to be enabled, which is the right outcome. A service you gave `WantedBy=multi-user.target` runs at every boot on top of its schedule.

**It fires up to a minute late by default.** `AccuracySec=1min`. Set `AccuracySec=1s` when the minute matters. Measured drift on the default was between four and twenty seven seconds.

**Without `Persistent=true`, a run missed during downtime is gone.** With it, the job runs within seconds of the next boot. It does not fire on first enable, only for runs it can prove were missed.

**`%` and `$` belong to systemd.** `%T` became `/tmp` in my `date` format and `${#VAR}` became nothing. Double them, `%%` and `$$`, to pass them through.

**No shell, no `HOME`, five entry `PATH`, working directory `/`.** Wrap shell syntax in `/bin/sh -c`, set `Environment=HOME=` if a tool wants one, and set `WorkingDirectory=` if the script assumes one.

**`status=3/NOTIMPLEMENTED` just means exit code 3.** The word is systemd's name for that code from the LSB table and has nothing to do with your script.

**A drop-in `OnCalendar=` adds a schedule.** Put an empty `OnCalendar=` above the new one to replace instead.

**User timers die at logout** unless `loginctl enable-linger <user>` has been run once. And `sudo -iu user systemctl --user` cannot reach the user manager at all.

**A typo in `OnCalendar` stops the timer from loading and says so quietly.** `systemd-analyze verify` on the file, or `systemd-analyze calendar` on the expression, before you enable.

## Quick reference

| Task | Command |
| --- | --- |
| Pick up an edited unit file | `systemctl daemon-reload` |
| Turn a timer on, now and at boot | `systemctl enable --now job.timer` |
| See every timer and when it next fires | `systemctl list-timers --all` |
| Last run and next run of one timer | `systemctl status job.timer` |
| Run the job right now, timer or not | `systemctl start job.service` |
| Read the job's output | `journalctl -u job.service -o short-iso` |
| Follow it live | `journalctl -u job.service -f` |
| Since last boot only | `journalctl -u job.service -b` |
| What does this schedule mean | `systemd-analyze calendar "Mon..Fri 09:00" --iterations=3` |
| Check a unit file before enabling | `systemd-analyze verify /etc/systemd/system/job.timer` |
| Show the file, plus any overrides | `systemctl cat job.timer` |
| Every unit currently in a failed state | `systemctl list-units --failed` |
| Clear a failed state | `systemctl reset-failed job.service` |
| One off run in twenty seconds | `systemd-run --on-active=20s --unit=oneoff /path/to/cmd` |
| Override a vendor timer | `systemctl edit apt-daily.timer` |
| Undo the override | `systemctl revert apt-daily.timer` |
| User timers survive logout | `loginctl enable-linger <user>` |
| Where the missed run stamps live | `/var/lib/systemd/timers/stamp-*.timer` |

The pair of files I now start every new job from, with everything above baked in:

```ini
# /etc/systemd/system/job.service
[Unit]
Description=What this job does

[Service]
Type=oneshot
User=someone
WorkingDirectory=/where/it/expects/to/be
EnvironmentFile=/etc/job.env
ExecStart=/usr/local/bin/job.sh
```

```ini
# /etc/systemd/system/job.timer
[Unit]
Description=When it runs

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
```

`daemon-reload`, `enable --now job.timer`, `start job.service` once to prove it works, and then leave it alone. That last step is the whole point. `[ timer armed ]`
