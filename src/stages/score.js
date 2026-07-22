// Stage 4: Newsjack score (0-100).
// Weighs brand relevance, timeliness, momentum, and risk. Stories below the
// threshold stop here; the rest continue to angle generation.
import { askJSON } from '../lib/claude.js';
import { store } from '../lib/store.js';
import { loadBrands } from '../config.js';

export const SCORE_THRESHOLD = 55;

const SCHEMA = {
  type: 'object',
  properties: {
    relevance: { type: 'number' },
    timeliness: { type: 'number' },
    brand_fit: { type: 'number' },
    momentum: { type: 'number' },
    risk: { type: 'number' },
    total: { type: 'number' },
    reasoning: { type: 'string' },
    best_brands: { type: 'array', items: { type: 'string', enum: ['focus_insite', 'humnlayer', 'jjhawk'] } },
  },
  required: ['relevance', 'timeliness', 'brand_fit', 'momentum', 'risk', 'total', 'reasoning', 'best_brands'],
  additionalProperties: false,
};

export async function scoreStory(story) {
  const brands = loadBrands();
  const breakdown = await askJSON({
    system: [
      'You are a newsjacking strategist. Score each dimension 0-100:',
      '- relevance: closeness to the brands\' domains (market research, participant recruitment, AI training data, human-in-the-loop)',
      '- timeliness: is this fresh enough to ride?',
      '- brand_fit: can any of our brands add genuine expertise (not just noise)?',
      '- momentum: is coverage growing?',
      '- risk: 0 = safe, 100 = reputational landmine (tragedy, politics, unverified drama)',
      'total = weighted score where risk subtracts. total = 0.3*relevance + 0.2*timeliness + 0.3*brand_fit + 0.2*momentum - 0.5*max(0, risk-30).',
      'Also pick which brands (if any) should cover it.',
    ].join('\n'),
    user: [
      `Story: ${story.headline}`,
      `Summary: ${story.summary}`,
      `Verification: ${JSON.stringify(story.verification)}`,
      '',
      'Brands:',
      ...brands.map(b => `- ${b.key}: ${b.positioning} | Lens: ${b.angles_lens}`),
    ].join('\n'),
    schema: SCHEMA,
    mock: () => {
      const text = `${story.headline} ${story.summary}`.toLowerCase();
      const relevant = /\b(ai|research|participant|evaluat|human|annotat|qualitative|focus group|training data)\b/.test(text);
      const relevance = relevant ? 88 : 10;
      const brandFit = relevant ? 85 : 5;
      const total = Math.round(0.3 * relevance + 0.2 * 90 + 0.3 * brandFit + 0.2 * 70 - 0);
      return {
        relevance, timeliness: 90, brand_fit: brandFit, momentum: 70, risk: 10, total,
        reasoning: relevant
          ? 'Directly hits the human-in-the-loop / research participant space. [mock]'
          : 'Off-topic for all three brands. [mock]',
        best_brands: relevant ? ['humnlayer', 'focus_insite', 'jjhawk'] : [],
      };
    },
  });

  await store.update('stories', story.id, {
    newsjack_score: breakdown.total,
    score_breakdown: breakdown,
    status: 'scored',
  });
  console.log(`[score] "${story.headline.slice(0, 60)}..." → ${breakdown.total}/100 (brands: ${breakdown.best_brands.join(', ') || 'none'})`);
  return { ...story, newsjack_score: breakdown.total, score_breakdown: breakdown };
}
