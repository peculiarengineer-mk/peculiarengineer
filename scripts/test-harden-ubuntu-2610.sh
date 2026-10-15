#!/bin/bash
# guard tests for harden-ubuntu-2610.sh: every bad run must stop at a guard and
# leave the container untouched. the full run needs systemd, so it is not tested
# here; that is the lab acceptance check on a real server.
#
#   scripts/test-harden-ubuntu-2610.sh
#
# needs docker, dev only, nothing in the site build runs it.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! results="$(docker run --rm -v "$PWD/public/scripts:/s:ro" ubuntu:26.10 bash -c '
set -u
groupadd -f sudo
# stubs first on path, a guard that lets a run through shows up in the log
mkdir -p /stub
for c in apt-get ufw sshd systemctl; do
  printf "#!/bin/bash\necho $c >> /stub/log\nexit 42\n" > "/stub/$c"
  chmod 755 "/stub/$c"
done
touch /stub/log
chmod 666 /stub/log
useradd -m -s /bin/bash alice
usermod -aG sudo alice
mkdir -p /home/alice/.ssh
echo "ssh-ed25519 AAAATEST test key" > /home/alice/.ssh/authorized_keys
chown -R alice:alice /home/alice/.ssh
useradd -m -s /bin/bash nokey
usermod -aG sudo nokey
useradd -m -s /bin/bash emptykey
usermod -aG sudo emptykey
mkdir -p /home/emptykey/.ssh
touch /home/emptykey/.ssh/authorized_keys
chown -R emptykey:emptykey /home/emptykey/.ssh
useradd -m -s /bin/bash nosudo
mkdir -p /home/nosudo/.ssh
echo "ssh-ed25519 AAAATEST test key" > /home/nosudo/.ssh/authorized_keys
chown -R nosudo:nosudo /home/nosudo/.ssh
: > /stub/log
su -s /bin/bash alice -c "PATH=/stub:$PATH SUDO_USER=alice bash /s/harden-ubuntu-2610.sh alice" >/dev/null 2>&1
nonroot=$?
nonrootlog=$(wc -l < /stub/log)
: > /stub/log
SUDO_USER=alice PATH=/stub:$PATH bash /s/harden-ubuntu-2610.sh >/dev/null 2>&1
noarg=$?
noarglog=$(wc -l < /stub/log)
: > /stub/log
SUDO_USER=nosuchuser PATH=/stub:$PATH bash /s/harden-ubuntu-2610.sh nosuchuser >/dev/null 2>&1
unknown=$?
unknownlog=$(wc -l < /stub/log)
: > /stub/log
SUDO_USER=nokey PATH=/stub:$PATH bash /s/harden-ubuntu-2610.sh nokey >/dev/null 2>&1
nokeyrc=$?
nokeylog=$(wc -l < /stub/log)
: > /stub/log
SUDO_USER=emptykey PATH=/stub:$PATH bash /s/harden-ubuntu-2610.sh emptykey >/dev/null 2>&1
emptykeyrc=$?
emptykeylog=$(wc -l < /stub/log)
: > /stub/log
SUDO_USER=nosudo PATH=/stub:$PATH bash /s/harden-ubuntu-2610.sh nosudo >/dev/null 2>&1
nosudorc=$?
nosudolog=$(wc -l < /stub/log)
leftover=0
test -e /etc/ssh/sshd_config.d/00-hardening.conf && leftover=$((leftover + 1))
test -e /etc/apt/apt.conf.d/52unattended-reboot && leftover=$((leftover + 1))
: > /stub/log
SUDO_USER=alice PATH=/stub:$PATH bash /s/harden-ubuntu-2610.sh alice >/dev/null 2>&1
positive=$?
echo "nonroot=$nonroot"
echo "nonrootlog=$nonrootlog"
echo "noarg=$noarg"
echo "noarglog=$noarglog"
echo "unknown=$unknown"
echo "unknownlog=$unknownlog"
echo "nokey=$nokeyrc"
echo "nokeylog=$nokeylog"
echo "emptykey=$emptykeyrc"
echo "emptykeylog=$emptykeylog"
echo "nosudo=$nosudorc"
echo "nosudolog=$nosudolog"
echo "leftover=$leftover"
echo "positive=$positive"
')"; then
  echo "FAIL the container did not run"
  exit 1
fi

failures=0
seen=0
while IFS='=' read -r name value; do
  case "$name" in
    nonroot) label="running as a non-root user exits 1"; want=1 ;;
    nonrootlog) label="running as a non-root user runs no commands"; want=0 ;;
    noarg) label="no argument exits 1"; want=1 ;;
    noarglog) label="no argument runs no commands"; want=0 ;;
    unknown) label="an unknown user exits 1"; want=1 ;;
    unknownlog) label="an unknown user runs no commands"; want=0 ;;
    nokey) label="a user with no ~/.ssh/authorized_keys exits 1"; want=1 ;;
    nokeylog) label="a user with no ~/.ssh/authorized_keys runs no commands"; want=0 ;;
    emptykey) label="a user with an empty ~/.ssh/authorized_keys exits 1"; want=1 ;;
    emptykeylog) label="a user with an empty ~/.ssh/authorized_keys runs no commands"; want=0 ;;
    nosudo) label="a user with a key but not in the sudo group exits 1"; want=1 ;;
    nosudolog) label="a user with a key but not in the sudo group runs no commands"; want=0 ;;
    leftover) label="the guards changed nothing in the container"; want=0 ;;
    positive) label="a valid user reaches the first command and the stubs stop it"; want=42 ;;
    *) continue ;;
  esac
  seen=$((seen + 1))
  if [ "$value" = "$want" ]; then
    echo "PASS $label"
  else
    echo "FAIL $label (got $value, want $want)"
    failures=$((failures + 1))
  fi
done <<< "$results"

if [ "$seen" -ne 14 ]; then
  echo "FAIL the container reported $seen results, want 14"
  exit 1
fi

exit "$failures"
