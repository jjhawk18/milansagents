// Stage 6: Angle generator — one distinct take per relevant brand,
// grounded in RAG-retrieved brand knowledge.
import { askJSON } from '../lib/claude.js';
import { store } from '../lib/store.js';
import { loadBrands } from '../config.js';
import { retrieveKnowledge, knowledgeToContext } from './rag.js';

const SCHEMA = {
  type: 'object',
  properties: {
    angle: { type: 'string' },
    rationale: { type: 'string' },
    hook: { type: 'string' },
  },
  required: ['angle', 'rationale', 'hook'],
  additionalProperties: false,
};

export async function generateAngles(story) {
  const brandKeys = story.score_breakdown?.best_brands || [];
  const brands = loadBrands().filter(b => brandKeys.includes(b.key));
  const results = [];

  for (const brand of brands) {
    const knowledge = await retrieveKnowledge(brand.key, story);
    const result = await askJSON({
      system: `You generate newsjack angles for ${brand.name}. An angle must add genuine expertise to the story — never "we also exist". Voice: ${brand.voice}`,
      user: [
        `Story: ${story.headline}`,
        `Summary: ${story.summary}`,
        `Verified claims: ${JSON.stringify(story.verification?.claims || [])}`,
        '',
        'Brand knowledge (retrieved):',
        knowledgeToContext(knowledge),
        '',
        `Brand lens: ${brand.angles_lens}`,
        'Produce ONE strong angle: the take, why this brand has the right to say it, and a scroll-stopping hook line.',
      ].join('\n'),
      schema: SCHEMA,
      mock: () => mockAngle(brand.key, story),
    });

    const [angle] = await store.insert('angles', {
      story_id: story.id,
      brand: brand.key,
      ...result,
    });
    results.push({ ...angle, brandConfig: brand });
    console.log(`[angles] ${brand.key}: ${result.angle.slice(0, 70)}...`);
  }
  return results;
}

function mockAngle(brandKey, story) {
  const takes = {
    focus_insite: {
      angle: 'The evaluator shortage is really a recruitment problem — and recruiters have been solving "impossible to find" for decades.',
      rationale: 'Focus Insite recruits hard-to-reach experts daily; AI labs are discovering what research agencies already know.',
      hook: 'AI labs just discovered what market researchers learned 30 years ago: finding qualified humans is the hard part.',
    },
    humnlayer: {
      angle: 'Model capability is outpacing evaluation capacity — verified human feedback is now the bottleneck, and the moat.',
      rationale: 'This is HumnLayer\'s exact thesis: the human layer is the constraint on AI quality.',
      hook: 'Your model isn\'t bottlenecked by compute anymore. It\'s bottlenecked by humans.',
    },
    jjhawk: {
      angle: 'I built a recruitment company, then an AI data company — this news is the moment the two industries collide.',
      rationale: 'First-person operator story connecting Focus Insite and HumnLayer journeys.',
      hook: 'Two years ago people told me participant recruitment and AI training data were different businesses. This week proved they\'re the same one.',
    },
  };
  return takes[brandKey] || takes.focus_insite;
}
