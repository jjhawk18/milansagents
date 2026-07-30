#!/bin/bash
# Zero-to-running bootstrap for a fresh Ubuntu/Debian VPS.
# Run as root on the server:
#
#   curl -fsSL https://raw.githubusercontent.com/jjhawk18/milansagents/claude/news-content-pipeline-v0kun9/scripts/bootstrap.sh | bash
#
# Asks two questions (Claude token, dashboard password), then installs and
# starts everything: daily pipeline runs + always-on dashboard.
set -euo pipefail

BRANCH="claude/news-content-pipeline-v0kun9"
REPO_URL="https://github.com/jjhawk18/milansagents.git"
DEST="/root/milansagents"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

echo "==> Getting the code"
apt-get update -qq && apt-get install -y -qq git curl ca-certificates >/dev/null
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" pull --ff-only
else
  git clone --branch "$BRANCH" "$REPO_URL" "$DEST"
fi
cd "$DEST"
[ -f .env ] || cp .env.example .env

# Interactive prompts must read from the terminal, not the piped script
TTY=/dev/tty

if ! grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.\+' .env; then
  echo
  echo "STEP 1/2 — Claude token (lets this server use your Claude Max plan)."
  echo "On your own computer, run:  claude setup-token   and copy the result."
  printf "Paste the token here and press Enter: "
  read -r TOKEN < "$TTY"
  sed -i "s|^CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=$TOKEN|" .env
fi

if ! grep -q '^DASHBOARD_PASSWORD=.\+' .env; then
  echo
  echo "STEP 2/2 — Make up a dashboard password (you'll type it in your browser)."
  printf "Password: "
  read -r PASS < "$TTY"
  sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$PASS|" .env
fi

echo
echo "==> Installing and starting everything (takes a few minutes)"
bash scripts/deploy-vps.sh

echo "==> Kicking off your first pipeline run in the background"
systemctl start --no-block newsjack-pipeline

IP="$(curl -fs4 --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')"
echo
echo "First run is underway (takes a few minutes). Watch it live with:"
echo "    tail -f $DEST/logs/pipeline.log"
echo "Then open  http://$IP:3000  from any device (any username + your password)."
