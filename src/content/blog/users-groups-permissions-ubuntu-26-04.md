---
title: 'Users, groups, and file permissions on Ubuntu, explained by one broken bind mount'
description: 'chmod, chown, setgid, ACLs, and umask in one place, built around the case that sends everyone to search: a Docker container writing files into a bind mount as a user that does not exist on the host. Tested on Ubuntu 26.04, including what uutils chmod changed.'
pubDate: 'Sep 5 2026'
heroImage: '../../assets/perms-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Linux', 'Permissions', 'chmod', 'ACL', 'Docker', 'SysAdmin']
---

Every Linux permissions guide explains the `rwxr-xr-x` bits, draws the owner, group, and other diagram, and stops right before the part you actually get stuck on. The part that gets you is not what `chmod 644` means. It is the case where a Docker container writes files into a folder you own and you cannot delete them, owned by a user that does not exist on your machine, and the fix needs a corner of the permission model that the diagram never mentions. I put both sudos aside and spent an afternoon reproducing exactly that on a test box until every piece of it made sense.

So this is the permissions post I wanted: the whole model in one place, umask through ACLs, but hung on real cases instead of a truth table. The spine of it is that bind mount, because untangling it needs almost every piece, and once you have seen it go wrong the pieces stop being trivia. Tested on a fresh Ubuntu 26.04 box, which also runs the Rust rewrite of the coreutils, so I will point out where `chmod` and `ls` behave a hair differently than the last decade of guides show.

> **TL;DR.** A file is owned by one user and one group, with `rwx` for owner, group, and other. To enter a directory you need `x` on it, to list it you need `r`, and to delete a file in it you need write on the directory, not the file. Group changes need a fresh login to take effect. A shared writable directory wants the setgid bit plus a default ACL, not just group write. A container writes files as its own numeric UID, which on the host is whatever user has that number, so line the UIDs up with `-u`, or grant the container's UID access with `setfacl`. On 26.04, `chmod` and `ls` are the uutils Rust builds and a few error messages read differently.

## Contents

