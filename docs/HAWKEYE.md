# HawkEye — Competitor & Market Intelligence Agent

Agent #2 on the hub. Watches competitors, adjacent companies, potential buyers,
partners, and acquisition targets — then explains **what changed, why it
matters, and what to do about it**. Complements the newsjack agent (which asks
"what news can we ride?"); HawkEye asks "what are the players doing?"

## Architecture (reuses the existing stack)

```
Watchlist (hawkeye_companies, dashboard-managed, seeded with editable examples)
   ↓  Mon/Wed/Fri 07:15 America/New_York (systemd timer) or manual "Scan now"
COLLECT   src/hawkeye/collect.js
   • Public page fetch → normalize → hash → snapshot → line diff
     (trivial changes filtered deterministically before any AI spend)
   • Tavily news search per company (skipped if no key), source-level dedup
ANALYZE   src/hawkeye/analyze.js  (Claude via existing src/lib/claude.js —
   Max-plan CLI backend; JSON-schema-validated output; mock in DRY_RUN)
   • Signal types, 5-component scoring (relevance 25 / revenue 25 / threat 20 /
     urgency 15 / evidence 15), evidence-weak cap (< 8/15 evidence → max 64)
   • Buyer-intent extraction with draft outreach (NEVER auto-sent)
DEDUP     same-company similar-headline merge across 14 days
STORE     hawkeye_* tables (local JSON store today; supabase/migrations/002 for SQL parity)
BRIEF     src/hawkeye/brief.js → executive takeaway, top 5, buyer intent,
          messaging shifts, per-business implications, top-3 actions,
          1 content concept, 1 prospecting draft
DASHBOARD /hawkeye — Brief · Signals · Buyer Intent · Watchlist · Site Changes
```

## Using it

- **Watchlist tab** — add/edit/pause/delete companies, set priority & business,
  add monitored URLs (services/pricing/careers/press), trigger per-company scan.
  Seed entries are marked `SEED — edit me`; they're examples, not verified
  relationships — review and adjust.
- **Scan now** (header button) — full watchlist scan in the background; watch
  `logs/hawkeye.log`. First scan baselines pages (no change signals yet);
  changes appear from the second scan onward. News signals appear immediately.
- **Signals tab** — every intelligence item with scores, implications, sources,
  and a status workflow (new → reviewed → action_needed → … → completed).
  The status field doubles as the action queue.
- **Buyer Intent tab** — signals flagged as potential revenue: likely need,
  target titles, outreach angle, and a draft opener (drafts only).
- **Site Changes tab** — before/after evidence for meaningful page changes;
  dismiss trivia to tune the detector.

## Configuration

Env vars (all optional; see `.env.example`): `HAWKEYE_ENABLED`,
`HAWKEYE_MAX_COMPANIES_PER_RUN` (15), `HAWKEYE_MAX_URLS_PER_COMPANY` (4),
`HAWKEYE_MAX_AI_CALLS_PER_RUN` (20), `HAWKEYE_MAX_SEARCHES_PER_COMPANY` (1),
`HAWKEYE_CONTENT_MAX_CHARS` (30000), `HAWKEYE_MIN_SIGNAL_SCORE` (25),
`HAWKEYE_PER_DOMAIN_DELAY_MS` (1500).

Schedule: `hawkeye-scan.timer` in `scripts/deploy-vps.sh` —
`OnCalendar=Mon,Wed,Fri *-*-* 07:15:00 America/New_York`, `Persistent=true`
(missed runs fire on boot). Change it there and re-run the deploy script.

## Deploy / manage on the VPS

```bash
cd /root/milansagents && git pull && bash scripts/deploy-vps.sh   # deploy/update
systemctl start hawkeye-scan          # manual run
tail -f /root/milansagents/logs/hawkeye.log
systemctl list-timers | grep hawkeye  # next scheduled run
```

## Disable / rollback

- Soft off: `bash scripts/set-config.sh HAWKEYE_ENABLED false` (scans exit
  immediately; dashboard stays).
- Stop schedule: `systemctl disable --now hawkeye-scan.timer`.
- Full rollback: `git revert` the HawkEye commits and re-run deploy — HawkEye
  is additive-only; newsjack tables and code are untouched.

## Compliance & safety posture

Public pages only, plain GETs, per-domain delay, no logins, no anti-bot
evasion, no LinkedIn scraping (LinkedIn URLs stored as reference only). Every
factual claim carries source URLs + retrieval date. Outreach is draft-only —
nothing is ever sent automatically. No secrets in code or repo.

## Known limitations (MVP)

- Local JSON store on the VPS (same as newsjack); switch to Supabase by
  running migrations 001+002 and filling env vars.
- Change detection is line-based, not semantic; JS-rendered pages may show
  little text (add specific content URLs for those sites).
- Buyer-intent discovery is watchlist-driven; it doesn't yet trawl for
  *unknown* companies (good Phase 2: Tavily topic sweeps → auto-suggest
  watchlist additions).
- Single-user dashboard (shared auth with the hub); no per-user roles.

## Phase 2 ideas

Topic sweeps for unknown buyers · careers-page JSON feeds (Greenhouse/Lever)
for hiring signals · message-trend tracking across snapshots · GHL handoff for
approved prospecting drafts · weekly acquisition-target digest · semantic
dedup via embeddings.
