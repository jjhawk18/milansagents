#!/bin/bash
# Tests a curated list of candidate news feeds FROM THIS MACHINE and writes
# the working ones into .env RSS_FEEDS.
#
#   bash scripts/update-feeds.sh                     # test defaults
#   bash scripts/update-feeds.sh https://extra/feed  # test defaults + extras
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

CANDIDATES=(
  # AI / tech (HumnLayer lane)
  "https://techcrunch.com/category/artificial-intelligence/feed/"
  "https://venturebeat.com/category/ai/feed/"
  "https://www.marktechpost.com/feed/"
  "https://feeds.arstechnica.com/arstechnica/index"
  # Market research / insights industry (Focus Insite lane)
  "https://www.quirks.com/rss"
  "https://www.quirks.com/feed"
  "https://www.greenbook.org/feed"
  "https://www.greenbook.org/mr/feed"
  "https://www.research-live.com/rss/"
  "https://www.insightplatforms.com/feed/"
  "https://www.mrweb.com/drno/dailyrss.xml"
  # Any extras passed on the command line
  "$@"
)

GOOD=()
echo "Testing ${#CANDIDATES[@]} candidate feeds..."
for url in "${CANDIDATES[@]}"; do
  [ -z "$url" ] && continue
  if node scripts/check-feed.mjs "$url"; then
    GOOD+=("$url")
  fi
done

if [ "${#GOOD[@]}" -eq 0 ]; then
  echo "No working feeds found — leaving .env unchanged." >&2
  exit 1
fi

LIST="$(IFS=,; echo "${GOOD[*]}")"
if grep -q '^RSS_FEEDS=' .env; then
  sed -i.bak "s|^RSS_FEEDS=.*|RSS_FEEDS=$LIST|" .env && rm -f .env.bak
else
  echo "RSS_FEEDS=$LIST" >> .env
fi

echo
echo "Saved ${#GOOD[@]} working feed(s) to .env:"
for u in "${GOOD[@]}"; do echo "  • $u"; done
echo
echo "They'll be used on the next pipeline run (trigger one now: systemctl start newsjack-pipeline)"
