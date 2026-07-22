-- Newsjack content pipeline schema
-- Run via: supabase db push, or paste into the Supabase SQL editor.

create extension if not exists vector;      -- pgvector for RAG embeddings
create extension if not exists pgcrypto;    -- gen_random_uuid()

-- ---------------------------------------------------------------
-- Sources: where stories come from (RSS feeds, Tavily queries, manual)
-- ---------------------------------------------------------------
create table if not exists sources (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('rss','tavily','web_search','manual')),
  name          text not null,
  url           text,
  query         text,                -- for tavily/web_search sources
  trust_score   numeric default 0.5, -- learned over time by the feedback loop
  enabled       boolean default true,
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------
-- Raw items found by discovery, before dedup/clustering
-- ---------------------------------------------------------------
create table if not exists raw_items (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references sources(id),
  url           text not null,
  url_hash      text generated always as (md5(url)) stored,
  title         text not null,
  summary       text,
  published_at  timestamptz,
  fetched_at    timestamptz default now(),
  unique (url_hash)
);

-- ---------------------------------------------------------------
-- Stories: deduplicated, clustered story units
-- ---------------------------------------------------------------
create table if not exists stories (
  id              uuid primary key default gen_random_uuid(),
  cluster_key     text,                       -- normalized key for grouping
  headline        text not null,
  summary         text,
  item_ids        uuid[] default '{}',        -- raw_items in this cluster
  source_count    int default 1,
  status          text not null default 'new'
                  check (status in ('new','verified','rejected','scored','drafted','published')),
  -- fact verification output
  verification    jsonb,   -- { verdict, confidence, claims: [{claim, status, evidence}] }
  -- newsjack scoring output
  newsjack_score  numeric, -- 0-100
  score_breakdown jsonb,   -- { relevance, timeliness, brand_fit, momentum, risk }
  first_seen_at   timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists stories_status_idx on stories(status);
create index if not exists stories_score_idx on stories(newsjack_score desc nulls last);

-- ---------------------------------------------------------------
-- Brand knowledge: RAG corpus per brand (voice, positioning, services,
-- case studies, past content, banned claims)
-- ---------------------------------------------------------------
create table if not exists brand_knowledge (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null check (brand in ('focus_insite','humnlayer','jjhawk')),
  doc_type    text not null,   -- 'voice','positioning','service','case_study','claim_policy','past_content'
  title       text,
  content     text not null,
  embedding   vector(1024),    -- Voyage AI voyage-3 embeddings (prototype falls back to keyword match)
  created_at  timestamptz default now()
);

create index if not exists brand_knowledge_brand_idx on brand_knowledge(brand);

-- Similarity search helper for RAG retrieval
create or replace function match_brand_knowledge(
  p_brand text, p_embedding vector(1024), p_limit int default 5
) returns setof brand_knowledge language sql stable as $$
  select * from brand_knowledge
  where brand = p_brand and embedding is not null
  order by embedding <=> p_embedding
  limit p_limit;
$$;

-- ---------------------------------------------------------------
-- Angles: brand-specific takes on a story
-- ---------------------------------------------------------------
create table if not exists angles (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid references stories(id) on delete cascade,
  brand       text not null check (brand in ('focus_insite','humnlayer','jjhawk')),
  angle       text not null,
  rationale   text,
  hook        text,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------
-- Content: generated drafts per angle x format
-- ---------------------------------------------------------------
create table if not exists content (
  id           uuid primary key default gen_random_uuid(),
  story_id     uuid references stories(id) on delete cascade,
  angle_id     uuid references angles(id) on delete cascade,
  brand        text not null,
  format       text not null check (format in ('article','linkedin','x','facebook','instagram','video_script','newsletter')),
  title        text,
  body         text not null,
  seo          jsonb,     -- { meta_description, keywords, slug }
  qc_report    jsonb,     -- { passed, checks: {facts, sources, copyright, voice, claims, seo}, notes }
  status       text not null default 'draft'
               check (status in ('draft','qc_failed','pending_approval','approved','rejected','published')),
  published_at timestamptz,
  publish_ref  jsonb,     -- e.g. { wordpress_id, permalink } or social post ids
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists content_status_idx on content(status);

-- ---------------------------------------------------------------
-- Approvals: audit trail of human decisions from the dashboard
-- ---------------------------------------------------------------
create table if not exists approvals (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid references content(id) on delete cascade,
  decision    text not null check (decision in ('approved','rejected','edited')),
  reviewer    text,
  notes       text,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------
-- Analytics + learning loop: performance events fed back into scoring
-- ---------------------------------------------------------------
create table if not exists analytics_events (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid references content(id) on delete cascade,
  channel     text not null,   -- 'wordpress','linkedin','x','facebook','instagram','email'
  metric      text not null,   -- 'views','clicks','likes','shares','comments','opens','leads'
  value       numeric not null,
  captured_at timestamptz default now()
);

-- Rollup used by the learning loop to adjust source trust + scoring weights
create or replace view content_performance as
select
  c.id as content_id, c.brand, c.format, s.newsjack_score,
  coalesce(sum(a.value) filter (where a.metric in ('views','opens')), 0)  as reach,
  coalesce(sum(a.value) filter (where a.metric in ('clicks','likes','shares','comments')), 0) as engagement,
  coalesce(sum(a.value) filter (where a.metric = 'leads'), 0) as leads
from content c
join stories s on s.id = c.story_id
left join analytics_events a on a.content_id = c.id
group by c.id, c.brand, c.format, s.newsjack_score;
