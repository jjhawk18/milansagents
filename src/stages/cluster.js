// Stage 2: Deduplication + story clustering.
// Prototype uses token-overlap (Jaccard) similarity on titles. Production
// upgrade path: embed titles+summaries (Voyage AI) and cluster in pgvector.
import { store } from '../lib/store.js';

const STOPWORDS = new Set(['the','a','an','of','to','in','on','for','and','or','as','at','by','with','is','are','why','how','new','its']);

function stem(w) {
  // Light stemming so evaluator/evaluators, rater/raters etc. match
  return w.replace(/(ings|ing|ers|er|ors|or|s)$/, '');
}

function tokens(text) {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
      .map(stem)
  );
}

function jaccard(a, b) {
  const inter = [...a].filter(x => b.has(x)).length;
  return inter / (a.size + b.size - inter || 1);
}

const SIMILARITY_THRESHOLD = 0.18;

export async function clusterItems(items) {
  if (!items.length) return [];
  const clusters = [];
  for (const item of items) {
    const t = tokens(`${item.title} ${item.summary || ''}`);
    const match = clusters.find(c => jaccard(c.tokens, t) >= SIMILARITY_THRESHOLD);
    if (match) {
      match.items.push(item);
      for (const tok of t) match.tokens.add(tok);
    } else {
      clusters.push({ items: [item], tokens: t });
    }
  }

  const stories = await store.insert('stories', clusters.map(c => {
    const lead = c.items[0];
    return {
      cluster_key: [...c.tokens].sort().slice(0, 8).join('-'),
      headline: lead.title,
      summary: c.items.map(i => i.summary).filter(Boolean).join(' | ').slice(0, 1000),
      item_ids: c.items.map(i => i.id),
      source_count: c.items.length,
      status: 'new',
      source_urls: c.items.map(i => i.url),
    };
  }));

  console.log(`[cluster] ${items.length} items → ${stories.length} stories`);
  return stories;
}
