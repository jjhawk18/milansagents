#!/bin/bash
# Put the dashboard behind a custom domain with automatic HTTPS (Caddy).
#
# Prerequisites:
#   1. deploy-vps.sh already run on this server
#   2. A DNS "A record" for your domain/subdomain pointing at this server's IP
#      (wait until `ping your.domain` answers with this server's IP)
#
# Usage (as root, from inside the repo):
#   bash scripts/setup-domain.sh agents.yourdomain.com
set -euo pipefail

DOMAIN="${1:-}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash scripts/setup-domain.sh your.domain.com" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/setup-domain.sh $DOMAIN" >&2
  exit 1
fi
if ! grep -q '^DASHBOARD_PASSWORD=.\+' "$REPO/.env" 2>/dev/null; then
  echo "!! Set DASHBOARD_PASSWORD in $REPO/.env first — never expose the dashboard without it." >&2
  exit 1
fi

# Sanity-check DNS before Caddy tries to get a certificate
SERVER_IP="$(curl -fs4 --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')"
DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -z "$DOMAIN_IP" ]; then
  echo "!! $DOMAIN does not resolve yet. Add an A record → $SERVER_IP, wait a few minutes, retry." >&2
  exit 1
fi
if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
  echo "!! $DOMAIN points at $DOMAIN_IP but this server is $SERVER_IP. Fix the A record first." >&2
  exit 1
fi

echo "==> Installing Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

echo "==> Configuring Caddy for $DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable --now caddy
systemctl restart caddy

echo "==> Locking dashboard to localhost (reachable only via Caddy)"
if grep -q '^DASHBOARD_BIND=' "$REPO/.env"; then
  sed -i 's/^DASHBOARD_BIND=.*/DASHBOARD_BIND=127.0.0.1/' "$REPO/.env"
else
  echo 'DASHBOARD_BIND=127.0.0.1' >> "$REPO/.env"
fi
systemctl restart newsjack-dashboard

# Firewall: web ports open, direct dashboard port closed
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw deny 3000/tcp >/dev/null || true
  echo "==> Firewall updated (80/443 open, 3000 closed)"
fi

echo
echo "=================================================================="
echo "Done. Give Caddy ~1 minute to fetch the SSL certificate, then open:"
echo
echo "    https://$DOMAIN"
echo
echo "You'll get the login prompt (any username + your DASHBOARD_PASSWORD)."
echo "The certificate renews itself — nothing to maintain."
echo "=================================================================="
