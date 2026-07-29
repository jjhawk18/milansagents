#!/bin/bash
# One-command deployment for an Ubuntu/Debian VPS (e.g. Contabo).
# Run ON the server, from inside the cloned repo, as root:
#
#   bash scripts/deploy-vps.sh
#
# Sets up:
#   - Node.js 22 (if missing)
#   - Claude Code CLI (subscription auth via CLAUDE_CODE_OAUTH_TOKEN in .env)
#   - systemd service: dashboard always on at http://<server-ip>:3000
#   - systemd timer:   pipeline runs daily at 07:30 server time
#
# Re-running is safe — it updates code and restarts services.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RUN_TIME="07:30"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (or with sudo): sudo bash scripts/deploy-vps.sh" >&2
  exit 1
fi

echo "==> Installing prerequisites"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates >/dev/null

if ! command -v node >/dev/null 2>&1 || [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -lt 20 ]; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

if ! command -v claude >/dev/null 2>&1 && [ ! -x /root/.local/bin/claude ]; then
  echo "==> Installing Claude Code"
  curl -fsSL https://claude.ai/install.sh | bash
fi
CLAUDE_DIR="$HOME/.local/bin"

echo "==> Installing app dependencies"
cd "$REPO"
npm install --no-audit --no-fund >/dev/null

if [ ! -f "$REPO/.env" ]; then
  cp "$REPO/.env.example" "$REPO/.env"
  echo "==> Created .env from template"
fi

# --- Required settings check ---
missing=0
grep -q '^DASHBOARD_PASSWORD=.\+' "$REPO/.env" || { echo "!! Set DASHBOARD_PASSWORD in $REPO/.env (dashboard will be on the public internet)"; missing=1; }
grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.\+' "$REPO/.env" || { echo "!! Set CLAUDE_CODE_OAUTH_TOKEN in $REPO/.env (run 'claude setup-token' on a logged-in machine and paste the token)"; missing=1; }

JOB_PATH="$(dirname "$(command -v node)"):$CLAUDE_DIR:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$REPO/logs"

echo "==> Writing systemd units"
cat > /etc/systemd/system/newsjack-dashboard.service <<EOF
[Unit]
Description=Newsjack approval dashboard
After=network.target

[Service]
WorkingDirectory=$REPO
ExecStart=$(command -v node) dashboard/server.js
Environment=PATH=$JOB_PATH
Restart=always
RestartSec=5
StandardOutput=append:$REPO/logs/dashboard.log
StandardError=append:$REPO/logs/dashboard.log

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/newsjack-pipeline.service <<EOF
[Unit]
Description=Newsjack pipeline run
After=network.target

[Service]
Type=oneshot
WorkingDirectory=$REPO
ExecStart=$(command -v node) src/pipeline.js run
Environment=PATH=$JOB_PATH
StandardOutput=append:$REPO/logs/pipeline.log
StandardError=append:$REPO/logs/pipeline.log
EOF

cat > /etc/systemd/system/newsjack-pipeline.timer <<EOF
[Unit]
Description=Daily newsjack pipeline run

[Timer]
OnCalendar=*-*-* $RUN_TIME:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now newsjack-dashboard.service
systemctl enable --now newsjack-pipeline.timer
systemctl restart newsjack-dashboard.service

IP="$(curl -fs4 --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')"
echo
echo "=================================================================="
if [ "$missing" -eq 1 ]; then
  echo "DEPLOYED, but finish the settings flagged above in $REPO/.env, then:"
  echo "  systemctl restart newsjack-dashboard"
else
  echo "DEPLOYED."
fi
echo
echo "  Dashboard:   http://$IP:3000   (any username + your DASHBOARD_PASSWORD)"
echo "  Daily run:   $RUN_TIME server time (missed runs fire on next boot)"
echo "  Run now:     systemctl start newsjack-pipeline"
echo "  Logs:        tail -f $REPO/logs/pipeline.log"
echo "  Update code: cd $REPO && git pull && bash scripts/deploy-vps.sh"
echo "=================================================================="
