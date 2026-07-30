// Structured AI analysis of one evidence bundle → intelligence signal.
import { askJSON } from '../lib/claude.js';
import { computeTotal, priorityBand } from './settings.js';

const SIGNAL_TYPES = [
  'competitive_threat', 'market_validation', 'sales_opportunity', 'buyer_intent',
  'partnership_opportunity', 'acquisition_opportunity', 'pricing_signal', 'messaging_shift',
  'product_launch', 'funding_signal', 'hiring_signal', 'geographic_expansion',
  'healthcare_ai_signal', 'human_evaluation_signal', 'multilingual_signal',
  'reputation_risk', 'regulatory_signal', 'noise',
];

const BUYER_INTENT = {
  type: 'object',
  properties: {
    likely_need: { type: 'string' },
    target_titles: { type: 'array', items: { type: 'string' } },
    outreach_angle: { type: 'string' },
    draft_opening: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['likely_need', 'target_titles', 'outreach_angle', 'draft_opening', 'confidence'],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: {
    is_noise: { type: 'boolean' },
    headline: { type: 'string' },
    signal_type: { type: 'array', items: { type: 'string', enum: SIGNAL_TYPES } },
    event_date: { type: 'string' },
    factual_summary: { type: 'string' },
    what_changed: { type: 'string' },
    why_it_matters: { type: 'string' },
    focus_insite_implication: { type: 'string' },
    human_layer_implication: { type: 'string' },
    strategic_relevance_score: { type: 'number' },
    revenue_potential_score: { type: 'number' },
    competitive_threat_score: { type: 'number' },
    urgency_score: { type: 'number' },
    evidence_confidence_score: { type: 'number' },
    recommended_action: { type: 'string' },
    action_owner: { type: 'string' },
    sales_trigger: { type: 'boolean' },
    content_opportunity: { type: 'boolean' },
    partnership_opportunity: { type: 'boolean' },
    acquisition_opportunity: { type: 'boolean' },
    has_buyer_intent: { type: 'boolean' },
    buyer_intent: BUYER_INTENT,
    needs_human_review: { type: 'boolean' },
    reasoning_summary: { type: 'string' },
  },
  required: [
    'is_noise', 'headline', 'signal_type', 'event_date', 'factual_summary', 'what_changed',
    'why_it_matters', 'focus_insite_implication', 'human_layer_implication',
    'strategic_relevance_score', 'revenue_potential_score', 'competitive_threat_score',
    'urgency_score', 'evidence_confidence_score', 'recommended_action', 'action_owner',
    'sales_trigger', 'content_opportunity', 'partnership_opportunity', 'acquisition_opportunity',
    'has_buyer_intent', 'buyer_intent', 'needs_human_review', 'reasoning_summary',
  ],
  additionalProperties: false,
};

const SYSTEM = `You are HawkEye, the competitor & market intelligence analyst for two related businesses:

1. FOCUS INSITE — nationwide qualitative market research recruiting: consumer, B2B, healthcare, technology, hard-to-reach audiences, participant verification, fieldwork.
2. HUMAN LAYER AI — verified humans for AI: RLHF, model evaluation, expert feedback, healthcare AI review, multilingual contributors, data provenance, human verification.

Analyze the evidence and produce ONE intelligence item. Rules:
- Never manufacture facts. Every claim must trace to the supplied evidence. If evidence is thin, say so and score evidence_confidence low.
- Do not merely summarize: state what changed, why it matters, and what to DO about it.
- Score components: strategic_relevance 0-25, revenue_potential 0-25, competitive_threat 0-20, urgency 0-15, evidence_confidence 0-15.
- Weak evidence must never get high totals — be conservative.
- buyer_intent: fill meaningfully only when has_buyer_intent is true (signals the company may NEED Focus Insite or Human Layer AI services: funding, model launches, healthcare expansion, hiring for AI data/eval roles, quality complaints). Otherwise fill fields with empty strings/arrays and confidence "low".
- The outreach draft is a DRAFT ONLY — it will never be sent automatically.
- reasoning_summary: 2-3 concise business-readable sentences, no internal chain-of-thought.
- Mark is_noise true for PR fluff, trivial changes, or items with no implication for either business.`;

let aiCallCount = 0;
export const getAiCalls = () => aiCallCount;
export const resetAiCalls = () => { aiCallCount = 0; };

export async function analyzeEvidence(company, evidence) {
  aiCallCount += 1;
  const result = await askJSON({
    system: SYSTEM,
    user: [
      `Company: ${company.name} (${company.website || 'no site'})`,
      `Watchlist categories: ${(company.categories || []).join(', ')}`,
      `Relevant business: ${company.business}`,
      `Evidence type: ${evidence.kind}`,
      `Sources: ${evidence.sources.map(s => s.url).join(', ')}`,
      '',
      'EVIDENCE:',
      evidence.text,
    ].join('\n'),
    schema: SCHEMA,
    maxTokens: 6000,
    mock: () => mockAnalysis(company, evidence),
  });

  const { total } = computeTotal(result);
  return {
    company_id: company.id,
    company_name: company.name,
    ...result,
    strategic_relevance_score: Math.min(result.strategic_relevance_score, 25),
    revenue_potential_score: Math.min(result.revenue_potential_score, 25),
    competitive_threat_score: Math.min(result.competitive_threat_score, 20),
    urgency_score: Math.min(result.urgency_score, 15),
    evidence_confidence_score: Math.min(result.evidence_confidence_score, 15),
    total_score: total,
    priority_band: result.is_noise ? 'noise' : priorityBand(total),
    source_urls: evidence.sources.map(s => s.url),
    source_titles: evidence.sources.map(s => s.title),
    detected_date: new Date().toISOString(),
    status: 'new',
  };
}

function mockAnalysis(company, evidence) {
  const isFunding = /funding|series|raises/i.test(evidence.text);
  const isPageChange = evidence.kind === 'page_change';
  return {
    is_noise: false,
    headline: isFunding
      ? `${company.name} raises Series B — expanding into expert data ops [mock]`
      : `${company.name} adds AI training / healthcare positioning to site [mock]`,
    signal_type: isFunding ? ['funding_signal', 'competitive_threat', 'buyer_intent'] : ['messaging_shift', 'product_launch', 'competitive_threat'],
    event_date: new Date().toISOString().slice(0, 10),
    factual_summary: isPageChange
      ? 'Monitored page now advertises AI training data recruitment for healthcare AI plus enterprise pricing. [mock]'
      : 'Public reports a $40M Series B to scale human data operations, with healthcare AI eval hiring planned. [mock]',
    what_changed: isPageChange ? 'New service positioning appeared on a monitored page.' : 'New funding announced with expansion plans.',
    why_it_matters: 'Direct overlap with Human Layer AI\'s verified-human positioning and Focus Insite\'s healthcare recruiting; validates the category while raising competitive stakes. [mock]',
    focus_insite_implication: 'Competitor moving toward healthcare recruiting — protect healthcare accounts, emphasize verification. [mock]',
    human_layer_implication: 'Category validation for human-data-for-AI; sharpen Chain-of-Human-Custody differentiation. [mock]',
    strategic_relevance_score: 20, revenue_potential_score: 15, competitive_threat_score: 14,
    urgency_score: 9, evidence_confidence_score: isFunding ? 12 : 10,
    recommended_action: 'Update the competitive battlecard and review healthcare positioning this week.',
    action_owner: 'Jim',
    sales_trigger: isFunding, content_opportunity: true,
    partnership_opportunity: false, acquisition_opportunity: false,
    has_buyer_intent: isFunding,
    buyer_intent: isFunding ? {
      likely_need: 'Healthcare AI evaluators and clinical reviewers as they scale',
      target_titles: ['Head of Data Operations', 'AI Evaluation Lead'],
      outreach_angle: 'Congratulate on raise; offer verified healthcare professionals for eval scaling.',
      draft_opening: `Saw the Series B news — congrats. As you scale evals, we provide verified healthcare professionals... [mock draft]`,
      confidence: 'medium',
    } : { likely_need: '', target_titles: [], outreach_angle: '', draft_opening: '', confidence: 'low' },
    needs_human_review: false,
    reasoning_summary: 'Evidence shows concrete movement into our space; scores are moderate-high with decent source confidence. [mock]',
  };
}

/** Cross-run dedup: same company + similar headline within 14 days → merge sources. */
export function findDuplicate(signal, recentSignals) {
  const tokens = s => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));
  const a = tokens(signal.headline);
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  for (const other of recentSignals) {
    if (other.company_name !== signal.company_name) continue;
    if (new Date(other.detected_date).getTime() < cutoff) continue;
    const b = tokens(other.headline);
    const inter = [...a].filter(x => b.has(x)).length;
    const jaccard = inter / (a.size + b.size - inter || 1);
    if (jaccard >= 0.55) return other;
  }
  return null;
}
