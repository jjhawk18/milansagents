// Stage 12: Analytics + learning loop.
// Ingest performance events (from GHL / WordPress / social webhooks) and use
// the content_performance rollup to nudge future scoring: formats and story
// types that convert get a boost, duds get discounted.
import { store } from '../lib/store.js';

export async function recordEvent({ content_id, channel, metric, value }) {
  return store.insert('analytics_events', { content_id, channel, metric, value });
}

// Simple learning signal for the prototype: per-brand-format engagement
// averages, which score.js can consume as a prior in a later iteration.
export async function learningSummary() {
  const events = await store.select('analytics_events');
  const contents = await store.select('content');
  const byId = Object.fromEntries(contents.map(c => [c.id, c]));
  const buckets = {};
  for (const e of events) {
    const c = byId[e.content_id];
    if (!c) continue;
    const key = `${c.brand}/${c.format}`;
    buckets[key] ||= { events: 0, totalValue: 0 };
    buckets[key].events += 1;
    buckets[key].totalValue += Number(e.value);
  }
  return buckets;
}
