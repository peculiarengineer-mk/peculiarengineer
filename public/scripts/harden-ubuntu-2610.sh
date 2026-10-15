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

if [ ! -s "/home/$user/.ssh/authorized_keys" ]; then
  echo "no ssh key for $user, add one to /home/$user/.ssh/authorized_keys first"
  exit 1
fi

if ! id -nG "$user" | grep -qw sudo; then
  echo "$user is not in the sudo group, run: usermod -aG sudo $user"
  exit 1
fi

# bring the box up to date first
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade

# firewall, ssh stays open
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

# ssh hardening as a drop-in, the main config stays untouched
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
EOF
sshd -t
systemctl reload ssh

# let unattended upgrades reboot the box at 02:30
cat > /etc/apt/apt.conf.d/52unattended-reboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "02:30";
EOF

# fail2ban bans brute force ssh
DEBIAN_FRONTEND=noninteractive apt-get -y install fail2ban
systemctl enable --now fail2ban

# what is listening now
ss -tulpn
echo "open a new terminal and check you can still log in as $user"
echo "26.10 support ends July 2027 and Ubuntu Pro / Livepatch are LTS only, so plan the upgrade"
