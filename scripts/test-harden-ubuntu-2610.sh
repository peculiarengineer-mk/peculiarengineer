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
useradd -m -s /bin/bash alice
usermod -aG sudo alice
mkdir -p /home/alice/.ssh
echo "ssh-ed25519 AAAATEST test key" > /home/alice/.ssh/authorized_keys
chown -R alice:alice /home/alice/.ssh
useradd -m -s /bin/bash nokey
useradd -m -s /bin/bash nosudo
mkdir -p /home/nosudo/.ssh
echo "ssh-ed25519 AAAATEST test key" > /home/nosudo/.ssh/authorized_keys
chown -R nosudo:nosudo /home/nosudo/.ssh
su -s /bin/bash alice -c "bash /s/harden-ubuntu-2610.sh alice" >/dev/null 2>&1
nonroot=$?
bash /s/harden-ubuntu-2610.sh >/dev/null 2>&1
noarg=$?
bash /s/harden-ubuntu-2610.sh nosuchuser >/dev/null 2>&1
unknown=$?
bash /s/harden-ubuntu-2610.sh nokey >/dev/null 2>&1
nokeyrc=$?
bash /s/harden-ubuntu-2610.sh nosudo >/dev/null 2>&1
nosudorc=$?
leftover=0
test -e /etc/ssh/sshd_config.d/99-hardening.conf && leftover=$((leftover + 1))
test -e /etc/apt/apt.conf.d/52unattended-reboot && leftover=$((leftover + 1))
echo "nonroot=$nonroot"
echo "noarg=$noarg"
echo "unknown=$unknown"
echo "nokey=$nokeyrc"
echo "nosudo=$nosudorc"
echo "leftover=$leftover"
')"; then
  echo "FAIL the container did not run"
  exit 1
fi

failures=0
seen=0
while IFS='=' read -r name value; do
  case "$name" in
    nonroot) label="running as a non-root user exits 1"; want=1 ;;
    noarg) label="no argument exits 1"; want=1 ;;
    unknown) label="an unknown user exits 1"; want=1 ;;
    nokey) label="a user with no ~/.ssh/authorized_keys exits 1"; want=1 ;;
    nosudo) label="a user with a key but not in the sudo group exits 1"; want=1 ;;
    leftover) label="the guards changed nothing in the container"; want=0 ;;
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

if [ "$seen" -ne 6 ]; then
  echo "FAIL the container reported $seen results, want 6"
  exit 1
fi

exit "$failures"
