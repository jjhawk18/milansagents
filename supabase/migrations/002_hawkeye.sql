-- HawkEye: competitor & market intelligence agent (additive only — no changes
-- to existing tables). Mirrors the local JSON store's shape.

create table if not exists hawkeye_companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  website       text,
  description   text,
  categories    text[] default '{}',
  business      text default 'both' check (business in ('focus_insite','humnlayer','both')),
  priority      int default 3,           -- 1 = highest
  active        boolean default true,
  urls          jsonb default '[]',      -- monitored pages: [{kind, url}] (service/pricing/careers/news)
  linkedin_url  text,                    -- reference only, never scraped
  notes         text,
  is_seed       boolean default false,
  last_checked  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists hawkeye_snapshots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references hawkeye_companies(id) on delete cascade,
  url           text not null,
  content_hash  text not null,
  text_excerpt  text,                    -- normalized text (capped)
  diff_summary  jsonb,                   -- { ratio, added_lines, removed_lines }
  meaningful    boolean default false,
  dismissed     boolean default false,
  created_at    timestamptz default now()
);
create index if not exists hawkeye_snapshots_company_idx on hawkeye_snapshots(company_id, url, created_at desc);

create table if not exists hawkeye_signals (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid references hawkeye_companies(id) on delete set null,
  company_name              text not null,
  headline                  text not null,
  signal_type               text[] default '{}',
  event_date                text,
  source_urls               text[] default '{}',
  source_titles             text[] default '{}',
  factual_summary           text,
  what_changed              text,
  why_it_matters            text,
  focus_insite_implication  text,
  human_layer_implication   text,
  strategic_relevance_score int,
  revenue_potential_score   int,
  competitive_threat_score  int,
  urgency_score             int,
  evidence_confidence_score int,
  total_score               int,
  priority_band             text,        -- critical/high/medium/low/noise
  recommended_action        text,
  action_owner              text,
  sales_trigger             boolean default false,
  content_opportunity       boolean default false,
  partnership_opportunity   boolean default false,
  acquisition_opportunity   boolean default false,
  buyer_intent              jsonb,       -- { likely_need, target_titles, outreach_angle, draft_opening, confidence }
  needs_human_review        boolean default false,
  reasoning_summary         text,
  status                    text default 'new'
    check (status in ('new','reviewed','action_needed','assigned','in_progress','completed','dismissed','noise')),
  run_id                    uuid,
  detected_date             timestamptz default now(),
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);
create index if not exists hawkeye_signals_score_idx on hawkeye_signals(total_score desc);
create index if not exists hawkeye_signals_status_idx on hawkeye_signals(status);

create table if not exists hawkeye_briefs (
  id          uuid primary key default gen_random_uuid(),
  brief       jsonb not null,            -- full structured brief
  signal_ids  uuid[] default '{}',
  created_at  timestamptz default now()
);

create table if not exists hawkeye_runs (
  id             uuid primary key default gen_random_uuid(),
  status         text default 'running' check (status in ('running','completed','failed','partial')),
  companies_scanned int default 0,
  signals_created   int default 0,
  ai_calls          int default 0,
  errors            jsonb default '[]',
  started_at        timestamptz default now(),
  finished_at       timestamptz
);

-- Source URLs already ingested (dedup across runs)
create table if not exists hawkeye_seen (
  id          uuid primary key default gen_random_uuid(),
  url_hash    text not null unique,
  url         text,
  company_id  uuid,
  created_at  timestamptz default now()
);
