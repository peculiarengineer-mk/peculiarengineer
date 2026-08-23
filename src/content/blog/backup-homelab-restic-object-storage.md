---
title: 'Backing up a homelab with restic'
description: 'A backup nobody has restored is a rumor. Set up restic against object storage, and see three runs where copying a live SQLite file corrupted the restore between 9 and 19 times out of 20, why Postgres survives the same treatment, and why forget without prune reclaims nothing.'
pubDate: 'Aug 23 2026'
heroImage: '../../assets/restic-backup-hero.png'
tags: ['Backup', 'restic', 'Linux', 'Ubuntu', 'SelfHosted', 'Homelab', 'systemd', 'SQLite', 'PostgreSQL', 'SysAdmin']
---

I have written a lot here about running things at home and almost nothing about not losing them, which is a strange gap for someone who keeps telling you to [self host your own Git server](/blog/self-host-forgejo-tailscale-docker-compose/). So I sat down to work out how backups should actually be done, rather than how I had been vaguely assuming they were done.

The tool part turned out to be the easy half. The half that surprised me is that the obvious approach, point a backup tool at your data directory and let it run every night, produces a broken restore most of the time if anything in there is a database. I have numbers on that below, and they changed the shape of this post while I was writing it.

The whole thing is built around one idea. **A backup nobody has restored is a rumor.** So the restore comes first here, and everything else exists to make that restore possible.

> **TL;DR.** Use restic, pointed at object storage you already pay for. The repository password is the backup: lose it and the data is gone with no recovery path, so store it somewhere separate from the machine. Never back up live database files. Dump them first, `VACUUM INTO` for SQLite and `pg_dump` for Postgres, then back up the dumps. Do not use SQLite's `.backup` on a busy database: it either fails instantly leaving a zero byte file or spins forever. Run it from a systemd timer, not cron. `forget` drops snapshots from the index and reclaims **no space at all**, `prune` is what actually frees it, and you need both. Then test a restore onto a machine that has never seen the data.

## Contents

