// Stage 3: Fact verification agent.
// Extracts the story's core claims and assesses whether they're supported by
// the collected sources. Anything unverifiable is flagged before content ever
// gets drafted.
import { askJSON } from '../lib/claude.js';
import { store } from '../lib/store.js';

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['verified', 'partially_verified', 'unverified', 'likely_false'] },
    confidence: { type: 'number' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          status: { type: 'string', enum: ['supported', 'single_source', 'unsupported', 'contradicted'] },
          evidence: { type: 'string' },
        },
        required: ['claim', 'status', 'evidence'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'claims', 'notes'],
  additionalProperties: false,
};

export async function verifyStory(story) {
  const verification = await askJSON({
    system: 'You are a fact-verification agent for a content pipeline. Be conservative: a claim with only one source is "single_source", not "supported". Newsjacking a false story is a brand disaster.',
    user: [
      `Headline: ${story.headline}`,
      `Summary: ${story.summary}`,
      `Number of independent sources in cluster: ${story.source_count}`,
      `Source URLs: ${(story.source_urls || []).join(', ')}`,
      '',
      'Extract the 1-4 core factual claims and assess each. Then give an overall verdict and confidence (0-1).',
    ].join('\n'),
    schema: SCHEMA,
    mock: () => ({
      verdict: story.source_count > 1 ? 'verified' : 'partially_verified',
      confidence: story.source_count > 1 ? 0.85 : 0.6,
      claims: [{
        claim: story.headline,
        status: story.source_count > 1 ? 'supported' : 'single_source',
        evidence: `${story.source_count} source(s) in cluster report the same core facts. [mock]`,
      }],
      notes: '[mock verification — DRY_RUN]',
    }),
  });

  const passed = ['verified', 'partially_verified'].includes(verification.verdict);
  await store.update('stories', story.id, {
    verification,
    status: passed ? 'verified' : 'rejected',
  });
  console.log(`[verify] "${story.headline.slice(0, 60)}..." → ${verification.verdict} (${verification.confidence})`);
  return { ...story, verification, status: passed ? 'verified' : 'rejected' };
}
