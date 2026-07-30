#!/bin/bash
# Set or update one setting in .env, e.g.:
#   bash scripts/set-config.sh TAVILY_API_KEY tvly-abc123
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${1:?usage: set-config.sh KEY VALUE}"
VALUE="${2:?usage: set-config.sh KEY VALUE}"

cd "$REPO"
[ -f .env ] || cp .env.example .env
if grep -q "^$KEY=" .env; then
  sed -i.bak "s|^$KEY=.*|$KEY=$VALUE|" .env && rm -f .env.bak
else
  echo "$KEY=$VALUE" >> .env
fi
systemctl restart newsjack-dashboard 2>/dev/null || true
echo "$KEY updated."
