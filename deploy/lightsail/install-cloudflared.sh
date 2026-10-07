#!/usr/bin/env bash
# Install cloudflared as a systemd service for the NEW remotely-managed tunnel
# (e.g. "msetms-cloud"). The token is read from a hidden prompt or stdin at run
# time, stored only in /etc/cloudflared/token (root 0600), never in git, never echoed.
#   sudo msetms-install-cloudflared            # hidden prompt
#   sudo msetms-install-cloudflared < /dev/stdin
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
command -v cloudflared >/dev/null || { echo "cloudflared missing (run bootstrap.sh)" >&2; exit 1; }
if [[ -t 0 ]]; then
  read -rsp "Paste the tunnel token (input hidden): " token; echo
else
  IFS= read -r token
fi
token="$(printf '%s' "$token" | tr -d '[:space:]')"
[[ ${#token} -ge 80 ]] || { echo "that does not look like a tunnel token (too short); nothing changed" >&2; exit 1; }
install -d -m 0700 /etc/cloudflared
umask 077
printf '%s' "$token" > /etc/cloudflared/token
unset token
chmod 0600 /etc/cloudflared/token
cat > /etc/systemd/system/cloudflared.service <<'UNIT'
[Unit]
Description=Cloudflare Tunnel (msetms, remotely managed)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel --metrics 127.0.0.1:20241 run --token-file /etc/cloudflared/token
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now cloudflared.service
sleep 5
if curl -fsS -m 5 http://127.0.0.1:20241/ready >/dev/null; then
  echo "cloudflared connected (tunnel ready). Public hostname routing is set in the Cloudflare dashboard."
else
  echo "cloudflared started but not ready yet: journalctl -u cloudflared -n 50" >&2
fi
