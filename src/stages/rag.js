// Stage 5: RAG knowledge retrieval.
// Pulls the most relevant brand knowledge docs for a story so angle/content
// generation is grounded in real positioning, services, and claim policies.
//
// Prototype retrieval: keyword overlap ranking against brand_knowledge rows
// (seeded from brands/*.json if the table is empty). Production upgrade path:
// Voyage AI embeddings + the match_brand_knowledge() pgvector function in the
// schema.
import { store } from '../lib/store.js';
import { loadBrands } from '../config.js';

export async function seedBrandKnowledge() {
  const existing = await store.select('brand_knowledge');
  if (existing.length) return existing;
  const rows = [];
  for (const b of loadBrands()) {
    rows.push(
      { brand: b.key, doc_type: 'positioning', title: `${b.name} positioning`, content: b.positioning },
      { brand: b.key, doc_type: 'voice', title: `${b.name} voice`, content: b.voice },
      { brand: b.key, doc_type: 'claim_policy', title: `${b.name} banned claims`, content: b.banned_claims.join('\n') },
      { brand: b.key, doc_type: 'positioning', title: `${b.name} audience`, content: b.audience },
    );
  }
  return store.insert('brand_knowledge', rows);
}

function scoreDoc(queryWords, doc) {
  const docText = `${doc.title} ${doc.content}`.toLowerCase();
  return queryWords.filter(w => docText.includes(w)).length;
}

export async function retrieveKnowledge(brandKey, story, limit = 5) {
  await seedBrandKnowledge();
  const docs = await store.select('brand_knowledge', { brand: brandKey });
  const queryWords = `${story.headline} ${story.summary}`.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  return docs
    .map(d => ({ doc: d, score: scoreDoc(queryWords, d) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.doc);
}

export function knowledgeToContext(docs) {
  return docs.map(d => `[${d.doc_type}] ${d.title}:\n${d.content}`).join('\n\n');
}
