#!/bin/bash
# Sets up the newsjack pipeline on macOS:
#   1. Daily pipeline run at 07:30 (runs on wake if the Mac was asleep)
#   2. Dashboard always running at http://localhost:3000
#
# Install:   bash scripts/install-mac-schedule.sh
# Uninstall: bash scripts/install-mac-schedule.sh uninstall
# Change the run time: edit RUN_HOUR / RUN_MINUTE below and re-run the install.
set -euo pipefail

RUN_HOUR=7
RUN_MINUTE=30

REPO="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
NODE_BIN="$(command -v node)"
NODE_DIR="$(dirname "$NODE_BIN")"
# launchd jobs don't get your shell's PATH — bake in everything node/claude need
JOB_PATH="$NODE_DIR:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOGS="$REPO/logs"

PIPELINE_PLIST="$AGENTS/com.newsjack.pipeline.plist"
DASHBOARD_PLIST="$AGENTS/com.newsjack.dashboard.plist"

if [ "${1:-}" = "uninstall" ]; then
  launchctl unload "$PIPELINE_PLIST" 2>/dev/null || true
  launchctl unload "$DASHBOARD_PLIST" 2>/dev/null || true
  rm -f "$PIPELINE_PLIST" "$DASHBOARD_PLIST"
  echo "Uninstalled. Daily runs and the always-on dashboard are off."
  exit 0
fi

if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
  echo "WARNING: claude CLI not found — the daily run will fail until Claude Code is installed and logged in." >&2
fi

mkdir -p "$AGENTS" "$LOGS"

cat > "$PIPELINE_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.newsjack.pipeline</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string>
    <string>src/pipeline.js</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$JOB_PATH</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>$RUN_HOUR</integer>
    <key>Minute</key><integer>$RUN_MINUTE</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOGS/pipeline.log</string>
  <key>StandardErrorPath</key><string>$LOGS/pipeline.log</string>
</dict></plist>
EOF

cat > "$DASHBOARD_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.newsjack.dashboard</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string>
    <string>dashboard/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$JOB_PATH</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOGS/dashboard.log</string>
  <key>StandardErrorPath</key><string>$LOGS/dashboard.log</string>
</dict></plist>
EOF

launchctl unload "$PIPELINE_PLIST" 2>/dev/null || true
launchctl unload "$DASHBOARD_PLIST" 2>/dev/null || true
launchctl load "$PIPELINE_PLIST"
launchctl load "$DASHBOARD_PLIST"

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "this-mac")"
printf '\nDone.\n'
printf '  • Pipeline runs daily at %02d:%02d (or on wake if the Mac was asleep)\n' "$RUN_HOUR" "$RUN_MINUTE"
printf '  • Dashboard is now always on:\n'
printf '      this Mac:            http://localhost:3000\n'
printf '      other devices (same WiFi): http://%s:3000\n' "$IP"
printf '  • Logs: %s\n' "$LOGS"
printf '  • Turn it all off: bash scripts/install-mac-schedule.sh uninstall\n'
