// Evidence collection per company: monitored-page change detection + public
// news search (Tavily, if configured). Returns evidence bundles for analysis.
import crypto from 'node:crypto';
import { store } from '../lib/store.js';
import { config, DRY_RUN } from '../config.js';
import { fetchPage, contentHash, diffText, isMeaningfulChange } from './pages.js';
import { limits } from './settings.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function collectCompany(company) {
  const evidence = [];
  evidence.push(...await collectPageChanges(company));
  evidence.push(...await collectNews(company));
  return evidence;
}

async function collectPageChanges(company) {
  const urls = [
    ...(company.website ? [{ kind: 'homepage', url: company.website }] : []),
    ...(company.urls || []),
  ].slice(0, limits.maxUrlsPerCompany);

  const out = [];
  for (const { kind, url } of urls) {
    try {
      const fixture = DRY_RUN ? dryRunFixture(company, url) : null;
      const text = await fetchPage(url, { fixture });
      const hash = contentHash(text);

      const previous = (await store.select('hawkeye_snapshots'))
        .filter(s => s.company_id === company.id && s.url === url)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      if (previous && previous.content_hash === hash) continue; // unchanged — free, no AI

      let diff = null, meaningful = false;
      if (previous) {
        diff = diffText(previous.text_excerpt || '', text);
        meaningful = isMeaningfulChange(diff);
      }
      const [snap] = await store.insert('hawkeye_snapshots', {
        company_id: company.id, url,
        content_hash: hash,
        text_excerpt: text.slice(0, 6000),
        diff_summary: diff,
        meaningful,
        dismissed: false,
      });
      if (meaningful) {
        out.push({
          kind: 'page_change',
          snapshot_id: snap.id,
          sources: [{ url, title: `${company.name} ${kind || 'page'}` }],
          text: [
            `Monitored page changed: ${url}`,
            `Change ratio: ${diff.ratio}`,
            `ADDED CONTENT:\n${diff.added_lines.join('\n')}`,
            diff.removed_lines.length ? `REMOVED CONTENT:\n${diff.removed_lines.join('\n')}` : '',
          ].filter(Boolean).join('\n\n'),
        });
      }
      await sleep(DRY_RUN ? 0 : limits.perDomainDelayMs);
    } catch (err) {
      console.warn(`[hawkeye] page failed ${url}: ${err.message}`);
    }
  }
  return out;
}

async function collectNews(company) {
  let results = [];
  if (DRY_RUN) {
    results = dryRunNews(company);
  } else if (config.tavilyApiKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: config.tavilyApiKey,
          query: `"${company.name}" funding OR acquisition OR partnership OR launch OR hiring OR expansion`,
          topic: 'news', days: 7, max_results: 5,
        }),
      });
      if (res.ok) results = (await res.json()).results || [];
      else console.warn(`[hawkeye] tavily ${res.status} for ${company.name}`);
    } catch (err) {
      console.warn(`[hawkeye] tavily failed for ${company.name}: ${err.message}`);
    }
  }

  // Drop already-seen URLs (cross-run dedup at the source level)
  const fresh = [];
  for (const r of results) {
    const urlHash = crypto.createHash('md5').update(canonical(r.url)).digest('hex');
    const seen = await store.select('hawkeye_seen', { url_hash: urlHash });
    if (seen.length) continue;
    await store.insert('hawkeye_seen', { url_hash: urlHash, url: r.url, company_id: company.id });
    fresh.push(r);
  }
  if (!fresh.length) return [];

  return [{
    kind: 'news',
    sources: fresh.map(r => ({ url: r.url, title: r.title })),
    text: fresh.map(r =>
      `HEADLINE: ${r.title}\nURL: ${r.url}\nDATE: ${r.published_date || 'unknown'}\nEXCERPT: ${(r.content || '').slice(0, 600)}`
    ).join('\n\n---\n\n'),
  }];
}

function canonical(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch { return url; }
}

// --- DRY_RUN fixtures: first scan = baseline, second scan = meaningful change ---
function dryRunFixture(company, url) {
  const base = `${company.name} — ${company.description}\nOur services\nAbout us\nContact our team\nTrusted by leading brands`;
  return store.constructor.name === 'LocalStore' && globalThis.__hawkeyeSecondPass
    ? `${base}\nNEW: AI Training Data Recruitment for healthcare AI companies\nNEW: Enterprise pricing packages with verified expert panels\nNEW: Launching multilingual evaluator network`
    : base;
}

function dryRunNews(company) {
  if (company.priority !== 1) return [];
  return [{
    url: `https://example.com/news/${company.name.toLowerCase().replace(/\W+/g, '-')}-funding`,
    title: `${company.name} raises $40M Series B to expand expert data operations [fixture]`,
    published_date: new Date().toISOString(),
    content: `${company.name} announced a $40M Series B to scale human data operations for AI labs, with plans to hire healthcare AI evaluation leads and expand into clinical model testing. [DRY_RUN fixture]`,
  }];
}
