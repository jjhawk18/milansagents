// Stage 1: Discovery — Tavily / RSS / manual URLs → raw_items.
// In production the n8n workflow (n8n/discovery-workflow.json) does this on a
// schedule; this module is the same logic runnable directly from the CLI.
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT, DRY_RUN } from '../config.js';
import { store } from '../lib/store.js';

export async function discover({ source = 'all', manualUrls = [] } = {}) {
  const items = [];

  if (source === 'fixtures') {
    const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/fixtures/demo-items.json'), 'utf8'));
    items.push(...fixtures);
  } else {
    if (config.rssFeeds.length) items.push(...await fromRss(config.rssFeeds));
    if (config.tavilyApiKey) items.push(...await fromTavily());
    for (const url of manualUrls) {
      items.push({ url, title: url, summary: '', published_at: null, source_kind: 'manual' });
    }
  }

  // Dedupe by URL against what's already stored
  const existing = new Set((await store.select('raw_items')).map(r => r.url));
  const fresh = items.filter(i => !existing.has(i.url));
  const inserted = fresh.length ? await store.insert('raw_items', fresh) : [];
  console.log(`[discover] found ${items.length} items, ${inserted.length} new`);
  return inserted;
}

async function fromRss(feeds) {
  const { default: Parser } = await import('rss-parser');
  const parser = new Parser();
  const out = [];
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed);
      for (const item of parsed.items.slice(0, 20)) {
        out.push({
          url: item.link,
          title: item.title,
          summary: (item.contentSnippet || '').slice(0, 500),
          published_at: item.isoDate || null,
          source_kind: 'rss',
        });
      }
    } catch (err) {
      console.warn(`[discover] RSS failed for ${feed}: ${err.message}`);
    }
  }
  return out;
}

async function fromTavily() {
  const queries = [
    'market research industry news',
    'AI training data OR human-in-the-loop AI news',
    'qualitative research OR participant recruitment news',
  ];
  const out = [];
  for (const query of queries) {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: config.tavilyApiKey, query, topic: 'news', days: 2, max_results: 10 }),
    });
    if (!res.ok) { console.warn(`[discover] Tavily ${res.status} for "${query}"`); continue; }
    const data = await res.json();
    for (const r of data.results || []) {
      out.push({
        url: r.url,
        title: r.title,
        summary: (r.content || '').slice(0, 500),
        published_at: r.published_date || null,
        source_kind: 'tavily',
      });
    }
  }
  return out;
}