- [The model in one paragraph](#the-model-in-one-paragraph)
- [Making a user, and the useradd footgun](#making-a-user-and-the-useradd-footgun)
- [umask, or why your files are 664 sometimes and 644 other times](#umask-or-why-your-files-are-664-sometimes-and-644-other-times)
- [Groups, and the two ways to lose your own sudo](#groups-and-the-two-ways-to-lose-your-own-sudo)
- [chmod, and the recursive command that breaks a tree](#chmod-and-the-recursive-command-that-breaks-a-tree)
- [chown, and the symlink that eats it](#chown-and-the-symlink-that-eats-it)
- [A directory two people can write to](#a-directory-two-people-can-write-to)
- [The ACL mask trap](#the-acl-mask-trap)
- [The broken bind mount](#the-broken-bind-mount)
- [What uutils changed](#what-uutils-changed)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)

## The model in one paragraph

Every file has an owner, a group, and three sets of `rwx` bits, for the owner, for members of the group, and for everyone else. `ls -l` reads left to right: type, then owner bits, then group bits, then other bits. The part people carry a wrong intuition about is directories. On a directory, `x` means "may traverse into it", `r` means "may list the names in it", and write means "may add or remove entries". That last one is the surprise: whether you can delete a file has nothing to do with the file's own permissions or owner. It depends on write access to the directory the file sits in. Hold on to that, because it explains half of what looks like broken permissions later.

## Making a user, and the useradd footgun

There are two tools and they are not the same. `adduser` is the friendly Perl wrapper. `useradd` is the low level binary, and its defaults will catch you.

```bash
$ sudo adduser dave
# creates /home/dave (mode 0750), copies /etc/skel, primary group dave
```

`adduser` makes the home directory, sets a sane shell, copies the skeleton dotfiles, and on Ubuntu also drops the account into the shared `users` group. Now the same account with the raw tool:

```bash
$ sudo useradd erin
$ ls -ld /home/erin
ls: cannot access '/home/erin': No such file or directory
$ getent passwd erin
erin:x:1003:1003::/home/erin:/bin/sh
```

No home directory, and the shell is `/bin/sh`, because `useradd` on its own makes neither and reads its defaults from `/etc/default/useradd`. The account exists, points at a home that is not there, and logs into a bare `sh`. The fix is to ask for the things `adduser` would have done:

```bash
sudo useradd -m -s /bin/bash erin
```

`-m` makes the home and copies skel, `-s` sets the shell. Unless you are scripting bulk user creation, reach for `adduser` and skip the trap entirely. One detail either way: the home directory comes out `0750`, `drwxr-x---`, so other users cannot read into your home. That is Ubuntu's `HOME_MODE`, and it matters later.

## umask, or why your files are 664 sometimes and 644 other times

Here is a thing that looks like a bug and is not. Create a file while logged in over SSH and it is `664`, group writable. Create the same file from a systemd service or a `sudo` command and it is `644`. Same user, same box, different mode. I checked it every way I could get onto the machine:

| How you got there | umask | New file |
| --- | --- | --- |
| SSH login shell | 0002 | 664 |
| `su - dave` | 0002 | 664 |
| a cron job | 0002 | 664 |
| `sudo -u dave` | 0022 | 644 |
| a systemd service (`User=dave`) | 0022 | 644 |

The split is whether you came through a full PAM login. Ubuntu uses user private groups, every user has a personal group as their primary, so a group writable file is not the risk it would be if the group were shared, and `pam_umask` relaxes the umask to `0002` for real logins. Paths that skip that PAM session, `sudo` and systemd units, keep the stock `0022`. This is exactly why a file your service writes is `644` and the same file you touch over SSH is `664`, and why a shared directory can seem to work interactively and then not from the service that actually runs the job. If you need a specific mode regardless of how the process was started, set it in the unit or the script rather than trusting the ambient umask.

## Groups, and the two ways to lose your own sudo

Add a user to a group with `-aG`. The `-a` means append, and leaving it off is the classic way to lock yourself out of your own admin rights:

```bash
sudo usermod -aG devs erin      # add erin to devs, keep her other groups
sudo usermod -G devs erin       # DON'T: replace ALL her groups with just devs
```

That second line does exactly what it says and replaces her entire supplementary group list. I ran it on a user who was in `sudo`, and afterwards she was in `devs` and nothing else. Her admin access was gone because `sudo` was no longer in the list. `gpasswd -a user group` and `gpasswd -d user group` are the safer add and remove, one group at a time, no way to blow away the rest.

The second trap is quieter, because nothing errors. Group membership is baked into your session at login. Add yourself to a group while you have a shell open and that shell does not see it:

```bash
$ sudo usermod -aG docker dave
$ id -nG            # in dave's existing session
dave users devs     # no docker
```

The change is real, it is in `/etc/group`, but the running session was stamped with the old group list when it started. You have to log out and back in, or start a fresh session, before the new group counts. Half the "I added myself to the docker group and it still says permission denied" threads are this and nothing more. `newgrp docker` opens a subshell with the group applied if you cannot log out right then.

## chmod, and the recursive command that breaks a tree

`chmod` takes numbers or symbols. `chmod 640 file` and `chmod u=rw,g=r,o= file` are the same thing. The one that ruins an afternoon is recursive chmod on a directory tree:

```bash
$ chmod -R 644 mydir
$ ls -ld mydir
drw-r--r-- 2 dave dave 4096 mydir
```

`644` has no execute bit, and you just stripped `x` off the directory itself. Now nobody can `cd` into it or read a file through it, because traversing a directory needs `x`. You meant "make the files readable" and you made the whole tree unreachable. The fix is the capital `X`, which means "execute, but only for directories and for files that already had execute":

```bash
chmod -R a+X mydir      # restores x on dirs, leaves plain files alone
```

Capital `X` is the single most useful thing in `chmod` and almost nobody is taught it. Use `644` for files and `755` for directories, or use `a+X` after the fact, but never `-R 644` on anything with a directory in it.

The traverse rule is worth seeing on its own, because it explains a whole class of "permission denied". A directory with `r` but no `x` lets you list the names and read nothing:

```bash
$ chmod 644 noexec        # r, no x
$ cat noexec/f
cat: noexec/f: Permission denied
```

And the reverse, `x` but no `r`, lets you open a file if you already know its name but not list the directory. When a path fails somewhere in the middle and you cannot tell which component, `namei -l` walks the whole path and prints the mode of every piece:

```bash
$ namei -l /srv/lab/noexec/f
 drwxr-xr-x root root /
 drwxr-xr-x root root srv
 drwxr-xr-x root root lab
 drwx------ root root noexec      <- this is the one blocking you
 -rw-r--r-- dave dave f
```

## chown, and the symlink that eats it

`chown user file`, `chown :group file`, `chown user:group file`. Straightforward until a symlink is in the picture:

```bash
$ chown erin link            # link -> file
$ ls -l file
-rw-r--r-- 1 erin root file   # it changed the TARGET, not the link
```

By default `chown` follows a symlink and changes what it points at, not the link itself. To change the link's own ownership you need `-h`. This bites hardest with `chown -R` over a tree that contains a symlink to somewhere important, though the recursive form is more careful than you might fear: I pointed a symlink at `/etc/hostname` inside a tree and `chown -R dave` left `/etc/hostname` untouched, because recursive chown does not follow symlinks out of the tree by default. Still, on a single symlink, remember that plain `chown` reaches through it.

## A directory two people can write to

This is where the simple model runs out, and it is the setup behind most real permission pain: a directory that two users, or a user and a service, both need to write to. Group write alone does not do it, and watching it fail is the fastest way to learn why.

Start the obvious way. Make a `devs` group, put both users in it, and give the directory group write plus the setgid bit:

```bash
sudo chgrp devs shared
sudo chmod 2775 shared        # the 2 is setgid
```

The setgid bit on a directory means new files inside inherit the directory's group instead of the creator's primary group. That part works: dave creates a file in `shared` and it comes out group `devs`, not group `dave`. But now erin, who is also in `devs`, tries to edit that file:

```bash
$ echo hi >> shared/by-dave
bash: shared/by-dave: Permission denied
```

Setgid fixed the group. It did nothing about the mode. Dave's file was created `644`, `rw-r--r--`, so the group has read and not write, and erin is blocked. Setgid is necessary and not sufficient. The piece that finishes the job is a default ACL, which sets the permissions new files are born with:

```bash
sudo setfacl -m g:devs:rwx shared        # devs can use the directory now
sudo setfacl -d -m g:devs:rwx shared     # AND every new file gets devs:rwx
```

The `-d` is the default entry, the template applied to anything created inside. With it in place, a new file in `shared` is born with `group:devs:rwx`, and erin can write to dave's files and dave to hers. Setgid for the group, default ACL for the mode. That pair is the actual recipe for a shared directory, and it is the part every "just chmod 775 it" answer leaves out.

You can see the ACL on a file as a `+` at the end of the `ls -l` mode string, and read it with `getfacl`.

## The ACL mask trap

Once ACLs are in play there is one footgun that will convince you they are broken. Every ACL has a mask that caps the effective permissions of the group and named entries. And `chmod` on the group bits does not edit the group, it edits the mask:

```bash
$ setfacl -m u:erin:rw file      # give erin read/write
$ chmod g-w file                 # "tighten the group a little"
$ getfacl file
user:erin:rw-    #effective:r--   <- erin's write is now masked off
mask::r--
```

That `chmod g-w` looked like it touched the group. It lowered the mask to `r--`, and the mask caps every named ACL entry, so erin's carefully granted write is now effective read only. Nothing warns you. The rule to remember: once a file has ACLs, adjust them with `setfacl`, not `chmod`, because `chmod` on the middle bits silently rewrites the mask and can switch off entries you set on purpose. And note `mv` versus `cp` here too. `mv` into a directory keeps the file's original permissions and ignores the directory's default ACL, while `cp` creates a new file that inherits the defaults. Move a file into your carefully set up shared directory and it does not pick up the shared permissions.

## The broken bind mount

Now the case that started all this. You run a container and mount a host directory into it:

```bash
docker run --rm -v /srv/app:/data myimage
```

The container writes to `/data`, and the files show up in `/srv/app` on the host owned by a user you have never heard of, or you cannot write to the directory the container made. Here is the whole mechanism, because once it clicks every variant of this is obvious.

A process inside a container has a numeric UID, and a bind mount is not namespaced, so that number lands on the host as is. There is no translation. If the container runs as root, uid 0, its files are owned by uid 0 on the host, which is root. If the image runs as its own service user, say uid 5555, the files are owned by uid 5555 on the host, and on the host that number is either some unrelated account or nobody at all:

```bash
$ docker run --rm -v /srv/app:/data alpine touch /data/from-root
$ ls -ln /srv/app
-rw-r--r-- 1 0 0 0 from-root      # uid 0 = root, on the host
```

The mirror image is worse, because it fails silently, straight to permission denied. Your `/srv/app` is owned by dave, `0750`, so only dave has any access. A container running as uid 5555, or as `www-data` which is 33, or as uid 1000 which on this box is not even dave, has no rights to it:

```bash
$ docker run --rm -v /srv/app:/data -u 5555:5555 alpine touch /data/x
touch: /data/x: Permission denied
```

The container's user is a number the host directory does not recognize. There are three real fixes, and which one you want depends on who else needs the files.

**Run the container as the host owner.** If the files should belong to dave, tell the container to be dave:

```bash
docker run --rm -v /srv/app:/data -u $(id -u dave):$(id -g dave) myimage
```

Now the container writes as dave's UID, the files come out owned by dave, and everything is tidy. This is the cleanest fix when one host user owns the data.

**Chown the directory to the container's UID.** If the container must run as its own uid 5555, hand the directory to that number:

```bash
sudo chown 5555:5555 /srv/app
```

The container can write now, but so long as it is `0750` dave can no longer read it, because dave is not 5555. You traded one exclusion for another. Fine when only the container touches the data, wrong when a human needs it too.

**Grant the container's UID with an ACL.** When both a host user and the container need in, this is the one that actually works. Leave the directory owned by dave and add the container's UID as an ACL entry, defaulted so new files carry it:

```bash
sudo setfacl -m u:5555:rwx -m d:u:5555:rwx /srv/app
```

Dave still owns and reads the directory, uid 5555 inside the container can write, and new files carry the entry so it keeps working. The bind mount was never really a Docker problem. It was a UID problem wearing a Docker costume, and the same directory, setgid, and ACL tools from the shared directory section are what solve it. Named volumes sidestep the whole thing by living under `/var/lib/docker/volumes` owned by root, which is why "just use a named volume" is common advice, but the moment you bind mount a real host path you are back to lining up UIDs.

## What uutils changed

Ubuntu 26.04 ships most of coreutils as [uutils](https://uutils.github.io/), the Rust reimplementation, so `chmod`, `chown`, `ls`, `stat`, and `id` are new builds. For permission work the behavior is the same, but a few messages read differently and will throw you if you are matching against an old guide or a script:

- A bad mode says `chmod: invalid digit found in string`, which is Rust's error text, where GNU said `invalid mode`.
- A denied change says `Operation not permitted (os error 1)`, with that `os error 1` suffix GNU never printed.
- `ls -l` still shows the `+` for a file with an ACL, but jams it against the link count with no space, `-rw-rw-r--+1 root devs`, which looks like a typo and is just uutils rendering.

`chmod -c`, `chmod -v`, `chmod --reference`, and the capital `X` mode all work exactly as before. `getfacl`, `setfacl`, and `namei` are still the util-linux and acl tools, untouched by the Rust switch. So the concepts carry over whole. It is only a couple of error strings and one cosmetic `ls` quirk that are new, and now they will not stop you.

## Gotchas worth knowing

- **Deleting a file is a directory permission.** You can delete a file you do not own and cannot write, if you can write the directory it lives in. The sticky bit, the `t` on `/tmp`, exists precisely to switch that off so users only delete their own files in a shared directory.
- **`chmod -R 644` makes a tree unreachable.** No `x` on the directories. Use `a+X` to put it back.
- **`usermod -G` without `-a` replaces every group.** It is how people delete their own sudo. Use `-aG`, or `gpasswd`.
- **New group membership needs a fresh login.** The running shell keeps the groups it started with. This is the docker-group thread, every time.
- **On an ACL'd file, `chmod` edits the mask, not the group.** It can silently switch off entries. Use `setfacl`.
- **`mv` keeps old permissions, `cp` inherits the directory's defaults.** Moving a file into a shared directory does not give it the shared permissions.
- **A container's UID is a host UID.** No remapping on a bind mount. Line them up with `-u`, or grant the number with `setfacl`.

## Quick reference

| Job | Command |
| --- | --- |
| Make a user properly | `sudo adduser dave` |
| Add to a group, keep the rest | `sudo usermod -aG devs dave` |
| See a process's real groups now | `id -nG` |
| Fix a tree broken by `chmod -R` | `chmod -R a+X mydir` |
| Debug a path that denies you | `namei -l /path/to/file` |
| Shared writable directory | `chmod 2775 dir && setfacl -d -m g:devs:rwx dir` |
| Read the ACL | `getfacl dir` |
| Container writes as you | `docker run -u $(id -u):$(id -g) ...` |
| Let a container UID into a host dir | `setfacl -m u:5555:rwx -m d:u:5555:rwx dir` |
| Find orphaned files after deleting a user | `find /home -nouser` |

The permission bits are the easy part, and every guide gets you that far. The parts that actually cost time are the ones the diagram skips: that deleting is a directory right, that a shared directory needs setgid and a default ACL together, that `chmod` reaches into the ACL mask, and that a container is just a UID the host has to recognize. None of it is arcane once you have watched it break. It is one model, and the bind mount touches nearly all of it, which is why it is the thing I keep coming back to when something owned by nobody shows up in a folder I thought was mine.

`[ it is always a UID ]`
