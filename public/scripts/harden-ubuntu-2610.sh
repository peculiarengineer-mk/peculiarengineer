#!/bin/bash
# one shot hardening for a fresh ubuntu 26.10 server: upgrade, firewall, ssh,
# unattended reboots, fail2ban. usage: sudo bash harden-ubuntu-2610.sh <your-username>
# log in with your ssh key as that user first, and keep that session open.
set -euo pipefail

user="${1:-}"

# never touch ssh unless the named user can still get back in
if [ "$(id -u)" -ne 0 ]; then
  echo "run this as root: sudo bash harden-ubuntu-2610.sh <your-username>"
  exit 1
fi

if [ -z "$user" ] || ! id "$user" >/dev/null 2>&1; then
  echo "give a user that exists: sudo bash harden-ubuntu-2610.sh <your-username>"
  exit 1
fi

if [ "${SUDO_USER:-}" != "$user" ]; then
  echo "run this with sudo from your own ssh login as $user"
  exit 1
fi

home="$(getent passwd "$user" | cut -d: -f6)"

if [ ! -s "$home/.ssh/authorized_keys" ]; then
  echo "no ssh key for $user, add one to $home/.ssh/authorized_keys first"
  exit 1
fi

if ! id -nG "$user" | tr ' ' '\n' | grep -qx sudo; then
  echo "$user is not in the sudo group, run: usermod -aG sudo $user"
  exit 1
fi

# bring the box up to date first
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold

# firewall, ssh stays open on the port sshd uses. minimal images lack ufw
DEBIAN_FRONTEND=noninteractive apt-get -y install ufw
port="$(sshd -T | awk 'tolower($1) == "port" { print $2; exit }')"
if [ -z "$port" ]; then
  echo "no ssh port found in sshd -T, no firewall rules were set"
  exit 1
fi
ufw default deny incoming
ufw default allow outgoing
if [ "$port" = 22 ]; then
  ufw allow OpenSSH
else
  ufw allow "$port"/tcp
fi
ufw --force enable

# ssh hardening as a drop-in, the main config stays untouched. named 00 because
# sshd keeps the first value it reads and provider drop-ins sort later
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
EOF
if ! sshd -t; then
  rm -f /etc/ssh/sshd_config.d/00-hardening.conf
  echo "sshd rejects the new config, the drop-in is removed, nothing is reloaded"
  exit 1
fi
systemctl try-reload-or-restart ssh

# check the live values, an earlier drop-in can still win
live="$(sshd -T | tr '[:upper:]' '[:lower:]')"
for kv in "permitrootlogin no" "passwordauthentication no" "kbdinteractiveauthentication no"; do
  if ! grep -qx "$kv" <<<"$live"; then
    echo "ssh is not hardened, $kv does not stick, check the drop-ins in /etc/ssh/sshd_config.d"
    exit 1
  fi
done

# let unattended upgrades reboot the box at 02:30
cat > /etc/apt/apt.conf.d/52unattended-reboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "02:30";
EOF

# fail2ban bans brute force ssh
DEBIAN_FRONTEND=noninteractive apt-get -y install fail2ban -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold
systemctl enable --now fail2ban

# what is listening now
ss -tulpn
echo "open a new terminal and check you can still log in as $user"
echo "26.10 support ends July 2027 and Ubuntu Pro / Livepatch are LTS only, so plan the upgrade"
