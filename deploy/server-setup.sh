#!/usr/bin/env bash
# One-time VPS setup for Minnal (Ubuntu 24.04+/26.04). Run once as the sudo user, never as root over SSH:
#   scp -i ~/.ssh/minnal_vps deploy/server-setup.sh snobin@<VPS_IP>:~
#   ssh -i ~/.ssh/minnal_vps snobin@<VPS_IP>
#   sudo bash server-setup.sh <VPS_IP>
# Safe to re-run. It does NOT touch SSH login settings (do those first, see RUNBOOK) and does not start the app.
# What it does: updates, firewall (22/80/443), fail2ban, automatic security updates, 2 GB swap, Docker with
# log rotation, and a `deploy` user (docker group, no sudo) with a fresh CI key, printed once at the end.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash $0 <VPS_IP>" >&2; exit 1; }
VPS_IP="${1:?Usage: sudo bash $0 <VPS_IP>}"
export DEBIAN_FRONTEND=noninteractive

echo "== 1/7 Updates and packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y ufw fail2ban unattended-upgrades docker.io docker-compose-v2 curl ca-certificates

echo "== 2/7 Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== 3/7 Firewall: only SSH, HTTP, HTTPS (and HTTP/3) in"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== 4/7 fail2ban (SSH brute-force bans)"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== 5/7 Swap (2 GB safety net, not a substitute for the memory envelope)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-minnal.conf
  sysctl -p /etc/sysctl.d/99-minnal.conf
fi

echo "== 6/7 Docker with log rotation"
install -d /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl enable --now docker
systemctl restart docker

echo "== 7/7 deploy user and CI key"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -d -o deploy -g deploy /home/deploy/minnal/deploy
install -d -m 700 /root/ci-key
if ! grep -q 'minnal-ci' /home/deploy/.ssh/authorized_keys 2>/dev/null; then
  rm -f /root/ci-key/id
  ssh-keygen -q -t ed25519 -N "" -C minnal-ci -f /root/ci-key/id
  cat /root/ci-key/id.pub >> /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys
  NEW_KEY=1
else
  NEW_KEY=0
fi

cat <<EOF

================ DONE ================
Add these as GitHub repository secrets (Settings > Secrets and variables > Actions), environment "production":

VPS_HOST        = $VPS_IP
VPS_USER        = deploy
VPS_KNOWN_HOSTS = $VPS_IP $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)
EOF
if [ "$NEW_KEY" = 1 ]; then
  cat <<EOF
VPS_SSH_KEY     = (the whole block below, including the BEGIN and END lines; shown only once)

$(cat /root/ci-key/id)

EOF
  shred -u /root/ci-key/id /root/ci-key/id.pub
  echo "The private key file was deleted from the server after printing."
else
  echo "VPS_SSH_KEY     = (already created on an earlier run, not shown again; delete the minnal-ci line from /home/deploy/.ssh/authorized_keys and re-run to make a new one)"
fi
echo
echo "Next: create /home/deploy/minnal/deploy/.env (see deploy/.env.example), then reboot if 'System restart required' was shown: sudo reboot"