- [Why restic](#why-restic)
- [Before you start](#before-you-start)
- [The password is the backup](#the-password-is-the-backup)
- [1. Create the repository](#1-create-the-repository)
- [2. Decide what to back up](#2-decide-what-to-back-up)
- [3. The part that will quietly break you](#3-the-part-that-will-quietly-break-you)
- [4. Dump the databases first](#4-dump-the-databases-first)
- [5. The backup script](#5-the-backup-script)
- [6. Run it from a systemd timer](#6-run-it-from-a-systemd-timer)
- [7. Retention, and why forget is not enough](#7-retention-and-why-forget-is-not-enough)
- [8. The restore, which is the whole point](#8-the-restore-which-is-the-whole-point)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## Why restic

One static binary, no daemon, no database of its own. It encrypts on your machine before anything leaves it, deduplicates across snapshots so the tenth backup of a 200 GB directory is not 2 TB, and it speaks S3 natively so it can point straight at object storage without a helper.

The alternatives, briefly, because I did look. **Borg** is excellent and has been around longer, but it has no native object storage support, so you end up mounting your bucket with rclone and now your backup depends on a FUSE mount behaving. **Kopia** is genuinely good and slightly nicer to use, just younger with less production mileage. **rsync** is not a backup, it is a file copy: no history, no integrity checking, and it will happily replicate your corruption over the good copy.

For a homelab where the destination is a bucket, restic is the boring correct answer.

## Before you start

Everything here is on Ubuntu 26.04, and everything from here runs as root, which is also how the timer will run it. Drop into a root shell with `sudo -i` and the commands below are exactly what you type.

Install the two tools the post assumes, because neither is on a stock server:

```bash
apt update
apt install -y restic sqlite3
restic version
```

`sqlite3` is the command line client, and you need it even if the application that owns the database bundles its own copy. If you are backing up Postgres in a container, `pg_dump` runs inside that container so there is nothing extra to install for it.

Make the directory the dumps land in now, because several commands below write into it:

```bash
mkdir -p /srv/dumps
```

## The password is the backup

Before anything else, because `restic init` says it and people scroll past:

```text
Please note that knowledge of your password is required to access
the repository. Losing your password means that your data is
irrecoverably lost.
```

That is not boilerplate. There is no recovery, no support email, no key escrow. Encrypted with a password you do not have is identical to deleted.

So the password goes somewhere that is not the machine being backed up. A password manager, a piece of paper, another machine. Backing up your password manager's vault into the same restic repository, which I nearly did while setting this up, is a circle with no way in.

On the box it lives in a file only root can read, so it stays out of your shell history and out of `ps`:

```bash
install -m 600 /dev/null /root/.restic-password
read -rs -p 'passphrase: ' P && printf '%s' "$P" > /root/.restic-password && unset P
```

`read -rs` rather than putting the passphrase on the command line, because a command line ends up in `.bash_history` and in `ps` while it runs, which are the two places this file exists to keep it out of.

## 1. Create the repository

I am using Hetzner Object Storage because I already have a bucket there. Any S3 compatible storage works the same way.

Credentials and repository location go in an environment file, root readable only:

```bash
install -m 600 /dev/null /etc/restic.env
```

```bash
# /etc/restic.env
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export RESTIC_REPOSITORY="s3:https://nbg1.your-objectstorage.com/your-bucket/homelab"
export RESTIC_PASSWORD_FILE="/root/.restic-password"
```

The repository URL is worth reading carefully. It is `s3:` then the **full endpoint URL including https**, then the bucket, then a prefix. That prefix matters: it lets one bucket hold several unrelated repositories without them colliding.

Then initialize it once:

```bash
set -a; . /etc/restic.env; set +a
restic init
```

**✅ You should see** the password warning quoted above, followed by a line naming the repository it made:

```text
created restic repository 461094b21b at s3:https://nbg1.your-objectstorage.com/your-bucket/homelab
```

## 2. Decide what to back up

The instinct is to back up everything. Resist it, because a backup you cannot afford to run daily is a backup you will turn off.

What actually needs to be in there:

- **Application data.** Docker volumes and bind mounts, whatever `/srv` or `/opt` holds for you.
- **Database dumps**, which is section 4 and the reason this post exists.
- **`/etc`.** Small, and it is every decision you made about this machine. Restoring config from memory at 2 a.m. is how you discover you had forgotten three of them.
- **The list of what was installed.** `dpkg --get-selections` into a file.

What does not need to be in there: package caches, anything under `/proc`, `/sys` or `/tmp`, and the backup repository itself if you keep a local one. Docker **images** do not need backing up either, because they come back from a registry.

Docker **volumes** are a trap here, and worth being precise about. I use bind mounts, so my container data sits under `/srv` and gets picked up by the paths above. If you use named volumes instead, which is the more common pattern, that data lives in `/var/lib/docker/volumes` and nothing above touches it. Either add that path to the backup or move to bind mounts. Skipping `/var/lib/docker` wholesale, which is the usual advice and which I very nearly wrote here, would leave you with a backup containing none of your actual data.

## 3. The part that will quietly break you

Here is the experiment that changed this post.

I set up a box with two databases being written to continuously: one in WAL mode, one in the older rollback journal mode, which is still SQLite's default. Which mode your applications use is worth checking rather than assuming, with `sqlite3 yourapp.db 'PRAGMA journal_mode;'`, because as you will see it changes the odds a lot. Then I backed up their files live with restic, restored them, and asked SQLite whether the restored copy was intact.

The first run came back clean. `integrity_check: ok`. If I had stopped there, this section would have said live backups are fine.

So I ran it ten more times, and then twice more on different machines with different write patterns. Here is the third run, which is the one I would have least expected:

```text
run  wal          journal
  1  malformed    malformed
  2  malformed    ok
  3  malformed    malformed
  4  malformed    malformed
  5  malformed    malformed
 ...
 10  malformed    malformed

WAL failures:     10/10
JOURNAL failures: 9/10
TOTAL:            19/20
```

`malformed` there is SQLite's own verdict on the restored file:

```text
Error: stepping, database disk image is malformed (11)
```

Three runs, three answers:

| Run | Rollback journal | WAL | Total |
|---|---|---|---|
| First machine, single row inserts | 8 of 10 corrupt | 3 of 10 | 12 of 20 |
| Second machine, moderate load | 9 of 10 corrupt | 0 of 10 | 9 of 20 |
| Third machine, batched transactions | 9 of 10 corrupt | 10 of 10 | 19 of 20 |

**That spread is the finding, not any one number.** Rollback journal mode is reliably terrible, around nine times in ten every time I tried. WAL mode ranged from never failing to failing every single time, depending on nothing more than how the writes were shaped. On the run where WAL never broke I could easily have concluded WAL mode is safe, published that, and been wrong.

So the useful statement is not a percentage. It is that a live file copy of a SQLite database restores to a corrupt file often, unpredictably, and in a way you cannot measure once and trust. It works just enough of the time to convince you.

**Postgres behaved differently.** Five of five live data directory restores came back working, every one crash recovering on startup:

```text
LOG:  database system was not properly shut down; automatic recovery in progress
LOG:  redo starts at 0/1917A20
LOG:  database system is ready to accept connections
```

Which makes sense once you say it out loud: a file level copy of a running Postgres looks exactly like someone pulled the power out, and surviving that is a thing Postgres is specifically built to do. I could not break it.

I am still going to tell you not to do it, for two reasons that have nothing to do with superstition. Upstream does not sanction copying a running cluster, because a busy one can be captured mid page write in a way a small test database never will be. And the dump of that same database was **19.6 MB against a 225 MB live data directory**. Eleven times smaller, portable between versions, and blessed by the people who wrote it.

## 4. Dump the databases first

The correct approach costs almost nothing, which removes the last excuse.

**SQLite.** The obvious command is `.backup`, SQLite's own online backup, and it is what I recommended here until I tested it properly:

```bash
time sqlite3 /srv/app/data/app.db ".backup /srv/dumps/app.db"
```

```text
real    0m0.089s
```

Eighty nine milliseconds, passes `integrity_check`, lovely. On an **idle** database.

Point it at a database that is actually being written to and it stops being lovely, because the SQLite backup API restarts from page zero every time an external writer commits. I hit two different failure modes on two different machines with the same command.

On one, it gave up instantly and left a file behind:

```text
Error: database is locked
real    0m0.10s
```

```text
-rw-r--r-- 1 root root 0 Aug 23 00:02 b1.db
```

**Zero bytes.** A script that does not check the exit code backs that up and reports success.

On the other, it never finished at all. Under systemd with a 45 second cap:

```text
hang.service: start operation timed out. Terminating.
hang.service: Consumed 44.743s CPU time over 45.016s wall clock time
```

Forty five seconds of pegged CPU producing nothing, on a database of a few tens of megabytes. Without that timeout it spins for as long as writes keep arriving, and `Type=oneshot` means systemd waits patiently forever while your backups quietly stop happening.

Use `VACUUM INTO` instead. It takes one read transaction and writes a clean copy, without restarting when someone else commits:

```bash
time sqlite3 /srv/app/data/app.db "VACUUM INTO '/srv/dumps/app.db';"
```

Same box, same writer hammering it, same moment:

```text
real    0m0.41s
```

```text
integrity: ok
rows:      60412
```

Four tenths of a second, and a file that opens. It needs SQLite 3.27 or newer, which means anything from 2019 onwards, so on 26.04 it is simply there. The output file must not already exist, which is why the script in the next section writes to a temporary name and moves it into place.

**Postgres.** Dump in the custom format so you can restore selectively later:

```bash
docker exec app-pg-1 pg_dump -U postgres -d labdb -Fc -f /tmp/labdb.dump
docker cp app-pg-1:/tmp/labdb.dump /srv/dumps/labdb.dump
```

Then back up `/srv/dumps`, not the live directories.

## 5. The backup script

Everything above, in the order it has to happen: dump first, then back up the dumps.

Save this as `/usr/local/bin/backup.sh` and make it executable, which the next section will fail on if you forget:

The container name and database name below are mine. Change them, or delete those two lines if you have no Postgres.

```bash
#!/bin/bash
# /usr/local/bin/backup.sh
set -uo pipefail
set -a; . /etc/restic.env; set +a

mkdir -p /srv/dumps
failed=0

# Databases first, while everything is still running.
rm -f /srv/dumps/app.db.tmp
sqlite3 /srv/app/data/app.db "VACUUM INTO '/srv/dumps/app.db.tmp';" \
  && mv /srv/dumps/app.db.tmp /srv/dumps/app.db || failed=1

docker exec app-pg-1 pg_dump -U postgres -d labdb -Fc -f /tmp/labdb.dump \
  && docker cp app-pg-1:/tmp/labdb.dump /srv/dumps/labdb.dump || failed=1

# What was installed, so a rebuild is not archaeology.
dpkg --get-selections > /srv/dumps/packages.txt

restic backup /srv/dumps /srv/app /etc \
  --exclude /srv/app/data \
  --tag nightly || failed=1

restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune || failed=1

exit $failed
```

Two decisions in there are deliberate and both came from watching this fail.

**No `-e`.** The obvious version starts `set -euo pipefail`, and I wrote it that way first. The problem is that `set -e` makes a single failed dump abort the entire script, so a stopped Postgres container means restic never runs and **nothing gets backed up that night**, including `/etc` and every file that had nothing to do with Postgres. The version above records the failure, backs up everything it still can, and exits non zero so the timer reports it. A partial backup beats no backup.

**The dump goes to a temporary name and gets moved into place.** If the dump dies halfway, `mv` never happens and yesterday's good copy stays where it is, rather than being replaced by a truncated file that restic will faithfully preserve forever. The `rm -f` before it matters too: `VACUUM INTO` refuses to write to a file that already exists, so a run killed between the vacuum and the move would otherwise fail every night afterwards until somebody deleted the leftover by hand.

**Both restic calls are checked.** This is the one I nearly shipped without. Wrapping only the dumps means a wrong password, an unreachable bucket, or a repository locked by a prune leaves `failed` at zero, the unit green, and no backup taken. Restic's exit codes are specific enough to rely on:

```text
clean run                     exit 0
some files could not be read  exit 0   (snapshot still created)
wrong password                exit 12
repository does not exist     exit 10
```

A file vanishing mid backup, which happens constantly with sockets and pid files, does not fail the run. A broken destination does.

```bash
chmod +x /usr/local/bin/backup.sh
```

The `--exclude /srv/app/data` is the point of section 3: the live database directory is deliberately not in the backup, because the good copy is already in `/srv/dumps`.

## 6. Run it from a systemd timer

Cron works. A timer is better here because it gives you `systemctl status` on the last run, journal output kept with the unit, and `Persistent=true`, which runs a missed job after a machine was off rather than skipping the night.

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Nightly restic backup
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
TimeoutStartSec=30min
Environment=HOME=/root
ExecStart=/usr/local/bin/backup.sh
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run the restic backup nightly

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now backup.timer
systemctl list-timers backup.timer
```

`RandomizedDelaySec` matters more than it looks. Everyone picks a time on the hour, and object storage providers notice.

`TimeoutStartSec` is the backstop for section 4. A `oneshot` service with no timeout will sit in `activating` indefinitely if something inside it wedges, and you find out weeks later. With it set, systemd kills the run and marks the unit `failed`, which is a state you can actually alert on.

Run it once by hand before trusting the schedule:

```bash
systemctl start backup.service
journalctl -u backup.service -n 30 --no-pager
```

## 7. Retention, and why forget is not enough

`restic forget` removes snapshots from the index. `restic prune` removes the data those snapshots referenced. They are separate operations, and running only the first is a very popular way to have a retention policy that does nothing.

Watch what each one does. `restic stats --mode raw-data` reports the size of the repository itself, which works against object storage where `du` does not:

```bash
restic snapshots --compact | tail -1     # 16 snapshots
restic stats --mode raw-data             # 98 MiB

restic forget --keep-last 3
restic snapshots --compact | tail -1     # 3 snapshots
restic stats --mode raw-data             # 98 MiB

restic prune
restic stats --mode raw-data             # 26 MiB
```

Sixteen snapshots became three and **not one byte was freed**. The space came back only after `prune`. So either pass `--prune` to `forget`, as the script above does, or run prune on its own schedule.

One thing that confused me the first time: `--keep-last 3` keeps three snapshots *per group*, and restic groups by host and paths by default. Back up two different path sets and you keep three of each, so the count you land on may be higher than the number you typed.

## 8. The restore, which is the whole point

Everything so far is preparation. This is the only part that proves anything, and it is the part nobody does.

Do it on a machine that has never seen this data, with nothing but the repository URL and the password. That is the actual disaster scenario: the original box is gone.

That machine needs `restic` installed, plus `sqlite3` and Docker if you want to check the dumps the way I do below. A [throwaway cloud box](/blog/disposable-hetzner-lab-opentofu/) is ideal, because you want somewhere with genuinely none of your data on it, and you want to destroy it afterwards.

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export RESTIC_REPOSITORY="s3:https://nbg1.your-objectstorage.com/your-bucket/homelab"
export RESTIC_PASSWORD="..."

restic snapshots
restic restore latest --target /bare --include /srv/dumps
```

Then check what came back, rather than admiring the file listing:

```bash
sqlite3 /bare/srv/dumps/app.db 'PRAGMA integrity_check;'
```

```text
ok
```

and put the Postgres dump into a fresh server to prove it loads:

```bash
docker run -d --name pgr -e POSTGRES_PASSWORD=x postgres:17

# Wait for it. `docker run -d` returns long before Postgres accepts connections,
# and running createdb immediately gives you a confusing socket error.
until docker exec pgr pg_isready -U postgres -q; do sleep 1; done

docker cp /bare/srv/dumps/labdb.dump pgr:/tmp/d.dump
docker exec pgr createdb -U postgres restored
docker exec pgr pg_restore -U postgres -d restored /tmp/d.dump
docker exec pgr psql -U postgres -d restored -tAc 'select count(*) from t;'
```

```text
 1124000
```

Your number will differ, obviously. That it is a number at all is the entire point of the post. Not that the backup ran, that the data came back and could be queried on a machine that had never seen it.

Pulling a single file out of an older snapshot is the other restore worth practicing, because it is the one you will actually use:

```bash
restic snapshots                     # copy an ID from the first column
restic restore <id> --target /tmp/oops --include /etc/fstab
```

And confirm the repository itself is readable, which is a different question from whether the last backup succeeded:

```bash
restic check
```

```text
check snapshots, trees and blobs
no errors were found
```

Put `restic check` on a monthly timer. A repository that cannot be read is not a backup either, and you want to find that out on a Tuesday rather than during a rebuild.

## Gotchas I hit

**A single successful restore proves nothing.** My first live database restore came back clean. Across three machines the same test then failed between nine and nineteen times out of twenty. Test more than once, and test the thing you actually care about.

**`forget` frees no space.** Covered above, and worth repeating because a retention policy that never prunes looks like it is working right up until the storage bill.

**Two backups at once do not collide.** I expected a repository lock error and got two clean snapshots instead, because backups take a non exclusive lock. `prune` is the one that takes an exclusive lock, so the collision you can actually hit is a manual backup landing while the timer is pruning.

**`--unsafe-allow-remove-all` refuses to run bare.** Trying to empty a repository gives you `Fatal: --unsafe-allow-remove-all is not allowed unless a snapshot filter option is specified`, so it needs something like `--host` or `--tag` alongside it.

**Restic reports a warning and still exits zero** when a file vanishes mid backup, which happens constantly with sockets and pid files. `at least one source file could not be read` is worth reading, not worth alerting on.

**Under systemd, restic complains about a cache it cannot find.** `unable to open cache: unable to locate cache directory: neither $XDG_CACHE_HOME nor $HOME are defined`, on every run. It is harmless, it just means no local cache and so slower metadata operations. Set `Environment=HOME=/root` in the service unit to quiet it and get the cache back.

**`backup.service` has no `[Install]` section, on purpose.** It is started by the timer, so `systemctl enable backup.service` is not a thing you want. Enable `backup.timer` instead. `systemctl status backup.service` still works for reading the last run.

**That shrinkage on the first snapshot is compression, not dedup.** 2.7 MiB of files stored as 874 KiB, with no previous snapshot to deduplicate against. Restic creates version 2 repositories now and compresses by default. Dedup is real too, it just needs a second snapshot before it has anything to work with.

## Quick reference

```bash
set -a; . /etc/restic.env; set +a      # load credentials into the shell

restic init                            # once, at the start
restic backup /srv/dumps /etc --tag nightly
restic snapshots                       # what have I got
restic snapshots --compact             # the same, readable

restic restore latest --target /bare                        # everything
restic restore <id> --target /tmp/x --include /etc/hosts    # one file
restic check                                                # is the repo sound

restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

rm -f /srv/dumps/app.db.tmp                                 # VACUUM INTO wants a free path
sqlite3 live.db "VACUUM INTO '/srv/dumps/app.db.tmp';"      # not cp, and not .backup
docker exec pg pg_dump -U postgres -d mydb -Fc -f /tmp/d.dump && docker cp pg:/tmp/d.dump /srv/dumps/
```

I went into this assuming the hard part was picking a tool. The hard part was finding out that the obvious way to back up a database works often enough to fool you. Go and restore something.

`[ restored ✓ ]`
