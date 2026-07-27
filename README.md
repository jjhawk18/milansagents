# Newsjack Content Pipeline (Prototype)

News discovery → verification → newsjack scoring → brand-specific content → human approval → publishing, for **Focus Insite**, **HumnLayer AI**, and **JJHawk**.

```
NEWS SOURCES (Tavily / RSS / Manual URLs)
        ↓
N8N DISCOVERY WORKFLOW            n8n/discovery-workflow.json
        ↓
DEDUP + STORY CLUSTERING          src/stages/cluster.js
        ↓
FACT VERIFICATION AGENT           src/stages/verify.js        (Claude)
        ↓
NEWSJACK SCORE (0-100, gated)     src/stages/score.js         (Claude)
        ↓
SUPABASE                          supabase/migrations/001_initial_schema.sql
  stories / sources / brand_knowledge / angles / content / approvals / analytics
        ↓
RAG KNOWLEDGE RETRIEVAL           src/stages/rag.js
        ↓
ANGLE GENERATOR (per brand)       src/stages/angles.js        (Claude)
        ↓
CONTENT GENERATOR                 src/stages/generate.js      (Claude)
  article / linkedin / x / facebook / instagram / video script / newsletter
        ↓
QUALITY CONTROL                   src/stages/qc.js            (Claude)
  facts · sources · copyright · voice · claims · seo
        ↓
APPROVAL DASHBOARD                dashboard/  →  http://localhost:3000
        ↓
WORDPRESS REST API + SOCIAL       src/stages/publish.js
  (social goes out via GHL / Zapier webhooks — already in the stack)
        ↓
ANALYTICS + LEARNING LOOP         src/stages/analytics.js
```

## Try it in 60 seconds (no API keys needed)

```bash
npm install
npm run demo             # runs the whole pipeline on fixture news, offline
npm run demo:dashboard   # open http://localhost:3000, approve drafts, hit Publish
```

Demo mode (`DRY_RUN=true`) uses fixture news items, deterministic mock LLM responses, and a local JSON store (`.local-store/db.json`) instead of Supabase — so you can see every stage work before wiring up credentials.

## Going live

1. **LLM backend** — two options:
   - **Claude Max/Pro subscription (default, $0 extra):** install [Claude Code](https://claude.com/claude-code), run `claude login` once on the machine that runs the pipeline (`claude setup-token` for headless servers). The pipeline shells out to `claude -p`, which draws from your plan's included usage. Note: this shares the same usage limits as your interactive Claude sessions.
   - **Anthropic API (per-token billing):** set `ANTHROPIC_API_KEY` and `USE_CLAUDE_CODE=false`.
2. **Supabase** — create a project, run `supabase/migrations/001_initial_schema.sql` in the SQL editor.
3. **Env** — `cp .env.example .env`, fill in Supabase, Tavily, WordPress. Set `DRY_RUN=false`.
4. **n8n** — import `n8n/discovery-workflow.json`; it polls RSS + Tavily every 2 hours, upserts into `raw_items`, and pings the pipeline webhook.
5. **Run** — `npm run run` (or trigger from n8n), then `npm run dashboard` to review.
6. **Publish** — approved articles go to WordPress as *drafts* (final button-press stays human); social formats POST to your GHL/Zapier webhook for LinkedIn / X / Facebook / Instagram / email distribution.
7. **Analytics** — point GHL/WordPress webhooks at `POST /api/analytics` on the dashboard; `GET /api/analytics/summary` shows per-brand/format performance that feeds the learning loop.

## How the pieces work

| Stage | Notes |
|---|---|
| **Discovery** | Tavily news search + RSS feeds + manual URLs (`--url=`). Duplicate URLs are skipped via `url_hash`. |
| **Clustering** | Token-overlap similarity groups multiple articles about the same event into one story. Upgrade path: Voyage AI embeddings + the `match_brand_knowledge` pgvector function already in the schema. |
| **Verification** | Claude extracts core claims and marks each `supported` / `single_source` / `unsupported` / `contradicted`. Single-source stories are never treated as fully verified. Failed stories stop here. |
| **Newsjack score** | 0–100 across relevance, timeliness, brand fit, momentum, minus risk. Threshold: 55 (`src/stages/score.js`). Also picks which brands should cover the story. |
| **RAG** | Brand knowledge (voice, positioning, banned claims — seeded from `brands/*.json`) retrieved per story so drafts are grounded in real positioning. Add case studies and past content to `brand_knowledge` to improve output. |
| **Angles** | One distinct take per relevant brand — the rule is "add genuine expertise, never 'we also exist'". |
| **Content** | Per-brand channel list in `brands/*.json`; prototype caps at 2 formats per brand per story. |
| **QC** | Fresh-context reviewer checks facts / sources / copyright / voice / banned claims / SEO. Fact, claim, or copyright failures block the draft. |
| **Approval** | Nothing publishes without a human decision. Edits in the dashboard are saved and logged in `approvals`. |
| **Learning loop** | `analytics_events` + the `content_performance` view roll up reach/engagement/leads per brand+format; use it to tune scoring weights and source trust over time. |

## Costs & models

All LLM stages use Opus with adaptive thinking — via the Claude Code CLI on your subscription (default), or `claude-opus-4-8` on the API. Roughly 4–8 Claude calls per qualifying story (1 verify + 1 score + 1 angle and ~2 drafts + QC per brand). On subscription mode this costs nothing extra but draws from your Max plan's usage window; tune `SCORE_THRESHOLD` and `MAX_FORMATS_PER_BRAND` to control volume either way.

## Repo layout

```
brands/           brand configs (voice, positioning, banned claims, channels)
n8n/              importable discovery workflow
supabase/         schema migration
src/stages/       one module per pipeline stage
src/lib/          Claude wrapper (with DRY_RUN mocks) + storage abstraction
src/fixtures/     demo news items
dashboard/        approval UI + analytics intake
```
