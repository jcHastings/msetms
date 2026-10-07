#!/usr/bin/env bash
# One-time, idempotent setup of a fresh Lightsail Ubuntu 24.04 instance for the
# MS Express TMS. Run as root from an unpacked copy of deploy/lightsail:
#   sudo ./bootstrap.sh [--ssh-from <CIDR>]
# Installs: TZ America/New_York, unattended-upgrades, ufw (deny inbound except SSH),
# Node (pinned to the office PC's version), Litestream, cloudflared, sqlite3,
# rclone, age, zstd, jq; the msetms service user; dirs; systemd units; templates.
# Installs unit files and reloads systemd. Does not enable or start any msetms
# unit or timer (a reboot before the first deploy stays quiet). If an earlier
# run already enabled them, this script leaves that alone. Starts NOTHING that
# needs secrets. No secrets are read or written here.
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

NODE_VERSION="24.19.0"          # = office PC (node -v) on 2026-10-07
LITESTREAM_VERSION="0.5.17"     # latest release 2026-08-31
SSH_FROM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-from) SSH_FROM="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || { echo "expects Ubuntu 24.04 (got ${PRETTY_NAME:-unknown})" >&2; exit 1; }
[[ "$(uname -m)" == "x86_64" ]] || { echo "expects x86_64 (Lightsail Linux 4 GB plan)" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

step "timezone"
timedatectl set-timezone America/New_York

step "packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -yq -o Dpkg::Options::=--force-confold upgrade
apt-get -yq install ca-certificates curl gnupg jq sqlite3 zstd age rclone ufw unattended-upgrades xz-utils

step "unattended-upgrades (security, no auto-reboot)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
cat > /etc/apt/apt.conf.d/52msetms-unattended <<'CONF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
CONF
systemctl enable --now unattended-upgrades.service

step "swap (2 GB, only if none) - next build headroom on 4 GB RAM"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "node v$NODE_VERSION (checksum-verified)"
if [[ "$(/usr/local/bin/node -v 2>/dev/null || true)" != "v$NODE_VERSION" ]]; then
  tmp="$(mktemp -d)"
  tarball="node-v$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$tarball" -o "$tmp/$tarball"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  (cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c -)
  rm -rf "/opt/node-v$NODE_VERSION"; mkdir -p "/opt/node-v$NODE_VERSION"
  tar -xJf "$tmp/$tarball" -C "/opt/node-v$NODE_VERSION" --strip-components=1
  for b in node npm npx; do ln -sfn "/opt/node-v$NODE_VERSION/bin/$b" "/usr/local/bin/$b"; done
  rm -rf "$tmp"
fi
node -v

step "litestream v$LITESTREAM_VERSION (checksum-verified)"
if [[ "$(litestream version 2>/dev/null || true)" != *"$LITESTREAM_VERSION"* ]]; then
  tmp="$(mktemp -d)"
  deb="litestream-$LITESTREAM_VERSION-linux-x86_64.deb"
  base="https://github.com/benbjohnson/litestream/releases/download/v$LITESTREAM_VERSION"
  curl -fsSL "$base/$deb" -o "$tmp/$deb"
  curl -fsSL "$base/checksums.txt" -o "$tmp/checksums.txt"
  (cd "$tmp" && grep " $deb\$" checksums.txt | sha256sum -c -)
  dpkg -i "$tmp/$deb"; rm -rf "$tmp"
fi
# We run our own unit (msetms-litestream.service) as the app user.
systemctl disable --now litestream.service 2>/dev/null || true

step "cloudflared (Cloudflare apt repo; token is installed later by install-cloudflared.sh)"
if ! command -v cloudflared >/dev/null; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -q && apt-get -yq install cloudflared
fi
cloudflared --version

step "service user + directories (data lives OUTSIDE releases)"
id msetms >/dev/null 2>&1 || useradd --system --home-dir /srv/msetms --shell /usr/sbin/nologin msetms
install -d -o msetms -g msetms -m 0750 /srv/msetms /srv/msetms/releases /srv/msetms/shared /srv/msetms/shared/data /srv/msetms/shared/data/uploads
install -d -o root -g root -m 0700 /srv/msetms/backups /srv/msetms/state
install -d -o root -g root -m 0700 /etc/msetms

step "env files (root-only templates, names only; filled later on the server)"
[[ -f /etc/msetms/msetms.env ]] || install -o root -g root -m 0600 "$HERE/templates/msetms.env.template" /etc/msetms/msetms.env
[[ -f /etc/msetms/backup.env ]] || install -o root -g root -m 0600 "$HERE/templates/backup.env.template" /etc/msetms/backup.env
install -o root -g msetms -m 0640 "$HERE/templates/litestream.yml.template" /etc/msetms/litestream.yml
chmod 0750 /etc/msetms; chgrp msetms /etc/msetms   # msetms may read litestream.yml only

step "scripts + units"
install -d /usr/local/lib/msetms
install -m 0644 "$HERE/bin/lib.sh" /usr/local/lib/msetms/lib.sh
for s in msetms-deploy msetms-rollback msetms-counts msetms-health msetms-backup-nightly msetms-restore-test msetms-heartbeat; do
  install -m 0755 "$HERE/bin/$s" "/usr/local/lib/msetms/$s"
  ln -sfn "/usr/local/lib/msetms/$s" "/usr/local/sbin/$s"
done
install -m 0755 "$HERE/install-cloudflared.sh" /usr/local/sbin/msetms-install-cloudflared
install -m 0644 "$HERE"/systemd/*.service "$HERE"/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
# Do not enable or start msetms units here. The first successful msetms-deploy
# enables them, once a release exists. Already-enabled units are left as they are.

step "ssh hardening (keys only, no root login)"
cat > /etc/ssh/sshd_config.d/60-msetms.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sshd -t && systemctl reload ssh

step "firewall: deny all inbound except SSH (the app is reached only via Cloudflare Tunnel)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
if [[ -n "$SSH_FROM" ]]; then ufw allow from "$SSH_FROM" to any port 22 proto tcp; else ufw limit OpenSSH; fi
ufw --force enable
ufw status verbose

cat <<'NEXT'

Bootstrap done. Nothing is serving yet.
Units are installed and systemd was reloaded. No msetms unit or timer was enabled or started,
so a reboot before the first deploy stays quiet. Next (see README.md):
  1. sudoedit /etc/msetms/msetms.env and /etc/msetms/backup.env (paste from the secret store)
  2. sudo msetms-install-cloudflared        (paste the NEW tunnel token at the prompt)
  3. Data copy + first deploy per migrate-from-pc.md (needs JC's yes).
     That deploy enables msetms.service. It also enables Litestream and the backup timers
     when /etc/msetms/litestream.yml and /etc/msetms/backup.env both exist and are non-empty.
NEXT
